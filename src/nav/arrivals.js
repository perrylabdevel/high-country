/**
 * Arrival approaches — the LOCAL half of two-stage navigation.
 *
 * The global graph (src/nav/graph.js) routes across the map; this table says
 * where a place can actually be arrived at. A POI coordinate names a REGION,
 * never a doorstep: Lake Mercy's centre is 12.8 m of water, the stamp mill's
 * approach is its shed face, the wild POIs sit a hundred metres off their rim
 * cuts. Steering at the raw centre was the exact bug that stalled the R3
 * return ride ("the target line points at the lake bed").
 *
 * An approach is authored data, not inferred geometry: roads move, buildings
 * move, and an inferred approach silently follows them into a wall. Every
 * entry is validated against the built world by scripts/check-approaches.mjs
 * (standing ground, clearance, slope, water, footprint, and a 2 m-sampled leg
 * from its graph node — the "not separated by a wall/fence/cliff/water" test
 * that distance alone cannot make).
 *
 * Conventions: dx is east, dz is south, world metres from the POI centre (the
 * same offset convention as the NPC table; covered by check-handedness).
 * `face` is a yaw whose headingVector() points where the visitor should look
 * on arrival (0 = north). "arrival anchor" in the spec = the entries here; the
 * name "anchor" itself is taken by src/buildings/anchors.js (kit-mating).
 */

import { WATER, POS, headingVector } from "../map.js";
import { heightAt, normalAt } from "../heightfield.js";
import { clearanceAt, moveAndSlide } from "../collision.js";
import { NAV, MODE_RADIUS } from "./costs.js";

/**
 * Standing-room floor per type: how much open space the arrival point itself
 * must have (clearanceAt). Tighter for places whose purpose is a boundary —
 * a doorway or a gate squeeze legitimately stands 1.5 m from the thing —
 * looser for open pads, where "arrived" with a wall pressed against your back
 * would read as a bug to a player.
 */
export const APPROACH_CLEAR = {
  door: 1.4,
  gate: 1.2,
  porch: 1.4,
  hitch: 1.2,
  street: 1.8,
  dock: 2.5,
  camp: 2.5,
  trailhead: 3,
  overlook: 3,
  yard: 4
};

/**
 * One approach per entry. `primary` marks the arrival the HUD routes to;
 * the rest are fallbacks (a flooded yard falls back to its hitching rail,
 * not to nothing). `dismount` marks points where the horse is left behind.
 */
export const APPROACHES = [
  // --- ranch ----------------------------------------------------------------
  // The open pad between the house's south end and the barn's east side — the
  // measured 4 m-clearance spot sat inside the barn/house squeeze; this pad
  // has ~12 m of standing room in every direction.
  { id: "ranch.yard", poi: "ranch", type: "yard", dx: -8, dz: 16, r: 18, primary: true },
  { id: "ranch.hitch", poi: "ranch", type: "hitch", dx: 6, dz: 16, r: 3, dismount: true },
  { id: "ranchGate.gate", poi: "ranchGate", type: "gate", dx: 4, dz: 0, r: 2.5, face: -Math.PI / 2, primary: true },
  // The store's north frontage: the open band between the street axis and the
  // boardwalk line, facing the storefronts.
  { id: "silverCreek.street", poi: "silverCreek", type: "street", dx: 0, dz: 3, r: 3.5, face: Math.PI, primary: true },
  { id: "silverCreek.hitch", poi: "silverCreek", type: "hitch", dx: -8, dz: -0.6, r: 3, dismount: true },
  // The North shore band where silverNorth meets the water — the only dry
  // ground on the whole rim within 60 m of a road (the POI centre is 12.8 m
  // of lakebed; a dock approach that faced the centre would face water).
  { id: "lakeMercy.dock", poi: "lakeMercy", type: "dock", dx: 60, dz: 392, r: 5, face: Math.PI, primary: true },
  // The fort has one arrival: its gateway. The interior is a walled maze
  // (barracks, flag, ring stones) with no straight walk-in, and the yard pads
  // sit hard against one wall or another — a gate arrival is the honest one.
  { id: "fortGrant.gate", poi: "fortGrant", type: "gate", dx: 0, dz: -12, r: 2.1, face: Math.PI, primary: true },
  { id: "mines.trailhead", poi: "mines", type: "trailhead", dx: -6, dz: 10, r: 6, primary: true },
  { id: "stampMill.door", poi: "stampMill", type: "door", dx: -2, dz: -14, r: 2.2, face: 0, primary: true },
  { id: "stampMill.trailhead", poi: "stampMill", type: "trailhead", dx: 0, dz: -40, r: 6 },
  { id: "company.trailhead", poi: "company", type: "trailhead", dx: 18, dz: 18, r: 6, primary: true },
  // Open ground at the camp's heart, north of the tent line; the old (−5,22)
  // pad sat inside the shed/tent squeeze where no straight leg from the valley
  // trail could reach it.
  { id: "ironValley.camp", poi: "ironValley", type: "camp", dx: 0, dz: 0, r: 10, primary: true },
  { id: "foothills.trailhead", poi: "foothills", type: "trailhead", dx: 0, dz: 0, r: 6, primary: true },
  { id: "tribal.trailhead", poi: "tribal", type: "trailhead", dx: 0, dz: 0, r: 6, primary: true },
  { id: "badlands.trailhead", poi: "badlands", type: "trailhead", dx: 0, dz: 0, r: 6, primary: true },
  { id: "mission.trailhead", poi: "mission", type: "trailhead", dx: 0, dz: -12, r: 6, face: 0, primary: true },
  // The rim cuts end 100+ m off the POI centres on purpose: the rim shelf is
  // where the passable ground is, not the canyon throat.
  { id: "vipers.trailhead", poi: "vipers", type: "trailhead", dx: 20, dz: -110, r: 6, primary: true },
  { id: "hideout.trailhead", poi: "hideout", type: "trailhead", dx: 40, dz: -100, r: 6, primary: true },
  // El Paso Verde's centre is hemmed by its own houses; the open pocket
  // north-east of the casa is the ground a rider actually pulls up on.
  { id: "elPaso.trailhead", poi: "elPaso", type: "trailhead", dx: 0, dz: -18, r: 6, primary: true },
  { id: "cemetery.trailhead", poi: "cemetery", type: "trailhead", dx: -80, dz: -5, r: 8, primary: true },
  // The living face of the cabin is its south porch onto the trail; the north
  // door sits a straight leg through the building from every graph node, so
  // it cannot anchor arrival (walk-around is the player's move, not the
  // route's).
  { id: "huntingCabin.porch", poi: "huntingCabin", type: "porch", dx: 0, dz: 5.4, r: 3, primary: true },
  { id: "timberCamp.camp", poi: "timberCamp", type: "camp", dx: 0, dz: -2, r: 10, primary: true },
  // The POI centre is inside the camp hut's own footprint; the open ground
  // east-southeast of it is where a rider actually stops.
  { id: "sheepCamp.camp", poi: "sheepCamp", type: "camp", dx: 10, dz: 10, r: 10, primary: true },
  { id: "fireWatch.overlook", poi: "fireWatch", type: "overlook", dx: 0, dz: 8, r: 8, primary: true },
  // GLASS_SPOT is the stage's examine location (missions.js); the overlook
  // approach IS that ground, so the mission's stage re-base lands on it.
  { id: "overlook.overlook", poi: "overlook", type: "overlook", dx: 0, dz: -9, r: 8, face: 0, primary: true },
  { id: "overlook.trailhead", poi: "overlook", type: "trailhead", dx: 0, dz: 6, r: 6 },
  { id: "westernRange.trailhead", poi: "westernRange", type: "trailhead", dx: 0, dz: 0, r: 6, primary: true },
  // Barrett's POI centre is its own house; arrival is the yard south of it.
  { id: "barrett.trailhead", poi: "barrett", type: "trailhead", dx: 0, dz: 18, r: 8, primary: true },
  { id: "northernPines.trailhead", poi: "northernPines", type: "trailhead", dx: 0, dz: 0, r: 6, primary: true },
  { id: "burn.trailhead", poi: "burn", type: "trailhead", dx: 0, dz: 0, r: 6, primary: true }
];

// Resolve world positions once: the dx/dz stay authored (diffable against the
// POI table), the x/z are what every consumer reads.
for (const ap of APPROACHES) {
  const place = POS[ap.poi];
  if (!place) {
    throw new Error(`APPROACHES references unknown POI ${ap.poi}`);
  }
  ap.x = place.x + ap.dx;
  ap.z = place.z + ap.dz;
}

const BY_POI = new Map();
for (const ap of APPROACHES) {
  if (!BY_POI.has(ap.poi)) {
    BY_POI.set(ap.poi, []);
  }
  BY_POI.get(ap.poi).push(ap);
}

export function approachesFor(poiId) {
  return BY_POI.get(poiId) ?? [];
}

export function primaryApproach(poiId) {
  return approachesFor(poiId).find((ap) => ap.primary) ?? null;
}

/** Link rows for graph.linkApproaches(): one per approach, in data order. */
export function approachLinkRows() {
  return APPROACHES.map((ap) => ({ id: ap.id, poi: ap.poi, x: ap.x, z: ap.z }));
}

/**
 * Arrival predicate — the game's answer to "am I THERE yet?".
 *
 * Being inside the radius is necessary but never sufficient: the pose must
 * also be on ground the declared mode can stand on (slope gate), out of the
 * water (except a dock, whose region is defined by the waterline), and not
 * pressed through a collider — "five metres from a target through a solid
 * wall is not arrival". `modes` on the approach filters which approach
 * applies; the pose's mode must be one of them.
 *
 * Returns { arrived, approachId, reason } with arrival reason strings stable
 * for HUD/tests: "outside-region" when no approach region contains the pose,
 * "steep", "underwater", "pressed" for the ground failures, "no-approach"
 * when the POI has no table at all.
 */
export function arrivalState(poiId, pose, { mode = "walk" } = {}) {
  const candidates = approachesFor(poiId);
  if (candidates.length === 0) {
    return { arrived: false, approachId: null, reason: "no-approach" };
  }
  let inside = null;
  for (const ap of candidates) {
    const d = Math.hypot(pose.x - ap.x, pose.z - ap.z);
    if (d <= ap.r) {
      inside = ap;
      break;
    }
  }
  if (!inside) {
    return { arrived: false, approachId: null, reason: "outside-region" };
  }
  const slope = normalAt(pose.x, pose.z);
  const gate = mode === "walk" ? NAV.WALK_SLOPE_BLOCK : NAV.SLOPE_BLOCK;
  if (slope.y < gate) {
    return { arrived: false, approachId: inside.id, reason: "steep" };
  }
  const y = heightAt(pose.x, pose.z);
  if (y < WATER && inside.type !== "dock") {
    return { arrived: false, approachId: inside.id, reason: "underwater" };
  }
  // Pressed-through check: the mover radius shoving anywhere means we are
  // inside (or behind) a collider, exactly the "arrival through a wall" case
  // distance checks cannot see.
  const r = MODE_RADIUS[mode];
  const cleared = moveAndSlide(pose.x, pose.z, 0, 0, r, null, y);
  if (Math.hypot(cleared.x - pose.x, cleared.z - pose.z) > 0.05 || clearanceAt(pose.x, pose.z, 2) < 0.9) {
    return { arrived: false, approachId: inside.id, reason: "pressed" };
  }
  return { arrived: true, approachId: inside.id, reason: "in-region" };
}