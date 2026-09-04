// Hip transform check on the clean server: the four leg hip groups' local
// positions and world matrices (NaN check).
import { spawn } from "node:child_process";
import { chromium, enterWorld, launchOptions, spawnPreviewServer } from "./probe/drive.mjs";

const server = await spawnPreviewServer(spawn, { port: 8765 });
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await enterWorld(`http://127.0.0.1:8765/?dev`, page);
await page.waitForTimeout(600);

const raw = await page.evaluate(() => {
  const m = window.__missions();
  let root = null;
  window.__scene.traverse((o) => {
    if (root || !o.isGroup) return;
    if (Math.abs(o.position.x - m.horse.x) < 0.01 && Math.abs(o.position.z - m.horse.z) < 0.01) {
      root = o;
    }
  });
  if (!root) return "no root";
  const s = (v) => +v.toFixed(2);
  const hips = [];
  root.traverse((o) => {
    if (o.isGroup && Math.abs(o.position.y - 1.02) < 0.01) hips.push(o);
  });
  return hips.map((h) => {
    const sum = h.matrixWorld.elements.reduce((a, b) => a + b, 0);
    return {
      pos: [s(h.position.x), s(h.position.y), s(h.position.z)],
      worldNaN: Number.isNaN(sum),
      world: [s(h.matrixWorld.elements[12]), s(h.matrixWorld.elements[13]), s(h.matrixWorld.elements[14])]
    };
  });
});
console.log(JSON.stringify(raw));

await browser.close();
server?.kill?.();
process.exit(0);