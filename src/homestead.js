/** Homestead and tribal-camp dressing around existing landmark placeholders. */

import * as THREE from "three/webgpu";
import { POS } from "./map.js";
import { addBoxCollider } from "./collision.js";
import { boxOnGround, cylOnGround, coneOnGround } from "./buildings/kit.js";

function mat(color, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness: 0.88, ...extra });
}

function boxAt(group, x, z, w, h, d, material, collide = true, yOff = 0) {
  return boxOnGround(group, x, z, w, h, d, material, collide, yOff);
}

function cylAt(group, x, z, rTop, rBot, h, material, collide = true) {
  return cylOnGround(group, x, z, rTop, rBot, h, material, collide);
}

function coneAt(group, x, z, r, h, material, collide = false, yOff = 0) {
  return coneOnGround(group, x, z, r, h, material, collide, yOff);
}

function cemeteryFence(group, wood, stone) {
  const cx = POS.cemetery.x;
  const cz = POS.cemetery.z;
  const halfX = 6;
  const halfZ = 4;
  const gap = 2.4;
  const gateZ = cz + halfZ;

  for (const [dx, dz] of [[-halfX, -halfZ], [halfX, -halfZ], [-halfX, halfZ], [halfX, halfZ]]) {
    boxAt(group, cx + dx, cz + dz, 0.32, 1.4, 0.32, stone);
  }
  boxAt(group, cx - gap / 2, gateZ, 0.28, 1.4, 0.28, stone);
  boxAt(group, cx + gap / 2, gateZ, 0.28, 1.4, 0.28, stone);

  const segW = halfX - gap / 2;
  const segMid = (halfX + gap / 2) / 2;
  for (const yOff of [0.35, 0.72, 1.08]) {
    boxAt(group, cx, cz - halfZ, halfX * 2, 0.1, 0.12, wood, false, yOff);
    boxAt(group, cx - halfX, cz, 0.12, 0.1, halfZ * 2, wood, false, yOff);
    boxAt(group, cx + halfX, cz, 0.12, 0.1, halfZ * 2, wood, false, yOff);
    boxAt(group, cx - segMid, gateZ, segW, 0.1, 0.12, wood, false, yOff);
    boxAt(group, cx + segMid, gateZ, segW, 0.1, 0.12, wood, false, yOff);
  }
  addBoxCollider(cx, cz - halfZ, halfX, 0.14);
  addBoxCollider(cx - halfX, cz, 0.14, halfZ);
  addBoxCollider(cx + halfX, cz, 0.14, halfZ);
  addBoxCollider(cx - segMid, gateZ, segW / 2, 0.14);
  addBoxCollider(cx + segMid, gateZ, segW / 2, 0.14);

  for (const [dx, dz] of [[-3.3, -2.2], [0.9, -2.6], [3.7, -1.9], [-1.2, -2.9]]) {
    boxAt(group, cx + dx, cz + dz, 0.32, 1.05, 0.16, stone);
  }

  return { x: cx, z: gateZ };
}

function cabinPorch(group, wood, dark, stone) {
  const cabin = POS.huntingCabin;
  const porchZ = cabin.z + 3.85;
  boxAt(group, cabin.x, porchZ, 5, 0.18, 2.2, wood, false);
  boxAt(group, cabin.x - 2.15, cabin.z + 4.7, 0.18, 2.1, 0.18, dark);
  boxAt(group, cabin.x + 2.15, cabin.z + 4.7, 0.18, 2.1, 0.18, dark);
  boxAt(group, cabin.x + 2, cabin.z - 3.2, 0.9, 4.4, 0.9, stone);

  const pileX = cabin.x + 6.4;
  const pileZ = cabin.z + 0.8;
  for (let i = 0; i < 4; i += 1) {
    const alongX = i % 2 === 0;
    boxAt(group, pileX, pileZ, alongX ? 1.5 : 0.42, 0.28, alongX ? 0.42 : 1.5, wood, false, i * 0.3);
  }
  addBoxCollider(pileX, pileZ, 0.85, 0.85);
  cylAt(group, pileX + 1.8, pileZ + 1.6, 0.32, 0.38, 0.5, dark, false);

  return { x: cabin.x, z: porchZ };
}

function overlookRail(group, wood, dark) {
  const o = POS.overlook;
  for (let i = 0; i < 5; i += 1) {
    boxAt(group, o.x + (i - 2) * 1.8, o.z + 0.48, 0.14, 0.95, 0.14, dark);
  }
  boxAt(group, o.x, o.z + 0.48, 7.6, 0.1, 0.1, wood, false, 0.95);
  boxAt(group, o.x - 1.2, o.z - 1.35, 3.4, 0.18, 0.7, dark, false);
}

function ranchGateExtras(group, wood, dark) {
  const g = POS.ranchGate;
  boxAt(group, g.x + 4, g.z, 1.5, 0.8, 0.08, dark, false, 3.6);

  const westMid = g.x - 3.5;
  const westEnd = g.x - 7;
  boxAt(group, westEnd, g.z, 0.28, 1.5, 0.22, dark);
  boxAt(group, westMid, g.z, 7, 0.1, 0.1, wood, false, 0.45);
  boxAt(group, westMid, g.z, 7, 0.1, 0.1, wood, false, 1.05);

  const eastMid = g.x + 11.5;
  const eastEnd = g.x + 15;
  boxAt(group, eastEnd, g.z, 0.28, 1.5, 0.22, dark);
  boxAt(group, eastMid, g.z, 7, 0.1, 0.1, wood, false, 0.45);
  boxAt(group, eastMid, g.z, 7, 0.1, 0.1, wood, false, 1.05);
}

function dryingRack(group, x, z, yaw, wood, dark) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const half = 1.15;
  boxAt(group, x - s * half, z + c * half, 0.16, 1.9, 0.16, dark);
  boxAt(group, x + s * half, z - c * half, 0.16, 1.9, 0.16, dark);
  const bar = boxAt(group, x, z, 0.12, 0.12, 2.5, wood, false, 1.85);
  bar.rotation.y = yaw;
}

function tribalCamp(group, wood, dark, stone, canvas) {
  const t = POS.tribal;
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    boxAt(group, t.x + Math.cos(a) * 1.3, t.z + Math.sin(a) * 1.3, 0.4, 0.26, 0.34, stone, false);
  }

  dryingRack(group, t.x - 4, t.z + 13, 0.35, wood, dark);
  dryingRack(group, t.x + 10, t.z - 10, -0.6, wood, dark);

  const lodgeOffs = [[-16, -4], [18, 6]];
  const lodges = lodgeOffs.map(([dx, dz]) => {
    const x = t.x + dx;
    const z = t.z + dz;
    boxAt(group, x, z, 2.3, 0.65, 2.3, canvas, false);
    coneAt(group, x, z, 2.5, 4, canvas, true, 0.2);
    return { x, z };
  });

  const baskets = [[4, 2], [-14, 8], [16, -10], [6, -14]];
  baskets.forEach(([dx, dz], i) => {
    boxAt(group, t.x + dx, t.z + dz, 0.5, 0.38, 0.45, i % 2 ? dark : wood, false);
  });

  return lodges;
}

export function createHomestead(scene) {
  const group = new THREE.Group();
  const wood = mat(0xc4a574);
  const dark = mat(0x6b4226);
  const stone = mat(0x8a8478);
  const canvas = mat(0xd2c4a0);

  const cemeteryGate = cemeteryFence(group, wood, stone);
  const porch = cabinPorch(group, wood, dark, stone);
  overlookRail(group, wood, dark);
  ranchGateExtras(group, wood, dark);
  const lodges = tribalCamp(group, wood, dark, stone, canvas);

  scene.add(group);
  return { cemeteryGate, porch, lodges };
}
