/**
 * The sheriff shipped a facade that looked right in Blender while its
 * synchronous JSON export inverted Y and Z, putting every runtime vertex below
 * and behind the lot. The store rides the same export path, so guard the
 * rendered asset's lot-local envelope, its attachment, the matching shell
 * apertures, and the door/goods collision contract offline.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
const { STORE } = await import("../src/buildings/store.js");

bakeHeightfield();
clearColliders();
const scene = new THREE.Scene();
createLandmarks(scene);
createInteriors(scene);
scene.updateMatrixWorld(true);

const lot = ENTERABLE_LOTS.find((candidate) => candidate.name === "store");
assert.ok(lot, "store lot missing");
assert.equal(lot.w, STORE.footprint.w, "store lot width drifted from the authored footprint");
assert.equal(lot.d, STORE.footprint.d, "store lot depth drifted from the authored footprint");
assert.deepEqual(lot.windows, STORE.frontWindows,
  "store procedural apertures drifted from the authored display windows");
// The kit only glazes an opening whose sill is at or above 0.5; a lower sill
// leaves the display windows as bare holes in the facade.
for (const win of STORE.frontWindows) {
  assert.ok(win.fromFloor >= 0.5,
    `store display sill ${win.fromFloor} is below the kit's glazing threshold`);
  assert.ok(Math.abs(win.x) + win.w / 2 < lot.w / 2 - 0.2,
    "store display window runs into the corner pilaster");
}

const model = lot.group.children.find((child) => child.name === "generalStore");
assert.ok(model, "store facade is not attached to its lot");
const expectedBatches = ["glass", "iron", "paint", "roof", "stone", "wood"];
assert.deepEqual(model.children.map((mesh) => mesh.name.split(".")[1]).sort(), expectedBatches,
  "store runtime material batches are incomplete");

const bounds = new THREE.Box3();
for (const mesh of model.children) {
  mesh.geometry.computeBoundingBox();
  bounds.union(mesh.geometry.boundingBox);
}
assert.ok(bounds.min.y >= -0.05 && bounds.max.y > 8.6,
  `store runtime export is below/inverted in Y (${bounds.min.y}..${bounds.max.y}); re-run store.py export()`);
assert.ok(bounds.min.z < -4.0 && bounds.max.z > 5.7,
  `store runtime export is reversed or does not reach the awning (${bounds.min.z}..${bounds.max.z}); re-run store.py export()`);
// The side treatment is applied to the outer face of the kit's own
// false-front returns, which already stand at |x| = 5.25, so the authored
// envelope is legitimately wider than the 9.5 m shell. It must not reach the
// neighbouring lot, though: the row is on 14 m centres.
assert.ok(bounds.min.x > -5.5 && bounds.max.x < 5.5,
  `store facade spills toward the neighbouring lot (${bounds.min.x}..${bounds.max.x})`);
assert.ok(bounds.min.x < -5.0 && bounds.max.x > 5.0,
  `store side treatment is inside the kit false-front returns and invisible (${bounds.min.x}..${bounds.max.x})`);
// The authored centre pediment is MEANT to stand above the kit's flat parapet
// -- that is what a false front's cap does -- but only just. Bound the
// overshoot instead of forbidding it, so the crown cannot quietly grow into a
// tower that dwarfs the rest of the row.
const parapet = lot.h + 3.2;
assert.ok(bounds.max.y > parapet - 0.3,
  `store sign board is hiding behind the kit parapet (${bounds.max.y} vs ${parapet})`);
// Pediment plus finial clear the kit's cap (which itself tops out at
// parapet + 0.18); anything much beyond that is a tower, not a crown.
assert.ok(bounds.max.y <= parapet + 0.60,
  `store crown overshoots the kit false front too far (${bounds.max.y} > ${parapet + 0.60})`);

const windowedFrontWalls = [];
const lintels = [];
lot.group.traverse((object) => {
  if (object.userData.role === "wall" && object.userData.openings?.length === 3) {
    windowedFrontWalls.push(object);
  }
  if (object.userData.role === "lintel") lintels.push(object);
});
assert.equal(windowedFrontWalls.length, 2,
  "store exterior and interior shells must both carry the door plus two matching display windows");
assert.ok(lintels.length > 0, "store interior shell lost its procedural door lintel");

const world = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(lot.group.matrixWorld);
const walkTo = (x, fromZ, toZ, y) => {
  const start = world(x, fromZ);
  // moveAndSlide resolves the requested endpoint rather than sweeping a long
  // segment, so finish where an ordinary movement step would.
  const end = world(x, toZ);
  return movementBlocked(start.x, start.z, end.x - start.x, end.z - start.z, 0.30, null, y);
};
const eye = lot.group.userData.placementY + 1.2;
assert.equal(walkTo(0, lot.d / 2 + 0.8, lot.d / 2, eye), false,
  "store doorway collision gap is blocked");
assert.equal(walkTo(STORE.frontWindows[0].x, lot.d / 2 + 0.8, lot.d / 2, eye), true,
  "store display window incorrectly opens a walk-through collision gap");

// The awning posts and the stock out front are authored geometry; they have to
// be solid, or the player walks through kegs and support posts.
const knee = lot.group.userData.placementY + 0.4;
for (const post of STORE.awningPosts) {
  assert.equal(walkTo(post.x, post.z + 0.7, post.z, knee), true,
    `store awning post at x=${post.x} is not solid`);
}
for (const item of STORE.boardwalkGoods) {
  assert.equal(walkTo(item.x, item.z + 0.8, item.z, knee), true,
    `store boardwalk goods at x=${item.x} are walk-through`);
}
// Above the awning posts the street has to stay open: a full-height collider
// would fence off the boardwalk.
const overhead = lot.group.userData.placementY + STORE.awningHeight + 0.5;
assert.equal(walkTo(STORE.awningPosts[0].x, STORE.awningPosts[0].z + 0.7,
  STORE.awningPosts[0].z, overhead), false,
  "store awning post collider extends above the awning and fences the boardwalk");

// ---------------------------------------------------------------------------
// The storeys: a sales floor and a storage loft behind the facade's loft door.
const { FLOOR, CEIL, UPPER, UPPER_CEIL, INNER, STAIR, LOFT_RAIL, LOFT_GATE, COUNTER } = STORE;
const st = lot.group;
const py = st.userData.placementY;
assert.ok(CEIL >= 2.3 && CEIL <= 3.2, `store ceiling ${CEIL} breaks the 2.3-3.2 invariant`);
assert.ok(Math.abs(UPPER - CEIL - 0.24) < 1e-9, "store loft floor is not the ceiling plus its structure");
const rise = (UPPER - FLOOR) / STAIR.risers;
assert.ok(rise >= 0.165 && rise <= 0.2, `store stair riser ${rise.toFixed(3)} outside 165-200 mm`);
assert.ok(STAIR.z0 - -INNER.z >= 0.9 && INNER.z - STAIR.z1 >= 0.9, "store stair lacks a landing");
assert.ok(UPPER_CEIL - UPPER >= 2.0, `store loft headroom ${(UPPER_CEIL - UPPER).toFixed(2)}`);
// The loft ceiling boards have to sit under the kit's roof, whose flat
// underside is at 5.74, or they are inside it.
assert.ok(UPPER_CEIL + 0.02 < 5.74, `store loft ceiling ${UPPER_CEIL} is inside the kit roof`);
// The loading gate must stay out of the street door's column, which
// check-interiors and check-buildings probe height-blind.
for (const r of LOFT_GATE) {
  const acrossDoor = r.x0 < 0.42 && r.x1 > -0.42;
  assert.ok(!acrossDoor || r.z1 < 2.28, `store loft gate crosses the street door's probe (${JSON.stringify(r)})`);
}

// The authored flue has to meet the cookstove model's own pipe, wherever the
// stove stands and however it is turned (rotation.y = yaw maps model +Z to +X).
{
  const { x, z, yaw, flueModel: m, flue } = STORE.STOVE;
  const fx = x + m.x * Math.cos(yaw) + m.z * Math.sin(yaw);
  const fz = z - m.x * Math.sin(yaw) + m.z * Math.cos(yaw);
  assert.ok(Math.hypot(fx - flue.x, fz - flue.z) < 0.01,
    `store flue ${JSON.stringify(flue)} is not over the cookstove model's pipe (${fx.toFixed(2)}, ${fz.toFixed(2)})`);
}

const interior = st.children.find((c) => c.name === "generalStoreInterior");
assert.ok(interior, "store interior not attached to its lot");
const inner = interior.children;
const ibox = new THREE.Box3();
for (const m of inner) { m.geometry.computeBoundingBox(); ibox.union(m.geometry.boundingBox); }
assert.ok(ibox.min.x > -INNER.x - 0.01 && ibox.max.x < INNER.x + 0.01 &&
  ibox.min.z > -INNER.z - 0.23 && ibox.max.z < INNER.z + 0.34,
  `store interior leaves the shell ${JSON.stringify(ibox)}`);
assert.ok(ibox.min.y > FLOOR - 0.1 && ibox.max.y < UPPER_CEIL + 0.1, `store interior height ${ibox.min.y}..${ibox.max.y}`);

const w3 = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(st.matrixWorld);
const probe = new THREE.Raycaster();
const boards = inner.filter((m) => !m.name.endsWith(".fabric"));
// Three samples 5 cm apart, keeping the highest: floorboards are 0.14 m wide
// with 3 mm gaps, and a single ray that lands in a gap (the store's loft probe
// at x 2.03 hit a board edge at 2.029) falls through to the ceiling below.
const surface = (x, z, fromY) => {
  let best = null;
  for (const dx of [-0.05, 0, 0.05]) {
    const p = w3(x + dx, z);
    probe.set(new THREE.Vector3(p.x, py + fromY, p.z), new THREE.Vector3(0, -1, 0));
    probe.far = 0.6;
    const hit = probe.intersectObjects(boards, false)[0];
    if (hit && (best === null || hit.point.y - py > best)) best = hit.point.y - py;
  }
  return best;
};
for (const [x, z, y, label] of [
  [0, 0, FLOOR, "sales floor"], [-2.0, 2.6, FLOOR, "sales floor by the window"], [0.5, -2.9, FLOOR, "sales floor at the back"],
  [2.0, 1.0, UPPER, "loft"], [-2.5, -2.5, UPPER, "loft over the back"], [3.0, -1.0, UPPER, "loft east"]
]) {
  const top = surface(x + 0.03, z + 0.05, y + 0.3);
  assert.ok(top !== null && Math.abs(top - y) < 0.012, `store ${label}: boards at ${top} not ${y}`);
  const p = w3(x, z);
  assert.ok(Math.abs(deckHeightAt(p.x, p.z, py + y + 0.1, 0.4) - py - y) < 0.012, `store ${label}: deck does not register the boards`);
}
const tread = (STAIR.z1 - STAIR.z0) / (STAIR.risers - 1);
for (let k = 1; k < STAIR.risers; k += 1) {
  const z = STAIR.z0 + (k - 0.5) * tread;
  const y = FLOOR + k * rise;
  const top = surface((STAIR.x0 + STAIR.x1) / 2, z, y + 0.3);
  assert.ok(top !== null && Math.abs(top - y) < 0.012, `store tread ${k} at ${top} not ${y}`);
  const p = w3((STAIR.x0 + STAIR.x1) / 2, z);
  assert.ok(Math.abs(deckHeightAt(p.x, p.z, py + y, 0.4) - py - y) <= rise / 2 + 0.01, `store tread ${k} off the stair ramp`);
}
for (const [x, z, y, ceil, label] of [[0, 0, FLOOR, CEIL, "sales floor"], [2.0, 1.0, UPPER, UPPER_CEIL, "loft"]]) {
  const p = w3(x, z);
  probe.set(new THREE.Vector3(p.x, py + y + 1.5, p.z), new THREE.Vector3(0, 1, 0));
  probe.far = 3.5;
  const hit = probe.intersectObjects(inner, false)[0];
  assert.ok(hit && Math.abs(hit.point.y - py - ceil) < 0.07, `store ${label}: ceiling at ${hit && hit.point.y - py}, not ${ceil}`);
  assert.ok(Math.abs(interiorCeilingAt(p.x, p.z, py + y) - py - ceil) < 0.01,
    `store ${label}: camera ceiling ${interiorCeilingAt(p.x, p.z, py + y) - py}`);
}
{
  const [wx0, wx1, wz0, wz1] = STAIR.well;
  const p = w3((wx0 + wx1) / 2, (wz0 + wz1) / 2);
  assert.ok(Math.abs(interiorCeilingAt(p.x, p.z, py + 2) - py - UPPER_CEIL) < 0.01, "store camera still ducks under the loft over the stairwell");
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
const salesY = stroll([[0, 6.0], [0, 4.2], [0, 1.0], [-1.0, 0.0]], "the sales floor through the street door");
assert.ok(Math.abs(salesY - FLOOR) < 0.02, `walker stands at ${salesY} on the sales floor`);
const sx = (STAIR.x0 + STAIR.x1) / 2;
const climb = [[0, 6.0], [0, 2.5], [-2.8, -2.85], [sx, -2.85], [sx, 1.6], [sx, 2.8]];
const topY = stroll(climb, "the top of the loft stair");
assert.ok(Math.abs(topY - UPPER) < 0.02, `walker at the stair top stands at ${topY}, not ${UPPER}`);
const loftY = stroll([...climb, [-2.5, 2.8], [-2.5, 1.4], [2.0, 1.4], [2.0, -1.8]], "the back of the loft");
assert.ok(Math.abs(loftY - UPPER) < 0.02, `walker in the loft stands at ${loftY}, not ${UPPER}`);
stroll([[0, 6.0], [0, 2.5], [-2.8, 0.2], [sx, 0.2]], "the space under the stair", true);
stroll([...climb, [-2.5, 2.8], [-2.5, 0.5], [sx, 0.5]], "a fall into the stairwell from the loft", true);
stroll([...climb, [-2.5, 2.8], [-2.5, 1.4], [0, 1.4], [0, 4.6]], "the street through the closed loft door", true);
stroll([[0, 6.0], [0, 0.5], [1.6, 0.5], [3.6, 0.5]], "the clerk's side through the counter", true);


// The closet door in the stair's spandrel has to be backed by spandrel: the
// kit used to pin it 0.35 m from the foot of the flight, where the boarding is
// one step high, and drew the leaf its full height anyway -- a door standing in
// the open air of the the store (reported in game, the store, 2026-09-17).
{
  const model = JSON.parse(readFileSync(new URL("../src/models/general-store-interior.json", import.meta.url), "utf8"));
  const closet = model.stairCloset;
  assert.ok(closet, "store interior lost its under-stair closet door");
  const tread = (STAIR.z1 - STAIR.z0) / (STAIR.risers - 1);
  const riser = (UPPER - FLOOR) / STAIR.risers;
  const spandrel = (z) => ((z - STAIR.z0) / tread) * riser - 0.05;
  assert.ok(spandrel(closet.z0) >= closet.h,
    `store closet door at z ${closet.z0.toFixed(2)} stands in open air: spandrel ${spandrel(closet.z0).toFixed(2)} m under a ${closet.h} m leaf`);
  assert.ok(closet.z1 < STAIR.z1, `store closet door runs past the top of the flight`);
}

const triangles = model.children.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
console.log(JSON.stringify({
  bounds: { min: bounds.min.toArray().map((v) => +v.toFixed(2)), max: bounds.max.toArray().map((v) => +v.toFixed(2)) },
  triangles,
  windows: lot.windows.length
}));
console.log("PASS");
