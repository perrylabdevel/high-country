/**
 * Kit props seated on the terrain must not float above a slope.
 *
 * boxOnGround / cylOnGround / coneOnGround used to seat every prop at the
 * single centre sample heightAt(x, z). On any slope the downhill edge of a
 * wide piece hovered — the same silent defect the grass tufts had. Measured
 * before the fix: an ironValley ore cart 0.46 m up at its downhill edge, a
 * sheepCamp tipi 0.35 m, timberCamp log stacks and charcoal-pit discs
 * 0.11–0.25 m. Nothing threw and nothing logged; the pieces simply hovered
 * (close-camera U4 "bases appear slightly detached"). The fix seats each pad
 * at the LOWEST terrain sample under its footprint (kit.js lowestSeat); this
 * check keeps that invariant true.
 *
 * Runs headless and offline: dry-build the world, then for every piece the
 * kit grounded on terrain (stamped userData.groundSeat) whose seated offset
 * is ground-level, assert its base is within 5 cm of the lowest terrain under
 * its footprint. Pieces mated higher up (ladder rungs, tent cones, sawbuck
 * tops) rest on other pieces, not the terrain, and are excluded by their
 * yOff.
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

import * as THREE from "three/webgpu";
const { bakeHeightfield, heightAt } = await import("../src/heightfield.js");
const { clearColliders } = await import("../src/collision.js");
const { createLandmarks } = await import("../src/landmarks.js");
const { createInteriors } = await import("../src/interiors.js");
const { createRanch } = await import("../src/buildings.js");
const { buildFootprintIndex } = await import("../src/buildings/kit.js");
const { POS } = await import("../src/map.js");
const { createIndustry } = await import("../src/industry.js");
const { createFort } = await import("../src/fort.js");
const { createPines } = await import("../src/pines.js");
const { createHomestead } = await import("../src/homestead.js");

const MAX_LIFT = 0.05;
// A piece mated this close to its pad base is meant to touch the ground;
// anything higher rests on other geometry (rungs start at 0.28, pit sticks
// at 0.12, tent cones at 0.55).
const GROUNDED_YOFF = 0.10;

clearColliders();
bakeHeightfield();
const roots = [];
const scene = { add: (...o) => roots.push(...o), remove: (...o) => { for (const x of o) { const i = roots.indexOf(x); if (i >= 0) roots.splice(i, 1); } } };
createLandmarks(scene);
createInteriors(scene);
createRanch();
buildFootprintIndex();
createIndustry(scene, {});
createFort(scene, {});
createPines(scene);
createHomestead(scene, {});

const meshes = [];
for (const root of roots) {
  if (!root?.isObject3D) {
    continue;
  }
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (o.userData?.groundSeat) {
      meshes.push(o);
    }
  });
}

if (!meshes.length) {
  throw new Error(
    "check-prop-grounding found no ground-seated kit pieces. The scene stub must collect the groups passed to scene.add() by landmarks/interiors/industry/fort/pines/homestead — if the world builders changed how they attach pieces, update this harness."
  );
}

/**
 * Lowest terrain under a piece's contact footprint. Kit pads seat over a
 * circle (lowestSeat samples centre + an 8-point ring), so sample the same
 * disc here — a bbox square would read the empty corners past a round base
 * and flag every tipi.
 */
function terrainMin(cx, cz, r) {
  let mn = heightAt(cx, cz);
  for (let ring = 1; ring <= 2; ring += 1) {
    const rr = (r * ring) / 2;
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      mn = Math.min(mn, heightAt(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr));
    }
  }
  return mn;
}

const offenders = [];
let checked = 0;
for (const mesh of meshes) {
  const { yOff } = mesh.userData.groundSeat;
  if (yOff > GROUNDED_YOFF) {
    continue;
  }
  const box = new THREE.Box3().setFromObject(mesh);
  if (!isFinite(box.min.x)) {
    continue;
  }
  // The pad's own stamped radius is the contact footprint — a bbox-derived
  // reach would over-sample past a round base by sqrt(2).
  const cx = (box.min.x + box.max.x) / 2;
  const cz = (box.min.z + box.max.z) / 2;
  const mn = terrainMin(cx, cz, mesh.userData.groundSeat.r);
  if (!isFinite(mn)) {
    continue;
  }
  checked += 1;
  const lift = box.min.y - mn;
  if (lift > MAX_LIFT) {
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    let poi = "open ground";
    let best = Infinity;
    for (const [name, p] of Object.entries(POS)) {
      const d = Math.hypot(cx - p.x, cz - p.z);
      if (d < best) {
        best = d;
        poi = name;
      }
    }
    offenders.push({
      poi,
      distM: +best.toFixed(0),
      liftM: +lift.toFixed(3),
      x: +cx.toFixed(0),
      z: +cz.toFixed(0),
      w: +(box.max.x - box.min.x).toFixed(2),
      d: +(box.max.z - box.min.z).toFixed(2)
    });
  }
}

if (offenders.length) {
  throw new Error(
    `${offenders.length} kit props sit more than ${MAX_LIFT * 100} cm above the lowest terrain under their footprint, e.g. ${JSON.stringify(offenders.slice(0, 4))} — a prop pad must be seated at the lowest terrain sample over its footprint (see lowestSeat in src/buildings/kit.js; re-run "npm run check:prop-grounding" after fixing).`
  );
}
console.log(JSON.stringify({ groundSeatedPieces: checked, floatingProps: 0, maxLiftCm: "<=5" }));
console.log("PASS");