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
  "wallMacroStrength",
  "wallRotCell",
  "wallRotMix"
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

/**
 * Triplanar sampling with a per-cell quarter-turn rotation of each plane's UVs.
 *
 * This is three's triplanarTexture (nodes/utils/TriplanarTextures.js) with one
 * change: each of the three projected UV sets is rotated by its own per-cell
 * multiple of 90 degrees before sampling. Everything else — the |normal|
 * blend weights, the three-plane sum — is identical.
 *
 * It has to happen HERE, inside the UV derivation, rather than by pre-rotating
 * the world position that gets passed in. Rotating the position was tried
 * first and it smears: triplanar picks its blend weights from the true surface
 * normal, so a wall facing +Z is sampled almost entirely from the .xy plane,
 * and turning the position 90 degrees about Y makes that wall read its UVs
 * from a plane it is nearly PARALLEL to. The weighting and the sampling then
 * disagree and the texture stretches into horizontal streaks — clearly visible
 * mid-wall and across the porch in audit/wall-sweep/B-rot-only.png.
 *
 * Rotating within each plane cannot do that: the plane a fragment samples from
 * is unchanged, only the orientation of the texture inside it moves.
 *
 * Why quarter turns specifically: for a tiling texture they are exact. Each is
 * a swap and a negate of two coordinates, so there is no resampling, no
 * stretching, and no change to the filtering or the mip selection. A cell
 * boundary is a texture-space jump — the same kind of discontinuity the tiling
 * already has at every tile edge, and hidden by the same wrap.
 */
function rotatedTriplanar(
  texNode: ReturnType<typeof texture>,
  scaleNode: Node<"float">,
  posNode: Node<"vec3">,
  nrmNode: Node<"vec3">,
  cellSize: FloatUniform,
  rotMix: FloatUniform
) {
  // Blend weights from the TRUE normal, exactly as three does.
  const bfRaw = nrmNode.abs().normalize();
  const bf = bfRaw.div(bfRaw.dot(vec3(1.0)));

  const tx = posNode.yz.mul(scaleNode);
  const ty = posNode.zx.mul(scaleNode);
  const tz = posNode.xy.mul(scaleNode);

  // One independent cell index per projection plane, so the three planes do
  // not turn in lockstep and reintroduce a shared phase.
  const cell = posNode.div(cellSize).floor();

  /**
   * Rotate a UV pair by k * 90 degrees about the cell's own centre.
   *
   * Rotating about the ORIGIN would translate distant cells as well as turn
   * them, because a rotation about a far-away origin is mostly displacement.
   * That reintroduces exactly the sample-position jitter the warp already
   * does, and does it discontinuously. Turning about the cell centre keeps
   * the rotation a pure rotation.
   */
  const turn = (uv: Node<"vec2">, seed: number) => {
    const rnd = mx_noise_float(cell.mul(vec3(1.7, 2.3, 3.1)).add(seed)).mul(0.5).add(0.5);
    const ang = rnd.mul(4).floor().mul(Math.PI / 2).mul(rotMix);
    const ca = ang.cos();
    const sa = ang.sin();
    // Cell centre in this plane's UV space; rotate around it.
    const c = uv.div(cellSize.mul(scaleNode)).floor().add(0.5).mul(cellSize.mul(scaleNode));
    const d = uv.sub(c);
    return vec2(d.x.mul(ca).sub(d.y.mul(sa)), d.x.mul(sa).add(d.y.mul(ca))).add(c);
  };

  const cx = texture(texNode.value, turn(tx, 11.7)).mul(bf.x);
  const cy = texture(texNode.value, turn(ty, 29.3)).mul(bf.y);
  const cz = texture(texNode.value, turn(tz, 47.1)).mul(bf.z);
  return cx.add(cy).add(cz);
}

export function makeTexturedMat(
  set: LoadedSet,
  { tiling = 1.6, tint = 0xffffff, rough = 0.9, gain = 1.0, noNormal = false, normalScale = 0.8, rotate = true }: {
    tiling?: number;
    tint?: number;
    rough?: number;
    gain?: number;
    noNormal?: boolean;
    normalScale?: number;
    /**
     * Break texture repetition with the per-cell quarter-turn rotation.
     *
     * On by default, and correct for anything whose real-world structure has
     * no single orientation — stone, adobe, rubble, weathered planking seen in
     * a mass. Pass false for a material that is genuinely directional at
     * building scale: roof tiles all run the same way down a real roof, so
     * turning a patch of them 90 degrees reads as a mistake rather than as
     * variety, however much it improves the autocorrelation.
     */
    rotate?: boolean;
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

  const rotMix = rotate ? u.wallRotMix : (float(0) as unknown as FloatUniform);
  const alb = rotatedTriplanar(albNode, scale, p, normalWorld, u.wallRotCell, rotMix).rgb;
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
    const nrm = rotatedTriplanar(nrmNode, scale, p, normalWorld, u.wallRotCell, rotMix);
    m.normalNode = normalMap(nrm, vec2(normalScale, normalScale));
  }
  if (ormNode) {
    const orm = rotatedTriplanar(ormNode, scale, p, normalWorld, u.wallRotCell, rotMix);
    m.aoNode = orm.r.mul(0.65).add(0.35);
    m.roughnessNode = orm.g.mul(rough).add(0.08);
  }
  return m;
}