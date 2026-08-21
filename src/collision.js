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

export function clearColliders() {
  boxes.length = 0;
  cylinders.length = 0;
  markDirty();
}

export function addBoxCollider(x, z, halfX, halfZ) {
  boxes.push({
    minX: x - halfX,
    maxX: x + halfX,
    minZ: z - halfZ,
    maxZ: z + halfZ,
    yaw: 0
  });
  markDirty();
}

/**
 * Oriented box collider. yaw is the box's rotation about +Y (radians).
 * The resolve rotates the player into the box's local frame, runs the AABB
 * resolve, and rotates back — so a rotated building's walls collide correctly.
 */
export function addOrientedBoxCollider(x, z, halfX, halfZ, yaw) {
  boxes.push({
    minX: x - halfX,
    maxX: x + halfX,
    minZ: z - halfZ,
    maxZ: z + halfZ,
    halfX,
    halfZ,
    yaw
  });
  markDirty();
}

export function addCylinderCollider(x, z, radius) {
  const cyl = { x, z, radius };
  cylinders.push(cyl);
  markDirty();
  return cyl;
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

export function resolvePosition(x, z, radius, ignore = null) {
  ensureGrids();
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 3; pass += 1) {
    let nextX = px;
    let nextZ = pz;
    forCollidersNear(boxGrid, px, pz, radius, (box) => {
      const r = resolveCircleBox(nextX, nextZ, radius, box);
      nextX = r.x;
      nextZ = r.z;
    });
    px = nextX;
    pz = nextZ;
    let cylX = px;
    let cylZ = pz;
    forCollidersNear(cylinderGrid, px, pz, radius, (cyl) => {
      if (cyl === ignore) {
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

export function moveAndSlide(x, z, dx, dz, radius, ignore = null) {
  const alongX = resolvePosition(x + dx, z, radius, ignore);
  const alongZ = resolvePosition(alongX.x, alongX.z + dz, radius, ignore);
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

export function movementBlocked(x, z, dx, dz, radius, ignore = null) {
  const next = moveAndSlide(x, z, dx, dz, radius, ignore);
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
