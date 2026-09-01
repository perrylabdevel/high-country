/**
 * Triplanar PBR material for box-built structures.
 *
 * BoxGeometry UVs repeat once per face, which would stretch a 2k texture
 * across a 10 m wall; world triplanar mapping keeps texel density consistent
 * on every face. Callers pass loaded maps and fall back to flat colours when
 * they have none (the headless geometry checks build without maps).
 *
 * Anti-repetition: world mapping gives every wall the same texture phase, and
 * building tilings (1.4-2.2 m) are 4-8x denser than the terrain layers, so at
 * settlement distance the repeats line up into a visible pattern (measured:
 * wall strips autocorrelate at exactly the tiling lag — 34 px / 60 px at the
 * close vantage — and the roof planes show a full grid). An overlay of the
 * same texture at a second scale was tried and measured useless: the texture
 * is dominated by one directional structure (plank stripes), so overlaying
 * itself just stacks more aligned banding. What does break the period is
 * domain warping — the sample position is displaced by smooth world noise, so
 * each nominal repeat shows a different slice of the texture and features
 * stop aligning, with no seams because the warp is continuous. The warp fades
 * in over distance (wallWarp*): up close the texture is untouched, which is
 * where it was already judged good. A large-period 3D noise on the final
 * albedo (wallMacro*) additionally keeps separate walls from sharing one
 * brightness phase; 3D, not the terrain macro's xz, which would band
 * horizontally along wall height.
 */
import * as THREE from "three/webgpu";
import {
  vec3,
  vec2,
  float,
  texture,
  triplanarTexture,
  positionWorld,
  normalWorld,
  normalMap,
  mix,
  smoothstep,
  cameraPosition,
  mx_noise_float,
  uniform
} from "three/tsl";
import type { Node } from "three/webgpu";
import { materialSettings } from "./settings.ts";
import type { LoadedSet } from "./loadSet.ts";

type FloatUniform = Node<"float"> & { value: number };

const WALL_KEYS = [
  "wallWarpAmp",
  "wallWarpPeriod",
  "wallWarpNear",
  "wallWarpFar",
  "wallMacroPeriod",
  "wallMacroStrength"
] as const;

type WallKey = (typeof WALL_KEYS)[number];

const u = {} as Record<WallKey, FloatUniform>;
for (const key of WALL_KEYS) {
  u[key] = uniform(materialSettings[key], "float") as FloatUniform;
}

export function syncWallUniforms(): void {
  for (const key of WALL_KEYS) {
    u[key].value = materialSettings[key];
  }
}

export function makeTexturedMat(
  set: LoadedSet,
  { tiling = 1.6, tint = 0xffffff, rough = 0.9, gain = 1.0, noNormal = false, normalScale = 0.8 }: {
    tiling?: number;
    tint?: number;
    rough?: number;
    gain?: number;
    noNormal?: boolean;
    normalScale?: number;
  } = {}
): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial({ color: 0xffffff, roughness: rough, metalness: 0.02 });
  const scale = float(1).div(tiling);
  // triplanarTexture expects TextureNodes, not raw THREE.Textures — passing
  // the raw texture sampled as black on every face.
  const albNode = texture(set.albedo);
  const nrmNode = set.normal ? texture(set.normal) : null;
  const ormNode = set.orm ? texture(set.orm) : null;

  // Domain warp: three decorrelated smooth noise channels displace the
  // sampling position. Amplitude is a fraction of the tiling so every surface
  // breaks up by about the same number of texture features; it fades in over
  // distance so the close-up read is pixel-identical to the unwarped material.
  // TSL is an expression tree: a bare `.assign()` outside a consumed graph is
  // dead code (measured — the first warp build changed zero pixels at amp 5),
  // so the warped position is built as a pure expression instead.
  let p = positionWorld;
  if (materialSettings.quality !== "low") {
    const dist = cameraPosition.sub(positionWorld).length();
    const warpAmp = u.wallWarpAmp.mul(tiling).mul(smoothstep(u.wallWarpNear, u.wallWarpFar, dist));
    const wp = positionWorld.div(u.wallWarpPeriod);
    const warp = vec3(mx_noise_float(wp), mx_noise_float(wp.add(17.31)), mx_noise_float(wp.add(43.7)));
    p = positionWorld.add(warp.mul(warpAmp));
  }

  const alb = triplanarTexture(albNode, albNode, albNode, scale, p, normalWorld).rgb;
  const macro = mx_noise_float(positionWorld.div(u.wallMacroPeriod)).mul(u.wallMacroStrength).add(1);
  const c = new THREE.Color(tint);
  // The Poly Haven albedos are darker than the flat colours they replace, and
  // shadow sides crushed to near-black at capture distance. `gain` brings lit
  // faces back up while the AO floor keeps shadow sides readable.
  m.colorNode = alb.mul(macro).mul(vec3(c.r, c.g, c.b)).mul(gain);
  if (nrmNode && !noNormal) {
    // Same TextureNode requirement as the albedo: triplanarTexture on a raw
    // THREE.Texture sampled black. The normal map gives walls/adobe relief so
    // they do not read as flat painted slabs (audit M1/U2 on buildings).
    const nrm = triplanarTexture(nrmNode, nrmNode, nrmNode, scale, p, normalWorld);
    m.normalNode = normalMap(nrm, vec2(normalScale, normalScale));
  }
  if (ormNode) {
    const orm = triplanarTexture(ormNode, ormNode, ormNode, scale, p, normalWorld);
    m.aoNode = orm.r.mul(0.65).add(0.35);
    m.roughnessNode = orm.g.mul(rough).add(0.08);
  }
  return m;
}