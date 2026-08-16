import * as THREE from "three/webgpu";
import { heightAt } from "./world.js";
import { addBoxCollider, addCylinderCollider } from "./collision.js";
import { POS, WATER, mapToWorld, CREEKS } from "./map.js";
import {
  makeWaterNormalTexture,
  createWaterFallbackMaterial,
  createWaterMaterial
} from "./materials/waterMaterial.ts";
import {
  structure,
  gableRoof,
  shedRoof,
  flatRoof,
  wallX,
  wallZ,
  collide,
  tag,
  doorLeaf,
  boardwalk,
  registerWaterPlacement
} from "./buildings/kit.js";

function mat(color, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness: 0.88, ...extra });
}

function boxAt(group, x, z, w, h, d, material, collide = true, yOff = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, heightAt(x, z) + h / 2 + yOff, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (collide) {
    addBoxCollider(x, z, w / 2, d / 2);
  }
  return mesh;
}

function cylAt(group, x, z, rTop, rBot, h, material, collide = true) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 8), material);
  mesh.position.set(x, heightAt(x, z) + h / 2, z);
  mesh.castShadow = true;
  group.add(mesh);
  if (collide) {
    addCylinderCollider(x, z, Math.max(rTop, rBot));
  }
  return mesh;
}

function coneAt(group, x, z, r, h, material, collide = false, yOff = 0) {
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), material);
  mesh.position.set(x, heightAt(x, z) + h / 2 + yOff, z);
  mesh.castShadow = true;
  group.add(mesh);
  if (collide) {
    addCylinderCollider(x, z, r * 0.45);
  }
  return mesh;
}

export const ENTERABLE_LOTS = [];

function seeded(n) {
  const x = Math.sin(n * 999) * 43758.5453;
  return x - Math.floor(x);
}

const T = 0.22;

/**
 * One adobe house for the El Paso cluster. Local +Z is the front (door).
 * Heights, footprints and yaws stay with the caller so the plaza does not
 * read as three copies of the same box (audit E1).
 */
function adobeHouse(parent, { name, x, z, yaw, w, d, eave, adobe, roofMat, dark }) {
  const st = structure({
    name,
    x,
    z,
    yaw,
    w,
    d,
    eave,
    foundation: true,
    material: adobe
  });
  const door = [{ x: 0, w: 0.92, h: 2.1, fromFloor: 0 }];
  if (eave >= 5) {
    door.push(
      { x: -2.15, w: 0.85, h: 1.0, fromFloor: 3.15 },
      { x: 2.15, w: 0.85, h: 1.0, fromFloor: 3.15 }
    );
  }
  const front = wallX({ length: w, height: eave, thickness: T, material: adobe, openings: door });
  front.position.z = d / 2;
  st.add(front);
  const back = wallX({ length: w, height: eave, thickness: T, material: adobe });
  back.position.z = -d / 2;
  st.add(back);
  const window = eave >= 3.2 ? [{ x: 0, w: 0.9, h: 1.1, fromFloor: 0.9 }] : [];
  const east = wallZ({ length: d, height: eave, thickness: T, material: adobe, openings: window });
  east.position.x = w / 2;
  st.add(east);
  const west = wallZ({ length: d, height: eave, thickness: T, material: adobe });
  west.position.x = -w / 2;
  st.add(west);
  st.add(flatRoof({ w, d, overhang: 0.12, eave, material: roofMat }));
  const parapetH = 0.42;
  for (const [px, pz, pw, pd] of [
    [0, d / 2, w + 0.24, 0.2],
    [0, -d / 2, w + 0.24, 0.2],
    [w / 2, 0, 0.2, d],
    [-w / 2, 0, 0.2, d]
  ]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(pw, parapetH, pd), adobe);
    cap.position.set(px, eave + parapetH / 2, pz);
    cap.castShadow = true;
    st.add(cap);
  }
  const nVigas = Math.max(3, Math.round(w / 1.6));
  for (let i = 0; i < nVigas; i += 1) {
    const vx = -w / 2 + 0.7 + (i / (nVigas - 1)) * (w - 1.4);
    const viga = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.15, 6), dark);
    viga.rotation.x = Math.PI / 2;
    viga.position.set(vx, eave - 0.12, d / 2 + 0.45);
    viga.castShadow = true;
    st.add(viga);
  }
  const leaf = doorLeaf({
    width: 0.86,
    height: 2.03,
    thickness: 0.08,
    hinge: -0.46,
    swing: Math.PI * 0.55,
    material: dark
  });
  leaf.position.z = d / 2 + T / 2;
  st.add(leaf);
  collide(st, x, z, yaw, [
    { x: 0, z: -d / 2, halfX: w / 2, halfZ: T / 2 },
    { x: 0, z: d / 2, halfX: w / 2, halfZ: T / 2, openings: [{ x: 0, w: 1.2 }] },
    { x: w / 2, z: 0, halfX: T / 2, halfZ: d / 2 },
    { x: -w / 2, z: 0, halfX: T / 2, halfZ: d / 2 }
  ]);
  parent.add(st);
  return st;
}

/**
 * Build one lot on a street. The building is a rotated structure facing the
 * street (local +Z = front). Commercial lots get a shed roof behind a false
 * front at the facade plane; the church and hotel get gable roofs. Enterable
 * lots register their rotated group so interiors.js can build in the local
 * frame.
 */
function buildLot(group, origin, yaw, lot, i, wood, dark, stone, roof) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const along = (i - (lot.lotsLen - 1) / 2) * 14;
  const side = lot.side || 10;
  const toward = Math.sign(side) || 1;
  const x = origin.x + c * along - s * side;
  const z = origin.z + s * along + c * side;
  const h = lot.h || 5.5;
  const w = lot.w || 8;
  const d = lot.d || 7;
  const bodyMat = lot.stone ? stone : lot.dark ? dark : i % 2 ? dark : wood;
  const streetDirX = s * toward;
  const streetDirZ = -c * toward;
  // Local +Z maps to world (-sin yaw, cos yaw). We want the front wall (+Z) to
  // face the street, so (-sin yaw, cos yaw) = streetDir.
  const lotYaw = Math.atan2(-streetDirX, streetDirZ);

  const st = structure({
    name: lot.name || "streetLot",
    habitable: Boolean(lot.enterable),
    x, z, yaw: lotYaw, w, d, eave: h, foundation: true, material: stone
  });
  st.userData.streetYaw = yaw;

  // Walls. Front wall (local +Z) carries the door; the church gets a gable-end
  // entry, so its door is on the +X gable end instead.
  const frontOpenings = [{ x: 0, w: 0.92, h: 2.1, fromFloor: 0 }];
  const front = wallX({ length: w, height: h, thickness: T, material: bodyMat, openings: frontOpenings });
  front.position.z = d / 2;
  st.add(front);
  const back = wallX({ length: w, height: h, thickness: T, material: bodyMat });
  back.position.z = -d / 2;
  st.add(back);
  const eastOpenings = lot.steeple ? [{ x: 0, w: 0.92, h: 2.1, fromFloor: 0 }] : [];
  const east = wallZ({ length: d, height: h, thickness: T, material: bodyMat, openings: eastOpenings });
  east.position.x = w / 2;
  st.add(east);
  const west = wallZ({ length: d, height: h, thickness: T, material: bodyMat });
  west.position.x = -w / 2;
  st.add(west);

  // Roof. Church and hotel get gables; commercial gets a shed behind the false
  // front (drains to the rear, -Z).
  let roofGroup;
  if (lot.steeple || lot.gable) {
    roofGroup = gableRoof({ w, d, pitch: 0.5, overhang: 0.45, eave: h, material: roof });
  } else {
    roofGroup = shedRoof({ w, d, pitch: 0.15, overhang: 0.3, eave: h, highFront: true, material: roof });
  }
  st.add(roofGroup);

  // False front at the facade plane (local +Z = d/2), full width, rising above
  // the eave, with side returns so the parapet hides the roof from oblique views.
  if (lot.falseFront) {
    const ffH = lot.falseFrontHeight || 2.0;
    // The parapet sits at the roof's front overhang so the shed roof's high
    // edge is fully behind it, and rises clearly above the roof ridge. It uses
    // the light `wood` material so it reads as a painted facade against the
    // dark roof, not as a continuation of the wall.
    const ffZ = d / 2 + 0.3;
    const ff = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, ffH, 0.4), wood);
    ff.position.set(0, h + ffH / 2, ffZ);
    ff.castShadow = true;
    ff.receiveShadow = true;
    tag(ff, "falseFront");
    st.add(ff);

    // Side returns are full-height solid walls (ground to parapet top) that
    // wrap the front corners and extend back over the roof's full depth, so the
    // roof's top slope is hidden from oblique and elevated views, not just
    // dead-on. They sit at the roof's outer edge, not the wall edge.
    for (const sx of [-w / 2 - 0.3, w / 2 + 0.3]) {
      const ret = new THREE.Mesh(new THREE.BoxGeometry(0.4, h + ffH, d + 0.6), wood);
      ret.position.set(sx, (h + ffH) / 2, 0);
      ret.castShadow = true;
      ret.receiveShadow = true;
      tag(ret, "falseFront");
      st.add(ret);
    }

    // A projecting cap gives the parapet a readable silhouette from the street,
    // rather than making it look like a flat extension of the shed roof.
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 1.0, 0.32, 0.8), roof);
    cap.position.set(0, h + ffH + 0.02, ffZ + 0.12);
    cap.castShadow = true;
    cap.receiveShadow = true;
    tag(cap, "falseFront");
    st.add(cap);
  }

  // Steeple over the entry (gable end, +X), not centered on the ridge.
  if (lot.steeple) {
    const steeple = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4.5, 1.4), roof);
    steeple.position.set(w / 2, h + 2.25, 0);
    steeple.castShadow = true;
    tag(steeple, "steeple");
    st.add(steeple);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2.2, 4), roof);
    spire.position.set(w / 2, h + 4.5 + 1.1, 0);
    spire.castShadow = true;
    tag(spire, "steeple");
    st.add(spire);
  }

  collide(st, x, z, lotYaw, [
    { x: 0, z: -d / 2, halfX: w / 2, halfZ: T / 2 },
    { x: 0, z: d / 2, halfX: w / 2, halfZ: T / 2, openings: [{ x: 0, w: 3.0 }] },
    { x: w / 2, z: 0, halfX: T / 2, halfZ: d / 2 },
    { x: -w / 2, z: 0, halfX: T / 2, halfZ: d / 2 }
  ]);
  // Non-enterable lots get a solid body collider so a large step can't tunnel
  // through the thin walls.
  if (!lot.enterable) {
    addBoxCollider(x, z, w / 2, d / 2);
  }

  if (lot.enterable) {
    ENTERABLE_LOTS.push({
      name: lot.name,
      x,
      z,
      w,
      h,
      d,
      yaw: lotYaw,
      along,
      side,
      toward,
      stone: Boolean(lot.stone),
      dark: Boolean(lot.dark),
      streetDirX,
      streetDirZ,
      group: st
    });
  }

  if (lot.sign) {
    const signSide = side - toward * (Math.min(w, d) * 0.5 + 1.15);
    const sx = origin.x + c * along - s * signSide;
    const sz = origin.z + s * along + c * signSide;
    const board = boxAt(group, sx, sz, 0.12, 1.1, 0.7, dark, false);
    board.rotation.y = yaw + Math.PI / 2;
  }

  group.add(st);
}

function street(group, origin, yaw, lots, wood, dark, stone, roof) {
  lots.forEach((lot, i) => {
    buildLot(group, origin, yaw, { ...lot, lotsLen: lots.length }, i, wood, dark, stone, roof);
  });

  // A raised boardwalk runs the length of the street in front of the storefronts.
  if (!lots.some((l) => l.falseFront)) {
    return;
  }
  const side = lots[0]?.side || 10;
  const toward = Math.sign(side) || 1;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const length = lots.length * 14;
  const d = lots[0]?.d || 8;
  const bw = new THREE.Group();
  const deck = boardwalk({ length, width: 4.0, height: 1.5, material: wood });
  const deckX = origin.x - s * (side - toward * (d / 2 + 2.2));
  const deckZ = origin.z + c * (side - toward * (d / 2 + 2.2));
  bw.add(deck);
  bw.position.set(deckX, heightAt(deckX, deckZ), deckZ);
  bw.rotation.y = yaw;
  group.add(bw);
}

export function createLandmarks(scene) {
  ENTERABLE_LOTS.length = 0;
  const group = new THREE.Group();
  const wood = mat(0xc4a574);
  const dark = mat(0x6b4226);
  const stone = mat(0x8a8478);
  const roof = mat(0x4a3020);
  const adobe = mat(0xc4a06a);
  const rust = mat(0x8a4a2a);
  const canvas = mat(0xd2c4a0);
  const ash = mat(0x3a342c);
  const iron = mat(0x4a4a50, { metalness: 0.85, roughness: 0.35 });

  const town = POS.silverCreek;
  const townYaw = 0.15;
  street(group, town, townYaw, [
    { name: "sheriff", w: 9, h: 4.4, d: 8, stone: true, sign: true, enterable: true, falseFront: true, falseFrontHeight: 2.4 },
    { name: "newspaper", w: 7.5, h: 5.4, d: 7, falseFront: true, falseFrontHeight: 2.4 },
    { name: "doctor", w: 8, h: 5.2, d: 7.5, falseFront: true, falseFrontHeight: 2.4 },
    { name: "hotel", w: 11, h: 8.2, d: 9, gable: true, enterable: true },
    { name: "store", w: 9.5, h: 5.8, d: 8, sign: true, falseFront: true, falseFrontHeight: 2.6, enterable: true },
    { name: "church", w: 8, h: 7.2, d: 8, steeple: true, gable: true, enterable: true },
    { name: "saloon", w: 9, h: 7.4, d: 8, falseFront: true, falseFrontHeight: 2.8, sign: true, enterable: true },
    { name: "blacksmith", w: 12, h: 4.6, d: 9, dark: true, falseFront: true, falseFrontHeight: 2.2 },
    { name: "livery", w: 11, h: 4.2, d: 8, dark: true, falseFront: true, falseFrontHeight: 2.0 }
  ], wood, dark, stone, roof);
  street(group, { x: town.x, z: town.z - 22 }, 0.15, [
    { w: 7, h: 4, d: 6 },
    { w: 7, h: 4.2, d: 6 },
    { w: 8, h: 4.4, d: 7 },
    { w: 7, h: 3.8, d: 6 },
    { w: 9, h: 4.6, d: 7 }
  ], wood, dark, stone, roof);
  street(group, { x: town.x, z: town.z + 20 }, 0.15, [
    { w: 7, h: 4.1, d: 6 },
    { w: 8, h: 4.8, d: 7 },
    { w: 7, h: 3.9, d: 6 },
    { w: 9, h: 5.2, d: 7, stone: true }
  ], wood, dark, stone, roof);
  street(group, { x: town.x + 16, z: town.z - 2 }, 0.15 + Math.PI / 2, [
    { w: 7, h: 4.3, d: 6 },
    { w: 8, h: 5, d: 7 },
    { w: 7, h: 4, d: 6 },
    { w: 8, h: 4.6, d: 7 },
    { w: 7, h: 3.8, d: 6 }
  ], wood, dark, stone, roof);
  boxAt(group, town.x + 8, town.z + 28, 16, 3.2, 8, rust);

  const hitchC = Math.cos(townYaw);
  const hitchS = Math.sin(townYaw);
  for (const along of [-28, -8, 12, 32]) {
    const hx = town.x + hitchC * along - hitchS * 3.4;
    const hz = town.z + hitchS * along + hitchC * 3.4;
    boxAt(group, hx, hz, 0.16, 1.15, 0.16, dark, false);
  }
  const wagonX = town.x + 42;
  const wagonZ = town.z + 16;
  boxAt(group, wagonX, wagonZ, 3.6, 1.05, 1.7, dark, false);
  boxAt(group, wagonX, wagonZ, 3.8, 0.28, 1.9, wood, false, 1.05);
  boxAt(group, wagonX - 1.3, wagonZ + 0.95, 0.45, 0.7, 0.45, dark, false);
  boxAt(group, wagonX + 1.3, wagonZ + 0.95, 0.45, 0.7, 0.45, dark, false);
  boxAt(group, wagonX - 1.3, wagonZ - 0.95, 0.45, 0.7, 0.45, dark, false);
  boxAt(group, wagonX + 1.3, wagonZ - 0.95, 0.45, 0.7, 0.45, dark, false);

  const dock = POS.lakeMercy;
  // Dock references WATER, not terrain height.
  const dockY = WATER + 0.1;
  const dockDeck = new THREE.Mesh(new THREE.BoxGeometry(4, 0.35, 18), dark);
  dockDeck.position.set(dock.x - 20, dockY, dock.z - 90);
  dockDeck.castShadow = true;
  dockDeck.receiveShadow = true;
  group.add(dockDeck);
  registerWaterPlacement("dockDeck", dock.x - 20, dock.z - 90, dockY);
  const dockPlank = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 10), dark);
  dockPlank.position.set(dock.x - 28, dockY, dock.z - 84);
  dockPlank.castShadow = true;
  group.add(dockPlank);
  registerWaterPlacement("dockPlank", dock.x - 28, dock.z - 84, dockY);
  for (const [dx, dz] of [[-14, -102], [-14, -101.2], [-14, -102.8]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.32, 3.1), dark);
    post.position.set(dock.x + dx, dockY - 0.1, dock.z + dz);
    post.castShadow = true;
    group.add(post);
  }
  addBoxCollider(dock.x - 20, dock.z - 90, 2.2, 9.2);

  // Fire watch tower — four-legged braced tower with a lookout cabin.
  const tower = POS.fireWatch;
  const towerH = 18;
  const towerY = heightAt(tower.x, tower.z);
  for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, towerH, 6), dark);
    leg.position.set(tower.x + dx, towerY + towerH / 2, tower.z + dz);
    leg.castShadow = true;
    group.add(leg);
  }
  for (const [dx, dz] of [[-1.6, 0], [1.6, 0], [0, -1.6], [0, 1.6]]) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3.2), dark);
    brace.position.set(tower.x + dx, towerY + towerH * 0.5, tower.z + dz);
    brace.castShadow = true;
    group.add(brace);
  }
  const lookout = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.4, 4.2), wood);
  lookout.position.set(tower.x, towerY + towerH + 1.2, tower.z);
  lookout.castShadow = true;
  group.add(lookout);
  const lookoutRoof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.6, 4), roof);
  lookoutRoof.rotation.y = Math.PI / 4;
  lookoutRoof.position.set(tower.x, towerY + towerH + 2.4 + 0.8, tower.z);
  lookoutRoof.castShadow = true;
  group.add(lookoutRoof);
  addBoxCollider(tower.x, tower.z, 1.8, 1.8);

  // Timber camp — cabins with gable roofs.
  for (const [dx, dz] of [[-12, 8], [14, -6], [0, 16]]) {
    const cx = POS.timberCamp.x + dx;
    const cz = POS.timberCamp.z + dz;
    const cabin = structure({ name: "timberCabin", x: cx, z: cz, yaw: 0, w: 7, d: 5, eave: 3.4, foundation: true, material: stone });
    const north = wallX({ length: 7, height: 3.4, thickness: T, material: dark });
    north.position.z = -2.5;
    cabin.add(north);
    const south = wallX({ length: 7, height: 3.4, thickness: T, material: dark, openings: [{ x: 0, w: 0.92, h: 2.1, fromFloor: 0 }] });
    south.position.z = 2.5;
    cabin.add(south);
    const east = wallZ({ length: 5, height: 3.4, thickness: T, material: dark });
    east.position.x = 3.5;
    cabin.add(east);
    const west = wallZ({ length: 5, height: 3.4, thickness: T, material: dark });
    west.position.x = -3.5;
    cabin.add(west);
    const cabinRoof = gableRoof({ w: 7, d: 5, pitch: 0.7, overhang: 0.3, eave: 3.4, material: roof });
    cabin.add(cabinRoof);
    const cabinDoor = doorLeaf({ width: 0.86, height: 2.03, thickness: 0.08, hinge: -0.46, swing: Math.PI * 0.5, material: dark });
    cabinDoor.position.z = 2.5 + T / 2;
    cabin.add(cabinDoor);
    collide(cabin, cx, cz, 0, [
      { x: 0, z: -2.5, halfX: 3.5, halfZ: T / 2 },
      { x: 0, z: 2.5, halfX: 3.5, halfZ: T / 2, openings: [{ x: 0, w: 1.2 }] },
      { x: 3.5, z: 0, halfX: T / 2, halfZ: 2.5 },
      { x: -3.5, z: 0, halfX: T / 2, halfZ: 2.5 }
    ]);
    group.add(cabin);
    const woodpile = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.2, 1.2), wood);
    woodpile.position.set(cx + 6, heightAt(cx + 6, cz) + 0.6, cz);
    woodpile.castShadow = true;
    group.add(woodpile);
  }
  for (const [dx, dz] of [[-22, -10], [20, 12], [8, -18]]) {
    const log = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.85, 1.5), wood);
    log.position.set(POS.timberCamp.x + dx, heightAt(POS.timberCamp.x + dx, POS.timberCamp.z + dz) + 0.45, POS.timberCamp.z + dz);
    log.castShadow = true;
    group.add(log);
  }

  for (let i = 0; i < 6; i += 1) {
    const a = i * 1.1;
    boxAt(group, POS.burn.x + Math.cos(a) * 18, POS.burn.z + Math.sin(a) * 14, 5 + (i % 3), 2.2, 4, ash);
  }

  boxAt(group, POS.barrett.x, POS.barrett.z, 10, 5.5, 8, wood);
  boxAt(group, POS.barrett.x + 12, POS.barrett.z + 4, 8, 4, 6, dark);
  boxAt(group, POS.sheepCamp.x, POS.sheepCamp.z, 6, 2.6, 4, canvas);
  coneAt(group, POS.sheepCamp.x + 8, POS.sheepCamp.z + 3, 2.4, 3.4, canvas, true);

  // Fort Grant — four equal walls with a centered gate on the east.
  const fort = POS.fortGrant;
  const fortWallH = 3.2;
  const fortHalf = 14;
  const fortDepth = 12;
  const gateHalf = 3;
  for (const [dx, dz, w, d] of [
    [0, fortDepth, 28, 1.2],
    [0, -fortDepth, 28, 1.2],
    [-fortHalf, 0, 1.2, fortDepth * 2],
    [fortHalf, 0, 1.2, fortDepth * 2]
  ]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, fortWallH, d), stone);
    wall.position.set(fort.x + dx, heightAt(fort.x + dx, fort.z + dz) + fortWallH / 2, fort.z + dz);
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);
  }
  // East gate posts.
  for (const gz of [fort.z - gateHalf, fort.z + gateHalf]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, fortWallH + 1.5, 0.5), stone);
    post.position.set(fort.x + fortHalf, heightAt(fort.x + fortHalf, gz) + (fortWallH + 1.5) / 2, gz);
    post.castShadow = true;
    group.add(post);
  }
  addBoxCollider(fort.x, fort.z + fortDepth, 14, 0.7);
  addBoxCollider(fort.x, fort.z - fortDepth, 14, 0.7);
  addBoxCollider(fort.x - fortHalf, fort.z, 0.7, fortDepth);
  addBoxCollider(fort.x + fortHalf, fort.z, 0.7, fortDepth);
  boxAt(group, fort.x + 6, fort.z - 4, 6, 4.5, 6, stone);

  // Iron Valley — a coherent industrial complex at the region center (the
  // capture target), so the headframe / stamp mill / tailings actually read in
  // frame. The named mines/stampMill map POIs are 300-600 m apart and out of
  // the ironValley capture, so the complex is built here instead.
  const ivX = POS.ironValley.x;
  const ivZ = POS.ironValley.z;
  const ivY = heightAt(ivX, ivZ);

  // Headframe: a tall A-frame tower with cross-bracing and a sheave wheel over
  // the shaft. Big enough to read as an industrial silhouette at 62 m.
  const hfH = 16;
  for (const sgn of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.9, hfH, 0.9), iron);
    leg.position.set(ivX + sgn * 5, ivY + hfH / 2, ivZ - 6);
    leg.rotation.z = sgn * 0.22;
    leg.castShadow = true;
    group.add(leg);
  }
  for (const y of [4, 8, 12]) {
    const brace = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 0.4), iron);
    brace.position.set(ivX, ivY + y, ivZ - 6);
    brace.castShadow = true;
    group.add(brace);
  }
  const crossbar = new THREE.Mesh(new THREE.BoxGeometry(11, 0.7, 0.7), iron);
  crossbar.position.set(ivX, ivY + hfH, ivZ - 6);
  crossbar.castShadow = true;
  group.add(crossbar);
  const sheave = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.6, 12), iron);
  sheave.rotation.x = Math.PI / 2;
  sheave.position.set(ivX, ivY + hfH, ivZ - 6);
  sheave.castShadow = true;
  group.add(sheave);
  const shaftBox = new THREE.Mesh(new THREE.BoxGeometry(3.5, 4, 3.5), dark);
  shaftBox.position.set(ivX, ivY + 2, ivZ - 6);
  shaftBox.castShadow = true;
  group.add(shaftBox);
  addBoxCollider(ivX, ivZ - 6, 2, 2);

  // Stamp mill: an open-sided shed with a visible battery of stamp rods and a
  // camshaft, plus a conical tailings pile beside it.
  const smX = ivX + 18;
  const smZ = ivZ + 4;
  const smY = heightAt(smX, smZ);
  const smShed = structure({ name: "stampMill", x: smX, z: smZ, yaw: 0, w: 16, d: 12, eave: 6, foundation: true, material: stone });
  const smRoof = gableRoof({ w: 16, d: 12, pitch: 0.55, overhang: 0.5, eave: 6, material: roof });
  smShed.add(smRoof);
  for (let i = 0; i < 6; i += 1) {
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 5.5, 6), iron);
    rod.position.set(smX - 6 + i * 2.4, smY + 2.75, smZ);
    rod.castShadow = true;
    smShed.add(rod);
  }
  const camshaft = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 14, 8), iron);
  camshaft.rotation.z = Math.PI / 2;
  camshaft.position.set(smX, smY + 1.4, smZ);
  camshaft.castShadow = true;
  smShed.add(camshaft);
  collide(smShed, smX, smZ, 0, [
    { x: 0, z: -6, halfX: 8, halfZ: T / 2 },
    { x: 0, z: 6, halfX: 8, halfZ: T / 2 },
    { x: 8, z: 0, halfX: T / 2, halfZ: 6 },
    { x: -8, z: 0, halfX: T / 2, halfZ: 6 }
  ]);
  group.add(smShed);

  // Tailings: a broad conical waste pile, rust-colored, beside the mill.
  const tailings = new THREE.Mesh(new THREE.ConeGeometry(7, 5, 10), rust);
  tailings.position.set(smX + 14, smY + 2.5, smZ + 8);
  tailings.castShadow = true;
  group.add(tailings);
  const tailings2 = new THREE.Mesh(new THREE.ConeGeometry(5, 3.5, 8), rust);
  tailings2.position.set(smX + 20, smY + 1.75, smZ + 2);
  tailings2.castShadow = true;
  group.add(tailings2);

  boxAt(group, POS.company.x, POS.company.z, 12, 6, 9, wood);
  for (const [dx, dz] of [[-18, 10], [16, 8], [4, 18]]) {
    boxAt(group, POS.ironValley.x + dx, POS.ironValley.z + dz, 8, 3.2, 5, dark);
  }

  // Mission — adobe with a campanario on the facade (not a centered cone).
  const mission = POS.mission;
  const missionBody = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 8), adobe);
  missionBody.position.set(mission.x, heightAt(mission.x, mission.z) + 3, mission.z);
  missionBody.castShadow = true;
  missionBody.receiveShadow = true;
  group.add(missionBody);
  const missionRoof = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.4, 8.6), roof);
  missionRoof.position.set(mission.x, heightAt(mission.x, mission.z) + 6.2, mission.z);
  missionRoof.castShadow = true;
  group.add(missionRoof);
  const campanario = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4.5, 1.6), adobe);
  campanario.position.set(mission.x, heightAt(mission.x, mission.z) + 6 + 2.25, mission.z + 4.2);
  campanario.castShadow = true;
  group.add(campanario);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 8), iron);
  bell.position.set(mission.x, heightAt(mission.x, mission.z) + 6 + 3.4, mission.z + 4.2);
  bell.castShadow = true;
  group.add(bell);
  addBoxCollider(mission.x, mission.z, 5.2, 4.2);
  boxAt(group, POS.vipers.x, POS.vipers.z, 7, 3, 5, rust);
  boxAt(group, POS.hideout.x, POS.hideout.z, 6, 2.6, 5, dark);

  // El Paso — adobe plaza: varied footprints, eaves and yaws, not three boxes.
  const ep = POS.elPaso;
  for (const house of [
    { name: "elPasoCasa", dx: 0, dz: 9, w: 10.5, d: 6.2, eave: 3.05 },
    { name: "elPasoTwoStory", dx: -11.5, dz: 1, w: 7.4, d: 8.0, eave: 5.4 },
    { name: "elPasoCasita", dx: 10.5, dz: 2.5, w: 5.0, d: 5.2, eave: 2.6 },
    { name: "elPasoStore", dx: 1.5, dz: -9.5, w: 8.8, d: 5.6, eave: 3.85 },
    { name: "elPasoShed", dx: -13.5, dz: 13, w: 4.2, d: 4.4, eave: 2.5 }
  ]) {
    const x = ep.x + house.dx;
    const z = ep.z + house.dz;
    adobeHouse(group, {
      name: house.name,
      x,
      z,
      yaw: Math.atan2(-house.dx, -house.dz),
      w: house.w,
      d: house.d,
      eave: house.eave,
      adobe,
      roofMat: roof,
      dark
    });
  }

  // Tribal camp — tipis in a loose ring with per-instance scale and yaw.
  const tipiCount = 7;
  for (let i = 0; i < tipiCount; i += 1) {
    const a = i * (Math.PI * 2 / tipiCount) + seeded(i) * 0.9;
    const r = 7 + seeded(i + 5) * 6;
    const tx = POS.tribal.x + Math.cos(a) * r;
    const tz = POS.tribal.z + Math.sin(a) * r;
    const s = 0.8 + seeded(i * 0.3 + 0.7) * 0.5;
    const tipi = new THREE.Mesh(new THREE.ConeGeometry(2.6 * s, 4.2 * s, 7), canvas);
    tipi.position.set(tx, heightAt(tx, tz) + 2.1 * s, tz);
    tipi.rotation.y = seeded(tx * 0.1 + tz * 0.1) * Math.PI * 2;
    tipi.castShadow = true;
    tipi.receiveShadow = true;
    group.add(tipi);
    addCylinderCollider(tx, tz, 1.2 * s);
  }

  // Cemetery — headstones with jitter.
  for (let i = 0; i < 5; i += 1) {
    const hx = POS.cemetery.x + (i - 2) * 2.2 + (seeded(i) - 0.5) * 0.4;
    const hz = POS.cemetery.z + (seeded(i + 3) - 0.5) * 0.4;
    const stone2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 0.18), stone);
    stone2.position.set(hx, heightAt(hx, hz) + 0.55, hz);
    stone2.rotation.y = (seeded(i + 7) - 0.5) * 0.4;
    stone2.castShadow = true;
    group.add(stone2);
  }
  boxAt(group, POS.huntingCabin.x, POS.huntingCabin.z, 7, 3.6, 5.5, dark);
  boxAt(group, POS.overlook.x, POS.overlook.z, 8, 0.2, 1.1, dark, false);

  // Cattle — per-instance yaw.
  const cattle = mat(0x5a3a22);
  for (const [dx, dz] of [[-40, 30], [-48, 38], [-36, 44], [80, 20]]) {
    const x = POS.ranch.x + dx;
    const z = POS.ranch.z + dz;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.1, 3, 6), cattle);
    body.rotation.z = Math.PI / 2;
    body.rotation.y = seeded(x * 0.01 + z * 0.01) * Math.PI * 2;
    body.position.set(x, heightAt(x, z) + 0.7, z);
    body.castShadow = true;
    group.add(body);
  }

  scene.add(group);
  return group;
}

function buildCreekRibbon(creek) {
  const samples = [];
  for (let i = 0; i < creek.pts.length - 1; i += 1) {
    const a = mapToWorld(creek.pts[i][0], creek.pts[i][1]);
    const b = mapToWorld(creek.pts[i + 1][0], creek.pts[i + 1][1]);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / 5));
    for (let j = 0; j < n; j += 1) {
      const t = j / n;
      samples.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  const last = creek.pts[creek.pts.length - 1];
  const end = mapToWorld(last[0], last[1]);
  samples.push({ x: end.x, z: end.z });

  const halfW = creek.width * (creek.dry ? 0.5 : 0.38);
  const positions = [];
  const depths = [];
  const flows = [];
  const slopes = [];
  for (let i = 0; i < samples.length; i += 1) {
    const p = samples[i];
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const px = -tz;
    const pz = tx;
    const bed = heightAt(p.x, p.z);
    const depth = Math.max(0, WATER - bed);
    const e = 3;
    const slope = Math.hypot(heightAt(p.x + e, p.z) - bed, heightAt(p.x, p.z + e) - bed) / (2 * e);
    for (const s of [1, -1]) {
      positions.push(p.x + px * halfW * s, creek.dry ? bed + 0.06 : WATER, p.z + pz * halfW * s);
      depths.push(depth);
      flows.push(tx, tz);
      slopes.push(slope);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("aDepth", new THREE.Float32BufferAttribute(depths, 1));
  geo.setAttribute("aFlow", new THREE.Float32BufferAttribute(flows, 2));
  geo.setAttribute("aSlope", new THREE.Float32BufferAttribute(slopes, 1));
  const indices = [];
  for (let i = 0; i < samples.length - 1; i += 1) {
    const l = i * 2;
    const r = l + 1;
    indices.push(l, r, l + 2, l + 2, r, r + 2);
  }
  geo.setIndex(indices);
  return geo;
}

function buildLakeGeometry() {
  const geo = new THREE.CircleGeometry(1, 96);
  const position = geo.getAttribute("position");
  const depths = new Float32Array(position.count);
  for (let i = 0; i < position.count; i += 1) {
    const radius = Math.min(1, Math.hypot(position.getX(i), position.getY(i)));
    // The visual lake basin is intentionally deeper at its centre than the
    // collision terrain, which stays shallow for gameplay.
    depths[i] = 7 * Math.pow(1 - radius, 0.8);
  }
  geo.setAttribute("aDepth", new THREE.Float32BufferAttribute(depths, 1));
  return geo;
}

export function createWater(scene, {
  lakeDepthSource = "buffer",
  screenRefraction = true,
  fallback = false
} = {}) {
  const group = new THREE.Group();
  const normalMap = makeWaterNormalTexture();

  const lakeMat = fallback
    ? createWaterFallbackMaterial()
    : createWaterMaterial(normalMap, { depthSource: lakeDepthSource, screenRefraction });
  const lake = new THREE.Mesh(buildLakeGeometry(), lakeMat);
  lake.rotation.x = -Math.PI / 2;
  lake.scale.set(310, 242, 1);
  lake.position.set(POS.lakeMercy.x, WATER, POS.lakeMercy.z);
  group.add(lake);

  const shoreMat = new THREE.MeshStandardNodeMaterial({
    color: 0x6a5a3a,
    roughness: 0.95
  });
  const shore = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.1, 48), shoreMat);
  shore.rotation.x = -Math.PI / 2;
  shore.scale.set(310, 242, 1);
  shore.position.set(POS.lakeMercy.x, WATER - 0.05, POS.lakeMercy.z);
  shore.receiveShadow = true;
  group.add(shore);

  const creekMat = fallback
    ? createWaterFallbackMaterial()
    : createWaterMaterial(normalMap, { depthSource: "attribute", screenRefraction });
  const toxicMat = fallback
    ? createWaterFallbackMaterial(true)
    : createWaterMaterial(normalMap, { toxic: true, depthSource: "attribute", screenRefraction });
  const washMat = new THREE.MeshStandardNodeMaterial({
    color: 0xc2a070,
    roughness: 0.95
  });

  for (const creek of CREEKS) {
    const geo = buildCreekRibbon(creek);
    const mat = creek.dry ? washMat : creek.name === "toxic" ? toxicMat : creekMat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  scene.add(group);
  return group;
}
