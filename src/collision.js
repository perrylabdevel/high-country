const boxes = [];
const cylinders = [];

const CELL_SIZE = 24;
const CELL_OFFSET = 4096;
const CELLS_PER_AXIS = 8192;
let boxGrid = null;
let cylinderGrid = null;
let visitStamp = 0;

function markDirty() {
  boxGrid = null;
  cylinderGrid = null;
}

function cellKey(cx, cz) {
  return (cx + CELL_OFFSET) * CELLS_PER_AXIS + (cz + CELL_OFFSET);
}

function insertRange(grid, item, minX, maxX, minZ, maxZ) {
  const cx0 = Math.floor(minX / CELL_SIZE);
  const cx1 = Math.floor(maxX / CELL_SIZE);
  const cz0 = Math.floor(minZ / CELL_SIZE);
  const cz1 = Math.floor(maxZ / CELL_SIZE);
  for (let cx = cx0; cx <= cx1; cx += 1) {
    for (let cz = cz0; cz <= cz1; cz += 1) {
      const key = cellKey(cx, cz);
      const bucket = grid.get(key);
      if (bucket) {
        bucket.push(item);
      } else {
        grid.set(key, [item]);
      }
    }
  }
}

function buildGrids() {
  boxGrid = new Map();
  cylinderGrid = new Map();
  for (const box of boxes) {
    let hx = (box.maxX - box.minX) / 2;
    let hz = (box.maxZ - box.minZ) / 2;
    const cx = (box.minX + box.maxX) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    if (box.yaw) {
      const cos = Math.abs(Math.cos(box.yaw));
      const sin = Math.abs(Math.sin(box.yaw));
      const rx = hx * cos + hz * sin;
      hz = hx * sin + hz * cos;
      hx = rx;
    }
    insertRange(boxGrid, box, cx - hx, cx + hx, cz - hz, cz + hz);
  }
  for (const cyl of cylinders) {
    insertRange(cylinderGrid, cyl, cyl.x - cyl.radius, cyl.x + cyl.radius, cyl.z - cyl.radius, cyl.z + cyl.radius);
  }
}

function ensureGrids() {
  if (!boxGrid || !cylinderGrid) {
    buildGrids();
  }
}

function forCollidersNear(grid, x, z, radius, visit) {
  visitStamp += 1;
  const cx0 = Math.floor((x - radius) / CELL_SIZE);
  const cx1 = Math.floor((x + radius) / CELL_SIZE);
  const cz0 = Math.floor((z - radius) / CELL_SIZE);
  const cz1 = Math.floor((z + radius) / CELL_SIZE);
  for (let cx = cx0; cx <= cx1; cx += 1) {
    for (let cz = cz0; cz <= cz1; cz += 1) {
      const bucket = grid.get(cellKey(cx, cz));
      if (!bucket) {
        continue;
      }
      for (const item of bucket) {
        if (item._stamp === visitStamp) {
          continue;
        }
        item._stamp = visitStamp;
        visit(item);
      }
    }
  }
}

/**
 * Walkable platforms: horizontal surfaces you stand on, as opposed to boxes and
 * cylinders which are things you cannot walk through.
 *
 * The collision system is otherwise purely 2D and grounding is straight
 * heightAt(), so anything raised off the terrain — a bridge deck, a boardwalk —
 * had nothing to stand on and you walked through it at ground level. A blocking
 * collider cannot express this: it would stop you crossing the bridge rather
 * than carry you over it.
 */
const decks = [];

export function clearColliders() {
  boxes.length = 0;
  cylinders.length = 0;
  decks.length = 0;
  markDirty();
}

/**
 * Register a walkable rectangle at world height `y`, rotated by `yaw` about +Y
 * (same convention as addOrientedBoxCollider).
 */
export function addDeckPlatform(x, z, halfX, halfZ, yaw, y, yFar = null) {
  const deck = {
    x, z, halfX, halfZ, yaw,
    y,
    // Height at the local +Z edge. A bridge approach ramps, so a platform has
    // to be able to slope rather than sit at one height.
    yFar: yFar === null ? y : yFar,
    reach: Math.hypot(halfX, halfZ)
  };
  decks.push(deck);
  return deck;
}

/**
 * Highest deck surface standing at (x, z), or -Infinity if none applies.
 *
 * A deck only counts if it is not more than `climb` above the mover's feet, so
 * walking the creek bed under a bridge keeps you on the terrain instead of
 * snapping you onto the deck overhead, while stepping up from the bank works.
 */
export function deckHeightAt(x, z, fromY, climb = 1.4) {
  let best = -Infinity;
  for (let i = 0; i < decks.length; i += 1) {
    const d = decks[i];
    if (Math.max(d.y, d.yFar) <= best) {
      continue;
    }
    const dx = x - d.x;
    const dz = z - d.z;
    if (dx * dx + dz * dz > d.reach * d.reach) {
      continue;
    }
    const cos = Math.cos(-d.yaw);
    const sin = Math.sin(-d.yaw);
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    if (Math.abs(lx) > d.halfX || Math.abs(lz) > d.halfZ) {
      continue;
    }
    const t = d.halfZ > 0 ? (lz + d.halfZ) / (2 * d.halfZ) : 0;
    const surface = d.y + (d.yFar - d.y) * t;
    if (surface > best && surface <= fromY + climb) {
      best = surface;
    }
  }
  return best;
}

export function deckCount() {
  return decks.length;
}

/**
 * `span` is an optional { minY, maxY } world-height range over which the
 * collider is solid. Colliders are otherwise flat in Y and block at every
 * height, which is wrong for anything you can walk under: give a bridge rail a
 * plain collider and it walls off the creek bed three metres below it too.
 * Omitting `span` keeps the original always-solid behaviour.
 */
export function addBoxCollider(x, z, halfX, halfZ, span = null) {
  boxes.push({
    minX: x - halfX,
    maxX: x + halfX,
    minZ: z - halfZ,
    maxZ: z + halfZ,
    yaw: 0,
    minY: span ? span.minY : null,
    maxY: span ? span.maxY : null
  });
  markDirty();
}

/**
 * Oriented box collider. yaw is the box's rotation about +Y (radians).
 * The resolve rotates the player into the box's local frame, runs the AABB
 * resolve, and rotates back — so a rotated building's walls collide correctly.
 */
export function addOrientedBoxCollider(x, z, halfX, halfZ, yaw, span = null) {
  boxes.push({
    minX: x - halfX,
    maxX: x + halfX,
    minZ: z - halfZ,
    maxZ: z + halfZ,
    halfX,
    halfZ,
    yaw,
    minY: span ? span.minY : null,
    maxY: span ? span.maxY : null
  });
  markDirty();
}

export function addCylinderCollider(x, z, radius, span = null) {
  const cyl = { x, z, radius, minY: span ? span.minY : null, maxY: span ? span.maxY : null };
  cylinders.push(cyl);
  markDirty();
  return cyl;
}

/** Body height used to test whether a mover overlaps a collider's span. */
const BODY_HEIGHT = 1.8;

/**
 * Does a mover whose feet are at `y` overlap this collider vertically?
 * `y` of null means the caller does not track height, so everything is solid.
 */
function spanApplies(item, y) {
  if (y === null || item.minY === null || item.minY === undefined) {
    return true;
  }
  return y + BODY_HEIGHT > item.minY && y < item.maxY;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resolveCircleBox(px, pz, radius, box) {
  if (box.yaw) {
    const cx = (box.minX + box.maxX) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    const cos = Math.cos(-box.yaw);
    const sin = Math.sin(-box.yaw);
    const lx = (px - cx) * cos - (pz - cz) * sin;
    const lz = (px - cx) * sin + (pz - cz) * cos;
    const local = resolveCircleBox(lx, lz, radius, { ...box, yaw: 0, minX: -box.halfX, maxX: box.halfX, minZ: -box.halfZ, maxZ: box.halfZ });
    const cos2 = Math.cos(box.yaw);
    const sin2 = Math.sin(box.yaw);
    return { x: cx + local.x * cos2 - local.z * sin2, z: cz + local.x * sin2 + local.z * cos2 };
  }
  const nearestX = clamp(px, box.minX, box.maxX);
  const nearestZ = clamp(pz, box.minZ, box.maxZ);
  let dx = px - nearestX;
  let dz = pz - nearestZ;
  const distSq = dx * dx + dz * dz;
  if (distSq >= radius * radius) {
    return { x: px, z: pz };
  }
  if (distSq < 1e-8) {
    const left = px - box.minX;
    const right = box.maxX - px;
    const down = pz - box.minZ;
    const up = box.maxZ - pz;
    const smallest = Math.min(left, right, down, up);
    if (smallest === left) {
      return { x: box.minX - radius, z: pz };
    }
    if (smallest === right) {
      return { x: box.maxX + radius, z: pz };
    }
    if (smallest === down) {
      return { x: px, z: box.minZ - radius };
    }
    return { x: px, z: box.maxZ + radius };
  }
  const dist = Math.sqrt(distSq);
  const push = (radius - dist) / dist;
  return { x: px + dx * push, z: pz + dz * push };
}

function resolveCircleCylinder(px, pz, radius, cyl) {
  const dx = px - cyl.x;
  const dz = pz - cyl.z;
  const minDist = radius + cyl.radius;
  const distSq = dx * dx + dz * dz;
  if (distSq >= minDist * minDist) {
    return { x: px, z: pz };
  }
  const dist = Math.sqrt(distSq) || 0.0001;
  const push = minDist / dist;
  return { x: cyl.x + dx * push, z: cyl.z + dz * push };
}

export function resolvePosition(x, z, radius, ignore = null, y = null) {
  ensureGrids();
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 3; pass += 1) {
    let nextX = px;
    let nextZ = pz;
    forCollidersNear(boxGrid, px, pz, radius, (box) => {
      if (!spanApplies(box, y)) {
        return;
      }
      const r = resolveCircleBox(nextX, nextZ, radius, box);
      nextX = r.x;
      nextZ = r.z;
    });
    px = nextX;
    pz = nextZ;
    let cylX = px;
    let cylZ = pz;
    forCollidersNear(cylinderGrid, px, pz, radius, (cyl) => {
      if (cyl === ignore || !spanApplies(cyl, y)) {
        return;
      }
      const r = resolveCircleCylinder(cylX, cylZ, radius, cyl);
      cylX = r.x;
      cylZ = r.z;
    });
    px = cylX;
    pz = cylZ;
  }
  return { x: px, z: pz };
}

export function moveAndSlide(x, z, dx, dz, radius, ignore = null, y = null) {
  const alongX = resolvePosition(x + dx, z, radius, ignore, y);
  const alongZ = resolvePosition(alongX.x, alongX.z + dz, radius, ignore, y);
  return alongZ;
}

export function colliderCounts() {
  return { boxes: boxes.length, cylinders: cylinders.length };
}

/** Snapshot of box colliders for geometry checks. Centers are world XZ. */
export function listBoxColliders() {
  return boxes.map((b) => ({
    x: (b.minX + b.maxX) / 2,
    z: (b.minZ + b.maxZ) / 2,
    halfX: b.halfX ?? (b.maxX - b.minX) / 2,
    halfZ: b.halfZ ?? (b.maxZ - b.minZ) / 2,
    yaw: b.yaw || 0
  }));
}

export function hasColliderNear(x, z, radius) {
  ensureGrids();
  let found = false;
  forCollidersNear(boxGrid, x, z, radius, (box) => {
    if (found) {
      return;
    }
    if (x >= box.minX - radius && x <= box.maxX + radius && z >= box.minZ - radius && z <= box.maxZ + radius) {
      found = true;
    }
  });
  if (found) {
    return true;
  }
  forCollidersNear(cylinderGrid, x, z, radius, (cyl) => {
    if (found) {
      return;
    }
    const dx = x - cyl.x;
    const dz = z - cyl.z;
    if (dx * dx + dz * dz <= (cyl.radius + radius) * (cyl.radius + radius)) {
      found = true;
    }
  });
  return found;
}

/**
 * Distance to the nearest collider surface from (x, z), capped at `maxR`.
 * Returns maxR when nothing stands within it.
 *
 * hasColliderNear answers "is something here"; arrival checks need "how much
 * room is here" — an approach whose region is clear at r=4 but flanked by a
 * wall at 4.1 m must read tighter than one standing in open yard. Approximate
 * by probing the resolved direction: the signed nearest point of each
 * candidate box to the query point, measured centre-outward.
 */
export function clearanceAt(x, z, maxR) {
  ensureGrids();
  let best = maxR;
  forCollidersNear(boxGrid, x, z, maxR, (box) => {
    const nx = Math.max(box.minX, Math.min(x, box.maxX));
    const nz = Math.max(box.minZ, Math.min(z, box.maxZ));
    best = Math.min(best, Math.hypot(x - nx, z - nz));
  });
  forCollidersNear(cylinderGrid, x, z, maxR, (cyl) => {
    best = Math.min(best, Math.max(0, Math.hypot(x - cyl.x, z - cyl.z) - cyl.radius));
  });
  return best;
}

export function movementBlocked(x, z, dx, dz, radius, ignore = null, y = null) {
  const next = moveAndSlide(x, z, dx, dz, radius, ignore, y);
  return Math.hypot(next.x - (x + dx), next.z - (z + dz)) > 0.05;
}

export function cameraClearance(fromX, fromY, fromZ, toX, toY, toZ, radius = 0.35, ignore = null) {
  const samples = 8;
  let last = { x: toX, y: toY, z: toZ };
  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const x = fromX + (toX - fromX) * t;
    const y = fromY + (toY - fromY) * t;
    const z = fromZ + (toZ - fromZ) * t;
    const resolved = resolvePosition(x, z, radius, ignore);
    const blocked = Math.hypot(resolved.x - x, resolved.z - z) > 0.02;
    if (blocked) {
      const prevT = (i - 1) / samples;
      return {
        x: fromX + (toX - fromX) * prevT,
        y: fromY + (toY - fromY) * prevT,
        z: fromZ + (toZ - fromZ) * prevT
      };
    }
    last = { x: resolved.x, y, z: resolved.z };
  }
  return last;
}
