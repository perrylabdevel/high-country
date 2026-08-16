/**
 * Art-direction knobs. Bound to lil-gui. No magic numbers in material code.
 * Export JSON from the panel and commit the result here.
 */
import { TEXTURE_SETS } from "./textureManifest.ts";

export type QualityTier = "low" | "medium" | "high";

export const QUALITY_TIERS: Record<QualityTier, {
  detail: number;
  detailDist: number;
}> = {
  low: { detail: 0.2, detailDist: 0.45 },
  medium: { detail: 0.55, detailDist: 0.75 },
  high: { detail: 1, detailDist: 1 }
};

export const materialSettings = {
  environmentIntensity: 0.38,
  hdri: "midday",
  sunIntensity: 1.15,
  sunElevation: 52,
  sunAzimuth: -120,
  fogDensity: 0.00038,
  quality: "high" as QualityTier,
  detailQ: 1,
  detailDistanceQ: 1,
  grassTiling: TEXTURE_SETS.grass.tiling,
  dirtTiling: TEXTURE_SETS.dirt.tiling,
  rockTiling: TEXTURE_SETS.rock.tiling,
  gravelTiling: TEXTURE_SETS.gravel.tiling,
  grassHeightBias: TEXTURE_SETS.grass.heightBias,
  dirtHeightBias: TEXTURE_SETS.dirt.heightBias,
  rockHeightBias: TEXTURE_SETS.rock.heightBias,
  gravelHeightBias: TEXTURE_SETS.gravel.heightBias,
  blendSharpness: 0.12,
  slopeStart: 0.22,
  slopeEnd: 0.58,
  altStart: 22,
  altEnd: 78,
  macroPeriod: 180,
  macroStrength: 0.16,
  vertexColorMix: 0.34,
  twoScaleMix: 0.42,
  albedoGain: 1.0,
  detailDistance: 60,
  roadNoiseScale: 0.12,
  roadEdgeNoise: 0.45,
  roadEdgeLo: 0.1,
  roadEdgeHi: 0.38,
  roadCenterLo: 0.45,
  roadCenterHi: 0.8,
  roadCompact: 0.2,
  roadEdgeBright: 1.1,
  debugView: 0,
  waterShallow: 0x5d8f9e,
  waterDeep: 0x142a38,
  waterToxicShallow: 0x7a8a4e,
  waterToxicDeep: 0x2a3a26,
  waterDepthFalloff: 7,
  waterNormalScale1: 0.09,
  waterNormalScale2: 0.16,
  waterNormalSpeed1: 0.6,
  waterNormalSpeed2: 0.9,
  waterNormalStrength: 0.3,
  waterFlowSpeed: 0.35,
  waterFlowTiling: 0.5,
  waterRefraction: 0.06,
  waterRefractionDepth: 2.2,
  waterRoughness: 0.16,
  foamThreshold: 2.2,
  foamNoiseScale: 0.05,
  foamStrength: 1.4,
  whitewaterSlope: 1.1,
  whitewaterStrength: 1.2
};

export type MaterialSettings = typeof materialSettings;

export function setQualityTier(tier: QualityTier): void {
  const t = QUALITY_TIERS[tier] ?? QUALITY_TIERS.medium;
  materialSettings.quality = tier;
  materialSettings.detailQ = t.detail;
  materialSettings.detailDistanceQ = t.detailDist;
}

export function applySettings(data: Partial<MaterialSettings>): void {
  for (const key of Object.keys(materialSettings) as (keyof MaterialSettings)[]) {
    if (data[key] !== undefined) {
      (materialSettings[key] as MaterialSettings[typeof key]) = data[key] as MaterialSettings[typeof key];
    }
  }
}
