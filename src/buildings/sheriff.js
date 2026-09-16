import * as THREE from "three/webgpu";
import model from "../models/sheriff-building.json";
import { batched } from "./ranchRemodel.js";
import { addOrientedBoxCollider } from "../collision.js";
import { makeTexturedMat } from "../materials/texturedMat.ts";

/**
 * Lot-local contract for the Blender-authored sheriff exterior. The kit in
 * landmarks.js remains the source of truth for the shell and apertures; this
 * detail layer is allowed to add only visual trim and the two canopy posts.
 */
export const SHERIFF_REMODEL = {
  model: "scripts/blender-sheriff-building/sheriff_building.py",
  footprint: { w: 9, d: 8 },
  frontWindows: [
    { x: -2.55, w: 1.45, h: 1.10, fromFloor: 0.95 },
    { x: 2.55, w: 1.45, h: 1.10, fromFloor: 0.95 }
  ],
  canopyPosts: [{ x: -1.58, z: 5.30 }, { x: 1.58, z: 5.30 }]
};

function mat(base, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color: base, roughness: 0.88, ...extra });
}

function tinted(maps) {
  const hasMaps = Boolean(maps?.wood && maps?.siding && maps?.rock && maps?.roof);
  const siding = hasMaps
    ? makeTexturedMat(maps.siding, { tiling: 1.45, tint: 0xffffff, gain: 1.25 })
    : mat(0xe6c1ad);
  const wood = hasMaps
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xf0dcc0, gain: 1.7, rough: 0.9 })
    : mat(0x8c5d37);
  const stone = hasMaps
    ? makeTexturedMat(maps.rock, { tiling: 2.2, tint: 0xe0d8c8, gain: 1.25, rough: 0.95 })
    : mat(0x92897b);
  const roof = hasMaps
    ? makeTexturedMat(maps.roof, { tiling: 1.4, tint: 0xc7c7bb, gain: 1.1, rough: 0.82 })
    : mat(0x596064);
  return {
    paint: siding,
    wood,
    stone,
    roof,
    iron: mat(0x262a29, { metalness: 0.65, roughness: 0.42 }),
    glass: mat(0x304b48, { transparent: true, opacity: 0.32, metalness: 0.18, roughness: 0.16 })
  };
}

function lotFrame(lot) {
  const group = lot.group;
  group.updateWorldMatrix(true, false);
  const quat = new THREE.Quaternion();
  const yaw = new THREE.Euler().setFromQuaternion(group.getWorldQuaternion(quat), "YXZ").y;
  const point = new THREE.Vector3();
  return {
    box(x, z, halfX, halfZ, span) {
      group.localToWorld(point.set(x, 0, z));
      addOrientedBoxCollider(point.x, point.z, halfX, halfZ, -yaw, span);
    }
  };
}

/** Add the Blender-authored sheriff facade to the procedural town lot. */
export function attachSheriff(lot, maps) {
  const group = batched("sheriffRemodel", model, tinted(maps));
  lot.group.add(group);

  // The canopy supports are part of the authored visual and stand on the
  // shared boardwalk. Keep their narrow footprints solid, but only at canopy
  // height so the player can still enter through the real kit doorway.
  const frame = lotFrame(lot);
  for (const post of SHERIFF_REMODEL.canopyPosts) {
    frame.box(post.x, post.z, 0.10, 0.10, {
      minY: lot.group.userData.placementY,
      maxY: lot.group.userData.placementY + 2.75
    });
  }
  return group;
}
