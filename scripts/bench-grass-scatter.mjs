/**
 * Times one grass-disc rebuild (the hitch after walking ~REBUILD_STEP meters).
 * Exit 2 if a single scatter would freeze a frame.
 */
import { POS, roadFactor, creekFactor, inClearing, biomeAt } from "../src/map.js";
import { heightAt, normalAt, bakeHeightfield } from "../src/heightfield.js";

const MAX_GRASS = 46000;
const GRASS_RADIUS = 52;
const BUDGET_MS = 12;

function seeded(n) {
  const x = Math.sin(n * 999) * 43758.5453;
  return x - Math.floor(x);
}

bakeHeightfield();
const offsets = new Float32Array(MAX_GRASS * 2);
for (let i = 0; i < MAX_GRASS; i += 1) {
  const r = GRASS_RADIUS * Math.sqrt(seeded(i * 2 + 1));
  const a = seeded(i * 2 + 2) * Math.PI * 2;
  offsets[i * 2] = Math.cos(a) * r;
  offsets[i * 2 + 1] = Math.sin(a) * r;
}

const cx = POS.ranch.x;
const cz = POS.ranch.z;
const t0 = performance.now();
let g = 0;
for (let i = 0; i < MAX_GRASS; i += 1) {
  const x = cx + offsets[i * 2];
  const z = cz + offsets[i * 2 + 1];
  const creek = creekFactor(x, z);
  const road = roadFactor(x, z);
  if (inClearing(x, z) && !(Math.hypot(x - POS.ranch.x, z - POS.ranch.z) < 95)) {
    continue;
  }
  if (creek > 0.35 || road > 0.3) {
    continue;
  }
  const n = normalAt(x, z);
  const t = Math.max(0, Math.min(1, (1 - n.y - 0.18) / 0.32));
  const slopeFactor = 1 - t * t * (3 - 2 * t);
  const weight =
    ({ lake: 0.45, ranch: 0.9, town: 0.3, pines: 0.92, burn: 0.04, range: 0.6, iron: 0.25, badlands: 0.04, tribal: 0.75, foothills: 0.82, valley: 0.92 }[biomeAt(x, z)] ?? 0) *
    slopeFactor *
    (1 - creek * 0.8) *
    (1 - road);
  if (weight < 0.28) {
    continue;
  }
  heightAt(x, z);
  g += 1;
}
const ms = performance.now() - t0;
const chunkMs = ms * (2500 / MAX_GRASS);
process.stdout.write(
  `grass scatter ${ms.toFixed(1)} ms · kept ${g}/${MAX_GRASS} · ~${chunkMs.toFixed(1)} ms / 2500-blade chunk\n`
);
if (chunkMs > BUDGET_MS) {
  process.stderr.write(`FAIL: 2500-blade chunk ${chunkMs.toFixed(1)} ms exceeds ${BUDGET_MS} ms\n`);
  process.exit(2);
}
process.stdout.write("PASS\n");
