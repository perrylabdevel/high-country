import * as THREE from "three/webgpu";
import { POS } from "./map.js";
import { heightAt } from "./world.js";
import { addBoxCollider, addCylinderCollider } from "./collision.js";

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

function cylAt(group, x, z, rTop, rBot, h, material, collide = true, colliderR) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, 8), material);
  mesh.position.set(x, heightAt(x, z) + h / 2, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (collide) {
    addCylinderCollider(x, z, colliderR ?? Math.max(rTop, rBot));
  }
  return mesh;
}

function brokenWagon(group, x, z, wood, rust) {
  const wagon = new THREE.Group();
  const bed = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.85, 1.5), rust);
  bed.position.y = 0.62;
  bed.castShadow = true;
  bed.receiveShadow = true;
  wagon.add(bed);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(3.35, 0.22, 1.62), wood);
  rail.position.y = 1.08;
  rail.castShadow = true;
  wagon.add(rail);
  for (const [lx, lz] of [[1.05, 0.82], [-0.95, -0.82]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.16, 8), rust);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(lx, 0.36, lz);
    wheel.castShadow = true;
    wagon.add(wheel);
  }
  wagon.position.set(x, heightAt(x, z), z);
  wagon.rotation.y = 0.42;
  group.add(wagon);
  addBoxCollider(x, z, 1.7, 1.05);
}

export function createFort(scene) {
  const group = new THREE.Group();
  const wood = mat(0xc4a574);
  const dark = mat(0x6b4226);
  const stone = mat(0x8a8478);
  const rust = mat(0x5a4030);
  const canvas = mat(0xd2c4a0);

  const fort = POS.fortGrant;
  const barracksX = fort.x - 8;
  const barracksZ = fort.z + 4;
  const flagX = fort.x - 2;
  const flagZ = fort.z + 6;

  boxAt(group, barracksX, barracksZ, 5, 3.2, 10, wood);
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
  const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.16, 8), rust);
  fallen.rotation.x = Math.PI / 2;
  fallen.position.set(wagonX - 1.6, heightAt(wagonX - 1.6, wagonZ - 1.6) + 0.08, wagonZ - 1.6);
  fallen.castShadow = true;
  group.add(fallen);

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
