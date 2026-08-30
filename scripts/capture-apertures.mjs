/**
 * Aperture-inspection captures — per-ID visual evidence for every door and
 * window in the canonical inventory (src/buildings/apertures.js).
 *
 * The ids, counts and states come from __apertures() — nothing in this file
 * keeps its own list to drift. __apertureView(id) frames each aperture from
 * the exterior normal at mid-aperture height; every window on a habitable
 * structure also gets an interior shot through its own opening. Output is one
 * PNG per aperture per light, named by stable id, plus a manifest with
 * explicit per-ID results — the contact-sheet layer reads the manifest, not
 * the folder.
 *
 * The debug camera is permitted here; the functional traversal probe is a
 * separate script that walks, never teleports.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import { launchOptions } from "./probe/drive.mjs";

const BASE = process.env.CAPTURE_URL || "http://127.0.0.1:8765";
const OUT = process.env.CAPTURE_OUT || "audit/apertures";
const LIGHTS = [
  { name: "midday", hdri: "midday", elevation: 52, azimuth: -120 },
  { name: "golden", hdri: "golden", elevation: 8, azimuth: -110 }
];

function safeName(id) {
  return id.replace(/[^A-Za-z0-9._-]+/g, "_");
}

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const pageErrors = [];
page.on("pageerror", (e) => {
  if (/pointer lock/i.test(e.message)) {
    return;
  }
  pageErrors.push(e.message);
});

await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(9000);
// The title overlay swallows synthetic clicks; dispatch directly.
await page.evaluate(() => document.getElementById("btn-enter")?.click());
await page.waitForTimeout(6000);
await page.evaluate(() => window.__captureMode(true));

const backends = await page.evaluate(() => window.__captureInfo?.());
if (!backends?.backend) {
  throw new Error("capture page did not report its renderer backend");
}
if (backends.backend !== "webgpu") {
  throw new Error(`expected webgpu, page reported ${backends.backend}`);
}

const apertures = await page.evaluate(() => window.__apertures());
if (!apertures?.length) {
  throw new Error('__apertures() returned nothing — the inventory must never be empty');
}
console.log(`inventory: ${apertures.length} apertures`);

await mkdir(OUT, { recursive: true });
const results = [];
for (const light of LIGHTS) {
  await page.evaluate((l) => {
    Object.assign(window.__materialSettings, {
      hdri: l.hdri,
      sunElevation: l.elevation,
      sunAzimuth: l.azimuth
    });
    window.__syncMaterialSettings();
  }, light);
  await page.waitForTimeout(800);

  for (const ap of apertures) {
    const file = `${safeName(ap.id)}-${light.name}.png`;
    const entry = { id: ap.id, kind: ap.kind, state: ap.state, light: light.name, file, results: [] };
    const poses = [{ view: { id: ap.id }, name: file }];
    // Interior side for real windows: through the opening, standing inside.
    if (ap.kind === "window" && ap.interior) {
      poses.push({ view: { id: ap.id, flip: true }, name: `${safeName(ap.id)}-${light.name}-interior.png` });
    }
    for (const pose of poses) {
      const ok = await page.evaluate((p) => {
        const v = window.__apertureView(p.id, 5.5);
        if (!v) {
          return null;
        }
        if (p.flip) {
          // Interior pass: put the camera on the far side of the opening —
          // inside the room, reflection of where the exterior pass stood —
          // and look back at the glass. (The first draft kept px = tx + dx,
          // which left the camera where the exterior pass put it: every
          // "interior" shot was a duplicate of the exterior one.)
          const dx = v.px - v.tx;
          const dz = v.pz - v.tz;
          return { px: v.tx - dx, py: v.py, pz: v.tz - dz, tx: v.tx, ty: v.ty, tz: v.tz };
        }
        return v;
      }, { id: ap.id, flip: pose.name !== file });
      if (!ok) {
        results.push({ ...entry, file: pose.name, status: "FAIL", detail: "no view geometry" });
        console.log(`FAIL ${pose.name}`);
        continue;
      }
      await page.evaluate((v) => {
        window.__captureView = v;
      }, ok);
      await page.waitForTimeout(250); // settle TSL uniforms
      await page.screenshot({ path: `${OUT}/${pose.name}` });
      results.push({ ...entry, file: pose.name, status: "OK" });
      console.log(`shot ${pose.name}`);
    }
  }
}

await page.evaluate(() => window.__captureMode(false));
await browser.close();

const manifest = {
  base: BASE,
  backend: backends.backend,
  apertureCount: apertures.length,
  lights: LIGHTS.map((l) => l.name),
  pageErrors,
  results
};
await writeFile(`${OUT}/capture-manifest.json`, JSON.stringify(manifest, null, 2));
const failed = results.filter((r) => r.status !== "OK");
console.log(`manifest: ${results.length} shots, ${failed.length} failed, ${pageErrors.length} page errors`);
if (failed.length || pageErrors.length) {
  process.exit(1);
}