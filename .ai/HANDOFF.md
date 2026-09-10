# HoH Generation 1 stack installed — 2026-09-10

Installed `hc-agent` at `~/.hc-agent` (Generation 1 only). Official HoH-lite is
not released; this is a local planner→developer→tester loop. Main High Country
checkout is not the campaign worktree. Existing `scripts/loop.mjs` / `state/`
were not replaced. Scion is not deployed.

Headroom coding profile is a campaign-scoped proxy (isolated workspace,
ChatGPT `openai_base_url` intercept, live `/stats`). Experiment A (Headroom
off) recorded ~5.6M input tokens then died on ChatGPT Plus usage limit during
iteration-3 planner. Do not start Experiment B until that window resets.

Start: `hc-agent doctor` then `hc-agent run --yes --dry-run --campaign visual-quality`

---

# Nell's sleeves FIXED by sleeve-only bind — 2026-09-10

The 2026-09-09 conclusion below ("garment stays unskinned, sleeves stay stiff")
is SUPERSEDED. `bindSettlerGarments()` in `src/models/texturedActors.js`
converts the two static `medieval_poor_woman.glb` meshes to SkinnedMeshes at
load, in the template prepared once per URL.

WHY IT WORKS WHERE THE TWO REJECTED ROUTES DID NOT. Both earlier routes copied
the body's own weights to EVERY garment vertex, which drags the loose blouse
chest panel onto the nude body. This one is scoped: a garment vertex borrows the
weights of the NEAREST body vertex, but keeps only that vertex's arm-bone share;
the non-arm remainder is reattached to a single bind-static root. So sleeve
fabric follows the arm exactly as far as the body under it does (including the
blouse's own arm/torso blend at the shoulder, which is why the seam blends
rather than tears), while the blouse torso and skirt stay put and cannot
collapse. The small static bonnet mesh rides the head bone.

BIND-SPACE GOTCHA (cost a wrong first attempt): the body's bindMatrix is
identity, not its node world matrix, because its geometry is authored in
armature-local space. A loose mesh can instead live under an empty that places
it elsewhere (the bonnet translates to the head), so neither the body's bind
matrix nor the mesh's own world matrix is universally right. The correct bind is
`body.bindMatrix · body.matrixWorld⁻¹ · mesh.matrixWorld`, which reduces to the
body's identity for the garment and to the head placement for the bonnet.

EVIDENCE (measured, not eyeballed):
- `scripts/check-textured-model-pilot.mjs` now asserts the BUILT actor (all five
  meshes skinned, nonzero weights) and the behaviour: after the gait arm-drop
  the sleeve moves > 0.1 m while the blouse/skirt stays < 0.02 m. Reports
  sleeves 0.238 m, body 0.000 m.
- Live WebGPU: Nell footGap -0.0004..-0.015 m (grounded), armDeg 8.6.
- A/B frames, same vantage before (unbound) and after:
  `audit/nell-sleeves-before/` and `audit/nell-sleeves-after/` (front/side/back).
  Before is the reported bug exactly (sleeves frozen horizontal, arms hanging);
  after the sleeves follow the arms to the cuffs, with only a small exposed
  shoulder patch where the moving sleeve meets the static blouse.

A/B hook `globalThis.__NELL_UNBIND` used to shoot the "before" frames was
removed after capture. Verification: `npm run build` green; the nine directly
relevant checks pass via `npx tsx scripts/<check>.mjs` (the `npm run check`
runner still fails 29/29 on Windows with the pre-existing extensionless-tsx
ENOENT, identical on clean main).

---

# Garment skinning: BOTH weighting routes rejected — 2026-09-09

CONCLUSION: medieval_poor_woman.glb ships with the garment UNSKINNED and stays
that way. Sleeves stay stiff. That is the better of the two available states.

Blender IS installed and drives headless, so this was tested properly, not
guessed:
    /Applications/Blender.app/Contents/MacOS/Blender --background \
        --python scripts/blender-skin-garments.py -- <in.glb> <out.glb>

WHAT WAS TRIED
  1. Proximity weight transfer in texturedActors.js (removed earlier).
  2. Blender automatic/bone-heat weights, headless, via the script above.
Both produce the SAME failure: the sleeves correctly follow the arms, and the
loose blouse collapses onto the body, leaving the chest bare. So this is not an
artifact of my transfer code — it is what any distance-based weighting does to a
loose garment layered over a nude body. A real fix needs hand-painted weights or
a different model.

EXPORT TRAPS FOUND ALONG THE WAY (the script now handles all three)
  - A glTF skinned mesh IGNORES its node transform. The garments hang off empties
    carrying the source file's 0.01 scale; exporting as-is drops that scale and
    they arrive 100x oversized (exported POSITION -55.6..139.2 vs the body's
    -0.72..1.56). Fix: bake each garment's full WORLD transform into its mesh
    data and leave the object at identity. Baking into the BODY'S LOCAL space
    instead fails identically — that space is the 0.01-scaled one.
  - Do not import into an empty scene: the glTF importer reads bpy.context.object
    and dies with "'Context' object has no attribute 'object'".
  - Skip the "glTF_not_exported" collection (the importer's Icosphere widget),
    and delete the startup Cube/Camera/Light or they land in the export.

THIRD BAD METRIC IN THIS AREA — read this before measuring garments again.
My chest-coverage test measured the mean distance from body chest vertices to the
nearest garment vertex and PASSED (0.0225 -> 0.0133 m) on a build whose chest was
visibly bare. Collapse REDUCES that distance. Proximity is not coverage. A valid
test must ask whether garment geometry remains OUTSIDE the body surface along its
normal, not merely near it. Earlier siblings of this mistake: "garment half-span
0.618 -> 0.295" could not tell "sleeves follow arms" from "garment collapses",
and the NPC footGap probe measured against deckHeightAt, the function under test.
When a visual claim rests on one number, assume the number is measuring the wrong
thing until a capture agrees with it.

ALSO: public/models/medieval_poor_woman.glb had reverted to its PRE-conversion
state at some point (materials map=false, flat untextured render). Re-running
scripts/convert-specgloss.mjs restored it. If she ever renders flat tan, that is
the cause.

TWO THINGS NEEDING THE USER
  - scripts/check-textured-model-pilot.mjs carries an assertion block (not mine)
    requiring all five of the woman's meshes to be skinned. It now FAILS by
    design, since we deliberately ship the unskinned garment. Either relax it to
    match this decision or drop it — it currently blocks check:sequential.
  - public/models/blender-5.2.1-macos-arm64.dmg is 330 MB. Chrome's download
    directory is public/models, and vite copies public/ verbatim into dist, so
    every build ships it. Delete it.

---

# Blender garment auto-weight attempt — 2026-09-09

Used computer use in the existing Blender scene. Both garments already had
armature modifiers and nonzero weights; the on-disk GLB also had an accidental
Cube mesh (six meshes). Exported only the five character meshes. First WebGPU
front/back captures show severe garment stretching, despite all vertices weighted.
Re-ran ARMATURE_AUTO for CLOTHES and Helmet: both FINISHED. Export FINISHED but
Blender warned both garment meshes were not valid and may export wrongly. Latest WebGPU captures audit/npc-auto-weights-{front,back}-nell-calder.png
show horizontal sleeves and an absent head/body, so automatic weighting did NOT
resolve the visual bug. This is NOT a visually accepted fix. Latest export is in public/models; credits hash
and byte count refreshed. Pre-session file (also already skinned, with Cube) is
/tmp/medieval_poor_woman-before-skinning.glb.

Added five-mesh/skin/nonzero-weight checks to existing textured-model-pilot test;
negative-tested the pre-session six-mesh export (fails correctly). First full
suite PASS 29; after fresh auto-weight export build passed, 28/29 checks passed;
nav-graph repeatedly measured just over 50 ms at load 13+ on 8 cores. No navigation
code changed. Structural skinning success does not establish correct deformation.
During UI retry, focus changed and text became viewport shortcuts; unintended
scene deletion was undone and original scene restored before actual auto-weight
commands ran successfully. Existing unrelated working changes preserved.

# Sleeve fix REVERTED + the "pose bug" was a measurement artifact — 2026-09-09

TWO CORRECTIONS TO THE ENTRY BELOW. Both were my own bad measurements.

1. bindLooseMeshes (proximity weight transfer) is REMOVED. It fixed the frozen
   sleeves but dragged the blouse's chest panel off the body and left the figure
   exposed — the garment is a separate outer layer over a nude body, and giving
   it the body's own weights collapses it onto/through that body. My acceptance
   metric ("garment half-span 0.618 -> 0.295 m") could not tell "sleeves follow
   the arms" from "garment collapses inward", which is why it read as a success.
   A/B evidence: audit/npc-shirt-front-nell-calder.png (transferred, undressed)
   vs audit/npc-noskin-front-nell-calder.png (static, clothed, stiff sleeves).
   Clothed-with-stiff-sleeves wins. The reasoning is recorded as a DO-NOT-RETRY
   note at the top of texturedActors.js. A real fix needs the garment skinned in
   a DCC tool, or a model whose clothes are already bound.

2. THERE IS NO SYSTEMIC POSE BUG. The earlier claim ("posed NPCs sit at 87-90
   deg, a full T-pose") came from a probe whose CAMERA sat at the ranch spawn
   while the NPCs it measured were in town ~700 m away. The update loop culls on
   distance to the CAMERA (NPC_NEAR_M 120, NPC_FAR_M beyond it, main.js ~2508),
   so those NPCs were never ticked and were read in their untouched bind pose —
   which for a Mixamo rig IS a T-pose. Re-measured with the camera parked 3 m
   from each NPC:
     unposed          Harlan 6.0  Nell 8.6  Wade 6.0
     posed, holding   Dutch 35.2  Ruth 65.5  Amos 75.4   (non-zero handle Eulers)
     posed, walking   Floyd 13.5  Doc 11.5  Ida 14.0  Hattie 17.6  Cole 15.6
   Poses apply as authored; walking NPCs decay to a natural hang. The visible
   "T-pose" the user reported was the unskinned garment (1), not the poses.
   Willie 71.6 with zero Eulers is the one unexplained reading — childboy, whose
   model is off-period anyway.

RULE FOR ANY FUTURE NPC MEASUREMENT: park the camera within NPC_NEAR_M of the
subject before reading a pose, or you are measuring the bind pose. Both
`window.__npcs()` (now also reports armDeg, hasPose, poseEuler) and
scripts/tmp-probe-npcs.mjs read whatever the last tick left behind.

---

# Grounding fixed at every location + garment skinning — 2026-09-09

USER REPORT: "the character is sunk in the front porch of the high ranch",
then "her sleeves" (Nell's sleeves stuck out in a T while her arms hung down).

MEASUREMENT TRAP THAT HID THIS: the earlier NPC probe reported footGap against
deckHeightAt — the same function that was wrong — so every NPC read as grounded
within 15 mm while actually standing inside the boards. A grounding claim
measured against the collision model is circular. `window.__surfaceAt(x, z,
{top})` (?dev) now raycasts the RENDERED scene for ground truth. Two gotchas it
cost to learn: cast from about chest height, not from the sky, or the first hit
is the porch roof; and Object3D.visible is LOCAL, so the hidden procedural
figure under every textured NPC still tests visible and the ray lands on an
invisible body a metre up (walk the ancestry instead).

THREE GROUNDING BUGS, all silent:
1. Town boardwalk — landmarks.js registered the deck at `placementY` (the lot
   floor) while the planks render 0.05 higher. Every townsperson stood 5 cm
   inside the boardwalk. NOTE the first fix was WRONG in an instructive way: it
   moved the GEOMETRY down to meet the registration, which check:buildings
   caught immediately (the deck must stay flush with the storefront door sills
   0.05 above the lot floor). The geometry was right; the registration was
   wrong. Now registers `bw.position.y + walk.userData.surfaceOffset`.
2. Ranch porch — `porch()` in buildings/kit.js lays a deck slab but nothing ever
   registered it, so grounding fell through to terrain and Harlan stood 0.096 m
   under the boards. Added `registerPorchDecks(root)` in buildings.js: walks a
   placed structure, finds every part tagged role "porch", and registers a deck
   from the footprint the part publishes. Generic — any porch added later is
   grounded for free.
3. Hunting-cabin porch (homestead.js) — a raw boxAt slab, also unregistered. A
   first fix recomputed its height as `heightAt(centre) + thickness` and floated
   it 0.135 m, because boxOnGround seats on the LOWEST terrain under the
   footprint (kit.js lowestSeat), not the centre sample. Now takes
   `groundSeat.y + PORCH_T` — the height it was actually seated at.

RULE THE THREE SHARE: a part publishes its own walking surface; callers never
restate it. kit.js porch() tags { width, depth, deckTop, deckCenterZ } and
boardwalk() tags surfaceOffset (= height + slab/2). The boardwalk bug existed
because a comment said "height + 0.2" against a slab that had since grown to
0.5 thick.

NEW CHECK — scripts/check-deck-grounding.mjs (npm run check:deck-grounding,
wired into check:sequential after check:grounding). Dry-builds the world offline
and asserts every walkable surface is registered within 2 cm of where its
geometry renders. 17 surfaces today. IMPORTANT: the first version of this check
was CIRCULAR — it stamped the value passed to addDeckPlatform and compared it to
what deckHeightAt answered, the same number on both sides, and passed with the
boardwalk bug deliberately reintroduced. It now derives the surface from each
part's own geometry. Negative-tested against both original bugs; both fail it.

GARMENT SKINNING — medieval_poor_woman.glb ships 5 meshes but only 3 are
skinned. `CLOTHES_MUJER_..._FRONT` (11,370 verts: blouse, sleeves, skirt) and
the headscarf are STATIC, so they stayed frozen in the T-pose bind while the
arm bones rotated down inside them — the arms were always correct (measured 8.6
deg off vertical), it was the sleeves that never moved. `bindLooseMeshes()` in
texturedActors.js binds unskinned meshes to the rig by proximity weight transfer
(each loose vertex borrows the nearest skinned body vertex's weights, via a hash
grid), rebuilds them as SkinnedMeshes in the donor's bind space, and runs from
prepare() for kind "settlerwoman". Garment half-span drops 0.618 -> 0.295 m.
Reach for it on any Sketchfab model whose clothes do not follow the body.

LIVE STATE: all 13 NPCs sink exactly 0.000. Arm angles off vertical: unposed
actors correct (Calders 6-8.6, Willie 14.4, gunnar trio 47.2 from its
hand-on-holster idle); POSED town NPCs still wrong at 87-90 (full T-pose) —
Ruth/Ida/Hattie/Amos/Floyd/Doc. That is the unfixed pose-transfer bug below.

STILL BROKEN: authored `pose(p, t)` functions write absolute Eulers meant for
the procedural figure's plain-group joints; makeJointHandle re-applies them as
world-axis rotations composed onto a T-pose bind, which is not equivalent, and
drives posed NPCs to a full T-pose. Affects every posed NPC on a rigged model.
Unfixed: clipping into buildings (still no repro).

---

# NPC models wired — 2026-09-09 (period cast in; poses still wrong)

Follows the grounding fix below. User downloaded two Sketchfab CC-BY models
into public/models (Chrome saves there, NOT ~/Downloads — a probe that watches
~/Downloads will wrongly report "no download").

WIRED:
- medieval_poor_woman.glb (carmenpaloma, CC-BY) -> kind `settlerwoman`,
  Ruth/Ida/Hattie/Nell, targetHeight 1.66. Mixamo skeleton, NO clips, so it
  rides the procedural cowboy gait.
- gunnar_the_gunslinger_rigged_motions.glb (tegnemaskin, CC-BY) -> kind
  `gunnar`, Dutch/Sheriff/Cole, targetHeight 1.80. Character Creator skeleton
  (CC_Base_*), ships 4 clips; uses 03-handonholster idle + 02-walk-normal.
  Verified in-game: hat, neckerchief, waistcoat, boots, holstered revolver.
- lucille/lillian stay unwired. Willie still on the modern beanie/leggings kid.

BONE RESOLVER: `coreBoneName` now also collapses underscores (after dropping
the trailing _NN, order matters). That lets ONE table serve skeletons differing
only in punctuation — cowboy `mixamorigLeftArm_08` and settler woman
`mixamorig_LeftArm_011` both core to `mixamorigLeftArm`. CORES_DEF and the new
CORES_CC are written in the collapsed form.

NEW SCRIPT — scripts/convert-specgloss.mjs: the settler woman's 5 materials were
all KHR_materials_pbrSpecularGlossiness with NO metallic-roughness fallback.
three.js dropped that extension loader, so she rendered as a pure white ghost
despite the GLB carrying 6 textures. The script rewrites the GLB's JSON chunk in
place (diffuse -> baseColor, metallic 0, roughness = 1 - glossiness) and drops
the extension. Run it on ANY Sketchfab model that loads white. credits.json
records the conversion; sha256 refreshed after.

STANCE GROUNDING, settled for good: Gunnar is clip-driven and measures min y
-0.0067 m idle / -0.0083 m walking over a FULL vertex scan. Clips barely move
the feet, so the removed groundOnStance was never needed even for clip models.
Live: all 13 NPCs footGap between -0.015 and -0.005 m.

STILL BROKEN — authored poses do not transfer to rigged actors. Measured on
Hattie: gait alone hangs her arm 8.6 deg off vertical (correct); adding her
authored washday pose swings it to 54.5 deg, and in-game she reads as a near
T-pose. The `pose(p, t)` functions in main.js write absolute Eulers meant for
the procedural figure's plain-group joints; makeJointHandle re-applies them as
world-axis rotations composed onto a T-pose bind, which is not equivalent.
Every posed NPC on a rigged model is affected. Options not yet taken: retune
per-character poses against the rigs, scale pose magnitude for rigged actors,
or skip authored poses when a clip-driven idle already exists.

STILL NOT DONE: clipping into buildings (no repro yet — at rest every NPC
clears 0.45 m and none is inside a structure).

CLEAN UP: public/models/gunnar-the-gunslinger-rigged-motions.zip is 75 MB and
was the original-format download. Everything in public/ is copied verbatim into
dist/ by vite, so leaving it there ships 75 MB of dead weight in every build.
Delete it (the 23 MB converted .glb is what is wired).

Probes: scripts/tmp-probe-npcs.mjs (grounding/clearance table),
scripts/tmp-probe-npc-shot.mjs (full-body shot framed on an NPC's LIVE position,
picking a vantage that is not inside a building).

---

# NPC pass — 2026-09-09 (grounding root-caused and fixed; models blocked on assets)

Reported symptoms: women vanish / "eyes only", men float above the deck, NPCs
clip into buildings, poses/gait wrong.

ROOT CAUSE (one bug, not four): `groundOnStance()` in src/models/texturedActors.js
(added 7398bec) sampled only ~300 of a mesh's vertices to find the lowest sole,
then shifted the actor down by `originY - minY`. The sample almost never hit the
true lowest vertex, so EVERY actor was shifted DOWN by the sampling error — the
cowboy by boot height (legs cut flat at the deck plane, blue backface showing,
which read as "floating"), the Blender DEF-rig women by a whole body. It existed
only for lucille/lillian. REMOVED. Every wired model rests at bind, which
`-bounds.min.y * scale` already grounds exactly.

Note: 7e4bf1c is titled "Refactor NPC grounding..." but contains NO src/ changes,
only audit manifests. The refactor it claims was never committed.

Evidence:
- Offline, full vertex scan: cowboy minY 0.0000 / maxY 1.7800, child 0.0000 / 1.3800.
- Live (rebuilt dist, ?dev): all 13 NPCs footGap between -0.007 and +0.001 m.
- New check in scripts/check-textured-model-pilot.mjs scans EVERY vertex of the
  built rig in its settled stance and asserts |minY| < 0.012. Negative-tested: a
  3 cm sink fails it, and every pre-existing assertion missed that 3 cm.

MEASUREMENT TRAP (cost a bad claim this session): port 8765 is `vite preview`
serving a FROZEN dist/, not live source. Captures taken against it after a source
edit show the OLD build. Run `npm run build` before any capture, and confirm the
served bundle carries your change (`curl -s http://127.0.0.1:8765/ | grep index-`
then grep the bundle) before trusting a frame.

New tools: `window.__npcs()` (?dev) reports every settler's model, whether the
textured visual installed, stand height, rendered world bounds, and footGap
(negative = sunk, positive = floating). scripts/tmp-probe-npcs.mjs prints the table.

MODELS — decision made, blocked on a download the user must do:
- lucille/lillian render as silver-haired anime characters in modern sci-fi coats.
  Unwired from Ruth/Ida/Hattie/Nell (they fall back to procedural figures). The
  GLBs remain in public/models, unreferenced by NPC_MODELS.
- The user wants them SKINNED, not procedural. Procedural is a stopgap only.
- Vetted candidate: Sketchfab "Medieval poor woman" (uid 24db154842a84717bfecea3ace0f7cfa),
  CC-BY, rigged, 51,940 tris, realistic style matching the Mixamo cowboy, long dark
  skirt + apron + work blouse + headscarf. Barefoot (minor). A 55-candidate CC-BY
  rigged sweep of the Sketchfab API turned up nothing better; everything else was
  cartoon, pin-up, or wrong century.
- Sketchfab's download endpoint is 401 without a login, so the user downloads it.
- The wired child (child_boy_character_animated_blender.glb) is a modern kid in a
  beanie and leggings — also off-period, less jarring. Flagged, not changed.

NOT DONE:
- Clipping into buildings: at rest NO NPC is inside a structure and all clear
  0.45 m of collider (measured). So it is a wander-time and/or silhouette-vs-collider
  issue (0.45 m cylinder is narrower than shoulders+hat). Needs a wander-time repro.
- Poses/gait: not investigated this pass.

Pre-existing, unrelated: check:nav-graph fails its 50 ms build budget (53 ms on a
clean tree too) and aborts check:sequential; the checks after it pass when run
directly.

---

# Performance campaign — 2026-09-08/09 (exhaustive pass, complete)

Ledger with all evidence paths: `docs/PERFORMANCE_PASS.md` (read it before
touching any perf-sensitive code — it also records REJECTED optimizations and
the critic pass). Evidence: `audit/evidence/performance-2026-09-08/`.

Scope: CPU frame work, GPU triangles, HUD/DOM, NPC pose, nav, startup, plus a
hostile critic pass that found and fixed 3 code defects (one of them a P0
scene-wide freeze the campaign itself had introduced) and dismantled several
unevidenced ledger claims.

Headline (interleaved display-paced A/B, frozen dist trees, n=5/POI/side,
evidence `fps-ab-interleaved-{pre,post}.jsonl`):

- northernPines 29.2→35.1 fps (+20%), worst frame 54.8→38.2 ms
- lakeMercy 23.7→31.4 (+33%), worst 98.0→82.1 ms
- timberCamp 25.8→30.3 (+17%), worst 108.1→106.0 ms
- elPaso/badlands at the ~60 compositor cap both sides (fps flat by
  construction); submitted tris 0.41M→0.25M / 0.53M→0.30M
- Heavy-POI submitted triangles −35-44% (5.59M→3.11M / 4.21M→2.74M /
  6.77M→3.95M), horizon silhouettes preserved (audit/pine-dist-ab/)

Critic-pass fixes (all verified empirically): C1 `freezeTransforms(scene.add(x))`
had frozen the ENTIRE scene graph (sky/sun/windmill-fans dead) — now freezes
only the merged group; C2 instant grass tiles could land invisible (uniform
gate) — every landing now refreshes `lastGrassBorn`; C3 minimap missed
replanned routes — route identity joins the change gate; P2 smoke bases now
captured on frame 1 (rain could permanently dampen them); 2 more checks wired
into check:sequential. Known flakiness recorded: probe-play's two overlook
"arrival event" steps fail identically on pre AND post trees (probe-path
timing, arrival completes on a later crossing) — pre-existing, not campaign.

Known measurement traps (do not re-trip): Object3D.add() returns the PARENT;
tri-census (frustum-independent) and renderer.info (post-cull) are different
instruments; uncapped-vsync probe flags inject fake worst-frame stalls
(display-paced is now the default; VSYNC=0 env restores); zsh does not
word-split unquoted scalars; port 8765 was a long-lived DEV server — A/B
needs static preview servers of frozen dist trees.

Not done (deferred, ledger has details): writeBuffer uniform batching
(upstream three.js), terrain chunk consolidation, shadow redraw throttling,
sky-octave capping, 3,054 hidden merge originals structural fix; sparse-grass
capture cause not established (TILE_HOLD_SECS candidate).

Nothing committed or pushed.

---

# Current Objective

Address the user's report that wheel ruts still look like slick oil/tar rather than recessed dirt.

## Latest checkpoint — 2026-09-08 (creek/lake junction: workable, must-improve logged)

- User pulled latest (PR #3 join-blend merged; it kept refractBase 0.15 and
  promoted the tape fix to a per-vertex aWarp eased to the lake's 1 at the
  mouth — the merged code is a superset of the 2026-09-07 work) and sent a
  close nadir of the mouth: bright glittering sand-bottomed creek vs flat
  opaque lake, still two substances.
- Reproduced at the real rim crossing (channel x=0 crosses the shoreline at
  z≈-470; land west, 12.8 basin east — probed, not assumed; the creek's last
  authored station (80,-700) is already inside the lake, centre (80,-800)
  r220). Added a `close` vantage to scripts/capture-creek-tone.mjs (also
  wired the vantage-name CLI arg: `node scripts/capture-creek-tone.mjs TAG close`).
- Measured defect 1 — the mouth trench: `heightfield.js` carved
  creekFactor·3.4 with no floor, so each mouth arrived at the shoreline as a
  2.5-3 m walled gorge (bed 10.2 at (0,-460), banks 13-14, vs a 12.8 basin) —
  a dark slot meeting a bright shallow. Fix: clamp the carve to
  `h - (WATER - 0.2)` — a creek cannot cut below the water table, so mouths
  silt to the basin floor. (First attempt scaled the carve by (1 - lake):
  overcorrected — the mouth-reach bed rose ABOVE the water table and the
  creek dried into a wet stripe before the lake; reverted to the clamp.)
- Measured defect 2 — the fade started too late. Tester direction: "begin
  the fade sooner and maybe stronger". aJoin band widened: starts 18 m
  OUTSIDE the rim, runs 45 m (was 6/30) — the ribbon arrives ~35% faded
  instead of ~10%.
- After (close vantage): overcast creek cast +9.5 → −2.5 vs lake +5 (gap
  15 → 7.5), brightness gap 11 → 0.5; clear-sun cast gap 18 → 10, brightness
  gap 11 → 0.5; drowned reach matches the lake (unchanged from PR #3).
  Evidence: audit/creek-tone-close-{close,clear}.png,
  audit/creek-tone-close-{mouth,nadir,grazing}.png.
- User verdict: "ok, that's workable for now. add this to the docs as a must
  improve" → docs/VISUAL_STATUS.md MUST IMPROVE section (creek beds still
  dirt-splat dark vs bright sand; sparkle asymmetry under sun; fade could go
  sooner/stronger still).
- Verification: build green (3.57 s). check:nav-graph over its 50 ms timing
  gate under machine load 20-50 (controlled A/B polluted by load spikes:
  84 ms pre-change vs 479 ms post-change, both far over the 46-47 ms idle
  baseline; graph output deterministic-identical 915/844). Isolated re-run
  pending a quiet machine; the change adds two clamps to the carve — no nav
  structure touched. Other 26 checks green in the suite run.
- Nothing committed or pushed.

## Previous checkpoint — 2026-09-07 (creek/lake tone blend)

- User report: the creek ribbons read as a different substance from the lake
  (flat pale-cyan ribbon vs the lake's water tone at Lake Mercy).
- Measured (GPU-rendered captures, overcast pinned, 1536x1024):
  creek rgb(63,91,92) cyan-cast +28.5 with G≈B (hue 180 teal) vs lake
  rgb(85,106,118) cast +24.5 with B>G (blue) — same cast, wrong hue family.
  Cause confirmed by arithmetic: at CREEK_DEPTH 0.45 m the depth ramp is
  ~2% down, so the creek's refractBase 0.55 floor WAS the body-colour share
  — 56% waterShallow teal painted over the ribbon (lake paints ~17% at the
  same depth). The material comment's fear (lower floor → grazing-angle
  milk) was measured and did not materialize: at grazing angles fresnel
  (waterFresnel 0.85) dominates and the surface is unchanged (Δ ≤ 3/255).
- Fix round 1: `refractBase: 0.55 → 0.25` on creekMat. User rejected: hue
  matched but at direct overview the ribbon still read as smooth tape.
- Fix round 2 (final): `refractBase: 0.15` (the lake's own floor — at the
  same depth the two bodies paint the same share) plus a new per-body
  `refractWarp` option in `waterMaterial.ts` (multiplier on the depth-scaled
  screen-sample offset; default 1). A creek is 0.45 m against the lake's
  1-3 m, so at the shared waterRefraction uniform the creek's bed showed
  through UNDISTORTED — the tape look. Creeks pass 4, so their bed smears
  and moves under the same ripple normals. toxicMat left at 0.55/warp 1
  deliberately: the toxic creek's palette is its identity (mine runoff).
- After (mouth vantage): creek rgb(66,76,74) cast +9.0/+8.0 vs before
  rgb(63,91,92) cast +28.5/+29.0; lake rgb(85,106,118) +27.0 and bank
  (−27.5) byte-stable.
- After (nadir, the user's rejected vantage): ribbon-over-land
  rgb(40,57,56) cast 16.5 / rgb(49,54,48) cast 2.0 vs lake cast 8-16
  nearby; luminance stddev ribbon 1.75 vs lake 1.71 in matched regions
  (texture amplitude now equal); drowned continuation across the lake
  rgb(41,58,56) vs adjacent lake rgb(43,60,58) — band no longer separable.
  Grazing unchanged (fresnel dominates; no milk regression from the warp).
  Evidence: `audit/creek-tone-{before,after}-{mouth,nadir,grazing}.png`
  (before has no nadir — the vantage was added after the baseline run),
  measured with `scripts/measure-creek-tone.mjs` + inline stddev boxes.
- Tooling: `scripts/capture-creek-tone.mjs` (headed Chromium on darwin —
  headless has no Metal adapter and falls back to SwiftShader; a peer
  session's fix, adopted). Its diag readback (`__captureView` before the
  shutter) exists because an earlier edit of the vantage loop silently
  dropped the view assignment and captures came back as the spawn
  overview with weather still pinned — "never set", not "cleared".
- Also: `__captureMode(true)` now hides the dev stats/info overlays
  (main.js — they are body children, not #hud children).
- Verification: `npm run build` green (4.09 s). `npm run check` 25/26 —
  check:nav-graph over its 50 ms budget at machine load 27.78; in
  isolation it passes at 47 ms (915 nodes / 844 edges). Same conclusion
  as the earlier controlled A/B: machine state, not a regression; the
  water material options touch no nav path. Nothing committed or pushed.

## Previous checkpoint — 2026-09-07 (tester HUD)

- Built the tester quick-toggle HUD into the backtick debug panel
  (`src/debug.js`): sectioned rows for Weather (6 states + Auto release,
  active button tracks the live `weather.state()`), Overlays (Nav,
  Ground lines, Grass pins, X-ray cycle), Terrain view (final/weights/
  road/normal/slope), Pin clock 12:00, Grass (Hide grass, Species colour
  cycle, Solo species select, Wind off), Movement (Mount). Toggle actions
  are registered from `main.js` as plain closures via `debug.setTester()`
  — boot-scope ones (weather, grass) work without ?dev; ?dev-only
  diagnostics register inside the dev blocks and render disabled without
  it. No `window.__` indirection in the UI.
- Fixes made along the way: hide-grass now persists across tile replants
  (`vegetation.js` — `hidden` flag read by the plant path; the flag lives
  outside the window guard; no-arg `__hideGrass()` is now a read-only
  query); `window.__weatherOff` is now actually assigned (Wind off
  freezes the weather sim + zeroes wind uniforms); `window.__weatherPinned`
  added for probes; a pre-player `mounted()` getter crashed boot and is
  guarded.
- New probe `scripts/probe-tester-panel.mjs` (single in-page evaluate;
  headless falls back to WebGL2 software rendering, where per-call
  round-trips are seconds slow — do NOT leave browsers open on throw, the
  finally-close is load-bearing). Verified: sections present, no disabled
  buttons under ?dev, Storm forces+pins, Auto releases the pin, Hide grass
  zeroes the scatter count and restores it. PROBE PASSED.
- Serial verification: `npm run build` green; `npm run check` 26/26 PASS
  (21.6 s idle). One earlier nav-graph timing failure was machine load
  from an orphaned probe browser, not a regression.
- Nothing committed or pushed. The road-rut checkpoint below stands.

## Previous checkpoint — 2026-09-07

- Completed the road terrain refinement and query optimization. Coarse road
  cells use a 25x25 fine triangle mesh with shared `meshHeightAt`/`heightAt`
  values, world-space segment bounds, conservative segment-vs-expanded-cell
  refinement coverage, and bounded fine-cell corner caches.
- `npm run check:road-geometry` passes: 18 samples, minimum paired trough
  depth 0.060822 m, maximum query-to-mesh error 0.00000198 m. The crossing-cell
  fixture also passes.
- `npm run check:nav-graph` passes with 915 nodes, 844 edges, deterministic
  rebuild, and 46–47 ms graph build time against the unchanged 50 ms budget.
- Serial `npm run build && npm run check` passed. Build completed in 1.48 s;
  all checks passed, including grass budget, routes, weather, and nav graph.
  The existing Vite large-chunk warning remains.
- No commits or pushes were made. Other uncommitted weather, livestock,
  navigation, and audit work remains in place.

- Final road state: 25x25 fine road cells; `townMain` uses a 0.28 m physical
  rut profile for visual separation, while stage and trail retain 0.11 m.
  Shared-attribute 200 m render chunks preserve geometry while culling
  off-screen terrain. Geometry check is 0.078133 m minimum trough depth with
  0.00000198 m query-to-mesh error. Town chunked captures in
  `audit/ruts-town-chunked-deeper/` pass Luna review for paired ruts in both
  lights with no seams or tar sheen. The latest hot-path optimization hoists
  fine-cell cache lookup/allocation and lazy segment lookup per mesh query.

## Latest checkpoint — 2026-09-06

- User explicitly chose "Continue here", overriding Astra routing for this task only. No model delegation or routing-policy changes.
- Reproduced on production WebGPU at the ranch stage road and Silver Creek. Prior tone fix was incomplete: ruts did not affect normals, while roughness was multiplied by 0.55 and then 0.6. Source gravel mean 0.869 became about 0.287 at full rut strength.
- Local uncommitted patch: separate `rutReliefMeters: 0.12` surface-gradient normal profile with shallow dirt lips, `roadRoughnessMin: 0.82`, and `rutDepth` darkening reduced from 0.85 to 0.35. Existing texture assets, road layout, blend heights, and collision geometry unchanged. Depth and darkening are separate dev controls.
- This is normal-based relief only. There is no parallax, self-occlusion, or geometric recess; actual wheel-depth geometry still needs terrain tessellation and grounding work. The current grid is 12.5 m.
- Extended `check:roads`: actual material graph must connect the rut height derivatives to normals and dry floor to roughness; scalar TSL tests cover roughness bounds and height signs. Original normal wiring failed; reintroduced 0.6 polish failed at roughness 0.492; restored code passes the targeted check.
- Diagnostic script `scripts/capture-ruts.mjs`; matched captures in `audit/ruts-before/` and `audit/ruts-after/` (12 each), standard ranch eye captures in `audit/ruts-before-eye/`, relief-only ablation in `audit/ruts-no-relief/` (4). The first cabinTrail vantage was at its ranch junction; the final script targets a genuinely narrow stretch, captured separately in `audit/ruts-trail-after/` (4). After captures report production WebGPU, settled vegetation, and zero errors. Inspected ranch/town/narrow-trail detail frames and the relief-disabled control; user acceptance remains open, especially if actual geometric depth is required.
- Final serial verification passed: `npm run build` printed `built in 1.37s`; `npm run check` exited 0 with all 23 scripts successful (21 standalone PASS lines, plus missions/save PASSED). Grass-scatter timing initially failed at 7.13 ms > 6 ms during concurrent browser captures; it passed at 1.96 ms isolated and 1.97 ms in the final full suite. No checks were changed or weakened to bypass that timing gate. Only the pre-existing Vite large-chunk warning remains.
- No full audit grade or comparative score claimed. The terrain-normal change requires a new baseline for the next full audit. HARD_WON 1.12 and VISUAL_STATUS record the limited scope.
- Pre-existing `.ai/STATE.json` modification and untracked navigation evidence were left untouched. Nothing committed or pushed. Existing preview on port 8765 served a different build; this task started a separate preview on 8766.

# Previous State

Harness initialized. No active campaign.

Harness installed. Existing High Country measurement skills preserved.

Git status:
```
## main...origin/main
 M .gitignore
 M src/buildings.js
 M src/dev/panel.ts
 M src/landmarks.js
 M src/main.js
 M src/map.js
 M src/materials/settings.ts
 M src/materials/splatMap.ts
 M src/materials/terrainMaterial.ts
?? .ai/
?? .claude/skills/checkpoint/
?? .claude/skills/expert/
?? .claude/skills/route/
?? .claude/skills/scout/
?? .claude/skills/senior/
?? .claude/skills/worker/
?? .cursor/
?? AGENTS.md
?? CLAUDE.md
?? audit/evidence/nav-routes-2026-09-06T00-51-51.json
?? audit/evidence/nav-routes-2026-09-06T00-55-02.json
?? audit/evidence/nav-routes-2026-09-06T01-01-07.json
?? audit/evidence/nav-routes-2026-09-06T02-00-38.json
?? audit/evidence/nav-routes-2026-09-06T02-01-37.json
?? audit/evidence/nav-routes-2026-09-06T02-06-05.json
```

Recent commits:
```
b8cc7a5 Refactor creek rendering and lake interaction in landmarks.js
58dd2dd A hitching rail stood across the gateway approach with one post in the middle of the corridor, and the gate itself was two bare sticks under a floating slat with the "doors" flat against the wall reading as patches
6e61672 Creeks were straight hoses clipped by terrain triangles, and the lake rim was a smooth ellipse the ground kept sawtoothing through
cf895f4 The water read as painted navy: a non-wrapping noise lattice seamed a grid into every surface, foam striped every shore and filled the creeks solid, and the colour mix never let the bottom or the sky through
7aaa626 Road traffic rode the polylines blind: the figure kit's mounted seat hung the boots backward, and the box-horse's legs stopped 28 cm above the ground
```

Campaign finish-uncommitted CLOSED. Two threads were in flight uncommitted with no campaign attached.

THREAD 1 - wheel-track ruts (map.js nearestOnPolyline, splatMap B-channel lateral packing, terrainMaterial decode). Decode was correct and complete; the tone was left at a debug value. rutDepth 3.5 drove groove albedo attenuation to 2.73 (clip point 1.28), so every road rendered as black tar and Silver Creek's main street read as a blue-black canal from above. Compounding cause: roadCompact 0.68 - the OLD fake single-band wheel-track - still at full strength, swallowing the real ruts so they looked invisible at sane depths. Shipped rutDepth 0.85 / roadCompact 0.15. Measured rut floor 77 vs 164 shoulder (0.47x) with a bright crown at 120. RUT_TONE exported from settings.ts; check:roads now asserts rutDepth*max(RUT_TONE) < 0.85 and roadCompact < 0.35. Both assertions verified by reintroducing the bad values. HARD_WON 1.11 written.

THREAD 2 - hitching rails: ranch plank to posts+bar, town rails moved from mid-boardwalk to deck edge with correct bar yaw, north row rails plus two NPCs (Hattie Reed, Cole Mercer). Verified by capture at the ranch and both town streets.

Verification: npm run build built in 4.34s; npm run check 21 PASS (unchanged from pre-change baseline). Visual evidence captured at eye level and straight-down over the ranch road and the town street.

Committed on branch finish/wheel-ruts-and-hitching-rails (3 commits, not merged or pushed).

OPEN: audit/evidence/nav-routes-*.json - check:routes writes a new timestamped evidence file on every invocation; 15 untracked copies have accumulated today. Either gitignore the pattern or have the check overwrite one file.

Git status:
```
## finish/wheel-ruts-and-hitching-rails
?? audit/evidence/nav-routes-2026-09-06T00-51-51.json
?? audit/evidence/nav-routes-2026-09-06T00-55-02.json
?? audit/evidence/nav-routes-2026-09-06T01-01-07.json
?? audit/evidence/nav-routes-2026-09-06T02-00-38.json
?? audit/evidence/nav-routes-2026-09-06T02-01-37.json
?? audit/evidence/nav-routes-2026-09-06T02-06-05.json
?? audit/evidence/nav-routes-2026-09-06T03-50-25.json
?? audit/evidence/nav-routes-2026-09-06T03-51-00.json
?? audit/evidence/nav-routes-2026-09-06T14-14-06.json
?? audit/evidence/nav-routes-2026-09-06T14-15-33.json
?? audit/evidence/nav-routes-2026-09-06T14-16-58.json
?? audit/evidence/nav-routes-2026-09-06T14-47-59.json
?? audit/evidence/nav-routes-2026-09-06T14-49-32.json
?? audit/evidence/nav-routes-2026-09-06T14-59-15.json
?? audit/evidence/nav-routes-2026-09-06T15-01-41.json
```

Recent commits:
```
d5cbd70 Install the airoute multi-model harness alongside the existing measurement skills
13eb591 Hitching rails were a solid plank at the ranch and lone shin-high posts stranded in the middle of the town boardwalk, and the north row had rails but nobody on it
1c1d404 Every road was a tar streak and the town's main street a blue-black canal: the wheel ruts shipped at 2.7x the depth that clips their albedo to zero
b8cc7a5 Refactor creek rendering and lake interaction in landmarks.js
58dd2dd A hitching rail stood across the gateway approach with one post in the middle of the corridor, and the gate itself was two bare sticks under a floating slat with the "doors" flat against the wall reading as patches
```

# Architecture

Canonical AI state lives in `.ai/`. Claude Code is the interactive orchestrator. OpenAI models are reached through `airoute` / Codex CLI.

# Relevant Files

- `.ai/REQUIREMENTS.md`
- `.ai/ROUTING.md`
- `.ai/STATE.json`
- `.claude/skills/` (existing measurement skills plus new router skills)
- `docs/HARD_WON.md`
- `docs/VISUAL_STATUS.md`

# Completed Work

- Project initialized with the shared AI harness.

# Known Failures

(none recorded)

# Important Decisions

- Premium models, especially Astra, are reserved for exceptional decisions.

# Verification Status

unknown

# Current Hypotheses

(none recorded)

# Next Actions

## Creek/lake tone seam at Lake Mercy — 2026-09-08

Tester report: creek and lake meet as two different colours with no blend.

Measured first. The body-colour theory was DISPROVED: at the join the two
bodies compute rgb(79,140,138) (creek) vs rgb(80,141,139) (lake) — one unit
apart, so the shared shallow/deep ramp and the earlier refractBase work are
fine. The seam had two other causes:

1. The aJoin crossfade band was 5 m wide and started 3 m INSIDE the rim.
   Creek stations sit ~1.5 m apart, so only 3-5 stations of a ~1300-station
   ribbon were ever in the fade (highCountry 17 mid-fade verts of 6680;
   toxic/granite/twin had zero — those three end 800 m+ from the lake, so
   that part is correct, not a bug). Band now starts 6 m OUTSIDE the rim and
   runs 30 m: mid-fade verts 17 -> 101 (highCountry), 15 -> 93 (silver).
   The -10 sample cull had to go to -40, or the ribbon was truncated while
   still ~48% opaque (aJoin 0.483 at its last station) — a half-opaque stub.
2. refractWarp was a per-material constant: creek 4, lake 1. The offset is
   depth-scaled and both are shallow at the mouth, so the creek smeared its
   screen sample 5.6x harder than the lake it met (11.5 px vs 2.1 px at
   1536 wide) — same colour, different texture. Now a per-vertex aWarp
   attribute easing 4 -> 1 across the existing mouthBlend.

Result (silver mouth axis transect, WebGPU, overcast): max luma step
5.62 -> 3.43 (-39%), total variation 41.0 -> 25.4 (-38%), and the worst step
moved OFF the junction (t=0.63 -> t=0.94) — the join is no longer the
sharpest transition on the creek. Bank reference unchanged (cast -28 -> -27).
Captures: audit/creek-tone-{before,after}-{mouth,nadir,grazing}.png.

capture-creek-tone.mjs was silently shooting WebGL — where this water's
screen refraction is disabled entirely, so its numbers described a shader
that never ships. It now launches channel:"chrome" (Playwright's bundled
Chromium finds an adapter but requestDevice() dies on a missing dxil.dll,
and three falls back to WebGL) and ASSERTS backend === "webgpu" before the
shutter.

Known-unfixed, pre-existing, not from this change:
- `npm run check` fails 27/27 on Windows with `spawn .../node_modules/.bin/tsx
  ENOENT` (runner spawns the extensionless shim). Verified identical on clean
  main. Via `npx tsx` directly: 25 pass. check-nav-graph fails only its 50 ms
  build-time budget (107 ms on clean main too); graph identical with the
  change (915 nodes / 844 edges / 1 component / 0 impassable drops).
- The z-fighting risk flagged during this change was a BAD MEASUREMENT, now
  retracted. It compared creek vertex Y against the WATER constant — a model
  of the lake plane, not the drawn lake (the exact trap measure-first warns
  about). Those 0.0007 m readings were upstream stations 660-1570 m from the
  lake, where no lake geometry exists to fight with. Raycasting every creek
  vertex down onto the real lake mesh: 271 verts genuinely have lake beneath
  them, 0 are closer than 0.010 m, worst separation 0.01499 m — i.e. exactly
  the intended 0.015 m. No fix needed; do not "correct" this margin.


## Road material follow-up — 2026-09-06

- Luna implementation updated `terrainMaterial.ts` and `settings.ts`: A-normalized
  lateral decode on roads, terrain normal green-channel correction for the rotated
  plane UV basis, rut width 0.24 m, and fragment relief 0.20 m. The packed decode
  still has a residual rock/A term because B contains `rock + latNorm*road`; it is
  normalized for the road signal but is not exact where residual rock remains.
- Added `check:roads` coverage for normalized narrow-road decode and the green
  channel orientation node. `npm run check:roads` passes; full serial `npm run check`
  passes all checks, including the isolated grass budget.
- Fresh production WebGPU captures: `audit/ruts-luna-final/` (stage),
  `audit/ruts-luna-town/` (townMain), and `audit/ruts-luna-trail/` (cabinTrail).
  Luna review transcript: `audit/ruts-luna-vision-town-trail.txt`. Town ruts remain
  subtly recessed; narrow trail reads more convincingly. Neither shows tar sheen or
  a broad painted stripe. Relief is a fragment normal profile, not geometric
  tessellation/displacement.

- In this repo: `claude`
- Delegate with `airoute run auto "<task>"` or `/scout` `/worker` `/senior` `/expert`
- Continue the in-progress navigation/visual work without using Astra unless an architecture decision is actually blocked
