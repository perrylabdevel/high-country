/**
 * Targets three@0.185.1 (WebGPURenderer + TSL).
 * Ground truth: node_modules/three/src/nodes/TSL.js
 *
 * Terrain: TSL 4-layer PBR (grass/dirt/rock/gravel) with a splat baked from
 * biomeAt / roadFactor / creekFactor / lakeFactor. Vertex biome colors stay
 * as a macro tint. Stage/road/trail ribbons are retired; gravel lives in splat.a.
 */
import * as THREE from "three/webgpu";
import {
  clamp, dFdx, dFdy, dot, float, length, max, mix, mx_fractal_noise_float,
  normalView, normalize, positionLocal, positionViewDirection, pow, smoothstep,
  time, uniform, vec2, vec3
} from "three/tsl";
import { WORLD, heightAt, bakeHeightfield, grassTexture } from "./world.js";
import { biomeAt, roadFactor, lakeFactor, creekFactor } from "./map.js";
import { loadTerrainMaps } from "./materials/loadSet.ts";
import { bakeSplatMap } from "./materials/splatMap.ts";
import { getProfile } from "./perfProfile.js";
import { createTerrainMaterial } from "./materials/terrainMaterial.ts";

const BIOME = {
  lake: [0.22, 0.32, 0.18],
  ranch: [0.4, 0.5, 0.22],
  town: [0.42, 0.38, 0.28],
  pines: [0.16, 0.26, 0.14],
  burn: [0.1, 0.07, 0.05],
  range: [0.42, 0.55, 0.24],
  iron: [0.34, 0.3, 0.26],
  badlands: [0.56, 0.34, 0.2],
  tribal: [0.38, 0.42, 0.22],
  foothills: [0.3, 0.4, 0.2],
  valley: [0.36, 0.46, 0.22]
};

function canvasGrassMaterial() {
  const grass = grassTexture();
  grass.repeat.set(140, 170);
  return new THREE.MeshStandardNodeMaterial({
    vertexColors: true,
    map: grass,
    roughness: 0.92,
    metalness: 0.02
  });
}

let terrainMesh = null;
let terrainMaps = null;

export async function createTerrain() {
  bakeHeightfield();
  const geo = new THREE.PlaneGeometry(WORLD.width, WORLD.depth, WORLD.segmentsX, WORLD.segmentsZ);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = heightAt(x, z);
    pos.setY(i, y);
    const slope = Math.min(1, Math.abs(heightAt(x + 3, z) - y) * 0.28);
    const biome = biomeAt(x, z);
    const base = BIOME[biome] || BIOME.valley;
    const road = roadFactor(x, z);
    const creek = creekFactor(x, z);
    const lake = lakeFactor(x, z);
    let r = base[0] * (1 - slope * 0.45) + 0.3 * slope;
    let g = base[1] * (1 - slope * 0.45) + 0.28 * slope;
    let b = base[2] * (1 - slope * 0.35) + 0.26 * slope;
    r = r * (1 - road) + 0.42 * road;
    g = g * (1 - road) + 0.28 * road;
    b = b * (1 - road) + 0.16 * road;
    r = r * (1 - creek * 0.4) + 0.22 * creek;
    g = g * (1 - creek * 0.4) + 0.32 * creek;
    b = b * (1 - creek * 0.4) + 0.28 * creek;
    if (lake > 0.5) {
      r = r * (1 - lake) + 0.2 * lake;
      g = g * (1 - lake) + 0.28 * lake;
      b = b * (1 - lake) + 0.22 * lake;
    }
    colors.push(r, g, b);
  }
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  try {
    geo.computeTangents();
  } catch (err) {
    console.warn("Terrain tangents skipped", err);
  }

  let mat;
  try {
    terrainMaps = await loadTerrainMaps();
    if (terrainMaps) {
      mat = createTerrainMaterial(terrainMaps, bakeSplatMap());
    }
  } catch (err) {
    console.warn("Terrain PBR material failed, using canvas grass", err);
  }
  if (!mat) {
    mat = canvasGrassMaterial();
  }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  terrainMesh = mesh;
  return mesh;
}

export function rebuildTerrainMaterial() {
  if (!terrainMesh || !terrainMaps) {
    return;
  }
  const mat = createTerrainMaterial(terrainMaps, bakeSplatMap());
  terrainMesh.material = mat;
  terrainMesh.material.needsUpdate = true;
}

/**
 * Sky gradient palettes keyed to sun elevation. The old dome was a fixed
 * cream/beige gradient that read as "Mars under a featureless dome" at golden
 * hour; these stops stay warm at golden without going cream-brown, and at
 * midday run blue through a pale warm haze. `[0]` is the low-sun (golden)
 * palette, `[1]` the high-sun (midday) one; updateSun() lerps between them.
 */
const SKY_PALETTE = {
  top: [0x8492b2, 0x4a80bd],
  mid: [0xd3a579, 0x9db9d2],
  bot: [0xf0c194, 0xe9e4d3]
};

export function createSky(scene) {
  scene.background = new THREE.Color(0x87a7c4);
  scene.fog = new THREE.FogExp2(0x9bb4c8, 0.00038);
  const hemi = new THREE.HemisphereLight(0xcfe6f4, 0x6b542e, 0.32);
  const sun = new THREE.DirectionalLight(0xffe1b0, 1.15);
  sun.position.set(-180, 220, -90);
  sun.castShadow = true;
  // 4096 shadow map: at 2048 the long golden shadows were too soft to read as
  // directional (audit U5 at golden). 4096 doubles the texel density over the
  // same frustum for a cost a desktop frame budget absorbs.
  //
  // A laptop's does not, so the size now comes from the device tier — and the
  // FRUSTUM shrinks with it rather than the resolution dropping alone, because
  // what U5 actually measured is texel density (metres per texel), not the
  // resolution on its own.
  //
  // Scale the box by the SQUARE ROOT of the resolution ratio, not the ratio.
  // Shrinking it linearly would hold 12.7 cm/texel exactly, but it would take
  // `low` to a 65 m box — tight enough to cut the shadows off buildings a
  // street away, which reads as a bug rather than a quality setting. The
  // square root splits the loss between the two instead:
  //
  //   high    4096 over ±260 m = 12.7 cm/texel   16.8 Mpx shadow pass
  //   medium  2048 over ±184 m = 18.0 cm/texel    4.2 Mpx
  //   low     1024 over ±130 m = 25.4 cm/texel    1.0 Mpx
  //
  // So `low` does give up sharpness as well as range — half the range and
  // twice the texel footprint — for a sixteenth of the shadow-pass cost. On
  // the hardware that selects it, that trade is not close.
  const profile = getProfile();
  const shadowSize = profile.shadowMapSize;
  const shadowExtent = 260 * Math.sqrt(shadowSize / 4096);
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.camera.left = -shadowExtent;
  sun.shadow.camera.right = shadowExtent;
  sun.shadow.camera.top = shadowExtent;
  sun.shadow.camera.bottom = -shadowExtent;
  sun.shadow.bias = -0.00025;
  scene.add(sun.target);
  const fill = new THREE.AmbientLight(0x6a7c8c, 0.1);
  scene.add(hemi, sun, fill);

  const top = uniform(new THREE.Color(SKY_PALETTE.top[1]));
  const mid = uniform(new THREE.Color(SKY_PALETTE.mid[1]));
  const bot = uniform(new THREE.Color(SKY_PALETTE.bot[1]));
  // 0 = high sun, 1 = sun at the horizon. Drives cloud tint and the halo's
  // colour and spread; the palettes above are already lerped on the CPU side.
  const warm = uniform(0);
  const skySunDir = uniform(new THREE.Vector3(0, 1, 0));
  const cover = uniform(0.45);
  // Cloud-shape dials (R7b). Constants are baked into the TSL node graph at
  // build time — only uniforms can move live — so the player-tunable dials
  // (cloud scale, warp shear, detail bias, horizon bound) are uniforms fed
  // from the material panel, like `cover` above.
  const cloudScale = uniform(3.0);
  const cloudWarpX = uniform(1.6);
  const cloudWarpY = uniform(-1.1);
  // Multiplier on the derived Nyquist thresholds below. 1 = drop each octave
  // exactly where it stops resolving; >1 holds detail past that (sharper, and
  // it will beat); <1 drops it early (smoother, blander). Replaces the R7b
  // cloudFadeLo/cloudFadeHi elevation window, which was mispositioned — see
  // the fade comment further down.
  const cloudDetailBias = uniform(1.0);
  const cloudBoundK = uniform(0.08);

  const dirV = normalize(positionLocal);
  const h = dirV.y;

  // Gradient dome: haze at the horizon, zenith blue above.
  const grad = mix(mix(bot, mid, smoothstep(-0.15, 0.12, h)), top, smoothstep(0.12, 0.72, h));

  // Sun halo, layered in the dome itself: a tight core glow plus a broad
  // warmth spread that swells as the sun drops. Lives on the dome (not a
  // billboard) so it is always concentric with the sun disc from the camera.
  const sunAmt = dot(dirV, normalize(skySunDir)).max(0.001);
  const glow = pow(sunAmt, 260).mul(0.9).add(pow(sunAmt, 10).mul(warm.mul(0.5).add(0.14)));
  const glowCol = mix(vec3(1.0, 0.97, 0.9), vec3(1.0, 0.82, 0.58), warm);

  // Clouds: two FBM layers over a flat-projection domain, so cover stretches
  // into horizon streaks the way cloud decks read at distance. Both drift on
  // the pinned TSL `time` node, so captures freeze them like all other wind.
  const drift = time.mul(0.01);
  // Scale ~3: cloud masses span ~5 noise units mid-sky (10-20 deg), stretching
  // toward the horizon as the divide blows up the domain near dirV.y -> 0.
  //
  // Two clamp attempts (cap 40 ease 36..44, then cap 20 ease 24..48) failed
  // the speck criterion and taught the real mechanism: the V2 critic measured
  // ironValley's speck band pixel-identical to V1 — that band's projected
  // length sits BELOW every clamp's threshold, so the confetti was never the
  // stretch itself but the TOP OCTAVES beating per pixel wherever plen gets
  // large enough (4 octaves at lacunarity 2.2 puts octave 4 near ~10x the
  // base frequency; by plen ~10 it is already past the pixel sampling rate).
  // A domain clamp cannot fix that, and its radial scale gradient manufactured
  // its own artifacts (concentric swirl rings, a stamped row of light shafts,
  // silverCreek-golden speckle +54%). So: no clamp. Each field is sampled
  // twice — full octaves, and octave 1 only — on the SAME domain and seed,
  // then mixed by plen. The 1-octave mix is literally the first octave of the
  // full field, so the blend is a plain spectral fade (high octaves dissolve
  // with distance): no pattern doubling, no radial ring, and the horizon deck
  // resolves into smooth streaks instead of 1-3px fragments. The fade window
  // (3..9) is set by where the confetti actually lives: plen = 3/h, so the
  // measured bands (elevation ~0.2-0.35) are plen 9-14, and an 8..20 window
  // half-applied exactly there — the top octave still dominated the fragment
  // zone. Completing the fade by plen 9 damps octaves 2+ across the whole
  // mid-sky, which reads as softer cumulus, not less cloud.
  // Denominator bound (the actual speck mechanism, found by cropping the R7
  // bands at 4x): 1/h blows up at 3/h^2 units per pixel ROW in the elevation
  // direction, so even the 1-octave field quantizes into 1-2px jagged steps
  // near the horizon. But the blow-up is ALSO the perspective stretch — the
  // full-strength bound (+0.25, gated to h<0.5) read as overstretched soft
  // masses with no horizon compression left. And a smoothstep-gated shelf
  // kneed the domain: rows in the gate got different compression and the
  // deck marbled into waves. So the bound is the C1-continuous sqrt form
  // h_eff = sqrt(h^2 + k^2), k=0.08: zero row rate exactly at the horizon
  // (dh_eff/dh -> 0), ~0.19 units/row at h=0.1 (features ~5px), and within
  // 1% of the raw domain by h=0.5 — no knee, mid-sky untouched.
  const denom = dirV.y.mul(dirV.y).add(cloudBoundK.mul(cloudBoundK)).sqrt().max(0.035);
  const p = vec2(dirV.x, dirV.z).div(denom).mul(cloudScale);
  const d2 = vec2(p.x.mul(0.22), p.y.add(p.x.mul(0.35))).add(vec2(drift.mul(1.7), 3.7));
  const n2hi = mx_fractal_noise_float(vec3(d2, 11.9), 3, 2.4, 0.5).mul(0.5).add(0.5);
  // mx_fractal_noise_float does NOT normalize: an N-octave call spans
  // +-sum(diminish^i). The first attempt's 1-octave low field had half the
  // high field's amplitude, and the half-contrast mix zone thresholded into
  // thin fragments — speck counts roughly DOUBLED. Scale the low octave up to
  // the full field's range (n1: 1+.55+.3025+.166 = 2.02; n2: 1+.5+.25 = 1.75)
  // so the fade only trades detail for size.
  const n2md = mx_fractal_noise_float(vec3(d2, 11.9), 2, 2.4, 0.5).mul(1.1667).mul(0.5).add(0.5);
  // Spectral fade keyed on the SCREEN-SPACE SAMPLING RATE, not elevation.
  //
  // Two elevation-keyed windows failed before this. The first
  // (smoothstep(3, 9, plen)) covered the whole visible sky, because plen =
  // 3·tan(zenith angle) is 3 AT ZENITH and larger everywhere else, and it
  // dissolved all mackerel detail into one stretched smear. The second
  // (smoothstep(0.17, 0.32, dirV.y)) aimed at the horizon band instead, and
  // measurement on real frames showed it sat ~11 degrees BELOW the damage:
  // vertical feature height crosses 8 px at h=0.50 (30 deg elevation) and
  // 5 px at h=0.34, both while that fade was still exactly 0. Turning it off
  // entirely moved horizon row-beat by 0.9% while handing back 14% of the
  // contrast it cost — it was paying for detail and buying no smoothness.
  //
  // Octave count was never the lever the elevation windows treated it as:
  // the 1/sqrt(h^2+k^2) magnification multiplies the row rate ~23x by h=0.1,
  // where dropping two octaves divides the top frequency by only 4.8. What
  // matters is the footprint the rasteriser samples, and dFdx/dFdy report it
  // directly, in noise units per pixel. An octave at frequency f starts to
  // beat once rate·f passes some fixed pixels-per-cycle budget, so each
  // field's window is DERIVED from its own lacunarity and octave count rather
  // than tuned by eye — and it tracks camera pitch, FOV and resolution for
  // free, which no constant in elevation can do. What that budget is, is the
  // one number here that measurement had to supply:
  //
  // Pixels per nominal octave cycle at which that octave stops resolving.
  // Textbook Nyquist is 2, and 2 measured WORSE than the elevation window it
  // replaced (horizon row-beat +7%, contrast -8%): thresholded fBm carries
  // energy far above its nominal frequency, because smoothstep() hardens each
  // edge and manufactures harmonics the octave number knows nothing about. A
  // bias sweep at 1280x720 put the knee at 20 px/cycle and flat below it —
  // 0.05x and 0.02x land within 0.5% of each other on beat-per-contrast, so
  // 20 is the point where the horizon band is fully served and mid-sky detail
  // is not yet being eaten. Re-derive by sweeping cloudDetailBias, not by eye.
  const PX_PER_CYCLE = 20;
  const aliasRate = (lacunarity, octaves) =>
    1 / (PX_PER_CYCLE * lacunarity ** (octaves - 1));
  // Worst axis, not the average: a domain stretched 4:1 aliases on its short
  // axis while the long one is still resolving comfortably.
  const sampleRate = (d) => max(length(dFdx(d)), length(dFdy(d)));
  const detailFade = (d, lacunarity, hiOct, loOct) =>
    smoothstep(
      float(aliasRate(lacunarity, hiOct)).mul(cloudDetailBias),
      float(aliasRate(lacunarity, loOct)).mul(cloudDetailBias),
      sampleRate(d)
    );
  // n2: 3 octaves at lacunarity 2.4 — full detail holds to rate 0.0087, the
  // 2-octave field to rate 0.0208.
  const n2 = mix(n2hi, n2md, detailFade(d2, 2.4, 3, 2));
  // Domain warp off the cirrus field (no extra noise calls): the radial
  // stretch made every cumulus elongate along the SAME axis, so the upper sky
  // read as repeated stamped fans. Offsetting the cumulus domain by the
  // cirrous value shears each stretch differently — shapes stop repeating
  // recognisably while the deck keeps its horizon character. The warp applies
  // to BOTH octaves of the cumulus: an unwrapped low field crossing a wrapped
  // full field mid-fade showed doubled half-contrast shapes (measured: the
  // speck doubling above).
  const warp = n2.sub(0.5);
  const d1 = p.add(vec2(warp.mul(cloudWarpX), warp.mul(cloudWarpY))).add(vec2(drift, drift.mul(0.4)));
  const n1hi = mx_fractal_noise_float(vec3(d1, 7.3), 4, 2.2, 0.55).mul(0.5).add(0.5);
  const n1md = mx_fractal_noise_float(vec3(d1, 7.3), 2, 2.2, 0.55).mul(1.303).mul(0.5).add(0.5);
  // n1: 4 octaves at lacunarity 2.2 — full detail holds to rate 0.0047, the
  // 2-octave field to rate 0.0227. Its own rate, not n2's: the warp above
  // shears d1 away from d2, so the two fields cross Nyquist at different
  // elevations and a shared fade would be wrong for one of them.
  const n1 = mix(n1hi, n1md, detailFade(d1, 2.2, 4, 2));
  const cumulus = smoothstep(mix(0.82, 0.44, cover), mix(0.93, 0.58, cover), n1);
  const cirrus = smoothstep(0.6, 0.72, n2).mul(0.38);
  const cloudAmt = clamp(cirrus.add(cumulus), 0, 1).mul(smoothstep(0.02, 0.16, h));
  // Tone: the pre-change ramp was lit/shade keyed on smoothstep(0.4, 0.8, n1)
  // alone, but nearly every cloud-body sample of n1 sits above 0.7, so
  // smoothstep(0.4, 0.8) saturated and every fragment rendered the same
  // bright white — no per-mass variety, no grey structure (by-eye A/B
  // capture, 2026-08-31). Two already-computed fields add the missing
  // variation at zero extra noise cost:
  //  - `massTone` is a dedicated 2-octave field on its own seed and offset.
  //    The first attempts reused the cumulus's own low octave (n1md), then the
  //    cirrus field (n2md) — both saturated, because the visible white bands
  //    are regions where THAT field is already high: n1 correlates with n1md
  //    (same field), and cirrus shows exactly where n2 is high (same domain,
  //    octave-correlated). Tone must be independent of the masks, or the ramp
  //    saturates everywhere the clouds are visible. One extra noise call at
  //    2 octaves is the price of per-cloud tone variety.
  //  - litF is set DIRECTLY from a soft-thresholded tone field, on a HARD
  //    split, and the shade colour is much darker than looks reasonable —
  //    three findings the debug captures forced (2026-08-31, unblended
  //    skyMat renders of litF/massTone and of massTone alone):
  //    (1) litF's additive forms (0.55/0.45, then 0.35/0.65) plateau at ~0.75
  //    over the whole deck — the n1 term is ~0.8 inside every visible fragment
  //    and massTone clusters mid-high — and mix(shade, lit, 0.75) is still
  //    white. The tone value's DISTRIBUTION is the lever: a renormalised fBm
  //    clusters near 0.5, so wide-ramp smoothsteps map it to a plateau; a
  //    narrow soft threshold at the cluster centre (0.40..0.58) splits the
  //    masses bimodally instead, which the massTone-alone capture shows as
  //    roughly half grey masses / half lit in every view.
  //    (2) A "0.5-ish grey" does not survive the pipeline. ACES + exposure
  //    1.12 puts a 0.69-linear grey at ~212/255 and the lit white at ~232 —
  //    and thin fragments are further diluted toward the pale sky by the
  //    cloudAmt mix — so shade 0.5 renders as "another white wisp". The first
  //    four tint attempts (v1-v5, then shade 0.5/0.55 with a 0.3 lit base)
  //    all failed this way while the debug renders looked fine; five builds
  //    showed <0.06% of sky pixels changed >90 RGB before v9 (v9: 3.5%).
  //    cloudShade had to go to 0.30-0.42 linear for the dark masses to read
  //    as genuinely grey (~195-205/255) next to ~230 whites.
  //    (3) The split is hard (litF ≈ 0.06 for grey masses, ≈ 0.96 lit): any
  //    lit-term weight inside the grey masses (0.22-0.35 in the variants)
  //    drags them back into the ACES shoulder and they whiten out again.
  //    The n1 term returns at low weight (0.08) purely as intra-mass
  //    structure: dense centres a touch brighter than their rims.
  const toneN = mx_fractal_noise_float(vec3(p.add(vec2(19.3, 7.7)), 23.7), 2, 2.0, 0.5)
    .mul(1.1667).mul(0.5).add(0.5);
  const massTone = smoothstep(0.40, 0.58, toneN);
  const litF = clamp(massTone.mul(0.9).add(0.06).add(smoothstep(0.5, 0.9, n1).mul(0.08)), 0, 1);
  const cloudLit = mix(vec3(1.06, 1.03, 0.98), vec3(1.06, 0.87, 0.7), warm);
  const cloudShade = mix(vec3(0.3, 0.34, 0.42), vec3(0.44, 0.32, 0.28), warm);
  const cloudCol = mix(cloudShade, cloudLit, litF);

  const skyMat = new THREE.MeshBasicNodeMaterial({
    side: THREE.BackSide,
    fog: false
  });
  skyMat.colorNode = mix(grad.add(glowCol.mul(glow)), cloudCol, cloudAmt);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(3800, 32, 16), skyMat);
  scene.add(sky);

  // HDR core: over-unity color so tone mapping reads it as white-hot instead
  // of the flat gray disc the old 1.0-white material produced. The core also
  // feathers radially — `facing` falls from 1 at the disc centre to 0 at the
  // silhouette (like sqrt(1-(r/R)^2) in projection), and an unfeathered
  // 2.6-vs-halo step there read as a pasted plate (the R6 critic's first
  // recorded weakness). Measured first attempt: smoothstep(0, 0.5, facing)
  // reaches full brightness 13% of the radius from the limb — a 2-4px hard
  // step with a dark fringe, verdict "unresolved" (V2 critic). smoothstep
  // over the FULL facing range spends a full disc radius on the ramp; the
  // edge value sits ON the backdrop halo (pow(sunAmt,260) is ≈0.9+ right at
  // the disc's own angle), so the core fades into the glow, never darker
  // than it.
  const facing = normalView.dot(positionViewDirection).max(0);
  const sunMat = new THREE.MeshBasicNodeMaterial({ fog: false });
  sunMat.colorNode = mix(
    vec3(1.28, 1.22, 1.12),
    vec3(2.6, 2.3, 1.9),
    smoothstep(0, 1, facing)
  );
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(18, 16, 16),
    sunMat
  );
  scene.add(sunMesh);

  /**
   * Retune the dome and the haze for a sun elevation. The horizon stop and
   * the fog colour are derived from the SAME color, so distant terrain always
   * fades into the sky the air actually shows (the old dome hazed into a fog
   * hue the sky did not contain).
   */
  const golden = { top: new THREE.Color(SKY_PALETTE.top[0]), mid: new THREE.Color(SKY_PALETTE.mid[0]), bot: new THREE.Color(SKY_PALETTE.bot[0]) };
  const midday = { top: new THREE.Color(SKY_PALETTE.top[1]), mid: new THREE.Color(SKY_PALETTE.mid[1]), bot: new THREE.Color(SKY_PALETTE.bot[1]) };
  function updateSun(elevationDeg, sunWorldDir) {
    const t = Math.max(0, Math.min(1, elevationDeg / 45));
    top.value.copy(golden.top).lerp(midday.top, t);
    mid.value.copy(golden.mid).lerp(midday.mid, t);
    bot.value.copy(golden.bot).lerp(midday.bot, t);
    warm.value = 1 - t;
    skySunDir.value.copy(sunWorldDir);
    scene.fog.color.copy(bot.value);
  }

  return {
    sun, hemi, sky, sunMesh, updateSun, cover,
    cloudScale, cloudWarpX, cloudWarpY, cloudDetailBias, cloudBoundK
  };
}
