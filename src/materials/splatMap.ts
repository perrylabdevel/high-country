/**
 * Targets three@0.185.1.
 * Bakes biomeAt / roadFactor / creekFactor / lakeFactor to an RGBA splat.
 * R=grass G=dirt B=rock A=road/gravel. Sampled in worldToMap UV.
 */
import * as THREE from "three/webgpu";
import { WORLD, biomeAt, roadFactor, creekFactor, lakeFactor, ROADS } from "../map.js";
import { distToPolyline, polylineCache } from "../map.js";

const SPLAT_W = 2048;
const SPLAT_H = 2560;

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
  const biome = biomeAt(x, z);
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
  const lake = lakeFactor(x, z);
  // Road channel baked with a NARROW falloff (0.55x width vs roadFactor's
  // 1.15x). The material derives both the road extent and the wheel-track
  // center from this one channel: on the wide profile the center band covered
  // nearly the whole road, so the wheel-track never read (audit G1).
  const narrow = (() => {
    let w = 0;
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
      const d = distToPolyline(x, z, road.pts);
      w = Math.max(w, Math.exp(-((d * d) / (falloff * falloff))));
    }
    return w;
  })();
  const road = Math.min(1, Math.pow(narrow, 0.52));
  grass = Math.max(0, grass * (1 - creek * 0.8) * (1 - lake * 0.5) * (1 - road));
  dirt = Math.min(1, Math.max(dirt, creek * 0.75, lake * 0.55) * (1 - road * 0.85));
  rock = Math.min(1, Math.max(rock, creek * 0.08) * (1 - road));
  return { grass, dirt, rock, road };
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
      data[i + 2] = Math.round(w.rock * 255);
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
