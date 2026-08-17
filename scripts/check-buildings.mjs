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
        const noop = () => {};
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
const { createLandmarks } = await import("../src/landmarks.js");
const { createInteriors } = await import("../src/interiors.js");
const { createShore } = await import("../src/shore.js");
const { createIndustry } = await import("../src/industry.js");
const { unmatedRequired, worldAnchor, anchorsOf } = await import("../src/buildings/anchors.js");
const { WATER, POS } = await import("../src/map.js");

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

bakeHeightfield();
clearColliders();
clearStructures();
const scene = { add() {} };
createRanch();
createLandmarks(scene);
createInteriors(scene);
createShore(scene);
createIndustry(scene);

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
  streetLot: 11,
  timberCabin: 3,
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

  // 9. Street alignment — lot yaw is parallel or anti-parallel to the street axis
  // (lots sit on either side, so a π flip is the other sidewalk).
  if (u.streetYaw !== undefined) {
    const diff = Math.abs(((u.yaw - u.streetYaw) % Math.PI + Math.PI) % Math.PI);
    check(
      diff < 0.05 || Math.abs(diff - Math.PI) < 0.05,
      `${label(s)} not aligned to the street (yaw ${u.yaw.toFixed(3)}, street ${u.streetYaw.toFixed(3)})`
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

    // Ranch smith: a shed on four equal walls leaves the high edge flying.
    // Town smith hides that edge with a false front.
    if (u.name === "blacksmith" && roof.userData.type === "shed") {
      const hasFalseFront = collect(s, (n) => n.userData.role === "falseFront").length > 0;
      check(
        hasFalseFront,
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
    const cos = Math.cos(u.yaw);
    const sin = Math.sin(u.yaw);
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

const church = STRUCTURES.find((s) => s.userData.name === "church");
if (church) {
  church.updateMatrixWorld(true);
  let churchDoor = null;
  church.traverse((n) => {
    if (churchDoor || n.userData?.role !== "wall") {
      return;
    }
    if (anchorsOf(n).get("opening.0")) {
      churchDoor = worldAnchor(n, "opening.0");
    }
  });
  check(Boolean(churchDoor), "church has no door opening");
  if (churchDoor) {
    const blocker = SILVER.find((s) => {
      if (s === church) {
        return false;
      }
      return footprintsOverlap(
        { x: churchDoor.position.x, z: churchDoor.position.z, w: 1.2, d: 1.2, yaw: 0 },
        s.userData,
        0
      );
    });
    check(
      !blocker,
      blocker
        ? `church door at (${churchDoor.position.x.toFixed(1)}, ${churchDoor.position.z.toFixed(1)}) is inside ${label(blocker)}`
        : "church door blocked"
    );
  }
}

const ranchSmith = STRUCTURES.find((s) => {
  if (s.userData.name !== "blacksmith") {
    return false;
  }
  return Math.hypot(s.userData.x - POS.ranch.x, s.userData.z - POS.ranch.z) < 80;
});
check(Boolean(ranchSmith), "ranch blacksmith is missing");
if (ranchSmith) {
  ranchSmith.updateMatrixWorld(true);
  let bay = null;
  ranchSmith.traverse((n) => {
    if (bay || n.userData?.role !== "wall") {
      return;
    }
    const opening = (n.userData.openings || []).find((o) => o.class === "bay");
    if (opening && anchorsOf(n).get("opening.0")) {
      bay = worldAnchor(n, "opening.0");
    }
  });
  check(Boolean(bay), "ranch blacksmith has no bay opening");
  if (bay) {
    const x0 = POS.ranch.x + 12;
    const x1 = POS.ranch.x + 42;
    const z0 = POS.ranch.z + 28;
    const z1 = POS.ranch.z + 48;
    const px = bay.position.x;
    const pz = bay.position.z;
    const inside = px >= x0 && px <= x1 && pz >= z0 && pz <= z1;
    const approachX = px + bay.normal.x * 2.5;
    const approachZ = pz + bay.normal.z * 2.5;
    const approachInside = approachX >= x0 && approachX <= x1 && approachZ >= z0 && approachZ <= z1;
    check(
      !inside && !approachInside,
      `ranch blacksmith bay at (${px.toFixed(1)}, ${pz.toFixed(1)}) opens into the corral`
    );
  }
}

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
