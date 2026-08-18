import * as THREE from "three/webgpu";
import { POS } from "./map.js";
import { heightAt } from "./world.js";
import { addBoxCollider } from "./collision.js";
import { boxOnGround, cylOnGround, coneOnGround } from "./buildings/kit.js";

function mat(color, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness: 0.88, ...extra });
}

function boxAt(group, x, z, w, h, d, material, collide = true, yOff = 0) {
  return boxOnGround(group, x, z, w, h, d, material, collide, yOff);
}

function charcoalPit(group, x, z, discMat, stickMat, stickCount) {
  cylOnGround(group, x, z, 2.35, 2.45, 0.16, discMat, false, undefined, 0, 10);
  const offsets = [
    [0.7, 0.35],
    [-0.85, 0.2],
    [0.15, -0.8],
    [-0.4, 0.95],
    [0.95, -0.45]
  ];
  for (let i = 0; i < stickCount; i += 1) {
    const [dx, dz] = offsets[i];
    const stick = boxAt(group, x + dx, z + dz, 0.1, 0.08, 0.9, stickMat, false, 0.12);
    stick.rotation.y = i * 0.73;
  }
}

function stumpAt(group, x, z, radius, h, material) {
  cylOnGround(group, x, z, radius * 0.92, radius, h, material, radius > 0.7, radius);
}

function sawbuckAt(group, x, z, wood) {
  const top = boxAt(group, x, z, 3.2, 0.12, 0.7, wood, false, 0.84);
  top.receiveShadow = true;
  for (const end of [-1.35, 1.35]) {
    for (const tilt of [0.52, -0.52]) {
      const leg = boxAt(group, x + end, z, 0.12, 1.05, 0.12, wood, false, 0.48 - 0.525);
      leg.children[0].rotation.z = tilt;
    }
  }
  addBoxCollider(x, z, 1.6, 0.4);
}

function logStack(group, x, z, wood, yaw) {
  const count = 4;
  for (let i = 0; i < count; i += 1) {
    const log = boxAt(group, x, z, 4.1, 0.36, 0.4, wood, false, i * 0.38);
    log.rotation.y = yaw + (i % 2) * 0.06;
  }
  addBoxCollider(x, z, 2.05, 0.32);
}

function tentAt(group, x, z, canvas) {
  boxAt(group, x, z, 2.6, 0.95, 2.4, canvas);
  coneOnGround(group, x, z, 2.15, 2.6, canvas, false, 1.85 - 1.3);
}

function ladderAt(group, x, z, wood) {
  boxAt(group, x - 0.22, z, 0.08, 3.6, 0.08, wood, false);
  boxAt(group, x + 0.22, z, 0.08, 3.6, 0.08, wood, false);
  for (let i = 0; i < 7; i += 1) {
    boxAt(group, x, z, 0.52, 0.07, 0.08, wood, false, 0.28 + i * 0.46);
  }
}

function brokenWagon(group, x, z, rust, iron) {
  const y = heightAt(x, z);
  boxAt(group, x, z, 2.6, 0.7, 1.35, rust);
  const attached = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 8), iron);
  attached.rotation.z = Math.PI / 2;
  attached.position.set(x + 0.85, y + 0.42, z + 0.72);
  attached.castShadow = true;
  group.add(attached);
  const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 8), iron);
  fallen.rotation.x = Math.PI / 2;
  fallen.position.set(x - 1.55, y + 0.12, z - 0.95);
  fallen.castShadow = true;
  group.add(fallen);
}

function fallenTrunk(group, x, z, len, yaw, ash) {
  const trunk = boxAt(group, x, z, len, 0.36, 0.4, ash, false, 0.1);
  trunk.children[0].rotation.y = yaw;
  trunk.children[0].rotation.z = 0.07;
}

export function createPines(scene) {
  const group = new THREE.Group();
  const wood = mat(0xc4a574);
  const canvas = mat(0xd2c4a0);
  const pitDisc = mat(0x2a2420);
  const char = mat(0x3a342c);
  const stone = mat(0x8a8478);
  const rust = mat(0x5a4030);
  const iron = mat(0x3a3a3c, { metalness: 0.35, roughness: 0.55 });

  const camp = POS.timberCamp;
  const tower = POS.fireWatch;
  const burn = POS.burn;

  const pitPositions = [
    { x: camp.x - 8, z: camp.z - 14, sticks: 4 },
    { x: camp.x + 10, z: camp.z + 8, sticks: 5 },
    { x: camp.x - 16, z: camp.z + 22, sticks: 3 }
  ];
  for (const pit of pitPositions) {
    charcoalPit(group, pit.x, pit.z, pitDisc, char, pit.sticks);
  }

  const stumpSpots = [
    [camp.x - 4, camp.z - 6, 0.42, 0.38],
    [camp.x + 8, camp.z + 2, 0.5, 0.44],
    [camp.x - 24, camp.z - 2, 0.38, 0.34],
    [camp.x + 16, camp.z + 18, 0.55, 0.48],
    [camp.x - 14, camp.z - 20, 0.46, 0.4],
    [camp.x + 18, camp.z + 6, 0.35, 0.32],
    [camp.x - 10, camp.z + 20, 0.48, 0.42],
    [camp.x + 22, camp.z - 20, 0.4, 0.36]
  ];
  for (const [x, z, r, h] of stumpSpots) {
    stumpAt(group, x, z, r, h, char);
  }

  const sawbuck = { x: camp.x - 5, z: camp.z + 3 };
  sawbuckAt(group, sawbuck.x, sawbuck.z, wood);

  const stackA = { x: camp.x - 28, z: camp.z + 8 };
  const stackB = { x: camp.x + 26, z: camp.z - 14 };
  logStack(group, stackA.x, stackA.z, wood, 0.18);
  logStack(group, stackB.x, stackB.z, wood, -0.4);

  const tent = { x: camp.x - 18, z: camp.z - 4 };
  tentAt(group, tent.x, tent.z, canvas);

  const crate = { x: tower.x + 3.6, z: tower.z + 1.8 };
  boxAt(group, crate.x, crate.z, 0.95, 0.7, 0.85, wood);
  ladderAt(group, tower.x + 0.15, tower.z + 2.7, wood);

  const wagon = { x: burn.x + 28, z: burn.z - 16 };
  brokenWagon(group, wagon.x, wagon.z, rust, iron);
  const chimney = { x: burn.x - 22, z: burn.z + 10 };
  boxAt(group, chimney.x, chimney.z, 1.4, 2.8, 1.4, stone);

  const trunks = [
    [burn.x + 8, burn.z + 22, 4.8, 0.4],
    [burn.x - 8, burn.z - 24, 5.4, 1.15],
    [burn.x + 32, burn.z + 6, 4.2, -0.55],
    [burn.x - 30, burn.z - 8, 5.1, 2.05],
    [burn.x + 4, burn.z + 28, 4.6, 0.85],
    [burn.x - 14, burn.z + 24, 3.9, -1.3]
  ];
  for (const [x, z, len, yaw] of trunks) {
    fallenTrunk(group, x, z, len, yaw, char);
  }

  scene.add(group);
  return {
    group,
    charcoalPits: pitPositions.length,
    stumps: stumpSpots.length,
    sawbucks: 1,
    logStacks: 2,
    tents: 1,
    crates: 1,
    ladders: 1,
    wagons: 1,
    chimneys: 1,
    fallenTrunks: trunks.length,
    pitPositions: pitPositions.map(({ x, z }) => ({ x, z })),
    tentPosition: tent,
    wagonPosition: wagon
  };
}
