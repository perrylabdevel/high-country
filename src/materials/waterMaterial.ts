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
  cameraViewMatrix,
  cameraFar,
  clamp,
  float,
  fract,
  mix,
  mx_noise_float,
  cameraPosition,
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
  "waterSky",
  "waterFresnel",
  "waterNormalScale3",
  "waterNormalSpeed3",
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
  "waterSky",
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
  // Tiling value noise, three octaves. Each octave's lattice hashes wrap at
  // that octave's own integer frequency — lattice point f hashes as point 0 —
  // so the texture repeats with no seam. The previous hash sampled raw lattice
  // coordinates, where point 7 is a different number from point 0, and every
  // octave drew its own visible grid line across the lake foreground
  // (audit U2 at lakeMercy). Offsets stay legal because the wrap is on the
  // lattice index, not the domain: a constant shift moves the start inside a
  // cell, and the cell across the edge maps back to the starting one.
  const h = (x: number, y: number, seed: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const noise2 = (x: number, y: number, f: number, seed: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const w = (i: number) => ((i % f) + f) % f;
    const a = h(w(ix), w(iy), seed);
    const b = h(w(ix + 1), w(iy), seed);
    const c = h(w(ix), w(iy + 1), seed);
    const d = h(w(ix + 1), w(iy + 1), seed);
    const u = smooth(fx);
    const v = smooth(fy);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  // Derive both slope components from a periodic height field. Using the
  // same noise value for x and y biases every ripple toward one diagonal.
  const heights = new Float32Array(512 * 512);
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 512; x += 1) {
      const u = x / 512;
      const v = y / 512;
      heights[y * 512 + x] = noise2(u * 7, v * 7, 7, 1)
        + noise2(u * 19 + 4.7, v * 19 + 9.1, 19, 2) * 0.3
        + noise2(u * 53 + 2.3, v * 53 + 6.8, 53, 3) * 0.07;
    }
  }
  const height = (x: number, y: number) => heights[((y + 512) % 512) * 512 + (x + 512) % 512];
  for (let y = 0; y < 512; y += 1) {
    for (let x = 0; x < 512; x += 1) {
      const dx = (height(x - 1, y) - height(x + 1, y)) * 12;
      const dy = (height(x, y - 1) - height(x, y + 1)) * 12;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * 512 + x) * 4;
      data[i] = (dx / length * 0.5 + 0.5) * 255;
      data[i + 1] = (dy / length * 0.5 + 0.5) * 255;
      data[i + 2] = (1 / length * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, 512, 512, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function createWaterMaterial(
  normalMap: THREE.Texture,
  opts: {
    toxic?: boolean;
    depthSource: "buffer" | "attribute" | "lake";
    screenRefraction?: boolean;
    // Shore-foam band scale for this body. The foam edge is an absolute depth
    // (foamThreshold metres) which is right for a 7 m-deep lake, but a creek
    // ribbon is only ~0.45 m deep everywhere — against the absolute band the
    // whole ribbon counts as "shore" and saturates to solid white. Creeks
    // pass a small scale so their foam hugs the banks.
    foamScale?: number;
    // Floor of the body-colour share in the refraction mix. 0.15 lets a deep
    // lake's shallows read the bottom through the screen sample; a creek seen
    // at a grazing angle has no useful screen sample (the pixels behind its
    // surface are the far bank, not its bed), so it needs a much higher
    // floor or it renders as washed-out milk.
    refractBase?: number;
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
    depth = attribute("aDepth", "float") as Node<"float">;
  }
  depth = depth.max(0).toVar();

  const dNorm = smoothstep(float(0), u.waterDepthFalloff as FloatUniform, depth).toVar();
  const baseCol = mix(shallow, deep, dNorm).toVar();

  const flow = depthSource === "attribute" ? (attribute("aFlow", "vec2") as Node<"vec2">) : vec2(1, 0);
  const slope = depthSource === "attribute" ? (attribute("aSlope", "float") as Node<"float">) : float(0);
  const whitewater = smoothstep(
    u.whitewaterSlope as FloatUniform,
    (u.whitewaterSlope as FloatUniform).mul(1.6),
    slope
  ).mul(u.whitewaterStrength as FloatUniform);

  const perturbStrength = (u.waterNormalStrength as FloatUniform).add(whitewater.mul(0.8));
  const flowLen = flow.length();

  const scrollA = (flow.mul(flowLen).mul(u.waterNormalSpeed1 as FloatUniform)).mul(time);
  const crossFlow = vec2(flow.y.negate(), flow.x);
  const scrollB = (flow.mul(0.35).add(crossFlow.mul(0.65)).mul(flowLen).mul(u.waterNormalSpeed2 as FloatUniform)).mul(time).add(float(3.7));
  const uvA = pos.mul(u.waterNormalScale1 as FloatUniform).add(scrollA);
  const uvB = pos.mul(u.waterNormalScale2 as FloatUniform).add(scrollB);

  const nA = texture(normalMap, uvA).rgb.mul(2).sub(1);
  const nB = texture(normalMap, uvB).rgb.mul(2).sub(1);
  // A third, small-scale octave: the two large scrolls give the swell, but
  // glint needs metre-scale ripples to catch the sun in.
  const uvC = pos.mul(u.waterNormalScale3 as FloatUniform).add(
    flow.mul(-0.4).add(crossFlow.mul(0.6)).mul(flowLen).mul(u.waterNormalSpeed3 as FloatUniform).mul(time)
  );
  const nC = texture(normalMap, uvC).rgb.mul(2).sub(1);
  // Fade sub-metre detail into the distance to keep the horizon stable.
  const detailFade = smoothstep(float(25), float(180), cameraPosition.sub(positionWorld).length()).oneMinus();
  const perturb2 = nA.xy.add(nB.xy.mul(0.55)).add(nC.xy.mul(detailFade.mul(0.25)))
    .mul(perturbStrength).toVar();
  const surfaceNormal = vec3(perturb2.x, 1, perturb2.y).normalize().toVar();

  const depthClamp = clamp(depth, float(0), u.waterRefractionDepth as FloatUniform).div(u.waterRefractionDepth as FloatUniform);
  const sceneUv = screenUV.add(perturb2.mul(u.waterRefraction as FloatUniform).mul(depthClamp)).clamp(0.001, 0.999);
  const refracted = screenRefraction ? viewportSharedTexture(sceneUv).rgb : baseCol;

  // Cross-fade two staggered flow phases; the wrapping sample has zero
  // weight so the foam never jumps when the animation loops.
  const phaseA = fract(time.mul(u.waterFlowSpeed as FloatUniform));
  const phaseB = fract(phaseA.add(0.5));
  const flowA = pos.mul(u.waterFlowTiling as FloatUniform).sub(flow.mul(phaseA).mul(2.2)).mul(u.foamNoiseScale as FloatUniform);
  const flowB = pos.mul(u.waterFlowTiling as FloatUniform).sub(flow.mul(phaseB).mul(2.2)).mul(u.foamNoiseScale as FloatUniform);
  const phaseWeight = phaseA.sub(0.5).abs().mul(2);
  const foamNoise = mix(mx_noise_float(flowA), mx_noise_float(flowB), phaseWeight);
  const foamNoise01 = foamNoise.mul(0.5).add(0.5).toVar();
  // Shore foam as a wandering band, not a stripe: the depth where the foam
  // starts rides the same noise as its brightness, so the waterline breaks
  // into patches instead of drawing a uniform white band along the whole
  // shore. Intensity also fades with the noise — a full-strength band along
  // every shore read as a painted line (audit lakeMercy). Per-body foamScale
  // keeps shallow creeks out of the band entirely (see the option comment).
  const shoreDistance = attribute("aShore", "float") as Node<"float">;
  const foamScaleU = uniform(opts.foamScale ?? 1, "float");
  const foamEdge = (u.foamThreshold as FloatUniform).mul(foamScaleU).mul(foamNoise01.mul(0.4).add(0.45));
  // Authored basin depth changes over tens of metres; using it for foam
  // painted a wide white wedge around the lake. Measure the actual bank band.
  const shoreMetric = depthSource === "lake" ? shoreDistance : depth;
  const shoreMask = smoothstep(foamEdge.mul(0.4), foamEdge, shoreMetric).oneMinus();
  const foam = shoreMask.mul(foamNoise01.mul(0.8).add(0.2)).mul(u.foamStrength as FloatUniform);
  const totalFoam = clamp(foam.add(whitewater.mul(0.6)), float(0), float(1)).toVar();

  // How much of the surface colour is the water itself vs what lies under it.
  // The old fixed 0.55 floor kept even knee-deep water 45% paint, so the
  // shallows never read the bottom. Now the shallows are nearly all
  // refraction and the body colour only takes over with depth.
  const underwater = mix(refracted, baseCol, mix(float(opts.refractBase ?? 0.15), float(1), dNorm));

  // Fresnel sky reflection: flat water is a mirror at grazing angles and a
  // window straight down, so tint the surface toward the sky as the view
  // flattens. Without it the lake reads as opaque navy at every angle — the
  // body colour has no angle dependence and the eye reads that as paint.
  // Foam already carries its own brightness, so it stays out of the mix.
  // NOTE: the fresnel term is folded into the expression rather than
  // `.assign()`ed onto a var — an assign nothing downstream references is
  // never emitted into the shader, and the tint silently no-ops (measured:
  // a forced-red assign left the frame unchanged). The grazing term is
  // world-space — how level the sight line to the camera runs — because the
  // view-space normalView·positionViewDirection dot came out inverted
  // against the geometry (near field tinted, horizon dark).
  const toCam = cameraPosition.sub(positionWorld).normalize();
  const upDot = toCam.dot(surfaceNormal).abs().clamp(0, 1);
  const fresnel = upDot.oneMinus().pow(3).mul(u.waterFresnel as FloatUniform)
    .mul(totalFoam.oneMinus());
  const waterCol = mix(
    mix(underwater, vec3(1, 1, 1), totalFoam),
    u.waterSky as ColorUniform,
    fresnel
  );

  const mat = new THREE.MeshStandardNodeMaterial({
    transparent: true,
    metalness: 0.0,
    roughness: 0.0,
    depthWrite: false,
    envMapIntensity: 1.0
  });
  const bankNoise = mx_noise_float(pos.mul(0.7)).mul(0.12).add(0.18);
  const shoreOpacity = smoothstep(bankNoise, bankNoise.add(0.65), shoreDistance);
  mat.opacityNode = depthSource === "attribute"
    ? shoreOpacity.mul(smoothstep(float(0), float(0.12), depth)).mul(attribute("aJoin", "float") as Node<"float">)
    : shoreOpacity;
  mat.colorNode = waterCol;
  mat.roughnessNode = mix(u.waterRoughness as FloatUniform, float(0.65), totalFoam);
  mat.metalnessNode = float(0.0);
  // NodeMaterial expects a view-space normal; our water slopes are world-space.
  mat.normalNode = surfaceNormal.transformDirection(cameraViewMatrix);
  mat.side = THREE.DoubleSide;
  return mat;
}
