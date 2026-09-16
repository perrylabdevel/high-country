import * as THREE from "three/webgpu";
import model from "../models/general-store.json";
import { batched } from "./ranchRemodel.js";
import { addOrientedBoxCollider } from "../collision.js";
import { makeTexturedMat } from "../materials/texturedMat.ts";

/**
 * Lot-local contract for the Blender-authored general store exterior. The kit
 * in landmarks.js stays the source of truth for the 9.5 x 8 shell, the shed
 * roof, the false front and the apertures; this detail layer adds only visual
 * trim plus the awning posts and the goods standing on the boardwalk.
 *
 * `frontWindows` must match the display windows the authoring script frames:
 * the glass runs from the sill at 0.89 to the head at 2.62 (store.py BULK and
 * HEAD), and the aperture has to be at or above 0.5 or the kit declines to
 * glaze it at all.
 */
export const STORE = {
  model: "scripts/blender-store/store.py",
  footprint: { w: 9.5, d: 8 },
  frontWindows: [
    { x: -2.75, w: 2.40, h: 1.73, fromFloor: 0.89 },
    { x: 2.75, w: 2.40, h: 1.73, fromFloor: 0.89 }
  ],
  awningPosts: [{ x: -4.20, z: 5.81 }, { x: 4.20, z: 5.81 }],
  awningHeight: 2.56,
  /** Crates, kegs and sacks the shop keeps out under the awning. */
  boardwalkGoods: [
    { x: -4.03, z: 4.73, halfX: 0.34, halfZ: 0.34, top: 0.86 },
    { x: -3.37, z: 4.69, halfX: 0.32, halfZ: 0.32, top: 0.80 },
    { x: 3.95, z: 4.71, halfX: 0.33, halfZ: 0.28, top: 0.80 },
    { x: 3.03, z: 4.67, halfX: 0.36, halfZ: 0.26, top: 0.62 }
  ],
  /** The stepped display nooks standing just inside the window glass. */
  displayNooks: [
    { x: -2.75, z: 3.77, halfX: 1.14, halfZ: 0.30 },
    { x: 2.75, z: 3.77, halfX: 1.14, halfZ: 0.30 }
  ],
  displayTop: 2.62
};

function mat(base, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color: base, roughness: 0.88, ...extra });
}

/**
 * Batch materials for the authored export.
 *
 * `batched()` multiplies each material by the per-face tint baked into the
 * model, and store.py puts the ENTIRE paint scheme in those tints. So every
 * material here has to stay close to neutral and contribute only its texture:
 * a saturated base multiplies twice and collapses the facade to one hue --
 * cream trim goes mint and the red awning stripe goes brown.
 */
function tinted(maps) {
  const hasMaps = Boolean(maps?.wood && maps?.siding && maps?.rock && maps?.roof);
  return {
    // Gain is doing real work here, not taste: both the texture and the tint
    // are below white, so the product lands far darker than either. At the
    // first pass the green read near-black against the row's bare wood.
    paint: hasMaps
      ? makeTexturedMat(maps.siding, { tiling: 1.45, tint: 0xffffff, gain: 1.55 })
      : mat(0xdbd9d4),
    wood: hasMaps
      ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xfffaf0, gain: 1.9, rough: 0.9 })
      : mat(0xe6d4bc),
    stone: hasMaps
      ? makeTexturedMat(maps.rock, { tiling: 2.2, tint: 0xf2ecdf, gain: 1.2, rough: 0.95 })
      : mat(0xdbd4c4),
    roof: hasMaps
      ? makeTexturedMat(maps.roof, { tiling: 1.4, tint: 0xf0f0e8, gain: 1.05, rough: 0.82 })
      : mat(0xccccc3),
    // Mid-grey, not near-black: the authored tints carry both the dark iron
    // strap work and the bright tinware off this one batch.
    iron: mat(0x9ea3a1, { metalness: 0.6, roughness: 0.45 }),
    glass: mat(0xb3c7c3, { transparent: true, opacity: 0.34, metalness: 0.15, roughness: 0.15 })
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

/** Add the Blender-authored general store facade to the procedural town lot. */
export function attachStore(lot, maps) {
  const group = batched("generalStore", model, tinted(maps));
  lot.group.add(group);

  const frame = lotFrame(lot);
  const floor = lot.group.userData.placementY;

  // The awning supports stand on the shared boardwalk. Keep their footprints
  // solid only up to the awning, so they read as posts to walk around rather
  // than a wall across the storefront.
  for (const post of STORE.awningPosts) {
    frame.box(post.x, post.z, 0.11, 0.11, { minY: floor, maxY: floor + STORE.awningHeight });
  }

  // Stock left out front is authored geometry standing at knee height; without
  // colliders the player walks straight through the kegs and crates.
  for (const item of STORE.boardwalkGoods) {
    frame.box(item.x, item.z, item.halfX, item.halfZ, { minY: floor, maxY: floor + item.top });
  }

  // The window displays sit inside the shell, against the front wall. They are
  // shop fittings, so they block the strip of floor they stand on.
  for (const nook of STORE.displayNooks) {
    frame.box(nook.x, nook.z, nook.halfX, nook.halfZ, { minY: floor, maxY: floor + STORE.displayTop });
  }
  return group;
}
