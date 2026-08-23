/**
 * Times one grass-disc rebuild — the work that used to hitch after walking
 * REBUILD_STEP metres — and reports the per-frame chunk cost.
 *
 * Exit 2 if a single amortised chunk would blow a 60 fps frame. The old
 * 2500-blade chunk measured ~6 ms of pure sampling on its own, before any
 * matrix composition, which is most of a frame's budget spent on grass.
 *
 * Mirrors the ring scatter in src/vegetation.js. The building-footprint test is
 * omitted: it needs a built scene, and scripts/check-vegetation.mjs covers it.
 */
import { POS, roadFactor, creekFactor, lakeFactor, biomeAt, smoothstep as ramp } from "../src/map.js";
import { heightAt, normalAt, bakeHeightfield } from "../src/heightfield.js";

// Keep in step with src/vegetation.js.
const GRASS_RADIUS = 330;
const GRASS_CHUNK = 1200;
const RINGS = [
  { cell: 0.62, outer: 34 },
  { cell: 1.05, outer: 82 },
  { cell: 1.9, outer: 168 },
  { cell: 3.4, outer: GRASS_RADIUS }
];
const BUDGET_MS = 6;

const GRASSINESS = {
  lake: 0.45, ranch: 0.9, town: 0.3, pines: 0.92, burn: 0.04, range: 0.85,
  iron: 0.25, badlands: 0.04, tribal: 0.75, foothills: 0.82, valley: 0.92
};
// Density is what actually gates placement now; keep in step with vegetation.js.
const GRASS_DENSITY = {
  valley: 0.92, ranch: 0.88, pines: 0.78, foothills: 0.68, tribal: 0.5,
  range: 0.42, lake: 0.35, town: 0.28, iron: 0.14, burn: 0.05, badlands: 0.04
};

function hash2(i, j, salt) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function grassSample(x, z) {
  const road = roadFactor(x, z);
  if (road > 0.3) return 0;
  const creek = creekFactor(x, z);
  if (creek > 0.35) return 0;
  const lake = lakeFactor(x, z);
  const inRanch = Math.hypot(x - POS.ranch.x, z - POS.ranch.z) < 95;
  if (!inRanch) {
    if (lake > 0.35) return 0;
    if (Math.hypot(x - POS.silverCreek.x, z - POS.silverCreek.z) < 80) return 0;
  }
  if (Math.hypot(x - POS.ranch.x, z - (POS.ranch.z - 8)) < 14) return 0;
  if (Math.hypot(x - (POS.ranch.x - 28), z - (POS.ranch.z + 18)) < 10) return 0;
  const biome = biomeAt(x, z);
  const base = GRASSINESS[biome] ?? 0;
  if (base <= 0) return 0;
  const slope = 1 - normalAt(x, z).y;
  return base * (1 - ramp(0.18, 0.5, slope)) * (1 - creek * 0.8) * (1 - road) * (1 - lake * 0.5);
}

/** The density gate, as plantBlade applies it. */
function placed(x, z, ix, jz) {
  const w = grassSample(x, z);
  if (w <= 0) return false;
  const density = (GRASS_DENSITY[biomeAt(x, z)] ?? 0) * (0.55 + w * 0.5);
  return hash2(ix, jz, 21) <= density;
}

bakeHeightfield();

const cx = POS.ranch.x;
const cz = POS.ranch.z;
const pts = [];
const cells = [];
let inner = 0;
for (const { cell, outer } of RINGS) {
  const span = Math.ceil(outer / cell);
  const innerSq = inner * inner;
  const outerSq = outer * outer;
  const bi = Math.floor(cx / cell);
  const bj = Math.floor(cz / cell);
  for (let i = -span; i <= span; i += 1) {
    for (let j = -span; j <= span; j += 1) {
      const dx = (i + 0.5) * cell;
      const dz = (j + 0.5) * cell;
      const dsq = dx * dx + dz * dz;
      if (dsq < innerSq || dsq >= outerSq) continue;
      const ix = bi + i;
      const jz = bj + j;
      pts.push([
        (ix + 0.5 + (hash2(ix, jz, 1) - 0.5) * 0.9) * cell,
        (jz + 0.5 + (hash2(ix, jz, 2) - 0.5) * 0.9) * cell
      ]);
      cells.push([ix, jz]);
    }
  }
  inner = outer;
}

// Warm the JIT so the timed pass measures steady state, not compilation.
for (let i = 0; i < 5000; i += 1) {
  const [x, z] = pts[i % pts.length];
  grassSample(x, z);
}

const t0 = performance.now();
let kept = 0;
for (let i = 0; i < pts.length; i += 1) {
  const [x, z] = pts[i];
  if (placed(x, z, cells[i][0], cells[i][1])) {
    heightAt(x, z);
    kept += 1;
  }
}
const ms = performance.now() - t0;
const perChunk = (ms / pts.length) * GRASS_CHUNK;
const frames = Math.ceil(pts.length / GRASS_CHUNK);

console.log(
  `grass scatter ${ms.toFixed(1)} ms · kept ${kept}/${pts.length} · r${GRASS_RADIUS}m · ` +
  `~${perChunk.toFixed(2)} ms / ${GRASS_CHUNK}-candidate chunk over ${frames} frames`
);

if (perChunk > BUDGET_MS) {
  console.error(`FAIL chunk ${perChunk.toFixed(2)} ms exceeds ${BUDGET_MS} ms budget`);
  process.exit(2);
}
console.log("PASS");
