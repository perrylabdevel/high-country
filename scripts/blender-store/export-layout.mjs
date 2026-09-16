/**
 * Write the store lot's world frame to layout.json for capture.mjs.
 *
 * The lot is placed by the street builder, not by hand: its world x/z, yaw and
 * seated floor all fall out of the row's spacing and the terrain under it. So
 * the capture poses are written in lot-local metres (x across the facade, +z
 * toward the street) and this resolves the frame they hang off.
 */
import { writeFile } from "node:fs/promises";
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
const { STORE } = await import("../../src/buildings/store.js");

bakeHeightfield();
clearColliders();
createLandmarks(new THREE.Scene());

const lot = ENTERABLE_LOTS.find((l) => l.name === "store");
if (!lot) throw new Error("store lot missing");

const layout = {
  generator: "scripts/blender-store/export-layout.mjs",
  lot: {
    x: lot.x,
    z: lot.z,
    yaw: lot.yaw,
    placementY: lot.group.userData.placementY,
    w: lot.w,
    d: lot.d,
    h: lot.h
  },
  store: STORE
};
const target = new URL("./layout.json", import.meta.url);
await writeFile(target, JSON.stringify(layout, null, 2));
console.log(JSON.stringify(layout.lot));
