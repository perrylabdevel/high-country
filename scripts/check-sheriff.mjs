/**
 * The sheriff looked complete in Blender/GLB while its synchronous JSON export
 * silently inverted Y and Z, placing every runtime vertex below and behind the
 * lot. Guard the rendered asset's lot-local envelope, its attachment, matching
 * shell apertures, and the unchanged door/window collision contract offline.
 */
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";

globalThis.document = {
  createElement: () => ({
    width: 256,
    height: 256,
    getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) })
  })
};

const { bakeHeightfield, heightAt } = await import("../src/heightfield.js");
const { clearColliders, deckHeightAt, moveAndSlide, movementBlocked } = await import("../src/collision.js");
const { interiorCeilingAt } = await import("../src/buildings/kit.js");
const { createLandmarks, ENTERABLE_LOTS } = await import("../src/landmarks.js");
const { createInteriors } = await import("../src/interiors.js");
const { SHERIFF_REMODEL } = await import("../src/buildings/sheriff.js");

bakeHeightfield();
clearColliders();
const scene = new THREE.Scene();
createLandmarks(scene);
createInteriors(scene);
scene.updateMatrixWorld(true);

const lot = ENTERABLE_LOTS.find((candidate) => candidate.name === "sheriff");
assert.ok(lot, "sheriff lot missing");
assert.deepEqual(lot.windows, SHERIFF_REMODEL.frontWindows,
  "sheriff procedural apertures drifted from the authored facade windows");

const model = lot.group.children.find((child) => child.name === "sheriffRemodel");
assert.ok(model, "sheriff remodel is not attached to its lot");
const expectedBatches = ["glass", "iron", "paint", "roof", "stone", "wood"];
assert.deepEqual(model.children.map((mesh) => mesh.name.split(".")[1]).sort(), expectedBatches,
  "sheriff runtime material batches are incomplete");

const bounds = new THREE.Box3();
for (const mesh of model.children) {
  mesh.geometry.computeBoundingBox();
  bounds.union(mesh.geometry.boundingBox);
}
assert.ok(bounds.min.y >= -0.01 && bounds.max.y > 7.4,
  `sheriff runtime export is below/inverted in Y (${bounds.min.y}..${bounds.max.y}); rebuild with blender --background --python scripts/blender-sheriff-building/sheriff_building.py`);
assert.ok(bounds.min.z < -4.0 && bounds.max.z > 5.4,
  `sheriff runtime export is reversed or does not reach the street canopy (${bounds.min.z}..${bounds.max.z}); rebuild the authored export`);
// The kit's own false-front returns already stand at |x| = 5.00, and the side
// jail windows are applied to their OUTER face -- at the wall plane the whole
// assembly was inside the return and never rendered (check:occlusion measured
// 63% of the iron batch buried). So the authored envelope is legitimately
// wider than the 9 m shell; what matters is that it does not reach the
// neighbours, which sit on 14 m centres.
assert.ok(bounds.min.x > -5.35 && bounds.max.x < 5.35,
  `sheriff remodel spills toward the neighbouring lot (${bounds.min.x}..${bounds.max.x})`);
assert.ok(bounds.min.x < -5.05,
  `sheriff side jail detail is inside the kit false-front return and invisible (${bounds.min.x})`);

const windowedFrontWalls = [];
const lintels = [];
lot.group.traverse((object) => {
  if (object.userData.role === "wall" && object.userData.openings?.length === 3) {
    windowedFrontWalls.push(object);
  }
  if (object.userData.role === "lintel") lintels.push(object);
});
assert.equal(windowedFrontWalls.length, 2,
  "sheriff exterior and interior shells must both carry the door plus two matching windows");
assert.ok(lintels.length > 0, "sheriff interior shell lost its procedural door lintel");

const world = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(lot.group.matrixWorld);
const crossing = (x) => {
  const start = world(x, lot.d / 2 + 0.8);
  // moveAndSlide resolves the requested endpoint rather than sweeping a long
  // segment, so finish on the wall plane as an ordinary movement step would.
  const end = world(x, lot.d / 2);
  return movementBlocked(start.x, start.z, end.x - start.x, end.z - start.z, 0.30, null,
    lot.group.userData.placementY + 1.2);
};
assert.equal(crossing(0), false, "sheriff doorway collision gap is blocked");
assert.equal(crossing(SHERIFF_REMODEL.frontWindows[0].x), true,
  "sheriff window incorrectly opens a walk-through collision gap");

// ---------------------------------------------------------------------------
// The interior: an office and two cells under the kit's ceiling slab.
const { FLOOR, CEIL, INNER, CELLS, DESK, STOVE, FLUE } = SHERIFF_REMODEL;
const g = lot.group;
const py = g.userData.placementY;
assert.ok(!g.userData.storeys, "sheriff is single-storey; the kit's floor deck and ceiling must stay");
let slab = null;
g.traverse((n) => { if (n.userData.role === "ceiling") slab = n; });
assert.ok(slab && Math.abs(slab.userData.height - 0.08 - CEIL) < 1e-6,
  `sheriff CEIL ${CEIL} is not the underside of the kit ceiling slab (${slab?.userData.height})`);

const interior = g.children.find((c) => c.name === "sheriffInterior");
assert.ok(interior, "sheriff interior not attached to its lot");
assert.deepEqual(interior.children.map((m) => m.name.split(".")[1]).sort(),
  ["brass", "fabric", "floor", "glass", "iron", "paint", "timber"], "sheriff interior batches are incomplete");
const ibox = new THREE.Box3();
for (const m of interior.children) { m.geometry.computeBoundingBox(); ibox.union(m.geometry.boundingBox); }
assert.ok(ibox.min.x > -INNER.x - 0.01 && ibox.max.x < INNER.x + 0.01 &&
  ibox.min.z > -INNER.z - 0.01 && ibox.max.z < INNER.z + 0.34,
  `sheriff interior leaves the shell ${JSON.stringify(ibox)}`);
assert.ok(ibox.min.y > FLOOR - 0.06 && ibox.max.y <= CEIL + 0.001,
  `sheriff interior pierces the floor or the kit ceiling (${ibox.min.y}..${ibox.max.y})`);

// The cells stand under the exterior's barred windows (sheriff_building.py
// side_jail_detail, z -1.55 and 0.15), one window to a cell, and the bar front
// leaves the street door's column alone.
const cellsZ = [[-INNER.z, CELLS.divider], [CELLS.divider, CELLS.end]];
[-1.55, 0.15].forEach((z, i) => {
  const w = CELLS.windows[i];
  assert.equal(w.z, z, `sheriff cell window ${i} is not under the exterior barred window`);
  assert.ok(w.z - w.w / 2 > cellsZ[i][0] + 0.1 && w.z + w.w / 2 < cellsZ[i][1] - 0.1,
    `sheriff cell window ${i} straddles a cell wall`);
});
for (const d of CELLS.doors) {
  assert.ok(d.z1 - d.z0 >= 0.9, "sheriff cell door narrower than a walker");
  assert.ok(cellsZ.some(([a, b]) => d.z0 > a + 0.1 && d.z1 < b - 0.1), "sheriff cell door opens onto a cell wall");
}
assert.ok(CELLS.end < INNER.z - 1.5, "sheriff cells crowd the street door");
assert.deepEqual([FLUE.x, FLUE.z], [STOVE.x, STOVE.z], "sheriff roof flue is not over the stove");
{
  // The exterior carries the pipe on out of the roof at the same point.
  const iron = model.children.find((m) => m.name.endsWith(".iron")).geometry.attributes.position;
  let pipe = 0;
  for (let i = 0; i < iron.count; i += 1) {
    if (Math.hypot(iron.getX(i) - FLUE.x, iron.getZ(i) - FLUE.z) < 0.2 && iron.getY(i) > 5.5) pipe += 1;
  }
  assert.ok(pipe > 12, "sheriff exterior has no stovepipe over the office stove");
}

const w3 = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(g.matrixWorld);
const probe = new THREE.Raycaster();
const boards = interior.children.filter((m) => m.name.endsWith(".floor"));
for (const [x, z, label] of [[0, 0, "office"], [2.8, 2.6, "office by the east window"], [-3.0, -2.8, "cell A"], [-2.8, 0.9, "cell B"]]) {
  let top = null;
  for (const dx of [-0.05, 0, 0.05]) {
    const p = w3(x + dx, z + 0.05);
    probe.set(new THREE.Vector3(p.x, py + FLOOR + 0.3, p.z), new THREE.Vector3(0, -1, 0));
    probe.far = 0.6;
    const hit = probe.intersectObjects(boards, false)[0];
    if (hit && (top === null || hit.point.y - py > top)) top = hit.point.y - py;
  }
  assert.ok(top !== null && Math.abs(top - FLOOR) < 0.012, `sheriff ${label}: boards at ${top} not ${FLOOR}`);
  const p = w3(x, z);
  assert.ok(Math.abs(deckHeightAt(p.x, p.z, py + FLOOR + 0.1, 0.4) - py - FLOOR) < 0.012, `sheriff ${label}: deck does not register the boards`);
  probe.set(new THREE.Vector3(p.x, py + FLOOR + 1.5, p.z), new THREE.Vector3(0, 1, 0));
  probe.far = 2;
  const up = probe.intersectObjects(interior.children, false)[0];
  assert.ok(up && CEIL - (up.point.y - py) < 0.03, `sheriff ${label}: ceiling boards at ${up && up.point.y - py}, not ${CEIL}`);
  assert.ok(Math.abs(interiorCeilingAt(p.x, p.z, py + FLOOR) - py - CEIL - 0.08) < 0.09,
    `sheriff ${label}: camera ceiling ${interiorCeilingAt(p.x, p.z, py + FLOOR) - py}`);
}

// No bare kit wall inside. The shell is stone, and every gap in the authored
// finish shows as grey rock: the kit's finishes dropped a whole 0.3 m panel
// wherever one touched an opening, and its casing left the band over each
// opening's head uncovered. Cast at every wall on a 10 cm grid, floor to
// ceiling, from 1 m into the room, and require the first thing hit to be the
// authored interior -- except through a real opening.
{
  const kit = [];
  g.traverse((o) => { if (o.isMesh) kit.push(o); });
  const inv = g.matrixWorld.clone().invert();
  const openings = [{ x: 0, w: 0.92, h: 2.1, fromFloor: 0 }, ...SHERIFF_REMODEL.frontWindows];
  const bare = [];
  const walls = [
    { along: "x", at: INNER.z, n: [0, 0, 1], through: (u, y) => openings.some((o) => Math.abs(u - o.x) < o.w / 2 && y > o.fromFloor && y < o.fromFloor + o.h) },
    { along: "x", at: -INNER.z, n: [0, 0, -1], through: () => false },
    { along: "z", at: INNER.x, n: [1, 0, 0], through: () => false },
    { along: "z", at: -INNER.x, n: [-1, 0, 0], through: () => false }
  ];
  for (const wall of walls) {
    const span = wall.along === "x" ? INNER.x : INNER.z;
    for (let u = -span + 0.05; u < span; u += 0.1) {
      for (let y = FLOOR + 0.05; y < CEIL; y += 0.1) {
        if (wall.through(u, y)) continue;
        // Three rays 1 cm apart: beadboard has 8 mm grooves, and a single ray
        // down one reads a groove as a missing board.
        let hit = null;
        for (const du of [-0.01, 0, 0.01]) {
          const inside = wall.along === "x" ? [u + du, y, wall.at - wall.n[2]] : [wall.at - wall.n[0], y, u + du];
          probe.set(new THREE.Vector3(...inside).applyMatrix4(g.matrixWorld), new THREE.Vector3(...wall.n).transformDirection(g.matrixWorld));
          probe.far = 1.3;
          hit = probe.intersectObjects(kit, false)[0];
          if (!hit || hit.object.name.startsWith("sheriffInterior.")) break;
        }
        if (hit && !hit.object.name.startsWith("sheriffInterior.")) {
          bare.push(`${wall.along === "x" ? "x" : "z"} ${u.toFixed(2)} y ${y.toFixed(2)} (${hit.object.userData.role ?? hit.object.name})`);
        }
      }
    }
  }
  assert.ok(bare.length === 0, `sheriff kit wall bare inside at ${bare.length} points: ${bare.slice(0, 12).join("; ")}`);
}

function stroll(path, label, blocked = false) {
  const start = w3(...path[0]);
  const w = { x: start.x, z: start.z, y: Math.max(heightAt(start.x, start.z), deckHeightAt(start.x, start.z, py + 0.5, 1.4)) };
  let t;
  for (const [lx, lz] of path.slice(1)) {
    t = w3(lx, lz);
    for (let i = 0; i < 1600; i += 1) {
      const dx = t.x - w.x;
      const dz = t.z - w.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.06) break;
      const s = Math.min(0.05, d);
      const n = moveAndSlide(w.x, w.z, (dx / d) * s, (dz / d) * s, 0.42, null, w.y);
      const ground = Math.max(heightAt(n.x, n.z), deckHeightAt(n.x, n.z, w.y, 0.45));
      if (ground > w.y + 0.3) break;
      w.x = n.x; w.z = n.z; w.y = ground;
    }
  }
  const off = Math.hypot(t.x - w.x, t.z - w.z);
  if (blocked) assert.ok(off > 0.3, `walker got into ${label}`);
  else assert.ok(off < 0.3, `walker could not reach ${label} (off by ${off.toFixed(2)})`);
  return w.y - py;
}
const officeY = stroll([[0, 6.0], [0, 4.2], [0, 1.2], [2.8, 1.0]], "the office through the street door");
assert.ok(Math.abs(officeY - FLOOR) < 0.02, `walker stands at ${officeY} in the office`);
const open = CELLS.doors.find((d) => d.open);
const shut = CELLS.doors.find((d) => !d.open);
assert.ok(open && shut, "sheriff needs one cell door standing open and one locked");
const midOpen = (open.z0 + open.z1) / 2;
const midShut = (shut.z0 + shut.z1) / 2;
stroll([[0, 6.0], [0, 2.5], [-0.6, midOpen], [-3.0, midOpen]], "cell A through its open door");
stroll([[0, 6.0], [0, 2.5], [-0.8, midShut], [-3.0, midShut]], "cell B through its locked door", true);
stroll([[0, 6.0], [0, 2.5], [0.2, -3.1], [-3.0, -3.1]], "cell A through the bars", true);
stroll([[0, 6.0], [0, 3.0], [-3.0, 2.9], [-3.0, 0.8]], "cell B through its street-end bars", true);
stroll([[0, 6.0], [0, 2.5], [DESK.x, 1.2], [DESK.x, -1.5]], "the sheriff's chair through the desk", true);

const triangles = model.children.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
console.log(JSON.stringify({ bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, triangles, windows: lot.windows.length }));
console.log("PASS");
