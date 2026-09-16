/**
 * The sheriff shipped a facade that looked right in Blender while its
 * synchronous JSON export inverted Y and Z, putting every runtime vertex below
 * and behind the lot. The store rides the same export path, so guard the
 * rendered asset's lot-local envelope, its attachment, the matching shell
 * apertures, and the door/goods collision contract offline.
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

const { bakeHeightfield } = await import("../src/heightfield.js");
const { clearColliders, movementBlocked } = await import("../src/collision.js");
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

const triangles = model.children.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
console.log(JSON.stringify({
  bounds: { min: bounds.min.toArray().map((v) => +v.toFixed(2)), max: bounds.max.toArray().map((v) => +v.toFixed(2)) },
  triangles,
  windows: lot.windows.length
}));
console.log("PASS");
