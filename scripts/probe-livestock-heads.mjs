/**
 * Diagnostic: do livestock heads penetrate building colliders?
 *
 * Builds the world headlessly the same way check-collision.mjs does, spawns
 * the real herds, runs their real wander/graze/flee state machines for a
 * simulated period, and each tick tests the rig's measured head-tip position
 * against every box collider.
 *
 * The head tip is MEASURED from the built rig (world bbox of neck+head at
 * yaw=0, when forward is +X), not hand-derived from the builder code.
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
        const gradient = { addColorStop() {} };
        const noop = () => gradient;
        return new Proxy({}, { get: () => noop });
      }
    };
  }
};

// Deterministic run: the herds seed their yaw/spots from Math.random.
let seed = 0xc0ffee;
Math.random = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const THREE = await import("three/webgpu");
const { bakeHeightfield } = await import("../src/heightfield.js");
const { clearColliders, listBoxColliders } = await import("../src/collision.js");
const { createRanch } = await import("../src/buildings.js");
const { createLandmarks } = await import("../src/landmarks.js");
const { createInteriors } = await import("../src/interiors.js");
const { createShore } = await import("../src/shore.js");
const { createIndustry } = await import("../src/industry.js");
const { createFort } = await import("../src/fort.js");
const { createPines } = await import("../src/pines.js");
const { createHomestead } = await import("../src/homestead.js");
const { createVegetation } = await import("../src/vegetation.js");
const { createLivestock } = await import("../src/livestock.js");
const { POS } = await import("../src/map.js");

clearColliders();
bakeHeightfield();
createRanch();
const scene = { add() {}, remove() {} };
createLandmarks(scene);
createInteriors(scene);
createShore(scene);
createIndustry(scene);
createFort(scene);
createPines(scene);
createHomestead(scene);
createVegetation(scene);

const boxes = listBoxColliders();

function pointInBox(px, pz, b) {
  if (!b.yaw) {
    return px >= b.x - b.halfX && px <= b.x + b.halfX && pz >= b.z - b.halfZ && pz <= b.z + b.halfZ;
  }
  const cos = Math.cos(-b.yaw);
  const sin = Math.sin(-b.yaw);
  const dx = px - b.x;
  const dz = pz - b.z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return Math.abs(lx) <= b.halfX && Math.abs(lz) <= b.halfZ;
}

/** Depth inside a box (0 when outside) — distance to the nearest face. */
function depthInBox(px, pz, b) {
  if (!pointInBox(px, pz, b)) {
    return 0;
  }
  if (!b.yaw) {
    return Math.min(px - (b.x - b.halfX), b.x + b.halfX - px, pz - (b.z - b.halfZ), b.z + b.halfZ - pz);
  }
  const cos = Math.cos(-b.yaw);
  const sin = Math.sin(-b.yaw);
  const dx = px - b.x;
  const dz = pz - b.z;
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  return Math.min(b.halfX - Math.abs(lx), b.halfZ - Math.abs(lz));
}

const stock = createLivestock();
scene.add = () => {};
stock.update(1 / 60, new THREE.Vector3(0, 0, 0), new THREE.Vector3(99999, 0, 99999));

// Measure each animal's real forward extent: with forward = +X, the world
// bbox of the rig's neck+head branch gives the head reach from the origin.
const animals = [];
let found = 0;
for (const child of stock.group.children) {
  const p = child.userData ?? {};
  // livestock doesn't tag children; identify the rig by having a bob group.
  found += 1;
  child.rotation.y = 0;
  child.updateMatrixWorld(true);
  const probe = new THREE.Box3();
  const tmp = new THREE.Box3();
  const walk = (obj) => {
    if (obj.name || true) {
      for (const c of obj.children) {
        walk(c);
      }
      if (obj.geometry && !obj.geometry.boundingBox) {
        obj.geometry.computeBoundingBox();
      }
      if (obj.geometry) {
        tmp.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
        probe.union(tmp);
      }
    }
  };
  walk(child);
  animals.push({
    group: child,
    reach: probe.max.x - child.position.x,
    species: probe.max.x - child.position.x > 1.3 ? "cow" : probe.max.x - child.position.x > 0.95 ? "deer" : "sheep"
  });
}

const DT = 1 / 30;
const TICKS = 30 * 60 * 8; // 8 simulated minutes
// Cycle the camera across all four herd homes so no herd is culled from
// update — the CULL_DIST gate skips whole herds otherwise.
const homes = [POS.ranch, POS.sheepCamp, POS.westernRange, POS.foothills];
const camera = new THREE.Vector3(POS.ranch.x, 0, POS.ranch.z);
const player = new THREE.Vector3(99999, 0, 99999);

const stats = new Map();
for (const a of animals) {
  stats.set(a.group, { species: a.species, reach: a.reach, penTicks: 0, worst: 0, traveled: 0, last: a.group.position.clone() });
}

for (let t = 0; t < TICKS; t += 1) {
  const home = homes[t % homes.length];
  camera.set(home.x, 0, home.z);
  stock.update(DT, camera, player);
  for (const a of animals) {
    const g = a.group;
    g.updateMatrixWorld(true);
    const tip = new THREE.Vector3(a.reach, 0, 0).applyMatrix4(g.matrixWorld);
    const s = stats.get(g);
    s.traveled += Math.hypot(g.position.x - s.last.x, g.position.z - s.last.z);
    s.last.copy(g.position);
    let d = 0;
    for (const b of boxes) {
      const dd = depthInBox(tip.x, tip.z, b);
      if (dd > d) {
        d = dd;
      }
    }
    if (d > 0) {
      s.penTicks += 1;
      s.worst = Math.max(s.worst, d);
    }
  }
}

const bySpecies = {};
for (const s of stats.values()) {
  const k = s.species;
  bySpecies[k] = bySpecies[k] || { animals: 0, penTicks: 0, worst: 0, traveled: [] };
  bySpecies[k].animals += 1;
  bySpecies[k].penTicks += s.penTicks;
  bySpecies[k].worst = Math.max(bySpecies[k].worst, s.worst);
  bySpecies[k].traveled.push(Math.round(s.traveled));
}

console.log(JSON.stringify({
  animals: animals.length,
  colliders: boxes.length,
  simMinutes: TICKS * DT / 60,
  bySpecies,
  perAnimal: [...stats.entries()].map(([g, s]) => ({
    species: s.species,
    reach: Number(s.reach.toFixed(2)),
    pos: [Math.round(g.position.x), Math.round(g.position.z)],
    penTicks: s.penTicks,
    worst: Number(s.worst.toFixed(2)),
    traveled: Math.round(s.traveled)
  }))
}, null, 2));