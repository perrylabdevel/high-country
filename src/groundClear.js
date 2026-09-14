/**
 * Discs of bare ground that ground cover must not plant in: a campfire's
 * ring, a grave, a trunk lost in a field. Without them the grass scatter
 * grows straight through low props and hides them (a campfire ring read as
 * a coffee pot floating in grass).
 *
 * props.js registers a disc when it plans such a prop; vegetation.js asks at
 * plant time. The grass scatter plants lazily as the camera moves, so discs
 * registered after createVegetation still apply to every tuft planted after.
 */
const CELL = 16;
const grid = new Map();
let count = 0;

const key = (ix, iz) => ix * 73856093 ^ iz * 19349663;

export function clearGroundClearings() {
  grid.clear();
  count = 0;
}

export function addGroundClearing(x, z, r) {
  const disc = { x, z, r2: r * r };
  for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix += 1) {
    for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz += 1) {
      const k = key(ix, iz);
      let bucket = grid.get(k);
      if (!bucket) {
        bucket = [];
        grid.set(k, bucket);
      }
      bucket.push(disc);
    }
  }
  count += 1;
}

export function groundCleared(x, z) {
  if (!count) {
    return false;
  }
  const bucket = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!bucket) {
    return false;
  }
  for (let i = 0; i < bucket.length; i += 1) {
    const d = bucket[i];
    const dx = x - d.x;
    const dz = z - d.z;
    if (dx * dx + dz * dz < d.r2) {
      return true;
    }
  }
  return false;
}

export function groundClearingCount() {
  return count;
}
