/** The saloon facade is Blender geometry laid over the kit lot
 * (scripts/blender-saloon). Guard the fit: the frames it was generated from
 * still match the kit, nothing it adds obstructs the doorway or glass, every
 * wall the street sees is dressed, and its gallery posts stand without closing
 * the boardwalk or the door. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three/webgpu';
globalThis.document = { createElement: () => ({ width: 256, height: 256, getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }) }) };
const { bakeHeightfield, heightAt } = await import('../src/heightfield.js');
const { clearColliders, deckHeightAt, moveAndSlide, movementBlocked } = await import('../src/collision.js');
const { createLandmarks, ENTERABLE_LOTS } = await import('../src/landmarks.js');
const { createInteriors } = await import('../src/interiors.js');
const { SALOON, SALOON_POSTS } = await import('../src/buildings/saloon.js');
const { interiorCeilingAt } = await import('../src/buildings/kit.js');

const layout = JSON.parse(readFileSync(new URL('./blender-saloon/layout.json', import.meta.url)));
bakeHeightfield();
clearColliders();
const scene = new THREE.Scene();
createLandmarks(scene);
createInteriors(scene);
scene.updateMatrixWorld(true);
const lot = ENTERABLE_LOTS.find((l) => l.name === 'saloon');
const st = lot.group;
const regen = 'regenerate: npx tsx scripts/blender-saloon/export-layout.mjs, then build() and export() in Blender';

// 1. The frames Blender built against are the shipping kit's.
for (const k of ['w', 'h', 'd']) assert.equal(layout.lot[k], lot[k], `saloon ${k} changed; ${regen}`);
assert.deepEqual(layout.saloon, JSON.parse(JSON.stringify(SALOON)), `SALOON changed; ${regen}, then interior.py build() and export()`);
const inverse = st.matrixWorld.clone().invert();
const walls = [];
st.traverse((o) => { if (o.userData.role === 'wall') walls.push(o); });
assert.equal(walls.length, layout.walls.length, `saloon wall count changed; ${regen}`);
walls.forEach((wall, i) => {
  const m = inverse.clone().multiply(wall.matrixWorld).elements;
  const src = layout.walls[i];
  assert.ok(src.matrix.every((v, j) => Math.abs(v - m[j]) < 1e-6), `saloon wall ${i} frame moved; ${regen}`);
  assert.deepEqual(src.openings, wall.userData.openings, `saloon wall ${i} openings changed; ${regen}`);
});

// 2. Model present, lot-local, and inside its envelope (neighbours at +-7.5 m).
const model = st.children.find((o) => o.name === 'saloon');
assert.ok(model, 'saloon model not attached to its lot');
const meshes = model.children;
assert.ok(['paint', 'wood', 'roof', 'iron', 'pane'].every((k) => meshes.some((m) => m.name === `saloon.${k}`)), 'saloon batch missing');
const box = new THREE.Box3();
for (const m of meshes) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
assert.ok(box.min.x > -5.7 && box.max.x < 5.7, `saloon model spills sideways ${box.min.x}..${box.max.x}`);
assert.ok(box.min.z > -4.6 && box.max.z < 8.3 && box.max.y < 12.5 && box.min.y > -0.01, `saloon model envelope ${JSON.stringify(box)}`);

// 3. Openings clear: the door fully, glass but for its sash bars. Rays run
// from the boardwalk side through the wall plane.
const ray = new THREE.Raycaster();
const interior = st.children.find((o) => o.name === 'saloonInterior');
assert.ok(interior, 'saloon interior not attached to its lot');
const inner = interior.children;
const models = [...meshes, ...inner];
const ibox = new THREE.Box3();
for (const m of inner) { m.geometry.computeBoundingBox(); ibox.union(m.geometry.boundingBox); }
const { FLOOR, CEIL, UPPER, UPPER_CEIL, INNER, STAIR } = SALOON;
assert.ok(ibox.min.x > -INNER.x - 0.01 && ibox.max.x < INNER.x + 0.01 && ibox.min.z > -INNER.z - 0.23 && ibox.max.z < INNER.z + 0.34,
  `saloon interior leaves the shell ${JSON.stringify(ibox)}`);
assert.ok(ibox.min.y > 0.05 && ibox.max.y < UPPER_CEIL + 0.1, `saloon interior height ${ibox.min.y}..${ibox.max.y}`);
const front = walls.find((w) => w.userData.openings.length > 1 && Math.abs(inverse.clone().multiply(w.matrixWorld).elements[14] - lot.d / 2) < 1e-3);
const dir = new THREE.Vector3(0, 0, -1).transformDirection(st.matrixWorld);
const back = walls.find((w) => w.userData.openings.length && Math.abs(inverse.clone().multiply(w.matrixWorld).elements[14] + lot.d / 2) < 1e-3);
// The back wall's frame faces -z: its opening x runs opposite the lot's.
const apertures = [...front.userData.openings.map((o) => ({ ...o, side: 1 })), ...back.userData.openings.map((o) => ({ ...o, x: -o.x, side: -1 }))];
for (const o of apertures) {
  let clear = 0, total = 0;
  for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
    const fx = (i + 0.5) / 12, fy = (j + 0.5) / 12;
    // Through the wall from outside, 0.6 m into the room.
    ray.set(new THREE.Vector3(o.x + o.w * (fx - 0.5), Math.max(o.fromFloor, SALOON.FLOOR + 0.02) + (o.h - Math.max(0, SALOON.FLOOR + 0.02 - o.fromFloor)) * fy, o.side * (lot.d / 2 + 1.2)).applyMatrix4(st.matrixWorld),
      dir.clone().multiplyScalar(o.side));
    ray.far = 1.2 + 0.6;
    total++;
    const hits = ray.intersectObjects(models, false); if (!hits.length) clear++;
  }
  const need = o.fromFloor > 0.3 && o.class !== 'door' ? 0.8 : 1;
  assert.ok(clear / total >= need, `saloon opening at x=${o.x} y=${o.fromFloor}: ${total - clear}/${total} rays blocked by the model`);
}

// 4. Every face the street sees is dressed: solid front wall and false front.
let dressed = 0;
for (let x = -4.27; x <= 4.3; x += 0.43) for (const y of [0.4, 2.9, 4.2, 6.9, 8.3, 10.2]) {
  if (front.userData.openings.some((o) => Math.abs(x - o.x) < o.w / 2 + 0.2 && y > o.fromFloor - 0.2 && y < o.fromFloor + o.h + 0.8)) continue;
  // Two probes 5 cm apart, so an 8 mm seam between boards is not "bare".
  const covered = [0, 0.05].some((dx) => {
    ray.set(new THREE.Vector3(x + dx, y, 9.5).applyMatrix4(st.matrixWorld), dir);
    ray.far = 5.5;
    const hit = ray.intersectObjects([...meshes, ...st.children.filter((c) => c !== model)], true)[0];
    return hit && meshes.includes(hit.object);
  });
  assert.ok(covered, `saloon facade bare at x=${x.toFixed(2)} y=${y}`);
  dressed++;
}

// 5. Posts collide; the boardwalk runs past them and the door takes a walker.
const world = (lx, lz) => new THREE.Vector3(lx, 0, lz).applyMatrix4(st.matrixWorld);
for (const p of SALOON_POSTS) {
  const c = world(p.x, p.z);
  const probe = world(p.x, p.z + 1.2);
  assert.ok(movementBlocked(probe.x, probe.z, c.x - probe.x, c.z - probe.z, 0.42, null, st.userData.placementY + 0.1), `gallery post at x=${p.x} has no collider`);
}
function walk(path, label) {
  const start = world(...path[0]);
  const w = { x: start.x, z: start.z, y: Math.max(heightAt(start.x, start.z), deckHeightAt(start.x, start.z, st.userData.placementY + 0.5, 1.4)) };
  for (const [lx, lz] of path.slice(1)) {
    const t = world(lx, lz);
    for (let i = 0; i < 800; i++) {
      const dx = t.x - w.x, dz = t.z - w.z, d = Math.hypot(dx, dz);
      if (d < 0.08) break;
      const s = Math.min(0.06, d);
      const n = moveAndSlide(w.x, w.z, (dx / d) * s, (dz / d) * s, 0.42, null, w.y);
      w.x = n.x; w.z = n.z;
      w.y = Math.max(heightAt(w.x, w.z), deckHeightAt(w.x, w.z, w.y, 1.4));
    }
    assert.ok(Math.hypot(t.x - w.x, t.z - w.z) < 0.3, `walker could not reach ${label} (${lx}, ${lz})`);
  }
}
walk([[-6.5, 5.9], [6.5, 5.9]], 'the far end of the boardwalk under the gallery');

// 6. Storeys: boards where the decks are, treads on the ramp, ceilings closed
// overhead and the camera ducking under the right one.
const py = st.userData.placementY;
const down = new THREE.Vector3(0, -1, 0);
const surface = (x, z, fromY) => {
  const p = world(x, z);
  ray.set(new THREE.Vector3(p.x, py + fromY, p.z), down);
  ray.far = 0.6;
  const hit = ray.intersectObjects(inner, false)[0];
  return hit ? hit.point.y - py : null;
};
const [wx0, wx1, wz0, wz1] = STAIR.well;
for (const [x, z, y, label] of [[0, 0, FLOOR, 'barroom'], [-2.5, 3.2, FLOOR, 'barroom front'], [-2.2, -3.3, FLOOR, 'barroom back'],
  [-3.8, 2.6, UPPER, 'hall over the stair top'], [-1.2, -2.0, UPPER, 'west room'], [2.6, -2.0, UPPER, 'east room'], [-3.7, -3.0, UPPER, 'west room alcove']]) {
  const top = surface(x + 0.03, z + 0.05, y + 0.3);
  assert.ok(top !== null && Math.abs(top - y) < 0.012, `saloon ${label}: boards at ${top} not ${y}`);
  const p = world(x, z);
  assert.ok(Math.abs(deckHeightAt(p.x, p.z, py + y + 0.1, 0.4) - py - y) < 0.012, `saloon ${label}: deck does not register the boards`);
}
const rise = (UPPER - FLOOR) / STAIR.risers;
const tread = (STAIR.z1 - STAIR.z0) / (STAIR.risers - 1);
for (let k = 1; k < STAIR.risers; k++) {
  const z = STAIR.z0 + (k - 0.5) * tread;
  const y = FLOOR + k * rise;
  const top = surface((STAIR.x0 + STAIR.x1) / 2, z, y + 0.3);
  assert.ok(top !== null && Math.abs(top - y) < 0.012, `saloon tread ${k} at ${top} not ${y}`);
  const p = world((STAIR.x0 + STAIR.x1) / 2, z);
  assert.ok(Math.abs(deckHeightAt(p.x, p.z, py + y, 0.4) - py - y) <= rise / 2 + 0.01, `saloon tread ${k} off the stair ramp`);
}
const up = new THREE.Vector3(0, 1, 0);
for (const [x, z, y, ceil, label] of [[0, 0, FLOOR, CEIL, 'barroom'], [-1.2, -2.0, UPPER, UPPER_CEIL, 'west room'], [0, 2.5, UPPER, UPPER_CEIL, 'hall']]) {
  const p = world(x, z);
  ray.set(new THREE.Vector3(p.x, py + y + 1.5, p.z), up);
  ray.far = 3.5;
  const hit = ray.intersectObjects(inner, false)[0];
  assert.ok(hit && Math.abs(hit.point.y - py - ceil) < 0.07, `saloon ${label}: ceiling at ${hit && hit.point.y - py}, not ${ceil}`);
  assert.ok(Math.abs(interiorCeilingAt(p.x, p.z, py + y) - py - ceil) < 0.01, `saloon ${label}: camera ceiling ${interiorCeilingAt(p.x, p.z, py + y) - py}`);
}
{
  const p = world((wx0 + wx1) / 2, (wz0 + wz1) / 2);
  assert.ok(Math.abs(interiorCeilingAt(p.x, p.z, py + 2) - py - UPPER_CEIL) < 0.01, 'saloon camera still ducks under the floor over the stairwell');
}

// 7. A walker from the street reaches every room on both floors and the
// balcony, and cannot get under the stair or over the well's guard.
function stroll(path, label, blocked = false) {
  const start = world(...path[0]);
  const w = { x: start.x, z: start.z, y: Math.max(heightAt(start.x, start.z), deckHeightAt(start.x, start.z, py + 0.5, 1.4)) };
  let t;
  for (const [lx, lz] of path.slice(1)) {
    t = world(lx, lz);
    for (let i = 0; i < 1200; i++) {
      const dx = t.x - w.x, dz = t.z - w.z, d = Math.hypot(dx, dz);
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
const barY = stroll([[0, 6.4], [0, 4.6], [0, 1.5], [-2.5, -1.2]], 'the barroom through the door');
assert.ok(Math.abs(barY - FLOOR) < 0.02, `walker stands at ${barY} in the barroom, not on the boards`);
const climb = [[0, 6.4], [0, 3.0], [-2.6, -3.3], [-3.73, -3.35], [-3.73, 0.8], [-3.73, 2.3]];
const hallY = stroll(climb, 'the upstairs hall by the stair');
assert.ok(Math.abs(hallY - UPPER) < 0.02, `walker upstairs stands at ${hallY}, not ${UPPER}`);
stroll([...climb, [-1.6, 2.2], [-1.6, 0.6], [-1.2, -1.5]], 'the west room');
stroll([...climb, [2.3, 2.2], [2.3, 0.6], [2.6, -1.8]], 'the east room');
const balconyY = stroll([...climb, [0, 2.6], [0, 4.6], [3.8, 6.2]], 'the balcony');
assert.ok(Math.abs(balconyY - UPPER) < 0.02, `walker on the balcony stands at ${balconyY}, not on its deck`);
stroll([...climb, [-1.6, 2.2], [-1.6, 0.6], [-2.6, -0.3], [-3.7, -0.3]], 'the stairwell from the west room', true);
stroll([[0, 6.4], [0, 3.0], [-2.6, 0.4], [-3.73, 0.4]], 'the space under the stair', true);
stroll([...climb, [0, 2.6], [0, 4.6], [3.8, 6.2], [3.8, 8.6]], 'a fall off the balcony', true);

console.log(JSON.stringify({ dressed, posts: SALOON_POSTS.length, triangles: meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0) }));
console.log('PASS');
