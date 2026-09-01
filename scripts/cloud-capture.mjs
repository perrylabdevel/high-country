/**
 * Sky A/B captures for cloud work: two lights (midday/golden) × two pitches
 * (near-level = max sky, mid-sky), frozen frames via captureMode. Capture mode
 * pins the TSL `time`, so same-tag re-runs are directly comparable; across
 * builds the drift is frozen too and the deck pattern only moves when the sky
 * code moves it.
 *
 * Usage: npm run build && node scripts/cloud-capture.mjs <tag>
 * Writes /tmp/cloud-<tag>-<view>-<light>.png.
 * Evidence convention (cloud tone, 2026-08-31): capture a `before` tag, make
 * the change, capture an `after` tag, and compare with a strongly-changed
 * pixel count (>90 sum-RGB difference) — MAD alone hides a real change that
 * lives in a small cloud fraction of the sky region.
 */
import { chromium } from "playwright";
import { launchOptions, spawnPreviewServer, enterWorld } from "./probe/drive.mjs";
import { spawn } from "node:child_process";

const PORT = 8896;
const server = await spawnPreviewServer(spawn, { port: PORT, base: "" });
const base = `http://127.0.0.1:${PORT}`;
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => { if (/error|warn/i.test(m.type())) console.log(`[page ${m.type()}]`, m.text().slice(0, 200)); });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
await enterWorld(`${base}/?dev`, page);
await page.evaluate(() => window.__captureMode(true));

const VIEWS = [
  { name: "level", px: 0, py: 60, pz: 0, tx: 0, ty: 58, tz: -400 },
  { name: "mid", px: 0, py: 60, pz: 0, tx: 0, ty: 46, tz: -300 }
];
const LIGHTS = [
  { name: "midday", hdri: "midday", sunElevation: 62, sunAzimuth: -120 },
  { name: "golden", hdri: "golden", sunElevation: 9, sunAzimuth: -78 }
];

for (const l of LIGHTS) {
  await page.evaluate((s) => {
    Object.assign(window.__materialSettings, s);
    window.__syncMaterialSettings();
  }, l);
  for (const v of VIEWS) {
    await page.evaluate((vv) => { window.__captureView = { ...vv }; }, v);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `/tmp/cloud-${process.argv[2] || "x"}-${v.name}-${l.name}.png` });
    console.log(`shot cloud-${process.argv[2] || "x"}-${v.name}-${l.name}.png`);
  }
}
await browser.close();
process.exit(0);