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
  fract,
  vec2,
  vec3,
  uniform,
  pow,
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
import { materialSettings, RUT_TONE } from "./settings.ts";
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
  "rutOffset",
  "rutWidth",
  "rutDepth",
  "rutWobble",
  "rutReliefMeters",
  "roadRoughnessMin",
  "groundWetness",
  "farGrassStart",
  "farGrassEnd",
  "farGrassGain",
  "debugView"
] as const;

type NumericKey = (typeof NUMERIC_KEYS)[number];

type FloatUniform = Node<"float"> & { value: number };

const u = {} as Record<NumericKey, FloatUniform>;
for (const key of NUMERIC_KEYS) {
  u[key] = uniform(materialSettings[key], "float").setName(key) as FloatUniform;
}

export function syncTerrainUniforms(): void {
  for (const key of NUMERIC_KEYS) {
    u[key].value = materialSettings[key];
  }
}

export function roadRoughness(rough: Node<"float">, center: Node<"float">, variation: Node<"float">) {
  return mix(rough.mul(1.1), rough.mul(0.95), center)
    .add(variation.mul(0.04)).max(u.roadRoughnessMin).min(1);
}

export function rutReliefHeight(band: Node<"float">, lip: Node<"float">, strength: Node<"float">) {
  return lip.mul(0.18).sub(band).mul(strength).mul(u.rutReliefMeters);
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
    // PlaneGeometry is rotated -PI/2, so its UV bitangent points toward -Z
    // while worldUv's V axis points toward +Z. Flip the OpenGL normal green
    // channel before TBN reconstruction to keep relief oriented correctly.
    normal: vec3(nrm.r, nrm.g.oneMinus(), nrm.b),
    ao: orm.r,
    rough: orm.g,
    height: orm.b
  };
}

/** Decode the signed lateral offset packed into B on a road splat. */
export function normalizedRoadLateral(road: Node<"float">, packed: Node<"float">) {
  return packed.div(road.max(float(0.001))).sub(0.5).mul(4);
}

export function decodeRoadLateral(road: Node<"float">, packed: Node<"float">) {
  const legacy = packed.sub(0.5).mul(4);
  const normalized = normalizedRoadLateral(road, packed);
  return mix(legacy, normalized, smoothstep(float(0.2), float(0.7), road));
}

function twoScaleAlbedo(set: LoadedSet, tiling: FloatUniform, near: Node<"float">, useTwoScale: boolean) {
  if (!useTwoScale) {
    return texture(set.albedo, worldUv(tiling)).rgb;
  }
  const uvA = worldUv(tiling);
  // 0.32 puts the second scale around 2.6 m per repeat (8 m base tiling):
  // fine enough to read as human-scale ground detail at the audit distances,
  // coarse enough that it does not turn into dense speckle up close.
  const uvB = worldUv(tiling.mul(0.32));
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
  // The road channel is a broad Gaussian (falloff ~1.15x road width). pow^16
  // only fires when the channel is near its 1.0 peak, so roads whose splat
  // peaks lower (ironValley, huntingCabin) showed no wheel-track at all
  // (audit G1). A smoothstep on the upper half of the falloff widens the band
  // to the center ~40% of the road — still distinct from the bright margins —
  // and uses the roadCenterLo/Hi knobs that were declared but never wired.
  const center = smoothstep(u.roadCenterLo, u.roadCenterHi, splat.a).toVar();

  /**
   * Ground cover that the CARDS are no longer drawing.
   *
   * Measured at a high vantage, with the tuft cards hidden and shown, the
   * green each source contributes by distance band:
   *
   *          < 60 m   60-200 m   200-600 m   600 m+
   *   cards   24.79%     4.61%       1.40%    0.00%
   *   ground   1.07%     3.82%       2.99%    2.08%
   *   total   25.86%     8.43%       4.40%    2.08%
   *
   * The cards do essentially all the work up close and none of it past the
   * draw distance, and nothing takes over: total cover falls by a factor of
   * twelve across the frame and the world goes bald toward the horizon. That
   * is not a card-density problem — the previous pass raised far-band density
   * 4.4x and bought 3 points of horizon green — it is a hand-off problem. The
   * two sources are independent when they should be complementary.
   *
   * So the ground's own grass layer is ramped UP over the same range the
   * cards fade OUT, which is what shipped engines mean by folding foliage
   * into the terrain at distance: past the disc a tuft was never more than a
   * sub-pixel alpha-tested card that discards to nothing, and a tint on the
   * ground is both cheaper and more honest about what a field looks like from
   * 800 m.
   *
   * Scaled BY the existing weight, never added to it. Bare country has to
   * stay bare: badlands and iron carry splat.r near zero, and a boost that
   * added rather than multiplied would grow grass on them at exactly the
   * distance the player cannot walk over and check.
   */
  const farGrass = smoothstep(u.farGrassStart, u.farGrassEnd, dist).mul(u.farGrassGain);
  const grassW = splat.r
    .mul(rockSlope.oneMinus())
    .mul(nVar.mul(0.12).add(0.92))
    .mul(roadMask.oneMinus())
    .mul(farGrass.add(1))
    .toVar();
  const dirtW = splat.g.mul(mix(float(1), float(0.32), rockSlope)).mul(mix(float(1), float(0.22), roadMask)).toVar();
  // The splat's B channel carries more than rock on roads: the bake packs
  // B = rock + latNorm*road, where latNorm is the signed lateral offset the
  // wheel-track decode needs (see splatMap.ts). Reading B raw as a rock
  // weight let the packed offsets — up to 0.87 across a road's half-width —
  // enter as rock, and the rock layer then won the height blend on every
  // road, displacing the gravel the ruts darken. Strip the packed lateral
  // term: off-road A≈0 and this is just B again.
  // B packs rock + latNorm*road. Normalize by A on narrow trails; the old
  // (B-.5)*4 decode skewed the signed offset toward centre as A fell below 1.
  // Keep the legacy value off-road, where B is ordinary rock.
  const lat = decodeRoadLateral(splat.a, splat.b);
  const rockFromSplat = splat.b.sub(lat.mul(0.25).add(0.5).mul(splat.a)).max(float(0));
  const rockW = max(rockFromSplat, rockSlope).add(altRock.mul(0.5)).mul(roadMask.oneMinus()).toVar();
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

  /**
   * Wheel tracks. The splat's road channel is one scalar — it cannot say
   * where "0.9 m left of centre" is, so until now the "wheel-track" was a
   * single dark band across the whole middle (roadCompact). The splat's B
   * channel carries the signed lateral offset to the nearest centreline,
   * packed as mix(rock, lat/4 + 0.5, road) — see splatMap.ts — and two
   * grooves at a wagon's gauge fall out of it directly: a Gaussian band where
   * ||lat| - gauge| is small.
   *
   * The ruts wander (wobble noise shifts the gauge), they come and go along
   * the road (a long-frequency stretch noise — drivers picked the easiest
   * line, and grass reclaimed the rest), and they fade with distance so the
   * sub-meter detail does not shimmer at the horizon.
   *
   * deepRoad gates the decode: off the road B is rock, not lat, and only
   * where the road weight is high is the packed value trustworthy. The gate
   * sits below the rut band's own road weight (~0.95 for a 7 m road, ~0.89
   * for a 3.5 m trail) so real ruts pass at full strength while the
   * rock-mixing error at the road margin — at most a few cm inside the band —
   * is killed with the gate.
   */
  const deepRoad = smoothstep(float(0.8), float(0.9), splat.a);
  const rutOff = u.rutOffset.add(mx_noise_float(positionWorld.xz.mul(0.4)).mul(u.rutWobble));
  const rutD = lat.abs().sub(rutOff);
  const rutBand = rutD.mul(rutD).div(u.rutWidth.mul(u.rutWidth).mul(2)).negate().exp();
  const rutStretch = smoothstep(float(-0.55), float(0.15), mx_noise_float(positionWorld.xz.mul(0.05)));
  const rutStrength = rutStretch.mul(deepRoad).mul(mix(float(0.35), float(1), near));
  const rut = rutBand.mul(rutStrength).toVar();
  const lipD = rutD.abs().sub(u.rutWidth.mul(2.2));
  const lipBand = lipD.mul(lipD).div(u.rutWidth.mul(u.rutWidth).mul(0.32)).negate().exp();
  const rutHeight = rutReliefHeight(rutBand, lipBand, rutStrength).toVar();

  // Packed mud is darker than the loose gravel margins, and cooler — the
  // groove holds moisture the bright shoulders have already lost.
  const rutTone = vec3(...RUT_TONE).mul(u.rutDepth);
  const gravelAlb = mix(
    gravelBase.mul(u.roadEdgeBright),
    gravelBase.mul(float(1).sub(u.roadCompact)),
    center
  ).mul(rut.mul(rutTone).oneMinus());

  const grass = sampleOrmNormal(maps.grass, grassUv);
  const dirt = sampleOrmNormal(maps.dirt, dirtUv);
  const rock = sampleOrmNormal(maps.rock, rockUv);
  const gravel = sampleOrmNormal(maps.gravel, gravelUv);
  // Smoother wheel-track center: the track reads as polished (roughness)
  // against the loose bright margins. The ruts deepen the polish. NOTE: the
  // rut must NOT lower gravel's blend height — vC = max(0, vPrime − (maxW −
  // sharp)) is a zero-sum competition, and a 0.07-0.13 drop pushes gravel's
  // share to exactly zero wherever the rut is strong. The groove then renders
  // as dirt/rock (which ignore rut) and the wheel tracks erase themselves —
  // at full strength up close, faintly from afar. There is no displacement
  // here; height only drives the blend, so recessing it buys nothing.
  const gravelHeight = mix(gravel.height.add(0.05), gravel.height.sub(0.08), center);
  const gravelRough = roadRoughness(gravel.rough, center, nVar);

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
  // Badlands strata (D1/D2): horizontal deposits read as subtle bands on rock
  // faces. World-Y banding with light noise, applied only where rock
  // dominates, fading with distance so the horizon does not stripe.
  const strataNoise = mx_noise_float(positionWorld.mul(vec3(0.35, 0.5, 0.35)));
  const strataBand = fract(positionWorld.y.mul(0.09).add(strataNoise.mul(0.28)));
  const strata = smoothstep(float(0.25), float(0.75), strataBand).sub(0.5).mul(0.55);
  const rockShare = rC.div(sum).mul(near).toVar();
  const color = albedo.mul(ao).mul(macro).mul(biome).mul(u.albedoGain).mul(rockShare.mul(strata).add(1));
  // Wet ground (weather writes u.groundWetness through syncTerrainUniforms):
  // rain-darkened albedo and lowered roughness, applied AFTER the layer
  // assembly rather than inside roadRoughness — that path clamps with
  // .max(roadRoughnessMin), and the floor must not re-apply to wet ground.
  // Sitting after the rut albedo product is also what makes the grooves read
  // as water-filled tracks for free. Multiplies downward only, so
  // check-roads' groove-clip assertion is untouched.
  const wetColor = color.mul(mix(vec3(1), vec3(0.8, 0.78, 0.76), u.groundWetness));
  const wetRough = rough.mul(float(1).sub(u.groundWetness.mul(0.55)));

  const weightsRgb = vec3(gC.div(sum), dC.div(sum), rC.div(sum));
  const roadRgb = vec3(roadMask, rut, splat.a);
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
  mat.colorNode = select(isDebug, vec3(0, 0, 0), wetColor);
  mat.emissiveNode = select(isDebug, debugColor, vec3(0, 0, 0));
  mat.roughnessNode = wetRough;
  mat.metalnessNode = float(0.02);
  // Wheel ruts are geometric terrain now; derivative relief from the coarse
  // splat recreated visible cell banding. Keep only the authored texture normal.
  mat.normalNode = normalMap(nrm, vec2(near.mul(u.detailQ), near.mul(u.detailQ)));
  return mat;
}
