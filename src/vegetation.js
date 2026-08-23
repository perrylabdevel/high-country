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
  varyingProperty
} from "three/tsl";
import { heightAt, normalAt } from "./heightfield.js";
import { barkTexture, makeTexture } from "./world.js";
import { addCylinderCollider } from "./collision.js";
import { insideStructure } from "./buildings/kit.js";
import { WORLD, POS, biomeAt, inClearing, creekFactor, roadFactor, lakeFactor, smoothstep as ramp } from "./map.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { tryLoadTexture } from "./materials/loadTexture.ts";
import { BARK_SET } from "./materials/textureManifest.ts";

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
  { name: "blueGrama", hMin: 0.10, hMax: 0.22, wMin: 0.62, wMax: 0.92, uv: [0.0, 0.0] },
  { name: "bunchgrass", hMin: 0.22, hMax: 0.44, wMin: 0.72, wMax: 1.08, uv: [0.5, 0.0] },
  { name: "bluestem", hMin: 0.48, hMax: 0.86, wMin: 0.55, wMax: 0.9, uv: [0.0, 0.5] },
  { name: "cheatgrass", hMin: 0.12, hMax: 0.28, wMin: 0.68, wMax: 1.0, uv: [0.5, 0.5] }
];

/** Chance a candidate cell carries grass at all. This is the density dial. */
const GRASS_DENSITY = {
  valley: 0.92,
  ranch: 0.88,
  pines: 0.78,
  foothills: 0.68,
  tribal: 0.5,
  range: 0.42,
  lake: 0.35,
  town: 0.28,
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
 * Panels are sampled with a guard band inset, and blades are rooted just above
 * each panel's bottom edge, so filtering cannot bleed one species into another.
 */
function paintBladePanel(ctx, ox, oy, panel, sp) {
  const root = oy + panel * 0.97;
  for (let i = 0; i < sp.blades; i += 1) {
    const t = (i + 0.5) / sp.blades;
    const x = ox + panel * (0.1 + t * 0.8) + (Math.random() - 0.5) * panel * 0.06;
    const h = panel * sp.tall * (0.62 + Math.random() * 0.38);
    const lean = (Math.random() - 0.5) * panel * sp.lean;
    const w = panel * sp.wide * (0.7 + Math.random() * 0.6);
    const tipX = x + lean;
    const midX = x + lean * 0.45;
    const dry = Math.random() * sp.dry;
    const g = sp.g0 + Math.random() * sp.gv;
    const r = sp.r0 + dry * 70 + Math.random() * 22;
    const b = sp.b0 + Math.random() * 22;
    ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},1)`;
    ctx.beginPath();
    ctx.moveTo(x - w, root);
    ctx.quadraticCurveTo(midX - w * 1.15, root - h * 0.52, tipX, root - h);
    ctx.quadraticCurveTo(midX + w * 0.95, root - h * 0.5, x + w, root);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(${Math.min(255, r + 36) | 0},${Math.min(255, g + 40) | 0},${(b + 18) | 0},0.5)`;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.15, root);
    ctx.quadraticCurveTo(midX, root - h * 0.58, tipX + w * 0.1, root - h * 0.92);
    ctx.quadraticCurveTo(midX + w * 0.25, root - h * 0.5, x + w * 0.2, root);
    ctx.closePath();
    ctx.fill();
  }
}

function bladeTexture() {
  return asCardMap(makeTexture((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const panel = size / 2;
    // Canvas y runs down and texture v runs up, so a species whose atlas offset
    // is v=0 lives in the LOWER half of the canvas.
    const panels = [
      // blue grama: a dense low mat of fine blades
      { ox: 0, oy: panel, blades: 16, tall: 0.42, wide: 0.018, lean: 0.1, dry: 0.25, r0: 44, g0: 112, gv: 58, b0: 30 },
      // bunchgrass: fewer, taller, clumped
      { ox: panel, oy: panel, blades: 9, tall: 0.78, wide: 0.03, lean: 0.16, dry: 0.35, r0: 48, g0: 118, gv: 66, b0: 28 },
      // bluestem: tall and wispy, wet ground
      { ox: 0, oy: 0, blades: 7, tall: 0.95, wide: 0.026, lean: 0.24, dry: 0.2, r0: 40, g0: 126, gv: 70, b0: 34 },
      // cheatgrass: sparse pale straw
      { ox: panel, oy: 0, blades: 8, tall: 0.5, wide: 0.024, lean: 0.2, dry: 0.85, r0: 96, g0: 126, gv: 52, b0: 44 }
    ];
    for (const sp of panels) {
      paintBladePanel(ctx, sp.ox, sp.oy, panel, sp);
    }
  }, 512));
}

function leafTexture() {
  // Conifer sprig drawn edge-to-edge so alpha-cut cards read as foliage mass,
  // not scattered blobs. Swap for a scanned atlas when one is packed.
  return asCardMap(makeTexture((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const stemY = size * 0.52;

    ctx.strokeStyle = "rgba(58,42,26,1)";
    ctx.lineCap = "round";
    for (let i = 0; i < 6; i += 1) {
      ctx.lineWidth = 8 - i;
      ctx.beginPath();
      ctx.moveTo(0, stemY + Math.sin(i) * 2);
      ctx.quadraticCurveTo(size * 0.5, stemY - size * 0.04, size * (0.74 + i * 0.04), stemY + size * 0.012);
      ctx.stroke();
    }

    const needle = (x0, y0, len, ang, shade, width) => {
      ctx.strokeStyle = shade;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
      ctx.stroke();
    };
    for (let x = 1; x < size * 0.96; x += 1.55) {
      const t = x / (size * 0.96);
      const taper = 1 - t * 0.58;
      const spread = size * 0.34 * taper;
      const jitter = Math.sin(x * 0.55) * 4;
      for (let k = 0; k < 6; k += 1) {
        const up = k % 2 === 0 ? -1 : 1;
        const g = 88 + Math.random() * 82;
        const r = 30 + Math.random() * 32;
        const bl = 26 + Math.random() * 28;
        const shade = `rgba(${r | 0},${g | 0},${bl | 0},${0.78 + Math.random() * 0.22})`;
        const ang = up * (Math.PI / 2) + (Math.random() - 0.5) * 1.2 - 0.2;
        needle(x, stemY + jitter * 0.3, spread * (0.5 + Math.random() * 0.85), ang, shade, 1.15 + Math.random() * 1.7);
      }
    }
    for (let i = 0; i < 120; i += 1) {
      const x = Math.random() * size * 0.96;
      const t = x / (size * 0.96);
      const up = Math.random() < 0.5 ? -1 : 1;
      const g = 100 + Math.random() * 68;
      needle(
        x,
        stemY + (Math.random() - 0.5) * 8,
        size * 0.38 * (1 - t * 0.55) * (0.85 + Math.random() * 0.55),
        up * (Math.PI / 2) + (Math.random() - 0.5) * 0.95 - 0.18,
        `rgba(${(28 + Math.random() * 28) | 0},${g | 0},${(24 + Math.random() * 24) | 0},0.92)`,
        1.05 + Math.random()
      );
    }
  }, 512));
}

function sageTexture() {
  return asCardMap(makeTexture((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    for (let i = 0; i < 28; i += 1) {
      const cx = size * (0.18 + Math.random() * 0.64);
      const cy = size * (0.22 + Math.random() * 0.55);
      const rx = size * (0.1 + Math.random() * 0.18);
      const ry = size * (0.09 + Math.random() * 0.16);
      const g = 92 + Math.random() * 50;
      const r = 68 + Math.random() * 36;
      const b = 48 + Math.random() * 28;
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${0.55 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, (Math.random() - 0.5) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(72,52,32,0.85)";
    ctx.lineCap = "round";
    for (let i = 0; i < 9; i += 1) {
      ctx.lineWidth = 2 + Math.random() * 3;
      const x = size * (0.28 + Math.random() * 0.44);
      ctx.beginPath();
      ctx.moveTo(x, size);
      ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 18, size * 0.55, x + (Math.random() - 0.5) * 28, size * (0.18 + Math.random() * 0.25));
      ctx.stroke();
    }
  }, 256));
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
      if (seeded(i * 17 + t * 91) < 0.08) {
        continue;
      }
      const a = (i / count) * Math.PI * 2 + f * 1.7 + seeded(i + t * 13) * 0.35;
      const radius = (baseRadius * Math.pow(1 - f, 0.55) + 0.55) * (0.82 + seeded(i + t * 17) * 0.38);
      const cardLen = radius * 1.5;
      const cardW = radius * 1.05;
      const droop = -(0.36 - 0.34 * f + seeded(i + t * 31) * 0.18);
      const tierAo = 0.46 + 0.54 * Math.pow(f, 0.6);
      for (const fold of FOLD) {
        const w = fold.tilt === 0 ? cardW : cardW * 0.72;
        const geo = new THREE.PlaneGeometry(cardLen, w);
        paintAo(geo, (pos, v) => {
          const outward = (pos.getX(v) + cardLen / 2) / cardLen;
          return tierAo * (0.55 + 0.45 * outward) * fold.ao;
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
        leaves.push(geo);
      }

      const limbLen = cardLen * 0.8;
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
    leaves.push(geo);
  }
  return { leaves: mergeGeometries(leaves), limbs: mergeGeometries(limbs) };
}

function makePineTrunk(height, baseR, topR) {
  const shaft = new THREE.CylinderGeometry(topR, baseR, height, 8);
  shaft.translate(0, height / 2 + 0.08, 0);
  const flareH = Math.max(0.38, height * 0.11);
  const flare = new THREE.CylinderGeometry(baseR, baseR * 1.7, flareH, 8);
  flare.translate(0, flareH / 2, 0);
  return mergeGeometries([shaft, flare]);
}

/** Height of the blade card in makeGrassTuft, in metres. */
const GRASS_CARD_H = 0.5;

function makeGrassTuft() {
  // Three planes at 60° — not 90° — so DoubleSide does not draw coplanar pairs.
  const geos = [];
  const w = 0.56;
  const h = GRASS_CARD_H;
  for (let i = 0; i < 3; i += 1) {
    const geo = new THREE.PlaneGeometry(w, h, 1, 2);
    geo.translate((seeded(i + 3) - 0.5) * 0.06, h * 0.5, (seeded(i + 9) - 0.5) * 0.06);
    geo.rotateY((i / 3) * Math.PI);
    geos.push(geo);
  }
  return mergeGeometries(geos);
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
    const w = 0.72 + seeded(i + 2) * 0.26;
    const h = 0.44 + seeded(i + 5) * 0.22;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate((seeded(i + 8) - 0.5) * 0.18, h * 0.42, (seeded(i + 11) - 0.5) * 0.18);
    geo.rotateY(angles[i]);
    geos.push(geo);
  }
  return mergeGeometries(geos);
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
    geo.rotateY(a);
    geo.rotateZ((seeded(i + 25) - 0.5) * 0.7);
    geo.rotateX((seeded(i + 28) - 0.5) * 0.55);
    geo.translate(Math.cos(a) * r, y, Math.sin(a) * r);
    leaves.push(geo);
  }
  return mergeGeometries(leaves);
}

export async function loadVegetationMaps() {
  const [barkAlbedo, barkNormal] = await Promise.all([
    tryLoadTexture(BARK_SET.albedo, "albedo"),
    tryLoadTexture(BARK_SET.normal, "linear")
  ]);
  return { barkAlbedo, barkNormal };
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

  const leafTex = leafTexture();
  const leafSample = texture(leafTex, uv());
  const sageTex = sageTexture();
  const sageSample = texture(sageTex, uv());
  const broadTex = broadleafTexture();
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

  const makeFoliageMat = (sample, tint, windLo, windHi, alphaTest) => {
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
    return m;
  };

  const pineLeafMat = makeFoliageMat(leafSample, vec3(0.9, 1.15, 0.7), 2.8, 8.2, 0.4);
  const sageMat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.32 });
  {
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const albedo = sageSample.rgb.mul(vec3(0.95, 1.05, 0.82));
    sageMat.colorNode = vec4(albedo.mul(back(viewDir).mul(warmGreen).mul(0.35).add(1)), sageSample.a);
    sageMat.positionNode = positionLocal.add(windBend(uv().y.pow(2).mul(0.45)));
  }
  const cottonLeafMat = makeFoliageMat(broadSample, vec3(1.05, 1.12, 0.72), 2.0, 7.4, 0.38);

  // Four silhouettes, not three, and spread further apart in proportion: a bare
  // -legged spire, the standard conifer, a broad mid-height tree, and a squat
  // scrubby juniper for the dry biomes. Three near-identical cones gave the
  // forest one repeated outline however many instances it drew.
  const PINE = [
    {
      // Tall spire, high crown, thin trunk.
      near: makePineCanopy(8, 8, 1.85, 4.2, 12.4),
      far: makePineCanopy(3, 5, 1.85, 4.2, 12.4),
      trunk: makePineTrunk(6.4, 0.3, 0.11)
    },
    {
      near: makePineCanopy(6, 7, 2.55, 2.4, 7.7),
      far: makePineCanopy(3, 4, 2.55, 2.4, 7.7),
      trunk: makePineTrunk(4.2, 0.34, 0.16)
    },
    {
      near: makePineCanopy(5, 9, 3.2, 1.9, 6.4),
      far: makePineCanopy(3, 5, 3.2, 1.9, 6.4),
      trunk: makePineTrunk(3.5, 0.4, 0.18)
    },
    {
      // Juniper: wide, low, almost no clear trunk.
      near: makePineCanopy(4, 10, 3.05, 0.6, 4.1),
      far: makePineCanopy(2, 6, 3.05, 0.6, 4.1),
      trunk: makePineTrunk(1.9, 0.46, 0.26)
    }
  ];

  const MAX = 3200;
  const pines = PINE.map((proto) => {
    const trunkNear = new THREE.InstancedMesh(proto.trunk, bark, MAX);
    const crownNear = new THREE.InstancedMesh(proto.near.leaves, pineLeafMat, MAX);
    const limbNear = new THREE.InstancedMesh(proto.near.limbs, limbMat, MAX);
    const trunkFar = new THREE.InstancedMesh(proto.trunk, bark, MAX);
    const crownFar = new THREE.InstancedMesh(proto.far.leaves, pineLeafMat, MAX);
    const limbFar = new THREE.InstancedMesh(proto.far.limbs, limbMat, MAX);
    for (const mesh of [trunkNear, crownNear, limbNear, trunkFar, crownFar, limbFar]) {
      mesh.count = 0;
      mesh.frustumCulled = false;
    }
    trunkNear.castShadow = true;
    crownNear.castShadow = true;
    limbNear.castShadow = true;
    return { trunkNear, crownNear, limbNear, trunkFar, crownFar, limbFar };
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

  const burnt = new THREE.InstancedMesh(makePineTrunk(5.2, 0.26, 0.1), char, 400);

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
  const BROAD = [
    {
      trunk: makePineTrunk(6.2, 0.36, 0.14),
      near: makeBroadCanopy(32, 3.6, 2.4, 7.6),
      far: makeBroadCanopy(12, 3.6, 2.4, 7.6)
    },
    {
      trunk: makePineTrunk(7.4, 0.22, 0.1),
      near: makeBroadCanopy(24, 1.9, 3.4, 9.2),
      far: makeBroadCanopy(9, 1.9, 3.4, 9.2)
    }
  ];
  const broads = BROAD.map((proto) => {
    const trunkNear = new THREE.InstancedMesh(proto.trunk, cottonBark, MAX_COTTON);
    const crownNear = new THREE.InstancedMesh(proto.near, cottonLeafMat, MAX_COTTON);
    const trunkFar = new THREE.InstancedMesh(proto.trunk, cottonBark, MAX_COTTON);
    const crownFar = new THREE.InstancedMesh(proto.far, cottonLeafMat, MAX_COTTON);
    trunkNear.castShadow = true;
    crownNear.castShadow = true;
    return { trunkNear, crownNear, trunkFar, crownFar };
  });
  const broadMeshes = broads.flatMap((b) => [b.trunkNear, b.crownNear, b.trunkFar, b.crownFar]);
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

  // Ran while `placed < MAX` — the conifer budget. Pines fill 3200 slots long
  // before i reaches 16000, so the loop exited with only 22 of 260 cottonwoods
  // ever placed and the map came out 99.3% conifer. Broadleaf has its own
  // budget, so keep going while either has room.
  for (let i = 0; i < 26000 && (placed < MAX || cottons < MAX_COTTON); i += 1) {
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

    if (placed >= MAX || seeded(i + 21) > plantChance(biome)) {
      continue;
    }
    // Widened from 0.72-1.27 / 0.78-1.93: near-uniform scale was as much of
    // the sameness as the colour was.
    const girth = 0.6 + seeded(i + 4) * 0.85;
    const height = 0.62 + seeded(i + 15) * 1.6;
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

  for (let i = 0; i < 72 && placed < MAX; i += 1) {
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
    const girth = 0.72 + seeded(i + 4) * 0.62;
    const height = 0.78 + seeded(i + 15) * 1.2;
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
  for (let i = 0; i < ranchHero.length && placed < MAX; i += 1) {
    const x = POS.ranch.x + ranchHero[i][0];
    const z = POS.ranch.z + ranchHero[i][1];
    const y = heightAt(x, z);
    const girth = 0.9 + seeded(i + 900) * 0.35;
    const height = 1.05 + seeded(i + 905) * 0.45;
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
    let c = 0;
    for (let i = 0; i < placed; i += 1) {
      if (treeType[i] !== t) {
        continue;
      }
      tintColor.setRGB(treeTint[i * 3], treeTint[i * 3 + 1], treeTint[i * 3 + 2]);
      pines[t].crownNear.setColorAt(c, tintColor);
      pines[t].crownFar.setColorAt(c, tintColor);
      c += 1;
    }
    pines[t].crownNear.instanceColor.needsUpdate = true;
    pines[t].crownFar.instanceColor.needsUpdate = true;
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
      n += 1;
    }
    for (const mesh of [broads[t].trunkNear, broads[t].crownNear]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    broads[t].crownNear.instanceColor.needsUpdate = true;
    broads[t].crownFar.instanceColor.needsUpdate = true;
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

  const RINGS = [
    { cell: 0.62, outer: 34 },
    { cell: 1.05, outer: 82 },
    { cell: 1.9, outer: 168 },
    { cell: 3.4, outer: GRASS_RADIUS }
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
  const grassSampleTex = texture(grassTex, atlasUV);
  const grassView = normalize(cameraPosition.sub(positionWorld));
  const grassCol = grassSampleTex.rgb.mul(mix(tintAttr, vec3(1.08, 1.22, 0.78), uv().y));
  grassMat.colorNode = vec4(grassCol.mul(back(grassView).mul(warmGreen).add(1)), grassSampleTex.a);
  // Hold full cover almost to the edge of the disc, then dissolve over the last
  // stretch. The old 150 -> 205 fade started eroding grass at two thirds of the
  // draw distance, so the world went bald well before the disc actually ended.
  grassMat.opacityNode = float(1).sub(smoothstep(GRASS_FADE_IN, GRASS_FADE_OUT, cameraPosition.sub(positionWorld).length()));
  sageMat.opacityNode = float(1).sub(smoothstep(SAGE_FADE_IN, SAGE_FADE_OUT, cameraPosition.sub(positionWorld).length()));
  grassMat.positionNode = positionLocal.add(windBend(uv().y.pow(2)));

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
    const wGrow = 1 + t * 1.6;
    const wMul = (sp.wMin + (sp.wMax - sp.wMin) * hash2(ix, jz, 5)) * wGrow;

    dummy.position.set(x, heightAt(x, z), z);
    dummy.rotation.set(0, hash2(ix, jz, 3) * Math.PI * 2, 0);
    // The card is GRASS_CARD_H tall, so scale to the metric height we want.
    dummy.scale.set(wMul, (hMet * hGrow) / GRASS_CARD_H, wMul);
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
    if (y > 78 || y < 9) {
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
    scene.add(p.trunkNear, p.crownNear, p.limbNear, p.trunkFar, p.crownFar, p.limbFar);
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
    for (let i = 0; i < placed; i += 1) {
      const t = treeType[i];
      const dx = treePos[i * 3] - cameraPos.x;
      const dz = treePos[i * 3 + 2] - cameraPos.z;
      const isNear = dx * dx + dz * dz < LOD_DIST_SQ;
      lodDummy.position.set(treePos[i * 3], treePos[i * 3 + 1], treePos[i * 3 + 2]);
      lodDummy.rotation.set(treeLeanX[i], treeRot[i], treeLeanZ[i]);
      lodDummy.scale.set(treeGirth[i], treeHeight[i], treeGirth[i]);
      lodDummy.updateMatrix();
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
      pines[t].crownNear.instanceColor.needsUpdate = true;
      pines[t].crownFar.instanceColor.needsUpdate = true;
    }

    const broadNear = new Array(broads.length).fill(0);
    const broadFar = new Array(broads.length).fill(0);
    for (let i = 0; i < cottons; i += 1) {
      const t = cottonType[i];
      const dx = cottonPos[i * 3] - cameraPos.x;
      const dz = cottonPos[i * 3 + 2] - cameraPos.z;
      lodDummy.position.set(cottonPos[i * 3], cottonPos[i * 3 + 1], cottonPos[i * 3 + 2]);
      lodDummy.rotation.set(0, cottonRot[i], 0);
      const s = cottonScale[i];
      lodDummy.scale.set(s, s, s);
      lodDummy.updateMatrix();
      tintColor.setRGB(cottonTint[i * 3], cottonTint[i * 3 + 1], cottonTint[i * 3 + 2]);
      if (dx * dx + dz * dz < LOD_DIST_SQ) {
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
      broads[t].crownNear.instanceColor.needsUpdate = true;
      broads[t].crownFar.instanceColor.needsUpdate = true;
    }
  }

  return {
    sunDir,
    windFreq,
    windStrength,
    gustFreq,
    gustStrength,
    grassInstances: g,
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

export function createSmoke(scene) {
  const group = new THREE.Group();
  const origin = { x: POS.burn.x - 22, z: POS.burn.z + 10 };
  const baseY = heightAt(origin.x, origin.z) + 2.8;
  for (let i = 0; i < 8; i += 1) {
    const t = i / 7;
    const mat = new THREE.MeshBasicNodeMaterial({
      color: new THREE.Color().lerpColors(new THREE.Color(0x6a6a6a), new THREE.Color(0xc8c8c8), t),
      transparent: true,
      opacity: 0.5 * (1 - t * 0.5)
    });
    const puff = new THREE.Mesh(new THREE.SphereGeometry(2.5 + i * 1.6, 10, 10), mat);
    puff.position.set(origin.x + i * 0.3, baseY + 2 + i * 4.5, origin.z + i * 0.6);
    puff.userData.phase = i;
    group.add(puff);
  }
  scene.add(group);
  return group;
}
