import * as THREE from "three/webgpu";
import { color } from "three/tsl";
import model from "../models/sheriff-building.json";
import interiorModel from "../models/sheriff-interior.json";
import { batched } from "./ranchRemodel.js";
import { addOrientedBoxCollider } from "../collision.js";
import { makeTexturedMat } from "../materials/texturedMat.ts";
import { addLocalPropSpot } from "../propSpots.js";

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
  canopyPosts: [{ x: -1.58, z: 5.30 }, { x: 1.58, z: 5.30 }],

  // The interior (scripts/blender-sheriff-building/interior.py): one storey
  // under the kit's own ceiling slab, whose underside is at 2.62 (addShell:
  // min(2.7, h - 0.35) less its 0.08 m thickness). Every number is asserted in
  // check:sheriff.
  FLOOR: 0.08,
  CEIL: 2.62,
  INNER: { x: 4.28, z: 3.78 },
  DOOR: { w: 0.9, h: 2.1 },
  // Two cells down the west side, under the barred windows side_jail_detail()
  // draws on the outside at z -1.55 and 0.15. The bar front runs along x
  // `front`; the cells are split at z `divider`, and closed toward the street
  // at z `end`. Cell A's door stands open into the office; cell B's is locked.
  CELLS: {
    front: -1.70,
    divider: -0.70,
    end: 1.90,
    doors: [
      { z0: -2.35, z1: -1.45, open: true },
      { z0: 0.35, z1: 1.25, open: false }
    ],
    // Barred windows on the west wall, in line with the exterior ones.
    windows: [{ z: -1.55, w: 1.2, fromFloor: 1.22, h: 0.96 }, { z: 0.15, w: 1.2, fromFloor: 1.22, h: 0.96 }],
    // Strap-iron bunks chained to the west wall, [z0, z1]; 0.70 deep, top 0.50.
    bunks: [[-3.55, -1.65], [-0.45, 1.45]]
  },
  // Office furniture footprints [x0, x1, z0, z1] that collide, and their tops.
  DESK: { x: 1.4, z: -0.4 },
  STOVE: { x: 2.55, z: -2.55, r: 0.32 },
  SAFE: [3.56, 4.24, -3.74, -3.10],
  BENCH: [1.95, 3.15, 3.36, 3.74],
  PIGEONHOLES: [-4.28, -3.88, 2.15, 3.35],
  // Stovepipe through the ceiling and out of the roof, at the stove's centre.
  // The roof's slope is 1.18 over 4.72 from the 5.58 ridge.
  FLUE: { x: 2.55, z: -2.55 }
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

/**
 * Interior batch materials: the saloon's, the hotel's and the store's, so
 * walking between them crosses no material cliff. Each base is the texture's
 * grain over near-white and the per-face tint carries the colour.
 */
function interiorMaterials(maps) {
  const hasMaps = Boolean(maps?.wood && maps?.siding && maps?.rock);
  const neutral = (set, grain, rough) => {
    if (!hasMaps) return new THREE.MeshStandardNodeMaterial({ color: 0xe8e2d6, roughness: rough });
    const m = makeTexturedMat(set, { tiling: 1.6, tint: 0xffffff, gain: 1.4, rough });
    m.colorNode = m.colorNode.mul(grain).add(color(0xf2eee6).mul(1 - grain));
    return m;
  };
  const wood = hasMaps
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xf0dcc0, gain: 1.9 })
    : new THREE.MeshStandardNodeMaterial({ color: 0xb09070, roughness: 0.9 });
  return {
    paint: neutral(maps?.siding, 0.32, 0.86),
    floor: wood,
    timber: hasMaps
      ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xcfa06a, gain: 1.6, rough: 0.9 })
      : new THREE.MeshStandardNodeMaterial({ color: 0x6b4226, roughness: 0.9 }),
    fabric: neutral(maps?.siding, 0.35, 1),
    brass: new THREE.MeshStandardNodeMaterial({ color: 0xb58a42, roughness: 0.35, metalness: 0.85 }),
    // Near-white: the tints carry the bars, the stove and the safe.
    iron: new THREE.MeshStandardNodeMaterial({ color: 0xd8d8d2, roughness: 0.5, metalness: 0.45 }),
    glass: new THREE.MeshStandardNodeMaterial({ color: 0x9fb6b2, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.4 })
  };
}

/**
 * The sheriff's office and its two cells, in the lot's own frame. Replaces the
 * procedural props: a desk, a gun rack and a fence of 7 cm boxes for bars that
 * nothing collided with, so the "cells" could be walked straight through.
 */
export function sheriffInterior(lot, maps) {
  const { FLOOR, INNER, CELLS, DESK, STOVE, SAFE, BENCH, PIGEONHOLES } = SHERIFF_REMODEL;
  const g = lot.group;
  const f = lotFrame(lot);
  const X = INNER.x;
  const Z = INNER.z;
  const box = (x0, x1, z0, z1) => f.box((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2);

  // The bar front, broken only where a cell door stands open; the divider
  // between the cells; the bars closing the cells toward the street.
  const cuts = CELLS.doors.filter((d) => d.open).map((d) => [d.z0, d.z1]);
  let from = -Z;
  for (const [z0, z1] of [...cuts, [CELLS.end, CELLS.end]]) {
    if (z0 > from) box(CELLS.front - 0.05, CELLS.front + 0.05, from, z0);
    from = z1;
  }
  box(-X, CELLS.front + 0.05, CELLS.divider - 0.05, CELLS.divider + 0.05);
  box(-X, CELLS.front + 0.05, CELLS.end - 0.05, CELLS.end + 0.05);
  // An open door's leaf, swung flat into the office from its jamb at z0.
  for (const d of CELLS.doors.filter((door) => door.open)) {
    box(CELLS.front + 0.05, CELLS.front + 0.05 + (d.z1 - d.z0), d.z0 - 0.06, d.z0);
  }
  for (const [z0, z1] of CELLS.bunks) box(-X, -X + 0.7, z0, z1);

  box(DESK.x - 0.8, DESK.x + 0.8, DESK.z - 0.4, DESK.z + 0.4);
  box(STOVE.x - STOVE.r - 0.1, STOVE.x + STOVE.r + 0.1, STOVE.z - STOVE.r - 0.1, STOVE.z + STOVE.r + 0.1);
  for (const r of [SAFE, BENCH, PIGEONHOLES]) box(...r);

  const group = batched("sheriffInterior", interiorModel, interiorMaterials(maps));
  g.add(group);

  const put = (kind, x, z, yaw = 0, extra = {}) => addLocalPropSpot("interiors", g, kind, x, FLOOR, z, yaw, extra);
  put("desk", DESK.x, DESK.z, 0);
  put("chair", DESK.x, DESK.z - 0.75, 0);
  put("chair", DESK.x - 0.35, DESK.z + 0.95, Math.PI + 0.25);
  put("gun_rack", X - 0.14, 0.9, -Math.PI / 2);
  put("stool", -3.2, 2.6, 0.3);
  return group;
}
