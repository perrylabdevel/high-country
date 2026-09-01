/**
 * Live-tune the wall domain-warp uniforms and screenshot each candidate.
 * Camera at ~45 m from the ranch main block so the warp is fully faded in
 * while the wall is bigger than the audit vantage. Measure outputs with
 * scripts/measure-wall-repeat.mjs.
 *   node scripts/tune-walls.mjs http://127.0.0.1:8765 audit/wall-tune
 */
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:8765";
const OUT = process.argv[3] || "audit/wall-tune";
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => process.stdout.write(`[pageerror] ${e.message}\n`));
await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(9000);
await page.evaluate(() => document.getElementById("btn-enter")?.click());
await page.waitForTimeout(6000);
await page.evaluate(() => window.__captureMode(true));

// 45 m south of the ranch house, looking at the main block's south wall
const placed = await page.evaluate(() => {
  const p = window.__POS.ranch;
  const tx = p.x + 1, tz = p.z - 1;
  const px = tx + Math.sin((180 * Math.PI) / 180) * 45;
  const pz = tz + Math.cos((180 * Math.PI) / 180) * 45;
  const py = window.__heightAt(px, pz) + 8;
  window.__captureView = { px, py, pz, tx, ty: window.__heightAt(tx, tz) + 4, tz };
  return true;
});

let settled = false;
for (let i = 0; i < 150 && !settled; i += 1) {
  await page.waitForTimeout(2000);
  settled = await page.evaluate(() => !!window.__vegSettled && window.__vegSettled());
}
if (!settled) throw new Error("scatter never settled");
await page.waitForTimeout(1500);

const candidates = [
  { name: "warp0", amp: 0, period: 7 },
  { name: "amp25", amp: 0.25, period: 7 },
  { name: "amp42", amp: 0.42, period: 7 },
  { name: "amp60", amp: 0.6, period: 7 },
  { name: "amp42-p14", amp: 0.42, period: 14 }
];

for (const c of candidates) {
  await page.evaluate((c) => {
    Object.assign(window.__materialSettings, {
      wallWarpAmp: c.amp,
      wallWarpPeriod: c.period
    });
    window.__syncMaterialSettings();
  }, c);
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/${c.name}.png`, timeout: 120000 });
  process.stdout.write(`captured ${c.name}\n`);
}
await browser.close();