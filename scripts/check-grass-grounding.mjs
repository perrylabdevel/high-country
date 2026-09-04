/**
 * Grass and sage must sit on the terrain, not hover above a slope.
 *
 * Every tuft used to be anchored at heightAt() of its centre only. On any
 * slope the downhill edge of the card footprint hovered above the ground —
 * worst on the open plains (westernRange: 15.9k tufts > 5 cm) and the strata
 * slopes (badlands: 46% of tufts). Nothing threw, nothing logged: the blades
 * were alpha-tested and simply floated (audit U4 "grass rendering above the
 * terrain"). The fix seats each tuft at the LOWEST terrain sample over its
 * footprint; this check makes that invariant stay true.
 *
 * Runs headless and offline: dry-build the world, scatter around a few
 * slope-heavy cameras, then for every grass/sage instance assert its base is
 * within 5 cm of the lowest terrain under its footprint.
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
const { bakeHeightfield, meshHeightAt } = await import("../src/heightfield.js");
const { clearColliders } = await import("../src/collision.js");
const { createLandmarks } = await import("../src/landmarks.js");
const { createInteriors } = await import("../src/interiors.js");
const { createRanch } = await import("../src/buildings.js");
const { buildFootprintIndex } = await import("../src/buildings/kit.js");
const { POS } = await import("../src/map.js");
const { createVegetation } = await import("../src/vegetation.js");

const MAX_LIFT = 0.05;

clearColliders();
bakeHeightfield();
const scene = { add() {}, remove() {} };
createLandmarks(scene);
createInteriors(scene);
createRanch();
buildFootprintIndex();

const added = [];
const veg = createVegetation({
  add: (...o) => added.push(...o),
  // Grass tiles add and remove themselves as residency changes, so the stub
  // has to honour removal or `added` drifts away from what is really drawn.
  remove: (...o) => { for (const x of o) { const i = added.indexOf(x); if (i >= 0) added.splice(i, 1); } }
}, {});
const m = new THREE.Matrix4();
const pos = new THREE.Vector3();
const scale = new THREE.Vector3();

const CAMERAS = [
  ["westernRange", POS.westernRange.x + 34 + Math.sin((100 * Math.PI) / 180) * 14, POS.westernRange.z - 28 + Math.cos((100 * Math.PI) / 180) * 14],
  ["badlands", POS.badlands.x + Math.sin((110 * Math.PI) / 180) * 14, POS.badlands.z + Math.cos((110 * Math.PI) / 180) * 14],
  ["northernPines", POS.northernPines.x + Math.sin((120 * Math.PI) / 180) * 10, POS.northernPines.z + Math.cos((120 * Math.PI) / 180) * 10]
];

const offenders = [];
let checked = 0;
for (const [name, cx, cz] of CAMERAS) {
  const cam = new THREE.Vector3(cx, 0, cz);
  let guard = 0;
  while (!veg.scatterSettled(cam) && guard < 200) {
    veg.update(cam);
    guard += 1;
  }
  veg.update(cam);
  for (const o of added) {
    if (!o || !o.isInstancedMesh) continue;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    // Grass/sage only: small, low geometry. Tree trunks/crowns are taller/wider.
    if (bb.max.x - bb.min.x > 2.5 || bb.max.y - bb.min.y > 2.5) continue;
    for (let i = 0; i < o.count; i += 1) {
      o.getMatrixAt(i, m);
      pos.setFromMatrixPosition(m);
      scale.setFromMatrixScale(m);
      const foot = ((bb.max.x - bb.min.x) * scale.x) / 2;
      let mn = pos.y;
      for (const [dx, dz] of [[foot, 0], [-foot, 0], [0, foot], [0, -foot]]) {
        mn = Math.min(mn, meshHeightAt(pos.x + dx, pos.z + dz));
      }
      checked += 1;
      if (pos.y - mn > MAX_LIFT) {
        offenders.push({
          cam: name,
          x: +pos.x.toFixed(1),
          z: +pos.z.toFixed(1),
          lift: +(pos.y - mn).toFixed(3),
          bboxW: +((bb.max.x - bb.min.x) * scale.x).toFixed(3),
          bboxH: +((bb.max.y - bb.min.y) * scale.y).toFixed(3),
          geoW: +(bb.max.x - bb.min.x).toFixed(3),
          scaleX: +scale.x.toFixed(3)
        });
      }
    }
  }
}

if (offenders.length) {
  throw new Error(
    `${offenders.length} grass/sage tufts sit more than ${MAX_LIFT * 100} cm above the terrain under their footprint, e.g. ${JSON.stringify(offenders.slice(0, 4))} — a tuft must be seated at the lowest terrain sample over its footprint (see src/vegetation.js plantBlade/plantSage).`
  );
}
console.log(JSON.stringify({ grassTuftsChecked: checked, floatingTufts: 0, maxLiftCm: "<=5", cameras: CAMERAS.length }));
console.log("PASS");
