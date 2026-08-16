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
  shedRoof,
  wallX,
  wallZ,
  doorLeaf,
  porch,
  chimney,
  glazing,
  collide,
  tag
} from "./buildings/kit.js";
import { face, mate, anchorsOf } from "./buildings/anchors.js";

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

  function place(obj, x, z) {
    obj.position.set(ox + x, groundY(ox + x, oz + z), oz + z);
    group.add(obj);
    return obj;
  }

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
  mNorth.position.set((-10.5 + 4) / 2 - MCX, 0, -MD / 2);
  main.add(mNorth);

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
  eJoin.position.set((12 + 16) / 2 - ECX, 0, ED / 2);
  ell.add(eJoin);

  // Roofs — hips, both seated on their own eave.
  mate(hipRoof({ w: MW, d: MD, pitch: 0.5, overhang: 0.45, eave: MEAVE, material: roof }), "base", anchorsOf(main).get("wallTop"));
  mate(hipRoof({ w: EW, d: ED, pitch: 0.5, overhang: 0.45, eave: EEAVE, material: roof }), "base", anchorsOf(ell).get("wallTop"));

  // Floors and ground-floor ceilings.
  for (const [blk, w, d] of [[main, MW, MD], [ell, EW, ED]]) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 0.5, 0.1, d - 0.5), wood);
    floor.position.y = 0.05;
    tag(floor, "floor", { top: 0.1 });
    blk.add(floor);
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.16, d - 0.4), wood);
    ceiling.position.y = CEIL;
    tag(ceiling, "ceiling", { height: CEIL });
    blk.add(ceiling);
  }

  // Interior partitions, with doorways that have a head height.
  const partA = wallZ({
    length: MD, height: CEIL, thickness: T, material: darkWood,
    openings: [{ x: 2.6 - MCZ, w: 0.92, h: 2.03, fromFloor: 0 }]
  });
  partA.position.set(-4 - MCX, 0.12, 0);
  main.add(partA);
  const partB = wallZ({
    length: MD, height: CEIL, thickness: T, material: darkWood,
    openings: [{ x: 1.8 - MCZ, w: 0.92, h: 2.03, fromFloor: 0 }]
  });
  partB.position.set(5.2 - MCX, 0.12, 0);
  main.add(partB);
  const partC = wallX({ length: 12 - 8.8, height: CEIL, thickness: T, material: darkWood });
  partC.position.set((8.8 + 12) / 2 - MCX, 0.12, -5.35 - MCZ);
  main.add(partC);

  // Chimneys — continuous from the hearth, topping out above each ridge.
  const mainRidge = MEAVE + ((MD + 0.9) / 2) * 0.5;
  const ellRidge = EEAVE + ((ED + 0.9) / 2) * 0.5;
  const mainStack = chimney({ width: 1.15, height: mainRidge + 0.8, material: stone });
  mainStack.position.set(-6.8 - MCX, 0, -3.4 - MCZ);
  main.add(mainStack);
  const ellStack = chimney({ width: 1.05, height: ellRidge + 0.7, material: stone });
  ellStack.position.set(10.2 - ECX, 0, -16.35 - ECZ);
  ell.add(ellStack);

  // Furniture, ported from the house coordinates above.
  function furnish(blk, cx, cz, gx, gz, w, h, d, material, y = h / 2) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(gx - cx, y, gz - cz);
    blk.add(mesh);
    return mesh;
  }
  const inMain = (gx, gz, w, h, d, m, y) => furnish(main, MCX, MCZ, gx, gz, w, h, d, m, y);
  const inEll = (gx, gz, w, h, d, m, y) => furnish(ell, ECX, ECZ, gx, gz, w, h, d, m, y);

  for (const bz of [3.2, -2.8]) {
    inMain(-7.2, bz, 2.3, 0.38, 1.45, darkWood);
    inMain(-7.2, bz, 2.1, 0.16, 1.25, wood, 0.54);
  }
  inMain(-8.8, 0.2, 0.32, 1.2, 1.6, darkWood, 0.7);
  inMain(-5.6, -4.6, 1.1, 0.72, 0.55, wood);
  inMain(8.4, 2.4, 2.2, 0.12, 1.05, darkWood, 0.78);
  for (const [lx, lz] of [[7.6, 1.8], [9.2, 1.8], [7.6, 3.0], [9.2, 3.0]]) {
    inMain(lx, lz, 0.12, 0.72, 0.12, darkWood, 0.4);
  }
  for (const cz2 of [1.15, 3.65]) {
    inMain(8.4, cz2, 0.5, 0.5, 0.5, wood, 0.34);
    inMain(8.4, cz2, 0.5, 0.55, 0.08, wood, 0.86);
  }
  inMain(10.6, -3.4, 0.9, 1.05, 2.4, darkWood, 0.62);
  inMain(6.4, -3.8, 1.15, 0.72, 1.15, wood);
  inMain(6.4, -3.8, 0.42, 0.5, 0.42, darkWood, 0.34);
  inMain(0.15, -3.2, 1.05, 0.85, 0.55, darkWood);
  inMain(-6.8, -4.0, 2.2, 1.15, 0.95, stone, 0.58);
  // Stair to the upper floor.
  inMain(-2.1, 4.4, 1.1, 2.2, 0.85, wood, 1.2);
  inMain(-2.1, 3.7, 1.0, 0.18, 0.7, darkWood, 0.55);
  inMain(-2.1, 4.15, 1.0, 0.18, 0.7, darkWood, 1.05);
  inMain(-2.1, 4.55, 1.0, 0.18, 0.7, darkWood, 1.55);

  inEll(10.2, -15.6, 2.4, 1.15, 0.95, stone, 0.68);
  inEll(10.2, -15.4, 1.4, 0.55, 0.7, darkWood, 1.5);
  inEll(13.6, -10.4, 0.32, 1.5, 2.2, darkWood, 0.85);
  inEll(7.2, -10.8, 1.6, 0.12, 0.9, wood, 0.78);
  for (const [lx, lz] of [[7.2, -10.8], [6.5, -10.2], [7.9, -11.4]]) {
    inEll(lx, lz, 0.12, 0.72, 0.12, darkWood, 0.4);
  }
  inEll(13.2, -13.8, 0.7, 0.55, 0.55, wood, 0.38);

  // Door leaf, standing open on its hinge at the jamb.
  const door = doorLeaf({ width: 0.86, height: 2.03, thickness: 0.18, hinge: -0.46, swing: Math.PI / 2, material: darkWood });
  mate(door, "frame", anchorsOf(mSouth).get("opening.0"), { offset: { x: 0, y: 0, z: -T / 2 } });

  // Glazing in the south-wall window openings (door is opening.0).
  for (let i = 1; i <= 4; i += 1) {
    const o = mSouth.userData.openings[i];
    mate(
      glazing({ width: o.w, height: o.h, thickness: 0.1, material: glass }),
      "frame",
      anchorsOf(mSouth).get(`opening.${i}`),
      { offset: { x: 0, y: 0, z: -T / 2 } }
    );
  }

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

  // Steps up to the front door.
  for (let i = 0; i < 2; i += 1) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.16, 0.5), darkWood);
    step.position.set(-MCX, 0.08 + i * 0.14, MD / 2 + 4.6 + 0.55 - i * 0.5);
    main.add(step);
  }

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

  const bunkFloor = new THREE.Mesh(new THREE.BoxGeometry(BKW - 0.5, 0.1, BKD - 0.5), wood);
  bunkFloor.position.y = 0.05;
  tag(bunkFloor, "floor", { top: 0.1 });
  bunk.add(bunkFloor);
  const bunkCeil = new THREE.Mesh(new THREE.BoxGeometry(BKW - 0.4, 0.16, BKD - 0.4), wood);
  bunkCeil.position.y = 2.6;
  tag(bunkCeil, "ceiling", { height: 2.6 });
  bunk.add(bunkCeil);

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
  const smith = structure({ name: "blacksmith", x: smithX, z: smithZ, yaw: 0, w: SW, d: SD, eave: SEAVE, foundation: true, material: stone });

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

  const smithRoof = shedRoof({ w: SW, d: SD, pitch: 0.2, overhang: 0.3, eave: SEAVE, material: roof });
  mate(smithRoof, "base", anchorsOf(smith).get("wallTop"));

  const anvil = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.5), new THREE.MeshStandardNodeMaterial({ color: 0x2a2a2a, metalness: 0.7, roughness: 0.4 }));
  anvil.position.set(0, 0.55, 0);
  smith.add(anvil);

  collide(smith, smithX, smithZ, 0, [
    { x: 0, z: -SD / 2, halfX: SW / 2, halfZ: T / 2 },
    { x: 0, z: SD / 2, halfX: SW / 2, halfZ: T / 2, openings: [{ x: 0, w: 2.4 }] },
    { x: SW / 2, z: 0, halfX: T / 2, halfZ: SD / 2 },
    { x: -SW / 2, z: 0, halfX: T / 2, halfZ: SD / 2 }
  ]);
  group.add(smith);

  // ---------------- Windmill (American multi-vane) ----------------
  const mill = new THREE.Group();
  const millX = ox + 34;
  const millZ = oz - 6;
  const millY = groundY(millX, millZ);
  const towerH = 9;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, towerH, 8), darkWood);
  tower.position.set(millX, millY + towerH / 2, millZ);
  tower.castShadow = true;
  mill.add(tower);
  for (const [dx, dz] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, towerH, 0.18), darkWood);
    leg.position.set(millX + dx, millY + towerH / 2, millZ + dz);
    leg.castShadow = true;
    mill.add(leg);
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
  fan.position.set(millX, millY + towerH + 0.4, millZ);
  mill.add(fan);
  mill.userData.blades = fan;
  place(mill, 34, -6);
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
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.3, 0.18), darkWood);
      post.position.set(x, groundY(x, z) + 0.65, z);
      fence.add(post);
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
  for (const gx of [gateX, gateX + 8]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5.5, 0.3), darkWood);
    post.position.set(gx, groundY(gx, gateZ) + 2.75, gateZ);
    post.castShadow = true;
    group.add(post);
    addBoxCollider(gx, gateZ, 0.2, 0.2);
  }
  const gateBeam = new THREE.Mesh(new THREE.BoxGeometry(9, 0.35, 0.35), darkWood);
  gateBeam.position.set(gateX + 4, groundY(gateX + 4, gateZ) + 5.5, gateZ);
  gateBeam.castShadow = true;
  group.add(gateBeam);

  // ---------------- Hitching rail ----------------
  const hitch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.1, 3.4), darkWood);
  hitch.position.set(ox + 8, groundY(ox + 8, oz + 14) + 0.55, oz + 14);
  group.add(hitch);
  addBoxCollider(ox + 8, oz + 14, 0.35, 1.8);

  // ---------------- Wagon (front wheels smaller) ----------------
  const wagon = new THREE.Group();
  const wagonBed = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.38, 1.7), darkWood);
  wagonBed.position.y = 0.95;
  wagon.add(wagonBed);
  const wagonSideL = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.12), wood);
  wagonSideL.position.set(0, 1.28, 0.82);
  wagon.add(wagonSideL);
  const wagonSideR = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.5, 0.12), wood);
  wagonSideR.position.set(0, 1.28, -0.82);
  wagon.add(wagonSideR);
  const wagonSeat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.65, 1.5), wood);
  wagonSeat.position.set(1.35, 1.45, 0);
  wagon.add(wagonSeat);
  for (const [wx, wz, r] of [[-1.3, 0.95, 0.65], [-1.3, -0.95, 0.65], [1.3, 0.95, 0.5], [1.3, -0.95, 0.5]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.22, 10), darkWood);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(wx, r, wz);
    wheel.castShadow = true;
    wagon.add(wheel);
  }
  place(wagon, -18, 8);
  addBoxCollider(ox - 18, oz + 8, 2.0, 1.0);

  // ---------------- Hay ----------------
  const hayMat = new THREE.MeshStandardNodeMaterial({ color: 0xc4a050, roughness: 0.92 });
  const hay = new THREE.Group();
  const baleA = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 0.9), hayMat);
  baleA.position.set(0, 0.45, 0);
  hay.add(baleA);
  const baleB = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.75, 0.85), hayMat);
  baleB.position.set(1.55, 0.4, 0.35);
  hay.add(baleB);
  const baleC = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), hayMat);
  baleC.position.set(0.35, 0.38, 1.15);
  hay.add(baleC);
  place(hay, 16, 32);
  addBoxCollider(ox + 16.6, oz + 32.4, 1.6, 1.2);

  // ---------------- Woodpile ----------------
  const woodpile = new THREE.Group();
  const logs = [
    [0, 0.12, 0, 1.15, 0.22, 0.22],
    [0.08, 0.12, 0.26, 1.05, 0.2, 0.2],
    [-0.05, 0.12, -0.24, 1.1, 0.2, 0.22],
    [0.04, 0.32, 0.08, 1.0, 0.2, 0.2],
    [-0.1, 0.32, -0.12, 0.95, 0.18, 0.2],
    [0, 0.52, 0, 0.9, 0.18, 0.18]
  ];
  for (const [lx, ly, lz, lw, lh, ld] of logs) {
    const log = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, ld), darkWood);
    log.position.set(lx, ly, lz);
    woodpile.add(log);
  }
  place(woodpile, -16, -4);
  addBoxCollider(ox - 16, oz - 4, 0.7, 0.45);

  // ---------------- Trough ----------------
  const trough = new THREE.Group();
  const troughBox = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 0.8), wood);
  troughBox.position.y = 0.32;
  trough.add(troughBox);
  place(trough, 11, 16);
  addBoxCollider(ox + 11, oz + 16, 1.4, 0.5);

  return group;
}
