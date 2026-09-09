/**
 * Live triangle census at audit POIs: which meshes contribute the frame's
 * submitted triangles. Same setup as scripts/fps-baseline.mjs, then a scene
 * traversal of every InstancedMesh/Mesh with its live instance count and
 * per-instance triangle count.
 *
 *   BASE=http://127.0.0.1:8765 node scripts/tri-census.mjs northernPines
 */
import { chromium } from "playwright";
import { AUDIT_POIS } from "./capture-poi.mjs";

const base = process.env.BASE || "http://127.0.0.1:8765";
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["northernPines", "lakeMercy"];

let browser;
try {
  browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    args: ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--kiosk", "--disable-gpu-vsync", "--disable-frame-rate-limit"]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => {
    window.__lastTextureUpload = performance.now();
    window.__textureUploadCount = 0;
    for (const method of ["writeTexture", "copyExternalImageToTexture"]) {
      const original = window.GPUQueue?.prototype[method];
      if (!original) continue;
      window.GPUQueue.prototype[method] = function (...args) {
        window.__lastTextureUpload = performance.now();
        window.__textureUploadCount++;
        return original.apply(this, args);
      };
    }
  });
  await page.goto(`${base}/?dev`, { waitUntil: "domcontentloaded", timeout: 60000 });
  page.on("pageerror", (err) => console.error(`pageerror: ${err.message}`));
  await page.waitForTimeout(9000);
  await page.evaluate(() => document.getElementById("btn-enter")?.click());
  await page.waitForTimeout(6000);
  await page.evaluate(() => window.__captureMode(true));
  const info = await page.evaluate(() => window.__captureInfo?.());
  if (info?.backend !== "webgpu") throw new Error(`page reported ${info?.backend}; census requires the shipping WebGPU path`);
  // Attribute per-POI only after streaming settles: the world (statics,
  // vegetation, roads) is built progressively after enter.
  const poi0 = AUDIT_POIS.find((p) => p.id === ids[0]);
  await page.evaluate((p) => {
    const q = window.__POS[p.id];
    const r = p.heading * Math.PI / 180;
    const x = q.x + Math.sin(r) * p.dist;
    const z = q.z + Math.cos(r) * p.dist;
    window.__captureView = { px: x, py: window.__heightAt(x, z) + p.height, pz: z, tx: q.x, ty: window.__heightAt(q.x, q.z) + p.aim, tz: q.z };
  }, poi0);
  await page.waitForFunction(() => {
    try {
      return window.__vegSettled?.() === true && performance.now() - window.__lastTextureUpload > 4000;
    } catch { return false; }
  }, {}, { timeout: 120000 });

  const census = await page.evaluate(() => {
    const root = window.__scene;
    if (!root) throw new Error("no scene handle on window");
    const rows = [];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry;
      const trisPer = (g.index ? g.index.count : g.attributes.position.count) / 3;
      const instances = o.isInstancedMesh ? o.count : 1;
      rows.push({
        kind: o.isInstancedMesh ? "instanced" : "mesh",
        instances,
        trisPer: Math.round(trisPer),
        tris: Math.round(trisPer * instances),
        castShadow: !!o.castShadow,
        mat: o.material?.name || o.material?.type || "?",
        name: o.name || "",
        parent: o.parent?.name || o.parent?.type || "?"
      });
    });
    // Aggregate every mesh by signature so nothing is lost to a top-N cut.
    const groups = new Map();
    const big = [];
    const strip = (n) => n ? n.replace(/-\d+$/, "") : "?";
    for (const r of rows) {
      const key = `${strip(r.name) || strip(r.parent)}@${r.kind}`;
      const g = groups.get(key) || { key, meshes: 0, instances: 0, tris: 0 };
      g.meshes += 1;
      g.instances += r.instances;
      g.tris += r.tris;
      groups.set(key, g);
      if (r.trisPer * r.instances > 100000) {
        big.push({ tris: Math.round(r.trisPer * r.instances), mat: r.mat, name: r.name, parent: r.parent });
      }
    }
    const out = [...groups.values()].sort((a, b) => b.tris - a.tris);
    out.push({ key: "TOTAL(scene, frustum-independent)", meshes: rows.length, instances: 0, tris: rows.reduce((s, r) => s + r.tris, 0) });
    out.push({ key: "SAMPLE_BIG_MESHES", big: big.sort((a, b) => b.tris - a.tris).slice(0, 15) });
    return out;
  });
  console.log(JSON.stringify(census, null, 1));
} finally {
  await browser?.close();
}