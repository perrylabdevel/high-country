/** WebGPU captures of the saloon from lot-local poses (x across the facade,
 * z toward the street). Needs `npm run build` and a preview on :8765.
 *   node scripts/blender-saloon/capture.mjs audit/saloon/current [pose...]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { launchOptions } from "../probe/drive.mjs";

import { readFileSync } from "node:fs";
const { lot: LOT } = JSON.parse(readFileSync(new URL("./layout.json", import.meta.url)));
const c = Math.cos(LOT.yaw), sn = Math.sin(LOT.yaw);
const OUT = process.argv[2] || "audit/saloon/current";
const only = process.argv.slice(3);
export const POSES = {
  street: { cam: [-7, 1.7, 17], at: [0.5, 4.2, 3] },
  boardwalk: { cam: [-4.5, 1.65, 6.2], at: [3, 2.4, 5.4] },
  back: { cam: [-8, 9, -20], at: [0, 6, 0] },
  entry: { cam: [0.3, 1.72, 3.3], at: [0.2, 1.3, -3.7] },
  bar: { cam: [-2.4, 1.72, 2.9], at: [3.6, 1.5, -2.2] },
  "bar-end": { cam: [2.2, 1.72, -2.2], at: [-3.0, 1.5, 3.2] },
  stair: { cam: [-1.2, 1.72, -3.3], at: [-3.7, 2.6, 1.0] },
  hall: { cam: [3.6, 5.1, 3.2], at: [-3.8, 4.5, 2.0] },
  "stair-top": { cam: [-2.0, 5.1, 3.2], at: [-3.7, 3.0, -1.5] },
  "west-room": { cam: [-1.6, 5.1, 0.7], at: [-2.2, 4.3, -3.6] },
  "east-room": { cam: [1.1, 5.1, 0.5], at: [3.6, 4.2, -2.6] },
  balcony: { cam: [-3.9, 5.1, 6.9], at: [3.5, 4.6, 5.6] }
};

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => { if (!/pointer lock/i.test(e.message)) errors.push(e.message); });
await page.goto("http://127.0.0.1:8765/?dev", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => document.getElementById("btn-enter"), null, { timeout: 90000 });
await page.waitForTimeout(4000);
await page.evaluate(() => document.getElementById("btn-enter")?.click());
await page.waitForTimeout(5000);
await page.evaluate(() => window.__captureMode(true));
const info = await page.evaluate(() => window.__captureInfo?.());
if (info?.backend !== "webgpu") throw new Error(`backend ${info?.backend}`);
await mkdir(OUT, { recursive: true });
for (const [name, pose] of Object.entries(POSES)) {
  if (only.length && !only.includes(name)) continue;
  // The lot group is merged into statics at runtime; use the exported frame.
  const w = ([lx, ly, lz]) => [LOT.x + c * lx + sn * lz, LOT.placementY + ly, LOT.z - sn * lx + c * lz];
  const [px, py, pz] = w(pose.cam), [tx, ty, tz] = w(pose.at);
  const view = { px, py, pz, tx, ty, tz };
  await page.evaluate((v) => { window.__captureView = v; }, view);
  await page.waitForTimeout(600);
  await page.waitForFunction(() => window.__vegSettled?.(), null, { timeout: 120000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("captured", name);
}
await writeFile(`${OUT}/capture.json`, JSON.stringify({ info, errors }, null, 2));
await browser.close();
