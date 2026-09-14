import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { heightAt, normalAt } from "./heightfield.js";
import {
  POS,
  ROADS,
  WATER,
  biomeAt,
  creekFactor,
  distToPolyline,
  lakeFactor,
  mapToWorld,
  nearestRoadDistance,
  TRIBAL_CAMP,
  samplePolyline
} from "./map.js";
import {
  addCylinderCollider,
  addOrientedBoxCollider,
  deckHeightAt,
  hasColliderNear
} from "./collision.js";
import { insideStructure, lowestSeat } from "./buildings/kit.js";
import { APPROACHES, APPROACH_CLEAR } from "./nav/arrivals.js";
import { PROP_CABLES, PROP_CLEARINGS, PROP_SPOTS } from "./propSpots.js";
import { addGroundClearing, clearGroundClearings } from "./groundClear.js";

/**
 * Western filler props: authored Blender models (scripts/blender-props),
 * placed by rule and drawn instanced.
 *
 * Two halves, deliberately split:
 *
 *   planWesternProps()  pure world math, run during the synchronous world
 *     build right after the last structure builder. It decides every
 *     placement and registers the colliders, so the nav graph, livestock and
 *     the headless checks see the props whether or not a GLB ever loads.
 *   installWesternProps(scene)  async. Loads the kit GLBs in
 *     public/models/props/ and draws the plan as one InstancedMesh per prop
 *     per map cell. A failed load leaves the colliders and warns; nothing
 *     else depends on it.
 *
 * Placements come from three sources: spots the structure builders record
 * (propSpots.js: Silver Creek's rails, the ranch yard's fence, hay, wagon),
 * hand-dressed yards here, and rule-driven roadside filler.
 *
 * Model frame (glTF): +Y up, base on y = 0, long axis along +X, front +Z.
 * rotation.y = yaw; the matching oriented collider takes -yaw (collision.js
 * resolves boxes in the inverse frame, see landmarks.js boardwalk).
 */

/** Kit GLBs, one shared material each (scripts/blender-props, pr_build kits). */
export const PROP_KITS = {
  western: "/models/props/western.glb",
  ranch: "/models/props/ranch.glb",
  trail: "/models/props/trail.glb",
  mine: "/models/props/mine.glb",
  fort: "/models/props/fort.glb",
  camp: "/models/props/camp.glb"
};

/**
 * Plan-view footprint per model (half extents in its own X/Z), collision and
 * the kit it ships in. `posts` lists the post offsets along X for a rail.
 */
export const PROP_KINDS = {
  barrel: { kit: "western", hx: 0.3, hz: 0.3, collide: "cyl", r: 0.32, shadow: true },
  crate: { kit: "western", hx: 0.45, hz: 0.31, collide: "box", shadow: true },
  trough: { kit: "western", hx: 1.25, hz: 0.44, collide: "box", shadow: true },
  hitch_rail: { kit: "western", hx: 2.45, hz: 0.1, collide: "posts", posts: [-2.2, 2.2], shadow: true },
  wheel_lean: { kit: "western", hx: 0.62, hz: 0.2, collide: null, shadow: true },
  wagon_broken: { kit: "western", hx: 1.75, hz: 0.8, collide: "box", shadow: true },
  fence_rail: { kit: "western", hx: 1.55, hz: 0.1, collide: "box", shadow: true },
  fence_post: { kit: "western", hx: 0.09, hz: 0.09, collide: "cyl", r: 0.12, shadow: true },
  skull_longhorn: { kit: "western", hx: 0.74, hz: 0.33, collide: null, shadow: false },
  hay_bale: { kit: "ranch", hx: 0.45, hz: 0.24, collide: "box", shadow: true },
  woodpile: { kit: "ranch", hx: 1.05, hz: 0.33, collide: "box", shadow: true },
  chopping_block: { kit: "ranch", hx: 0.3, hz: 0.3, collide: "cyl", r: 0.32, shadow: true },
  washtub_bench: { kit: "ranch", hx: 0.64, hz: 0.3, collide: "box", shadow: true },
  butter_churn: { kit: "ranch", hx: 0.17, hz: 0.17, collide: "cyl", r: 0.2, shadow: true },
  plow: { kit: "ranch", hx: 1.1, hz: 0.32, collide: "box", shadow: true },
  outhouse: { kit: "ranch", hx: 0.66, hz: 0.66, collide: "box", shadow: true },
  chicken_coop: { kit: "ranch", hx: 0.98, hz: 0.52, collide: "box", shadow: true },
  wagon_farm: { kit: "ranch", hx: 1.8, hz: 0.9, collide: "box", shadow: true },
  hitch_rail_short: { kit: "ranch", hx: 1.8, hz: 0.1, collide: "posts", posts: [-1.55, 1.55], shadow: true },
  grindstone: { kit: "ranch", hx: 0.6, hz: 0.3, collide: "box", shadow: true },
  telegraph_pole: { kit: "trail", hx: 0.65, hz: 0.22, collide: "cyl", r: 0.2, shadow: true },
  mile_marker: { kit: "trail", hx: 0.09, hz: 0.1, collide: "cyl", r: 0.15, shadow: true },
  signpost: { kit: "trail", hx: 0.09, hz: 0.09, collide: "cyl", r: 0.14, shadow: true },
  // Mounted on a signpost at an explicit height; pivot on the post axis.
  sign_arm: { kit: "trail", hx: 0.5, hz: 0.1, collide: null, shadow: true },
  // bare: radius of ground cover cleared around the prop (groundClear.js).
  cairn: { kit: "trail", hx: 0.5, hz: 0.33, collide: "cyl", r: 0.45, shadow: true, bare: 0.9 },
  grave_trail: { kit: "trail", hx: 1.0, hz: 0.4, collide: "box", shadow: true, bare: 1.35 },
  trunk: { kit: "trail", hx: 0.48, hz: 0.27, collide: "box", shadow: true, bare: 0.8 },
  campfire_ring: { kit: "trail", hx: 0.9, hz: 0.68, collide: null, shadow: false, bare: 1.6 },
  headframe: { kit: "mine", hx: 2.2, hz: 2.2, collide: "box", shadow: true, bare: 5 },
  hoist_house: { kit: "mine", hx: 4.2, hz: 3.2, collide: "box", shadow: true, bare: 5 },
  ore_bin: { kit: "mine", hx: 1.9, hz: 1.6, collide: "box", shadow: true, bare: 2.5 },
  mine_track: { kit: "mine", hx: 2.5, hz: 0.5, collide: null, shadow: false },
  mine_car: { kit: "mine", hx: 0.7, hz: 0.5, collide: null, shadow: true },
  powder_magazine: { kit: "mine", hx: 1.85, hz: 1.55, collide: "box", shadow: true, bare: 2.4 },
  water_tank: { kit: "mine", hx: 1.7, hz: 1.7, collide: "box", shadow: true, bare: 2.2 },
  timber_stack: { kit: "mine", hx: 1.65, hz: 0.85, collide: "box", shadow: true, bare: 1.8 },
  powder_crates: { kit: "mine", hx: 0.65, hz: 0.45, collide: "box", shadow: true, bare: 0.9 },
  smokestack: { kit: "mine", hx: 0.7, hz: 0.7, collide: "cyl", r: 0.75, shadow: true },
  wall_tent: { kit: "mine", hx: 2.1, hz: 1.55, collide: "box", shadow: true, bare: 3 },
  cook_fly: { kit: "mine", hx: 2.6, hz: 2.1, collide: null, shadow: true, bare: 3.2 },
  buffer_stop: { kit: "mine", hx: 1.3, hz: 1.3, collide: "box", shadow: true },
  rail_stack: { kit: "mine", hx: 3.6, hz: 1.7, collide: "box", shadow: true, bare: 3 },
  cannon: { kit: "fort", hx: 1.25, hz: 0.65, collide: "box", shadow: true },
  cannonballs: { kit: "fort", hx: 0.31, hz: 0.31, collide: "box", shadow: true },
  flagpole: { kit: "fort", hx: 0.45, hz: 0.45, collide: "cyl", r: 0.45, shadow: true },
  well: { kit: "fort", hx: 0.9, hz: 1.15, collide: "cyl", r: 1.0, shadow: true, bare: 1.4 },
  saddle_rack: { kit: "fort", hx: 1.3, hz: 0.3, collide: "box", shadow: true },
  army_wagon: { kit: "fort", hx: 1.9, hz: 0.95, collide: "box", shadow: true },
  sentry_box: { kit: "fort", hx: 0.62, hz: 0.55, collide: "box", shadow: true },
  rifle_crates: { kit: "fort", hx: 0.9, hz: 0.6, collide: "box", shadow: true },
  rubble_pile: { kit: "fort", hx: 1.5, hz: 0.7, collide: null, shadow: true, bare: 1.6 },
  horno: { kit: "camp", hx: 0.85, hz: 0.95, collide: "cyl", r: 0.9, shadow: true },
  carreta: { kit: "camp", hx: 2.2, hz: 0.9, collide: "box", shadow: true },
  ollas: { kit: "camp", hx: 0.5, hz: 0.6, collide: "box", shadow: true },
  grave_cross: { kit: "camp", hx: 1.1, hz: 0.5, collide: null, shadow: true, bare: 1.3 },
  log_deck: { kit: "camp", hx: 3.05, hz: 1.4, collide: "box", shadow: true, bare: 3.2 },
  sawbuck: { kit: "camp", hx: 1.2, hz: 0.6, collide: "box", shadow: true, bare: 1.4 },
  stump: { kit: "camp", hx: 0.6, hz: 0.6, collide: "cyl", r: 0.45, shadow: true, bare: 0.9 },
  sheep_wagon: { kit: "camp", hx: 2.7, hz: 1.1, collide: "box", shadow: true, bare: 2.8 },
  wool_sacks: { kit: "camp", hx: 0.6, hz: 0.6, collide: "box", shadow: true },
  lean_to: { kit: "camp", hx: 2.0, hz: 1.4, collide: "box", shadow: true, bare: 2.4 },
  shack: { kit: "camp", hx: 1.85, hz: 1.9, collide: "box", shadow: true, bare: 2.6 },
  picket_line: { kit: "camp", hx: 3.6, hz: 0.12, collide: "posts", posts: [-3.5, 3.5], shadow: true },
  strongbox: { kit: "camp", hx: 0.55, hz: 0.25, collide: null, shadow: true, bare: 0.8 },
  travois: { kit: "camp", hx: 2.5, hz: 0.75, collide: null, shadow: true },
  hide_frame: { kit: "camp", hx: 1.15, hz: 0.2, collide: "posts", posts: [-1.0, 1.0], shadow: true },
  drying_rack: { kit: "camp", hx: 1.5, hz: 0.2, collide: "posts", posts: [-1.3, 1.3], shadow: true },
  fire_pit: { kit: "camp", hx: 0.65, hz: 0.65, collide: null, shadow: false, bare: 1.4 }
};

/**
 * Wires in world space, drawn by installWesternProps: the telegraph line's
 * (kind "telegraph", strung between consecutive poles) and builders' cables
 * (propSpots.js, e.g. the mine's hoist rope).
 * { ax, ay, az, bx, by, bz, sag, r, kind } per wire.
 */
export const TELEGRAPH_WIRES = [];

/** Every placement of the current build: { kind, x, y, z, yaw, pitch, sx, cluster, ... }. */
export const PROP_PLACEMENTS = [];

const CELL = 240;
const DRAW_DISTANCE = 420;

// Silver Creek's street frame, matching street() in landmarks.js and the
// townSpot helper in main.js: storefronts at yaw 0.15, facade line perp 5.5,
// boardwalk deck perp 1.5..5.5, road centreline perp 0.
const TOWN_YAW = 0.15;
const FACADE_PERP = 5.5;

function townSpot(along, perp, originDz = 0) {
  const t = POS.silverCreek;
  return {
    x: t.x + Math.cos(TOWN_YAW) * along - Math.sin(TOWN_YAW) * perp,
    z: t.z + originDz + Math.sin(TOWN_YAW) * along + Math.cos(TOWN_YAW) * perp
  };
}

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function collide(p) {
  const spec = PROP_KINDS[p.kind];
  if (!spec.collide) {
    return;
  }
  if (spec.collide === "cyl") {
    addCylinderCollider(p.x, p.z, spec.r);
  } else if (spec.collide === "posts") {
    // Only the posts stop a walker; the bar is at chest height and a horse
    // is tied to it, so nothing blocks between them.
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    for (const lx of spec.posts) {
      addCylinderCollider(p.x + c * lx, p.z - s * lx, 0.12);
    }
  } else {
    addOrientedBoxCollider(p.x, p.z, spec.hx * (p.sx || 1), spec.hz, -p.yaw);
  }
}

function place(kind, x, y, z, yaw, extra = {}) {
  const p = { kind, x, y, z, yaw, pitch: 0, sx: 1, cluster: "", ...extra };
  PROP_PLACEMENTS.push(p);
  if (PROP_KINDS[kind].bare) {
    addGroundClearing(x, z, PROP_KINDS[kind].bare);
  }
  if (!extra.noCollide) {
    collide(p);
  }
  return p;
}

/** Terrain seat for a free-standing prop: the lowest ground under its reach. */
function groundSeat(kind, x, z) {
  const { hx, hz } = PROP_KINDS[kind];
  return lowestSeat(x, z, Math.hypot(hx, hz));
}

// --------------------------------------------------------------------------
// Silver Creek

/** Spots recorded by the structure builders (see propSpots.js). */
function planSpots() {
  for (const s of PROP_SPOTS) {
    const cluster = s.owner === "landmarks" ? "town" : s.owner;
    place(s.kind, s.x, s.y ?? groundSeat(s.kind, s.x, s.z), s.z, s.yaw, {
      cluster,
      pitch: s.pitch,
      sx: s.sx,
      stacked: Boolean(s.stacked),
      seat: s.seat,
      trackside: Boolean(s.trackside),
      inside: Boolean(s.inside),
      spot: true,
      noCollide: !s.collide
    });
  }
  for (const c of PROP_CABLES) {
    TELEGRAPH_WIRES.push({ ...c });
  }
  for (const c of PROP_CLEARINGS) {
    addGroundClearing(c.x, c.z, c.r);
  }
}

function planSilverCreek() {
  // Street furniture against the storefronts, on the boardwalk deck. Each
  // lot's front faces -perp, so a prop's front (+Z) takes the lot's own yaw
  // (street() in landmarks.js): atan2(sin yaw, -cos yaw).
  const faceStreet = Math.atan2(Math.sin(TOWN_YAW), -Math.cos(TOWN_YAW));
  const alongStreet = -TOWN_YAW;
  const onDeck = (kind, along, inset, yaw, originDz = 0, stackOn = null) => {
    const p = townSpot(along, FACADE_PERP - inset, originDz);
    const ground = heightAt(p.x, p.z);
    const deck = deckHeightAt(p.x, p.z, ground + 1.0);
    if (!Number.isFinite(deck)) {
      return null;
    }
    const y = stackOn ? stackOn.y + 0.615 : deck;
    return place(kind, p.x, y, p.z, yaw, { cluster: "town", deck: true, noCollide: Boolean(stackOn) });
  };
  // Store (along 0): crates stacked by the door, barrels on the other side.
  const c1 = onDeck("crate", 2.3, 0.36, alongStreet);
  onDeck("crate", 2.4, 0.36, alongStreet + 0.35, 0, c1);
  onDeck("crate", 3.35, 0.36, alongStreet + 0.08);
  onDeck("barrel", -2.2, 0.36, 0.4);
  onDeck("barrel", -2.85, 0.36, 1.9);
  // Hotel (along -14): a crate of luggage and a barrel off the doorway.
  onDeck("crate", -10.6, 0.36, alongStreet - 0.1);
  // Saloon (along 28): a knot of beer barrels.
  onDeck("barrel", 24.6, 0.36, 0.2);
  onDeck("barrel", 25.25, 0.36, 2.2);
  onDeck("barrel", 24.95, 0.95, 4.1);
  // Blacksmith (along 42): a spare wheel on the wall, a quench barrel.
  onDeck("wheel_lean", 37.6, 0.28, faceStreet);
  onDeck("barrel", 46.2, 0.36, 1.1);
  // Livery (along 56): feed crates and a barrel.
  onDeck("crate", 52.6, 0.36, alongStreet + 0.05);
  onDeck("crate", 52.7, 0.36, alongStreet - 0.2, 0, PROP_PLACEMENTS[PROP_PLACEMENTS.length - 1]);
  onDeck("barrel", 59.4, 0.36, 3.0);
  // Sheriff (along -56): a barrel by the jail wall.
  onDeck("barrel", -59.3, 0.36, 0.7);
  // North row: its own deck, 22 m up the axis.
  onDeck("crate", -12.2, 0.36, alongStreet, -22);
  onDeck("barrel", 2.6, 0.36, 0.5, -22);
  onDeck("barrel", 25.4, 0.36, 2.6, -22);
  onDeck("wheel_lean", 31.0, 0.28, faceStreet, -22);

  // Water troughs on the far kerb, across from the rails. The rail side has
  // no room: the deck starts at perp 1.5 and riders hold perp -1.5..1.5.
  for (const along of [16.4, 36.4]) {
    const p = townSpot(along, -4.6);
    place("trough", p.x, groundSeat("trough", p.x, p.z), p.z, alongStreet, { cluster: "town" });
  }

  // A wagon left past the east end of the north row. It replaces the box
  // wagon landmarks.js used to plant at (town + 42, town + 16), which stood
  // inside the blacksmith's footprint.
  const w = townSpot(47, -10);
  place("wagon_broken", w.x, groundSeat("wagon_broken", w.x, w.z), w.z, alongStreet + 0.55, { cluster: "town" });
}

// --------------------------------------------------------------------------
// Ranch yards

/**
 * Standing room for a hand-dressed prop: off every footprint and collider
 * (including props placed before it), dry, not on a road, and not on top of
 * an arrival point's own standing room.
 */
function yardClear(kind, x, z, sx = 1, { wall = false } = {}) {
  const { hx, hz } = PROP_KINDS[kind];
  const reach = Math.hypot(hx * sx, hz);
  if (heightAt(x, z) < WATER + 0.8 || lakeFactor(x, z) > 0.05 || creekFactor(x, z) > 0.05) {
    return false;
  }
  // Too steep a seat buries the uphill side (a fire ring on a rim slope).
  if (heightAt(x, z) - lowestSeat(x, z, reach) > 0.45) {
    return false;
  }
  // A wall piece (a wheel leant on the smithy, a barrel at its corner) is
  // meant to touch the building: only its own footprint must be outside.
  if (wall ? insideStructure(x, z, 0.05) : insideStructure(x, z, reach + 0.6) || hasColliderNear(x, z, reach + 0.35)) {
    return false;
  }
  for (const road of ROADS) {
    if (distToPolyline(x, z, road.pts) < road.width / 2 + reach + 1) {
      return false;
    }
  }
  for (const leg of approachLegs()) {
    if (Math.hypot(x - leg.ax, z - leg.az) < leg.clear + reach + 0.5) {
      return false;
    }
    // Keep the way from the arrival to the road open too: the nav graph links
    // each approach to its nearest road, and a corral across that leg cut
    // Barrett Ranch off the map (check:routes).
    if (segmentDistance(x, z, leg.ax, leg.az, leg.rx, leg.rz) < reach + 2.5) {
      return false;
    }
  }
  return true;
}

let legsCache = null;
/** Each arrival point with the nearest point of road it links to. */
function approachLegs() {
  if (legsCache) {
    return legsCache;
  }
  const samples = ROADS.flatMap((road) => samplePolyline(road.pts, 4));
  legsCache = [];
  for (const a of APPROACHES) {
    const poi = POS[a.poi];
    if (!poi) {
      continue;
    }
    const ax = poi.x + a.dx;
    const az = poi.z + a.dz;
    let best = null;
    let bestD = Infinity;
    for (const smp of samples) {
      const d = Math.hypot(smp.x - ax, smp.z - az);
      if (d < bestD) {
        bestD = d;
        best = smp;
      }
    }
    legsCache.push({ ax, az, rx: best.x, rz: best.z, clear: APPROACH_CLEAR[a.type] || 2 });
  }
  return legsCache;
}

function segmentDistance(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2)) : 0;
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/**
 * High Country Ranch working yard, in ranch-local metres (see buildings.js:
 * the stage road runs in along z = 0, half width 4.5;
 * house x -10.5..16, z -24.5..-1; barn x -36..-20, z 12..24; bunkhouse
 * x 20..32, z 6.75..13.25; blacksmith x 14..22, z 20.5..27.5; corral
 * x 12..42, z 28..48). yaw 0 faces a model's front toward +Z.
 */
const RANCH_YARD = [
  // Out back of the house, between the stage road and the ranchTown road
  // that both run in to the house front: the privy and the henhouse.
  { kind: "outhouse", dx: -6, dz: -30, yaw: 0 },
  { kind: "chicken_coop", dx: -3, dz: -21.5, yaw: 0.15 },
  // Chores by the woodpile, west of the house on the stage road's north side.
  { kind: "chopping_block", dx: -19.6, dz: -9.2, yaw: 0.8 },
  // Wash day in the open ground east of the ranchTown road.
  { kind: "washtub_bench", dx: 31, dz: -12.5, yaw: 0.35 },
  { kind: "butter_churn", dx: 32.6, dz: -11, yaw: 0 },
  // The blacksmith's east wall: grindstone, a spare wheel, a water barrel.
  { kind: "grindstone", dx: 23.6, dz: 23.4, yaw: Math.PI / 2 },
  { kind: "wheel_lean", dx: 22.35, dz: 26.2, yaw: Math.PI / 2, wall: true },
  { kind: "barrel", dx: 22.45, dz: 21.0, yaw: 0.5, wall: true },
  // A plow parked off the barn's corner, bales spilled from the loft.
  { kind: "plow", dx: -16.8, dz: 29.5, yaw: 0.35 },
  { kind: "hay_bale", dx: -18.6, dz: 25.6, yaw: 1.62 },
  { kind: "hay_bale", dx: -17.9, dz: 26.9, yaw: 1.2 },
  // Stores at the bunkhouse's east end.
  { kind: "barrel", dx: 33.1, dz: 7.6, yaw: 1.1 },
  { kind: "barrel", dx: 33.3, dz: 8.8, yaw: 2.9 },
  { kind: "crate", dx: 33.2, dz: 10.4, yaw: Math.PI / 2 + 0.05 }
];

function planRanchYard() {
  const r = POS.ranch;
  for (const item of RANCH_YARD) {
    const x = r.x + item.dx;
    const z = r.z + item.dz;
    if (yardClear(item.kind, x, z, 1, { wall: item.wall })) {
      place(item.kind, x, groundSeat(item.kind, x, z), z, item.yaw, { cluster: "ranch" });
    }
  }
}

/**
 * A lived-in homestead yard dressed around a POI: corral, trough and rail,
 * hay, a wagon, the privy and the woodpile. The layout (house-local metres)
 * is tried at eight bearings and the one that fits the most pieces wins; a
 * corral is all or nothing, other pieces drop out individually.
 */
const HOMESTEAD = [
  // Candidate corral sites, first that fits wins: off the house's side, out
  // back, or beyond the outbuilding.
  {
    corral: [
      [[-24, -5], [-12, -5], [-12, 5], [-24, 5]],
      [[-6, -30], [6, -30], [6, -21], [-6, -21]],
      [[20, -14], [32, -14], [32, -5], [20, -5]],
      [[-30, -20], [-18, -20], [-18, -11], [-30, -11]]
    ],
    bays: [4, 3, 4, 3]
  },
  { kind: "trough", dx: -9.5, dz: 8, yaw: 0 },
  { kind: "hitch_rail_short", dx: -3, dz: 9.5, yaw: 0 },
  { kind: "wagon_farm", dx: 3, dz: -11, yaw: 0.2 },
  { kind: "hay_bale", dx: -15, dz: -9, yaw: 0.1 },
  { kind: "hay_bale", dx: -15.1, dz: -8.45, yaw: 0.05 },
  { kind: "hay_bale", dx: -13.9, dz: -8.8, yaw: -0.2 },
  { kind: "outhouse", dx: 7, dz: -12, yaw: Math.PI },
  { kind: "woodpile", dx: -8, dz: -9, yaw: 0 },
  { kind: "chopping_block", dx: -6.2, dz: -7.2, yaw: 0 },
  { kind: "barrel", dx: -8.2, dz: 7.2, yaw: 0.4 }
];

/**
 * Place a layout of items (and at most one corral) around `poi`. By default
 * the layout is tried at eight bearings, plain and mirrored, and the one that
 * fits the most pieces wins; `rotate: false` keeps it as authored (a camp
 * dressed around fixed buildings). An item may list `alts` ([dx, dz] pairs)
 * tried in order when its own spot is blocked, and `wall: true` to stand
 * against a building.
 */
function planHomestead(poi, cluster, seed, layout = HOMESTEAD, { rotate = true } = {}) {
  const rand = rng(seed);
  let mirror = 1;
  const at = (a, dx, dz) => {
    const mx = dx * mirror;
    return { x: poi.x + Math.cos(a) * mx + Math.sin(a) * dz, z: poi.z - Math.sin(a) * mx + Math.cos(a) * dz };
  };
  const trial = (a) => {
    const picked = [];
    for (const item of layout) {
      if (item.corral) {
        for (const rect of item.corral) {
          const posts = rect.map(([dx, dz]) => at(a, dx, dz));
          let ok = true;
          const bays = [];
          posts.forEach((p0, i) => {
            const p1 = posts[(i + 1) % posts.length];
            const n = item.bays[i];
            for (let k = 0; k < n; k += 1) {
              const x = p0.x + ((p1.x - p0.x) * (k + 0.5)) / n;
              const z = p0.z + ((p1.z - p0.z) * (k + 0.5)) / n;
              const len = Math.hypot(p1.x - p0.x, p1.z - p0.z) / n;
              ok = ok && yardClear("fence_rail", x, z, len / 3) && Math.abs(heightAt(p0.x, p0.z) - heightAt(p1.x, p1.z)) < 1.2 * n;
              bays.push({ p0, p1, k, n });
            }
          });
          if (ok) {
            picked.push({ corral: bays });
            break;
          }
        }
        continue;
      }
      for (const [dx, dz] of [[item.dx, item.dz], ...(item.alts || [])]) {
        const p = at(a, dx, dz);
        if (yardClear(item.kind, p.x, p.z, 1, { wall: item.wall })) {
          picked.push({ kind: item.kind, x: p.x, z: p.z, yaw: item.yaw + a, wall: item.wall });
          break;
        }
      }
    }
    return picked;
  };
  // Eight bearings, each plain and mirrored; a corral counts for four pieces.
  const start = Math.floor(rand() * 8);
  const score = (list) => list.reduce((n, item) => n + (item.corral ? 4 : 1), 0);
  let best = [];
  for (const m of rotate ? [1, -1] : [1]) {
    mirror = m;
    for (let i = 0; i < (rotate ? 8 : 1); i += 1) {
      const got = trial(rotate ? ((start + i) % 8) * (Math.PI / 4) : 0);
      if (score(got) > score(best)) {
        best = got;
      }
    }
  }
  for (const item of best) {
    if (item.corral) {
      for (const { p0, p1, k, n } of item.corral) {
        const ax = p0.x + ((p1.x - p0.x) * k) / n;
        const az = p0.z + ((p1.z - p0.z) * k) / n;
        const bx = p0.x + ((p1.x - p0.x) * (k + 1)) / n;
        const bz = p0.z + ((p1.z - p0.z) * (k + 1)) / n;
        const ha = heightAt(ax, az);
        const hb = heightAt(bx, bz);
        const len = Math.hypot(bx - ax, bz - az);
        place("fence_rail", (ax + bx) / 2, (ha + hb) / 2 - 0.04, (az + bz) / 2, Math.atan2(-(bz - az), bx - ax), {
          cluster,
          pitch: Math.atan2(hb - ha, len),
          sx: len / 3
        });
      }
      continue;
    }
    // Re-test: an earlier piece in this layout may now stand in the way.
    if (yardClear(item.kind, item.x, item.z, 1, { wall: item.wall })) {
      place(item.kind, item.x, groundSeat(item.kind, item.x, item.z), item.z, item.yaw, { cluster });
    }
  }
}

// --------------------------------------------------------------------------
// Camps: timber, sheep, outlaw, lodge; El Paso Verde

/** The timber camp around its three fixed cabins, where three roads meet. */
const TIMBER_CAMP = [
  { kind: "log_deck", dx: 24, dz: 20, yaw: 0.3, alts: [[-26, 16], [26, -22], [-28, -20]] },
  { kind: "log_deck", dx: 30, dz: 12, yaw: 0.25, alts: [[-30, 24], [32, -14]] },
  { kind: "sawbuck", dx: -5, dz: 3, yaw: 0.2, alts: [[5, 9], [-6, 12]] },
  { kind: "woodpile", dx: -12, dz: 12.2, yaw: 0, wall: true, alts: [[-6.3, 8]] },
  { kind: "woodpile", dx: 14, dz: -2, yaw: 0, wall: true, alts: [[20.3, -6]] },
  { kind: "woodpile", dx: 6.3, dz: 16, yaw: Math.PI / 2, wall: true },
  { kind: "chopping_block", dx: -8.5, dz: 13.5, yaw: 0.5, alts: [[-4, 9]] },
  { kind: "wall_tent", dx: -20, dz: 26, yaw: 0.1, alts: [[-22, -26], [18, 28]] },
  { kind: "wall_tent", dx: -12, dz: 28, yaw: -0.1, alts: [[-14, -28], [26, 30]] },
  { kind: "cook_fly", dx: 10, dz: 28, yaw: 0, alts: [[-30, 4], [30, 2]] },
  { kind: "stump", dx: -18, dz: -14, yaw: 0 }, { kind: "stump", dx: 20, dz: -18, yaw: 1 },
  { kind: "stump", dx: -24, dz: -4, yaw: 2 }, { kind: "stump", dx: 26, dz: 8, yaw: 3 },
  { kind: "stump", dx: -10, dz: -24, yaw: 4 }, { kind: "stump", dx: 12, dz: -28, yaw: 5 },
  { kind: "stump", dx: -32, dz: 10, yaw: 0.5 }, { kind: "stump", dx: 34, dz: -6, yaw: 1.5 },
  { kind: "stump", dx: -28, dz: -26, yaw: 2.5 }, { kind: "stump", dx: 30, dz: 26, yaw: 3.5 }
];

/** The sheepherder's camp: wagon, fire, wool, and a pen for the band. */
const SHEEP_CAMP = [
  { corral: [[[-30, -18], [-16, -18], [-16, -6], [-30, -6]], [[-18, -34], [-4, -34], [-4, -22], [-18, -22]]], bays: [5, 4, 5, 4] },
  { kind: "sheep_wagon", dx: -4, dz: -6, yaw: 0.5 },
  { kind: "fire_pit", dx: 2, dz: -12, yaw: 0 },
  { kind: "wool_sacks", dx: -9.5, dz: -1.5, yaw: 0.4 },
  { kind: "barrel", dx: 0.5, dz: -2.5, yaw: 1.2 },
  { kind: "woodpile", dx: 6, dz: -16, yaw: 0.2 },
  { kind: "chopping_block", dx: 4.2, dz: -18.5, yaw: 0 }
];

/** Viper's Roost: a board shack on the rim shelf, horses picketed, the take. */
const VIPERS_CAMP = [
  { kind: "shack", dx: 18, dz: 2, yaw: -Math.PI / 2 },
  { kind: "picket_line", dx: 9, dz: 15, yaw: 0.2 },
  { kind: "fire_pit", dx: 12, dz: -8, yaw: 0 },
  { kind: "strongbox", dx: 14.5, dz: -5.2, yaw: 0.6 },
  { kind: "crate", dx: 22, dz: -4, yaw: 0.3 },
  { kind: "barrel", dx: 22.8, dz: -2.6, yaw: 1.1 },
  { kind: "saddle_rack", dx: 6, dz: -13, yaw: 0.9 },
  { kind: "cairn", dx: 28, dz: -16, yaw: 0 }
];

/** Hidden Canyon: two brush lean-tos out of the wind, a picket line, loot. */
const HIDEOUT_CAMP = [
  { kind: "lean_to", dx: 16, dz: 4, yaw: 0.2 },
  { kind: "lean_to", dx: 17, dz: -6, yaw: -0.3 },
  { kind: "picket_line", dx: 4, dz: 17, yaw: -0.1 },
  { kind: "fire_pit", dx: 10, dz: -0.5, yaw: 0 },
  { kind: "strongbox", dx: 11.2, dz: -3.8, yaw: 2.2 },
  { kind: "rifle_crates", dx: 21, dz: 11, yaw: 0.4 },
  { kind: "barrel", dx: 7, dz: -7, yaw: 0.5 }
];

/**
 * Everyday working gear at the lodge camp (map.js TRIBAL_CAMP): the hearth
 * at the centre of the ring, meat-drying racks, a hide on its frame, and a
 * travois laid down by a lodge.
 */
const TRIBAL_GEAR = [
  { kind: "fire_pit", dx: 0, dz: 0, yaw: 0 },
  { kind: "drying_rack", dx: -4, dz: 16, yaw: 0.35, alts: [[-2, 18], [-8, 17]] },
  { kind: "drying_rack", dx: 12, dz: -14, yaw: -0.6, alts: [[14, -16], [8, -17]] },
  { kind: "hide_frame", dx: 6, dz: 16.5, yaw: -0.2, alts: [[18, -2], [-19, 6]] },
  { kind: "travois", dx: -21, dz: 3, yaw: 1.2, alts: [[22, 12], [-10, -18]] }
];

/** El Paso Verde's plaza: a carreta, a horno, ollas at the casa door. */
const EL_PASO = [
  { kind: "ollas", dx: 1.4, dz: 5.1, yaw: 0.2, wall: true, alts: [[-1.4, 5.1]] },
  { kind: "horno", dx: -6, dz: 18, yaw: Math.PI, alts: [[6, 17], [-20, 4]] },
  { kind: "carreta", dx: 17, dz: -12, yaw: 0.9, alts: [[-20, -10], [20, 12]] },
  { kind: "barrel", dx: 3.2, dz: -6.2, yaw: 0.4, wall: true, alts: [[-0.2, -6.2]] },
  { kind: "woodpile", dx: -17, dz: 7, yaw: Math.PI / 2, alts: [[16, 9]] }
];

function planCamps() {
  planHomestead(POS.timberCamp, "timberCamp", 1878, TIMBER_CAMP, { rotate: false });
  planHomestead(POS.sheepCamp, "sheepCamp", 1882, SHEEP_CAMP);
  planHomestead(POS.vipers, "vipers", 1877, VIPERS_CAMP);
  planHomestead(POS.hideout, "hideout", 1879, HIDEOUT_CAMP);
  planHomestead({ x: POS.tribal.x + TRIBAL_CAMP.dx, z: POS.tribal.z + TRIBAL_CAMP.dz }, "tribal", 1874, TRIBAL_GEAR, { rotate: false });
  planHomestead(POS.elPaso, "elPaso", 1880, EL_PASO, { rotate: false });
}

// --------------------------------------------------------------------------
// Roadside filler

const ROADSIDE_SKIP = new Set(["townMain", "townCross"]);
const FENCE_BIOMES = new Set(["valley", "ranch", "foothills", "range"]);

function nearPlace(x, z, pad) {
  for (const place of Object.values(POS)) {
    if (Math.hypot(x - place.x, z - place.z) < place.radius + pad) {
      return true;
    }
  }
  return false;
}

function nearApproach(x, z, pad) {
  for (const a of APPROACHES) {
    const poi = POS[a.poi];
    if (!poi) {
      continue;
    }
    const r = a.r + (APPROACH_CLEAR[a.type] || 2) + pad;
    if (Math.hypot(x - (poi.x + a.dx), z - (poi.z + a.dz)) < r) {
      return true;
    }
  }
  return false;
}

/** Can a prop of `reach` metres stand on open, dry, gentle ground here? */
function openGround(x, z, reach, maxSlope = 0.2) {
  if (heightAt(x, z) < WATER + 1.2 || lakeFactor(x, z) > 0.05 || creekFactor(x, z) > 0.05) {
    return false;
  }
  if (nearestRoadDistance(x, z) < 6 + reach) {
    return false;
  }
  if (normalAt(x, z).y < Math.cos(maxSlope)) {
    return false;
  }
  if (insideStructure(x, z, reach + 2) || hasColliderNear(x, z, reach + 1.5)) {
    return false;
  }
  return !nearApproach(x, z, reach);
}

function planRoadside() {
  const rand = rng(18_76);
  for (const road of ROADS) {
    if (ROADSIDE_SKIP.has(road.name)) {
      continue;
    }
    // Wagon roads carried the traffic that leaves things behind; trails and
    // the rail line get a thinner share.
    const density = road.kind === "trail" || road.kind === "rail" ? 0.55 : 1;
    const pts = road.pts.map(([u, v]) => mapToWorld(u, v));
    let carry = 0;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const dx = (b.x - a.x) / len;
      const dz = (b.z - a.z) / len;
      // Left-hand normal in plan; `side` picks which verge.
      const nx = -dz;
      const nz = dx;
      const heading = Math.atan2(-dz, dx);
      for (let s = carry; s < len; s += 34) {
        carry = s + 34 - len;
        const cx = a.x + dx * s;
        const cz = a.z + dz * s;
        if (nearPlace(cx, cz, 25)) {
          continue;
        }
        const roll = rand() / density;
        const side = rand() < 0.5 ? -1 : 1;
        const biome = biomeAt(cx, cz);
        if (roll < 0.025) {
          const off = side * (13 + rand() * 9);
          const x = cx + nx * off;
          const z = cz + nz * off;
          if (openGround(x, z, 2.6, 0.14)) {
            place("wagon_broken", x, groundSeat("wagon_broken", x, z), z, heading + (rand() - 0.5) * 1.2, { cluster: road.name });
          }
        } else if (roll < 0.125) {
          const off = side * (5.5 + rand() * 9);
          const x = cx + nx * off;
          const z = cz + nz * off;
          if (openGround(x, z, 0.8, 0.3)) {
            place("skull_longhorn", x, groundSeat("skull_longhorn", x, z) - 0.02, z, rand() * Math.PI * 2, { cluster: road.name });
          }
        } else if (roll < 0.205 && FENCE_BIOMES.has(biome) && road.kind !== "rail") {
          planFenceRun(rand, cx, cz, dx, dz, nx, nz, side, road.name);
        } else if (roll < 0.265) {
          const off = side * (8 + rand() * 6);
          const x = cx + nx * off;
          const z = cz + nz * off;
          if (openGround(x, z, 1.8, 0.16)) {
            const yaw = heading + rand() * 6.28;
            const c = Math.cos(yaw);
            const sn = Math.sin(yaw);
            place("crate", x, groundSeat("crate", x, z), z, yaw, { cluster: road.name });
            const bx = x + c * 1.0 + sn * 0.4;
            const bz = z - sn * 1.0 + c * 0.4;
            place("barrel", bx, groundSeat("barrel", bx, bz), bz, rand() * 6.28, { cluster: road.name });
            if (rand() < 0.5) {
              const kx = x - c * 0.3 - sn * 1.1;
              const kz = z + sn * 0.3 - c * 1.1;
              place("barrel", kx, groundSeat("barrel", kx, kz), kz, rand() * 6.28, { cluster: road.name, tipped: true });
            }
          }
        }
      }
    }
  }
}

/** A post-and-rail run parallel to the road, 3-7 bays, abandoned or in use. */
function planFenceRun(rand, cx, cz, dx, dz, nx, nz, side, cluster) {
  const bays = 3 + Math.floor(rand() * 5);
  const off = side * (11 + rand() * 5);
  const sx = cx + nx * off;
  const sz = cz + nz * off;
  const posts = [];
  for (let k = 0; k <= bays; k += 1) {
    const x = sx + dx * 3 * k;
    const z = sz + dz * 3 * k;
    if (!openGround(x, z, 0.4, 0.2)) {
      return;
    }
    posts.push({ x, z, y: heightAt(x, z) });
  }
  const yaw = Math.atan2(-dz, dx);
  for (let k = 0; k < bays; k += 1) {
    const p0 = posts[k];
    const p1 = posts[k + 1];
    const rise = p1.y - p0.y;
    if (Math.abs(rise) > 0.6) {
      return;
    }
  }
  for (let k = 0; k < bays; k += 1) {
    const p0 = posts[k];
    const p1 = posts[k + 1];
    const x = (p0.x + p1.x) / 2;
    const z = (p0.z + p1.z) / 2;
    // Rails pitch with the ground between their posts; the posts carry
    // 0.25 m below grade to cover what the pitch leaves.
    place("fence_rail", x, Math.min(p0.y, p1.y) + Math.abs(p1.y - p0.y) / 2 - 0.04, z, yaw, {
      cluster,
      pitch: Math.atan2(p1.y - p0.y, 3)
    });
  }
  const last = posts[bays];
  place("fence_post", last.x, last.y - 0.04, last.z, yaw, { cluster });
}

// --------------------------------------------------------------------------
// Trail and roadside furniture

const TRAIL_BIOMES_CAIRN = new Set(["range", "badlands", "foothills", "tribal", "iron", "pines", "burn"]);
const CAMP_BIOMES = new Set(["pines", "valley", "range", "foothills"]);
// The stage and wagon roads that carry mileposts.
const MILE_ROADS = new Set(["stage", "ranchTown", "ranchSouth", "silverNorth"]);
const MILE_SPACING = 800;
const POLE_SPACING = 55;
const POLE_OFFSET = 11;
const WIRE_Y = 6.69;
const WIRE_X = 0.5;
const WIRE_Z = 0.13;

/**
 * Standing room beside a road: dry, not too steep, off every carriageway
 * (including its own) and footprint, clear of colliders, arrivals and the
 * arrival-to-road legs the nav graph walks.
 */
function vergeClear(x, z, reach, maxSlope = 0.35) {
  if (heightAt(x, z) < WATER + 1 || lakeFactor(x, z) > 0.05 || creekFactor(x, z) > 0.05) {
    return false;
  }
  if (normalAt(x, z).y < Math.cos(maxSlope)) {
    return false;
  }
  if (insideStructure(x, z, reach + 1) || hasColliderNear(x, z, reach + 0.4)) {
    return false;
  }
  for (const road of ROADS) {
    if (distToPolyline(x, z, road.pts) < road.width / 2 + reach + 0.8) {
      return false;
    }
  }
  if (nearApproach(x, z, reach)) {
    return false;
  }
  for (const leg of approachLegs()) {
    if (segmentDistance(x, z, leg.ax, leg.az, leg.rx, leg.rz) < reach + 2) {
      return false;
    }
  }
  return true;
}

/** A road as world points with cumulative arc length and a point-at-distance lookup. */
function roadPath(pts) {
  const world = pts.map(([u, v]) => mapToWorld(u, v));
  const acc = [0];
  for (let i = 1; i < world.length; i += 1) {
    acc.push(acc[i - 1] + Math.hypot(world[i].x - world[i - 1].x, world[i].z - world[i - 1].z));
  }
  const length = acc[acc.length - 1];
  const at = (d) => {
    const s = Math.max(0, Math.min(length, d));
    let i = 1;
    while (i < acc.length - 1 && acc[i] < s) {
      i += 1;
    }
    const a = world[i - 1];
    const b = world[i];
    const seg = acc[i] - acc[i - 1] || 1;
    const t = (s - acc[i - 1]) / seg;
    const dx = (b.x - a.x) / seg;
    const dz = (b.z - a.z) / seg;
    // nx, nz: the left-hand normal in plan.
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx, dz, nx: -dz, nz: dx };
  };
  return { world, length, at };
}

/** Yaw that turns a model's front (+Z) toward world direction (fx, fz). */
const faceYaw = (fx, fz) => Math.atan2(fx, fz);
/** Yaw that lays a model's long axis (+X) along world direction (dx, dz). */
const alongYaw = (dx, dz) => Math.atan2(-dz, dx);

function planTelegraph() {
  // One line from Fort Grant along the stage road, through the ranch, and on
  // to Silver Creek, on the road's left side. It starts outside the fort and
  // stops at the town's edge; poles that would stand on something are
  // skipped and the wire spans the gap if it is short and clear.
  const route = [ROADS.find((r) => r.name === "stage"), ROADS.find((r) => r.name === "ranchTown")];
  const poles = [];
  let base = 0;
  for (const road of route) {
    const path = roadPath(road.pts);
    for (let d = POLE_SPACING / 2; d < path.length; d += POLE_SPACING) {
      const c = path.at(d);
      const x = c.x + c.nx * POLE_OFFSET;
      const z = c.z + c.nz * POLE_OFFSET;
      const fort = POS.fortGrant;
      const town = POS.silverCreek;
      // The fort stands 64 m off the road now; keep the line out of its
      // yard and cemetery only, not its whole place radius.
      if (Math.hypot(x - fort.x, z - fort.z) < 45 || Math.hypot(x - town.x, z - town.z) < town.radius) {
        continue;
      }
      if (!vergeClear(x, z, 0.7, 0.4)) {
        continue;
      }
      const yaw = alongYaw(c.dx, c.dz) + Math.PI / 2;
      poles.push({ x, z, s: base + d, yaw, p: place("telegraph_pole", x, groundSeat("telegraph_pole", x, z), z, yaw, { cluster: "telegraph" }) });
    }
    base += path.length;
  }
  for (let i = 1; i < poles.length; i += 1) {
    const a = poles[i - 1];
    const b = poles[i];
    const span = Math.hypot(b.x - a.x, b.z - a.z);
    if (b.s - a.s > POLE_SPACING * 2.4 || span > POLE_SPACING * 2.4) {
      continue;
    }
    const ends = (pole) => [-WIRE_X, WIRE_X].map((lx) => {
      const c = Math.cos(pole.yaw);
      const sn = Math.sin(pole.yaw);
      return { x: pole.x + c * lx + sn * WIRE_Z, y: pole.p.y + WIRE_Y, z: pole.z - sn * lx + c * WIRE_Z };
    });
    const ea = ends(a);
    const eb = ends(b);
    // Consecutive crossarms face opposite ways after a bend; pair the
    // insulators that are nearer each other so wires never cross.
    const straight = Math.hypot(ea[0].x - eb[0].x, ea[0].z - eb[0].z) + Math.hypot(ea[1].x - eb[1].x, ea[1].z - eb[1].z);
    const crossed = Math.hypot(ea[0].x - eb[1].x, ea[0].z - eb[1].z) + Math.hypot(ea[1].x - eb[0].x, ea[1].z - eb[0].z);
    const pairs = straight <= crossed ? [[ea[0], eb[0]], [ea[1], eb[1]]] : [[ea[0], eb[1]], [ea[1], eb[0]]];
    const sag = 0.012 * span;
    let clear = true;
    for (let k = 1; k < 10 && clear; k += 1) {
      const t = k / 10;
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = a.p.y + (b.p.y - a.p.y) * t + WIRE_Y - sag * 4 * t * (1 - t);
      clear = y - heightAt(x, z) > 3.2 && !insideStructure(x, z, 1.5);
    }
    if (!clear) {
      continue;
    }
    for (const [p0, p1] of pairs) {
      TELEGRAPH_WIRES.push({ ax: p0.x, ay: p0.y, az: p0.z, bx: p1.x, by: p1.y, bz: p1.z, sag, r: 0.014, kind: "telegraph" });
    }
  }
}

function planMileposts() {
  for (const road of ROADS) {
    if (!MILE_ROADS.has(road.name)) {
      continue;
    }
    const path = roadPath(road.pts);
    // Right-hand verge, first post half a spacing out from the road's start.
    for (let d = MILE_SPACING / 2; d < path.length - 40; d += MILE_SPACING) {
      for (const slide of [0, 12, -12, 24, -24, 40]) {
        const c = path.at(d + slide);
        const off = road.width / 2 + 2.2;
        const x = c.x - c.nx * off;
        const z = c.z - c.nz * off;
        if (nearPlace(x, z, 10) || !vergeClear(x, z, 0.2, 0.4)) {
          continue;
        }
        place("mile_marker", x, groundSeat("mile_marker", x, z), z, faceYaw(c.nx, c.nz), { cluster: road.name });
        break;
      }
    }
  }
}

/** Every point where roads meet: shared endpoints, or an endpoint on another road. */
function roadJunctions() {
  const found = [];
  for (const road of ROADS) {
    for (const end of [road.pts[0], road.pts[road.pts.length - 1]]) {
      const w = mapToWorld(end[0], end[1]);
      if (found.some((j) => Math.hypot(j.x - w.x, j.z - w.z) < 6)) {
        continue;
      }
      const touching = ROADS.filter((o) => distToPolyline(w.x, w.z, o.pts) < 2);
      if (touching.length >= 2) {
        found.push({ x: w.x, z: w.z, roads: touching });
      }
    }
  }
  return found;
}

/** Unit directions leaving a junction along each road that touches it. */
function branchesAt(j) {
  const out = [];
  for (const road of j.roads) {
    const path = roadPath(road.pts);
    // Arc position of the junction on this road.
    let best = 0;
    let bestD = Infinity;
    for (let d = 0; d <= path.length; d += 2) {
      const c = path.at(d);
      const dd = Math.hypot(c.x - j.x, c.z - j.z);
      if (dd < bestD) {
        bestD = dd;
        best = d;
      }
    }
    for (const dir of [1, -1]) {
      const d = best + dir * 30;
      if (d < 0 || d > path.length) {
        continue;
      }
      const c = path.at(d);
      const len = Math.hypot(c.x - j.x, c.z - j.z) || 1;
      out.push({ road, dx: (c.x - j.x) / len, dz: (c.z - j.z) / len, s: best, dir, path });
    }
  }
  return out;
}

function placeSign(x, z, arms, cluster) {
  const post = place("signpost", x, groundSeat("signpost", x, z), z, 0, { cluster });
  arms.slice(0, 3).forEach((dir, i) => {
    place("sign_arm", x, post.y + 2.42 - i * 0.3, z, alongYaw(dir.dx, dir.dz), { cluster, mounted: true, noCollide: true });
  });
}

function planSignposts() {
  for (const j of roadJunctions()) {
    const branches = branchesAt(j);
    const settled = insideStructure(j.x, j.z, 25) || hasColliderNear(j.x, j.z, 12);
    if (!settled) {
      // Open junction: one post in the widest gap between branches, an arm
      // down each road.
      const angles = branches.map((b) => Math.atan2(b.dz, b.dx)).sort((a, b) => a - b);
      let gapMid = 0;
      let gap = -1;
      angles.forEach((a, i) => {
        const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
        if (next - a > gap) {
          gap = next - a;
          gapMid = a + (next - a) / 2;
        }
      });
      const reach = Math.max(...j.roads.map((r) => r.width)) / 2 + 3;
      for (const extra of [0, 2, 4, 7]) {
        const x = j.x + Math.cos(gapMid) * (reach + extra);
        const z = j.z + Math.sin(gapMid) * (reach + extra);
        if (vergeClear(x, z, 0.5, 0.4)) {
          placeSign(x, z, branches, "signs");
          break;
        }
      }
      continue;
    }
    // Junction inside a settlement: a two-armed sign on each road where it
    // leaves, pointing back in and on out.
    for (const b of branches) {
      for (const out of [55, 65, 75, 90]) {
        const d = b.s + b.dir * out;
        if (d < 0 || d > b.path.length) {
          break;
        }
        const c = b.path.at(d);
        const side = b.dir;
        const off = b.road.width / 2 + 2.4;
        const x = c.x - c.nx * off * side;
        const z = c.z - c.nz * off * side;
        if (!vergeClear(x, z, 0.5, 0.4)) {
          continue;
        }
        const back = { dx: j.x - c.x, dz: j.z - c.z };
        const bl = Math.hypot(back.dx, back.dz) || 1;
        placeSign(x, z, [{ dx: -back.dx / bl, dz: -back.dz / bl }, { dx: back.dx / bl, dz: back.dz / bl }], "signs");
        break;
      }
    }
  }
}

function planTrailside() {
  const rand = rng(1869);
  for (const road of ROADS) {
    if (ROADSIDE_SKIP.has(road.name)) {
      continue;
    }
    const path = roadPath(road.pts);
    for (let d = 20; d < path.length - 20; d += 34) {
      const c = path.at(d);
      if (nearPlace(c.x, c.z, 20)) {
        continue;
      }
      const side = rand() < 0.5 ? -1 : 1;
      const biome = biomeAt(c.x, c.z);
      const roll = rand();
      const cluster = road.name;
      if (road.kind === "trail" && TRAIL_BIOMES_CAIRN.has(biome) && roll < 0.16) {
        const off = side * (road.width / 2 + 1.4 + rand() * 1.5);
        const x = c.x + c.nx * off;
        const z = c.z + c.nz * off;
        if (vergeClear(x, z, 0.55, 0.45)) {
          place("cairn", x, groundSeat("cairn", x, z), z, rand() * Math.PI * 2, { cluster });
        }
      } else if (road.kind !== "rail" && roll > 0.985) {
        // A lone grave, or a family's two or three, heads to the west.
        const off = side * (12 + rand() * 8);
        const count = 1 + Math.floor(rand() * 3);
        for (let k = 0; k < count; k += 1) {
          const x = c.x + c.nx * off + c.dx * (k * 1.5);
          const z = c.z + c.nz * off + c.dz * (k * 1.5);
          if (openGround(x, z, 1.1, 0.15) && vergeClear(x, z, 1.1, 0.15)) {
            place("grave_trail", x, groundSeat("grave_trail", x, z), z, (rand() - 0.5) * 0.12, { cluster });
          }
        }
      } else if (road.kind !== "rail" && CAMP_BIOMES.has(biome) && roll > 0.965 && roll <= 0.985) {
        const off = side * (16 + rand() * 10);
        const x = c.x + c.nx * off;
        const z = c.z + c.nz * off;
        // Near-flat only: the ring is seated at the lowest ground under it, and
        // on a 7 degree slope that buried the uphill stones (a coffee pot on
        // bare dirt). People pick flat ground to camp anyway.
        if (openGround(x, z, 1.2, 0.05) && vergeClear(x, z, 1.2, 0.05)) {
          place("campfire_ring", x, groundSeat("campfire_ring", x, z), z, rand() * Math.PI * 2, { cluster });
        }
      } else if (road.kind !== "rail" && roll > 0.955 && roll <= 0.965) {
        const off = side * (6 + rand() * 6);
        const x = c.x + c.nx * off;
        const z = c.z + c.nz * off;
        if (vergeClear(x, z, 0.6, 0.25)) {
          place("trunk", x, groundSeat("trunk", x, z), z, rand() * Math.PI * 2, { cluster });
        }
      }
    }
  }
  // What fell off the wrecked wagons: a trunk beside each roadside wreck.
  const wrecks = PROP_PLACEMENTS.filter((p) => p.kind === "wagon_broken" && p.cluster !== "town");
  for (const w of wrecks) {
    for (const a of [0.6, 2.4, 4.0, 5.3]) {
      const x = w.x + Math.cos(w.yaw + a) * 3.4;
      const z = w.z - Math.sin(w.yaw + a) * 3.4;
      if (vergeClear(x, z, 0.6, 0.3)) {
        place("trunk", x, groundSeat("trunk", x, z), z, w.yaw + a * 1.7, { cluster: w.cluster });
        break;
      }
    }
  }
}

// --------------------------------------------------------------------------
// Mining district: the miners' camp and the railroad's two ends

/**
 * Iron Valley miners' camp, in metres east (dx) and south (dz) of the POI.
 * A street runs north-south 24 m east of the centre, clear of the arrival
 * pad at the centre, the approach leg west to the iron trail, the toxic
 * creek 27 m west and the old cabin ruins south-west. Wall tent doors are on
 * the model's -X end: yaw PI faces a door east, 0 faces it west.
 */
const MINING_CAMP = [
  { kind: "wall_tent", dx: 17, dz: -24, yaw: Math.PI },
  { kind: "wall_tent", dx: 17, dz: -15, yaw: Math.PI + 0.04 },
  { kind: "wall_tent", dx: 17, dz: -6, yaw: Math.PI - 0.05 },
  { kind: "wall_tent", dx: 31, dz: -24, yaw: 0.03 },
  { kind: "wall_tent", dx: 31, dz: -15, yaw: -0.04 },
  { kind: "wall_tent", dx: 31, dz: -6, yaw: 0.06 },
  { kind: "cook_fly", dx: 24, dz: 6, yaw: Math.PI / 2 },
  { kind: "barrel", dx: 27.8, dz: 2.6, yaw: 0.4 },
  { kind: "barrel", dx: 28.5, dz: 3.4, yaw: 2.1 },
  { kind: "crate", dx: 20.2, dz: 9.8, yaw: 0.2 },
  { kind: "crate", dx: 20.4, dz: 10.8, yaw: -0.1 },
  { kind: "woodpile", dx: 31, dz: 12, yaw: Math.PI / 2 },
  { kind: "chopping_block", dx: 28.5, dz: 14, yaw: 0.7 },
  { kind: "washtub_bench", dx: 36, dz: -1, yaw: Math.PI / 2 },
  { kind: "outhouse", dx: 42, dz: -32, yaw: -Math.PI / 2 },
  { kind: "powder_crates", dx: 13.5, dz: -28, yaw: 0.3 }
];

function planMiningCamp() {
  const iv = POS.ironValley;
  for (const item of MINING_CAMP) {
    const x = iv.x + item.dx;
    const z = iv.z + item.dz;
    if (yardClear(item.kind, x, z)) {
      place(item.kind, x, groundSeat(item.kind, x, z), z, item.yaw, { cluster: "ironValley" });
    }
  }
}

/** Place a prop beside the rail if the verge allows, sliding along it to fit. */
function railside(path, d, side, kind, extra = {}) {
  const spec = PROP_KINDS[kind];
  // A piece laid along the rail reaches toward it only by its half depth.
  const reach = extra.yaw === undefined ? spec.hz + 0.3 : Math.hypot(spec.hx, spec.hz);
  for (const slide of [0, 4, -4, 8, -8, 12]) {
    const c = path.at(d + slide);
    const x = c.x + c.nx * side;
    const z = c.z + c.nz * side;
    if (vergeClear(x, z, reach, 0.3)) {
      return place(kind, x, groundSeat(kind, x, z), z, extra.yaw ?? alongYaw(c.dx, c.dz), { cluster: "railroad", ...extra });
    }
  }
  return null;
}

/**
 * The iron railroad is unfinished (roads.js lays rails over its first 72 %
 * and bare ties beyond). Its north end is a finished terminus: a buffer stop
 * across the rails and freight waiting beside them. Where the rails stop is
 * the construction front: rails and ties stacked beside the grade and the
 * track gang's tent back from it.
 */
function planRailEnds() {
  const rail = ROADS.find((r) => r.name === "ironRail");
  if (!rail) {
    return;
  }
  const path = roadPath(rail.pts);
  const start = path.at(0);
  // Buffer stop: its face (model -X) toward the track, 0.8 m in from the end.
  const bx = start.x + start.dx * 0.8;
  const bz = start.z + start.dz * 0.8;
  place("buffer_stop", bx, groundSeat("buffer_stop", bx, bz), bz,
    alongYaw(-start.dx, -start.dz), { cluster: "railroad", trackside: true });
  railside(path, 10, 5.2, "rail_stack");
  railside(path, 22, -5.4, "timber_stack");
  railside(path, 26, -5.0, "powder_crates", { yaw: 0.4 });

  // Construction front where roads.js stops laying rails.
  const front = path.length * 0.72;
  railside(path, front + 2, 5.2, "rail_stack");
  railside(path, front - 9, 5.2, "rail_stack");
  railside(path, front - 5, -5.5, "barrel");
  railside(path, front - 3.5, -5.9, "barrel", { yaw: 1.3 });
  railside(path, front - 4, -7.2, "crate");
  const camp = path.at(front - 30);
  railside(path, front - 30, 16, "wall_tent", { yaw: alongYaw(camp.dx, camp.dz) });
  railside(path, front - 42, 15, "cook_fly");
}

function planTrail() {
  planTelegraph();
  planMileposts();
  planSignposts();
  planTrailside();
}

/**
 * Decide every prop placement and register its colliders. Call once, after
 * the last structure builder and before the nav graph is built.
 */
export function planWesternProps() {
  PROP_PLACEMENTS.length = 0;
  TELEGRAPH_WIRES.length = 0;
  clearGroundClearings();
  planSpots();
  planSilverCreek();
  planRanchYard();
  planHomestead(POS.barrett, "barrett", 1881);
  planCamps();
  planRoadside();
  planTrail();
  planMiningCamp();
  planRailEnds();
  return PROP_PLACEMENTS;
}

// --------------------------------------------------------------------------
// Drawing

function propMatrix(p, out) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, p.yaw, p.pitch || 0, "YXZ"));
  if (p.tipped) {
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  }
  // A tipped barrel lies on its side: lift its axis to the stave radius.
  const y = p.tipped ? p.y + 0.3 : p.y;
  return out.compose(new THREE.Vector3(p.x, y, p.z), q, new THREE.Vector3(p.sx || 1, 1, 1));
}

/**
 * Telegraph wires as thin triangular tubes hanging in a parabola between
 * insulators, merged into one mesh per map cell.
 */
function buildWireMeshes() {
  const SEGMENTS = 10;
  const byCell = new Map();
  for (const w of TELEGRAPH_WIRES) {
    const key = `${Math.floor((w.ax + w.bx) / 2 / CELL)}:${Math.floor((w.az + w.bz) / 2 / CELL)}`;
    if (!byCell.has(key)) {
      byCell.set(key, []);
    }
    byCell.get(key).push(w);
  }
  const material = new THREE.MeshStandardNodeMaterial({ color: 0x2b2824, roughness: 0.55, metalness: 0.6 });
  const meshes = [];
  for (const [key, list] of byCell) {
    const pos = [];
    const idx = [];
    for (const w of list) {
      const R = w.r || 0.014;
      const dx = w.bx - w.ax;
      const dz = w.bz - w.az;
      const len = Math.hypot(dx, dz) || 1;
      // Section frame: horizontal side vector and up.
      const sx = -dz / len;
      const sz = dx / len;
      for (let k = 0; k <= SEGMENTS; k += 1) {
        const t = k / SEGMENTS;
        const x = w.ax + dx * t;
        const z = w.az + dz * t;
        const y = w.ay + (w.by - w.ay) * t - w.sag * 4 * t * (1 - t);
        for (let r = 0; r < 3; r += 1) {
          const a = (r / 3) * Math.PI * 2;
          const ca = Math.cos(a) * R;
          pos.push(x + sx * ca, y + Math.sin(a) * R, z + sz * ca);
        }
        if (k > 0) {
          const b0 = pos.length / 3 - 6;
          const b1 = pos.length / 3 - 3;
          for (let r = 0; r < 3; r += 1) {
            const r1 = (r + 1) % 3;
            idx.push(b0 + r, b1 + r, b1 + r1, b0 + r, b1 + r1, b0 + r1);
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `props:wires:${key}`;
    mesh.matrixAutoUpdate = false;
    meshes.push(mesh);
  }
  return meshes;
}

/**
 * Load the prop GLB and draw the current plan. Returns the controller:
 * update(cameraPosition) hides cells beyond draw distance, applyBiomeFilter
 * lets the dev biome bar hide one region's props.
 */
export async function installWesternProps(scene, { kits = PROP_KITS, biomeOn = null } = {}) {
  const group = new THREE.Group();
  group.name = "westernProps";
  const cells = [];
  try {
    const loader = new GLTFLoader();
    const sources = new Map();
    const loaded = await Promise.allSettled(Object.entries(kits).map(async ([kit, url]) => ({ kit, url, gltf: await loader.loadAsync(url) })));
    for (const result of loaded) {
      if (result.status === "rejected") {
        console.warn("Western props: a kit failed to load; its props stay collider-only.", result.reason);
        continue;
      }
      const { gltf } = result.value;
      gltf.scene.traverse((o) => {
        if (o.isMesh && PROP_KINDS[o.name]) {
          // Every prop is a closed solid; Blender exports the material
          // double-sided, which would shade (and shadow) every back face.
          o.material.side = THREE.FrontSide;
          sources.set(o.name, o);
        }
      });
    }
    const byCell = new Map();
    for (const p of PROP_PLACEMENTS) {
      const key = `${p.kind}:${Math.floor(p.x / CELL)}:${Math.floor(p.z / CELL)}`;
      if (!byCell.has(key)) {
        byCell.set(key, []);
      }
      byCell.get(key).push(p);
    }
    const m = new THREE.Matrix4();
    for (const [key, list] of byCell) {
      const kind = key.split(":")[0];
      const src = sources.get(kind);
      if (!src) {
        console.warn(`western props: kit "${PROP_KINDS[kind].kit}" has no mesh named ${kind}`);
        continue;
      }
      const mesh = new THREE.InstancedMesh(src.geometry, src.material, list.length);
      mesh.name = `props:${key}`;
      list.forEach((p, i) => mesh.setMatrixAt(i, propMatrix(p, m)));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = PROP_KINDS[kind].shadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      const centre = mesh.boundingSphere.center;
      cells.push({ mesh, centre: centre.clone(), radius: mesh.boundingSphere.radius, biome: biomeAt(centre.x, centre.z) });
      group.add(mesh);
    }
    const wires = buildWireMeshes();
    for (const w of wires) {
      const b = w.geometry.boundingSphere;
      cells.push({ mesh: w, centre: b.center.clone(), radius: b.radius, biome: biomeAt(b.center.x, b.center.z) });
      group.add(w);
    }
    scene.add(group);
  } catch (err) {
    console.warn("Western props unavailable; colliders stay, nothing drawn.", err);
  }

  let filterOn = () => true;
  const controller = {
    group,
    cells,
    update(cameraPosition) {
      for (const c of cells) {
        const reach = DRAW_DISTANCE + c.radius;
        c.mesh.visible = filterOn(c.biome) && c.centre.distanceToSquared(cameraPosition) < reach * reach;
      }
    },
    applyBiomeFilter(on) {
      filterOn = on;
    }
  };
  if (biomeOn) {
    controller.applyBiomeFilter(biomeOn);
  }
  return controller;
}
