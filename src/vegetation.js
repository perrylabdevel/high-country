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
  mix,
  smoothstep,
  max,
  dot,
  normalize,
  sin,
  texture,
  instancedBufferAttribute,
  attribute,
  cross,
  varyingProperty
} from "three/tsl";
import { heightAt, normalAt } from "./heightfield.js";
import { barkTexture, makeTexture } from "./world.js";
import { addCylinderCollider } from "./collision.js";
import { insideStructure } from "./buildings/kit.js";
import { WORLD, POS, biomeAt, inClearing, creekFactor, roadFactor, lakeFactor, smoothstep as ramp } from "./map.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { tryLoadTexture } from "./materials/loadTexture.ts";
import { BARK_SET, FOLIAGE_SET } from "./materials/textureManifest.ts";

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
 * Ground-cover draw range.
 *
 * Grass used to stop at 210 m and start dissolving at 150, so the middle
 * distance was bare terrain in every direction. The ring scatter below spends
 * its instances by distance instead of uniformly, which buys the extra range
 * back without adding blades.
 */
const GRASS_RADIUS = 330;
const GRASS_FADE_IN = 265;
const GRASS_FADE_OUT = 326;
const SAGE_RADIUS = 280;
const SAGE_FADE_IN = 215;
const SAGE_FADE_OUT = 276;

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
 * One combined ground sample for the grass scatter.
 *
 * grassWeight() and skipGrass() used to be called back to back, and between
 * them re-evaluated biomeAt, lakeFactor and normalAt twice each per candidate.
 * At ~60k candidates a rebuild that duplication was most of the scatter cost.
 * This returns 0 for "no grass here" and otherwise the placement weight, doing
 * every noise lookup exactly once and bailing on the cheapest test first.
 */
function grassSample(x, z) {
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
  // Buildings last: it is the only test that touches the structure index, and
  // by here most rejected candidates are already gone.
  if (insideStructure(x, z, GRASS_CLEARANCE)) {
    return 0;
  }
  const slope = 1 - normalAt(x, z).y;
  const slopeFactor = 1 - ramp(0.18, 0.5, slope);
  return base * slopeFactor * (1 - creek * 0.8) * (1 - road) * (1 - lake * 0.5);
}


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
    const w = wBase * Math.pow(1 - t, 0.7);
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
  const root = oy + panel * 0.98;
  // Clumps, not an even comb: real tufts crowd around a few crowns.
  const clumps = sp.clumps;
  for (let c = 0; c < clumps; c += 1) {
    const cxp = ox + panel * (0.12 + (c + 0.5) / clumps * 0.76 + (Math.random() - 0.5) * 0.06);
    const per = Math.round(sp.blades / clumps);
    for (let i = 0; i < per; i += 1) {
      const spreadX = (Math.random() - 0.5) * panel * sp.clumpW;
      const x = cxp + spreadX;
      const len = panel * sp.tall * (0.5 + Math.random() * 0.5);
      // Blades on the outside of a clump lean further out.
      const lean = (spreadX * 2.2 + (Math.random() - 0.5) * panel * sp.lean) * (0.4 + Math.random() * 0.9);
      const w = panel * sp.wide * (0.65 + Math.random() * 0.7);
      const dry = Math.random();
      const tone = sp.tones[(Math.random() * sp.tones.length) | 0];
      const grad = ctx.createLinearGradient(x, root, x + lean, root - len);
      grad.addColorStop(0, `rgb(${tone[0]},${tone[1]},${tone[2]})`);
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
  return asCardMap(makeTexture((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const panel = size / 2;
    // Muted palettes: [rootR,G,B, midR,G,B]. Nothing here is a primary green.
    const MEADOW = [[38, 56, 26, 82, 104, 44], [44, 62, 28, 96, 116, 52], [34, 50, 24, 74, 96, 40]];
    const DRYISH = [[52, 58, 30, 112, 116, 56], [46, 54, 28, 100, 106, 50], [58, 62, 32, 124, 124, 62]];
    const STRAW = [[96, 92, 46, 158, 148, 84], [88, 84, 44, 146, 136, 76]];
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
  }, 1024));
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
        const g = 74 + Math.random() * 46;
        const r = 34 + Math.random() * 20;
        const bl = 44 + Math.random() * 26;
        const alpha = 0.72 + Math.random() * 0.28;
        // Angle sweeps back toward the tip, as needles do.
        const ang = up * (Math.PI * 0.42) + (Math.random() - 0.5) * 0.7 - 0.16;
        needle(
          cx + (Math.random() - 0.5) * size * 0.02,
          cy,
          spread * (0.5 + Math.random() * 0.7),
          ang,
          `rgba(${r | 0},${g | 0},${bl | 0},${alpha})`,
          1.0 + Math.random() * 1.35
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
  return asCardMap(makeTexture((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = "round";

    // Woody branchlets fanning up from the base.
    const stems = 7;
    const tips = [];
    for (let i = 0; i < stems; i += 1) {
      const x0 = size * (0.38 + (i / stems - 0.5) * 0.3);
      const tx = size * (0.16 + (i + 0.5) / stems * 0.68) + (Math.random() - 0.5) * size * 0.05;
      const ty = size * (0.2 + Math.random() * 0.3);
      ctx.strokeStyle = `rgba(${76 + Math.random() * 16},${62 + Math.random() * 14},${44 + Math.random() * 12},0.95)`;
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
        const bx = s.x0 + (s.x - s.x0) * t + (Math.random() - 0.5) * size * 0.05;
        const by = size * 0.99 + (s.y - size * 0.99) * t + (Math.random() - 0.5) * size * 0.04;
        const cluster = 3 + ((i * 3) % 3);
        for (let k = 0; k < cluster; k += 1) {
          // Sage green is grey and desaturated: R and B stay close to G.
          const g = 104 + Math.random() * 34;
          const r = g - 18 + Math.random() * 20;
          const b = g - 34 + Math.random() * 18;
          leaf(
            bx + (Math.random() - 0.5) * size * 0.055,
            by + (Math.random() - 0.5) * size * 0.055,
            size * (0.018 + Math.random() * 0.02),
            Math.random() * Math.PI,
            `rgba(${r | 0},${g | 0},${b | 0},${0.82 + Math.random() * 0.18})`
          );
        }
      }
    }
  }, 512));
}

function broadleafTexture() {
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
      const cx = size * (0.12 + Math.random() * 0.76);
      const cy = size * (0.12 + Math.random() * 0.76);
      const g = 86 + Math.random() * 80;
      const r = 48 + Math.random() * 40;
      drawLeaf(
        cx,
        cy,
        size * (0.1 + Math.random() * 0.16),
        Math.random() * Math.PI * 2,
        `rgba(${r | 0},${g | 0},${(28 + Math.random() * 24) | 0},${0.72 + Math.random() * 0.28})`
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
  {
    const h = span * 0.24 + 0.7;
    const geo = new THREE.CylinderGeometry(0.03, 0.72, h, 7, 1);
    paintAo(geo, (pos, v) => {
      const t = (pos.getY(v) + h / 2) / h;
      return 0.48 + 0.44 * t;
    });
    geo.translate(0, topY + h * 0.42, 0);
    // Merge needs one attribute set across the whole crown, and every card now
    // carries a tangent, so the leader cone needs one too. A constant is an
    // approximation on a cone, but this is the spire tip: a few dozen pixels.
    setTangent(geo, 1, 0, 0);
    leaves.push(geo);
  }
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

/** Blade card size in makeGrassTuft, in metres. */
const GRASS_CARD_H = 0.5;
const GRASS_CARD_W = 0.56;

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
  return skywardNormals(mergeGeometries(geos), 1.0, 0.38);
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
  const [
    barkAlbedo, barkNormal, grassAlbedo, grassNormal,
    needleAlbedo, needleNormal, sageAlbedo, sageNormal, broadAlbedo, broadNormal
  ] = await Promise.all([
    tryLoadTexture(BARK_SET.albedo, "albedo"),
    tryLoadTexture(BARK_SET.normal, "linear"),
    tryLoadTexture(FOLIAGE_SET.grassAlbedo, "albedo"),
    tryLoadTexture(FOLIAGE_SET.grassNormal, "linear"),
    tryLoadTexture(FOLIAGE_SET.needleAlbedo, "albedo"),
    tryLoadTexture(FOLIAGE_SET.needleNormal, "linear"),
    tryLoadTexture(FOLIAGE_SET.sageAlbedo, "albedo"),
    tryLoadTexture(FOLIAGE_SET.sageNormal, "linear"),
    tryLoadTexture(FOLIAGE_SET.broadAlbedo, "albedo"),
    tryLoadTexture(FOLIAGE_SET.broadNormal, "linear")
  ]);
  // Atlas panels, not tiling surfaces: repeat would bleed one species into the
  // next across the guard band.
  for (const t of [grassAlbedo, grassNormal, needleAlbedo, needleNormal, sageAlbedo, sageNormal, broadAlbedo, broadNormal]) {
    if (t) {
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
    }
  }
  return {
    barkAlbedo, barkNormal, grassAlbedo, grassNormal,
    needleAlbedo, needleNormal, sageAlbedo, sageNormal, broadAlbedo, broadNormal
  };
}

export function createVegetation(scene, maps = {}) {
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

  const windBend = (profile) => {
    const sway = sin(time.mul(windFreq).add(positionWorld.x.mul(0.12)).add(positionWorld.z.mul(0.16)));
    const gust = sin(time.mul(gustFreq).add(positionWorld.x.mul(0.6)).add(positionWorld.z.mul(0.9)));
    return windDir.mul(sway.mul(windStrength).add(gust.mul(gustStrength)).mul(profile));
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
    trunk: makePineTrunk(topY, baseR, Math.max(0.045, baseR * 0.16))
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
    return { trunkNear, crownNear, limbNear, trunkFar, crownFar, limbFar, crownDist };
  });

  const treePos = new Float32Array(MAX * 3);
  const treeGirth = new Float32Array(MAX);
  const treeHeight = new Float32Array(MAX);
  const treeRot = new Float32Array(MAX);
  const treeLeanX = new Float32Array(MAX);
  const treeLeanZ = new Float32Array(MAX);
  const treeType = new Uint8Array(MAX);
  const treeTint = new Float32Array(MAX * 3);
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
    trunkNear.castShadow = true;
    crownNear.castShadow = true;
    return { trunkNear, crownNear, trunkFar, crownFar, crownDist };
  });
  const broadMeshes = broads.flatMap((b) => [b.trunkNear, b.crownNear, b.trunkFar, b.crownFar, b.crownDist]);
  for (const mesh of [...broadMeshes, burnt]) {
    mesh.frustumCulled = false;
  }
  const cottonPos = new Float32Array(MAX_COTTON * 3);
  const cottonScale = new Float32Array(MAX_COTTON);
  const cottonRot = new Float32Array(MAX_COTTON);
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
      dummy.position.set(x, y, z);
      dummy.rotation.set((seeded(i + 41) - 0.5) * 0.08, seeded(i + 7) * Math.PI * 2, (seeded(i + 43) - 0.5) * 0.08);
      dummy.scale.set(scale * (0.85 + seeded(i + 12) * 0.3), scale, scale * (0.85 + seeded(i + 12) * 0.3));
      dummy.updateMatrix();
      cottonType[cottons] = riparian ? (seeded(i + 71) < 0.72 ? 0 : 1) : (seeded(i + 71) < 0.35 ? 0 : 1);
      cottonPos[cottons * 3] = x;
      cottonPos[cottons * 3 + 1] = y;
      cottonPos[cottons * 3 + 2] = z;
      cottonScale[cottons] = scale;
      cottonRot[cottons] = dummy.rotation.y;
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
    dummy.position.set(x, y, z);
    dummy.rotation.set((seeded(i + 41) - 0.5) * 0.1, seeded(i + 7) * Math.PI * 2, (seeded(i + 43) - 0.5) * 0.1);
    dummy.scale.set(girth, height, girth);
    dummy.updateMatrix();
    treePos[placed * 3] = x;
    treePos[placed * 3 + 1] = y;
    treePos[placed * 3 + 2] = z;
    treeGirth[placed] = girth;
    treeHeight[placed] = height;
    treeRot[placed] = dummy.rotation.y;
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
      dummy.position.set(x, y, z);
      dummy.rotation.set((seeded(i + 41) - 0.5) * 0.08, seeded(i + 7) * Math.PI * 2, (seeded(i + 43) - 0.5) * 0.08);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      cottonType[cottons] = seeded(i + 71) < 0.6 ? 0 : 1;
      cottonPos[cottons * 3] = x;
      cottonPos[cottons * 3 + 1] = y;
      cottonPos[cottons * 3 + 2] = z;
      cottonScale[cottons] = scale;
      cottonRot[cottons] = dummy.rotation.y;
      foliageTint("valley", seeded(i + 61), seeded(i + 63), cottonTint, cottons);
      addCylinderCollider(x, z, 0.5 * scale);
      cottons += 1;
      continue;
    }
    const windSize = 0.78 + seeded(i + 15) * 1.05;
    const girth = windSize * (0.87 + seeded(i + 4) * 0.26);
    const height = windSize;
    dummy.position.set(x, y, z);
    dummy.rotation.set((seeded(i + 41) - 0.5) * 0.08, seeded(i + 7) * Math.PI * 2, (seeded(i + 43) - 0.5) * 0.08);
    dummy.scale.set(girth, height, girth);
    dummy.updateMatrix();
    treePos[placed * 3] = x;
    treePos[placed * 3 + 1] = y;
    treePos[placed * 3 + 2] = z;
    treeGirth[placed] = girth;
    treeHeight[placed] = height;
    treeRot[placed] = dummy.rotation.y;
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
    dummy.position.set(x, y, z);
    dummy.rotation.set((seeded(i + 910) - 0.5) * 0.06, seeded(i + 912) * Math.PI * 2, (seeded(i + 914) - 0.5) * 0.06);
    dummy.scale.set(girth, height, girth);
    dummy.updateMatrix();
    treePos[placed * 3] = x;
    treePos[placed * 3 + 1] = y;
    treePos[placed * 3 + 2] = z;
    treeGirth[placed] = girth;
    treeHeight[placed] = height;
    treeRot[placed] = dummy.rotation.y;
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
      dummy.position.set(x, y, z);
      dummy.rotation.set((seeded(k + 41) - 0.5) * 0.1, seeded(k + 7) * Math.PI * 2, (seeded(k + 43) - 0.5) * 0.1);
      dummy.scale.set(girth, height, girth);
      dummy.updateMatrix();
      treePos[placed * 3] = x;
      treePos[placed * 3 + 1] = y;
      treePos[placed * 3 + 2] = z;
      treeGirth[placed] = girth;
      treeHeight[placed] = height;
      treeRot[placed] = dummy.rotation.y;
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
    broads[t].trunkFar.count = 0;
    broads[t].crownFar.count = 0;
  }
  burnt.count = burned;
  burnt.instanceMatrix.needsUpdate = true;
  burnt.computeBoundingSphere();

  const grassTex = bladeTexture();
  const grassGeo = makeGrassTuft();

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
  // How far the player walks before the disc re-centres, and how much of the
  // rebuild each frame absorbs. The old 2500-blade chunk measured ~9.6 ms on
  // its own — most of a 60 fps frame — which is what made walking feel like it
  // stuttered. Smaller chunks with the cheaper sampler keep each frame's share
  // well inside budget; the rebuild simply spans a few more frames, and the old
  // field stays on screen while it does.
  const REBUILD_STEP = 42;
  const GRASS_CHUNK = 1200;
  const SAGE_CHUNK = 400;

  // Ring cell sizes set the instance budget, and they turned out to matter more
  // to how the ground reads than any material work did. Spend the budget where
  // the eye is: the near rings are dense enough that grass closes over the dirt
  // instead of sitting on it as separate clumps, while the outer two stay
  // coarse, since at those ranges a tuft is a few pixels and grass is the
  // scene's fill-rate cost — alpha-tested and double-sided, so no early-z and
  // both faces shade wherever cards overlap.
  const RINGS = [
    { cell: 0.34, outer: 34 },
    { cell: 0.7, outer: 82 },
    { cell: 2.6, outer: 168 },
    { cell: 5.2, outer: GRASS_RADIUS }
  ];

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
   * Flatten every ring's candidate cells into one list of (di, dj, ring) so the
   * amortised rebuild is a single linear cursor. Built once: the offsets are
   * relative to the ring's own snapped base cell, so they stay valid wherever
   * the player walks.
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

  const CAND = buildCandidates(RINGS, GRASS_RADIUS);
  // Size the pool to the candidate list rather than a round number. A cap below
  // it would be hit first by the outermost ring (candidates are ordered near to
  // far), so in the greenest biomes the far cover would drop out and reappear
  // between rebuilds. ~66k matrices is 4 MB — cheaper than that artefact.
  const MAX_GRASS = CAND.length;

  const tints = new Float32Array(MAX_GRASS * 3);
  // Which panel of the blade atlas this instance draws from. Two floats per
  // instance buys four species out of one instanced draw.
  const speciesUV = new Float32Array(MAX_GRASS * 2);
  const grassMat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.32 });
  const tintAttr = instancedBufferAttribute(tints, "vec3", 3, 0);
  const speciesAttr = instancedBufferAttribute(speciesUV, "vec2", 2, 0);
  // Inset inside the panel so filtering cannot bleed a neighbouring species in.
  const atlasUV = uv().mul(0.47).add(vec2(0.015, 0.015)).add(speciesAttr);
  const grassSampleTex = texture(maps.grassAlbedo || grassTex, atlasUV);
  const grassView = normalize(cameraPosition.sub(positionWorld));
  // The canvas texture was flat, so the material supplied all of its shading:
  // a per-instance tint darkening the root and a hard green push at the tip.
  // The baked albedo already carries that gradient, so applying the ramp again
  // double-counts it and drives the tips to a saturated green. With real maps,
  // keep only a gentle per-instance variation around unity.
  const grassCol = maps.grassAlbedo
    ? grassSampleTex.rgb.mul(tintAttr.mul(0.7).add(0.72))
    : grassSampleTex.rgb.mul(mix(tintAttr, vec3(1.08, 1.22, 0.78), uv().y));
  const grassBack = maps.grassAlbedo ? back(grassView).mul(warmGreen).mul(0.45) : back(grassView).mul(warmGreen);
  grassMat.colorNode = vec4(grassCol.mul(grassBack.add(1)), grassSampleTex.a);
  // Hold full cover almost to the edge of the disc, then dissolve over the last
  // stretch. The old 150 -> 205 fade started eroding grass at two thirds of the
  // draw distance, so the world went bald well before the disc actually ended.
  grassMat.opacityNode = float(1).sub(smoothstep(GRASS_FADE_IN, GRASS_FADE_OUT, cameraPosition.sub(positionWorld).length()));
  sageMat.opacityNode = float(1).sub(smoothstep(SAGE_FADE_IN, SAGE_FADE_OUT, cameraPosition.sub(positionWorld).length()));
  grassMat.positionNode = positionLocal.add(windBend(uv().y.pow(2)));
  grassMat.normalNode = maps.grassNormal ? mappedNormal(maps.grassNormal, atlasUV) : bentNormal;

  const grass = new THREE.InstancedMesh(grassGeo, grassMat, MAX_GRASS);
  grass.castShadow = false;
  grass.frustumCulled = false;

  const sageGeo = makeSageBush();
  const SAGE_CAND = buildCandidates([{ cell: 3.1, outer: 90 }, { cell: 5.2, outer: SAGE_RADIUS }], SAGE_RADIUS);
  const MAX_SAGE = SAGE_CAND.length;
  const sage = new THREE.InstancedMesh(sageGeo, sageMat, MAX_SAGE);
  sage.castShadow = false;
  sage.frustumCulled = false;

  const lastCenter = new THREE.Vector3(POS.ranch.x, 0, POS.ranch.z);
  grass.boundingSphere = new THREE.Sphere(new THREE.Vector3(POS.ranch.x, 16, POS.ranch.z), GRASS_RADIUS + 40);
  sage.boundingSphere = new THREE.Sphere(new THREE.Vector3(POS.ranch.x, 16, POS.ranch.z), SAGE_RADIUS + 40);
  let scatterJob = null;
  let g = 0;
  let shrubs = 0;

  /**
   * Plant candidate `i` around (cx, cz). Returns true when the slot was used.
   *
   * Tuft scale grows with distance: a far tuft covers the ground a denser ring
   * would have, so the coarser rings do not read as thinning out. Growth is
   * continuous in distance rather than stepped per ring, so the ring seams do
   * not show as bands.
   */
  function plantBlade(cx, cz, i, slot) {
    const r = CAND.ring[i];
    const cell = RINGS[r].cell;
    const ix = Math.floor(cx / cell) + CAND.di[i];
    const jz = Math.floor(cz / cell) + CAND.dj[i];
    const x = (ix + 0.5 + (hash2(ix, jz, 1) - 0.5) * 0.9) * cell;
    const z = (jz + 0.5 + (hash2(ix, jz, 2) - 0.5) * 0.9) * cell;
    const weight = grassSample(x, z);
    if (weight <= 0) {
      return false;
    }
    const biome = biomeAt(x, z);

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

    // Height comes from the species, nudged by how wet the ground is.
    const hMet = (sp.hMin + (sp.hMax - sp.hMin) * hash2(ix, jz, 4)) * (0.86 + weight * 0.24);
    const dx = x - cx;
    const dz = z - cz;
    const t = Math.min(Math.sqrt(dx * dx + dz * dz) / GRASS_RADIUS, 1);
    // Far tufts grow mostly WIDER, not taller: width is what holds coverage as
    // the rings coarsen, while a distance ramp on height was what produced
    // 2.9 m grass at the edge of the disc.
    const hGrow = 1 + t * 0.5;
    // Was 1 + t * 1.6. Growing width nearly twice as fast as height stretched
    // far tufts sideways into mush; keep the two closer so proportion holds.
    const wGrow = 1 + t * 0.7;
    // Size the CARD so the painted plant lands at the metric size we asked for.
    const cardH = (hMet * hGrow) / sp.fill;
    const cardW = (hMet * sp.spread * (0.86 + hash2(ix, jz, 5) * 0.28) * wGrow) / BLADE_PANEL_W;

    dummy.position.set(x, heightAt(x, z), z);
    dummy.rotation.set(0, hash2(ix, jz, 3) * Math.PI * 2, 0);
    dummy.scale.set(cardW / GRASS_CARD_W, cardH / GRASS_CARD_H, cardW / GRASS_CARD_W);
    dummy.updateMatrix();
    grass.setMatrixAt(slot, dummy.matrix);
    speciesUV[slot * 2] = sp.uv[0];
    speciesUV[slot * 2 + 1] = sp.uv[1];

    const lush = GRASSINESS[biome] ?? 0;
    const dry = biome === "range" || biome === "badlands" || biome === "iron" ? 0.18 : 0;
    tints[slot * 3] = 0.32 + lush * 0.22 + hash2(ix, jz, 6) * 0.12 + dry;
    tints[slot * 3 + 1] = 0.42 + lush * 0.28 + hash2(ix, jz, 7) * 0.12 - dry * 0.15;
    tints[slot * 3 + 2] = 0.2 + lush * 0.1 + hash2(ix, jz, 8) * 0.08 - dry * 0.05;
    return true;
  }

  function plantSage(cx, cz, i, slot) {
    const cell = SAGE_CAND.ring[i] === 0 ? 3.1 : 5.2;
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
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, hash2(ix, jz, 15) * Math.PI * 2, 0);
    dummy.scale.set(s * (0.85 + hash2(ix, jz, 16) * 0.35), s * (0.8 + hash2(ix, jz, 17) * 0.4), s);
    dummy.updateMatrix();
    sage.setMatrixAt(slot, dummy.matrix);
    return true;
  }

  function finishScatter(cx, cz, grassCount, sageCount) {
    grass.count = grassCount;
    grass.instanceMatrix.needsUpdate = true;
    tintAttr.needsUpdate = true;
    speciesAttr.needsUpdate = true;
    grass.boundingSphere.center.set(cx, heightAt(cx, cz), cz);
    grass.boundingSphere.radius = GRASS_RADIUS + 40;
    sage.count = sageCount;
    sage.instanceMatrix.needsUpdate = true;
    sage.boundingSphere.center.set(cx, heightAt(cx, cz), cz);
    sage.boundingSphere.radius = SAGE_RADIUS + 40;
    g = grassCount;
    shrubs = sageCount;
  }

  function scatterGrass(cx, cz) {
    let grassSlot = 0;
    let sageSlot = 0;
    for (let i = 0; i < CAND.length && grassSlot < MAX_GRASS; i += 1) {
      if (plantBlade(cx, cz, i, grassSlot)) {
        grassSlot += 1;
      }
    }
    for (let i = 0; i < SAGE_CAND.length && sageSlot < MAX_SAGE; i += 1) {
      if (plantSage(cx, cz, i, sageSlot)) {
        sageSlot += 1;
      }
    }
    finishScatter(cx, cz, grassSlot, sageSlot);
  }


  scatterGrass(POS.ranch.x, POS.ranch.z);

  const rockMat = new THREE.MeshStandardNodeMaterial({ color: 0x6a6660, roughness: 0.96 });
  const redRock = new THREE.MeshStandardNodeMaterial({ color: 0x8a5a3a, roughness: 0.96 });
  const rocks = new THREE.Group();
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
    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + seeded(i) * 1.8, 0), biome === "badlands" ? redRock : rockMat);
    const rockRadius = 0.8 + seeded(i) * 1.8;
    mesh.position.set(x, heightAt(x, z) + 0.2, z);
    mesh.rotation.set(seeded(i), seeded(i + 1), seeded(i + 2));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    rocks.add(mesh);
    addCylinderCollider(x, z, rockRadius * 0.55);
  }

  for (const p of pines) {
    scene.add(p.trunkNear, p.crownNear, p.limbNear, p.trunkFar, p.crownFar, p.limbFar, p.crownDist);
  }
  scene.add(...broadMeshes, burnt, sage, grass, rocks);

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
  const TREE_DRAW_DIST = 2600;
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
        pines[t].crownNear.setColorAt(n, tintColor);
        nearCounts[t] = n + 1;
      } else {
        const n = farCounts[t];
        pines[t].trunkFar.setMatrixAt(n, lodDummy.matrix);
        pines[t].crownFar.setMatrixAt(n, lodDummy.matrix);
        pines[t].limbFar.setMatrixAt(n, lodDummy.matrix);
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
        broads[t].crownDist.setColorAt(n, tintColor);
        broadDist[t] = n + 1;
        continue;
      }
      if (bSq < LOD_DIST_SQ) {
        const n = broadNear[t];
        broads[t].trunkNear.setMatrixAt(n, lodDummy.matrix);
        broads[t].crownNear.setMatrixAt(n, lodDummy.matrix);
        broads[t].crownNear.setColorAt(n, tintColor);
        broadNear[t] = n + 1;
      } else {
        const n = broadFar[t];
        broads[t].trunkFar.setMatrixAt(n, lodDummy.matrix);
        broads[t].crownFar.setMatrixAt(n, lodDummy.matrix);
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
    }
  }

  return {
    sunDir,
    windFreq,
    windStrength,
    gustFreq,
    gustStrength,
    grassInstances: g,
    // Capture tooling needs to know when the amortised scatter has caught up
    // with the camera. Without it a screenshot taken after a jump across the
    // map shows ground cover still centred on the previous position, which
    // reads as an empty biome rather than as a half-finished rebuild.
    scatterSettled(cameraPos) {
      return !scatterJob && flatDist(lastCenter, cameraPos) < REBUILD_STEP;
    },
    update(cameraPos) {
      if (flatDist(lastLodCenter, cameraPos) >= LOD_HYSTERESIS) {
        lastLodCenter.copy(cameraPos);
        bucketTrees(cameraPos);
      }
      if (!scatterJob && flatDist(lastCenter, cameraPos) < REBUILD_STEP) {
        return;
      }
      if (!scatterJob) {
        lastCenter.copy(cameraPos);
        scatterJob = { cx: cameraPos.x, cz: cameraPos.z, i: 0, slot: 0, si: 0, sslot: 0 };
      }
      const { cx, cz } = scatterJob;
      const end = Math.min(CAND.length, scatterJob.i + GRASS_CHUNK);
      for (; scatterJob.i < end && scatterJob.slot < MAX_GRASS; scatterJob.i += 1) {
        if (plantBlade(cx, cz, scatterJob.i, scatterJob.slot)) {
          scatterJob.slot += 1;
        }
      }
      const send = Math.min(SAGE_CAND.length, scatterJob.si + SAGE_CHUNK);
      for (; scatterJob.si < send && scatterJob.sslot < MAX_SAGE; scatterJob.si += 1) {
        if (plantSage(cx, cz, scatterJob.si, scatterJob.sslot)) {
          scatterJob.sslot += 1;
        }
      }
      const grassDone = scatterJob.i >= CAND.length || scatterJob.slot >= MAX_GRASS;
      const sageDone = scatterJob.si >= SAGE_CAND.length || scatterJob.sslot >= MAX_SAGE;
      if (grassDone && sageDone) {
        finishScatter(cx, cz, scatterJob.slot, scatterJob.sslot);
        scatterJob = null;
      }
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
