/**
 * Targets three@0.185.1.
 * Bakes biomeAt / roadFactor / creekFactor / lakeFactor to an RGBA splat.
 * R=grass G=dirt B=rock A=road/gravel. Sampled in worldToMap UV.
 */
import * as THREE from "three/webgpu";
import { WORLD, biomeAtWithLake, roadFactor, creekFactor, lakeFactor, smoothstep, ROADS, nearestOnPolyline } from "../map.js";
import { polylineCache } from "../map.js";
import { lakeWaterSignedDistance } from "../lakeWaterline.js";

export const SPLAT_W = 2048;
export const SPLAT_H = 2560;

// Wheel-track lateral offset rides in the B channel alongside rock, packed as
// B = rock + clamp(lat, -2, 2)/4 * road ... latNorm = lat/4 + 0.5 (±2 m of
// range — ruts never sit beyond ~1.5 m out — over 256 levels ≈ 1.6 cm
// precision on the road itself). This works because the bake already zeroes
// rock on roads
// (rock * (1 - road)) and the material suppresses the rock weight by roadMask
// in exactly the same band, so the two signals never contend for the channel.
// A separate flow texture was tried first and had to be reverted: the terrain
// fragment stage was already at 16 sampled textures, WebGPU's per-stage limit,
// and the 17th made the bind group layout invalid (everything rendered white).

const GRASSY = new Set(["lake", "ranch", "pines", "tribal", "foothills", "valley", "range"]);
const DIRTY = new Set(["town", "burn", "iron"]);
const ROCKY = new Set(["badlands"]);

// Deterministic value noise so biome boundaries cross-fade instead of snapping
// to straight axis-aligned lines. Sampled at a low frequency (~0.003 world
// units) so the raggedness is at a scale comparable to a road or a biome edge.
function valueNoise(x: number, z: number) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const h = (a: number, b: number) => {
    const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = h(ix, iz);
  const b = h(ix + 1, iz);
  const c = h(ix, iz + 1);
  const d = h(ix + 1, iz + 1);
  const u = s(fx);
  const v = s(fz);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function weightsAt(x: number, z: number) {
  // One lakeFactor per pixel, not two. biomeAt computes it internally and this
  // function needed it again below; over 5.24 M pixels that duplicate cost
  // ~1.2 s of the bake (measured 230 ns/call).
  const lake = lakeFactor(x, z);
  const biome = biomeAtWithLake(x, z, lake);
  let grass = GRASSY.has(biome) ? 1 : 0.12;
  let dirt = DIRTY.has(biome) ? 0.9 : 0.18;
  // Badlands rock is no longer painted on uniformly: flats carry a mix of
  // dirt and weathered rock so the strata bands read as deposits, while
  // slopes add rock through the material's slope channel (audit D2).
  let rock = ROCKY.has(biome) ? 0.45 : 0.04;
  if (ROCKY.has(biome)) {
    dirt = 0.52;
  }
  // Noise-break the biome boundaries: a low-frequency perturbation pushes the
  // dominant layer's weight down and the others up near edges, so the straight
  // rectangle seams read as irregular transitions.
  const n = valueNoise(x * 0.003, z * 0.003) - 0.5;
  grass = Math.min(1, Math.max(0, grass + n * 0.35));
  dirt = Math.min(1, Math.max(0, dirt - n * 0.35));
  rock = Math.min(1, Math.max(0, rock + n * 0.2));
  if (biome === "range") {
    grass = 0.97;
    dirt = 0.05;
  }
  if (biome === "town") {
    // A town should read as settled grass with packed dirt where people walk,
    // not as an all-dirt plain (audit U1 at silverCreek).
    grass = 0.42;
    dirt = 0.62;
  }
  if (biome === "burn") {
    grass = 0.05;
    dirt = 0.35;
    rock = 0.8;
  }
  if (biome === "lake") {
    grass = 0.7;
    dirt = 0.4;
  }
  const creek = creekFactor(x, z);
  // Preserve every dry-land linear feature. Only strip creek/road substrate once
  // it lies safely under the terrain-resolved lake surface, so shallow water
  // refracts the lake bed instead of a dark creek or gravel lane. The creek
  // alone also eases out across its final 8 m of dry approach, so its dark wet
  // bed arrives at the lake as a natural bank transition rather than a stripe.
  const waterDistance = lakeWaterSignedDistance(x, z);
  const submerged = smoothstep(2, 10, -waterDistance);
  const featureLand = 1 - submerged;
  const mouthFade = smoothstep(0, 8, waterDistance);
  const creekLand = creek * featureLand * mouthFade;
  // Road channel baked with a NARROW falloff (0.55x width vs roadFactor's
  // 1.15x). The material derives both the road extent and the wheel-track
  // center from this one channel: on the wide profile the center band covered
  // nearly the whole road, so the wheel-track never read (audit G1).
  // nearestOnPolyline (not distToPolyline) also yields the signed lateral
  // offset to the winning centreline, which rides in the B channel for the
  // wheel-track ruts — see the packing note at the top of this file.
  let narrow = 0;
  let lat = 0;
  for (const road of ROADS) {
    if (road.kind === "rail") {
      // Rails get their own ballast ribbon and ties in roads.js; painting a
      // gravel road under them made the rail bed read as a road (audit G1).
      continue;
    }
    const falloff = (road.width || 6) * 0.55;
    const c = polylineCache(road.pts);
    const pad = falloff * 3;
    if (x < c.minX - pad || x > c.maxX + pad || z < c.minZ - pad || z > c.maxZ + pad) {
      continue;
    }
    const near = nearestOnPolyline(x, z, road.pts);
    const w = Math.exp(-((near.dist * near.dist) / (falloff * falloff)));
    if (w > narrow) {
      narrow = w;
      lat = near.lat;
    }
  }
  const roadRaw = Math.min(1, Math.pow(narrow, 0.52));
  const road = roadRaw * featureLand;
  grass = Math.max(0, grass * (1 - creekLand * 0.8) * (1 - lake * 0.5) * (1 - road));
  dirt = Math.min(1, Math.max(dirt, creekLand * 0.75, lake * 0.55) * (1 - road * 0.85));
  rock = Math.min(1, Math.max(rock, creekLand * 0.08) * (1 - road));
  return { grass, dirt, rock, road, lat };
}

export function bakeSplatMap(width = SPLAT_W, height = SPLAT_H): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4);
  for (let py = 0; py < height; py += 1) {
    const v = (py + 0.5) / height;
    const z = (0.5 - v) * WORLD.depth;
    for (let px = 0; px < width; px += 1) {
      const u = (px + 0.5) / width;
      const x = (u - 0.5) * WORLD.width;
      const w = weightsAt(x, z);
      const i = (py * width + px) * 4;
      data[i] = Math.round(w.grass * 255);
      data[i + 1] = Math.round(w.dirt * 255);
      // B = rock + latNorm * road, latNorm = clamp(lat, ±2)/4 + 0.5 — see the
      // packing note at the top. The bake's rock is already scaled by
      // (1 - road), so the sum stays <= 1.
      const latClamped = Math.min(2, Math.max(-2, w.lat));
      const latNorm = Math.min(1, Math.max(0, w.rock + (latClamped / 4 + 0.5) * w.road));
      data[i + 2] = Math.round(latNorm * 255);
      data[i + 3] = Math.round(w.road * 255);
    }
  }
  const tex = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}
