# Hard-Won — the defect register

Every entry here cost real time to find. The design documents capture what the
project should look like; this one captures what has already gone wrong, so it
does not go wrong again in a rewrite, a new repo, or the next agent's first week.

Format: **symptom → cause → fix**, plus how it was actually found. That last
part matters — most of these were caught by computing or by reading an error,
not by looking at the scene.

---

## 1. Renderer and materials

### 1.1 Water rendered pure black (`NaN` through the uniform buffer)

**Symptom:** Lake Mercy a flat black void; creeks subtly wrong.
**Cause:** `uniform(new THREE.Color(v), "vec3")`. Under WebGPU, type `"vec3"`
makes the node builder allocate a `Vector3NodeUniform`, which packs its GPU
buffer from `.x/.y/.z` — properties `THREE.Color` does not have. Every component
read back `undefined`, was written as `NaN`, and poisoned every downstream
`mix()`. It hit the lake, the creek and the toxic creek equally; only the lake
had grading criteria sharp enough to catch it.
**Fix:** use `"color"`, which packs from `.r/.g/.b`.
**Found by:** reading the uniform declaration after the render disagreed with
the maths — not by looking at the image.

### 1.2 `viewportDepthTexture` fails under MSAA

**Symptom:** the lake black even after 1.1, only with `antialias: true`.
**Cause:** WebGPU bind-group validation — *"Sample count (1) of [Texture
(Depth24Plus)] doesn't match expectation (multisampled: 1)"*. three's shared
depth texture for that TSL node never gets a sample count matching the
renderer's MSAA target.
**Fix:** the lake uses its own depth source rather than the viewport depth
texture.
**Found by:** reading the actual GPU validation error.

### 1.3 A plain `three` import bundles a second copy

**Symptom:** node materials silently break; objects render untextured or black.
**Cause:** `vite.config.ts` aliases `three` → `three/webgpu`. A module importing
plain `"three"` gets a second three instance, whose material classes are not the
ones the renderer knows.
**Fix:** every module imports `three/webgpu`. Hit three separate times
(`fort.js`, `homestead.js`, `pines.js`).

### 1.4 Golden hour crushed to black

**Symptom:** foreground nearly black at low sun; `mission-golden` scored 0 on
three criteria at once.
**Cause:** the golden HDRI was scaled *down* (`0.7`) while the sun was also low
and warm, so nothing filled the shadow side.
**Fix:** `1.85`. U5 on golden frames went 2.94 → 4.13.
**Caution:** this also exposed 1.1 by changing which frames showed the `NaN`.
A fix that lifts twenty scores and breaks four is not finished.

---

## 2. Spatial and geometry

### 2.1 `THREE.LOD` cannot do per-instance LOD

**Symptom:** every tree in the world drew as a far billboard, including the one
you were standing next to.
**Cause:** `THREE.LOD` switches on distance from **its own origin**. Both tree
LODs sat at world (0,0,0); the ranch is 500 units away and the far threshold was
170. The near and mid canopies were never drawn anywhere.
**Fix:** a per-frame bucketing pass that rewrites the instance matrices of a
near/far mesh pair by camera distance.

### 2.2 Billboard doubled and sheared

**Cause:** `positionNode = positionLocal.add(offset)` where `positionLocal` was
already the plane's corner and `offset` added a camera-aligned displacement of
the same size. Billboard geometry must have all vertices at the origin.

### 2.3 Canopy cards coplanar

**Cause:** cards spread over `2π`. At 8 cards, card *i* and card *i+4* land on
the same plane — 4 distinct planes drawn twice, z-fighting with doubled alpha
edges. Must be `π`; `DoubleSide` covers the back.

### 2.4 Props placed outside the building

**Symptom:** the saloon bar, the piano and the jail cell stood in the street.
**Cause:** "depth inward from the door" was read as a raw local Z. With the door
wall at `+d/2`, anything at `depth = d * 0.55` lands outside.
**Fix:** an explicit `atDepth(d, depth) => d/2 - depth` helper. This is the
canonical frame-of-reference bug and the reason `docs/ANCHORS.md` exists.

### 2.5 Roofs floating above walls

**Symptom:** 1.90 m of daylight between the ranch house walls and its roof.
**Cause:** wall top at 7.45 (`wallY 3.85 + wallH/2`), roof base at 9.35
(`position.y 11.65 − height/2`). Compounded by a 7.2 m eave on a single-storey
house — roughly 2× too tall — which also put the upper windows above the wall.
**Found by:** arithmetic on two numbers, before ever rendering it.

### 2.6 Cone roofs on rectangular plans

**Cause:** `ConeGeometry(r, h, 4)` rotated 45° is a square pyramid. On a
rectangular building the overhang is wrong on two sides by construction — the
barn's roof was *narrower* than the barn, so the walls stuck out past the eaves.
**Fix:** real gable/hip/shed builders whose plan is always ≥ the footprint.

### 2.7 Single-point grounding

**Cause:** every helper set Y from `heightAt(x, z)` at the object's **centre**.
The terrain grid is ~12.5 m per quad, so anything wider floats at one corner and
sinks at the other. Worse in `interiors.js`, where each wall sampled its own
position — four walls of one building at four different heights.
**Fix:** `footing()` samples all four rotated corners, seats at the minimum, and
emits a skirt to cover the drop.

### 2.8 Axis-aligned colliders block rotation

**Cause:** `addBoxCollider` stored `{minX, maxX, minZ, maxZ}`. Rotating a
building left its collider square to the world.
**Fix:** `addOrientedBoxCollider` — rotate the player into the box's local
frame, reuse the existing AABB resolve, rotate back. ~15 lines.
**Note:** this had to land *before* any rotation work, not after.

### 2.9 Shed roofs and blocked openings are not named special cases

**Symptom:** the ranch smith bay opened into the corral fence (sub-metre gap);
its shed sat on four equal walls with no false front, so the ridge flew. The
church door had the same shape of bug against a neighboring lot. Both were
caught as `name === "blacksmith"` / church-only checks, so the next copy
would have shipped.

**Cause:** anchors make two frames coincide. They do not choose a roof form,
and they do not ask whether the space *outside* an opening is walkable. A
fence is not a kit structure; `boxAt` colliders are not footprints.

**Fix:** `check-buildings.mjs` now asserts, for every kit structure: a shed
on equal-height walls must have a false front (or a wall that reaches the
ridge); every perimeter door/bay/barn must have 1.5 m of clear approach
along the opening normal, against other footprints *and* foreign colliders.
Independent literals in the same file prove both predicates before the
scene is built. Side-street lots without false fronts got gables; the rust
warehouse on Silver Creek's south row moved behind the lots (`town.z+40`)
so a door was not inside its collider.

**Found by:** the ranch smith yaw/roof pass, then running the generalized
check against the rest of the town.

### 2.x Prop pads floated on slopes — the grass bug, one layer up

**Symptom:** nothing. That is the point. Wide kit props (`boxOnGround`,
`cylOnGround`, `coneOnGround`) were seated at one centre terrain sample, so on
any slope the downhill end of the piece hovered while the uphill end buried —
a 4.1 m log stack floating 0.19 m at its low end, a charcoal-pit disc 0.25 m,
a sheepCamp tipi 0.35 m, an ironValley ore cart 0.46 m. No throw, no log; the
close-camera U4 reads named it only as "bases appear slightly detached".
**Cause:** the same centre-anchoring defect the grass tufts had (fixed by
`check:grass-grounding`), one layer up the abstraction stack: kit.js's own
comment said the prop pads use "a single heightAt sample — not four-corner
footing()", and `footing()` (4-corner min + skirt) existed for buildings but
was never applied to props.
**Fix:** the three typed helpers seat at the LOWEST terrain sample under the
footprint (`lowestSeat` — centre + a 16-point two-ring disc, ring radius =
half-diagonal so a later yaw cannot outrun the samples); each piece is stamped
`userData.groundSeat` so `check:prop-grounding` can verify the invariant and
skip pieces that deliberately rest on other pieces (ladder rungs, tent cones).
**Found by:** applying the grass-grounding lens to the classes that check did
not cover — dry-build, then bbox-bottom vs lowest-terrain-under-footprint for
every placement class. The same sweep is what cleared rocks (buried by design)
and buildings (already four-corner seated).

---

## 3. Verification — the expensive lessons

### 3.1 A check that cannot fail is not a check

`check-buildings.mjs` claimed twelve invariants. Two were real, six were absent
with comments claiming they were "validated by the kit's builders," and four
were tautologies asserting values constructed in the same file — it built a door
leaf 0.86 m wide and asserted the leaf was ≥ 0.85.

**Verified by reintroducing the original bugs:** floating the ranch roof 1.9 m
and setting the interior doorway back to 4.4 m both still printed `PASS`.

**Rule:** prove every invariant by reverting the fix, running the check, pasting
the failure, restoring. An invariant never observed failing is decoration.

### 3.2 Silent substitution

The KTX2 pipeline was wired end to end — loader created, transcoder copied on
postinstall, 527 KB of `basis_transcoder.wasm` shipped in the build — and every
path in the manifest was `.jpg`/`.png`. It transcoded nothing for weeks, and no
commit message mentioned it.

Same shape: two ground texture sets were the wrong material entirely (a concrete
slab as "dirt", potting soil as "gravel" — the surface of every road in the
game), and nobody had compared them to a reference.

**Rule:** if you skipped a step, say so in the commit message.

### 3.3 A grader that cannot see does not error

It fills in plausible middle scores. Before trusting any grading run, confirm
the tool actually delivers pixels:

```sh
claude -p --model haiku --allowedTools Read \
  'Read audit/current/lakeMercy-midday.png and describe the water colour.'
```

A correct answer names it as black. A generic description that would fit any
screenshot means stop.

### 3.4 Changing the grader destroys the series

Passes 01–03 were graded by `gemini-2.5-flash`, 04 onward by `haiku`. Those
numbers are not comparable, and pass 05 was the first pass comparable to the one
before it. Pin the grader; if you must change it, treat the next two passes as a
fresh baseline and say so.

**The prompt is part of the grader.** The identical tree scored 52 fails under
the 2026-08-26 full-pass prompt and 93 fails under a reworded prompt (arid-POI
note added, null policy relaxed) the next day — a swing far outside the 44–60
"noise band", which turned out to be bound to that prompt, not to the scene.
An A/B run inside the new prompt (93 → 116) was still valid because both sides
used the same wording; comparing either to pass-86/90/91 was not. When driving
the grader from a script, reuse the previous pass's prompt verbatim, or
re-baseline both sides of the A/B under the new wording and say so in the pass
report.

### 3.5 Nulls made the bar easier

The stop condition originally ignored unassessed criteria, so a grader declining
the hard ones made a clean pass *easier* — a third of all criteria came back
unassessed across the first three passes.
**Fix:** require ≥80% rubric coverage, with genuine "n/a" exempt and "cannot
assess" counting against.

### 3.6 Changing a criterion silently rewrites history

The second-tier review correctly found U1 was penalising arid POIs for having no
grass — but kept the id `U1`. Every past report's U1 now means something else.
**Rule:** never renumber or redefine a criterion id. Retire it, add a new one.

### 3.7 Five commits to answer a yes/no question

"Make the false fronts readable" produced commits escalating from *strengthen* →
*more prominent* → *decisively readable* → *solid raised platform*, with the
score never leaving 1. The question — is it visible from the street? — is a
raycast, or an ID-buffer read. It is not an adjective.

---

## 4. Tooling and capture

- **The title overlay swallows synthetic clicks.** Dispatch
  `document.getElementById("btn-enter").click()` directly; Playwright's
  `page.click()` times out.
- **`waitUntil: "load"` never fires** — the HDRI keeps it pending. Use
  `domcontentloaded`.
- **Playwright's default headless never exposes `navigator.gpu`** on some boxes.
  `--enable-unsafe-webgpu` gets Dawn's constrained software fallback, which
  hard-fails on `createBuffer` once the real scene allocates. `headless: false`
  gets the real adapter.
- **Capture without a GPU is ~50 s per frame** under software rasterisation. If
  a capture run seems hung, check the backend before debugging the script.
- **`npx playwright install` hangs on some distros.** Fall back to a system
  Chrome; `PLAYWRIGHT_CHROMIUM` overrides.
- **Never grade a partial capture set** — `grade` writes a numbered pass every
  run. Use `GRADE_CAPTURES=/tmp/...` for experiments.
- **A backend switch invalidates comparisons.** Everything before pass 04 was
  captured through the WebGL2 fallback; any score depending on a WebGPU-only
  path was suspect, water above all.
- **`codex-vision` takes long prompts on stdin, not argv.** It `stat()`s every
  positional argument to decide image-vs-prompt; a multi-KB prompt arg dies
  with `OSError: [Errno 63] File name too long` before any grading happens.
  Use `codex-vision --stdin-prompt <image>` with the prompt on stdin.

---

## 5. Project facts that are decisions, not accidents

State these as decisions in any rewrite, or a fresh agent will helpfully
"improve" them back:

- **1 world unit = 1 metre.** `EYE = 1.62`, walk 3.4 m/s, gallop 14.5 m/s.
- **The map legend disagrees** — 4000 × 5000 units is billed as 8 × 10 miles at
  500 units/mile, which would make a unit 3.2 m. The buildings and the player
  agree with each other; the legend is the outlier. Do not rescale the
  buildings to match it.
- **WebGPU is the target**, WebGL2 is a diagnostic fallback only.
- **Terrain, roads, creeks, scatter are procedural** and queried at runtime
  (`roadFactor`, `creekFactor`, `heightAt`). They are not authored assets.
- **Screenshots are gitignored and regenerable**; reports are committed.
- **Textures must never enter git history.** 230 MB of `.git` against a 263 MB
  working tree, most of it superseded uncompressed PNGs that are no longer even
  loaded.

---

## 6. Method — what actually worked

Nearly every real diagnosis in this project came from computing or reading, not
from looking:

- The 1.90 m roof gap: arithmetic on two numbers.
- The water `NaN`: reading a uniform type declaration.
- The MSAA failure: reading the GPU validation error.
- The LOD bug: knowing how the API computes distance.
- The tautological check: reintroducing the bug and watching it pass.

The vision loop is necessary — it caught the black lake, the sparse canopies,
the bare ground — but it is the slow, noisy, expensive instrument. Anything
computable should be computed. Reserve the grader for questions that are
genuinely perceptual.
