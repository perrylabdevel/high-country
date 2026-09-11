import { POS, WATER, lakeShoreRadius, LAKE_NOMINAL_RX, LAKE_NOMINAL_RZ } from "./map.js";
import { meshHeightAt } from "./heightfield.js";

export const LAKE_WATER_RIM_SEGMENTS = 1024;

let finalRadii = null;

function lakeWaterRimRadii() {
  if (finalRadii) return finalRadii;
  // Trace the actual terrain intersection, then retreat slightly into the
  // shallows. This gives the water its own feathered boundary before the
  // coarse terrain triangles can clip it into a hard sawtooth.
  const radii = [];
  for (let i = 0; i < LAKE_WATER_RIM_SEGMENTS; i += 1) {
    const a = i / LAKE_WATER_RIM_SEGMENTS * Math.PI * 2;
    const x = Math.cos(a) * LAKE_NOMINAL_RX;
    const z = -Math.sin(a) * LAKE_NOMINAL_RZ;
    let lo = 0;
    let hi = lakeShoreRadius(-a) * 1.2;
    for (let j = 0; j < 16; j += 1) {
      const mid = (lo + hi) / 2;
      if (meshHeightAt(POS.lakeMercy.x + x * mid, POS.lakeMercy.z + z * mid) < WATER) lo = mid;
      else hi = mid;
    }
    radii.push(lo);
  }
  // Smooth an inward envelope, not min(raw, average): that min operation
  // retained every convex terrain-grid corner. Eroding first keeps the
  // filtered curve submerged without reintroducing the raw polygon edges.
  const radiusAt = i => radii[(i + LAKE_WATER_RIM_SEGMENTS) % LAKE_WATER_RIM_SEGMENTS];
  const inset = radii.map((_, i) => {
    let r = Infinity;
    for (let j = -16; j <= 16; j += 1) r = Math.min(r, radiusAt(i + j));
    return r;
  });
  const smoothRadii = inset.map((_, i) => {
    let sum = 0, weights = 0;
    for (let j = -16; j <= 16; j += 1) {
      const weight = 17 - Math.abs(j);
      sum += inset[(i + j + LAKE_WATER_RIM_SEGMENTS) % LAKE_WATER_RIM_SEGMENTS] * weight;
      weights += weight;
    }
    return sum / weights;
  });
  finalRadii = smoothRadii.map((radius, i) => {
    const a = i / LAKE_WATER_RIM_SEGMENTS * Math.PI * 2;
    const retreat = 3.5 + 2 * Math.sin(a * 17 + 0.7)
      + 0.9 * Math.sin(a * 41 - 1.2) + 0.5 * Math.sin(a * 83);
    return radius - retreat / LAKE_NOMINAL_RX;
  });
  return finalRadii;
}

export function lakeWaterRimRadius(angle) {
  const radii = lakeWaterRimRadii();
  const normalized = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const sample = normalized / (Math.PI * 2) * LAKE_WATER_RIM_SEGMENTS;
  const i = Math.floor(sample);
  const t = sample - i;
  return radii[i] * (1 - t) + radii[(i + 1) % LAKE_WATER_RIM_SEGMENTS] * t;
}

export function lakeWaterSignedDistance(x, z) {
  const dx = (x - POS.lakeMercy.x) / LAKE_NOMINAL_RX;
  const dz = (z - POS.lakeMercy.z) / LAKE_NOMINAL_RZ;
  const angle = Math.atan2(-dz, dx);
  const radial = Math.hypot(dx, dz);
  const rim = lakeWaterRimRadius(angle);
  return (radial - rim)
    * Math.hypot(Math.cos(angle) * LAKE_NOMINAL_RX, Math.sin(angle) * LAKE_NOMINAL_RZ);
}
