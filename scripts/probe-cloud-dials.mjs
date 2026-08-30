/**
 * One-shot: prove the new cloud uniforms are actually live by driving them
 * through __syncMaterialSettings and capturing two skies — one at the default
 * dial values, one with the dials swung hard. Screenshot sizes / pixels must
 * differ; print mean abs difference.
 */
import { chromium } from "playwright";
import { launchOptions } from "./probe/drive.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:8765";
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(9000);
await page.evaluate(() => document.getElementById("btn-enter")?.click());
await page.waitForTimeout(6000);
await page.evaluate(() => window.__captureMode(true));
// Nearly-level view: maximum sky in frame.
await page.evaluate(() => {
  window.__captureView = { px: 0, py: 60, pz: 0, tx: 0, ty: 58, tz: -400 };
});

function shoot(path, settings) {
  return page.evaluate((s) => {
    Object.assign(window.__materialSettings, s);
    window.__syncMaterialSettings();
  }, settings).then(() => page.waitForTimeout(2500)).then(() => page.screenshot({ path }));
}

await shoot("/tmp/dials-default.png", {
  cloudScale: 3, cloudWarpX: 1.6, cloudWarpY: -1.1,
  cloudDetailBias: 1, cloudBoundK: 0.08
});
await shoot("/tmp/dials-swing.png", {
  cloudScale: 8, cloudWarpX: 3.5, cloudWarpY: -3.0,
  cloudDetailBias: 3.5, cloudBoundK: 0.25
});
await browser.close();
console.log("captured /tmp/dials-default.png /tmp/dials-swing.png");