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

const { bakeHeightfield } = await import("../src/heightfield.js");
const { clearColliders, movementBlocked } = await import("../src/collision.js");
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

const triangles = model.children.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
console.log(JSON.stringify({ bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, triangles, windows: lot.windows.length }));
console.log("PASS");
