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

/**
 * Foliage atlases baked by scripts/bake-foliage.mjs. Unlike the terrain sets
 * these are alpha-cut cards, not tiling surfaces, so they clamp rather than
 * repeat and carry no ORM — roughness is uniform across a leaf. Normals ship as
 * UASTC KTX2, which keeps them compressed in GPU memory; albedo stays PNG
 * because block compression quantises the alpha channel and a grass blade is
 * almost all thin tapering tip — compressing it turns fine blades into blocks.
 */
export const FOLIAGE_SET = {
  needleAlbedo: "/textures/foliage/needle_albedo.png",
  needleNormal: "/textures/foliage/needle_normal.ktx2",
};

export const TEXTURE_SETS = {
  grass: {
    albedo: "/textures/grass_2k_albedo.ktx2",
    normal: "/textures/grass_2k_normal.ktx2",
    orm: "/textures/grass_2k_orm.ktx2",
    // Metres per repeat (worldUv = positionWorld.xz / tiling). At 10 m the
    // 3072-px albedo resolved at 3.26 mm/px, putting its painted leaves and
    // straw near 20-33 cm — two to four times life size, so the ground read as
    // flat foliage lying among the real grass rather than as surface detail.
    // Confirmed rather than assumed: with every grass instance hidden the flat
    // streaks were still there, so they were never geometry.
    //
    // 6 m lands the same features near 12-20 cm. 4 m was measured too and is
    // better still up close (8-13 cm), but it costs more than it looks: the
    // oversized leaves had been acting as filler between tufts, so at audit
    // range 4 m went visibly patchy and arid while 6 m holds the pasture read.
    // No tiling repetition was visible at either value.
    tiling: 6,
    heightBias: 0.0
  },
  dirt: {
    albedo: "/textures/dirt_2k_albedo.ktx2",
    normal: "/textures/dirt_2k_normal.ktx2",
    orm: "/textures/dirt_2k_orm.ktx2",
    tiling: 8,
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
  },
  /**
   * Building surfaces (Poly Haven CC0). Unlike the terrain layers these are
   * used triplanar on authored box geometry, so the tiling is in world metres
   * and heightBias is unused.
   */
  adobe: {
    albedo: "/textures/adobe_2k_albedo.ktx2",
    normal: "/textures/adobe_2k_normal.ktx2",
    orm: "/textures/adobe_2k_orm.ktx2",
    tiling: 1.6,
    heightBias: 0
  },
  wood: {
    albedo: "/textures/wood_2k_albedo.ktx2",
    normal: "/textures/wood_2k_normal.ktx2",
    orm: "/textures/wood_2k_orm.ktx2",
    tiling: 1.8,
    heightBias: 0
  },
  roof: {
    albedo: "/textures/roof_2k_albedo.ktx2",
    normal: "/textures/roof_2k_normal.ktx2",
    orm: "/textures/roof_2k_orm.ktx2",
    tiling: 1.4,
    heightBias: 0
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
