import * as THREE from "three/webgpu";
import { POS } from "./map.js";
import { addBoxCollider } from "./collision.js";
import { boxOnGround, cylOnGround, grounded, block, wheelOn } from "./buildings/kit.js";
import { mate, anchorsOf } from "./buildings/anchors.js";
import { makeTexturedMat } from "./materials/texturedMat.ts";

function mat(color, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness: 0.88, ...extra });
}

function boxAt(group, x, z, w, h, d, material, collide = true, yOff = 0) {
  return boxOnGround(group, x, z, w, h, d, material, collide, yOff);
}

function cylAt(group, x, z, rTop, rBot, h, material, collide = true, colliderR) {
  return cylOnGround(group, x, z, rTop, rBot, h, material, collide, colliderR);
}

function brokenWagon(group, x, z, wood, rust) {
  const wagon = grounded({ x, z, yaw: 0.42 });
  mate(block({ w: 3.2, h: 0.85, d: 1.5, material: rust }), "base", anchorsOf(wagon).get("footing"), {
    offset: { y: 0.62 - 0.425 }
  });
  mate(block({ w: 3.35, h: 0.22, d: 1.62, material: wood }), "base", anchorsOf(wagon).get("footing"), {
    offset: { y: 1.08 - 0.11 }
  });
  for (const [lx, lz] of [[1.05, 0.82], [-0.95, -0.82]]) {
    wheelOn(wagon, { x: lx, y: 0.36, z: lz, r: 0.36, thick: 0.16, material: rust, axis: "z" });
  }
  group.add(wagon);
  addBoxCollider(x, z, 1.7, 1.05);
}

export function createFort(scene, maps = {}) {
  const group = new THREE.Group();
  const hasMaps = Boolean(maps?.wood && maps?.siding && maps?.rock);
  const wood = hasMaps
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xf0dcc0, gain: 1.9 })
    : mat(0xc4a574);
  const dark = hasMaps
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xcfa06a, gain: 1.6, rough: 0.94 })
    : mat(0x6b4226);
  // The barracks is a building body, so it takes `siding` like every other
  // exterior wall — `wood` is the floor texture (short planks, butt joints)
  // and a 5x10 m facade tiled with it shows the same triple pattern the ranch
  // walls showed before the siding split. Same params as the barn/smithy
  // darkSiding in buildings.js: an outbuilding read, not a showpiece facade.
  const darkSiding = hasMaps
    ? makeTexturedMat(maps.siding, { tiling: 1.4, tint: 0xa8845c, gain: 1.0, rough: 0.94 })
    : mat(0x6b4226);
  const stone = hasMaps
    ? makeTexturedMat(maps.rock, { tiling: 2.2, tint: 0xe0d8c8, gain: 1.35 })
    : mat(0xa89e90);
  const rust = mat(0x5a4030);
  const canvas = mat(0xd2c4a0);

  const fort = POS.fortGrant;
  const barracksX = fort.x - 8;
  const barracksZ = fort.z + 4;
  const flagX = fort.x - 2;
  const flagZ = fort.z + 6;

  boxAt(group, barracksX, barracksZ, 5, 3.2, 10, darkSiding);
  boxAt(group, barracksX, barracksZ, 5.5, 0.28, 10.5, dark, false, 3.2);

  cylAt(group, flagX, flagZ, 0.1, 0.12, 9, dark, true, 0.25);
  boxAt(group, flagX + 0.72, flagZ, 1.25, 0.7, 0.08, canvas, false, 8.15);

  boxAt(group, barracksX + 3.4, barracksZ - 3.2, 1.15, 1.0, 1.1, wood);
  boxAt(group, barracksX + 3.4, barracksZ - 3.2, 1.05, 0.08, 1.0, dark, false, 1.0);
  boxAt(group, barracksX + 3.55, barracksZ - 2.0, 1.0, 0.85, 0.95, dark);
  boxAt(group, barracksX + 3.55, barracksZ - 2.0, 0.9, 0.07, 0.85, wood, false, 0.85);
  boxAt(group, barracksX + 4.5, barracksZ - 2.7, 0.75, 0.7, 0.7, wood);
  boxAt(group, fort.x + 2.2, fort.z - 6.4, 1.05, 0.9, 1.0, dark);
  boxAt(group, fort.x + 2.2, fort.z - 6.4, 0.95, 0.07, 0.9, wood, false, 0.9);
  boxAt(group, fort.x + 1.3, fort.z - 5.5, 0.7, 0.55, 0.65, wood);

  cylAt(group, barracksX + 4.35, barracksZ - 3.85, 0.38, 0.42, 0.85, rust);
  cylAt(group, barracksX + 4.7, barracksZ - 1.55, 0.34, 0.38, 0.78, dark);
  cylAt(group, fort.x + 2.55, fort.z - 5.35, 0.36, 0.4, 0.82, rust);

  const hitchZ = fort.z - 10.5;
  boxAt(group, fort.x - 5, hitchZ, 0.18, 1.15, 0.18, dark);
  boxAt(group, fort.x + 1, hitchZ, 0.18, 1.15, 0.18, dark);
  boxAt(group, fort.x - 2, hitchZ, 6.2, 0.12, 0.12, dark, false, 1.02);

  const wagonX = fort.x + 18;
  const wagonZ = fort.z - 8.5;
  brokenWagon(group, wagonX, wagonZ, wood, rust);
  const fallen = cylOnGround(group, wagonX - 1.6, wagonZ - 1.6, 0.36, 0.36, 0.16, rust, false);
  fallen.children[0].rotation.x = Math.PI / 2;

  const ringX = fort.x + 0.5;
  const ringZ = fort.z + 1.5;
  for (const [dx, dz] of [[0.65, 0.15], [-0.2, 0.7], [-0.6, -0.25], [0.25, -0.65]]) {
    boxAt(group, ringX + dx, ringZ + dz, 0.32, 0.2, 0.28, stone, false);
  }

  scene.add(group);
  return {
    group,
    barracks: { x: barracksX, z: barracksZ },
    flagpole: { x: flagX, z: flagZ }
  };
}
