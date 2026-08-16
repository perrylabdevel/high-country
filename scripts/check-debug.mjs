import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SPEED_STEPS, LOOK_STEPS, stepValue, debugBlocksGame } from "../src/debug.js";
import { lookingAtStructure } from "../src/buildings/lookingAt.js";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

assert(stepValue(SPEED_STEPS, 1, 1) === 2, "speed up from 1× is 2×");
assert(stepValue(SPEED_STEPS, 2, 1) === 4, "speed up from 2× is 4×");
assert(stepValue(SPEED_STEPS, 4, 1) === 8, "speed up from 4× is 8×");
assert(stepValue(SPEED_STEPS, 8, 1) === 16, "speed up from 8× is 16×");
assert(stepValue(SPEED_STEPS, 16, 1) === 16, "speed does not pass 16×");
assert(stepValue(SPEED_STEPS, 1, -1) === 0.5, "speed down from 1× is 0.5×");
assert(stepValue(SPEED_STEPS, 0.5, -1) === 0.5, "speed does not pass 0.5×");
assert(stepValue(LOOK_STEPS, 1, 1) === 2, "look up from 1× is 2×");
assert(stepValue(LOOK_STEPS, 1, -1) === 0.5, "look down from 1× is 0.5×");

assert(debugBlocksGame(true) === true, "open debug blocks game input");
assert(debugBlocksGame(false) === false, "closed debug does not block game input");
assert(debugBlocksGame() === false, "missing open does not block game input");

const root = dirname(fileURLToPath(import.meta.url));
const debugSrc = readFileSync(join(root, "../src/debug.js"), "utf8");
assert(debugSrc.includes("isOpen"), "createDebug exposes isOpen");
assert(debugSrc.includes("exitPointerLock"), "opening debug exits pointer lock");
assert(/\bopen\b/.test(debugSrc), "createDebug exposes open");

const inputSrc = readFileSync(join(root, "../src/input.js"), "utf8");
assert(inputSrc.includes("isBlocked"), "input skips game keys while debug is open");
assert(inputSrc.includes("KeyF"), "F toggles fly camera");
assert(inputSrc.includes("flyTap"), "fly tap is a consume action");
assert(inputSrc.includes("ControlLeft"), "Ctrl descends in fly mode");

const playerSrc = readFileSync(join(root, "../src/player.js"), "utf8");
assert(playerSrc.includes('"fly"'), "player has a fly camera mode");
assert(playerSrc.includes("toggleFly"), "player exposes toggleFly");
assert(playerSrc.includes("FLY_CEILING"), "fly camera has an altitude ceiling");

const barn = { name: "barn", x: 0, y: 0, z: 0, w: 16, d: 12, eave: 8 };
const house = { name: "ranchHouse", x: 0, y: 0, z: 40, w: 22, d: 12, eave: 6 };

const southOfBarn = lookingAtStructure(
  [barn, house],
  { x: 0, y: 1.62, z: 30 },
  { x: 0, y: 0, z: -1 }
);
assert(southOfBarn?.name === "barn", `looking north from south of the barn should hit barn, got ${southOfBarn?.name}`);

const lookingAway = lookingAtStructure(
  [barn],
  { x: 0, y: 1.62, z: 30 },
  { x: 0, y: 0, z: 1 }
);
assert(lookingAway === null, "looking away from the barn must not name it");

const nearer = lookingAtStructure(
  [barn, house],
  { x: 0, y: 1.62, z: 55 },
  { x: 0, y: 0, z: -1 }
);
assert(nearer?.name === "ranchHouse", `looking north past the house should hit ranchHouse first, got ${nearer?.name}`);

const grouped = {
  name: "bunkhouse",
  userData: { name: "bunkhouse", x: 8, y: 0, z: 0, w: 10, d: 8, eave: 4 }
};
const fromGroup = lookingAtStructure(
  [grouped],
  { x: 8, y: 1.62, z: 20 },
  { x: 0, y: 0, z: -1 }
);
assert(fromGroup === grouped, "lookingAtStructure must accept kit Groups via userData");

const labelSrc = readFileSync(join(root, "../src/dev/structureLabels.js"), "utf8");
assert(labelSrc.includes('getElementById("hud")'), "structure labels mount under #hud so capture mode hides them");

console.log(JSON.stringify({ SPEED_STEPS, LOOK_STEPS }, null, 2));
console.log("PASS");


