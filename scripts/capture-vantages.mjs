/**
 * Capture screenshots at selected audit POIs (standard overview vantage).
 * Companion to capture-poi.mjs for targeted A/B runs:
 *
 *   BASE=http://127.0.0.1:8765 node scripts/capture-vantages.mjs OUTDIR poi1 poi2 ...
 */
import { chromium } from "playwright";
import { AUDIT_POIS } from "./capture-poi.mjs";

const base = process.env.BASE || "http://127.0.0.1:8765";
const outDir = process.argv[2];
if (!outDir) throw new Error("usage: node scripts/capture-vantages.mjs OUTDIR poi1 ...");
const ids = process.argv.slice(3).length ? process.argv.slice(3) : ["northernPines", "timberCamp", "badlands"];

let browser;
try {
  browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--kiosk", "--disable-gpu-vsync"]
  });
  const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
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
  page.on("pageerror", (err) => console.error(`pageerror: ${err.message}`));
  await page.waitForTimeout(9000);
  await page.evaluate(() => document.getElementById("btn-enter")?.click());
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.__captureMode(true));
  const info = await page.evaluate(() => window.__captureInfo?.());
  if (info?.backend !== "webgpu") throw new Error(`page reported ${info?.backend}; captures require the shipping WebGPU path`);

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
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${outDir}/${id}.png` });
    console.log(`captured ${outDir}/${id}.png`);
  }
} finally {
  await browser?.close();
}