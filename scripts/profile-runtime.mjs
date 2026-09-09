/**
 * Sample the shipping WebGPU frame loop with Chrome's CPU profiler.
 *
 * The profile is intentionally taken after vegetation settles at an audit POI:
 * it answers what a player sees while standing still, rather than timing boot
 * or an amortised tile build.  Results include renderer counters so CPU and
 * GPU limits are not confused.
 *
 *   BASE=http://127.0.0.1:8766 POI=northernPines node scripts/profile-runtime.mjs
 */
import { chromium } from "playwright";
import { AUDIT_POIS } from "./capture-poi.mjs";

const base = process.env.BASE || "http://127.0.0.1:8765";
const id = process.env.POI || "northernPines";
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
  if (info?.backend !== "webgpu") throw new Error(`page reported ${info?.backend}; CPU profile requires the shipping WebGPU path`);
  await page.evaluate((p) => {
    const q = window.__POS[p.id];
    const r = p.heading * Math.PI / 180;
    const x = q.x + Math.sin(r) * p.dist;
    const z = q.z + Math.cos(r) * p.dist;
    window.__captureView = { px: x, py: window.__heightAt(x, z) + p.height, pz: z, tx: q.x, ty: window.__heightAt(q.x, q.z) + p.aim, tz: q.z };
  }, poi);
  let vegetationSettled = false;
  await page.waitForFunction(() => {
    try {
      return window.__vegSettled?.() === true && performance.now() - window.__lastTextureUpload > 5000;
    } catch { return false; }
  }, { }, { timeout: 120000 });
  const uploadsBefore = await page.evaluate(() => window.__textureUploadCount);
  const cdp = await page.context().newCDPSession(page);
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
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start");
  const frame = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => {
      frames += 1;
      if (performance.now() - t0 < 5000) return requestAnimationFrame(tick);
      resolve({ frames, seconds: (performance.now() - t0) / 1000, ...window.__profileRenderCounters, dpr: window.__renderer.getPixelRatio(), userAgent: navigator.userAgent, capture: window.__captureInfo() });
    };
    requestAnimationFrame(tick);
  }));
  const { profile } = await cdp.send("Profiler.stop");
  const uploadsDuringSample = await page.evaluate(() => window.__textureUploadCount) - uploadsBefore;
  if (uploadsDuringSample) throw new Error(`Sample contaminated by ${uploadsDuringSample} texture uploads; retry after streaming settles`);
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const total = profile.timeDeltas.reduce((sum, n) => sum + n, 0);
  const self = new Map();
  for (let i = 0; i < profile.samples.length; i += 1) {
    const n = byId.get(profile.samples[i]);
    const key = `${n?.callFrame.functionName || "(anonymous)"} @ ${n?.callFrame.url?.split("/").pop() || "native"}:${n?.callFrame.lineNumber + 1 || 0}`;
    self.set(key, (self.get(key) || 0) + profile.timeDeltas[i]);
  }
  const top = [...self].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([name, us]) => ({ name, ms: +(us / 1000).toFixed(1), pct: +(us / total * 100).toFixed(1) }));
  const hot = profile.nodes.filter((n) => (n.hitCount || 0) > 100)
    .map((n) => ({ id: n.id, fn: n.callFrame.functionName, url: n.callFrame.url, line: n.callFrame.lineNumber + 1, callers: profile.nodes.filter((p) => p.children?.includes(n.id)).map((p) => p.callFrame.functionName) }));
  console.log(JSON.stringify({ poi: id, ...frame, fps: +(frame.frames / frame.seconds).toFixed(1), profileMs: +(total / 1000).toFixed(1), topSelf: top, hot }, null, 2));
} finally {
  await browser?.close();
}
