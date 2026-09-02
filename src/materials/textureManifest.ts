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
  /**
   * Interior floors, porch decks and any laid boarding.
   *
   * This is a FLOOR texture — short planks with staggered butt joints — and it
   * is right for that and wrong for everything else. It used to clad the
   * exterior walls too, which is why they read as a repeating grid no sampling
   * trick could fix: a wall tiled with it showed three superimposed regular
   * patterns (the plank rows, the butt joints, and the 1.8 m tile repeat), and
   * domain warping, per-cell rotation and stochastic sampling all attack only
   * the third. The first two are IN the image. Walls take `siding` now.
   */
  wood: {
    albedo: "/textures/wood_2k_albedo.ktx2",
    normal: "/textures/wood_2k_normal.ktx2",
    orm: "/textures/wood_2k_orm.ktx2",
    tiling: 1.8,
    heightBias: 0
  },
  /**
   * Exterior wall cladding (Poly Haven brown_planks_08, CC0, Rob Tuytel).
   *
   * Long continuous boards with no butt joints, which is what real siding is
   * and what the floor texture is not. Measured against the two other
   * candidates for wrap quality (edge-to-edge difference against the typical
   * internal step, so a seamless tile scores near its own internal number):
   *
   *   brown_planks_08   L-R 6.9  T-B  9.4   internal 5.1   <- chosen
   *   brown_planks_09   L-R 5.2  T-B 12.2   internal 5.0
   *   brown_planks_04   L-R 5.0  T-B 12.6   internal 3.1
   *
   * 04 was dropped twice over: it still has butt joints, and pack-textures
   * refused its normal map outright (mean R/G 89.3/105.0 against the required
   * 127.5, and not an sRGB double-encode either) — the guard added for gravel
   * earning its keep.
   *
   * Tiling: the source is a 1 m square carrying boards ~9-13 cm wide, so 1.4 m
   * lands them at 12-18 cm, inside the 15-25 cm a real siding board measures.
   */
  siding: {
    albedo: "/textures/siding08_2k_albedo.ktx2",
    normal: "/textures/siding08_2k_normal.ktx2",
    orm: "/textures/siding08_2k_orm.ktx2",
    tiling: 1.4,
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

/**
 * Pine bark (Poly Haven pine_bark, CC0). Not a terrain blend layer.
 *
 * No ORM on purpose: one was packed and shipped for a long time, but nothing
 * ever loaded it — the trunk materials use uniform roughness — so the bundle
 * purge dropped it. pack-textures skips the bark ORM; add it back only
 * together with a consumer.
 */
export const BARK_SET = {
  albedo: "/textures/bark_2k_albedo.ktx2",
  normal: "/textures/bark_2k_normal.ktx2"
} as const;

export const HDRI_PATHS = {
  midday: "/textures/env/midday_2k.hdr",
  golden: "/textures/env/golden_2k.hdr"
} as const;

export type TextureSetName = keyof typeof TEXTURE_SETS;
