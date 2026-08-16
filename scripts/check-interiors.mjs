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
        const noop = () => {};
        return new Proxy({}, { get: () => noop });
      }
    };
  }
};

const { bakeHeightfield } = await import("../src/heightfield.js");
const {
  clearColliders,
  hasColliderNear,
  movementBlocked
} = await import("../src/collision.js");
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
const scene = { add() {} };
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
  lots: names,
  doors: ENTERABLE_LOTS.map((lot) => ({
    name: lot.name,
    streetDirX: Number(lot.streetDirX.toFixed(3)),
    streetDirZ: Number(lot.streetDirZ.toFixed(3))
  }))
}, null, 2));
console.log("PASS");
