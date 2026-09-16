/** WebGPU captures of the hotel from lot-local poses (x across the facade,
 * +z toward the street). Needs `npm run build` and a preview on :8765.
 *   node scripts/blender-hotel/capture.mjs audit/hotel/current [pose...]
 * Run export-layout.mjs first if the lot or the row moved.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { launchOptions } from "../probe/drive.mjs";

const { lot: LOT } = JSON.parse(readFileSync(new URL("./layout.json", import.meta.url)));
const c = Math.cos(LOT.yaw), sn = Math.sin(LOT.yaw);
const OUT = process.argv[2] || "audit/hotel/current";
const only = process.argv.slice(3);

// Lot-local z is measured from the lot CENTRE, so the front wall is at z = 4.5
// and the far row of buildings starts around z = 20. A first pass put the
// street camera at z = 22 and rendered the inside of the building opposite.
// There is no lens control either: __captureView in src/main.js honours only
// px/py/pz/tx/ty/tz, so a `lens` field here would be silently dead. The hotel
// is framed by staying inside the street width at the default field of view,
// which at ~12 m from the wall clears the 12.4 m ridge.
// Eye height is HARD_WON 5's project decision, EYE = 1.62 above the floor
// stood on: 0.10 + 1.62 on the ground floor and the boardwalk, and
// UPPER 3.44 + 1.62 = 5.06 upstairs and on the gallery. Earlier passes used 1.7.
const G = 0.10 + 1.62;
const U = 3.44 + 1.62;
export const POSES = {
  // Exterior: the elevation that had nothing in it but a door.
  street: { cam: [-9, G, 17], at: [0.5, 4.4, 4] },
  back: { cam: [3.0, G, -15], at: [0.0, 3.4, -4.5] },
  gallery: { cam: [-4.6, U, 5.4], at: [3.5, 4.8, 6.6] },
  // Ground floor.
  lobby: { cam: [0.3, G, 3.6], at: [-2.0, 1.9, -2.5] },
  desk: { cam: [-1.6, G, 2.0], at: [4.0, 1.5, 1.8] },
  stair: { cam: [-3.2, G, -3.8], at: [-4.73, 3.3, 0.6] },
  // Upper floor.
  hall: { cam: [-4.4, U, 2.6], at: [2.0, 4.9, 3.5] },
  room: { cam: [0.6, U, 0.9], at: [0.6, 4.5, -3.3] }
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
