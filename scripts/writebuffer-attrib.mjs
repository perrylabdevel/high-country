/**
 * Attribute the periodic writeBuffer spikes: wrap GPUQueue.writeBuffer and
 * report per-frame bytes, plus captured stacks for the largest uploads.
 *
 * frame-jitter proved the 150-300 ms spikes sit inside renderer.render() and
 * spike-attrib attributed 65% of the spike tail to writeBuffer @ native. This
 * probe records WHAT is being written: size histogram per frame, and a stack
 * snapshot for any single upload over STACK_OVER_BYTES.
 *
 *   BASE=http://127.0.0.1:8765 POI=lakeMercy node scripts/writebuffer-attrib.mjs
 */
import { chromium } from "playwright";
import { AUDIT_POIS } from "./capture-poi.mjs";

const base = process.env.BASE || "http://127.0.0.1:8765";
const id = process.env.POI || "lakeMercy";
const STACK_OVER_BYTES = 1 << 16;
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
    window.__wbFrames = [];
    window.__wbBig = [];
    let frameBytes = 0;
    let frameCount = 0;
    const flush = () => {
      window.__wbFrames.push({ bytes: frameBytes, calls: frameCount });
      frameBytes = 0;
      frameCount = 0;
    };
    const wrap = (proto, method) => {
      const original = proto?.[method];
      if (!original) return;
      proto[method] = function (buffer, offset, data, dataOffset, size) {
        const n = typeof size === "number" ? size
          : (data?.byteLength ?? data?.length * (data?.BYTES_PER_ELEMENT || 1) ?? 0);
        frameBytes += n;
        frameCount += 1;
        if (n > 65536 && window.__wbBig.length < 40) {
          const stack = new Error().stack || "";
          window.__wbBig.push({
            bytes: n,
            method,
            via: stack.split("\n").slice(2, 7).map((l) => l.trim().slice(0, 130))
          });
        }
        return original.call(this, buffer, offset, data, dataOffset, size);
      };
    };
    wrap(window.GPUQueue?.prototype, "writeBuffer");
    wrap(window.GPUQueue?.prototype, "writeTexture");
    window.__wbFlush = flush;
    setInterval(flush, 0);
  });
  await page.goto(`${base}/?dev`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000);
  await page.evaluate(() => document.getElementById("btn-enter")?.click());
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.__captureMode(true));
  const info = await page.evaluate(() => window.__captureInfo?.());
  if (info?.backend !== "webgpu") throw new Error(`page reported ${info?.backend}; writeBuffer probe requires the shipping WebGPU path`);
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

  // The setInterval(0) flush in the initScript races the frame loop; sample
  // per frame here instead and let the in-page interval handle nothing.
  const sample = await page.evaluate((secs) => new Promise((resolve) => {
    window.__wbFrames.length = 0;
    const frames = [];
    let last = performance.now();
    const t0 = last;
    const tick = () => {
      const now = performance.now();
      frames.push({ dt: now - last, ...window.__wbFrames.shift() });
      last = now;
      if (now - t0 < secs * 1000) return requestAnimationFrame(tick);
      resolve(frames);
    };
    requestAnimationFrame(tick);
  }), 15);

  const slow = sample.filter((f) => f.dt > 60).sort((a, b) => b.dt - a.dt).slice(0, 10);
  const normal = sample.filter((f) => f.dt <= 25);
  const med = (arr, k) => arr.length ? Math.round(arr.map((f) => f[k]).sort((a, b) => a - b)[Math.floor(arr.length / 2)]) : 0;
  const big = await page.evaluate(() => window.__wbBig.splice(0));
  console.log(JSON.stringify({
    poi: id,
    frames: sample.length,
    medianFrameMs: +med(sample, "dt").toFixed(1),
    medianBytesPerFrameNormal: med(normal, "bytes"),
    medianCallsPerFrameNormal: med(normal, "calls"),
    slowestFrames: slow.map((f) => ({ dt: +f.dt.toFixed(1), bytes: f.bytes, calls: f.calls })),
    bigUploads: big.slice(0, 12)
  }, null, 1));
} finally {
  await browser?.close();
}