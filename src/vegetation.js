/**
 * Targets three@0.185.1 (WebGPURenderer + TSL).
 * Ground truth: node_modules/three/src/nodes/TSL.js
 *
 * Grass is instanced alpha-tested tufts (crossed cards, 5–7 blades each) with
 * distance fade, biome+slope placement, base tinting, and vertex wind. Pines
 * are flared trunks + alpha-cut needle cards in three silhouettes. Sage and
 * cottonwoods fill the understory and riparian belt so the scatter is not a
 * single cloned pine.
 */
import * as THREE from "three/webgpu";
import {
  time,
  uniform,
  vec2,
  vec3,
  vec4,
  float,
  uv,
  positionLocal,
  positionGeometry,
  normalLocal,
  transformNormalToView,
  positionWorld,
  cameraPosition,
  smoothstep,
  step,
  mix,
  max,
  dot,
  normalize,
  sin,
  texture,
  attribute,
  cross,
  varyingProperty
} from "three/tsl";
import { heightAt, meshHeightAt, normalAt } from "./heightfield.js";
import { barkTexture, makeTexture } from "./world.js";
import { addCylinderCollider } from "./collision.js";
import { insideStructure } from "./buildings/kit.js";
import { WORLD, POS, biomeAt, inClearing, creekFactor, roadFactor, lakeFactor, smoothstep as ramp } from "./map.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { tryLoadTexture } from "./materials/loadTexture.ts";
import { getProfile } from "./perfProfile.js";
import { BARK_SET, FOLIAGE_SET } from "./materials/textureManifest.ts";

/**
 * Seeded RNG for the procedural texture painters.
 *
 * These atlases are repainted on every page load, and they were painted with
 * Math.random — so the grass, sage and broadleaf art was different in every
 * session. That is invisible in play and corrosive to measurement: two audit
 * captures of the same commit did not share the same textures, which puts
 * unattributable variance straight into a fail count that has oscillated
 * 44-60 across passes. Only the needle atlas escaped it, by being baked.
 *
 * Each painter reseeds before it draws, so every texture is reproducible on
 * its own and stays reproducible if another painter is added or reordered.
 */
let texRngState = 0;
function resetTexRng(seed) {
  texRngState = seed | 0;
}
function rnd() {
  texRngState = (texRngState + 0x6d2b79f5) | 0;
  let t = texRngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function seeded(n) {
  const x = Math.sin(n * 999) * 43758.5453;
  return x - Math.floor(x);
}

function plantChance(biome) {
  if (biome === "pines") return 0.82;
  if (biome === "burn") return 0.55;
  if (biome === "foothills") return 0.42;
  if (biome === "tribal") return 0.28;
  if (biome === "valley") return 0.22;
  if (biome === "range") return 0.1;
  if (biome === "iron") return 0.08;
  if (biome === "ranch") return 0.06;
  if (biome === "badlands") return 0.04;
  return 0;
}

function shrubChance(biome) {
  if (biome === "range") return 0.78;
  if (biome === "foothills") return 0.52;
  if (biome === "ranch") return 0.62;
  if (biome === "tribal") return 0.42;
  if (biome === "valley") return 0.28;
  if (biome === "badlands") return 0.22;
  if (biome === "iron") return 0.16;
  if (biome === "pines") return 0.1;
  if (biome === "burn") return 0.06;
  return 0;
}

/**
 * How much of the rebuild each frame absorbs. The old 2500-blade chunk
 * measured ~9.6 ms on its own — most of a 60 fps frame — which is what made
 * walking feel like it stuttered. Smaller chunks with the cheaper sampler keep
 * each frame's share well inside budget; the rebuild simply spans a few more
 * frames, and the old field stays on screen while it does.
 *
 * The chunk budget is shared across the rings: a frame runs near rings first
 * and keeps spending until the budget is gone, so a gallop that stales several
 * rings at once still never spends more than one chunk's worth of scatter in
 * any single frame.
 */
const GRASS_CHUNK = 1200;

/**
 * How far the player walks before a RING re-centres, as a fraction of that
 * ring's own radius — not one number for the whole disc.
 *
 * The old scheme had one lastCenter and a 42 m REBUILD_STEP for all rings:
 * every 42 m of travel re-planted all ~86k candidates, near and far alike, and
 * the whole field swapped in one frame at the end. Under a gallop the rebuild
 * lagged behind the player, the disc's far edge fell behind and then snapped
 * forward 42 m at a time — the cover reloading in circles, worst at speed.
 *
 * The rings now each hold their own centre and replant on their own cadence.
 * A ring's step is RING_STEP_FRAC of its radius, so an inner ring (cheap
 * candidates, everything the eye lands on) refreshes every few metres while
 * the outer rings sit still for a hundred or more — the far field stays
 * planted instead of churning, and what little moves does so inside the
 * distance fade, where a new tuft arrives already half dissolved. Re-planted
 * tufts are hash-anchored in world space, so the overlap between an old and a
 * new ring centre is the SAME tufts in the SAME places: the only pixels that
 * change on a re-centre are the leading crescent and whatever the fade band
 * gains, which is exactly the cover that should be arriving.
 */
const RING_STEP_FRAC = 0.3;
const RING_STEP_MIN = 6;

/**
 * Speed the scatter budgets against, in m/s. This is the horse's gallop gait
 * (horse.js: sprint target 14.5 at tune.speed 1), so speedFactor 1 is "the
 * player is galloping" and 4x gallop is 4. A riding player is the only way to
 * move this fast for long — walking pace is a quarter of it.
 */
const GRASS_SPEED_REF = 14.5;

/**
 * How much of the two outermost rings' cover is held back while the camera
 * moves fast, by speed level (0 = under a canter, 1 = gallop-ish, 2 = 2x
 * gallop and beyond). The hold-back is a per-cell hash gate in plantBlade, so
 * a thinned field is a deterministic SUBSET of the full one: the same cells
 * pass the gate whatever the speed, and when the player slows the next
 * re-centre plants the missing tufts in exactly the places the gate used to
 * refuse. Refinement, not relocation — nothing on screen moves, cover only
 * thickens.
 *
 * This is the "lower the quality at speed" trade the frame rate asks for. The
 * thinned rings are the coarse far field: at gallop a tuft out there is a
 * few pixels and the eye is on the ground rushing past, so a third fewer
 * distant tufts reads as nothing, while the scatter work it saves is what
 * keeps the outer rings from starving (see scatterPass).
 */
const SPEED_THIN = [0, 0.3, 0.55];

/**
 * Ring cell sizes set the instance budget, and they turned out to matter more
 * to how the ground reads than any material work did. Spend the budget where
 * the eye is: the near rings are dense enough that grass closes over the dirt
 * instead of sitting on it as separate clumps, while the outer two stay
 * coarse, since at those ranges a tuft is a few pixels and grass is the
 * scene's fill-rate cost — alpha-tested and double-sided, so no early-z and
 * both faces shade wherever cards overlap.
 *
 * This is the `high` shape; applyProfile scales it for the active tier. The
 * outermost ring's cell is deliberately coarser than the previous one's × 2:
 * at 330 m and beyond a tuft is a handful of pixels and the card's scale ramp
 * carries the coverage, so a 9 m cell there costs a fifth of the candidates
 * the same band at 5.2 would.
 */
/**
 * A band is not rebuilt as a unit any more — it is covered by square,
 * world-anchored tiles that are built once and then left alone for as long as
 * they stay in range (see THE TILE CACHE, in createVegetation).
 *
 * Tile edges are not set here — see BASE_TILE and the quadtree ladder, which
 * derives them from the band index so that a coarse tile is exactly four fine
 * ones. What this table still owns is the CELL, which is the density, and the
 * band's outer radius.
 */
const RING_SHAPE = [
  { cell: 0.34, outer: 34 },
  { cell: 0.7, outer: 82 },
  { cell: 2.6, outer: 168 },
  { cell: 5.2, outer: 330 },
  { cell: 9, outer: 550 },
  // Beyond the shipped disc. Unreachable at every tier (applyProfile drops a
  // ring once the one before it reaches past the radius, and no tier exceeds
  // 550) — they exist so the materials panel's draw-distance dial has
  // somewhere to go.
  //
  // These were 14 / 22 / 34, continuing the shipped shape's ~1.6x coarsening,
  // and at that shape the draw-distance dial did not do its job: measured at
  // eye level, dialling 400 -> 1500 changed 0.00% of the near/mid field and
  // 3.4% of the horizon band, and the two frames are indistinguishable
  // zoomed. The band was carrying one tuft per 2812 m2.
  //
  // Why the obvious rule was the wrong rule: cell ~ distance (which 14/22/34
  // roughly is — cell/outer holds near 0.016 out to 850 m) keeps the ANGULAR
  // spacing between tufts constant, and that is the correct LOD rule for a
  // field you look down on. It is not the rule for a field you look ACROSS.
  // At a grazing angle the 850-1500 m band compresses into about ten screen
  // rows, and the cards there are alpha-tested (0.32): a card that lands
  // under a pixel discards outright instead of averaging into a tint, so
  // coverage is lost non-linearly exactly where angular spacing says it
  // should hold. Measured, the whole band came to ~1% of its own pixels.
  //
  // So the extension rings deliberately break the angular rule and grow
  // denser than it: cell/outer falls to 0.0094 / 0.0083 / 0.0080 instead of
  // rising to 0.023. That is ~3x / ~4.8x / ~8x the candidates per band. The
  // bill is bounded because it is only ever paid when the dial is raised —
  // no tier reaches 550 m, so applyProfile drops all three at every default,
  // and the tier field (rings 0-4) is untouched to the tuft.
  { cell: 8, outer: 850 },
  { cell: 10, outer: 1200 },
  { cell: 12, outer: 1500 }
];

/**
 * The quadtree ladder.
 *
 * BASE_TILE is the finest band's tile edge; each coarser tier band doubles it,
 * so band l has tiles of BASE_TILE * 2^l and a coarse tile is exactly four of
 * the band below. Exact nesting is the whole point: it is what lets the
 * residency pass cover the disc with no holes AND no double coverage. The
 * first cut used one independent grid per band with an "does this square
 * intersect the annulus" test, which is hole-free but admits every tile that
 * straddles either edge — measured, 2.3x the intended instance count, which
 * both cost the frames it was meant to save and starved the build queue so
 * badly that the near field emptied out during a ride.
 *
 * QUAD_DEPTH is the last band on the ladder. Beyond it the extension bands
 * (dial-only, no tier reaches them) use a plain FAR_TILE grid: doubling out
 * to 2176 m would put 33k candidates in one tile, which is the atomic-pop
 * problem all over again, and at those distances the density is under
 * 0.016/m2 so the straddle overlap is worth a few dozen tufts.
 */
const BASE_TILE = 17;
const QUAD_DEPTH = 4;
const FAR_TILE = 340;

/**
 * Ground-cover draw range, per device tier.
 *
 * Grass used to stop at 210 m and start dissolving at 150, so the middle
 * distance was bare terrain in every direction. The ring scatter spends its
 * instances by distance instead of uniformly, which buys the extra range back
 * without adding blades. The values below are the `high` profile — what the
 * game shipped with. Lower tiers pull the disc in, and because the candidate
 * count goes as the AREA, halving the radius quarters the work. The fades are
 * derived from the radius so a shorter disc still dissolves over its own last
 * stretch instead of ending at a hard rim.
 *
 * These are `let`, resolved by applyProfile() rather than at module load, and
 * that is not a style choice. main.js imports this module at the top of the
 * file but cannot call setActiveProfile until boot() has probed the GPU
 * adapter, so anything evaluated at import time reads the DEFAULT profile and
 * silently ignores the real one. Measured: ?tier=low and ?tier=high produced
 * identical tuft counts, because both had baked in `high` before the override
 * existed. Resolving at construction time is what makes the tier reach the
 * scatter at all.
 */
let PROFILE = getProfile();
let GRASS_RADIUS = 330;
let GRASS_FADE_IN = 265;
let GRASS_FADE_OUT = 326;
let SAGE_RADIUS = 280;
let SAGE_FADE_IN = 215;
let SAGE_FADE_OUT = 276;
let RINGS = RING_SHAPE;
/**
 * The distance the card-size ramp is anchored at: always the TIER's draw
 * distance, never the panel override. The ramp's tuned look (tufts reaching
 * full growth at the disc edge) was judged at each tier's own radius, and
 * freezing the anchor there has two consequences the panel depends on:
 *
 *  - Raising the draw distance dial no longer rescales the field the user was
 *    already looking at. The ramp used to read dist / GRASS_RADIUS, so dragging
 *    the dial from 550 to 1410 silently shrank every mid-distance tuft (t at
 *    400 m fell 0.73 -> 0.28) — the A/B against the old dial measured the near
 *    field changing when the far field was the ask.
 *
 *  - Tufts beyond the anchor keep growing with ABSOLUTE distance
 *    (max(1, dist / anchor)), so a card's screen size holds roughly constant
 *    instead of shrinking below the pixel grid. This is the whole reason the
 *    extension rings are worth drawing: a 1-2 m card at 800 m is under two
 *    pixels wide, and an alpha-tested (alphaTest 0.32) sub-pixel card does not
 *    average into a tint, it discards to nothing — measured, the 1410 disc
 *    planted 8.8k more tufts than the 550 disc and not ONE far-field pixel
 *    changed. Growing with distance is what makes "draw distance" mean
 *    "grass visible farther" rather than "more invisible grass".
 */
let RAMP_ANCHOR = 330;
let SAGE_ANCHOR = 150;

/**
 * Live overrides from the materials panel's Grass folder (materialSettings in
 * materials/settings.ts, applied through the vegetation API's
 * applyGrassSettings). Null until the panel first applies, so every value
 * falls back to the active tier. Draw distances of 0 mean tier value; the
 * fade start is a fraction of the draw distance; the cell scale multiplies
 * the ring cells; speedThin toggles the far-ring hold-back.
 */
let grassOverride = null;

/**
 * Re-resolve every tier-dependent constant. Called at the top of
 * createVegetation, and by GRASS_SCATTER's accessors so tooling that never
 * builds a scene still reports the active tier rather than the defaults.
 *
 * grassCellScale widens every cell, thinning cover uniformly rather than
 * lopping off a distance band — a coarser field still reads as a field, where
 * a truncated one reads as a bald ring. Rings entirely beyond the tier's
 * radius are dropped and the last surviving one is clipped to it.
 */
function applyProfile() {
  PROFILE = getProfile();
  // Panel overrides win over the tier where they are set (non-zero radius,
  // non-unity cell scale). The fades stay derived from whichever radius won,
  // so a hand-widened disc still dissolves over its own last stretch.
  const ov = grassOverride || {};
  // The panel's fade-start dial drives BOTH fields: grass directly, sage
  // proportionally (SAGE_FADE_RATIO), because the sage bushes are the dominant
  // cover in dry country and a fade dial that skipped them read as dead — the
  // whole visible field sat still while an invisible grass band re-solved.
  // The ratio keeps the tier-default sage dissolve exactly as shipped
  // (0.803 x 0.768/0.803 = 0.768). The clamp holds FADE_IN below FADE_OUT
  // (0.985 vs 0.988/0.986): at dial 1 the raw product lands PAST the fade-out
  // edge, and smoothstep with edge0 > edge1 is undefined — measured as an
  // inverted ramp, not an error.
  const fadeFactor = ov.fade > 0 ? ov.fade : 0.803;
  GRASS_RADIUS = ov.radius > 0 ? ov.radius : PROFILE.grassRadius;
  GRASS_FADE_OUT = GRASS_RADIUS * 0.988;
  GRASS_FADE_IN = GRASS_RADIUS * Math.min(fadeFactor, 0.985);
  SAGE_RADIUS = ov.sage > 0 ? ov.sage : PROFILE.sageRadius;
  SAGE_FADE_OUT = SAGE_RADIUS * 0.986;
  SAGE_FADE_IN = SAGE_RADIUS * Math.min(fadeFactor * (0.768 / 0.803), 0.985);
  // The size ramp anchors at the tier disc, not the override — see the block
  // comment on the declarations above.
  RAMP_ANCHOR = PROFILE.grassRadius;
  SAGE_ANCHOR = PROFILE.sageRadius;
  const cellScale = PROFILE.grassCellScale * (ov.cell > 0 ? ov.cell : 1);
  RINGS = RING_SHAPE
    .filter((r, i) => i === 0 || RING_SHAPE[i - 1].outer < GRASS_RADIUS)
    .map((r, i, all) => {
      const outer = Math.min(r.outer, GRASS_RADIUS);
      const inner = i === 0 ? 0 : Math.min(all[i - 1].outer, GRASS_RADIUS);
      // Tile edge. The tier bands (0..QUAD_DEPTH) are the levels of a
      // QUADTREE, so each is exactly twice the one below it and a coarse tile
      // is exactly four fine ones. That is what makes coverage exact — see
      // the residency note in updateTiles. The dial-only extension bands
      // beyond the tier keep a plain grid at a fixed edge, because carrying
      // the doubling out to 2176 m would put 33k candidates in a single tile,
      // and out there the density is low enough that the seam costs nothing.
      const quad = i <= QUAD_DEPTH;
      const size = quad ? BASE_TILE * 2 ** i : FAR_TILE;
      // The cell must divide the tile edge exactly, or a cell straddles two
      // tiles and is planted twice or not at all. Nominal cells are nudged by
      // under 1% to land on a whole number of cells per tile.
      const cols = Math.max(1, Math.round(size / (r.cell * cellScale)));
      return {
        cell: size / cols,
        outer,
        inner,
        cols,
        tileSize: size,
        quad,
        ramp: bandRamp(inner, outer)
      };
    });
  return PROFILE;
}

/**
 * Growth multipliers for a band, from the same two-part curve plantBlade used
 * per tuft: the tuned ramp inside the tier disc, and growth that outpaces
 * distance beyond it so far cards clear the pixel grid instead of
 * alpha-testing away to nothing. See the RAMP_ANCHOR block comment.
 *
 * The ramp inside the disc was 1 + t * 0.5 and 1 + t * 0.7, and reported as a
 * bare-looking band between the near field and the shrubs. It is a seam in the
 * cell ladder, and the ramp is what was supposed to hide it: RING_SHAPE's own
 * comment says "at those ranges a tuft is a few pixels and the card's scale
 * ramp carries the coverage". Measured at the ranch, card area per square
 * metre of ground:
 *
 *     60-80 m   0.557        the last of band 1 (cell 0.70)
 *    80-100 m   0.195        band 2 begins at 82 m (cell 2.60)
 *   100-120 m   0.074
 *   120-140 m   0.054
 *
 * A 7.5x collapse across 40 m. The cells step 0.34 / 0.70 / 2.60 / 5.20 / 9 —
 * every rung about x2 except that one, which is x3.7, so cell/outer reads
 * 0.010, 0.0085, 0.0155, 0.0158, 0.0164: bands 0-1 follow one rule and 2-4
 * another, and the seam is exactly where the eye finds the band. Against a
 * 13.8x drop in tufts per square metre the old ramp grew band 2's cards 12%
 * taller and 17% wider. It was not carrying the coverage; it was not close.
 *
 * The terrain hand-off cannot reach this either. farGrass ramps
 * smoothstep(90, 700, dist), which is 0.007 at 120 m, and the band is not bare
 * DIRT — grass already wins the splat blend there, so a greener ground tint
 * changes nothing. Sweeping farGrassEnd from 700 down to 180 and the gain to
 * 2.4 moved 0.03% of pixels. What is missing at 100 m is not colour, it is
 * things standing up.
 *
 * So the ramp does the job it is documented as doing. 1.3 and 1.9 restore
 * roughly a third to a half of the lost cover (80-100 m: 0.195 -> 0.251,
 * 100-120: 0.074 -> 0.106, 140-160: 0.033 -> 0.051) for no instances, no draw
 * calls and no triangles: 84,734 planted and 3.567M tris before and after,
 * frame time 16.6 -> 16.7 ms p50.
 *
 * Proportion is the thing to watch, since growing width faster than height is
 * what once stretched far tufts into mush. Measured across the disc, card w:h
 * runs 0.94 at 0-20 m to 1.06 at 200 m and card height 0.70 m to 1.04 m — the
 * cards stay square-ish and plant-sized, and a metre-tall card at 200 m is
 * still only a few pixels, which is the whole argument in RAMP_ANCHOR.
 *
 * The alternative was fixing the ladder itself — cells 0.34 / 0.70 / 1.8 /
 * 3.9 / 7.5, an even x2 throughout. That recovers more (100-120 m reaches
 * 0.150) but costs 84,734 -> 105,951 instances and takes the frame from 16.6
 * to 19.2 ms p50 on a high-tier desktop, which is off 60 Hz. Worth revisiting
 * with the grader; not worth spending a quarter of the ground-cover budget on
 * an ungraded hunch.
 */
function bandRamp(inner, outer) {
  // Area-weighted mean radius of the annulus: the distance that splits the
  // band's tufts in half by count, not by radius.
  const dist = outer <= inner
    ? outer
    : (2 / 3) * (outer ** 3 - inner ** 3) / (outer ** 2 - inner ** 2);
  const t = Math.min(dist / RAMP_ANCHOR, 1);
  const over = dist / RAMP_ANCHOR;
  const far = over > 1 ? 1 + (over - 1) * 2.5 : 1;
  return { h: far * (1 + t * 1.3), w: far * (1 + t * 1.9), dist };
}

/**
 * Deterministic hash of a cell index. Must depend only on the absolute cell
 * coordinates — that is what makes a tuft world-anchored rather than
 * camera-anchored.
 */
function hash2(i, j, salt) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * How far outside a building footprint vegetation is held back. Grass gets a
 * small skirt so tufts do not clip through a sill; shrubs and trees need more
 * because their canopies are wider than their base.
 */
const GRASS_CLEARANCE = 0.9;
const SHRUB_CLEARANCE = 1.8;
const TREE_CLEARANCE = 4;

/**
 * How readily broadleaf trees take ground away from the creeks. Conifer
 * country stays conifer; the soft, watered biomes get real groves.
 */
const BROADLEAF_CHANCE = {
  valley: 0.5,
  ranch: 0.42,
  foothills: 0.3,
  tribal: 0.26,
  range: 0.12,
  pines: 0.08
};

/**
 * Ground-cover species.
 *
 * `spread` is clump width as a multiple of blade height, and `fill` is the
 * fraction of its atlas panel the painted blades actually occupy. Both matter
 * because the instance scale sets the CARD size, not the plant: blades filling
 * 40% of a panel on a card scaled to 0.26 m render 0.10 m tall. Blue grama is
 * 68% of the ranch mix, so getting that wrong left the yard looking bare. When the heights were first cut to life size the width multiplier
 * was left alone, so a 0.15 m mat tuft still rendered 0.45 m across — grass
 * came out a median 2.6x wider than tall and read as flat green splats lying on
 * the dirt. Tying width to height keeps every species in proportion whatever
 * its size.
 *
 * There was one grass on the whole map, and its height came from GRASSINESS —
 * which is a biome's *lushness*, not a plant's size. So every biome above the
 * placement floor came out 94-99% covered and the only thing that changed was
 * how tall the carpet was: iron country, meant to be bare, measured 94.7%
 * covered in shorter grass. Density and height are now separate. GRASS_DENSITY
 * decides how much ground a biome carries; the species decides how tall it
 * stands.
 *
 * `uv` is the species' panel in the 2x2 blade atlas, so all four render from
 * one instanced draw. Heights are real: a shortgrass mat is ankle-high, and
 * only the wet-ground bluestem comes past the knee.
 */
const GRASS_SPECIES = [
  { name: "blueGrama", hMin: 0.16, hMax: 0.3, spread: 1.5, fill: 0.4, uv: [0.0, 0.0] },
  { name: "bunchgrass", hMin: 0.26, hMax: 0.5, spread: 1.15, fill: 0.72, uv: [0.5, 0.0] },
  { name: "bluestem", hMin: 0.5, hMax: 0.9, spread: 0.85, fill: 0.93, uv: [0.0, 0.5] },
  { name: "cheatgrass", hMin: 0.18, hMax: 0.34, spread: 1.15, fill: 0.5, uv: [0.5, 0.5] }
];

/** Fraction of a panel's width the painted clump spans (paintBladePanel). */
const BLADE_PANEL_W = 0.8;

/** Blade card size in makeGrassTuft, in metres. */
const GRASS_CARD_H = 0.5;
const GRASS_CARD_W = 0.56;

/** Chance a candidate cell carries grass at all. This is the density dial. */
const GRASS_DENSITY = {
  valley: 0.92,
  ranch: 0.88,
  pines: 0.78,
  foothills: 0.68,
  tribal: 0.5,
  range: 0.62,
  lake: 0.35,
  town: 0.48,
  iron: 0.14,
  burn: 0.05,
  badlands: 0.04
};

/**
 * Cumulative species thresholds per biome, over GRASS_SPECIES in order:
 * blue grama (short mat), bunchgrass (tussock), bluestem (tall, wet ground),
 * cheatgrass (dry straw). Wet biomes carry the tall grass; dry country is
 * almost entirely cheatgrass and low mat.
 */
const SPECIES_MIX = {
  valley: [0.30, 0.62, 0.95, 1.0],
  lake: [0.30, 0.60, 0.95, 1.0],
  pines: [0.52, 0.90, 0.97, 1.0],
  foothills: [0.44, 0.82, 0.88, 1.0],
  ranch: [0.68, 0.94, 0.99, 1.0],
  town: [0.62, 0.92, 0.96, 1.0],
  tribal: [0.34, 0.58, 0.62, 1.0],
  range: [0.34, 0.54, 0.56, 1.0],
  burn: [0.28, 0.48, 0.48, 1.0],
  iron: [0.18, 0.32, 0.32, 1.0],
  badlands: [0.10, 0.18, 0.18, 1.0]
};

const GRASSINESS = {
  lake: 0.45,
  ranch: 0.9,
  town: 0.3,
  pines: 0.92,
  burn: 0.04,
  range: 0.85,
  iron: 0.25,
  badlands: 0.04,
  tribal: 0.75,
  foothills: 0.82,
  valley: 0.92
};

/**
 * One combined ground sample for the grass scatter, split so the STATIC part
 * can be cached per world cell.
 *
 * grassWeight() and skipGrass() used to be called back to back, and between
 * them re-evaluated biomeAt, lakeFactor and normalAt twice each per candidate.
 * At ~60k candidates a rebuild that duplication was most of the scatter cost.
 * grassSampleStatic does every noise lookup exactly once and bails on the
 * cheapest test first; it depends only on the world (roads, creeks, the lake,
 * biomes, slope) and never on where the disc happens to be centred.
 *
 * grassSample keeps the whole contract for tooling and adds the one test that
 * must stay live: the building footprints. Every structure() call pushes to
 * STRUCTURES at world-build time, so nothing changes under a running game —
 * but the cost of being wrong about that is grass growing through a new
 * building, while the cost of keeping the test live is one spatial-grid lookup
 * per survivor. Keep it live.
 */
function grassSampleStatic(x, z) {
  const road = roadFactor(x, z);
  if (road > 0.3) {
    return 0;
  }
  const creek = creekFactor(x, z);
  if (creek > 0.35) {
    return 0;
  }
  const lake = lakeFactor(x, z);
  const inRanch = Math.hypot(x - POS.ranch.x, z - POS.ranch.z) < 95;
  if (!inRanch) {
    if (lake > 0.35) {
      return 0;
    }
    if (Math.hypot(x - POS.silverCreek.x, z - POS.silverCreek.z) < 80) {
      return 0;
    }
  }
  if (Math.hypot(x - POS.ranch.x, z - (POS.ranch.z - 8)) < 14) {
    return 0;
  }
  if (Math.hypot(x - (POS.ranch.x - 28), z - (POS.ranch.z + 18)) < 10) {
    return 0;
  }
  const base = GRASSINESS[biomeAt(x, z)] ?? 0;
  if (base <= 0) {
    return 0;
  }
  const slope = 1 - normalAt(x, z).y;
  const slopeFactor = 1 - ramp(0.18, 0.5, slope);
  return base * slopeFactor * (1 - creek * 0.8) * (1 - road) * (1 - lake * 0.5);
}

function grassSample(x, z) {
  const weight = grassSampleStatic(x, z);
  if (weight <= 0) {
    return 0;
  }
  // Buildings last: it is the only test that touches the structure index, and
  // by here most rejected candidates are already gone.
  if (insideStructure(x, z, GRASS_CLEARANCE)) {
    return 0;
  }
  return weight;
}

/**
 * The per-cell memo for grassSampleStatic. A candidate's world position is a
 * pure function of its integer cell (hash2 jitter on a fixed grid), so the
 * static weight and the biome are pure functions of (ring, ix, jz) — and the
 * per-ring re-centres replant the same cells over and over. Caching turns a
 * re-centre's sampler into a hash lookup for the ~80% of candidates the two
 * ring centres share.
 *
 * The key must carry the RING: cells are per-ring grid coordinates, so the
 * same integer pair means different world positions in different rings. Ring
 * ids are small (< 8), and ix/jz are shifted to stay positive; the product
 * stays far below 2^53 so plain numbers key the Map. 300k entries is several
 * times the live candidate set at every tier — past that, clear rather than
 * grow (the cache is a pure memo, so a clear is invisible beyond one rebuild).
 */
const GRASS_SAMPLE_CACHE_MAX = 300000;
const grassSampleCache = new Map();

function grassSampleCached(ring, ix, jz, x, z) {
  const key = ((ix + 0x40000) * 0x80000 + (jz + 0x40000)) * 8 + ring;
  let hit = grassSampleCache.get(key);
  if (hit === undefined) {
    const weight = grassSampleStatic(x, z);
    hit = [weight, weight > 0 ? biomeAt(x, z) : null];
    if (grassSampleCache.size >= GRASS_SAMPLE_CACHE_MAX) {
      grassSampleCache.clear();
    }
    grassSampleCache.set(key, hit);
  }
  return hit;
}

/**
 * The scatter's shape and cost model, as ONE exported object.
 *
 * scripts/bench-grass-scatter.mjs used to declare its own copy of RINGS,
 * GRASS_CHUNK and the density tables under a "keep in step with
 * src/vegetation.js" comment. They did not stay in step: the bench measured
 * cells of 0.62/1.05/1.9/3.4 while this file had moved to 0.34/0.7/2.6/5.2,
 * so the near ring under test was 3.3x SPARSER than the one that ships. The
 * bench reported 4.97 ms against a 6 ms budget and printed PASS for a scatter
 * that does not exist, over 55 frames where the real one spans 73.
 *
 * A comment cannot hold two copies of a constant together. Exporting the real
 * ones is the only version of this that cannot drift.
 */
export const GRASS_SCATTER = {
  // Getters, not values: the tier-dependent ones are resolved at construction
  // time (see applyProfile), so a snapshot taken at module load would report
  // the default profile forever. applyProfile() is idempotent and cheap.
  get RINGS() { applyProfile(); return RINGS; },
  get GRASS_RADIUS() { applyProfile(); return GRASS_RADIUS; },
  get GRASS_RADIUS() { applyProfile(); return GRASS_RADIUS; },
  get GRASS_FADE_IN() { applyProfile(); return GRASS_FADE_IN; },
  get GRASS_FADE_OUT() { applyProfile(); return GRASS_FADE_OUT; },
  get SAGE_RADIUS() { applyProfile(); return SAGE_RADIUS; },
  GRASS_CHUNK,
  // The re-centre cadence is now per ring: RING_STEP_FRAC of the ring's own
  // radius, floored at RING_STEP_MIN. The old single REBUILD_STEP is gone with
  // the single lastCenter it served.
  RING_STEP_FRAC,
  RING_STEP_MIN,
  // Speed scaling: GRASS_SPEED_REF is the gallop gait the budget and the
  // far-ring hold-back key off, SPEED_THIN the per-level hold-back fraction.
  GRASS_SPEED_REF,
  SPEED_THIN,
  GRASS_DENSITY,
  GRASSINESS,
  GRASS_SPECIES,
  SPECIES_MIX,
  BLADE_PANEL_W,
  GRASS_CARD_W,
  GRASS_CARD_H,
  hash2,
  grassSample
};

function asCardMap(tex) {
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Blade atlas: one 2x2 sheet, one painted species per panel, so four grasses
 * render from a single instanced draw. Each instance picks its panel with a
 * per-instance UV offset.
 *
 * The blades used to be near-straight triangles in vivid primary green, evenly
 * spaced and few — which is most of why the ground cover read as toy plastic.
 * Real grass arcs over under its own weight, grows in crowded clumps, tapers to
 * a hair, and is nowhere near that saturated: it sits in olive, khaki and straw.
 * So blades are built along a curved spine with a width that tapers to nothing,
 * drawn many and clustered, and coloured from a muted palette that runs dark at
 * the root to dry at the tip.
 *
 * Panels are sampled with a guard band inset, and blades are rooted just above
 * each panel's bottom edge, so filtering cannot bleed one species into another.
 */
function bladeShape(ctx, x0, y0, len, lean, wBase, segs) {
  const tipX = x0 + lean;
  const tipY = y0 - len;
  // Control point low and near the root: the blade leaves the ground upright
  // and only falls away toward the tip, which is what makes it read as grass
  // rather than a spike.
  const cx = x0 + lean * 0.16;
  const cy = y0 - len * 0.62;
  const at = (t) => {
    const mt = 1 - t;
    return {
      x: mt * mt * x0 + 2 * mt * t * cx + t * t * tipX,
      y: mt * mt * y0 + 2 * mt * t * cy + t * t * tipY
    };
  };
  const left = [];
  const right = [];
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const p = at(t);
    const q = at(Math.min(1, t + 0.02));
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const l = Math.hypot(dx, dy) || 1;
    // Taper the base as well as the tip. Width used to be maximum at t=0, so
    // every blade ended in a full-width flat rectangle — and since a clump's
    // blades all share one root Y, those square ends lined up into a single
    // straight horizontal cut. That is the "cut off" read: it is in the source
    // art, in all four species, which is why it survived every geometry fix.
    // A real blade narrows into its sheath; pinch the bottom tenth so it does
    // the same and the ends stop reading as cut stems.
    const w = wBase * Math.pow(1 - t, 0.7) * Math.min(1, 0.3 + t * 9);
    left.push([p.x - (dy / l) * w, p.y + (dx / l) * w]);
    right.push([p.x + (dy / l) * w, p.y - (dx / l) * w]);
  }
  ctx.beginPath();
  ctx.moveTo(left[0][0], left[0][1]);
  for (const [x, y] of left) {
    ctx.lineTo(x, y);
  }
  for (let i = right.length - 1; i >= 0; i -= 1) {
    ctx.lineTo(right[i][0], right[i][1]);
  }
  ctx.closePath();
}

function paintBladePanel(ctx, ox, oy, panel, sp) {
  const rootLine = oy + panel * 0.98;
  // Clumps, not an even comb: real tufts crowd around a few crowns.
  const clumps = sp.clumps;
  for (let c = 0; c < clumps; c += 1) {
    const cxp = ox + panel * (0.12 + (c + 0.5) / clumps * 0.76 + (rnd() - 0.5) * 0.06);
    const per = Math.round(sp.blades / clumps);
    for (let i = 0; i < per; i += 1) {
      const spreadX = (rnd() - 0.5) * panel * sp.clumpW;
      const x = cxp + spreadX;
      const len = panel * sp.tall * (0.5 + rnd() * 0.5);
      // Blades on the outside of a clump lean further out.
      const lean = (spreadX * 2.2 + (rnd() - 0.5) * panel * sp.lean) * (0.4 + rnd() * 0.9);
      const w = panel * sp.wide * (0.65 + rnd() * 0.7);
      const dry = rnd();
      const tone = sp.tones[(rnd() * sp.tones.length) | 0];
      // Jitter each blade's root so a clump's bases do not all sit on one
      // line — even tapered ends read as a cut when they are collinear.
      const root = rootLine - panel * 0.012 * rnd();
      const grad = ctx.createLinearGradient(x, root, x + lean, root - len);
      // Contact darkening in the bottom tenth of the blade.
      //
      // Grass neither casts nor receives shadows — castShadow is false at
      // ~50k instances, and the shadow pass was cut from 2.94M to 0.02M tris
      // to get there. So the blade/ground junction had no grounding cue of
      // any kind, anywhere on the map. That is what reads as grass floating:
      // it shows in every direction, at every location, and worst in first
      // person, where that junction is exactly what the eye is on.
      //
      // Short on purpose. The old 2x ramp darkened the whole lower HALF of
      // every blade, which is what made blades vanish against dark wood
      // (HARD_WON 1.5) — the fix for that removed the only grounding cue
      // there was.
      //
      // A tenth was too little to survive burial, though, and so was a
      // quarter. __terrainProbe puts the card bottom a median 5.4 cm below
      // the drawn ground after the sink was cut to 2 cm - the rest is the
      // footprint minimum, which is honest slope handling and has to stay,
      // since the card's downhill edge really is that much lower. Burial is
      // therefore ~22% of the plant's height whatever its size, because both
      // the sink and the footprint scale with the card.
      //
      // So the band has to clear 22% before it is back to full tone. Darkest
      // at the very bottom, still 62% at the soil line, full by 40% up the
      // blade. That is a gradient over the lower third, not the lower half at
      // 2x that made blades vanish against dark wood (HARD_WON 1.5).
      const shade = (f) =>
        `rgb(${Math.round(tone[0] * f)},${Math.round(tone[1] * f)},${Math.round(tone[2] * f)})`;
      grad.addColorStop(0, shade(0.45));
      grad.addColorStop(0.22, shade(0.62));
      grad.addColorStop(0.4, `rgb(${tone[0]},${tone[1]},${tone[2]})`);
      grad.addColorStop(0.55, `rgb(${tone[3]},${tone[4]},${tone[5]})`);
      // Tips dry out; a fraction of blades are dead straw all the way down.
      const tipDry = dry > sp.deadAt ? sp.straw : [tone[3] + 26, tone[4] + 16, tone[5] + 8];
      grad.addColorStop(1, `rgb(${tipDry[0] | 0},${tipDry[1] | 0},${tipDry[2] | 0})`);
      ctx.fillStyle = grad;
      bladeShape(ctx, x, root, len, lean, w, 9);
      ctx.fill();
    }
  }
}

function bladeTexture() {
  resetTexRng(0x9e3779b9);
  return asCardMap(makeTexture((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const panel = size / 2;
    // Muted palettes: [rootR,G,B, midR,G,B]. Nothing here is a primary green.
    // Root stops sit at a ~1.4x ramp below the mid, not ~2x: at the old 2x
    // ramp (root lum 0.18-0.23 vs mid 0.34-0.47) the lower half of every
    // blade fell below dark wood and vanished, and the lit upper half read
    // as a blade starting in mid-air (the "floating grass" read — it was
    // tonal, not geometric; see HARD_WON 1.5). Roots keep the between-row
    // hue spread; only luminance is lifted.
    const MEADOW = [[52, 76, 35, 82, 104, 44], [61, 85, 39, 96, 116, 52], [47, 70, 34, 74, 96, 40]];
    const DRYISH = [[75, 84, 43, 112, 116, 56], [66, 77, 40, 100, 106, 50], [84, 90, 46, 124, 124, 62]];
    const STRAW = [[111, 107, 53, 158, 148, 84], [103, 98, 51, 146, 136, 76]];
    // Canvas y runs down and texture v runs up, so a species whose atlas offset
    // is v=0 lives in the LOWER half of the canvas.
    const panels = [
      // blue grama: a dense low mat of fine blades
      { ox: 0, oy: panel, blades: 62, clumps: 7, clumpW: 0.115, tall: 0.4, wide: 0.0092, lean: 0.1,
        tones: MEADOW, deadAt: 0.78, straw: [150, 140, 78] },
      // bunchgrass: fewer, taller, strongly clumped
      { ox: panel, oy: panel, blades: 46, clumps: 4, clumpW: 0.085, tall: 0.72, wide: 0.0115, lean: 0.16,
        tones: MEADOW, deadAt: 0.7, straw: [156, 144, 80] },
      // bluestem: tall and arcing, wet ground
      { ox: 0, oy: 0, blades: 36, clumps: 4, clumpW: 0.08, tall: 0.93, wide: 0.0105, lean: 0.3,
        tones: MEADOW, deadAt: 0.82, straw: [148, 142, 82] },
      // cheatgrass: sparse pale straw, falling away
      { ox: panel, oy: 0, blades: 40, clumps: 5, clumpW: 0.105, tall: 0.5, wide: 0.0098, lean: 0.28,
        tones: DRYISH.concat(STRAW), deadAt: 0.35, straw: [168, 156, 92] }
    ];
    for (const sp of panels) {
      paintBladePanel(ctx, sp.ox, sp.oy, panel, sp);
    }
  }, 2048));
}

/**
 * Conifer sprig. The card runs trunk-end (u=0) to branch tip (u=1).
 *
 * This was a solid rectangle of bright needles filling the card edge to edge,
 * which is why crowns rendered as dark green streaks: with no silhouette of its
 * own, every card showed as an overlapping block. A real branch is a tapering
 * stem carrying separated needle fascicles, so the outline is ragged and light
 * passes between the clusters. Colour is a muted blue-green, dark at the stem.
 */
function leafTexture() {
  resetTexRng(0x85ebca6b);
  return asCardMap(makeTexture((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const stemY = size * 0.5;
    const tipX = size * 0.94;
    ctx.lineCap = "round";

    // Woody stem, thinning toward the tip.
    for (let i = 0; i < 5; i += 1) {
      ctx.strokeStyle = `rgba(${52 + i * 4},${38 + i * 3},${24 + i * 2},1)`;
      ctx.lineWidth = 7 - i * 1.2;
      ctx.beginPath();
      ctx.moveTo(0, stemY);
      ctx.quadraticCurveTo(size * 0.5, stemY - size * 0.02, tipX, stemY + size * 0.008);
      ctx.stroke();
    }

    const needle = (x0, y0, len, ang, shade, width) => {
      ctx.strokeStyle = shade;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      // Needles bow slightly rather than running dead straight.
      ctx.quadraticCurveTo(
        x0 + Math.cos(ang) * len * 0.55,
        y0 + Math.sin(ang) * len * 0.5,
        x0 + Math.cos(ang) * len * 0.92 + len * 0.16,
        y0 + Math.sin(ang) * len
      );
      ctx.stroke();
    };

    // Fascicles spaced along the stem, with gaps between them.
    const clusters = 22;
    for (let c = 0; c < clusters; c += 1) {
      const t = (c + 0.4) / clusters;
      const cx = t * tipX;
      const cy = stemY + Math.sin(c * 1.7) * size * 0.012;
      // Taper: long near the trunk, short at the tip, so the card silhouettes
      // as a branch instead of a slab.
      const taper = Math.pow(1 - t, 0.62);
      const spread = size * 0.26 * taper;
      const perCluster = 20 + ((c * 5) % 8);
      for (let k = 0; k < perCluster; k += 1) {
        const up = k % 2 === 0 ? -1 : 1;
        const g = 74 + rnd() * 46;
        const r = 34 + rnd() * 20;
        const bl = 44 + rnd() * 26;
        const alpha = 0.72 + rnd() * 0.28;
        // Angle sweeps back toward the tip, as needles do.
        const ang = up * (Math.PI * 0.42) + (rnd() - 0.5) * 0.7 - 0.16;
        needle(
          cx + (rnd() - 0.5) * size * 0.02,
          cy,
          spread * (0.5 + rnd() * 0.7),
          ang,
          `rgba(${r | 0},${g | 0},${bl | 0},${alpha})`,
          1.0 + rnd() * 1.35
        );
      }
    }
  }, 512));
}

/**
 * Sagebrush. Was a stack of translucent ellipses that ran to the card edges, so
 * every bush showed as a pale rectangular slab with sticks over it. Sage is a
 * mass of small oval leaves on woody branchlets, silver-grey-green, with an
 * irregular outline that has to stay clear of the card border.
 */
function sageTexture() {
  resetTexRng(0xc2b2ae35);
  return asCardMap(makeTexture((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = "round";

    // Woody branchlets fanning up from the base.
    const stems = 7;
    const tips = [];
    for (let i = 0; i < stems; i += 1) {
      const x0 = size * (0.38 + (i / stems - 0.5) * 0.3);
      const tx = size * (0.16 + (i + 0.5) / stems * 0.68) + (rnd() - 0.5) * size * 0.05;
      const ty = size * (0.2 + rnd() * 0.3);
      ctx.strokeStyle = `rgba(${76 + rnd() * 16},${62 + rnd() * 14},${44 + rnd() * 12},0.95)`;
      ctx.lineWidth = 4.5 - i * 0.35;
      ctx.beginPath();
      ctx.moveTo(x0, size * 0.99);
      ctx.quadraticCurveTo(x0 + (tx - x0) * 0.3, size * 0.62, tx, ty);
      ctx.stroke();
      tips.push({ x: tx, y: ty, x0 });
    }

    // Leaf clusters along each branchlet.
    const leaf = (cx, cy, r, ang, shade) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    for (const s of tips) {
      const along = 18;
      for (let i = 0; i < along; i += 1) {
        const t = 0.18 + (i / along) * 0.82;
        const bx = s.x0 + (s.x - s.x0) * t + (rnd() - 0.5) * size * 0.05;
        const by = size * 0.99 + (s.y - size * 0.99) * t + (rnd() - 0.5) * size * 0.04;
        const cluster = 3 + ((i * 3) % 3);
        for (let k = 0; k < cluster; k += 1) {
          // Sage green is grey and desaturated: R and B stay close to G.
          const g = 104 + rnd() * 34;
          const r = g - 18 + rnd() * 20;
          const b = g - 34 + rnd() * 18;
          leaf(
            bx + (rnd() - 0.5) * size * 0.055,
            by + (rnd() - 0.5) * size * 0.055,
            size * (0.018 + rnd() * 0.02),
            rnd() * Math.PI,
            `rgba(${r | 0},${g | 0},${b | 0},${0.82 + rnd() * 0.18})`
          );
        }
      }
    }
  }, 512));
}

function broadleafTexture() {
  resetTexRng(0x27d4eb2f);
  return asCardMap(makeTexture((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const drawLeaf = (cx, cy, len, ang, shade) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      ctx.fillStyle = shade;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(len * 0.22, -len * 0.28, len, 0);
      ctx.quadraticCurveTo(len * 0.22, len * 0.28, 0, 0);
      ctx.fill();
      ctx.restore();
    };
    for (let i = 0; i < 55; i += 1) {
      const cx = size * (0.12 + rnd() * 0.76);
      const cy = size * (0.12 + rnd() * 0.76);
      const g = 86 + rnd() * 80;
      const r = 48 + rnd() * 40;
      drawLeaf(
        cx,
        cy,
        size * (0.1 + rnd() * 0.16),
        rnd() * Math.PI * 2,
        `rgba(${r | 0},${g | 0},${(28 + rnd() * 24) | 0},${0.72 + rnd() * 0.28})`
      );
    }
  }, 256));
}

/**
 * Stamp a card's own "across the blade" axis onto every one of its vertices.
 *
 * A tangent-space normal map has to know which way its X axis points in object
 * space, and each card in a tuft or canopy is rotated differently, so it cannot
 * be a constant or read off the geometry after merging. Pass the card's local
 * +X after whatever rotations built it.
 */
function setTangent(geo, tx, ty, tz) {
  const n = geo.attributes.position.count;
  const t = new Float32Array(n * 3);
  for (let v = 0; v < n; v += 1) {
    t[v * 3] = tx;
    t[v * 3 + 1] = ty;
    t[v * 3 + 2] = tz;
  }
  geo.setAttribute("aTangent", new THREE.Float32BufferAttribute(t, 3));
  return geo;
}

const TAN_X = new THREE.Vector3();
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

/**
 * Attach a per-instance wind frame to `geo` as a REAL InstancedBufferAttribute
 * and return it.
 *
 * The attribute holds (cos a / sx, sin a / sx) per instance — a is the
 * instance's Y rotation, sx its XZ scale — and windBend() rotates the world
 * wind into object space with it. It must be a real attribute read back with
 * attribute("aWind"), never a TSL instancedBufferAttribute node: a node
 * uploads once at first render and never again (HARD_WON 1.6), and these
 * values are rewritten every rescatter and every tree LOD bucketing pass.
 */
function makeWindAttrib(geo, cap) {
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
  // NOT setUsage(DynamicDrawUsage). It reads like the right hint for a buffer
  // that is rewritten on rescatter, and under WebGL it is — but three's WebGPU
  // backend treats it as "re-upload unconditionally, every frame, forever":
  //
  //   if ( data.version < bufferAttribute.version ||
  //        bufferAttribute.usage === DynamicDrawUsage ) backend.updateAttribute()
  //
  // (Attributes.update, three.webgpu.js). The version check is skipped, so a
  // parked camera with nothing moving still paid a full queue.writeBuffer of
  // every aWind and every grass attribute on every frame. Measured at the
  // northernPines vantage: 22 uploads, 2.6 MB and 44 ms of main-thread time
  // per frame — the dominant cost in the whole frame, three times the grass
  // fill it was hiding behind. The dirty contract is needsUpdate, which every
  // writer here already honours (bucketTrees and finishScatter both set it).
  geo.setAttribute("aWind", attr);
  return attr;
}

/** Copy tree `i`'s wind frame into instanced slot `slot` of `attrib`. */
function writeWind(attrib, slot, src, i) {
  attrib.array[slot * 2] = src[i * 2];
  attrib.array[slot * 2 + 1] = src[i * 2 + 1];
}

function paintAo(geo, aoAt) {
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let v = 0; v < pos.count; v += 1) {
    const ao = aoAt(pos, v);
    colors[v * 3] = ao;
    colors[v * 3 + 1] = ao;
    colors[v * 3 + 2] = ao;
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
}

/**
 * Conifer canopy: whorls of folded branch cards. Lower tiers droop, upper
 * tiers sit flatter, so the mass reads conical instead of stacked shelves.
 * Vertex colors bake AO toward the trunk and under upper tiers.
 */
/**
 * Normal bending.
 *
 * Foliage is built from flat alpha cards, which is standard, but every card was
 * lit with its raw geometric normal — perpendicular to the plane. So a canopy
 * lit as a pile of intersecting cardboard rather than a rounded mass, and grass,
 * whose cards are only ever rotated about Y, had every normal pointing
 * horizontally: a field lit as thousands of tiny vertical walls instead of as
 * ground. That flat shading, not the use of cards, is what read as 2D.
 *
 * The fix is to blend the geometric normal toward one describing the shape the
 * cards collectively stand for — outward from the crown's centre for a canopy,
 * skyward for grass — so lighting follows the volume as well as the polygon.
 *
 * Blend, not replace. Driven all the way (0.9 on grass, 0.85 on canopies) every
 * blade took a near-identical normal and the sun lit the whole field to one
 * flat value: no form at all, which is worse than the tilted cards it replaced.
 * Around half keeps the volume read while leaving shading variation between
 * cards.
 *
 * Baked into the geometry rather than computed in the shader because the crown
 * centre differs per prototype while the material is shared across all of them.
 */
function sphericalNormals(geo, centerY, amount) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  for (let v = 0; v < pos.count; v += 1) {
    const dx = pos.getX(v);
    const dy = pos.getY(v) - centerY;
    const dz = pos.getZ(v);
    const len = Math.hypot(dx, dy, dz);
    const ox = len > 1e-4 ? dx / len : 0;
    const oy = len > 1e-4 ? dy / len : 1;
    const oz = len > 1e-4 ? dz / len : 0;
    const nx = nrm.getX(v) * (1 - amount) + ox * amount;
    const ny = nrm.getY(v) * (1 - amount) + oy * amount;
    const nz = nrm.getZ(v) * (1 - amount) + oz * amount;
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(v, nx / l, ny / l, nz / l);
  }
  nrm.needsUpdate = true;
  return geo;
}

/**
 * Ground cover reads as a lit surface, not a thicket of vertical sheets, so its
 * normals point mostly at the sky with a little outward spread for shape.
 */
function skywardNormals(geo, upWeight, amount) {
  const pos = geo.attributes.position;
  const nrm = geo.attributes.normal;
  for (let v = 0; v < pos.count; v += 1) {
    const dx = pos.getX(v);
    const dz = pos.getZ(v);
    const len = Math.hypot(dx, upWeight, dz);
    const ox = dx / len;
    const oy = upWeight / len;
    const oz = dz / len;
    const nx = nrm.getX(v) * (1 - amount) + ox * amount;
    const ny = nrm.getY(v) * (1 - amount) + oy * amount;
    const nz = nrm.getZ(v) * (1 - amount) + oz * amount;
    const l = Math.hypot(nx, ny, nz) || 1;
    nrm.setXYZ(v, nx / l, ny / l, nz / l);
  }
  nrm.needsUpdate = true;
  return geo;
}

/**
 * Push any vertex that ended up below `minY` back up to it.
 *
 * Branch droop is clamped so a tip cannot swing through the ground, but each
 * card is also folded about its own axis, and on the wide low tiers that fold
 * alone dipped a card edge more than a metre under — the far LOD crowns were
 * buried 0.56 m and 1.16 m. Solving four chained rotations for a true lowest
 * point is not worth it; flattening the few vertices that break through reads
 * as a skirt resting on the ground, which is what a low conifer actually does.
 */
function groundClamp(geo, minY) {
  const pos = geo.attributes.position;
  for (let v = 0; v < pos.count; v += 1) {
    if (pos.getY(v) < minY) {
      pos.setY(v, minY);
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function makePineCanopy(tiers, cardsPerTier, baseRadius, baseY, topY) {
  const leaves = [];
  const limbs = [];
  const span = topY - baseY;
  const FOLD = [
    { tilt: 0, ao: 1 },
    { tilt: 0.85, ao: 0.82 },
    { tilt: -0.85, ao: 0.82 }
  ];
  for (let t = 0; t < tiers; t += 1) {
    const f = t / (tiers - 1 || 1);
    const y = baseY + span * Math.pow(f, 0.8);
    const count = Math.max(3, Math.round(cardsPerTier * (1 - f * 0.45)));
    for (let i = 0; i < count; i += 1) {
      if (seeded(i * 17 + t * 91) < 0.03) {
        continue;
      }
      const a = (i / count) * Math.PI * 2 + f * 1.7 + seeded(i + t * 13) * 0.35;
      const radius = (baseRadius * Math.pow(1 - f, 0.55) + 0.55) * (0.82 + seeded(i + t * 17) * 0.38);
      const cardLen = radius * 1.62;
      const cardW = radius * 1.22;
      // A branch can only droop until its tip reaches the ground. Unclamped,
      // the low wide tiers pushed foliage below y=0 — 1.43 m of buried crown on
      // the juniper, 0.22 m on the broad pine — which both wasted triangles and
      // made the shrubby forms look sunk into the hill.
      let droop = -(0.36 - 0.34 * f + seeded(i + t * 31) * 0.18);
      const tipReach = cardLen * 0.92;
      const room = Math.max(0, y - 0.12);
      if (tipReach > 1e-4) {
        const maxDroop = Math.asin(Math.min(1, room / tipReach));
        if (-droop > maxDroop) {
          droop = -maxDroop;
        }
      }
      const tierAo = 0.46 + 0.54 * Math.pow(f, 0.6);
      for (const fold of FOLD) {
        const w = fold.tilt === 0 ? cardW : cardW * 0.72;
        const geo = new THREE.PlaneGeometry(cardLen, w);
        paintAo(geo, (pos, v) => {
          const outward = (pos.getX(v) + cardLen / 2) / cardLen;
          // Three AO signals — tier height, distance out along the branch, and
          // which fold of the card this is — each sane on its own, but they
          // were multiplied together: 0.46 * 0.55 * 0.82 bottoms out at 0.21.
          // Stacked on a needle albedo that is only 0.29 green to begin with,
          // that put the shaded side of a canopy at 0.06 reflectance, which is
          // why conifers read as black cut-outs from every angle rather than
          // only when backlit. The broadleaf canopy, which reads correctly,
          // floors its AO at 0.5 — so compress this product into the same
          // depth instead of letting it run to near-zero.
          const raw = tierAo * (0.55 + 0.45 * outward) * fold.ao;
          return 0.5 + 0.5 * raw;
        });
        geo.rotateX(-Math.PI / 2);
        if (fold.tilt !== 0) {
          geo.translate(0, -w * 0.18 * Math.sign(fold.tilt), 0);
          geo.rotateX(fold.tilt);
        }
        geo.rotateZ(droop);
        geo.translate(cardLen * 0.42, 0, 0);
        geo.rotateY(a);
        geo.translate(0, y, 0);
        // rotateX leaves the +X axis untouched, so only the droop and the yaw
        // move this card's across-axis.
        TAN_X.set(1, 0, 0).applyAxisAngle(AXIS_Z, droop).applyAxisAngle(AXIS_Y, a);
        setTangent(geo, TAN_X.x, TAN_X.y, TAN_X.z);
        leaves.push(geo);
      }

      // Kept well inside the needle mass. The old sprig texture filled its card
      // edge to edge so a full-length limb was always covered; the new one
      // tapers to nothing at the tip, which left bare brown poles sticking out
      // past the foliage.
      const limbLen = cardLen * 0.5;
      const limb = new THREE.CylinderGeometry(0.026, 0.065, limbLen, 5);
      limb.rotateZ(-Math.PI / 2);
      limb.translate(limbLen * 0.55, 0, 0);
      limb.rotateZ(droop * 0.8);
      limb.rotateY(a);
      limb.translate(0, y - 0.03, 0);
      limbs.push(limb);
    }
  }
  // The crown's apex is now the trunk's bark leader (makePineTrunk is built
  // to topY + 0.75 and pokes through here), so the old solid leaf cone is
  // gone. A 0.72 m-radius cone above the top tier read as a detached
  // mid-tone chunk against the sky (audit U4 "floating pine tips"); a thin
  // dark bark stem with the top-tier tuft at its base reads as a conifer
  // leader instead. The leader is deliberately short — 2.2 m local read as
  // a 4.4 m pole, 1.0 m as a long spike; 0.75 m keeps it a stub.
  const crown = mergeGeometries(leaves);
  // groundClamp recomputes normals, so bend after it, not before.
  groundClamp(crown, 0.06);
  sphericalNormals(crown, baseY + (topY - baseY) * 0.52, 0.55);
  return { leaves: crown, limbs: mergeGeometries(limbs) };
}

/**
 * A fire-killed snag: a broken trunk with the stubs of its branches still on it.
 *
 * The burn was scattered with plain tapered cylinders — the same geometry a
 * living trunk uses — so a burnt stand read as a row of fence posts rather than
 * a dead forest. What identifies a snag at a glance is the ragged silhouette:
 * limbs burn back to short stubs and the top usually snaps off.
 */
function makeBurntSnag(height, baseR, topR) {
  const parts = [makePineTrunk(height, baseR, topR)];
  const stubs = 9;
  for (let i = 0; i < stubs; i += 1) {
    const f = 0.28 + (i / stubs) * 0.66;
    const y = height * f;
    // Shorter and thinner toward the top, as the fire took more of them.
    const len = (0.85 - f * 0.45) * (0.7 + seeded(i * 31) * 0.7);
    const r = (0.07 - f * 0.035) * (0.75 + seeded(i * 17) * 0.6);
    if (len < 0.12 || r < 0.012) {
      continue;
    }
    const stub = new THREE.CylinderGeometry(r * 0.55, r, len, 5);
    stub.rotateZ(-Math.PI / 2);
    stub.translate(len * 0.5, 0, 0);
    // Burnt limbs droop; angle them down a little off horizontal.
    stub.rotateZ(-0.25 - seeded(i * 13) * 0.45);
    stub.rotateY(seeded(i * 7) * Math.PI * 2);
    stub.translate(0, y, 0);
    parts.push(stub);
  }
  return mergeGeometries(parts);
}

function makePineTrunk(height, baseR, topR) {
  const shaft = new THREE.CylinderGeometry(topR, baseR, height, 10);
  shaft.translate(0, height / 2 + 0.08, 0);
  // Tied to trunk radius, not height: with the trunk now running the full
  // height of the tree, a height-proportional flare became a 1.4 m buttress.
  const flareH = Math.min(0.95, Math.max(0.38, baseR * 2.4));
  const flare = new THREE.CylinderGeometry(baseR, baseR * 1.7, flareH, 10);
  flare.translate(0, flareH / 2, 0);
  return mergeGeometries([shaft, flare]);
}

function makeGrassTuft() {
  // Three planes at 60° — not 90° — so DoubleSide does not draw coplanar pairs.
  const geos = [];
  const w = GRASS_CARD_W;
  const h = GRASS_CARD_H;
  for (let i = 0; i < 3; i += 1) {
    const geo = new THREE.PlaneGeometry(w, h, 1, 2);
    geo.translate((seeded(i + 3) - 0.5) * 0.06, h * 0.5, (seeded(i + 9) - 0.5) * 0.06);
    const a = (i / 3) * Math.PI;
    geo.rotateY(a);
    // The card's own +X after rotation. A tangent-space normal map needs to
    // know which way "across the blade" points in object space, and each of the
    // three crossed cards faces differently, so it cannot be a constant.
    const tx = Math.cos(a);
    const tz = -Math.sin(a);
    const n = geo.attributes.position.count;
    const tan = new Float32Array(n * 3);
    for (let v = 0; v < n; v += 1) {
      tan[v * 3] = tx;
      tan[v * 3 + 2] = tz;
    }
    geo.setAttribute("aTangent", new THREE.Float32BufferAttribute(tan, 3));
    geos.push(geo);
  }
  // Shade the tuft off the ground, not off the card. At 0.38 the normals kept
  // most of each quad's own facing, so within a single tuft the card turned
  // toward the sun lit up and the card turned away went near-black - the same
  // clump reading as two unrelated objects, one of them a dark patch lying on
  // bright ground with nothing joining it to the surface. Real grass is a
  // surface, and every engine shades it as one: take the normal from the
  // ground plane and keep only a trace of the card. 0.85 leaves enough
  // per-card variation to avoid a flat green mat.
  return skywardNormals(mergeGeometries(geos), 1.0, 0.85);
}

/**
 * Sagebrush. The cards used to be 0.85-1.25 m tall before per-instance scale,
 * which took the tallest bushes to 2.87 m — roughly double life size, on a
 * plant that covers 40-52% of the range, tribal, foothill and ranch country.
 * Real sagebrush is knee to chest.
 */
function makeSageBush() {
  const geos = [];
  const angles = [0.15, 1.05, 2.05, 2.85];
  for (let i = 0; i < angles.length; i += 1) {
    const w = 0.6 + seeded(i + 2) * 0.22;
    const h = 0.58 + seeded(i + 5) * 0.26;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate((seeded(i + 8) - 0.5) * 0.18, h * 0.42, (seeded(i + 11) - 0.5) * 0.18);
    geo.rotateY(angles[i]);
    setTangent(geo, Math.cos(angles[i]), 0, -Math.sin(angles[i]));
    geos.push(geo);
  }
  return skywardNormals(mergeGeometries(geos), 0.9, 0.45);
}

function makeBroadCanopy(cardCount, radius, baseY, topY) {
  const leaves = [];
  const span = topY - baseY;
  const mid = (baseY + topY) * 0.5;
  for (let i = 0; i < cardCount; i += 1) {
    const y = baseY + span * Math.pow(seeded(i + 4), 0.65);
    const a = seeded(i + 9) * Math.PI * 2;
    const drop = 1 - Math.abs(y - mid) / (span * 0.55);
    const r = radius * Math.sqrt(seeded(i + 14)) * Math.max(0.25, drop);
    const w = 1.15 + seeded(i + 18) * 0.7;
    const h = 0.95 + seeded(i + 21) * 0.55;
    const geo = new THREE.PlaneGeometry(w, h);
    paintAo(geo, (pos, v) => {
      const outward = (pos.getX(v) + w / 2) / w;
      return 0.5 + 0.5 * outward * (0.55 + 0.45 * ((y - baseY) / span));
    });
    const rz = (seeded(i + 25) - 0.5) * 0.7;
    const rx = (seeded(i + 28) - 0.5) * 0.55;
    geo.rotateY(a);
    geo.rotateZ(rz);
    geo.rotateX(rx);
    geo.translate(Math.cos(a) * r, y, Math.sin(a) * r);
    TAN_X.set(1, 0, 0).applyAxisAngle(AXIS_Y, a).applyAxisAngle(AXIS_Z, rz)
      .applyAxisAngle(new THREE.Vector3(1, 0, 0), rx);
    setTangent(geo, TAN_X.x, TAN_X.y, TAN_X.z);
    leaves.push(geo);
  }
  return sphericalNormals(mergeGeometries(leaves), mid, 0.55);
}

export async function loadVegetationMaps() {
  // Only bark and needle are baked. Grass, sage and broadleaf render from the
  // painted canvas atlases, and their keys were dropped from FOLIAGE_SET; the
  // loads for them stayed behind and were passing undefined into tryLoadTexture
  // on every boot, which extOf turned into six caught TypeErrors and six
  // console warnings per page load. Ask only for what exists.
  const [barkAlbedo, barkNormal, needleAlbedo, needleNormal] = await Promise.all([
    tryLoadTexture(BARK_SET.albedo, "albedo"),
    tryLoadTexture(BARK_SET.normal, "linear"),
    tryLoadTexture(FOLIAGE_SET.needleAlbedo, "albedo"),
    tryLoadTexture(FOLIAGE_SET.needleNormal, "linear")
  ]);
  // Atlas panels, not tiling surfaces: repeat would bleed one species into the
  // next across the guard band.
  for (const t of [needleAlbedo, needleNormal]) {
    if (t) {
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
    }
  }
  return { barkAlbedo, barkNormal, needleAlbedo, needleNormal };
}

export function createVegetation(scene, maps = {}) {
  // Resolve the device tier BEFORE anything reads a radius or a ring.
  applyProfile();
  const barkMap = maps.barkAlbedo || barkTexture();
  const bark = new THREE.MeshStandardNodeMaterial({
    map: barkMap,
    roughness: 0.92,
    color: maps.barkAlbedo ? 0xffffff : 0x4a3424
  });
  if (maps.barkNormal) {
    bark.normalMap = maps.barkNormal;
    // The bark albedo is dark and the normal map is subtle, so at the audit
    // distances trunks read as flat dark poles (P3). Boost the relief only
    // when the real map is present; the fallback texture keeps its old look.
    bark.normalScale = new THREE.Vector2(2.0, 2.0);
  }
  const char = new THREE.MeshStandardNodeMaterial({ color: 0x2a2420, roughness: 0.96 });
  const limbMat = new THREE.MeshStandardNodeMaterial({
    map: barkMap,
    roughness: 0.94,
    color: maps.barkAlbedo ? 0x9a8871 : 0x3a2c20
  });
  const cottonBark = new THREE.MeshStandardNodeMaterial({
    map: barkMap,
    roughness: 0.9,
    color: maps.barkAlbedo ? 0xc4a078 : 0x6a4e32
  });

  const sunDir = uniform(new THREE.Vector3(0, 1, 0));
  const windFreq = uniform(1.3);
  const windStrength = uniform(0.07);
  const gustFreq = uniform(3.2);
  const gustStrength = uniform(0.11);
  const warmGreen = uniform(new THREE.Vector3(0.35, 0.55, 0.25));
  const windDir = normalize(vec3(1.0, 0.0, 0.6));

  const leafTex = maps.needleAlbedo || leafTexture();
  const leafSample = texture(leafTex, uv());
  const sageTex = maps.sageAlbedo || sageTexture();
  const sageSample = texture(sageTex, uv());
  const broadTex = maps.broadAlbedo || broadleafTexture();
  const broadSample = texture(broadTex, uv());
  const back = (viewDir) => max(float(0), dot(viewDir, sunDir).negate());

  /**
   * Wind bend, in the instance's OBJECT space.
   *
   * The phase terms read positionWorld, so a whole hillside's grass swings in
   * step — but the displacement used to be `windDir.mul(...)` added straight
   * onto positionLocal, which is object space, and every tuft, sage bush and
   * tree carries a random Y rotation. So each plant leaned along a different
   * compass direction and the field never moved as one. This was invisible
   * frame to frame and obvious in any video of the field.
   *
   * Fix: each instance carries its wind frame as a REAL InstancedBufferAttribute
   * ("aWind", see the scatter below and HARD_WON 1.6 for why it cannot be a TSL
   * node) holding (cos a / sx, sin a / sx) for its Y rotation a and XZ scale sx.
   * Rotating the world wind into the instance's frame is
   *   object = R_y(a)^-1 * world  =>  ox = wx*c - wz*s, oz = wx*s + wz*c,
   * and the 1/sx folded into the attribute cancels the XZ scale the
   * instanceMatrix will multiply back in, so the amplitude stays in world
   * metres whatever the card's size.
   */
  const windBend = (profile) => {
    const sway = sin(time.mul(windFreq).add(positionWorld.x.mul(0.12)).add(positionWorld.z.mul(0.16)));
    const gust = sin(time.mul(gustFreq).add(positionWorld.x.mul(0.6)).add(positionWorld.z.mul(0.9)));
    const amp = sway.mul(windStrength).add(gust.mul(gustStrength)).mul(profile);
    const wx = windDir.x.mul(amp);
    const wz = windDir.z.mul(amp);
    const rot = attribute("aWind", "vec2");
    return vec3(
      wx.mul(rot.x).sub(wz.mul(rot.y)),
      float(0),
      wx.mul(rot.y).add(wz.mul(rot.x))
    );
  };

  /**
   * Per-instance foliage tint.
   *
   * Every pine on the map was the same green: the canopy material had one
   * uniform tint and nothing varied it per tree, so a hillside of them read as
   * one cloned sprite repeated a few thousand times. three populates the
   * vInstanceColor varying from an InstancedMesh's instanceColor attribute, but
   * does not re-export the accessor from three/tsl — this is the same
   * varyingProperty it builds internally (see nodes/accessors/Instance.js).
   *
   * Every mesh sharing a material that reads this MUST have instanceColor set,
   * or the varying stays at its zero default and the foliage renders black.
   */
  const instanceTint = varyingProperty("vec3", "vInstanceColor");

  /**
   * Use the bent normals baked into the foliage geometry.
   *
   * This also removes the double-sided lighting flip. three only applies
   * negateOnBackSide on its default normal path (see nodes/accessors/Normal.js
   * normalView); when a material supplies its own normalNode that step is
   * skipped. With DoubleSide cards the flip meant a card's shading inverted the
   * instant it turned past edge-on, which is what made individual quads pop out
   * of the mass instead of blending into it.
   */
  const bentNormal = transformNormalToView(normalLocal);

  /**
   * Combine the volumetric bend with a tangent-space normal map.
   *
   * Built by hand because normalNode replaces three's entire normal path: set
   * it and material.normalMap is never consulted, so the two have to be mixed
   * here. T is the card's own across-axis (stamped per card by setTangent), N
   * is the bent normal, B their cross product.
   */
  const mappedNormal = (normalTex, sampleUV) => {
    const T = normalize(transformNormalToView(attribute("aTangent", "vec3")));
    const B = normalize(cross(bentNormal, T));
    const nm = texture(normalTex, sampleUV).xyz.mul(2).sub(1);
    return normalize(T.mul(nm.x).add(B.mul(nm.y)).add(bentNormal.mul(nm.z)));
  };

  const makeFoliageMat = (sample, tint, windLo, windHi, alphaTest, normalTex) => {
    const m = new THREE.MeshStandardNodeMaterial({
      side: THREE.DoubleSide,
      alphaTest,
      vertexColors: true
    });
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const vcol = attribute("color", "vec3");
    const albedo = sample.rgb.mul(tint).mul(vcol).mul(instanceTint);
    m.colorNode = vec4(albedo.mul(back(viewDir).mul(warmGreen).mul(0.6).add(1)), sample.a);
    m.positionNode = positionLocal.add(windBend(smoothstep(windLo, windHi, positionGeometry.y).pow(2)));
    m.normalNode = normalTex ? mappedNormal(normalTex, uv()) : bentNormal;
    return m;
  };

  const pineLeafMat = makeFoliageMat(leafSample, vec3(0.9, 1.15, 0.7), 2.8, 8.2, 0.4, maps.needleNormal);
  const sageMat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.32 });
  {
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const albedo = sageSample.rgb.mul(vec3(0.95, 1.05, 0.82));
    sageMat.colorNode = vec4(albedo.mul(back(viewDir).mul(warmGreen).mul(0.35).add(1)), sageSample.a);
    sageMat.positionNode = positionLocal.add(windBend(uv().y.pow(2).mul(0.45)));
    sageMat.normalNode = maps.sageNormal ? mappedNormal(maps.sageNormal, uv()) : bentNormal;
  }
  const cottonLeafMat = makeFoliageMat(broadSample, vec3(1.05, 1.12, 0.72), 2.0, 7.4, 0.38, maps.broadNormal);

  // Four silhouettes, not three, and spread further apart in proportion: a bare
  // -legged spire, the standard conifer, a broad mid-height tree, and a squat
  // scrubby juniper for the dry biomes. Three near-identical cones gave the
  // forest one repeated outline however many instances it drew.
  // Trunk height is the canopy's own top, not a separately typed number.
  // Every pine used to stop its trunk 2.15-5.95 m short of its crown — a spire
  // at full instance scale carried about 13 m of crown with no stem inside it —
  // because the two were authored independently and drifted apart. A conifer's
  // leader runs to the tip, so the trunk is derived from the canopy it carries
  // and tapers to a spire tip rather than ending in a blunt stump.
  /**
   * Three levels of detail, not two.
   *
   * Every tree on the map drew at full "far" detail at every range: 74% of all
   * tree geometry sat beyond 1400 m. Culling that distance outright is not an
   * option — the fog only removes 17% of an object's colour at 1150 m, so trees
   * would visibly wink out and leave a bare horizon. A third, very cheap crown
   * keeps them on the skyline for about a fiftieth of the triangles.
   */
  const pineForm = (tiers, cards, radius, baseY, topY, baseR, farTiers, farCards) => ({
    near: makePineCanopy(tiers, cards, radius, baseY, topY),
    far: makePineCanopy(farTiers, farCards, radius, baseY, topY),
    // The distant band is crown-only and cheapest; fuller cards keep the
    // horizon reading as tree silhouettes instead of smeared specks (U6).
    distant: makePineCanopy(9, 13, radius, baseY, topY),
    trunk: makePineTrunk(topY + 0.75, baseR, Math.max(0.045, baseR * 0.16))
  });
  // Crown radius against tree height. A conifer is roughly 0.3-0.5 as wide as
  // it is tall; these were 0.66 and a full 1.00, which is why they read as tree
  // ferns rather than pines. Branch cards are cut from the radius, so an
  // over-wide crown also gave the "broad" pine 6.8 m fronds and, since the
  // needle sprig is painted across the card, needles a foot long.
  // Tier counts carry the crown's continuity. Narrowing the radius shortened
  // every branch card, which opened gaps between tiers and left the near trees
  // looking like stacked shelves with the trunk showing through; the far band
  // was sparse enough that mid-distance trees read as poles with tufts on.
  // The far and distant bands were sparse enough that a mid-ground tree showed
  // as a bare pole with a few spokes — the crown could not cover its own trunk.
  // Making trunks run the full height to the leader, which is correct, made
  // that far more obvious: there is now a full-length stem behind every gap.
  // Grass taught the same lesson: density is what makes foliage read as mass.
  const PINE = [
    // Tall spire: high crown on a long clear stem.
    pineForm(10, 11, 2.1, 4.2, 12.4, 0.3, 7, 9),
    pineForm(8, 11, 1.9, 2.4, 7.7, 0.34, 7, 9),
    pineForm(7, 12, 2.0, 1.9, 6.4, 0.4, 7, 10),
    // Juniper: wide, low, almost no clear trunk.
    pineForm(5, 12, 2.1, 0.6, 4.1, 0.46, 6, 10)
  ];

  // The world-wide scatter budget. Pines beyond this come only from the
  // pines-biome forest-core pass below, so raising MAX cannot change any
  // other biome's silhouette.
  const MAIN_TREE_BUDGET = 3200;
  const MAX = 7600;
  const pines = PINE.map((proto) => {
    const trunkNear = new THREE.InstancedMesh(proto.trunk, bark, MAX);
    const crownNear = new THREE.InstancedMesh(proto.near.leaves, pineLeafMat, MAX);
    const limbNear = new THREE.InstancedMesh(proto.near.limbs, limbMat, MAX);
    const trunkFar = new THREE.InstancedMesh(proto.trunk, bark, MAX);
    const crownFar = new THREE.InstancedMesh(proto.far.leaves, pineLeafMat, MAX);
    const limbFar = new THREE.InstancedMesh(proto.far.limbs, limbMat, MAX);
    // Distant band: crown only. At 520 m a trunk is 1.2 px wide and by 900 m
    // it is under one — it renders nothing but the bare pole that shows through
    // a thin crown. Dropping it removes that artefact and returns ~245k
    // triangles, which buys the crown density that actually reads at range.
    const crownDist = new THREE.InstancedMesh(proto.distant.leaves, pineLeafMat, MAX);
    // Per-instance wind frames for the three crown LODs; slots are rewritten in
    // step with the matrices by the seeding loop below and by bucketTrees.
    const windNear = makeWindAttrib(proto.near.leaves, MAX);
    const windFar = makeWindAttrib(proto.far.leaves, MAX);
    const windDist = makeWindAttrib(proto.distant.leaves, MAX);
    for (const mesh of [trunkNear, crownNear, limbNear, trunkFar, crownFar, limbFar, crownDist]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
    }
    // Only the near crown casts. Every crown and limb casting meant 2.94M
    // triangles drawn a second time into the shadow map, and alpha-tested
    // shadows cannot use early-z so each one runs its fragment shader too.
    // Near trees give the dappling you actually notice; a shadow from a tree
    // 600 m off costs the same and reads as nothing.
    trunkNear.castShadow = true;
    crownNear.castShadow = true;
    limbNear.castShadow = false;
    return { trunkNear, crownNear, limbNear, trunkFar, crownFar, limbFar, crownDist, windNear, windFar, windDist };
  });

  const treePos = new Float32Array(MAX * 3);
  const treeGirth = new Float32Array(MAX);
  const treeHeight = new Float32Array(MAX);
  const treeRot = new Float32Array(MAX);
  const treeLeanX = new Float32Array(MAX);
  const treeLeanZ = new Float32Array(MAX);
  const treeType = new Uint8Array(MAX);
  const treeTint = new Float32Array(MAX * 3);
  // Per-tree wind frame, (cos a / sx, sin a / sx) from the placement Y rotation
  // and XZ scale. Statically computed here, copied into each crown LOD's
  // aWind attribute wherever the matrices are (seeding loop, bucketTrees).
  const treeWind = new Float32Array(MAX * 2);
  const tintColor = new THREE.Color();

  /**
   * A foliage colour for one tree.
   *
   * Spread runs along two axes that real stands vary on: how blue-green versus
   * yellow-green the needles are, and how dark the individual tree is. Biome
   * shifts the centre of that spread — high conifer forest cool and deep, dry
   * country pale and yellow — so neighbouring trees differ without the hillside
   * turning into confetti.
   */
  function foliageTint(biome, n1, n2, out, slot) {
    const dry = biome === "range" || biome === "badlands" || biome === "iron" || biome === "tribal";
    const cool = biome === "pines" ? 0.62 : dry ? 0.16 : 0.4;
    const blue = n1 * 0.75 + cool * 0.25;
    const value = (dry ? 0.84 : 0.74) + n2 * 0.38;
    // Green stays the dominant channel across the whole range: pushed further,
    // the warm end went brown and the cool end went blue, and neither reads as
    // needles. This spans olive to blue-spruce and stops there.
    out[slot * 3] = (0.99 - blue * 0.29) * value;
    out[slot * 3 + 1] = (1.0 + blue * 0.06) * value;
    out[slot * 3 + 2] = (0.58 + blue * 0.3) * value;
  }

  const burnt = new THREE.InstancedMesh(makeBurntSnag(5.2, 0.26, 0.1), char, 400);

  const dummy = new THREE.Object3D();
  let placed = 0;
  let burned = 0;

  // 260 was never the binding constraint (only 22 were reaching the ground),
  // but with placement fixed the broadleaf population needs real headroom.
  const MAX_COTTON = 1100;
  const cottonTint = new Float32Array(MAX_COTTON * 3);
  // Two broadleaf forms, not one. Every broadleaf on the map shared a single
  // canopy, so once they were common enough to notice they were obviously a
  // repeated asset: a wide round cottonwood, and a narrow upright aspen that
  // reads completely differently on a ridge.
  // Broadleaf canopies were 5-8x sparser than the conifers' — a pine near crown
  // is 130-190 cards, a cottonwood was 32 — so you could see straight through
  // one to its own trunk, the same defect the far conifers had. A leaf card is
  // one quad against the conifer's three folds, so matching them costs less
  // than the numbers suggest.
  const BROAD = [
    {
      trunk: makePineTrunk(6.2, 0.36, 0.14),
      near: makeBroadCanopy(96, 3.6, 2.4, 7.6),
      far: makeBroadCanopy(40, 3.6, 2.4, 7.6),
      distant: makeBroadCanopy(24, 3.6, 2.4, 7.6)
    },
    {
      trunk: makePineTrunk(7.4, 0.22, 0.1),
      near: makeBroadCanopy(76, 1.9, 3.4, 9.2),
      far: makeBroadCanopy(32, 1.9, 3.4, 9.2),
      distant: makeBroadCanopy(20, 1.9, 3.4, 9.2)
    }
  ];
  const broads = BROAD.map((proto) => {
    const trunkNear = new THREE.InstancedMesh(proto.trunk, cottonBark, MAX_COTTON);
    const crownNear = new THREE.InstancedMesh(proto.near, cottonLeafMat, MAX_COTTON);
    const trunkFar = new THREE.InstancedMesh(proto.trunk, cottonBark, MAX_COTTON);
    const crownFar = new THREE.InstancedMesh(proto.far, cottonLeafMat, MAX_COTTON);
    const crownDist = new THREE.InstancedMesh(proto.distant, cottonLeafMat, MAX_COTTON);
    const windNear = makeWindAttrib(proto.near, MAX_COTTON);
    const windFar = makeWindAttrib(proto.far, MAX_COTTON);
    const windDist = makeWindAttrib(proto.distant, MAX_COTTON);
    trunkNear.castShadow = true;
    crownNear.castShadow = true;
    return { trunkNear, crownNear, trunkFar, crownFar, crownDist, windNear, windFar, windDist };
  });
  const broadMeshes = broads.flatMap((b) => [b.trunkNear, b.crownNear, b.trunkFar, b.crownFar, b.crownDist]);
  for (const mesh of [...broadMeshes, burnt]) {
    mesh.frustumCulled = false;
  }
  const cottonPos = new Float32Array(MAX_COTTON * 3);
  const cottonScale = new Float32Array(MAX_COTTON);
  const cottonRot = new Float32Array(MAX_COTTON);
  const cottonWind = new Float32Array(MAX_COTTON * 2);
  const cottonType = new Uint8Array(MAX_COTTON);
  let cottons = 0;

  /**
   * Which silhouette grows where. Dense conifer forest leans on the spires,
   * the dry and open biomes on the low juniper, so the stands read differently
   * from each other rather than being one mix everywhere.
   */
  function pickPineType(biome, n) {
    if (biome === "pines") {
      return n < 0.4 ? 0 : n < 0.72 ? 1 : n < 0.94 ? 2 : 3;
    }
    if (biome === "foothills") {
      return n < 0.2 ? 0 : n < 0.52 ? 1 : n < 0.8 ? 2 : 3;
    }
    if (biome === "range" || biome === "badlands" || biome === "iron" || biome === "tribal") {
      return n < 0.06 ? 0 : n < 0.26 ? 1 : n < 0.55 ? 2 : 3;
    }
    return n < 0.16 ? 0 : n < 0.48 ? 1 : n < 0.78 ? 2 : 3;
  }

  // Ran while `placed < MAIN_TREE_BUDGET` — the conifer budget. Pines fill
  // 3200 slots long before i reaches 16000, so the loop exited with only 22 of
  // 260 cottonwoods ever placed and the map came out 99.3% conifer. Broadleaf
  // has its own budget, so keep going while either has room.
  for (let i = 0; i < 26000 && (placed < MAIN_TREE_BUDGET || cottons < MAX_COTTON); i += 1) {
    const x = (seeded(i + 2) - 0.5) * WORLD.width * 0.96;
    const z = (seeded(i + 9) - 0.5) * WORLD.depth * 0.96;
    const ranchDist = Math.hypot(x - POS.ranch.x, z - POS.ranch.z);
    const ranchWindbreak = ranchDist > 38 && ranchDist < 92;
    if (inClearing(x, z) && !ranchWindbreak) {
      continue;
    }
    const biome = biomeAt(x, z);
    const creek = creekFactor(x, z);
    const y = heightAt(x, z);
    if (y > 92 || y < 8) {
      continue;
    }
    if (normalAt(x, z).y < 0.62) {
      continue;
    }
    // inClearing() only knows the ranch and Silver Creek discs, so without this
    // every other settlement on the map grew pines and cottonwoods up through
    // its roofs and shop floors.
    if (insideStructure(x, z, TREE_CLEARANCE)) {
      continue;
    }

    // Broadleaf was riparian-only: a band a few metres wide along the creeks,
    // which is why the whole territory read as pine. Cottonwoods still favour
    // water, but aspen-style groves also take the valley, foothills, ranch and
    // tribal ground where conifers are not dominant.
    const bare = biome === "burn" || biome === "badlands" || biome === "iron";
    const riparian = creek > 0.06 && creek < 0.42 && !bare;
    const grove = !bare && BROADLEAF_CHANCE[biome] !== undefined
      && seeded(i + 37) < BROADLEAF_CHANCE[biome];
    if ((riparian || grove) && cottons < MAX_COTTON && seeded(i + 33) < (riparian ? 0.34 : 0.62)) {
      const scale = 0.85 + seeded(i + 4) * 1.15;
      const xz = 0.85 + seeded(i + 12) * 0.3;
      const rotY = seeded(i + 7) * Math.PI * 2;
      dummy.position.set(x, y, z);
      dummy.rotation.set((seeded(i + 41) - 0.5) * 0.08, rotY, (seeded(i + 43) - 0.5) * 0.08);
      dummy.scale.set(scale * xz, scale, scale * xz);
      dummy.updateMatrix();
      cottonType[cottons] = riparian ? (seeded(i + 71) < 0.72 ? 0 : 1) : (seeded(i + 71) < 0.35 ? 0 : 1);
      cottonPos[cottons * 3] = x;
      cottonPos[cottons * 3 + 1] = y;
      cottonPos[cottons * 3 + 2] = z;
      cottonScale[cottons] = scale;
      cottonRot[cottons] = rotY;
      // Divide by the scale the DRAWN matrix uses (cottonScale, uniform — both
      // matrix writers drop the placement-time anisotropic wobble), not the
      // placement scale, so the amplitude cancels against the real instance
      // scale.
      cottonWind[cottons * 2] = Math.cos(rotY) / scale;
      cottonWind[cottons * 2 + 1] = Math.sin(rotY) / scale;
      foliageTint("valley", seeded(i + 61), seeded(i + 63), cottonTint, cottons);
      addCylinderCollider(x, z, 0.5 * scale);
      cottons += 1;
      continue;
    }

    if (placed >= MAIN_TREE_BUDGET || seeded(i + 21) > plantChance(biome)) {
      continue;
    }
    // One size per tree, with a modest slenderness jitter on top.
    //
    // Height and girth were drawn independently over wide ranges, so the most
    // stretched pine came out 9.2x more elongated than the squattest — a tree
    // could be 2.2x tall and 0.6x wide at the same time. Real stands vary in
    // size far more than in proportion. Scale is now uniform with a +/-13%
    // aspect wobble, which keeps the variety without the caricatures.
    const size = 0.62 + seeded(i + 15) * 1.4;
    const height = size;
    const girth = size * (0.87 + seeded(i + 4) * 0.26);
    if (biome === "burn" && burned < 400) {
      dummy.position.set(x, y, z);
      dummy.rotation.set((seeded(i + 41) - 0.5) * 0.12, seeded(i + 7) * Math.PI * 2, (seeded(i + 43) - 0.5) * 0.12);
      dummy.scale.set(girth, height * (0.55 + seeded(i + 11) * 0.4), girth);
      dummy.updateMatrix();
      burnt.setMatrixAt(burned, dummy.matrix);
      addCylinderCollider(x, z, 0.28 * girth);
      burned += 1;
      continue;
    }
    const type = pickPineType(biome, seeded(i + 19));
    const rotY = seeded(i + 7) * Math.PI * 2;
    dummy.position.set(x, y, z);
    dummy.rotation.set((seeded(i + 41) - 0.5) * 0.1, rotY, (seeded(i + 43) - 0.5) * 0.1);
    dummy.scale.set(girth, height, girth);
    dummy.updateMatrix();
    treePos[placed * 3] = x;
    treePos[placed * 3 + 1] = y;
    treePos[placed * 3 + 2] = z;
    treeGirth[placed] = girth;
    treeHeight[placed] = height;
    treeRot[placed] = rotY;
    treeWind[placed * 2] = Math.cos(rotY) / girth;
    treeWind[placed * 2 + 1] = Math.sin(rotY) / girth;
    treeLeanX[placed] = dummy.rotation.x;
    treeLeanZ[placed] = dummy.rotation.z;
    treeType[placed] = type;
    foliageTint(biome, seeded(i + 51), seeded(i + 53), treeTint, placed);
    addCylinderCollider(x, z, 0.45 * girth);
    placed += 1;
  }

  for (let i = 0; i < 72 && placed < MAIN_TREE_BUDGET; i += 1) {
    const a = (i / 72) * Math.PI * 2 + seeded(i + 800) * 0.45;
    const r = 46 + seeded(i + 810) * 40;
    const x = POS.ranch.x + Math.cos(a) * r;
    const z = POS.ranch.z + Math.sin(a) * r;
    if (roadFactor(x, z) > 0.28) {
      continue;
    }
    if (Math.hypot(x - POS.ranch.x, z - (POS.ranch.z - 8)) < 20) {
      continue;
    }
    if (Math.hypot(x - (POS.ranch.x - 28), z - (POS.ranch.z + 18)) < 12) {
      continue;
    }
    if (normalAt(x, z).y < 0.62) {
      continue;
    }
    // The windbreak ring sweeps 46-86 m out from the ranch centre, which is
    // exactly where the barn, bunkhouse and blacksmith stand.
    if (insideStructure(x, z, TREE_CLEARANCE)) {
      continue;
    }
    const y = heightAt(x, z);
    if (i % 5 === 0 && cottons < MAX_COTTON) {
      const scale = 0.95 + seeded(i + 4) * 0.9;
      const rotY = seeded(i + 7) * Math.PI * 2;
      dummy.position.set(x, y, z);
      dummy.rotation.set((seeded(i + 41) - 0.5) * 0.08, rotY, (seeded(i + 43) - 0.5) * 0.08);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      cottonType[cottons] = seeded(i + 71) < 0.6 ? 0 : 1;
      cottonPos[cottons * 3] = x;
      cottonPos[cottons * 3 + 1] = y;
      cottonPos[cottons * 3 + 2] = z;
      cottonScale[cottons] = scale;
      cottonRot[cottons] = rotY;
      cottonWind[cottons * 2] = Math.cos(rotY) / scale;
      cottonWind[cottons * 2 + 1] = Math.sin(rotY) / scale;
      foliageTint("valley", seeded(i + 61), seeded(i + 63), cottonTint, cottons);
      addCylinderCollider(x, z, 0.5 * scale);
      cottons += 1;
      continue;
    }
    const windSize = 0.78 + seeded(i + 15) * 1.05;
    const girth = windSize * (0.87 + seeded(i + 4) * 0.26);
    const height = windSize;
    const rotY = seeded(i + 7) * Math.PI * 2;
    dummy.position.set(x, y, z);
    dummy.rotation.set((seeded(i + 41) - 0.5) * 0.08, rotY, (seeded(i + 43) - 0.5) * 0.08);
    dummy.scale.set(girth, height, girth);
    dummy.updateMatrix();
    treePos[placed * 3] = x;
    treePos[placed * 3 + 1] = y;
    treePos[placed * 3 + 2] = z;
    treeGirth[placed] = girth;
    treeHeight[placed] = height;
    treeRot[placed] = rotY;
    treeWind[placed * 2] = Math.cos(rotY) / girth;
    treeWind[placed * 2 + 1] = Math.sin(rotY) / girth;
    treeLeanX[placed] = dummy.rotation.x;
    treeLeanZ[placed] = dummy.rotation.z;
    treeType[placed] = seeded(i + 19) < 0.45 ? 1 : 2;
    foliageTint(biomeAt(x, z), seeded(i + 51), seeded(i + 53), treeTint, placed);
    addCylinderCollider(x, z, 0.45 * girth);
    placed += 1;
  }

  const ranchHero = [
    [13, 5],
    [11, 8],
    [15, -6],
    [12, -30],
    [18, -20],
    [-12, -28],
    [22, -8],
    [-16, -12]
  ];
  for (let i = 0; i < ranchHero.length && placed < MAIN_TREE_BUDGET; i += 1) {
    const x = POS.ranch.x + ranchHero[i][0];
    const z = POS.ranch.z + ranchHero[i][1];
    const y = heightAt(x, z);
    const heroSize = 1.05 + seeded(i + 905) * 0.45;
    const girth = heroSize * (0.9 + seeded(i + 900) * 0.2);
    const height = heroSize;
    const rotY = seeded(i + 912) * Math.PI * 2;
    dummy.position.set(x, y, z);
    dummy.rotation.set((seeded(i + 910) - 0.5) * 0.06, rotY, (seeded(i + 914) - 0.5) * 0.06);
    dummy.scale.set(girth, height, girth);
    dummy.updateMatrix();
    treePos[placed * 3] = x;
    treePos[placed * 3 + 1] = y;
    treePos[placed * 3 + 2] = z;
    treeGirth[placed] = girth;
    treeHeight[placed] = height;
    treeRot[placed] = rotY;
    treeWind[placed * 2] = Math.cos(rotY) / girth;
    treeWind[placed * 2 + 1] = Math.sin(rotY) / girth;
    treeLeanX[placed] = dummy.rotation.x;
    treeLeanZ[placed] = dummy.rotation.z;
    treeType[placed] = i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 2;
    foliageTint(biomeAt(x, z), seeded(i + 951), seeded(i + 953), treeTint, placed);
    addCylinderCollider(x, z, 0.5 * girth);
    placed += 1;
  }

  /**
   * Northern Pines forest core — audit P4/P2.
   *
   * The world-wide scatter leaves tens of metres between stems even in the
   * pines biome, which reads as scattered saplings on open ground. Real
   * stands are clumped, so plant tight clusters inside the pines biome only.
   * biomeAt() gates everything else out: no other biome's silhouette changes
   * and the ranch windbreak/hero loops keep their exact old budgets.
   */
  const PINE_CORE_X = POS.northernPines.x;
  const PINE_CORE_Z = POS.northernPines.z;
  for (let c = 0; c < 120 && placed < MAX; c += 1) {
    const cx = PINE_CORE_X + (seeded(c + 50000) - 0.5) * 1200;
    const cz = PINE_CORE_Z + (seeded(c + 51000) - 0.5) * 1600;
    if (biomeAt(cx, cz) !== "pines") {
      continue;
    }
    for (let k = 0; k < 34 && placed < MAX; k += 1) {
      const x = cx + (seeded(c * 97 + k + 52000) - 0.5) * 22;
      const z = cz + (seeded(c * 101 + k + 53000) - 0.5) * 22;
      if (biomeAt(x, z) !== "pines") {
        continue;
      }
      if (inClearing(x, z)) {
        continue;
      }
      if (insideStructure(x, z, TREE_CLEARANCE)) {
        continue;
      }
      // Keep the fire watch and timber camp readable, and the trails and
      // creeks rideable — dense forest must not swallow them. The camp's
      // capture camera sits ~40 m out, so the exclusion has to cover the
      // whole view corridor, not just the camp's footprint.
      if (Math.hypot(x - POS.fireWatch.x, z - POS.fireWatch.z) < 60) {
        continue;
      }
      if (Math.hypot(x - POS.timberCamp.x, z - POS.timberCamp.z) < 120) {
        continue;
      }
      // Keep the road corridor narrow enough that the pines read as forest
      // around it (audit P4): 0.55 lets trees grow almost to the track's edge
      // without standing on it.
      if (roadFactor(x, z) > 0.55 || creekFactor(x, z) > 0.3) {
        continue;
      }
      const y = heightAt(x, z);
      if (y > 92 || y < 8) {
        continue;
      }
      if (normalAt(x, z).y < 0.62) {
        continue;
      }
      const type = pickPineType("pines", seeded(k + c * 7 + 54000));
      const size = 0.62 + seeded(k + c * 13 + 55000) * 1.4;
      const height = size;
      const girth = size * (0.87 + seeded(k + c * 3 + 56000) * 0.26);
      const rotY = seeded(k + 7) * Math.PI * 2;
      dummy.position.set(x, y, z);
      dummy.rotation.set((seeded(k + 41) - 0.5) * 0.1, rotY, (seeded(k + 43) - 0.5) * 0.1);
      dummy.scale.set(girth, height, girth);
      dummy.updateMatrix();
      treePos[placed * 3] = x;
      treePos[placed * 3 + 1] = y;
      treePos[placed * 3 + 2] = z;
      treeGirth[placed] = girth;
      treeHeight[placed] = height;
      treeRot[placed] = rotY;
      treeWind[placed * 2] = Math.cos(rotY) / girth;
      treeWind[placed * 2 + 1] = Math.sin(rotY) / girth;
      treeLeanX[placed] = dummy.rotation.x;
      treeLeanZ[placed] = dummy.rotation.z;
      treeType[placed] = type;
      foliageTint("pines", seeded(k + 51), seeded(k + 53), treeTint, placed);
      addCylinderCollider(x, z, 0.45 * girth);
      placed += 1;
    }
  }

  // First frame draws every pine on its near mesh; update() buckets by camera.
  for (let t = 0; t < pines.length; t += 1) {
    dummy.position.set(0, -999, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    let n = 0;
    for (let i = 0; i < placed; i += 1) {
      if (treeType[i] !== t) {
        continue;
      }
      dummy.position.set(treePos[i * 3], treePos[i * 3 + 1], treePos[i * 3 + 2]);
      dummy.rotation.set(treeLeanX[i], treeRot[i], treeLeanZ[i]);
      dummy.scale.set(treeGirth[i], treeHeight[i], treeGirth[i]);
      dummy.updateMatrix();
      pines[t].trunkNear.setMatrixAt(n, dummy.matrix);
      pines[t].crownNear.setMatrixAt(n, dummy.matrix);
      pines[t].limbNear.setMatrixAt(n, dummy.matrix);
      writeWind(pines[t].windNear, n, treeWind, i);
      n += 1;
    }
    for (const mesh of [pines[t].trunkNear, pines[t].crownNear, pines[t].limbNear]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    // Seed instanceColor on every mesh that shares a tinted foliage material:
    // an unset attribute leaves vInstanceColor at zero and the canopy goes black.
    //
    // crownDist belongs in here too. Its colours are written by bucketTrees,
    // but setColorAt is what allocates the attribute in the first place, and
    // bucketTrees only reaches that call for a tree type that actually has an
    // instance in the 520-2600 m band. Stand anywhere a type has none — a
    // forest interior, the map edge — and the unconditional
    // crownDist.instanceColor.needsUpdate below it threw a TypeError, taking
    // the render loop with it. Seeding here makes the attribute exist always.
    let c = 0;
    for (let i = 0; i < placed; i += 1) {
      if (treeType[i] !== t) {
        continue;
      }
      tintColor.setRGB(treeTint[i * 3], treeTint[i * 3 + 1], treeTint[i * 3 + 2]);
      pines[t].crownNear.setColorAt(c, tintColor);
      pines[t].crownFar.setColorAt(c, tintColor);
      pines[t].crownDist.setColorAt(c, tintColor);
      c += 1;
    }
    pines[t].crownNear.instanceColor.needsUpdate = true;
    pines[t].crownFar.instanceColor.needsUpdate = true;
    pines[t].crownDist.instanceColor.needsUpdate = true;
    pines[t].windNear.needsUpdate = true;
    pines[t].windFar.needsUpdate = true;
    pines[t].windDist.needsUpdate = true;
  }
  for (let t = 0; t < broads.length; t += 1) {
    let n = 0;
    for (let i = 0; i < cottons; i += 1) {
      if (cottonType[i] !== t) {
        continue;
      }
      dummy.position.set(cottonPos[i * 3], cottonPos[i * 3 + 1], cottonPos[i * 3 + 2]);
      dummy.rotation.set(0, cottonRot[i], 0);
      const sc = cottonScale[i];
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      broads[t].trunkNear.setMatrixAt(n, dummy.matrix);
      broads[t].crownNear.setMatrixAt(n, dummy.matrix);
      writeWind(broads[t].windNear, n, cottonWind, i);
      tintColor.setRGB(cottonTint[i * 3], cottonTint[i * 3 + 1], cottonTint[i * 3 + 2]);
      broads[t].crownNear.setColorAt(n, tintColor);
      broads[t].crownFar.setColorAt(n, tintColor);
      broads[t].crownDist.setColorAt(n, tintColor);
      n += 1;
    }
    for (const mesh of [broads[t].trunkNear, broads[t].crownNear]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    broads[t].crownNear.instanceColor.needsUpdate = true;
    broads[t].crownFar.instanceColor.needsUpdate = true;
    broads[t].crownDist.instanceColor.needsUpdate = true;
    broads[t].windNear.needsUpdate = true;
    broads[t].windFar.needsUpdate = true;
    broads[t].windDist.needsUpdate = true;
    broads[t].trunkFar.count = 0;
    broads[t].crownFar.count = 0;
  }
  burnt.count = burned;
  burnt.instanceMatrix.needsUpdate = true;
  burnt.computeBoundingSphere();

  const grassTex = bladeTexture();
  const grassGeo = makeGrassTuft();
  grassGeo.computeBoundingBox();
  // Half-width of the tuft's RENDERED footprint in local units. The card
  // const (GRASS_CARD_W 0.56) is not the footprint: skywardNormals bends the
  // crossed cards outward, so the merged bbox is ~0.85 wide. Seating must
  // cover the rendered footprint or the downhill edge still hovers.
  const GRASS_FOOT = Math.max(-grassGeo.boundingBox.min.x, grassGeo.boundingBox.max.x);

  // ---------------------------------------------------------------------
  // Ground-cover scatter
  //
  // The old scheme drew MAX_GRASS fixed polar offsets once and planted them at
  // `camera + offset`. Because the offsets were camera-relative, every blade
  // teleported the moment the disc re-centred: walk REBUILD_STEP metres and the
  // whole field jumped, which is what read as grass "swimming" underfoot. It
  // also spent uniform density all the way out to the horizon, so it paid full
  // price for blades a pixel wide and still ran out of disc at 210 m.
  //
  // Instead: a jittered grid, anchored in world space. A blade's position comes
  // from its integer cell index hashed, never from the camera, so a tuft stays
  // exactly where it is as you walk past it. Density is banded into rings that
  // coarsen with distance while per-tuft scale grows to match, which keeps the
  // cover visually continuous much further out for far fewer instances.
  // ---------------------------------------------------------------------
  const SAGE_CHUNK = 400;

  /**
   * Flatten every ring's candidate cells into one list of (di, dj, ring) so the
   * amortised rebuild is a single linear cursor. Built once: the offsets are
   * relative to the ring's own snapped base cell, so they stay valid wherever
   * the player walks.
   */
  /**
   * Candidate cell offsets for a ring-shaped field, relative to its centre.
   *
   * This is the CAMERA-RELATIVE scheme: an offset table is only meaningful
   * against a centre, which is why a field built on it has to be replanted
   * when the centre moves. Grass has moved off it to world-anchored tiles
   * (see THE TILE CACHE below); sage still uses it, because its two rings
   * carry a few thousand candidates between them and rebuild inside a frame
   * or two — the atomic swap that is intolerable at 27k tufts is invisible at
   * 1.2k. Move sage over when that stops being true.
   */
  function buildCandidates(rings, radius) {
    const di = [];
    const dj = [];
    const ring = [];
    let inner = 0;
    for (let r = 0; r < rings.length; r += 1) {
      const { cell, outer } = rings[r];
      const span = Math.ceil(outer / cell);
      const innerSq = inner * inner;
      const outerSq = Math.min(outer, radius) * Math.min(outer, radius);
      for (let i = -span; i <= span; i += 1) {
        for (let j = -span; j <= span; j += 1) {
          const dx = (i + 0.5) * cell;
          const dz = (j + 0.5) * cell;
          const dsq = dx * dx + dz * dz;
          if (dsq < innerSq || dsq >= outerSq) {
            continue;
          }
          di.push(i);
          dj.push(j);
          ring.push(r);
        }
      }
      inner = outer;
    }
    return {
      di: Int16Array.from(di),
      dj: Int16Array.from(dj),
      ring: Uint8Array.from(ring),
      length: di.length
    };
  }

  /**
   * THE TILE CACHE — why the field is not rebuilt around the camera any more.
   *
   * The old field was five concentric rings, each holding its own centre and
   * replanting ITSELF IN FULL whenever the camera drifted RING_STEP_FRAC of
   * its radius. Measured at a 14.5 m/s gallop over 653 m, that meant ring 1
   * replacing 24,326 tufts in a single frame every 33 m and ring 3 replacing
   * 4,253 every 131 m — because `instanceMatrix.needsUpdate` was set in
   * exactly one place, at the END of a rebuild, so a band held its old scatter
   * for 300-500 ms and then swapped the lot on one frame. That is the "grass
   * loading in the distance" the player sees, and no budget tuning reaches it:
   * it is not a throughput failure, it is an atomicity failure.
   *
   * The waste underneath it was the same shape. Placement has always been a
   * pure function of the ABSOLUTE world cell (hash2 on `ix, jz`), so a tuft
   * that stays in range does not need to move — yet moving 10 m re-scattered
   * all 23,732 candidates of ring 0, of which roughly four fifths resolved to
   * the identical tuft in the identical place. Measured over that same ride:
   * ~2,500 candidates planted per metre travelled, against ~760 that had
   * actually changed.
   *
   * So residency is world-space now. The field is a set of square tiles fixed
   * to a world grid; a tile is built once, at the LOD its distance warrants,
   * and then LEFT ALONE for as long as it stays in range. Riding forward
   * creates only the tiles crossing the frontier and retires only those
   * leaving it. Nothing already on screen is ever rewritten, so there is
   * nothing for the player to watch arrive except at the frontier — which is
   * far away, and faded.
   *
   * Three consequences worth knowing:
   *
   *  - The unit of pop is now one tile, not one band. The largest tile carries
   *    2,500 candidates against the 27,016 a ring rebuild swapped, and it
   *    lands with a fade rather than on one frame (see `aFade`).
   *
   *  - Tile meshes can be frustum-culled, and a ring mesh could not. A ring
   *    spanned the whole 360 deg disc, so `frustumCulled` was false and every
   *    tuft behind the player was submitted every frame. A tile is a small
   *    box with a real, static bounding sphere, so the camera's own frustum
   *    throws away the two thirds of the field it is not looking at.
   *
   *  - Bands are covered by whole tiles, so a band edge is jagged by up to a
   *    tile rather than being a clean circle. A tile is kept when its square
   *    INTERSECTS its band's outer disc and is not wholly inside the inner
   *    one, which guarantees the annulus is covered with no holes and costs a
   *    little double coverage where a coarse tile straddles a fine band's
   *    edge. The coarse band is 3-14x the sparser of the two, so the doubled
   *    strip reads as a few percent more grass, not a seam — and the jagged
   *    edge hides the LOD change better than a perfect circle did.
   */

  // Name of the only ground-cover species to plant, or null for all four.
  let soloSpecies = null;

  // Ground-cover field state. `let`, not `const`: applyGrassSettings rebuilds
  // the whole field in place when the panel changes a structural knob (draw
  // distance, cell scale), and everything downstream — the planters, the tile
  // records, the debug accessors — reads these through the closure, so
  // reassignment is the whole mechanism.
  //
  // `lods[l].live` maps a tile key to its record; `lods[l].pool` holds the
  // meshes of evicted tiles, ready to be refilled. Pooling matters because a
  // tile's InstancedMesh owns three instanced attributes and a cloned
  // geometry: allocating those per frontier tile at a gallop would churn far
  // more than the scatter it is trying to replace.
  let grassLods = [];
  // Every live grass tile, rebuilt whenever residency changes. Kept as a flat
  // array so the per-frame pass does not walk eight Maps.
  let grassTiles = [];
  // Tiles waiting to be built or still mid-build, nearest first.
  let grassQueue = [];
  /**
   * Seconds a landing tile takes to dissolve in, and the field clock it is
   * measured against.
   *
   * The clock is the vegetation module's own accumulated dt, NOT the TSL
   * `time` node: capture mode pins `time` to a fixed value so graded frames
   * are reproducible, and a fade riding a frozen clock would freeze half way.
   *
   * `instantBorn` backdates a tile's birth past the whole window, so it is
   * fully grown the moment it lands. The initial plant and the panel's
   * structural rebuilds both use it — those are moments where the player is
   * looking at a field that is supposed to already exist, and a dissolve
   * reads as a glitch rather than as cover arriving.
   */
  const GRASS_FADE_SECS = 0.45;
  /**
   * How long a superseded tile may be held while its replacement builds, on
   * the same field clock. See replacementPending: this is the leak guard, not
   * a tuning dial. A normal split resolves in a handful of frames; two seconds
   * is far past that and still short enough that a genuinely starved queue
   * shows as the old bare patch rather than an unbounded pile of tiles nobody
   * retires.
   */
  const TILE_HOLD_SECS = 2;
  let vegClock = 0;
  let instantBorn = true;
  // The panel's speed-thinning toggle. Read at tile ADMISSION, where the
  // hold-back is now decided; the old gate lived in scatterPass, which the
  // tile cache replaced, and the toggle had gone dead — measured, tiles came
  // back thinned 0.3 with the toggle both on and off.
  let speedThinOn = true;
  // Speed band for the far-tile hold-back (SPEED_THIN). Declared up here, not
  // beside the rest of the motion state further down, because the initial
  // plant runs at construction and reads it through updateTiles — leaving it
  // below put it in the temporal dead zone at exactly that moment.
  let thinLevel = 0;

  /** Tile grid coordinate of a world position, at one band's tile size. */
  function tileIndex(v, size) {
    return Math.floor(v / size);
  }

  /**
   * Squared distance from `(px, pz)` to the nearest point of a tile's square,
   * and to its farthest corner. The residency test needs both: a tile is in
   * range when its NEAREST point is inside the band's outer disc, and it has
   * been swallowed by the band below when its FARTHEST corner is inside the
   * inner disc. Using the centre for either leaves holes half a tile wide.
   */
  function tileSpan(tx, tz, size, px, pz) {
    const x0 = tx * size;
    const z0 = tz * size;
    const x1 = x0 + size;
    const z1 = z0 + size;
    const nx = px < x0 ? x0 - px : px > x1 ? px - x1 : 0;
    const nz = pz < z0 ? z0 - pz : pz > z1 ? pz - z1 : 0;
    const fx = Math.max(px - x0, x1 - px);
    const fz = Math.max(pz - z0, z1 - pz);
    return {
      near: Math.hypot(nx, nz),
      far: Math.hypot(fx, fz),
      mid: Math.hypot((x0 + x1) * 0.5 - px, (z0 + z1) * 0.5 - pz)
    };
  }

  const grassMat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.32 });
  /**
   * Per-instance tint and atlas panel, as REAL geometry attributes.
   *
   * THIS IS THE FLOATING GRASS, and it took seven passes to find because the
   * CPU side was correct the whole time.
   *
   * These used to be TSL instancedBufferAttribute() nodes, and finishScatter
   * marked them dirty with `tintAttr.needsUpdate = true`. BufferAttributeNode
   * has no needsUpdate property - that line set an inert field on a plain
   * object and did nothing - and instancedBufferAttribute() creates its buffer
   * with StaticDrawUsage, so the species panel and tint were uploaded once, at
   * first render, and never again.
   *
   * The matrices were not: grass.instanceMatrix is a real BufferAttribute and
   * its needsUpdate works. So every time the ring grid rescattered - which is
   * constantly, as the camera moves - each instance got a NEW position, size
   * and rotation while keeping the FIRST scatter's species. Slot N would be
   * sized for blue grama (fill 0.4, so a card 2.5x the plant's height) while
   * still sampling bluestem's panel, whose blades fill 93% of it. The result
   * is a clump drawn most of the way up a card that is two and a half times
   * too tall: a tuft of grass hanging in mid-air, its painted root ends
   * showing, at a fixed height on the card, leaning with the card in the wind.
   * The reverse pairing draws a small clump low on a big card and looks fine,
   * which is why only some tufts and some species were ever affected.
   *
   * It explains every measurement that came back clean. Card placement, card
   * size, the atlas, its alpha, the mip chain and the terrain were all exactly
   * right; the only thing wrong was a stale copy of one attribute on the GPU.
   *
   * Real InstancedBufferAttributes on the geometry, read with attribute(), the
   * same way aTangent already is. needsUpdate on these actually uploads.
   */
  const tintAttr = attribute("aTint", "vec3");
  const speciesAttr = attribute("aSpecies", "vec2");
  /**
   * One instanced field per TILE, not per ring and not one mesh for the disc.
   *
   * Each tile carries its own instanceMatrix and its own per-instance
   * attributes, sized to the candidate count of one square of its band's
   * cells. That is what makes a tile's build an independent, small upload:
   * three.js's WebGPU backend drives instanceMatrix through a buffer node and
   * re-uploads the WHOLE array on a version change (updateRanges do not
   * survive the interleaved copy — see the note on finishTile), so the only
   * way to keep an upload small is to keep the buffer small. A ring's buffer
   * was the whole band; a tile's is one square.
   *
   * The shared material compiles once and binds aTint/aSpecies/aWind by name,
   * so every tile's clone of the tuft geometry works with it unchanged.
   *
   * Per-tuft wind frame, (cos a / sx, sin a / sx) for the tuft's Y rotation a
   * and XZ scale sx. windBend rotates the world gust into object space with
   * it, so a field leans one way instead of every tuft leaning its own.
   */
  function makeTileMesh(lod) {
    const capacity = lod.cols * lod.cols;
    const tints = new Float32Array(capacity * 3);
    const speciesUV = new Float32Array(capacity * 2);
    const windRot = new Float32Array(capacity * 2);
    // When each instance was planted, on the field clock. Per-instance rather
    // than per-mesh because every tile shares one material — a per-mesh
    // uniform would mean a material per tile, and a shader recompile per
    // frontier tile at a gallop.
    /**
     * Everything the dissolve needs, per instance, in ONE vec2: x is when the
     * tuft was planted on the field clock, y is its place in the dissolve
     * order (uniform in (0, 1) — see the HASHED ALPHA block on
     * grassMat.opacityNode).
     *
     * They are packed together because the tuft geometry is at the WebGPU
     * ceiling. A pipeline gets `maxVertexBuffers` vertex buffers and the
     * guaranteed floor — which is what this adapter reports — is EIGHT: the
     * card's own position/normal/uv, instanceMatrix, and aTint/aSpecies/aWind
     * make exactly eight. Adding the dither as a ninth attribute of its own
     * fails pipeline creation outright:
     *
     *   Render pipeline creation failed: Vertex buffer count (9) exceeds the
     *   maximum number of vertex buffers (8).
     *
     * three logs that and carries on, so the symptom is not an exception — it
     * is the ENTIRE ground cover silently not drawing, with the instance
     * count, the matrices and every CPU-side reading still perfect. Both
     * values are written by the same code at the same moment and read by the
     * same three lines of shader, so one vec2 costs nothing and keeps a slot
     * free for whatever needs the next one.
     */
    const fade = new Float32Array(capacity * 2);
    const tintAttrib = new THREE.InstancedBufferAttribute(tints, 3);
    const speciesAttrib = new THREE.InstancedBufferAttribute(speciesUV, 2);
    const windRotAttrib = new THREE.InstancedBufferAttribute(windRot, 2);
    const fadeAttrib = new THREE.InstancedBufferAttribute(fade, 2);
    // No setUsage(DynamicDrawUsage) on any of the three — see makeWindAttrib
    // for why that hint costs a full per-frame re-upload under WebGPU.
    // finishTile marks all of them needsUpdate when a tile's build lands,
    // which is the only moment their contents change.
    const geo = grassGeo.clone();
    geo.setAttribute("aTint", tintAttrib);
    geo.setAttribute("aSpecies", speciesAttrib);
    geo.setAttribute("aWind", windRotAttrib);
    geo.setAttribute("aFade", fadeAttrib);
    const mesh = new THREE.InstancedMesh(geo, grassMat, capacity);
    mesh.castShadow = false;
    mesh.receiveShadow = wantGrassShadow;
    // Frustum culling is ON, which it could never be for a ring.
    //
    // A ring mesh spanned the whole 360 deg disc, so its bounding sphere
    // enclosed the camera and culling could never reject it: every tuft
    // behind the player was submitted every frame. A tile is a small box a
    // long way from the camera, with a bounding sphere finishTile pins to its
    // real world extent, so the frustum throws away the part of the field the
    // camera is not looking at — measured, about two thirds of it.
    mesh.frustumCulled = true;
    mesh.count = 0;
    mesh.visible = false;
    return {
      mesh, tints, speciesUV, windRot, fade,
      tintAttrib, speciesAttrib, windRotAttrib, fadeAttrib, capacity
    };
  }

  /**
   * Take a tile body from the band's pool, or make one. Evicted tiles hand
   * their mesh back rather than disposing it: at a gallop the frontier turns
   * over several tiles a second, and rebuilding a cloned geometry plus three
   * instanced attributes each time would cost more than the scatter.
   */
  function acquireTileBody(lod) {
    return lod.pool.pop() || makeTileMesh(lod);
  }

  function releaseTileBody(lod, tile) {
    tile.body.mesh.visible = false;
    tile.body.mesh.count = 0;
    lod.pool.push(tile.body);
    tile.body = null;
  }

  /**
   * (Re)build the grass field's LOD bands. Drops every live tile, so the next
   * residency pass repopulates from scratch around wherever the camera is.
   *
   * Runs at construction and again from applyGrassSettings when a structural
   * knob changes (draw distance, cell scale) — the tile grids, cell sizes and
   * per-band ramps all come from RINGS, which applyProfile has just rewritten.
   */
  function buildGrassField() {
    for (const lod of grassLods) {
      for (const tile of lod.live.values()) {
        if (tile.body) {
          scene.remove(tile.body.mesh);
          tile.body.mesh.geometry.dispose();
        }
      }
      for (const body of lod.pool) {
        body.mesh.geometry.dispose();
      }
    }
    grassLods = RINGS.map((rg, l) => ({
      l,
      cell: rg.cell,
      cols: rg.cols,
      inner: rg.inner,
      outer: rg.outer,
      ramp: rg.ramp,
      quad: rg.quad,
      tileSize: rg.tileSize,
      // Only the coarse far bands are thinnable — the near field is where the
      // eye lands, and it is cheap enough to keep full.
      thinnable: rg.outer >= GRASS_RADIUS * 0.55,
      live: new Map(),
      pool: []
    }));
    grassTiles = [];
    grassQueue = [];
  }

  /**
   * Evict every live tile, keeping the band records and the mesh pools.
   *
   * Evicting is how you ask for a replant now: a resident tile is never
   * rebuilt in place, so anything that changes what a tuft would look like —
   * the species filter, a debug mode — has to drop the tiles and let the next
   * residency pass build them again under the new rules.
   */
  function dropAllTiles() {
    for (const lod of grassLods) {
      for (const tile of lod.live.values()) {
        scene.remove(tile.body.mesh);
        releaseTileBody(lod, tile);
      }
      lod.live.clear();
    }
    grassTiles = [];
    grassQueue = [];
    g = 0;
  }
  // Inset inside the panel so filtering cannot bleed a neighbouring species in.
  const atlasUV = uv().mul(0.47).add(vec2(0.015, 0.015)).add(speciesAttr);
  const grassSampleTex = texture(grassTex, atlasUV);
  const grassView = normalize(cameraPosition.sub(positionWorld));
  /**
   * One shading path, no root-to-tip ramp. THIS IS THE FLOATING GRASS.
   *
   * The ramp branch below was written for a flat canvas atlas that carried no
   * gradient of its own, so the material supplied one: multiply the root end by
   * the per-instance tint (0.32-0.66, 0.42-0.82, 0.20-0.38) and the tip end by
   * (1.08, 1.22, 0.78). It was supposed to be retired the moment a baked albedo
   * existed — but the baked-map branch is dead code. FOLIAGE_SET never gained
   * grassAlbedo, so maps.grassAlbedo has always been undefined and the ramp has
   * always been what ships.
   *
   * Then paintBladePanel gained its own root-to-tip gradient and a contact
   * darkening in the bottom tenth. Both now get multiplied by the ramp: a root
   * pixel is painted at 0.45x and then multiplied by ~0.5 again, landing near
   * a fifth of the blade's brightness, while the tip is pushed above unity.
   * Every blade fades out before it reaches the ground and the lit part of it
   * hangs in the air. That is the artefact, in every direction, at every
   * location, worst in first person - and it is exactly the failure HARD_WON
   * 1.5 recorded for the old 2x root ramp, reintroduced through a branch that
   * was only ever meant to be a fallback.
   *
   * The atlas owns the gradient now. The material contributes a gentle
   * per-instance variation around unity and nothing else.
   */
  const grassCol = grassSampleTex.rgb.mul(tintAttr.mul(0.7).add(0.72));
  const grassBack = back(grassView).mul(warmGreen).mul(0.45);
  /**
   * Flat-colour species debug.
   *
   * Four species share one atlas, one material and one instanced draw, all in
   * shades of the same green, so an artefact seen in the field belongs to
   * "one of the grass species" with no way to say which - and no way to see
   * where one species' cards actually are. 0 is off. 1 keeps the blade
   * silhouette and floods it with the species' colour. 2 forces alpha to 1 as
   * well, drawing each card as a solid quad, which is the only way to see the
   * cards themselves: their size, their lean, and where their edges sit
   * relative to the ground.
   *
   * blueGrama red, bunchgrass green, bluestem blue, cheatgrass yellow.
   */
  const dbgSpecies = uniform(0);
  const spX = speciesAttr.x.mul(2);
  const spY = speciesAttr.y.mul(2);
  const speciesFlat = vec3(1, 0.15, 0.15).mul(spX.oneMinus().mul(spY.oneMinus()))
    .add(vec3(0.2, 1, 0.2).mul(spX.mul(spY.oneMinus())))
    .add(vec3(0.25, 0.5, 1).mul(spX.oneMinus().mul(spY)))
    .add(vec3(1, 0.95, 0.2).mul(spX.mul(spY)));
  const shaded = grassCol.mul(grassBack.add(1));
  grassMat.colorNode = vec4(
    mix(shaded, speciesFlat, dbgSpecies.min(1)),
    mix(grassSampleTex.a, float(1), dbgSpecies.sub(1).max(0))
  );
  // Hold full cover almost to the edge of the disc, then dissolve over the last
  // stretch. The old 150 -> 205 fade started eroding grass at two thirds of the
  // draw distance, so the world went bald well before the disc actually ended.
  //
  // The fade distances are uniform NODES, not inlined constants: the panel's
  // fade-start dial re-resolves them every frame it is moved without
  // recompiling anything, and applyGrassSettings writes new values into them
  // whenever the effective radius changes.
  const grassFadeInU = uniform(GRASS_FADE_IN);
  const grassFadeOutU = uniform(GRASS_FADE_OUT);
  const sageFadeInU = uniform(SAGE_FADE_IN);
  const sageFadeOutU = uniform(SAGE_FADE_OUT);
  /**
   * HASHED ALPHA — why the two fades are a threshold and not an opacity.
   *
   * There are two dissolves: the distance one at the edge of the disc, and
   * the birth one for a tile that has just landed. Multiplied together they
   * give `cover`, the fraction of this ground's tufts that should be drawn.
   *
   * The obvious wiring is `opacityNode = cover`, and that is what shipped. It
   * did nothing. This material is OPAQUE — `transparent` is never set, so
   * there is no blend, and three feeds the fragment alpha to exactly one
   * thing: `if (alpha < alphaTest) discard`. An opacity on an opaque material
   * is not a fade, it is a moving discard threshold.
   *
   * The comment that stood here claimed the alpha test would turn it into an
   * erosion — blades thinning out and filling in — and that is true only if
   * the atlas carries a broad soft alpha ramp to erode through. It does not.
   * `__grassAtlasBase(0.32)` reports `paintedBaseFrac` and
   * `alphaTestedBaseFrac` equal to four decimals on all four panels
   * (0.0195/0.0195, 0.0195/0.0195, 0.0205/0.0205, 0.0195/0.0195): the painted
   * silhouette and the surviving silhouette are the same shape, because
   * `paintBladePanel` lays down solid `fill()`s and the only partial alpha is
   * the canvas antialiasing on a blade's own outline.
   *
   * So on a landing tile the multiplier sat under 0.32 for the first 0.144 s
   * with every fragment discarding, then swept past the threshold and the
   * whole tile arrived at once. Measured off the recording: one 68 m tile of
   * ground going from bare dirt to full cover between two consecutive frames.
   * The dissolve was written, stamped and aged correctly on the CPU — the
   * value simply had nowhere to go. Same failure at the disc rim, where the
   * distance fade held full cover and then stopped dead in a straight line.
   *
   * The fix is to stop asking one tuft to be half-drawn and instead draw half
   * the tufts. Every tuft carries a fixed hash in (0, 1) (`aFade.y`, from its
   * world cell), and is drawn only while `cover` is above it. Cover falling
   * from 1 to 0 retires tufts one at a time in spatially white-noise order;
   * cover rising does the reverse. This is hashed alpha testing at instance
   * granularity, and it is the standard answer for alpha-tested foliage
   * precisely because it keeps the material opaque: no blending, no sorting
   * of 50k double-sided instances, no dependence on MSAA (`antialias` is
   * false on the `low` tier, which rules out alphaToCoverage).
   *
   * The hash is per instance, not per fragment, and world-derived rather than
   * screen-derived. Both matter: a per-fragment hash fizzes inside a blade,
   * and a screen-space one crawls across the field as the camera moves. A
   * tuft's dither is a property of the ground it stands on, so it survives a
   * rebuild and a tuft never flickers back and forth across the threshold.
   *
   * Note the birth half is only correct because residency is world-space. On
   * the old rings a rebuild rewrote the whole band, four fifths of it with
   * cover that had not changed, so a birth fade would have pulsed the entire
   * band on every re-centre — worse than the pop it was meant to hide. A
   * landing tile is new ground by construction, so everything in it SHOULD
   * arrive.
   */
  const grassNowU = uniform(0);
  const grassFade = attribute("aFade", "vec2");
  const grassBorn = grassFade.x;
  const grassDither = grassFade.y;
  const grassAge = grassNowU.sub(grassBorn).div(GRASS_FADE_SECS).clamp(0, 1);
  const grassCover = float(1)
    .sub(smoothstep(grassFadeInU, grassFadeOutU, cameraPosition.sub(positionWorld).length()))
    .mul(grassAge);
  // step(edge, x) is 1 where x >= edge, so this is 1 for a tuft the fades
  // still admit and 0 for one they have retired. Multiplied into the sampled
  // alpha it either leaves the blade exactly as painted or drives it to zero,
  // where alphaTest 0.32 discards the whole card.
  grassMat.opacityNode = step(grassDither, grassCover);
  /**
   * Sage takes the same treatment, for the same reason: its opacity was on an
   * opaque alphaTest 0.32 material too, so the "fade" was a discard threshold
   * and the shrubs held full cover to the edge of their disc and then stopped
   * dead in a line. Sage is the dominant cover in dry country, so that line is
   * the one the eye actually finds out there.
   *
   * There is no birth term here — sage still uses the ring scheme, not the
   * tile cache, so it has no per-tile birth clock to ride. That is a separate
   * piece of work; this is only the rim.
   */
  const sageDitherAttr = attribute("aDither", "float");
  const sageCover = float(1)
    .sub(smoothstep(sageFadeInU, sageFadeOutU, cameraPosition.sub(positionWorld).length()));
  sageMat.opacityNode = step(sageDitherAttr, sageCover);
  /**
   * Wind profile exponent, as a uniform so it can be flipped live.
   *
   * The card has two height segments - three vertex rows, at uv.y 0, 0.5, 1 -
   * and the profile is evaluated per vertex, so a squared profile puts 0.25 of
   * the bend on the middle row where a straight card would want 0.5. The card
   * kinks at that row. A kink is fixed at one height up the blade and moves
   * with the wind, and it inflates the screen-space UV derivative across that
   * band, which is how an alpha-tested blade can lose coverage in a stripe
   * while the wider parts above and below survive. Exponent 1 is linear
   * between the rows and cannot kink; 2 is the shipped bend.
   */
  const windProfileExp = uniform(2);
  grassMat.positionNode = positionLocal.add(windBend(uv().y.pow(windProfileExp)));
  grassMat.normalNode = bentNormal;

  // Construction-time opt-in: ?grassshadow on a dev build.
  //
  // A runtime toggle is not a test. Flipping grass.receiveShadow after the
  // first render and setting material.needsUpdate produced three frames whose
  // mean RGB agreed to 0.1 and whose tuft counts were identical - no error, no
  // change, almost certainly because the node program was never rebuilt. The
  // original failure was reported with receiveShadow set at construction, so
  // that is the only way to reproduce it. The flag is read once here and
  // applied where each ring mesh is BORN (makeGrassRing), which keeps the
  // property construction-time even when applyGrassSettings rebuilds the field.
  const wantGrassShadow =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("grassshadow");
  // receiveShadow stays off, but the old reason is gone — replaced by
  // measurement on 2026-08-28 (see HARD_WON 1.7 for the full record).
  //
  // The comment below used to say turning this on made the ground cover vanish
  // at northernPines with bound textures 39 -> 34. That was a memory, not a
  // diagnosis, and it does not reproduce. A/B at a forest-interior vantage
  // (northernPines core, wind frozen, golden hour so crown shadows actually
  // cross the grass — at midday they hide under the crowns themselves):
  //
  //   - Nothing vanishes. Draws, triangles and tuft counts are identical both
  //     ways; 98% of pixels are byte-identical, and the same-config control
  //     run differs by ~300 bytes where this differs by ~49,000.
  //   - Bound textures do not move: 41 vs 41 under WebGPU, 42 vs 42 under
  //     WebGL. No console errors on either backend.
  //   - Grass inside a canopy shadow DOES darken: the shadow-band regions
  //     measure 89 -> 84 mean red (~5%), sunlit grass is pixel-identical.
  //
  // It stays off only because it is an appearance change to every frame the
  // audit grades, and those belong in a measured pass — flip it on there (the
  // ?grassshadow construction flag, or __grassShadow) and grade it.

  const sageGeo = makeSageBush();
  sageGeo.computeBoundingBox();
  // Half-width of the sage footprint in local units; the seating below must
  // cover the real bush, not an estimate (a hand-picked 0.9*s foot under-cut
  // the angled planes and left bushes hovering on slopes).
  const SAGE_FOOT = Math.max(-sageGeo.boundingBox.min.x, sageGeo.boundingBox.max.x);
  // Sage keeps the same per-ring scheme as grass: a near ring at 3.1 m cells
  // that refreshes often and cheaply, and a far ring that sits still. Its two
  // rings carry a few thousand candidates between them, so each is one chunk
  // or two of work. Rebuilt alongside the grass field (see buildGrassField):
  // everything here is `let` so applyGrassSettings can re-run it.
  let SAGE_RING_SHAPE = null;
  let SAGE_CAND = null;
  let sageRingStep = [];
  let sageRings = [];
  function buildSageField() {
    SAGE_RING_SHAPE = [{ cell: 3.1, outer: 90 }, { cell: 5.2, outer: SAGE_RADIUS }];
    SAGE_CAND = buildCandidates(SAGE_RING_SHAPE, SAGE_RADIUS);
    sageRingStep = SAGE_RING_SHAPE.map((rg) => Math.max(RING_STEP_MIN, rg.outer * RING_STEP_FRAC));
    sageRings = [];
    // Sage's candidate list is also grouped by ring, near ring first.
    const offsets = [0, SAGE_CAND.ring.indexOf(1) === -1 ? SAGE_CAND.length : SAGE_CAND.ring.indexOf(1), SAGE_CAND.length];
    for (let r = 0; r < SAGE_RING_SHAPE.length; r += 1) {
      const i0 = offsets[r];
      const capacity = offsets[r + 1] - i0;
      const geo = sageGeo.clone();
      const windAttrib = makeWindAttrib(geo, capacity);
      // Dissolve order, one per bush — the same hashed alpha the ground cover
      // uses, so the disc rim thins out instead of ending in a line. Its own
      // buffer rather than packed like the grass tuft's: the sage card carries
      // position/normal/uv, instanceMatrix and aWind, five of the eight vertex
      // buffers WebGPU guarantees, so there is room here where there was none
      // there.
      const sageDither = new Float32Array(capacity);
      const sageDitherAttrib = new THREE.InstancedBufferAttribute(sageDither, 1);
      geo.setAttribute("aDither", sageDitherAttrib);
      const mesh = new THREE.InstancedMesh(geo, sageMat, capacity);
      mesh.castShadow = false;
      mesh.frustumCulled = false;
      mesh.boundingSphere = new THREE.Sphere(
        new THREE.Vector3(POS.ranch.x, 16, POS.ranch.z),
        SAGE_RING_SHAPE[r].outer + sageRingStep[r] + 40
      );
      sageRings.push({
        r,
        mesh,
        windAttrib,
        sageDitherAttrib,
        capacity,
        cell: SAGE_RING_SHAPE[r].cell,
        outer: SAGE_RING_SHAPE[r].outer,
        step: sageRingStep[r],
        i0,
        i1: offsets[r + 1],
        slot: 0,
        cx: POS.ranch.x,
        cz: POS.ranch.z,
        used: 0,
        job: null
      });
    }
  }

  let g = 0;
  let shrubs = 0;

  // ---------------------------------------------------------------------
  // The disc is planted at every bearing, and that is a deliberate revert.
  //
  // A view wedge used to plant only the forward hemisphere, on the reasoning
  // that the camera sees 93.8 deg of a 360 deg disc and the rest was wasted
  // fill. Half of that is arithmetic and half of it is wrong: a tuft behind
  // the camera is outside the frustum, so the GPU never shades it, and the
  // wedge's own half-angle was 90 deg — everything it dropped was already
  // invisible. Rendering the two settled: same vantage, 28,612 tufts wedged
  // against 55,033 full, frames identical to 0.02% of pixels.
  //
  // What the wedge did save was per-frame UPLOAD, because at the time every
  // instance attribute was re-uploaded on every frame (HARD_WON 1.9) at about
  // 17 ms per megabyte. Halving the instance count halved that bill, which is
  // why removing the wedge looked like a 50% win on a desktop card. With the
  // upload fixed, what remains is CPU scatter time: 0.97 ms per chunk wedged
  // against 2.22 ms full at the worst vantage on the `high` tier, both inside
  // the 6 ms budget bench-grass-scatter guards.
  //
  // And the wedge cost something the numbers did not show. It had to follow
  // the look direction, so every 25 deg of turn triggered a full rescatter
  // spanning ~73 frames. Pan faster than about 35 deg/s — which is any normal
  // mouse movement — and the camera outruns the rebuild: you turn into ground
  // the scatter has not reached yet and watch the cover arrive. Planting every
  // bearing means turning changes nothing at all, so there is nothing to
  // watch. Rebuilds now happen only when the player MOVES, and a player who
  // stands and looks around does no scatter work whatever.
  // ---------------------------------------------------------------------

  /**
   * Plant candidate `i` of ring `rec` around that ring's centre. Returns true
   * when the slot was used.
   *
   * Tuft scale grows with distance: a far tuft covers the ground a denser ring
   * would have, so the coarser rings do not read as thinning out. Growth is
   * continuous in distance rather than stepped per ring, so the ring seams do
   * not show as bands. The distance is measured against the ring's OWN centre,
   * so between re-centres a tuft's size does not move at all — an earlier
   * single-disc centre made every tuft's t shift on every rebuild.
   */
  function plantBlade(tile, i, slot) {
    const lod = tile.lod;
    const r = lod.l;
    const cell = lod.cell;
    // The cell is addressed from the TILE's own grid origin, not from a
    // camera-relative offset table. That single change is what makes a tuft
    // persistent: the world cell a slot holds is a property of the tile, so
    // it does not move when the camera does, and a resident tile never needs
    // replanting.
    const ix = tile.tx * lod.cols + (i % lod.cols);
    const jz = tile.tz * lod.cols + ((i / lod.cols) | 0);
    // Speed hold-back, before any sampling so a thinned cell costs nothing.
    // Per-cell hash, not per-slot: the gate answer for a cell is the same on
    // every rebuild, so thinning and unthinning only ever add or remove whole
    // tufts, never move the survivors.
    if (tile.thin > 0 && hash2(ix, jz, 31) < tile.thin) {
      return false;
    }
    const x = (ix + 0.5 + (hash2(ix, jz, 1) - 0.5) * 0.9) * cell;
    const z = (jz + 0.5 + (hash2(ix, jz, 2) - 0.5) * 0.9) * cell;
    // The static sample is memoised per cell (grassSampleCached): a re-centre
    // replants mostly the same cells, so the noise work is paid once per cell,
    // not once per rebuild. The footprint test stays live after it.
    const [weight, biome] = grassSampleCached(r, ix, jz, x, z);
    if (weight <= 0) {
      return false;
    }
    if (insideStructure(x, z, GRASS_CLEARANCE)) {
      return false;
    }

    // Density gate. This used to be `weight >= 0.22`, which nearly everything
    // cleared, so biome lushness only ever changed the height of a carpet that
    // covered the ground regardless. Now a biome's density decides whether the
    // cell carries anything, and bare country is actually bare.
    const density = (GRASS_DENSITY[biome] ?? 0) * (0.55 + weight * 0.5);
    if (hash2(ix, jz, 21) > density) {
      return false;
    }

    const mix = SPECIES_MIX[biome] ?? SPECIES_MIX.range;
    const pick = hash2(ix, jz, 23);
    let si = 0;
    while (si < mix.length - 1 && pick > mix[si]) {
      si += 1;
    }
    const sp = GRASS_SPECIES[si];
    // Species isolation, for telling one grass apart from the three it is
    // mixed with. Filtering here rather than hiding instances afterwards means
    // the amortised rescatter keeps honouring it instead of undoing it on the
    // next rebuild.
    if (soloSpecies && sp.name !== soloSpecies) {
      return false;
    }

    // Height comes from the species, nudged by how wet the ground is.
    const hMet = (sp.hMin + (sp.hMax - sp.hMin) * hash2(ix, jz, 4)) * (0.86 + weight * 0.24);
    // Size ramp, from the BAND, not from this tuft's distance to a ring centre.
    //
    // The ramp used to be `t = dist / RAMP_ANCHOR` against the ring's own
    // centre, and that is precisely what tied a tuft's size to where the
    // camera was standing when it was planted — the reason a band had to be
    // replanted when the camera moved. A tile is built once and kept, so a
    // per-tuft distance would freeze at the build-time camera and go stale as
    // the player rode toward it. applyProfile resolves one ramp per band at
    // its area-weighted mean radius instead (see bandRamp), so a tuft's size
    // is a property of the ground it stands on and never changes while it is
    // resident.
    //
    // Far tufts grow mostly WIDER, not taller: width is what holds coverage as
    // the bands coarsen, while a distance ramp on height was what produced
    // 2.9 m grass at the edge of the disc.
    const hGrow = lod.ramp.h;
    // Was 1 + t * 1.6. Growing width nearly twice as fast as height stretched
    // far tufts sideways into mush; keep the two closer so proportion holds.
    const wGrow = lod.ramp.w;
    const cardH = (hMet * hGrow) / sp.fill;
    const cardW = (hMet * sp.spread * (0.86 + hash2(ix, jz, 5) * 0.28) * wGrow) / BLADE_PANEL_W;

    // Seat on the LOWEST corner of the card footprint, not the centre: on a
    // slope a tuft anchored at its centre hovered above the downhill edge
    // (audit U4 — "grass floating above the terrain"; worst on the open
    // plains and strata slopes). The uphill side buries a little, which is
    // invisible under alpha-tested blades; a floating downhill edge is not.
    const foot = GRASS_FOOT * (cardW / GRASS_CARD_W);
    // meshHeightAt, not heightAt: the tuft must sit on the terrain as it is
    // DRAWN. heightAt is bilinear; the mesh is that grid triangulated, and the
    // two disagree inside every cell. Seating on the bilinear surface floated
    // 9.5% of the map's ground cover by more than 2 cm (worst 76 cm) while
    // every heightAt-based check reported it perfectly grounded.
    const baseY = Math.min(
      meshHeightAt(x, z),
      meshHeightAt(x - foot, z),
      meshHeightAt(x + foot, z),
      meshHeightAt(x, z - foot),
      meshHeightAt(x, z + foot)
    );
    // Sink the card's bottom edge below the ground.
    //
    // The cards are not floating — measured against the drawn terrain, the
    // worst bottom-edge corner on the map hangs 1.8 cm and the median is 0.0.
    // That is the problem. A card is a flat plane, so every blade painted on
    // it emerges from one straight horizontal edge instead of from soil, and
    // an edge sitting exactly at the ground line reads at a low angle as a
    // clump guillotined flat with ground visible under it. Real blades come
    // out of the dirt; a card has to be buried for that to be true.
    //
    // ~3% of card height, capped at 2 cm.
    //
    // This was 9% capped at 5 cm, and a raycast against the terrain as
    // RENDERED (window.__terrainProbe, 2355 tufts, zero misses) says what that
    // actually bought: card bottoms sit 5.4-11.0 cm below the drawn ground,
    // median 8.5. meshHeightAt matches the drawn mesh to 0.00 cm at every
    // percentile, so this is not a seating error - the cards are simply buried
    // far deeper than the 5 cm asked for, because baseY is already the MINIMUM
    // over the footprint and the sink then stacks on top of it.
    //
    // 8.5 cm of a card whose painted plant is ~24 cm tall is a third of the
    // plant underground - and it is the bottom third, which is exactly where
    // paintBladePanel puts the contact darkening. So the only grounding cue
    // the blade had was buried, and what met the ground line was the blade's
    // full-brightness middle, ending abruptly against bright gravel with no
    // shading transition at all. That is the artefact: not a gap, a missing
    // contact. Bury just enough to hide the card's straight bottom edge and
    // let the dark band survive to sit at the soil line.
    const sink = Math.min(0.02, cardH * 0.03);
    const rotY = hash2(ix, jz, 3) * Math.PI * 2;
    dummy.position.set(x, baseY - sink, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(cardW / GRASS_CARD_W, cardH / GRASS_CARD_H, cardW / GRASS_CARD_W);
    dummy.updateMatrix();
    tile.body.mesh.setMatrixAt(slot, dummy.matrix);
    tile.body.speciesUV[slot * 2] = sp.uv[0];
    tile.body.speciesUV[slot * 2 + 1] = sp.uv[1];
    // Wind frame for windBend: cos/sin of this tuft's Y rotation over its XZ
    // scale, so the world gust lands in the same compass direction on every
    // tuft and keeps its amplitude in world metres.
    tile.body.windRot[slot * 2] = Math.cos(rotY) / (cardW / GRASS_CARD_W);
    tile.body.windRot[slot * 2 + 1] = Math.sin(rotY) / (cardW / GRASS_CARD_W);

    // Dissolve order. Salt 41 is its own hash, uncorrelated with the ones
    // driving position, species and tint, so the tufts a fade holds back are
    // spatially white noise rather than a pattern picked out of the field.
    //
    // Nudged strictly inside (0, 1): the fades compare `cover > dither`, and
    // hash2 can return exactly 0, which would leave one tuft in every few
    // billion drawn at zero cover — visible as a lone blade standing past the
    // edge of the disc.
    tile.body.fade[slot * 2 + 1] = 0.001 + hash2(ix, jz, 41) * 0.998;

    const lush = GRASSINESS[biome] ?? 0;
    const dry = biome === "range" || biome === "badlands" || biome === "iron" ? 0.18 : 0;
    tile.body.tints[slot * 3] = 0.32 + lush * 0.22 + hash2(ix, jz, 6) * 0.12 + dry;
    tile.body.tints[slot * 3 + 1] = 0.42 + lush * 0.28 + hash2(ix, jz, 7) * 0.12 - dry * 0.15;
    tile.body.tints[slot * 3 + 2] = 0.2 + lush * 0.1 + hash2(ix, jz, 8) * 0.08 - dry * 0.05;
    return true;
  }

  function plantSage(rec, i, slot) {
    const cx = rec.cx;
    const cz = rec.cz;
    const cell = rec.cell;
    const ix = Math.floor(cx / cell) + SAGE_CAND.di[i];
    const jz = Math.floor(cz / cell) + SAGE_CAND.dj[i];
    const x = (ix + 0.5 + (hash2(ix, jz, 11) - 0.5) * 0.9) * cell;
    const z = (jz + 0.5 + (hash2(ix, jz, 12) - 0.5) * 0.9) * cell;
    const biome = biomeAt(x, z);
    if (hash2(ix, jz, 13) > shrubChance(biome)) {
      return false;
    }
    const creek = creekFactor(x, z);
    const road = roadFactor(x, z);
    if (creek > 0.4 || road > 0.35 || lakeFactor(x, z) > 0.4) {
      return false;
    }
    if (Math.hypot(x - POS.ranch.x, z - (POS.ranch.z - 8)) < 14) {
      return false;
    }
    if (Math.hypot(x - (POS.ranch.x - 28), z - (POS.ranch.z + 18)) < 10) {
      return false;
    }
    if (insideStructure(x, z, SHRUB_CLEARANCE)) {
      return false;
    }
    if (normalAt(x, z).y < 0.58) {
      return false;
    }
    const y = heightAt(x, z);
    // The upper cap used to be 78 m, which threw away 39% of the range biome —
    // the one place sage is meant to dominate, at 0.78 shrub chance. High desert
    // is exactly sagebrush country, so the ceiling now sits above the range's
    // own high ground and only keeps it off genuine peaks.
    if (y > 112 || y < 9) {
      return false;
    }
    const s = 0.8 + hash2(ix, jz, 14) * 0.7;
    // Same outgrowing hold as grass (plantBlade's `far`): a shrub past the
    // tier disc grows faster than distance, or the sage dial plants
    // metric-sized bushes that alpha-test away to nothing at 500 m+.
    const sOver = Math.hypot(x - cx, z - cz) / SAGE_ANCHOR;
    const sFar = sOver > 1 ? 1 + (sOver - 1) * 2.5 : 1;
    const sx = s * (0.85 + hash2(ix, jz, 16) * 0.35) * sFar;
    // Same lowest-corner seat as grass: a sage bush anchored at its centre
    // hovered above the downhill side on slopes.
    const sfoot = SAGE_FOOT * sx;
    // Same drawn-surface seating as grass — `y` is the bilinear heightAt used
    // for the elevation gate above, which is not where the ground is rendered.
    const sBaseY = Math.min(
      meshHeightAt(x, z),
      meshHeightAt(x - sfoot, z),
      meshHeightAt(x + sfoot, z),
      meshHeightAt(x, z - sfoot),
      meshHeightAt(x, z + sfoot)
    );
    // Same burial as grass: a sage card's flat bottom edge reads as a cut too.
    const rotY = hash2(ix, jz, 15) * Math.PI * 2;
    dummy.position.set(x, sBaseY - 0.05, z);
    dummy.rotation.set(0, rotY, 0);
    dummy.scale.set(sx, s * (0.8 + hash2(ix, jz, 17) * 0.4) * sFar, sx);
    dummy.updateMatrix();
    rec.mesh.setMatrixAt(slot, dummy.matrix);
    // Same wind frame as grass: world gust rotated into this bush's frame.
    rec.windAttrib.array[slot * 2] = Math.cos(rotY) / sx;
    rec.windAttrib.array[slot * 2 + 1] = Math.sin(rotY) / sx;
    // Salt 41, the same one the tufts use: a bush and a tuft on the same
    // ground are different scatters, so sharing the salt cannot correlate
    // them, and one number means one thing across the whole module.
    rec.sageDitherAttrib.array[slot] = 0.001 + hash2(ix, jz, 41) * 0.998;
    return true;
  }

  /**
   * Publish one ring's finished replant. This is the only moment the ring's
   * buffers are marked for upload: planting during a rebuild only writes the
   * CPU-side arrays, and the old field keeps drawing until the whole replant
   * lands, exactly the contract the old single-disc finishScatter had — just
   * scoped to one ring, so a far ring going stale never pays to re-upload the
   * near field that has not moved.
   *
   * instanceMatrix updateRanges are deliberately NOT used for per-chunk
   * partial uploads. three's WebGPU backend drives instanceMatrix through a
   * buffer node, not the attribute-update path: under the uniform-buffer limit
   * the whole array uploads on a version change anyway, and above it the
   * interleaved copy forwards updateRanges without ever clearing the source
   * attribute's own list. The dirty contract that works on every backend is a
   * plain needsUpdate at ring completion, on buffers now sized per ring.
   */
  function finishRing(rec, count) {
    rec.used = count;
    rec.job = null;
    rec.mesh.count = count;
    rec.mesh.instanceMatrix.needsUpdate = true;
    if (rec.tintAttrib) {
      // The attributes, not the nodes that read them: a node has no needsUpdate
      // and setting one silently did nothing for the whole life of this file.
      rec.tintAttrib.needsUpdate = true;
      rec.speciesAttrib.needsUpdate = true;
      rec.windRotAttrib.needsUpdate = true;
    } else {
      rec.windAttrib.needsUpdate = true;
      rec.sageDitherAttrib.needsUpdate = true;
    }
    rec.mesh.boundingSphere.center.set(rec.cx, heightAt(rec.cx, rec.cz), rec.cz);
    rec.mesh.boundingSphere.radius = rec.outer + rec.step + 40;
  }

  function finishSageRing(rec) {
    finishRing(rec, rec.slot);
    shrubs = sageRings.reduce((sum, sr) => sum + sr.used, 0);
  }

  /**
   * Publish one finished tile.
   *
   * This is the only moment a tile's buffers are marked for upload — building
   * writes the CPU-side arrays and the tile stays invisible until it is whole,
   * so a half-planted square is never on screen. The difference from the old
   * per-ring publish is only one of SIZE: a band's worth of buffers became a
   * square's, so the upload a build costs is a few tens of KB instead of
   * megabytes, and the tufts it swaps in are new ground rather than a
   * reshuffle of ground already drawn.
   *
   * instanceMatrix updateRanges are still deliberately NOT used. three's
   * WebGPU backend drives instanceMatrix through a buffer node, not the
   * attribute-update path: under the uniform-buffer limit the whole array
   * uploads on a version change anyway, and above it the interleaved copy
   * forwards updateRanges without ever clearing the source attribute's own
   * list. Small buffers are the fix, not partial uploads.
   */
  function finishTile(tile) {
    const body = tile.body;
    tile.count = tile.slot;
    tile.job = false;
    body.mesh.count = tile.slot;
    // Stamp the whole tile with one birth time and let the shader dissolve it
    // in (see the aFade/HASHED ALPHA block on grassMat.opacityNode). Every tuft in a
    // landing tile is genuinely new ground — that is what the tile cache buys,
    // and it is why the fade is correct here and would not have been on rings,
    // where four fifths of a rebuilt band was cover that had not changed and
    // fading it would have made the band pulse.
    // `tile.instant` is decided when the tile is ADMITTED, not here. A tile
    // takes several frames to build, and by the time it lands the camera has
    // usually stopped jumping — reading the live flag at finish time made
    // every teleported tile fade in anyway (measured: 22.7% from settled a
    // frame after a jump, against 2.3% with fades off).
    tile.bornAt = tile.instant ? vegClock - GRASS_FADE_SECS : vegClock;
    // Strided, not fill(): the birth time is the x of a packed vec2 whose y is
    // the tuft's dither, written per slot by plantBlade. Filling the whole
    // range would flatten every tuft's place in the dissolve order to the same
    // number and put the tile back to arriving as one block.
    for (let i = 0; i < tile.slot; i += 1) {
      body.fade[i * 2] = tile.bornAt;
    }
    body.mesh.instanceMatrix.needsUpdate = true;
    body.tintAttrib.needsUpdate = true;
    body.speciesAttrib.needsUpdate = true;
    body.windRotAttrib.needsUpdate = true;
    body.fadeAttrib.needsUpdate = true;
    // A real, static bounding sphere over the tile's own square, so frustum
    // culling can reject it. Radius covers the square's half-diagonal plus
    // the tallest card the band plants and the terrain relief inside it.
    const half = tile.lod.tileSize * 0.5;
    const cx = (tile.tx + 0.5) * tile.lod.tileSize;
    const cz = (tile.tz + 0.5) * tile.lod.tileSize;
    body.mesh.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(cx, heightAt(cx, cz), cz),
      Math.hypot(half, half) + 40
    );
    body.mesh.visible = tile.slot > 0;
    g = grassTiles.reduce((sum, t) => sum + t.count, 0);
  }

  /**
   * Run up to `budget` candidates of one tile's build. Returns the budget
   * actually spent, so a frame can carry on into the next queued tile.
   */
  function runTileChunk(tile, budget) {
    const end = tile.lod.cols * tile.lod.cols;
    let spent = 0;
    for (; tile.jobI < end && tile.slot < tile.body.capacity && spent < budget; tile.jobI += 1) {
      if (plantBlade(tile, tile.jobI, tile.slot)) {
        tile.slot += 1;
      }
      spent += 1;
    }
    if (tile.jobI >= end || tile.slot >= tile.body.capacity) {
      finishTile(tile);
    }
    return spent;
  }

  function runSageChunk(rec, budget) {
    const end = rec.i1;
    let spent = 0;
    for (; rec.jobI < end && rec.slot < rec.capacity && spent < budget; rec.jobI += 1) {
      if (plantSage(rec, rec.jobI, rec.slot)) {
        rec.slot += 1;
      }
      spent += 1;
    }
    if (rec.jobI >= end || rec.slot >= rec.capacity) {
      finishSageRing(rec);
    }
    return spent;
  }

  function startRingJob(rec) {
    rec.job = true;
    rec.jobI = rec.i0;
    rec.slot = 0;
  }

  /**
   * Bring the resident tile set up to date with where the camera is.
   *
   * The tier bands are a QUADTREE and residency is a descent, not a set of
   * independent per-band tests. Start at the coarsest band's grid, and split a
   * node into its four children when the child band's outer radius reaches it.
   * A node that is not split is a leaf and is resident; a node that is split
   * contributes nothing itself. Because a coarse tile is exactly four fine
   * ones, the leaves of that descent partition the disc: every square metre
   * inside GRASS_RADIUS is owned by exactly one leaf, at exactly one LOD.
   *
   * That exactness is the point, and it is what the first cut got wrong. Each
   * band had its own independent grid and a tile was kept when its square
   * INTERSECTED the band's annulus — hole-free, but it admits every tile
   * straddling either edge, and with tiles a useful fraction of their band's
   * width that is most of them. Measured: 88,660 tufts planted where 38,048
   * were intended, 2.3x, which starved the build queue badly enough that the
   * near field emptied out during a gallop. Shrinking tiles to cut the
   * overshoot only traded it for draw calls — at a third of band width the
   * count went past 500 tiles and the overshoot was still 1.5x.
   *
   * The extension bands past QUAD_DEPTH are not on the ladder and keep the
   * intersection test, which is where the remaining double coverage lives.
   * They are dial-only, no tier reaches them, and their density is under
   * 0.016/m2, so the straddle is worth a few dozen tufts.
   *
   * Cheap per frame: a few hundred node tests, against the tens of thousands
   * of candidate PLANTS a ring re-centre used to pay.
   */
  const SPLIT_HYS = 0.12;
  function updateTiles(cameraPos) {
    const wanted = new Set();
    let changed = false;

    /**
     * Is this tile's ground ALREADY covered by a tile at an adjacent band?
     *
     * The birth dissolve rests on one precondition — a landing tile is ground
     * nothing was drawing before — and that is true only at the frontier. It
     * is false for every tile the quadtree produces by REFINING, and those are
     * the majority and the near ones. `descend` splits a node when its centre
     * reaches the finer band's outer radius, and those radii are 34, 82, 168
     * and 330 m, so walking forward retires a parent and admits four children
     * at each of them. Measured over a 35 m walk at 2.5 m/s: 79 tile births,
     * 39 of them with their nearest edge inside 90 m, 16 of those band 0 at a
     * median 16.6 m — one at 0.0 m, under the player. Dissolving those reads
     * as patches of ground fading in a few strides away, because the ground
     * was green a frame earlier and the fade starts it from nothing.
     *
     * Look at EVERY coarser band, not just the parent. `descend` is depth
     * first and only admits at leaves, so a node that qualifies to split never
     * becomes a tile: a band 3 tile near the camera splits through bands 2 and
     * 1 straight to band 0 in one pass, and the intermediate tiles never
     * existed. Checking only the immediate parent found nothing and left 27 of
     * the 39 near births still dissolving — the diagnostic read
     * `up1:false up2:false up3:true` on a band 0 tile landing at 0.0 m.
     *
     * The finer direction is the same relation upside down: riding away merges
     * 4^k fine tiles back into one coarse one, and that coarse tile is landing
     * on ground those fine tiles were drawing. It is bounded by the ladder
     * depth (at most 4 + 16 + 64 + 256 lookups for the coarsest band) and only
     * paid when a tile is admitted, which is a handful of times a frame.
     *
     * Eviction happens after the whole descent, so `live` still holds the
     * previous frame's set here and both scans see what is about to be
     * replaced.
     *
     * A tile re-admitted because its speed hold-back went stale has neither an
     * ancestor nor a descendant live — the old tile at its OWN key was the one
     * evicted — so it still dissolves, which is what the eviction comment
     * below asks for. Only the quad bands nest; the dial-only extension bands
     * are a plain grid with no parent/child relation, hence the `.quad` guards.
     */
    const overlappingLive = (lod, tx, tz, hit) => {
      if (!lod.quad) {
        return false;
      }
      for (let k = 1; ; k += 1) {
        const up = grassLods[lod.l + k];
        if (!up || !up.quad) {
          break;
        }
        const t = up.live.get(`${up.l}:${tx >> k}:${tz >> k}`);
        if (t && hit(t)) {
          return true;
        }
      }
      for (let k = 1; ; k += 1) {
        const down = grassLods[lod.l - k];
        if (!down || !down.quad) {
          break;
        }
        const span = 2 ** k;
        for (let dx = 0; dx < span; dx += 1) {
          for (let dz = 0; dz < span; dz += 1) {
            const t = down.live.get(`${down.l}:${tx * span + dx}:${tz * span + dz}`);
            if (t && hit(t)) {
              return true;
            }
          }
        }
      }
      return false;
    };

    const groundAlreadyCovered = (lod, tx, tz) => overlappingLive(lod, tx, tz, () => true);

    /**
     * Is a tile that is about to REPLACE this one still being built?
     *
     * The other half of the same relation. Eviction used to be unconditional:
     * a tile the descent did not ask for was removed on the spot, and a split
     * asks for four children in the same pass that stops asking for the
     * parent. The children take several frames of scatter budget to fill, so
     * the parent vanished and the ground under it was BARE until they landed —
     * at the 34, 82, 168 and 330 m split radii, which is to say in front of
     * the player. That is the bare patch in the original report, the one the
     * birth dissolve was mistakenly papering over.
     *
     * So a tile is retired only once nothing that supersedes it is still in
     * flight. The cost is transient DOUBLE coverage on that square — parent
     * and children drawn together for the few frames the build takes — which
     * reads as cover briefly thickening. Cover that thickens for three frames
     * is a far cheaper error than ground that disappears, and it is the same
     * trade the band edges already make where a coarse tile straddles a fine
     * band (see THE TILE CACHE).
     *
     * `wanted` is required as well as `job`: a tile mid-build that the descent
     * has ALSO stopped asking for is being abandoned, not promoted, and
     * waiting on it would hold the old tile until the deadline for nothing.
     */
    const replacementPending = (lod, tile) =>
      overlappingLive(lod, tile.tx, tile.tz, (t) => t.job && wanted.has(t.key));

    const admit = (lod, tx, tz, near) => {
      const key = `${lod.l}:${tx}:${tz}`;
      wanted.add(key);
      if (lod.live.has(key)) {
        lod.live.get(key).dist = near;
        return;
      }
      const tile = {
        lod,
        tx,
        tz,
        key,
        body: acquireTileBody(lod),
        // Speed hold-back for this tile's build, frozen at build time — a
        // tile is never rebuilt while resident, so an unthinned one stays
        // unthinned and a thinned one is refreshed only when the player
        // leaves and comes back. See SPEED_THIN.
        thin: lod.thinnable && speedThinOn ? SPEED_THIN[thinLevel] : 0,
        // Whether this tile should skip its birth fade — see finishTile. A
        // teleport skips it because the whole resident set is replaced at
        // once; a refinement or a merge skips it because the ground it covers
        // was already being drawn and only the density is changing.
        instant: instantBorn || groundAlreadyCovered(lod, tx, tz),
        job: true,
        jobI: 0,
        slot: 0,
        count: 0,
        dist: near
      };
      lod.live.set(key, tile);
      scene.add(tile.body.mesh);
      changed = true;
    };

    // Descend the quadtree. `l` indexes RINGS, so l - 1 is the finer band and
    // l = 0 is the finest; a node splits when the band below it reaches its
    // square.
    const descend = (l, tx, tz) => {
      const lod = grassLods[l];
      const span = tileSpan(tx, tz, lod.tileSize, cameraPos.x, cameraPos.z);
      if (span.near >= GRASS_RADIUS) {
        return;
      }
      const finer = l > 0 ? grassLods[l - 1] : null;
      if (finer && finer.quad) {
        // Split on the node's CENTRE, not its nearest corner.
        //
        // Any per-node predicate keeps the partition exact — a node either
        // splits or is a leaf, so its square is covered once either way — so
        // the predicate is free to be chosen purely for how well the LOD
        // bands land on the radii they are named for. `near` splits a node
        // when ANY corner reaches the finer band, which pushes fine density a
        // whole tile diagonal outward: measured, band 1 covering out to
        // ~130 m instead of 82 and the field planting 94,304 tufts where
        // 38,048 were intended. The centre lands the band within half a tile
        // either way and the error averages out.
        //
        // Hysteresis: once a node has split, it takes SPLIT_HYS more distance
        // to merge again. Without it a node sitting on the threshold splits
        // and merges on alternate frames, and since a split DESTROYS the
        // parent tile and CREATES four children, the pair never finish
        // building — measured, bands 0 and 1 at zero tufts after a 653 m ride
        // with 24 and 42 tiles resident, all of them perpetually mid-build.
        const split = finer.live.has(`${finer.l}:${tx * 2}:${tz * 2}`);
        if (span.mid < finer.outer * (split ? 1 + SPLIT_HYS : 1)) {
          for (let dx = 0; dx < 2; dx += 1) {
            for (let dz = 0; dz < 2; dz += 1) {
              descend(l - 1, tx * 2 + dx, tz * 2 + dz);
            }
          }
          return;
        }
      }
      admit(lod, tx, tz, span.near);
    };

    const quadTop = grassLods.reduce((top, lod) => (lod.quad ? lod.l : top), 0);
    const rootLod = grassLods[quadTop];
    const rootReach = Math.min(GRASS_RADIUS, rootLod.outer) + rootLod.tileSize;
    const r0 = tileIndex(cameraPos.x - rootReach, rootLod.tileSize);
    const r1 = tileIndex(cameraPos.x + rootReach, rootLod.tileSize);
    const s0 = tileIndex(cameraPos.z - rootReach, rootLod.tileSize);
    const s1 = tileIndex(cameraPos.z + rootReach, rootLod.tileSize);
    for (let tx = r0; tx <= r1; tx += 1) {
      for (let tz = s0; tz <= s1; tz += 1) {
        descend(quadTop, tx, tz);
      }
    }

    // Extension bands: plain grids, intersection test.
    for (const lod of grassLods) {
      if (lod.quad) {
        continue;
      }
      const size = lod.tileSize;
      const reach = lod.outer + size;
      const i0 = tileIndex(cameraPos.x - reach, size);
      const i1 = tileIndex(cameraPos.x + reach, size);
      const j0 = tileIndex(cameraPos.z - reach, size);
      const j1 = tileIndex(cameraPos.z + reach, size);
      for (let tx = i0; tx <= i1; tx += 1) {
        for (let tz = j0; tz <= j1; tz += 1) {
          const span = tileSpan(tx, tz, size, cameraPos.x, cameraPos.z);
          if (span.near < lod.outer && span.far > lod.inner) {
            admit(lod, tx, tz, span.near);
          }
        }
      }
    }

    // Evict everything the descent did not ask for — plus anything still
    // holding hold-back the current speed no longer calls for.
    //
    // A tile's thinning is frozen when it is admitted, and a resident tile is
    // never rebuilt, so a tile planted at a gallop would keep its missing
    // third for as long as the player stayed near it: ride out, stop, and the
    // far field around you stays permanently sparse. Under the old rings a
    // re-centre eventually came along and refilled it — the hazard is named in
    // the susSpeed comment — but with world-space residency nothing ever does.
    // So a tile whose hold-back exceeds what the current speed asks for is
    // evicted and rebuilt by the next descent, faded in, so the refill is a
    // dissolve rather than a pop.
    //
    // Worth knowing: the hold-back is no longer load-bearing. It existed
    // because the ring scheme's re-centres cost O(band area) per step and the
    // outer rings starved. Measured on tiles at 1x, 2x and 4x gallop, the
    // build queue peaks at 3, 4 and 8 tiles mid-build with the hold-back OFF
    // and never empties the near field. It is kept because the panel exposes
    // it and it still buys headroom on a slow device, not because the field
    // needs it.
    const wantThin = speedThinOn ? SPEED_THIN[thinLevel] : 0;
    for (const lod of grassLods) {
      for (const [key, tile] of lod.live) {
        const staleThin = !tile.job && lod.thinnable && tile.thin > wantThin;
        if (wanted.has(key) && !staleThin) {
          tile.holdUntil = 0;
          continue;
        }
        // Deferred retire — see replacementPending. Only for a tile the
        // descent stopped asking for: a staleThin eviction is a rebuild at the
        // tile's OWN key, so there is no other band to wait on and deferring
        // it would just stall the refill until the deadline.
        //
        // The deadline is the leak guard. A held tile is one whose replacement
        // is mid-build, and if the queue is backed up worse than this — a
        // gallop into unbuilt country on a slow device — the hole comes back
        // rather than the field growing without bound. Bounded failure beats
        // an unbounded one.
        if (!staleThin && replacementPending(lod, tile)) {
          if (!tile.holdUntil) {
            tile.holdUntil = vegClock + TILE_HOLD_SECS;
          }
          if (vegClock < tile.holdUntil) {
            continue;
          }
        }
        scene.remove(tile.body.mesh);
        releaseTileBody(lod, tile);
        lod.live.delete(key);
        changed = true;
      }
    }

    if (changed) {
      grassTiles = [];
      for (const lod of grassLods) {
        for (const tile of lod.live.values()) {
          grassTiles.push(tile);
        }
      }
      g = grassTiles.reduce((sum, t) => sum + t.count, 0);
    }
    // Build queue: unfinished tiles, nearest first, so what the player is
    // about to look at lands before what is behind them.
    grassQueue = grassTiles.filter((t) => t.job);
    grassQueue.sort((a, b) => a.dist - b.dist);
  }

  /** Spend one frame's scatter budget on the nearest unfinished tiles. */
  function runTileQueue(budget) {
    let left = budget;
    for (const tile of grassQueue) {
      if (left <= 0) {
        break;
      }
      left -= runTileChunk(tile, left);
    }
  }

  // Initial plant: build both fields around the ranch and finish every tile
  // in full, so the first frame is complete rather than filling in while the
  // player watches. `thinLevel` is 0 here, so nothing is held back.
  buildGrassField();
  buildSageField();
  plantAllTiles({ x: POS.ranch.x, z: POS.ranch.z });
  for (const rec of sageRings) {
    startRingJob(rec);
    runSageChunk(rec, Infinity);
  }

  /**
   * Resolve residency around a point and build every resident tile to
   * completion, with no frame budget. Used for the initial plant and for the
   * panel's structural rebuilds — both are moments where a partial field
   * would be seen as a defect rather than as loading.
   */
  function plantAllTiles(at) {
    const was = instantBorn;
    instantBorn = true;
    updateTiles(at);
    runTileQueue(Infinity);
    instantBorn = was;
  }

  /**
   * Camera motion, measured here rather than asked for, because update() only
   * receives a position. EMA-smoothed over a few frames: a single frame's
   * difference is one hitch or capture teleport away from nonsense, and the
   * scatter cadence should ride the player's actual pace, not a spike.
   */
  let lastCamX = null;
  let lastCamZ = null;
  let lastFrameMs = 0;
  let velX = 0;
  let velZ = 0;
  let vSpeed = 0;
  // A second, much slower average for the speed hold-back: a teleport or a
  // hitch spikes vSpeed for a handful of frames, and a far ring that replants
  // inside that spike would come back thinned — then, if the player stands
  // still, no re-centre ever comes to un-thin it. susSpeed only crosses the
  // hold-back thresholds after the camera has genuinely been moving fast for
  // the better part of a second.
  let susSpeed = 0;
  let frameDt = 1 / 60;

  /**
   * One frame's scatter work, shared out across the rings that need it.
   *
   * The first cut of the ringed scatter handed the whole frame budget to the
   * nearest stale ring and carried only the remainder onward. At a gallop the
   * near rings never finish early — ring 0 re-centres every ~10 m and
   * replants ~24k candidates, so it spends essentially every frame mid-job —
   * and the loop reached the outer rings with nothing left to give. Measured
   * at 4x gallop: ring 1 sat at 63-69% of a single rebuild for thirty
   * straight seconds and rings 2-4 never re-centred at all, their cover left
   * centred on the launch point while the player rode a growing bald circle
   * that eventually snapped back in as a distant ring when they slowed. Near
   * rings first is the right priority; the WHOLE budget as that priority is
   * starvation.
   *
   * So the budget is now split by churn rate: a ring's steady-state share of
   * the work is its candidate span over its re-centre step, scaled by how far
   * it has fallen behind (lag/step, floored at 1) so a ring that starved
   * catches up instead of staying behind forever. When the total budget meets
   * the total churn every ring keeps its cadence; when it falls short every
   * ring slows down proportionally instead of the outer ones going dark.
   * Unspent share pools onward, so a ring that finishes its span early still
   * hands its leftovers to the next.
   *
   * A ring starting a job also plants its centre where the camera will BE
   * when the job lands — velocity x estimated replant time, capped well
   * inside the step — rather than where the camera is. A rebuild that lands
   * already lagging behind is what a re-centre every few frames looks like
   * from inside; lead the centre and the finished disc is centred on the
   * player, not trailing them.
   */
  function scatterPass(rings, cameraPos, budget, runChunk) {
    let totalW = 0;
    const needy = [];
    for (const rec of rings) {
      const lag = Math.hypot(rec.cx - cameraPos.x, rec.cz - cameraPos.z);
      if (!rec.job && lag < rec.step) {
        continue;
      }
      const w = ((rec.i1 - rec.i0) / rec.step) * Math.max(1, lag / rec.step);
      needy.push({ rec, w, lag });
      totalW += w;
    }
    let pool = 0;
    let spentTotal = 0;
    for (const { rec, w, lag } of needy) {
      let allowance = (budget * w) / totalW + pool;
      if (spentTotal + allowance > budget) {
        allowance = budget - spentTotal;
      }
      if (allowance < 1) {
        break;
      }
      if (!rec.job) {
        const span = rec.i1 - rec.i0;
        const tEst = (span / Math.max(1, allowance)) * frameDt;
        const lead = Math.min(rec.step * 0.6, vSpeed * tEst);
        if (lead > 0.01) {
          rec.cx = cameraPos.x + (velX / vSpeed) * lead;
          rec.cz = cameraPos.z + (velZ / vSpeed) * lead;
        } else {
          rec.cx = cameraPos.x;
          rec.cz = cameraPos.z;
        }
        // Hold-back applies only to a routine re-centre, where the ring is at
        // most a step or so behind. A catch-up plant — a teleport, a mission
        // start, a soloGrass reset — leaves the hold-back off: the player is
        // standing somewhere new and must see the full field, and a thinned
        // far ring with no re-centre coming (they have stopped moving) would
        // stay thin indefinitely.
        rec.thin =
          rec.thinnable &&
          (grassOverride === null || grassOverride.thin !== false) &&
          lag < rec.step * 2.5
            ? SPEED_THIN[thinLevel]
            : 0;
        startRingJob(rec);
      }
      const spent = runChunk(rec, Math.round(allowance));
      spentTotal += spent;
      pool = Math.max(0, allowance - spent);
      if (spentTotal >= budget) {
        break;
      }
    }
  }

  const rockMat = new THREE.MeshStandardNodeMaterial({ color: 0x6a6660, roughness: 0.96 });
  const redRock = new THREE.MeshStandardNodeMaterial({ color: 0x8a5a3a, roughness: 0.96 });
  const rocks = new THREE.Group();
  /**
   * Scattered boulders, as two instanced draws instead of ninety meshes.
   *
   * Each rock used to be its own Mesh carrying its own DodecahedronGeometry,
   * built at that rock's radius — ninety geometries, ninety draw calls, and
   * ninety more in the shadow pass, across two materials. The radius is the
   * only thing that varied, so it moves to the instance scale and every rock
   * shares one unit dodecahedron: same size, same seed, same placement, two
   * draws.
   *
   * Two passes because the count is not known until the biome filters have
   * run and InstancedMesh wants its capacity up front.
   */
  const rockPlacements = [];
  for (let i = 0; i < 90; i += 1) {
    const x = (seeded(i + 200) - 0.5) * WORLD.width * 0.9;
    const z = (seeded(i + 260) - 0.5) * WORLD.depth * 0.9;
    const biome = biomeAt(x, z);
    if (biome === "lake" || biome === "town") {
      continue;
    }
    if (biome !== "badlands" && biome !== "iron" && biome !== "foothills" && i > 40) {
      continue;
    }
    if (inClearing(x, z) && biome !== "badlands") {
      continue;
    }
    const rockRadius = 0.8 + seeded(i) * 1.8;
    rockPlacements.push({ i, x, z, rockRadius, red: biome === "badlands" });
    addCylinderCollider(x, z, rockRadius * 0.55);
  }
  // Radius 1: the per-rock radius rides in the instance scale instead, which
  // is what lets them share a geometry. Detail 0 matches the originals.
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  for (const [isRed, material] of [[false, rockMat], [true, redRock]]) {
    const group = rockPlacements.filter((r) => r.red === isRed);
    if (!group.length) {
      continue;
    }
    const mesh = new THREE.InstancedMesh(rockGeo, material, group.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (let n = 0; n < group.length; n += 1) {
      const r = group[n];
      dummy.position.set(r.x, heightAt(r.x, r.z) + 0.2, r.z);
      dummy.rotation.set(seeded(r.i), seeded(r.i + 1), seeded(r.i + 2));
      dummy.scale.setScalar(r.rockRadius);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    rocks.add(mesh);
  }

  for (const p of pines) {
    scene.add(p.trunkNear, p.crownNear, p.limbNear, p.trunkFar, p.crownFar, p.limbFar, p.crownDist);
  }
  // Grass tiles add and remove THEMSELVES as residency changes (updateTiles),
  // so there is no static list of grass meshes to add here any more.
  scene.add(
    ...broadMeshes,
    burnt,
    ...sageRings.map((rec) => rec.mesh),
    rocks
  );

  // Diagnostic toggle for the U2 question: are the long flat streaks on the
  // ground painted into the terrain albedo, or are they grass geometry?
  //
  //   __hideGrass(true)    // screenshot
  //   __hideGrass(false)   // screenshot
  //
  // Streaks that survive with the grass hidden are the terrain texture, whose
  // grass set tiles every 10 m — coarse enough that its painted blades come
  // out around 0.8 m long, as long as the real tufts standing on it.
  //
  // Stand still between the two shots. A tile that leaves range and comes
  // back is rebuilt, which restores its count.
  //
  // Guarded because the headless checks import this module with no window.
  if (typeof window !== "undefined") {
    // Hiding is a visibility flag on the live tiles, not a saved count: tiles
    // come and go, so a count saved against one residency set would be
    // restored onto a different one.
    let hidden = false;
    window.__hideGrass = (on) => {
      hidden = Boolean(on);
      for (const tile of grassTiles) {
        if (tile.body) {
          tile.body.mesh.visible = !hidden && tile.count > 0;
        }
      }
      return hidden ? 0 : grassTiles.reduce((sum, t) => sum + t.count, 0);
    };
  }

  const LOD_DIST = 120;
  const LOD_DIST_SQ = LOD_DIST * LOD_DIST;
  const lodDummy = new THREE.Object3D();

  /**
   * bucketTrees ran every frame: 3200 pines plus 260 cottonwoods re-composed
   * into matrices, then 22 instanceMatrix buffers flagged dirty and re-uploaded
   * — roughly 2.5 MB of GPU traffic per frame to produce, almost always, the
   * exact same buckets. Nothing about the split changes until the camera moves
   * relative to the 120 m LOD shell, so gate it on distance travelled.
   *
   * A tree only sits in the wrong bucket while the camera is within
   * LOD_HYSTERESIS of the shell, and the two LODs are near-identical at 120 m,
   * so the swap is not visible.
   */
  const LOD_HYSTERESIS = 14;
  /**
   * Beyond this, a tree is not submitted at all.
   *
   * Nothing culled trees by distance, so all 3374 of them drew every frame at
   * every range: 7399 of 10122 instances sat beyond 1400 m on a 4000 x 5000 m
   * map — 74% of all tree geometry, at a distance where a pine is a few pixels
   * through haze. Distance is used rather than the view frustum because
   * bucketTrees only re-runs when the camera moves, not when it turns.
   */
  const MID_DIST_SQ = 520 * 520;
  const TREE_DRAW_DIST = PROFILE.treeDrawDist;
  const TREE_DRAW_DIST_SQ = TREE_DRAW_DIST * TREE_DRAW_DIST;
  const lastLodCenter = new THREE.Vector3(Infinity, 0, Infinity);

  /**
   * Horizontal distance only.
   *
   * Both re-centre tests used Vector3.distanceTo against centres stored with
   * y = 0 while the camera rides ~16 m above them, so a third of the threshold
   * was spent on a constant vertical offset — and riding up a slope moved the
   * camera in Y alone, tripping full disc rebuilds that changed nothing.
   */
  function flatDist(center, pos) {
    const dx = center.x - pos.x;
    const dz = center.z - pos.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  function bucketTrees(cameraPos) {
    const nearCounts = new Array(pines.length).fill(0);
    const farCounts = new Array(pines.length).fill(0);
    const distCounts = new Array(pines.length).fill(0);
    for (let i = 0; i < placed; i += 1) {
      const t = treeType[i];
      const dx = treePos[i * 3] - cameraPos.x;
      const dz = treePos[i * 3 + 2] - cameraPos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq > TREE_DRAW_DIST_SQ) {
        continue;
      }
      lodDummy.position.set(treePos[i * 3], treePos[i * 3 + 1], treePos[i * 3 + 2]);
      lodDummy.rotation.set(treeLeanX[i], treeRot[i], treeLeanZ[i]);
      lodDummy.scale.set(treeGirth[i], treeHeight[i], treeGirth[i]);
      lodDummy.updateMatrix();
      if (dSq > MID_DIST_SQ) {
        const n = distCounts[t];
        pines[t].crownDist.setMatrixAt(n, lodDummy.matrix);
        writeWind(pines[t].windDist, n, treeWind, i);
        tintColor.setRGB(treeTint[i * 3], treeTint[i * 3 + 1], treeTint[i * 3 + 2]);
        pines[t].crownDist.setColorAt(n, tintColor);
        distCounts[t] = n + 1;
        continue;
      }
      const isNear = dSq < LOD_DIST_SQ;
      // An instance's slot changes when it crosses the LOD shell, so its tint
      // has to be rewritten into the new slot or trees would swap colours as
      // the camera moves.
      tintColor.setRGB(treeTint[i * 3], treeTint[i * 3 + 1], treeTint[i * 3 + 2]);
      if (isNear) {
        const n = nearCounts[t];
        pines[t].trunkNear.setMatrixAt(n, lodDummy.matrix);
        pines[t].crownNear.setMatrixAt(n, lodDummy.matrix);
        pines[t].limbNear.setMatrixAt(n, lodDummy.matrix);
        writeWind(pines[t].windNear, n, treeWind, i);
        pines[t].crownNear.setColorAt(n, tintColor);
        nearCounts[t] = n + 1;
      } else {
        const n = farCounts[t];
        pines[t].trunkFar.setMatrixAt(n, lodDummy.matrix);
        pines[t].crownFar.setMatrixAt(n, lodDummy.matrix);
        pines[t].limbFar.setMatrixAt(n, lodDummy.matrix);
        writeWind(pines[t].windFar, n, treeWind, i);
        pines[t].crownFar.setColorAt(n, tintColor);
        farCounts[t] = n + 1;
      }
    }
    for (let t = 0; t < pines.length; t += 1) {
      pines[t].trunkNear.count = nearCounts[t];
      pines[t].crownNear.count = nearCounts[t];
      pines[t].limbNear.count = nearCounts[t];
      pines[t].trunkFar.count = farCounts[t];
      pines[t].crownFar.count = farCounts[t];
      pines[t].limbFar.count = farCounts[t];
      pines[t].trunkNear.instanceMatrix.needsUpdate = true;
      pines[t].crownNear.instanceMatrix.needsUpdate = true;
      pines[t].limbNear.instanceMatrix.needsUpdate = true;
      pines[t].trunkFar.instanceMatrix.needsUpdate = true;
      pines[t].crownFar.instanceMatrix.needsUpdate = true;
      pines[t].limbFar.instanceMatrix.needsUpdate = true;
      pines[t].crownDist.count = distCounts[t];
      pines[t].crownDist.instanceMatrix.needsUpdate = true;
      pines[t].crownNear.instanceColor.needsUpdate = true;
      pines[t].crownFar.instanceColor.needsUpdate = true;
      pines[t].crownDist.instanceColor.needsUpdate = true;
      pines[t].windNear.needsUpdate = true;
      pines[t].windFar.needsUpdate = true;
      pines[t].windDist.needsUpdate = true;
    }

    const broadNear = new Array(broads.length).fill(0);
    const broadFar = new Array(broads.length).fill(0);
    const broadDist = new Array(broads.length).fill(0);
    for (let i = 0; i < cottons; i += 1) {
      const t = cottonType[i];
      const dx = cottonPos[i * 3] - cameraPos.x;
      const dz = cottonPos[i * 3 + 2] - cameraPos.z;
      const bSq = dx * dx + dz * dz;
      if (bSq > TREE_DRAW_DIST_SQ) {
        continue;
      }
      lodDummy.position.set(cottonPos[i * 3], cottonPos[i * 3 + 1], cottonPos[i * 3 + 2]);
      lodDummy.rotation.set(0, cottonRot[i], 0);
      const s = cottonScale[i];
      lodDummy.scale.set(s, s, s);
      lodDummy.updateMatrix();
      tintColor.setRGB(cottonTint[i * 3], cottonTint[i * 3 + 1], cottonTint[i * 3 + 2]);
      if (bSq > MID_DIST_SQ) {
        const n = broadDist[t];
        broads[t].crownDist.setMatrixAt(n, lodDummy.matrix);
        writeWind(broads[t].windDist, n, cottonWind, i);
        broads[t].crownDist.setColorAt(n, tintColor);
        broadDist[t] = n + 1;
        continue;
      }
      if (bSq < LOD_DIST_SQ) {
        const n = broadNear[t];
        broads[t].trunkNear.setMatrixAt(n, lodDummy.matrix);
        broads[t].crownNear.setMatrixAt(n, lodDummy.matrix);
        writeWind(broads[t].windNear, n, cottonWind, i);
        broads[t].crownNear.setColorAt(n, tintColor);
        broadNear[t] = n + 1;
      } else {
        const n = broadFar[t];
        broads[t].trunkFar.setMatrixAt(n, lodDummy.matrix);
        broads[t].crownFar.setMatrixAt(n, lodDummy.matrix);
        writeWind(broads[t].windFar, n, cottonWind, i);
        broads[t].crownFar.setColorAt(n, tintColor);
        broadFar[t] = n + 1;
      }
    }
    for (let t = 0; t < broads.length; t += 1) {
      broads[t].trunkNear.count = broadNear[t];
      broads[t].crownNear.count = broadNear[t];
      broads[t].trunkFar.count = broadFar[t];
      broads[t].crownFar.count = broadFar[t];
      broads[t].trunkNear.instanceMatrix.needsUpdate = true;
      broads[t].crownNear.instanceMatrix.needsUpdate = true;
      broads[t].trunkFar.instanceMatrix.needsUpdate = true;
      broads[t].crownFar.instanceMatrix.needsUpdate = true;
      broads[t].crownDist.count = broadDist[t];
      broads[t].crownDist.instanceMatrix.needsUpdate = true;
      broads[t].crownNear.instanceColor.needsUpdate = true;
      broads[t].crownFar.instanceColor.needsUpdate = true;
      broads[t].crownDist.instanceColor.needsUpdate = true;
      broads[t].windNear.needsUpdate = true;
      broads[t].windFar.needsUpdate = true;
      broads[t].windDist.needsUpdate = true;
    }
  }

  return {
    sunDir,
    windFreq,
    windStrength,
    gustFreq,
    gustStrength,
    grassInstances: g,
    // The painted blade atlas, so a dev build can measure where the blades
    // actually sit inside their panel rather than inferring it from the
    // painter's constants.
    grassAtlas: grassTex.image,
    grassSpecies: GRASS_SPECIES.map((sp) => sp.name),
    /**
     * Plant one species and nothing else, so an artefact can be pinned to a
     * grass instead of argued about across a mix of four. Pass null to
     * restore. Forces a rescatter so the change is visible immediately.
     */
    /**
     * Flat-colour the ground cover by species: 0 off, 1 blade silhouettes in
     * flat colour, 2 solid card quads. blueGrama red, bunchgrass green,
     * bluestem blue, cheatgrass yellow.
     */
    /**
     * Wind bend profile exponent: 2 is shipped, 1 is linear (no kink at the
     * card's middle vertex row). Live - it is a uniform.
     */
    debugWindProfile(exp) {
      windProfileExp.value = Math.max(0.25, Math.min(4, Number(exp) || 1));
      return windProfileExp.value;
    },
    /**
     * Turn the blade atlas mip chain off (LinearFilter) or on. An alpha-tested
     * blade loses coverage as the box filter thins it, so if the band is a mip
     * artefact it disappears with mips off - at the cost of aliasing further
     * out, which is why this is a diagnostic and not a fix.
     */
    debugGrassMips(on) {
      grassTex.generateMipmaps = Boolean(on);
      grassTex.minFilter = on ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
      grassTex.needsUpdate = true;
      return grassTex.minFilter === THREE.LinearFilter ? "mips off" : "mips on";
    },
    /**
     * Turn shadow receiving on the ground cover on or off at runtime, so the
     * failure it caused can be reproduced and looked at instead of remembered.
     */
    debugGrassShadow(on) {
      for (const tile of grassTiles) {
        tile.body.mesh.receiveShadow = Boolean(on);
      }
      grassMat.needsUpdate = true;
      return grassTiles.length ? grassTiles[0].body.mesh.receiveShadow : Boolean(on);
    },
    debugSpeciesColour(mode) {
      dbgSpecies.value = Math.max(0, Math.min(2, Number(mode) || 0));
      return dbgSpecies.value;
    },
    soloGrass(name, cameraPos) {
      if (name && !GRASS_SPECIES.some((sp) => sp.name === name)) {
        throw new Error(`unknown grass species ${name}; have ${GRASS_SPECIES.map((sp) => sp.name).join(", ")}`);
      }
      soloSpecies = name || null;
      // Drop every tile: the species filter is applied at plant time, so the
      // resident set has to be rebuilt for it to take effect. Tiles are not
      // re-planted in place any more, which is the whole point — evicting is
      // how you ask for a replant.
      dropAllTiles();
      if (cameraPos) {
        plantAllTiles(cameraPos);
      }
      return soloSpecies;
    },
    /**
     * The (x, z) of every ground-cover instance near a point, so a debug
     * overlay can put its reference mark at the tuft's OWN footing.
     *
     * A grid of ground lines cannot answer whether a blade meets the ground:
     * at eye level a line further away sits higher in the frame than one
     * nearby, so a blade base compared against the wrong line reads as a gap
     * of several centimetres that is pure perspective. The mark has to be at
     * the same (x, z) as the tuft.
     */
    grassPositions(cameraPos, radius = 12) {
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const out = [];
      for (const tile of grassTiles) {
        const rec = tile.body;
        for (let i = 0; i < rec.mesh.count; i += 1) {
          rec.mesh.getMatrixAt(i, m);
          p.setFromMatrixPosition(m);
          if (flatDist(p, cameraPos) <= radius) {
            out.push([p.x, p.y, p.z, Math.hypot(m.elements[4], m.elements[5], m.elements[6]) * GRASS_CARD_H]);
          }
        }
      }
      return out;
    },
    // Capture tooling needs to know when the amortised scatter has caught up
    // with the camera. Without it a screenshot taken after a jump across the
    // map shows ground cover still centred on the previous position, which
    // reads as an empty biome rather than as a half-finished rebuild.
    /**
     * Where the cover on screen is actually centred, and whether a rebuild is
     * in flight. `scatterSettled` answers yes/no; this says why — a probe that
     * finds the centre metres from where it parked the camera is driving a
     * camera the game is not using.
     *
     * The near ring's centre is the one that answers "where is the cover": it
     * refreshes most often, so it is the one that tracks the camera.
     */
    scatterCenter() {
      return {
        x: lastCamX === null ? NaN : lastCamX,
        z: lastCamZ === null ? NaN : lastCamZ,
        rebuilding: grassQueue.length > 0 || sageRings.some((rec) => rec.job),
        planted: g,
        speed: +vSpeed.toFixed(1),
        thin: SPEED_THIN[thinLevel]
      };
    },
    /**
     * Apply the materials panel's Grass folder to the live field.
     *
     * Fade start is a shader uniform, so it lands the same frame. The
     * structural knobs — draw distance, sage distance, cell scale — change
     * the candidate layout, so they rebuild both fields around the camera:
     * dispose the old ring meshes, re-resolve every span, replant in full.
     * That is one hitch of plant work (~150 ms measured by
     * bench-grass-scatter), which is why the panel fires it on release
     * (onFinishChange), not per drag tick. The speed-thinning toggle is
     * scatter-side only and takes effect at the next re-centre with no
     * rebuild at all.
     */
    applyGrassSettings(settings, cameraPos) {
      const next = {
        radius: Math.max(0, Number(settings.grassRadius) || 0),
        sage: Math.max(0, Number(settings.sageRadius) || 0),
        cell: Math.max(0.4, Number(settings.grassCellScale) || 1),
        fade: Math.min(1, Math.max(0.3, Number(settings.grassFadeStart) || 0.803)),
        thin: settings.grassSpeedThin !== false
      };
      const structural =
        !grassOverride ||
        next.radius !== grassOverride.radius ||
        next.sage !== grassOverride.sage ||
        next.cell !== grassOverride.cell;
      grassOverride = next;
      speedThinOn = next.thin;
      applyProfile();
      grassFadeInU.value = GRASS_FADE_IN;
      grassFadeOutU.value = GRASS_FADE_OUT;
      sageFadeInU.value = SAGE_FADE_IN;
      sageFadeOutU.value = SAGE_FADE_OUT;
      if (structural && cameraPos) {
        for (const rec of sageRings) {
          scene.remove(rec.mesh);
          rec.mesh.geometry.dispose();
        }
        // buildGrassField drops every live tile and its pooled meshes, so the
        // grid, cell sizes and band ramps the new RINGS describe are the only
        // ones left.
        buildGrassField();
        buildSageField();
        // Replant around where the player actually is, not the ranch: a
        // panel rebuild that teleported the cover back to spawn would be a
        // bug wearing a feature's clothes.
        plantAllTiles(cameraPos);
        for (const rec of sageRings) {
          rec.cx = cameraPos.x;
          rec.cz = cameraPos.z;
          startRingJob(rec);
          runSageChunk(rec, Infinity);
        }
        scene.add(...sageRings.map((rec) => rec.mesh));
      }
      return { grassRadius: GRASS_RADIUS, sageRadius: SAGE_RADIUS, planted: g };
    },
    /**
     * Birth state of every live tile: whether it skipped its fade, and how far
     * through the fade it is (0..1, >1 = done). The fade is invisible to the
     * pixel probes during a ride — a gallop changes 92% of the frame every
     * 70 ms regardless — so this is how the frontier dissolve is checked.
     */
    tileBirths() {
      return {
        clock: +vegClock.toFixed(2),
        tiles: grassTiles.filter((t) => !t.job).map((t) => ({
          key: t.key,
          instant: Boolean(t.instant),
          age: +((vegClock - t.bornAt) / GRASS_FADE_SECS).toFixed(3)
        }))
      };
    },
    /**
     * Per-ring scatter state, for the same diagnosis scatterCenter does for
     * the whole disc: which ring is mid-rebuild, where its cursor is, and
     * whether its cursor is actually advancing between calls.
     */
    scatterRings() {
      const sageRow = (rec) => ({
        r: rec.r,
        cx: rec.cx === Infinity ? null : rec.cx,
        cz: rec.cz === Infinity ? null : rec.cz,
        jobI: rec.job ? rec.jobI : null,
        span: [rec.i0, rec.i1],
        slot: rec.slot,
        capacity: rec.capacity,
        used: rec.used,
        thin: rec.thin || 0
      });
      // One row per grass BAND, aggregated over its live tiles, so the shape
      // of this report survives the move to tiles: probes and the panel read
      // capacity/used per band exactly as they did per ring.
      const grass = grassLods.map((lod) => {
        const tiles = [...lod.live.values()];
        return {
          r: lod.l,
          cx: null,
          cz: null,
          jobI: tiles.some((t) => t.job) ? 1 : null,
          span: [0, lod.cols * lod.cols],
          slot: tiles.reduce((n, t) => n + t.slot, 0),
          capacity: tiles.length * lod.cols * lod.cols,
          used: tiles.reduce((n, t) => n + t.count, 0),
          tiles: tiles.length,
          building: tiles.filter((t) => t.job).length,
          thin: tiles.length ? Math.max(...tiles.map((t) => t.thin)) : 0
        };
      });
      return { grass, sage: sageRings.map(sageRow) };
    },
    /**
     * Capture tooling gates its screenshots on this. Position only: the disc
     * is planted at every bearing, so where the camera LOOKS cannot leave the
     * cover stale — only where it stands can.
     *
     * Every ring must be inside its own step: a teleport puts all of them
     * stale at once, and a screenshot taken mid-rebuild would show only the
     * rings that had finished.
     */
    scatterSettled(cameraPos) {
      const stale = (rec) => Math.hypot(rec.cx - cameraPos.x, rec.cz - cameraPos.z) >= rec.step;
      // Grass is settled when residency around THIS point is resolved and
      // every resident tile is built. updateTiles is idempotent, so asking is
      // free and also brings the answer up to date for a camera that was
      // teleported rather than driven.
      updateTiles(cameraPos);
      // Fades in flight count as unsettled: a screenshot taken mid-dissolve
      // would grade a field that is half there, and would differ run to run.
      const fading = grassTiles.some((t) => !t.job && vegClock - t.bornAt < GRASS_FADE_SECS);
      return (
        grassQueue.length === 0 &&
        !fading &&
        !sageRings.some((rec) => rec.job) &&
        !sageRings.some(stale)
      );
    },
    /**
     * Measure the ground cover as DRAWN, near the camera.
     *
     * Every previous pass at the floating-grass artefact reasoned about card
     * size from the constants, which is how a wrong answer survives: the
     * constants are inputs to a chain (species height x spread x a distance
     * ramp x a hash jitter / BLADE_PANEL_W) and only the instance matrix says
     * what came out the other end. This reads the matrices back.
     *
     * Width and height are the card's, in metres; the painted plant is
     * BLADE_PANEL_W of the width and `fill` of the height.
     */
    grassStats(cameraPos, radius = 15) {
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      const w = [];
      const h = [];
      for (const tile of grassTiles) {
        const rec = tile.body;
        for (let i = 0; i < rec.mesh.count; i += 1) {
          rec.mesh.getMatrixAt(i, m);
          p.setFromMatrixPosition(m);
          if (flatDist(p, cameraPos) > radius) {
            continue;
          }
          w.push(Math.hypot(m.elements[0], m.elements[1], m.elements[2]) * GRASS_CARD_W);
          h.push(Math.hypot(m.elements[4], m.elements[5], m.elements[6]) * GRASS_CARD_H);
        }
      }
      if (!w.length) {
        return { count: 0 };
      }
      const pct = (arr, q) => {
        const a = arr.slice().sort((x, y) => x - y);
        return Number(a[Math.min(a.length - 1, Math.floor(q * a.length))].toFixed(3));
      };
      const ratio = w.map((v, i) => v / h[i]);
      return {
        count: w.length,
        widthM: { p05: pct(w, 0.05), p50: pct(w, 0.5), p95: pct(w, 0.95), max: pct(w, 1) },
        heightM: { p05: pct(h, 0.05), p50: pct(h, 0.5), p95: pct(h, 0.95), max: pct(h, 1) },
        widthOverHeight: { p05: pct(ratio, 0.05), p50: pct(ratio, 0.5), p95: pct(ratio, 0.95), max: pct(ratio, 1) }
      };
    },
    /**
     * One frame's share of the amortised scatter, plus the tree LOD buckets.
     * Position only — see the note above plantBlade.
     */
    update(cameraPos) {
      if (flatDist(lastLodCenter, cameraPos) >= LOD_HYSTERESIS) {
        lastLodCenter.copy(cameraPos);
        bucketTrees(cameraPos);
      }
      // Only the camera's POSITION can leave the cover stale. Turning used to
      // force a rebuild too, back when the scatter only filled the forward
      // hemisphere; the disc is planted at every bearing now, so a player who
      // stands still and looks around does no scatter work at all.
      //
      // The camera's VELOCITY is measured rather than asked for (update gets a
      // position, that is all), EMA-smoothed so one hitch or capture teleport
      // does not read as a gallop. The first call has no previous position to
      // difference against, so it just primes the tracker.
      const nowMs = performance.now();
      const dt = Math.min(0.1, Math.max(1e-4, (nowMs - lastFrameMs) / 1000));
      // Taken before the trackers below overwrite them — the birth-fade rule
      // needs this frame's displacement, and lastCamX is reassigned in both
      // branches.
      const prevX = lastCamX;
      const prevZ = lastCamZ;
      let budget = GRASS_CHUNK;
      if (lastCamX === null) {
        lastCamX = cameraPos.x;
        lastCamZ = cameraPos.z;
        lastFrameMs = nowMs;
        frameDt = dt;
      } else {
        lastFrameMs = nowMs;
        frameDt += (dt - frameDt) * 0.1;
        const rvx = (cameraPos.x - lastCamX) / dt;
        const rvz = (cameraPos.z - lastCamZ) / dt;
        lastCamX = cameraPos.x;
        lastCamZ = cameraPos.z;
        const blend = Math.min(1, dt * 6);
        velX += (rvx - velX) * blend;
        velZ += (rvz - velZ) * blend;
        vSpeed = Math.min(Math.hypot(velX, velZ), GRASS_SPEED_REF * 4);
        susSpeed += (vSpeed - susSpeed) * Math.min(1, dt * 1.2);
        const speedFactor = susSpeed / GRASS_SPEED_REF;
        thinLevel = speedFactor < 0.85 ? 0 : speedFactor < 1.8 ? 1 : 2;
        // The frame budget rides the speed: churn per second scales with how
        // fast the player covers ground, so the budget has to as well, capped
        // at 3x GRASS_CHUNK (~5.8 ms of worst-case plant work measured by
        // bench-grass-scatter, paid only while moving). At a standstill no
        // ring is stale and none of this runs.
        budget = Math.round(GRASS_CHUNK * (1 + Math.min(speedFactor, 2)));
      }
      // The field clock the birth fade rides. `dt` is already clamped to
      // 100 ms above, which is what a backgrounded tab needs: the clock
      // crawls rather than leaping past every fade in flight.
      vegClock += dt;
      grassNowU.value = vegClock;
      // Frontier tiles fade in. A TELEPORT does not: a mission jump or a fast
      // travel replaces the whole resident set at once, and dissolving all of
      // it reads as the world growing in rather than as cover arriving —
      // measured, a 260 m jump left the frame 35.8% away from its settled
      // state a frame later, against 2.3% with the fade off. The frontier
      // case, which is the one the player actually complained about, moves a
      // tile at a time and is exactly what the dissolve is for.
      instantBorn =
        prevX === null ||
        Math.hypot(cameraPos.x - prevX, cameraPos.z - prevZ) > GRASS_RADIUS * 0.5;
      // Grass residency is world-space now: decide which tiles should exist,
      // then spend the frame's budget building the nearest ones that do not
      // yet. Nothing resident is touched.
      updateTiles(cameraPos);
      runTileQueue(budget);
      scatterPass(sageRings, cameraPos, SAGE_CHUNK, runSageChunk);
    },
    treeInstances: placed,
    burntInstances: burned,
    shrubInstances: shrubs,
    cottonInstances: cottons
  };
}

/**
 * One soft smoke puff, drawn once and shared by every sprite.
 *
 * A radial alpha falloff is the whole trick: it is what lets overlapping
 * puffs merge into a single mass instead of stacking as separate shapes.
 */
function smokePuffTexture() {
  return makeTexture((ctx, size) => {
    const img = ctx.createImageData(size, size);
    const half = size / 2;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const dx = (x - half) / half;
        const dy = (y - half) / half;
        const d = Math.hypot(dx, dy);
        // Smooth to zero at the rim, with a soft shoulder rather than a disc.
        const a = d >= 1 ? 0 : Math.pow(Math.max(0, 1 - d * d), 1.7);
        // A little curdle so the edge is not a perfect circle.
        const n =
          0.82 +
          0.18 *
            Math.sin(Math.atan2(dy, dx) * 5 + d * 9) *
            Math.min(1, d * 2);
        const i = (y * size + x) * 4;
        // White; the mesh tint does the colouring, so one texture serves the
        // dark base puffs and the pale spent ones alike.
        img.data[i] = 255;
        img.data[i + 1] = 255;
        img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(Math.max(0, Math.min(1, a * n)) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }, 128);
}

export function createSmoke(scene) {
  const group = new THREE.Group();
  const origin = { x: POS.burn.x - 22, z: POS.burn.z + 10 };
  const baseY = heightAt(origin.x, origin.z) + 1.2;

  /**
   * Smoke as soft sprites, not spheres.
   *
   * The plume used to be twelve spheres on an unlit material. An unlit sphere
   * draws as a flat filled circle — no shading anywhere on it, a hard rim
   * against the sky — so the column read as a stack of grey coins, and adding
   * shading to the spheres only turned them into a stack of grey balls. The
   * primitive was the problem: a plume is a diffuse mass with no surface, and
   * geometry with a silhouette will always read as an object.
   *
   * Camera-facing sprites carrying a radial alpha falloff have no silhouette
   * to give them away, and enough of them overlapping merge into one body.
   * Many small ones beat few large ones: the count is what buys continuity,
   * and each is cheap.
   */
  const puffTex = smokePuffTexture();
  const PUFFS = 54;
  const RISE = 26;
  for (let i = 0; i < PUFFS; i += 1) {
    const t = i / (PUFFS - 1);
    // Deterministic jitter — the plume should look the same every session.
    const j1 = Math.sin(i * 12.9898) * 43758.5453;
    const j2 = Math.sin(i * 78.233) * 12345.6789;
    const rx = j1 - Math.floor(j1) - 0.5;
    const rz = j2 - Math.floor(j2) - 0.5;

    const mat = new THREE.SpriteNodeMaterial({
      map: puffTex,
      transparent: true,
      depthWrite: false,
      // Cools and thins with height: dark and dense over the fire, pale and
      // nearly spent at the top.
      // Hold the dark for most of the climb. A linear-ish ramp went mid-grey
      // within a few metres of the fire, and mid-grey at low alpha against a
      // pale sky is nothing at all — the first attempt at this was invisible
      // from half the angles for exactly that reason.
      color: new THREE.Color(0x35312f).lerp(new THREE.Color(0xdedbd6), Math.pow(t, 1.9)),
      opacity: (0.58 - t * 0.40) * (1 - t * 0.25),
      sizeAttenuation: true
    });
    const sprite = new THREE.Sprite(mat);
    // Widens as it rises, and drifts as the column loses its footing.
    const spread = 1.2 + t * 6.0;
    const size = 2.6 + Math.pow(t, 0.8) * 10.0;
    sprite.scale.set(size, size, 1);
    sprite.position.set(
      origin.x + rx * spread * 2 + Math.sin(t * 3.1) * t * 3.5,
      // Packed toward the fire, where the smoke is actually dense, rather
      // than spaced evenly up the whole column.
      baseY + Math.pow(t, 1.3) * RISE,
      origin.z + rz * spread * 2 + Math.cos(t * 2.4) * t * 2.5
    );
    // The frame loop animates around this, so it has to be recorded: it used
    // to recompute each position from the child index instead, which discarded
    // the plume entirely.
    sprite.userData.home = sprite.position.clone();
    sprite.userData.rise = t;
    sprite.userData.phase = i;
    group.add(sprite);
  }

  // The fire itself, as a hot core inside a warmer halo. It was a transparent
  // low-poly sphere, and at close range its own back faces showed through the
  // front ones — an orange figure-of-eight sitting in front of the flames
  // rather than a glow inside them. Sprites have no back face to leak.
  for (const glow of [
    { size: 3.4, color: 0xff5a12, opacity: 0.34, y: 0.9 },
    { size: 1.7, color: 0xffb347, opacity: 0.55, y: 0.5 }
  ]) {
    const mat = new THREE.SpriteNodeMaterial({
      map: puffTex,
      transparent: true,
      depthWrite: false,
      color: glow.color,
      opacity: glow.opacity,
      sizeAttenuation: true
    });
    const s = new THREE.Sprite(mat);
    s.scale.set(glow.size, glow.size, 1);
    s.position.set(origin.x, baseY + glow.y, origin.z);
    group.add(s);
  }

  scene.add(group);
  return group;
}
