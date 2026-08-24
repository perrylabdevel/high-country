import { WORLD, WATER, worldToMap, lakeFactor, roadFactor, creekFactor, POS, smoothstep } from "./map.js";

export { WORLD };

const COLS = WORLD.segmentsX + 1;
const ROWS = WORLD.segmentsZ + 1;
const SPACING_X = WORLD.width / WORLD.segmentsX;
const SPACING_Z = WORLD.depth / WORLD.segmentsZ;
const HALF_X = WORLD.width / 2;
const HALF_Z = WORLD.depth / 2;
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

export function heightAt(x, z) {
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
  return h00 * (1 - tx) * (1 - tz) + h10 * tx * (1 - tz) + h01 * (1 - tx) * tz + h11 * tx * tz;
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
