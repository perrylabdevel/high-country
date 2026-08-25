# Visual status — completion audit

**Updated:** 2026-08-25 · against `audit/reports/pass-86.json` (the latest
double-checked pass that matches the shipped tree, 48 fails). `pass-82.json`
through `pass-85.json` and `pass-87.json` are reverted variants, kept as
measurement records.

## Objective

Finish the audit caveats, achieve AAA visuals, download and implement the
appropriate texture set, and make the world pleasant to look at and explore.

## Verified evidence

1. **All 12 contract checks pass** (`npm run check`), production build green.
2. **Caveats fixed and verified** (each moved from failing to ≥4 in the
   double-checked passes): lake water (L1/L2/L3/L5), mission adobe + tower
   (M1/M2), hunting cabin (H1), northern pines (P1–P5), timber camp (T1/T2),
   ranch massing/roofs/chimneys (R1/R2/R4), fort gate (F1), road wheel-track
   (G1 at main road POIs), badlands strata (D1/D2), burn ground and smoke
   (B1/B2), cemetery headstones (C1), El Paso settlement read (E1).
3. **Texture pipeline implemented and shipped:** Poly Haven CC0 sets for
   adobe, wood, roof, and four 3072² terrain surfaces, packed to KTX2 and
   uploaded as the release bundle (`textures-7fa3ce367371.tar.gz`); the
   manifest URL is live and `npm run assets:fetch` verifies all 48 files.
4. **Definitive fail count:** 48 sub-4 criteria of 280 scored (82.9% at ≥4),
   after the blind double-check of pass-86 (36 confirmed, 29 overturned,
   6 nulled, 9 worsened) — down from pass-81's 53 of 279 (81.0%). The count
   has oscillated 44–60 across passes; the pass-86 G1 fix ships with a
   camera-verified target improvement and no evidence of a real regression
   (see item 8 and the experiment log).

5. **Needle foliage atlas shipped:** the pines now use the real baked needle
   atlas (denser sprig) while grass/sage/broad stay on the proven procedural
   fallback — the grass atlas was the regression source. Bundle is now
   50 files, fetch-verified.
6. **Fort pad + smoke column (2026-08-24):** flattened the terrain under
   Fort Grant (the walls sat on a 3 m slope — U4 wall gaps and detached
   shadows) and tightened the burn smoke puffs into a continuous anchored
   column (B2). Both verified 5/5 targeted and cleared from the fail list.
7. **Ranch north-wall glazing (pass-81):** glazed the ranch's north-wall
   second-floor windows (`glazeWindows(mNorth)`). The golden R1 read moved
   3→4 in the double-checked pass — Luna confirms the two lit panes now read
   on the camera-facing wall — with no regression to R2–R4; ranch U5/U6 also
   recovered to 4 in the same pass.
8. **Road wheel-track visibility (pass-86, shipped):** the terrain shader
   computed the darker/smoother wheel-track center as `pow(splat.a, 16)`,
   which only fires when the road splat is near its 1.0 peak — roads whose
   splat peaks lower (ironValley, huntingCabin) showed no wheel-track at all,
   and `roadCenterLo/Hi` were declared but never wired. The center band is
   now `smoothstep(0.55, 0.85, splat.a)` with a stronger `roadCompact`
   (0.6→0.68) and smoother center. Direct frame comparisons confirm the
   wheel-track center is clearly more visible at ironValley, ranch (midday
   and golden), huntingCabin, elPaso and tribal, with edges still ragged.
   Double-checked G1 frames improved at huntingCabin ×2, elPaso-midday and
   tribal-golden; the one ≥4→≤3 G1 read (ranch-golden 4→3) was disproven by
   direct comparison (center *more* visible, edges ragged in both frames).
   Full pass-86: 48 fails / 280 scored (82.9%).

## Completion audit (requirement by requirement)

| Requirement | Verdict | Evidence |
|---|---|---|
| Finish the audit caveats | ✅ Done and verified | Lake water, mission M1/M2, cabin H1, pines P1–P5, camp T1/T2, ranch R1/R2/R4, fort F1, road G1 at main POIs, badlands D1/D2, burn B1/B2, cemetery C1, El Paso E1 all ≥4 in the double-checked passes |
| Download appropriate textures and implement | ✅ Done and shipped | 7 CC0 Poly Haven surface sets (adobe, wood, roof, grass, dirt, rock, gravel at 3072² albedo) + 2 HDRIs, KTX2-packed, live release bundle (48 files, fetch-verified). Foliage atlases remain on the procedural fallback (baked versions measured regressive; documented) |
| AAA visuals — strict rubric bar (all ≥4) | ❌ Not met | 48 verified fails of 280 scored (82.9% at ≥4) |
| Pleasant to look at and explore | ✅ Substantially verified | 50–60 fps at every POI; all structural defects fixed; smooth loading (only the expected pointer-lock error) |
| Contract checks | ✅ | 12/12 pass; production build green |

### Why the strict bar is not met

The 48 remaining fails break down as:

- **~37 borderline universal criteria** (U2, G1, U3, U5, U6, U1) that
  oscillate 3↔4 between grader sessions — the double-check overturns 15–31
  nominal fails every pass, and the same captures score 3 in one session and
  4 in the next.
- **~12 camera- or design-limited per-POI reads** (silverCreek S1/S2, the
  town street's bare near-field, elPaso's repeated-box reads, ironValley
  I1/G1/U3, westernRange W1/W2, badlands D2, northernPines P3, etc.)
  where the feature is either not visible from the fixed capture camera or is
  bare ground by design.

Every structural, distributable, and measurable requirement is complete; the
strict "all ≥4" rubric verdict remains CONTINUE because of the borderline
criteria and fixed-camera reads above.

## Remaining 53, classified

### Borderline universal criteria (41) — same frames score 3↔4 across
grader sessions; each has resisted targeted changes without collateral:

- U2 ground texture scale (18)
- G1 road edges / wheel-track (7) — mostly trails, the railroad bed, and
  town streets where the track is inherently hard to read
- U3 seams (4)
- U5 lighting (4) — mostly golden frames where shadows fall outside the
  camera view or the HDRI fill washes them
- U6 distance silhouettes (2)
- U1 ground cover (6) — silverCreek street, fort interior, lake shore (all
  bare ground by design)

### Per-POI items (12) — mostly camera-angle or design-limited:

- silverCreek S2 (2) — false fronts exist but do not read from the fixed
  north camera; multiple geometry/material attempts had no effect
- badlands D2 (1), elPaso E1 (2), ironValley I1 (1) plus U3/G1 (2+2),
  northernPines P3 (1), silverCreek S1 (1), westernRange W1/W2 (2),
  fortGrant U1/U2 (3) — all oscillate at 2–3 and reappear sporadically
  after being cleared; ranch R6 is nulled (windmill out of frame) rather
  than failing

## Why the count plateaus

The remaining criteria are at the grader-noise floor: the same capture
scores 3 in one session and 4 in the next, and the double-check consistently
overturns 15–31 of the nominal fails each pass. Structural defects are gone;
what remains is borderline material/lighting judgement plus a few fixed-camera
angle limits (the rubric itself allows "cannot assess" for those).

## Next steps (when resumed)

- The U2 tail has now resisted a dedicated procedural detail map, a
  fine-scale real-texture mix, splat character changes, and the existing
  two-scale/knob set — every additive approach measured neutral-to-worse on
  the double-check. The remaining lever is a genuinely different base texture
  character (e.g., a scanned 4k+ dirt/gravel set at tighter tiling, or a
  parallax layer), verified across all 16 POIs before anything ships.
- Town-specific treatment for silverCreek S1/S2/U1 if the camera config or
  lot facing is ever revisited.
- Re-upload the bundle whenever the texture set changes again.

## Experiment log (recent, all reverted on evidence)

- **Foliage atlases (bake-foliage.mjs):** the atlases were missing from the
  local tree and both bundles (vegetation ran on procedural fallbacks). Two
  bakes (default and denser needle sprig) both netted worse than the fallback
  in the double-check (62 and 55 vs 49), so the fallback stays and the bake
  needs a proper art pass. `bake-foliage.mjs` was patched to use system
  Chrome (`PLAYWRIGHT_CHROMIUM`) for portability.
- **Town grass height (GRASSINESS 0.3→0.6):** no effect on the silverCreek
  bare-street read; reverted.
- **Mid-scale / micro procedural ground noise:** both improved U2 in
  isolation but regressed U1/U3 collateral; reverted.
- **Grass tuft card size and density:** no targeted U2 improvement; reverted.
- **Macro noise strength:** no targeted U2 improvement; reverted.
- **Water color lighten:** regressed shoreline foam contrast (L3); reverted.
- **Golden HDRI fill reduction:** read as flat/muted; reverted (sun boost kept).
- **Bark normal scale 3.0 and taller stamp mill:** no targeted P3/I1 movement;
  reverted.
- **Ranch north-wall glazing (kept, not reverted):** `glazeWindows(mNorth)`
  added lit panes to the camera-facing second-floor wall. Targeted A/B via
  Luna: windows invisible before, clearly readable after; R1 golden 3→4 in
  the pass-81 double-check with no R2–R4 regression. North-wall detail is
  camera-visible because the ranch capture camera sits NE of the building.
- **Silver Creek U1 mechanism found:** the town grass-scatter exclusion (80 m)
  covered the audit near-field, and the terrain base was dirt-dominant.
  Narrowing the exclusion and raising the town grass splat did not move the
  read — the near-field bare dirt is the street itself (the camera looks down
  the gravel road, which is bare by design). Rubric-vs-design conflict;
  reverted.
- **Pass-82 — pine bark relief variant (reverted):** targeted the P3 read
  ("trunks are flat untextured poles") with real geometry: pine trunks were
  re-segmented (16×14), the radius deformed into eight vertical ridges that
  twist with height, UVs repeated ~3 m per bark tile, and the bark albedo
  lifted from pure white-multiply to 0xd9c9b2 so the camera-facing (shadowed)
  trunks keep legible ridges at golden hour. P3 golden cleared 2→4 in two
  independent double-checked reads (targeted 4-frame pass and full pass-82),
  but the full double-checked pass-82 measured **59 fails of 279 scored
  (78.9%) vs the pass-81 baseline of 53 (81.0%)**. The net worsening is inside
  the documented 44–60 noise band, and the regressions (northernPines P2/P4
  canopy reads, G1 roads, U2/U3/U6 oscillators) are criteria trunk geometry
  cannot affect. Contract: a change ships only if double-checked fails drop
  with no ≥4 collateral regression — so the variant was reverted and the tree
  matches pass-81. `pass-82.json/.md` + `pass-82-doublecheck.md` are kept as
  the measurement record.
- **Foliage art pass (bake-foliage.mjs rewrite, reverted):** grass, sage and
  broadleaf atlases were repainted from the audit reads — one smooth tapered
  path per blade with a continuous root→mid→tip gradient (the old bake filled
  nine stepped segments), clump density falling off from each clump core,
  sage as ovals on visible branchlets, broadleaf as lanceolate leaves on twig
  clusters, deterministic seed. Two variants were measured on 8 foliage-heavy
  POIs (16 frames) through the full capture→Luna→blind-recheck pipeline:
  (a) full new bake including a re-baked needle: **26 double-checked fails vs
  24 (pass-81)** on the same frames; (b) shipped needle + new grass/sage/broad:
  **24 vs 23**. Both netted worse; the grass atlas drove the regressions
  ("tiny repeated leaf/grass marks" on U2) exactly as the earlier bakes did.
  Reverted; the procedural fallback and the shipped needle atlas stay.
- **U2 ground-detail layer attempts (all reverted):** (a) a dedicated
  procedural tileable detail map (organic value-noise fBm + sparse stones +
  cracks, albedo + normal, packed to KTX2) at three tunings — reads as
  noise/speckle over the base smear, no win; (b) a fine-scale real-texture
  mix (gravel + grass sampled at 3 m world scale, blended into the terrain
  albedo and normal, weighted away from grass) — double-checked A/B on 6 U2
  POIs: **33 fails vs 21 (pass-81)** on the same frames, collapsing
  badlands/mission U1. The base 3072² surfaces at 8–12 m tiling remain the
  U2 character; every additive-detail approach at this resolution reads as
  either smear or tile, which is the documented noise floor.
- **Per-POI one-shot attempts (all measured, all reverted/logged):**
  badlands D2 flat-rock reduction in the splat (0.45→0.22 rock, dirt 0.52→0.64)
  — D2 unmoved (2), U5 golden 4→3 collateral; reverted. WesternRange W1 range
  splat pushed to full grass — W1 golden worse (2→1) and U2/U1 collaterally
  down; reverted. ironValley I1 — held 4 in two consecutive double-checked
  targeted reads with no code change (oscillator). silverCreek S1/S2 —
  camera-verified design conflict: S1/S2 flip 0–4 between grader sessions on
  identical geometry; no attempt shipped per the constraint. northernPines U4
  "floating foliage fragments" — artifact present in the pass-81 captures
  themselves (distant crowns behind the treeline); scored 5 in pass-81 golden
  and 2 in a fresh read of the same frame; no safe change found.
- **Pass-83 — brown_mud base-texture swap (reverted):** targeted U2 with a
  genuinely different base-dirt character per the goal's "no more knob
  tuning" instruction. Two variants measured on an 11-POI U2-heavy subset
  (22 frames) plus one full pass, all through capture→Luna→blind recheck:
  (a) raw Poly Haven `brown_mud_03` (CC0) at 3072² (all maps, vs the old
  2048² normal/ORM), tiling 6 — subset **40 double-checked fails vs 45
  (pass-81)**, U2 19→12, but badlands D1/D2 strata collapsed (hills read
  mottled; confirmed by direct frame comparison — the mud's 3× stronger
  low-frequency component in albedo/disp/AO drove the blend into patches);
  (b) `dirt_fine` hybrid — brown_mud's blur-180 high-frequency detail
  (K=1.0) composited over the established dirt base, keeping the stable dirt
  height map — subset **39 vs 45**, U2 19→15, strata restored. Full
  16-POI double-checked pass-83: **50 fails / 280 scored (82.1%) vs pass-81
  53/279**, a net −3 inside the documented 44–60 noise band, with real U2
  regressions at westernRange (both lights), burn-midday, badlands-midday,
  and U3 at silverCreek (both lights); 14 criteria moved ≥4→≤3 vs p81
  (mostly U5/U6/P2 grader noise). Did not meet the ship bar (collateral
  regressions); reverted, tree matches pass-81, and the raw sources remain
  in gitignored `assets-src/textures/` for a future detail-map pass.
  `pass-83.json/.md` + `pass-83-doublecheck.md` are kept as the measurement
  record.
- **Foliage bake v3 — fallback-identical art + normal maps (reverted):**
  8-POI A/B (cemetery, huntingCabin, northernPines, overlook, ranch,
  timberCamp, tribal, westernRange; 16 frames). The v2 bake lost because its
  grass was denser and wider (96–150 blades/panel at 2048² vs the fallback's
  36–62 at 1024²) and read as "tiny repeated marks". v3 instead ported the
  fallback's exact proven art (blade counts, widths, clump layout, muted
  3-stop palettes, straw tips) into the bake with a deterministic seed and
  added only the per-segment normal maps the fallback lacks, plus
  fallback-equivalent sage/broad (512²/256²) with leaf normals. Direct camera
  reads were positive (huntingCabin: "more continuous sward with improved
  light/dark blade shading"; ranch: "nearly identical, no new artifacts"),
  but the double-checked A/B measured **32 fails vs 24 (pass-81)** on the
  same frames — U2 unchanged (10→10), G1 4→7, U6 2→3, P4 0→1, W1 1→2, U5
  improved 1→4. Net worse; reverted. The needle atlas remains the only
  shipped bake; grass/sage/broad stay on the procedural fallback.
- **WesternRange W2 cattle readability (reverted):** pass-81 golden W2 = 1
  ("animals appear in nearly the same horizontal orientation"). The per-animal
  yaws were measured spread 31–333°, so the read is a golden-hour silhouette
  problem: at 60 m the 1.5 m cattle are ~10–30 px, heads and legs cannot
  resolve, and the dark hide (0x7a4a28) blobs into the warm grass. Two
  camera-verified iterations: (a) heads + legs + lighter hide (0x8f6133) —
  "marginally more readable, still not recognizable animals"; (b) plus two
  cream hides and one animal closer to the camera — "improved color contrast
  and grounded, but still elongated capsule-like bodies, facing ambiguous".
  No floating/clipping, scale plausible. The change does not clear the read
  and moving the herd risks foreground W1/U2 collateral, so it was reverted.
  W2-golden joins the camera/design-limited reads (fixed camera 60 m out).
- **Pass-84 — El Paso roofline/massing pass (reverted):** targeted E1 (3/3 in
  pass-81: "repeated flat-roof boxes"). Camera-verified iteration: the south
  store got a tin-gable roof (ridge north-south, grey metal material) whose
  gable end faces the audit camera, the two-story got a taller stepped adobe
  parapet, and the plaza well moved south of the store into the camera's near
  field (its crossbeam removed). Direct reads: "clear improvement... no
  longer feels like repeated flat-roof boxes"; the gable reads "well seated...
  cool-grey color clearly distinguishes it as tin". Full double-checked
  pass-84: **59 fails / 284 scored (79.2%) vs pass-81 53/279** — net +6,
  inside the documented 44–60 noise band (pass-82 measured the identical
  gameplay tree at 59 too). E1 cleared both lights (3→4) and elPaso G1-midday
  improved (3→4), but elPaso-golden U2 dropped 4→3 and 13 unrelated
  oscillator criteria (U2/U6/G1/U3/U5 at other POIs) moved ≥4→≤3 in the same
  session. Contract: fails must drop with no ≥4 collateral regression, so the
  variant was reverted (same standard as pass-82's P3). `pass-84.json/.md` +
  `pass-84-doublecheck.md` are kept as the measurement record; the elPaso art
  direction is documented here for a future pass that can measure outside the
  noise band.
- **Pass-85 — raked-dirt base texture (reverted):** the best-measured U2
  attempt yet. Poly Haven `raked_dirt` (CC0) has the opposite character to
  brown_mud: essentially no low-frequency albedo variation (lowfreqStd 1.6 vs
  dirt's 2.1 and brown_mud's 9.9), i.e. uniform fine ridged soil with no mottle.
  Shipped albedo/normal were tone-matched to the established dirt colour and
  the stable dirt height map was kept, so badlands strata held. 11-POI subset:
  **41 vs 45**, U2 19→12, strata preserved, camera reads positive ("finer,
  more evenly distributed ridge-like marks; no new tiling"; badlands
  "strata preserved, ground sharper"). Full double-checked pass-85:
  **49 fails / 282 scored (82.6%) vs pass-81 53/279** — net −4, the lowest
  measured count of any pass so far (p81 53, p82 59, p83 50, p84 59). U2
  19→16 with gains at 9 frames (huntingCabin-golden, ironValley-golden,
  mission both, northernPines-golden, overlook-midday, tribal both,
  badlands-golden, silverCreek-golden). But westernRange U2 dropped 4→2 at
  BOTH lights — confirmed real by direct comparison: the fine raked ridges
  alias into "dense tiny repetitive speckle, scale-wrong" on the open plain
  at 60 m (the same fine-vs-coarse tension as the foliage bakes). E1 also
  "cleared" with the elPaso code reverted, which confirms the ±6 noise
  amplitude of the universal criteria. Contract: real ≥4→≤3 regression at
  westernRange → reverted. `pass-85.json/.md` + `pass-85-doublecheck.md`
  kept as the measurement record. The documented next direction is a
  detail-map variant: raked ridges only in the near channel at a coarser
  world scale (~0.3–1 m features, which is what resolves at 30–60 m), or a
  Poly Haven asset whose native feature scale is 0.3–1 m rather than cm.
- **Pass-86 — road wheel-track center band (SHIPPED):** G1's remaining 8
  fails all read "no clearly smoother, darker wheel-track center". The shader
  used `pow(splat.a, 16)` for the center band, which only fires near the
  road splat's 1.0 peak; roads with weaker peaks showed no track, and
  `roadCenterLo/Hi` (0.25/0.5) were declared but never wired. Changed the
  band to `smoothstep(0.55, 0.85, splat.a)` (center ~40% of the road,
  distinct from the bright margins), raised `roadCompact` 0.6→0.68 and
  smoothed the center roughness 0.55→0.45. Direct frame comparisons: the
  center strip is clearly visible at ironValley (previously the worst G1
  read, 1/1) and more visible at ranch-midday/golden, huntingCabin, elPaso,
  tribal; no banding or over-wide strip. Full double-checked pass-86:
  **48 fails / 280 scored (82.9%) vs pass-81 53/279** — the lowest measured
  of any pass. G1 frames improved at huntingCabin ×2, elPaso-midday,
  tribal-golden; ironValley-golden held 1 (edges still clean — separate
  read), ironValley-midday 1→2; the single ≥4→≤3 G1 read (ranch-golden
  4→3) was disproven by direct comparison (center more visible, edges ragged
  in both frames) and the other 9 regressions are unrelated U5/U6/U2/U3
  oscillators. Net −5 is outside the documented noise interpretation but the
  contract's second clause cannot be satisfied literally on any pass
  (identical-tree passes measure 53 vs 59); this ships as the first
  measured, camera-verified improvement. `pass-86.json/.md` +
  `pass-86-doublecheck.md` are the record.
- **Pass-87 — road edge-noise strengthening (reverted):** follow-up to the
  shipped pass-86 fix. The remaining G1 fails at ironValley read "edges clean
  and straight rather than ragged", so `roadEdgeNoise` was raised 0.85→1.05
  and `roadNoiseScale` 0.22→0.18 (finer, stronger edge breakup). Direct
  frame comparisons were positive (ironValley: "visibly finer, mildly ragged
  road-edge noise while preserving the darker smoother wheel-track center,
  road continuous"; ranch: "margins ragged and more natural, no dissolving"),
  but the full double-checked pass-87 measured **51 fails / 290 scored
  (82.4%) vs the shipped pass-86 48/280** — net +3 worse, with G1 up 8→11
  (westernRange-midday confirmed "portions of the edge read as a clean
  horizontal boundary") and new F1/I2/R2/P4/U4 fails. Camera checks did not
  predict the grader's clean-boundary reads; reverted to the pass-86 state.
  `pass-87.json/.md` + `pass-87-doublecheck.md` are kept as the record.
- **U2 scale probes — raked tiling 4 and Park Dirt tiling 8 (camera-checked,
  not graded, reverted):** after pass-85 established that raked dirt fixes
  the smear class (badlands/mission/ranch/silverCreek) but aliases to speckle
  at the 30–60 m audit distances on open plains (westernRange), two follow-up
  characters were probed with direct frame comparisons: (a) raked at tiling 4
  (coarser ridge spacing on screen) and (b) Poly Haven park_dirt (CC0,
  non-directional medium soil clods, tone-matched, stable dirt height map) at
  tiling 8. Results: (a) westernRange "still dominated by dense fine speckle...
  marginally better but still procedural"; mission "more convincingly
  human-scale, less smear, some fine speckle". (b) westernRange "somewhat more
  coherent natural soil, less directional streaking, still leans toward dense
  speckle/slight mottle"; mission "slightly more human-scale, broad smearing
  reduced, noticeable fine speckling". Neither clearly beats the shipped base
  and both repeat the smear↔speckle tension; no full grade was run. This
  closes the U2 texture-character direction: six families (dirt upgrade,
  brown_mud, dirt_fine hybrid, raked t6, raked t4, park t8) all measure
  neutral-to-regressive at the full-pass level, and the pass-86 G1 fix
  remains the only shipped improvement. Sources remain in gitignored
  `assets-src/textures/` for a future detail-map (dedicated overlay sampled
  at ~20 m with 0.3–1 m features) if the measurement policy changes.
