/**
 * Targets three@0.185.1.
 * Isolated material test scene. Open with ?lab
 */
import * as THREE from "three/webgpu";
import Stats from "stats.js";
import { createKtx2Loader } from "../materials/ktx2.js";
import { tryLoadTexture } from "../materials/loadTexture.ts";
import { HDRI_PATHS } from "../materials/textureManifest.ts";
import { materialSettings } from "../materials/settings.ts";
import { loadTerrainMaps, loadTextureSet, type LoadedSet } from "../materials/loadSet.ts";
import { bakeSplatMap } from "../materials/splatMap.ts";
import { createTerrainMaterial, syncTerrainUniforms } from "../materials/terrainMaterial.ts";
import { syncEnvironmentIntensity } from "../materials/hdri.ts";
import { createMaterialPanel } from "./panel.ts";

function sunDirection() {
  const elev = materialSettings.sunElevation * (Math.PI / 180);
  const azim = materialSettings.sunAzimuth * (Math.PI / 180);
  const y = Math.sin(elev);
  const hyp = Math.cos(elev);
  return new THREE.Vector3(Math.cos(azim) * hyp, y, Math.sin(azim) * hyp).normalize();
}

function placeSun(light: THREE.DirectionalLight, target: THREE.Object3D) {
  const dir = sunDirection();
  light.position.copy(dir).multiplyScalar(80);
  target.position.set(0, 0, 0);
  light.target.updateMatrixWorld();
  const low = Math.max(0, 1 - materialSettings.sunElevation / 30);
  light.color.setRGB(1, 0.88 - low * 0.16, 0.69 - low * 0.28);
  light.intensity = materialSettings.sunIntensity * (0.55 + 0.45 * Math.min(1, materialSettings.sunElevation / 32));
}

function makePreviewMaterial(maps: LoadedSet | null, tiling: number) {
  const mat = new THREE.MeshStandardNodeMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.02
  });
  if (!maps) {
    return mat;
  }
  maps.albedo.repeat.set(tiling, tiling);
  mat.map = maps.albedo;
  if (maps.normal) {
    maps.normal.repeat.set(tiling, tiling);
    mat.normalMap = maps.normal;
    mat.normalScale = new THREE.Vector2(1, 1);
  }
  if (maps.orm) {
    maps.orm.repeat.set(tiling, tiling);
    mat.aoMap = maps.orm;
    mat.roughnessMap = maps.orm;
    mat.aoMapIntensity = 1;
  }
  return mat;
}

function makeRampGeometry() {
  const geo = new THREE.PlaneGeometry(8, 20, 1, 32);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    const z = pos.getZ(i);
    const t = (z + 10) / 20;
    pos.setY(i, t * t * 8);
  }
  geo.computeVertexNormals();
  return geo;
}

export async function bootMaterialLab() {
  const forceWebGL = new URLSearchParams(window.location.search).has("webgl");
  const renderer = new THREE.WebGPURenderer({
    antialias: true,
    powerPreference: "high-performance",
    forceWebGL
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  await renderer.init();
  createKtx2Loader(renderer);
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87a7c4);
  scene.fog = new THREE.FogExp2(0x9bb4c8, materialSettings.fogDensity);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2000);
  camera.position.set(-6, 4, 14);
  camera.lookAt(0, 1, 0);

  const hemi = new THREE.HemisphereLight(0xcfe6f4, 0x6b542e, 0.32);
  const sun = new THREE.DirectionalLight(0xffe1b0, 1.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.bias = -0.00025;
  scene.add(sun.target);
  scene.add(hemi, sun);
  placeSun(sun, sun.target);

  const hdriCache: Record<string, THREE.Texture | null> = {};
  async function applyHdri() {
    const path = HDRI_PATHS[materialSettings.hdri as keyof typeof HDRI_PATHS];
    if (!hdriCache[path]) {
      hdriCache[path] = await tryLoadTexture(path, "hdr");
    }
    const env = hdriCache[path];
    scene.environment = env;
    syncEnvironmentIntensity(scene);
  }
  await applyHdri();

  const [grass, dirt, rock, gravel, terrainMaps] = await Promise.all([
    loadTextureSet("grass"),
    loadTextureSet("dirt"),
    loadTextureSet("rock"),
    loadTextureSet("gravel"),
    loadTerrainMaps()
  ]);

  const grassMat = makePreviewMaterial(grass, materialSettings.grassTiling);
  const dirtMat = makePreviewMaterial(dirt, materialSettings.dirtTiling);
  const rockMat = makePreviewMaterial(rock, materialSettings.rockTiling);
  const gravelMat = makePreviewMaterial(gravel, materialSettings.gravelTiling);

  let terrainMat = grassMat;
  if (terrainMaps) {
    terrainMat = createTerrainMaterial(terrainMaps, bakeSplatMap());
  }

  const groundGeo = new THREE.PlaneGeometry(20, 20);
  groundGeo.rotateX(-Math.PI / 2);
  try {
    groundGeo.computeTangents();
  } catch {
    /* PlaneGeometry always has UVs; ignore if tangents fail. */
  }
  const ground = new THREE.Mesh(groundGeo, terrainMat);
  ground.receiveShadow = true;
  scene.add(ground);

  const sphere = new THREE.Mesh(new THREE.SphereGeometry(1.1, 48, 32), dirtMat);
  sphere.position.set(-3.2, 1.1, 0);
  sphere.castShadow = true;
  sphere.receiveShadow = true;
  scene.add(sphere);

  const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), rockMat);
  cube.position.set(0, 1, 0);
  cube.castShadow = true;
  cube.receiveShadow = true;
  scene.add(cube);

  const rampGeo = makeRampGeometry();
  try {
    rampGeo.computeTangents();
  } catch {
    /* ignore */
  }
  const ramp = new THREE.Mesh(rampGeo, terrainMat);
  ramp.position.set(6, 0, -2);
  ramp.castShadow = true;
  ramp.receiveShadow = true;
  scene.add(ramp);

  const strip = new THREE.Mesh(new THREE.PlaneGeometry(8, 500, 1, 1), gravelMat);
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, 0.01, -260);
  strip.receiveShadow = true;
  scene.add(strip);

  const keys: Record<string, boolean> = {};
  window.addEventListener("keydown", (e) => { keys[e.code] = true; });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });

  createMaterialPanel({
    onEnv() {
      syncEnvironmentIntensity(scene);
    },
    onHdri() {
      applyHdri();
    },
    onSun() {
      placeSun(sun, sun.target);
    },
    onFog() {
      if (scene.fog && "density" in scene.fog) {
        (scene.fog as THREE.FogExp2).density = materialSettings.fogDensity;
      }
    },
    onTerrain() {
      syncTerrainUniforms();
    }
  });

  const stats = new Stats();
  stats.showPanel(0);
  document.body.appendChild(stats.dom);

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  const clock = new THREE.Timer();
  clock.connect(document);
  const label = document.createElement("div");
  label.style.cssText = "position:absolute;left:12px;bottom:12px;color:#f4ead2;text-shadow:0 1px 6px #000;font:13px Palatino,Georgia,serif;pointer-events:none";
  label.textContent = "MaterialLab · WASD move · ?lab  · world is /";
  document.body.appendChild(label);

  function frame(t: number) {
    stats.begin();
    clock.update(t);
    const dt = Math.min(0.05, clock.getDelta());
    const speed = keys.ShiftLeft || keys.ShiftRight ? 28 : 10;
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
    if (keys.KeyW) camera.position.addScaledVector(forward, speed * dt);
    if (keys.KeyS) camera.position.addScaledVector(forward, -speed * dt);
    if (keys.KeyA) camera.position.addScaledVector(right, -speed * dt);
    if (keys.KeyD) camera.position.addScaledVector(right, speed * dt);
    renderer.render(scene, camera);
    stats.end();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
