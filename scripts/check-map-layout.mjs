import { POS, WORLD, mapToWorld, overlayPoint } from "../src/map.js";
import { lookCanvasAngle } from "../src/minimap.js";

function needleVector(angle) {
  // ctx.rotate(θ) sends the chevron tip at local +X to (cos θ, sin θ) on a y-down canvas.
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

// Compass helpers so these read as geography, not as z-sign trivia. North is -Z.
const isNorthOf = (a, b) => a.z < b.z;
const isSouthOf = (a, b) => a.z > b.z;
const isEastOf = (a, b) => a.x > b.x;
const isWestOf = (a, b) => a.x < b.x;

assert(WORLD.width / WORLD.depth === 4000 / 5000, "world aspect should be 8:10");
assert(isWestOf(POS.ranch, POS.silverCreek), "ranch should be west of Silver Creek");
assert(isSouthOf(POS.ranch, POS.silverCreek), "ranch should be south of Silver Creek");
assert(isNorthOf(POS.lakeMercy, POS.silverCreek), "Lake Mercy should be north of Silver Creek");
assert(isNorthOf(POS.burn, POS.lakeMercy), "burn should be north of the lake");
assert(isWestOf(POS.northernPines, POS.lakeMercy), "Northern Pines should sit west of the lake");
assert(isEastOf(POS.ironValley, POS.silverCreek), "Iron Valley should be east");
assert(isWestOf(POS.westernRange, POS.ranch), "Western Range should be west of the ranch");
assert(isSouthOf(POS.badlands, POS.ranch), "badlands should be south of the ranch");
assert(isEastOf(POS.elPaso, POS.ranch) && isSouthOf(POS.elPaso, POS.ranch), "El Paso Verde should be southeast");
assert(isEastOf(POS.tribal, POS.ranch) && isSouthOf(POS.tribal, POS.ranch), "Tribal Lands should be southeast of ranch");
assert(isWestOf(POS.fortGrant, POS.barrett), "Fort Grant should be west of Barrett Ranch");

const ranch = mapToWorld(0.4, 0.44);
assert(Math.abs(ranch.x - POS.ranch.x) < 0.01, "ranch world position should follow map UV");

const pip = overlayPoint(POS.ranch.x, POS.ranch.z);
assert(pip.left > 0 && pip.left < 1, "ranch pip stays on the map");
assert(pip.top > 0 && pip.top < 1, "ranch pip stays on the map");
const north = overlayPoint(POS.burn.x, POS.burn.z);
assert(north.top < pip.top, "burn marker should sit above the ranch on the overlay");
const east = overlayPoint(POS.ironValley.x, POS.ironValley.z);
assert(east.left > pip.left, "Iron Valley marker should sit right of the ranch");
const northNeedle = needleVector(lookCanvasAngle(0));
const eastNeedle = needleVector(lookCanvasAngle(Math.PI / 2));
const southNeedle = needleVector(lookCanvasAngle(Math.PI));
assert(Math.abs(northNeedle.x) < 1e-6 && northNeedle.y < 0, "facing north points up the chart");
assert(eastNeedle.x > 0 && Math.abs(eastNeedle.y) < 1e-6, "facing east points right on the chart");
assert(Math.abs(southNeedle.x) < 1e-6 && southNeedle.y > 0, "facing south points down the chart");

console.log(JSON.stringify({
  miles: { eastWest: WORLD.width / 500, northSouth: WORLD.depth / 500 },
  ranch: { x: POS.ranch.x, z: POS.ranch.z },
  silverCreek: { x: POS.silverCreek.x, z: POS.silverCreek.z },
  lake: { x: POS.lakeMercy.x, z: POS.lakeMercy.z },
  burn: { x: POS.burn.x, z: POS.burn.z }
}, null, 2));
console.log("PASS");
