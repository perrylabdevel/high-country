/**
 * Frame-jitter probe: where do the 150-300 ms worst frames come from?
 *
 * fps-baseline shows worst frames of 150-300 ms at forest/lake POIs even when
 * the player is stationary and the sample is texture-upload-free. This probe
 * records every frame's delta over a long window and, on each slow frame,
 * snapshots cheap state (texture-upload counter, grass tile residency,
 * JS heap) so spikes can be attributed: tile landing, GC, or something else.
 *
 *   BASE=http://127.0.0.1:8765 node scripts/frame-jitter.mjs lakeMercy [seconds]
 *
 * Writes one JSON line per POI to stdout; TAG= tags the evidence file.
 */
import { chromium } from "playwright";
import { AUDIT_POIS } from "./capture-poi.mjs";

const base = process.env.BASE || "http://127.0.0.1:8765";
const ids = process.argv.slice(2).filter((a) => !/^\d+$/.test(a)).length
  ? process.argv.slice(2).filter((a) => !/^\d+$/.test(a))
  : ["lakeMercy", "northernPines"];
const windowSecs = Number(process.argv.find((a) => /^\d+$/.test(a))) || 20;

let browser;
try {
  browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--kiosk", ...(process.env.VSYNC ? [] : ["--disable-gpu-vsync", "--disable-frame-rate-limit"])]
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
  if (info?.backend !== "webgpu") throw new Error(`page reported ${info?.backend}; jitter probe requires the shipping WebGPU path`);
  // Time every render call so a slow frame can be attributed: renderMs close
  // to the rAF delta means the spike is inside the renderer/GPU present path;
  // renderMs small while the delta is large points at the update phase or
  // something outside the page (compositor, OS scheduling).
  await page.evaluate((throttle) => {
    const renderer = window.__renderer;
    if (renderer.__jitterWrapped) return;
    const render = renderer.render.bind(renderer);
    let lastCall = 0;
    renderer.render = (...args) => {
      // THROTTLE_MS: pace the CPU to the GPU's real consumption rate so the
      // command queue never backs up — if the periodic 300 ms stalls are
      // backpressure drain, they disappear under this.
      if (throttle > 0) {
        const target = lastCall + throttle;
        for (;;) {
          const t = performance.now();
          if (t >= target) break;
          lastCall = Math.max(lastCall, t - 1);
        }
        lastCall = performance.now();
      }
      const t0 = performance.now();
      const out = render(...args);
      window.__lastRenderMs = performance.now() - t0;
      return out;
    };
    renderer.__jitterWrapped = true;
  }, Number(process.env.THROTTLE_MS) || 0);

  for (const id of ids) {
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

    const sample = await page.evaluate((secs) => new Promise((resolve) => {
      const frames = [];
      const spikes = [];
      let last = performance.now();
      let lastUploads = window.__textureUploadCount;
      let lastHeap = performance.memory ? performance.memory.usedJSHeapSize : null;
      let lastHeapAt = last;
      const t0 = last;
      const tick = () => {
        const now = performance.now();
        const dt = now - last;
        last = now;
        frames.push(dt);
        const uploads = window.__textureUploadCount - lastUploads;
        lastUploads = window.__textureUploadCount;
        if (dt > 40) {
          let heap = null;
          if (performance.memory) {
            const h = performance.memory.usedJSHeapSize;
            heap = { mb: +(h / 1048576).toFixed(1), deltaMb: lastHeap === null ? null : +((h - lastHeap) / 1048576).toFixed(1) };
            lastHeap = h;
          }
          spikes.push({
            at: +(now - t0).toFixed(0),
            ms: +dt.toFixed(1),
            renderMs: +(window.__lastRenderMs ?? -1).toFixed(1),
            uploads,
            grass: window.__grassQueue ? window.__grassQueue() : null,
            settled: window.__vegSettled?.() ?? null,
            heap
          });
        }
        if (now - t0 < secs * 1000) return requestAnimationFrame(tick);
        frames.sort((a, b) => a - b);
        const pct = (q) => +frames[Math.min(frames.length - 1, Math.floor(q * frames.length))].toFixed(1);
        resolve({
          frames: frames.length,
          seconds: +((now - t0) / 1000).toFixed(1),
          fps: +(frames.length / ((now - t0) / 1000)).toFixed(1),
          p50Ms: pct(0.5), p95Ms: pct(0.95), p99Ms: pct(0.99), worstMs: +frames[frames.length - 1].toFixed(1),
          spikesOver40: frames.filter((d) => d > 40).length,
          spikesOver100: frames.filter((d) => d > 100).length,
          spikeList: spikes,
          uploadsDuringWindow: window.__textureUploadCount
        });
      };
      requestAnimationFrame(tick);
    }), windowSecs);
    console.log(JSON.stringify({ poi: id, ...sample }));
  }
} finally {
  await browser?.close();
}