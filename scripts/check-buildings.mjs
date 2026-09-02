/**
 * Building geometry invariants (docs/BUILDING_GEOMETRY_HANDOFF.md §6).
 *
 * Inspects structures actually built by createRanch / createLandmarks /
 * createInteriors — not synthetic kit calls constructed in this file.
 * Reverting the ranch roof 1.9 m off its walls, or a doorway to full wall
 * height, must fail.
 */
globalThis.document = {
  createElement(tag) {
    if (tag !== "canvas") {
      return {};
    }
    return {
      width: 256,
      height: 256,
      getContext() {
        // Every 2D call returns a gradient-like object rather than undefined,
        // so painters that build CanvasGradients work against the stub too.
        const gradient = { addColorStop() {} };
        const noop = () => gradient;
        return new Proxy({}, { get: () => noop });
      }
    };
  }
};

const THREE = await import("three/webgpu");
const { bakeHeightfield, heightAt } = await import("../src/heightfield.js");
const {
  STRUCTURES,
  WATER_PLACED,
  clearStructures,
  footing,
  footprintsOverlap
} = await import("../src/buildings/kit.js");
const { clearColliders, listBoxColliders } = await import("../src/collision.js");
const { createRanch } = await import("../src/buildings.js");
const { createLandmarks, STREETS } = await import("../src/landmarks.js");
const { createInteriors } = await import("../src/interiors.js");
const { createShore } = await import("../src/shore.js");
const { createIndustry } = await import("../src/industry.js");
const { createFort } = await import("../src/fort.js");
const { createHomestead } = await import("../src/homestead.js");
const { unmatedRequired, worldAnchor, anchorsOf } = await import("../src/buildings/anchors.js");
const { WATER } = await import("../src/map.js");

function walk(obj, fn) {
  fn(obj);
  for (const child of obj.children) {
    walk(child, fn);
  }
}

function collect(obj, pred) {
  const out = [];
  walk(obj, (node) => {
    if (pred(node)) {
      out.push(node);
    }
  });
  return out;
}

function openingClass(o) {
  if (o.class) {
    return o.class;
  }
  if ((o.w || o.openingW || 0) >= 2.8) {
    return "barn";
  }
  if ((o.fromFloor || 0) >= 0.5) {
    return "window";
  }
  return "door";
}

function doorAllowed(cls, w, h) {
  if (cls === "barn" || cls === "gate") {
    return w >= 3.0 && w <= 3.7 && h >= 3.5 && h <= 4.3;
  }
  if (cls === "bay") {
    return w >= 2.0 && w <= 3.0 && h >= 2.4 && h <= 3.2;
  }
  return w >= 0.85 && w <= 1.1 && h >= 1.95 && h <= 2.20;
}

function label(s) {
  const u = s.userData;
  return `${u.name || u.kind}@(${Number(u.x).toFixed(1)},${Number(u.z).toFixed(1)})`;
}

function worldBox(obj) {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj);
}

/** Shed on equal-height walls with no false front leaves a flying ridge. */
function shedUnfinished(roof, walls, hasFalseFront) {
  if (roof.userData.type !== "shed") {
    return false;
  }
  if (hasFalseFront) {
    return false;
  }
  const ridge = roof.userData.roofTop;
  return !walls.some((w) => (w.userData.height || 0) >= ridge - 0.05);
}

function pointInCollider(col, x, z, pad) {
  const dx = x - col.x;
  const dz = z - col.z;
  const c = Math.cos(-(col.yaw || 0));
  const s = Math.sin(-(col.yaw || 0));
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= col.halfX + pad && Math.abs(lz) <= col.halfZ + pad;
}

function colliderIsOwn(s, col) {
  const u = s.userData;
  const dx = col.x - u.x;
  const dz = col.z - u.z;
  const c = Math.cos(-(u.yaw || 0));
  const sn = Math.sin(-(u.yaw || 0));
  const lx = dx * c - dz * sn;
  const lz = dx * sn + dz * c;
  const hw = u.w / 2;
  const hd = u.d / 2;
  if (
    Math.hypot(lx, lz) < 0.6 &&
    Math.abs(col.halfX - hw) < 0.4 &&
    Math.abs(col.halfZ - hd) < 0.4
  ) {
    return true;
  }
  // Thin perimeter walls, including segments split around an opening. A
  // fence 0.4 m outside the face is not own — that is the ranch-smith case.
  if (Math.min(col.halfX, col.halfZ) >= 0.45) {
    return false;
  }
  const onFrontOrBack = Math.abs(Math.abs(lz) - hd) < 0.25 && Math.abs(lx) <= hw + 0.3;
  const onLeftOrRight = Math.abs(Math.abs(lx) - hw) < 0.25 && Math.abs(lz) <= hd + 0.3;
  return onFrontOrBack || onLeftOrRight;
}

function onPerimeter(s, wall) {
  const u = s.userData;
  return (
    Math.abs(Math.abs(wall.position.x) - u.w / 2) < 0.45 ||
    Math.abs(Math.abs(wall.position.z) - u.d / 2) < 0.45
  );
}

/**
 * Walkable opening whose outward 1.5 m is blocked by another footprint or a
 * collider that is not this structure (fence, trough, neighboring wall).
 * Opening normals face out after mate() (wallSide is -Z, opening is +Z).
 */
function openingApproachBlocked(s, worldOpening, structures, colliders) {
  const outwardX = worldOpening.normal.x;
  const outwardZ = worldOpening.normal.z;
  const pad = 0.3;
  const probe = { w: 1.2, d: 1.2, yaw: 0 };
  for (let dist = 0; dist <= 1.5 + 1e-6; dist += 0.25) {
    const x = worldOpening.position.x + outwardX * dist;
    const z = worldOpening.position.z + outwardZ * dist;
    for (const other of structures) {
      if (other === s) {
        continue;
      }
      if (footprintsOverlap({ ...probe, x, z }, other.userData, 0)) {
        return `${dist.toFixed(2)} m out is inside ${label(other)}`;
      }
    }
    if (dist < 0.2) {
      continue;
    }
    for (const col of colliders) {
      if (colliderIsOwn(s, col)) {
        continue;
      }
      if (pointInCollider(col, x, z, pad)) {
        return `${dist.toFixed(2)} m out hits a collider at (${col.x.toFixed(1)}, ${col.z.toFixed(1)})`;
      }
    }
  }
  return null;
}

{
  const roof = { userData: { type: "shed", roofTop: 5 } };
  const equalWalls = [{ userData: { height: 4 } }, { userData: { height: 4 } }];
  if (!shedUnfinished(roof, equalWalls, false)) {
    throw new Error("equal-height shed without a false front must be unfinished");
  }
  if (shedUnfinished(roof, equalWalls, true)) {
    throw new Error("a false front finishes a shed");
  }
  if (shedUnfinished(roof, [{ userData: { height: 5 } }], false)) {
    throw new Error("a wall to the ridge finishes a shed");
  }
  if (shedUnfinished({ userData: { type: "gable", roofTop: 5 } }, equalWalls, false)) {
    throw new Error("a gable is not an unfinished shed");
  }
}

{
  const self = {
    userData: {
      name: "probe",
      x: 0,
      z: 0,
      w: 8,
      d: 6,
      yaw: 0,
      colliderWalls: [{ x: 0, z: 3, halfX: 4, halfZ: 0.11 }]
    }
  };
  const opening = { position: { x: 0, y: 1, z: 3 }, normal: { x: 0, y: 0, z: 1 } };
  const nearFence = { x: 0, z: 3.4, halfX: 5, halfZ: 0.22, yaw: 0 };
  const farFence = { x: 0, z: 20, halfX: 5, halfZ: 0.22, yaw: 0 };
  const ownWall = { x: 0, z: 3, halfX: 4, halfZ: 0.21, yaw: 0 };
  const hit = openingApproachBlocked(self, opening, [], [nearFence, ownWall]);
  if (!hit) {
    throw new Error("openingApproachBlocked missed a fence 0.4 m outside the door");
  }
  const clear = openingApproachBlocked(self, opening, [], [farFence, ownWall]);
  if (clear) {
    throw new Error(`openingApproachBlocked flagged a fence 17 m away (${clear})`);
  }
  const neighbor = { userData: { name: "other", x: 0, z: 6, w: 8, d: 6, yaw: 0 } };
  const intoLot = openingApproachBlocked(self, opening, [self, neighbor], [ownWall]);
  if (!intoLot) {
    throw new Error("openingApproachBlocked missed a door that opens into another footprint");
  }
}

bakeHeightfield();
clearColliders();
clearStructures();
const sceneAdds = [];
const scene = { add(o) { sceneAdds.push(o); } };
// Stub maps: an unloaded Texture per channel, so the builders take their
// makeTexturedMat path and every material is tagged with its set name in
// userData — which the wood-vs-wall invariant below reads. Nothing renders
// here, so the empty maps never compile.
const stubMaps = Object.fromEntries(
  ["adobe", "wood", "siding", "roof", "rock"].map((n) => [n, { name: n, albedo: new THREE.Texture(), normal: null, orm: null }])
);
createRanch(stubMaps);
createLandmarks(scene, stubMaps);
createInteriors(scene, stubMaps);
createShore(scene, stubMaps);
createIndustry(scene, stubMaps);
createFort(scene, stubMaps);
createHomestead(scene, stubMaps);

const EXPECTED_STRUCTURE_COUNTS = {
  ranchHouse: 1,
  ranchEll: 1,
  barn: 1,
  bunkhouse: 1,
  blacksmith: 2,
  sheriff: 1,
  newspaper: 1,
  doctor: 1,
  hotel: 1,
  store: 1,
  church: 1,
  saloon: 1,
  livery: 1,
  // 5 + 4 + 5 across the three unnamed rows. This read 11 while the cross
  // street was planted mid-town and the footprint guard ate 3 of its lots:
  // the constant had been fitted to the broken build. Invariant 14 now holds
  // built == configured, and this agrees with it.
  streetLot: 14,
  timberCabin: 3,
  huntingCabin: 1,
  stampMill: 1,
  elPasoCasa: 1,
  elPasoTwoStory: 1,
  elPasoCasita: 1,
  elPasoStore: 1,
  elPasoShed: 1
};
const actualStructureCounts = Object.fromEntries(
  STRUCTURES.map((s) => s.userData.name).sort().reduce((counts, name) => {
    counts.set(name, (counts.get(name) || 0) + 1);
    return counts;
  }, new Map())
);
for (const [name, expected] of Object.entries(EXPECTED_STRUCTURE_COUNTS)) {
  if (actualStructureCounts[name] !== expected) {
    throw new Error(`expected ${expected} registered ${name} structures, got ${actualStructureCounts[name] || 0}`);
  }
}
for (const name of Object.keys(actualStructureCounts)) {
  if (!(name in EXPECTED_STRUCTURE_COUNTS)) {
    throw new Error(`unaccounted registered structure ${name}; add it to the production inventory`);
  }
}

const failures = [];
function check(cond, msg) {
  if (!cond) {
    failures.push(msg);
  }
  return Boolean(cond);
}

const colliders = listBoxColliders();

for (const s of STRUCTURES) {
  const u = s.userData;
  s.updateMatrixWorld(true);

  // 7. Ground conformance — a structure may span a slope only if the scene
  // actually emitted a tagged foundation, not merely because its config says
  // foundation: true.
  const f = footing(u.x, u.z, u.w, u.d, u.yaw);
  const maxCorner = Math.max(...f.corners.map(([cx, cz]) => Math.abs(heightAt(cx, cz) - u.placementY)));
  const foundations = collect(s, (n) => n.userData.role === "foundation");
  if (maxCorner > 0.35) {
    check(
      foundations.length > 0 && u.foundationEmitted,
      `${label(s)} ground gap ${maxCorner.toFixed(2)} > 0.35 without an emitted foundation skirt`
    );
  }

  // 9. Street alignment — the lot's rendered facade axis is parallel to the
  // street axis (a pi flip is the other sidewalk, so compare undirected).
  //
  // This compares WORLD axes, not raw yaw numbers. Differencing the Euler
  // angles cannot see a mirrored lot: rotation.y = t maps +X to
  // (cos t, -sin t), so a lot mirrored about the street differs from the
  // street angle by exactly pi and the old subtraction reported 0. Every
  // Silver Creek storefront sat 17.2 deg off its row while this check was
  // green.
  if (u.streetYaw !== undefined) {
    const axis = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(s.getWorldQuaternion(new THREE.Quaternion()))
      .setY(0)
      .normalize();
    const sinOff = Math.abs(axis.x * Math.sin(u.streetYaw) - axis.z * Math.cos(u.streetYaw));
    check(
      sinOff < 0.05,
      `${label(s)} not aligned to the street (${(Math.asin(Math.min(1, sinOff)) * 180 / Math.PI).toFixed(1)} deg off its row)`
    );
  }

  // 1. No gap under the roof — measured world AABB, not builder return values.
  const roofs = s.children.filter((c) => c.userData.role === "roof");
  check(roofs.length > 0, `${label(s)} has no kit roof`);
  for (const roof of roofs) {
    const box = worldBox(roof);
    const lo = u.wallTop - 0.30;
    const hi = u.wallTop + 0.02;
    check(
      box.min.y >= lo - 1e-3 && box.min.y <= hi + 1e-3,
      `${label(s)} roof base y=${box.min.y.toFixed(2)} not in [${lo.toFixed(2)}, ${hi.toFixed(2)}] (wallTop ${u.wallTop.toFixed(2)})`
    );

    // 2. Non-negative overhang — world AABB covers the footprint on both axes.
    const size = box.getSize(new THREE.Vector3());
    check(
      size.x + 0.05 >= u.w && size.z + 0.05 >= u.d,
      `${label(s)} roof plan ${size.x.toFixed(2)}×${size.z.toFixed(2)} < footprint ${u.w}×${u.d}`
    );

    // Shed on equal-height walls leaves the high edge flying unless a false
    // front (or a wall that reaches the ridge) hides it.
    if (shedUnfinished(
      roof,
      collect(s, (n) => n.userData.role === "wall"),
      collect(s, (n) => n.userData.role === "falseFront").length > 0
    )) {
      check(
        false,
        `${label(s)} shed roof ridge is ${(roof.userData.roofTop - u.eave).toFixed(2)} m above equal-height walls with no false front`
      );
    }
  }

  // 3. Chimneys are continuous from near the floor, not floating above the eave.
  for (const ch of collect(s, (n) => n.userData.role === "chimney")) {
    const box = worldBox(ch);
    check(
      box.min.y <= u.placementY + 0.6,
      `${label(s)} chimney starts at y=${box.min.y.toFixed(2)}, ${ (box.min.y - u.placementY).toFixed(2)} m above the floor`
    );
  }

  const walls = collect(s, (n) => n.userData.role === "wall");
  const doorOpenings = [];
  for (const wall of walls) {
    if (wall.userData.fullHeightDoor) {
      check(false, `${label(s)} has a full-height doorway (no header)`);
    }
    for (const o of wall.userData.openings || []) {
      const cls = openingClass(o);
      if (cls === "window") {
        // 11. Window placement — sill ≥ 0.8 above the floor, head ≤ eave.
        check(o.fromFloor >= 0.8, `${label(s)} window sill ${o.fromFloor} < 0.8`);
        check(
          o.fromFloor + o.h <= u.eave + 0.01,
          `${label(s)} window head ${(o.fromFloor + o.h).toFixed(2)} > eave ${u.eave}`
        );
      } else {
        // 4. Door dimensions.
        check(
          doorAllowed(cls, o.w, o.h),
          `${label(s)} ${cls} opening ${o.w.toFixed(2)}×${o.h.toFixed(2)} out of range`
        );
        doorOpenings.push(o);
      }
    }

    if (onPerimeter(s, wall)) {
      (wall.userData.openings || []).forEach((o, i) => {
        if (openingClass(o) === "window") {
          return;
        }
        if (!anchorsOf(wall).get(`opening.${i}`)) {
          return;
        }
        const world = worldAnchor(wall, `opening.${i}`);
        const blocked = openingApproachBlocked(s, world, STRUCTURES, colliders);
        check(
          !blocked,
          `${label(s)} ${openingClass(o)} at (${world.position.x.toFixed(1)}, ${world.position.z.toFixed(1)}) ${blocked}`
        );
      });
    }
  }

  for (const header of collect(s, (n) => n.userData.role === "header" && n.userData.fromFloor === 0)) {
    const h = header.geometry?.parameters?.height;
    if (h == null) {
      continue;
    }
    const measured = header.position.y - h / 2 - (header.userData.fromFloor || 0);
    const cls = openingClass({ ...header.userData, w: header.userData.openingW, h: measured });
    if (cls === "window") {
      continue;
    }
    check(
      doorAllowed(cls, header.userData.openingW, measured),
      `${label(s)} measured doorway height ${measured.toFixed(2)} out of range`
    );
  }

  if (u.interiorDoor) {
    check(
      doorAllowed("door", u.interiorDoor.w, u.interiorDoor.h),
      `${label(s)} interior doorway ${u.interiorDoor.w}×${u.interiorDoor.h} out of range`
    );
    check(!u.fullHeightDoor, `${label(s)} interior doorway is full wall height`);
    const lintels = collect(s, (n) => n.userData.role === "lintel");
    check(lintels.length > 0, `${label(s)} enterable lot has no lintel`);
    for (const lintel of lintels) {
      const h = lintel.geometry?.parameters?.height;
      if (h == null) {
        continue;
      }
      const measured = lintel.position.y - h / 2;
      check(
        doorAllowed("door", lintel.userData.openingW ?? u.interiorDoor.w, measured),
        `${label(s)} interior lintel implies doorway height ${measured.toFixed(2)}`
      );
    }
  }

  // 5. Door leaf covers the opening (leaf may be slightly narrower than the
  // rough opening for jambs, but not a 20 cm gap).
  const leaves = collect(s, (n) => n.userData.role === "door");
  for (const leaf of leaves) {
    const w = leaf.userData.width;
    const match = doorOpenings.find((o) => Math.abs(o.w - w) <= 0.15) || doorOpenings[0];
    if (match) {
      check(
        w >= match.w - 0.10,
        `${label(s)} door leaf ${w.toFixed(2)} much narrower than opening ${match.w.toFixed(2)}`
      );
    }
  }

  // 6. Ceiling height — habitable interiors 2.3–3.2.
  if (u.habitable) {
    const ceilings = collect(s, (n) => n.userData.role === "ceiling");
    check(ceilings.length > 0, `${label(s)} habitable structure has no ceiling`);
    for (const ceil of ceilings) {
      const h = ceil.userData.height ?? ceil.position.y;
      check(h >= 2.3 && h <= 3.2, `${label(s)} ceiling ${h.toFixed(2)} outside 2.3–3.2`);
    }
  }

  // 8. Floor above foundation — floor top at/above the local origin, and
  // within 0.15 m of the player's standing plane (y = 0 in the structure frame).
  for (const fl of collect(s, (n) => n.userData.role === "floor")) {
    const top = fl.userData.top ?? fl.position.y + (fl.geometry?.parameters?.height ?? 0) / 2;
    check(top >= -0.01, `${label(s)} floor top ${top.toFixed(2)} is below the foundation`);
    check(Math.abs(top) <= 0.15, `${label(s)} floor top ${top.toFixed(2)} is >0.15 m from the standing plane`);
  }

  // 10. Collider agreement — every wall mesh has a collide() entry, and those
  // entries exist in the collider list. Comparing world AABBs picks up neighboring
  // lots on a 14 m street grid.
  {
    const wallsList = u.colliderWalls || [];
    check(wallsList.length >= 3, `${label(s)} collide() was not called (need wall colliders)`);
    for (const wall of walls) {
      const onPerimeter =
        Math.abs(Math.abs(wall.position.x) - u.w / 2) < 0.45 ||
        Math.abs(Math.abs(wall.position.z) - u.d / 2) < 0.45;
      if (!onPerimeter || (wall.userData.height != null && wall.userData.height < u.eave - 0.2)) {
        continue;
      }
      const match = wallsList.some((cw) => Math.hypot(cw.x - wall.position.x, cw.z - wall.position.z) <= 0.35);
      check(match, `${label(s)} wall at local (${wall.position.x.toFixed(2)},${wall.position.z.toFixed(2)}) has no collide() entry`);
    }
    // Same frame collide() uses: three.js maps local to world with
    // rotation.y = yaw, i.e. -yaw in this 2D (x,z) rotation.
    const cos = Math.cos(-u.yaw);
    const sin = Math.sin(-u.yaw);
    for (const cw of wallsList) {
      const wx = u.x + cw.x * cos - cw.z * sin;
      const wz = u.z + cw.x * sin + cw.z * cos;
      const reach = (cw.openings && cw.openings.length)
        ? Math.max(cw.halfX, cw.halfZ) + 0.3
        : 0.35;
      const hit = colliders.some((col) => Math.hypot(col.x - wx, col.z - wz) <= reach);
      check(hit, `${label(s)} collide() wall at (${wx.toFixed(1)},${wz.toFixed(1)}) is missing from the collider list`);
    }
  }

  // 12. Water-adjacent kit structures sit on WATER.
  if (u.waterAdjacent) {
    check(
      Math.abs(u.placementY - WATER) <= 0.35,
      `${label(s)} water-adjacent placementY ${u.placementY.toFixed(2)} vs WATER ${WATER}`
    );
  }
}

check(WATER_PLACED.length > 0, "no water-adjacent placements registered (dock should sit on WATER)");
for (const w of WATER_PLACED) {
  check(
    Math.abs(w.y - WATER) <= 0.35,
    `${w.name}@(${w.x},${w.z}) y=${w.y.toFixed(2)} does not reference WATER=${WATER}`
  );
}

for (const u of unmatedRequired(STRUCTURES)) {
  check(
    false,
    `${u.obj.userData?.name || u.obj.userData?.role || "object"} ${u.name} is required but unmated`
  );
}

const SILVER = STRUCTURES.filter((s) => s.userData.streetYaw !== undefined);
for (let i = 0; i < SILVER.length; i += 1) {
  for (let j = i + 1; j < SILVER.length; j += 1) {
    const a = SILVER[i].userData;
    const b = SILVER[j].userData;
    if (footprintsOverlap(a, b, 0.8)) {
      check(
        false,
        `${label(SILVER[i])} overlaps ${label(SILVER[j])} (centres ${Math.hypot(a.x - b.x, a.z - b.z).toFixed(1)} m apart)`
      );
    }
  }
}

// 13. Boardwalk — runs along its own street, its walking surface lands on the
// storefront floor it serves, and it is actually raised above the street.
// All three come from real defects: the deck was rotated +yaw instead of -yaw
// (17.2 deg off the row, walking its ends ~18.6 m from the shopfronts), and it
// was seated 0.5 m proud of the sills so it rode across every doorway. No
// other invariant could see either one.
const decks = [];
for (const root of sceneAdds) {
  root.updateMatrixWorld(true);
  root.traverse((n) => {
    if (n.userData?.role === "boardwalk") {
      decks.push(n);
    }
  });
}
check(decks.length > 0, "no boardwalk was emitted for any street");

for (const deck of decks) {
  const owner = deck.parent.userData;
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  deck.matrixWorld.decompose(pos, quat, new THREE.Vector3());

  const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(quat).setY(0).normalize();
  const sinOff = Math.abs(axis.x * Math.sin(owner.streetYaw) - axis.z * Math.cos(owner.streetYaw));
  check(
    sinOff < 0.01,
    `boardwalk at (${pos.x.toFixed(1)},${pos.z.toFixed(1)}) is ${(Math.asin(Math.min(1, sinOff)) * 180 / Math.PI).toFixed(1)} deg off its street axis`
  );

  // Nearest lot on the SAME street — yaw alone cannot identify one, since
  // Silver Creek runs three streets at yaw 0.15.
  let lot = null;
  let bestDist = Infinity;
  for (const other of STRUCTURES) {
    if (other.userData.streetId !== owner.streetId) {
      continue;
    }
    const dist = Math.hypot(other.userData.x - pos.x, other.userData.z - pos.z);
    if (dist < bestDist) {
      bestDist = dist;
      lot = other;
    }
  }
  if (check(lot !== null, `boardwalk at (${pos.x.toFixed(1)},${pos.z.toFixed(1)}) serves no lot on its street`)) {
    const top = pos.y + deck.userData.height + 0.2;
    const delta = top - lot.userData.placementY;
    check(
      Math.abs(delta) <= 0.05,
      `boardwalk at ${label(lot)} sits ${delta > 0 ? "+" : ""}${delta.toFixed(2)} m off its floor (deck ${top.toFixed(2)}, sill ${lot.userData.placementY.toFixed(2)})`
    );
    check(
      top - heightAt(pos.x, pos.z) >= 0.25,
      `boardwalk at ${label(lot)} stands only ${(top - heightAt(pos.x, pos.z)).toFixed(2)} m above the street — not a raised walk`
    );
  }
}

// 14. Every street builds the lots it was given. buildLot returns null when a
// footprint would land inside one already standing — the guard that stops a
// cross street from planting a building inside a facade. Silently, though: the
// cross street had been losing 3 of its 5 lots, and the only symptom was a
// thin-looking town.
for (const st of STREETS) {
  check(
    st.built === st.configured,
    `street ${st.id} at (${st.origin.x.toFixed(0)},${st.origin.z.toFixed(0)}) built ${st.built} of ${st.configured} lots — dropped: ${st.dropped.join(", ")}`
  );
}

// 15. Walls and building bodies never wear the `wood` set. It is a FLOOR
// texture — short planks with staggered butt joints — and on a wall it puts
// three superimposed regular patterns on the facade (plank rows, butt joints,
// tile repeat) that no sampling trick can remove; the exterior walls needed a
// whole new set (`siding`) to escape it. The fort barracks survived that split
// precisely because it is a body box, not a wallX call — so this is keyed on
// geometry, not on how the surface was authored: any box tall and long enough
// to be a wall plane fails if its material carries the wood set. Thin planks
// (lintels, fence rails) and posts stay legal; floors and decks are horizontal.
const woodOnWalls = [];
for (const root of [...STRUCTURES, ...sceneAdds]) {
  walk(root, (node) => {
    if (!node.isMesh || node.geometry?.type !== "BoxGeometry" || node.material?.userData?.set !== "wood") {
      return;
    }
    const p = node.geometry.parameters;
    if (p.height >= 2.2 && Math.max(p.width, p.depth) >= 1.2) {
      woodOnWalls.push(`${label(node)} (${p.width}x${p.height}x${p.depth})`);
    }
  });
}
check(
  woodOnWalls.length === 0,
  "the `wood` set (a floor texture) clads a wall-scale box — walls and building bodies take `siding`: " + woodOnWalls.join(", ")
);

if (failures.length) {
  throw new Error("Building geometry invariants failed:\n  - " + failures.join("\n  - "));
}

console.log(JSON.stringify({
  structures: STRUCTURES.length,
  names: STRUCTURES.map((s) => s.userData.name),
  waterPlaced: WATER_PLACED.length,
  colliders: colliders.length
}, null, 2));
console.log("PASS");
