/**
 * Ranch structures, rebuilt on the building kit (src/buildings/kit.js).
 *
 * All dimensions in meters. Each structure is built in its local frame and
 * added to a parent Group carrying rotation.y = yaw. Grounding uses footing()
 * (four-corner, not single-point). Roofs are real gable/shed primitives, never
 * square pyramids. Doors and windows are human-scale with head heights.
 */
import * as THREE from "three/webgpu";
import { color } from "three/tsl";
import { ranchInterior, ranchRemodel } from "./buildings/ranchRemodel.js";
import { heightAt, woodTexture, shingleTexture, rockTexture } from "./world.js";
import { addBoxCollider, addCylinderCollider, addDeckPlatform, addOrientedBoxCollider } from "./collision.js";
import { POS } from "./map.js";
import {
  structure,
  footing,
  gableRoof,
  hipRoof,
  wallX,
  doorLeaf,
  porch,
  chimney,
  glazing,
  collide,
  steps,
  block,
  grounded,
  lowestSeat,
  floorDeck
} from "./buildings/kit.js";
import { face, mate, anchorsOf, defineAnchor } from "./buildings/anchors.js";
import { registerAperture } from "./buildings/apertures.js";
import { makeTexturedMat } from "./materials/texturedMat.ts";
import { addFenceSpots, addMountSpot, addPropSpot, clearPropSpots } from "./propSpots.js";

/**
 * Ranch house storeys in metres above its footing, and the hall stair in
 * house coordinates (x east, z south of the house origin). Shared with the
 * Blender interior (scripts/blender-ranch/interior.py reads them from
 * interior-layout.json) and check:ranch-interior.
 */
export const RANCH_HOUSE = {
  FLOOR: 0.13, // floorboard top
  CEIL: 2.7, // ground-floor ceiling; its slab is the upstairs floor
  UPPER: 2.8, // upstairs floorboard top
  UPPER_CEIL: 5.45,
  // 14 risers climbing north along the hall side of the east partition.
  // `well` is the ceiling opening [x0, x1, z0, z1] over the upper flight.
  STAIR: { x0: 4.09, x1: 5.09, zTop: 3.02, zBottom: 6.4, risers: 14, well: [3.95, 5.09, 3.02, 5.9] }
};

function groundY(x, z) {
  return heightAt(x, z);
}


// A porch is built as geometry only: `porch()` lays a deck slab but nothing
// told the collision model it is standable, so grounding fell through to
// terrain height and anyone on a porch stood buried in the boards (the ranch
// front porch put Harlan 0.096 m under its deck). Walk a placed structure and
// register every porch's deck, in world space, from the footprint the part
// published. Generic on purpose: any porch added later is grounded for free.
function registerPorchDecks(root) {
  root.updateMatrixWorld(true);
  const center = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  let registered = 0;
  root.traverse((node) => {
    const d = node.userData;
    if (d?.role !== "porch" || d.width == null) return;
    // The deck spans the porch's full width and runs from the wall (local z 0)
    // out to `depth`, with its surface at `deckTop`.
    center.set(0, d.deckTop, d.deckCenterZ).applyMatrix4(node.matrixWorld);
    node.matrixWorld.decompose(new THREE.Vector3(), quat, scale);
    euler.setFromQuaternion(quat, "YXZ");
    // The collision frame is the inverse of three's rotation.y — same
    // convention addDeckPlatform is given for the boardwalks.
    addDeckPlatform(
      center.x, center.z,
      (d.width * scale.x) / 2, (d.depth * scale.z) / 2,
      -euler.y, center.y
    );
    registered += 1;
  });
  return registered;
}

export function createRanch(maps = {}) {
  const ox = POS.ranch.x;
  const oz = POS.ranch.z;
  clearPropSpots("ranch");
  const hasMaps = Boolean(maps?.wood && maps?.siding && maps?.roof && maps?.rock);
  const wood = hasMaps
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xf0dcc0, gain: 1.9 })
    : new THREE.MeshStandardNodeMaterial({ map: woodTexture(), roughness: 0.86, color: 0xc4a574 });
  const darkWood = hasMaps
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xcfa06a, gain: 1.6, rough: 0.94 })
    : new THREE.MeshStandardNodeMaterial({ map: woodTexture(), roughness: 0.9, color: 0x6b4226 });

  // Exterior cladding. `wood` is a FLOOR texture — short planks with staggered
  // butt joints — and tiling it across a wall is what made the walls read as a
  // repeating grid: the butt joints and plank rows are regular patterns baked
  // into the image, which no amount of warping, rotating or stochastic
  // sampling can remove. `siding` is long continuous boards. Floors, decks and
  // furniture keep `wood`, which is correct for them.
  const siding = hasMaps
    ? makeTexturedMat(maps.siding, { tiling: 1.4, tint: 0xd8c4a4, gain: 1.15 })
    : new THREE.MeshStandardNodeMaterial({ map: woodTexture(), roughness: 0.86, color: 0xc4a574 });
  const darkSiding = hasMaps
    ? makeTexturedMat(maps.siding, { tiling: 1.4, tint: 0xa8845c, gain: 1.0, rough: 0.94 })
    : new THREE.MeshStandardNodeMaterial({ map: woodTexture(), roughness: 0.9, color: 0x6b4226 });
  const roof = hasMaps
    ? makeTexturedMat(maps.roof, { tiling: 1.4, tint: 0xc9a87f, gain: 1.35 })
    : new THREE.MeshStandardNodeMaterial({ map: shingleTexture(), roughness: 0.88, color: 0x4a3020 });
  const stone = hasMaps
    ? makeTexturedMat(maps.rock, { tiling: 2.2, tint: 0xe0d8c8, gain: 1.35 })
    : new THREE.MeshStandardNodeMaterial({ map: rockTexture(), roughness: 0.95, color: 0x8a8478 });
  // Glass must actually pass light: an opaque pane turns every window into a
  // lamp shade — from inside, the yard reads as a flat glowing panel. Real
  // tint + transparency keeps a day-lit sheen while the world shows through
  // both ways; the faint emissive stays for dusk warmth.
  const glass = new THREE.MeshStandardNodeMaterial({
    color: 0xcfe0d8,
    transparent: true,
    opacity: 0.32,
    emissive: 0x6a4018,
    emissiveIntensity: 0.12,
    roughness: 0.15,
    metalness: 0.0
  });

  const group = new THREE.Group();

  // ---------------- Ranch house (L-plan: main block + kitchen ell) ----------------
  // Two kit structures sharing one seat height so the floors line up. The main
  // block is two-story; the ell is one-and-a-half. Local frames are centered on
  // each block, so all offsets below are relative to that block's center.
  const houseX = ox;
  const houseZ = oz - 8;
  const T = 0.22;

  const MW = 22.5;   // main block width  (x -10.5..12 in house coords)
  const MD = 12.35;  // main block depth  (z -5.35..7)
  const MCX = 0.75;  // main block center in house coords
  const MCZ = 0.825;
  const MEAVE = 6.2; // two-story eave

  const EW = 12;     // ell width  (x 4..16)
  const ED = 11.15;  // ell depth  (z -16.5..-5.35)
  const ECX = 10;
  const ECZ = -10.925;
  const EEAVE = 4.6; // one-and-a-half story eave

  const { FLOOR, CEIL, UPPER, UPPER_CEIL, STAIR } = RANCH_HOUSE;

  // One footing over the union of both footprints, so the ell cannot step off
  // the main block on a slope.
  const seat = footing(houseX + 2.75, houseZ - 4.75, 26.5, 23.5, 0);

  const main = structure({
    name: "ranchHouse", habitable: true,
    x: houseX + MCX, z: houseZ + MCZ, yaw: 0,
    w: MW, d: MD, eave: MEAVE, foundation: true, material: stone
  });
  const ell = structure({
    name: "ranchEll", habitable: true,
    x: houseX + ECX, z: houseZ + ECZ, yaw: 0,
    w: EW, d: ED, eave: EEAVE, foundation: true, material: stone
  });
  for (const [blk, eave] of [[main, MEAVE], [ell, EEAVE]]) {
    blk.position.y = seat.y;
    blk.userData.placementY = seat.y;
    blk.userData.wallTop = seat.y + eave;
  }
  // Two storeys: the camera ducks under whichever ceiling is over the feet
  // (interiorCeilingAt), and the stairwell opens the ground floor's.
  main.userData.storeys = {
    ceiling: CEIL - 0.08,
    upperFloor: UPPER,
    upperCeiling: UPPER_CEIL,
    well: [STAIR.well[0] - MCX, STAIR.well[1] - MCX, STAIR.well[2] - MCZ, STAIR.well[3] - MCZ]
  };

  // Main block shell. The north wall stops where the ell joins (house x = 4).
  const mSouth = wallX({
    length: MW, extend: true, height: MEAVE, thickness: T, material: siding,
    openings: [
      { x: -MCX, w: 0.92, h: 2.1, fromFloor: 0 },
      { x: -6.4 - MCX, w: 1.35, h: 1.5, fromFloor: 0.9 },
      { x: 6.6 - MCX, w: 1.35, h: 1.5, fromFloor: 0.9 },
      { x: -6.4 - MCX, w: 1.25, h: 1.4, fromFloor: CEIL + 0.9 },
      { x: 6.6 - MCX, w: 1.25, h: 1.4, fromFloor: CEIL + 0.9 }
    ]
  });
  mate(mSouth, "wallSide", face(main, "front"));

  const mNorthLen = 4 - -10.5;
  const mNorth = wallX({
    length: mNorthLen, extend: true, height: MEAVE, thickness: T, material: siding,
    openings: [
      { x: -4, w: 1.25, h: 1.4, fromFloor: CEIL + 0.9 },
      // House x -5.2: clear of the chimney breast in the bedroom behind it.
      { x: 1.95, w: 1.25, h: 1.4, fromFloor: CEIL + 0.9 }
    ]
  });
  mate(mNorth, "wallSide", face(main, "back", { along: (-10.5 + 4) / 2 - MCX }));

  const mWest = wallX({
    length: MD, extend: true, height: MEAVE, thickness: T, material: siding,
    openings: [
      { x: -(2.2 - MCZ), w: 1.3, h: 1.5, fromFloor: 0.9 },
      { x: -(-3.2 - MCZ), w: 1.3, h: 1.5, fromFloor: 0.9 }
    ]
  });
  mate(mWest, "wallSide", face(main, "left"));

  const mEast = wallX({
    length: MD, extend: true, height: MEAVE, thickness: T, material: siding,
    openings: [
      { x: 2.8 - MCZ, w: 1.3, h: 1.5, fromFloor: 0.9 },
      // Second-floor windows on the east wall: the audit camera approaches
      // from the north-east, and without them the two-story main block read
      // as a single story (R1).
      { x: 2.8 - MCZ, w: 1.25, h: 1.4, fromFloor: CEIL + 0.9 }
    ]
  });
  mate(mEast, "wallSide", face(main, "right"));

  // Ell shell. Its north end (house z = -5.35) is closed only east of the main
  // block; west of that the two blocks share the opening.
  const eWest = wallX({ length: ED, extend: true, height: EEAVE, thickness: T, material: siding });
  mate(eWest, "wallSide", face(ell, "left"));
  const eEast = wallX({
    length: ED, extend: true, height: EEAVE, thickness: T, material: siding,
    openings: [{ x: -11.5 - ECZ, w: 1.25, h: 1.4, fromFloor: 0.9 }]
  });
  mate(eEast, "wallSide", face(ell, "right"));
  const eSouth = wallX({
    length: EW, extend: true, height: EEAVE, thickness: T, material: siding,
    // Beside the kitchen chimney, not behind it.
    openings: [{ x: -(13.0 - ECX), w: 1.25, h: 1.4, fromFloor: 0.9 }]
  });
  mate(eSouth, "wallSide", face(ell, "back"));
  const eJoinLen = 16 - 12;
  const eJoin = wallX({ length: eJoinLen, extend: true, height: EEAVE, thickness: T, material: siding });
  mate(eJoin, "wallSide", face(ell, "front", { along: (12 + 16) / 2 - ECX }));

  // Roofs — hips, both seated on their own eave.
  mate(hipRoof({ w: MW, d: MD, pitch: 0.5, overhang: 0.45, eave: MEAVE, material: roof }), "base", anchorsOf(main).get("wallTop"));
  // No overhang where the ell butts the main block: a full
  // 0.45 m eave there ran through the upstairs rooms at 4.6 m.
  mate(hipRoof({ w: EW, d: ED - 0.45, pitch: 0.5, overhang: 0.45, eave: EEAVE, material: roof }), "base", anchorsOf(ell).get("wallTop"), { offset: { z: -0.225 } });

  // Floors and ceilings, seated on footing. The floor spans the full
  // footprint — a floor inset from the footprint leaves a strip of exposed
  // terrain between its edge and the wall's inner face. The ranch pad puts
  // the terrain at footing + ~0.10 m, so the kit slab (top 0.11) is only the
  // underlay: the Blender floorboards (ranchInterior) are the walking surface
  // at FLOOR, and check:ranch-interior keeps the terrain below them.
  for (const [blk, w, d] of [[main, MW, MD], [ell, EW, ED]]) {
    mate(
      block({ w, h: 0.11, d, material: wood, role: "floor", extra: { top: 0.11 } }),
      "base",
      anchorsOf(blk).get("footing")
    );
  }
  mate(
    block({ w: EW - 0.4, h: 0.16, d: ED - 0.4, material: wood, role: "ceiling", extra: { height: CEIL } }),
    "base",
    anchorsOf(ell).get("footing"),
    { offset: { y: CEIL - 0.08 } }
  );
  // The main block's ceiling is the upstairs floor, open over the stair.
  // Pieces in house coords [x0, x1, z0, z1] around the stairwell.
  const [wellX0, wellX1, wellZ0, wellZ1] = STAIR.well;
  for (const [x0, x1, z0, z1] of [
    [-10.3, wellX0, -5.15, 6.8],
    [wellX0, 11.8, -5.15, wellZ0],
    [wellX1, 11.8, wellZ0, 6.8],
    [wellX0, wellX1, wellZ1, 6.8]
  ]) {
    mate(
      block({ w: x1 - x0, h: 0.16, d: z1 - z0, material: wood, role: "ceiling", extra: { height: CEIL } }),
      "base",
      anchorsOf(main).get("footing"),
      { offset: { x: (x0 + x1) / 2 - MCX, y: CEIL - 0.08, z: (z0 + z1) / 2 - MCZ } }
    );
  }

  // Interior partitions, with doorways that have a head height. The upstairs
  // pair stands on the same lines so the rooms stack.
  defineAnchor(main, "partition.west", {
    position: { x: -4 - MCX, y: 0, z: 0 },
    normal: { x: 1, y: 0, z: 0 }
  });
  defineAnchor(main, "partition.east", {
    position: { x: 5.2 - MCX, y: 0, z: 0 },
    normal: { x: 1, y: 0, z: 0 }
  });
  // Partition frames run along -Z, so a doorway at house z sits at MCZ - z.
  const PARTITION_DOORS = { "partition.west": -0.95, "partition.east": -0.15 };
  for (const [anchor, doorZ] of Object.entries(PARTITION_DOORS)) {
    const opening = { x: MCZ - doorZ, w: 0.92, h: 2.03, fromFloor: 0 };
    const low = wallX({ length: MD, extend: true, height: CEIL, thickness: T, material: darkSiding, openings: [opening] });
    mate(low, "wallSide", anchorsOf(main).get(anchor), { offset: { y: 0.12 } });
    const high = wallX({ length: MD, extend: true, height: UPPER_CEIL - UPPER + 0.1, thickness: T, material: darkSiding, openings: [{ ...opening }] });
    mate(high, "wallSide", anchorsOf(main).get(anchor), { offset: { y: UPPER } });
  }
  const partC = wallX({ length: 12 - 8.8, extend: true, height: CEIL, thickness: T, material: darkSiding });
  mate(partC, "wallSide", face(main, "back", { along: (8.8 + 12) / 2 - MCX }), { offset: { y: 0.12 } });
  // Dining room to kitchen: a doorway instead of a 3.4 m gap, built as two
  // piers and a lintel (x 6.05..7.15) — the join line is the house perimeter,
  // where a kit opening would be inventoried as an exterior door into the ell.
  for (const [x0, x1, y, h] of [[5.31, 6.05, 0.12, CEIL], [7.15, 8.69, 0.12, CEIL], [6.05, 7.15, 0.12 + 2.03, CEIL - 2.03]]) {
    const pier = wallX({ length: x1 - x0 - T, extend: true, height: h, thickness: T, material: darkSiding });
    mate(pier, "wallSide", face(main, "back", { along: (x0 + x1) / 2 - MCX }), { offset: { y } });
  }
  // Upstairs, the main block's north wall carries on over the ell up to the
  // exterior junction boarding (ranchRemodel, from 4.55 m).
  const upNorth = wallX({ length: 12 - 4, extend: true, height: 4.6 - UPPER, thickness: T, material: darkSiding });
  mate(upNorth, "wallSide", face(main, "back", { along: 8 - MCX }), { offset: { y: UPPER } });

  // Chimneys — continuous from the hearth, topping out above each ridge.
  const mainRidge = MEAVE + ((MD + 0.9) / 2) * 0.5;
  const ellRidge = EEAVE + ((ED + 0.9) / 2) * 0.5;
  const mainStack = chimney({ width: 1.15, height: mainRidge + 1.6, material: stone });
  mate(mainStack, "base", anchorsOf(main).get("footing"), { offset: { x: -6.8 - MCX, y: 0, z: -3.4 - MCZ } });
  const ellStack = chimney({ width: 1.05, height: ellRidge + 1.3, material: stone });
  mate(ellStack, "base", anchorsOf(ell).get("footing"), { offset: { x: 10.2 - ECX, y: 0, z: -16.35 - ECZ } });

  // Authored furniture (furniture kit, props.js) on the floorboards, in house
  // coordinates; yaw PI/2 turns a piece's front (+Z) to face +X.
  const furnish = (kind, gx, gz, yaw = 0, extra = {}, level = FLOOR) =>
    addPropSpot("ranch", { kind, x: houseX + gx, z: houseZ + gz, y: seat.y + level, yaw, seat: "free", inside: true, ...extra });
  const upstairs = (kind, gx, gz, yaw = 0, extra = {}) => furnish(kind, gx, gz, yaw, extra, UPPER);

  // Parlor (west), round the fireplace.
  furnish("piano", -9.78, 2.2, Math.PI / 2);
  furnish("table_square", -7.0, 1.2, 0.08);
  furnish("chair", -7.9, -1.25, Math.PI - 0.5);
  furnish("chair", -5.75, -1.1, Math.PI + 0.45);
  furnish("gun_rack", -4.26, 4.2, -Math.PI / 2);
  furnish("desk", -8.7, 6.47, Math.PI, { sx: 0.9 });
  furnish("chair", -8.7, 5.75, 0.15);
  // Entry hall.
  furnish("chair", -3.62, 5.4, Math.PI / 2);
  // Dining room (east).
  furnish("table_long", 8.6, 2.0, 0, { sx: 1.15 });
  for (const cx of [8.0, 9.2]) {
    furnish("chair", cx, 1.22, 0);
    furnish("chair", cx, 2.78, Math.PI);
  }
  furnish("chair", 7.15, 2.0, Math.PI / 2);
  furnish("chair", 10.05, 2.0, -Math.PI / 2);
  furnish("cupboard", 11.58, 4.6, -Math.PI / 2, { sx: 1.5 });
  furnish("shelf_goods", 10.4, -5.03);
  // Kitchen (ell).
  furnish("cookstove", 10.2, -15.38);
  furnish("cupboard", 15.58, -13.4, -Math.PI / 2, { sx: 1.5 });
  furnish("shelf_goods", 4.32, -12.2, Math.PI / 2);
  furnish("table_long", 8.2, -10.6, 0, { sx: 0.85 });
  furnish("chair", 7.7, -11.38, 0);
  furnish("chair", 8.7, -9.82, Math.PI);
  furnish("stool", 9.3, -11.3);
  furnish("barrel", 15.35, -15.85, 0.4);
  furnish("barrel", 4.62, -15.9, 1.3);

  // Upstairs: the Calders' room (west) and the children's room (east).
  upstairs("bed_double", -8.9, -0.9, Math.PI / 2, { sx: 1.05 });
  upstairs("wardrobe", -4.48, 4.9, -Math.PI / 2);
  upstairs("dresser", -9.9, 3.4, Math.PI / 2);
  upstairs("washstand", -4.4, -3.8, -Math.PI / 2);
  upstairs("chair", -8.4, 5.9, 2.6);
  upstairs("bed_single", 10.85, 4.2, -Math.PI / 2);
  upstairs("bed_single", 10.85, -3.6, -Math.PI / 2);
  upstairs("dresser", 7.6, -4.98, 0);
  upstairs("chair", 6.2, 5.6, 0.7);
  upstairs("trunk", 9.0, 5.0, 0);
  // Landing.
  upstairs("table_square", -1.8, -4.4, 0, { sx: 0.8 });
  upstairs("chair", -0.8, -4.55, -0.3);

  // Walkable surfaces: floorboards on both blocks, the stair as a ramp through
  // its tread centres, and the upstairs floor around the well.
  const deck = (x0, x1, z0, z1, y, yFar = y) =>
    addDeckPlatform(houseX + (x0 + x1) / 2, houseZ + (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0, seat.y + y, seat.y + yFar);
  deck(-10.5, 12, -5.35, 7, FLOOR);
  deck(4, 16, -16.5, -5.35, FLOOR);
  const rise = (UPPER - FLOOR) / STAIR.risers;
  deck(STAIR.x0, STAIR.x1, STAIR.zTop, STAIR.zBottom, UPPER - rise / 2, FLOOR + rise / 2);
  deck(-10.5, wellX0, -5.35, 7, UPPER);
  deck(wellX0, 12, -5.35, wellZ0, UPPER);
  deck(wellX1, 12, wellZ0, 7, UPPER);
  deck(wellX0, wellX1, wellZ1, 7, UPPER);

  // Colliders by storey. Ground-floor walls stop below the upstairs floor and
  // upstairs walls start at it, so each floor keeps its own plan.
  const low = { minY: seat.y - 1, maxY: seat.y + CEIL };
  const high = { minY: seat.y + UPPER + 0.1, maxY: seat.y + UPPER_CEIL };
  const full = { minY: seat.y - 1, maxY: seat.y + UPPER_CEIL };
  const wallZ = (x, z0, z1, span, doors = []) => {
    let cursor = z0;
    for (const [c, w] of [...doors, [z1 + 1, 0]].sort((a, b) => a[0] - b[0])) {
      const end = Math.min(z1, c - w / 2);
      if (end > cursor + 0.05) {
        addBoxCollider(houseX + x, houseZ + (cursor + end) / 2, T / 2 + 0.05, (end - cursor) / 2, span);
      }
      cursor = c + w / 2;
    }
  };
  const wallAlongX = (z, x0, x1, span, doors = []) => {
    let cursor = x0;
    for (const [c, w] of [...doors, [x1 + 1, 0]].sort((a, b) => a[0] - b[0])) {
      const end = Math.min(x1, c - w / 2);
      if (end > cursor + 0.05) {
        addBoxCollider(houseX + (cursor + end) / 2, houseZ + z, (end - cursor) / 2, T / 2 + 0.05, span);
      }
      cursor = c + w / 2;
    }
  };
  for (const [anchor, doorZ] of Object.entries(PARTITION_DOORS)) {
    const x = anchor === "partition.west" ? -4 : 5.2;
    wallZ(x, -5.35, 7, low, [[doorZ, 0.92]]);
    wallZ(x, -5.35, 7, high, [[doorZ, 0.92]]);
  }
  wallAlongX(-5.35, 8.8, 12, low);
  wallAlongX(-5.35, 5.2, 8.8, low, [[6.6, 1.1]]);
  wallAlongX(-5.35, 4, 12, high);
  // Stair: open balustrade on the hall side, a closet wall under the top so
  // nobody walks beneath the flight, and a guard across the well's far end.
  addBoxCollider(houseX + STAIR.x0 - 0.05, houseZ + (STAIR.zTop + wellZ1) / 2, 0.05, (wellZ1 - STAIR.zTop) / 2, full);
  addBoxCollider(houseX + (STAIR.x0 + STAIR.x1) / 2, houseZ + STAIR.zTop, (STAIR.x1 - STAIR.x0) / 2, 0.05, { minY: seat.y - 1, maxY: seat.y + 2.3 });
  addBoxCollider(houseX + (wellX0 + wellX1) / 2, houseZ + wellZ1, (wellX1 - wellX0) / 2, 0.05, high);
  // Chimney breasts (authored stone round the kit stacks), both storeys.
  addBoxCollider(houseX - 6.8, houseZ - 3.82, 0.95, 1.42, full);
  addBoxCollider(houseX + 10.2, houseZ - 16.08, 0.55, 0.33, full);

  // Door leaf, standing open on its hinge at the jamb.
  const door = doorLeaf({ width: 0.86, height: 2.03, thickness: 0.18, hinge: -0.46, swing: Math.PI / 2, material: darkWood });
  mate(door, "frame", anchorsOf(mSouth).get("opening.0"), { offset: { x: 0, y: 0, z: -T / 2 } });

  function glazeWindows(wall) {
    (wall.userData.openings || []).forEach((o, i) => {
      if ((o.fromFloor || 0) < 0.5) {
        return;
      }
      mate(
        glazing({ width: o.w, height: o.h, thickness: 0.1, material: glass }),
        "frame",
        anchorsOf(wall).get(`opening.${i}`),
        { offset: { x: 0, y: 0, z: -T / 2 } }
      );
    });
  }
  glazeWindows(mSouth);
  glazeWindows(mWest);
  glazeWindows(mEast);
  glazeWindows(mNorth);
  glazeWindows(eEast);
  glazeWindows(eSouth);

  // L-shaped porch: along the south face, wrapping the east face.
  const southPorch = porch({
    width: MW, depth: 4.6, eave: 3.4, postSpacing: 3.4,
    material: darkWood, roofMaterial: roof, roofPitch: 0.025
  });
  mate(southPorch, "wallSide", face(main, "front"));
  const eastPorch = porch({
    width: 9.2, depth: 4.2, eave: 3.4, postSpacing: 3.1,
    material: darkWood, roofMaterial: roof, roofPitch: 0.025
  });
  mate(eastPorch, "wallSide", face(main, "right", { along: 2.575 - MCZ }));

  mate(
    steps({ count: 2, width: 1.6, rise: 0.16, tread: 0.5, material: darkWood }),
    "wallSide",
    anchorsOf(southPorch).get("deckEdge"),
    { offset: { x: -MCX, z: 0.55 } }
  );

  collide(main, houseX + MCX, houseZ + MCZ, 0, [
    { x: (-10.5 + 4) / 2 - MCX, z: -MD / 2, halfX: mNorthLen / 2, halfZ: T / 2 },
    { x: 0, z: MD / 2, halfX: MW / 2, halfZ: T / 2, openings: [{ x: -MCX, w: 0.92 }] },
    { x: MW / 2, z: 0, halfX: T / 2, halfZ: MD / 2 },
    { x: -MW / 2, z: 0, halfX: T / 2, halfZ: MD / 2 }
  ]);
  collide(ell, houseX + ECX, houseZ + ECZ, 0, [
    { x: 0, z: -ED / 2, halfX: EW / 2, halfZ: T / 2 },
    { x: (12 + 16) / 2 - ECX, z: ED / 2, halfX: eJoinLen / 2, halfZ: T / 2 },
    { x: EW / 2, z: 0, halfX: T / 2, halfZ: ED / 2 },
    { x: -EW / 2, z: 0, halfX: T / 2, halfZ: ED / 2 }
  ]);
  group.add(main);
  group.add(ell);

  const trim = hasMaps
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xded7bc, gain: 1.8 })
    : new THREE.MeshStandardNodeMaterial({ map: woodTexture(), color: 0xc6bda6, roughness: 0.86 });
  if (hasMaps) trim.colorNode = trim.colorNode.mul(0.22).add(color(0xc6bda6).mul(0.78));
  const shutter = hasMaps
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0x627d6d, gain: 1.0 })
    : new THREE.MeshStandardNodeMaterial({ map: woodTexture(), color: 0x627465, roughness: 0.9 });
  const cedar = hasMaps
    ? makeTexturedMat(maps.siding, { tiling: 1.4, tint: 0xd8cfb6, gain: 1.0 })
    : new THREE.MeshStandardNodeMaterial({ color: 0xa79b7f, roughness: 0.9 });
  if (hasMaps) cedar.colorNode = cedar.colorNode.mul(0.24).add(color(0xb2a58a).mul(0.76));
  const cedarLight = cedar.clone();
  const cedarDark = cedar.clone();
  if (hasMaps) {
    cedarLight.colorNode = cedar.colorNode.mul(1.08);
    cedarDark.colorNode = cedar.colorNode.mul(0.91);
  } else {
    cedarLight.color.multiplyScalar(1.08);
    cedarDark.color.multiplyScalar(0.91);
  }
  const remodel = ranchRemodel({
    wall: cedar, wall_light: cedarLight, wall_dark: cedarDark,
    timber: darkWood, trim, shutter, stone, roof,
    iron: new THREE.MeshStandardNodeMaterial({ color: 0x242c28, roughness: 0.75, metalness: 0.4 })
  });
  remodel.position.set(houseX, seat.y, houseZ);
  group.add(remodel);

  // Interior finishes take their colour from per-face tints, so each base
  // here is the texture's grain over near-white (or its own natural tone).
  const neutral = (set, grain, rough = 0.9) => {
    if (!hasMaps) return new THREE.MeshStandardNodeMaterial({ color: 0xe8e2d6, roughness: rough });
    const m = makeTexturedMat(set, { tiling: 1.6, tint: 0xffffff, gain: 1.4, rough });
    m.colorNode = m.colorNode.mul(grain).add(color(0xf2eee6).mul(1 - grain));
    return m;
  };
  const interior = ranchInterior({
    floor: wood,
    timber: darkWood,
    stone,
    paint: neutral(maps.siding, 0.3, 0.8),
    plaster: neutral(maps.rock, 0.05, 0.95),
    brick: hasMaps
      ? makeTexturedMat(maps.rock, { tiling: 0.9, tint: 0xb4644a, gain: 1.1 })
      : new THREE.MeshStandardNodeMaterial({ color: 0x8a4a36, roughness: 0.95 }),
    fabric: neutral(maps.siding, 0.35, 1),
    iron: new THREE.MeshStandardNodeMaterial({ color: 0x2c2c2a, roughness: 0.6, metalness: 0.5 }),
    brass: new THREE.MeshStandardNodeMaterial({ color: 0xb58a42, roughness: 0.35, metalness: 0.85 })
  });
  interior.position.set(houseX, seat.y, houseZ);
  group.add(interior);


  // ---------------- Barn ----------------
  const barnX = ox - 28;
  const barnZ = oz + 18;
  const BW = 16;
  const BD = 12;
  const BEAVE = 6;
  const barn = structure({ name: "barn", x: barnX, z: barnZ, yaw: 0, w: BW, d: BD, eave: BEAVE, foundation: true, material: stone });

  const barnNorth = wallX({ length: BW, extend: true, height: BEAVE, thickness: T, material: darkSiding });
  mate(barnNorth, "wallSide", face(barn, "back"));
  const barnSouth = wallX({
    length: BW,
    extend: true,
    height: BEAVE,
    thickness: T,
    material: darkSiding,
            openings: [{ x: 0, w: 3.5, h: 4.0, fromFloor: 0, class: "barn" }]
  });
  mate(barnSouth, "wallSide", face(barn, "front"));
  const barnEast = wallX({
    length: BD, extend: true,
    height: BEAVE,
    thickness: T,
    material: darkSiding,
    openings: [{ x: 0, w: 3.0, h: 3.5, fromFloor: 0, class: "barn" }]
  });
  mate(barnEast, "wallSide", face(barn, "right"));
  const barnWest = wallX({ length: BD, extend: true, height: BEAVE, thickness: T, material: darkSiding });
  mate(barnWest, "wallSide", face(barn, "left"));

  const barnRoof = gableRoof({ w: BW, d: BD, pitch: 0.5, overhang: 0.45, eave: BEAVE, material: roof });
  mate(barnRoof, "base", anchorsOf(barn).get("wallTop"));

  // Barn doors hang open like every other walkable door in the kit: a leaf
  // drawn shut on an opening the colliders leave open reads as a wall a
  // player must phase through — the visual/physics mismatch the aperture
  // check names, on the wide-passage class this time.
  // The big barn leaves are door-sized walls — vertical cladding, so they
  // take darkSiding like the wall they hang in, not the floor texture.
  const barnDoor = doorLeaf({ width: 3.5, height: 4.0, thickness: 0.18, hinge: -1.75, swing: Math.PI / 2, material: darkSiding });
  barnDoor.userData.class = "barn";
  mate(barnDoor, "frame", anchorsOf(barnSouth).get("opening.0"), { offset: { x: 0, y: 0, z: -T / 2 } });
  const barnEastDoor = doorLeaf({ width: 3.0, height: 3.5, thickness: 0.18, hinge: -1.5, swing: Math.PI / 2, material: darkSiding });
  barnEastDoor.userData.class = "barn";
  mate(barnEastDoor, "frame", anchorsOf(barnEast).get("opening.0"), { offset: { x: 0, y: 0, z: -T / 2 } });

  collide(barn, barnX, barnZ, 0, [
    { x: 0, z: -BD / 2, halfX: BW / 2, halfZ: T / 2 },
    { x: 0, z: BD / 2, halfX: BW / 2, halfZ: T / 2, openings: [{ x: 0, w: 3.5 }] },
    { x: BW / 2, z: 0, halfX: T / 2, halfZ: BD / 2, openings: [{ x: 0, w: 3.0 }] },
    { x: -BW / 2, z: 0, halfX: T / 2, halfZ: BD / 2 }
  ]);
  // No solid body collider here: it re-sealed the bays the perimeter ring just
  // opened — the bays stood open in geometry and shut in physics, and the
  // aperture check catches a body circle blocked in a declared traversable
  // bay. The perimeter ring above is the anti-tunnel protection; the bays are
  // genuine passages and their interior is enterable ground.
  group.add(barn);

  // ---------------- Bunkhouse ----------------
  const bunkX = ox + 26;
  const bunkZ = oz + 10;
  const BKW = 12;
  const BKD = 6.5;
  const BKEAVE = 3.2;
  const bunk = structure({ name: "bunkhouse", habitable: true, x: bunkX, z: bunkZ, yaw: 0, w: BKW, d: BKD, eave: BKEAVE, foundation: true, material: stone });

  const bunkNorth = wallX({ length: BKW, extend: true, height: BKEAVE, thickness: T, material: siding });
  mate(bunkNorth, "wallSide", face(bunk, "back"));
  const bunkSouth = wallX({
    length: BKW,
    extend: true,
    height: BKEAVE,
    thickness: T,
    material: siding,
    openings: [{ x: 0, w: 0.92, h: 2.1, fromFloor: 0 }]
  });
  mate(bunkSouth, "wallSide", face(bunk, "front"));
  const bunkEast = wallX({ length: BKD, extend: true, height: BKEAVE, thickness: T, material: siding });
  mate(bunkEast, "wallSide", face(bunk, "right"));
  const bunkWest = wallX({ length: BKD, extend: true, height: BKEAVE, thickness: T, material: siding });
  mate(bunkWest, "wallSide", face(bunk, "left"));

  const bunkRoof = gableRoof({ w: BKW, d: BKD, pitch: 0.5, overhang: 0.45, eave: BKEAVE, material: roof });
  mate(bunkRoof, "base", anchorsOf(bunk).get("wallTop"));
  const bunkDoor = doorLeaf({ width: 0.86, height: 2.03, thickness: 0.18, hinge: -0.46, swing: Math.PI / 2, material: darkWood });
  mate(bunkDoor, "frame", anchorsOf(bunkSouth).get("opening.0"), { offset: { x: 0, y: 0, z: -T / 2 } });

  mate(
    block({ w: BKW, h: 0.1, d: BKD, material: wood, role: "floor", extra: { top: 0.1 } }),
    "base",
    anchorsOf(bunk).get("footing")
  );
  // Walkable from the inner wall faces out through the south doorway; without
  // it you stood on the yard pad 0.1 m inside the boards.
  floorDeck(bunk, -(BKW / 2 - T / 2), BKW / 2 - T / 2, -(BKD / 2 - T / 2), BKD / 2 + T / 2, 0.1);
  mate(
    block({ w: BKW - 0.4, h: 0.16, d: BKD - 0.4, material: wood, role: "ceiling", extra: { height: 2.6 } }),
    "base",
    anchorsOf(bunk).get("footing"),
    { offset: { y: 2.6 - 0.08 } }
  );

  collide(bunk, bunkX, bunkZ, 0, [
    { x: 0, z: -BKD / 2, halfX: BKW / 2, halfZ: T / 2 },
    { x: 0, z: BKD / 2, halfX: BKW / 2, halfZ: T / 2, openings: [{ x: 0, w: 0.92 }] },
    { x: BKW / 2, z: 0, halfX: T / 2, halfZ: BKD / 2 },
    { x: -BKW / 2, z: 0, halfX: T / 2, halfZ: BKD / 2 }
  ]);
  group.add(bunk);

  // ---------------- Blacksmith ----------------
  const smithX = ox + 18;
  const smithZ = oz + 24;
  const SW = 8;
  const SD = 7;
  const SEAVE = 3.6;
  const smith = structure({ name: "blacksmith", x: smithX, z: smithZ, yaw: Math.PI, w: SW, d: SD, eave: SEAVE, foundation: true, material: stone });

  const smithNorth = wallX({ length: SW, extend: true, height: SEAVE, thickness: T, material: darkSiding });
  mate(smithNorth, "wallSide", face(smith, "back"));
  const smithSouth = wallX({
    length: SW,
    extend: true,
    height: SEAVE,
    thickness: T,
    material: darkSiding,
    openings: [{ x: 0, w: 2.4, h: 2.6, fromFloor: 0, class: "bay" }]
  });
  mate(smithSouth, "wallSide", face(smith, "front"));
  const smithEast = wallX({ length: SD, extend: true, height: SEAVE, thickness: T, material: darkSiding });
  mate(smithEast, "wallSide", face(smith, "right"));
  const smithWest = wallX({ length: SD, extend: true, height: SEAVE, thickness: T, material: darkSiding });
  mate(smithWest, "wallSide", face(smith, "left"));

  const smithRoof = gableRoof({ w: SW, d: SD, pitch: 0.5, overhang: 0.45, eave: SEAVE, material: roof });
  mate(smithRoof, "base", anchorsOf(smith).get("wallTop"));

  // Same open-leaf rule as the barn: the bay's collider gap is a real
  // passage, so its leaf hangs open — a shut leaf would present the bay as
  // sealed while the body walks straight through it.
  const smithBay = doorLeaf({
    width: 2.4, height: 2.6, thickness: 0.18, hinge: -1.2, swing: Math.PI / 2, material: darkSiding
  });
  smithBay.userData.class = "bay";
  mate(smithBay, "frame", anchorsOf(smithSouth).get("opening.0"), { offset: { x: 0, y: 0, z: -T / 2 } });

  // Anvil on its stump mid-floor, the forge against the back wall facing the
  // bay (yaw PI turns the model's front, +Z, toward the door at world -Z).
  // Authored models (props.js); the anvil keeps the old block's collider.
  const smithFloor = smith.userData.placementY;
  addPropSpot("ranch", { kind: "anvil", x: smithX, z: smithZ, y: smithFloor, yaw: Math.PI, seat: "free", inside: true });
  addCylinderCollider(smithX, smithZ, 0.36);
  const forgeZ = smithZ + SD / 2 - T / 2 - 0.62;
  addPropSpot("ranch", { kind: "forge", x: smithX + 0.6, z: forgeZ, y: smithFloor, yaw: Math.PI, seat: "free", inside: true });
  addOrientedBoxCollider(smithX + 0.6, forgeZ, 1.1, 0.6, -Math.PI);

  collide(smith, smithX, smithZ, Math.PI, [
    { x: 0, z: -SD / 2, halfX: SW / 2, halfZ: T / 2 },
    { x: 0, z: SD / 2, halfX: SW / 2, halfZ: T / 2, openings: [{ x: 0, w: 2.4 }] },
    { x: SW / 2, z: 0, halfX: T / 2, halfZ: SD / 2 },
    { x: -SW / 2, z: 0, halfX: T / 2, halfZ: SD / 2 }
  ]);
  group.add(smith);

  // ---------------- Windmill (American multi-vane) ----------------
  const millX = ox + 34;
  const millZ = oz - 6;
  // The tower (landmark kit) is instanced by props.js; the wheel (yard kit)
  // is a live mesh props.js hangs on `fan`, which the frame loop turns about
  // its Z axis. Hub frame from pr_landmark.windmill_tower: (0, 9.4, -0.55)
  // above the tower base. The tail vane is part of the static tower.
  const millY = lowestSeat(millX, millZ, 1.5);
  const mill = grounded({ x: millX, z: millZ, y: millY, name: "windmill" });
  addPropSpot("ranch", { kind: "windmill_tower", x: millX, z: millZ, y: millY, yaw: 0 });
  const fan = new THREE.Group();
  fan.name = "windmillFan";
  fan.position.set(0, 9.4, -0.55);
  mill.add(fan);
  mill.userData.blades = fan;
  addMountSpot("ranch", "windmill_fan", fan);
  group.add(mill);
  // Four legs at +-1.05 m: one box keeps a walker out of the bracing.
  addBoxCollider(millX, millZ, 1.2, 1.2);
  // The stock tank the pump fills, its supply pipe meeting the pump spout.
  addPropSpot("ranch", { kind: "stock_tank", x: millX + 3.45, z: millZ + 0.05, yaw: 0, collide: true });

  // ---------------- Fences (3 rails) ----------------
  // The corral: a closed loop of the authored post-and-rail model (props.js
  // draws it; each bay's post stands at its start, so the loop needs no end
  // posts). One collider per side, as before.
  function fenceRun(x0, z0, x1, z1, count) {
    x0 += ox;
    z0 += oz;
    x1 += ox;
    z1 += oz;
    const dx = x1 - x0;
    const dz = z1 - z0;
    addBoxCollider((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(dx) < 0.5 ? 0.22 : Math.abs(dx) / 2, Math.abs(dz) < 0.5 ? 0.22 : Math.abs(dz) / 2);
    addFenceSpots("ranch", x0, z0, x1, z1, count);
  }
  fenceRun(12, 28, 42, 28, 10);
  fenceRun(42, 28, 42, 48, 8);
  fenceRun(42, 48, 12, 48, 10);
  fenceRun(12, 48, 12, 28, 8);

  // ---------------- Ranch gate (crossbeam on posts) ----------------
  const gateX = POS.ranchGate.x;
  const gateZ = POS.ranchGate.z;
  // Authored log gate (landmark kit). The stage road runs through here along
  // world X, so the gate stands across it: posts at gate z +-5 (the model's
  // +-4 scaled 1.25), clear of the 9 m carriageway, beam along Z, arrival
  // 'gate' in the opening. The old primitive posts stood 8 m apart ALONG the
  // road, both in the carriageway, with the wings lying on it.
  const gcx = gateX + 4;
  addPropSpot("ranch", {
    kind: "ranch_gate", x: gcx, z: gateZ, y: Math.min(heightAt(gcx, gateZ - 5), heightAt(gcx, gateZ + 5)) - 0.05,
    yaw: Math.PI / 2, sx: 1.25, seat: "free", spans: true
  });
  for (const gz of [gateZ - 5, gateZ + 5]) {
    addBoxCollider(gcx, gz, 0.22, 0.22);
  }
  // Post-and-rail wings running 7 m out from each post, square to the road.
  addFenceSpots("ranch", gcx, gateZ - 12, gcx, gateZ - 5.3, 2, { collide: true });
  addFenceSpots("ranch", gcx, gateZ + 12, gcx, gateZ + 5.3, 2, { collide: true });
  registerAperture({
    structure: "ranchGate", side: "east", kind: "gate",
    x: gateX + 4, y: heightAt(gateX + 4, gateZ) + 2.55, z: gateZ,
    w: 9.6, h: 5.3, nx: 1, nz: 0, state: "traversable",
    note: "freestanding range gate on the ride-in trail; arrival approach 'gate'. NOT part of the corral fence — that rectangle (ox+12..42, oz+28..48) is a closed loop with no gate (R8)"
  });

  // ---------------- Hitching rail ----------------
  // Two posts and a bar, not the solid 3.4 m plank it used to be — a hitching
  // rail is something you tie to, with daylight under the bar; a plank wall
  // read as a fence section sunk in the grass (audit: side-on at the rail).
  // Same footprint and collider, so the dismount arrival and the trough gap
  // measured against the old rail still hold.
  //
  // The yard furniture below is drawn by props.js from authored models; this
  // builder keeps each piece's collider and records where the model stands.
  // yaw PI/2 lays the rail's long axis along world Z.
  addPropSpot("ranch", { kind: "hitch_rail_short", x: ox + 8, z: oz + 14, yaw: Math.PI / 2 });
  addBoxCollider(ox + 8, oz + 14, 0.35, 1.8);

  // ---------------- Wagon (front wheels smaller, toward +X) ----------------
  addPropSpot("ranch", { kind: "wagon_farm", x: ox - 18, z: oz + 8, yaw: 0 });
  addBoxCollider(ox - 18, oz + 8, 2.0, 1.0);

  // ---------------- Hay ----------------
  // A stack of square bales: three by two on the ground, two on top, all
  // seated on the lowest ground under the whole stack.
  const hayX = ox + 16.5;
  const hayZ = oz + 32.25;
  const hayY = lowestSeat(hayX, hayZ, 1.6);
  for (const [dx, dz, lift] of [[-0.92, -0.24, 0], [0, -0.24, 0], [0.92, -0.24, 0], [-0.92, 0.24, 0], [0, 0.24, 0], [0.92, 0.24, 0], [-0.46, 0.02, 0.38], [0.46, -0.02, 0.38]]) {
    addPropSpot("ranch", { kind: "hay_bale", x: hayX + dx, z: hayZ + dz, y: hayY + lift, yaw: lift ? 0.04 : (dx + dz) * 0.02, stacked: lift > 0 });
  }
  addBoxCollider(ox + 16.6, oz + 32.4, 1.6, 1.2);

  // ---------------- Woodpile ----------------
  // z -7.5, not -4: the stage road runs in along ranch z = 0 (half width
  // 4.5), and the old box woodpile at -4 stood on its shoulder.
  addPropSpot("ranch", { kind: "woodpile", x: ox - 16, z: oz - 7.5, yaw: 0 });
  addBoxCollider(ox - 16, oz - 7.5, 1.05, 0.36);

  // ---------------- Trough ----------------
  // 13.5, not 11: a trough 1.25 m from the hitching rail leaves a gap a horse
  // (0.78 m radius) cannot pass, and a rider mounting at the rail rides into
  // the pocket between rail and trough with nothing but a wall ahead.
  addPropSpot("ranch", { kind: "trough", x: ox + 13.5, z: oz + 16, yaw: 0 });
  addBoxCollider(ox + 13.5, oz + 16, 1.4, 0.5);

  // Every porch on this structure becomes standable footing. Runs last, once
  // the porches have been mated and the group's world matrices are final.
  registerPorchDecks(group);

  return group;
}
