/**
 * Collision coverage: enough colliders exist, key landmarks block movement,
 * and the resolver stays fast enough for per-frame use.
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

const { bakeHeightfield } = await import("../src/heightfield.js");
const {
  clearColliders,
  colliderCounts,
  hasColliderNear,
  movementBlocked
} = await import("../src/collision.js");
const { createRanch } = await import("../src/buildings.js");
const { createLandmarks } = await import("../src/landmarks.js");
const { createInteriors } = await import("../src/interiors.js");
const { createShore } = await import("../src/shore.js");
const { createIndustry } = await import("../src/industry.js");
const { createFort } = await import("../src/fort.js");
const { createPines } = await import("../src/pines.js");
const { createHomestead } = await import("../src/homestead.js");
const { createVegetation } = await import("../src/vegetation.js");
const { POS } = await import("../src/map.js");

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function bootstrapColliders() {
  clearColliders();
  bakeHeightfield();
  createRanch();
  const scene = { add() {} };
  createLandmarks(scene);
  createInteriors(scene);
  createShore(scene);
  createIndustry(scene);
  createFort(scene);
  createPines(scene);
  createHomestead(scene);
  createVegetation(scene);
  return colliderCounts();
}

const counts = bootstrapColliders();
assert(counts.boxes >= 70, `expected at least 70 box colliders, got ${counts.boxes}`);
assert(counts.cylinders >= 2800, `expected tree/rock colliders (>=2800 cylinders), got ${counts.cylinders}`);

const PLAYER_RADIUS = 0.42;
const HORSE_RADIUS = 0.78;

const spots = [
  { name: "ranchHouse", x: POS.ranch.x, z: POS.ranch.z - 8, radius: 8 },
  { name: "silverCreek", x: POS.silverCreek.x, z: POS.silverCreek.z, radius: 12 },
  { name: "fortGrant", x: POS.fortGrant.x, z: POS.fortGrant.z + 12, radius: 16 }
];

for (const spot of spots) {
  assert(
    hasColliderNear(spot.x, spot.z, spot.radius),
    `${spot.name} should have colliders within ${spot.radius} units`
  );
}

const ranchHouseZ = POS.ranch.z - 8;
assert(
  movementBlocked(POS.ranch.x, ranchHouseZ - 9, 0, 4, PLAYER_RADIUS),
  "player should not walk through the ranch house"
);
assert(
  movementBlocked(POS.silverCreek.x, POS.silverCreek.z - 14, 0, 5, PLAYER_RADIUS),
  "player should not walk through Silver Creek buildings"
);
assert(
  movementBlocked(POS.fortGrant.x, POS.fortGrant.z + 13.5, 0, -2, PLAYER_RADIUS),
  "player should not walk through Fort Grant wall"
);
assert(
  movementBlocked(POS.ranch.x - 28, POS.ranch.z + 18 - 9, 0, 5, HORSE_RADIUS),
  "horse should not walk through the ranch barn"
);

const benchStart = performance.now();
let probes = 0;
for (let i = 0; i < 120; i += 1) {
  const x = (i % 12 - 6) * 180;
  const z = Math.floor(i / 12) * 220 - 400;
  movementBlocked(x, z, 1.2, 0.8, PLAYER_RADIUS);
  probes += 1;
}
const benchMs = performance.now() - benchStart;
assert(benchMs < 250, `collision resolver too slow: ${benchMs.toFixed(1)}ms for ${probes} probes`);

console.log(JSON.stringify({
  counts,
  spots: spots.map((s) => s.name),
  benchMs: Number(benchMs.toFixed(2)),
  probes
}, null, 2));
console.log("PASS");
