import * as THREE from "three/webgpu";
import { heightAt } from "./world.js";
import { meshHeightAt } from "./heightfield.js";
import { addBoxCollider, addDeckPlatform, addOrientedBoxCollider } from "./collision.js";
import { POS, WATER, mapToWorld, CREEKS, lakeFactor, lakeShoreRadius, LAKE_NOMINAL_RX, LAKE_NOMINAL_RZ } from "./map.js";
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
  collide,
  doorLeaf,
  glazing,
  boardwalk,
  falseFront,
  steeple,
  parapet,
  vigas,
  registerWaterPlacement,
  STRUCTURES,
  footprintsOverlap,
  block,
  boxOnGround,
  boxOnPlane,
  cylOnGround,
  cylOnPlane,
  coneOnGround,
  coneOnPlane,
  post,
  lowestSeat
} from "./buildings/kit.js";
import { mate, anchorsOf, face } from "./buildings/anchors.js";
import { registerAperture } from "./buildings/apertures.js";
import { makeTexturedMat } from "./materials/texturedMat.ts";

function mat(color, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness: 0.88, ...extra });
}

function boxAt(group, x, z, w, h, d, material, collide = true, yOff = 0) {
  return boxOnGround(group, x, z, w, h, d, material, collide, yOff);
}

export const ENTERABLE_LOTS = [];

/**
 * One entry per street built, recording how many lots it was configured with
 * against how many actually got placed. buildLot returns null when a footprint
 * would land inside an existing one, which is how a cross street quietly loses
 * buildings; without this the loss is invisible.
 */
export const STREETS = [];

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
  const front = wallX({ length: w, extend: true, height: eave, thickness: T, material: adobe, openings: door });
  mate(front, "wallSide", face(st, "front"));
  const back = wallX({ length: w, extend: true, height: eave, thickness: T, material: adobe });
  mate(back, "wallSide", face(st, "back"));
  const window = eave >= 3.2 ? [{ x: 0, w: 0.9, h: 1.1, fromFloor: 0.9 }] : [];
  const east = wallX({ length: d, extend: true, height: eave, thickness: T, material: adobe, openings: window });
  mate(east, "wallSide", face(st, "right"));
  const west = wallX({ length: d, extend: true, height: eave, thickness: T, material: adobe });
  mate(west, "wallSide", face(st, "left"));
  mate(flatRoof({ w, d, overhang: 0.12, eave, material: roofMat }), "base", anchorsOf(st).get("wallTop"));
  // Glass passes light (see the same material in buildings.js): a pane you
  // cannot see through presents the outdoors as a flat glowing panel from
  // inside, and the window's contract is glass-in-wall, not lamp shade.
  const glass = mat(0xcfe0d8, {
    transparent: true,
    opacity: 0.32,
    emissive: 0x6a4018,
    emissiveIntensity: 0.12,
    roughness: 0.15,
    metalness: 0.0
  });
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
  glazeWindows(front);
  glazeWindows(east);
  mate(parapet({ w, d, height: 0.42, material: adobe }), "base", anchorsOf(st).get("wallTop"));
  mate(vigas({ w, eave, material: dark }), "wallSide", face(st, "front"));
  const leaf = doorLeaf({
    width: 0.86,
    height: 2.03,
    thickness: 0.08,
    hinge: -0.46,
    swing: Math.PI * 0.55,
    material: dark
  });
  mate(leaf, "frame", anchorsOf(front).get("opening.0"), { offset: { x: 0, y: 0, z: T / 2 } });
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
 * front at the facade plane; lots without a false front get a gable so the
 * high shed edge does not fly above equal-height walls. Enterable
 * lots register their rotated group so interiors.js can build in the local
 * frame.
 */
function buildLot(group, origin, yaw, lot, i, facadeWood, dark, stone, roof, lift = 0, facade = null, falseFrontWood = facadeWood) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const along = (i - (lot.lotsLen - 1) / 2) * 14;
  const side = lot.side || 10;
  const toward = Math.sign(side) || 1;
  const h = lot.h || 5.5;
  const w = lot.w || 8;
  const d = lot.d || 7;
  // Seat the lot by its FRONT WALL, not its centre. Lots vary in depth, so a
  // fixed centre offset puts each facade at side - d/2 — a storefront line
  // ragged by up to a metre, which no straight boardwalk can abut and which
  // reads as a broken street edge. Fixing the facade and letting depth run
  // backwards is also how the frontage actually worked.
  const perp = facade === null ? side : facade + toward * (d / 2);
  const x = origin.x + c * along - s * perp;
  const z = origin.z + s * along + c * perp;
  const bodyMat = lot.stone ? stone : lot.dark ? dark : i % 2 ? dark : facadeWood;
  const streetDirX = s * toward;
  const streetDirZ = -c * toward;
  // rotation.y = t maps local +Z to world (sin t, cos t) — not (-sin t, cos t).
  // We want the front wall (+Z) to face the street, so (sin t, cos t) =
  // streetDir. Negating streetDirX mirrors the lot about the street: the
  // building lands 2*yaw off the row its own centre sits in (17.2 deg on
  // Silver Creek). It stayed invisible because the boardwalk, the collider
  // frame, and the alignment check all carried the same mirror.
  const lotYaw = Math.atan2(streetDirX, streetDirZ);

  // Cross streets meet the main row in an intersection. Skip a lot whose
  // footprint would land inside a building that is already there.
  const proposed = { x, z, w, d, yaw: lotYaw };
  if (STRUCTURES.some((s) => s.userData.w && footprintsOverlap(proposed, s.userData, 0.8))) {
    return null;
  }

  const st = structure({
    name: lot.name || "streetLot",
    habitable: Boolean(lot.enterable),
    x, z, yaw: lotYaw, w, d, eave: h, foundation: true, material: stone, lift
  });
  st.userData.streetYaw = yaw;

  // Walls. The front wall (local +Z) carries the door on every lot.
  //
  // The church used to take a gable-end entry on +X instead, but only its
  // exterior wall knew: interiors.js addShell always cuts its doorway in the
  // front wall, the collider always cut its gap there, and check-interiors
  // walks in from the street. So the exterior gable door opened onto a solid
  // interior wall, the interior doorway sat behind a solid facade, and the
  // building was enterable only because the collider had a hole where the
  // facade is solid. The gable entry was a half-finished idea; the church now
  // faces the street like its neighbours and keeps its steeple.
  const frontOpenings = [{ x: 0, w: 0.92, h: 2.1, fromFloor: 0 }];
  const front = wallX({ length: w, extend: true, height: h, thickness: T, material: bodyMat, openings: frontOpenings });
  mate(front, "wallSide", face(st, "front"));
  const back = wallX({ length: w, extend: true, height: h, thickness: T, material: bodyMat });
  mate(back, "wallSide", face(st, "back"));
  const east = wallX({ length: d, extend: true, height: h, thickness: T, material: bodyMat });
  mate(east, "wallSide", face(st, "right"));
  const west = wallX({ length: d, extend: true, height: h, thickness: T, material: bodyMat });
  mate(west, "wallSide", face(st, "left"));

  const doorWall = front;
  if (anchorsOf(doorWall).get("opening.0")) {
    mate(
      doorLeaf({ width: 0.86, height: 2.03, thickness: 0.08, hinge: -0.46, swing: Math.PI * 0.5, material: dark }),
      "frame",
      anchorsOf(doorWall).get("opening.0"),
      { offset: { x: 0, y: 0, z: T / 2 } }
    );
  }

  // Shed only behind a false front — otherwise the high edge flies above
  // equal-height walls. Church, hotel, and side-street lots get gables.
  let roofGroup;
  if (lot.falseFront) {
    roofGroup = shedRoof({ w, d, pitch: 0.15, overhang: 0.3, eave: h, highFront: true, material: roof });
  } else {
    roofGroup = gableRoof({ w, d, pitch: 0.5, overhang: 0.45, eave: h, material: roof });
  }
  mate(roofGroup, "base", anchorsOf(st).get("wallTop"));

  // False front at the facade plane, with side returns so the parapet hides
  // the roof from oblique views. Painted `facade` against the dark roof.
  if (lot.falseFront) {
    mate(
      falseFront({
        w,
        d,
        eave: h,
        height: lot.falseFrontHeight || 2.0,
        material: falseFrontWood,
        capMaterial: falseFrontWood
      }),
      "wallSide",
      face(st, "front")
    );
  }

  // Steeple over the entry (gable end, +X), not centered on the ridge.
  if (lot.steeple) {
    mate(steeple({ material: roof }), "gable", anchorsOf(roofGroup).get("gableEnd.front"));
  }

  // The collider gap is cut in the wall that carries the door, which is now the
  // front wall on every lot (see frontOpenings above).
  const doorGap = [{ x: 0, w: 3.0 }];
  collide(st, x, z, lotYaw, [
    { x: 0, z: -d / 2, halfX: w / 2, halfZ: T / 2 },
    { x: 0, z: d / 2, halfX: w / 2, halfZ: T / 2, openings: doorGap },
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
      side: perp,
      toward,
      stone: Boolean(lot.stone),
      dark: Boolean(lot.dark),
      streetDirX,
      streetDirZ,
      group: st
    });
  }

  if (lot.sign) {
    const signSide = perp - toward * (Math.min(w, d) * 0.5 + 1.15);
    const sx = origin.x + c * along - s * signSide;
    const sz = origin.z + s * along + c * signSide;
    const board = boxAt(group, sx, sz, 0.12, 1.1, 0.7, dark, false);
    board.rotation.y = yaw + Math.PI / 2;
  }

  group.add(st);
  return st;
}

/**
 * Height of a storefront plinth, and of the boardwalk deck that meets it.
 * The lot floor is seated on the lot's *lowest* corner, while the deck stands
 * on the terrain in front, which runs up to 0.20 m higher along this street —
 * so the plinth has to cover that rise before any of it reads as a step up.
 * 0.45 left blacksmith with exactly nothing to spare.
 */
const BOARDWALK_LIFT = 0.55;

/**
 * Streets are identified by a counter, not by yaw: Silver Creek runs three
 * rows at yaw 0.15, so yaw cannot tell a lot's own street from a parallel one
 * two blocks over.
 */
let streetSeq = 0;

function street(group, origin, yaw, lots, facadeWood, dark, stone, roof, maps = {}, falseFrontWood = facadeWood) {
  const streetId = streetSeq++;
  // A street with false fronts gets a boardwalk, and every lot on it is seated
  // on a plinth of the same height so the thresholds meet the deck. Without
  // the lift the floors sit in the dirt and a raised deck rides over the
  // doorways; with it, floor and walking surface are one plane.
  const hasWalk = lots.some((l) => l.falseFront);
  const lift = hasWalk ? BOARDWALK_LIFT : 0;
  const side0 = lots[0]?.side || 10;
  const toward0 = Math.sign(side0) || 1;
  // The frontage line: the deepest lot keeps its seat, shallower lots come
  // forward to meet it, so every front wall lands on one line.
  const maxD = Math.max(...lots.map((l) => l.d || 7));
  // Only the boardwalk street needs its frontage squared up, and only it is
  // worth moving: shifting the side streets forward walks their lots into the
  // cross street, where the footprint guard drops them without a word.
  const facade = hasWalk ? side0 - toward0 * (maxD / 2) : null;
  const built = lots.map((lot, i) =>
    buildLot(group, origin, yaw, { ...lot, lotsLen: lots.length }, i, facadeWood, dark, stone, roof, lift, facade, falseFrontWood)
  );
  for (const st of built) {
    if (st) {
      st.userData.streetId = streetId;
    }
  }
  STREETS.push({
    id: streetId,
    origin: { x: origin.x, z: origin.z },
    yaw,
    configured: lots.length,
    built: built.filter(Boolean).length,
    dropped: lots.map((l, i) => (built[i] ? null : l.name || `lot ${i}`)).filter(Boolean)
  });

  if (!hasWalk) {
    return;
  }
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const DECK_W = 4.0;
  // Weathered, silvered plank — deliberately NOT the wall wood, so the walk
  // reads as a structure in front of the buildings rather than their base
  // (the all-wood deck read as the buildings' own foundation). With the real
  // wood texture available, tint it gray so it stays distinct from the walls
  // while the plank relief keeps it a boardwalk, not a curb (audit S4).
  const plank = maps?.wood
    ? makeTexturedMat(maps.wood, { tiling: 1.1, tint: 0xb89870, gain: 1.3, rough: 0.95 })
    : mat(0x8f8577);
  // The deck's inner edge lands on the frontage line, so it meets every
  // threshold with no gap to step over. This only works because the facades
  // are aligned above — against a ragged frontage the gap would vary with
  // each lot's depth (0.2 m to 1.2 m across this street).
  const perp = facade - toward0 * (DECK_W / 2);

  // One segment per lot, each seated on that lot's own floor. A single slab
  // spanning the row cannot be right at both ends: the floors it serves vary
  // by ~0.7 m across this street.
  built.forEach((st, i) => {
    if (!st) {
      return;
    }
    const along = (i - (lots.length - 1) / 2) * 14;
    const x = origin.x + c * along - s * perp;
    const z = origin.z + s * along + c * perp;
    const bw = new THREE.Group();
    bw.add(boardwalk({ length: 14, width: DECK_W, height: BOARDWALK_LIFT, material: plank }));
    // boardwalk() puts its walking surface at height + 0.2 above the group
    // origin, so seat the group that far below the floor to land flush.
    bw.position.set(x, st.userData.placementY - (BOARDWALK_LIFT + 0.2), z);
    // Same frame as the lots: rotation.y = t maps local +X to (cos t, -sin t),
    // and the deck's length runs along +X, so the street axis (cos yaw,
    // sin yaw) needs -yaw.
    bw.rotation.y = -yaw;
    bw.userData.streetYaw = yaw;
    bw.userData.streetId = streetId;
    group.add(bw);
    // The boardwalk is a raised deck, so it needs a surface to stand on for the
    // same reason the bridge did — grounding is terrain height, and without
    // this you walk through the storefront walk at street level. The group is
    // seated so its walking surface lands at the lot floor. Collider yaw is the
    // inverse of three's rotation.y (see resolveCircleBox), and the group is
    // rotated by -yaw, so the collision frame is +yaw.
    addDeckPlatform(x, z, 14 / 2, DECK_W / 2, yaw, st.userData.placementY);
  });
}

export function createLandmarks(scene, maps = {}) {
  ENTERABLE_LOTS.length = 0;
  STREETS.length = 0;
  streetSeq = 0;
  const group = new THREE.Group();
  const hasMaps = Boolean(maps?.adobe && maps?.wood && maps?.siding && maps?.roof && maps?.rock);
  // Town facades are exterior cladding, so they take `siding` (long continuous
  // boards) rather than `wood`, which is a floor texture whose butt joints
  // tiled into a visible grid across every wall. Boardwalks and decking below
  // still use `wood`, which is what it is right for.
  const facadeWood = hasMaps ? makeTexturedMat(maps.siding, { tiling: 1.4, tint: 0xd8c4a4, gain: 1.15 }) : mat(0xc4a574);
  const dark = hasMaps ? makeTexturedMat(maps.siding, { tiling: 1.4, tint: 0xa8845c, gain: 1.0, rough: 0.94 }) : mat(0x6b4226);
  // Weathered, slightly silvered tone for false-front parapets: the boards
  // shared the facade wood and blended into the walls, so the raised front
  // never read as a distinct full-width element (audit S2).
  const falseFrontWood = hasMaps ? makeTexturedMat(maps.siding, { tiling: 1.4, tint: 0x9a8f7c, gain: 0.95, rough: 0.96 }) : mat(0x9a8a74);
  // Town foundations, stone lots, the fort walls and the well were the only
  // stone surfaces left flat; the ranch's identical stonework has been
  // textured since buildings.js got maps. Same params as there.
  const stone = hasMaps
    ? makeTexturedMat(maps.rock, { tiling: 2.2, tint: 0xe0d8c8, gain: 1.35 })
    : mat(0xa89e90);
  const roof = hasMaps ? makeTexturedMat(maps.roof, { tiling: 1.4, tint: 0xc9a87f, gain: 1.35 }) : mat(0x4a3020);
  // Laid boarding — cabin floors. `wood` is the floor texture (short planks);
  // the siding above is for walls, which is the whole walls-vs-floors split.
  const floorWood = hasMaps ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xf0dcc0, gain: 1.9 }) : mat(0xc4a574);
  // Weak triplanar normals on adobe: full-strength plaster read as wood grain
  // on the large mission walls, and none read as a flat painted block (M1).
  // A low normal scale keeps the plaster mottle without the plank look.
  const adobe = hasMaps ? makeTexturedMat(maps.adobe, { tiling: 1.6, tint: 0xfff0d4, gain: 2.3, normalScale: 0.45 }) : mat(0xc4a06a);
  const rust = mat(0xb55220);
  const canvas = mat(0xd2c4a0);
  const ash = mat(0x3a342c);
  const iron = mat(0x4a4a50, { metalness: 0.85, roughness: 0.35 });

  const town = POS.silverCreek;
  const townYaw = 0.15;
  street(group, town, townYaw, [
    { name: "sheriff", w: 9, h: 4.4, d: 8, stone: true, sign: true, enterable: true, falseFront: true, falseFrontHeight: 3.2 },
    { name: "newspaper", w: 7.5, h: 5.4, d: 7, falseFront: true, falseFrontHeight: 3.0, enterable: true },
    { name: "doctor", w: 8, h: 5.2, d: 7.5, falseFront: true, falseFrontHeight: 3.0, enterable: true },
    { name: "hotel", w: 11, h: 8.2, d: 9, gable: true, enterable: true },
    { name: "store", w: 9.5, h: 5.8, d: 8, sign: true, falseFront: true, falseFrontHeight: 3.2, enterable: true },
    { name: "church", w: 8, h: 7.2, d: 8, steeple: true, gable: true, enterable: true },
    { name: "saloon", w: 9, h: 7.4, d: 8, falseFront: true, falseFrontHeight: 3.2, sign: true, enterable: true },
    { name: "blacksmith", w: 12, h: 4.6, d: 9, dark: true, falseFront: true, falseFrontHeight: 3.0, enterable: true },
    { name: "livery", w: 11, h: 4.2, d: 8, dark: true, falseFront: true, falseFrontHeight: 2.8, enterable: true }
  ], facadeWood, dark, stone, roof, maps, falseFrontWood);
  street(group, { x: town.x, z: town.z - 22 }, 0.15, [
    { w: 7, h: 4, d: 6, falseFront: true, falseFrontHeight: 2.8, enterable: true },
    { w: 7, h: 4.2, d: 6, falseFront: true, falseFrontHeight: 2.8, enterable: true },
    { w: 8, h: 4.4, d: 7, falseFront: true, falseFrontHeight: 3.0, enterable: true },
    { w: 7, h: 3.8, d: 6, falseFront: true, falseFrontHeight: 2.6, enterable: true },
    { w: 9, h: 4.6, d: 7, falseFront: true, falseFrontHeight: 3.0, enterable: true }
  ], facadeWood, dark, stone, roof, maps, falseFrontWood);
  street(group, { x: town.x, z: town.z + 20 }, 0.15, [
    { w: 7, h: 4.1, d: 6, enterable: true },
    { w: 8, h: 4.8, d: 7, enterable: true },
    { w: 7, h: 3.9, d: 6, enterable: true },
    { w: 9, h: 5.2, d: 7, stone: true, enterable: true }
  ], facadeWood, dark, stone, roof, maps, falseFrontWood);
  // The cross street meets the main row at its west end, not across the middle
  // of town. Planted at town.x + 16 it ran straight through the storefront row
  // and both side rows, and the footprint guard dropped 3 of its 5 lots without
  // a word — the town simply came out thinner than it was written. Swept along
  // the main axis, -56 is the position nearest the centre where all five stand.
  const crossAlong = -56;
  street(group, {
    x: town.x + Math.cos(townYaw) * crossAlong,
    z: town.z + Math.sin(townYaw) * crossAlong
  }, townYaw + Math.PI / 2, [
    { w: 7, h: 4.3, d: 6, enterable: true },
    { w: 8, h: 5, d: 7, enterable: true },
    { w: 7, h: 4, d: 6, enterable: true },
    { w: 8, h: 4.6, d: 7, enterable: true },
    { w: 7, h: 3.8, d: 6, enterable: true }
  ], facadeWood, dark, stone, roof, maps, falseFrontWood);
  boxAt(group, town.x + 8, town.z + 40, 16, 3.2, 8, rust);

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
  boxAt(group, wagonX, wagonZ, 3.8, 0.28, 1.9, facadeWood, false, 1.05);
  boxAt(group, wagonX - 1.3, wagonZ + 0.95, 0.45, 0.7, 0.45, dark, false);
  boxAt(group, wagonX + 1.3, wagonZ + 0.95, 0.45, 0.7, 0.45, dark, false);
  boxAt(group, wagonX - 1.3, wagonZ - 0.95, 0.45, 0.7, 0.45, dark, false);
  boxAt(group, wagonX + 1.3, wagonZ - 0.95, 0.45, 0.7, 0.45, dark, false);

  const dock = POS.lakeMercy;
  // Dock references WATER, not terrain height.
  const dockY = WATER + 0.1;
  boxOnPlane(group, dock.x - 20, dockY - 0.175, dock.z - 90, 4, 0.35, 18, dark, false);
  registerWaterPlacement("dockDeck", dock.x - 20, dock.z - 90, dockY);
  boxOnPlane(group, dock.x - 28, dockY - 0.15, dock.z - 84, 2.4, 0.3, 10, dark, false);
  registerWaterPlacement("dockPlank", dock.x - 28, dock.z - 84, dockY);
  for (const [dx, dz] of [[-14, -102], [-14, -101.2], [-14, -102.8]]) {
    boxOnPlane(group, dock.x + dx, dockY - 0.1 - 0.16, dock.z + dz, 1.35, 0.32, 3.1, dark, false);
  }
  addBoxCollider(dock.x - 20, dock.z - 90, 2.2, 9.2);

  // Fire watch tower — four-legged braced tower with a lookout cabin.
  const tower = POS.fireWatch;
  const towerH = 18;
  for (const [dx, dz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
    cylOnGround(group, tower.x + dx, tower.z + dz, 0.12, 0.18, towerH, dark, false, undefined, 0, 6);
  }
  for (const [dx, dz] of [[-1.6, 0], [1.6, 0], [0, -1.6], [0, 1.6]]) {
    boxOnGround(group, tower.x + dx, tower.z + dz, 0.1, 0.1, 3.2, dark, false, towerH * 0.5 - 0.05);
  }
  boxOnGround(group, tower.x, tower.z, 4.2, 2.4, 4.2, facadeWood, false, towerH);
  const lookoutRoof = coneOnGround(group, tower.x, tower.z, 3.2, 1.6, roof, false, towerH + 2.4, undefined, 4);
  lookoutRoof.rotation.y = Math.PI / 4;
  addBoxCollider(tower.x, tower.z, 1.8, 1.8);

  // Timber camp — cabins with gable roofs.
  for (const [dx, dz] of [[-12, 8], [14, -6], [0, 16]]) {
    const cx = POS.timberCamp.x + dx;
    const cz = POS.timberCamp.z + dz;
    const cabin = structure({ name: "timberCabin", x: cx, z: cz, yaw: 0, w: 7, d: 5, eave: 3.4, foundation: true, material: stone });
    // The audit camera sits north-east of the camp, so the south-facing doors
    // were hidden behind the cabins (T2). Give each cabin a north door too.
    const north = wallX({ length: 7, extend: true, height: 3.4, thickness: T, material: dark, openings: [{ x: 0, w: 0.92, h: 2.1, fromFloor: 0 }] });
    mate(north, "wallSide", face(cabin, "back"));
    const south = wallX({ length: 7, extend: true, height: 3.4, thickness: T, material: dark, openings: [{ x: 0, w: 0.92, h: 2.1, fromFloor: 0 }] });
    mate(south, "wallSide", face(cabin, "front"));
    const east = wallX({ length: 5, extend: true, height: 3.4, thickness: T, material: dark });
    mate(east, "wallSide", face(cabin, "right"));
    const west = wallX({ length: 5, extend: true, height: 3.4, thickness: T, material: dark });
    mate(west, "wallSide", face(cabin, "left"));
    const cabinRoof = gableRoof({ w: 7, d: 5, pitch: 0.7, overhang: 0.3, eave: 3.4, material: roof });
    mate(cabinRoof, "base", anchorsOf(cabin).get("wallTop"));
    const cabinDoor = doorLeaf({ width: 0.86, height: 2.03, thickness: 0.08, hinge: -0.46, swing: Math.PI * 0.5, material: dark });
    mate(cabinDoor, "frame", anchorsOf(south).get("opening.0"), { offset: { x: 0, y: 0, z: T / 2 } });
    const northDoor = doorLeaf({ width: 0.86, height: 2.03, thickness: 0.08, hinge: -0.46, swing: Math.PI * 0.5, material: dark });
    mate(northDoor, "frame", anchorsOf(north).get("opening.0"), { offset: { x: 0, y: 0, z: -T / 2 } });
    collide(cabin, cx, cz, 0, [
      // The north door got its own opening cut, so its wall segment gets the
      // matching gap — a north door sealed by its own collider was exactly
      // the geometry-open/physics-shut class the aperture check names.
      { x: 0, z: -2.5, halfX: 3.5, halfZ: T / 2, openings: [{ x: 0, w: 1.2 }] },
      { x: 0, z: 2.5, halfX: 3.5, halfZ: T / 2, openings: [{ x: 0, w: 1.2 }] },
      { x: 3.5, z: 0, halfX: T / 2, halfZ: 2.5 },
      { x: -3.5, z: 0, halfX: T / 2, halfZ: 2.5 }
    ]);
    group.add(cabin);
    boxAt(group, cx + 6, cz, 3.2, 1.2, 1.2, facadeWood, true);
  }
  for (const [dx, dz] of [[-22, -10], [20, 12], [8, -18]]) {
    boxAt(group, POS.timberCamp.x + dx, POS.timberCamp.z + dz, 4.8, 0.85, 1.5, facadeWood, true, 0.45 - 0.425);
  }

  // Worked-site dressing (T1): cut stumps with a lighter sawn face, and
  // felled logs lying on their side. The camp previously read as cabins plus
  // bench-like boxes; a stump only reads when its top is a cut face, and a
  // log only when it is horizontal.
  const tc = POS.timberCamp;
  for (let i = 0; i < 10; i += 1) {
    const a = seeded(i * 2.3 + 1) * Math.PI * 2;
    const r = 6 + seeded(i * 4.1 + 2) * 17;
    const sx = tc.x + Math.cos(a) * r;
    const sz = tc.z + Math.sin(a) * r;
    const h = 0.4 + seeded(i * 1.7 + 3) * 0.45;
    const rad = 0.26 + seeded(i * 2.9 + 4) * 0.12;
    const groundY = heightAt(sx, sz);
    const stump = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.9, rad, h, 10), facadeWood);
    stump.position.set(sx, groundY + h / 2, sz);
    stump.rotation.y = seeded(i * 5.3 + 5) * Math.PI;
    stump.castShadow = true;
    group.add(stump);
    const cutFace = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.82, rad * 0.82, 0.04, 10), mat(0xd8c29a));
    cutFace.position.set(sx, groundY + h + 0.02, sz);
    cutFace.castShadow = true;
    group.add(cutFace);
  }
  for (let i = 0; i < 7; i += 1) {
    const a = seeded(i * 3.7 + 7) * Math.PI * 2;
    const r = 5 + seeded(i * 2.2 + 8) * 18;
    const lx = tc.x + Math.cos(a) * r;
    const lz = tc.z + Math.sin(a) * r;
    const len = 2.6 + seeded(i * 1.3 + 9) * 2.4;
    const rad = 0.22 + seeded(i * 4.7 + 10) * 0.12;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.08, len, 10), facadeWood);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = seeded(i * 6.1 + 11) * Math.PI;
    log.position.set(lx, heightAt(lx, lz) + rad * 1.05, lz);
    log.castShadow = true;
    log.receiveShadow = true;
    group.add(log);
  }

  for (let i = 0; i < 6; i += 1) {
    const a = i * 1.1;
    boxAt(group, POS.burn.x + Math.cos(a) * 18, POS.burn.z + Math.sin(a) * 14, 5 + (i % 3), 2.2, 4, ash);
  }

  boxAt(group, POS.barrett.x, POS.barrett.z, 10, 5.5, 8, facadeWood);
  boxAt(group, POS.barrett.x + 12, POS.barrett.z + 4, 8, 4, 6, dark);
  boxAt(group, POS.sheepCamp.x, POS.sheepCamp.z, 6, 2.6, 4, canvas);
  coneOnGround(group, POS.sheepCamp.x + 8, POS.sheepCamp.z + 3, 2.4, 3.4, canvas, true);

  // Fort Grant — four equal walls with a centered gate on the east.
  const fort = POS.fortGrant;
  const fortWallH = 3.2;
  const fortHalf = 14;
  const fortDepth = 12;
  const gateHalf = 3;
  const gateWidth = 6.4;
  // The north wall is TWO meshes with the gateway between them — it used to
  // be one solid 28 m box with only the colliders cut, so the gate posts and
  // lintel stood against a solid wall face: the gate read as decoration, and
  // the fort looked sealed from every side (no way in). The gap matches the
  // 6.4 m collider gateway at the gate node.
  const northSegLen = (28 - gateWidth) / 2;
  // South, east, west — the north wall is built separately below, in two
  // segments with the gateway between them. The east and west walls run
  // 1.2 m past the north/south walls' outer faces on each end: at bare
  // fortDepth*2 they stopped at the footprint corner and the four fort
  // corners showed a 0.6 m step where neither wall reached the outer corner.
  for (const [dx, dz, w, d] of [
    [0, fortDepth, 28, 1.2],
    [-fortHalf, 0, 1.2, fortDepth * 2 + 1.2],
    [fortHalf, 0, 1.2, fortDepth * 2 + 1.2]
  ]) {
    boxOnGround(group, fort.x + dx, fort.z + dz, w, fortWallH, d, stone, false);
  }
  for (const s of [-1, 1]) {
    boxOnGround(
      group,
      fort.x + s * (gateWidth / 2 + northSegLen / 2),
      fort.z - fortDepth,
      northSegLen,
      fortWallH,
      1.2,
      stone,
      false
    );
  }
  // North gate, face-on to the audit camera (heading 155 puts the camera
  // north-east, so -Z is the near wall). The earlier east and south gates were
  // both on the far side and never read (F1).
  for (const gx of [fort.x - gateHalf, fort.x + gateHalf]) {
    boxOnGround(group, gx, fort.z - fortDepth, 0.55, fortWallH + 2.6, 0.55, stone, false);
  }
  boxAt(group, fort.x, fort.z - fortDepth, 6.6, 0.55, 0.55, facadeWood, false, fortWallH + 1.2);
  // The leaves stand OPEN against the gateposts, flat against the INNER wall
  // face: closed leaves plus the full-width wall collider made the fort a
  // physics prison — nav could not thread the gateway at all (the gate
  // corridor check in check-approaches surfaced this as a hard failure).
  // Open leaves leave the gateway centre clear and the gate still reads as a
  // gate (posts + lintel remain). They sat at the wall's centreline before,
  // which the solid north wall hid; now the wall has a gap, so they move
  // inside it where an open door leaf hangs.
  const leafZ = fort.z - fortDepth + 0.6 + 0.05;
  for (const gx of [fort.x - gateHalf - 1.6, fort.x + gateHalf + 1.6]) {
    boxAt(group, gx, leafZ, 3.2, fortWallH + 0.25, 0.08, facadeWood, false);
  }
  addBoxCollider(fort.x, fort.z + fortDepth, 14, 0.7);
  // North wall colliders mirror the two visual segments: 10.8 m of wall each
  // side of the 6.4 m gateway. HALF extents — a 10.8 here draws two 21.6 m
  // boxes that overlap across the gateway and seal the fort shut.
  addBoxCollider(fort.x - (gateWidth / 2 + northSegLen / 2), fort.z - fortDepth, northSegLen / 2, 0.7);
  addBoxCollider(fort.x + (gateWidth / 2 + northSegLen / 2), fort.z - fortDepth, northSegLen / 2, 0.7);
  addBoxCollider(fort.x - fortHalf, fort.z, 0.7, fortDepth + 0.6);
  addBoxCollider(fort.x + fortHalf, fort.z, 0.7, fortDepth + 0.6);
  registerAperture({
    structure: "fortGrant", side: "front", kind: "gate",
    x: fort.x, y: heightAt(fort.x, fort.z - fortDepth) + fortWallH / 2, z: fort.z - fortDepth,
    w: 6.4, h: fortWallH, nx: 0, nz: -1, state: "traversable",
    note: "north gateway between the segment colliders; arrival approach 'gate'"
  });
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
  // The legs lean by rotating the piece GROUP — its origin is the base anchor,
  // so the base stays on its collider at ivX +/- 5 and the top converges.
  // (Rotating the mesh inside the block pivots at the mesh centre, which
  // swung each base 1.74 m outward past its collider and left the lower
  // bracing floating short of the legs.)
  const hfH = 16;
  const hfLean = 0.22;
  const legInset = (y) => 5 - Math.sin(hfLean) * y;
  // The tower straddles a slope: terrain under the west leg runs 1.1 m below
  // and the east leg 0.75 m above the valley-centre sample, so seating every
  // member on ivY floated the west leg's base clear of the ground. Seat the
  // whole frame at the lowest ground any of it stands on instead — the uphill
  // leg buries, like any structure on a slope.
  const hfY = Math.min(
    lowestSeat(ivX - 5, ivZ - 6, 0.64),
    lowestSeat(ivX + 5, ivZ - 6, 0.64),
    heightAt(ivX, ivZ - 6)
  );
  for (const sgn of [-1, 1]) {
    const leg = boxOnPlane(group, ivX + sgn * 5, hfY, ivZ - 6, 0.9, hfH, 0.9, iron, true);
    leg.rotation.z = sgn * hfLean;
  }
  for (const y of [4, 8, 12]) {
    // Rusted cross-bracing: the headframe was all iron, so rust never read
    // distinctly (audit I2). Corroded members at the lower tower give the
    // orange-vs-iron-vs-timber separation. Each brace spans the leg
    // centre-lines at its own height plus 0.25 m of embed into the 0.9 m
    // legs — a fixed-width bar poked out past the leaning legs or, lower
    // down, missed them entirely.
    const half = legInset(y) + 0.25;
    boxOnPlane(group, ivX, hfY + y - 0.2, ivZ - 6, half * 2, 0.4, 0.4, rust, false);
  }
  boxOnPlane(group, ivX, hfY + hfH - 0.35, ivZ - 6, legInset(hfH) * 2 + 2.2, 0.7, 0.7, iron, false);
  const sheave = cylOnPlane(group, ivX, hfY, ivZ - 6, 1.8, 1.8, 0.6, iron, false, undefined, hfH - 0.3, 12);
  sheave.children[0].rotation.x = Math.PI / 2;
  // Shaft collar: 3 m tall so the lowest brace (bottom at hfY + 3.6) passes
  // over it instead of through it — at 4 m the brace buried itself in the
  // block once the frame was seated at the slope's low side.
  boxOnGround(group, ivX, ivZ - 6, 3.5, 3, 3.5, dark, false);
  // Half-extents match the 3.5 x 3.5 base; the previous 2 x 2 drew an
  // invisible 0.25 m collar of solid air around the visual block.
  addBoxCollider(ivX, ivZ - 6, 1.75, 1.75);

  // Stamp mill: an open-sided shed with a visible battery of stamp rods and a
  // camshaft, plus a conical tailings pile beside it.
  const smX = ivX + 18;
  const smZ = ivZ + 4;
  const smY = heightAt(smX, smZ);
  const smShed = structure({ name: "stampMill", x: smX, z: smZ, yaw: 0, w: 16, d: 12, eave: 6, foundation: true, openSided: true, material: stone });
  const smRoof = gableRoof({ w: 16, d: 12, pitch: 0.55, overhang: 0.5, eave: 6, material: roof });
  mate(smRoof, "base", anchorsOf(smShed).get("wallTop"));
  const millFloor = anchorsOf(smShed).get("footing");
  for (let i = 0; i < 6; i += 1) {
    mate(post({ rTop: 0.28, rBot: 0.28, h: 5.5, material: iron, radialSegments: 6 }), "base", millFloor, {
      offset: { x: -6 + i * 2.4 }
    });
  }
  const camshaft = post({ rTop: 0.4, rBot: 0.4, h: 14, material: iron });
  // The mill seats at its lowest footing corner on an eastward-rising slope,
  // so a shaft at floor + 1.4 dove underground at the shed's east end. Ride
  // the shaft just clear of the highest terrain it crosses instead — real
  // camshafts run high, driving the stamp heads from above.
  let camBase = smShed.userData.placementY;
  for (let i = 0; i <= 8; i += 1) {
    camBase = Math.max(camBase, heightAt(smX - 7 + (i * 14) / 8, smZ));
  }
  const camY = camBase + 0.5;
  mate(camshaft, "base", millFloor, { offset: { y: camY - smShed.userData.placementY - 7 } });
  camshaft.children[0].rotation.z = Math.PI / 2;
  // Solid only over its own height, so it blocks anyone walking the shaft
  // line without becoming a wall for anything passing above or below it. The
  // span mirrors the visual cylinder (centre camY, radius 0.4) exactly.
  addOrientedBoxCollider(smX, smZ, 7, 0.4, 0, { minY: camY - 0.4, maxY: camY + 0.4 });
  // No perimeter wall colliders: this shed is open-sided on all four faces (a
  // centre row of posts and the camshaft are the only visual obstructions), so
  // sealing the footprint made the player stop dead on four invisible walls —
  // the same visual/physics mismatch the town lots had. The camshaft collider
  // above is the interior obstacle.
  group.add(smShed);

  // Tailings: a broad conical waste pile, rust-colored, beside the mill. Both
  // piles collide — the second one used to be purely visual, so a 10 m wide,
  // 3.5 m tall pile read as solid while the player walked straight through it.
  coneOnPlane(group, smX + 14, smY, smZ + 8, 7, 5, rust, true, 0, 5.6, 10);
  coneOnPlane(group, smX + 20, smY, smZ + 2, 5, 3.5, rust, true, 0, 4, 8);

  boxAt(group, POS.company.x, POS.company.z, 12, 6, 9, facadeWood);
  // Collapsed cabin ruins scattered across the valley floor. These were three
  // featureless 8 x 3.2 x 5 dark boxes — at player scale they read as giant
  // crates, not buildings. A ruin needs a broken profile: standing walls of
  // differing heights, one wall broken short, the front open with a beam
  // down. Walls collide; the open front means you can walk inside.
  // The middle one used to sit at (+16, +8) — entirely inside the stamp
  // mill's 16 x 12 footprint, wedged under the shed roof beside the post
  // row. Moved west of the headframe, clear of the mill, cones and ruins.
  const ruinShell = (x, z, w, d, hBack, hLeft, hRight) => {
    const y0 = lowestSeat(x, z, Math.hypot(w, d) / 2);
    const wt = 0.3;
    boxOnPlane(group, x, y0, z - d / 2, w, hBack, wt, dark, true);
    boxOnPlane(group, x - w / 2, y0, z, wt, hLeft, d, dark, true);
    boxOnPlane(group, x + w / 2, y0, z - d / 4, wt, hRight, d / 2, dark, true);
    boxOnPlane(group, x - w / 4, y0 + 0.14, z + d / 2 + 0.55, w / 2, 0.28, 0.28, dark, false);
  };
  // The toxic creek (12 m wide) runs through the valley west of the headframe;
  // both western placements stood in or on the bank of its channel. Cluster all
  // three shells on the dry bench east of the creek instead.
  ruinShell(POS.ironValley.x - 8, POS.ironValley.z + 22, 7, 5, 2.4, 2.0, 1.1);
  ruinShell(POS.ironValley.x + 2, POS.ironValley.z + 10, 6, 4.5, 2.0, 1.6, 0.9);
  ruinShell(POS.ironValley.x + 4, POS.ironValley.z + 18, 7.5, 5, 2.6, 2.2, 1.3);

  // Mission — adobe with a campanario on the facade (not a centered cone).
  const mission = POS.mission;
  boxOnGround(group, mission.x, mission.z, 10, 6, 8, adobe, false);
  // Flush roof (no front overhang) so the tower below sits on the facade
  // plane instead of punching through the eave.
  boxOnGround(group, mission.x, mission.z, 10.6, 0.4, 8.0, roof, false, 6);
  // Campanario in stone on the NORTH facade (the side the audit camera faces;
  // north is -Z). The earlier attempts were on +Z — the far side — so the
  // camera saw only the tower's tip above the roofline, which read as a
  // rooftop box (M2). Stone against adobe keeps the tower visible, and it sits
  // off-center (a side campanario) so the golden-hour silhouette cannot read
  // as a centered roof element.
  const campX = mission.x + 2.5;
  boxOnGround(group, campX, mission.z - 4.8, 4.0, 12.0, 1.6, stone, false);
  // Tower entry at the base and a large dark bell chamber above — the cues
  // that make it a campanario rather than a chimney.
  boxOnGround(group, campX, mission.z - 5.15, 1.1, 2.2, 0.4, dark, false, 0.3);
  boxOnGround(group, campX, mission.z - 5.15, 2.6, 3.0, 0.5, dark, false, 6.4);
  boxOnGround(group, campX, mission.z - 4.8, 0.18, 1.5, 0.18, facadeWood, false, 12.0);
  boxOnGround(group, campX, mission.z - 4.8, 0.8, 0.16, 0.16, facadeWood, false, 12.7);
  // Vigas on the west half of the facade (the campanario occupies the east):
  // protruding timber beams give M1 a visible adobe-vs-timber comparison so
  // the walls do not read as flat generic brown.
  const vg = vigas({ w: 5.5, eave: 6, material: facadeWood });
  vg.rotation.y = Math.PI;
  vg.position.set(mission.x - 2.75, heightAt(mission.x - 2.75, mission.z - 4.0), mission.z - 4.0);
  group.add(vg);
  // A full-size timber door on the facade: vigas alone were sub-pixel at the
  // capture distance, so M1 needs a large wood-vs-adobe element that reads.
  boxOnGround(group, mission.x - 1.5, mission.z - 4.12, 1.05, 2.15, 0.09, facadeWood, false);
  boxOnGround(group, mission.x - 2.02, mission.z - 4.15, 0.12, 2.15, 0.12, dark, false);
  boxOnGround(group, mission.x - 0.98, mission.z - 4.15, 0.12, 2.15, 0.12, dark, false);
  boxOnGround(group, mission.x - 1.5, mission.z - 4.15, 1.28, 0.16, 0.12, dark, false, 2.15);
  addBoxCollider(mission.x, mission.z, 5.2, 4.2);
  // The door register: this doorway is dressing on a sealed adobe block, and
  // it says so in the canonical aperture inventory instead of relying on the
  // collider to speak for it.
  registerAperture({
    structure: "mission", side: "front", kind: "door",
    x: mission.x - 1.5, y: heightAt(mission.x - 1.5, mission.z - 4.06) + 1.075, z: mission.z - 4.06,
    w: 1.05, h: 2.15, nx: 0, nz: -1, state: "facade",
    note: "no mission interior; door is facade dressing on the sealed adobe block"
  });
  addBoxCollider(campX, mission.z - 4.8, 2.0, 0.8);
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

  // Plaza dressing: a stone well and a mission cross give the adobe cluster
  // village furniture, so it reads as a settlement rather than repeated boxes
  // (audit E1).
  const wellX = ep.x + 1.5;
  const wellZ = ep.z - 1.0;
  cylOnGround(group, wellX, wellZ, 0.55, 0.7, 0.7, stone, true);
  cylOnGround(group, wellX, wellZ, 0.32, 0.32, 0.9, dark, false, 0.7);
  boxAt(group, wellX, wellZ, 0.12, 1.3, 0.12, facadeWood, false, 1.4);
  boxAt(group, wellX, wellZ, 1.0, 0.1, 0.1, facadeWood, false, 1.9);
  const crossX = ep.x - 6.5;
  const crossZ = ep.z + 4.5;
  boxAt(group, crossX, crossZ, 0.16, 2.6, 0.16, facadeWood, false);
  boxAt(group, crossX, crossZ, 1.2, 0.14, 0.14, facadeWood, false, 1.35);

  // Tribal camp — tipis in a loose ring with per-instance scale and yaw.
  const tipiCount = 7;
  for (let i = 0; i < tipiCount; i += 1) {
    const a = i * (Math.PI * 2 / tipiCount) + seeded(i) * 0.9;
    const r = 7 + seeded(i + 5) * 6;
    const tx = POS.tribal.x + Math.cos(a) * r;
    const tz = POS.tribal.z + Math.sin(a) * r;
    const s = 0.8 + seeded(i * 0.3 + 0.7) * 0.5;
    const tipi = coneOnGround(group, tx, tz, 2.6 * s, 4.2 * s, canvas, true, 0, 1.2 * s);
    tipi.rotation.y = seeded(tx * 0.1 + tz * 0.1) * Math.PI * 2;
  }

  // Cemetery — headstones with jitter.
  for (let i = 0; i < 8; i += 1) {
    const hx = POS.cemetery.x + (i - 2) * 2.2 + (seeded(i) - 0.5) * 0.4;
    const hz = POS.cemetery.z + (seeded(i + 3) - 0.5) * 0.4;
    // Vary size and lean so the row does not read as identical slabs (C1).
    const sw = 0.26 + seeded(i + 9) * 0.2;
    const sh = 0.7 + seeded(i + 11) * 0.7;
    const sd = 0.14 + seeded(i + 13) * 0.1;
    const stone2 = boxOnGround(group, hx, hz, sw, sh, sd, stone, false);
    stone2.rotation.z = (seeded(i + 15) - 0.5) * 0.18;
    stone2.rotation.y = (seeded(i + 7) - 0.5) * 0.4;
  }
  // Hunting cabin — enterable. Two faults with the old build: the roof was
  // seated at heightAt(centre) while the body box seated at
  // lowestSeat(footprint), so on the cabin's slope the eave missed the wall
  // top — floating off it on the downhill side, buried on the uphill side;
  // and the cabin was one solid collider block with the door painted on
  // (aperture "facade"), so the door was decoration and there was no way in.
  // The shell is now kit walls on a footing pad with the roof mated to the
  // wall top, and the north doorway is a real opening: leaf, collider gap,
  // traversable aperture. Chimney, step and porch stay in homestead.js.
  const hc = POS.huntingCabin;
  const hcW = 7;
  const hcD = 5.5;
  const hcH = 3.6;
  const hcSt = structure({
    name: "huntingCabin", habitable: true,
    x: hc.x, z: hc.z, yaw: 0, w: hcW, d: hcD, eave: hcH,
    foundation: true, material: stone
  });
  group.add(hcSt);
  // Door on the north wall (-Z) — the face the audit camera sees (H1).
  // wallX panels run along +X, so the door wall mates to face.back.
  const hcNorth = wallX({
    length: hcW, extend: true, height: hcH, thickness: T, material: dark,
    openings: [{ x: 0, w: 0.92, h: 2.1, fromFloor: 0 }]
  });
  mate(hcNorth, "wallSide", face(hcSt, "back"));
  const hcSouth = wallX({ length: hcW, extend: true, height: hcH, thickness: T, material: dark });
  mate(hcSouth, "wallSide", face(hcSt, "front"));
  const hcEast = wallX({ length: hcD, extend: true, height: hcH, thickness: T, material: dark });
  mate(hcEast, "wallSide", face(hcSt, "right"));
  const hcWest = wallX({ length: hcD, extend: true, height: hcH, thickness: T, material: dark });
  mate(hcWest, "wallSide", face(hcSt, "left"));
  if (anchorsOf(hcNorth).get("opening.0")) {
    mate(
      doorLeaf({ width: 0.86, height: 2.03, thickness: 0.08, hinge: -0.46, swing: Math.PI * 0.5, material: facadeWood }),
      "frame",
      anchorsOf(hcNorth).get("opening.0"),
      { offset: { x: 0, y: 0, z: T / 2 } }
    );
  }
  // The kit's eave soffit closes the open overhang here (33ca19b shipped it
  // as a hand-placed block; the lid now lives inside gableRoof itself, so
  // every building gets it). `soffitMaterial: dark` keeps the approved
  // wall-colour board rather than the default roof material.
  const hcRoof = gableRoof({ w: hcW + 0.4, d: hcD, pitch: 0.62, overhang: 0.5, eave: hcH, material: roof, soffitMaterial: dark });
  mate(hcRoof, "base", anchorsOf(hcSt).get("wallTop"));
  // Floor and a loft ceiling at the standing plane, per the habitable checks.
  // Floor spans the full footprint — an inset floor leaves a strip of
  // exposed terrain between its edge and the wall's inner face (walls centre
  // on the footprint edges, so their inner faces sit at w/2 − T/2).
  const hcFloor = block({ w: hcW, h: 0.08, d: hcD, material: floorWood, role: "floor", extra: { top: 0.08 } });
  mate(hcFloor, "base", anchorsOf(hcSt).get("footing"));
  const hcCeiling = block({ w: hcW - T * 2, h: 0.08, d: hcD - T * 2, material: floorWood, role: "ceiling", extra: { height: 2.7 } });
  mate(hcCeiling, "base", anchorsOf(hcSt).get("footing"), { offset: { y: 2.62 } });
  // Trapper's furnishing — the room must not read as an empty shell once the
  // door opens.
  const hcCot = block({ w: 1.0, h: 0.42, d: 2.1, material: dark });
  mate(hcCot, "base", anchorsOf(hcSt).get("footing"), { offset: { x: -2.2, z: 1.1 } });
  const hcBedroll = block({ w: 0.9, h: 0.14, d: 1.9, material: canvas });
  mate(hcBedroll, "base", anchorsOf(hcSt).get("footing"), { offset: { x: -2.2, y: 0.42, z: 1.1 } });
  const hcTable = block({ w: 1.3, h: 0.76, d: 0.85, material: facadeWood });
  mate(hcTable, "base", anchorsOf(hcSt).get("footing"), { offset: { x: 2.3, z: -1.5 } });
  const hcStool = block({ w: 0.45, h: 0.5, d: 0.45, material: dark });
  mate(hcStool, "base", anchorsOf(hcSt).get("footing"), { offset: { x: 1.5, z: -1.4 } });
  addBoxCollider(hc.x - 2.2, hc.z + 1.1, 0.5, 1.05);
  addBoxCollider(hc.x + 2.3, hc.z - 1.5, 0.65, 0.43);
  // Wall colliders with the door gap cut in the north wall. The 1.1 gap is the
  // 0.92 opening plus slack for the 0.84 m body circle.
  collide(hcSt, hc.x, hc.z, 0, [
    { x: 0, z: -hcD / 2, halfX: hcW / 2, halfZ: T / 2, openings: [{ x: 0, w: 1.1 }] },
    { x: 0, z: hcD / 2, halfX: hcW / 2, halfZ: T / 2 },
    { x: hcW / 2, z: 0, halfX: T / 2, halfZ: hcD / 2 },
    { x: -hcW / 2, z: 0, halfX: T / 2, halfZ: hcD / 2 }
  ]);
  // The doorway needs no site-registered aperture: enumerateApertures derives
  // it from the wall opening itself (huntingCabin.back.door.0), and habitable
  // structures' doors infer traversable — the old hand-registered "facade"
  // record in homestead.js was deleted with the painted door.
  boxAt(group, POS.overlook.x, POS.overlook.z, 8, 0.2, 1.1, dark, false);

  // Cattle — per-instance yaw.
  const cattle = mat(0x5a3a22);
  for (const [dx, dz] of [[-40, 30], [-48, 38], [-36, 44], [80, 20]]) {
    const x = POS.ranch.x + dx;
    const z = POS.ranch.z + dz;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.1, 3, 6), cattle);
    body.rotation.z = Math.PI / 2;
    const yaw = seeded(x * 0.01 + z * 0.01) * Math.PI * 2;
    body.rotation.y = yaw;
    // The capsules used to float ~0.38 m above the ground (centre-anchored,
    // no legs); the grass-grounding fix stopped hiding the gap. Seat the
    // bottom of the body 5 cm above the lowest terrain under its long axis.
    const ax = Math.cos(yaw) * 0.95;
    const az = Math.sin(yaw) * 0.95;
    const minY = Math.min(heightAt(x, z), heightAt(x - ax, z - az), heightAt(x + ax, z + az));
    body.position.set(x, minY + 0.32 + 0.05, z);
    body.castShadow = true;
    group.add(body);
  }
  // Western Range herd — the ranch herd sits 1.5 km away, so the range audit
  // camera saw no cattle at all (W2). The camera stands 60 m EAST of the POI
  // looking west, so the bunch must sit in the foreground (east of the POI),
  // close enough to read, with varied orientation and a lighter hide for
  // contrast against the grass.
  const rangeCattle = mat(0x7a4a28);
  for (const [dx, dz] of [[30, -20], [38, -28], [44, -16], [26, -34], [36, -38], [48, -30], [20, -26]]) {
    const x = POS.westernRange.x + dx;
    const z = POS.westernRange.z + dz;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 1.3, 3, 6), rangeCattle);
    body.rotation.z = Math.PI / 2;
    // Orient by the offset indices, not the world position: the herd sits in
    // a tight area, so world-position seeds were near-identical and every
    // animal faced the same way (audit W2).
    const yaw = seeded(dx * 0.37 + dz * 0.11 + 3) * Math.PI * 2;
    body.rotation.y = yaw;
    // Same grounding as the ranch herd: bottom 5 cm above the lowest terrain
    // along the body axis (was floating ~0.44 m, masked by grass height).
    const ax = Math.cos(yaw) * 0.95;
    const az = Math.sin(yaw) * 0.95;
    const minY = Math.min(heightAt(x, z), heightAt(x - ax, z - az), heightAt(x + ax, z + az));
    body.position.set(x, minY + 0.38 + 0.05, z);
    body.castShadow = true;
    group.add(body);
  }

  scene.add(group);
  return group;
}

/** How deep a flowing creek sits below its own water surface. */
const CREEK_DEPTH = 0.45;

function buildCreekRibbon(creek) {
  const samples = [];
  for (let i = 0; i < creek.pts.length - 1; i += 1) {
    const a = mapToWorld(creek.pts[i][0], creek.pts[i][1]);
    const b = mapToWorld(creek.pts[i + 1][0], creek.pts[i + 1][1]);
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const n = Math.max(1, Math.ceil(len / 1.5));
    for (let j = 0; j < n; j += 1) {
      const t = j / n;
      samples.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    }
  }
  const last = creek.pts[creek.pts.length - 1];
  const end = mapToWorld(last[0], last[1]);
  samples.push({ x: end.x, z: end.z });

  // A short local smoothing window rounds the authored corners without
  // moving the creek away from its carved channel or bridge crossings.
  const raw = samples.map(p => ({ ...p }));
  for (let i = 1; i < samples.length - 1; i += 1) {
    let x = 0, z = 0, weight = 0;
    for (let j = -8; j <= 8; j += 1) {
      const p = raw[Math.max(0, Math.min(raw.length - 1, i + j))];
      const w = 9 - Math.abs(j);
      x += p.x * w; z += p.z * w; weight += w;
    }
    samples[i] = { x: x / weight, z: z / weight };
  }

  // Trim the run to the part outside Lake Mercy. highCountry ends at the lake's
  // centre and silver starts beside it, so both used to lay a ribbon across the
  // open water at exactly the lake's own height — coplanar with it, and shaded
  // as depth 0, which is the bright streak running out over the water.
  const dry = [];
  let run = [];
  for (const p of samples) {
    if (lakeFactor(p.x, p.z) > 0.5) {
      if (run.length > dry.length) {
        dry.length = 0;
        dry.push(...run);
      }
      run = [];
    } else {
      run.push(p);
    }
  }
  if (run.length > dry.length) {
    dry.length = 0;
    dry.push(...run);
  }
  const kept = dry.length > 1 ? dry : samples;

  const halfW = creek.width * (creek.dry ? 0.5 : 0.38);
  const positions = [];
  const depths = [];
  const flows = [];
  const slopes = [];
  const shores = [];
  const across = [-1, -0.8, 0, 0.8, 1];
  let distance = 0;
  for (let i = 0; i < kept.length; i += 1) {
    const p = { ...kept[i] };
    if (i > 0) distance += Math.hypot(p.x - kept[i - 1].x, p.z - kept[i - 1].z);
    const prev = kept[Math.max(0, i - 1)];
    const next = kept[Math.min(kept.length - 1, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl;
    tz /= tl;
    const px = -tz;
    const pz = tx;
    const meander = halfW * 0.22 * Math.sin(distance * 0.035);
    p.x += px * meander;
    p.z += pz * meander;
    const bed = heightAt(p.x, p.z);
    const e = 3;
    const slope = Math.hypot(heightAt(p.x + e, p.z) - bed, heightAt(p.x, p.z + e) - bed) / (2 * e);

    // A creek's surface sits on its own bed. This used to be the constant
    // WATER — the lake's plane — for every creek on the map, so granite (bed
    // 55-80 m) and toxic (30-56 m) had their water drawn 40-65 m underground,
    // and the only places a ribbon showed were where terrain happened to dip
    // to y=13. Those emergent slivers, a flat sheet clipped by hillside, are
    // the hard-edged bright shapes: not creeks at all, just the parts of a
    // buried plane that poked out. Near the lake the surface eases to WATER so
    // a creek still meets it flush.
    const lake = lakeFactor(p.x, p.z);
    const surface = (bed + CREEK_DEPTH) * (1 - lake) + WATER * lake;

    for (const s of across) {
      // Different phases on each bank avoid a uniform hose-like outline.
      const phase = s < 0 ? 1.7 : 4.2;
      let bankWidth = halfW * (1 + 0.22 * Math.sin(distance * 0.045 + phase)
        + 0.1 * Math.sin(distance * 0.13 + phase * 2));
      // End the ribbon at the bank, rather than letting coarse terrain
      // triangles cut through it before its opacity can fade out.
      const side = s < 0 ? -1 : 1;
      if (!creek.dry && meshHeightAt(p.x + px * bankWidth * side, p.z + pz * bankWidth * side) > surface - 0.04) {
        let lo = 0, hi = bankWidth;
        for (let j = 0; j < 10; j += 1) {
          const mid = (lo + hi) / 2;
          if (meshHeightAt(p.x + px * mid * side, p.z + pz * mid * side) < surface - 0.04) lo = mid;
          else hi = mid;
        }
        bankWidth = lo;
      }
      const vx = p.x + px * bankWidth * s;
      const vz = p.z + pz * bankWidth * s;
      shores.push((1 - Math.abs(s)) * bankWidth);
      positions.push(vx, creek.dry ? bed + 0.06 : surface, vz);
      // Depth per vertex against the real bed under it, so the channel shades
      // deep mid-stream and shallows out where the banks rise into it.
      depths.push(creek.dry ? 0 : Math.max(0, surface - heightAt(vx, vz)));
      flows.push(tx, tz);
      slopes.push(slope);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("aDepth", new THREE.Float32BufferAttribute(depths, 1));
  geo.setAttribute("aFlow", new THREE.Float32BufferAttribute(flows, 2));
  geo.setAttribute("aSlope", new THREE.Float32BufferAttribute(slopes, 1));
  geo.setAttribute("aShore", new THREE.Float32BufferAttribute(shores, 1));
  const indices = [];
  for (let i = 0; i < kept.length - 1; i += 1) {
    for (let j = 0; j < across.length - 1; j += 1) {
      const a = i * across.length + j;
      const b = a + across.length;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Lake shoreline sampled against the rendered terrain, with dense edge rings
 * for a narrow shallow-water transition and a softly irregular outline. */
const LAKE_RIM_SEGMENTS = 1024;

function buildLakeGeometry() {
  // Trace the actual terrain intersection, then retreat slightly into the
  // shallows. This gives the water its own feathered boundary before the
  // coarse terrain triangles can clip it into a hard sawtooth.
  const radii = [];
  for (let i = 0; i < LAKE_RIM_SEGMENTS; i += 1) {
    const a = i / LAKE_RIM_SEGMENTS * Math.PI * 2;
    const x = Math.cos(a) * LAKE_NOMINAL_RX;
    const z = -Math.sin(a) * LAKE_NOMINAL_RZ;
    let lo = 0;
    let hi = lakeShoreRadius(-a) * 1.2;
    for (let j = 0; j < 16; j += 1) {
      const mid = (lo + hi) / 2;
      if (meshHeightAt(POS.lakeMercy.x + x * mid, POS.lakeMercy.z + z * mid) < WATER) lo = mid;
      else hi = mid;
    }
    radii.push(lo);
  }
  // Smooth an inward envelope, not min(raw, average): that min operation
  // retained every convex terrain-grid corner. Eroding first keeps the
  // filtered curve submerged without reintroducing the raw polygon edges.
  const radiusAt = i => radii[(i + LAKE_RIM_SEGMENTS) % LAKE_RIM_SEGMENTS];
  const inset = radii.map((_, i) => {
    let r = Infinity;
    for (let j = -16; j <= 16; j += 1) r = Math.min(r, radiusAt(i + j));
    return r;
  });
  const smoothRadii = inset.map((_, i) => {
    let sum = 0, weights = 0;
    for (let j = -16; j <= 16; j += 1) {
      const weight = 17 - Math.abs(j);
      sum += inset[(i + j + LAKE_RIM_SEGMENTS) % LAKE_RIM_SEGMENTS] * weight;
      weights += weight;
    }
    return sum / weights;
  });
  const positions = [0, 0, 0];
  const depths = [7];
  const shores = [100];
  const indices = [];
  const rings = [0.3, 0.6, 0.85, 0.96, 0.992, 1];
  for (const t of rings) {
    for (let i = 0; i <= LAKE_RIM_SEGMENTS; i += 1) {
      const k = i % LAKE_RIM_SEGMENTS;
      const a = k / LAKE_RIM_SEGMENTS * Math.PI * 2;

      const retreat = 3.5 + 2 * Math.sin(a * 17 + 0.7)
        + 0.9 * Math.sin(a * 41 - 1.2) + 0.5 * Math.sin(a * 83);
      const rim = smoothRadii[k] - retreat / LAKE_NOMINAL_RX;
      positions.push(Math.cos(a) * rim * t, Math.sin(a) * rim * t, 0);
      depths.push(7 * Math.pow(1 - t, 0.8));
      shores.push((1 - t) * rim * LAKE_NOMINAL_RX);
    }
  }
  const stride = LAKE_RIM_SEGMENTS + 1;
  for (let i = 0; i < LAKE_RIM_SEGMENTS; i += 1) indices.push(0, 1 + i, 2 + i);
  for (let r = 0; r < rings.length - 1; r += 1) {
    for (let i = 0; i < LAKE_RIM_SEGMENTS; i += 1) {
      const a = 1 + r * stride + i;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("aDepth", new THREE.Float32BufferAttribute(depths, 1));
  geo.setAttribute("aShore", new THREE.Float32BufferAttribute(shores, 1));
  geo.setIndex(indices);
  geo.computeVertexNormals();
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
  lake.scale.set(LAKE_NOMINAL_RX, LAKE_NOMINAL_RZ, 1);
  lake.position.set(POS.lakeMercy.x, WATER, POS.lakeMercy.z);
  group.add(lake);

  // The mud band used to be a RingGeometry(0.92, 1.1) — a perfect annulus, and
  // the hardest edge in the whole scene. The water plane now runs up into
  // rising ground, so there is no exposed lake bed left for it to cover.

  const creekMat = fallback
    ? createWaterFallbackMaterial()
    : createWaterMaterial(normalMap, { depthSource: "attribute", screenRefraction, foamScale: 0.12, refractBase: 0.55 });
  const toxicMat = fallback
    ? createWaterFallbackMaterial(true)
    : createWaterMaterial(normalMap, { toxic: true, depthSource: "attribute", screenRefraction, foamScale: 0.12, refractBase: 0.55 });
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
