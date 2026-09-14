import * as THREE from "three/webgpu";
import { heightAt } from "./heightfield.js";

/**
 * Where a structure builder wants an authored prop model drawn.
 *
 * Builders (landmarks.js, buildings.js) know where their furniture stands;
 * props.js owns the models, instancing and prop colliders. This registry is
 * the hand-off, with no dependency either way: a builder records a spot and
 * keeps registering any collider it already owned, and planWesternProps()
 * turns every spot into a placement.
 *
 * spot: { kind, x, z, yaw, y?, pitch?, sx?, collide?, stacked? }
 *   yaw      three's rotation.y (model long axis +X, front +Z).
 *   y        explicit base height; omitted = lowest terrain under the prop.
 *   cluster  placement cluster; default the owner ("landmarks" spots are "town").
 *   s        uniform scale (a smaller tipi, a shorter headstone).
 *   sx       scale along the model's long axis (a 2.5 m fence bay from the 3 m model).
 *   collide  true when props.js should register the prop's collider; builders
 *            that already own a collider leave it false.
 *   stacked  rests on another prop, not the ground (hay bales in a stack).
 *   seat     "free": y is authored off the ground (track on a ramp, a car on
 *            its rails, freight on a platform), checked only for sanity.
 *   trackside  meant to stand on or against a railroad (docks, cars, track).
 *   spans    built across a road or trail on purpose (the ranch gate).
 *   inside   meant to stand inside a structure's footprint (a car in the mill).
 */
export const PROP_SPOTS = [];

/**
 * Cables a builder strings between two model attachment points (a hoist rope
 * from drum to sheave), drawn by props.js like the telegraph wires:
 * { ax, ay, az, bx, by, bz, sag, r, kind }.
 */
export const PROP_CABLES = [];

/**
 * Bare-ground discs a builder wants kept free of ground cover (the fort's
 * packed-earth parade ground): { x, z, r }. Applied by props.js with the
 * prop clearings (groundClear.js).
 */
export const PROP_CLEARINGS = [];

/**
 * Live (non-instanced) models a builder hangs on one of its own groups, which
 * the frame loop may move: { owner, kind, group }. The model's origin lands
 * on the group's origin (the windmill wheel's hub on its spinning group).
 */
export const PROP_MOUNTS = [];

export function addMountSpot(owner, kind, group) {
  PROP_MOUNTS.push({ owner, kind, group });
}

export function clearPropSpots(owner) {
  for (let i = PROP_SPOTS.length - 1; i >= 0; i -= 1) {
    if (PROP_SPOTS[i].owner === owner) {
      PROP_SPOTS.splice(i, 1);
    }
  }
  for (let i = PROP_CABLES.length - 1; i >= 0; i -= 1) {
    if (PROP_CABLES[i].owner === owner) {
      PROP_CABLES.splice(i, 1);
    }
  }
  for (let i = PROP_MOUNTS.length - 1; i >= 0; i -= 1) {
    if (PROP_MOUNTS[i].owner === owner) {
      PROP_MOUNTS.splice(i, 1);
    }
  }
  for (let i = PROP_CLEARINGS.length - 1; i >= 0; i -= 1) {
    if (PROP_CLEARINGS[i].owner === owner) {
      PROP_CLEARINGS.splice(i, 1);
    }
  }
}

export function addClearingSpot(owner, x, z, r) {
  PROP_CLEARINGS.push({ owner, x, z, r });
}

export function addCableSpot(owner, cable) {
  PROP_CABLES.push({ owner, sag: 0, r: 0.014, kind: "cable", ...cable });
}

export function addPropSpot(owner, spot) {
  const s = { owner, yaw: 0, pitch: 0, sx: 1, collide: false, ...spot };
  PROP_SPOTS.push(s);
  return s;
}

const _local = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();

/**
 * A spot given in a parent's local frame (furniture in a rotated lot): local
 * (lx, ly, lz) and yaw about the parent's up axis, converted to world. The
 * parent's world matrix must be current up its chain; this refreshes it.
 * Interior pieces stand on the floor, not the terrain: seat "free", inside.
 */
export function addLocalPropSpot(owner, parent, kind, lx, ly, lz, yaw = 0, extra = {}) {
  parent.updateWorldMatrix(true, false);
  parent.localToWorld(_local.set(lx, ly, lz));
  parent.getWorldQuaternion(_quat);
  _euler.setFromQuaternion(_quat, "YXZ");
  return addPropSpot(owner, { kind, x: _local.x, y: _local.y, z: _local.z, yaw: _euler.y + yaw, seat: "free", inside: true, ...extra });
}

/**
 * A post-and-rail run from (x0, z0) to (x1, z1) in `count` bays of the fence
 * model, each bay pitched with the ground between its posts. The model's
 * post stands at the start of its bay, so a closed loop needs no end posts;
 * pass endPost for an open run.
 */
export function addFenceSpots(owner, x0, z0, x1, z1, count, { endPost = false, collide = false } = {}) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  const bay = Math.hypot(dx, dz) / count;
  const yaw = Math.atan2(-dz, dx);
  for (let i = 0; i < count; i += 1) {
    const ax = x0 + (dx * i) / count;
    const az = z0 + (dz * i) / count;
    const bx = x0 + (dx * (i + 1)) / count;
    const bz = z0 + (dz * (i + 1)) / count;
    const ha = heightAt(ax, az);
    const hb = heightAt(bx, bz);
    addPropSpot(owner, {
      kind: "fence_rail",
      x: (ax + bx) / 2,
      z: (az + bz) / 2,
      y: (ha + hb) / 2 - 0.04,
      yaw,
      pitch: Math.atan2(hb - ha, bay),
      sx: bay / 3,
      collide
    });
  }
  if (endPost) {
    addPropSpot(owner, { kind: "fence_post", x: x1, z: z1, y: heightAt(x1, z1) - 0.04, yaw, collide });
  }
}
