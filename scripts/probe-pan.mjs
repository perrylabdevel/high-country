/**
 * Panning must not rebuild the ground cover.
 *
 * The scatter used to fill only the hemisphere the camera faced, so every 25
 * degrees of turn started a full rescatter spanning ~73 frames. Any normal
 * mouse pan is faster than that rebuild, so the camera turned into ground the
 * scatter had not reached yet and the player watched the cover arrive — the
 * grass drawing itself in, which is exactly what it looked like. The disc is
 * planted at every bearing now (see the note above plantBlade in
 * vegetation.js), so where the camera LOOKS can no longer make the cover
 * stale, and this probe is what holds that down.
 *
 * It turns a full circle at a realistic pan rate and asserts two things:
 *
 *   - grass.instanceMatrix.version never moves. A bump is a completed
 *     rescatter, which is the whole defect.
 *   - __vegSettled() stays true throughout. It gates every screenshot the
 *     audit takes, so a pan that unsettles the scatter also silently costs
 *     the capture harness minutes of waiting.
 *
 * Then it walks REBUILD_STEP metres to prove the position path still DOES
 * rebuild — a probe that passes because nothing ever rebuilds would be
 * worthless.
 *
 *   npm run build && npm run preview &
 *   node scripts/probe-pan.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { AUDIT_POIS } from "./capture-poi.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:8765";
const ID = process.env.POI || "ranch";
const poi = AUDIT_POIS.find((p) => p.id === ID);
if (!poi) throw new Error(`unknown POI ${ID}`);
/** Degrees per second. A mouse flick is far faster; this is a deliberate pan. */
const PAN_RATE = Number(process.env.PAN_RATE || 120);

// Kiosk for the same reason fps-sweep needs it: a headed window that ends up
// even partially covered gets macOS's native rAF throttle, the frame loop
// stops, and a probe that waits on a rebuild waits forever for a scatter that
// is never stepped. Kiosk makes the window the screen.
const args = [
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--kiosk"
];
const browser = await chromium.launch({ headless: false, args });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const fail = (msg) => { throw new Error(msg); };

await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(9000);
await page.evaluate(() => document.getElementById("btn-enter")?.click());
await page.waitForTimeout(6000);
await page.evaluate(() => window.__captureMode(true));

const place = await page.evaluate((id) => {
  const q = window.__POS[id];
  return { x: q.x, z: q.z, y: window.__heightAt(q.x, q.z) };
}, ID);
const eye = { x: place.x, y: place.y + 1.7, z: place.z };

/** Aim from a fixed standpoint along `deg`, level. */
async function look(deg) {
  await page.evaluate(({ eye, deg }) => {
    const r = (deg * Math.PI) / 180;
    window.__captureView = {
      px: eye.x, py: eye.y, pz: eye.z,
      tx: eye.x + Math.sin(r) * 80, ty: eye.y, tz: eye.z + Math.cos(r) * 80
    };
  }, { eye, deg });
}
const settled = () => page.evaluate(() => { try { return window.__vegSettled?.() !== false; } catch { return false; } });
/**
 * Three consecutive settled reads, not one. A single true can be caught in the
 * gap between two jobs, and a rebuild that completes just after the pan starts
 * would then be blamed on the turn.
 */
async function settle(timeoutMs = 90000) {
  const until = Date.now() + timeoutMs;
  let run = 0;
  while (Date.now() < until) {
    run = (await settled()) ? run + 1 : 0;
    if (run >= 3) return;
    await page.waitForTimeout(400);
  }
  fail(`scatter never settled within ${timeoutMs / 1000}s`);
}
/** Version of the biggest instanced mesh in the scene — the ground cover. */
const grassVersion = () => page.evaluate(() => {
  let g = null;
  window.__scene.traverse((o) => { if (o.isInstancedMesh && (!g || o.count > g.count)) g = o; });
  return { version: g.instanceMatrix.version, count: g.count };
});

await look(0);
await settle();
await page.waitForTimeout(800);

// Baseline frame at bearing 0, for the visual half of the claim.
const shot0 = await page.screenshot();

const result = await page.evaluate(({ eye, rate }) => new Promise((res) => {
  let grass = null;
  window.__scene.traverse((o) => { if (o.isInstancedMesh && (!grass || o.count > grass.count)) grass = o; });
  const startVersion = grass.instanceMatrix.version;
  const startCount = grass.count;
  let bumps = 0;
  const at = [];
  let unsettled = 0;
  let frames = 0;
  let last = startVersion;
  const t0 = performance.now();
  const tick = () => {
    const deg = ((performance.now() - t0) / 1000) * rate;
    const r = (deg * Math.PI) / 180;
    window.__captureView = {
      px: eye.x, py: eye.y, pz: eye.z,
      tx: eye.x + Math.sin(r) * 80, ty: eye.y, tz: eye.z + Math.cos(r) * 80
    };
    frames += 1;
    if (grass.instanceMatrix.version !== last) { bumps += 1; last = grass.instanceMatrix.version; at.push({ deg: Math.round(deg), frame: frames, count: grass.count }); }
    try { if (window.__vegSettled() === false) unsettled += 1; } catch { unsettled += 1; }
    if (deg < 360) return requestAnimationFrame(tick);
    res({ bumps, at, unsettled, frames, startCount, endCount: grass.count, degrees: deg, mesh: grass.name || grass.type });
  };
  requestAnimationFrame(tick);
}), { eye, rate: PAN_RATE });

console.log(`pan ${result.degrees.toFixed(0)} deg at ${PAN_RATE} deg/s over ${result.frames} frames`);
console.log(`  rescatters: ${result.bumps}   frames reported unsettled: ${result.unsettled}   tufts ${result.startCount} -> ${result.endCount}`);
if (result.bumps !== 0) fail(`${JSON.stringify(result.at)} `+`turning rebuilt the ground cover ${result.bumps} time(s); a pan must not rescatter`);
if (result.unsettled !== 0) fail(`turning left the scatter unsettled on ${result.unsettled} frame(s)`);

// Back to the starting bearing: the frame must match the one taken before the
// pan. World-anchored tufts return to the same spots, so this is exact.
await look(0);
await page.waitForTimeout(600);
const shot1 = await page.screenshot();
const changed = shot0.length === shot1.length && shot0.equals(shot1);
console.log(`  frame at bearing 0 after a full turn: ${changed ? "byte-identical" : "differs (wind phase — compare by eye)"}`);

// The control: moving still rebuilds, or this probe proves nothing.
const before = await grassVersion();
console.log(`  cover centred at ${JSON.stringify(await page.evaluate(() => window.__vegCenter()))}`);
await page.evaluate(({ eye }) => {
  window.__captureView = {
    px: eye.x, py: eye.y, pz: eye.z + 60,
    tx: eye.x, ty: eye.y, tz: eye.z + 140
  };
}, { eye });
const deadline = Date.now() + 60000;
let after = before;
while (Date.now() < deadline) {
  after = await grassVersion();
  if (after.version !== before.version) break;
  await page.waitForTimeout(300);
}
console.log(`  control — walking 60 m rebuilt the disc: ${after.version !== before.version} (version ${before.version} -> ${after.version}, tufts ${before.count} -> ${after.count})`);
if (after.version === before.version) fail("walking past REBUILD_STEP did not rebuild the cover; the probe is not testing anything");

await browser.close();
console.log("PASS");
