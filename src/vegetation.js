/**
 * Targets three@0.185.1 (WebGPURenderer + TSL).
 * Ground truth: node_modules/three/src/nodes/TSL.js
 *
 * Grass (M5) is an instanced alpha-tested ground-cover pass with distance fade,
 * biome+slope-driven placement, canvas blade texture, base tinting, and vertex
 * wind. Trees (M6) are bark cylinders + alpha-cut leaf cards, per-instance
 * variation, canopy AO, translucency, and vertex wind.
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
  if (Math.hypot(x - POS.ranch.x, z - (POS.ranch.z - 8)) < 24) {
    return true;
  }
  if (Math.hypot(x - (POS.ranch.x - 28), z - (POS.ranch.z + 18)) < 10) {
    return true;
  }
  return false;
}

function bladeTexture() {
  return makeTexture((ctx, size) => {
    for (let i = 0; i < 6; i += 1) {
      const x = 10 + Math.random() * (size - 20);
      const h = 55 + Math.random() * 55;
      const w = 4 + Math.random() * 7;
      const g = 120 + Math.random() * 60;
      ctx.fillStyle = `rgba(${40 + Math.random() * 30},${g * 0.6},${30},1)`;
      ctx.beginPath();
      ctx.moveTo(x - w, size);
      ctx.quadraticCurveTo(x - w * 1.1, size - h * 0.55, x + w * 0.3, size - h);
      ctx.quadraticCurveTo(x + w, size - h * 0.55, x + w, size);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(${70 + Math.random() * 30},${g},${45},0.55)`;
      ctx.beginPath();
      ctx.moveTo(x - w * 0.3, size);
      ctx.quadraticCurveTo(x, size - h * 0.6, x + w * 0.15, size - h * 0.8);
      ctx.quadraticCurveTo(x + w * 0.4, size - h * 0.6, x + w * 0.3, size);
      ctx.closePath();
      ctx.fill();
    }
  }, 64);
}

function leafTexture() {
  // A conifer branch sprig: one woody stem running the width of the card with
  // dense needle pairs along it. Drawn edge-to-edge so alpha-cut cards read as
  // continuous foliage rather than the scattered blobs a low-coverage atlas
  // produces. Sourced procedurally because the sandbox has no network access —
  // swap in a scanned leaf atlas when one is available (see §3.2 of
  // docs/TERRAIN_MATERIALS_HANDOFF.md).
  return makeTexture((ctx, size) => {
    ctx.clearRect(0, 0, size, size);
    const stemY = size * 0.52;

    // Woody stem, tapering out toward the branch tip.
    ctx.strokeStyle = "rgba(58,42,26,1)";
    ctx.lineCap = "round";
    for (let i = 0; i < 6; i += 1) {
      ctx.lineWidth = 7 - i;
      ctx.beginPath();
      ctx.moveTo(0, stemY + Math.sin(i) * 2);
      ctx.quadraticCurveTo(size * 0.5, stemY - size * 0.03, size * (0.72 + i * 0.045), stemY + size * 0.01);
      ctx.stroke();
    }

    // Needle fans: dense along the stem, shortening toward the tip.
    const needle = (x0, y0, len, ang, shade, width) => {
      ctx.strokeStyle = shade;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
      ctx.stroke();
    };
    for (let x = 2; x < size * 0.94; x += 2.1) {
      const t = x / (size * 0.94);
      const taper = 1 - t * 0.62;
      const spread = size * 0.30 * taper;
      const jitter = Math.sin(x * 0.7) * 3;
      for (let k = 0; k < 5; k += 1) {
        const up = k % 2 === 0 ? -1 : 1;
        const g = 92 + Math.random() * 74;
        const r = 34 + Math.random() * 30;
        const bl = 30 + Math.random() * 26;
        const a = 0.72 + Math.random() * 0.28;
        const shade = `rgba(${r | 0},${g | 0},${bl | 0},${a})`;
        const ang = up * (Math.PI / 2) + (Math.random() - 0.5) * 1.15 - 0.22;
        const len = spread * (0.55 + Math.random() * 0.75);
        needle(x, stemY + jitter * 0.35, len, ang, shade, 1.1 + Math.random() * 1.5);
      }
    }

    // A few longer needles breaking the silhouette so the card edge is not
    // a straight cut.
    for (let i = 0; i < 90; i += 1) {
      const x = Math.random() * size * 0.95;
      const t = x / (size * 0.95);
      const up = Math.random() < 0.5 ? -1 : 1;
      const g = 104 + Math.random() * 60;
      needle(
        x,
        stemY + (Math.random() - 0.5) * 6,
        size * 0.34 * (1 - t * 0.6) * (0.9 + Math.random() * 0.5),
        up * (Math.PI / 2) + (Math.random() - 0.5) * 0.9 - 0.2,
        `rgba(${(30 + Math.random() * 26) | 0},${g | 0},${(28 + Math.random() * 22) | 0},0.9)`,
        1.0 + Math.random()
      );
    }
  }, 256);
}

/**
 * A conifer canopy: whorls of branch cards on tiers of shrinking radius. Lower
 * tiers droop away from the trunk, upper tiers sit nearly flat, so adjacent
 * tiers interlock into one conical mass instead of stacking as separate
 * shelves. Each branch is a tent of two folded planes plus a flat skirt, so
 * some face is presented to the viewer from any angle — a single horizontal
 * card foreshortens to an invisible sliver at eye level.
 *
 * Vertex colors bake ambient occlusion: darker toward the trunk (the card's
 * inner edge), darker on lower tiers which sit under the canopy above, and
 * darker on the folded faces than the flat skirt.
 *
 * Returns { leaves, limbs } as merged geometries (separate materials).
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
    // Ease the tier height so upper whorls bunch together: constant spacing
    // plus shrinking radius opened a band of sky under the tip.
    const y = baseY + span * Math.pow(f, 0.8);
    const radius = baseRadius * Math.pow(1 - f, 0.55) + 0.55;
    const tierAo = 0.46 + 0.54 * Math.pow(f, 0.6);
    const count = Math.max(3, Math.round(cardsPerTier * (1 - f * 0.45)));
    for (let i = 0; i < count; i += 1) {
      const a = (i / count) * Math.PI * 2 + f * 1.7;
      const cardLen = radius * 1.5;
      const cardW = radius * 1.05;
      const droop = -(0.36 - 0.34 * f + seeded(i + t * 31) * 0.14);
      for (const fold of FOLD) {
        const w = fold.tilt === 0 ? cardW : cardW * 0.72;
        const geo = new THREE.PlaneGeometry(cardLen, w);
        const pos = geo.attributes.position;
        const colors = new Float32Array(pos.count * 3);
        for (let v = 0; v < pos.count; v += 1) {
          // Card local +X runs outward from the trunk once rotated, so the
          // inner edge is the occluded one.
          const outward = (pos.getX(v) + cardLen / 2) / cardLen;
          const ao = tierAo * (0.55 + 0.45 * outward) * fold.ao;
          colors[v * 3] = ao;
          colors[v * 3 + 1] = ao;
          colors[v * 3 + 2] = ao;
        }
        geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
        // Lay the card flat, fold it around the branch axis, droop the tip,
        // then swing it out around the trunk.
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
  // Apex leader: a short needle-wrapped cone continuing the top whorl into a
  // solid tip, so the crown doesn't read as a detached tuft.
  {
    const h = span * 0.24 + 0.7;
    const geo = new THREE.CylinderGeometry(0.03, 0.72, h, 7, 1);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v += 1) {
      const t = (pos.getY(v) + h / 2) / h;
      const ao = 0.48 + 0.44 * t;
      colors[v * 3] = ao;
      colors[v * 3 + 1] = ao;
      colors[v * 3 + 2] = ao;
    }
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.translate(0, topY + h * 0.42, 0);
    leaves.push(geo);
  }
  return { leaves: mergeGeometries(leaves), limbs: mergeGeometries(limbs) };
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

  const sunDir = uniform(new THREE.Vector3(0, 1, 0));
  const windFreq = uniform(1.3);
  const windStrength = uniform(0.05);
  const gustFreq = uniform(3.2);
  const gustStrength = uniform(0.09);
  const warmGreen = uniform(new THREE.Vector3(0.35, 0.55, 0.25));
  const windDir = normalize(vec3(1.0, 0.0, 0.6));

  // ---------------- Trees ----------------
  const MAX = 3200;
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.34, 4.2, 8);
  trunkGeo.translate(0, 2.1, 0);

  const leafTex = leafTexture();
  const leafSample = texture(leafTex, uv());
  const back = (viewDir) => max(float(0), dot(viewDir, sunDir).negate());

  const windBend = (profile) => {
    const sway = sin(time.mul(windFreq).add(positionWorld.x.mul(0.12)).add(positionWorld.z.mul(0.16)));
    const gust = sin(time.mul(gustFreq).add(positionWorld.x.mul(0.6)).add(positionWorld.z.mul(0.9)));
    return windDir.mul(sway.mul(windStrength).add(gust.mul(gustStrength)).mul(profile));
  };

  const canopyNear = makePineCanopy(6, 7, 2.5, 2.4, 7.7);
  const canopyFar = makePineCanopy(3, 4, 2.5, 2.4, 7.7);

  const makeLeafMat = () => {
    const m = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.4, vertexColors: true });
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const vcol = attribute("color", "vec3");
    const albedo = leafSample.rgb.mul(vec3(0.9, 1.15, 0.7)).mul(vcol);
    m.colorNode = vec4(albedo.mul(back(viewDir).mul(warmGreen).mul(0.6).add(1)), leafSample.a);
    m.positionNode = positionLocal.add(windBend(smoothstep(2.8, 8.2, positionGeometry.y).pow(2)));
    return m;
  };

  // Per-instance LOD: a near/far mesh pair. THREE.LOD can't do this (it measures
  // distance from the LOD object's own origin, so a whole-forest InstancedMesh
  // would flip every tree at once). Instead we keep per-instance world positions
  // and, each frame, bucket each tree into near or far by camera distance and
  // rewrite the instance matrices of the two pairs.
  const trunkNear = new THREE.InstancedMesh(trunkGeo, bark, MAX);
  const crownNear = new THREE.InstancedMesh(canopyNear.leaves, makeLeafMat(), MAX);
  const limbNear = new THREE.InstancedMesh(canopyNear.limbs, limbMat, MAX);
  const trunkFar = new THREE.InstancedMesh(trunkGeo, bark, MAX);
  const crownFar = new THREE.InstancedMesh(canopyFar.leaves, makeLeafMat(), MAX);
  const limbFar = new THREE.InstancedMesh(canopyFar.limbs, limbMat, MAX);
  const treePos = new Float32Array(MAX * 3);
  const treeScale = new Float32Array(MAX);
  const treeRot = new Float32Array(MAX);


  const burnt = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.28, 5.5, 5), char, 400);

  trunkNear.castShadow = true;
  crownNear.castShadow = true;
  limbNear.castShadow = true;

  const dummy = new THREE.Object3D();
  let placed = 0;
  let burned = 0;
  for (let i = 0; i < 14000 && placed < MAX; i += 1) {
    const x = (seeded(i + 2) - 0.5) * WORLD.width * 0.96;
    const z = (seeded(i + 9) - 0.5) * WORLD.depth * 0.96;
    if (inClearing(x, z)) {
      continue;
    }
    const biome = biomeAt(x, z);
    if (seeded(i + 21) > plantChance(biome)) {
      continue;
    }
    const y = heightAt(x, z);
    if (y > 92 || y < 8) {
      continue;
    }
    if (normalAt(x, z).y < 0.62) {
      continue;
    }
    const scale = 0.85 + seeded(i + 4) * 1.4;
    if (biome === "burn" && burned < 400) {
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, seeded(i + 7) * Math.PI * 2, 0);
      dummy.scale.set(scale, scale * (0.6 + seeded(i + 11) * 0.5), scale);
      dummy.updateMatrix();
      burnt.setMatrixAt(burned, dummy.matrix);
      addCylinderCollider(x, z, 0.28 * scale);
      burned += 1;
      continue;
    }
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, seeded(i + 7) * Math.PI * 2, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunkNear.setMatrixAt(placed, dummy.matrix);
    crownNear.setMatrixAt(placed, dummy.matrix);
    limbNear.setMatrixAt(placed, dummy.matrix);
    treePos[placed * 3] = x;
    treePos[placed * 3 + 1] = y;
    treePos[placed * 3 + 2] = z;
    treeScale[placed] = scale;
    treeRot[placed] = seeded(i + 7) * Math.PI * 2;
    addCylinderCollider(x, z, 0.45 * scale);
    placed += 1;
  }
  for (const mesh of [trunkNear, crownNear, limbNear]) {
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  trunkFar.count = 0;
  crownFar.count = 0;
  limbFar.count = 0;
  burnt.count = burned;
  burnt.instanceMatrix.needsUpdate = true;
  burnt.computeBoundingSphere();

  // ---------------- Grass ----------------
  const grassTex = bladeTexture();
  const MAX_GRASS = 120000;
  const grassGeo = new THREE.PlaneGeometry(0.2, 0.18);
  grassGeo.translate(0, 0.09, 0);

  const tints = new Float32Array(MAX_GRASS * 3);
  const grassMat = new THREE.MeshStandardNodeMaterial({ side: THREE.DoubleSide, alphaTest: 0.12 });
  const tintAttr = instancedBufferAttribute(tints, "vec3", 3, 0);
  const grassSample = texture(grassTex, uv());
  const grassView = normalize(cameraPosition.sub(positionWorld));
  const grassCol = grassSample.rgb.mul(mix(tintAttr, vec3(1.05, 1.25, 0.85), uv().y));
  grassMat.colorNode = vec4(grassCol.mul(back(grassView).mul(warmGreen).add(1)), grassSample.a);
  // Fade on the inner-disc rim. Stretching GRASS_RADIUS alone left 62% of
  // blades inside 80 m, so the follow-circle never moved.
  grassMat.opacityNode = float(1).sub(smoothstep(150, 205, cameraPosition.sub(positionWorld).length()));
  grassMat.positionNode = positionLocal.add(windBend(uv().y.pow(2)));

  const grass = new THREE.InstancedMesh(grassGeo, grassMat, MAX_GRASS);
  grass.castShadow = false;
  grass.frustumCulled = false;

  // GRASS_INNER is the disc you actually see. Keep a short skirt past it so
  // the fade has blades to dissolve instead of a density cliff.
  const GRASS_RADIUS = 210;
  const GRASS_INNER = 160;
  const REBUILD_STEP = 42;
  const INNER_COUNT = Math.floor(MAX_GRASS * 0.82);
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

  const lastCenter = new THREE.Vector3(POS.ranch.x, 0, POS.ranch.z);
  grass.boundingSphere = new THREE.Sphere(new THREE.Vector3(POS.ranch.x, 16, POS.ranch.z), GRASS_RADIUS + 40);
  let scatterJob = null;
  let g = 0;

  function plantBlade(cx, cz, i, slot) {
    const x = cx + offsets[i * 2];
    const z = cz + offsets[i * 2 + 1];
    const creek = creekFactor(x, z);
    const road = roadFactor(x, z);
    if (skipGrass(x, z, creek, road)) {
      return false;
    }
    const weight = grassWeight(x, z, creek, road);
    if (weight < 0.28) {
      return false;
    }
    const biome = biomeAt(x, z);
    const t = GRASSINESS[biome] ?? 0;
    dummy.position.set(x, heightAt(x, z), z);
    dummy.rotation.set(0, seeded(i + 40) * Math.PI * 2, 0);
    const h = (0.75 + seeded(i + 3) * 0.4) * (0.7 + weight * 0.3);
    dummy.scale.set(1, h, 1);
    dummy.updateMatrix();
    grass.setMatrixAt(slot, dummy.matrix);
    tints[slot * 3] = 0.3 + t * 0.25 + seeded(i + 9) * 0.12;
    tints[slot * 3 + 1] = 0.4 + t * 0.3 + seeded(i + 11) * 0.12;
    tints[slot * 3 + 2] = 0.22 + t * 0.12 + seeded(i + 13) * 0.08;
    return true;
  }

  function finishScatter(cx, cz, count) {
    grass.count = count;
    grass.instanceMatrix.needsUpdate = true;
    tintAttr.needsUpdate = true;
    grass.boundingSphere.center.set(cx, heightAt(cx, cz), cz);
    grass.boundingSphere.radius = GRASS_RADIUS + 40;
    g = count;
  }

  function scatterGrass(cx, cz) {
    let slot = 0;
    for (let i = 0; i < MAX_GRASS; i += 1) {
      if (plantBlade(cx, cz, i, slot)) {
        slot += 1;
      }
    }
    finishScatter(cx, cz, slot);
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

  scene.add(trunkNear, crownNear, limbNear, trunkFar, crownFar, limbFar, burnt, grass, rocks);

  const LOD_DIST = 120;
  const LOD_DIST_SQ = LOD_DIST * LOD_DIST;
  const lodDummy = new THREE.Object3D();
  function bucketTrees(cameraPos) {
    let nearCount = 0;
    let farCount = 0;
    for (let i = 0; i < placed; i += 1) {
      const dx = treePos[i * 3] - cameraPos.x;
      const dz = treePos[i * 3 + 2] - cameraPos.z;
      const isNear = dx * dx + dz * dz < LOD_DIST_SQ;
      lodDummy.position.set(treePos[i * 3], treePos[i * 3 + 1], treePos[i * 3 + 2]);
      lodDummy.rotation.set(0, treeRot[i], 0);
      lodDummy.scale.set(treeScale[i], treeScale[i], treeScale[i]);
      lodDummy.updateMatrix();
      if (isNear) {
        trunkNear.setMatrixAt(nearCount, lodDummy.matrix);
        crownNear.setMatrixAt(nearCount, lodDummy.matrix);
        limbNear.setMatrixAt(nearCount, lodDummy.matrix);
        nearCount += 1;
      } else {
        trunkFar.setMatrixAt(farCount, lodDummy.matrix);
        crownFar.setMatrixAt(farCount, lodDummy.matrix);
        limbFar.setMatrixAt(farCount, lodDummy.matrix);
        farCount += 1;
      }
    }
    trunkNear.count = nearCount;
    crownNear.count = nearCount;
    limbNear.count = nearCount;
    trunkFar.count = farCount;
    crownFar.count = farCount;
    limbFar.count = farCount;
    trunkNear.instanceMatrix.needsUpdate = true;
    crownNear.instanceMatrix.needsUpdate = true;
    limbNear.instanceMatrix.needsUpdate = true;
    trunkFar.instanceMatrix.needsUpdate = true;
    crownFar.instanceMatrix.needsUpdate = true;
    limbFar.instanceMatrix.needsUpdate = true;
  }

  return {
    sunDir,
    windFreq,
    windStrength,
    gustFreq,
    gustStrength,
    grassInstances: g,
    /** Re-scatters the grass disc when the camera has moved far enough. */
    update(cameraPos) {
      bucketTrees(cameraPos);
      if (!scatterJob && lastCenter.distanceTo(cameraPos) < REBUILD_STEP) {
        return;
      }
      if (!scatterJob) {
        lastCenter.copy(cameraPos);
        scatterJob = { cx: cameraPos.x, cz: cameraPos.z, i: 0, slot: 0 };
      }
      const { cx, cz } = scatterJob;
      const end = Math.min(MAX_GRASS, scatterJob.i + 2500);
      for (; scatterJob.i < end; scatterJob.i += 1) {
        if (plantBlade(cx, cz, scatterJob.i, scatterJob.slot)) {
          scatterJob.slot += 1;
        }
      }
      if (scatterJob.i >= MAX_GRASS) {
        finishScatter(cx, cz, scatterJob.slot);
        scatterJob = null;
      }
    },
    treeInstances: placed,
    burntInstances: burned
  };
}

export function createSmoke(scene) {
  const group = new THREE.Group();
  // Anchor the plume to the burn-site chimney (pines.js) so it reads as smoke
  // rising from a source, not ambient haze.
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
