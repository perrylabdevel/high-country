# Handoff: Semi-Realistic Terrain & Environment Materials

**Audience:** the agent picking up material work on High Country.
**Written against:** repo at `629c87d`, three.js r170 vendored, vanilla JS, no build step.

---

## 0. Read this first — the premise has changed

Two things about this repo that earlier drafts of this handoff got wrong. Do not
skip them; they determine what your first day looks like.

### 0.1 Materials already exist. Your job is replacement, not greenfield.

The world is not untextured. There is a working, blockout-grade material layer:

| What exists | Where |
|---|---|
| Procedural canvas textures — grass, dirt, wood, bark, rock, shingle | `src/world.js:29-125` |
| Terrain: per-vertex biome color, slope darkening, road/creek/lake tinting | `src/environment.js:19-56` |
| Terrain road blend via raw-GLSL `onBeforeCompile` patch | `src/environment.js:66-80` |
| Sky: gradient dome `ShaderMaterial` (hand-written GLSL) | `src/environment.js:108-135` |
| Sun, shadows (2048, fitted frustum, tuned bias), hemi + ambient, `FogExp2` | `src/environment.js:88-104` |
| ACESFilmic tone mapping, exposure 1.12, sRGB output | `src/main.js:58-60` |
| Water: lake, creeks, toxic creek, dry wash — flat quads at `WATER = 13` | `src/landmarks.js:250-300` |

So the lighting/tone-mapping setup that §7 of this doc describes is **already
done and correct**. Don't rebuild it; extend it (HDRI + PMREM is the missing
piece). And when you replace the terrain material, you are replacing the
`onBeforeCompile` road blend too — the splat-channel road in §6 supersedes it.
Two road blends fighting each other is a bug waiting to happen.

Keep the per-vertex biome color. It is good data (`BIOME` table,
`src/environment.js:5-17`) and makes an excellent macro-variation tint input for
§2.5. Do not throw it away just because the layer above it is being rewritten.

### 0.2 The stack must be migrated before any of this is possible.

This doc targets **three.js WebGPURenderer + TSL node materials**. The repo today
is the WebGL build of r170, vendored as a single file, with no npm, no
`node_modules`, no bundler, and an importmap that resolves exactly one bare
specifier (`"three"`). None of the techniques below can be written against that:

- `three/webgpu` and `three/tsl` do not exist in the vendored file.
- `KTX2Loader` and the Basis transcoder live in `examples/jsm`, which is not vendored.
- Depth-buffer sampling for water (§5) needs node-material viewport access.
- `onBeforeCompile` and `ShaderMaterial` (raw GLSL) **do not work under
  `WebGPURenderer`**. The existing terrain patch and sky dome will break.

Milestone 0 is that migration. It is real work — budget a day — and it is not
optional groundwork you can defer. Everything after it depends on it.

---

## 1. Milestone 0 — Toolchain migration

### 1.1 Versions (verified against npm on 2026-08-14)

| Package | Version | Why |
|---|---|---|
| `three` | `0.185.1` | ships `./webgpu` and `./tsl` export subpaths |
| `@types/three` | `0.185.4` | three ships **no** bundled `.d.ts` — see 1.3 |
| `vite` | `8.2.1` | dev server, HMR, TS transpile, prod bundle |
| `typescript` | latest 5.x | |
| `lil-gui` | `0.21.0` | parameter panel (§2.3) |
| `tsx` | `4.23.12` | run the existing node checks against TS sources |
| `sharp` | `0.35.3` | channel packing script (§3.3), devDependency |
| `stats.js` | latest | frame stats overlay (§9) |

Do **not** stay on r170. It predates most of the TSL surface this doc uses.

### 1.2 What migration actually involves

1. `npm init` properly, add the deps above, commit the lockfile.
2. Add Vite. Move `index.html` to the Vite convention; the importmap goes away
   (Vite resolves bare specifiers). Keep `serve.py` working against
   `dist/` for the no-npm run path if you want to preserve it — say so in the
   README either way, because the README currently promises "no compile step"
   and that promise is being broken deliberately.
3. Delete `vendor/three/three.module.js` and `scripts/register-three.mjs`. The
   loader hook exists only to map `"three"` to the vendored file; with npm,
   node resolves it natively.
4. Rename `src/*.js` → `src/*.ts` incrementally. `allowJs: true` in tsconfig
   lets you port file by file rather than in one commit.
5. Swap `WebGLRenderer` → `WebGPURenderer` in `src/main.js:53`. Keep the
   existing tone mapping / output color space lines — they carry over unchanged.
   Note `new WebGPURenderer({ forceWebGL: true })` gives a WebGL2 backend on
   machines without WebGPU; wire it to a URL flag so you can A/B a suspected
   backend bug.
   `renderer.init()` is async — the render loop must not start before it resolves.
6. Port every `MeshStandardMaterial` to `MeshStandardNodeMaterial`. There are
   ~35 across `buildings.js`, `interiors.js`, `industry.js`, `landmarks.js`,
   `shore.js`, `horse.js`, `player.js`, `roads.js`, `vegetation.js`, `main.js`.
   Mostly mechanical — same constructor options.
7. Rebuild the two raw-GLSL sites, which have no mechanical port:
   - terrain `onBeforeCompile` road mix → TSL (or drop it temporarily and note
     the regression; §6 replaces it properly).
   - sky `ShaderMaterial` → a node-material gradient dome, or drop it in favor
     of the HDRI environment from §7.
8. Copy the Basis transcoder to a served path — it is loaded at runtime, not
   bundled: `node_modules/three/examples/jsm/libs/basis/{basis_transcoder.js,basis_transcoder.wasm}`
   → `public/basis/`. `KTX2Loader` is at `three/examples/jsm/loaders/KTX2Loader.js`.

### 1.3 Pin the TSL API surface — the file the old doc named does not exist

There is no `node_modules/three/build/three.tsl.d.ts`. three ships no types at
all; `@types/three` is a separate DefinitelyTyped package and its TSL coverage
lags the runtime. **Ground truth is the source**: `node_modules/three/src/nodes/TSL.js`,
or the export list at the end of `node_modules/three/build/three.tsl.js`
(638 exports in 0.185.1).

I verified these are all present in 0.185.1 — you can use them without checking:

```
texture, texture3D, uv, mix, smoothstep, select, abs, pow, max, dot, normalize,
float, vec2, vec3, Fn, uniform, time, oscSine,
positionWorld, positionView, normalWorld, cameraPosition, screenUV, instanceIndex,
mx_noise_float, triNoise3D, transformNormalToView,
viewportDepthTexture, viewportSharedTexture, reflector
```

`viewportDepthTexture` and `viewportSharedTexture` are what make §5's depth ramp
and refraction possible. `reflector` is a later upgrade path for water.

Put a comment at the top of each material module naming the three version it
targets.

### 1.4 Milestone 0 acceptance criteria

The repo has a regression suite. It is the contract:

```
scripts/check-grounding.mjs      scripts/check-collision.mjs
scripts/check-handedness.mjs     scripts/check-debug.mjs
scripts/check-settlements-dry.mjs scripts/check-needle.mjs
scripts/check-interiors.mjs      scripts/check-map-layout.mjs
scripts/check-roads.mjs
```

All nine must still pass after migration. They import from `src/`, so once
`src/` is TypeScript they need `tsx` (or `vite-node`) instead of the
`--import ./scripts/register-three.mjs` hook. Add npm scripts for them.

Milestone 0 is done when: all nine checks pass, the world renders under
`WebGPURenderer` looking approximately as it does today, and you can walk around
it. Not when it compiles.

---

## 2. Before you write shader code

### 2.1 Build a material test scene first

Create `src/dev/MaterialLab.ts` behind a dev flag or route:

- A flat 20×20 plane at origin
- A sphere and a cube (to read normal maps and lighting response)
- A ramp/wedge from 0° to 90° slope (triplanar and slope blending)
- A strip receding 500m into the distance (tiling repetition, distance falloff)
- A time-of-day slider driving the sun direction

Every material gets validated here first. Debugging a blend function while
walking around a 4×5km world is a waste of time.

### 2.2 World facts you'll need for tuning

From `src/map.js` and `src/heightfield.js`:

- World is **4000 × 5000 units** (8×10 miles at 500 units/mile), terrain grid
  320 × 400 → **~12.5 units per quad**. Coarse. Fragment-level blending is fine;
  do not plan on vertex displacement doing anything useful at this resolution.
- Water plane sits at `WATER = 13`.
- **The masks §2.2 and §6 tell you to bake already exist as functions**:
  `biomeAt(x, z)`, `roadFactor(x, z)`, `creekFactor(x, z)`, `lakeFactor(x, z)`,
  plus `ROADS`, `CREEKS`, `BRIDGES` splines. You can bake them to a splat
  texture at startup by sampling on a grid — you do not need to derive them from
  scratch, and you should not invent a parallel source of truth.
- `POS` holds named landmark positions; `inClearing(x, z)` marks tree exclusion.

### 2.3 Wire up a live parameter panel

`lil-gui`. Every tunable in every material is a `uniform()` exposed to the panel —
tiling scales, blend sharpness, noise frequency, color tints, roughness
multipliers, wind strength, water depth ramp. Add an "Export settings as JSON"
button so tuned values can be committed to a config file.

**Hardcoded magic numbers in material code are a bug.** Art direction is found by
dragging sliders, not by editing constants and waiting for HMR.

---

## 3. Asset acquisition and pipeline

### 3.1 Sources (all CC0, no attribution burden)

- **Poly Haven** (polyhaven.com/textures) — best quality, full PBR sets, direct download URLs
- **ambientCG** (ambientcg.com) — huge library, good for gravel/rock/dirt variants
- **Poly Haven HDRIs** — environment map and image-based lighting

### 3.2 What to download

| Slot | Search terms | Notes |
|---|---|---|
| Grass ground | "grass field", "meadow" | needs a good height/displacement map |
| Dirt / soil | "dirt", "forest floor" | the default under-layer |
| Rock / cliff | "rock cliff", "granite" | applied by slope, triplanar |
| Gravel | "gravel", "crushed stone" | roads |
| Sand / silt | "riverbed sand" | river banks and bed |
| River bed rock | "river rocks", "pebbles" | under shallow water |
| Tree bark | "bark willow", "bark pine" | 1–2 variants; replaces `barkTexture()` |
| Leaf atlas | source or author separately | alpha-cut cards |
| Water normals | "water normal" or generate procedurally | two scales |
| HDRI | outdoor, midday + golden hour | environment lighting |

Download **2K**. 4K is wasted on terrain mostly seen at distance and will blow
the VRAM budget.
Grab: **albedo/diffuse, normal (GL, +Y up), roughness, ambient occlusion,
displacement/height**.

Raw downloads go in a gitignored `assets-src/`; only the packed, compressed
output under `public/textures/` is committed. Decide this before you download
10 texture sets — do not commit 2K PNG source sets.

### 3.3 Channel packing — do this, it matters

Combine roughness, AO, and height into a single RGB texture to cut sample counts
by ~3×:

- **R** = ambient occlusion
- **G** = roughness
- **B** = height/displacement

Write `scripts/pack-textures.mjs` using `sharp` to do this over the download
folder. The packed map loads in **linear** color space (`THREE.NoColorSpace`),
never sRGB.

### 3.4 Compression

Convert to **KTX2 / Basis Universal** with `toktx` or `@gltf-transform/cli`.
Load with `KTX2Loader` plus the transcoder you copied to `public/basis/` in
Milestone 0. Uncompressed PNGs cost 4–6× the VRAM and stall the first frame badly.

Albedo → UASTC or ETC1S depending on quality need. Normal maps → UASTC (ETC1S
mangles normals).

### 3.5 Color space — the single most common bug

- Albedo/diffuse: `THREE.SRGBColorSpace`
- Normal, roughness, AO, height, masks, packed maps: `THREE.NoColorSpace`

Getting this wrong produces washed-out or muddy output that no amount of tuning
will fix. Set it once in a central `loadTexture()` helper that takes the intended
type as an argument, so it can't be forgotten per-call. (`src/world.js:16-27`
already does this correctly for canvas textures — same idea, keep the pattern.)

### 3.6 Manifest

Every texture set is described in `src/materials/textureManifest.ts`:

```ts
export const TEXTURE_SETS = {
  grass: {
    albedo: '/textures/grass_2k_albedo.ktx2',
    normal: '/textures/grass_2k_normal.ktx2',
    orm:    '/textures/grass_2k_orm.ktx2',   // R=AO G=Rough B=Height
    tiling: 8,        // world units per full repeat — tune in the panel
    heightBias: 0.0,  // blend weighting bias
  },
  // ...
} as const;
```

No file paths scattered through material code.

---

## 4. Terrain surface

Highest-leverage material in the project. Replaces the vertex-color material at
`src/environment.js:57-84`.

### 4.1 Layer set

Four layers blended per-fragment: **grass, dirt, rock, gravel**. (Sand can be a
fifth if riverbanks need it; start with four.)

### 4.2 Blend weights

Three inputs combined:

1. **Slope** — `normalWorld.y`. Steep → rock. `smoothstep` with tunable start/end
   angles, not a hard cutoff.
2. **Altitude** — `positionWorld.y`, with a noise-perturbed threshold so the
   transition isn't a horizontal band.
3. **Splat map** — bake `biomeAt`/`roadFactor`/`creekFactor`/`lakeFactor` to an
   RGBA splat texture at startup (see 2.2) and sample it. Supplement with
   low-frequency `mx_noise_float` over world XZ for within-biome variation.

Perturb every threshold with noise before it hits `smoothstep`. Straight,
unbroken transitions read as artificial instantly.

### 4.3 Height-based blending — do not use a plain `mix()`

The technique that most separates good terrain from bad. Instead of linearly
cross-fading two textures, use each layer's **height map** to decide which wins
per-pixel, so gravel settles into the cracks of the grass rather than ghosting
over it.

```
weight_i' = weight_i * (height_i + heightBias_i)
maxW = max(all weight_i')
contribution_i = max(0, weight_i' - (maxW - blendSharpness))
final = Σ(albedo_i * contribution_i) / Σ(contribution_i)
```

`blendSharpness` is a uniform, roughly 0.05–0.3. Low = crisp interlocking
transition; high = smooth fade. Expose it.

Apply the same weights to normal and ORM sampling, not just albedo — otherwise
the surface lights wrong at every boundary.

### 4.4 Triplanar projection

UV-mapped terrain stretches horribly on cliffs. Sample along all three world axes
and blend by the world normal:

```
blendWeights = pow(abs(normalWorld), vec3(triplanarSharpness))
blendWeights /= (blendWeights.x + blendWeights.y + blendWeights.z)
color = sampleX * bw.x + sampleY * bw.y + sampleZ * bw.z
```

Triplanar triples sample count, so **only apply it where slope exceeds a
threshold** — standard UV on flat ground, blending into triplanar as slope rises.
For normal maps use whiteout blending (swizzle and add), not naive averaging of
tangent-space normals.

### 4.5 Killing tiling repetition

At 4×5km a repeating 2K texture reads as a visible grid. Three stacked fixes, all
uniform-controlled:

1. **Macro variation** — multiply albedo by very low-frequency noise (period
   ~100–300 world units) varying brightness and hue saturation. The existing
   per-vertex biome color is a ready-made second macro input; blend it in here.
   Cheap, huge payoff.
2. **Two-scale sampling** — sample the same albedo at `tiling` and
   `tiling * 0.137`, combine with overlay/multiply. The irrational-ish ratio
   prevents alignment.
3. **Stochastic/hex-grid sampling** — offset UVs per virtual tile using a hash,
   blend three neighbors. Expensive (3× samples). Primary grass and dirt only,
   gated behind a quality setting.

### 4.6 Distance handling

Beyond ~60m, detail normals contribute nothing but shimmer and cost:

- Lerp detail normal strength toward 0 by camera distance
- Drop stochastic sampling and triplanar past the threshold
- Optionally fade toward a single averaged color for the far LOD

Use `positionView.z` or distance from `cameraPosition`; near/far on the panel.

---

## 5. Grass (the ground-cover pass)

The terrain grass texture handles distant ground. This is the geometry pass on
top. Extends `src/vegetation.js`, which currently places instanced pines and has
a `skipGrass(x, z)` exclusion mask you should reuse rather than reinvent.

- **Instanced cards**, 3–7 blades per card, **alpha-tested** (not alpha-blended —
  blending breaks depth sorting and tanks fill rate). `alphaTest` ≈ 0.4.
- **Placement** driven by the terrain's grass blend weight: sample the same mask,
  reject instances where grass weight is low. The geometry then agrees with the
  ground texture automatically.
- **Density falloff** by camera distance, plus a hard cull radius (~40–60m).
  Beyond that the terrain texture carries it.
- **Base tinting:** sample terrain albedo at each instance's world position and
  tint the lower portion of the card toward it. Untinted grass floating on
  differently-colored ground is the most obvious tell of a fake-looking scene.
- **Wind:** in the vertex node, offset by
  `sin(time * freq + positionWorld.x * scale + positionWorld.z * scale)` scaled by
  height along the blade (UV.y or a stored attribute) so roots stay planted. Add
  a second lower-frequency gust wave. Direction and strength are uniforms.
- **Lighting:** approximate translucency with a backlight term — when view
  direction opposes the sun, add a warm green contribution. Cheap, very effective
  at golden hour.
- Grass instances **cast no shadows individually.** Not negotiable.
  Note `src/vegetation.js:59-62` currently sets `castShadow = true` on all four
  instanced meshes; audit that when you touch the file.

---

## 6. Trees

Replaces the cone-and-cylinder pines in `src/vegetation.js` and the
`barkTexture()` canvas material.

- **Trunk:** bark set, standard UV, with vertex-color or noise-driven variation
  between instances so a forest doesn't look cloned. Vary instance scale ±20% and
  Y-rotation randomly. (Placement logic — `plantChance(biome)`, burn-site
  handling — is already written; keep it.)
- **Foliage:** alpha-cut cards from a leaf atlas. Same alpha-test rule as grass.
- **Translucency:** approximate two-sided subsurface — `side = THREE.DoubleSide`,
  plus a transmission term proportional to `max(0, dot(-viewDir, sunDir))` tinted
  toward leaf color. This is what makes canopies read as leaves rather than
  cardboard.
- **Ambient occlusion:** darken foliage cards toward the canopy interior using
  vertex colors baked at generation time. Uniform-bright foliage looks flat.
- **Wind:** same vertex-node approach as grass, lower frequency, higher
  amplitude, plus slight trunk sway.
- **LOD:** full mesh near → reduced card count mid → camera-facing billboard far,
  via `THREE.LOD`. Impostor generation can wait.

---

## 7. Rivers and water

Where semi-realistic either sells or collapses. Replaces `createWater()`
(`src/landmarks.js:250-300`), which is currently flat translucent quads — creeks
are emitted as one quad per ~10 units of spline, so check the draw-call cost of
whatever you replace it with.

Build in this order, checking after each step:

1. **Depth-based color ramp.** Sample scene depth (`viewportDepthTexture`),
   compute water depth as surface minus floor behind it, lerp albedo from a pale
   shallow color to a deep saturated one. Two color uniforms plus a falloff
   distance. This single step does most of the work.
   Note the creek geometry is a flat ribbon at `WATER = 13` with no carved bed —
   you may need to sink the terrain under the channel for depth to read at all.
2. **Dual scrolling normals.** Two samples of the same normal map at different
   scales, scrolling at different speeds and slightly different directions,
   combined with whiteout blending. Never a single scrolling normal map — the
   uniform drift is instantly readable as fake.
3. **Flow direction.** Rivers must flow *along* the channel. Bake a flow map
   (RG = 2D direction) from the `CREEKS` splines in `src/map.js` and use it to
   steer the scroll. Use the two-phase flow technique (two offset time phases
   cross-faded on a sawtooth) to avoid visible stretching.
4. **Fresnel reflection.** `pow(1 - dot(normal, viewDir), 5)`. Blend between
   refracted scene color and the environment map. SSR is a later upgrade; the env
   map is enough to start.
5. **Refraction.** Sample scene color (`viewportSharedTexture`) with UVs offset
   by the water normal's XY, scaled by depth so shallow water distorts less.
6. **Shoreline foam.** Where depth is below a threshold, add white foam modulated
   by scrolling noise and by the flow map. Threshold and noise scale are uniforms.
7. **Rapids/whitewater.** Where riverbed slope is steep, increase foam and normal
   agitation. Drive from a channel baked at generation time.

Water renders **after** opaque geometry (`transparent: true`, or a dedicated
pass) and must not write to the depth buffer it samples.

The toxic creek and dry wash variants (`toxicMat`, `washMat`) are story-relevant
— keep them distinguishable. The dry wash isn't water at all and should probably
become a terrain blend layer instead.

---

## 8. Gravel roads

- Roads are a **terrain blend layer**, not separate geometry, wherever possible —
  avoids z-fighting and seams entirely. `roadFactor(x, z)` already gives coverage;
  bake it into a splat channel. This replaces the `onBeforeCompile` road mix from
  Milestone 0.
- Edge mask must be **noise-broken**, never a clean line. Gravel scatters.
  Modulate with small-scale noise so the boundary is ragged and stones intrude
  into the grass.
- **Compacted center / loose edge**: slightly darker, smoother, lower-height in
  the wheel tracks; looser and lighter at the margins. Drive from distance to
  centerline — `nearestRoadDistance()` in `src/map.js` already computes this.
- Roughness high (0.8–0.95), slightly varied by noise. Uniform roughness reads as
  plastic.
- Bridges and trestles (`src/roads.js:160-230`) **must** stay separate geometry.
  Use a decal material with `polygonOffset` and alpha-ramped edges where road
  meets deck.
- `scripts/check-roads.mjs` asserts road network geometry. Don't break it.

---

## 9. Lighting, environment, and post

Mostly **already done** — see 0.1. What's missing:

- **Environment:** load an outdoor HDRI, run through `PMREMGenerator`, assign to
  `scene.environment`. Expose `scene.environmentIntensity` as a uniform. This is
  the main gap and it matters more than anything else in this section.
- **Sky:** the gradient dome breaks under WebGPU (raw GLSL). Either port to a
  node material or replace with the HDRI-backed background. Whichever you pick,
  the fog color must stay matched to the horizon — that pairing is already tuned
  (`0x9bb4c8` fog against the dome's `0xd7c09a` mid band).
- **Sun:** exists with a fitted frustum and `bias -0.00025`. Re-tune `bias` and
  `normalBias` after the terrain material lands — shadow acne on terrain looks
  exactly like a material bug and will send you hunting in the wrong file.
- **Tone mapping / output color space:** done, don't touch.
- **Fog:** `FogExp2` exists. Upgrade to height fog if you want proper aerial
  perspective; it's a large, cheap win for outdoor realism.
- **Post:** subtle bloom on specular highlights and water. Nothing heavy.

---

## 10. Performance budget

Target **60fps at 1080p on a mid-range discrete GPU**.

| Metric | Budget |
|---|---|
| Texture VRAM (all environment) | < 512 MB |
| Draw calls per frame | < 400 |
| Terrain fragment texture samples | < 20 near, < 8 far |
| Grass instances visible | < 200k |
| Shadow-casting draw calls | < 100 |

**Measure the current scene before you start** — creeks, buildings, and landmark
props are built as many small meshes and the draw-call count today is unknown. If
it is already over 400, that's a batching task, not a material task, and should
be called out rather than silently absorbed into your milestone.

Add an on-screen stats overlay (`stats.js` + `renderer.info`) behind the dev
flag. Check after every material added. Any technique costing more than 2ms needs
a quality-tier gate.

---

## 11. Anti-patterns — do not do these

- Linearly `mix()`-ing terrain layers instead of height-blending them
- Forgetting `colorSpace` on any texture
- Triplanar mapping the entire terrain instead of slope-gated
- A single scrolling normal map for water
- Straight, unperturbed transition lines between any two materials
- Alpha *blending* on grass or foliage instead of alpha *testing*
- 4K textures anywhere in this scene
- Hardcoded tuning constants instead of panel-exposed uniforms
- Per-blade grass shadow casting
- Writing TSL from memory instead of checking `src/nodes/TSL.js` in the installed version
- Deleting the biome color data, the placement masks, or the road/creek splines
  because the material layer above them is being replaced

---

## 12. Milestones

Each ends with a screenshot from MaterialLab **and** from the live world, at
midday and golden hour.

0. **Toolchain migration** — npm, Vite, TS, three 0.185, WebGPURenderer, node
   materials, KTX2 loader wired, all nine `scripts/check-*.mjs` passing. (§1)
1. **Foundations** — HDRI + PMREM environment, MaterialLab scene, lil-gui panel,
   `loadTexture()` with correct color spaces, texture manifest, packing script.
2. **Terrain base** — four layers, slope + altitude + splat weights, height-based
   blending, correct normal/ORM blending. The big one; expect the most time here.
3. **Terrain polish** — triplanar on slopes, macro variation (including biome
   vertex color), two-scale sampling, distance falloff.
4. **Roads** — splat channel, noise-broken edges, center/edge variation; retire
   the old `onBeforeCompile` blend for good.
5. **Grass geometry** — instanced cards, mask-driven placement, base tinting,
   wind, density falloff.
6. **Trees** — bark, foliage atlas, translucency, per-instance variation, LOD.
7. **Water** — depth ramp, dual normals, flow map, fresnel, refraction, foam,
   rapids.
8. **Optimization** — measure against §10, add quality tiers, cut what doesn't
   earn its cost.

---

## 13. How to verify your work

Do not mark a milestone done because the code compiles.

- Render MaterialLab and **look at the screenshot**. Pull a real reference photo
  of the same material and put it side by side.
- Check every material at three distances: 2m, 30m, 300m.
- Check at three sun angles: overhead, 45°, near-horizon backlit.
- Check the transition zones specifically — grass→rock on a slope, road→grass at
  the edge, water→bank at the shoreline. Transitions are where fake-looking
  scenes give themselves away.
- Re-run all nine `scripts/check-*.mjs`. They cover grounding, collision,
  handedness, roads, interiors, and map layout — a material change shouldn't
  touch them, and if it does, you moved geometry you didn't mean to.
- Confirm the stats overlay is still inside budget.

If something looks wrong and the cause isn't obvious, output the intermediate
value as final color — blend weights as RGB, world normal, computed water depth,
the noise field — and look at it directly. Debug visualization modes should be a
dropdown on the GUI panel, added as you go. `src/debug.js` already exists; extend
it rather than starting a parallel debug path.
