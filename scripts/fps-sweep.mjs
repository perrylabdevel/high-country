/**
 * FPS sweep over the visual-campaign's 32 vantage x light poses (R7 acceptance:
 * "no systematic FPS drop versus the R6 V1 sweep on the same 32-frame sets").
 *
 *   npm run build
 *   npm run preview &
 *   node scripts/fps-sweep.mjs http://127.0.0.1:8765 audit/evidence/fps-<tag>.json
 *
 * The vantage table is IMPORTED from capture-poi.mjs, not copied, so the sweep
 * can never drift from the capture evidence set. Per pose: apply the light,
 * park the camera exactly where capture-poi parks it, wait for the world to
 * settle, then sample rAF frame deltas for FRAME_MS. Reported per pose:
 * median fps, min fps, and dips (frames under 30/s with their length), which
 * is the shape of the weakness under test — two single-frame dips inside
 * capture noise, not a lower median.
 *
 * The rAF sampler watches the game's own present cadence under the SAME
 * renderer as captures (headed WebGPU); it measures, it never drives input.
 */
import { existsSync } from "node:fs";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { AUDIT_POIS, LIGHTS } from "./capture-poi.mjs";

const results = [];

const BASE = process.argv[2] || "http://127.0.0.1:8765";
const OUT = process.argv[3] || `audit/evidence/fps-sweep-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
const SAMPLE_MS = Number(process.env.FPS_SAMPLE_MS || 4000);
const DIP_FPS = 30;

function launchOptions() {
  // Same occlusion-protection as the driving probes (drive.mjs): a headed
  // window that ends up even PARTIALLY covered gets macOS's native rAF
  // throttle — the sweep's first run showed the cadence collapse from 56fps
  // to a bimodal 30 with periodic hitches. Kiosk is the cure: the window IS
  // the screen, nothing can occlude it.
  const args = [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--kiosk"
  ];
  if (process.env.PLAYWRIGHT_CHROMIUM) {
    return { executablePath: process.env.PLAYWRIGHT_CHROMIUM, args };
  }
  try {
    const bundled = chromium.executablePath();
    if (bundled && existsSync(bundled)) {
      // Headed on macOS: headless Chromium has no Metal GPU process (see
      // capture-poi.mjs for the full story) — the sweep must measure the
      // renderer captures actually run on.
      return process.platform === "darwin" ? { headless: false, args } : { args };
    }
  } catch {
    // fall through
  }
  throw new Error("run `npx playwright install chromium` or set PLAYWRIGHT_CHROMIUM");
}

async function main() {
  await mkdir("audit/evidence", { recursive: true });
  const browser = await chromium.launch(launchOptions());
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => {
    if (/pointer lock/i.test(e.message)) return;
    errors.push(e.message);
  });

  await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => document.getElementById("btn-enter")?.click());
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.__captureMode(true));
  const info = await page.evaluate(() => window.__captureInfo?.());
  if (info?.backend !== "webgpu") {
    throw new Error(`page reported ${info?.backend} — the sweep only grades webgpu frames`);
  }

  // Camera math copied from capture-poi.mjs's pose evaluate (source of truth
  // lives there): vantage -> __captureView, so both instruments shoot the
  // identical frame.
  async function park(poi) {
    const ok = await page.evaluate((p) => {
      const place = window.__POS[p.id];
      if (!place) return false;
      const targetX = place.x + (p.targetOffset?.x || 0);
      const targetZ = place.z + (p.targetOffset?.z || 0);
      const rad = (p.heading * Math.PI) / 180;
      const px = targetX + Math.sin(rad) * p.dist;
      const pz = targetZ + Math.cos(rad) * p.dist;
      const py = window.__heightAt(px, pz) + p.height;
      if (p.level) {
        const len = Math.hypot(targetX - px, targetZ - pz) || 1;
        window.__captureView = {
          px, py, pz,
          tx: px + ((targetX - px) / len) * 80,
          ty: py,
          tz: pz + ((targetZ - pz) / len) * 80
        };
        return true;
      }
      window.__captureView = {
        px, py, pz,
        tx: targetX,
        ty: window.__heightAt(targetX, targetZ) + p.aim,
        tz: targetZ
      };
      return true;
    }, poi);
    if (!ok) throw new Error(`missing capture POI ${poi.id}`);
  }

  async function sampleFps() {
    // Collected inside the page: one rAF timestamp per frame. The sampler
    // stops itself; evaluate round-trips the samples once at the end.
    return page.evaluate(({ ms }) => new Promise((resolve) => {
      const times = [];
      let raf = 0;
      const t0 = performance.now();
      function tick(t) {
        times.push(t);
        if (t - t0 >= ms) {
          resolve(times);
          return;
        }
        raf = requestAnimationFrame(tick);
      }
      raf = requestAnimationFrame(tick);
    }), { ms: SAMPLE_MS }).then((times) => {
      const deltas = [];
      for (let i = 1; i < times.length; i += 1) {
        deltas.push(times[i] - times[i - 1]);
      }
      const fps = deltas.map((d) => Math.min(999, 1000 / Math.max(1, d)));
      const sorted = [...fps].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const dips = [];
      for (let i = 0; i < fps.length; i += 1) {
        if (fps[i] < DIP_FPS) {
          const run = { fps: Math.round(fps[i]), ms: deltas[i], at: i };
          const last = dips[dips.length - 1];
          if (last && i === last.atEnd + 1) {
            last.fps = Math.min(last.fps, run.fps);
            last.frames += 1;
            last.atEnd = i;
          } else {
            dips.push({ ...run, frames: 1, atEnd: i });
          }
        }
      }
      return { median: Math.round(median), min: Math.round(sorted[0]), dips };
    });
  }

  // FPS_POSES re-runs a subset: "cemetery-midday,ranch-golden" — for chasing
  // a single pose without 30 minutes of GPU warm-up confusing the comparison.
  const only = new Set((process.env.FPS_POSES || "").split(",").filter(Boolean));

  // Warm the shader before sampling: the first sky draw at a new light
  // compiles, and a compile is not an fps datapoint.
  for (const light of LIGHTS) {
    await page.evaluate((l) => {
      Object.assign(window.__materialSettings, {
        hdri: l.hdri,
        sunElevation: l.elevation,
        sunAzimuth: l.azimuth
      });
      window.__syncMaterialSettings();
    }, light);
    const wanted = AUDIT_POIS.filter((poi) => only.size === 0 || only.has(`${poi.id}-${light.name}`));
    if (!wanted.length) continue;
    await park(wanted[0]);
    await page.waitForTimeout(2500);
    await sampleFps(); // discard
    for (const poi of wanted) {
      await park(poi);
      // Same settle discipline as capture-poi: the scatter is amortised over
      // ~72 frames; sampling before it finishes measures the rebuild, not
      // the settled frame.
      let settled = false;
      for (let i = 0; i < 90 && !settled; i += 1) {
        await page.waitForTimeout(1000);
        settled = await page.evaluate(() => !!window.__vegSettled && window.__vegSettled());
      }
      await page.waitForTimeout(600);
      const r = await sampleFps();
      const name = `${poi.id}-${light.name}`;
      console.log(`${r.median.toString().padStart(3)} fps median  min ${String(r.min).padStart(3)}  dips ${r.dips.length}  ${name}${r.dips.length ? "  " + r.dips.map((d) => `${d.fps}fps×${d.frames}`).join(",") : ""}`);
      results.push({ pose: name, light: light.name, poi: poi.id, ...r });
    }
  }

  const medians = results.map((r) => r.median);
  const summary = {
    generated: new Date().toISOString(),
    backend: info.backend,
    adapter: info.adapter || "unknown",
    sampleMs: SAMPLE_MS,
    dipThreshold: DIP_FPS,
    poses: results.length,
    medianOfMedians: Math.round(medians.sort((a, b) => a - b)[Math.floor(medians.length / 2)]),
    worstMedian: Math.min(...medians),
    posesWithDips: results.filter((r) => r.dips.length).map((r) => r.pose),
    results
  };
  await writeFile(OUT, JSON.stringify(summary, null, 2));
  console.log(`\n${results.length} poses -> ${OUT}`);
  console.log(`median of medians ${summary.medianOfMedians} fps; worst pose median ${summary.worstMedian}; dips in ${summary.posesWithDips.length} pose(s)`);
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});