// Full object graph under the horse root, safely stringified.
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
  const lines = [];
  const walk = (o, depth) => {
    const t = (v) => (typeof v === "number" ? +v.toFixed(2) : String(v));
    lines.push(
      `${"  ".repeat(depth)}${o.type} pos=(${t(o.position.x)}, ${t(o.position.y)}, ${t(o.position.z)}) ` +
        `rot=(${t(o.rotation.x)}, ${t(o.rotation.y)}, ${t(o.rotation.z)}) kids=${o.children.length}`
    );
    for (const c of o.children) walk(c, depth + 1);
  };
  walk(root, 0);
  return lines;
});
console.log(Array.isArray(raw) ? raw.join("\n") : raw);

await browser.close();
server?.kill?.();
process.exit(0);