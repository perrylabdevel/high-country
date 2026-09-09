/**
 * Clean steady-state FPS baseline at audit POIs, no CPU profiler attached.
 *
 * Same setup as scripts/profile-runtime.mjs (settled vegetation, no texture
 * uploads in the sample window, shipping WebGPU asserted) but the sample
 * window counts rAF frames only, so the number is not depressed by profiler
 * overhead. Run per POI:
 *
 *   BASE=http://127.0.0.1:8765 node scripts/fps-baseline.mjs northernPines lakeMercy town
 *
 * Display-paced by default: vsync and the frame-rate limit stay ON, so the
 * measured fps is what a player's compositor would deliver. The uncapped
 * configuration that earlier runs used lets CPU production outrun GPU
 * consumption and injects periodic queue-drain stalls into the worst-frame
 * statistic (see PERFORMANCE_PASS.md, spike investigation). VSYNC=0 restores
 * the old behaviour for side-by-sides with those runs.
 *
 * Each JSON line records os.loadavg() and a timestamp so a run's rows can be
 * disqualified after the fact when the machine was loaded.
 *
 * Writes one JSON line per POI to stdout; pass TAG= to tag the evidence file.
 */
import { chromium } from "playwright";
import { AUDIT_POIS } from "./capture-poi.mjs";
import os from "node:os";

const base = process.env.BASE || "http://127.0.0.1:8765";
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["northernPines", "lakeMercy", "elPaso"];

let browser;
try {
  browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--kiosk", ...(process.env.VSYNC ? ["--disable-gpu-vsync", "--disable-frame-rate-limit"] : [])]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => {
    window.__lastTextureUpload = performance.now();
    window.__textureUploadCount = 0;
    for (const method of ["writeTexture", "copyExternalImageToTexture"]) {
      const original = window.GPUQueue?.prototype[method];
      if (!original) continue;
      window.GPUQueue.prototype[method] = function (...args) {
        window.__lastTextureUpload = performance.now();
        window.__textureUploadCount++;
        return original.apply(this, args);
      };
    }
  });
  await page.goto(`${base}/?dev`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => document.getElementById("btn-enter")?.click());
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.__captureMode(true));
  const info = await page.evaluate(() => window.__captureInfo?.());
  if (info?.backend !== "webgpu") throw new Error(`page reported ${info?.backend}; FPS baseline requires the shipping WebGPU path`);
  await page.evaluate(() => {
    const renderer = window.__renderer;
    if (renderer.__profileRenderWrapped) return;
    const render = renderer.render.bind(renderer);
    renderer.render = (...args) => {
      const out = render(...args);
      const r = renderer.info.render;
      const m = renderer.info.memory;
      window.__profileRenderCounters = { drawCalls: r.drawCalls, triangles: r.triangles, textures: m.textures, textureBytes: m.texturesSize };
      return out;
    };
    renderer.__profileRenderWrapped = true;
  });

  for (const id of ids) {
    let retried = false;
    for (;;) {
    const poi = AUDIT_POIS.find((p) => p.id === id);
    if (!poi) throw new Error(`unknown POI ${id}`);
    await page.evaluate((p) => {
      const q = window.__POS[p.id];
      const r = p.heading * Math.PI / 180;
      const x = q.x + Math.sin(r) * p.dist;
      const z = q.z + Math.cos(r) * p.dist;
      window.__captureView = { px: x, py: window.__heightAt(x, z) + p.height, pz: z, tx: q.x, ty: window.__heightAt(q.x, q.z) + p.aim, tz: q.z };
    }, poi);
    await page.waitForFunction(() => {
      try {
        return window.__vegSettled?.() === true && performance.now() - window.__lastTextureUpload > 4000;
      } catch { return false; }
    }, {}, { timeout: 120000 });
    const uploadsBefore = await page.evaluate(() => window.__textureUploadCount);
    const frame = await page.evaluate(() => new Promise((resolve) => {
      let frames = 0;
      let worst = 0;
      let last = performance.now();
      const t0 = last;
      const tick = () => {
        const now = performance.now();
        worst = Math.max(worst, now - last);
        last = now;
        frames += 1;
        if (now - t0 < 5000) return requestAnimationFrame(tick);
        resolve({ frames, seconds: (now - t0) / 1000, worstFrameMs: +worst.toFixed(1), ...window.__profileRenderCounters, dpr: window.__renderer.getPixelRatio() });
      };
      requestAnimationFrame(tick);
    }));
    const uploadsDuringSample = await page.evaluate(() => window.__textureUploadCount) - uploadsBefore;
    if (uploadsDuringSample) {
      // Town POIs stream interiors/textures lazily and can upload inside the
      // sample even after a quiet settle. Retry once after a longer cool-down
      // before giving up, so a single straggler upload doesn't void the run.
      if (!retried) {
        retried = true;
        await page.waitForTimeout(10000);
        continue;
      }
      throw new Error(`Sample at ${id} contaminated by ${uploadsDuringSample} texture uploads`);
    }
    console.log(JSON.stringify({ poi: id, ...frame, fps: +(frame.frames / frame.seconds).toFixed(1), loadavg: os.loadavg().map((n) => +n.toFixed(1)), at: new Date().toISOString() }));
    break;
    }
  }
} finally {
  await browser?.close();
}