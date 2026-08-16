/**
 * North-up minimap: needle shows look direction on the chart; chart pans under
 * the player without rotating. Forward walk scrolls the map opposite the needle.
 */
import { POS, headingVector } from "../src/map.js";
import {
  lookCanvasAngle,
  screenNeedleAngle,
  displayPoint,
  viewWindow,
  chartScale
} from "../src/minimap.js";

function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

function assertClose(a, b, msg) {
  const d = Math.abs(wrapPi(a - b));
  if (d > 1e-6) {
    throw new Error(`${msg}: ${a} vs ${b} (delta ${d})`);
  }
}

function needleVector(angle) {
  // Canvas ctx.rotate(θ) sends local +X to (cos θ, sin θ) in screen space, where y
  // grows DOWNWARD. Measured in Chrome via scripts/minimap-probe.html: rotate(+π/2)
  // puts the tip below the pivot. Flipping this sin sign makes every assertion below
  // agree with a mirrored world, which is how the N/S needle bug survived so long.
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

/** Player movement expressed in chart-screen pixels. North is -Z, and -Z is up. */
function chartStep(dx, dz) {
  const scale = chartScale();
  return { x: dx / 4000 * 400 * scale, y: dz / 5000 * 500 * scale };
}

/** Inverse of headingVector: the yaw that walks along (dx, dz). */
function bearing(dx, dz) {
  return Math.atan2(dx, -dz);
}

// Assert on the direction the needle actually points on screen (+y is DOWN), not on
// raw rotation values. Angle-only expectations are sign-ambiguous and will happily
// describe a north/south-mirrored chart.
const north = needleVector(lookCanvasAngle(0));
const south = needleVector(lookCanvasAngle(Math.PI));
const east = needleVector(lookCanvasAngle(Math.PI / 2));
const west = needleVector(lookCanvasAngle(-Math.PI / 2));

assert(north.y < -0.99, `facing north must point the needle UP, got y=${north.y}`);
assert(south.y > 0.99, `facing south / the house must point the needle DOWN, got y=${south.y}`);
assert(east.x > 0.99, `facing east must point the needle RIGHT, got x=${east.x}`);
assert(west.x < -0.99, `facing west must point the needle LEFT, got x=${west.x}`);

// Yaw grows from north (+Z) toward east (+X), so on a north-up chart the needle must
// swing clockwise: up toward the right.
const yawUp = needleVector(lookCanvasAngle(0.25));
const yawDown = needleVector(lookCanvasAngle(-0.25));
assert(yawUp.x > 0 && yawUp.y < 0, `yaw+ must swing the needle from north toward east, got ${JSON.stringify(yawUp)}`);
assert(yawDown.x < 0 && yawDown.y < 0, `yaw- must swing the needle from north toward west, got ${JSON.stringify(yawDown)}`);

assertClose(screenNeedleAngle(0), lookCanvasAngle(0), "screen needle matches chart angle at north");
assertClose(screenNeedleAngle(Math.PI), lookCanvasAngle(Math.PI), "screen needle matches chart angle at south");

const spawnX = POS.ranch.x + 6;
const spawnZ = POS.ranch.z + 18;
const houseX = POS.ranch.x;
const houseZ = POS.ranch.z - 8;
const spawnYaw = 0;
const faceHouseYaw = bearing(houseX - spawnX, houseZ - spawnZ);
const landmark = POS.lakeMercy;

const ranchView = viewWindow(spawnX, spawnZ);
assert(Math.abs(ranchView.px - 200) < 1e-6, "player stays on the overlay center X");
assert(Math.abs(ranchView.py - 200) < 1e-6, "player stays on the overlay center Y");

const here = displayPoint(spawnX, spawnZ, spawnX, spawnZ);
assert(Math.abs(here.x - 200) < 1e-6, "player stays on the overlay center X");
assert(Math.abs(here.y - 200) < 1e-6, "player stays on the overlay center Y");

const ranchOnMap = displayPoint(POS.ranch.x, POS.ranch.z, spawnX, spawnZ);
const ranchDir = { x: ranchOnMap.x - here.x, y: ranchOnMap.y - here.y };
const houseOnMap = displayPoint(houseX, houseZ, spawnX, spawnZ);
const houseDir = { x: houseOnMap.x - here.x, y: houseOnMap.y - here.y };
const spawnNeedle = needleVector(screenNeedleAngle(spawnYaw));
const faceHouseNeedle = needleVector(screenNeedleAngle(faceHouseYaw));

assert(ranchDir.y < 0 && ranchDir.x < 0, "spawn: ranch label sits above-left of the player dot");
assert(houseDir.y < ranchDir.y, "ranch house sits north of the ranch center label");
assert(
  dot(spawnNeedle, ranchDir) > 0,
  "at spawn, needle must point toward the ranch / house"
);
assertClose(screenNeedleAngle(spawnYaw), -Math.PI / 2, "spawn yaw 0 faces north on the chart");
assert(spawnNeedle.y < -0.9, "screenshot 1: spawn needle must point UP toward the house");
assert(Math.abs(spawnNeedle.x) < 0.1, "screenshot 1: spawn needle is mostly north, not east/west");
assert(
  dot(faceHouseNeedle, houseDir) > 0,
  "screenshot 2: needle must point toward ranch buildings when facing them"
);
assert(
  faceHouseNeedle.y < 0 && faceHouseNeedle.x < 0,
  "screenshot 2: facing ranch buildings, needle must aim above-left on the chart"
);

// Regression guards for the two formulas this bug kept cycling between. Each one is
// correct on one axis and mirrored on the other, so each must be checked on the axis
// where it actually goes wrong — that is why they survived earlier rounds of testing.
const mirroredNS = needleVector(Math.PI / 2 - 0);
assert(mirroredNS.y > 0, "regression guard: (π/2 - yaw) points DOWN when facing north");

const mirroredEW = needleVector(Math.atan2(-Math.cos(Math.PI / 2), -Math.sin(Math.PI / 2)));
assert(mirroredEW.x < 0, "regression guard: atan2(-cos, -sin) points LEFT when facing east");

const lakeYaw = bearing(POS.lakeMercy.x - spawnX, POS.lakeMercy.z - spawnZ);
const lakeOnMap = displayPoint(POS.lakeMercy.x, POS.lakeMercy.z, spawnX, spawnZ);
const lakeDir = { x: lakeOnMap.x - here.x, y: lakeOnMap.y - here.y };
const lakeNeedle = needleVector(screenNeedleAngle(lakeYaw));
assert(
  dot(lakeNeedle, lakeDir) > 0,
  "needle must point toward Lake Mercy when facing it"
);

function walkForward(px, pz, yaw, dist) {
  const f = headingVector(yaw);
  return {
    x: px + f.x * dist,
    z: pz + f.z * dist
  };
}

function contentShift(px, pz, yaw, dist) {
  const next = walkForward(px, pz, yaw, dist);
  return displayPoint(px, pz, next.x, next.z);
}

function assertOppositeNeedle(yaw, label) {
  const shift = contentShift(spawnX, spawnZ, yaw, 80);
  const delta = { x: shift.x - here.x, y: shift.y - here.y };
  const n = needleVector(screenNeedleAngle(yaw));
  assert(
    dot(n, delta) < 0,
    `${label}: forward walk must scroll the map opposite the needle`
  );
}

assertOppositeNeedle(0, "facing north");
assertOppositeNeedle(Math.PI, "facing south at spawn");
assertOppositeNeedle(Math.PI / 2, "facing east");
assertOppositeNeedle(-Math.PI / 2, "facing west");

function assertOppositeCardinal(dx, dz, label) {
  const before = displayPoint(landmark.x, landmark.z, spawnX, spawnZ);
  const after = displayPoint(landmark.x, landmark.z, spawnX + dx, spawnZ + dz);
  const screenDelta = { x: after.x - before.x, y: after.y - before.y };
  const move = chartStep(dx, dz);
  assert(
    dot(screenDelta, move) < 0,
    `${label}: fixed landmark must scroll opposite player movement (dot=${dot(screenDelta, move)})`
  );
}

assertOppositeCardinal(0, -80, "walk north (-Z)");
assertOppositeCardinal(0, 80, "walk south (+Z)");
assertOppositeCardinal(80, 0, "walk east (+X)");
assertOppositeCardinal(-80, 0, "walk west (-X)");

const northWalk = contentShift(spawnX, spawnZ, 0, 80);
const eastWalk = contentShift(spawnX, spawnZ, Math.PI / 2, 80);
assert(northWalk.y > here.y, "walking north slides prior position down on screen");
assert(eastWalk.x < here.x, "walking east slides prior position left on screen");

const ahead = displayPoint(spawnX, spawnZ - 120, spawnX, spawnZ);
assert(ahead.y < here.y, "a point north of the player sits above them when north-up");

const aheadAfterLeft = displayPoint(spawnX, spawnZ - 120, spawnX, spawnZ);
assert(
  Math.abs(aheadAfterLeft.x - ahead.x) < 1e-6,
  "look change must not slide the chart; only the needle rotates"
);

console.log(JSON.stringify({
  north,
  south,
  east,
  west,
  yawUp,
  yawDown,
  spawnNeedle: screenNeedleAngle(spawnYaw),
  faceHouseYaw,
  faceHouseNeedle,
  lakeYaw,
  ranchDir,
  houseDir,
  lakeDir,
  ranchView,
  northWalk,
  eastWalk,
  ahead,
  aheadAfterLeft
}, null, 2));
console.log("PASS");
