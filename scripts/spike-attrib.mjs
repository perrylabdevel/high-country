/**
 * Spike attribution: capture a CPU profile window that CONTAINS a render
 * spike, and print the stacks behind it.
 *
 * fps-baseline proved the 150-300 ms worst frames survive with zero texture
 * uploads, and frame-jitter proved they sit inside renderer.render(). This
 * probe starts Chrome's CPU profiler, waits until a wrapped render call
 * exceeds SPIRE_MS (default 200), then stops and prints the heaviest
 * top-down stacks so the periodic work names itself.
 *
 *   BASE=http://127.0.0.1:8765 POI=lakeMercy node scripts/spike-attrib.mjs
 */
import { chromium } from "playwright";
import { AUDIT_POIS } from "./capture-poi.mjs";

const base = process.env.BASE || "http://127.0.0.1:8765";
const id = process.env.POI || "lakeMercy";
const threshold = Number(process.env.SPIKE_MS) || 200;
const poi = AUDIT_POIS.find((p) => p.id === id);
if (!poi) throw new Error(`unknown POI ${id}`);

let browser;
try {
  browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--kiosk", "--disable-gpu-vsync", "--disable-frame-rate-limit"]
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
  if (info?.backend !== "webgpu") throw new Error(`page reported ${info?.backend}; spike probe requires the shipping WebGPU path`);
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

  // Wrap render to record per-call duration; the profiler runs continuously
  // and we stop it the moment a spike frame completes.
  await page.evaluate(() => {
    const renderer = window.__renderer;
    if (renderer.__spikeWrapped) return;
    const render = renderer.render.bind(renderer);
    renderer.render = (...args) => {
      const t0 = performance.now();
      const out = render(...args);
      const ms = performance.now() - t0;
      if (ms > (window.__spikeThreshold || 200)) {
        window.__spikeHits = (window.__spikeHits || 0) + 1;
      }
      window.__lastRenderMs = ms;
      return out;
    };
    renderer.__spikeWrapped = true;
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("Profiler.start");
  await page.evaluate((t) => { window.__spikeThreshold = t; }, threshold);

  // Wait for a spike (poll render durations through the same wrapper).
  await page.waitForFunction((t) => window.__lastRenderMs > t, threshold, { timeout: 45000 });
  // Stop immediately: the detected spike frame finished at most a frame ago,
  // so the profile tail IS the spike. waitForFunction's own poll latency adds
  // at most one frame of ordinary samples behind it.
  const { profile } = await cdp.send("Profiler.stop");
  const renderMs = await page.evaluate(() => window.__lastRenderMs);

  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const keyOf = (n) => `${n?.callFrame.functionName || "(anonymous)"} @ ${n?.callFrame.url?.split("/").pop() || "native"}:${n?.callFrame.lineNumber + 1 || 0}`;
  const agg = (samples, deltas, from) => {
    const m = new Map();
    let total = 0;
    for (let i = from; i < samples.length; i += 1) {
      const k = keyOf(byId.get(samples[i]));
      m.set(k, (m.get(k) || 0) + deltas[i]);
      total += deltas[i];
    }
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 14)
      .map(([name, us]) => ({ name, ms: +(us / 1000).toFixed(1), pct: +(us / total * 100).toFixed(1) }));
  };
  const tailFrom = Math.max(0, profile.samples.length - 2000);
  console.log(JSON.stringify({
    poi: id,
    lastRenderMs: +renderMs.toFixed(1),
    spikesDuringWindow: await page.evaluate(() => window.__spikeHits || 0),
    profileMs: +(profile.timeDeltas.reduce((s, d) => s + d, 0) / 1000).toFixed(1),
    spikeTailTop: agg(profile.samples, profile.timeDeltas, tailFrom),
    wholeWindowTop: agg(profile.samples, profile.timeDeltas, 0)
  }, null, 1));
} finally {
  await browser?.close();
}