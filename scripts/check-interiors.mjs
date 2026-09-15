/**
 * Enterable sheriff and saloon: door gap open, back wall closed, colliders present.
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
        // Every 2D call returns a gradient-like object rather than undefined,
        // so painters that build CanvasGradients work against the stub too.
        const gradient = { addColorStop() {} };
        const noop = () => gradient;
        return new Proxy({}, { get: () => noop });
      }
    };
  }
};

const { bakeHeightfield, heightAt, meshHeightAt } = await import("../src/heightfield.js");
const {
  clearColliders,
  deckHeightAt,
  hasColliderNear,
  movementBlocked
} = await import("../src/collision.js");
const { STRUCTURES } = await import("../src/buildings/kit.js");
const { SALOON } = await import("../src/buildings/saloon.js");
const THREE = await import("three/webgpu");
const { createLandmarks, ENTERABLE_LOTS } = await import("../src/landmarks.js");
const { createInteriors } = await import("../src/interiors.js");
const { createRanch } = await import("../src/buildings.js");
const { POS } = await import("../src/map.js");

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

clearColliders();
bakeHeightfield();
const scene = { add() {}, remove() {} };
createLandmarks(scene);
createInteriors(scene);
createRanch();

const names = ENTERABLE_LOTS.map((lot) => lot.name);
assert(names.includes("sheriff"), "ENTERABLE_LOTS should include sheriff");
assert(names.includes("saloon"), "ENTERABLE_LOTS should include saloon");

const RADIUS = 0.42;

function walkBlocked(x, z, dirX, dirZ, total, radius, step = 0.2) {
  const len = Math.hypot(dirX, dirZ) || 1;
  const nx = dirX / len;
  const nz = dirZ / len;
  let px = x;
  let pz = z;
  let remaining = total;
  while (remaining > 0.001) {
    const s = Math.min(step, remaining);
    if (movementBlocked(px, pz, nx * s, nz * s, radius)) {
      return true;
    }
    px += nx * s;
    pz += nz * s;
    remaining -= s;
  }
  return false;
}

for (const lot of ENTERABLE_LOTS) {
  const dist = lot.d / 2 + 1.2;
  const walk = 2.5;
  const outX = lot.x + lot.streetDirX * dist;
  const outZ = lot.z + lot.streetDirZ * dist;
  assert(
    !walkBlocked(outX, outZ, -lot.streetDirX, -lot.streetDirZ, walk, RADIUS),
    `${lot.name} door should allow walking in from the street`
  );

  const backX = lot.x - lot.streetDirX * dist;
  const backZ = lot.z - lot.streetDirZ * dist;
  assert(
    walkBlocked(backX, backZ, lot.streetDirX, lot.streetDirZ, walk, RADIUS),
    `${lot.name} back wall should block entry`
  );

  assert(
    hasColliderNear(lot.x, lot.z, Math.max(lot.w, lot.d)),
    `${lot.name} should have colliders near the lot`
  );
}

// Every enterable floor is a surface the player stands on. Grounding is
// max(terrain, registered deck), and nothing registered the lot floors, so on
// the boardwalk plinth the player dropped to the dirt 0.3-0.5 m under the
// boards, and on the side streets the slope came up through them. Sample each
// floor out to its threshold: the deck must answer the floor top, and the
// terrain (collision and rendered) must stay under it.
const FLOOR_TOL = 0.01;
const floorTop = (group) => {
  if (group.userData.storeys) {
    return SALOON.FLOOR;
  }
  let top = null;
  group.traverse((n) => {
    if (n.userData.role === "floor" && top === null) {
      top = n.userData.top;
    }
  });
  return top;
};
const floored = [
  ...ENTERABLE_LOTS.map((lot, i) => ({ label: `${lot.name || "streetLot"}#${i}`, group: lot.group, door: 1 })),
  // Habitable kit shells outside the town that lay their own floor slab. The
  // ranch house has its own check (check:ranch-interior).
  ...STRUCTURES.filter((g) => g.userData.name === "huntingCabin").map((group) => ({ label: "huntingCabin", group, door: -1 })),
  ...STRUCTURES.filter((g) => g.userData.name === "bunkhouse").map((group) => ({ label: "bunkhouse", group, door: 1 }))
];
assert(floored.length === ENTERABLE_LOTS.length + 2, "hunting cabin and bunkhouse should be among the floored shells");
const floorFailures = [];
const local = new THREE.Vector3();
for (const { label, group, door } of floored) {
  const u = group.userData;
  const top = floorTop(group);
  assert(top !== null, `${label} has no floor-tagged slab`);
  group.updateWorldMatrix(true, false);
  const floorY = u.placementY + top;
  const inX = u.w / 2 - 0.35;
  const inZ = u.d / 2 - 0.35;
  const points = [];
  for (let i = 0; i <= 4; i += 1) {
    for (let j = 0; j <= 4; j += 1) {
      points.push([(i / 4 - 0.5) * 2 * inX, (j / 4 - 0.5) * 2 * inZ]);
    }
  }
  // The doorway: just inside the wall, in the opening, and on the sill's outer edge.
  for (const at of [u.d / 2 - 0.15, u.d / 2, u.d / 2 + 0.08]) {
    points.push([0, door * at]);
  }
  for (const [lx, lz] of points) {
    const p = group.localToWorld(local.set(lx, 0, lz));
    // A tight climb, so the saloon's stair ramp above its boards does not answer.
    const deck = deckHeightAt(p.x, p.z, floorY + 0.02, 0.03);
    const ground = Math.max(heightAt(p.x, p.z), meshHeightAt(p.x, p.z));
    const stand = Math.max(heightAt(p.x, p.z), deck);
    if (!(Math.abs(deck - floorY) <= FLOOR_TOL) || ground > floorY || Math.abs(stand - floorY) > FLOOR_TOL) {
      floorFailures.push(
        `${label} at local (${lx.toFixed(2)}, ${lz.toFixed(2)}): deck ${Number.isFinite(deck) ? (deck - u.placementY).toFixed(3) : "none"}, ` +
        `terrain ${(ground - u.placementY).toFixed(3)}, floor top ${top.toFixed(3)}`
      );
    }
  }
}
assert(!floorFailures.length, `floors are not where the player stands (${floorFailures.length} samples):\n  ${floorFailures.slice(0, 12).join("\n  ")}`);

const houseZ = POS.ranch.z - 8;
assert(
  !walkBlocked(POS.ranch.x, houseZ + 7.2, 0, -1, 5.2, RADIUS),
  "ranch porch door should allow walking in from the south"
);
assert(
  walkBlocked(POS.ranch.x, houseZ - 9, 0, 1, 4, RADIUS),
  "ranch north wall should still block"
);

console.log(JSON.stringify({
  floors: floored.length,
  lots: names,
  doors: ENTERABLE_LOTS.map((lot) => ({
    name: lot.name,
    streetDirX: Number(lot.streetDirX.toFixed(3)),
    streetDirZ: Number(lot.streetDirZ.toFixed(3))
  }))
}, null, 2));
console.log("PASS");
