/** WebGPU captures of the general store from lot-local poses (x across the
 * facade, +z toward the street). Needs `npm run build` and a preview on :8765.
 *   node scripts/blender-store/capture.mjs audit/store/current [pose...]
 * Run export-layout.mjs first if the lot or the row moved.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { launchOptions } from "../probe/drive.mjs";

const { lot: LOT } = JSON.parse(readFileSync(new URL("./layout.json", import.meta.url)));
const c = Math.cos(LOT.yaw), sn = Math.sin(LOT.yaw);
const OUT = process.argv[2] || "audit/store/current";
const only = process.argv.slice(3);

export const POSES = {
  // The graded question is whether the facade reads from the street at a
  // walking adult's eye height, so that is the first pose, not an aerial.
  street: { cam: [-8.5, 1.7, 18], at: [0.5, 4.6, 3] },
  front: { cam: [0.5, 1.7, 15], at: [0.0, 5.2, 3] },
  boardwalk: { cam: [-4.6, 1.68, 6.4], at: [3.4, 2.2, 5.2] },
  display: { cam: [-1.2, 1.68, 6.6], at: [-2.8, 1.6, 4.2] },
  entry: { cam: [0.2, 1.7, 7.4], at: [0.1, 1.5, 3.0] },
  // The ghost sign and the battens on the west return.
  side: { cam: [-13, 1.9, 9], at: [-4.8, 3.2, 1.0] },
  // The crown against the sky, and the row it stands in.
  crown: { cam: [-6, 3.2, 20], at: [0.0, 8.4, 3.5] }
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
  await page.evaluate((v) => { window.__captureView = v; }, { px, py, pz, tx, ty, tz });
  await page.waitForTimeout(600);
  await page.waitForFunction(() => window.__vegSettled?.(), null, { timeout: 120000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("captured", name);
}
await writeFile(`${OUT}/capture.json`, JSON.stringify({ info, errors, poses: POSES }, null, 2));
await browser.close();
