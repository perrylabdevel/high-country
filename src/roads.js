/** Rail ballast, unfinished rail, and creek bridges.
 * Stage / road / trail ribbons are retired — those are the terrain gravel splat.
 */
import * as THREE from "three/webgpu";
import { heightAt, dirtTexture } from "./world.js";
import {
  ROADS,
  BRIDGES,
  mapToWorld,
  samplePolyline,
  polylineLength,
  bridgeLift,
  headingRotationY
} from "./map.js";
import { TEXTURE_SETS } from "./materials/textureManifest.ts";
import { tryLoadTexture } from "./materials/loadTexture.ts";
import { boxOnPlane } from "./buildings/kit.js";

const KIND_LOOK = {
  stage: { color: [0.38, 0.25, 0.14], rut: [0.24, 0.14, 0.08], lift: 0.22, slices: 5 },
  road: { color: [0.44, 0.3, 0.16], rut: [0.3, 0.18, 0.1], lift: 0.2, slices: 3 },
  trail: { color: [0.5, 0.36, 0.2], rut: [0.36, 0.24, 0.12], lift: 0.16, slices: 2 },
  rail: { color: [0.34, 0.32, 0.28], rut: [0.26, 0.24, 0.22], lift: 0.14, slices: 2 }
};

const UV_ALONG = 12;
let ribbonDirt = null;

function ribbonDirtMap() {
  if (!ribbonDirt) {
    ribbonDirt = dirtTexture();
    ribbonDirt.wrapS = THREE.RepeatWrapping;
    ribbonDirt.wrapT = THREE.RepeatWrapping;
  }
  return ribbonDirt;
}

function dirtMat(map) {
  return new THREE.MeshStandardNodeMaterial({
    color: 0xffffff,
    map: map || ribbonDirtMap(),
    roughness: 0.96,
    metalness: 0.02,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
}

function mixColor(a, b, t) {
  return [
    a[0] * (1 - t) + b[0] * t,
    a[1] * (1 - t) + b[1] * t,
    a[2] * (1 - t) + b[2] * t
  ];
}

function sliceColor(look, slices, s) {
  if (slices === 2) {
    return s === 0 ? look.color : look.rut;
  }
  const u = slices === 1 ? 0 : s / (slices - 1);
  const fromCenter = Math.abs(u - 0.5) * 2;
  const rutBand = fromCenter > 0.25 && fromCenter < 0.75 ? 1 - Math.abs(fromCenter - 0.5) * 2 : 0;
  return mixColor(look.color, look.rut, rutBand);
}

function tangentAt(samples, i) {
  const prev = samples[Math.max(0, i - 1)];
  const next = samples[Math.min(samples.length - 1, i + 1)];
  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

export function ribbonSamples(road, spacing = 7) {
  const look = KIND_LOOK[road.kind] || KIND_LOOK.road;
  const lift = road.lift || look.lift;
  const samples = samplePolyline(road.pts, spacing);
  return samples.map((p, i) => {
    const tan = tangentAt(samples, i);
    return {
      x: p.x,
      y: heightAt(p.x, p.z) + lift + bridgeLift(p.x, p.z),
      z: p.z,
      tx: tan.x,
      tz: tan.z,
      lift
    };
  });
}

function makeRibbonMesh(road, samples, map) {
  const look = KIND_LOOK[road.kind] || KIND_LOOK.road;
  const slices = look.slices;
  const half = road.width * 0.5;
  const dashed = road.kind === "trail";
  const dash = 8;
  const gap = 5;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  let along = 0;
  let prevOn = false;
  let base = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (i > 0) {
      along += Math.hypot(s.x - samples[i - 1].x, s.z - samples[i - 1].z);
    }
    const on = !dashed || along % (dash + gap) < dash;
    const px = -s.tz;
    const pz = s.tx;
    for (let k = 0; k < slices; k += 1) {
      const u = slices === 1 ? 0 : k / (slices - 1);
      const across = (u - 0.5) * 2 * half;
      const x = s.x + px * across;
      const z = s.z + pz * across;
      const y = heightAt(x, z) + s.lift + bridgeLift(x, z);
      positions.push(x, y, z);
      uvs.push(u, along / UV_ALONG);
      const c = sliceColor(look, slices, k);
      colors.push(c[0], c[1], c[2]);
    }
    if (i > 0 && on && prevOn) {
      for (let k = 0; k < slices - 1; k += 1) {
        const a = base + k;
        const b = base + k + 1;
        const c = base - slices + k;
        const d = base - slices + k + 1;
        indices.push(c, a, d, d, a, b);
      }
    }
    prevOn = on;
    base += slices;
  }

  if (indices.length < 3) {
    return null;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, dirtMat(map));
  if (mesh.material.map) {
    mesh.material.map.wrapS = THREE.RepeatWrapping;
    mesh.material.map.wrapT = THREE.RepeatWrapping;
  }
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.kind = road.kind;
  mesh.userData.name = road.name;
  return mesh;
}

function addRail(group, road, map) {
  const samples = ribbonSamples(road, 5);
  const ballast = makeRibbonMesh(road, samples, map);
  if (ballast) {
    group.add(ballast);
  }
  const tieMat = new THREE.MeshStandardNodeMaterial({ color: 0x5a4030, roughness: 0.92 });
  const railMat = new THREE.MeshStandardNodeMaterial({
    color: 0x4a4a4e,
    metalness: 0.55,
    roughness: 0.4
  });
  const pileMat = new THREE.MeshStandardNodeMaterial({ color: 0x6a4e32, roughness: 0.9 });
  const tieGeo = new THREE.BoxGeometry(4.1, 0.16, 0.38);
  const railGeo = new THREE.BoxGeometry(0.12, 0.12, 1);
  let along = 0;
  const builtUntil = polylineLength(road.pts) * 0.72;

  const ties = [];
  const rails = [];
  const piles = [];
  const dummy = new THREE.Object3D();

  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    along += seg;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const my = (a.y + b.y) / 2;
    const inv = seg || 1;
    const px = -(b.z - a.z) / inv;
    const pz = (b.x - a.x) / inv;

    if (along % 2.3 < seg + 0.05) {
      dummy.position.set(mx, my + 0.04, mz);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      ties.push(dummy.matrix.clone());
    }

    if (along < builtUntil) {
      for (const side of [-0.58, 0.58]) {
        dummy.position.set(mx + px * side, my + 0.16, mz + pz * side);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, seg + 0.04);
        dummy.updateMatrix();
        rails.push(dummy.matrix.clone());
      }
    } else if (i % 7 === 0) {
      const ox = mx + px * 3.2;
      const oz = mz + pz * 3.2;
      dummy.position.set(ox, heightAt(ox, oz) + 0.28, oz);
      dummy.rotation.set(0, yaw * 0.4, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      piles.push(dummy.matrix.clone());
    }
  }

  if (ties.length) {
    const tieMesh = new THREE.InstancedMesh(tieGeo, tieMat, ties.length);
    ties.forEach((m, i) => tieMesh.setMatrixAt(i, m));
    tieMesh.instanceMatrix.needsUpdate = true;
    tieMesh.count = ties.length;
    tieMesh.receiveShadow = true;
    group.add(tieMesh);
  }
  if (rails.length) {
    const railMesh = new THREE.InstancedMesh(railGeo, railMat, rails.length);
    rails.forEach((m, i) => railMesh.setMatrixAt(i, m));
    railMesh.instanceMatrix.needsUpdate = true;
    railMesh.count = rails.length;
    group.add(railMesh);
  }
  if (piles.length) {
    const pileMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.55, 1.1), pileMat, piles.length);
    piles.forEach((m, i) => pileMesh.setMatrixAt(i, m));
    pileMesh.instanceMatrix.needsUpdate = true;
    pileMesh.count = piles.length;
    pileMesh.castShadow = true;
    group.add(pileMesh);
  }
}

function addBridges(group) {
  const deckMat = new THREE.MeshStandardNodeMaterial({ color: 0x6b4a2c, roughness: 0.88 });
  const railMat = new THREE.MeshStandardNodeMaterial({ color: 0x4a3020, roughness: 0.9 });
  for (const br of BRIDGES) {
    const p = mapToWorld(br.u, br.v);
    const y = heightAt(p.x, p.z) + bridgeLift(p.x, p.z) + 0.22;
    const deck = boxOnPlane(group, p.x, y - 0.16, p.z, br.width, 0.32, br.length, deckMat, false);
    deck.rotation.y = headingRotationY(br.yaw);
    const spin = headingRotationY(br.yaw);
    const cx = Math.cos(spin);
    const sx = Math.sin(spin);
    for (const side of [-1, 1]) {
      const rail = boxOnPlane(
        group,
        p.x + cx * side * (br.width * 0.45),
        y + 0.1,
        p.z - sx * side * (br.width * 0.45),
        0.16,
        0.7,
        br.length,
        railMat,
        false
      );
      rail.rotation.y = spin;
    }
  }
}

export async function createRoads(scene) {
  const group = new THREE.Group();
  group.name = "roads";
  const gravelMap = await tryLoadTexture(TEXTURE_SETS.gravel.albedo, "albedo");
  for (const road of ROADS) {
    if (road.kind === "rail") {
      addRail(group, road, gravelMap);
    }
  }
  addBridges(group);
  scene.add(group);
  return group;
}
