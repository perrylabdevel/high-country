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
import { addBoxCollider, addCylinderCollider } from "./collision.js";
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
  anvil,
  block,
  grounded,
  post,
  boxOnGround
} from "./buildings/kit.js";
import { face, mate, anchorsOf, defineAnchor } from "./buildings/anchors.js";

function groundY(x, z) {
  return heightAt(x, z);
}

export function createRanch() {
  const ox = POS.ranch.x;
  const oz = POS.ranch.z;
  const wood = new THREE.MeshStandardNodeMaterial({ map: woodTexture(), roughness: 0.86, color: 0xc4a574 });
  const darkWood = new THREE.MeshStandardNodeMaterial({ map: woodTexture(), roughness: 0.9, color: 0x6b4226 });
  const roof = new THREE.MeshStandardNodeMaterial({ map: shingleTexture(), roughness: 0.88, color: 0x4a3020 });
  const stone = new THREE.MeshStandardNodeMaterial({ map: rockTexture(), roughness: 0.95, color: 0x8a8478 });
  const glass = new THREE.MeshStandardNodeMaterial({
    color: 0xf0d9a0,
    emissive: 0x6a4018,
    emissiveIntensity: 0.35,
    roughness: 0.2,
    metalness: 0.1
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
    length: MW, height: MEAVE, thickness: T, material: wood,
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
  const mNorth = wallX({ length: mNorthLen, height: MEAVE, thickness: T, material: wood });
  mate(mNorth, "wallSide", face(main, "back", { along: (-10.5 + 4) / 2 - MCX }));

  const mWest = wallX({
    length: MD, height: MEAVE, thickness: T, material: wood,
    openings: [
      { x: -(2.2 - MCZ), w: 1.3, h: 1.5, fromFloor: 0.9 },
      { x: -(-3.2 - MCZ), w: 1.3, h: 1.5, fromFloor: 0.9 }
    ]
  });
  mate(mWest, "wallSide", face(main, "left"));

  const mEast = wallX({
    length: MD, height: MEAVE, thickness: T, material: wood,
    openings: [{ x: 2.8 - MCZ, w: 1.3, h: 1.5, fromFloor: 0.9 }]
  });
  mate(mEast, "wallSide", face(main, "right"));

  // Ell shell. Its north end (house z = -5.35) is closed only east of the main
  // block; west of that the two blocks share the opening.
  const eWest = wallX({ length: ED, height: EEAVE, thickness: T, material: wood });
  mate(eWest, "wallSide", face(ell, "left"));
  const eEast = wallX({
    length: ED, height: EEAVE, thickness: T, material: wood,
    openings: [{ x: -11.5 - ECZ, w: 1.25, h: 1.4, fromFloor: 0.9 }]
  });
  mate(eEast, "wallSide", face(ell, "right"));
  const eSouth = wallX({
    length: EW, height: EEAVE, thickness: T, material: wood,
    openings: [{ x: -(10.2 - ECX), w: 1.25, h: 1.4, fromFloor: 0.9 }]
  });
  mate(eSouth, "wallSide", face(ell, "back"));
  const eJoinLen = 16 - 12;
  const eJoin = wallX({ length: eJoinLen, height: EEAVE, thickness: T, material: wood });
  mate(eJoin, "wallSide", face(ell, "front", { along: (12 + 16) / 2 - ECX }));

  // Roofs — hips, both seated on their own eave.
  mate(hipRoof({ w: MW, d: MD, pitch: 0.5, overhang: 0.45, eave: MEAVE, material: roof }), "base", anchorsOf(main).get("wallTop"));
  mate(hipRoof({ w: EW, d: ED, pitch: 0.5, overhang: 0.45, eave: EEAVE, material: roof }), "base", anchorsOf(ell).get("wallTop"));

  // Floors and ground-floor ceilings, seated on footing.
  for (const [blk, w, d] of [[main, MW, MD], [ell, EW, ED]]) {
    mate(
      block({ w: w - 0.5, h: 0.1, d: d - 0.5, material: wood, role: "floor", extra: { top: 0.1 } }),
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
    length: MD, height: CEIL, thickness: T, material: darkWood,
    openings: [{ x: 2.6 - MCZ, w: 0.92, h: 2.03, fromFloor: 0 }]
  });
  mate(partA, "wallSide", anchorsOf(main).get("partition.west"), { offset: { y: 0.12 } });
  const partB = wallX({
    length: MD, height: CEIL, thickness: T, material: darkWood,
    openings: [{ x: 1.8 - MCZ, w: 0.92, h: 2.03, fromFloor: 0 }]
  });
  mate(partB, "wallSide", anchorsOf(main).get("partition.east"), { offset: { y: 0.12 } });
  const partC = wallX({ length: 12 - 8.8, height: CEIL, thickness: T, material: darkWood });
  mate(partC, "wallSide", face(main, "back", { along: (8.8 + 12) / 2 - MCX }), { offset: { y: 0.12 } });

  // Chimneys — continuous from the hearth, topping out above each ridge.
  const mainRidge = MEAVE + ((MD + 0.9) / 2) * 0.5;
  const ellRidge = EEAVE + ((ED + 0.9) / 2) * 0.5;
  const mainStack = chimney({ width: 1.15, height: mainRidge + 0.8, material: stone });
  mate(mainStack, "base", anchorsOf(main).get("footing"), { offset: { x: -6.8 - MCX, y: 0, z: -3.4 - MCZ } });
  const ellStack = chimney({ width: 1.05, height: ellRidge + 0.7, material: stone });
  mate(ellStack, "base", anchorsOf(ell).get("footing"), { offset: { x: 10.2 - ECX, y: 0, z: -16.35 - ECZ } });

  // Furniture, seated on each block's footing (house coords minus block centre).
  const onMain = (piece, gx, gz, y = 0) =>
    mate(piece, "base", anchorsOf(main).get("footing"), { offset: { x: gx - MCX, y, z: gz - MCZ } });
  const onEll = (piece, gx, gz, y = 0) =>
    mate(piece, "base", anchorsOf(ell).get("footing"), { offset: { x: gx - ECX, y, z: gz - ECZ } });

  for (const bz of [3.2, -2.8]) {
    onMain(block({ w: 2.3, h: 0.38, d: 1.45, material: darkWood }), -7.2, bz);
    onMain(block({ w: 2.1, h: 0.16, d: 1.25, material: wood }), -7.2, bz, 0.54 - 0.08);
  }
  onMain(block({ w: 0.32, h: 1.2, d: 1.6, material: darkWood }), -8.8, 0.2, 0.7 - 0.6);
  onMain(block({ w: 1.1, h: 0.72, d: 0.55, material: wood }), -5.6, -4.6);
  onMain(block({ w: 2.2, h: 0.12, d: 1.05, material: darkWood }), 8.4, 2.4, 0.78 - 0.06);
  for (const [lx, lz] of [[7.6, 1.8], [9.2, 1.8], [7.6, 3.0], [9.2, 3.0]]) {
    onMain(block({ w: 0.12, h: 0.72, d: 0.12, material: darkWood }), lx, lz, 0.4 - 0.36);
  }
  for (const cz2 of [1.15, 3.65]) {
    onMain(block({ w: 0.5, h: 0.5, d: 0.5, material: wood }), 8.4, cz2, 0.34 - 0.25);
    onMain(block({ w: 0.5, h: 0.55, d: 0.08, material: wood }), 8.4, cz2, 0.86 - 0.275);
  }
  onMain(block({ w: 0.9, h: 1.05, d: 2.4, material: darkWood }), 10.6, -3.4, 0.62 - 0.525);
  onMain(block({ w: 1.15, h: 0.72, d: 1.15, material: wood }), 6.4, -3.8);
  onMain(block({ w: 0.42, h: 0.5, d: 0.42, material: darkWood }), 6.4, -3.8, 0.34 - 0.25);
  onMain(block({ w: 1.05, h: 0.85, d: 0.55, material: darkWood }), 0.15, -3.2);
  onMain(block({ w: 2.2, h: 1.15, d: 0.95, material: stone }), -6.8, -4.0, 0.58 - 0.575);
  onMain(block({ w: 1.1, h: 2.2, d: 0.85, material: wood }), -2.1, 4.4, 1.2 - 1.1);
  onMain(block({ w: 1.0, h: 0.18, d: 0.7, material: darkWood }), -2.1, 3.7, 0.55 - 0.09);
  onMain(block({ w: 1.0, h: 0.18, d: 0.7, material: darkWood }), -2.1, 4.15, 1.05 - 0.09);
  onMain(block({ w: 1.0, h: 0.18, d: 0.7, material: darkWood }), -2.1, 4.55, 1.55 - 0.09);

  onEll(block({ w: 2.4, h: 1.15, d: 0.95, material: stone }), 10.2, -15.6, 0.68 - 0.575);
  onEll(block({ w: 1.4, h: 0.55, d: 0.7, material: darkWood }), 10.2, -15.4, 1.5 - 0.275);
  onEll(block({ w: 0.32, h: 1.5, d: 2.2, material: darkWood }), 13.6, -10.4, 0.85 - 0.75);
  onEll(block({ w: 1.6, h: 0.12, d: 0.9, material: wood }), 7.2, -10.8, 0.78 - 0.06);
  for (const [lx, lz] of [[7.2, -10.8], [6.5, -10.2], [7.9, -11.4]]) {
    onEll(block({ w: 0.12, h: 0.72, d: 0.12, material: darkWood }), lx, lz, 0.4 - 0.36);
  }
  onEll(block({ w: 0.7, h: 0.55, d: 0.55, material: wood }), 13.2, -13.8, 0.38 - 0.275);

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

  const barnNorth = wallX({ length: BW, height: BEAVE, thickness: T, material: darkWood });
  mate(barnNorth, "wallSide", face(barn, "back"));
  const barnSouth = wallX({
    length: BW,
    height: BEAVE,
    thickness: T,
    material: darkWood,
            openings: [{ x: 0, w: 3.5, h: 4.0, fromFloor: 0, class: "barn" }]
  });
  mate(barnSouth, "wallSide", face(barn, "front"));
  const barnEast = wallX({
    length: BD,
    height: BEAVE,
    thickness: T,
    material: darkWood,
    openings: [{ x: 0, w: 3.0, h: 3.5, fromFloor: 0, class: "barn" }]
  });
  mate(barnEast, "wallSide", face(barn, "right"));
  const barnWest = wallX({ length: BD, height: BEAVE, thickness: T, material: darkWood });
  mate(barnWest, "wallSide", face(barn, "left"));

  const barnRoof = gableRoof({ w: BW, d: BD, pitch: 0.5, overhang: 0.45, eave: BEAVE, material: roof });
  mate(barnRoof, "base", anchorsOf(barn).get("wallTop"));

  const barnDoor = doorLeaf({ width: 3.5, height: 4.0, thickness: 0.18, hinge: -1.75, swing: 0, material: wood });
  barnDoor.userData.class = "barn";
  mate(barnDoor, "frame", anchorsOf(barnSouth).get("opening.0"), { offset: { x: 0, y: 0, z: -T / 2 } });
  const barnEastDoor = doorLeaf({ width: 3.0, height: 3.5, thickness: 0.18, hinge: -1.5, swing: 0, material: wood });
  barnEastDoor.userData.class = "barn";
  mate(barnEastDoor, "frame", anchorsOf(barnEast).get("opening.0"), { offset: { x: 0, y: 0, z: -T / 2 } });

  collide(barn, barnX, barnZ, 0, [
    { x: 0, z: -BD / 2, halfX: BW / 2, halfZ: T / 2 },
    { x: 0, z: BD / 2, halfX: BW / 2, halfZ: T / 2, openings: [{ x: 0, w: 3.5 }] },
    { x: BW / 2, z: 0, halfX: T / 2, halfZ: BD / 2, openings: [{ x: 0, w: 3.0 }] },
    { x: -BW / 2, z: 0, halfX: T / 2, halfZ: BD / 2 }
  ]);
  // Solid body collider so a large step (horse) can't tunnel through the walls.
  addBoxCollider(barnX, barnZ, BW / 2, BD / 2);
  group.add(barn);

  // ---------------- Bunkhouse ----------------
  const bunkX = ox + 26;
  const bunkZ = oz + 10;
  const BKW = 12;
  const BKD = 6.5;
  const BKEAVE = 3.2;
  const bunk = structure({ name: "bunkhouse", habitable: true, x: bunkX, z: bunkZ, yaw: 0, w: BKW, d: BKD, eave: BKEAVE, foundation: true, material: stone });

  const bunkNorth = wallX({ length: BKW, height: BKEAVE, thickness: T, material: wood });
  mate(bunkNorth, "wallSide", face(bunk, "back"));
  const bunkSouth = wallX({
    length: BKW,
    height: BKEAVE,
    thickness: T,
    material: wood,
    openings: [{ x: 0, w: 0.92, h: 2.1, fromFloor: 0 }]
  });
  mate(bunkSouth, "wallSide", face(bunk, "front"));
  const bunkEast = wallX({ length: BKD, height: BKEAVE, thickness: T, material: wood });
  mate(bunkEast, "wallSide", face(bunk, "right"));
  const bunkWest = wallX({ length: BKD, height: BKEAVE, thickness: T, material: wood });
  mate(bunkWest, "wallSide", face(bunk, "left"));

  const bunkRoof = gableRoof({ w: BKW, d: BKD, pitch: 0.5, overhang: 0.45, eave: BKEAVE, material: roof });
  mate(bunkRoof, "base", anchorsOf(bunk).get("wallTop"));
  const bunkDoor = doorLeaf({ width: 0.86, height: 2.03, thickness: 0.18, hinge: -0.46, swing: Math.PI / 2, material: darkWood });
  mate(bunkDoor, "frame", anchorsOf(bunkSouth).get("opening.0"), { offset: { x: 0, y: 0, z: -T / 2 } });

  mate(
    block({ w: BKW - 0.5, h: 0.1, d: BKD - 0.5, material: wood, role: "floor", extra: { top: 0.1 } }),
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

  const smithNorth = wallX({ length: SW, height: SEAVE, thickness: T, material: darkWood });
  mate(smithNorth, "wallSide", face(smith, "back"));
  const smithSouth = wallX({
    length: SW,
    height: SEAVE,
    thickness: T,
    material: darkWood,
    openings: [{ x: 0, w: 2.4, h: 2.6, fromFloor: 0, class: "bay" }]
  });
  mate(smithSouth, "wallSide", face(smith, "front"));
  const smithEast = wallX({ length: SD, height: SEAVE, thickness: T, material: darkWood });
  mate(smithEast, "wallSide", face(smith, "right"));
  const smithWest = wallX({ length: SD, height: SEAVE, thickness: T, material: darkWood });
  mate(smithWest, "wallSide", face(smith, "left"));

  const smithRoof = gableRoof({ w: SW, d: SD, pitch: 0.5, overhang: 0.45, eave: SEAVE, material: roof });
  mate(smithRoof, "base", anchorsOf(smith).get("wallTop"));

  const smithBay = doorLeaf({
    width: 2.4, height: 2.6, thickness: 0.18, hinge: -1.2, swing: 0, material: darkWood
  });
  smithBay.userData.class = "bay";
  mate(smithBay, "frame", anchorsOf(smithSouth).get("opening.0"), { offset: { x: 0, y: 0, z: -T / 2 } });

  const iron = new THREE.MeshStandardNodeMaterial({ color: 0x2a2a2a, metalness: 0.7, roughness: 0.4 });
  mate(
    anvil({ width: 1.1, height: 0.7, depth: 0.5, material: iron }),
    "base",
    anchorsOf(smith).get("footing"),
    { offset: { x: 0, y: 0.2, z: 0 } }
  );

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
  const mill = grounded({ x: millX, z: millZ, name: "windmill" });
  const millFoot = anchorsOf(mill).get("footing");
  const towerH = 9;
  mate(post({ rTop: 0.5, rBot: 0.9, h: towerH, material: darkWood }), "base", millFoot);
  for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    mate(block({ w: 0.18, h: towerH, d: 0.18, material: darkWood }), "base", millFoot, {
      offset: { x: dx, z: dz }
    });
  }
  const fan = new THREE.Group();
  const fanMat = new THREE.MeshStandardNodeMaterial({ color: 0xd9c49a, roughness: 0.7 });
  const fanR = 1.6;
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    const vane = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.05), fanMat);
    vane.position.set(Math.cos(a) * fanR * 0.7, Math.sin(a) * fanR * 0.7, 0);
    vane.rotation.z = a;
    fan.add(vane);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.3, 8), darkWood);
  hub.rotation.x = Math.PI / 2;
  fan.add(hub);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.4, 0.6), fanMat);
  tail.position.set(0, 0, 1.1);
  fan.add(tail);
  fan.position.set(0, towerH + 0.4, 0);
  mill.add(fan);
  mill.userData.blades = fan;
  group.add(mill);
  addCylinderCollider(millX, millZ, 0.9);

  // ---------------- Fences (3 rails) ----------------
  const fence = new THREE.Group();
  function fenceRun(x0, z0, x1, z1, count) {
    x0 += ox;
    z0 += oz;
    x1 += ox;
    z1 += oz;
    const dx = x1 - x0;
    const dz = z1 - z0;
    addBoxCollider((x0 + x1) / 2, (z0 + z1) / 2, Math.abs(dx) < 0.5 ? 0.22 : Math.abs(dx) / 2, Math.abs(dz) < 0.5 ? 0.22 : Math.abs(dz) / 2);
    for (let i = 0; i <= count; i += 1) {
      const t = i / count;
      const x = x0 + dx * t;
      const z = z0 + dz * t;
      boxOnGround(fence, x, z, 0.18, 1.3, 0.18, darkWood, false);
      if (i < count) {
        const nx = x0 + dx * ((i + 1) / count);
        const nz = z0 + dz * ((i + 1) / count);
        const len = Math.hypot(nx - x, nz - z);
        for (const railH of [0.4, 0.8, 1.2]) {
          const midY = (groundY(x, z) + groundY(nx, nz)) / 2 + railH;
          const railA = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len), darkWood);
          railA.position.set((x + nx) / 2, midY, (z + nz) / 2);
          railA.lookAt(nx, midY, nz);
          fence.add(railA);
        }
      }
    }
  }
  fenceRun(12, 28, 42, 28, 10);
  fenceRun(42, 28, 42, 48, 8);
  fenceRun(42, 48, 12, 48, 10);
  fenceRun(12, 48, 12, 28, 8);
  group.add(fence);

  // ---------------- Ranch gate (crossbeam on posts) ----------------
  const gateX = POS.ranchGate.x;
  const gateZ = POS.ranchGate.z;
  function groundBox(x, z, w, h, d, material, yOff = 0) {
    const pad = grounded({ x, z });
    const piece = block({ w, h, d, material });
    mate(piece, "base", anchorsOf(pad).get("footing"), { offset: { y: yOff } });
    group.add(pad);
    return piece;
  }
  for (const gx of [gateX, gateX + 8]) {
    groundBox(gx, gateZ, 0.3, 5.5, 0.3, darkWood);
    addBoxCollider(gx, gateZ, 0.2, 0.2);
  }
  groundBox(gateX + 4, gateZ, 9, 0.35, 0.35, darkWood, 5.5 - 0.175);

  // ---------------- Hitching rail ----------------
  groundBox(ox + 8, oz + 14, 0.16, 1.1, 3.4, darkWood);
  addBoxCollider(ox + 8, oz + 14, 0.35, 1.8);

  // ---------------- Wagon (front wheels smaller) ----------------
  const wagon = grounded({ x: ox - 18, z: oz + 8 });
  mate(block({ w: 3.8, h: 0.38, d: 1.7, material: darkWood }), "base", anchorsOf(wagon).get("footing"), {
    offset: { y: 0.95 - 0.19 }
  });
  mate(block({ w: 3.6, h: 0.5, d: 0.12, material: wood }), "base", anchorsOf(wagon).get("footing"), {
    offset: { y: 1.28 - 0.25, z: 0.82 }
  });
  mate(block({ w: 3.6, h: 0.5, d: 0.12, material: wood }), "base", anchorsOf(wagon).get("footing"), {
    offset: { y: 1.28 - 0.25, z: -0.82 }
  });
  mate(block({ w: 0.7, h: 0.65, d: 1.5, material: wood }), "base", anchorsOf(wagon).get("footing"), {
    offset: { x: 1.35, y: 1.45 - 0.325 }
  });
  for (const [wx, wz, r] of [[-1.3, 0.95, 0.65], [-1.3, -0.95, 0.65], [1.3, 0.95, 0.5], [1.3, -0.95, 0.5]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.22, 10), darkWood);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, r, wz);
    wheel.castShadow = true;
    wagon.add(wheel);
  }
  group.add(wagon);
  addBoxCollider(ox - 18, oz + 8, 2.0, 1.0);

  // ---------------- Hay ----------------
  const hayMat = new THREE.MeshStandardNodeMaterial({ color: 0xc4a050, roughness: 0.92 });
  const hay = grounded({ x: ox + 16, z: oz + 32 });
  mate(block({ w: 1.5, h: 0.85, d: 0.9, material: hayMat }), "base", anchorsOf(hay).get("footing"), {
    offset: { y: 0.45 - 0.425 }
  });
  mate(block({ w: 1.35, h: 0.75, d: 0.85, material: hayMat }), "base", anchorsOf(hay).get("footing"), {
    offset: { x: 1.55, y: 0.4 - 0.375, z: 0.35 }
  });
  mate(block({ w: 1.2, h: 0.7, d: 0.8, material: hayMat }), "base", anchorsOf(hay).get("footing"), {
    offset: { x: 0.35, y: 0.38 - 0.35, z: 1.15 }
  });
  group.add(hay);
  addBoxCollider(ox + 16.6, oz + 32.4, 1.6, 1.2);

  // ---------------- Woodpile ----------------
  const woodpile = grounded({ x: ox - 16, z: oz - 4 });
  const logs = [
    [0, 0.12, 0, 1.15, 0.22, 0.22],
    [0.08, 0.12, 0.26, 1.05, 0.2, 0.2],
    [-0.05, 0.12, -0.24, 1.1, 0.2, 0.22],
    [0.04, 0.32, 0.08, 1.0, 0.2, 0.2],
    [-0.1, 0.32, -0.12, 0.95, 0.18, 0.2],
    [0, 0.52, 0, 0.9, 0.18, 0.18]
  ];
  for (const [lx, ly, lz, lw, lh, ld] of logs) {
    mate(block({ w: lw, h: lh, d: ld, material: darkWood }), "base", anchorsOf(woodpile).get("footing"), {
      offset: { x: lx, y: ly - lh / 2, z: lz }
    });
  }
  group.add(woodpile);
  addBoxCollider(ox - 16, oz - 4, 0.7, 0.45);

  // ---------------- Trough ----------------
  groundBox(ox + 11, oz + 16, 2.6, 0.5, 0.8, wood, 0.32 - 0.25);
  addBoxCollider(ox + 11, oz + 16, 1.4, 0.5);

  return group;
}
