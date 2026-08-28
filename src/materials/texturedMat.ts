/**
 * Triplanar PBR material for box-built structures.
 *
 * BoxGeometry UVs repeat once per face, which would stretch a 2k texture
 * across a 10 m wall; world triplanar mapping keeps texel density consistent
 * on every face. Callers pass loaded maps and fall back to flat colours when
 * they have none (the headless geometry checks build without maps).
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
  normalMap
} from "three/tsl";
import type { LoadedSet } from "./loadSet.ts";

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
  const alb = triplanarTexture(albNode, albNode, albNode, scale, positionWorld, normalWorld).rgb;
  const c = new THREE.Color(tint);
  // The Poly Haven albedos are darker than the flat colours they replace, and
  // shadow sides crushed to near-black at capture distance. `gain` brings lit
  // faces back up while the AO floor keeps shadow sides readable.
  m.colorNode = alb.mul(vec3(c.r, c.g, c.b)).mul(gain);
  if (set.normal && !noNormal) {
    // Same TextureNode requirement as the albedo: triplanarTexture on a raw
    // THREE.Texture sampled black. The normal map gives walls/adobe relief so
    // they do not read as flat painted slabs (audit M1/U2 on buildings).
    const nrmNode = texture(set.normal);
    const nrm = triplanarTexture(nrmNode, nrmNode, nrmNode, scale, positionWorld, normalWorld);
    m.normalNode = normalMap(nrm, vec2(normalScale, normalScale));
  }
  if (set.orm) {
    const ormNode = texture(set.orm);
    const orm = triplanarTexture(ormNode, ormNode, ormNode, scale, positionWorld, normalWorld);
    m.aoNode = orm.r.mul(0.65).add(0.35);
    m.roughnessNode = orm.g.mul(rough).add(0.08);
  }
  return m;
}
