/**
 * Targets three@0.185.1.
 * Runtime paths only — packed output under /textures/. Source PNGs live in gitignored assets-src/.
 */
export type TextureSet = {
  albedo: string;
  normal: string;
  orm: string;
  tiling: number;
  heightBias: number;
};

export const TEXTURE_SETS = {
  grass: {
    albedo: "/textures/grass_2k_albedo.ktx2",
    normal: "/textures/grass_2k_normal.ktx2",
    orm: "/textures/grass_2k_orm.ktx2",
    tiling: 8,
    heightBias: 0.0
  },
  dirt: {
    albedo: "/textures/dirt_2k_albedo.ktx2",
    normal: "/textures/dirt_2k_normal.ktx2",
    orm: "/textures/dirt_2k_orm.ktx2",
    tiling: 10,
    heightBias: -0.02
  },
  rock: {
    albedo: "/textures/rock_2k_albedo.ktx2",
    normal: "/textures/rock_2k_normal.ktx2",
    orm: "/textures/rock_2k_orm.ktx2",
    tiling: 12,
    heightBias: 0.05
  },
  gravel: {
    albedo: "/textures/gravel_2k_albedo.ktx2",
    normal: "/textures/gravel_2k_normal.ktx2",
    orm: "/textures/gravel_2k_orm.ktx2",
    tiling: 6,
    heightBias: 0.04
  }
} as const satisfies Record<string, TextureSet>;

/** Pine bark (Poly Haven pine_bark, CC0). Not a terrain blend layer. */
export const BARK_SET = {
  albedo: "/textures/bark_2k_albedo.ktx2",
  normal: "/textures/bark_2k_normal.ktx2",
  orm: "/textures/bark_2k_orm.ktx2"
} as const;

export const HDRI_PATHS = {
  midday: "/textures/env/midday_2k.hdr",
  golden: "/textures/env/golden_2k.hdr"
} as const;

export type TextureSetName = keyof typeof TEXTURE_SETS;
