/**
 * Targets three@0.185.1 (WebGPURenderer + TSL).
 * Ground truth: node_modules/three/src/nodes/TSL.js
 *
 * Four-layer terrain: grass, dirt, rock, gravel.
 * Weights from slope + altitude + splat, then height-based blend (not linear mix).
 * Roads are the gravel splat channel with noise-broken edges — not ribbon geometry.
 */
import * as THREE from "three/webgpu";
import type { Node } from "three/webgpu";
import {
  texture,
  mix,
  smoothstep,
  max,
  float,
  vec2,
  vec3,
  uniform,
  positionWorld,
  normalWorld,
  cameraPosition,
  mx_noise_float,
  triplanarTexture,
  vertexColor,
  normalMap,
  blendOverlay,
  select,
  equal
} from "three/tsl";
import { WORLD } from "../map.js";
import { materialSettings } from "./settings.ts";
import type { LoadedSet, TerrainMaps } from "./loadSet.ts";

const NUMERIC_KEYS = [
  "grassTiling",
  "dirtTiling",
  "rockTiling",
  "gravelTiling",
  "grassHeightBias",
  "dirtHeightBias",
  "rockHeightBias",
  "gravelHeightBias",
  "blendSharpness",
  "slopeStart",
  "slopeEnd",
  "altStart",
  "altEnd",
  "macroPeriod",
  "macroStrength",
  "vertexColorMix",
  "twoScaleMix",
  "detailDistanceQ",
  "detailQ",
  "albedoGain",
  "detailDistance",
  "roadNoiseScale",
  "roadEdgeNoise",
  "roadEdgeLo",
  "roadEdgeHi",
  "roadCenterLo",
  "roadCenterHi",
  "roadCompact",
  "roadEdgeBright",
  "debugView"
] as const;

type NumericKey = (typeof NUMERIC_KEYS)[number];

type FloatUniform = Node<"float"> & { value: number };

const u = {} as Record<NumericKey, FloatUniform>;
for (const key of NUMERIC_KEYS) {
  u[key] = uniform(materialSettings[key], "float") as FloatUniform;
}

export function syncTerrainUniforms(): void {
  for (const key of NUMERIC_KEYS) {
    u[key].value = materialSettings[key];
  }
}

function dummyLinear(r: number, g: number, b: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([r, g, b, 255]), 1, 1);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const FLAT_NORMAL = dummyLinear(128, 128, 255);
const FLAT_ORM = dummyLinear(255, 217, 128);

function worldUv(tiling: FloatUniform) {
  return positionWorld.xz.div(tiling);
}

function sampleOrmNormal(set: LoadedSet, uvNode: ReturnType<typeof worldUv>) {
  const nrm = texture(set.normal ?? FLAT_NORMAL, uvNode);
  const orm = texture(set.orm ?? FLAT_ORM, uvNode);
  return {
    normal: nrm.rgb,
    ao: orm.r,
    rough: orm.g,
    height: orm.b
  };
}

function twoScaleAlbedo(set: LoadedSet, tiling: FloatUniform, near: Node<"float">, useTwoScale: boolean) {
  if (!useTwoScale) {
    return texture(set.albedo, worldUv(tiling)).rgb;
  }
  const uvA = worldUv(tiling);
  const uvB = worldUv(tiling.mul(0.137));
  const a = texture(set.albedo, uvA).rgb;
  const b = texture(set.albedo, uvB).rgb;
  return mix(a, blendOverlay(a, b), u.twoScaleMix.mul(near));
}

function heightContrib(
  weight: Node<"float">,
  height: Node<"float">,
  bias: FloatUniform,
  maxW: Node<"float">
) {
  const primed = weight.mul(height.add(bias));
  return max(float(0), primed.sub(maxW.sub(u.blendSharpness)));
}

export function createTerrainMaterial(maps: TerrainMaps, splatMap: THREE.Texture): THREE.MeshStandardNodeMaterial {
  syncTerrainUniforms();

  const tier = materialSettings.quality;
  const useTwoScale = tier !== "low";
  const useTriplanar = tier !== "low";
  const useMacro = tier !== "low";

  const splatUv = vec2(
    positionWorld.x.div(WORLD.width).add(0.5),
    float(0.5).sub(positionWorld.z.div(WORLD.depth))
  );
  const splat = texture(splatMap, splatUv);

  const dist = cameraPosition.sub(positionWorld).length();
  const far = smoothstep(u.detailDistance.mul(0.35).mul(u.detailDistanceQ), u.detailDistance.mul(u.detailDistanceQ), dist);
  const near = far.oneMinus();

  const slope = float(1).sub(normalWorld.y);
  const slopeN = slope.add(mx_noise_float(positionWorld.xz.mul(0.028)).mul(0.09));
  const rockSlope = smoothstep(u.slopeStart, u.slopeEnd, slopeN);

  const altN = positionWorld.y.add(mx_noise_float(positionWorld.xz.div(u.macroPeriod)).mul(14));
  const altRock = smoothstep(u.altStart, u.altEnd, altN);

  const nVar = mx_noise_float(positionWorld.xz.mul(0.014));
  const edgeNoise = mx_noise_float(positionWorld.xz.mul(u.roadNoiseScale));
  const roadRaw = splat.a.add(edgeNoise.mul(u.roadEdgeNoise));
  const roadMask = smoothstep(u.roadEdgeLo, u.roadEdgeHi, roadRaw).toVar();
  const center = smoothstep(u.roadCenterLo, u.roadCenterHi, splat.a).toVar();

  const grassW = splat.r.mul(rockSlope.oneMinus()).mul(nVar.mul(0.12).add(0.92)).mul(roadMask.oneMinus()).toVar();
  const dirtW = splat.g.mul(mix(float(1), float(0.32), rockSlope)).mul(mix(float(1), float(0.22), roadMask)).toVar();
  const rockW = max(splat.b, rockSlope).add(altRock.mul(0.5)).mul(roadMask.oneMinus()).toVar();
  const gravelW = roadMask.toVar();

  const grassUv = worldUv(u.grassTiling);
  const dirtUv = worldUv(u.dirtTiling);
  const rockUv = worldUv(u.rockTiling);
  const gravelUv = worldUv(u.gravelTiling);

  const grassAlb = twoScaleAlbedo(maps.grass, u.grassTiling, near, useTwoScale);
  const dirtAlb = twoScaleAlbedo(maps.dirt, u.dirtTiling, near, useTwoScale);
  const rockTexNode = texture(maps.rock.albedo);
  const rockUvAlb = texture(maps.rock.albedo, rockUv).rgb;
  const rockAlb = useTriplanar
    ? mix(
        rockUvAlb,
        triplanarTexture(
          rockTexNode,
          rockTexNode,
          rockTexNode,
          float(1).div(u.rockTiling),
          positionWorld,
          normalWorld
        ).rgb,
        rockSlope.mul(near)
      )
    : rockUvAlb;
  const gravelBase = twoScaleAlbedo(maps.gravel, u.gravelTiling, near, useTwoScale);
  const gravelAlb = mix(
    gravelBase.mul(u.roadEdgeBright),
    gravelBase.mul(float(1).sub(u.roadCompact)),
    center
  );

  const grass = sampleOrmNormal(maps.grass, grassUv);
  const dirt = sampleOrmNormal(maps.dirt, dirtUv);
  const rock = sampleOrmNormal(maps.rock, rockUv);
  const gravel = sampleOrmNormal(maps.gravel, gravelUv);
  const gravelHeight = mix(gravel.height.add(0.05), gravel.height.sub(0.04), center);
  const gravelRough = mix(gravel.rough.mul(1.06), gravel.rough.mul(0.88), center).add(nVar.mul(0.04));

  const gPrime = grassW.mul(grass.height.add(u.grassHeightBias));
  const dPrime = dirtW.mul(dirt.height.add(u.dirtHeightBias));
  const rPrime = rockW.mul(rock.height.add(u.rockHeightBias));
  const vPrime = gravelW.mul(gravelHeight.add(u.gravelHeightBias));
  const maxW = max(max(gPrime, dPrime), max(rPrime, vPrime)).toVar();

  const gC = heightContrib(grassW, grass.height, u.grassHeightBias, maxW).toVar();
  const dC = heightContrib(dirtW, dirt.height, u.dirtHeightBias, maxW).toVar();
  const rC = heightContrib(rockW, rock.height, u.rockHeightBias, maxW).toVar();
  const vC = max(float(0), vPrime.sub(maxW.sub(u.blendSharpness))).toVar();
  const sum = max(gC.add(dC).add(rC).add(vC), float(0.0001)).toVar();

  const albedo = grassAlb.mul(gC).add(dirtAlb.mul(dC)).add(rockAlb.mul(rC)).add(gravelAlb.mul(vC)).div(sum);
  const ao = grass.ao.mul(gC).add(dirt.ao.mul(dC)).add(rock.ao.mul(rC)).add(gravel.ao.mul(vC)).div(sum);
  const rough = grass.rough.mul(gC).add(dirt.rough.mul(dC)).add(rock.rough.mul(rC)).add(gravelRough.mul(vC)).div(sum);
  const nrm = grass.normal.mul(gC).add(dirt.normal.mul(dC)).add(rock.normal.mul(rC)).add(gravel.normal.mul(vC)).div(sum);

  const macro = useMacro ? mx_noise_float(positionWorld.xz.div(u.macroPeriod)).mul(u.macroStrength).add(1) : float(1);
  const biome = mix(vec3(1, 1, 1), vertexColor().rgb, u.vertexColorMix);
  const color = albedo.mul(ao).mul(macro).mul(biome).mul(u.albedoGain);

  const weightsRgb = vec3(gC.div(sum), dC.div(sum), rC.div(sum));
  const roadRgb = vec3(roadMask, center, splat.a);
  const normalRgb = normalWorld.mul(0.5).add(0.5);
  const slopeRgb = vec3(slope, rockSlope, altRock);
  const debugColor = select(
    equal(u.debugView, 1),
    weightsRgb,
    select(
      equal(u.debugView, 2),
      roadRgb,
      select(equal(u.debugView, 3), normalRgb, slopeRgb)
    )
  );
  const isDebug = u.debugView.greaterThan(0.5);

  const mat = new THREE.MeshStandardNodeMaterial({
    metalness: 0.02,
    roughness: 0.9
  });
  mat.colorNode = select(isDebug, vec3(0, 0, 0), color);
  mat.emissiveNode = select(isDebug, debugColor, vec3(0, 0, 0));
  mat.roughnessNode = rough;
  mat.metalnessNode = float(0.02);
  mat.normalNode = normalMap(nrm, vec2(near.mul(u.detailQ), near.mul(u.detailQ)));
  return mat;
}
