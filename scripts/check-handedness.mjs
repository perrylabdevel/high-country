/**
 * Locks the world axes to the chart axes.
 *
 * The long-running "needle spins the wrong way" bug was not in the needle: the world
 * was built with north = +Z, which in a right-handed Y-up renderer puts +X on your
 * LEFT when you look north. The 3D view was a mirror of the minimap, so turning the
 * camera one way swung the needle the other. Every candidate needle formula was wrong
 * on one axis or the other, and no amount of tuning could reconcile them.
 *
 * The invariant below is the one that matters: whichever side of you a landmark sits
 * on in the 3D view, it must sit on that same side of the needle on the chart.
 */
import { POS, headingVector, WORLD } from "../src/map.js";
import { displayPoint } from "../src/minimap.js";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

/**
 * Screen-right of the camera, in world XZ. Three.js builds its lookAt basis with
 * right = forward × up, which with up = +Y reduces to (-f.z, f.x).
 */
function cameraRight(yaw) {
  const f = headingVector(yaw);
  return { x: -f.z, z: f.x };
}

/** > 0 when the target appears right of centre in the rendered 3D view. */
function sideInView(px, pz, yaw, target) {
  const r = cameraRight(yaw);
  return (target.x - px) * r.x + (target.z - pz) * r.z;
}

/**
 * > 0 when the target sits right of the needle on the chart. Chart space is y-down,
 * the needle points along (sin yaw, -cos yaw), so its right is (cos yaw, sin yaw).
 * Measured from the needle's own display position — the view window clamps to the
 * sheet's edges when the player rides near one, so the needle is not always at the
 * display centre.
 */
function sideOfNeedle(px, pz, yaw, target) {
  const p = displayPoint(target.x, target.z, px, pz);
  const c = displayPoint(px, pz, px, pz);
  return (p.x - c.x) * Math.cos(yaw) + (p.y - c.y) * Math.sin(yaw);
}

// The renderer's basis is not negotiable, so pin it down first.
const northRight = cameraRight(0);
assert(
  Math.abs(northRight.x - 1) < 1e-9 && Math.abs(northRight.z) < 1e-9,
  `facing north, screen-right must be +X (east), got (${northRight.x}, ${northRight.z})`
);
const eastRight = cameraRight(Math.PI / 2);
assert(
  Math.abs(eastRight.z - 1) < 1e-9 && Math.abs(eastRight.x) < 1e-9,
  `facing east, screen-right must be +Z (south), got (${eastRight.x}, ${eastRight.z})`
);

// North must be -Z, or the territory renders mirrored against the chart.
assert(headingVector(0).z < 0, "north must be -Z");
assert(headingVector(Math.PI / 2).x > 0, "east must be +X");

// The real test, across vantage points, headings, and landmarks.
const places = ["silverCreek", "ironValley", "westernRange", "lakeMercy", "badlands", "northernPines", "fortGrant", "mines"];
const vantages = [POS.ranch, POS.silverCreek, POS.lakeMercy, POS.badlands];
const headings = [0, 0.7, Math.PI / 2, 2.4, Math.PI, -2.1, -Math.PI / 2, -0.4];

let compared = 0;
for (const from of vantages) {
  for (const yaw of headings) {
    for (const id of places) {
      const target = POS[id];
      if (target === from) {
        continue;
      }
      const view = sideInView(from.x, from.z, yaw, target);
      const chart = sideOfNeedle(from.x, from.z, yaw, target);
      if (Math.abs(view) < 1e-6 || Math.abs(chart) < 1e-6) {
        continue;
      }
      assert(
        Math.sign(view) === Math.sign(chart),
        `from ${from.name} at yaw ${yaw.toFixed(2)}: ${target.name} is ` +
        `${view > 0 ? "right" : "left"} in the 3D view but ${chart > 0 ? "right" : "left"} ` +
        `of the needle on the chart — world and map are mirrored`
      );
      compared += 1;
    }
  }
}

assert(compared >= 150, `expected a broad sweep of comparisons, only made ${compared}`);

// Spot-check against the geography the concept art actually shows.
const ranch = POS.ranch;
assert(sideInView(ranch.x, ranch.z, 0, POS.silverCreek) > 0, "facing north from the ranch, Silver Creek is on the right");
assert(sideInView(ranch.x, ranch.z, 0, POS.westernRange) < 0, "facing north from the ranch, the Western Range is on the left");
assert(sideInView(ranch.x, ranch.z, Math.PI, POS.silverCreek) < 0, "facing south from the ranch, Silver Creek is on the left");

// Walking north must decrease Z and slide the chart contents down.
const step = headingVector(0);
assert(step.z < 0, "walking north must decrease Z");
const before = displayPoint(POS.lakeMercy.x, POS.lakeMercy.z, ranch.x, ranch.z);
const after = displayPoint(POS.lakeMercy.x, POS.lakeMercy.z, ranch.x + step.x * 200, ranch.z + step.z * 200);
assert(after.y > before.y, "walking north must slide the chart contents down");

console.log(JSON.stringify({
  world: { width: WORLD.width, depth: WORLD.depth },
  north: headingVector(0),
  east: headingVector(Math.PI / 2),
  screenRightFacingNorth: northRight,
  comparisons: compared
}, null, 2));
console.log("PASS");
