import * as THREE from "three/webgpu";
import { heightAt } from "./heightfield.js";
import { addBoxCollider } from "./collision.js";
import { POS } from "./map.js";
import { structure, wallX, flatRoof, parapet, vigas, doorLeaf, glazing, collide, boxOnGround, boxOnPlane, lowestSeat, block } from "./buildings/kit.js";
import { face, mate, anchorsOf } from "./buildings/anchors.js";
import { makeTexturedMat } from "./materials/texturedMat.ts";
import { adobeHouse } from "./landmarks.js";
import { addClearingSpot, addPropSpot, clearPropSpots } from "./propSpots.js";

/**
 * La Esperanza Mission: a small adobe mission compound of the kind the
 * frontier Southwest kept after secularisation, a working chapel and a
 * resident padre.
 *
 *   - the chapel, facade to the north, with a stone campanario at its
 *     north-east corner (the audit camera looks at it from the north) and a
 *     door you can walk through;
 *   - the atrio, a low-walled forecourt in front of the facade holding the
 *     camposanto, with its gate on the chapel's axis where ranchSouth ends;
 *   - the convento (padre's quarters) east of the chapel, door onto the patio
 *     between them, ollas at its door;
 *   - a walled garden behind the convento, the hornos and the well outside
 *     it, and a carreta in the yard.
 *
 * It used to be a sealed adobe block with a painted-on door standing on the
 * Deadman arroyo's bend, the south road ending inside it. Coordinates are
 * mission-local metres (dx east, dz south of POS.mission).
 */

const T = 0.3;

function mat(color, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness: 0.9, ...extra });
}

export const MISSION_LAYOUT = {
  chapel: { dx: -4, dz: 6, w: 7.5, d: 15, eave: 6.2 },
  tower: { dx: 0.4, dz: -1.9, size: 2.8, shaft: 7.2 },
  atrio: { x0: -12, x1: 6, z0: -12, z1: -2, gate: [-5.8, -2.2], h: 1.2 },
  convento: { dx: 8.5, dz: 8, w: 9, d: 6, eave: 3.1 },
  garden: { x0: 12.5, x1: 22, z0: 3, z1: 13, gate: [15.5, 18], h: 1.6 }
};

export function createMission(scene, maps = {}) {
  clearPropSpots("mission");
  const group = new THREE.Group();
  const adobe = maps?.adobe
    ? makeTexturedMat(maps.adobe, { tiling: 1.6, tint: 0xfff0d4, gain: 2.3, normalScale: 0.45 })
    : mat(0xc4a06a);
  const dark = maps?.wood
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xcfa06a, gain: 1.6, rough: 0.94 })
    : mat(0x6b4226);
  const pale = maps?.wood
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xf0dcc0, gain: 1.9 })
    : mat(0xc4a574);
  const stone = maps?.rock
    ? makeTexturedMat(maps.rock, { tiling: 2.2, tint: 0xe0d8c8, gain: 1.35 })
    : mat(0xa89e90);
  const roof = maps?.roof
    ? makeTexturedMat(maps.roof, { tiling: 1.4, tint: 0xa89070, gain: 1.1 })
    : mat(0x6a5238);
  const bronze = mat(0x5a4a2e, { metalness: 0.7, roughness: 0.45 });

  const m = POS.mission;
  const L = MISSION_LAYOUT;
  const at = (dx, dz) => ({ x: m.x + dx, z: m.z + dz });

  // ---------------- Chapel ----------------
  // yaw PI turns the kit front (+Z) to face north (-Z).
  const c = L.chapel;
  const cp = at(c.dx, c.dz);
  const chapel = structure({ name: "missionChapel", x: cp.x, z: cp.z, yaw: Math.PI, w: c.w, d: c.d, eave: c.eave, foundation: true, material: adobe });
  const front = wallX({
    length: c.w, extend: true, height: c.eave, thickness: T, material: adobe,
    openings: [{ x: 0, w: 1.05, h: 2.15, fromFloor: 0 }]
  });
  mate(front, "wallSide", face(chapel, "front"));
  mate(wallX({ length: c.w, extend: true, height: c.eave, thickness: T, material: adobe }), "wallSide", face(chapel, "back"));
  const nave = [{ x: -3.5, w: 0.7, h: 1.2, fromFloor: 3.2 }, { x: 3.5, w: 0.7, h: 1.2, fromFloor: 3.2 }];
  const naveWalls = ["left", "right"].map((side) => {
    const wall = wallX({ length: c.d, extend: true, height: c.eave, thickness: T, material: adobe, openings: nave });
    mate(wall, "wallSide", face(chapel, side));
    return wall;
  });
  mate(flatRoof({ w: c.w, d: c.d, overhang: 0.1, eave: c.eave, material: roof }), "base", anchorsOf(chapel).get("wallTop"));
  mate(parapet({ w: c.w, d: c.d, height: 0.55, material: adobe }), "base", anchorsOf(chapel).get("wallTop"));
  mate(vigas({ w: c.w, eave: c.eave, material: pale }), "wallSide", face(chapel, "left"));
  // The door stands open, and an altar at the far end of the nave. Nave
  // windows are small and glazed high in the side walls.
  const leaf = doorLeaf({ width: 1.0, height: 2.1, thickness: 0.09, hinge: -0.52, swing: Math.PI * 0.55, material: dark });
  mate(leaf, "frame", anchorsOf(front).get("opening.0"), { offset: { x: 0, y: 0, z: T / 2 } });
  const glass = mat(0xcfe0d8, { transparent: true, opacity: 0.32, roughness: 0.15 });
  // The altar (yard kit) stands at the far end, its front toward the door;
  // under the chapel's yaw PI local -Z is world +Z.
  addPropSpot("mission", { kind: "altar", x: cp.x, z: cp.z + c.d / 2 - 1.2, y: chapel.userData.placementY, yaw: Math.PI, seat: "free", inside: true, collide: true });
  collide(chapel, cp.x, cp.z, Math.PI, [
    { x: 0, z: c.d / 2, halfX: c.w / 2, halfZ: T / 2, openings: [{ x: 0, w: 1.3 }] },
    { x: 0, z: -c.d / 2, halfX: c.w / 2, halfZ: T / 2 },
    { x: c.w / 2, z: 0, halfX: T / 2, halfZ: c.d / 2 },
    { x: -c.w / 2, z: 0, halfX: T / 2, halfZ: c.d / 2 }
  ]);
  for (const wall of naveWalls) {
    (wall.userData.openings || []).forEach((o, i) => {
      mate(glazing({ width: o.w, height: o.h, thickness: 0.1, material: glass }), "frame", anchorsOf(wall).get(`opening.${i}`), { offset: { x: 0, y: 0, z: -T / 2 } });
    });
  }
  group.add(chapel);

  // ---------------- Campanario ----------------
  // A stone shaft at the facade's north-east corner, an open bell chamber of
  // four piers on top, a cap and an iron cross.
  const tw = L.tower;
  const tp = at(tw.dx, tw.dz);
  const ty = lowestSeat(tp.x, tp.z, tw.size * 0.72);
  boxOnPlane(group, tp.x, ty, tp.z, tw.size, tw.shaft, tw.size, stone, false);
  const pier = 0.55;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      boxOnPlane(group, tp.x + sx * (tw.size / 2 - pier / 2), ty + tw.shaft, tp.z + sz * (tw.size / 2 - pier / 2), pier, 2.2, pier, stone, false);
    }
  }
  boxOnPlane(group, tp.x, ty + tw.shaft + 2.2, tp.z, tw.size + 0.3, 0.45, tw.size + 0.3, stone, false);
  boxOnPlane(group, tp.x, ty + tw.shaft + 2.65, tp.z, 0.14, 1.4, 0.14, dark, false);
  boxOnPlane(group, tp.x, ty + tw.shaft + 3.45, tp.z, 0.8, 0.14, 0.14, dark, false);
  const bell = new THREE.Mesh(
    new THREE.LatheGeometry([new THREE.Vector2(0.02, 0.8), new THREE.Vector2(0.18, 0.78), new THREE.Vector2(0.26, 0.5), new THREE.Vector2(0.34, 0.12), new THREE.Vector2(0.42, 0)], 14),
    bronze
  );
  bell.position.set(tp.x, ty + tw.shaft + 0.95, tp.z);
  bell.castShadow = true;
  group.add(bell);
  addBoxCollider(tp.x, tp.z, tw.size / 2, tw.size / 2);

  // ---------------- Atrio and camposanto ----------------
  const lowWall = (x0, z0, x1, z1, h) => {
    const x = m.x + (x0 + x1) / 2;
    const z = m.z + (z0 + z1) / 2;
    const w = Math.max(Math.abs(x1 - x0), 0.5);
    const d = Math.max(Math.abs(z1 - z0), 0.5);
    boxOnGround(group, x, z, w, h, d, adobe, true);
  };
  const a = L.atrio;
  lowWall(a.x0, a.z0, a.gate[0], a.z0, a.h);
  lowWall(a.gate[1], a.z0, a.x1, a.z0, a.h);
  lowWall(a.x0, a.z0, a.x0, a.z1, a.h);
  lowWall(a.x1, a.z0, a.x1, a.z1, a.h);
  for (const gx of a.gate) {
    boxOnGround(group, m.x + gx, m.z + a.z0, 0.7, a.h + 0.6, 0.7, adobe, true);
  }
  for (const gz of [-10, -7.2, -4.4]) {
    addPropSpot("mission", { kind: "grave_cross", x: m.x - 8.8, z: m.z + gz, yaw: 0 });
  }
  addClearingSpot("mission", m.x - 3, m.z - 7, 7.5);
  addClearingSpot("mission", m.x + 3, m.z + 5, 4.5);

  // ---------------- Convento ----------------
  const cv = L.convento;
  const cvp = at(cv.dx, cv.dz);
  adobeHouse(group, { name: "missionConvento", x: cvp.x, z: cvp.z, yaw: -Math.PI / 2, w: cv.w, d: cv.d, eave: cv.eave, adobe, roofMat: roof, dark });
  addPropSpot("mission", { kind: "ollas", x: m.x + 4.6, z: m.z + 10.2, yaw: 0.3, collide: true });

  // ---------------- Garden, hornos, well, carreta ----------------
  const g = L.garden;
  lowWall(g.x0, g.z0, g.gate[0], g.z0, g.h);
  lowWall(g.gate[1], g.z0, g.x1, g.z0, g.h);
  lowWall(g.x0, g.z1, g.x1, g.z1, g.h);
  lowWall(g.x1, g.z0, g.x1, g.z1, g.h);
  lowWall(g.x0, g.z0, g.x0, g.z1, g.h);
  addPropSpot("mission", { kind: "horno", x: m.x + 15.5, z: m.z - 2.2, yaw: 0, collide: true });
  addPropSpot("mission", { kind: "horno", x: m.x + 19.2, z: m.z - 1.6, yaw: -0.2, collide: true });
  addPropSpot("mission", { kind: "woodpile", x: m.x + 23.5, z: m.z - 1.5, yaw: Math.PI / 2, collide: true });
  addPropSpot("mission", { kind: "well", x: m.x + 10, z: m.z - 6, yaw: 0.2, collide: true });
  addPropSpot("mission", { kind: "carreta", x: m.x + 22, z: m.z - 9, yaw: 0.35, collide: true });

  scene.add(group);
  return { group, layout: L, heightAt };
}
