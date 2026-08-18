import * as THREE from "three/webgpu";
import { POS, WATER } from "./map.js";
import { heightAt } from "./world.js";
import { addBoxCollider, addCylinderCollider } from "./collision.js";
import { boxOnPlane, coneOnPlane, registerWaterPlacement } from "./buildings/kit.js";

const LAKE_RX = 310;
const LAKE_RZ = 242;
const BEACH_ANGLES = [0.12, 0.82, 1.68, 2.48, 3.32, 5.92];
const BEACH_RIMS = [1.05, 1.03, 1.07, 1.04, 1.08, 1.02];
const BEACH_SCALES = [22, 28, 18, 32, 24, 26];
const BEACH_COLORS = [0xc2a070, 0xb89a6a];
const REED_BAYS = [0.9, 2.58, 6.02];
const DOCK_ANGLE = 4.54;

function seeded(n) {
  const x = Math.sin(n * 999) * 43758.5453;
  return x - Math.floor(x);
}

function ellipsePoint(cx, cz, angle, rim) {
  return {
    x: cx + LAKE_RX * Math.cos(angle) * rim,
    z: cz + LAKE_RZ * Math.sin(angle) * rim
  };
}

function nearDock(angle) {
  let d = Math.abs(angle - DOCK_ANGLE);
  if (d > Math.PI) {
    d = Math.PI * 2 - d;
  }
  return d < 0.45;
}

export function createShore(scene) {
  const group = new THREE.Group();
  const cx = POS.lakeMercy.x;
  const cz = POS.lakeMercy.z;
  const dummy = new THREE.Object3D();

  const sandA = new THREE.MeshStandardNodeMaterial({ color: BEACH_COLORS[0], roughness: 0.95 });
  const sandB = new THREE.MeshStandardNodeMaterial({ color: BEACH_COLORS[1], roughness: 0.95 });
  const discGeo = new THREE.CircleGeometry(1, 24);

  for (let i = 0; i < BEACH_ANGLES.length; i += 1) {
    const { x, z } = ellipsePoint(cx, cz, BEACH_ANGLES[i], BEACH_RIMS[i]);
    const y = Math.max(heightAt(x, z), WATER) + 0.04;
    const beach = new THREE.Mesh(discGeo, i % 2 === 0 ? sandA : sandB);
    beach.rotation.x = -Math.PI / 2;
    beach.scale.set(BEACH_SCALES[i], BEACH_SCALES[i], 1);
    beach.position.set(x, y, z);
    beach.receiveShadow = true;
    group.add(beach);
  }

  const islandX = cx - 40;
  const islandZ = cz + 30;
  const islandMat = new THREE.MeshStandardNodeMaterial({ color: 0xb89a6a, roughness: 0.95 });
  const island = new THREE.Mesh(discGeo, islandMat);
  island.rotation.x = -Math.PI / 2;
  island.scale.set(8, 8, 1);
  island.position.set(islandX, WATER + 0.18, islandZ);
  island.receiveShadow = true;
  group.add(island);

  const rockMat = new THREE.MeshStandardNodeMaterial({ color: 0x6a645c, roughness: 0.92 });
  const islandRocks = [
    { dx: -4.2, dz: 3.1, r: 1.35, kind: "dodec" },
    { dx: 3.8, dz: -2.4, r: 1.05, kind: "dodec" },
    { dx: 5.2, dz: 2.8, r: 0.85, kind: "box" },
    { dx: -2.6, dz: -4.6, r: 1.15, kind: "dodec" }
  ];
  for (const rock of islandRocks) {
    const x = islandX + rock.dx;
    const z = islandZ + rock.dz;
    const mesh = rock.kind === "box"
      ? boxOnPlane(group, x, WATER + 0.35 - rock.r * 1.1 / 2, z, rock.r * 1.6, rock.r * 1.1, rock.r * 1.4, rockMat, false)
      : new THREE.Mesh(new THREE.DodecahedronGeometry(rock.r, 0), rockMat);
    if (rock.kind === "box") {
      mesh.children[0].rotation.set(0.3, rock.dx, 0.15);
    } else {
      mesh.position.set(x, WATER + 0.35, z);
      mesh.rotation.set(0.3, rock.dx, 0.15);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    if (rock.r > 1.2) {
      addCylinderCollider(x, z, rock.r * 0.55);
    }
  }

  const cabinMat = new THREE.MeshStandardNodeMaterial({ color: 0x3a2a1c, roughness: 0.9 });
  boxOnPlane(group, islandX + 0.6, WATER + 0.18, islandZ - 0.4, 1.8, 1.6, 1.6, cabinMat, false);
  addBoxCollider(islandX + 0.6, islandZ - 0.4, 0.9, 0.8);
  registerWaterPlacement("islandCabin", islandX + 0.6, islandZ - 0.4, WATER + 0.18);

  const roof = coneOnPlane(group, islandX + 0.6, WATER + 0.18, islandZ - 0.4, 1.45, 0.9, cabinMat, false, 1.85 - 0.45, undefined, 4);
  roof.rotation.y = Math.PI / 4;

  const reedGeo = new THREE.BoxGeometry(0.07, 1.35, 0.07);
  const reedMat = new THREE.MeshStandardNodeMaterial({ color: 0x4a6a38, roughness: 0.9 });
  const reeds = new THREE.InstancedMesh(reedGeo, reedMat, 40);
  for (let i = 0; i < 40; i += 1) {
    const bay = REED_BAYS[i % REED_BAYS.length];
    const a = bay + (seeded(i) - 0.5) * 0.38;
    const rim = 0.97 + seeded(i + 4) * 0.08;
    const { x, z } = ellipsePoint(cx, cz, a, rim);
    dummy.position.set(x, WATER + 0.4, z);
    dummy.rotation.set(0, seeded(i + 7) * Math.PI * 2, (seeded(i + 11) - 0.5) * 0.2);
    dummy.scale.set(1, 0.65 + seeded(i + 3) * 0.7, 1);
    dummy.updateMatrix();
    reeds.setMatrixAt(i, dummy.matrix);
  }
  reeds.instanceMatrix.needsUpdate = true;
  group.add(reeds);

  let rockCount = 0;
  for (let i = 0; rockCount < 12 && i < 24; i += 1) {
    const a = i * 0.48 + 0.18;
    if (nearDock(a)) {
      continue;
    }
    const rim = 1.02 + seeded(i + 30) * 0.08;
    const { x, z } = ellipsePoint(cx, cz, a, rim);
    const ground = heightAt(x, z);
    if (ground > WATER + 4) {
      continue;
    }
    const radius = 0.75 + seeded(i + 41) * 1.05;
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(radius, 0), rockMat);
    mesh.position.set(x, Math.max(ground, WATER) + radius * 0.35, z);
    mesh.rotation.set(seeded(i), seeded(i + 1), seeded(i + 2));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (radius > 1.2) {
      addCylinderCollider(x, z, radius * 0.55);
    }
    rockCount += 1;
  }

  scene.add(group);
  return group;
}
