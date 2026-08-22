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
  attribute
} from "three/tsl";
import { heightAt, normalAt } from "./heightfield.js";
import { barkTexture, makeTexture } from "./world.js";
import { addCylinderCollider } from "./collision.js";
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

function grassWeight(x, z, creek, road) {
  const biome = biomeAt(x, z);
  const base = GRASSINESS[biome] ?? 0;
  const slope = 1 - normalAt(x, z).y;
  const slopeFactor = 1 - ramp(0.18, 0.5, slope);
  const lake = lakeFactor(x, z);
  return base * slopeFactor * (1 - creek * 0.8) * (1 - road) * (1 - lake * 0.5);
}

function skipGrass(x, z, creek, road) {
  const inRanch = Math.hypot(x - POS.ranch.x, z - POS.ranch.z) < 95;
  if (!inRanch) {
    if (lakeFactor(x, z) > 0.35) {
      return true;
    }
    if (Math.hypot(x - POS.silverCreek.x, z - POS.silverCreek.z) < 80) {
      return true;
    }
  }
  if (creek > 0.35) {
    return true;
  }
  if (road > 0.3) {
    return true;
  }
  if (Math.hypot(x - POS.ranch.x, z - (POS.ranch.z - 8)) < 14) {
    return true;
  }
  if (Math.hypot(x - (POS.ranch.x - 28), z - (POS.ranch.z + 18)) < 10) {
    return true;
  }
  return false;
}

function asCardMap(tex) {
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function bladeTexture() {
  return asCardMap(makeTexture((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const blades = 7;
    for (let i = 0; i < blades; i += 1) {
      const t = (i + 0.5) / blades;
      const x = size * (0.12 + t * 0.76) + (Math.random() - 0.5) * size * 0.06;
      const h = size * (0.58 + Math.random() * 0.4);
      const lean = (Math.random() - 0.5) * size * 0.18;
      const w = size * (0.028 + Math.random() * 0.034);
      const tipX = x + lean;
      const midX = x + lean * 0.45;
      const dry = Math.random() * 0.45;
      const g = 118 + Math.random() * 70;
      const r = 42 + dry * 70 + Math.random() * 22;
      const b = 28 + Math.random() * 22;
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},1)`;
      ctx.beginPath();
      ctx.moveTo(x - w, size);
      ctx.quadraticCurveTo(midX - w * 1.15, size - h * 0.52, tipX, size - h);
      ctx.quadraticCurveTo(midX + w * 0.95, size - h * 0.5, x + w, size);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(${Math.min(255, r + 36) | 0},${Math.min(255, g + 40) | 0},${b + 18 | 0},0.55)`;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.15, size);
      ctx.quadraticCurveTo(midX, size - h * 0.58, tipX + w * 0.1, size - h * 0.92);
      ctx.quadraticCurveTo(midX + w * 0.25, size - h * 0.5, x + w * 0.2, size);
      ctx.closePath();
      ctx.fill();
    }
  }, 256));
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

function makeGrassTuft() {
  // Three planes at 60° — not 90° — so DoubleSide does not draw coplanar pairs.
  const geos = [];
  const w = 0.56;
  const h = 0.5;
  for (let i = 0; i < 3; i += 1) {
    const geo = new THREE.PlaneGeometry(w, h, 1, 2);
    geo.translate((seeded(i + 3) - 0.5) * 0.06, h * 0.5, (seeded(i + 9) - 0.5) * 0.06);
    geo.rotateY((i / 3) * Math.PI);
    geos.push(geo);
  }
  return mergeGeometries(geos);
}

function makeSageBush() {
  const geos = [];
  const angles = [0.15, 1.05, 2.05, 2.85];
  for (let i = 0; i < angles.length; i += 1) {
    const w = 1.05 + seeded(i + 2) * 0.35;
    const h = 0.85 + seeded(i + 5) * 0.4;
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

  const makeFoliageMat = (sample, tint, windLo, windHi, alphaTest) => {
    const m = new THREE.MeshStandardNodeMaterial({
      side: THREE.DoubleSide,
      alphaTest,
      vertexColors: true
    });
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const vcol = attribute("color", "vec3");
    const albedo = sample.rgb.mul(tint).mul(vcol);
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

  const PINE = [
    {
      near: makePineCanopy(7, 8, 2.15, 3.1, 10.2),
      far: makePineCanopy(3, 5, 2.15, 3.1, 10.2),
      trunk: makePineTrunk(5.4, 0.32, 0.13)
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

  const burnt = new THREE.InstancedMesh(makePineTrunk(5.2, 0.26, 0.1), char, 400);

  const dummy = new THREE.Object3D();
  let placed = 0;
  let burned = 0;

  const MAX_COTTON = 260;
  const cottonTrunkGeo = makePineTrunk(6.2, 0.36, 0.14);
  const cottonNearGeo = makeBroadCanopy(32, 3.6, 2.4, 7.6);
  const cottonFarGeo = makeBroadCanopy(12, 3.6, 2.4, 7.6);
  const cottonTrunkNear = new THREE.InstancedMesh(cottonTrunkGeo, cottonBark, MAX_COTTON);
  const cottonCrownNear = new THREE.InstancedMesh(cottonNearGeo, cottonLeafMat, MAX_COTTON);
  const cottonTrunkFar = new THREE.InstancedMesh(cottonTrunkGeo, cottonBark, MAX_COTTON);
  const cottonCrownFar = new THREE.InstancedMesh(cottonFarGeo, cottonLeafMat, MAX_COTTON);
  cottonTrunkNear.castShadow = true;
  cottonCrownNear.castShadow = true;
  for (const mesh of [cottonTrunkNear, cottonCrownNear, cottonTrunkFar, cottonCrownFar, burnt]) {
    mesh.frustumCulled = false;
  }
  const cottonPos = new Float32Array(MAX_COTTON * 3);
  const cottonScale = new Float32Array(MAX_COTTON);
  const cottonRot = new Float32Array(MAX_COTTON);
  let cottons = 0;

  function pickPineType(biome, n) {
    if (biome === "pines") {
      return n < 0.42 ? 0 : n < 0.78 ? 1 : 2;
    }
    if (biome === "foothills") {
      return n < 0.22 ? 0 : n < 0.62 ? 1 : 2;
    }
    return n < 0.18 ? 0 : n < 0.55 ? 1 : 2;
  }

  for (let i = 0; i < 16000 && placed < MAX; i += 1) {
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

    const riparian = creek > 0.06 && creek < 0.42 && biome !== "burn" && biome !== "badlands" && biome !== "iron";
    if (riparian && cottons < MAX_COTTON && seeded(i + 33) < 0.22) {
      const scale = 0.85 + seeded(i + 4) * 1.15;
      dummy.position.set(x, y, z);
      dummy.rotation.set((seeded(i + 41) - 0.5) * 0.08, seeded(i + 7) * Math.PI * 2, (seeded(i + 43) - 0.5) * 0.08);
      dummy.scale.set(scale * (0.85 + seeded(i + 12) * 0.3), scale, scale * (0.85 + seeded(i + 12) * 0.3));
      dummy.updateMatrix();
      cottonTrunkNear.setMatrixAt(cottons, dummy.matrix);
      cottonCrownNear.setMatrixAt(cottons, dummy.matrix);
      cottonPos[cottons * 3] = x;
      cottonPos[cottons * 3 + 1] = y;
      cottonPos[cottons * 3 + 2] = z;
      cottonScale[cottons] = scale;
      cottonRot[cottons] = dummy.rotation.y;
      addCylinderCollider(x, z, 0.5 * scale);
      cottons += 1;
      continue;
    }

    if (seeded(i + 21) > plantChance(biome)) {
      continue;
    }
    const girth = 0.72 + seeded(i + 4) * 0.55;
    const height = 0.78 + seeded(i + 15) * 1.15;
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
    const y = heightAt(x, z);
    if (i % 5 === 0 && cottons < MAX_COTTON) {
      const scale = 0.95 + seeded(i + 4) * 0.9;
      dummy.position.set(x, y, z);
      dummy.rotation.set((seeded(i + 41) - 0.5) * 0.08, seeded(i + 7) * Math.PI * 2, (seeded(i + 43) - 0.5) * 0.08);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      cottonTrunkNear.setMatrixAt(cottons, dummy.matrix);
      cottonCrownNear.setMatrixAt(cottons, dummy.matrix);
      cottonPos[cottons * 3] = x;
      cottonPos[cottons * 3 + 1] = y;
      cottonPos[cottons * 3 + 2] = z;
      cottonScale[cottons] = scale;
      cottonRot[cottons] = dummy.rotation.y;
      addCylinderCollider(x, z, 0.5 * scale);
      cottons += 1;
      continue;
    }
    const girth = 0.8 + seeded(i + 4) * 0.4;
    const height = 0.9 + seeded(i + 15) * 0.85;
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
  }
  for (const mesh of [cottonTrunkNear, cottonCrownNear]) {
    mesh.count = cottons;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  cottonTrunkFar.count = 0;
  cottonCrownFar.count = 0;
  burnt.count = burned;
  burnt.instanceMatrix.needsUpdate = true;
  burnt.computeBoundingSphere();

  const grassTex = bladeTexture();
  const MAX_GRASS = 100000;
  const grassGeo = makeGrassTuft();

  const tints = new Float32Array(MAX_GRASS * 3);
  const grassMat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.32 });
  const tintAttr = instancedBufferAttribute(tints, "vec3", 3, 0);
  const grassSample = texture(grassTex, uv());
  const grassView = normalize(cameraPosition.sub(positionWorld));
  const grassCol = grassSample.rgb.mul(mix(tintAttr, vec3(1.08, 1.22, 0.78), uv().y));
  grassMat.colorNode = vec4(grassCol.mul(back(grassView).mul(warmGreen).add(1)), grassSample.a);
  grassMat.opacityNode = float(1).sub(smoothstep(150, 205, cameraPosition.sub(positionWorld).length()));
  sageMat.opacityNode = float(1).sub(smoothstep(140, 185, cameraPosition.sub(positionWorld).length()));
  grassMat.positionNode = positionLocal.add(windBend(uv().y.pow(2)));

  const grass = new THREE.InstancedMesh(grassGeo, grassMat, MAX_GRASS);
  grass.castShadow = false;
  grass.frustumCulled = false;

  const MAX_SAGE = 14000;
  const SAGE_RADIUS = 190;
  const sageGeo = makeSageBush();
  const sage = new THREE.InstancedMesh(sageGeo, sageMat, MAX_SAGE);
  sage.castShadow = false;
  sage.frustumCulled = false;

  const GRASS_RADIUS = 210;
  const GRASS_INNER = 130;
  const REBUILD_STEP = 42;
  const INNER_COUNT = Math.floor(MAX_GRASS * 0.88);
  const offsets = new Float32Array(MAX_GRASS * 2);
  for (let i = 0; i < MAX_GRASS; i += 1) {
    const a = seeded(i * 2 + 2) * Math.PI * 2;
    const u = Math.sqrt(seeded(i * 2 + 1));
    const r = i < INNER_COUNT
      ? GRASS_INNER * u
      : GRASS_INNER + (GRASS_RADIUS - GRASS_INNER) * u;
    offsets[i * 2] = Math.cos(a) * r;
    offsets[i * 2 + 1] = Math.sin(a) * r;
  }
  const sageOffsets = new Float32Array(MAX_SAGE * 2);
  for (let i = 0; i < MAX_SAGE; i += 1) {
    const a = seeded(i * 2 + 80) * Math.PI * 2;
    const r = SAGE_RADIUS * Math.sqrt(seeded(i * 2 + 81));
    sageOffsets[i * 2] = Math.cos(a) * r;
    sageOffsets[i * 2 + 1] = Math.sin(a) * r;
  }

  const lastCenter = new THREE.Vector3(POS.ranch.x, 0, POS.ranch.z);
  grass.boundingSphere = new THREE.Sphere(new THREE.Vector3(POS.ranch.x, 16, POS.ranch.z), GRASS_RADIUS + 40);
  sage.boundingSphere = new THREE.Sphere(new THREE.Vector3(POS.ranch.x, 16, POS.ranch.z), SAGE_RADIUS + 40);
  let scatterJob = null;
  let g = 0;
  let shrubs = 0;

  function plantBlade(cx, cz, i, slot) {
    const x = cx + offsets[i * 2];
    const z = cz + offsets[i * 2 + 1];
    const creek = creekFactor(x, z);
    const road = roadFactor(x, z);
    if (skipGrass(x, z, creek, road)) {
      return false;
    }
    const weight = grassWeight(x, z, creek, road);
    if (weight < 0.22) {
      return false;
    }
    const biome = biomeAt(x, z);
    const t = GRASSINESS[biome] ?? 0;
    dummy.position.set(x, heightAt(x, z), z);
    dummy.rotation.set(0, seeded(i + 40) * Math.PI * 2, 0);
    const h = (0.9 + seeded(i + 3) * 0.7) * (0.75 + weight * 0.45);
    const w = 0.85 + seeded(i + 5) * 0.55;
    dummy.scale.set(w, h, w);
    dummy.updateMatrix();
    grass.setMatrixAt(slot, dummy.matrix);
    const dry = biome === "range" || biome === "badlands" || biome === "iron" ? 0.18 : 0;
    tints[slot * 3] = 0.32 + t * 0.22 + seeded(i + 9) * 0.12 + dry;
    tints[slot * 3 + 1] = 0.42 + t * 0.28 + seeded(i + 11) * 0.12 - dry * 0.15;
    tints[slot * 3 + 2] = 0.2 + t * 0.1 + seeded(i + 13) * 0.08 - dry * 0.05;
    return true;
  }

  function plantSage(cx, cz, i, slot) {
    const x = cx + sageOffsets[i * 2];
    const z = cz + sageOffsets[i * 2 + 1];
    const biome = biomeAt(x, z);
    if (seeded(i + 411) > shrubChance(biome)) {
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
    if (normalAt(x, z).y < 0.58) {
      return false;
    }
    const y = heightAt(x, z);
    if (y > 78 || y < 9) {
      return false;
    }
    const s = 0.85 + seeded(i + 419) * 1.05;
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, seeded(i + 421) * Math.PI * 2, 0);
    dummy.scale.set(s * (0.85 + seeded(i + 424) * 0.35), s * (0.75 + seeded(i + 427) * 0.5), s);
    dummy.updateMatrix();
    sage.setMatrixAt(slot, dummy.matrix);
    return true;
  }

  function finishScatter(cx, cz, grassCount, sageCount) {
    grass.count = grassCount;
    grass.instanceMatrix.needsUpdate = true;
    tintAttr.needsUpdate = true;
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
    for (let i = 0; i < MAX_GRASS; i += 1) {
      if (plantBlade(cx, cz, i, grassSlot)) {
        grassSlot += 1;
      }
    }
    for (let i = 0; i < MAX_SAGE; i += 1) {
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
  scene.add(cottonTrunkNear, cottonCrownNear, cottonTrunkFar, cottonCrownFar, burnt, sage, grass, rocks);

  const LOD_DIST = 120;
  const LOD_DIST_SQ = LOD_DIST * LOD_DIST;
  const lodDummy = new THREE.Object3D();

  function bucketTrees(cameraPos) {
    const nearCounts = [0, 0, 0];
    const farCounts = [0, 0, 0];
    for (let i = 0; i < placed; i += 1) {
      const t = treeType[i];
      const dx = treePos[i * 3] - cameraPos.x;
      const dz = treePos[i * 3 + 2] - cameraPos.z;
      const isNear = dx * dx + dz * dz < LOD_DIST_SQ;
      lodDummy.position.set(treePos[i * 3], treePos[i * 3 + 1], treePos[i * 3 + 2]);
      lodDummy.rotation.set(treeLeanX[i], treeRot[i], treeLeanZ[i]);
      lodDummy.scale.set(treeGirth[i], treeHeight[i], treeGirth[i]);
      lodDummy.updateMatrix();
      if (isNear) {
        const n = nearCounts[t];
        pines[t].trunkNear.setMatrixAt(n, lodDummy.matrix);
        pines[t].crownNear.setMatrixAt(n, lodDummy.matrix);
        pines[t].limbNear.setMatrixAt(n, lodDummy.matrix);
        nearCounts[t] = n + 1;
      } else {
        const n = farCounts[t];
        pines[t].trunkFar.setMatrixAt(n, lodDummy.matrix);
        pines[t].crownFar.setMatrixAt(n, lodDummy.matrix);
        pines[t].limbFar.setMatrixAt(n, lodDummy.matrix);
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
    }

    let cottonNearN = 0;
    let cottonFarN = 0;
    for (let i = 0; i < cottons; i += 1) {
      const dx = cottonPos[i * 3] - cameraPos.x;
      const dz = cottonPos[i * 3 + 2] - cameraPos.z;
      lodDummy.position.set(cottonPos[i * 3], cottonPos[i * 3 + 1], cottonPos[i * 3 + 2]);
      lodDummy.rotation.set(0, cottonRot[i], 0);
      const s = cottonScale[i];
      lodDummy.scale.set(s, s, s);
      lodDummy.updateMatrix();
      if (dx * dx + dz * dz < LOD_DIST_SQ) {
        cottonTrunkNear.setMatrixAt(cottonNearN, lodDummy.matrix);
        cottonCrownNear.setMatrixAt(cottonNearN, lodDummy.matrix);
        cottonNearN += 1;
      } else {
        cottonTrunkFar.setMatrixAt(cottonFarN, lodDummy.matrix);
        cottonCrownFar.setMatrixAt(cottonFarN, lodDummy.matrix);
        cottonFarN += 1;
      }
    }
    cottonTrunkNear.count = cottonNearN;
    cottonCrownNear.count = cottonNearN;
    cottonTrunkFar.count = cottonFarN;
    cottonCrownFar.count = cottonFarN;
    cottonTrunkNear.instanceMatrix.needsUpdate = true;
    cottonCrownNear.instanceMatrix.needsUpdate = true;
    cottonTrunkFar.instanceMatrix.needsUpdate = true;
    cottonCrownFar.instanceMatrix.needsUpdate = true;
  }

  return {
    sunDir,
    windFreq,
    windStrength,
    gustFreq,
    gustStrength,
    grassInstances: g,
    update(cameraPos) {
      bucketTrees(cameraPos);
      if (!scatterJob && lastCenter.distanceTo(cameraPos) < REBUILD_STEP) {
        return;
      }
      if (!scatterJob) {
        lastCenter.copy(cameraPos);
        scatterJob = { cx: cameraPos.x, cz: cameraPos.z, i: 0, slot: 0, si: 0, sslot: 0 };
      }
      const { cx, cz } = scatterJob;
      const end = Math.min(MAX_GRASS, scatterJob.i + 2500);
      for (; scatterJob.i < end; scatterJob.i += 1) {
        if (plantBlade(cx, cz, scatterJob.i, scatterJob.slot)) {
          scatterJob.slot += 1;
        }
      }
      const send = Math.min(MAX_SAGE, scatterJob.si + 800);
      for (; scatterJob.si < send; scatterJob.si += 1) {
        if (plantSage(cx, cz, scatterJob.si, scatterJob.sslot)) {
          scatterJob.sslot += 1;
        }
      }
      if (scatterJob.i >= MAX_GRASS && scatterJob.si >= MAX_SAGE) {
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
