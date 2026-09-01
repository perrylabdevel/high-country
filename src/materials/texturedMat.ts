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
  dFdx,
  dFdy,
  select,
  hash,
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
  "wallStochastic"
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
 * One hex-tile stochastic sample of a texture in a single UV plane.
 *
 * Heitz & Neyret, "High-Performance By-Example Noise using a Histogram-
 * Preserving Blending Operator" (2018), in its widely-used simplified form.
 *
 * The problem it solves is the one every other approach here failed on. A
 * domain warp displaces WHERE the texture is read and a per-cell rotation
 * changes which way it FACES, but neither removes the fact that the same
 * pixels reappear on a fixed grid — on the ranch house's plank siding, the
 * same two knots recur every 1.8 m at matching heights, and rotating planks
 * to hide it stands the siding on end (measured: 180-degree-only flip moved
 * the autocorrelation 0.551 -> 0.524, i.e. nothing, and added visible seams).
 *
 * How it works. The UV plane is tiled with a triangular lattice; every
 * fragment falls in one triangle whose three vertices are hex centres. Each
 * vertex carries its own random UV offset, so the texture is sampled three
 * times at three unrelated places and blended by the fragment's barycentric
 * weights. A weight falls to zero exactly at the opposite edge, so there is no
 * seam anywhere, and because each sample is the texture translated — never
 * rotated, scaled or distorted — a directional material keeps its direction.
 *
 * Two details that are not optional:
 *
 * Variance-preserving blend. Averaging three samples of a texture with mean m
 * pulls contrast toward m wherever the weights are even, so a naive blend
 * makes the wall look washed out in patches — the failure mode that makes
 * people give up on this technique. Blending the deviations from the mean and
 * rescaling by 1/sqrt(w1^2+w2^2+w3^2) keeps the variance constant, so the
 * result has the same contrast as a plain sample everywhere.
 *
 * Explicit gradients. The three offsets are discontinuous across lattice
 * edges, so the hardware's implicit derivatives would see a huge UV jump at
 * every boundary and drop to the lowest mip — a blurred line along every
 * triangle edge. The derivatives of the UNOFFSET uv are the correct ones (the
 * offsets are constant within a triangle), so they are computed once and
 * passed to every sample with .grad().
 */
function hexSample(
  tex: THREE.Texture,
  uv: Node<"vec2">,
  strength: FloatUniform
) {
  // Correct derivatives: taken from the un-offset UV, before the lattice
  // splits it. Constant offsets do not change the footprint.
  const ddx = dFdx(uv);
  const ddy = dFdy(uv);

  // Skew into a triangular lattice. The matrix is the standard
  // [[1, -1/sqrt(3)], [0, 2/sqrt(3)]] mapping a unit square to 60-degree axes.
  const skewed = vec2(uv.x.sub(uv.y.mul(0.57735026)), uv.y.mul(1.15470054));
  const base = skewed.floor();
  const f = skewed.sub(base);

  // Split the parallelogram cell into its two triangles and get barycentrics.
  // The lower triangle has f.x + f.y < 1.
  const lower = f.x.add(f.y).lessThan(1.0);
  const w1 = select(lower, float(1).sub(f.x).sub(f.y), f.x.add(f.y).sub(1.0));
  const w2 = select(lower, f.x, float(1).sub(f.y));
  const w3 = select(lower, f.y, float(1).sub(f.x));
  // The three lattice vertices of whichever triangle we are in.
  const v1 = select(lower, base, base.add(vec2(1.0, 1.0)));
  const v2 = select(lower, base.add(vec2(1.0, 0.0)), base.add(vec2(1.0, 0.0)));
  const v3 = select(lower, base.add(vec2(0.0, 1.0)), base.add(vec2(0.0, 1.0)));

  /**
   * A uniformly distributed 2D offset per lattice vertex, in [0,1).
   *
   * This must be a HASH, not noise. The first version used mx_noise_float
   * here, and Perlin noise is not uniform: its values cluster near zero with a
   * standard deviation of roughly 0.2, so after *0.5+0.5 every vertex got an
   * offset of about half a tile give or take a tenth. All three samples were
   * the texture translated by nearly the same amount, the repeat survived
   * intact, and the before/after captures differed by a mean 1.2/255 on the
   * stone wall. The vertex coordinates are integers, so they pack losslessly
   * into one seed.
   */
  const offset = (v: Node<"vec2">) => {
    const seed = v.x.add(v.y.mul(4096.0));
    return vec2(hash(seed), hash(seed.add(7919.0)));
  };

  // `strength` scales the offsets: 0 collapses all three to the same place and
  // the result is byte-identical to an ordinary sample, which is what makes a
  // live A/B on one frame possible.
  const s1 = texture(tex, uv.add(offset(v1).mul(strength))).grad(ddx, ddy);
  const s2 = texture(tex, uv.add(offset(v2).mul(strength))).grad(ddx, ddy);
  const s3 = texture(tex, uv.add(offset(v3).mul(strength))).grad(ddx, ddy);

  // Variance-preserving blend about the TEXTURE's mean, read from the top of
  // the mip chain (the 1x1 level is the mean by construction; the level index
  // is clamped by the sampler, so an oversized constant always lands there).
  // It has to be the texture's mean, not the mean of these three samples: with
  // the local mean, sum(w_i * (s_i - mean)) is identically zero at even
  // weights, so the "preserving" blend collapses to the naive average exactly
  // where the naive average is worst.
  const mean = texture(tex, uv).level(float(16));
  const blended = s1.sub(mean).mul(w1)
    .add(s2.sub(mean).mul(w2))
    .add(s3.sub(mean).mul(w3));
  // The rescale is faded out with strength: at 0 the three samples coincide
  // and dividing by norm would boost contrast instead of returning the plain
  // sample the A/B relies on.
  const norm = mix(float(1), w1.mul(w1).add(w2.mul(w2)).add(w3.mul(w3)).sqrt().max(1e-4), strength);
  return blended.div(norm).add(mean);
}

/**
 * Triplanar sampling where each of the three planes is sampled stochastically.
 *
 * This is three's triplanarTexture (nodes/utils/TriplanarTextures.js) with the
 * three plain samples replaced by hexSample. The |normal| blend weights and
 * the three-plane sum are unchanged.
 *
 * It has to happen HERE, inside the UV derivation, rather than by pre-
 * transforming the world position passed in. Transforming the position was
 * tried and it smears: triplanar takes its blend weights from the true surface
 * normal, so a wall facing +Z samples almost entirely from the .xy plane, and
 * turning the position 90 degrees about Y makes that wall read its UVs from a
 * plane it is nearly PARALLEL to. Weighting and sampling then disagree and the
 * texture stretches into horizontal streaks.
 */
function stochasticTriplanar(
  texNode: ReturnType<typeof texture>,
  scaleNode: Node<"float">,
  posNode: Node<"vec3">,
  nrmNode: Node<"vec3">,
  strength: FloatUniform
) {
  const bfRaw = nrmNode.abs().normalize();
  const bf = bfRaw.div(bfRaw.dot(vec3(1.0)));

  const tx = posNode.yz.mul(scaleNode);
  const ty = posNode.zx.mul(scaleNode);
  const tz = posNode.xy.mul(scaleNode);

  const cx = hexSample(texNode.value, tx, strength).mul(bf.x);
  const cy = hexSample(texNode.value, ty, strength).mul(bf.y);
  const cz = hexSample(texNode.value, tz, strength).mul(bf.z);
  return cx.add(cy).add(cz);
}

export function makeTexturedMat(
  set: LoadedSet,
  { tiling = 1.6, tint = 0xffffff, rough = 0.9, gain = 1.0, noNormal = false, normalScale = 0.8, stochastic = true }: {
    tiling?: number;
    tint?: number;
    rough?: number;
    gain?: number;
    noNormal?: boolean;
    normalScale?: number;
    /**
     * Break texture repetition with hex-tile stochastic sampling.
     *
     * On by default. Costs three texture fetches per map per plane instead of
     * one, so it is the expensive option — pass false for a material where the
     * repetition does not read, or where the extra bandwidth is not worth it.
     */
    stochastic?: boolean;
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

  // `stochastic: false` opts a material out entirely (zero strength collapses
  // the three hex samples onto one point, so it is exactly a plain sample).
  const stoch = stochastic ? u.wallStochastic : (float(0) as unknown as FloatUniform);
  const alb = stochasticTriplanar(albNode, scale, p, normalWorld, stoch).rgb;
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
    const nrm = stochasticTriplanar(nrmNode, scale, p, normalWorld, stoch);
    m.normalNode = normalMap(nrm, vec2(normalScale, normalScale));
  }
  if (ormNode) {
    const orm = stochasticTriplanar(ormNode, scale, p, normalWorld, stoch);
    m.aoNode = orm.r.mul(0.65).add(0.35);
    m.roughnessNode = orm.g.mul(rough).add(0.08);
  }
  return m;
}