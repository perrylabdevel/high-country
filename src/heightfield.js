import { WORLD, WATER, worldToMap, lakeFactor, roadFactor, creekFactor, POS, smoothstep, ROADS, polylineCache, lakeCoords } from "./map.js";

export { WORLD };

const COLS = WORLD.segmentsX + 1;
const ROWS = WORLD.segmentsZ + 1;
const SPACING_X = WORLD.width / WORLD.segmentsX;
const SPACING_Z = WORLD.depth / WORLD.segmentsZ;
const HALF_X = WORLD.width / 2;
const HALF_Z = WORLD.depth / 2;
const ROAD_RUT_OFFSET = 0.9;
const ROAD_CARVE = 0.85;
const ROAD_RUT_DEPTH = 0.11;
const ROAD_RUT_WIDTH = 0.34;
export const ROAD_SUBDIVISIONS = 25;
const refinedCache = new Uint8Array(WORLD.segmentsX * WORLD.segmentsZ);
let refinedCached = false;
const roadBounds = ROADS.filter((r) => r.kind !== "rail").map((r) => {
  const pts = r.pts.map(([u, v]) => ({ x: (u - 0.5) * WORLD.width, z: (0.5 - v) * WORLD.depth }));
  return { r, minX: Math.min(...pts.map((p) => p.x)), maxX: Math.max(...pts.map((p) => p.x)), minZ: Math.min(...pts.map((p) => p.z)), maxZ: Math.max(...pts.map((p) => p.z)) };
});
// Cache world-space segments once. Road queries are hot during navigation
// graph construction, so repeatedly walking every source polyline is costly.
const roadSegments = [];
for (const b of roadBounds) {
  const pts = b.r.pts;
  for (let i = 1; i < pts.length; i += 1) {
    const ax = (pts[i - 1][0] - 0.5) * WORLD.width;
    const az = (0.5 - pts[i - 1][1]) * WORLD.depth;
    const bx = (pts[i][0] - 0.5) * WORLD.width;
    const bz = (0.5 - pts[i][1]) * WORLD.depth;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz;
    roadSegments.push({ r: b.r, ax, az, dx, dz, len2, invLen2: len2 >= 1e-8 ? 1 / len2 : 0,
      invLen: len2 >= 1e-8 ? 1 / Math.sqrt(len2) : 1, rutWidth2: ((b.r.width || 6) * 1.15) ** 2,
      minX: Math.min(ax, bx), maxX: Math.max(ax, bx),
      minZ: Math.min(az, bz), maxZ: Math.max(az, bz) });
  }
}
const segmentCache = new Map();
const fineCellCache = new Map();
const ROAD_BIN_PAD = 10;

function cellIndex(x, z) {
  return {
    ix: Math.max(0, Math.min(WORLD.segmentsX - 1, Math.floor((x + HALF_X) / SPACING_X))),
    iz: Math.max(0, Math.min(WORLD.segmentsZ - 1, Math.floor((z + HALF_Z) / SPACING_Z)))
  };
}

function segmentsAt(x, z) {
  const { ix, iz } = cellIndex(x, z);
  const key = iz * WORLD.segmentsX + ix;
  let out = segmentCache.get(key);
  if (out) return out;
  const x0 = gridX(ix) - ROAD_BIN_PAD, x1 = gridX(ix) + SPACING_X + ROAD_BIN_PAD;
  const z0 = gridZ(iz) - ROAD_BIN_PAD, z1 = gridZ(iz) + SPACING_Z + ROAD_BIN_PAD;
  out = roadSegments.filter((s) => s.maxX >= x0 && s.minX <= x1 && s.maxZ >= z0 && s.minZ <= z1);
  segmentCache.set(key, out);
  return out;
}

const slabOut = [0, 0];

/** Clip [t0, t1] of p + d*t to [lo, hi]; null when empty. Reuses one array. */
function slab(p, d, lo, hi, t0, t1) {
  if (Math.abs(d) < 1e-8) {
    if (p < lo || p > hi) return null;
  } else {
    const a = (lo - p) / d, b = (hi - p) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
    if (t0 > t1) return null;
  }
  slabOut[0] = t0;
  slabOut[1] = t1;
  return slabOut;
}

function buildRefinedCache() {
  if (refinedCached) return;
  const pad = 6;
  for (const s of roadSegments) {
    const ix0 = Math.max(0, Math.floor((s.minX - pad + HALF_X) / SPACING_X));
    const ix1 = Math.min(WORLD.segmentsX - 1, Math.floor((s.maxX + pad + HALF_X) / SPACING_X));
    const iz0 = Math.max(0, Math.floor((s.minZ - pad + HALF_Z) / SPACING_Z));
    const iz1 = Math.min(WORLD.segmentsZ - 1, Math.floor((s.maxZ + pad + HALF_Z) / SPACING_Z));
    for (let iz = iz0; iz <= iz1; iz += 1) {
      for (let ix = ix0; ix <= ix1; ix += 1) {
        const x0 = gridX(ix) - pad, x1 = gridX(ix) + SPACING_X + pad;
        const z0 = gridZ(iz) - pad, z1 = gridZ(iz) + SPACING_Z + pad;
        // Slab test of the segment against the padded cell, one axis at a time
        // (no per-test arrays: this runs for every cell each segment spans).
        const tx = slab(s.ax, s.dx, x0, x1, 0, 1);
        if (tx === null) continue;
        if (slab(s.az, s.dz, z0, z1, tx[0], tx[1]) !== null) refinedCache[iz * WORLD.segmentsX + ix] = 1;
      }
    }
  }
  refinedCached = true;
}

const heights = new Float32Array(COLS * ROWS);
// Road-carve depth at each coarse vertex, filled on demand; only the corners
// of road-refined cells need it. See refinedBaseHeight().
const carves = new Float32Array(COLS * ROWS).fill(NaN);
let baked = false;

function hash2(ix, iy) {
  const n = Math.sin(ix * 127.1 + iy * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function valueNoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2(ix, iy);
  const n10 = hash2(ix + 1, iy);
  const n01 = hash2(ix, iy + 1);
  const n11 = hash2(ix + 1, iy + 1);
  return n00 * (1 - sx) * (1 - sy) + n10 * sx * (1 - sy) + n01 * (1 - sx) * sy + n11 * sx * sy;
}

function fbm(x, y) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < 5; i += 1) {
    v += a * valueNoise(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return v;
}

export function sourceHeightAt(x, z, withRoad = true) {
  const { u, v } = worldToMap(x, z);
  // Sample the noise north-ward rather than along raw +Z, so the hills are a function
  // of where you are on the map and not of which way the Z axis happens to point.
  const nz = -z;
  const hills = (fbm(x * 0.003, nz * 0.003) - 0.5) * 14;
  const detail = (fbm(x * 0.011, nz * 0.011) - 0.5) * 2.8;
  let h = 18 + hills + detail;

  const west = smoothstep(0.28, 0.07, u) * (0.45 + smoothstep(0.22, 0.4, v) * smoothstep(0.82, 0.62, v));
  h += west * (52 + 22 * fbm(x * 0.0022, nz * 0.0022));

  const east = smoothstep(0.7, 0.9, u) * smoothstep(0.18, 0.32, v);
  h += east * (46 + 18 * fbm(x * 0.0024, nz * 0.0024));

  const ironTrough = Math.exp(-(((u - 0.83) / 0.055) ** 2)) * smoothstep(0.34, 0.46, v) * smoothstep(0.86, 0.72, v);
  h -= ironTrough * 20;

  const north = smoothstep(0.72, 0.88, v);
  h += north * (16 + 10 * fbm(x * 0.0036, nz * 0.0036));

  const south = smoothstep(0.22, 0.07, v);
  const mesa = Math.floor(fbm(x * 0.007, nz * 0.007) * 6) / 6;
  h += south * (6 + mesa * 20);

  // Badlands buttes: steep mesa rims near the POI that expose the strata
  // banding on their faces. The gentle southern mesas never showed a rock
  // face (audit D1/D2). Kept west of the mission (u < 0.5) so the mission
  // site stays flat.
  const badland = smoothstep(0.44, 0.38, u) * smoothstep(0.5, 0.46, u) * smoothstep(0.22, 0.12, v);
  const butteNoise = fbm(x * 0.005 + 17, nz * 0.005 + 11);
  const buttePlate = Math.floor(butteNoise * 4) / 4;
  const butteRim = smoothstep(0.64, 0.76, butteNoise - Math.floor(butteNoise));
  h += badland * (10 + buttePlate * 40 + butteRim * 16);

  const foot = smoothstep(0.54, 0.64, u) * smoothstep(0.26, 0.36, v) * smoothstep(0.52, 0.4, v);
  h += foot * 9;

  const lake = lakeFactor(x, z);
  h = h * (1 - lake) + (WATER - 0.2) * lake;

  // A creek's carve bottoms out at the water table. The carve used to run at
  // full 3.4 m depth to the end of every polyline, so each mouth arrived at
  // the shoreline as a 2.5-3 m walled gorge (measured: bed 10.2 at (0,-460)
  // with banks at 13-14, against a 12.8 basin) — a dark slot meeting a bright
  // shallow, the "two substances" break at Lake Mercy's mouths. Clamping the
  // carve to h - (WATER - 0.2) lets the channel silt down to the basin floor
  // as the ground approaches the water: inland terrain at 16+ keeps the full
  // carve (16 - 12.8 > 3.4), low ground keeps a shallow creek instead of a
  // dry gorge floor below the water table, and inside the lake the clamp is
  // zero, so the drowned channel bed is the basin floor itself.
  h -= creekFactor(x, z) * Math.min(3.4, Math.max(0, h - (WATER - 0.2)));
  if (withRoad) h -= roadFactor(x, z) * ROAD_CARVE;

  // Settlement pads win last so creek/road carves cannot drown the yard or main street.
  const ranchD = Math.hypot(x - POS.ranch.x, z - POS.ranch.z);
  if (ranchD < 110) {
    h = 16.2;
  } else if (ranchD < 175) {
    const t = (ranchD - 110) / 65;
    h = 16.2 * (1 - t) + h * t;
  }

  const townD = Math.hypot(x - POS.silverCreek.x, z - POS.silverCreek.z);
  if (townD < 85) {
    const t = 1 - townD / 85;
    h = h * (1 - t) + 15.5 * t;
  }

  // Fort pad: the walls sat on a ~3 m slope, so the far corners floated and
  // the walls cast detached shadows (audit U4 at fortGrant). Flatten the
  // enclosure area to the lowest corner height — 94.8 m at the fort's site
  // off the stage road (map.js), measured from the unpadded terrain.
  const fortD = Math.hypot(x - POS.fortGrant.x, z - POS.fortGrant.z);
  if (fortD < 50) {
    const t = Math.max(0, 1 - fortD / 50);
    h = h * (1 - t) + 94.8 * t;
  }

  if (lake > 0.92) {
    h = WATER - 0.2;
  }
  return h;
}

/**
 * How deep sourceHeightAt() carves the road bed at (x, z), after the
 * settlement pads and lake floor that are applied on top of it.
 *
 * sourceHeightAt subtracts roadFactor * ROAD_CARVE and then blends that height
 * toward the ranch/town/fort pads (and replaces it inside the lake), so the
 * carve that survives is the raw carve times each blend's weight on h. This
 * mirrors those blends term for term; check:roads asserts it against
 * sourceHeightAt(x, z) - sourceHeightAt(x, z, false).
 */
export function roadCarveAt(x, z, list = null, near = NEAR_ALL) {
  if (!list) {
    const { ix, iz } = cellIndex(x, z);
    list = carveSegmentsIn(ix, iz);
  }
  const road = roadFactorNear(x, z, list);
  if (road === 0) return 0;
  let gain = 1;
  if (near & NEAR_RANCH) {
    const ranchD = Math.hypot(x - POS.ranch.x, z - POS.ranch.z);
    if (ranchD < 110) return 0;
    if (ranchD < 175) gain *= (ranchD - 110) / 65;
  }
  if (near & NEAR_TOWN) {
    const townD = Math.hypot(x - POS.silverCreek.x, z - POS.silverCreek.z);
    if (townD < 85) gain *= townD / 85;
  }
  if (near & NEAR_FORT) {
    const fortD = Math.hypot(x - POS.fortGrant.x, z - POS.fortGrant.z);
    if (fortD < 50) gain *= fortD / 50;
  }
  // lakeFactor > 0.92 needs d inside the rim (whose radius multiplier stays
  // under 1.2); the cheap distance test skips the harmonic shoreline.
  if (near & NEAR_LAKE && gain > 0 && lakeCoords(x, z).d < 1.4 && lakeFactor(x, z) > 0.92) return 0;
  return road * ROAD_CARVE * gain;
}

// Which of roadCarveAt's blends can reach a cell; see refinedCellContext.
const NEAR_RANCH = 1, NEAR_TOWN = 2, NEAR_FORT = 4, NEAR_LAKE = 8, NEAR_ALL = 15;

// roadFactor() walks every road polyline, which is too slow for the ~2.2 M
// fine terrain vertices. Same Gaussian per segment, binned by coarse cell and
// dropped beyond 3 falloffs, where it is under exp(-9) (0.1 mm of carve).
const carveSegments = [];
for (const road of ROADS) {
  const falloff = (road.width || 6) * 1.15;
  const { segs } = polylineCache(road.pts);
  for (let s = 0; s < segs.length; s += 4) {
    const ax = segs[s], az = segs[s + 1], dx = segs[s + 2] - ax, dz = segs[s + 3] - az;
    const len2 = dx * dx + dz * dz;
    const reach = falloff * 3;
    carveSegments.push({ ax, az, dx, dz, invLen2: len2 < 1e-8 ? 0 : 1 / len2, invFalloff2: 1 / (falloff * falloff),
      minX: Math.min(ax, ax + dx) - reach, maxX: Math.max(ax, ax + dx) + reach,
      minZ: Math.min(az, az + dz) - reach, maxZ: Math.max(az, az + dz) + reach });
  }
}
const carveCellCache = new Map();

function carveSegmentsIn(ix, iz) {
  const key = iz * WORLD.segmentsX + ix;
  let list = carveCellCache.get(key);
  if (!list) {
    const x0 = gridX(ix), x1 = x0 + SPACING_X, z0 = gridZ(iz), z1 = z0 + SPACING_Z;
    list = [];
    for (const s of carveSegments) if (s.maxX >= x0 && s.minX <= x1 && s.maxZ >= z0 && s.minZ <= z1) list.push(s);
    carveCellCache.set(key, list);
  }
  return list;
}

function roadFactorNear(x, z, list) {
  let w = 0;
  for (const s of list) {
    const t = Math.max(0, Math.min(1, ((x - s.ax) * s.dx + (z - s.az) * s.dz) * s.invLen2));
    const px = x - s.ax - s.dx * t, pz = z - s.az - s.dz * t;
    const g = Math.exp(-(px * px + pz * pz) * s.invFalloff2);
    if (g > w) w = g;
  }
  return w;
}

function gridX(ix) {
  return -HALF_X + ix * SPACING_X;
}

function gridZ(iz) {
  return -HALF_Z + iz * SPACING_Z;
}

export function bakeHeightfield() {
  if (baked) {
    return;
  }
  for (let iz = 0; iz < ROWS; iz += 1) {
    const z = gridZ(iz);
    for (let ix = 0; ix < COLS; ix += 1) {
      heights[iz * COLS + ix] = sourceHeightAt(gridX(ix), z);
    }
  }
  baked = true;
}

function vertexHeight(ix, iz) {
  const x = Math.max(0, Math.min(WORLD.segmentsX, ix));
  const z = Math.max(0, Math.min(WORLD.segmentsZ, iz));
  return heights[z * COLS + x];
}

/**
 * The height of the terrain as it is actually DRAWN.
 *
 * heightAt() is bilinear over the 12.5 m grid. The terrain mesh is that same
 * grid triangulated, and a bilinear patch over a twisted quad is not planar —
 * so inside every cell the smooth surface and the drawn triangles disagree.
 * Seating anything on heightAt() therefore floats it wherever the bilinear
 * surface runs above the triangle: measured by raycasting the real mesh,
 * 9.5% of the map by more than 2 cm, p99 9.5 cm, worst 76 cm. That is the
 * "floating grass" — the tufts were seated perfectly on a surface nobody
 * draws, which is also why every heightAt-based check passed.
 *
 * three's PlaneGeometry splits each cell on the anti-diagonal: with
 * a=(ix,iz) b=(ix,iz+1) c=(ix+1,iz+1) d=(ix+1,iz) it emits (a,b,d) and
 * (b,c,d), so the shared edge is b-d and the split is tx + tz = 1.
 *
 * Use this for anything that must sit ON the ground. heightAt() stays the
 * right call for smooth queries — camera, physics, slope — where the
 * discontinuity of a triangulated surface would be worse than the gap.
 */
export function baseMeshHeightAt(x, z) {
  bakeHeightfield();
  const fx = (x + HALF_X) / SPACING_X;
  const fz = (z + HALF_Z) / SPACING_Z;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  const tx = Math.max(0, Math.min(1, fx - ix));
  const tz = Math.max(0, Math.min(1, fz - iz));
  const h00 = vertexHeight(ix, iz);
  const h10 = vertexHeight(ix + 1, iz);
  const h01 = vertexHeight(ix, iz + 1);
  const h11 = vertexHeight(ix + 1, iz + 1);
  let h;
  if (tx + tz <= 1) {
    h = h00 + tx * (h10 - h00) + tz * (h01 - h00);
  } else {
    h = h11 + (1 - tx) * (h01 - h11) + (1 - tz) * (h10 - h11);
  }
  return h;
}

export function meshHeightAt(x, z) {
  const fx = (x + HALF_X) / SPACING_X;
  const fz = (z + HALF_Z) / SPACING_Z;
  const ix = Math.max(0, Math.min(WORLD.segmentsX - 1, Math.floor(fx)));
  const iz = Math.max(0, Math.min(WORLD.segmentsZ - 1, Math.floor(fz)));
  if (!roadRefinedCell(ix, iz)) return baseMeshHeightAt(x, z);
  const tx = Math.max(0, Math.min(1, fx - ix)) * ROAD_SUBDIVISIONS;
  const tz = Math.max(0, Math.min(1, fz - iz)) * ROAD_SUBDIVISIONS;
  const i = Math.min(ROAD_SUBDIVISIONS - 1, Math.floor(tx));
  const j = Math.min(ROAD_SUBDIVISIONS - 1, Math.floor(tz));
  const gx = ix * ROAD_SUBDIVISIONS + i;
  const gz = iz * ROAD_SUBDIVISIONS + j;
  const ax = gridX(ix) + i * SPACING_X / ROAD_SUBDIVISIONS;
  const az = gridZ(iz) + j * SPACING_Z / ROAD_SUBDIVISIONS;
  const dx = tx - i;
  const dz = tz - j;
  const stepX = SPACING_X / ROAD_SUBDIVISIONS;
  const stepZ = SPACING_Z / ROAD_SUBDIVISIONS;
  const cellKey = iz * WORLD.segmentsX + ix;
  let cell = fineCellCache.get(cellKey);
  if (!cell) {
    cell = new Float64Array((ROAD_SUBDIVISIONS + 1) * (ROAD_SUBDIVISIONS + 1));
    cell.fill(NaN);
    fineCellCache.set(cellKey, cell);
  }
  let cellSegments = null;
  let context = null;
  const h = (cx, cz, px, pz) => {
    const localX = cx - ix * ROAD_SUBDIVISIONS;
    const localZ = cz - iz * ROAD_SUBDIVISIONS;
    const index = localZ * (ROAD_SUBDIVISIONS + 1) + localX;
    let value = cell[index];
    if (Number.isNaN(value)) {
      if (!cellSegments) cellSegments = segmentsAt(gridX(ix) + SPACING_X * 0.5, gridZ(iz) + SPACING_Z * 0.5);
      if (!context) context = refinedCellContext(ix, iz);
      value = refinedBaseHeight(context, px, pz) + roadRutHeight(px, pz, cellSegments);
      cell[index] = value;
    }
    return value;
  };
  const h00 = h(gx, gz, ax, az), h10 = h(gx + 1, gz, ax + stepX, az);
  const h01 = h(gx, gz + 1, ax, az + stepZ), h11 = h(gx + 1, gz + 1, ax + stepX, az + stepZ);
  return dx + dz <= 1 ? h00 + dx * (h10 - h00) + dz * (h01 - h00) : h11 + (1 - dx) * (h01 - h11) + (1 - dz) * (h10 - h11);
}

/**
 * Ground height at a fine vertex of a road-refined cell.
 *
 * The 0.85 m road carve is a ~7 m Gaussian, but the baked grid samples it only
 * every 12.5 m. Refined cells used to place their 0.5 m vertices on the coarse
 * cell's two triangles, so the fine mesh faithfully reproduced that aliased
 * carve: planar 12.5 m facets up to 0.81 m off the real ground, and because
 * the fine vertices sit on a plane their normals are that plane's — flat-lit
 * triangular wedges down both sides of every road (HARD_WON 2.12).
 *
 * Inside the corridor the carve is evaluated at the vertex itself, over a
 * bilinear base with the coarse carve taken back out. Along an edge shared
 * with an unrefined cell that correction fades to zero, leaving the straight
 * coarse edge the neighbour draws — otherwise the T-junction would crack.
 */
function refinedBaseHeight(c, x, z) {
  const tx = Math.max(0, Math.min(1, (x - c.x0) / SPACING_X));
  const tz = Math.max(0, Math.min(1, (z - c.z0) / SPACING_Z));
  const w00 = (1 - tx) * (1 - tz), w10 = tx * (1 - tz), w01 = (1 - tx) * tz, w11 = tx * tz;
  const h = c.h00 * w00 + c.h10 * w10 + c.h01 * w01 + c.h11 * w11;
  // Distance (in cells) to every unrefined neighbour, diagonals included, so a
  // vertex on an edge between two refined cells gets the same mask from both.
  let mask = 1;
  for (let k = 0, open = c.open; k < open.length && mask > 0; k += 2) {
    const dx = c.open[k], dz = c.open[k + 1];
    const ex = dx < 0 ? tx : dx > 0 ? 1 - tx : 0;
    const ez = dz < 0 ? tz : dz > 0 ? 1 - tz : 0;
    const e2 = ex * ex + ez * ez;
    if (e2 >= REFINED_EDGE_FADE * REFINED_EDGE_FADE) continue;
    const t = Math.sqrt(e2) / REFINED_EDGE_FADE;
    mask *= t * t * (3 - 2 * t);
  }
  if (mask === 0) return h;
  const coarseCarve = c.c00 * w00 + c.c10 * w10 + c.c01 * w01 + c.c11 * w11;
  const carve = roadCarveAt(x, z, c.segments, c.near);
  return h + mask * (coarseCarve - carve);
}

const refinedContextCache = new Map();

/** Per-cell constants for refinedBaseHeight: corners, open neighbours, pads. */
function refinedCellContext(ix, iz) {
  const key = iz * WORLD.segmentsX + ix;
  let c = refinedContextCache.get(key);
  if (c) return c;
  bakeHeightfield();
  const x0 = gridX(ix), z0 = gridZ(iz);
  buildRefinedCache();
  const open = [];
  for (let dz = -1; dz <= 1; dz += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if ((dx !== 0 || dz !== 0) && !refinedNeighbour(ix + dx, iz + dz)) open.push(dx, dz);
    }
  }
  // Only the pad blends (and lake floor) that can reach this cell are tested
  // per vertex; a cell clear of all of them carves at full depth.
  const cx = x0 + SPACING_X / 2, cz = z0 + SPACING_Z / 2;
  const reach = Math.hypot(SPACING_X, SPACING_Z) / 2;
  const near =
    (Math.hypot(cx - POS.ranch.x, cz - POS.ranch.z) <= 175 + reach ? NEAR_RANCH : 0) |
    (Math.hypot(cx - POS.silverCreek.x, cz - POS.silverCreek.z) <= 85 + reach ? NEAR_TOWN : 0) |
    (Math.hypot(cx - POS.fortGrant.x, cz - POS.fortGrant.z) <= 50 + reach ? NEAR_FORT : 0) |
    (lakeCoords(cx, cz).d <= 1.6 ? NEAR_LAKE : 0);
  const segments = carveSegmentsIn(ix, iz);
  c = {
    x0, z0, open, near, segments,
    h00: vertexHeight(ix, iz), h10: vertexHeight(ix + 1, iz), h01: vertexHeight(ix, iz + 1), h11: vertexHeight(ix + 1, iz + 1),
    c00: 0, c10: 0, c01: 0, c11: 0
  };
  // The cell's segment list covers its own corners, so the corner carves reuse
  // it rather than re-binning neighbouring cells.
  c.c00 = cornerCarve(ix, iz, c);
  c.c10 = cornerCarve(ix + 1, iz, c);
  c.c01 = cornerCarve(ix, iz + 1, c);
  c.c11 = cornerCarve(ix + 1, iz + 1, c);
  refinedContextCache.set(key, c);
  return c;
}

function cornerCarve(vx, vz, c) {
  const i = vz * COLS + vx;
  let value = carves[i];
  if (Number.isNaN(value)) {
    const x = gridX(vx), z = gridZ(vz);
    value = roadCarveAt(x, z, c.segments, c.near);
    carves[i] = value;
  }
  return value;
}

// Fraction of a cell over which the carve correction fades out toward an
// unrefined neighbour.
const REFINED_EDGE_FADE = 0.35;

function refinedNeighbour(ix, iz) {
  if (ix < 0 || iz < 0 || ix >= WORLD.segmentsX || iz >= WORLD.segmentsZ) return false;
  return refinedCache[iz * WORLD.segmentsX + ix] === 1;
}

/** Geometric wheel-track depression shared by terrain creation and grounding. */
export function roadRutHeight(x, z, segmentList = null) {
  let best2 = Infinity;
  let lat = 0;
  let road = 0;
  let townRoad = false;
  for (const s of (segmentList || segmentsAt(x, z))) {
    let t = ((x - s.ax) * s.dx + (z - s.az) * s.dz) * s.invLen2;
    t = Math.max(0, Math.min(1, t));
    const qx = s.ax + s.dx * t;
    const qz = s.az + s.dz * t;
    const ddx = x - qx;
    const ddz = z - qz;
    const d2 = ddx * ddx + ddz * ddz;
    if (d2 < best2) {
      best2 = d2;
      lat = (ddx * s.dz - ddz * s.dx) * s.invLen;
      road = Math.exp(-(d2 / s.rutWidth2));
      townRoad = s.r.name === "townMain";
    }
  }
  if (road < 0.08 || !Number.isFinite(best2)) return 0;
  const d = Math.abs(lat) - ROAD_RUT_OFFSET;
  const groove = Math.exp(-(d * d) / (2 * ROAD_RUT_WIDTH * ROAD_RUT_WIDTH));
  const depth = townRoad ? 0.28 : ROAD_RUT_DEPTH;
  const out = -depth * groove * Math.min(1, road);
  return out;
}

export function roadRefinedCell(ix, iz) {
  buildRefinedCache();
  const key = iz * WORLD.segmentsX + ix;
  return refinedCache[key] === 1;
}

export function heightAt(x, z) {
  bakeHeightfield();
  const fx = (x + HALF_X) / SPACING_X;
  const fz = (z + HALF_Z) / SPACING_Z;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  if (roadRefinedCell(ix, iz)) {
    return meshHeightAt(x, z);
  }
  const tx = Math.max(0, Math.min(1, fx - ix));
  const tz = Math.max(0, Math.min(1, fz - iz));
  const h00 = vertexHeight(ix, iz);
  const h10 = vertexHeight(ix + 1, iz);
  const h01 = vertexHeight(ix, iz + 1);
  const h11 = vertexHeight(ix + 1, iz + 1);
  const h = h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz;
  return h;
}

export function normalAt(x, z) {
  const e = 1.8;
  const hL = heightAt(x - e, z);
  const hR = heightAt(x + e, z);
  const hD = heightAt(x, z - e);
  const hU = heightAt(x, z + e);
  const nx = hL - hR;
  const ny = 2 * e;
  const nz = hD - hU;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / len, y: ny / len, z: nz / len };
}
