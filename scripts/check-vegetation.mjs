/**
 * Vegetation must not grow through buildings.
 *
 * inClearing() only guards the ranch and Silver Creek discs, so before the
 * footprint index every other settlement on the map — the fort, the stamp
 * mill, the El Paso plaza, the timber cabins, the street lots — had grass,
 * sage and pines standing inside its barns, homes and shop floors.
 *
 * This builds the world dry, then replays the exact placement predicates the
 * scatter uses over a dense sweep of every footprint and asserts nothing lands
 * inside one. Also pins the draw radius so a future tuning pass cannot quietly
 * shrink the ground cover back to the old 210 m.
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
const { clearColliders } = await import("../src/collision.js");
const { createLandmarks } = await import("../src/landmarks.js");
const { createInteriors } = await import("../src/interiors.js");
const { createRanch } = await import("../src/buildings.js");
const { STRUCTURES, insideStructure, buildFootprintIndex } = await import("../src/buildings/kit.js");

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

const footprints = STRUCTURES.filter((s) => s.userData.w && s.userData.d);
assert(footprints.length > 20, `expected the whole map's buildings, got ${footprints.length}`);

buildFootprintIndex();

// The scatter's own clearances, from src/vegetation.js.
const GRASS_CLEARANCE = 0.9;

/**
 * Sweep a grid over each footprint's interior in the building's local frame and
 * confirm insideStructure() rejects every point. A miss here is a tuft standing
 * in someone's parlour.
 */
let probes = 0;
const missed = [];
for (const group of footprints) {
  const u = group.userData;
  const cos = Math.cos(u.yaw);
  const sin = Math.sin(u.yaw);
  const steps = 9;
  for (let a = 0; a < steps; a += 1) {
    for (let b = 0; b < steps; b += 1) {
      // Local point strictly inside the footprint, then local -> world.
      const lx = (a / (steps - 1) - 0.5) * u.w * 0.96;
      const lz = (b / (steps - 1) - 0.5) * u.d * 0.96;
      const x = u.x + lx * cos + lz * sin;
      const z = u.z - lx * sin + lz * cos;
      probes += 1;
      if (!insideStructure(x, z, GRASS_CLEARANCE)) {
        missed.push({ name: u.name, x: +x.toFixed(2), z: +z.toFixed(2) });
      }
    }
  }
}
assert(
  missed.length === 0,
  `${missed.length}/${probes} interior points not excluded, e.g. ${JSON.stringify(missed.slice(0, 4))}`
);

// The index must not be so eager that it strips the countryside bare: a point
// well clear of every building has to stay plantable.
let openGround = 0;
for (let i = 0; i < 4000; i += 1) {
  const x = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 1200;
  const z = (Math.sin(i * 78.233) * 43758.5453 % 1) * 1200;
  if (!insideStructure(x, z, GRASS_CLEARANCE)) {
    openGround += 1;
  }
}
assert(openGround > 3800, `footprint index is rejecting open ground: only ${openGround}/4000 plantable`);

// Draw range regression guard.
const veg = await import("node:fs/promises").then((fs) => fs.readFile("src/vegetation.js", "utf8"));
const radius = Number(/const GRASS_RADIUS = (\d+)/.exec(veg)?.[1]);
const fadeIn = Number(/const GRASS_FADE_IN = (\d+)/.exec(veg)?.[1]);
assert(radius >= 300, `grass draw radius regressed to ${radius} m`);
assert(fadeIn / radius > 0.7, `grass starts dissolving at ${fadeIn}/${radius} — too early, leaves bare mid-ground`);

console.log(JSON.stringify({
  footprints: footprints.length,
  interiorProbes: probes,
  interiorLeaks: missed.length,
  openGroundPlantable: `${openGround}/4000`,
  grassRadius: radius,
  grassFadeIn: fadeIn
}, null, 2));
console.log("PASS");
