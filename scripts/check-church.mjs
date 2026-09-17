/**
 * The church was the last town lot with no authored work: a kit box with a
 * steeple, one door, no window at all, and four pews under a 2.7 m ceiling.
 * Guard the authored envelope, the apertures it brings with it, the nave and
 * the chancel.
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
const { CHURCH } = await import("../src/buildings/church.js");

bakeHeightfield();
clearColliders();
const scene = new THREE.Scene();
createLandmarks(scene);
createInteriors(scene);
scene.updateMatrixWorld(true);

const lot = ENTERABLE_LOTS.find((candidate) => candidate.name === "church");
assert.ok(lot, "church lot missing");
assert.equal(lot.w, CHURCH.footprint.w, "church lot width drifted from the authored footprint");
assert.equal(lot.d, CHURCH.footprint.d, "church lot depth drifted from the authored footprint");
assert.deepEqual(lot.windows, CHURCH.frontWindows, "church apertures drifted from the authored elevation");
assert.deepEqual(lot.backWindows, CHURCH.backWindows, "church chancel window drifted from the authored elevation");
for (const win of [...CHURCH.frontWindows, ...CHURCH.backWindows]) {
  assert.ok(win.fromFloor >= 0.5, `church sill ${win.fromFloor} is below the kit's glazing threshold`);
  assert.ok(win.fromFloor + win.h < CHURCH.CEIL, `church window head ${win.fromFloor + win.h} is above the ceiling`);
}

const model = lot.group.children.find((child) => child.name === "church");
assert.ok(model, "church exterior is not attached to its lot");
const expectedBatches = ["glass", "iron", "paint", "roof", "stone", "wood"];
assert.deepEqual(model.children.map((mesh) => mesh.name.split(".")[1]).sort(), expectedBatches,
  "church runtime material batches are incomplete");

const bounds = new THREE.Box3();
for (const mesh of model.children) {
  mesh.geometry.computeBoundingBox();
  bounds.union(mesh.geometry.boundingBox);
}
// The sheriff shipped a facade that was right in Blender and upside-down in
// the game, so bound the envelope in every axis.
assert.ok(bounds.min.y >= -0.05, `church export is below the lot floor (${bounds.min.y})`);
assert.ok(bounds.max.y > CHURCH.STEEPLE.spire, `church steeple dressing stops short of the kit spire (${bounds.max.y})`);
assert.ok(bounds.max.y < CHURCH.STEEPLE.spire + 2.0, `church spire has grown into a tower (${bounds.max.y})`);
assert.ok(bounds.min.z < -CHURCH.WALL && bounds.max.z > CHURCH.WALL,
  `church export does not reach both walls (${bounds.min.z}..${bounds.max.z})`);
// Applied trim stands outside the kit face it dresses, but must not reach the
// neighbours: the row is on 14 m centres.
assert.ok(bounds.min.x > -5.4 && bounds.max.x < 5.4, `church trim spills toward its neighbours (${bounds.min.x}..${bounds.max.x})`);

const windowedFrontWalls = [];
const lintels = [];
lot.group.traverse((object) => {
  if (object.userData.role === "wall" && object.userData.openings?.length === 3) windowedFrontWalls.push(object);
  if (object.userData.role === "lintel") lintels.push(object);
});
assert.equal(windowedFrontWalls.length, 2,
  "church exterior and interior shells must both carry the door plus two matching lancets");
assert.ok(lintels.length > 0, "church interior shell lost its procedural door lintel");

// ---------------------------------------------------------------------------
// The nave: one storey, on its own ceiling rather than the kit's 2.7 m cap.
const { FLOOR, CEIL, TIE, INNER, RAIL, ALTAR, PULPIT, PEW, AISLE } = CHURCH;
const g = lot.group;
const py = g.userData.placementY;
assert.ok(CEIL >= 2.3 && CEIL <= 3.2, `church ceiling ${CEIL} breaks the 2.3-3.2 invariant`);
assert.ok(CEIL > 2.7, "church nave is back under the kit's 2.7 m cap");
assert.ok(TIE < CEIL - 0.2, `church tie beams at ${TIE} leave no room under the ceiling`);
assert.ok(g.userData.storeys, "church must own its floor deck and ceiling");
let slab = null;
g.traverse((n) => { if (n.userData.role === "ceiling") slab = n; });
assert.ok(slab && Math.abs(slab.userData.height - CEIL) < 1e-9, `church ceiling slab is at ${slab?.userData.height}`);

const interior = g.children.find((c) => c.name === "churchInterior");
assert.ok(interior, "church interior not attached to its lot");
const ibox = new THREE.Box3();
for (const m of interior.children) { m.geometry.computeBoundingBox(); ibox.union(m.geometry.boundingBox); }
// The kit's casing lines a reveal 0.22 into the wall, and the threshold board
// runs out to the boardwalk, so the envelope is the room plus those.
assert.ok(ibox.min.x > -INNER.x - 0.01 && ibox.max.x < INNER.x + 0.01 &&
  ibox.min.z > -INNER.z - 0.23 && ibox.max.z < INNER.z + 0.34,
  `church interior leaves the shell ${JSON.stringify(ibox)}`);
assert.ok(ibox.min.y > FLOOR - 0.06 && ibox.max.y <= CEIL + 0.001,
  `church interior pierces the floor or the ceiling (${ibox.min.y}..${ibox.max.y})`);

const w3 = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(g.matrixWorld);
const probe = new THREE.Raycaster();
const boards = interior.children.filter((m) => m.name.endsWith(".floor"));
for (const [x, z, label] of [[0, 0, "nave"], [-2.6, 2.6, "nave by the door"], [2.6, -2.6, "chancel"], [0, -1.6, "the aisle at the rail"]]) {
  let top = null;
  for (const dx of [-0.05, 0, 0.05]) {
    const p = w3(x + dx, z + 0.05);
    probe.set(new THREE.Vector3(p.x, py + FLOOR + 0.3, p.z), new THREE.Vector3(0, -1, 0));
    probe.far = 0.6;
    const hit = probe.intersectObjects(boards, false)[0];
    if (hit && (top === null || hit.point.y - py > top)) top = hit.point.y - py;
  }
  assert.ok(top !== null && Math.abs(top - FLOOR) < 0.012, `church ${label}: boards at ${top} not ${FLOOR}`);
  const p = w3(x, z);
  assert.ok(Math.abs(deckHeightAt(p.x, p.z, py + FLOOR + 0.1, 0.4) - py - FLOOR) < 0.012,
    `church ${label}: deck does not register the boards`);
  assert.ok(Math.abs(interiorCeilingAt(p.x, p.z, py + FLOOR) - py - CEIL) < 0.01,
    `church ${label}: camera ceiling ${interiorCeilingAt(p.x, p.z, py + FLOOR) - py}, not ${CEIL}`);
}

// No bare kit wall inside (HARD_WON 3.9): the kit's finishes drop a whole panel
// beside an opening and its casing leaves the band over each head bare.
{
  const kit = [];
  g.traverse((o) => { if (o.isMesh) kit.push(o); });
  const openings = [{ x: 0, w: 0.92, h: 2.1, fromFloor: 0 }, ...CHURCH.frontWindows];
  const back = CHURCH.backWindows;
  const bare = [];
  // A ray landing exactly on a sill or head plane grazes the kit panel under
  // or over the opening, so an opening counts from 3 cm inside its own edges.
  const EDGE = 0.03;
  const inOpening = (list, u, y, mirror = 1) => list.some((o) =>
    Math.abs(u - mirror * o.x) < o.w / 2 && y > o.fromFloor - EDGE && y < o.fromFloor + o.h + EDGE);
  const walls = [
    { along: "x", at: INNER.z, n: [0, 0, 1], through: (u, y) => inOpening(openings, u, y) },
    { along: "x", at: -INNER.z, n: [0, 0, -1], through: (u, y) => inOpening(back, u, y, -1) },
    { along: "z", at: INNER.x, n: [1, 0, 0], through: () => false },
    { along: "z", at: -INNER.x, n: [-1, 0, 0], through: () => false }
  ];
  for (const wall of walls) {
    const span = wall.along === "x" ? INNER.x : INNER.z;
    for (let u = -span + 0.05; u < span; u += 0.1) {
      for (let y = FLOOR + 0.05; y < CEIL; y += 0.1) {
        if (wall.through(u, y)) continue;
        let hit = null;
        for (const du of [-0.01, 0, 0.01]) {
          const inside = wall.along === "x" ? [u + du, y, wall.at - wall.n[2]] : [wall.at - wall.n[0], y, u + du];
          probe.set(new THREE.Vector3(...inside).applyMatrix4(g.matrixWorld), new THREE.Vector3(...wall.n).transformDirection(g.matrixWorld));
          probe.far = 1.3;
          hit = probe.intersectObjects(kit, false)[0];
          if (!hit || hit.object.name.startsWith("churchInterior.")) break;
        }
        if (hit && !hit.object.name.startsWith("churchInterior.")) {
          bare.push(`${wall.along} ${u.toFixed(2)} y ${y.toFixed(2)} (${hit.object.userData.role ?? hit.object.name})`);
        }
      }
    }
  }
  assert.ok(bare.length === 0, `church kit wall bare inside at ${bare.length} points: ${bare.slice(0, 12).join("; ")}`);
}

// The pews leave the aisle open, and stand clear of the rail and the walls.
const pewOuter = PEW.x + PEW.halfX;
assert.ok(PEW.x - PEW.halfX > AISLE / 2, `church pews at ${PEW.x} block the ${AISLE} m aisle`);
assert.ok(pewOuter < INNER.x - 0.1, "church pews run into the side walls");
const lastPew = PEW.z0 + (PEW.rows - 1) * PEW.pitch;
assert.ok(PEW.z0 - PEW.halfZ > RAIL.z + 0.3, "church front pew crowds the communion rail");
assert.ok(lastPew + PEW.halfZ < INNER.z - 0.5, "church back pew blocks the entry");

const world = (x, z) => new THREE.Vector3(x, 0, z).applyMatrix4(lot.group.matrixWorld);
const eye = py + 1.2;
const crossing = (x, fromZ, toZ) => {
  const start = world(x, fromZ);
  const end = world(x, toZ);
  return movementBlocked(start.x, start.z, end.x - start.x, end.z - start.z, 0.30, null, eye);
};
assert.equal(crossing(0, lot.d / 2 + 0.8, lot.d / 2), false, "church doorway collision gap is blocked");
assert.equal(crossing(CHURCH.frontWindows[0].x, lot.d / 2 + 0.8, lot.d / 2), true,
  "church lancet incorrectly opens a walk-through collision gap");

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
const naveY = stroll([[0, 6.0], [0, 4.2], [0, 1.4], [0, -1.0]], "the nave down the aisle");
assert.ok(Math.abs(naveY - FLOOR) < 0.02, `walker stands at ${naveY} in the nave`);
// The gate on the aisle is open; the rail either side of it is not.
// Just past the gate, clear of the altar's own footprint behind it.
stroll([[0, 6.0], [0, 1.4], [0, RAIL.z - 0.35]], "the chancel through the open gate");
stroll([[0, 6.0], [0, 1.4], [2.6, -1.2], [2.6, RAIL.z - 0.8]], "the chancel over the communion rail", true);
stroll([[0, 6.0], [0, 1.4], [-2.6, -1.2], [-2.6, RAIL.z - 0.8]], "the chancel over the rail on the other side", true);
stroll([[0, 6.0], [0, 1.4], [0, RAIL.z - 0.35], [ALTAR.x, ALTAR.z]], "the altar itself", true);
stroll([[0, 6.0], [0, 1.4], [0, RAIL.z - 0.35], [PULPIT.x, PULPIT.z]], "the pulpit itself", true);
stroll([[0, 6.0], [0, 2.6], [PEW.x, 2.6], [PEW.x, PEW.z0]], "a seat through the pews", true);

const triangles = model.children.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
const interiorTris = interior.children.reduce((sum, mesh) => sum + mesh.geometry.index.count / 3, 0);
console.log(JSON.stringify({
  bounds: { min: bounds.min.toArray().map((v) => +v.toFixed(2)), max: bounds.max.toArray().map((v) => +v.toFixed(2)) },
  triangles, interiorTris, windows: lot.windows.length + lot.backWindows.length
}));
console.log("PASS");
