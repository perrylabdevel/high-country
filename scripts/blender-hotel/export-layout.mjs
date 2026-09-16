/**
 * Snapshot the hotel lot for Blender: HOTEL, the lot's world frame, and every
 * kit wall frame with its openings, in lot-local metres. Writes layout.json,
 * which hotel.py and interior.py both read, so the authored work can never
 * disagree with the apertures the kit actually cuts. capture.mjs reads the
 * lot frame from here too.
 *
 * The openings list is the load-bearing part. hotel.py once hard-coded its own
 * window positions and drew clapboard straight across every one of them --
 * glass and door included -- because nothing tied the siding to the holes.
 */
import { writeFileSync } from "node:fs";
import * as THREE from "three/webgpu";

globalThis.document = {
  createElement: () => ({
    width: 256,
    height: 256,
    getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) })
  })
};

const { bakeHeightfield } = await import("../../src/heightfield.js");
const { clearColliders } = await import("../../src/collision.js");
const { createLandmarks, ENTERABLE_LOTS } = await import("../../src/landmarks.js");
const { createInteriors } = await import("../../src/interiors.js");
const { HOTEL } = await import("../../src/buildings/hotel.js");

bakeHeightfield();
clearColliders();
const scene = new THREE.Scene();
createLandmarks(scene);
createInteriors(scene);
scene.updateMatrixWorld(true);

const lot = ENTERABLE_LOTS.find((l) => l.name === "hotel");
if (!lot) throw new Error("hotel lot missing");
const st = lot.group;
const inverse = st.matrixWorld.clone().invert();
const walls = [];
st.traverse((o) => {
  if (o.userData.role !== "wall") return;
  const { length, height, thickness, openings } = o.userData;
  walls.push({
    length, height, thickness, openings,
    // The kit's exterior walls are direct children of the lot group; the
    // interior shell's are not.
    interior: !st.children.includes(o),
    matrix: inverse.clone().multiply(o.matrixWorld).toArray()
  });
});

const layout = {
  generator: "scripts/blender-hotel/export-layout.mjs",
  hotel: HOTEL,
  lot: {
    x: lot.x, z: lot.z, yaw: lot.yaw,
    placementY: st.userData.placementY,
    w: lot.w, d: lot.d, h: lot.h
  },
  walls
};
writeFileSync(new URL("./layout.json", import.meta.url), JSON.stringify(layout, null, 1));
console.log(`hotel at ${lot.x.toFixed(2)},${lot.z.toFixed(2)} yaw ${lot.yaw.toFixed(4)} ` +
  `y ${st.userData.placementY.toFixed(3)}; ${walls.length} wall frames`);
for (const w of walls) {
  const z = w.matrix[14];
  if (w.openings?.length) {
    console.log(`  ${w.interior ? "interior" : "exterior"} wall z=${z.toFixed(2)} len ${w.length}: ${w.openings.length} openings`);
  }
}
