import { WORLD, WATER, worldToMap, lakeFactor, roadFactor, creekFactor, POS, smoothstep, ROADS } from "./map.js";

export { WORLD };

const COLS = WORLD.segmentsX + 1;
const ROWS = WORLD.segmentsZ + 1;
const SPACING_X = WORLD.width / WORLD.segmentsX;
const SPACING_Z = WORLD.depth / WORLD.segmentsZ;
const HALF_X = WORLD.width / 2;
const HALF_Z = WORLD.depth / 2;
const ROAD_RUT_OFFSET = 0.9;
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
        let t0 = 0, t1 = 1;
        for (const [p, d, lo, hi] of [[s.ax, s.dx, x0, x1], [s.az, s.dz, z0, z1]]) {
          if (Math.abs(d) < 1e-8) {
            if (p < lo || p > hi) { t0 = 1; t1 = 0; break; }
          } else {
            const a = (lo - p) / d, b = (hi - p) / d;
            const enter = Math.min(a, b), exit = Math.max(a, b);
            t0 = Math.max(t0, enter); t1 = Math.min(t1, exit);
            if (t0 > t1) break;
          }
        }
        if (t0 <= t1) refinedCache[iz * WORLD.segmentsX + ix] = 1;
      }
    }
  }
  refinedCached = true;
}

const heights = new Float32Array(COLS * ROWS);
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

export function sourceHeightAt(x, z) {
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

  h -= creekFactor(x, z) * 3.4;
  h -= roadFactor(x, z) * 0.85;

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
  // enclosure area to the lowest corner height.
  const fortD = Math.hypot(x - POS.fortGrant.x, z - POS.fortGrant.z);
  if (fortD < 50) {
    const t = Math.max(0, 1 - fortD / 50);
    h = h * (1 - t) + 94 * t;
  }

  if (lake > 0.92) {
    h = WATER - 0.2;
  }
  return h;
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
  const h = (cx, cz, px, pz) => {
    const localX = cx - ix * ROAD_SUBDIVISIONS;
    const localZ = cz - iz * ROAD_SUBDIVISIONS;
    const index = localZ * (ROAD_SUBDIVISIONS + 1) + localX;
    let value = cell[index];
    if (Number.isNaN(value)) {
      if (!cellSegments) cellSegments = segmentsAt(gridX(ix) + SPACING_X * 0.5, gridZ(iz) + SPACING_Z * 0.5);
      value = baseMeshHeightAt(px, pz) + roadRutHeight(px, pz, cellSegments);
      cell[index] = value;
    }
    return value;
  };
  const h00 = h(gx, gz, ax, az), h10 = h(gx + 1, gz, ax + stepX, az);
  const h01 = h(gx, gz + 1, ax, az + stepZ), h11 = h(gx + 1, gz + 1, ax + stepX, az + stepZ);
  return dx + dz <= 1 ? h00 + dx * (h10 - h00) + dz * (h01 - h00) : h11 + (1 - dx) * (h01 - h11) + (1 - dz) * (h10 - h11);
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
