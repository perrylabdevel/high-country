/**
 * Targets three@0.185.1 (WebGPURenderer + TSL).
 * Ground truth: node_modules/three/src/nodes/TSL.js
 *
 * Terrain: TSL 4-layer PBR (grass/dirt/rock/gravel) with a splat baked from
 * biomeAt / roadFactor / creekFactor / lakeFactor. Vertex biome colors stay
 * as a macro tint. Stage/road/trail ribbons are retired; gravel lives in splat.a.
 */
import * as THREE from "three/webgpu";
import { mix, normalize, positionLocal, smoothstep, uniform } from "three/tsl";
import { WORLD, heightAt, bakeHeightfield, grassTexture } from "./world.js";
import { biomeAt, roadFactor, lakeFactor, creekFactor } from "./map.js";
import { loadTerrainMaps } from "./materials/loadSet.ts";
import { bakeSplatMap } from "./materials/splatMap.ts";
import { createTerrainMaterial } from "./materials/terrainMaterial.ts";

const BIOME = {
  lake: [0.22, 0.32, 0.18],
  ranch: [0.4, 0.5, 0.22],
  town: [0.42, 0.38, 0.28],
  pines: [0.16, 0.26, 0.14],
  burn: [0.2, 0.16, 0.12],
  range: [0.42, 0.55, 0.24],
  iron: [0.34, 0.3, 0.26],
  badlands: [0.56, 0.34, 0.2],
  tribal: [0.38, 0.42, 0.22],
  foothills: [0.3, 0.4, 0.2],
  valley: [0.36, 0.46, 0.22]
};

function canvasGrassMaterial() {
  const grass = grassTexture();
  grass.repeat.set(140, 170);
  return new THREE.MeshStandardNodeMaterial({
    vertexColors: true,
    map: grass,
    roughness: 0.92,
    metalness: 0.02
  });
}

let terrainMesh = null;
let terrainMaps = null;

export async function createTerrain() {
  bakeHeightfield();
  const geo = new THREE.PlaneGeometry(WORLD.width, WORLD.depth, WORLD.segmentsX, WORLD.segmentsZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
    const slope = Math.min(1, Math.abs(heightAt(x + 3, z) - y) * 0.28);
    const biome = biomeAt(x, z);
    const base = BIOME[biome] || BIOME.valley;
    const road = roadFactor(x, z);
    const creek = creekFactor(x, z);
    const lake = lakeFactor(x, z);
    let r = base[0] * (1 - slope * 0.45) + 0.3 * slope;
    let g = base[1] * (1 - slope * 0.45) + 0.28 * slope;
    let b = base[2] * (1 - slope * 0.35) + 0.26 * slope;
    r = r * (1 - road) + 0.42 * road;
    g = g * (1 - road) + 0.28 * road;
    b = b * (1 - road) + 0.16 * road;
    r = r * (1 - creek * 0.4) + 0.22 * creek;
    g = g * (1 - creek * 0.4) + 0.32 * creek;
    b = b * (1 - creek * 0.4) + 0.28 * creek;
    if (lake > 0.5) {
      r = r * (1 - lake) + 0.2 * lake;
      g = g * (1 - lake) + 0.28 * lake;
      b = b * (1 - lake) + 0.22 * lake;
    }
    colors.push(r, g, b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  try {
    geo.computeTangents();
  } catch (err) {
    console.warn("Terrain tangents skipped", err);
  }

  let mat;
  try {
    terrainMaps = await loadTerrainMaps();
    if (terrainMaps) {
      mat = createTerrainMaterial(terrainMaps, bakeSplatMap());
    }
  } catch (err) {
    console.warn("Terrain PBR material failed, using canvas grass", err);
  }
  if (!mat) {
    mat = canvasGrassMaterial();
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  terrainMesh = mesh;
  return mesh;
}

export function rebuildTerrainMaterial() {
  if (!terrainMesh || !terrainMaps) {
    return;
  }
  const mat = createTerrainMaterial(terrainMaps, bakeSplatMap());
  terrainMesh.material = mat;
  terrainMesh.material.needsUpdate = true;
}

export function createSky(scene) {
  scene.background = new THREE.Color(0x87a7c4);
  scene.fog = new THREE.FogExp2(0x9bb4c8, 0.00038);
  const hemi = new THREE.HemisphereLight(0xcfe6f4, 0x6b542e, 0.32);
  const sun = new THREE.DirectionalLight(0xffe1b0, 1.15);
  sun.position.set(-180, 220, -90);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.camera.left = -260;
  sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260;
  sun.shadow.camera.bottom = -260;
  sun.shadow.bias = -0.00025;
  scene.add(sun.target);
  const fill = new THREE.AmbientLight(0x6a7c8c, 0.1);
  scene.add(hemi, sun, fill);

  const top = uniform(new THREE.Color(0x5d8fbf));
  const mid = uniform(new THREE.Color(0xd7c09a));
  const bot = uniform(new THREE.Color(0xf0e2c4));
  const h = normalize(positionLocal).y;
  const skyMat = new THREE.MeshBasicNodeMaterial({
    side: THREE.BackSide,
    fog: false
  });
  skyMat.colorNode = mix(mix(bot, mid, smoothstep(-0.15, 0.12, h)), top, smoothstep(0.12, 0.72, h));
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3800, 32, 16), skyMat);
  scene.add(sky);

  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(22, 16, 16),
    new THREE.MeshBasicNodeMaterial({ color: 0xfff1c8, fog: false })
  );
  scene.add(sunMesh);
  return { sun, hemi, sky, sunMesh };
}
