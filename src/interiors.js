/**
 * Enterable interiors (sheriff, saloon, hotel, store, church), built in the
 * structure's local frame.
 *
 * Each ENTERABLE_LOT carries a rotated `group` (from landmarks.js). The shell
 * and props are added as children of that group in local coordinates, so the
 * whole interior rotates with the building. Doorways have a head height and a
 * lintel; the floor sits at the structure's footing, not the terrain.
 */
import * as THREE from "three/webgpu";
import { addOrientedBoxCollider } from "./collision.js";
import { ENTERABLE_LOTS } from "./landmarks.js";
import { tag, wallX } from "./buildings/kit.js";
import { face, mate } from "./buildings/anchors.js";

const WALL_THICK = 0.22;
const DOOR_W = 0.92;
const DOOR_H = 2.1;

function mat(color, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness: 0.88, ...extra });
}

function box(group, x, y, z, w, h, d, material, collide = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (collide) {
    const yaw = group.userData.yaw;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const wx = group.userData.x + x * cos - z * sin;
    const wz = group.userData.z + x * sin + z * cos;
    addOrientedBoxCollider(wx, wz, w / 2, d / 2, yaw);
  }
  return mesh;
}

/**
 * Build the four walls of a lot in its local frame. The front wall (+Z) has a
 * doorway with a head height and a lintel above it. Returns nothing; adds to
 * the lot's group.
 */
function addShell(lot, wallMat, floorMat) {
  const { w, h, d, group } = lot;
  const t = WALL_THICK;

  // Floor at the structure's footing (y=0 in local frame).
  const floor = box(group, 0, 0, 0, w - t * 2, 0.08, d - t * 2, floorMat);
  tag(floor, "floor", { top: 0.08 });
  const ceilH = Math.min(2.7, h - 0.35);
  const ceiling = box(group, 0, ceilH - 0.08, 0, w - t * 2, 0.08, d - t * 2, floorMat);
  tag(ceiling, "ceiling", { height: ceilH });

  const front = wallX({
    length: w,
    height: h,
    thickness: t,
    openings: [{ x: 0, w: DOOR_W, h: DOOR_H, fromFloor: 0 }],
    material: wallMat
  });
  mate(front, "wallSide", face(group, "front"), { offset: { z: -t / 2 } });
  front.traverse((n) => {
    if (n.userData.role === "header") {
      tag(n, "lintel", { openingW: DOOR_W, openingH: DOOR_H, fromFloor: 0 });
    }
  });
  if (front.userData.fullHeightDoor) {
    group.userData.fullHeightDoor = true;
  }
  group.userData.interiorDoor = { w: DOOR_W, h: DOOR_H };

  const back = wallX({ length: w, height: h, thickness: t, material: wallMat });
  mate(back, "wallSide", face(group, "back"), { offset: { z: t / 2 } });
  const right = wallX({ length: d, height: h, thickness: t, material: wallMat });
  mate(right, "wallSide", face(group, "right"), { offset: { x: -t / 2 } });
  const left = wallX({ length: d, height: h, thickness: t, material: wallMat });
  mate(left, "wallSide", face(group, "left"), { offset: { x: t / 2 } });
}

/**
 * Local-frame helper: `depth` is measured inward from the front (door) wall,
 * matching how the props were originally authored. The front wall is at
 * +d/2, so depth 0 is the threshold and depth d is the back wall.
 */
function atDepth(d, depth) {
  return d / 2 - depth;
}

function addSheriffProps(lot, wood, dark) {
  const { w, d, group } = lot;
  box(group, 0.2, 0, atDepth(d, d * 0.42), 1.9, 0.85, 0.85, dark, true);
  box(group, 0.2, 0, atDepth(d, d * 0.42 + 0.85), 0.5, 0.55, 0.5, wood);
  box(group, w * 0.32, 0, atDepth(d, d * 0.28), 0.28, 1.6, 1.1, dark);

  const barT = 0.07;
  const barH = lot.h * 0.78;
  const cellFront = d * 0.55;
  const cellBack = d - 0.45;
  const cellHalf = w * 0.5 - 0.55;
  const openFrom = cellHalf - 1.05;
  const spacing = 0.26;
  for (let across = -cellHalf; across <= cellHalf + 0.01; across += spacing) {
    if (across > openFrom && across < cellHalf) {
      continue;
    }
    box(group, across, 0, atDepth(d, cellFront), barT, barH, barT, dark);
  }
  for (let depth = cellFront; depth < cellBack; depth += spacing) {
    box(group, -cellHalf, 0, atDepth(d, depth), barT, barH, barT, dark);
    box(group, cellHalf, 0, atDepth(d, depth), barT, barH, barT, dark);
  }
}

function addSaloonProps(lot, wood, dark) {
  const { w, d, group } = lot;
  const barDepth = d * 0.55;
  const alongBar = d * 0.62;
  box(group, w * 0.32, 0, atDepth(d, barDepth), 0.72, 1.05, alongBar, dark, true);

  for (const offset of [-0.9, 0, 0.9]) {
    box(group, w * 0.32, 1.05, atDepth(d, barDepth + offset * 0.55), 0.18, 0.32, 0.18, wood);
  }

  for (const [across, depth] of [[-1.7, d * 0.38], [0.15, d * 0.36]]) {
    box(group, across, 0, atDepth(d, depth), 1.15, 0.72, 1.15, wood);
    box(group, across - 0.85, 0, atDepth(d, depth), 0.42, 0.5, 0.42, dark);
    box(group, across + 0.85, 0, atDepth(d, depth), 0.42, 0.5, 0.42, dark);
  }

  box(group, -w * 0.32, 0, atDepth(d, d * 0.78), 1.4, 1.05, 0.55, dark);
}

function addHotelProps(lot, wood, dark) {
  const { w, d, group } = lot;
  box(group, -w * 0.28, 0, atDepth(d, 2.75), 2.4, 1.05, 0.7, dark, true);

  for (const across of [-w * 0.28, 0.2, w * 0.28]) {
    const z = atDepth(d, d * 0.74);
    box(group, across, 0, z, 1.15, 0.32, 2.05, dark, true);
    box(group, across, 0.32, z, 1.0, 0.16, 1.85, wood);
  }

  for (let i = 0; i < 4; i += 1) {
    box(group, w * 0.38, 0, atDepth(d, 2.45 + i * 0.42), 0.9, 0.22 * (i + 1), 0.42, wood, true);
  }

  box(group, 2.2, 0, atDepth(d, 3.4), 0.95, 0.7, 0.95, wood);
  box(group, 1.5, 0, atDepth(d, 3.4), 0.42, 0.48, 0.42, dark);
  box(group, 2.9, 0, atDepth(d, 3.4), 0.42, 0.48, 0.42, dark);
}

function addStoreProps(lot, wood, dark) {
  const { w, d, group } = lot;
  box(group, 0.15, 0, atDepth(d, d * 0.72), 3.2, 1.0, 0.7, dark, true);

  const shelfAcross = w * 0.5 - 0.42;
  const shelfDepths = [2.4, 4.1, 5.8];
  for (const side of [-1, 1]) {
    for (const depth of shelfDepths) {
      box(group, side * shelfAcross, 0, atDepth(d, depth), 0.35, 1.6, 1.55, wood, true);
    }
  }

  const goods = [
    [-1, 2.4, -0.35],
    [-1, 4.1, 0.2],
    [-1, 5.8, -0.2],
    [-1, 4.1, -0.4],
    [1, 2.4, 0.25],
    [1, 4.1, -0.18],
    [1, 5.8, 0.15],
    [1, 2.4, -0.3]
  ];
  for (const [side, depth, along] of goods) {
    box(group, side * shelfAcross, 1.6, atDepth(d, depth + along), 0.22, 0.22, 0.22, dark);
  }
}

function addChurchProps(lot, wood, dark) {
  const { d, group } = lot;
  const altarDepth = d * 0.82;
  box(group, 0.05, 0, atDepth(d, altarDepth), 2.2, 0.52, 0.85, dark, true);
  box(group, 0.05, 0.52, atDepth(d, altarDepth), 1.05, 0.7, 0.42, wood);

  const pewAcross = 2.55;
  for (const side of [-1, 1]) {
    for (const depth of [2.85, 4.5]) {
      box(group, side * pewAcross, 0, atDepth(d, depth), 1.85, 0.55, 0.48, wood, true);
    }
  }

  box(group, 1.85, 0, atDepth(d, altarDepth - 0.12), 0.58, 1.15, 0.58, dark, true);
}

const PROPS = {
  sheriff: addSheriffProps,
  saloon: addSaloonProps,
  hotel: addHotelProps,
  store: addStoreProps,
  church: addChurchProps
};

function buildLot(lot, wood, dark, stone) {
  const wallMat = lot.stone ? stone : lot.dark ? dark : wood;
  lot.group.userData.x = lot.x;
  lot.group.userData.z = lot.z;
  lot.group.userData.yaw = lot.yaw;
  addShell(lot, wallMat, wood);
  const props = PROPS[lot.name];
  if (props) {
    props(lot, wood, dark);
  }
}

export function createInteriors(scene) {
  if (!ENTERABLE_LOTS.length) {
    return null;
  }
  const group = new THREE.Group();
  group.name = "interiors";
  const wood = mat(0xc4a574);
  const dark = mat(0x6b4226);
  const stone = mat(0x8a8478);
  for (const lot of ENTERABLE_LOTS) {
    buildLot(lot, wood, dark, stone);
  }
  scene.add(group);
  return group;
}
