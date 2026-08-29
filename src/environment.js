/**
 * Targets three@0.185.1 (WebGPURenderer + TSL).
 * Ground truth: node_modules/three/src/nodes/TSL.js
 *
 * Terrain: TSL 4-layer PBR (grass/dirt/rock/gravel) with a splat baked from
 * biomeAt / roadFactor / creekFactor / lakeFactor. Vertex biome colors stay
 * as a macro tint. Stage/road/trail ribbons are retired; gravel lives in splat.a.
 */
import * as THREE from "three/webgpu";
import {
  clamp, dot, mix, mx_fractal_noise_float, normalize, positionLocal, pow,
  smoothstep, time, uniform, vec2, vec3
} from "three/tsl";
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
  burn: [0.1, 0.07, 0.05],
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

/**
 * Sky gradient palettes keyed to sun elevation. The old dome was a fixed
 * cream/beige gradient that read as "Mars under a featureless dome" at golden
 * hour; these stops stay warm at golden without going cream-brown, and at
 * midday run blue through a pale warm haze. `[0]` is the low-sun (golden)
 * palette, `[1]` the high-sun (midday) one; updateSun() lerps between them.
 */
const SKY_PALETTE = {
  top: [0x8492b2, 0x4a80bd],
  mid: [0xd3a579, 0x9db9d2],
  bot: [0xf0c194, 0xe9e4d3]
};

export function createSky(scene) {
  scene.background = new THREE.Color(0x87a7c4);
  scene.fog = new THREE.FogExp2(0x9bb4c8, 0.00038);
  const hemi = new THREE.HemisphereLight(0xcfe6f4, 0x6b542e, 0.32);
  const sun = new THREE.DirectionalLight(0xffe1b0, 1.15);
  sun.position.set(-180, 220, -90);
  sun.castShadow = true;
  // 4096 shadow map: at 2048 the long golden shadows were too soft to read as
  // directional (audit U5 at golden). 4096 doubles the texel density over the
  // same frustum for a cost the frame budget absorbs.
  sun.shadow.mapSize.set(4096, 4096);
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

  const top = uniform(new THREE.Color(SKY_PALETTE.top[1]));
  const mid = uniform(new THREE.Color(SKY_PALETTE.mid[1]));
  const bot = uniform(new THREE.Color(SKY_PALETTE.bot[1]));
  // 0 = high sun, 1 = sun at the horizon. Drives cloud tint and the halo's
  // colour and spread; the palettes above are already lerped on the CPU side.
  const warm = uniform(0);
  const skySunDir = uniform(new THREE.Vector3(0, 1, 0));
  const cover = uniform(0.45);

  const dirV = normalize(positionLocal);
  const h = dirV.y;

  // Gradient dome: haze at the horizon, zenith blue above.
  const grad = mix(mix(bot, mid, smoothstep(-0.15, 0.12, h)), top, smoothstep(0.12, 0.72, h));

  // Sun halo, layered in the dome itself: a tight core glow plus a broad
  // warmth spread that swells as the sun drops. Lives on the dome (not a
  // billboard) so it is always concentric with the sun disc from the camera.
  const sunAmt = dot(dirV, normalize(skySunDir)).max(0.001);
  const glow = pow(sunAmt, 260).mul(0.9).add(pow(sunAmt, 10).mul(warm.mul(0.5).add(0.14)));
  const glowCol = mix(vec3(1.0, 0.97, 0.9), vec3(1.0, 0.82, 0.58), warm);

  // Clouds: two FBM layers over a flat-projection domain, so cover stretches
  // into horizon streaks the way cloud decks read at distance. Both drift on
  // the pinned TSL `time` node, so captures freeze them like all other wind.
  const drift = time.mul(0.01);
  // Scale ~3: cloud masses span ~5 noise units mid-sky (10-20 deg), stretching
  // toward the horizon as the divide blows up the domain near dirV.y -> 0.
  const proj = vec2(dirV.x, dirV.z).div(dirV.y.max(0.035)).mul(3.0);
  const n1 = mx_fractal_noise_float(
    vec3(proj.add(vec2(drift, drift.mul(0.4))), 7.3), 4, 2.2, 0.55
  ).mul(0.5).add(0.5);
  const n2 = mx_fractal_noise_float(
    vec3(vec2(proj.x.mul(0.22), proj.y.add(proj.x.mul(0.35))).add(vec2(drift.mul(1.7), 3.7)), 11.9), 3, 2.4, 0.5
  ).mul(0.5).add(0.5);
  const cumulus = smoothstep(mix(0.82, 0.44, cover), mix(0.93, 0.58, cover), n1);
  const cirrus = smoothstep(0.6, 0.72, n2).mul(0.38);
  const cloudAmt = clamp(cirrus.add(cumulus), 0, 1).mul(smoothstep(0.02, 0.16, h));
  const cloudLit = mix(vec3(1.02, 0.99, 0.94), vec3(1.06, 0.87, 0.7), warm);
  const cloudShade = mix(vec3(0.84, 0.86, 0.9), vec3(0.85, 0.73, 0.68), warm);
  const cloudCol = mix(cloudShade, cloudLit, smoothstep(0.4, 0.8, n1));

  const skyMat = new THREE.MeshBasicNodeMaterial({
    side: THREE.BackSide,
    fog: false
  });
  skyMat.colorNode = mix(grad.add(glowCol.mul(glow)), cloudCol, cloudAmt);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3800, 32, 16), skyMat);
  scene.add(sky);

  // HDR core: over-unity color so tone mapping reads it as white-hot instead
  // of the flat gray disc the old 1.0-white material produced.
  const sunMat = new THREE.MeshBasicNodeMaterial({ fog: false });
  sunMat.colorNode = vec3(2.6, 2.3, 1.9);
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(18, 16, 16),
    sunMat
  );
  scene.add(sunMesh);

  /**
   * Retune the dome and the haze for a sun elevation. The horizon stop and
   * the fog colour are derived from the SAME color, so distant terrain always
   * fades into the sky the air actually shows (the old dome hazed into a fog
   * hue the sky did not contain).
   */
  const golden = { top: new THREE.Color(SKY_PALETTE.top[0]), mid: new THREE.Color(SKY_PALETTE.mid[0]), bot: new THREE.Color(SKY_PALETTE.bot[0]) };
  const midday = { top: new THREE.Color(SKY_PALETTE.top[1]), mid: new THREE.Color(SKY_PALETTE.mid[1]), bot: new THREE.Color(SKY_PALETTE.bot[1]) };
  function updateSun(elevationDeg, sunWorldDir) {
    const t = Math.max(0, Math.min(1, elevationDeg / 45));
    top.value.copy(golden.top).lerp(midday.top, t);
    mid.value.copy(golden.mid).lerp(midday.mid, t);
    bot.value.copy(golden.bot).lerp(midday.bot, t);
    warm.value = 1 - t;
    skySunDir.value.copy(sunWorldDir);
    scene.fog.color.copy(bot.value);
  }

  return { sun, hemi, sky, sunMesh, updateSun, cover };
}
