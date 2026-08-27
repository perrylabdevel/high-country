/**
 * Cycle-B A/B frames: the barn-wall reproduction and the open-ground cost.
 * Diagnostic-only (like CAPTURE_MODE=close): the barn wall is the known dark
 * backdrop where the dark blade roots vanish, and the same camera turned
 * away from the wall shows where an over-lifted root would wash out.
 * Never write to audit/current from here.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.env.CAPTURE_BASE || "http://127.0.0.1:8765";
const OUT = process.env.CAPTURE_OUT || "audit/close-cycleB";
if (OUT === "audit/current") throw new Error("diagnostic-only: write outside audit/current");
const BACKEND = "webgpu";

// Same camera position for both frames; heading flips wall <-> open ground.
const RANCH = { x: -400, z: 300 }; // mapToWorld(0.4, 0.44)
const BARN = { x: RANCH.x - 28, z: RANCH.z + 18 }; // buildings.js barnX/barnZ
// North face: dark wood, away from the ranch yard (the yard side has a bare
// dirt band, so the wall-backdrop read has to come from the back side).
const WALL_Z = BARN.z + 6;
const CAM = { x: BARN.x, z: WALL_Z + 7, height: 1.6, aim: 1.0 };

const FRAMES = [
  // Grass in front of the dark barn wall (the reproduction).
  { name: "barnWall", tx: BARN.x, tz: WALL_Z },
  // Same camera, turned north over open meadow (where the cost lands).
  { name: "openGround", tx: CAM.x, tz: CAM.z + 14 }
];

const LIGHTS = [
  { name: "midday", hdri: "midday", elevation: 62, azimuth: -120 },
  { name: "golden", hdri: "golden", elevation: 9, azimuth: -78 }
];

function launchOptions() {
  if (process.env.PLAYWRIGHT_CHROMIUM) {
    return { executablePath: process.env.PLAYWRIGHT_CHROMIUM };
  }
  throw new Error("set PLAYWRIGHT_CHROMIUM to a real Chrome");
}

async function main() {
  await mkdir(OUT, { recursive: true });
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
  if (info?.backend !== BACKEND) throw new Error(`page reported ${info?.backend}`);

  const written = [];
  for (const light of LIGHTS) {
    await page.evaluate((l) => {
      Object.assign(window.__materialSettings, {
        hdri: l.hdri, sunElevation: l.elevation, sunAzimuth: l.azimuth
      });
      window.__syncMaterialSettings();
    }, light);
    await page.waitForTimeout(800);

    for (const f of FRAMES) {
      const ok = await page.evaluate(({ f, CAM }) => {
        const h = window.__heightAt;
        window.__captureView = {
          px: CAM.x,
          py: h(CAM.x, CAM.z) + CAM.height,
          pz: CAM.z,
          tx: f.tx,
          ty: h(f.tx, f.tz) + CAM.aim,
          tz: f.tz
        };
        return true;
      }, { f, CAM });
      if (!ok) throw new Error("capture view failed");

      let settled = false;
      for (let i = 0; i < 150 && !settled; i += 1) {
        await page.waitForTimeout(2000);
        settled = await page.evaluate(() => !!window.__vegSettled && window.__vegSettled());
      }
      if (!settled) throw new Error(`grass never settled at ${f.name}`);
      await page.waitForTimeout(1500);
      const file = `${f.name}-${light.name}.png`;
      await page.screenshot({ path: `${OUT}/${file}` });
      written.push(file);
      process.stdout.write(`captured ${file}\n`);
    }
  }
  if (errors.length) throw new Error("page errors:\n  " + errors.slice(0, 10).join("\n  "));
  await writeFile(`${OUT}/capture-manifest.json`, JSON.stringify({
    version: 1, mode: "cycleB-ab", backend: info.backend,
    camera: CAM, frames: FRAMES, files: written,
    generated: new Date().toISOString()
  }, null, 2));
  await browser.close();
  console.log(`\n${written.length} screenshots written to ${OUT}/`);
}

main().catch((e) => { console.error(e); process.exit(1); });