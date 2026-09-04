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
const scene = { add() {}, remove() {} };
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
//
// Read from the module, not by grepping its source. These used to be matched
// out of src/vegetation.js with /const GRASS_RADIUS = (\d+)/, which silently
// produced NaN the moment the constant became an expression — a guard that
// cannot survive the code being refactored is not a guard.
//
// The values are per device tier now, so the floor is the tier's own: `high`
// must still reach 330 m, while `low` is ALLOWED to pull the disc in — that is
// the entire point of it. What must hold at every tier is the fade RATIO,
// because a disc that starts dissolving early leaves a bare mid-ground at any
// radius, which is the artefact this guard was written for.
const { GRASS_SCATTER } = await import("../src/vegetation.js");
const { getProfile } = await import("../src/perfProfile.js");
const tier = getProfile();
const radius = GRASS_SCATTER.GRASS_RADIUS;
const fadeIn = GRASS_SCATTER.GRASS_FADE_IN;
assert(Number.isFinite(radius) && Number.isFinite(fadeIn), `grass draw range is not numeric: radius ${radius}, fadeIn ${fadeIn}`);
assert(radius === tier.grassRadius, `grass radius ${radius} m does not match the active '${tier.name}' tier (${tier.grassRadius} m)`);
assert(tier.name !== "high" || radius >= 300, `grass draw radius regressed to ${radius} m on the high tier`);
assert(fadeIn / radius > 0.7, `grass starts dissolving at ${fadeIn.toFixed(0)}/${radius} — too early, leaves bare mid-ground`);

// Every mesh sharing a tinted foliage material must carry instanceColor.
// three fills vInstanceColor from that attribute; a mesh without it leaves the
// varying at its zero default and the canopy renders pure black. Nothing throws
// and nothing logs — the trees just turn into silhouettes — so this is checked
// rather than trusted. It is also what makes the unconditional
// crownDist.instanceColor.needsUpdate in bucketTrees safe to call.
const { createVegetation } = await import("../src/vegetation.js");
const vegAdded = [];
createVegetation({
  add: (...o) => vegAdded.push(...o),
  remove: (...o) => { for (const x of o) { const i = vegAdded.indexOf(x); if (i >= 0) vegAdded.splice(i, 1); } }
}, {});
const instanced = [];
for (const root of vegAdded) {
  if (root.traverse) {
    root.traverse((o) => o.isInstancedMesh && instanced.push(o));
  } else if (root.isInstancedMesh) {
    instanced.push(root);
  }
}
const byMaterial = new Map();
for (const mesh of instanced) {
  const key = mesh.material.uuid;
  if (!byMaterial.has(key)) {
    byMaterial.set(key, []);
  }
  byMaterial.get(key).push(mesh);
}
const blackCanopies = [];
for (const [, group] of byMaterial) {
  const tinted = group.some((m) => m.instanceColor);
  if (tinted) {
    for (const m of group) {
      if (!m.instanceColor) {
        blackCanopies.push(`${m.material.uuid.slice(0, 6)} cap=${m.instanceMatrix.count}`);
      }
    }
  }
}
assert(
  blackCanopies.length === 0,
  `meshes share a tinted foliage material but have no instanceColor, so they render black: ${blackCanopies.join(", ")}`
);

console.log(JSON.stringify({
  footprints: footprints.length,
  instancedFoliageMeshes: instanced.length,
  tintedMaterialsChecked: [...byMaterial.values()].filter((g) => g.some((m) => m.instanceColor)).length,
  interiorProbes: probes,
  interiorLeaks: missed.length,
  openGroundPlantable: `${openGround}/4000`,
  grassRadius: radius,
  grassFadeIn: fadeIn
}, null, 2));
console.log("PASS");
