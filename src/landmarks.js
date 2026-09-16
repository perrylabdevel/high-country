import * as THREE from "three/webgpu";
import { heightAt } from "./world.js";
import { meshHeightAt } from "./heightfield.js";
import { lakeWaterRimRadius, lakeWaterSignedDistance, LAKE_WATER_RIM_SEGMENTS } from "./lakeWaterline.js";
import { addBoxCollider, addDeckPlatform } from "./collision.js";
import { POS, WATER, mapToWorld, CREEKS, lakeFactor, LAKE_NOMINAL_RX, LAKE_NOMINAL_RZ, TRIBAL_CAMP } from "./map.js";
import {
  makeWaterNormalTexture,
  createWaterFallbackMaterial,
  createWaterMaterial
} from "./materials/waterMaterial.ts";
import {
  structure,
  floorClearLift,
  floorDeck,
  SHELL_FLOOR_TOP,
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
  lowestSeat
} from "./buildings/kit.js";
import { mate, anchorsOf, face } from "./buildings/anchors.js";
import { registerAperture } from "./buildings/apertures.js";
import { makeTexturedMat } from "./materials/texturedMat.ts";
import { addPropSpot, clearPropSpots } from "./propSpots.js";
import { createMission } from "./mission.js";
import { attachSaloon, SALOON } from "./buildings/saloon.js";
import { attachSheriff, SHERIFF_REMODEL } from "./buildings/sheriff.js";
import { attachStore, STORE } from "./buildings/store.js";

function mat(color, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness: 0.88, ...extra });
}

function boxAt(group, x, z, w, h, d, material, collide = true, yOff = 0) {
  return boxOnGround(group, x, z, w, h, d, material, collide, yOff);
}

export const ENTERABLE_LOTS = [];

/** The fire lookout's offset from its POI, clear of the two logging roads. */
export const TOWER_OFFSET = { dx: 8, dz: -12 };

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
export function adobeHouse(parent, { name, x, z, yaw, w, d, eave, adobe, roofMat, dark }) {
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
// The ranch and adobe glass, but storefront windows stack two panes (facade
// wall and interior shell), so each is half as dense: together they match.
let _storeGlass = null;
export function storeGlass() {
  _storeGlass ??= mat(0xcfe0d8, {
    transparent: true, opacity: 0.18, emissive: 0x6a4018, emissiveIntensity: 0.12, roughness: 0.15, metalness: 0.0
  });
  return _storeGlass;
}

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

  // An enterable lot's floor slab (interiors.js addShell, top 0.08) has to
  // clear the ground under it. The boardwalk plinth already does; off the
  // boardwalk a lot seated on its lowest corner had the slope come up through
  // the boards.
  const seatLift = lot.enterable ? Math.max(lift, floorClearLift(x, z, w, d, lotYaw, SHELL_FLOOR_TOP)) : lift;
  const st = structure({
    name: lot.name || "streetLot",
    habitable: Boolean(lot.enterable),
    x, z, yaw: lotYaw, w, d, eave: h, foundation: true, material: stone, lift: seatLift
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
  const frontOpenings = [{ x: 0, w: 0.92, h: 2.1, fromFloor: 0 }, ...(lot.windows || [])];
  const front = wallX({ length: w, extend: true, height: h, thickness: T, material: bodyMat, openings: frontOpenings });
  mate(front, "wallSide", face(st, "front"));
  const backOpenings = lot.backWindows || [];
  const back = wallX({ length: w, extend: true, height: h, thickness: T, material: bodyMat, openings: backOpenings });
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

  for (const [wall, list] of [[front, frontOpenings], [back, backOpenings]]) {
    list.forEach((o, n) => {
      if (o.fromFloor >= 0.5 && o.class !== "door") {
        mate(
          glazing({ width: o.w, height: o.h, thickness: 0.1, material: storeGlass() }),
          "frame",
          anchorsOf(wall).get(`opening.${n}`),
          { offset: { x: 0, y: 0, z: -T / 2 } }
        );
      }
    });
  }

  // Off the boardwalk, a lot lifted to clear its slope can stand its sill
  // well above the street (0.64 m on the cross street) — a knee-high doorway
  // over a bare skirt. Give it a flight of plank steps down to the ground,
  // walkable as a ramp through the tread centres.
  if (lift === 0 && seatLift > 0) {
    const TREAD = 0.32;
    const STOOP_W = 1.5;
    const sill = st.userData.placementY + SHELL_FLOOR_TOP;
    const groundUnder = (lz) => Math.min(...[-STOOP_W / 2, STOOP_W / 2].map((lx) =>
      heightAt(x + Math.cos(lotYaw) * lx + Math.sin(lotYaw) * lz, z - Math.sin(lotYaw) * lx + Math.cos(lotYaw) * lz)));
    const z0 = d / 2 + T / 2;
    const risers = Math.ceil((sill - groundUnder(z0 + TREAD)) / 0.2);
    if (risers >= 2) {
      const landing = groundUnder(z0 + (risers - 0.5) * TREAD);
      const rise = (sill - landing) / risers;
      const bottom = Math.min(groundUnder(z0), landing) - st.userData.placementY - 0.1;
      for (let j = 0; j < risers - 1; j += 1) {
        const top = SHELL_FLOOR_TOP - (j + 1) * rise;
        const tread = block({ w: STOOP_W, h: top - bottom, d: TREAD, material: dark, role: "steps", extra: { top } });
        mate(tread, "base", anchorsOf(st).get("footing"), { offset: { y: bottom, z: z0 + (j + 0.5) * TREAD } });
      }
      floorDeck(st, -STOOP_W / 2, STOOP_W / 2, z0, z0 + (risers - 1) * TREAD,
        SHELL_FLOOR_TOP - rise / 2, SHELL_FLOOR_TOP - (risers - 0.5) * rise);
    }
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
      windows: lot.windows || [],
      backWindows: lot.backWindows || [],
      storeys: Boolean(lot.storeys),
      streetDirX,
      streetDirZ,
      group: st
    });
  }

  if (lot.sign) {
    const signSide = perp - toward * (Math.min(w, d) * 0.5 + 1.15);
    const sx = origin.x + c * along - s * signSide;
    const sz = origin.z + s * along + c * signSide;
    addPropSpot("landmarks", { kind: "sign_stand", x: sx, z: sz, yaw });
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
    const walk = boardwalk({ length: 14, width: DECK_W, height: BOARDWALK_LIFT, material: plank });
    bw.add(walk);
    // Seating is load-bearing and stays as it is: this lands the plank surface
    // flush with the storefront door sills, which sit 0.05 above the lot floor
    // (check:buildings asserts that join). It is the DECK REGISTRATION below
    // that has to follow the geometry, not the other way round.
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
    // Register the surface people actually stand on, taken from the part
    // rather than restated. Registering `placementY` — the lot floor — put the
    // deck 0.05 below the planks that render on top of it, and every
    // townsperson stood 5 cm inside the boardwalk.
    addDeckPlatform(
      x, z, 14 / 2, DECK_W / 2, yaw,
      bw.position.y + walk.userData.surfaceOffset
    );
  });
}

export function createLandmarks(scene, maps = {}) {
  ENTERABLE_LOTS.length = 0;
  clearPropSpots("landmarks");
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
  const iron = mat(0x4a4a50, { metalness: 0.85, roughness: 0.35 });

  const town = POS.silverCreek;
  const townYaw = 0.15;
  street(group, town, townYaw, [
    { name: "sheriff", w: 9, h: 4.4, d: 8, stone: true, sign: true, enterable: true, falseFront: true, falseFrontHeight: 3.2, windows: SHERIFF_REMODEL.frontWindows },
    { name: "newspaper", w: 7.5, h: 5.4, d: 7, falseFront: true, falseFrontHeight: 3.0, enterable: true },
    { name: "doctor", w: 8, h: 5.2, d: 7.5, falseFront: true, falseFrontHeight: 3.0, enterable: true },
    { name: "hotel", w: 11, h: 8.2, d: 9, gable: true, enterable: true },
    // Like the saloon, the store's facade is Blender-authored
    // (src/buildings/store.js) and carries its own painted sign board, so it
    // takes no street sign stand.
    { name: "store", w: 9.5, h: 5.8, d: 8, falseFront: true, falseFrontHeight: 3.2, enterable: true, windows: STORE.frontWindows },
    { name: "church", w: 8, h: 7.2, d: 8, steeple: true, gable: true, enterable: true },
    // The saloon's facade is Blender-authored (src/buildings/saloon.js) and
    // carries its own painted sign, so it takes no street sign stand.
    { name: "saloon", w: 9, h: 7.4, d: 8, falseFront: true, falseFrontHeight: 3.2, enterable: true, windows: SALOON.FRONT, backWindows: SALOON.BACK, storeys: true },
    { name: "blacksmith", w: 12, h: 4.6, d: 9, dark: true, falseFront: true, falseFrontHeight: 3.0, enterable: true },
    { name: "livery", w: 11, h: 4.2, d: 8, dark: true, falseFront: true, falseFrontHeight: 2.8, enterable: true }
  ], facadeWood, dark, stone, roof, maps, falseFrontWood);
  const saloonLot = ENTERABLE_LOTS.find((l) => l.name === "saloon");
  if (saloonLot) {
    attachSaloon(saloonLot, maps);
  }
  const sheriffLot = ENTERABLE_LOTS.find((l) => l.name === "sheriff");
  if (sheriffLot) {
    attachSheriff(sheriffLot, maps);
  }
  const storeLot = ENTERABLE_LOTS.find((l) => l.name === "store");
  if (storeLot) {
    attachStore(storeLot, maps);
  }
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

  // Hitching rails at the street edge of the boardwalk, one per pair of lots.
  // These used to be lone 1.15 m posts at perp 3.4 — the middle of the
  // walking deck — and seated on heightAt, the dirt under it, so they stood
  // shin-high in the middle of the walkway (the dismount arrival at along -8
  // pointed at a stump, not a rail). A rail lives at the deck edge: posts in
  // the street just off the planks (perp 1.25), horses tied in the street
  // outside them, the bar running parallel to the deck line.
  //
  // The rails themselves are the authored hitch_rail model (props.js draws
  // and collides them); this records where they stand. yaw is three's
  // rotation.y: -townYaw maps the model's long +X axis onto the street axis.
  const hitchC = Math.cos(townYaw);
  const hitchS = Math.sin(townYaw);
  const railAt = (originDz, along, perp) => addPropSpot("landmarks", {
    kind: "hitch_rail",
    x: town.x + hitchC * along - hitchS * perp,
    z: town.z + originDz + hitchS * along + hitchC * perp,
    yaw: -townYaw,
    collide: true
  });
  for (const along of [-28, -8, 12, 32]) {
    railAt(0, along, 1.25);
  }
  // The north row is a second false-front street with its own boardwalk —
  // Silver Creek has two decks. Its storefronts face north onto their own
  // street (facade line perp 6.5, deck 2.5..6.5 in that street's frame), so
  // its rails stand at that deck's street edge by the same pattern.
  for (const along of [-21, 7, 35]) {
    railAt(-22, along, 1.25);
  }

  const dock = POS.lakeMercy;
  // Dock references WATER, not terrain height.
  const dockY = WATER + 0.1;
  // The pier (landmark kit) runs north into the lake from the south shore
  // below the 'lakeMercy.dock' arrival (dx 60, dz 392; the drawn waterline,
  // lakeWaterSignedDistance, crosses dz ~359), deck top on WATER, walkable as a deck platform. The old slabs
  // stood 90 m out in open water with no way onto them. A short walk along
  // the bank to the west, two rowboats tied off the pier's east side.
  const pier = { x: dock.x + 60, z: dock.z + 352 };
  const pierTop = dockY + 0.175;
  addPropSpot("landmarks", { kind: "dock_pier", x: pier.x, z: pier.z, y: pierTop, yaw: Math.PI / 2, water: true, cluster: "lake" });
  registerWaterPlacement("dockDeck", pier.x, pier.z, dockY);
  addDeckPlatform(pier.x, pier.z, 2, 9, 0, pierTop);
  const walk = { x: dock.x + 50, z: dock.z + 358 };
  addPropSpot("landmarks", { kind: "dock_walk", x: walk.x, z: walk.z, y: dockY + 0.15, yaw: 0, water: true, cluster: "lake" });
  registerWaterPlacement("dockPlank", walk.x, walk.z, dockY);
  addDeckPlatform(walk.x, walk.z, 5, 1.2, 0, dockY + 0.15);
  for (const [dx, dz, yaw] of [[3.2, -4.5, Math.PI / 2 + 0.06], [3.4, -8.2, Math.PI / 2 - 0.1]]) {
    addPropSpot("landmarks", { kind: "rowboat", x: pier.x + dx, z: pier.z + dz, y: WATER - 0.14, yaw, water: true, cluster: "lake" });
  }

  // Fire watch tower — four-legged braced tower with a lookout cabin.
  const tower = POS.fireWatch;
  // Authored 18 m lookout (landmark kit): legs at +-2.1 m, ladder up the +Z face.
  // logA runs through the POI and logB ends on it, so the tower stands on the
  // flat 13 m north-east of the junction, its ladder face toward the arrival.
  addPropSpot("landmarks", { kind: "lookout_tower", x: tower.x + TOWER_OFFSET.dx, z: tower.z + TOWER_OFFSET.dz, yaw: -0.38, cluster: "fireWatch" });
  addBoxCollider(tower.x + TOWER_OFFSET.dx, tower.z + TOWER_OFFSET.dz, 2.25, 2.25);

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
  }

  // Worked-site dressing (T1) — stumps, log decks, the sawbuck, woodpiles
  // and the crew's tents — is props (props.js TIMBER_CAMP). The box lumber
  // piles, stumps and logs that stood here were placed without the three
  // roads that meet at the camp: five of them sat on logA, logB or
  // silverNorth.

  // Burnt cabin remains (landmark kit, 6 x 4 m) with their low walls solid.
  for (let i = 0; i < 6; i += 1) {
    // The fourth stood on silverNorth, which crosses the Burn 2 m off centre.
    const a = i === 3 ? 2.75 : i * 1.1;
    const x = POS.burn.x + Math.cos(a) * 18;
    const z = POS.burn.z + Math.sin(a) * 14;
    const sx = (5 + (i % 3)) / 6;
    addPropSpot("landmarks", { kind: "burnt_ruin", x, z, yaw: 0, sx, cluster: "burn" });
    const hw = 3 * sx;
    addBoxCollider(x, z - 2, hw, 0.16);
    addBoxCollider(x, z + 2, hw, 0.16);
    addBoxCollider(x - hw, z, 0.16, 2);
    addBoxCollider(x + hw, z, 0.16, 2);
  }

  boxAt(group, POS.barrett.x, POS.barrett.z, 10, 5.5, 8, facadeWood);
  boxAt(group, POS.barrett.x + 12, POS.barrett.z + 4, 8, 4, 6, dark);
  // The sheep camp (wagon, pen, fire) is props (props.js).

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
  //
  // Two stone pylons flank the gateway, their inner faces flush with the
  // 6.4 m collider gap (±3.2), so the corridor keeps its full checked width
  // — the old posts stood at ±3.0 and ate 0.275 m into it on each side. They
  // rise 1.4 m above the wall under a projecting cap, which is what makes the
  // entrance read as a built structure instead of the wall simply stopping.
  // The cap covers the pylon top: the previous posts ran 0.85 m past the
  // lintel with nothing on them.
  for (const s of [-1, 1]) {
    boxOnGround(group, fort.x + s * 3.85, fort.z - fortDepth, 1.3, fortWallH + 1.4, 1.5, stone, false);
    boxOnGround(group, fort.x + s * 3.85, fort.z - fortDepth, 1.6, 0.28, 1.8, stone, false, fortWallH + 1.4);
  }
  // Layered timber header between the pylons: a heavy beam bearing to within
  // 0.15 m of each pylon's outer face, with a lighter one a hand's width
  // below it. The single bare 6.6 m stick read as scaffolding.
  boxAt(group, fort.x, fort.z - fortDepth, 8.7, 0.5, 0.5, facadeWood, false, fortWallH + 0.9);
  boxAt(group, fort.x, fort.z - fortDepth, 7.6, 0.3, 0.4, dark, false, fortWallH + 0.5);
  // The leaves stand OPEN against the inner wall face: closed leaves plus the
  // full-width wall collider made the fort a physics prison — nav could not
  // thread the gateway at all (the gate corridor check in check-approaches
  // surfaced this as a hard failure). They used to be single flat slabs flush
  // with the wall, which read as patched wall, not doors; each leaf is now a
  // small plank gate — vertical planks, two ledges and a diagonal brace, iron
  // hinges on the pylon edge — standing a hand's width proud of the wall so
  // its own thickness catches light.
  const leafZ = fort.z - fortDepth + 0.6 + 0.05;
  const leafW = 3.1;
  const leafH = fortWallH - 0.1;
  const braceAngle = Math.atan2(leafH - 0.9, leafW);
  const braceLen = Math.hypot(leafH - 0.9, leafW) + 0.3;
  for (const s of [-1, 1]) {
    const leaf = new THREE.Group();
    for (let i = 0; i < 6; i += 1) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(0.5, leafH, 0.07), facadeWood);
      plank.position.set(-1.3 + i * 0.52, leafH / 2, 0);
      plank.castShadow = true;
      leaf.add(plank);
    }
    for (const ly of [0.45, leafH - 0.45]) {
      const ledge = new THREE.Mesh(new THREE.BoxGeometry(leafW, 0.16, 0.05), dark);
      ledge.position.set(0, ly, 0.03);
      ledge.castShadow = true;
      leaf.add(ledge);
    }
    const brace = new THREE.Mesh(new THREE.BoxGeometry(braceLen, 0.14, 0.05), dark);
    brace.position.set(0, leafH / 2, 0.06);
    brace.rotation.z = s * braceAngle;
    brace.castShadow = true;
    leaf.add(brace);
    for (const hy of [0.55, leafH / 2, leafH - 0.55]) {
      const hinge = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), iron);
      hinge.position.set(-s * 1.62, hy, 0.02);
      leaf.add(hinge);
    }
    leaf.position.set(fort.x + s * (3.25 + leafW / 2), heightAt(fort.x + s * (3.25 + leafW / 2), leafZ), leafZ);
    group.add(leaf);
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

  // Iron Valley is the miners' camp. The headframe, stamp mill and tailings
  // that stood here (placed at the region centre only so the audit camera
  // framed them, 160 m from any road or rail) now stand where the ore is:
  // at Silver Strike Mines and beside the rail at the stamp mill
  // (src/industry.js). The camp's tents and stores are props (props.js).
  // Collapsed cabin ruins scattered across the valley floor. These were three
  // featureless 8 x 3.2 x 5 dark boxes — at player scale they read as giant
  // crates, not buildings. A ruin needs a broken profile: standing walls of
  // differing heights, one wall broken short, the front open with a beam
  // down. Walls collide; the open front means you can walk inside.
  // The middle one used to sit at (+16, +8), inside the old valley stamp
  // mill's footprint; the mill has since moved to its rail site.
  // The shell is the authored cabin_ruin (landmark kit, 7 x 5 m, scaled);
  // its standing walls keep their colliders.
  const ruinShell = (x, z, w, d) => {
    const s = w / 7;
    // Iron Valley's bench falls ~0.18 across X: sit on the centre and let
    // the deep stone sill carry the downhill side.
    const y0 = heightAt(x, z) - 0.3;
    addPropSpot("landmarks", { kind: "cabin_ruin", x, z, y: y0, yaw: 0, s, seat: "free", cluster: "ironValley" });
    const wt = 0.3 * s;
    addBoxCollider(x, z - d / 2, w / 2, wt / 2);
    addBoxCollider(x - w / 2, z, wt / 2, d / 2);
    addBoxCollider(x + w / 2, z - d / 4, wt / 2, d / 4);
  };
  // The toxic creek (12 m wide) runs through the valley west of the headframe;
  // both western placements stood in or on the bank of its channel. Cluster all
  // three shells on the dry bench east of the creek instead.
  ruinShell(POS.ironValley.x - 8, POS.ironValley.z + 22, 7, 5);
  ruinShell(POS.ironValley.x + 2, POS.ironValley.z + 10, 6, 4.3);
  ruinShell(POS.ironValley.x + 4, POS.ironValley.z + 18, 7.5, 5.35);

  // La Esperanza Mission is its own builder (mission.js), built here so
  // every check that builds the landmarks sees its walls and colliders.
  createMission(group, maps);
  // Viper's Roost and Hidden Canyon are outlaw camps of props (props.js).

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
  // Off the foothills trail that crosses the plaza (it stood 1.8 m from the
  // trail's centreline, in the tread).
  const wellX = ep.x + 5;
  const wellZ = ep.z - 2;
  addPropSpot("landmarks", { kind: "well", x: wellX, z: wellZ, yaw: 0.3, collide: true, cluster: "elPaso" });
  const crossX = ep.x - 6.5;
  const crossZ = ep.z + 4.5;
  addPropSpot("landmarks", { kind: "plaza_cross", x: crossX, z: crossZ, yaw: 0.4, collide: true, cluster: "elPaso" });

  // Tribal camp — tipis in a loose ring with per-instance scale and yaw.
  const tipiCount = 7;
  for (let i = 0; i < tipiCount; i += 1) {
    const a = i * (Math.PI * 2 / tipiCount) + seeded(i) * 0.9;
    const r = 7 + seeded(i + 5) * 6;
    const tx = POS.tribal.x + TRIBAL_CAMP.dx + Math.cos(a) * r;
    const tz = POS.tribal.z + TRIBAL_CAMP.dz + Math.sin(a) * r;
    const s = 0.8 + seeded(i * 0.3 + 0.7) * 0.5;
    // Door toward the ring's hearth, give or take.
    const yaw = Math.atan2(-Math.cos(a), -Math.sin(a)) + (seeded(tx * 0.1 + tz * 0.1) - 0.5) * 0.6;
    addPropSpot("landmarks", { kind: "tipi", x: tx, z: tz, yaw, s, collide: true, cluster: "tribal" });
  }

  // Cemetery — headstones with jitter.
  for (let i = 0; i < 8; i += 1) {
    const hx = POS.cemetery.x + (i - 2) * 2.2 + (seeded(i) - 0.5) * 0.4;
    const hz = POS.cemetery.z + (seeded(i + 3) - 0.5) * 0.4;
    // Vary size and lean so the row does not read as identical slabs (C1).
    const sw = 0.26 + seeded(i + 9) * 0.2;
    const sh = 0.7 + seeded(i + 11) * 0.7;
    addPropSpot("landmarks", {
      kind: i % 3 === 1 ? "headstone_cross" : "headstone",
      x: hx, z: hz, s: Math.min(1.3, Math.max(0.8, sh / 0.9 + (sw - 0.36))),
      yaw: (seeded(i + 7) - 0.5) * 0.4, pitch: (seeded(i + 15) - 0.5) * 0.18, cluster: "cemetery"
    });
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
  // Lifted so the slope under the cabin (0.43 m corner to corner) stays under
  // the floorboards instead of coming up through them.
  const hcSt = structure({
    name: "huntingCabin", habitable: true,
    x: hc.x, z: hc.z, yaw: 0, w: hcW, d: hcD, eave: hcH,
    foundation: true, material: stone,
    lift: floorClearLift(hc.x, hc.z, hcW, hcD, 0, SHELL_FLOOR_TOP)
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
  const hcFloor = block({ w: hcW, h: SHELL_FLOOR_TOP, d: hcD, material: floorWood, role: "floor", extra: { top: SHELL_FLOOR_TOP } });
  mate(hcFloor, "base", anchorsOf(hcSt).get("footing"));
  // Walkable from the inner wall faces out through the north doorway.
  floorDeck(hcSt, -(hcW / 2 - T / 2), hcW / 2 - T / 2, -(hcD / 2 + T / 2), hcD / 2 - T / 2, SHELL_FLOOR_TOP);
  const hcCeiling = block({ w: hcW - T * 2, h: 0.08, d: hcD - T * 2, material: floorWood, role: "ceiling", extra: { height: 2.7 } });
  mate(hcCeiling, "base", anchorsOf(hcSt).get("footing"), { offset: { y: 2.62 } });
  // Trapper's furnishing — the room must not read as an empty shell once the
  // door opens.
  const hcFloorY = hcSt.userData.placementY + SHELL_FLOOR_TOP;
  const hcFurnish = (kind, dx, dz, yaw, extra = {}) =>
    addPropSpot("landmarks", { kind, x: hc.x + dx, z: hc.z + dz, y: hcFloorY, yaw, seat: "free", inside: true, cluster: "huntingCabin", ...extra });
  hcFurnish("cot", -2.2, 1.1, Math.PI / 2);
  hcFurnish("table_long", 2.3, -1.5, 0, { sx: 0.65 });
  hcFurnish("stool", 1.5, -0.7, 0);
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
// Upstream refraction-warp multiplier for creek ribbons; eased to the lake's
// 1 at the mouth. See the warps.push() comment in buildCreekRibbon.
const CREEK_WARP = 4;
/**
 * Width in metres over which a creek ribbon's edge fades out sideways, passed
 * to createWaterMaterial as shoreFade. The lake keeps the 0.65 m default.
 *
 * At 0.65 m the fade was 12% of a creek's ~5.44 m half-width — about 5 px of
 * an otherwise 91 px band at the overhead mouth vantage — so the bank edge
 * rendered as a drawn line. Measured across the left bank before and after:
 * 96,95,95,96,94,82,65,60,56,52,49 (a 17-level step in 2 px) became
 * 96,95,95,95,95,92,88,82,73,63,54,49,45 (largest step 10). Pairs with the
 * nine-point `across` array in buildCreekRibbon, which supplies the vertices
 * the wider fade interpolates over.
 */
const CREEK_SHORE_FADE = 2.0;

function buildCreekRibbon(creek, lakeDistance) {
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

  // Follow the rendered shoreline, including its smoothing/inset. Keep a
  // short overlap so the two feathered surfaces cannot leave a dry gap.
  const dry = [];
  let run = [];
  for (const p of samples) {
    // Keep enough ribbon inside the lake for the join crossfade to finish.
    // At -10 the ribbon was cut off while still ~48% opaque (measured: the
    // last station of highCountry held aJoin 0.483), leaving a half-opaque
    // stub edge — the widened fade needs the full band plus a margin.
    if (lakeDistance(p.x, p.z) < -13) {
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
  const joins = [];
  const warps = [];
  // Nine points across, clustered toward the banks. The old five (-1, -0.8, 0,
  // 0.8, 1) put the outermost interior vertex ~1 m in from the bank on a 5.4 m
  // half-width, so the shoreOpacity fade had a single interval to interpolate
  // across and the ribbon's edge rendered as a ~5 px line on a 91 px band —
  // read as a cut-out shape laid on the sand rather than water in a channel.
  // aShore is (1 - |s|) * bankWidth, so these land at roughly 0.33, 0.98 and
  // 1.96 m in from each bank: three samples through the fade zone instead of
  // one. The index loop below is written against across.length and needs no
  // change.
  const across = [-1, -0.94, -0.82, -0.5, 0, 0.5, 0.82, 0.94, 1];
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
    const bankDistance = lakeDistance(p.x, p.z);
    const mouthT = Math.max(0, Math.min(1, (30 - bankDistance) / 30));
    const mouthBlend = mouthT * mouthT * (3 - 2 * mouthT);
    const upstreamSurface = (bed + CREEK_DEPTH) * (1 - lake) + WATER * lake;
    // A tiny separation prevents z-fighting in the overlap. Fade the creek
    // away only once the lake is fully opaque beneath it.
    const surface = upstreamSurface * (1 - mouthBlend) + (WATER + 0.015) * mouthBlend;

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
      const rimDist = lakeDistance(vx, vz); // +ve outside the rim, -ve inside
      shores.push((1 - Math.abs(s)) * bankWidth);
      // Guaranteed match: hand the junction to the lake. The creek stays
      // opaque to the rim (covering the lake's own transparent shore feather),
      // then reaches zero opacity ~1.5 m inside, exactly where the lake's
      // shore ramp becomes opaque. Drawing the creek any deeper would lay its
      // differently-refracted water (it samples the lake, the lake samples the
      // bright bottom) over the lake as a darker, smoother tongue.
      const insideDist = Math.max(0, -rimDist);
      const joinT = Math.min(1, insideDist / 1.1);
      joins.push(1 - joinT * joinT * (3 - 2 * joinT));
      // Lake-equivalent shore distance and creek->lake foam blend, packed into
      // the aFlow vec4 below. The blend is active only INSIDE the lake: the
      // lake's foam band sits at its transparent rim, so applying it outside
      // painted a false white band on the dry approach.
      const lbT = Math.max(0, Math.min(1, insideDist / 3));
      // Refraction warp, per vertex. The creek needs a hard screen-sample
      // smear upstream (CREEK_WARP) or its bed shows through undistorted and
      // reads as tape laid on the ground; the lake uses 1. Because the offset
      // is depth-scaled and both bodies are shallow at the mouth, holding the
      // creek at 4 there made it smear 5.6x harder than the lake it meets
      // (measured 11.5 px vs 2.1 px of screen offset at 1536 wide) — same
      // colour, different texture, which reads as a tone break. Ease to the
      // lake's 1 across the same mouthBlend that already eases the surface
      // height, so the creek arrives matching what it joins.
      warps.push(CREEK_WARP * (1 - mouthBlend) + 1 * mouthBlend);
      positions.push(vx, creek.dry ? bed + 0.06 : surface, vz);
      // Depth per vertex against the real bed under it, so the channel shades
      // deep mid-stream and shallows out where the banks rise into it. Inside
      // the lake, converge to the lake's own authored depth so the creek's
      // body colour, refraction distortion and apparent ripple match the water
      // it is dissolving into (otherwise the shallow creek reads as a darker,
      // smoother tongue laid over the lake).
      const bedDepth = Math.max(0, surface - heightAt(vx, vz));
      const ldx = (vx - POS.lakeMercy.x) / LAKE_NOMINAL_RX;
      const ldz = (vz - POS.lakeMercy.z) / LAKE_NOMINAL_RZ;
      const lakeT = Math.hypot(ldx, ldz) / lakeWaterRimRadius(Math.atan2(-ldz, ldx));
      const lakeDepth = lakeT < 1 ? 7 * Math.pow(1 - lakeT, 0.8) : 0;
      const depthBlend = Math.max(0, Math.min(1, insideDist / 1.2));
      depths.push(creek.dry ? 0 : bedDepth * (1 - depthBlend) + lakeDepth * depthBlend);
      // aFlow is a vec4 on creek ribbons: (flowX, flowY, lakeShore, lakeBlend).
      // Packing the two join scalars here keeps the creek vertex-buffer count
      // at eight -- the WebGPU device limit (position, normal, aDepth, aJoin,
      // aWarp, aFlow, aSlope, aShore). Separate aLakeShore/aLakeBlend
      // attributes pushed it to ten and the creek pipeline failed to create.
      flows.push(
        tx * (1 - mouthBlend) + 1 * mouthBlend,
        tz * (1 - mouthBlend),
        insideDist,
        lbT * lbT * (3 - 2 * lbT)
      );
      slopes.push(slope * (1 - depthBlend));
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("aDepth", new THREE.Float32BufferAttribute(depths, 1));
  geo.setAttribute("aJoin", new THREE.Float32BufferAttribute(joins, 1));
  geo.setAttribute("aWarp", new THREE.Float32BufferAttribute(warps, 1));
  geo.setAttribute("aFlow", new THREE.Float32BufferAttribute(flows, 4));
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
function buildLakeGeometry() {
  const positions = [0, 0, 0];
  const depths = [7];
  const shores = [100];
  const indices = [];
  const rings = [0.3, 0.6, 0.85, 0.96, 0.992, 1];
  for (const t of rings) {
    for (let i = 0; i <= LAKE_WATER_RIM_SEGMENTS; i += 1) {
      const k = i % LAKE_WATER_RIM_SEGMENTS;
      const a = k / LAKE_WATER_RIM_SEGMENTS * Math.PI * 2;
      const rim = lakeWaterRimRadius(a);
      positions.push(Math.cos(a) * rim * t, Math.sin(a) * rim * t, 0);
      depths.push(7 * Math.pow(1 - t, 0.8));
      shores.push((1 - t) * rim * LAKE_NOMINAL_RX);
    }
  }
  const stride = LAKE_WATER_RIM_SEGMENTS + 1;
  for (let i = 0; i < LAKE_WATER_RIM_SEGMENTS; i += 1) indices.push(0, 1 + i, 2 + i);
  for (let r = 0; r < rings.length - 1; r += 1) {
    for (let i = 0; i < LAKE_WATER_RIM_SEGMENTS; i += 1) {
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
  const lakeGeometry = buildLakeGeometry();
  const lake = new THREE.Mesh(lakeGeometry, lakeMat);
  lake.name = "lake";
  lake.rotation.x = -Math.PI / 2;
  lake.scale.set(LAKE_NOMINAL_RX, LAKE_NOMINAL_RZ, 1);
  lake.position.set(POS.lakeMercy.x, WATER, POS.lakeMercy.z);
  group.add(lake);

  // The mud band used to be a RingGeometry(0.92, 1.1) — a perfect annulus, and
  // the hardest edge in the whole scene. The water plane now runs up into
  // rising ground, so there is no exposed lake bed left for it to cover.

  // refractBase: the creek's body-colour floor. At CREEK_DEPTH (0.45 m) the
  // depth ramp is ~2% down, so this floor IS the body-colour share. 0.55
  // painted the ribbon 56% waterShallow teal — a different substance from
  // the lake (measured hue 180 vs the lake's B>G blue); 0.25 still left a
  // visible uniform film at direct overview (nadir ribbon rgb(38,60,60) vs
  // lake rgb(45,55,51) — cooler, darker, unmodulated). 0.15 is the lake's
  // own floor: at the same depth the two bodies now paint the same share,
  // so the creek's tone comes from the same signals as the lake's shallows
  // — bed through refraction, not a paint layer. The grazing-angle milk the
  // floor was sized for is dominated by fresnel (measured: 0.25 → 0.15
  // changes the grazing surface by ≤ 3/255).
  const creekMat = fallback
    ? createWaterFallbackMaterial()
    : createWaterMaterial(normalMap, { depthSource: "attribute", screenRefraction, foamScale: 0.12, refractBase: 0.15, shoreFade: CREEK_SHORE_FADE });
  const toxicMat = fallback
    ? createWaterFallbackMaterial(true)
    : createWaterMaterial(normalMap, { toxic: true, depthSource: "attribute", screenRefraction, foamScale: 0.12, refractBase: 0.55, shoreFade: CREEK_SHORE_FADE });
  const washMat = new THREE.MeshStandardNodeMaterial({
    color: 0xc2a070,
    roughness: 0.95
  });

  for (const creek of CREEKS) {
    const geo = buildCreekRibbon(creek, lakeWaterSignedDistance);
    const mat = creek.dry ? washMat : creek.name === "toxic" ? toxicMat : creekMat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "creek";
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  scene.add(group);
  return group;
}
