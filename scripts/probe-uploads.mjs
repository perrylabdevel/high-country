/**
 * Per-frame GPU upload probe: what does this frame send to the GPU, and who
 * asked for it?
 *
 * Written to answer a question no check in this repo could: the game held 15
 * fps at every vegetated vantage on an M2 Air while a headless benchmark said
 * the scatter fit its budget and hiding the ground cover changed nothing. The
 * cost was not in the scene at all. It was three lines of
 * `setUsage(THREE.DynamicDrawUsage)`, which three's WebGPU backend reads as
 * "re-upload this whole buffer every frame regardless of version" — 22 calls,
 * 2.6 MB and 44 ms of queue.writeBuffer per frame with the camera parked and
 * nothing moving. See scripts/check-instance-attrs.mjs for the invariant that
 * now holds it down, and docs/HARD_WON.md.
 *
 * It works by wrapping GPUQueue.writeBuffer before the page loads and timing
 * every call, so it sees the traffic three itself generates, which no scene
 * graph inspection can. Two readouts:
 *
 *   - writeBuffer totals: calls, megabytes and milliseconds per frame,
 *     attributed by call stack.
 *   - the attributes whose `.version` changed between two frames — the
 *     uploads that are legitimately dirty. Traffic in the first list with
 *     nothing in the second is traffic for nothing.
 *
 *   npm run build && npm run preview &
 *   node scripts/probe-uploads.mjs                     # northernPines
 *   POI=cemetery BASE=http://127.0.0.1:8766 node scripts/probe-uploads.mjs
 *
 * Headed and vsync-unlocked on purpose: a vsync-locked sample quantises every
 * frame to a divisor of 60 and turns a 44 ms regression into a "30 fps median"
 * that looks like ordinary slowness.
 */
import { chromium } from "playwright";
import { AUDIT_POIS } from "./capture-poi.mjs";

const BASE = process.env.BASE || "http://127.0.0.1:8765";
const ID = process.env.POI || "northernPines";
const poi = AUDIT_POIS.find((x) => x.id === ID);
if (!poi) throw new Error(`unknown POI ${ID}; ids are ${AUDIT_POIS.map((p) => p.id).join(", ")}`);

const args = [
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--kiosk",
  "--disable-gpu-vsync",
  "--disable-frame-rate-limit"
];
const browser = await chromium.launch({ channel: "chrome", headless: false, args });
try {
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

// Installed before any page script runs. GPUQueue may not exist yet on the
// window at init time, so latch the setter and wrap it the moment it appears.
await page.addInitScript(() => {
  const install = () => {
    if (!window.GPUQueue?.prototype?.writeBuffer) return false;
    const orig = window.GPUQueue.prototype.writeBuffer;
    window.__wb = { on: false, calls: 0, bytes: 0, ms: 0, byStack: new Map() };
    window.GPUQueue.prototype.writeBuffer = function (...a) {
      if (!window.__wb.on) return orig.apply(this, a);
      const data = a[2];
      const size = a[4] !== undefined ? a[4] * (data.BYTES_PER_ELEMENT || 1) : (data.byteLength ?? 0);
      const t0 = performance.now();
      const r = orig.apply(this, a);
      const dt = performance.now() - t0;
      const w = window.__wb;
      w.calls += 1; w.bytes += size; w.ms += dt;
      const st = new Error().stack.split("\n").slice(2, 7)
        .map((s) => s.trim().replace(/^at /, "").split(" (")[0]).join(" < ");
      const e = w.byStack.get(st) || { n: 0, bytes: 0, ms: 0 };
      e.n += 1; e.bytes += size; e.ms += dt;
      w.byStack.set(st, e);
      return r;
    };
    // writeTexture is a distinct WebGPU upload path. DataTexture churn does
    // not appear in writeBuffer, and a stationary scene used to hide it from
    // this probe entirely even when it dominated CPU samples.
    const origTexture = window.GPUQueue.prototype.writeTexture;
    window.GPUQueue.prototype.writeTexture = function (...a) {
      if (!window.__wb.on) return origTexture.apply(this, a);
      const size = a[1]?.byteLength ?? 0;
      const t0 = performance.now();
      const r = origTexture.apply(this, a);
      const dt = performance.now() - t0;
      const w = window.__wb;
      w.calls += 1; w.bytes += size; w.ms += dt;
      const st = new Error().stack.split("\n").slice(2, 7)
        .map((s) => s.trim().replace(/^at /, "").split(" (")[0]).join(" < ");
      const e = w.byStack.get(st) || { n: 0, bytes: 0, ms: 0 };
      e.n += 1; e.bytes += size; e.ms += dt;
      w.byStack.set(st, e);
      return r;
    };
    return true;
  };
  if (!install()) {
    Object.defineProperty(window, "GPUQueue", {
      configurable: true,
      set(v) { delete window.GPUQueue; window.GPUQueue = v; install(); },
      get() { return undefined; }
    });
  }
});

await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(9000);
await page.evaluate(() => document.getElementById("btn-enter")?.click());
await page.waitForTimeout(6000);
await page.evaluate(() => window.__captureMode(true));
const info = await page.evaluate(() => window.__captureInfo?.());
if (info?.backend !== "webgpu") throw new Error(`page reported ${info?.backend}; this probe is about the WebGPU upload path`);

await page.evaluate((p) => {
  const q = window.__POS[p.id];
  const rad = (p.heading * Math.PI) / 180;
  const px = q.x + Math.sin(rad) * p.dist;
  const pz = q.z + Math.cos(rad) * p.dist;
  window.__captureView = {
    px, py: window.__heightAt(px, pz) + p.height, pz,
    tx: q.x, ty: window.__heightAt(q.x, q.z) + p.aim, tz: q.z
  };
}, poi);
// The scatter is amortised; sampling before it lands measures the rebuild.
// __vegSettled can throw during boot (its closure is not initialised yet), so
// a throw counts as "not settled".
for (let i = 0; i < 60; i += 1) {
  const settled = await page.evaluate(() => { try { return window.__vegSettled?.() !== false; } catch { return false; } });
  if (settled) break;
  await page.waitForTimeout(250);
}
await page.waitForTimeout(1500);

// Optional weather state (WEATHER=storm): pin it BEFORE the sample so the
// per-frame weather writes (sky/fog/wind uniforms, rain intensity) are inside
// what this probe measures. Same poll-then-verify as capture-poi.mjs — the
// hook is assigned late in boot, and a silent no-op here would report dry
// numbers for a wet run.
const WEATHER = process.env.WEATHER || "";
if (WEATHER) {
  let hook = false;
  for (let i = 0; i < 240 && !hook; i += 1) {
    hook = await page.evaluate(() => typeof window.__weatherForce === "function");
    if (!hook) await page.waitForTimeout(500);
  }
  if (!hook) throw new Error("window.__weatherForce never appeared within 120s; cannot pin WEATHER");
  await page.evaluate((s) => window.__weatherForce(s), WEATHER);
  await page.waitForTimeout(1500); // let the force ramp + first rain frames land
  const got = await page.evaluate(() => window.__weatherState());
  if (got !== WEATHER) throw new Error(`weather force did not take: requested "${WEATHER}", page reports "${got}"`);
  console.log(`weather pinned: ${WEATHER}`);
}

// Legitimately dirty attributes: the ones whose version moved between frames.
// Attribute versions do not expose DataTextures held by node uniforms. Trace
// three's texture entry point as well, preserving its receiver so this is only
// observational and cannot change the render path.
await page.evaluate(() => {
  const utils = window.__renderer?.backend?.textureUtils;
  if (!utils?.updateTexture || utils.__probeWrapped) return;
  const original = utils.updateTexture;
  window.__textureUpdates = new Map();
  utils.updateTexture = function (tex, ...rest) {
    const key = `${tex.name || "unnamed"} ${tex.uuid} v${tex.version} ${tex.image?.width || 0}x${tex.image?.height || 0}`;
    window.__textureUpdates.set(key, (window.__textureUpdates.get(key) || 0) + 1);
    return original.call(this, tex, ...rest);
  };
  utils.__probeWrapped = true;
});
const churn = await page.evaluate(() => new Promise((res) => {
  const snap = () => {
    const m = new Map();
    window.__scene.traverse((o) => {
      const g = o.geometry;
      if (!g) return;
      const tag = `${o.name || o.type}${o.count !== undefined ? `[${o.count}]` : ""}`;
      for (const [k, a] of Object.entries(g.attributes)) m.set(`${tag}.${k}`, { v: a.version, bytes: a.array?.byteLength ?? 0 });
      if (o.instanceMatrix) m.set(`${tag}.instanceMatrix`, { v: o.instanceMatrix.version, bytes: o.instanceMatrix.array.byteLength });
      if (o.instanceColor) m.set(`${tag}.instanceColor`, { v: o.instanceColor.version, bytes: o.instanceColor.array.byteLength });
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const mat of mats) {
        if (!mat) continue;
        for (const [key, value] of Object.entries(mat)) {
          if (value?.isTexture) m.set(`${tag}.material.${key}`, { v: value.version, bytes: value.image?.data?.byteLength ?? 0 });
        }
      }
    });
    return m;
  };
  const a = snap();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const b = snap();
    const out = [];
    for (const [k, v] of b) {
      const prev = a.get(k);
      if (prev && prev.v !== v.v) out.push({ k, bumps: v.v - prev.v, kb: Math.round(v.bytes / 1024) });
    }
    res(out.sort((x, y) => y.kb - x.kb));
  }));
}));

const out = await page.evaluate(() => new Promise((res) => {
  const w = window.__wb;
  if (!w) return res({ error: "GPUQueue.writeBuffer was never wrapped" });
  w.on = true; w.calls = 0; w.bytes = 0; w.ms = 0; w.byStack.clear();
  let frames = 0;
  const t0 = performance.now();
  const tick = () => {
    frames += 1;
    if (performance.now() - t0 < 5000) return requestAnimationFrame(tick);
    w.on = false;
    res({
      frames, secs: (performance.now() - t0) / 1000, calls: w.calls, bytes: w.bytes, ms: w.ms,
      top: [...w.byStack.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 8).map(([k, v]) => ({ k, ...v }))
    });
  };
  requestAnimationFrame(tick);
}));
const textureUpdates = await page.evaluate(() => [...(window.__textureUpdates || new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 12));
await browser.close();

if (out.error) throw new Error(out.error);
console.log(`${ID} @ ${BASE} — ${out.frames} frames in ${out.secs.toFixed(1)}s (${(out.frames / out.secs).toFixed(0)} fps, vsync off)`);
console.log(`buffer + texture uploads: ${out.calls} calls, ${(out.bytes / 1e6).toFixed(1)} MB, ${out.ms.toFixed(0)} ms`);
console.log(`  per frame: ${(out.calls / out.frames).toFixed(1)} calls, ${(out.bytes / out.frames / 1e6).toFixed(2)} MB, ${(out.ms / out.frames).toFixed(1)} ms`);
for (const t of out.top) {
  console.log(`  ${t.ms.toFixed(0).padStart(5)}ms  ${String(t.n).padStart(5)} calls  ${(t.bytes / 1e6).toFixed(1).padStart(6)}MB  ${t.k}`);
}
console.log(`\nattributes marked dirty over two frames: ${churn.length ? "" : "none"}`);
for (const c of churn) console.log(`  +${c.bumps}  ${String(c.kb).padStart(6)} KB  ${c.k}`);
console.log("\nthree texture updates during the probe:");
for (const [name, count] of textureUpdates) console.log(`  ${String(count).padStart(5)}  ${name}`);
console.log("\nTexture streaming may explain uploads without changed scene attributes; inspect the texture trace.");
} finally {
  await browser.close();
}

