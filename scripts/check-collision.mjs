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
  const scene = { add() {}, remove() {} };
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
// Silver Creek's buildings are enterable now — every lot cuts a door gap in
// its front wall and the aperture check owns the walk-through contract — so
// this probe crosses a building's back (north) WALL instead: the endpoint
// lands inside the wall collider itself, which must displace it. (The old
// probe walked at a street lot whose door now stands open; moveAndSlide
// resolves only the segment endpoints, and the old endpoint sat 3.5 cm short
// of the back wall — it passed only while a solid blockout box covered the
// whole footprint, which enterable lots no longer have.)
assert(
  movementBlocked(POS.silverCreek.x - 7, POS.silverCreek.z - 8.6, 5, 0, PLAYER_RADIUS),
  "player should not walk through Silver Creek building walls"
);
// And the new contract, held from the other side: a town door the player can
// see open must actually admit them — walk straight in through the church's
// front door, street side to interior. (Church door centre is town.x + 13,
// town.z + 7.5, facing south; this walks the door's centre line.)
assert(
  !movementBlocked(POS.silverCreek.x + 13.3, POS.silverCreek.z + 5.5, -0.6, 3.96, PLAYER_RADIUS),
  "player should walk through an open Silver Creek door"
);
assert(
  movementBlocked(POS.fortGrant.x, POS.fortGrant.z + 13.5, 0, -2, PLAYER_RADIUS),
  "player should not walk through Fort Grant wall"
);
assert(
  // The bay corridor is now a real passage (the aperture check owns that
  // contract), so this probe crosses the south WALL segment instead: the
  // endpoint lands inside the wall collider itself, which must displace it.
  movementBlocked(POS.ranch.x - 28, POS.ranch.z + 2, 6, 22, HORSE_RADIUS),
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
