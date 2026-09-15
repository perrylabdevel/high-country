/** WebGPU interior captures of the ranch house, poses in house-local metres
 * (the ranchRemodel origin). Needs `npm run build` and a preview on :8765.
 *   node scripts/blender-ranch/capture-interior.mjs audit/ranch-interior/before [pose...]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { launchOptions } from "../probe/drive.mjs";

const OUT = process.argv[2] || "audit/ranch-interior/current";
const only = process.argv.slice(3);
export const POSES = {
  hall: { cam: [0.3, 1.62, 6.2], at: [-0.5, 1.3, -5] },
  "hall-back": { cam: [3.8, 1.62, -4.4], at: [-3, 1.1, 6] },
  bedroom: { cam: [-4.6, 1.62, 6.3], at: [-9.5, 0.9, -4] },
  hearth: { cam: [-4.8, 1.55, 3.2], at: [-7.2, 0.9, -5.2] },
  parlor: { cam: [5.8, 1.62, 6.4], at: [11.5, 0.9, -4] },
  kitchen: { cam: [5.0, 1.62, -6.0], at: [14.5, 0.9, -15.5] },
  "kitchen-back": { cam: [15.2, 1.62, -15.8], at: [5, 1.1, -6] },
  stair: { cam: [-1.2, 1.62, 5.6], at: [4.6, 2.2, 3.2] },
  "stair-top": { cam: [2.2, 4.3, -0.4], at: [4.5, 2.0, 5.8] },
  "bed-west": { cam: [-4.6, 4.3, 6.3], at: [-9.6, 3.2, -3.5] },
  landing: { cam: [3.3, 4.3, 5.6], at: [-1.5, 3.3, -4.5] },
  "bed-east": { cam: [5.8, 4.3, 6.3], at: [11.5, 3.2, -4] },
  "north-bar": { cam: [7.5, 4.4, -2.5], at: [7.5, 4.6, -5.3] },
  "front-peak": { cam: [3.0, 4.2, 3.5], at: [3.0, 4.6, 6.9] },
  "ext-front": { cam: [-6, 3.2, 26], at: [1, 3.2, 0] },
  "ext-ell": { cam: [30, 9, -30], at: [8, 3.5, -8] },
  "ext-north": { cam: [-8, 6, -28], at: [4, 3.5, -8] }
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
const origin = await page.evaluate(() => {
  const r = window.__scene.getObjectByName("ranchRemodel");
  r.updateWorldMatrix(true, false);
  const p = r.getWorldPosition(r.position.clone());
  return [p.x, p.y, p.z];
});
await mkdir(OUT, { recursive: true });
for (const [name, pose] of Object.entries(POSES)) {
  if (only.length && !only.includes(name)) continue;
  const [px, py, pz] = pose.cam.map((v, i) => v + origin[i]);
  const [tx, ty, tz] = pose.at.map((v, i) => v + origin[i]);
  await page.evaluate((v) => { window.__captureView = v; }, { px, py, pz, tx, ty, tz });
  await page.waitForTimeout(600);
  await page.waitForFunction(() => window.__vegSettled?.(), null, { timeout: 120000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("captured", name);
}
await writeFile(`${OUT}/capture.json`, JSON.stringify({ info, origin, errors }, null, 2));
await browser.close();
