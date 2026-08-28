/**
 * Triplanar PBR material for box-built structures.
 *
 * BoxGeometry UVs repeat once per face, which would stretch a 2k texture
 * across a 10 m wall; world triplanar mapping keeps texel density consistent
 * on every face. Callers pass loaded maps and fall back to flat colours when
 * they have none (the headless geometry checks build without maps).
 *
 * Consistent texel density is the right goal and it has a cost: a wall is one
 * texture stamped end to end, adobe every 1.6 m, wood every 1.8 m. Up close
 * you see one or two repeats and notice nothing. Back off far enough to take a
 * building in at a glance and you see eight or twenty, and the eye finds the
 * period immediately — walls, steps and boardwalks read as printed rather than
 * built. Distance compounds it: the mip chain washes out the fine grain that
 * masks the repeat and leaves the low-frequency blotches, which are exactly
 * what recurs. Reported from the game as "up close it is fine, back up and
 * everything looks repeated and stamped".
 *
 * The terrain has solved this since it was written — a slow noise multiply
 * over world position (macroPeriod 180 m, macroStrength 0.15) so no two
 * repeats read alike. Buildings had no macro and no noise of any kind. They do
 * now, at a period suited to their size rather than a landscape's.
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
  mx_noise_float
} from "three/tsl";
import type { LoadedSet } from "./loadSet.ts";

/**
 * Macro noise for the triplanar building materials, in metres per cycle and as
 * a multiplier on albedo. Sampled on the full 3D world position, not xz: two
 * courses of adobe one above the other otherwise get the same value, and a
 * wall's repeat is as visible vertically as horizontally.
 */
const MACRO_PERIOD = 9;
const MACRO_STRENGTH = 0.16;

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
  // Macro break-up. 9 m rather than the terrain's 180: a wall is 10-30 m, so
  // the variation has to happen ACROSS one wall to break its own repeat, not
  // across a valley. Brightness only - it cannot fight the texture's own
  // detail, it just stops consecutive stamps matching. Strength is deliberately
  // low; this should be invisible as an effect and only show as the absence of
  // a pattern.
  const macro = mx_noise_float(positionWorld.div(MACRO_PERIOD)).mul(MACRO_STRENGTH).add(1);
  m.colorNode = alb.mul(vec3(c.r, c.g, c.b)).mul(gain).mul(macro);
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
