/**
 * Ranch structures, rebuilt on the building kit (src/buildings/kit.js).
 *
 * All dimensions in meters. Each structure is built in its local frame and
 * added to a parent Group carrying rotation.y = yaw. Grounding uses footing()
 * (four-corner, not single-point). Roofs are real gable/shed primitives, never
 * square pyramids. Doors and windows are human-scale with head heights.
 */
import * as THREE from "three/webgpu";
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
  lowestSeat
} from "./buildings/kit.js";
import { face, mate, anchorsOf, defineAnchor } from "./buildings/anchors.js";
import { registerAperture } from "./buildings/apertures.js";
import { makeTexturedMat } from "./materials/texturedMat.ts";
import { addFenceSpots, addMountSpot, addPropSpot, clearPropSpots } from "./propSpots.js";

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

  const CEIL = 2.7; // ground-floor ceiling, shared by both blocks

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
      { x: 2.5, w: 1.25, h: 1.4, fromFloor: CEIL + 0.9 }
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
    openings: [{ x: -(10.2 - ECX), w: 1.25, h: 1.4, fromFloor: 0.9 }]
  });
  mate(eSouth, "wallSide", face(ell, "back"));
  const eJoinLen = 16 - 12;
  const eJoin = wallX({ length: eJoinLen, extend: true, height: EEAVE, thickness: T, material: siding });
  mate(eJoin, "wallSide", face(ell, "front", { along: (12 + 16) / 2 - ECX }));

  // Roofs — hips, both seated on their own eave.
  mate(hipRoof({ w: MW, d: MD, pitch: 0.5, overhang: 0.45, eave: MEAVE, material: roof }), "base", anchorsOf(main).get("wallTop"));
  mate(hipRoof({ w: EW, d: ED, pitch: 0.5, overhang: 0.45, eave: EEAVE, material: roof }), "base", anchorsOf(ell).get("wallTop"));

  // Floors and ground-floor ceilings, seated on footing. The floor spans the
  // full footprint — a floor inset from the footprint leaves a strip of
  // exposed terrain between its edge and the wall's inner face (the walls
  // centre on the footprint edges, so their inner faces sit at w/2 − T/2).
  for (const [blk, w, d] of [[main, MW, MD], [ell, EW, ED]]) {
    mate(
      block({ w, h: 0.1, d, material: wood, role: "floor", extra: { top: 0.1 } }),
      "base",
      anchorsOf(blk).get("footing")
    );
    mate(
      block({ w: w - 0.4, h: 0.16, d: d - 0.4, material: wood, role: "ceiling", extra: { height: CEIL } }),
      "base",
      anchorsOf(blk).get("footing"),
      { offset: { y: CEIL - 0.08 } }
    );
  }

  // Interior partitions, with doorways that have a head height.
  defineAnchor(main, "partition.west", {
    position: { x: -4 - MCX, y: 0, z: 0 },
    normal: { x: 1, y: 0, z: 0 }
  });
  defineAnchor(main, "partition.east", {
    position: { x: 5.2 - MCX, y: 0, z: 0 },
    normal: { x: 1, y: 0, z: 0 }
  });
  const partA = wallX({
    length: MD, extend: true, height: CEIL, thickness: T, material: darkSiding,
    openings: [{ x: 2.6 - MCZ, w: 0.92, h: 2.03, fromFloor: 0 }]
  });
  mate(partA, "wallSide", anchorsOf(main).get("partition.west"), { offset: { y: 0.12 } });
  const partB = wallX({
    length: MD, extend: true, height: CEIL, thickness: T, material: darkSiding,
    openings: [{ x: 1.8 - MCZ, w: 0.92, h: 2.03, fromFloor: 0 }]
  });
  mate(partB, "wallSide", anchorsOf(main).get("partition.east"), { offset: { y: 0.12 } });
  const partC = wallX({ length: 12 - 8.8, extend: true, height: CEIL, thickness: T, material: darkSiding });
  mate(partC, "wallSide", face(main, "back", { along: (8.8 + 12) / 2 - MCX }), { offset: { y: 0.12 } });

  // Chimneys — continuous from the hearth, topping out above each ridge.
  const mainRidge = MEAVE + ((MD + 0.9) / 2) * 0.5;
  const ellRidge = EEAVE + ((ED + 0.9) / 2) * 0.5;
  const mainStack = chimney({ width: 1.15, height: mainRidge + 1.6, material: stone });
  mate(mainStack, "base", anchorsOf(main).get("footing"), { offset: { x: -6.8 - MCX, y: 0, z: -3.4 - MCZ } });
  const ellStack = chimney({ width: 1.05, height: ellRidge + 1.3, material: stone });
  mate(ellStack, "base", anchorsOf(ell).get("footing"), { offset: { x: 10.2 - ECX, y: 0, z: -16.35 - ECZ } });

  // Furniture, seated on each block's footing (house coords minus block centre).
  const onMain = (piece, gx, gz, y = 0) =>
    mate(piece, "base", anchorsOf(main).get("footing"), { offset: { x: gx - MCX, y, z: gz - MCZ } });

  // Authored furniture (furniture kit, props.js) on the 0.1 m floor, in
  // house coordinates; yaw PI/2 turns a piece's front (+Z) to face +X.
  const furnish = (kind, gx, gz, yaw = 0, extra = {}) =>
    addPropSpot("ranch", { kind, x: houseX + gx, z: houseZ + gz, y: seat.y + 0.1, yaw, seat: "free", inside: true, ...extra });
  for (const bz of [3.2, -2.8]) {
    furnish("bed_double", -7.2, bz, 0, { sx: 1.1 });
  }
  furnish("dresser", -8.66, 0.2, Math.PI / 2);
  furnish("washstand", -4.5, -4.72);
  furnish("table_long", 8.4, 2.4, 0, { sx: 1.1 });
  furnish("chair", 8.0, 1.5, 0);
  furnish("chair", 8.9, 3.3, Math.PI);
  furnish("cupboard", 10.9, -3.4, -Math.PI / 2, { sx: 1.6 });
  furnish("table_square", 6.4, -3.8, 0.1);
  furnish("stool", 7.2, -3.3);
  furnish("desk", 0.15, -4.4, Math.PI, { sx: 0.8 });
  furnish("hearth", -6.8, -4.6, 0, { sx: 1.05 });
  onMain(block({ w: 1.1, h: 2.2, d: 0.85, material: wood }), -2.1, 4.4, 1.2 - 1.1);
  onMain(block({ w: 1.0, h: 0.18, d: 0.7, material: darkWood }), -2.1, 3.7, 0.55 - 0.09);
  onMain(block({ w: 1.0, h: 0.18, d: 0.7, material: darkWood }), -2.1, 4.15, 1.05 - 0.09);
  onMain(block({ w: 1.0, h: 0.18, d: 0.7, material: darkWood }), -2.1, 4.55, 1.55 - 0.09);

  furnish("cookstove", 10.2, -15.7);
  furnish("cupboard", 13.55, -10.4, -Math.PI / 2, { sx: 1.5 });
  furnish("table_long", 7.2, -10.8, 0, { sx: 0.8 });
  furnish("chair", 7.2, -11.75, 0);
  furnish("barrel", 13.2, -13.8, 0.4);

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
    material: darkWood, roofMaterial: roof
  });
  mate(southPorch, "wallSide", face(main, "front"));
  const eastPorch = porch({
    width: 9.2, depth: 4.2, eave: 3.4, postSpacing: 3.1,
    material: darkWood, roofMaterial: roof
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
