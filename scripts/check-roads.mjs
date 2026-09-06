/**
 * Roads must exist as 3D-draped polylines: real length on the heightfield,
 * sitting near ground, and reaching the places the map says they serve.
 */
import {
  POS,
  ROADS,
  CREEKS,
  BRIDGES,
  ROAD_LIFT,
  nearestRoadDistance,
  measureRoadNetwork
} from "../src/map.js";
import { heightAt, bakeHeightfield } from "../src/heightfield.js";
import { materialSettings, RUT_TONE } from "../src/materials/settings.ts";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

const KINDS = ["stage", "road", "trail", "rail"];

assert(ROAD_LIFT >= 0.04 && ROAD_LIFT <= 0.12, "ROAD_LIFT should sit just above the ground");

const kinds = new Set(ROADS.map((r) => r.kind));
for (const kind of KINDS) {
  assert(kinds.has(kind), `network is missing kind ${kind}`);
}
for (const road of ROADS) {
  assert(KINDS.includes(road.kind), `${road.name} has unknown kind ${road.kind}`);
  assert(road.width > 1 && road.width < 16, `${road.name} width should be a trail-to-stage scale`);
  assert(road.pts.length >= 2, `${road.name} needs a polyline`);
}

// Wheel ruts darken gravel by albedo *= 1 - rut*rutDepth*RUT_TONE. Nothing
// clamps that expression before the multiply, so once rutDepth * max(RUT_TONE)
// reaches 1 the deepest part of the groove goes to pure black and the road
// renders as a tar streak — and Silver Creek's main street, which is wide
// enough to hold a full-strength rut down its middle, reads as a canal.
// rutDepth shipped at 3.5 (2.7x over) with no error and no failing check.
const rutPeak = materialSettings.rutDepth * Math.max(...RUT_TONE);
assert(
  rutPeak < 0.85,
  `rutDepth ${materialSettings.rutDepth} drives rut albedo attenuation to ${rutPeak.toFixed(2)}; ` +
    `must stay under 0.85 (rutDepth < ${(0.85 / Math.max(...RUT_TONE)).toFixed(2)}) or grooves clip to black`
);
// The ruts sit at |lat| ~ rutOffset, inside the centre band. If roadCompact
// darkens that band hard the grooves have nothing brighter to read against,
// which is the state the ruts were built to replace.
assert(
  materialSettings.roadCompact < 0.35,
  `roadCompact ${materialSettings.roadCompact} re-darkens the band the wheel ruts live in; ` +
    "keep it under 0.35 so the crown between the wheels stays brighter than the grooves"
);

const stage = ROADS.find((r) => r.kind === "stage");
const rail = ROADS.find((r) => r.kind === "rail");
assert(stage.width > ROADS.filter((r) => r.kind === "trail")[0].width, "stage road should be wider than trails");
assert(rail.name === "ironRail", "Iron Valley rail should be present");

const creekNames = new Set(CREEKS.map((c) => c.name));
assert(creekNames.has("granite"), "Granite Creek is missing");
assert(creekNames.has("twin"), "Twin Creek is missing");
assert(creekNames.has("deadman"), "Deadman's Wash is missing");
const wash = CREEKS.find((c) => c.name === "deadman");
assert(wash.dry === true, "Deadman's Wash should be a dry bed");
assert(BRIDGES.length >= 2, "creek crossings need blockout bridges");

bakeHeightfield();
const stats = measureRoadNetwork(heightAt, 7);
assert(stats.length2d > 8000, `road network 2D length too short: ${stats.length2d}`);
assert(stats.length3d > stats.length2d, "3D length should include terrain rise");
assert(stats.length3d > 8000, `road network 3D length too short: ${stats.length3d}`);
assert(stats.maxGap < 2.2, `ribbon midpoints float off the heightfield: gap ${stats.maxGap}`);
assert(stats.samples > 400, `not enough ribbon samples: ${stats.samples}`);

const NEAR = 90;
assert(nearestRoadDistance(POS.ranch.x, POS.ranch.z) < NEAR, "ranch should sit on a road");
assert(nearestRoadDistance(POS.silverCreek.x, POS.silverCreek.z) < NEAR, "Silver Creek should sit on a road");
assert(nearestRoadDistance(POS.fortGrant.x, POS.fortGrant.z) < NEAR, "Fort Grant should sit on a road");
assert(
  nearestRoadDistance(POS.mines.x, POS.mines.z, ["rail", "trail"]) < NEAR,
  "mines should sit near rail or the iron trail"
);
assert(nearestRoadDistance(POS.timberCamp.x, POS.timberCamp.z, ["road", "trail"]) < NEAR, "timber camp needs a logging road");
assert(nearestRoadDistance(POS.mission.x, POS.mission.z, ["road"]) < NEAR, "south road should reach the mission");

console.log(JSON.stringify({
  kinds: [...kinds],
  roads: ROADS.length,
  creeks: CREEKS.map((c) => c.name),
  lift: ROAD_LIFT,
  rut: { depth: materialSettings.rutDepth, peakAttenuation: Number(rutPeak.toFixed(3)), roadCompact: materialSettings.roadCompact },
  stats,
  near: {
    ranch: nearestRoadDistance(POS.ranch.x, POS.ranch.z),
    silverCreek: nearestRoadDistance(POS.silverCreek.x, POS.silverCreek.z),
    fortGrant: nearestRoadDistance(POS.fortGrant.x, POS.fortGrant.z),
    mines: nearestRoadDistance(POS.mines.x, POS.mines.z)
  }
}, null, 2));
console.log("PASS");
