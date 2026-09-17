/** WebGPU captures of the church from lot-local poses (x across the gable
 * ends, +z toward the street). Needs `npm run build` and a preview; set
 * CAPTURE_BASE to it.
 *   node scripts/blender-church/capture.mjs audit/church/current [pose...]
 * Run export-layout.mjs first if the lot or the row moved.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { launchOptions } from "../probe/drive.mjs";

const { lot: LOT } = JSON.parse(readFileSync(new URL("./layout.json", import.meta.url)));
const c = Math.cos(LOT.yaw), sn = Math.sin(LOT.yaw);
const OUT = process.argv[2] || "audit/church/current";
const only = process.argv.slice(3);

// EYE = 1.62 above the floor stood on (HARD_WON 5): FLOOR 0.10 + 1.62.
const G = 0.10 + 1.62;
export const POSES = {
  street: { cam: [-9.0, G, 15.0], at: [1.0, 5.0, 2.0] },
  steeple: { cam: [6.0, 3.4, 14.0], at: [4.0, 11.0, 0.0] },
  entry: { cam: [-2.2, G, 8.2], at: [0.2, 2.4, 3.9] },
  nave: { cam: [0.0, G, 3.1], at: [0.0, 1.5, -3.7] },
  chancel: { cam: [0.4, G, -0.4], at: [-1.2, 1.5, -3.7] },
  lights: { cam: [-1.2, G, -1.0], at: [3.7, 1.8, 1.4] },
  back: { cam: [3.0, G, 1.6], at: [-2.0, 2.2, 3.9] }
};

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => { if (!/pointer lock/i.test(e.message)) errors.push(e.message); });
// CAPTURE_BASE picks the server. A default port can be held by a server for a
// different checkout, and the capture then shows that checkout's build
// without any error -- the store interior's first capture was the old store.
const BASE = process.env.CAPTURE_BASE || "http://127.0.0.1:8765";
await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForFunction(() => document.getElementById("btn-enter"), null, { timeout: 90000 });
await page.waitForTimeout(4000);
await page.evaluate(() => document.getElementById("btn-enter")?.click());
await page.waitForTimeout(5000);
await page.evaluate(() => window.__captureMode(true));

// Pin the conditions, as capture-poi.mjs does. These scripts first ran with the
// weather and sun left to boot: the hotel lobby measured mean luma 53 in one
// pass and 12.7 in the next with byte-identical models -- an interior lit
// through its windows swings 4x with overcast or a low sun while the street
// barely moves. Poll for the late-assigned hook, force, then VERIFY what took
// (HARD_WON 4: a manifest records what was requested, never what took).
const WEATHER = process.env.CAPTURE_WEATHER || "clear";
const LIGHT = { midday: { hdri: "midday", elevation: 62, azimuth: -120 },
  golden: { hdri: "golden", elevation: 9, azimuth: -78 } }[process.env.CAPTURE_LIGHT || "midday"];
if (!LIGHT) throw new Error(`unknown CAPTURE_LIGHT ${process.env.CAPTURE_LIGHT}`);
let hook = false;
for (let i = 0; i < 240 && !hook; i += 1) {
  hook = await page.evaluate(() => typeof window.__weatherForce === "function" && Boolean(window.__materialSettings));
  if (!hook) await page.waitForTimeout(500);
}
if (!hook) throw new Error("weather/material hooks never appeared within 120s; conditions cannot be pinned");
await page.evaluate((s) => window.__weatherForce(s), WEATHER);
const weatherNow = await page.evaluate(() => window.__weatherState());
if (weatherNow !== WEATHER) throw new Error(`weather force did not take: asked ${WEATHER}, page reports ${weatherNow}`);
await page.evaluate((l) => {
  Object.assign(window.__materialSettings, { hdri: l.hdri, sunElevation: l.elevation, sunAzimuth: l.azimuth });
  window.__syncMaterialSettings();
}, LIGHT);
const lightNow = await page.evaluate(() => ({ hdri: window.__materialSettings.hdri,
  elevation: window.__materialSettings.sunElevation, azimuth: window.__materialSettings.sunAzimuth }));
if (lightNow.hdri !== LIGHT.hdri || lightNow.elevation !== LIGHT.elevation || lightNow.azimuth !== LIGHT.azimuth) {
  throw new Error(`light did not take: asked ${JSON.stringify(LIGHT)}, page reports ${JSON.stringify(lightNow)}`);
}
await page.waitForTimeout(800);
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
await writeFile(`${OUT}/capture.json`, JSON.stringify({ info, errors, weather: weatherNow, light: lightNow, poses: POSES }, null, 2));
await browser.close();
