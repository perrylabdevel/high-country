/**
 * Targets three@0.185.1 (WebGPURenderer + TSL).
 * Ground truth: node_modules/three/src/nodes/TSL.js
 *
 * Water surface: depth ramp, dual scrolling normals steered by a per-vertex flow
 * vector, two-phase flow scroll, refraction off viewportSharedTexture, shoreline
 * foam, and slope-driven whitewater. Fresnel reflection rides the standard
 * material's env-map specular (scene.environment is set by the HDRI).
 *
 * The creek ribbons are flat at WATER=13 with no carved bed, so creek depth comes
 * from a per-vertex attribute baked from heightAt(); the lake samples the depth
 * buffer instead.
 */
import * as THREE from "three/webgpu";
import type { Node } from "three/webgpu";
import {
  attribute,
  cameraNear,
  cameraFar,
  clamp,
  float,
  fract,
  mix,
  mx_noise_float,
  perspectiveDepthToViewZ,
  positionView,
  positionWorld,
  screenUV,
  smoothstep,
  texture,
  time,
  uniform,
  vec2,
  vec3,
  viewportDepthTexture,
  viewportSharedTexture
} from "three/tsl";
import { materialSettings } from "./settings.ts";

const KEYS = [
  "waterShallow",
  "waterDeep",
  "waterToxicShallow",
  "waterToxicDeep",
  "waterDepthFalloff",
  "waterNormalScale1",
  "waterNormalScale2",
  "waterNormalSpeed1",
  "waterNormalSpeed2",
  "waterNormalStrength",
  "waterFlowSpeed",
  "waterFlowTiling",
  "waterRefraction",
  "waterRefractionDepth",
  "waterRoughness",
  "foamThreshold",
  "foamNoiseScale",
  "foamStrength",
  "whitewaterSlope",
  "whitewaterStrength"
] as const;

type WaterKey = (typeof KEYS)[number];
type FloatUniform = Node<"float"> & { value: number };
type ColorUniform = Node<"vec3"> & { value: THREE.Color };

const COLOR_KEYS = new Set<WaterKey>([
  "waterShallow",
  "waterDeep",
  "waterToxicShallow",
  "waterToxicDeep"
]);

const u = {} as Record<WaterKey, FloatUniform | ColorUniform>;
for (const key of KEYS) {
  const v = materialSettings[key];
  if (COLOR_KEYS.has(key)) {
    // "color" (not "vec3") is required so the WebGPU backend instantiates a
    // ColorNodeUniform, which packs the GPU buffer from .r/.g/.b. A "vec3"
    // uniform packs from .x/.y/.z, which THREE.Color doesn't have — every
    // component read back undefined, written into the float buffer as NaN,
    // and every water body sharing this uniform rendered black.
    u[key] = uniform(new THREE.Color(v as THREE.ColorRepresentation), "color") as unknown as ColorUniform;
  } else {
    u[key] = uniform(v as number, "float") as unknown as FloatUniform;
  }
}

export function syncWaterUniforms(): void {
  for (const key of KEYS) {
    const v = materialSettings[key];
    if (COLOR_KEYS.has(key)) {
      (u[key] as ColorUniform).value.set(v as THREE.ColorRepresentation);
    } else {
      (u[key] as FloatUniform).value = v as number;
    }
  }
}

export function createWaterFallbackMaterial(toxic = false): THREE.MeshStandardNodeMaterial {
  return new THREE.MeshStandardNodeMaterial({
    color: toxic ? materialSettings.waterToxicDeep : materialSettings.waterDeep,
    transparent: true,
    opacity: 0.88,
    metalness: 0,
    roughness: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide
  });
}

export function makeWaterNormalTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const image = ctx.createImageData(512, 512);
  const data = image.data;
  // Gradient noise with three octaves. The old sum-of-sines normal read as an
  // obvious repeating grid across the lake foreground (audit U2 at lakeMercy);
  // value noise at unrelated frequencies has no visible period.
  const h = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise2 = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const a = h(ix, iy);
    const b = h(ix + 1, iy);
    const c = h(ix, iy + 1);
    const d = h(ix + 1, iy + 1);
    const u = smooth(fx);
    const v = smooth(fy);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 512; x += 1) {
      const u = x / 512;
      const v = y / 512;
      const n1 = noise2(u * 7, v * 7) * 1.0;
      const n2 = noise2(u * 19 + 4.7, v * 19 + 9.1) * 0.45;
      const n3 = noise2(u * 53 + 2.3, v * 53 + 6.8) * 0.22;
      const nx = (n1 - 0.5) * 1.7 + (n2 - 0.5) * 0.9 + (n3 - 0.5) * 0.4;
      const nz = (n1 - 0.5) * 1.4 + (n2 - 0.5) * 0.7 + (n3 - 0.5) * 0.3;
      const nxN = nx / Math.sqrt(nx * nx + nz * nz + 1) * 1.6;
      const nzN = nz / Math.sqrt(nx * nx + nz * nz + 1) * 1.6;
      const i = (y * 512 + x) * 4;
      data[i] = (nxN * 0.5 + 0.5) * 255;
      data[i + 1] = (nzN * 0.5 + 0.5) * 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, 512, 512, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

export function createWaterMaterial(
  normalMap: THREE.Texture,
  opts: {
    toxic?: boolean;
    depthSource: "buffer" | "attribute" | "lake";
    screenRefraction?: boolean;
  } = { depthSource: "buffer" }
): THREE.MeshStandardNodeMaterial {
  const toxic = Boolean(opts.toxic);
  const depthSource = opts.depthSource;
  const screenRefraction = opts.screenRefraction ?? true;

  const shallow = (toxic ? u.waterToxicShallow : u.waterShallow) as ColorUniform;
  const deep = (toxic ? u.waterToxicDeep : u.waterDeep) as ColorUniform;

  const pos = positionWorld.xz.toVar();

  let depth: Node<"float">;
  if (depthSource === "buffer") {
    const sceneDepth = viewportDepthTexture(screenUV).r;
    const floorViewZ = perspectiveDepthToViewZ(sceneDepth, cameraNear, cameraFar);
    const floorDist = floorViewZ.negate();
    const surfaceDist = positionView.z.negate();
    depth = floorDist.sub(surfaceDist);
  } else {
    depth = attribute("aDepth", "float");
  }
  depth = depth.toVar();

  const dNorm = smoothstep(float(0), u.waterDepthFalloff as FloatUniform, depth).toVar();
  const baseCol = mix(shallow, deep, dNorm).toVar();

  const flow = depthSource === "attribute" ? attribute("aFlow", "vec2") : vec2(1, 0);
  const slope = depthSource === "attribute" ? attribute("aSlope", "float") : float(0);
  const whitewater = smoothstep(
    u.whitewaterSlope as FloatUniform,
    (u.whitewaterSlope as FloatUniform).mul(1.6),
    slope
  ).mul(u.whitewaterStrength as FloatUniform);

  const perturbStrength = (u.waterNormalStrength as FloatUniform).add(whitewater.mul(0.8));
  const flowLen = flow.length();

  const scrollA = (flow.mul(flowLen).mul(u.waterNormalSpeed1 as FloatUniform)).mul(time);
  const scrollB = (flow.mul(flowLen).mul(u.waterNormalSpeed2 as FloatUniform)).mul(time).add(float(3.7));
  const uvA = pos.mul(u.waterNormalScale1 as FloatUniform).add(scrollA);
  const uvB = pos.mul(u.waterNormalScale2 as FloatUniform).add(scrollB);

  const nA = texture(normalMap, uvA).rgb.mul(2).sub(1);
  const nB = texture(normalMap, uvB).rgb.mul(2).sub(1);
  const combined = vec3(nA.xy.add(nB.xy), nA.z.mul(nB.z));

  const perturb2 = combined.xy.mul(perturbStrength);

  const depthClamp = clamp(depth, float(0), u.waterRefractionDepth as FloatUniform).div(u.waterRefractionDepth as FloatUniform);
  const sceneUv = screenUV.add(perturb2.mul(u.waterRefraction as FloatUniform).mul(depthClamp));
  const refracted = screenRefraction ? viewportSharedTexture(sceneUv).rgb : baseCol;

  const phaseA = smoothstep(float(0), float(0.6), fract(time.mul(u.waterFlowSpeed as FloatUniform)));
  const phaseB = smoothstep(float(0), float(0.6), fract(time.mul(u.waterFlowSpeed as FloatUniform).add(float(0.5))));
  const flowA = pos.mul(u.waterFlowTiling as FloatUniform).add(flow.mul(phaseA).mul(2.2)).mul(u.foamNoiseScale as FloatUniform);
  const flowB = pos.mul(u.waterFlowTiling as FloatUniform).add(flow.mul(phaseB).mul(2.2)).mul(u.foamNoiseScale as FloatUniform);
  const foamNoise = mix(mx_noise_float(flowA), mx_noise_float(flowB), mix(phaseA, phaseB, float(0.5)));
  const shoreMask = smoothstep((u.foamThreshold as FloatUniform).mul(0.35), u.foamThreshold as FloatUniform, depth).oneMinus();
  const foam = shoreMask.mul(foamNoise.mul(0.5).add(0.5)).mul(u.foamStrength as FloatUniform);
  const totalFoam = clamp(foam.add(whitewater.mul(0.6)), float(0), float(1.4)).toVar();

  const underwater = mix(refracted, baseCol, float(0.55).add(dNorm.mul(0.45)));
  const waterCol = mix(underwater, vec3(1, 1, 1), totalFoam);

  const mat = new THREE.MeshStandardNodeMaterial({
    transparent: true,
    metalness: 0.0,
    roughness: 0.0,
    depthWrite: false,
    envMapIntensity: 1.0
  });
  mat.colorNode = waterCol;
  mat.roughnessNode = u.waterRoughness as FloatUniform;
  mat.metalnessNode = float(0.0);
  mat.normalNode = vec3(perturb2.x, perturb2.y, 1).normalize();
  mat.side = THREE.DoubleSide;
  return mat;
}
