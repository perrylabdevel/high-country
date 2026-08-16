const boxes = [];
const cylinders = [];

export function clearColliders() {
  boxes.length = 0;
  cylinders.length = 0;
}

export function addBoxCollider(x, z, halfX, halfZ) {
  boxes.push({
    minX: x - halfX,
    maxX: x + halfX,
    minZ: z - halfZ,
    maxZ: z + halfZ,
    yaw: 0
  });
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
}

export function addCylinderCollider(x, z, radius) {
  const cyl = { x, z, radius };
  cylinders.push(cyl);
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
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 3; pass += 1) {
    for (const box of boxes) {
      const next = resolveCircleBox(px, pz, radius, box);
      px = next.x;
      pz = next.z;
    }
    for (const cyl of cylinders) {
      if (cyl === ignore) {
        continue;
      }
      const next = resolveCircleCylinder(px, pz, radius, cyl);
      px = next.x;
      pz = next.z;
    }
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
  for (const box of boxes) {
    if (x >= box.minX - radius && x <= box.maxX + radius && z >= box.minZ - radius && z <= box.maxZ + radius) {
      return true;
    }
  }
  for (const cyl of cylinders) {
    if (Math.hypot(x - cyl.x, z - cyl.z) <= cyl.radius + radius) {
      return true;
    }
  }
  return false;
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
