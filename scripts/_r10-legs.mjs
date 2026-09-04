// Leg visibility diagnostic: dump every mesh under the horse with its world
// box, then frame the belly/leg zone up close (short grass, so occlusion is
// not the question).
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium, enterWorld, launchOptions, spawnPreviewServer, gs } from "./probe/drive.mjs";

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const server = await spawnPreviewServer(spawn, { port: 8765 });
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await enterWorld(`http://127.0.0.1:8765/?dev`, page);
await page.waitForTimeout(600);

const meshes = await page.evaluate(() => {
  const m = window.__missions();
  let root = null;
  window.__scene.traverse((o) => {
    if (root || !o.isGroup) return;
    if (Math.abs(o.position.x - m.horse.x) < 0.01 && Math.abs(o.position.z - m.horse.z) < 0.01) {
      root = o;
    }
  });
  if (!root) return { error: "horse group not found" };
  const r3 = (v) => +v.toFixed(2);
  const apply = (e, x, y, z) => ({
    // matrixWorld.elements is column-major
    x: e[0] * x + e[4] * y + e[8] * z + e[12],
    y: e[1] * x + e[5] * y + e[9] * z + e[13],
    z: e[2] * x + e[6] * y + e[10] * z + e[14]
  });
  const out = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.updateWorldMatrix(true, false);
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    const e = o.matrixWorld.elements;
    let minX = 1e9, minY = 1e9, minZ = 1e9, maxX = -1e9, maxY = -1e9, maxZ = -1e9;
    for (const cx of [bb.min.x, bb.max.x]) {
      for (const cy of [bb.min.y, bb.max.y]) {
        for (const cz of [bb.min.z, bb.max.z]) {
          const w = apply(e, cx, cy, cz);
          minX = Math.min(minX, w.x); maxX = Math.max(maxX, w.x);
          minY = Math.min(minY, w.y); maxY = Math.max(maxY, w.y);
          minZ = Math.min(minZ, w.z); maxZ = Math.max(maxZ, w.z);
        }
      }
    }
    out.push({
      geom: o.geometry?.type,
      visible: o.visible,
      worldYbottomTop: [r3(minY), r3(maxY)],
      boxX: [r3(minX), r3(maxX)],
      boxY: [r3(minY), r3(maxY)],
      boxZ: [r3(minZ), r3(maxZ)]
    });
  });
  return out;
});
console.log(JSON.stringify(meshes, null, 1));

// Low close-up of the leg zone.
const h = (await gs()).horse;
const gy = await page.evaluate((h) => window.__heightAt(h.x, h.z), h);
await page.evaluate(({ h, gy }) => {
  window.__captureView = {
    px: h.x + 3.2, py: gy + 0.8, pz: h.z + 0.5,
    tx: h.x + 0.1, ty: gy + 0.55, tz: h.z
  };
}, { h, gy });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/legs-closeup.png` });
console.log("shot legs-closeup");

await browser.close();
server?.kill?.();
process.exit(0);