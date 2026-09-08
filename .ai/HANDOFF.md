# Current Objective

Address the user's report that wheel ruts still look like slick oil/tar rather than recessed dirt.

## Latest checkpoint — 2026-09-07 (creek/lake tone blend)

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
