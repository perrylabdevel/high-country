/** Homestead and tribal-camp dressing around existing landmark placeholders. */

import * as THREE from "three/webgpu";
import { POS, TRIBAL_CAMP } from "./map.js";
import { heightAt } from "./world.js";
import { addBoxCollider, addDeckPlatform } from "./collision.js";
import { boxOnGround } from "./buildings/kit.js";
import { addFenceSpots, addPropSpot, clearPropSpots } from "./propSpots.js";
import { registerAperture } from "./buildings/apertures.js";
import { makeTexturedMat } from "./materials/texturedMat.ts";

function mat(color, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness: 0.88, ...extra });
}

function boxAt(group, x, z, w, h, d, material, collide = true, yOff = 0) {
  return boxOnGround(group, x, z, w, h, d, material, collide, yOff);
}

function cemeteryFence() {
  const cx = POS.cemetery.x;
  const cz = POS.cemetery.z;
  const halfX = 6;
  const halfZ = 4;
  const gap = 2.4;
  const gateZ = cz + halfZ;

  // Dressed stone corner and gate posts (yard kit) with post-and-rail runs
  // between them; the posts keep their colliders, the runs the side boxes.
  for (const [x, z] of [[cx - halfX, cz - halfZ], [cx + halfX, cz - halfZ], [cx - halfX, cz + halfZ], [cx + halfX, cz + halfZ], [cx - gap / 2, gateZ], [cx + gap / 2, gateZ]]) {
    addPropSpot("homestead", { kind: "gatepost_stone", x, z, yaw: 0, collide: true, cluster: "cemetery" });
  }
  const segW = halfX - gap / 2;
  const segMid = (halfX + gap / 2) / 2;
  const run = (x0, z0, x1, z1, bays) => addFenceSpots("homestead", x0, z0, x1, z1, bays);
  run(cx - halfX + 0.25, cz - halfZ, cx + halfX - 0.25, cz - halfZ, 4);
  run(cx - halfX, cz - halfZ + 0.25, cx - halfX, cz + halfZ - 0.25, 3);
  run(cx + halfX, cz - halfZ + 0.25, cx + halfX, cz + halfZ - 0.25, 3);
  run(cx - halfX + 0.25, gateZ, cx - gap / 2 - 0.25, gateZ, 2);
  run(cx + gap / 2 + 0.25, gateZ, cx + halfX - 0.25, gateZ, 2);
  addBoxCollider(cx, cz - halfZ, halfX, 0.14);
  addBoxCollider(cx - halfX, cz, 0.14, halfZ);
  addBoxCollider(cx + halfX, cz, 0.14, halfZ);
  addBoxCollider(cx - segMid, gateZ, segW / 2, 0.14);
  addBoxCollider(cx + segMid, gateZ, segW / 2, 0.14);
  registerAperture({
    structure: "cemeteryGate", side: "front", kind: "gate",
    x: cx, y: heightAt(cx, gateZ) + 0.7, z: gateZ,
    w: gap, h: 1.4, nx: 0, nz: 1, state: "traversable",
    note: "fence gate gap between the two gatepost colliders"
  });

  for (const [i, [dx, dz]] of [[-3.3, -2.2], [0.9, -2.6], [3.7, -1.9], [-1.2, -2.9]].entries()) {
    addPropSpot("homestead", { kind: i % 2 ? "headstone_cross" : "headstone", x: cx + dx, z: cz + dz, yaw: (i - 1.5) * 0.08, s: 1.2, cluster: "cemetery" });
    addBoxCollider(cx + dx, cz + dz, 0.18, 0.1);
  }

  return { x: cx, z: gateZ };
}

function cabinPorch(group, wood, dark, stone) {
  const cabin = POS.huntingCabin;
  const porchZ = cabin.z + 3.85;
  const PORCH_W = 5;
  const PORCH_T = 0.18;
  const PORCH_D = 2.2;
  const porchDeck = boxAt(group, cabin.x, porchZ, PORCH_W, PORCH_T, PORCH_D, wood, false);
  // Standable footing, not just a slab: without a deck platform the cabin
  // porch grounds to terrain height and you stand 0.18 m inside the boards,
  // the same defect the ranch porch and the town boardwalk had. Take the
  // surface from where the slab was actually seated — boxOnGround seats on the
  // LOWEST terrain under the footprint, not the height at the centre, so
  // recomputing it from heightAt() floated this deck 0.135 m.
  addDeckPlatform(
    cabin.x, porchZ, PORCH_W / 2, PORCH_D / 2, 0,
    porchDeck.userData.groundSeat.y + PORCH_T
  );
  porchDeck.userData.walkSurface = {
    x: cabin.x, z: porchZ, y: porchDeck.userData.groundSeat.y + PORCH_T
  };
  // Trail-edge stones: the cabinTrail's gravel edge reads as a clean straight
  // line against the grass at eye level (audit U3, "cabin-side gravel pad").
  // Low stones straddle the edge on the two segments that pass the cabin so
  // the boundary is locally broken. Visual only — no colliders.
  const hash = (n) => {
    const sx = Math.sin(n * 12.9898 + 33.1 + cabin.x * 0.29 + cabin.z * 0.13) * 43758.5453;
    return sx - Math.floor(sx);
  };
  for (let i = 0; i < 14; i += 1) {
    const north = i % 2 === 0;
    const along = 3 + hash(i * 7.3) * 16;
    const side = 1.5 + hash(i * 5.1) * 1.1;
    const px = north ? cabin.x + (hash(i * 3.7) - 0.5) * side * 2 : cabin.x + along + (hash(i * 9.1) - 0.5) * 1.2;
    const pz = north ? cabin.z - along + (hash(i * 9.1) - 0.5) * 1.2 : cabin.z + (hash(i * 3.7) - 0.5) * side * 2;
    const sw = 0.3 + hash(i * 11.3) * 0.3;
    const sh = 0.22 + hash(i * 13.7) * 0.28;
    const rock = boxOnGround(group, px, pz, sw, sh, sw * 0.7, stone, false);
    rock.rotation.z = (hash(i * 15.1) - 0.5) * 0.25;
    rock.rotation.y = hash(i * 17.3) * Math.PI * 2;
  }
  boxAt(group, cabin.x - 2.15, cabin.z + 4.7, 0.18, 2.1, 0.18, dark);
  boxAt(group, cabin.x + 2.15, cabin.z + 4.7, 0.18, 2.1, 0.18, dark);
  // Chimney tall enough to clear the gable ridge (~5.6 m) and read from the
  // path side (H1). The old 4.4 m stub stayed hidden behind the roof.
  boxAt(group, cabin.x + 2, cabin.z - 3.2, 0.95, 6.7, 0.95, stone);
  addBoxCollider(cabin.x + 2, cabin.z - 3.2, 0.5, 0.5);

  // The doorway itself lives in landmarks.js — the cabin is a real shell now
  // (kit walls, door leaf, traversable aperture) instead of a solid block with
  // the door painted on. Only the threshold step remains here.
  boxAt(group, cabin.x, cabin.z - 3.05, 1.3, 0.18, 0.4, wood, false);

  const pileX = cabin.x + 6.4;
  const pileZ = cabin.z + 0.8;
  addPropSpot("homestead", { kind: "woodpile", x: pileX, z: pileZ, yaw: Math.PI / 2, cluster: "huntingCabin" });
  addBoxCollider(pileX, pileZ, 0.85, 0.85);
  addPropSpot("homestead", { kind: "chopping_block", x: pileX + 1.8, z: pileZ + 1.6, yaw: 2.2, cluster: "huntingCabin" });

  return { x: cabin.x, z: porchZ };
}

function overlookRail() {
  const o = POS.overlook;
  // cabinTrail ends on the POI running along X, so the rail stands 3 m south
  // of its end (the old one lay along the tread) with the bench inside it.
  addFenceSpots("homestead", o.x - 3.6, o.z + 3.0, o.x + 3.6, o.z + 3.0, 4, { endPost: true, collide: true });
  addPropSpot("homestead", { kind: "bench_log", x: o.x - 1.2, z: o.z + 2.05, yaw: 0, collide: true, cluster: "overlook" });
}

function tribalCamp() {
  // The camp ring stands beside the foothills trail (map.js TRIBAL_CAMP).
  // Its hearth, drying racks, hide frame and travois are props (props.js
  // TRIBAL_GEAR); the two larger lodges and the stores are built here.
  const t = { x: POS.tribal.x + TRIBAL_CAMP.dx, z: POS.tribal.z + TRIBAL_CAMP.dz };
  const lodgeOffs = [[-16, -4], [18, 6]];
  return lodgeOffs.map(([dx, dz]) => {
    const x = t.x + dx;
    const z = t.z + dz;
    addPropSpot("homestead", { kind: "tipi", x, z, yaw: Math.atan2(-dx, -dz), s: 1.05, collide: true, cluster: "tribal" });
    return { x, z };
  });
}

export function createHomestead(scene, maps = {}) {
  const group = new THREE.Group();
  clearPropSpots("homestead");
  const hasMaps = Boolean(maps?.wood && maps?.rock);
  const wood = hasMaps
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xf0dcc0, gain: 1.9 })
    : mat(0xc4a574);
  const dark = hasMaps
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xcfa06a, gain: 1.6, rough: 0.94 })
    : mat(0x6b4226);
  const stone = hasMaps
    ? makeTexturedMat(maps.rock, { tiling: 2.2, tint: 0xe0d8c8, gain: 1.35 })
    : mat(0xa89e90);

  const cemeteryGate = cemeteryFence();
  const porch = cabinPorch(group, wood, dark, stone);
  overlookRail();
  const lodges = tribalCamp();

  scene.add(group);
  return { cemeteryGate, porch, lodges };
}
