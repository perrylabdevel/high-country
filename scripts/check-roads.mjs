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
import * as THREE from "three/webgpu";
import { float } from "three/tsl";
import * as terrain from "../src/materials/terrainMaterial.ts";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function dependencies(root, seen = new Set()) {
  if (!root?.isNode || seen.has(root)) return seen;
  seen.add(root);
  for (const child of root.getChildren()) dependencies(child, seen);
  return seen;
}

function scalar(node) {
  if (node.isConstNode || node.isUniformNode) return node.value;
  if (node.isVarNode || node.isConvertNode) return scalar(node.node);
  const a = scalar(node.aNode), b = node.bNode ? scalar(node.bNode) : 0;
  if (node.isOperatorNode) {
    if (node.op === "+") return a + b;
    if (node.op === "-") return a - b;
    if (node.op === "*") return a * b;
    if (node.op === "/") return a / b;
  }
  if (node.method === "max") return Math.max(a, b);
  if (node.method === "min") return Math.min(a, b);
  if (node.method === "mix") return a + (b - a) * scalar(node.cNode);
  if (node.method === "smoothstep") {
    const lo = scalar(node.aNode), hi = scalar(node.bNode), x = scalar(node.cNode);
    const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
    return t * t * (3 - 2 * t);
  }
  throw new Error(`Unsupported scalar node ${node.constructor.name} ${node.method || node.op}`);
}

const fixture = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
const maps = Object.fromEntries(["grass", "dirt", "rock", "gravel"].map((name) => [name, { name, albedo: fixture, normal: fixture, orm: fixture }]));
const terrainMat = terrain.createTerrainMaterial(maps, fixture);
const normalNodes = [...dependencies(terrainMat.normalNode)];
assert(normalNodes.some((n) => n.method === "oneMinus"), "Terrain normal map green channel is not flipped for the rotated plane UV basis");
assert(materialSettings.roadRoughnessMin >= 0.75, "Dry road roughness must stay >= 0.75; polished wheel tracks read as oil");
assert([...dependencies(terrainMat.roughnessNode)].some((n) => n.isUniformNode && n.name === "roadRoughnessMin"), "The terrain roughness bypasses the dry-road floor; connect roadRoughness to roughnessNode");
let minRoadRoughness = 1;
for (const source of [0, 0.25, 0.5, 0.85, 1]) {
  for (const center of [0, 0.5, 1]) {
    for (const variation of [-1, 0, 1]) {
      const rough = scalar(terrain.roadRoughness(float(source), float(center), float(variation)));
      assert(rough >= 0.75 && rough <= 1, `Road roughness ${rough} is outside dry-earth range [0.75, 1]`);
      minRoadRoughness = Math.min(minRoadRoughness, rough);
    }
  }
}
for (const [road, packed, expected] of [[0.9, 0.9 * (0.5 + 0.9 / 4), 0.9], [0.9, 0.9 * (0.5 - 0.9 / 4), -0.9]]) {
  const decoded = scalar(terrain.normalizedRoadLateral(float(road), float(packed)));
  assert(Math.abs(decoded - expected) < 0.08, `Normalized road lateral decode drifts on narrow road: ${decoded} vs ${expected}`);
}
const grooveFloor = scalar(terrain.rutReliefHeight(float(1), float(0), float(1)));
const grooveLip = scalar(terrain.rutReliefHeight(float(0), float(1), float(1)));
assert(grooveFloor < -0.04 && grooveLip > 0 && grooveLip < 0.04, "Rut height must recess the floor and raise a shallow displaced-dirt lip");
assert(scalar(terrain.rutReliefHeight(float(1), float(1), float(0))) === 0, "Rut relief must vanish where the road/traffic mask is zero");
// The edge rag must be gated by the road channel: noise alone, added to a
// zero baseline, once cleared the mask floor over half the world and painted
// gravel as a pale web across every open vantage while zeroing the ground
// grass layer (roadMask.oneMinus()).
assert(scalar(terrain.roadRawNode(float(0), float(1))) === 0, "Road edge rag must vanish at splat.a = 0; ungated noise invents road on open ground");
assert(scalar(terrain.roadRawNode(float(0), float(-1))) === 0, "Road edge rag must vanish at splat.a = 0 for negative noise too");
const ragHigh = scalar(terrain.roadRawNode(float(0.5), float(1)));
const ragLow = scalar(terrain.roadRawNode(float(0.5), float(-1)));
assert(ragHigh > 1.2 && ragLow < 0.2, `Road edge rag must still wobble on the road itself (got ${ragHigh}, ${ragLow})`);
terrainMat.dispose();
fixture.dispose();

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
  rut: { depth: materialSettings.rutDepth, peakAttenuation: Number(rutPeak.toFixed(3)), roadCompact: materialSettings.roadCompact, grooveFloor, grooveLip, minRoadRoughness },
  stats,
  near: {
    ranch: nearestRoadDistance(POS.ranch.x, POS.ranch.z),
    silverCreek: nearestRoadDistance(POS.silverCreek.x, POS.silverCreek.z),
    fortGrant: nearestRoadDistance(POS.fortGrant.x, POS.fortGrant.z),
    mines: nearestRoadDistance(POS.mines.x, POS.mines.z)
  }
}, null, 2));
console.log("PASS");
