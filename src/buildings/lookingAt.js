/**
 * Which kit structure the camera is aimed at. Used by the ?dev name overlay
 * so look-at notes can name ranchHouse vs barn without guessing.
 *
 * Footprint test: center must lie inside the view ray's cylinder of radius
 * hypot(w, d)/2. Nearest along the ray wins.
 */

export const LOOK_MAX_DIST = 90;

function record(item) {
  if (item && item.userData && item.userData.name != null && Number.isFinite(item.userData.x)) {
    return item.userData;
  }
  return item;
}

export function lookingAtStructure(list, origin, direction, maxDist = LOOK_MAX_DIST) {
  const len = Math.hypot(direction.x, direction.y, direction.z) || 1;
  const ndx = direction.x / len;
  const ndy = direction.y / len;
  const ndz = direction.z / len;
  let best = null;
  let bestAlong = Infinity;
  for (const item of list) {
    const r = record(item);
    const cx = r.x - origin.x;
    const cy = (r.y ?? r.placementY ?? 0) + (r.eave || 0) * 0.5 - origin.y;
    const cz = r.z - origin.z;
    const along = cx * ndx + cy * ndy + cz * ndz;
    if (along < 0.5 || along > maxDist) {
      continue;
    }
    const perp = Math.hypot(cx - ndx * along, cy - ndy * along, cz - ndz * along);
    const radius = Math.hypot(r.w || 0, r.d || 0) / 2;
    if (perp > radius + 1.5) {
      continue;
    }
    if (along < bestAlong) {
      bestAlong = along;
      best = item;
    }
  }
  return best;
}
