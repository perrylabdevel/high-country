/**
 * The ranch house interior (scripts/blender-ranch/interior.py) against the
 * kit it dresses, offline.
 *
 * The first interior capture showed terrain grass through every room: the
 * ranch pad sits at footing + ~0.10 m and the kit floor slab's top was 0.10,
 * so the two z-fought and the ground won. Nothing errored. This check keeps
 * each promise the interior makes measurable:
 *  - the terrain stays under the floorboards, and the boards are where the
 *    registered walking decks say the player stands, on both storeys;
 *  - the stair's treads match its ramp, and a walker can climb it and reach
 *    every room through the doors the colliders leave open;
 *  - every room is closed overhead and its walls are finished, not bare kit;
 *  - no finish, casing or curtain obstructs a door or window.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three/webgpu';
globalThis.document = { createElement: () => ({ width: 256, height: 256, getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) }) }) };
const { bakeHeightfield, meshHeightAt, heightAt } = await import('../src/heightfield.js');
const { clearColliders, deckHeightAt, moveAndSlide } = await import('../src/collision.js');
const { createRanch, RANCH_HOUSE } = await import('../src/buildings.js');
const { interiorCeilingAt } = await import('../src/buildings/kit.js');

bakeHeightfield();
clearColliders();
const ranch = createRanch();
ranch.updateMatrixWorld(true);
const interior = ranch.getObjectByName('ranchInterior');
assert.ok(interior, 'ranchInterior missing from createRanch()');
const O = interior.position;
const { FLOOR, CEIL, UPPER, UPPER_CEIL, STAIR } = RANCH_HOUSE;
const GC = CEIL - 0.08;
const layout = JSON.parse(readFileSync(new URL('./blender-ranch/interior-layout.json', import.meta.url)));
assert.deepEqual(layout.house, RANCH_HOUSE, 'interior-layout.json is stale: run export-layout.mjs, then rebuild interior.py in Blender');

const batch = (k) => interior.getObjectByName(`ranchInterior.${k}`);
const floorMesh = batch('floor');
const all = interior.children;
const kitWalls = [];
for (const root of ranch.children.filter((o) => ['ranchHouse', 'ranchEll'].includes(o.userData.name))) {
  root.traverse((n) => { if (n.userData.role === 'wall') n.traverse((m) => { if (m.isMesh) kitWalls.push(m); }); });
}
const ray = new THREE.Raycaster();
const V = (x, y, z) => new THREE.Vector3(x + O.x, y + O.y, z + O.z);
const inWell = (x, z, pad = 0) => x > STAIR.well[0] - pad && x < STAIR.well[1] + pad && z > STAIR.well[2] - pad && z < STAIR.well[3] + pad;

// Rooms: inner faces of the kit walls, as interior.py dresses them.
const ROOMS = [
  ['parlor', -10.39, -4.11, -5.24, 6.89, FLOOR, GC], ['hall', -3.89, 5.09, -5.24, 6.89, FLOOR, GC],
  ['dining', 5.31, 11.89, -5.24, 6.89, FLOOR, GC], ['kitchen', 4.11, 15.89, -16.39, -5.46, FLOOR, GC],
  ['bedW', -10.39, -4.11, -5.24, 6.89, UPPER, UPPER_CEIL], ['landing', -3.89, 5.09, -5.24, 6.89, UPPER, UPPER_CEIL],
  ['bedE', 5.31, 11.89, -5.24, 6.89, UPPER, UPPER_CEIL]
];
const underStair = (x, z) => x > STAIR.x0 - 0.1 && x < STAIR.x1 + 0.1 && z > STAIR.zTop - 0.1 && z < STAIR.zBottom + 0.1;
const breast = (x, z) => (x > -7.8 && x < -5.8 && z < -2.35) || (x > 9.55 && x < 10.85 && z < -15.75);

// 1-2. Terrain under the boards; boards at the decks' height.
let floorSamples = 0, worstTerrain = -Infinity;
for (const [name, x0, x1, z0, z1, yf] of ROOMS) {
  for (let x = x0 + 0.23; x < x1; x += 0.47) {
    for (let z = z0 + 0.21; z < z1; z += 0.53) {
      if (yf === FLOOR) {
        worstTerrain = Math.max(worstTerrain, meshHeightAt(x + O.x, z + O.z) - (O.y + FLOOR));
      }
      if (breast(x, z) || underStair(x, z) || (yf === UPPER && inWell(x, z, 0.06))) continue;
      // Boards have 3-4 mm seams; a sample landing in one tries its neighbours.
      let hit;
      for (const [ox, oz] of [[0, 0], [0.03, 0.05], [-0.03, -0.05]]) {
        ray.set(V(x + ox, yf + 0.5, z + oz), new THREE.Vector3(0, -1, 0));
        ray.far = 0.52;
        hit = hit || ray.intersectObject(floorMesh, false)[0];
      }
      assert.ok(hit, `${name}: no floorboard under (${x.toFixed(2)}, ${z.toFixed(2)})`);
      const top = hit.point.y - O.y;
      assert.ok(Math.abs(top - yf) < 0.006, `${name}: board top ${top.toFixed(3)} at (${x.toFixed(2)}, ${z.toFixed(2)}), expected ${yf}`);
      const deck = deckHeightAt(x + O.x, z + O.z, O.y + yf, 1.4) - O.y;
      assert.ok(Math.abs(deck - yf) < 0.006, `${name}: walking deck ${deck.toFixed(3)} at (${x.toFixed(2)}, ${z.toFixed(2)}) is not the board top ${yf}`);
      floorSamples++;
    }
  }
}
assert.ok(worstTerrain < -0.015, `terrain ${(worstTerrain * 100).toFixed(1)} cm from the ground-floor board top: it will show through (needs < -1.5 cm)`);

// 3. Treads against the stair ramp.
const rise = (UPPER - FLOOR) / STAIR.risers;
const tread = (STAIR.zBottom - STAIR.zTop) / (STAIR.risers - 1);
for (let k = 1; k < STAIR.risers; k++) {
  const z = STAIR.zBottom - (k - 0.5) * tread, x = (STAIR.x0 + STAIR.x1) / 2;
  ray.set(V(x + 0.013, FLOOR + k * rise + 0.15, z), new THREE.Vector3(0, -1, 0));
  ray.far = 0.3;
  const hit = ray.intersectObject(floorMesh, false)[0];
  assert.ok(hit && Math.abs(hit.point.y - O.y - (FLOOR + k * rise)) < 0.006, `tread ${k} missing or off its rise`);
  const deck = deckHeightAt(x + O.x, z + O.z, O.y + FLOOR + k * rise, 0.3) - O.y;
  assert.ok(Math.abs(deck - (FLOOR + k * rise)) < rise / 2 + 0.01, `stair ramp ${deck.toFixed(3)} strays from tread ${k}`);
}

// 4. Closed overhead; camera ceiling by storey.
for (const [name, x0, x1, z0, z1, yf, yc] of ROOMS) {
  for (let x = x0 + 0.4; x < x1; x += 0.9) {
    for (let z = z0 + 0.4; z < z1; z += 0.9) {
      if (breast(x, z) || (yf === FLOOR && inWell(x, z, 0.1))) continue;
      const closed = [[0, 0], [0.03, 0.05], [-0.03, -0.05]].some(([ox, oz]) => {
        ray.set(V(x + ox, yf + 1.5, z + oz), new THREE.Vector3(0, 1, 0));
        ray.far = yc - yf;
        return ray.intersectObjects(all, false).length > 0;
      });
      assert.ok(closed, `${name}: open ceiling over (${x.toFixed(1)}, ${z.toFixed(1)})`);
      const cam = interiorCeilingAt(x + O.x, z + O.z, O.y + yf) - O.y;
      assert.ok(Math.abs(cam - yc) < 0.09, `${name}: camera ceiling ${cam.toFixed(2)} at (${x.toFixed(1)}, ${z.toFixed(1)}), expected ${yc.toFixed(2)}`);
    }
  }
}

// 5-6. Walls finished; openings clear.
const openings = [];
for (const w of layout.walls) {
  const m = new THREE.Matrix4().fromArray(w.matrix);
  for (const o of w.openings) openings.push({ m, o });
}
const inOpening = (p) => openings.some(({ m, o }) => {
  const l = p.clone().sub(O).applyMatrix4(m.clone().invert());
  return Math.abs(l.z) < 0.4 && Math.abs(l.x - o.x) < o.w / 2 + 0.15 && l.y > o.fromFloor - 0.25 && l.y < o.fromFloor + o.h + 0.25;
});
let wallRays = 0;
for (const [name, x0, x1, z0, z1, yf, yc] of ROOMS) {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const sides = [
    [new THREE.Vector3(0, 0, -1), (t) => [x0 + t * (x1 - x0), cz]], [new THREE.Vector3(0, 0, 1), (t) => [x0 + t * (x1 - x0), cz]],
    [new THREE.Vector3(-1, 0, 0), (t) => [cx, z0 + t * (z1 - z0)]], [new THREE.Vector3(1, 0, 0), (t) => [cx, z0 + t * (z1 - z0)]]
  ];
  for (const [dir, at] of sides) {
    for (const t of [0.12, 0.3, 0.5, 0.7, 0.88]) {
      for (const h of [0.08, 0.6, 1.5, yc - yf - 0.3]) {
        const [x, z] = at(t);
        const origin = V(x, yf + h, z);
        ray.set(origin, dir);
        ray.far = 20;
        const hits = ray.intersectObjects([...all, ...kitWalls], false);
        const first = hits[0];
        if (!first || inOpening(first.point) || underStair(first.point.x - O.x, first.point.z - O.z) || (yf === FLOOR && name === 'hall' && first.point.z - O.z < -5.2 && first.point.x - O.x > 3.9)) continue;
        // Furniture of the interior counts as covered; a kit wall first is bare.
        assert.ok(first.object.parent === interior, `${name}: bare kit wall at ${first.point.clone().sub(O).toArray().map((v) => v.toFixed(2))} looking ${dir.toArray()}`);
        wallRays++;
      }
    }
  }
}
let apertureRays = 0;
for (const { m, o } of openings) {
  const normal = new THREE.Vector3(0, 0, 1).transformDirection(m);
  for (const fx of [0.2, 0.5, 0.8]) {
    for (const fy of [0.15, 0.5, 0.85]) {
      const p = new THREE.Vector3(o.x + (fx - 0.5) * o.w, o.fromFloor + fy * o.h, 0.35).applyMatrix4(m).add(O);
      // From 0.35 m outside to 0.1 m past the inner face: the opening's own depth.
      ray.set(p, normal.clone().negate());
      ray.far = 0.56;
      const hit = ray.intersectObjects(all, false)[0];
      assert.ok(!hit, `interior geometry (${hit?.object.name}) obstructs the opening at ${p.clone().sub(O).toArray().map((v) => v.toFixed(2))}`);
      apertureRays++;
    }
  }
}

// 7. Walk the house: porch, hall, up the stair, both bedrooms, the ground rooms.
const RADIUS = 0.42;
const walker = { x: O.x, z: O.z + 9.2, y: 0 };
walker.y = Math.max(heightAt(walker.x, walker.z), deckHeightAt(walker.x, walker.z, O.y + 1, 1.4));
function walkTo(hx, hz, label, blocked = false) {
  for (let i = 0; i < 600; i++) {
    const dx = hx + O.x - walker.x, dz = hz + O.z - walker.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.08) return;
    const s = Math.min(0.06, d);
    const next = moveAndSlide(walker.x, walker.z, (dx / d) * s, (dz / d) * s, RADIUS, null, walker.y);
    const ground = Math.max(heightAt(next.x, next.z), deckHeightAt(next.x, next.z, walker.y, 1.4));
    if (ground > walker.y + 0.45) break; // a wall of a step, not a stair
    walker.x = next.x; walker.z = next.z; walker.y = ground;
  }
  const off = Math.hypot(hx + O.x - walker.x, hz + O.z - walker.z);
  if (blocked) return assert.ok(off > 0.3, `walker reached ${label}`);
  assert.ok(off < 0.15, `walker could not reach ${label}: stuck at house (${(walker.x - O.x).toFixed(2)}, ${(walker.z - O.z).toFixed(2)}), feet ${(walker.y - O.y).toFixed(2)}`);
}
const expectFeet = (y, label) => assert.ok(Math.abs(walker.y - O.y - y) < 0.03, `${label}: feet at ${(walker.y - O.y).toFixed(3)}, expected ${y}`);
walkTo(0, 7.6, 'the front door');
walkTo(0, 5.2, 'the hall'); expectFeet(FLOOR, 'hall');
walkTo(-2.2, -0.95, 'the parlor door'); walkTo(-5.4, -0.95, 'through the parlor door'); walkTo(-7, 3.5, 'the parlor'); expectFeet(FLOOR, 'parlor');
walkTo(-5.4, -0.95, 'the parlor door'); walkTo(3.0, -0.15, 'the dining door'); walkTo(6.6, -0.15, 'through the dining door');
walkTo(8.6, -2.5, 'the dining room'); walkTo(6.6, -4.2, 'the kitchen door'); walkTo(6.6, -7.0, 'the kitchen');
walkTo(12, -12, 'the stove end'); expectFeet(FLOOR, 'kitchen');
walkTo(6.6, -7.0, 'back to the kitchen door'); walkTo(6.6, -4.2, 'the dining room'); walkTo(6.6, -0.15, 'the dining door');
walkTo(3.0, -0.15, 'the hall'); walkTo(3.0, 6.3, 'the foot of the stair'); walkTo(4.57, 6.3, 'the first step');
walkTo(4.57, 2.7, 'the top of the stair'); expectFeet(UPPER, 'landing');
walkTo(1.0, -0.95, 'the upstairs west door'); walkTo(-5.4, -0.95, 'through it'); walkTo(-7.5, 3.0, 'the west bedroom'); expectFeet(UPPER, 'west bedroom');
walkTo(-5.4, -0.95, 'the west door'); walkTo(3.4, -0.15, 'the upstairs east door'); walkTo(6.6, -0.15, 'through it');
walkTo(8.5, 1.0, 'the east bedroom'); expectFeet(UPPER, 'east bedroom');
walkTo(6.6, -0.15, 'the east door'); walkTo(3.4, -0.15, 'the landing');
// The well guard: from the landing, straight at the stairwell must not fall.
walkTo(3.4, 4.5, 'the landing by the well');
walkTo(4.6, 4.5, 'the open stairwell from the landing', true);
expectFeet(UPPER, 'the well guard');
console.log(`PASS: ${floorSamples} floorboard samples on their decks (terrain ≥ ${(-worstTerrain * 100).toFixed(1)} cm below), ${STAIR.risers - 1} treads on the ramp, ceilings closed, ${wallRays} wall rays finished, ${apertureRays} aperture rays clear, walked porch → every room upstairs and down.`);
