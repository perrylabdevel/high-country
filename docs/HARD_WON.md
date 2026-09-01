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

### 1.5 "Floating grass" that is not floating — a tonal ramp vanishing against dark backdrops

**Symptom:** at eye height, grass tufts in front of dark wood (the ranch barn
wall was the clean reproduction) read as lit blades starting in mid-air. The
grounding checks all passed — and they were right: a dry-build count showed
**0 of 49,573 ranch grass instances sitting more than 5 cm above the terrain**
under them. The geometry was grounded; the *read* was tonal.
**Cause:** `paintBladePanel` started every blade's gradient at the root stop
of the MEADOW/DRYISH/STRAW tables — luminance 0.18–0.23 against a mid stop of
0.34–0.47, a 2× ramp. Dark wood is 0.05–0.12, so the lower half of every blade
fell below the backdrop and disappeared into it, leaving only the lit upper
half visible — which reads as a blade whose base is missing. The dark root is
real art (it gives clumps internal depth), which is why the fix lifts the root
only to a 1.4× ramp instead of flattening it away; overshoot washes the field
to one value (the failure mode that bit the conifer canopies when their normal
bend was driven too hard).
**Found by:** the add-check lens applied in reverse — before adding another
geometric check, measure the suspected geometry. The check would have passed,
because there was nothing to check. The A/B that proved it is eye-height at a
dark wall, not the 30–70 m audit cameras where the artifact smears into
ambiguity.

---

### 1.5 Grass that looks like it floats, but does not

**Symptom:** in close frames, blades appear to start in mid-air — most obvious
in front of a barn wall, where light blade tips hang with nothing under them.
Reported independently by eye more than once.

**Not the cause**, each ruled out by measurement rather than argument: card
origin above terrain (0 of 49,573 ranch instances sit >5 cm above the ground
under them), geometry base offset (the card's base is at local y=0), painted
blades not reaching the panel bottom (all four species root 1.8% up), `fill`
drifted from the painter's `tall` (exact match), species-to-panel UV mapping,
wind lifting the base (profile is `uv.y^2`, zero at the base; peak displacement
0.18 m), and opacity fading the bases (distance only).

**Cause:** the blade gradient in `paintBladePanel` runs from a near-black root
to a much lighter mid — root luminance 0.18-0.23 against mid 0.34-0.47, a 2x
ramp. Dark wood is 0.05-0.12. So in front of anything dark the lower half of
every blade falls below the background and disappears, and the lit upper half
reads as a blade starting in mid-air. Against open ground the root still
separates, which is why it only shows near dark objects.

**Fix:** not yet applied — lifting the root end (say to ~0.28, a 1.4x ramp
instead of 2x) keeps the clump's depth while keeping the base visible. It is
an appearance change and belongs in a measured pass.

**Found by:** projecting every grass instance into the exact capture camera.
5032 tips landed in the region that looked wrong, at distances from 2 m to
352 m, every one of them correctly grounded — so that screen region is simply
where normal grass projects. The defect had to be tonal, not positional.


### 1.6 Grass that really was floating — a TSL node has no `needsUpdate`

**Symptom:** clumps of grass hanging in mid-air, cut off flat with their
painted root ends showing, at a fixed height on the card and leaning with it in
the wind. Visible in any direction, anywhere on the map, worst in first person,
and only ever on *some* tufts of *some* species. Reported by eye repeatedly
across seven attempted fixes and fifteen green checks.

**Not the cause**, each ruled out by measurement: card seating (a raycast
against the terrain as rendered — `window.__terrainProbe` — put every one of
2355 cards 3-11 cm BELOW the drawn ground, none above), `meshHeightAt` versus
the drawn mesh (0.00 cm at every percentile), card size (median 0.46 x 0.59 m,
taller than wide), the atlas art (solid blades, no gap), the atlas alpha (solid
to mip 5; mip erosion only ever trims the tips), the mip chain
(`__grassMips(false)` — identical), and the wind (`__setWind(0, 0)` — identical,
which also killed the mid-vertex-row kink theory).

**Cause:** `tints` and `speciesUV` were TSL nodes built with
`instancedBufferAttribute(...)`, and the scatter marked them dirty with
`tintAttr.needsUpdate = true`. `BufferAttributeNode` has no `needsUpdate`
property — the line set an inert field on a plain object — and
`instancedBufferAttribute` builds its buffer with `StaticDrawUsage`. Both
arrays were uploaded once at first render and never again. `grass.instanceMatrix`
is a real `BufferAttribute`, so matrices *did* update, and the ring grid
rescatters constantly as the camera moves. Every instance kept getting a new
position, size and rotation while holding the first scatter's species. A card
sized for blue grama (`fill 0.4`, so a card 2.5x the plant's height) drawing
bluestem's panel, whose blades fill 93% of it, renders that clump most of the
way up a card two and a half times too tall. The reverse pairing draws a small
clump low on a big card and looks perfect, which is why only some tufts showed
it.

**Fix:** real `THREE.InstancedBufferAttribute`s on the tuft geometry
(`aTint`, `aSpecies`, `DynamicDrawUsage`), read with `attribute()` the way
`aTangent` already was, and `needsUpdate` set on the attributes.
`scripts/check-instance-attrs.mjs` now fails the build if any TSL node is
marked dirty again.

**Found by:** planting one species alone (`__soloGrass`) and flat-colouring the
cards by species (`__speciesColour`). With only cheatgrass in the world, cards
rendered in blue grama's and bunchgrass's colours — a contradiction no numeric
agreement could hide. Every measurement before that came back clean because the
CPU side was correct the whole time; the only wrong thing was a stale copy of
one attribute in GPU memory, which nothing headless can read.

**The lesson is about the instrument, not the bug.** Seven passes measured the
scene and found it correct, and each time "the numbers are clean" was read as
"there is no bug" rather than "I am measuring the wrong thing." The user could
see it and the checks could not. When an observer you trust keeps reporting a
defect that every measurement denies, the measurement is the thing to doubt.

### 1.7 "Turning on grass shadows breaks the render" — a memory that was not true

**Symptom (recorded, never diagnosed):** the ground cover never received
shadows, because turning `grass.receiveShadow` on once made it vanish at
northernPines with bound textures 39 -> 34. The comment carried that story for
its whole life in the file.

**What was actually measured (2026-08-28):** A/B with the construction-time
`?grassshadow` flag — the runtime toggle does not rebuild the TSL program and
tests nothing — at a forest-interior vantage in the northernPines core, wind
frozen, golden hour. Two instrument notes that made the first attempts useless:
the audit POI camera sits on a road where every tuft is in full sun (roads
exclude grass), and at midday the crown shadows hide under the crowns
themselves, so there is nothing for the grass to receive. Under a canopy at
low sun:

- Nothing vanishes. Draws, triangles and tuft counts identical; 98% of pixels
  byte-identical against a same-config control that differs by ~300 bytes.
- Bound textures do not move: 41 vs 41 WebGPU, 42 vs 42 WebGL. No console
  errors on either backend. The 39 -> 34 memory did not reproduce anywhere.
- Grass inside a canopy shadow darkens ~5% mean red (89 -> 84); sunlit grass is
  pixel-identical.

**Found by:** per-pixel diff of the A/B pair plus a determinism control (same
config twice) to separate signal from noise — the eye alone could not see the
5% darkening in a full frame.

**Left as is:** receiveShadow stays off by default — it works, but it changes
every frame the audit grades, so it belongs in a measured pass, not a drive-by
flip.

### 1.8 A normal map that was sRGB-encoded — every road shaded as a 32° slope

**Symptom:** none, directly. Nobody reported it. It was found while measuring
something else (the mip-contrast question below), because that measurement
walked the whole texture set instead of only the two maps the hypothesis named.

**Cause:** `assets-src/textures/gravel/nor_gl.jpg` had been through one extra
sRGB encode before it ever reached this repo. A tangent-space normal map is
vector data: its R/G channels must average to ~127.5 (no net tilt) and
`rgb*2-1` must be roughly unit length. Gravel averaged **(183.9, 183.3, 244.2)**
with mean `|n|` **1.147** — a constant **31.9°** tangent-space tilt. The other
six sets in the same download all averaged 127.5 with `|n|` 0.88–0.99.
`pack-textures` `copyFileSync`'d the normal straight through, so the bias went
into the shipped KTX2 untouched.

Gravel is splat channel A, which is **every road in the game** plus the rail
bed. `terrainMaterial` blends `gravel.normal` into the surface normal, so each
road was lit as a uniform slope facing one world diagonal, and the real gravel
detail (sd 0.22) rode on a DC term twice its own size — which is most of why a
wheel rut "cannot catch light".

**Proved rather than assumed.** Decoding the file as sRGB lands it exactly in
the family: mean (126.2, 125.5, 231.6), `|n|` 0.939 ± 0.096, against dirt's
0.954 ± 0.076. Doing the same to rock *widens* its spread (±0.097 → ±0.233), so
the transform is specific to the one broken file, not a knob that flatters
everything.

**Fix:** `pack-textures` now detects a normal map whose R/G mean is off by more
than 12 levels, decodes it to linear if that explains the bias, and **throws if
it does not** — correcting silently is how the wrong maps shipped last time
(3.2). Good maps are still `copyFileSync`'d byte-for-byte so their bundle
hashes do not churn. `check:assets` pins the packed result; fault injection
confirms it (restoring the old file exits 1 naming the file and the tilt).

**Scale of the visual effect, measured, not claimed:** at ironValley the fix
moves 6.9% (midday) / 9.5% (golden) of pixels by >1.5 levels, mean whole-frame
0.43 / 0.78 of 255 — against a documented pinned-clock re-capture floor of
0.034. Signal, comfortably. But the two frames look nearly the same to the eye,
and the road still reads as a flat pale ribbon, because that ribbon is bright
(luma 0.703 vs 0.455 for the ground beside it) rather than un-lit. **The
correctness of the asset and the size of its appearance win are separate
questions; this shipped on the first.**

**The lesson is about measurement scope.** The hypothesis under test named two
textures. Measuring all seven cost nothing extra and was the only reason this
was found. When you build an instrument, run it across the whole set.

### 1.9 `DynamicDrawUsage` — the WebGL idiom that re-uploads every buffer, every frame

**Symptom:** on an M2 MacBook Air the game held 15-20 fps at every vegetated
vantage and a solid 60 at the three that have no ground cover (badlands,
mission, elPaso). The obvious reading — the M2's fill rate cannot take
alpha-tested double-sided grass — was wrong, and a whole commit of grass work
(view wedge, device tiers, density) had already been aimed at it.

**Cause:** three lines in `vegetation.js`:

```js
attr.setUsage(THREE.DynamicDrawUsage);   // aWind, aTint, aSpecies
```

Under WebGL that flag is a hint about buffer placement. Under WebGPU it is
load-bearing in `Attributes.update`:

```js
if ( data.version < bufferAttribute.version ||
     bufferAttribute.usage === DynamicDrawUsage ) this.backend.updateAttribute( attribute );
```

The usage flag short-circuits the version check, so every one of those buffers
was re-uploaded on **every frame**, whether or not it had changed. There are
more of them than the three lines suggest: `makeWindAttrib` builds one `aWind`
per tree LOD mesh, so 22 buffers in total.

**Measured** at northernPines, camera parked, scatter settled: 22
`queue.writeBuffer` calls, 2.6 MB and **44 ms of main-thread time per frame** —
90% of all CPU samples. Not one of the attributes had bumped its `.version`.

**Fix:** delete the three `setUsage` calls. The dirty contract is
`needsUpdate`, which `finishScatter` and `bucketTrees` already set at every
write site, and three's WebGPU backend allocates every attribute buffer with
`COPY_DST` regardless of usage, so the uploads still land.

**Result,** interleaved A/B of the two builds on the same machine, vsync
unlocked, three reps: p95 frame time 306 -> 57 ms at northernPines, 209 -> 31
at the ranch, 304 -> 29 at lakeMercy, 313 -> 93 at overlook; the share of
frames over 40 ms fell from ~33% to 3-8%. Captures are pixel-identical
(mean abs diff 0.00 at northernPines).

**Found by:** wrapping `GPUQueue.writeBuffer` in the page and timing every
call — `scripts/probe-uploads.mjs`, which exists because of this. Nothing else
could see it. The scene graph is correct, the scatter is correct, every
attribute is correct, no check can fail, and hiding the ground cover barely
moves the frame time because the cost is not in drawing it. A CPU profile
named it in one run: 90% self-time in `writeBuffer`.

**Two lessons.** The frame's largest cost was not in the frame's contents, so
ablating scene contents could never find it — when hiding a thing does not
help, stop tuning that thing. And a vsync-locked sampler hides this shape of
defect: it quantises every frame to a divisor of 60, so a 44 ms regression
reads as "30 fps median" and looks like ordinary slowness rather than a stall.
Measure with `--disable-gpu-vsync` when you want frame *cost*.

**Locked in by:** `scripts/check-instance-attrs.mjs`, which used to *require*
`DynamicDrawUsage` on these attributes and now forbids it anywhere in `src`.

### 1.10 The view wedge — a fix for the wrong problem, paid for in panning

**Symptom:** turn the camera and the ground cover redraws itself. The near
field is there, the middle distance is bare terrain, and over the next second
grass arrives across it.

**Cause:** the scatter planted only the hemisphere the camera faced, on the
argument that the frustum sees 93.8 deg of a 360 deg disc and the rest was
wasted fill. Two things were wrong with that.

The wedge saved no fill. Its half-angle was 90 deg while the screen covers
+/-47, so everything it dropped was already behind the camera and already
clipped. Rendered side by side at the same vantage — 28,612 tufts wedged
against 55,033 full — the frames differ in 0.02% of pixels, which is wind
phase. What the wedge actually halved was per-frame UPLOAD volume, because at
the time every instance attribute was re-uploaded on every frame (1.9) at
roughly 17 ms per megabyte. That is why removing it looked like a 50% win on a
desktop card, and why the win did not survive fixing the upload.

And the wedge had to track the look direction, so every 25 deg of turn started
a full rescatter spanning ~73 frames. A pan at 120 deg/s turns 144 deg inside
one rebuild. The camera outruns the scatter, and what the player sees is the
cover being drawn in.

**Fix:** plant every bearing. Turning then changes nothing, so there is nothing
to rebuild and nothing to watch; rebuilds happen only when the player moves,
and a player who stands and looks around does no scatter work at all.

**Cost, measured** (bench-grass-scatter, `high` tier, worst of four vantages):
0.97 -> 2.32 ms per 1200-candidate chunk, against a 6 ms budget. Frame rate at
the same vantage before and after: 49 and 48 fps, 2.11M and 2.34M triangles.

**Found by:** the complaint, then a screenshot taken the instant a 150 deg pan
finished — the artefact is invisible in any settled frame, which is every frame
the audit set takes.

**Locked in by:** `scripts/probe-pan.mjs` (`npm run probe:pan`), which turns a
full circle and asserts zero rescatters and never-unsettled, then walks 60 m
and asserts the disc DOES rebuild, so it cannot pass by testing nothing. It
fails on the wedge build with 3 rescatters per turn.

**The general lesson, and it is the same as 1.9's:** the wedge was a real
optimisation of a cost that should not have existed. Before optimising a
workload, check that the workload is real — and when a fix's benefit is
measured on hardware where a different bug dominates the frame, the benefit
being attributed to it may belong to the bug.

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
