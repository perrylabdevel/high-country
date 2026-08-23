import * as THREE from "three/webgpu";
import { POS, WATER, lakeShoreRadius, LAKE_NOMINAL_RX, LAKE_NOMINAL_RZ } from "./map.js";
import { heightAt } from "./world.js";
import { addBoxCollider, addCylinderCollider } from "./collision.js";
import { boxOnPlane, coneOnPlane, registerWaterPlacement } from "./buildings/kit.js";

const BEACH_ANGLES = [0.12, 0.82, 1.68, 2.48, 3.32, 5.92];
const BEACH_RIMS = [1.0, 0.99, 1.02, 1.0, 1.03, 0.98];
const BEACH_SCALES = [22, 28, 18, 32, 24, 26];
const BEACH_COLORS = [0xc2a070, 0xb89a6a];
const REED_BAYS = [0.9, 2.58, 6.02];
const DOCK_ANGLE = 4.54;

function seeded(n) {
  const x = Math.sin(n * 999) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * The point on a bearing where the ground actually crosses the waterline.
 *
 * Every shore feature — beaches, reeds, rocks — used to be placed on a
 * hardcoded 310 x 242 ellipse that only ever matched the old circular water
 * mesh, never the terrain. With the shoreline now irregular, marching out to
 * the real crossing is both correct and self-maintaining: the beaches follow
 * the bays wherever lakeShoreRadius puts them.
 *
 * Marches along the ray in normalised ellipse space and returns the first
 * sample standing above WATER, so `rim` 1.0 is the water's edge, below 1 wades
 * in, above 1 steps up the bank.
 */
function shorePoint(cx, cz, angle, rim = 1) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const at = (d) => ({
    x: cx + cos * d * LAKE_NOMINAL_RX,
    z: cz + sin * d * LAKE_NOMINAL_RZ
  });
  let cross = lakeShoreRadius(angle) * 1.12;
  for (let d = 0.55; d <= 1.3; d += 0.004) {
    const p = at(d);
    if (heightAt(p.x, p.z) > WATER) {
      cross = d;
      break;
    }
  }
  return at(cross * rim);
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

  /**
   * A beach patch: an irregular fan, elongated along the shore and draped over
   * the terrain it covers.
   *
   * These were flat CircleGeometry discs floating at a single height, which is
   * why they read as tan coins scattered round the rim. Now the outline is
   * noise-perturbed per vertex, the patch is stretched tangentially so it lies
   * along the bank rather than bulging into the water, and every vertex is
   * lifted to its own ground height so sand follows the slope.
   */
  function beachPatch(x, z, radius, tangent, seed, lift = 0.05) {
    const SEG = 28;
    const positions = [x, Math.max(heightAt(x, z), WATER) + lift, z];
    const cosT = Math.cos(tangent);
    const sinT = Math.sin(tangent);
    for (let i = 0; i <= SEG; i += 1) {
      const a = (i / SEG) * Math.PI * 2;
      const wobble = 1
        + Math.sin(a * 2 + seed) * 0.22
        + Math.sin(a * 3 - seed * 1.7) * 0.14
        + Math.sin(a * 5 + seed * 0.6) * 0.08;
      // Local ellipse: long along the shore, shallow across it.
      const lx = Math.cos(a) * radius * wobble * 1.45;
      const lz = Math.sin(a) * radius * wobble * 0.55;
      const px = x + lx * cosT - lz * sinT;
      const pz = z + lx * sinT + lz * cosT;
      positions.push(px, Math.max(heightAt(px, pz), WATER) + lift, pz);
    }
    const indices = [];
    for (let i = 1; i <= SEG; i += 1) {
      indices.push(0, i, i + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  for (let i = 0; i < BEACH_ANGLES.length; i += 1) {
    const a = BEACH_ANGLES[i];
    const { x, z } = shorePoint(cx, cz, a, BEACH_RIMS[i]);
    // Shore tangent, so the patch runs along the water rather than across it.
    const ahead = shorePoint(cx, cz, a + 0.05, BEACH_RIMS[i]);
    const behind = shorePoint(cx, cz, a - 0.05, BEACH_RIMS[i]);
    const tangent = Math.atan2(ahead.z - behind.z, ahead.x - behind.x);
    const beach = new THREE.Mesh(
      beachPatch(x, z, BEACH_SCALES[i], tangent, a * 3.7),
      i % 2 === 0 ? sandA : sandB
    );
    beach.receiveShadow = true;
    group.add(beach);
  }

  const islandX = cx - 40;
  const islandZ = cz + 30;
  const islandMat = new THREE.MeshStandardNodeMaterial({ color: 0xb89a6a, roughness: 0.95 });
  // The island shared the beaches' CircleGeometry, so it was a tan coin on the
  // water. Same irregular patch, flat at the waterline since it sits offshore.
  const island = new THREE.Mesh(beachPatch(islandX, islandZ, 7, 0.6, 2.3, 0.18), islandMat);
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
    // Every island rock is a real obstacle; the old r > 1.2 cut-off let all
    // but the largest be walked through.
    addCylinderCollider(x, z, Math.max(rock.r * 0.62, 0.5));
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
    const rim = 0.94 + seeded(i + 4) * 0.07;
    const { x, z } = shorePoint(cx, cz, a, rim);
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
    const rim = 0.98 + seeded(i + 30) * 0.07;
    const { x, z } = shorePoint(cx, cz, a, rim);
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
    addCylinderCollider(x, z, Math.max(radius * 0.62, 0.5));
    rockCount += 1;
  }

  scene.add(group);
  return group;
}
