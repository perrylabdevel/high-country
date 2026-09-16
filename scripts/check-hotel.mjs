/**
 * The sheriff shipped a facade that looked right in Blender while its
 * synchronous JSON export inverted Y and Z, putting every runtime vertex below
 * and behind the lot; the store shipped a first pass whose entire crown was
 * hidden inside kit geometry. The hotel rides the same export path and has
 * MORE kit to collide with -- a gable roof overhanging to z 4.95 and |x| 5.95,
 * and a foundation jutting to z 4.70 -- so guard the rendered asset's envelope,
 * its attachment, the six new apertures and the gallery collision contract
 * offline.
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
const { HOTEL } = await import("../src/buildings/hotel.js");

bakeHeightfield();
clearColliders();
const scene = new THREE.Scene();
createLandmarks(scene);
createInteriors(scene);
scene.updateMatrixWorld(true);

const lot = ENTERABLE_LOTS.find((candidate) => candidate.name === "hotel");
assert.ok(lot, "hotel lot missing");
assert.equal(lot.w, HOTEL.footprint.w, "hotel lot width drifted from the authored footprint");
assert.equal(lot.d, HOTEL.footprint.d, "hotel lot depth drifted from the authored footprint");
assert.deepEqual(lot.windows, HOTEL.frontWindows,
  "hotel procedural apertures drifted from the authored gallery elevation");
assert.deepEqual(lot.backWindows, HOTEL.backWindows,
  "hotel procedural back apertures drifted from the authored back elevation");
// The wall shipped with nothing in it but a door. These apertures are the
// point of the change, so losing them is a regression, not a tidy-up: six
// windows and the gallery door in front, and one back window per upstairs room
// plus two for the parlour -- the upper front row lights the HALL, so without
// the back row every room is a dark box.
const frontGlazed = HOTEL.frontWindows.filter((o) => o.class !== "door");
const galleryDoor = HOTEL.frontWindows.filter((o) => o.class === "door");
assert.equal(frontGlazed.length, 6, "hotel lost the front windows its blank wall needed");
assert.equal(galleryDoor.length, 1, "hotel lost the door out onto its gallery");
assert.equal(HOTEL.backWindows.length, 5, "hotel lost the back windows that light its rooms");
// The gallery door is a level threshold onto the deck, like the saloon's.
assert.equal(galleryDoor[0].fromFloor, HOTEL.UPPER,
  `hotel gallery door sill ${galleryDoor[0].fromFloor} is not level with the upper floor ${HOTEL.UPPER}`);
for (const win of [...HOTEL.frontWindows, ...HOTEL.backWindows]) {
  // The kit only glazes an opening whose sill is at or above 0.5.
  if (win.class !== "door") {
    assert.ok(win.fromFloor >= 0.5,
      `hotel sill ${win.fromFloor} is below the kit's glazing threshold`);
  }
  assert.ok(Math.abs(win.x) + win.w / 2 < lot.w / 2 - 0.2,
    `hotel window at x=${win.x} runs into the corner board`);
  assert.ok(win.fromFloor + win.h < lot.h - 0.4,
    `hotel window at ${win.fromFloor} runs into the eave`);
}

const model = lot.group.children.find((child) => child.name === "hotelBuilding");
assert.ok(model, "hotel facade is not attached to its lot");
const expectedBatches = ["glass", "iron", "paint", "roof", "stone", "wood"];
assert.deepEqual(model.children.map((mesh) => mesh.name.split(".")[1]).sort(), expectedBatches,
  "hotel runtime material batches are incomplete");

const bounds = new THREE.Box3();
for (const mesh of model.children) {
  mesh.geometry.computeBoundingBox();
  bounds.union(mesh.geometry.boundingBox);
}
assert.ok(bounds.min.y >= -0.05, `hotel export dips below the lot floor (${bounds.min.y})`);
assert.ok(bounds.min.z < -4.5,
  `hotel export is reversed in Z or lost its back elevation (${bounds.min.z})`);

// The chimneys are the top of the authored work; the kit ridge is at
// h + ((d + 0.9) / 2) * 0.5. Buried chimneys mean the export inverted Y.
const ridge = lot.h + ((lot.d + 0.9) / 2) * 0.5;
assert.ok(bounds.max.y > ridge + 0.8,
  `hotel chimneys are buried in the kit roof (${bounds.max.y} vs ridge ${ridge}); re-run hotel.py export()`);
assert.ok(bounds.max.y <= ridge + 2.2,
  `hotel chimneys have grown into a tower (${bounds.max.y} > ${ridge + 2.2})`);

// The gallery is the furthest thing toward the street and has to land ON the
// boardwalk, whose deck runs from the frontage line out 4 m.
assert.ok(bounds.max.z > 7.5,
  `hotel gallery does not reach the boardwalk (${bounds.max.z}); re-run hotel.py export()`);
assert.ok(bounds.max.z < lot.d / 2 + 4.0,
  `hotel gallery overshoots the boardwalk into the street (${bounds.max.z})`);

// Side treatment sits just outside the 11 m shell, but the row is on 14 m
// centres and the kit roof already overhangs to |x| 5.95.
assert.ok(bounds.min.x > -6.2 && bounds.max.x < 6.2,
  `hotel facade spills toward the neighbouring lot (${bounds.min.x}..${bounds.max.x})`);
assert.ok(bounds.min.x < -5.5 && bounds.max.x > 5.5,
  `hotel side treatment never reaches the gable ends (${bounds.min.x}..${bounds.max.x})`);

const windowedFrontWalls = [];
const windowedBackWalls = [];
const lintels = [];
lot.group.traverse((object) => {
  if (object.userData.role === "wall" && object.userData.openings?.length === 1 + HOTEL.frontWindows.length) {
    windowedFrontWalls.push(object);
  }
  if (object.userData.role === "wall" && object.userData.openings?.length === HOTEL.backWindows.length) {
    windowedBackWalls.push(object);
  }
  if (object.userData.role === "lintel") lintels.push(object);
});
assert.equal(windowedFrontWalls.length, 2,
  "hotel exterior and interior shells must both carry the door, six windows and the gallery door");
assert.equal(windowedBackWalls.length, 2,
  "hotel exterior and interior shells must both carry the five back windows");
assert.ok(lintels.length > 0, "hotel interior shell lost its procedural door lintel");

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
  "hotel doorway collision gap is blocked");
assert.equal(walkTo(HOTEL.frontWindows[0].x, lot.d / 2 + 0.8, lot.d / 2, eye), true,
  "hotel window incorrectly opens a walk-through collision gap");

// The gallery posts and the furniture under them are authored geometry: solid,
// or the player walks through them.
const knee = lot.group.userData.placementY + 0.4;
for (const post of HOTEL.galleryPosts) {
  assert.equal(walkTo(post.x, post.z + 0.7, post.z, knee), true,
    `hotel gallery post at x=${post.x} is not solid`);
}
for (const item of HOTEL.galleryFurniture) {
  assert.equal(walkTo(item.x, item.z + 0.8, item.z, knee), true,
    `hotel gallery furniture at x=${item.x} is walk-through`);
}
// The player still has to get between the posts to the door: a six-post
// colonnade that fenced the frontage would make the hotel unenterable.
const gap = (HOTEL.galleryPosts[2].x + HOTEL.galleryPosts[3].x) / 2;
assert.equal(walkTo(gap, HOTEL.galleryPosts[2].z + 0.7, HOTEL.galleryPosts[2].z - 0.7, knee), false,
  "hotel gallery colonnade leaves no gap to walk through to the door");

// ---------------------------------------------------------------------------
// The interior, two storeys. Mirrors check-saloon's interior guards.
const { FLOOR, CEIL, UPPER, UPPER_CEIL, INNER, STAIR, GALLERY } = HOTEL;
const st = lot.group;
const py = st.userData.placementY;

// The storey section is the saloon's, and it has to satisfy check-buildings'
// habitable-ceiling invariant. A first pass put the lobby ceiling at 3.46.
assert.ok(CEIL >= 2.3 && CEIL <= 3.2, `hotel lobby ceiling ${CEIL} breaks the 2.3-3.2 invariant`);
assert.ok(Math.abs(UPPER - CEIL - 0.24) < 1e-9, "hotel upper floor is not the ground ceiling plus its structure");
const rise = (UPPER - FLOOR) / STAIR.risers;
assert.ok(rise >= 0.165 && rise <= 0.2, `hotel stair riser ${rise.toFixed(3)} outside 165-200 mm`);
assert.ok(STAIR.z0 - -INNER.z >= 0.9, "hotel stair has no landing at its foot");

const interior = st.children.find((c) => c.name === "hotelInterior");
assert.ok(interior, "hotel interior not attached to its lot");
const inner = interior.children;
const ibox = new THREE.Box3();
for (const m of inner) { m.geometry.computeBoundingBox(); ibox.union(m.geometry.boundingBox); }
assert.ok(ibox.min.x > -INNER.x - 0.01 && ibox.max.x < INNER.x + 0.01 &&
  ibox.min.z > -INNER.z - 0.23 && ibox.max.z < INNER.z + 0.34,
  `hotel interior leaves the shell ${JSON.stringify(ibox)}`);
assert.ok(ibox.min.y > FLOOR - 0.1 && ibox.max.y < UPPER_CEIL + 0.1,
  `hotel interior height ${ibox.min.y}..${ibox.max.y}`);

const w3 = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(st.matrixWorld);
const probe = new THREE.Raycaster();
// Probe the BOARDS, not what lies on them. Rugs are 12 mm of fabric dressing
// on the floor -- a walker's feet sit in them, as they would -- so a probe that
// read the rug reported the lobby floor at 0.112 instead of its boards at 0.100.
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
// Boards where the decks say the floor is, on both storeys.
for (const [x, z, y, label] of [
  [0, 0, FLOOR, "lobby"], [-2.2, 3.0, FLOOR, "lobby by the window"], [1.0, -3.5, FLOOR, "parlour"],
  [-3.0, 2.8, UPPER, "hall"], [-2.5, -1.5, UPPER, "room 1"], [0.6, -1.5, UPPER, "room 2"], [3.7, -1.5, UPPER, "room 3"]
]) {
  const top = surface(x + 0.03, z + 0.05, y + 0.3);
  assert.ok(top !== null && Math.abs(top - y) < 0.012, `hotel ${label}: boards at ${top} not ${y}`);
  const p = w3(x, z);
  assert.ok(Math.abs(deckHeightAt(p.x, p.z, py + y + 0.1, 0.4) - py - y) < 0.012,
    `hotel ${label}: deck does not register the boards`);
}
// Every tread where the stair ramp says it is.
const tread = (STAIR.z1 - STAIR.z0) / (STAIR.risers - 1);
for (let k = 1; k < STAIR.risers; k += 1) {
  const z = STAIR.z0 + (k - 0.5) * tread;
  const y = FLOOR + k * rise;
  const top = surface((STAIR.x0 + STAIR.x1) / 2, z, y + 0.3);
  assert.ok(top !== null && Math.abs(top - y) < 0.012, `hotel tread ${k} at ${top} not ${y}`);
  const p = w3((STAIR.x0 + STAIR.x1) / 2, z);
  assert.ok(Math.abs(deckHeightAt(p.x, p.z, py + y, 0.4) - py - y) <= rise / 2 + 0.01,
    `hotel tread ${k} off the stair ramp`);
}
// Ceilings closed, and the camera knows each storey.
const up = new THREE.Vector3(0, 1, 0);
for (const [x, z, y, ceil, label] of [
  [0, 0, FLOOR, CEIL, "lobby"], [-2.5, -1.5, UPPER, UPPER_CEIL, "room 1"], [0, 2.8, UPPER, UPPER_CEIL, "hall"]
]) {
  const p = w3(x, z);
  probe.set(new THREE.Vector3(p.x, py + y + 1.5, p.z), up);
  probe.far = 3.5;
  const hit = probe.intersectObjects(inner, false)[0];
  assert.ok(hit && Math.abs(hit.point.y - py - ceil) < 0.07,
    `hotel ${label}: ceiling at ${hit && hit.point.y - py}, not ${ceil}`);
  assert.ok(Math.abs(interiorCeilingAt(p.x, p.z, py + y) - py - ceil) < 0.01,
    `hotel ${label}: camera ceiling ${interiorCeilingAt(p.x, p.z, py + y) - py}`);
}
{
  const [wx0, wx1, wz0, wz1] = STAIR.well;
  const p = w3((wx0 + wx1) / 2, (wz0 + wz1) / 2);
  assert.ok(Math.abs(interiorCeilingAt(p.x, p.z, py + 2) - py - UPPER_CEIL) < 0.01,
    "hotel camera still ducks under the floor over the stairwell");
}

// A walker from the street reaches the lobby, climbs to the hall, enters every
// room and walks out onto the gallery -- and cannot get under the stair,
// through a partition, into the stairwell, or off the gallery.
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
const lobbyY = stroll([[0, 6.4], [0, 4.6], [0, 1.5], [-1.0, -0.5]], "the lobby through the street door");
assert.ok(Math.abs(lobbyY - FLOOR) < 0.02, `walker stands at ${lobbyY} in the lobby, not on the boards`);
const sx = (STAIR.x0 + STAIR.x1) / 2;
const climb = [[0, 6.4], [0, 3.0], [-3.3, -3.5], [sx, -3.55], [sx, 0.9], [sx, 2.3]];
const hallY = stroll(climb, "the upstairs hall by the stair");
assert.ok(Math.abs(hallY - UPPER) < 0.02, `walker upstairs stands at ${hallY}, not ${UPPER}`);
for (const [d, label] of [[-2.5, "room 1"], [0.6, "room 2"], [3.71, "room 3"]]) {
  stroll([...climb, [d, 2.2], [d, 0.6], [d, -1.5]], label);
}
const galleryY = stroll([...climb, [0, 2.6], [0, 4.6], [2.5, 6.2]], "the gallery through its door");
assert.ok(Math.abs(galleryY - UPPER) < 0.02, `walker on the gallery stands at ${galleryY}, not on its deck`);
stroll([[0, 6.4], [0, 3.0], [-3.0, 0.4], [sx, 0.4]], "the space under the stair", true);
stroll([...climb, [-1.6, 2.2], [-1.6, 0.6]], "room 1 straight through the hall partition", true);
stroll([...climb, [-2.5, 2.2], [-2.5, 0.6], [-3.0, -0.5], [sx, -0.5]], "the stairwell from room 1", true);
stroll([...climb, [0, 2.6], [0, 4.6], [2.5, 6.2], [2.5, GALLERY.rail + 1.4]], "a fall off the gallery", true);

const triangles = model.children.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
console.log(JSON.stringify({
  bounds: {
    min: bounds.min.toArray().map((v) => +v.toFixed(2)),
    max: bounds.max.toArray().map((v) => +v.toFixed(2))
  },
  ridge: +ridge.toFixed(2),
  triangles,
  windows: lot.windows.length
}));
console.log("PASS");
