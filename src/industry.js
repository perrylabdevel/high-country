import * as THREE from "three/webgpu";
import { heightAt } from "./world.js";
import { addBoxCollider } from "./collision.js";
import { POS, ROADS, samplePolyline } from "./map.js";
import { boxOnGround, grounded, block, coneOnGround, wheelOn, gableRoof } from "./buildings/kit.js";
import { mate, anchorsOf } from "./buildings/anchors.js";
import { makeTexturedMat } from "./materials/texturedMat.ts";

function mat(color, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness: 0.88, ...extra });
}

function boxAt(group, x, z, w, h, d, material, collide = true, yOff = 0) {
  return boxOnGround(group, x, z, w, h, d, material, collide, yOff);
}

function oreCart(group, x, z, yaw, rust, iron) {
  const cart = grounded({ x, z, yaw });
  mate(block({ w: 1.2, h: 0.85, d: 2.2, material: rust }), "base", anchorsOf(cart).get("footing"), {
    offset: { y: 0.58 - 0.425 }
  });
  for (const [lx, lz] of [[0.58, 0.7], [0.58, -0.7], [-0.58, 0.7], [-0.58, -0.7]]) {
    wheelOn(cart, { x: lx, y: 0.22, z: lz, r: 0.22, thick: 0.16, material: iron, axis: "z" });
  }
  group.add(cart);
  addBoxCollider(x, z, 1.15, 1.15);
  return { x, z };
}

function slagHeap(group, x, z, sx, sy, sz, material) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), material);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.set(0.18, 0.55, -0.12);
  mesh.position.set(x, heightAt(x, z) + sy * 0.55, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  if (sy * 2 > 1.5) {
    addBoxCollider(x, z, sx * 0.72, sz * 0.72);
  }
  return mesh;
}

function tentAt(group, x, z, canvas) {
  boxAt(group, x, z, 2.6, 0.95, 2.4, canvas);
  coneOnGround(group, x, z, 2.15, 2.6, canvas, false, 1.85 - 1.3);
}

function railCartSpots(mines) {
  const rail = ROADS.find((road) => road.name === "ironRail");
  if (!rail) {
    return [];
  }
  const samples = samplePolyline(rail.pts, 28);
  const spots = [];
  for (let i = 1; i < samples.length - 1 && spots.length < 2; i += 1) {
    const p = samples[i];
    const dist = Math.hypot(p.x - mines.x, p.z - mines.z);
    if (dist < 100 && dist > 24) {
      const dx = samples[i + 1].x - samples[i - 1].x;
      const dz = samples[i + 1].z - samples[i - 1].z;
      const len = Math.hypot(dx, dz) || 1;
      const side = spots.length % 2 === 0 ? 1 : -1;
      spots.push({
        x: p.x + (dz / len) * 6.2 * side,
        z: p.z + (-dx / len) * 6.2 * side,
        yaw: Math.atan2(dx, dz)
      });
      i += 2;
    }
  }
  return spots;
}

function smokePuff(group, x, y, z, radius, material) {
  const puff = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 8), material);
  puff.position.set(x, y, z);
  group.add(puff);
}

export function createIndustry(scene, maps = {}) {
  const group = new THREE.Group();
  // Rusty orange so it reads as corroded iron against the warm brown timber
  // (audit I2: rust was indistinguishable from the wood).
  // Brighter rust so it stays orange against the dark timber even in golden
  // light (audit I2: rust was indistinguishable on the headframe).
  const rust = mat(0xb55220);
  const iron = mat(0x55555c, { metalness: 0.55, roughness: 0.42 });
  const slagDark = mat(0x3a342c);
  const slagOlive = mat(0x4a4638);
  const canvas = mat(0xd2c4a0);
  const dark = maps?.wood
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xcfa06a, gain: 1.6, rough: 0.94 })
    : mat(0x6b4226);
  const roofMat = maps?.roof
    ? makeTexturedMat(maps.roof, { tiling: 1.4, tint: 0xc9a87f, gain: 1.35, rotate: false })
    : mat(0x4a3020);
  const smokeMat = new THREE.MeshBasicNodeMaterial({
    color: 0x9a9a9a,
    transparent: true,
    opacity: 0.18,
    fog: true
  });

  const mines = POS.mines;
  const mill = POS.stampMill;
  const company = POS.company;
  const camp = POS.ironValley;

  const cartPositions = [];
  for (const spot of railCartSpots(mines)) {
    cartPositions.push(oreCart(group, spot.x, spot.z, spot.yaw, rust, iron));
  }
  cartPositions.push(oreCart(
    group,
    mill.x + 48,
    mill.z - 82,
    Math.atan2(mines.x - mill.x, mines.z - mill.z),
    rust,
    iron
  ));
  cartPositions.push(oreCart(group, company.x + 18, company.z + 10, 0, rust, iron));

  slagHeap(group, mines.x - 16, mines.z - 10, 3.4, 1.7, 2.8, slagDark);
  slagHeap(group, mines.x + 16, mines.z + 14, 2.8, 1.4, 3.1, slagOlive);
  slagHeap(group, mines.x + 4, mines.z + 18, 3.1, 1.85, 2.4, slagDark);
  slagHeap(group, mill.x - 16, mill.z + 10, 3.6, 1.9, 3.0, slagOlive);
  slagHeap(group, mill.x + 12, mill.z + 16, 2.6, 1.35, 2.9, slagDark);
  boxAt(group, mill.x - 12, mill.z - 14, 3.4, 1.15, 2.7, slagOlive);
  boxAt(group, mill.x - 11.2, mill.z - 14.5, 2.2, 0.95, 1.9, slagDark, false, 1.15);

  tentAt(group, camp.x, camp.z - 12, canvas);
  tentAt(group, camp.x - 10, camp.z - 6, canvas);
  tentAt(group, camp.x + 12, camp.z - 14, canvas);

  const cribX = mines.x + 4;
  const cribZ = mines.z - 8;
  for (let i = 0; i < 4; i += 1) {
    boxAt(group, cribX, cribZ, 3.5, 0.32, 0.48, dark, false, i * 0.34);
  }
  for (let i = 0; i < 3; i += 1) {
    boxAt(group, cribX, cribZ, 0.48, 0.32, 3.3, dark, false, 1.36 + i * 0.34);
  }
  addBoxCollider(cribX, cribZ, 1.85, 1.75);
  boxAt(group, cribX + 2.4, cribZ + 1.1, 0.35, 0.22, 1.1, iron, false, 0.02);
  boxAt(group, cribX - 1.8, cribZ - 0.6, 0.28, 0.18, 0.55, rust, false, 0.02);

  const platX = mill.x - 2;
  const platZ = mill.z + 10;
  boxAt(group, platX, platZ, 10, 0.38, 5.2, dark);
  boxAt(group, platX - 4.2, platZ + 2.1, 0.32, 2.3, 0.32, dark, false);
  boxAt(group, platX + 4.2, platZ + 2.1, 0.32, 2.3, 0.32, dark, false);

  // Stamp mill shed: the mill previously read as a platform and smokestack
  // with no building (audit I1). A long timber shed with a gable roof gives
  // the stamp battery a distinct home beside the stack.
  const millShedX = mill.x - 2;
  const millShedZ = mill.z - 6;
  const shedY = heightAt(millShedX, millShedZ);
  boxAt(group, millShedX, millShedZ, 12, 4.2, 8, dark);
  const millRoof = gableRoof({ w: 12, d: 8, pitch: 0.45, overhang: 0.4, eave: 4.2, material: roofMat });
  millRoof.position.set(millShedX, shedY, millShedZ);
  group.add(millRoof);
  addBoxCollider(millShedX, millShedZ, 6, 4);

  const stackX = mill.x + 8;
  const stackZ = mill.z;
  const stackY = heightAt(stackX, stackZ) + 14;
  smokePuff(group, stackX, stackY, stackZ, 1.7, smokeMat);
  smokePuff(group, stackX + 0.4, stackY + 2.3, stackZ + 0.25, 2.1, smokeMat);
  smokePuff(group, stackX + 0.85, stackY + 4.6, stackZ + 0.55, 2.5, smokeMat);
  smokePuff(group, stackX + 1.3, stackY + 7.0, stackZ + 0.9, 2.9, smokeMat);
  const headY = heightAt(mines.x, mines.z) + 14;
  smokePuff(group, mines.x + 0.3, headY + 1.2, mines.z + 0.2, 1.8, smokeMat);
  smokePuff(group, mines.x + 0.7, headY + 3.4, mines.z + 0.5, 2.3, smokeMat);

  scene.add(group);
  return {
    group,
    carts: cartPositions.length,
    slag: 6,
    tents: 3,
    cribbing: 1,
    platform: 1,
    smoke: 6,
    cartPositions
  };
}
