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
 *   sx       scale along the model's long axis (a 2.5 m fence bay from the 3 m model).
 *   collide  true when props.js should register the prop's collider; builders
 *            that already own a collider leave it false.
 *   stacked  rests on another prop, not the ground (hay bales in a stack).
 *   seat     "free": y is authored off the ground (track on a ramp, a car on
 *            its rails, freight on a platform), checked only for sanity.
 *   trackside  meant to stand on or against a railroad (docks, cars, track).
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
