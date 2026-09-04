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
  fogDensity: 0.00026,
  cloudCover: 0.45,
  cloudScale: 3,
  cloudWarpX: 1.6,
  cloudWarpY: -1.1,
  cloudDetailBias: 1,
  cloudBoundK: 0.08,
  quality: "high" as QualityTier,
  detailQ: 1,
  detailDistanceQ: 1,
  // Ground-cover field (vegetation.js). Draw distances of 0 mean "use the
  // tier value"; any other value overrides it and rebuilds the scatter on
  // release. Fade start is a fraction of the draw distance where the cover
  // begins dissolving (0.803 keeps full cover to ~4/5 of the disc); it is a
  // shader uniform, so it updates live. Cell scale multiplies the ring cell
  // sizes — under 1 plants denser, over 1 sparser. Speed thinning is the
  // far-ring hold-back that keeps the outer rings fed at gallop.
  grassRadius: 0,
  sageRadius: 0,
  grassFadeStart: 0.803,
  grassCellScale: 1,
  grassSpeedThin: true,
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
  macroStrength: 0.15,
  vertexColorMix: 0.34,
  twoScaleMix: 0.12,
  albedoGain: 1.0,
  detailDistance: 200,
  // Building-surface decorrelation (texturedMat.ts). Walls tile at 1.4-2.2 m —
  // 4-8x denser than any terrain layer — and every wall samples the same
  // world-space phase, so at settlement distance the repeats line up into a
  // visible pattern (measured: ranch wall strips autocorrelate at exactly the
  // 1.8 m tiling lag, 34 px / 60 px at the close vantage; the roof planes
  // show a full grid). Mechanisms, in the order they were tried:
  //  - overlaying the same texture at a coarser second scale was MEASURED
  //    useless (mix 0.22-0.65 left the tiling-lag peak unchanged or higher —
  //    the textures are dominated by one directional structure, so overlaying
  //    themselves stacks more aligned banding). Not shipped.
  //  - wallWarp* — domain warp: the triplanar sample position is displaced by
  //    smooth 3D noise of period wallWarpPeriod (m), by wallWarpAmp x tiling
  //    at full strength, so each nominal repeat shows a different slice and
  //    features stop aligning. Fades in between wallWarpNear/wallWarpFar
  //    (m): up close the texture is untouched, which is where it was already
  //    judged good (25 m walk-up pose: amp 0.42 and 0.6 indistinguishable
  //    from unwarped). Measured at the 45 m vantage, main-block wall strip,
  //    tiling-lag autocorrelation peak: unwarped 0.167; amp 0.25 -> 0.150;
  //    amp 0.42 -> 0.134; amp 0.60 -> 0.117. Shorter warp periods (4-5 m)
  //    measure WORSE (0.174-0.190) — decorrelation tracks the warp gradient
  //    across repeats, not the amplitude alone — and visibly wobble roof
  //    rows. 0.60/7 m ships: best measured decorrelation, and the roof grid
  //    (the most conspicuous repetition at audit distance) breaks up while
  //    reading as weathered shingles, not wobble.
  //  - wallMacroPeriod/Strength — large-period 3D noise on the final albedo,
  //    so walls that never touch (across a street, across a settlement) stop
  //    sharing one brightness phase. 3D, not terrain's xz: a 2D macro would
  //    band horizontally along wall height.
  wallWarpAmp: 0.6,
  wallWarpPeriod: 7,
  wallWarpNear: 18,
  wallWarpFar: 55,
  wallMacroPeriod: 26,
  wallMacroStrength: 0.1,
  //  - wallStochastic — hex-tile stochastic sampling strength (Heitz &
  //    Neyret). The texture is sampled three times at unrelated offsets and
  //    blended by barycentric weight, so the repeat is gone rather than
  //    disguised. 0 collapses the three samples onto one point and is
  //    exactly a plain sample, which is how it is A/B'd live.
  wallStochastic: 1,
  roadNoiseScale: 0.22,
  roadEdgeNoise: 0.85,
  roadEdgeLo: 0.03,
  roadEdgeHi: 0.6,
  roadCenterLo: 0.55,
  roadCenterHi: 0.85,
  roadCompact: 0.68,
  roadEdgeBright: 1.5,
  debugView: 0,
  waterShallow: 0x689aab,
  waterDeep: 0x2e5068,
  waterToxicShallow: 0x7a8a4e,
  waterToxicDeep: 0x2a3a26,
  waterDepthFalloff: 7,
  waterNormalScale1: 0.055,
  waterNormalScale2: 0.26,
  waterNormalSpeed1: 0.6,
  waterNormalSpeed2: 0.9,
  waterNormalStrength: 0.4,
  waterFlowSpeed: 0.35,
  waterFlowTiling: 0.7,
  waterRefraction: 0.08,
  waterRefractionDepth: 2.2,
  waterRoughness: 0.1,
  foamThreshold: 4.6,
  foamNoiseScale: 0.065,
  foamStrength: 3.6,
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
