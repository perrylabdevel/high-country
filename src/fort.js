import * as THREE from "three/webgpu";
import { POS } from "./map.js";
import { structure, wallX, gableRoof, doorLeaf, glazing, collide } from "./buildings/kit.js";
import { face, mate, anchorsOf } from "./buildings/anchors.js";
import { makeTexturedMat } from "./materials/texturedMat.ts";
import { addClearingSpot, addFenceSpots, addPropSpot, clearPropSpots } from "./propSpots.js";

/**
 * Abandoned Fort Grant: the post inside the walls (the walls and gateway are
 * built in landmarks.js), its outbuildings, and what the army left behind.
 *
 * A frontier post of the 1870s: a parade ground with the flagstaff and the
 * salute gun facing the gate, the barracks along the south wall, the stone
 * storehouse and the commissary on the west and east walls, the well, and
 * the post cemetery outside the east wall. It stands 64 m south of the stage
 * road, gate toward it, on a spur trail (map.js fortSpur). It used to stand
 * ON the stage road's bend, which ran in through the north wall and out the
 * south-west corner, and its buildings were a door-less stone cube and a flat
 * box.
 *
 * Coordinates are fort-local metres (dx east, dz south of POS.fortGrant).
 * Walls: inner faces x +-13.4, z +-11.4; gateway x +-3.2 in the north wall.
 * The gate corridor (x +-3.2 from the gate to z -4) is kept clear: the nav
 * graph threads it (NAV_GATES) and check:approaches proves it open.
 */

const T = 0.22;
const GLASS = new THREE.MeshStandardNodeMaterial({ color: 0xb8c4b4, transparent: true, opacity: 0.42, roughness: 0.35 });

function mat(color, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness: 0.88, ...extra });
}

/**
 * A single-storey post building: four kit walls, a door in the front wall
 * (local +Z) hanging open, window openings either side, a gable roof, and
 * colliders with the door gap cut.
 */
function postBuilding(group, fort, { name, dx, dz, yaw, w, d, eave, body, roof, trim, windows = [] }) {
  const x = fort.x + dx;
  const z = fort.z + dz;
  const st = structure({ name, x, z, yaw, w, d, eave, foundation: true, material: body });
  const doorOpening = { x: 0, w: 0.95, h: 2.1, fromFloor: 0 };
  const windowOpenings = windows.map((wx) => ({ x: wx, w: 0.8, h: 0.9, fromFloor: 1.0 }));
  const front = wallX({ length: w, extend: true, height: eave, thickness: T, material: body, openings: [doorOpening, ...windowOpenings] });
  mate(front, "wallSide", face(st, "front"));
  const back = wallX({ length: w, extend: true, height: eave, thickness: T, material: body });
  mate(back, "wallSide", face(st, "back"));
  for (const side of ["left", "right"]) {
    const wall = wallX({ length: d, extend: true, height: eave, thickness: T, material: body });
    mate(wall, "wallSide", face(st, side));
  }
  mate(gableRoof({ w, d, pitch: 0.55, overhang: 0.35, eave, material: roof }), "base", anchorsOf(st).get("wallTop"));
  // Abandoned: the door stands wide open on its hinge.
  const leaf = doorLeaf({ width: 0.9, height: 2.05, thickness: 0.08, hinge: -0.48, swing: Math.PI * 0.62, material: trim });
  mate(leaf, "frame", anchorsOf(front).get("opening.0"), { offset: { x: 0, y: 0, z: T / 2 } });
  // Window glass, dusty and dull.
  (front.userData.openings || []).forEach((o, i) => {
    if ((o.fromFloor || 0) > 0.5) {
      mate(glazing({ width: o.w, height: o.h, thickness: 0.06, material: GLASS }), "frame", anchorsOf(front).get(`opening.${i}`), { offset: { x: 0, y: 0, z: -T / 2 } });
    }
  });
  collide(st, x, z, yaw, [
    { x: 0, z: d / 2, halfX: w / 2, halfZ: T / 2, openings: [{ x: 0, w: 1.2 }] },
    { x: 0, z: -d / 2, halfX: w / 2, halfZ: T / 2 },
    { x: w / 2, z: 0, halfX: T / 2, halfZ: d / 2 },
    { x: -w / 2, z: 0, halfX: T / 2, halfZ: d / 2 }
  ]);
  group.add(st);
  return st;
}

export function createFort(scene, maps = {}) {
  clearPropSpots("fort");
  const group = new THREE.Group();
  const siding = maps?.siding
    ? makeTexturedMat(maps.siding, { tiling: 1.4, tint: 0xa8845c, gain: 1.0, rough: 0.94 })
    : mat(0x6b4226);
  const pale = maps?.siding
    ? makeTexturedMat(maps.siding, { tiling: 1.4, tint: 0x9a8f7c, gain: 0.95, rough: 0.96 })
    : mat(0x9a8a74);
  const dark = maps?.wood
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xcfa06a, gain: 1.6, rough: 0.94 })
    : mat(0x6b4226);
  const stone = maps?.rock
    ? makeTexturedMat(maps.rock, { tiling: 2.2, tint: 0xe0d8c8, gain: 1.35 })
    : mat(0xa89e90);
  const roof = maps?.roof
    ? makeTexturedMat(maps.roof, { tiling: 1.4, tint: 0xa89070, gain: 1.1 })
    : mat(0x4a3020);

  const fort = POS.fortGrant;

  // Barracks along the south wall, door onto the parade ground (north).
  // yaw PI turns the kit front (+Z) to face -Z.
  postBuilding(group, fort, { name: "fortBarracks", dx: -1, dz: 7.6, yaw: Math.PI, w: 14, d: 6, eave: 3.0, body: siding, roof, trim: dark, windows: [-4.5, -2.4, 2.4, 4.5] });
  // Stone storehouse on the west wall, door east; commissary on the east
  // wall, door west. Their long sides run along the walls.
  postBuilding(group, fort, { name: "fortStorehouse", dx: -10.4, dz: -4, yaw: Math.PI / 2, w: 7, d: 5, eave: 2.7, body: stone, roof, trim: dark });
  postBuilding(group, fort, { name: "fortCommissary", dx: 10.4, dz: -3.5, yaw: -Math.PI / 2, w: 7, d: 5, eave: 2.9, body: pale, roof, trim: dark, windows: [-2.2, 2.2] });

  // The parade ground is packed earth, not a meadow: grass kept to the
  // margins by the walls and buildings.
  for (const [cx, cz, r] of [[0, -1, 7.5], [-5, -5, 4], [5, -5, 4], [0, -9, 3.5]]) {
    addClearingSpot("fort", fort.x + cx, fort.z + cz, r);
  }
  const spot = (kind, dx, dz, yaw, extra = {}) => addPropSpot("fort", { kind, x: fort.x + dx, z: fort.z + dz, yaw, collide: true, ...extra });
  // Parade ground: flagstaff, the salute gun trained on the gate, the well.
  spot("flagpole", 0, 1, 0);
  spot("cannon", 5.5, -1.5, Math.PI / 2);
  spot("cannonballs", 7.2, -0.4, 0.2);
  spot("well", -5.5, 1.8, 0.3);
  // Squatters' fire since the army left, off the gate corridor.
  spot("campfire_ring", -5.2, -6.5, 1.1, { collide: false });
  // Stores left at the storehouse and commissary doors.
  spot("rifle_crates", -6.6, -2.6, Math.PI / 2 + 0.1);
  spot("barrel", -6.9, -6.0, 0.3);
  spot("crate", 7.0, -5.8, 0.25);
  spot("barrel", 7.3, -1.4, 1.4, { collide: true });
  spot("saddle_rack", 4.6, 3.3, 0);
  // Horses tied beside the gate, not in it (a rail across the corridor once
  // barred the way in): the inner north wall, east of the gateway.
  spot("hitch_rail_short", 8.5, -10.4, 0);
  // Fallen coping stones at the south-west corner and outside the west wall.
  spot("rubble_pile", -11, 9.7, Math.PI / 2, { collide: false });
  spot("rubble_pile", -15.8, 2, Math.PI / 2 + 0.2, { collide: false });
  // Sentry box outside the gate, facing the road.
  spot("sentry_box", 6.2, -13.8, Math.PI);

  // Outside: the escort wagon abandoned on the east side, and the post
  // cemetery beyond it inside a rail fence, heads to the west.
  spot("army_wagon", 20, -9, 0.42);
  const cem = { x: fort.x + 24, z: fort.z + 2 };
  addFenceSpots("fort", cem.x - 4, cem.z - 5, cem.x + 5, cem.z - 5, 3, { collide: true });
  addFenceSpots("fort", cem.x + 5, cem.z - 5, cem.x + 5, cem.z + 7, 4, { collide: true });
  addFenceSpots("fort", cem.x + 5, cem.z + 7, cem.x - 4, cem.z + 7, 3, { collide: true });
  // West side open toward the fort, one post standing at each end.
  addFenceSpots("fort", cem.x - 4, cem.z + 7, cem.x - 4, cem.z + 4, 1, { endPost: true, collide: true });
  for (const [gx, gz] of [[-1.5, -2.5], [-1.5, 0.2], [-1.5, 2.9], [2.2, -2.5], [2.2, 0.2]]) {
    spot("grave_trail", cem.x + gx, cem.z + gz, 0, { collide: false });
  }

  scene.add(group);
  return { group, fort };
}
