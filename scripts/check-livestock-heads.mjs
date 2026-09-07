/**
 * Livestock head clearance: a wandering animal's muzzle must never sit inside
 * a building collider.
 *
 * Why this check exists: the body collider circle guards only the torso
 * (cow radius 0.62 m) while the rig reaches ~1.5 m forward of its origin, so
 * a head-on cow ended up most of a metre inside a wall — silently, since the
 * resolver was doing exactly what it was asked. Measured headlessly by running
 * the real herds' state machines and testing the rig's measured head-tip
 * (world bbox of the neck+head branch at forward=+X) against every box
 * collider each tick. The fix settles a small probe circle at the head reach
 * and shifts the body by the push it receives (src/livestock.js).
 *
 * Cost: ~3 s headless. No GPU, no browser.
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

// Deterministic run: herds seed spots/yaws/states from Math.random.
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

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

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

function depthInBox(px, pz, b) {
  let lx = px - b.x;
  let lz = pz - b.z;
  if (b.yaw) {
    const cos = Math.cos(-b.yaw);
    const sin = Math.sin(-b.yaw);
    const rx = lx * cos - lz * sin;
    lz = lx * sin + lz * cos;
    lx = rx;
  }
  if (Math.abs(lx) > b.halfX || Math.abs(lz) > b.halfZ) {
    return 0;
  }
  return Math.min(b.halfX - Math.abs(lx), b.halfZ - Math.abs(lz));
}

const stock = createLivestock();
stock.update(1 / 60, new THREE.Vector3(0, 0, 0), new THREE.Vector3(99999, 0, 99999));

// Measure each rig's real forward extent from the built geometry, not from a
// table: with forward = +X, the world bbox of the whole rig gives the reach.
const animals = [];
for (const child of stock.group.children) {
  child.rotation.y = 0;
  child.updateMatrixWorld(true);
  const probe = new THREE.Box3();
  const tmp = new THREE.Box3();
  const walk = (obj) => {
    for (const c of obj.children) {
      walk(c);
    }
    if (obj.geometry) {
      if (!obj.geometry.boundingBox) {
        obj.geometry.computeBoundingBox();
      }
      tmp.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
      probe.union(tmp);
    }
  };
  walk(child);
  animals.push({ group: child, reach: probe.max.x - child.position.x });
}

assert(animals.length === 21, `expected 21 animals across the four herds, got ${animals.length}`);

const DT = 1 / 30;
const TICKS = 30 * 60 * 6; // 6 simulated minutes (~90 active seconds per herd
// after the camera rotation). Pre-fix, ~70% of a cow's active ticks sat with
// the muzzle inside a collider, so even one crossing would fail this check.
const homes = [POS.ranch, POS.sheepCamp, POS.westernRange, POS.foothills];
const camera = new THREE.Vector3(POS.ranch.x, 0, POS.ranch.z);
const player = new THREE.Vector3(99999, 0, 99999);

const stats = animals.map((a) => ({ species: a.reach > 1.3 ? "cow" : a.reach > 0.95 ? "deer" : "sheep", reach: a.reach, penTicks: 0, worst: 0, traveled: 0, last: a.group.position.clone() }));

for (let t = 0; t < TICKS; t += 1) {
  const home = homes[t % homes.length];
  camera.set(home.x, 0, home.z);
  stock.update(DT, camera, player);
  for (const [i, a] of animals.entries()) {
    const g = a.group;
    g.updateMatrixWorld(true);
    const tip = new THREE.Vector3(a.reach, 0, 0).applyMatrix4(g.matrixWorld);
    const s = stats[i];
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

const offenders = stats.filter((s) => s.penTicks > 0);
assert(
  offenders.length === 0,
  `Livestock heads are inside building colliders (${offenders.length} of ${stats.length} animals): ` +
    offenders.map((s) => `${s.species} reach ${s.reach.toFixed(2)} m — ${s.penTicks} ticks, worst ${s.worst.toFixed(2)} m deep`).join("; ") +
    ". The mover must settle its head probe (species.headReach/headRadius) against colliders, not just the body circle — see src/livestock.js update()."
);

// The clearance must not have frozen the herds: an animal that never leaves
// its spawn would "pass" the penetration test by testing nothing.
for (const [i, s] of stats.entries()) {
  assert(
    s.traveled > 5,
    `Animal ${i} (${s.species}) never moved during the simulated run (${s.traveled.toFixed(1)} m) — the head clearance is likely over-constraining movement.`
  );
}

const bySpecies = {};
for (const s of stats) {
  bySpecies[s.species] = bySpecies[s.species] || { animals: 0, minTraveled: Infinity, maxTraveled: 0 };
  bySpecies[s.species].animals += 1;
  bySpecies[s.species].minTraveled = Math.min(bySpecies[s.species].minTraveled, Math.round(s.traveled));
  bySpecies[s.species].maxTraveled = Math.max(bySpecies[s.species].maxTraveled, Math.round(s.traveled));
}

console.log(JSON.stringify({
  animals: animals.length,
  colliders: boxes.length,
  simMinutes: (TICKS * DT) / 60,
  headPenetrations: 0,
  bySpecies
}, null, 2));
console.log("PASS");