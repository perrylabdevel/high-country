import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
import sharp from "sharp";
import { launchOptions } from "./probe/drive.mjs";
import { ROADS, mapToWorld, WORLD } from "../src/map.js";
import { LIGHTS } from "./capture-poi.mjs";

const BASE = process.argv[2] || "http://127.0.0.1:8766";
const OUT = process.argv[3];
const VIEWS = [["stage", 7, 0.55], ["townMain", 1, 0.32], ["cabinTrail", 2, 0.5]];
if (!OUT || OUT === "audit/current") throw new Error("Supply a diagnostic output directory outside audit/current");
if (process.env.CAPTURE_ROAD && !VIEWS.some(([name]) => name === process.env.CAPTURE_ROAD)) throw new Error("CAPTURE_ROAD must be stage, townMain, or cabinTrail");
const served = await fetch(BASE);
const built = await readFile("dist/index.html", "utf8");
const entry = built.match(/src="([^"]*assets\/[^\"]+\.js)"/)?.[1];
if (!served.ok || !entry || !(await served.text()).includes(entry)) throw new Error("Preview does not serve the current dist build");
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch(launchOptions());
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", (e) => { if (!/pointer lock/i.test(e.message)) errors.push(e.message); });
  page.on("console", (m) => { if (m.type() === "error" && !/404 \(Not Found\)/.test(m.text())) errors.push(m.text()); });
  page.on("response", (r) => { if (r.status() >= 400 && new URL(r.url()).pathname !== "/favicon.ico") errors.push(`HTTP ${r.status()}: ${r.url()}`); });
  page.on("requestfailed", (r) => errors.push(`${r.url()}: ${r.failure()?.errorText}`));
  await page.goto(`${BASE}/?dev`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForFunction(() => !!window.__vegSettled && !!window.__captureInfo?.().backend, null, { timeout: 120000 });
  await page.evaluate(() => { document.getElementById("btn-enter")?.click(); window.__captureMode(true); });
  if (process.env.CAPTURE_RUT_RELIEF !== undefined) {
    const depth = Number(process.env.CAPTURE_RUT_RELIEF);
    if (!Number.isFinite(depth) || depth < 0 || depth > 0.2) throw new Error("CAPTURE_RUT_RELIEF must be in [0, 0.2] metres");
    await page.evaluate((d) => { window.__materialSettings.rutReliefMeters = d; window.__syncMaterialSettings(); }, depth);
  }
  const info = await page.evaluate(() => window.__captureInfo());
  if (info.backend !== "webgpu") throw new Error(`Expected webgpu, got ${info.backend}`);
  const results = [];
  for (const light of LIGHTS) {
    await page.evaluate((l) => {
      Object.assign(window.__materialSettings, { hdri: l.hdri, sunElevation: l.elevation, sunAzimuth: l.azimuth });
      window.__syncMaterialSettings();
    }, light);
    for (const [name, segment, t] of VIEWS) {
      if (process.env.CAPTURE_ROAD && process.env.CAPTURE_ROAD !== name) continue;
      const road = ROADS.find((r) => r.name === name);
      const a = mapToWorld(...road.pts[segment]);
      const b = mapToWorld(...road.pts[segment + 1]);
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const dx = (b.x - a.x) / len, dz = (b.z - a.z) / len;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      for (const mode of ["eye", "detail"]) {
        const view = await page.evaluate(({ x, z, dx, dz, mode }) => {
          const h = window.__heightAt;
          const px = x - dx * 7 + (mode === "detail" ? -dz * 2 : 0);
          const pz = z - dz * 7 + (mode === "detail" ? dx * 2 : 0);
          const py = h(px, pz) + 1.65;
          const v = { px, py, pz, tx: x + dx * (mode === "eye" ? 50 : 0), ty: mode === "eye" ? py : h(x, z), tz: z + dz * (mode === "eye" ? 50 : 0) };
          window.__captureView = v;
          return v;
        }, { x, z, dx, dz, mode });
        await page.waitForFunction((v) => {
          const p = window.__camera.position;
          return Math.hypot(p.x - v.px, p.y - v.py, p.z - v.pz) < 0.01;
        }, view, { timeout: 30000 });
        await page.waitForFunction(() => window.__vegSettled(), null, { timeout: 180000 });
        await page.waitForTimeout(1500);
        const file = `${name}-${mode}-${light.name}.png`;
        await page.screenshot({ path: `${OUT}/${file}`, timeout: 180000 });
        results.push({ file, view, settled: true });
        console.log(`captured ${file}`);
      }
    }
  }
  const settings = await page.evaluate(() => ({ ...window.__materialSettings }));
  const { data, info: image } = await sharp("public/textures/gravel_2k_orm.png").raw().toBuffer({ resolveWithObject: true });
  let sum = 0, min = 1, max = 0;
  for (let i = 1; i < data.length; i += image.channels) {
    const rough = data[i] / 255;
    sum += rough; min = Math.min(min, rough); max = Math.max(max, rough);
  }
  const measurements = { sourceGravelRoughness: { min, mean: sum / (image.width * image.height), max }, terrainCellMeters: WORLD.width / WORLD.segmentsX };
  await writeFile(`${OUT}/capture-manifest.json`, JSON.stringify({ ...info, settings, measurements, results, errors }, null, 2));
  console.log(JSON.stringify(measurements));
  if (errors.length) throw new Error(errors.join("\n"));
} finally {
  await browser.close();
}
