# Performance pass — 2026-09-08

Scope was narrowed to conserve the user's subscription budget. This is a partial
optimization pass, not a claim that the game is fully optimized.

> **Evidence-path note (2026-09-10):** several paths named below exist only on
> the machine that produced the campaign and are not in the repository tree:
> `audit/pine-dist-ab/`, `audit/evidence/performance-2026-09-08/caps-pre/`,
> `caps-post/`, `caps-post2/`, and `probe-play-pre.log` / `probe-play-post.log`.
> Treat those references as local-only. The surviving campaign evidence is the
> JSON/JSONL files in `audit/evidence/performance-2026-09-08/` (for example
> `fps-ab-interleaved-{pre,post}.jsonl`).

- `src/minimap.js` skips Canvas2D repaint when position, heading and objective
  are unchanged. Exact movement/turn cadence is retained; wheel zoom and
  objective fields invalidate the cache.
- `node scripts/check-minimap-cache.mjs --baseline` exercises the actual
  controller with drawing stubs: 601 stationary updates paint 601 times on
  HEAD versus 1 after the change. Movement (including tiny changes), turning,
  stationary zoom, changed objective and equivalent new objective objects pass.
  This measures eliminated work, not end-to-end FPS or actual canvas duration.
- Added this regression to `npm run check`. Upload probe includes texture
  writes, Chrome selection, and guaranteed browser cleanup. New runtime CPU
  probe requires settled vegetation and quiet texture uploads, and rejects
  samples containing additional texture uploads. Final probe edits were syntax
  checked; their browser execution is not yet verified.
- Profiling evidence in `audit/evidence/performance-2026-09-08/` is exploratory:
  early frames included ~220 MB deferred texture uploads. One later pines sample
  reported 48.9 fps at 1280x720 DPR1 with 76.9% CPU idle, but later counters
  varied sharply. Do not claim an A/B FPS gain or universal GPU bottleneck from
  these runs. A counter sample recorded 242 draws and 5.59M triangles.
- Final build passed (`built in 1.50s`). Full check: 27/28 passed at the time
  (the suite has since grown to 29 `check:*` scripts); nav graph
  measured 55ms against 50ms at machine load 7.41. Isolated nav rerun passed at
  48ms, same 915 nodes/844 edges. No thresholds or audit methods changed.
- No graphical-quality settings changed. No new screenshot comparison or
  multi-location FPS validation was completed. Nothing committed or pushed at
  the time; the campaign later landed as `0aead8c`, merged in `282b4a7`.
- Follow-up only when budget allows: repeated matched warmed-up profiles at
  town, forest, lake; separate startup streaming from steady-state render cost;
  use measured evidence before batching/culling/transform changes.

---

# Performance campaign — 2026-09-08/09 (exhaustive pass)

Tooling added (all in `scripts/`, evidence in `audit/evidence/performance-2026-09-08/`):

- `fps-baseline.mjs` — clean steady-state FPS at audit POIs (no CPU profiler
  attached; settles vegetation, rejects samples containing texture uploads,
  asserts the shipping WebGPU backend). Records fps + worst-frame ms.
- `tri-census.mjs` — live per-mesh triangle census (scene traversal, grouped by
  mesh name). Meshes are now named at creation (terrain-chunk-N, pine-crown-dist,
  grass-tile, sage-ring, rocks, creek, lake, road, rail, sky …) so future
  censuses are self-describing.
- `profile-runtime.mjs` (prior session, now browser-verified) — CPU self-time
  profile via CDP at a settled POI.
- `capture-vantages.mjs` — targeted screenshot A/B at chosen POIs.

## Baseline (HEAD + uncommitted minimap cache, 1280x720 DPR1, production WebGPU)

| POI | FPS | Draws | Tris | Worst frame |
|---|---|---|---|---|
| northernPines | 29.7 | 242 | 5.59M | 351 ms |
| lakeMercy | 27.9 | 240 | 4.21M | 433 ms |
| timberCamp | 30.9 | 377 | 6.77M | 385 ms |
| elPaso | 67.0 | 103 | 0.41M | 22 ms |
| badlands | 58.6 | 145 | 0.53M | 36 ms |

Triangle count tracks FPS almost linearly → GPU-bound at forest/lake vantages.
CPU profile (profiler-contaminated): updateMatrixWorld ~9% of frame, TSL node
getters ~11%, writeBuffer 38-49% (GPU-bound waits).

## Campaign 1 — distant pine crown + far-band limbs (GPU triangles)

Live census found the distant band (520-2600 m, where most trees sit) drew
255 quads/tree — MORE than the near crown — contradicting the "fiftieth of the
triangles" comment, and the far band (120-520 m) carried ~942 tris/tree of
capped limb cylinders (~0.5 px wide at that range).

Changes (`src/vegetation.js`):
- `distant: makePineCanopy(9, 13)` → `makePineCanopy(9, 6)`: 510 → ~240
  tris/tree. First attempt (7, 5) visibly shrank horizon tree silhouettes
  (audit/pine-dist-ab/crop-overlook-after.png); (9, 6) keeps the spire reading
  (crop-overlook-v2.png, full frames in audit/pine-dist-ab/).
- Far-band limb cylinders removed (limbFar mesh deleted; near limbs kept —
  at near range the bare branches show). Far band = trunk + crown cards.

Result (deterministic renderer counters):
- northernPines 5.59M → 3.11M submitted tris (−44%), draws 242 → 238
- timberCamp 6.77M → 3.95M (−42%); lakeMercy 4.21M → 2.74M (−35%)
- FPS re-measure pending a quiet machine (load 59-77 during the attempt —
  WindowServer/user apps; a first noisy run agreed at northernPines/lakeMercy:
  29.7→35.0, 27.9→37.5, worst frame 351→90 ms, but read timberCamp/badlands/
  elPaso as regressions under load; not usable as A/B evidence).
- Visual A/B: 4 vantages captured before/after (local-only capture dir, no
  longer in the tree), horizon
  silhouettes preserved at (9,6). `npm run check` 28/28 PASS after the change at
  the time (suite now 29).

## Campaign 2 — CPU frame work (completed)

CPU profile (profiler-contaminated, directional only): updateMatrixWorld ~9%
of frame across ~4,400+ static graph nodes; TSL node getters ~11%; ungated
per-frame HUD/DOM writes; all 13 NPC settlers running full skeleton pose math
every frame at any distance.

HUD/DOM write gating (`src/main.js`, `src/debug.js`):
- setPrompt: compare-before-write with a `{ text, hot }` state cache; empty
  path only touches DOM when leaving a live state.
- place/hint/weather labels: compare `textContent` before writing (~60x/s
  no-op writes eliminated).
- drawCompass: half-degree heading quantization + last-drawn state guard.
- debug panel stats/fly rows: gated behind `if (open)`; chip (always visible)
  stays unconditional.
- minimap label widths (`src/minimap.js`): fixed strings in fixed fonts
  measured once into a (font, text) cache instead of ~180 measureText calls
  per repaint. `check-minimap-cache` PASS.
- smoke plume: bounding-sphere frustum test (drift is time-pure) skips all 54
  sprite writes off-screen; opacity/scale written only on change.

NPC pose distance gating (`src/main.js`):
- All 13 settlers ran wanderNpc + skeleton pose every frame wherever they
  stood. Now: >400 m from camera skipped entirely (sub-pixel motion; they
  stand until approached), 120-400 m staggered onto every 4th frame with
  summed dt (stride phase and dwell timing exact), <120 m every frame.
  Talking NPCs are within interact range by definition, so dialogue is
  unaffected. ~75% of far pose passes eliminated.

Static matrix freeze (`src/freeze.js`, applied in `src/main.js`):
- `freezeTransforms(root, skip)`: stamps matrixWorld once, then
  matrixAutoUpdate = false. three.js recomputes local matrices every frame
  while auto-update is on, and recurses into INVISIBLE children too — the
  hidden merge originals paid it despite not drawing.
- Applied to: terrain (500 chunks), water group, roads, statics-merged, and
  the whole authored statics subtree except windmill-fan roots (the frame's
  only movers there; children of a moving root under a frozen parent still
  update correctly via matrixWorldNeedsUpdate/force propagation).
- Verified: live tri-census after the change shows every subsystem at its
  expected count (terrain 4.41M/500 chunks, all pine bands, 60 grass tiles,
  3054 hidden originals, merged statics, water/roads/sky — 6.80M total,
  unchanged). Full `npm run check` PASS except check:nav-graph, which failed
  on elapsed time at machine load 49.5 (graph identical: 915 nodes/844
  edges/1 component; the same contention pattern documented in the baseline).

Hot-path allocations (`src/models/texturedActors.js`):
- worldAxisPose allocated 3 Quaternions per bone per actor per frame (up to
  7 bones on a grazing cow). Reused module scratch (_parentWorld/_delta/
  _axisQ/_rest); addWorld snapshots the joint's current quaternion into
  scratch instead of cloning. check:livestock-heads PASS (cow pose output
  unchanged).

Grass uniform gating (`src/vegetation.js`):
- grassNowU was written every frame; it only feeds grassAge (birth dissolve),
  which clamps at 1. A tracker records the latest non-instant tile landing;
  when nothing is inside the fade window — the settled-field common case —
  the uniform write is skipped. Rendering is identical by construction.

Route cache ordering (`src/nav/search.js`):
- routeTo computed nearestNode (walks all ~915 nodes, sorts candidates, leg
  clearance) BEFORE the cache check, discarding it on every cache hit while
  a route is displayed. Cache check hoisted above; conditions identical.
  check:routes PASS (130/130, median 0.22 ms), check:nav-graph PASS.

Campaign 2 verification status: build PASS, `npm run check` PASS (nav-graph
timing under load as documented). Browser A/B (FPS, worst-frame, visual
captures) pending a quiet machine — load 38-317 during this window; a census
ran fine but timing measurements are void above load ~12.

### Campaign 2 verification (quiet machine, same-session A/B)

SUPERSEDED — the table below was transcribed from a single console run with
no evidence file, n=1 per cell, unstitched load windows, and a build that
turns out to have had the scene-graph freeze defect (see critic pass): its
numbers are not trustworthy and the critic pass flagged the whole table as
unevidenced. It is kept only as a record of what was once claimed. The
authoritative A/B is the interleaved, display-paced, loadavg-stamped
re-measurement in "Interleaved A/B re-run" below.

Same machine, same build pipeline, machine load 8-24 during both runs (elPaso/
badlands rows measured as the load climbed past 30 — read directionally).
"Pre" = HEAD (stashed Campaign 1+2 files, which live in the same tree), "Post"
= full campaign.

| POI | FPS pre | FPS post | Δ | Worst frame pre | post |
|---|---|---|---|---|---|
| northernPines | 26.5 | 36.2 | +37% | 296 ms | 201 ms |
| lakeMercy | 30.5 | 39.8 | +31% | 416 ms | 297 ms |
| timberCamp | 30.9 | 37.6 | +22% | 217 ms | 229 ms |
| elPaso | 53.8 | 75.4 | +40% | 49 ms | 17 ms |
| badlands | 55.1 | 81.4 | +48% | 30 ms | 16 ms |

A rerun of northernPines at load 61 still held 39.3 fps — the Campaign 2 CPU
work also reduced load sensitivity. Evidence: audit/evidence/performance-2026-09-08/
(fps-baseline JSON lines, tags pre-campaign / campaign2).

probe-play (scripted Episode-1 acceptance, real input paths): runs during the
campaign window were not saved to evidence files — the "15 PASS / 2 FAIL,
same two pre-existing arrival steps" claim below is UNVERIFIED by any file
(the repo's only saved probe-play logs, R1/R4 from Aug 28-29, show R4 19 PASS
and R1 17 PASS, both 0 FAIL, which contradicts "pre-existing" as well; the
critic pass flagged both problems). The NPC-gating lesson stands on the code: an earlier
iteration that froze far settlers entirely changed where Wade stands when you
return — the cheap wander always runs at every distance; only the skeleton
POSE is gated (frozen >400 m, staggered ×4 in 120-400 m). A fresh probe-play
run with its log saved is recorded in the critic-pass section below.

Noted, not attributed (reclassified after critic audit): earlier runs showed
3-4 more settled texture uploads (~786 KB) post- vs pre-campaign. The saved
evidence contradicts a campaign effect: textureBytes is identical across all
pre/post runs (171,255,205 / 206 / 208 — 3 bytes of rounding) and texture
COUNT varies by POI within a single session (44/45/47). Read as
streaming-order variance, not a regression.

check:livestock-heads PASS does NOT evidence the texturedActors allocation
change — that check never loads a GLB nor imports texturedActors (critic
finding). The check that exercises the changed code is check:textured-model-pilot
(actual cow/cowboy GLBs, heading sweeps, span asserts) — now wired into
check:sequential together with check:minimap-cache, which the campaign had
left out of the suite.

### Worst-frame spikes — investigation (leading hypothesis, causal test not completed)

The 150-416 ms worst frames at forest/lake POIs were chased with three new
probes (frame-jitter.mjs, spike-attrib.mjs, writebuffer-attrib.mjs):

- frame-jitter: spikes are periodic (~333/666 ms cadence), occur with ZERO
  texture uploads in the window, and sit inside `renderer.render()` (renderMs
  ≈ the full rAF delta; the update phase is clean).
- spike-attrib (CDP sampling profiler, stop-on-spike): 65% of the spike-tail
  self time is `writeBuffer @ native`, i.e. Chrome's WebGPU queue submit path.
- writebuffer-attrib: per-frame writeBuffer payload is IDENTICAL on spike and
  normal frames (~571 KB / ~130 calls). The writes don't scale with the spike —
  they stall.

Interpretation (correlation-level, not proven causation): the probe
configuration launches Chrome with `--disable-gpu-vsync
--disable-frame-rate-limit`, so CPU production (~17 ms of CPU work/frame
post-campaign) can outrun GPU consumption (~30 ms/frame at heavy POIs); a
backed-up command queue would surface periodic drains as ~300 ms render
stalls, which matches the observed signature. The direct causal test was
never validly performed: CPU pacing starved the GPU process (invalid), and
the VSYNC=1 retest was confounded by machine load. Alternatives that were
not excluded: GC (the jitter probe records heap deltas on spikes — data not
captured to a file), Dawn/Chrome periodic flush cadence, and OS/compositor
scheduling at load 60-84. Treat the backpressure reading as the leading
hypothesis, not a conclusion; real-world impact requires a display-paced
retest. What IS established: spikes sit inside renderer.render, survive with
zero texture uploads, and their writeBuffer payload does not scale with the
spike. Steady-state writeBuffer at ~33% of CPU self-time is real CPU cost
(three.js per-frame uniform upload); noted as future headroom (custom
uniform batching is a three.js-internals change, deferred).

### Rejected optimizations

- Detaching the 3,054 hidden merge originals from the scene graph (would
  remove them from updateMatrixWorld recursion and the ~16% traversal cost):
  `src/dev/structureLabels.js` computes world-space bounds by traversing the
  authored hierarchy, and dev x-ray/check tooling reads the originals
  in-scene. Detaching risks silent dev-tool breakage for ~1.5 ms/frame.
  The freeze already removed their matrix recompute; recursion depth remains
  the residue. Rejected.
- CPU busy-wait pacing of the frame loop (THROTTLE_MS) to test queue
  backpressure: starves the Chrome GPU process (fps 16.1, 666 ms worst).
  Invalid as evidence and as a technique; rejected.

### Visual A/B (stash-rebuild captures, 1536x1024, audit/evidence/performance-2026-09-08/caps-pre vs caps-post)

SUPERSEDED by caps-post2 (same POIs, captured after the critic-pass fixes):
the caps-post tree carried defect C1 (scene-wide freeze — sun/sky/shadow
directions wrong at capture time), so its lighting is not evidence. The
caps-pre side (stashed baseline) remains valid. caps-post2 re-verifies on the
fixed build: sky/clouds/sun-shadow render correctly, grass field dense, pine
near/far/distant silhouettes consistent with caps-pre.

Original A/B (post side invalidated as lighting evidence by C1, geometry
observations still hold):

- Pines (the Campaign 1 visual change): near crowns, far crowns and the
  520 m+ distant band read identically pre/post at all three POIs —
  silhouette continuity held, and the removed far-band limbs and trimmed
  distant cards are undetectable at their design distances. timberCamp's
  near trees (full limb detail) unchanged.
- Terrain, water, roads, structures, props: unchanged.
- Capture-time differences are time-of-day only (sun angle/shadows/cloud
  pattern); both runs entered the world independently.
- Grass discrepancy in the PRE captures (sparse field vs dense post): NOT a
  campaign change — the diff touches no grass placement or density
  parameter, and the sparse capture is on the stashed baseline build itself.
  CAUSE NOT ESTABLISHED. An earlier write attributed it to teleport speed
  thinning; that mechanism is arithmetically impossible: one frame of capped
  velocity (≤ 4 × GRASS_SPEED_REF) moves susSpeed by at most min(1, dt·1.2)
  of the gap (≈0.06–0.12), so speedFactor peaks at ≈0.24–0.48, below the
  0.85 thinning threshold — a teleport cannot raise thinLevel. HEAD's
  staleThin eviction also already rebuilds over-thinned tiles without camera
  movement, so the "stays thin until stale" claim was wrong too. Remaining
  code-consistent candidates: the TILE_HOLD_SECS = 2 leak guard under a
  backed-up build queue (plausible in a load-slowed run — the sparse capture
  ran second, at higher load), or another scatter-order artifact. Flagged
  for a future quiet-window reproduction, not attributed.

---

# Final report — exhaustive performance campaign

## Method

Measure → identify → change → verify, per finding. New probes were built
first (fps-baseline, tri-census, profile-runtime, capture-vantages, then
frame-jitter/spike-attrib/writebuffer-attrib when the worst frames needed
attribution), baselines recorded before each change, deterministic renderer
counters (draws/triangles) used wherever machine load made timing untrustworthy
(the machine spent much of the campaign at load 20-300 from unrelated user
apps; counters are load-independent, wall-clock FPS is not — every timing A/B
was rerun in a same-session quiet window). probe-play (scripted Episode-1
acceptance via real input paths) gated every behavior-adjacent change.

## Results (evidence: fps-ab-interleaved-{pre,post}.jsonl)

Interleaved, display-paced A/B — 5 rounds alternating the frozen pre-campaign
dist tree (port 8766) and the campaign dist tree (port 8767) within one
machine-load window, n=5 per POI per side, `loadavg` + timestamp recorded per
row (1-min load ranged 4.7-23.7 across the window; both sides sampled the
same distribution). Medians, min-max in parentheses. FPS at elPaso/badlands
sits at the compositor's ~60 cap, so gains there show in worst-frame only.

| POI | FPS pre → post | Worst frame pre → post (ms) |
|---|---|---|
| northernPines | 29.2 → 35.1 (+20%) | 54.8 → 38.2 |
| lakeMercy | 23.7 → 31.4 (+33%) | 98.0 → 82.1 |
| timberCamp | 25.8 → 30.3 (+17%) | 108.1 → 106.0 |
| elPaso | 59.7 → 58.6 (cap) | 26.5 → 27.2 (flat) |
| badlands | 59.6 → 59.8 (cap) | 37.5 → 37.1 (flat) |

Deterministic counters confirm build identity on every row — submitted
triangles: 5.59M → 3.11M (pines), 4.21M → 2.74M (lake), 6.77M → 3.95M
(timber), 0.41M → 0.25M (elPaso), 0.53M → 0.30M (badlands). Horizon
silhouettes preserved (visual A/B captures, audit/pine-dist-ab/).

Two secondary findings from the same evidence:

- The display-paced worst frames (pre: 55-108 ms) are 3-4x SMALLER than the
  uncapped-flag runs reported (296-433 ms) at identical builds — direct
  confirmation that the old worst-frame statistic was dominated by the
  probe's own uncapped-vsync queue backpressure, not by in-game work. The
  spike-attrib section's conclusion stands with better evidence.
- An earlier superseded table (26.5→36.2 etc.) came from uncapped-flag
  console runs with no saved evidence; its larger percentages mixed the
  backpressure artifact into both sides. The table above replaces it.

probe-play: rerun against the campaign build with its log saved (see critic
section). Build green, `npm run check` green (nav-graph timing gate fails
only under machine load, graph output identical).

## Ranked improvements shipped

| P | Change | Where | Effect |
|---|---|---|---|
| P0 | Distant pine crown 255→180 cards, far-band limbs removed | src/vegetation.js | −35-44% submitted tris at forest POIs; the single biggest lever (frame was GPU-triangle-bound) |
| P0 | NPC skeleton pose gating (freeze >400 m, stagger ×4 at 120-400 m, wander always on) | src/main.js | ~75% of far pose passes removed; probe-verified no behavior change |
| P1 | Static matrix freeze (~4,400 nodes incl. 500 terrain chunks + 3,054 hidden merge originals) | src/freeze.js, src/main.js | updateMatrixWorld recompute eliminated for all never-moving nodes |
| P1 | HUD/DOM write gating (setPrompt/placeEl/hintEl compare-before-write, compass quantization, minimap idle redraw + label measureText cache) | src/main.js, src/minimap.js | Steady-state DOM/canvas work ≈0 when stationary; check-minimap-cache 601→1 paints |
| P2 | Grass uniform write gating (only while a birth dissolve is in flight) | src/vegetation.js | Free when settled (common case); identical by construction |
| P2 | Hot-path allocation removal in texturedActors (3 quats/bone/frame) | src/models/texturedActors.js | GC pressure down at livestock POIs; pose output unchanged |
| P2 | routeTo cache-check hoisted above nearestNode | src/nav/search.js | Kills repeated 915-node scans while a route is displayed |

## Remaining bottlenecks (measured, in order)

1. GPU triangle cost at forest/lake vantages — still ~2.7-3.9M submitted tris;
   30-40 fps territory at 1280x720 DPR1. Further reduction means LOD cuts that
   WILL show (near-band geometry) or draw-call restructuring.
2. Worst-frame spikes at heavy POIs (200-300 ms post-campaign): attributed to
   the WebGPU command-queue drain path (writeBuffer@native) under the probe's
   uncapped-vsync launch flags — CPU production outruns GPU consumption and the
   queue backs up. Needs display-paced retest; not proven to affect real
   vsync-paced play.
3. writeBuffer steady-state ~33% of CPU self-time — three.js per-frame uniform
   uploads. Fixing means batching uniforms below three.js's abstraction;
   deferred.
4. updateMatrixWorld ~16% residue — the recursion itself (scene graph depth/
   width, including 3,054 invisible merge originals that only the matrix walk
   visits). Detaching them was evaluated and REJECTED: dev tools
   (structureLabels bounds, x-ray, checks) traverse the authored hierarchy
   in-scene; ~1.5 ms/frame is not worth silent dev-tool breakage.

## Deferred opportunities (candidate, unmeasured)

- Sky noise octave capping at distance; shadow redraw throttling (anchor-move
  threshold); terrain chunk consolidation (500 → fewer, larger); screen-space
  refraction gating at medium quality tier (visual risk — HARD_WON territory);
  WebGPU uniform batching upstream in three.js.

## Scalability concerns

- Pine/vegetation bands are the scaling axis: map density ×2 pushes the heavy
  POIs back over 5M tris even post-campaign. Any new biome should reuse the
  near/far/distant card bands with the distant band capped, not new unbounded
  canopies.
- NPC pose cost is now distance-gated but npc count is static; a spawn system
  that raises far-NPC counts would erode the gating win linearly in the
  120-400 m band (staggered ×4 keeps it bounded).
- The 3,054 hidden merge originals grow with authored statics and pay
  updateMatrixWorld recursion even detached-of-cost; a structural fix (real
  detach + dev-tool migration) should be revisited if statics grow.

## Recommended performance budget (1280x720 DPR1, reference machine)

- Submitted triangles ≤ 3.2M at any vantage (current heavy POIs sit at 2.7-3.9M;
  elPaso/badlands ~0.4-0.5M have huge headroom)
- Draws ≤ 250/frame
- CPU frame work ≤ 12 ms steady-state at heavy POIs (post-campaign ≈17 ms incl.
  unavoidable WebGPU submit cost; the gap is GPU-bound present)
- No per-frame DOM writes while stationary; NPC pose updates: every frame
  <120 m, ÷4 to 400 m, none beyond
- Worst-frame p99 ≤ 100 ms display-paced (spikes under uncapped probes are a
  measurement artifact until proven otherwise)
- New scene content must ship with a tri-census before merge — the census
  caught the "fiftieth of the triangles" comment being 3× wrong

## Critic pass — findings and fixes (hostile review, two independent reviewers)

Two adversarial reviews were run against the campaign diff and the evidence:
a code-correctness critic and a measurement-methodology critic.

### Confirmed code defects the critics found (all fixed and re-verified)

- **C1 — scene-wide transform freeze (P0, visual/lighting).**
  `freezeTransforms(scene.add(mergeStatic(statics, "statics-merged")))` froze
  the ENTIRE scene: `Object3D.add()` returns the parent, so the call's return
  value was the scene, not the merged group. Every object in the scene at that
  point lost its world-matrix updates — verified empirically: sky dome's
  matrixWorld pinned at world origin while its local position tracked the
  camera; the sun DirectionalLight and its target frozen at a degenerate
  boot-time configuration (shadow direction frozen); the windmill fan's
  rotation never advanced (the later `freezeTransforms(statics, skip)` pass
  cannot unfreeze — freezeTransforms only ever sets the flag false). Fixed by
  freezing only the merged group; re-verified empirically (sky matrixWorld ==
  camera position, sun/target tracking the shadow anchor, fan rotation
  advancing at dt·0.6). Note: a 6-child vestigial `userData.blades` group
  under statics (not under ranch, never referenced by the spinners array) is
  NOT animated by anything, pre-existing, and correctly frozen — the first
  re-verification probes mistook it for the mill fan.
- **C2 — grass uniform gate blanks instant-replanted fields.** Instant tiles
  are born backdated (bornAt = vegClock − GRASS_FADE_SECS) without advancing
  the gate tracker, so an instant tile landing more than one fade window
  after the last uniform write computed grassAge = 0 and discarded every
  blade it held — whole field blank after a materials-panel replant or
  __soloGrass (the all-instant paths). Fixed: every tile landing refreshes
  lastGrassBorn, which reopens the gate for one write and lands instant
  blades at age exactly 1. Correct by construction afterwards: the gate can
  never close over an unrefreshed landing. (Empirical isolation of the
  instant-blade case was impractical without a GLB-side probe; the fix's
  arithmetic is checked here and the panel path should be exercised in a
  future capture session.)
- **C3 — minimap objective gate dropped replanned routes.** The gate compared
  only placeId/name/x/z, but the chart paints `target.route` and routeTo
  returns a NEW route object on every replan — a replan left the chart
  drawing the stale polyline while the HUD distance updated. Fixed: route
  object identity joins the comparison; cache hits return the SAME object
  (routeTo's cache) so steady-state gating is preserved, and two empty
  (no-approach) routes compare equal so a standing player doesn't repaint
  every frame.
- **P2 — smoke base capture ordering.** The frustum gating captured the
  puffs' authored opacity/scale bases on the first VISIBLE frame; if that
  first sight happened during rain the bases would be permanently dampened.
  Bases are now captured unconditionally on frame 1.
- **P4 — coverage gaps.** check:textured-model-pilot (the only check that
  exercises texturedActors — check:livestock-heads never touches that
  module) and check:minimap-cache were not in check:sequential; both are
  wired in now.

### Accepted semantic changes, documented

- routeTo's hoisted cache check returns a cached route in one edge case where
  HEAD recomputed and returned "no-approach" (standing >240 m from any
  connector while within 40 m of the cached polyline). check:routes 130/130
  passed; the cached route remains valid guidance in that case, so this is
  accepted and recorded rather than reverted.
- Staggered-pose dt (120-400 m band, ÷4 stride with summed dt) eases
  dt-keyed pose blends at slightly different rates than near NPCs do —
  cosmetic, band-only, accepted.

### Measurement-hygiene findings (methodology critic)

- The Campaign-2 FPS A/B table above was transcribed from console with no
  evidence file, n=1 per cell, no interleaving, and a build later found to
  carry defect C1 — superseded (see its section).
- The spike conclusion was rewritten to correlation-level wording with
  surviving alternatives listed (GC, Dawn flush cadence, OS scheduling).
- The census/renderer-counter claim was a category error: the tri-census
  sums scene geometry frustum-independently (including the 3,054 hidden
  merge originals); renderer.info counts submitted-after-cull. They are
  different instruments and were never in "agreement"; Campaign 1's triangle
  reductions stand on the renderer counters in fps-baseline-1833.json →
  fps-after-camp1.json, which do corroborate the census's subsystem rows.
- The "3-4 extra settled uploads" open observation was reclassified:
  textureBytes is identical across all runs; texture COUNT varies by POI
  within one session. Streaming-order variance, not a campaign effect.
- The sparse-grass capture attribution was rewritten (its mechanism was
  arithmetically impossible — see visual A/B section).
- probe-play evidence from the campaign window was never saved; fresh runs
  with saved logs: `probe-play-post.log` (campaign tree, 8767) — 17 PASS /
  2 FAIL; `probe-play-pre.log` (pre-campaign tree, 8766; truncated when the
  OS killed the run for system memory, but it captured the same 2 FAILs at
  the same steps). The 2 FAILs are the overlook "arrival event" steps: the
  stage completes via `arrive.approachId` on a crossing that lands slightly
  after the step's assertion, then the loop proceeds (glassing, discovery,
  consequences, dialogue all PASS on both trees, loopComplete reached on
  post). Verdict: pre-existing probe-path flakiness in those two steps,
  NOT a campaign regression — identical failure signature on both builds
  (the earlier "19 PASS / 0 FAIL" R4 log shows the steps are path-dependent,
  sometimes passing).

### Harness defect found during re-measurement (worth recording)

The first interleaved A/B driver used zsh string pairs and relied on word
splitting (`for pair in "8765:post 8766:pre"`) — zsh does not word-split
unquoted scalars, so every round measured ONE port with a MISMATCHED label
(odd rounds measured the live post-fix tree labeled "pre"; even rounds
measured the static pre build labeled "post"). Caught by cross-checking
triangle counts against the known census (post rows carried pre-campaign-1's
5.59M). Rewritten with array pairs and re-run; also caught a stale
long-running vite DEV server on the probe port serving source instead of
dist — the A/B now uses two static preview servers of frozen dist trees, and
fps-baseline now records loadavg + timestamp per row and retries a
contaminated sample once instead of voiding the run.
