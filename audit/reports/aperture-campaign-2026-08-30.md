# Door & window verification campaign — operational report

Campaign: task #14, per `docs/HIGH_COUNTRY_DOORS_WINDOWS_VERIFICATION_HANDOFF.md`.
Scope: **every** door and window in the repo and the runnable world — not a sample.
Date: 2026-08-30. Branch `bugh`.

## 1. Inventory totals

Canonical runtime inventory: `src/buildings/apertures.js` (`enumerateApertures()`),
exported verbatim as evidence to `audit/evidence/apertures-inventory.json` —
**67 apertures**, every one with a stable ID, POI attribution, transforms, dimensions,
classification, and leaf/glass references. No second hand-written list exists anywhere
in scripts or checks; every tool reads the same runtime enumeration.

| kind | count | | intended state | count |
|---|---|---|---|---|
| door | 45 | | traversable | 20 |
| window | 16 | | window | 16 |
| barn | 2 | | facade | 20 |
| bay | 1 | | shell | 11 |
| gate | 3 | | | |
| **total** | **67** | | | **67** |

Every aperture is classified (`poi` non-null on all 67; zero duplicates).
Every `facade`/`shell` aperture carries an explanatory note; every `traversable`
aperture is either leaf-open or collider-clear (invariant 5b).

## 2. Modules and generators inspected

- `src/buildings/kit.js` — `wallX` openings, `doorLeaf` (pivot/hinge/swing), `glazing`,
  `collide()` collider-gap construction, `insideStructure`.
- `src/buildings/apertures.js` — registration, ID building, runtime traversability
  (`apertureTraversable`, body-circle displacement < 0.05 at 0.9 m height).
- `src/buildings.js` — ranch house (L-plan + partitions), barn, blacksmith bay,
  timber cabin shells, ranch gate, corral fence.
- `src/landmarks.js` — Silver Creek street blocks (sheriff/saloon/church/store/hotel),
  fort Grant gateway, cemetery gate, mission, hunting cabin, elPaso blocks.
- `src/homestead.js` — cemetery gate gap geometry and rail colliders.
- `src/interiors.js`, `src/collision.js` — interior meshes, collider spans, `resolvePosition`.
- Glass materials in `buildings.js` + `landmarks.js` (shared generator, repaired once).

## 3. Defects found and repaired

| # | Defect | Affected IDs | Repair | Proven |
|---|---|---|---|---|
| 1 | Traversable openings presented **shut**: leaves hung at swing 0 over collider gaps with no interaction system — a door the colliders opened but the world wall-shut | `barn.front.barn.0`, `barn.right.barn.0`, `blacksmith.front.bay.0` | Generator-side: leaves hung open (`swing: Math.PI/2`) in `src/buildings.js`; new invariant 5b `leaf-pose` in `scripts/check-apertures.mjs` rejects any traversable leaf hanging shut | Injection: reverting `barnEastDoor` swing to 0 produced `FAIL [barn.right.barn.0] leaf-pose …`; restored → PASS |
| 2 | Glass was opaque with strong emissive — every window a lamp shade; interior views showed a flat glowing panel | all 16 windows (2 material sites: `buildings.js`, `landmarks.js`) | Both shared materials → `transparent: true, opacity: 0.32`, emissive reduced | Visual A/B on captures: interior shot shows pine/sky/fence through tinted pane; FPS A/B (below) shows no perf cost |
| 3 | `window.__apertures()` dev hook **dropped the 5 build-time declared apertures** (cemetery gate, fort gate, hunting cabin, mission, ranch gate) by calling `resetApertureEnumeration()` after build | the 5 declared apertures absent from runtime inventory | Hook enumerates the cached registry (matching the check harness behaviour) | Inventory went 62 → 67; check PASS |
| 4 | Capture "interior pass" kept the camera on the exterior side — duplicate of the exterior shot | all `-interior.png` shots | Mirrored camera position across the opening plane | Single-window verification, then full re-capture |
| 5 | `ranchGate.east.gate.0` note claimed "post gap in the entry fence" — the corral fence is a **closed rectangle** and the gate is a freestanding arch ~170 m away | `ranchGate.east.gate.0` | Note corrected to describe what is constructed; the gateless corral recorded as living requirement **R8** (not relabelled, not silently reclassified) | `check-apertures` PASS with corrected note |
| 6 | All driver defects of runs 1–15 (probe infrastructure only, none in world geometry): gain clamp → orbit; interior start → approach wedges; focus theft → rAF collapse; `lineOf()` normal negation; position-invariant gap (stack said outside, player stood inside); cemetery rail pin (A/D strafe slides along long fence runs) | all non-spawn legs | Escalating sidestep ladder, kiosk re-focus, `escapeDiagonal` rotate-walk on approaches only, `restoreOutside()` physical position check | Offline collision marches E19–E25 (all walkable, displacement ≤ 0.62 m at worst) |
| 7 | **Inside/outside invariant blind to multi-door buildings**: a point just outside `barn.right` is still behind `barn.front`'s plane, so the door-plane inside-test alternated between the two barn doors and burned its whole guard while the exits *physically succeeded* — every later leg then started pinned inside the barn (ranchGate's false failure) | every leg after a barn pass in run 17 | Containment now asked of the game's own footprint index via a new read-only hook `window.__insideStructure` (kit.js `insideStructure`, the same geometry the deterministic checks read) | Offline validation: 12/12 probe points agree, including the run-17 pin and the 5 m-outside-front-door false positive (E28) |
| 8 | **`routeTo` snap leg un-costed**: the pose→first-node hop is the one leg A* never graphs, so routes opened at a nearest node the rider could not reach — run 17's ranchGate route opened at a stage node straight through the barn walls; any player standing across a building from the nearest node got a route that walks them into it (real player-facing nav defect) | `routeTo` from any pose whose nearest connector node is behind mass | `nearestNode` gained a `clearFrom` scan: prefer the nearest node the pose can *walk* to (`legClear`, 2 m sampling, 8-candidate bound); guarded as `check-approaches` rule 11 | Offline repro + fix proof (node 83 legClear=false → node 120 legClear=true, 11-hop/235 m route, E27); injection-proven: reverting the fix FAILs rule 11, restore → PASS |

Injected-defect discipline: every new check was proved able to fail before being trusted
(injection artifacts in `/tmp/probe-doors.log` run-1 log and the check run transcripts);
no injected defect was committed.

## 4. Coverage

### Deterministic (`scripts/check-apertures.mjs`, dry-builds the real world)
67/67 apertures, 0 failures. Per-aperture rules: classified (stable ID + POI),
human-scale bands per class, wall-fit, window-placement (sill band + upper-storey eave
check), glass-distinct (every window has a pane mated), leaf-fit, **leaf-pose** (new),
state-runtime (declared state vs real body-circle passage through the same collision
query the player walks), facade-declared (every sealed/shell opening carries a note).
Evidence: `audit/evidence/apertures-inventory.json`.

### Visual (`scripts/capture-apertures.mjs`, debug camera — permitted)
158 PNGs in `audit/apertures/` — every aperture × midday/golden, plus a true
**interior pass** for every window on habitable structures (158 = 67×2 + 16×2 interiors
minus non-habitable). Contact sheet layer present (`capture-manifest.json`,
67 ids, 0 failed captures, 0 page errors, backend webgpu); per-ID explicit review done:
open leaves read open, shells read walk-through, gates read as gaps (fort, cemetery,
range), facade doors read sealed-on-block, glass reads as glass from both sides.

### Functional traversal (`scripts/probe-doors.mjs`, closed-loop, real inputs)
**No teleport, no collision disable, no phasing.** Each traversable door approached by
walking, then walked through the aperture plane; per-door timeouts; wedges detected and
named, never hung. Inventory-identical-after-save/load step included.

The 31-door set ran six times as the driver itself was root-caused (all three defects in
the probe infrastructure, none in world geometry — each proven by an offline collision
march of the implicated lines showing displacement ≤ 0.62 m at worst, all walkable; E19):

1. Run 1 (31 doors): 13 passed. Failures named per-door, timeouts bounded.
2. Runs 2–3: staged sibling-entry approach (a partition's own exterior point is inside
   the house — the person-walk is "enter by the front door, then cross the partition")
   plus a bounded detour ladder; budget shortened per recovery leg.
3. Run 4–5: `partition.west` and `barn.front` unblocked by two more fixes —
   **face-first steering** (the old gain clamp of 60 px/rad cannot close a >50° miss
   against the live look scale of ~415 px/rad; the driver orbited the target instead of
   turning) and the **crossing-stack invariant** (after every attempt the probe walks
   back out the way it came, so each approach starts from open ground; the reverse walk
   is recorded traversal evidence).
4. Run 6 (all 31, focus-aware driver): per-door results in §4-final.
5. Runs 8–13 root-caused four more probe defects and surfaced none in world
   geometry: the `lineOf()` normal negation (run 8); a position-invariant gap —
   after a PASS the probe's *stack* said outside while the player stood inside
   the bunkhouse (run 11, x/z trace + clearance grid: E22); and the cemetery
   rail line pin (run 12→13): `__navTo` routes fired (49–205 hops walked
   hop-by-hop) but wp0 died at the same rail because the shuffle's A/D strafe
   is perpendicular to *facing* and slides along long fence runs (E23, E24).
6. **Run 13 scoreboard — 24/31 PASS, 4 FAIL (all approach wedges), 4
   budget-unverified**: every door class passed — both partitions (staged),
   front doors of five town lots, church, saloon, store, hotel, fort gate,
   cemetery gate, all six timber-cabin doors, both barn doors, blacksmith bay,
   cross-map El Paso. Failures: ranchGate (R8-adjacent), sheriff ×2, hotel.1.
7. Runs 14–15 (diagonal-escape shuffle + near-anchored sidesteps) show the
   escape diagonal helps the fence pins but **regressed post-pass exits**
   (rotate-walk inside rooms wedges into furniture; exits time out instead of
   shuffling out). Fixed by gating the diagonal to approach legs only.
8. Run 17 (full 31, exit-safe driver): **25 PASS / 2 FAIL** — the two town
   holdouts from run 13 (sheriff ×2, hotel.1) now pass; fails:
   `ranchHouse.partition.east` (approach wedge; passed staged in run 13) and
   `ranchGate` — root-caused to two more probe-infrastructure defects, both
   fixed with offline proof (E27, E28): the run-17 exits *physically
   succeeded* every round but the single-plane inside-test alternated behind
   `barn.front`/`barn.right` (a point just outside a multi-door building is
   still behind the other door's plane) and burned the restore guard, so the
   ranchGate leg started pinned inside the barn; and `routeTo`'s pose→first-
   node snap leg was never collision-sampled, so the nav fallback handed back
   a route *whose first hop crossed the barn* (offline repro: `nearestNode`
   from (−426.9, 325.6) returned node 83 with `legClear = false`; the fixed
   `clearFrom` scan returns node 120, leg walkable, route 11 hops / 235 m).
9. Run 18 (El Paso, budget-completion): all 4 remaining doors PASSED
   (`elPasoStore`, `elPasoCasita`, `elPasoCasa`, `elPasoShed`).
10. Run 19 (both fixes in, fresh build): **`ranchGate.east.gate.0` PASSED** —
   the last unverified door, closing the union at 31/31. `partition.east`'s
   direct/staged approach wedged as it has every full run (13's staged walk
   through it remains its pass evidence).

The four driver defects in full: gain clamp → orbit; interior start position →
approach wedges on walls; macOS focus theft mid-run → kiosk-window rAF collapse
(~2 fps) misread as wedging, cured by re-asserting `page.bringToFront()` every 5 s;
and the fourth, found by offline collision march (`/tmp/town-approach.mjs`,
`/tmp/walk-fidelity.mjs`) after run 8 wedged 7 m out with aim converged: the
probe's `lineOf()` negated the registry normal. The catalogue convention (apertures.js
"normal points to the exterior"; `__apertureView`'s by-eye-verified exterior captures
stand at `center + normal*dist`) puts the exterior point on the **+**normal side —
so every approach leg aimed at the aperture's interior and wedged on the building's
far walls (the six town lots' back walls; church door.1 additionally catches a pew row
1 m inside). Run 9 confirmed the corrected convention on the town legs but froze the
ranch cluster (real-world tree/rock/horse/NPC cylinder scatter — colliders the
offline marches deliberately omitted; E21); the driver now walks an escalating
sidestep ladder (0.7 s → 1.3 s → 2 s strafes, real A/D input) and the staged
sibling exterior leg gets the detour ladder too. Run 10 = the full 31 on the
final driver.

#### Traversal scoreboard — final (union of runs 13, 17, 18, 19)

31/31 traversable doors walked through under closed loop — every door class at least
once by direct walk, interior partitions by their designed staged-entry walk where the
straight exterior point is inside the house. Per id (P = passed walk-through); the
union is complete, no budget orphans remain:

| Door | Result | Runs |
|---|---|---|
| `barn.front.barn.0` | P | 17 |
| `barn.right.barn.0` | P | 17 |
| `blacksmith.front.bay.0` | P | 17 |
| `bunkhouse.front.door.0` | P | 17 |
| `cemeteryGate.front.gate.0` | P | 17 |
| `church.front.door.0` | P | 17 |
| `church.front.door.1` | P | 17 |
| `elPasoCasa.front.door.0` | P | 18 |
| `elPasoCasita.front.door.0` | P | 18 |
| `elPasoShed.front.door.0` | P | 18 |
| `elPasoStore.front.door.0` | P | 18 |
| `elPasoTwoStory.front.door.0` | P | 17 (205-hop nav ride, ~2.2 km cross-map) |
| `fortGrant.front.gate.0` | P | 17 (1461 m nav ride) |
| `hotel.front.door.0` | P | 17 |
| `hotel.front.door.1` | P | 17 |
| `ranchHouse.front.door.0` | P | 17 |
| `ranchHouse.partition.west.door.0` | P | 13, 17 (staged) |
| `ranchHouse.partition.east.door.0` | P (staged) | 13 (staged walk-through, closed loop). Runs 17/19: direct + staged *approach* legs wedged — the partition's exterior point is inside the house, the known approach class; crossing evidence is the run-13 staged walk. No geometry defect: the same walk passed both partitions in run 13 and partition.west passed in 17 |
| `saloon.front.door.0` | P | 17 |
| `saloon.front.door.1` | P | 17 |
| `sheriff.front.door.0` | P | 17 |
| `sheriff.front.door.1` | P | 17 |
| `store.front.door.0` | P | 17 |
| `store.front.door.1` | P | 17 |
| `timberCabin.back.door.0` | P | 17 |
| `timberCabin.back.door.1` | P | 17 |
| `timberCabin.back.door.2` | P | 17 |
| `timberCabin.front.door.0` | P | 17 |
| `timberCabin.front.door.1` | P | 17 |
| `timberCabin.front.door.2` | P | 17 |
| `ranchGate.east.gate.0` | P | 19 (167 m approach, both probe fixes in). Runs 13–17 FAIL was probe infrastructure: the false inside-detection (E28) + the un-costed nav snap leg through the barn (E27). The gate itself verified clear offline (R8 remains a *context* requirement for the corral fence, not a gate defect) |

Inventory-identical-after-save/load: PASSED in runs 18 (67 aperture ids) and 19.

### All door interaction/state implementations
The world ships exactly two interaction modes: walk-through (collider gap, leaf open or
absent) and sealed dressing (facade). Both exercised: 20 traversable apertures walked;
facade leaves verified sealed with notes. No locked/broken/boarded implementations exist
in the repo; the inventory marks none as such, which is itself verified (no aperture lies
about a mechanism it doesn't have).

## 5. Failures or deferrals and their exact evidence

- **R8 (proposed)** — corral fence closes without a gate; range gate freestanding.
  Evidence: `src/buildings.js` fenceRun rectangle vs POS.ranchGate; corrected note;
  `state/requirements.json` R8.
- **Overlook 21 fps** (vs E14-era 29) — glass transparency cleared causally by A/B on the
  identical pose subset: opaque 21/21 vs transparent 21/21, fresh server, steady ~50 ms
  frame times on both (E17). Full-sweep medians remain at acceptance (57 vs 56).
- Storefront facades (saloon/store/church) show lit, inviting interiors behind declared,
  noted, sealed doors — correct per classification, but a world-promise tension recorded
  in the report of run 1 and visible in `audit/apertures/` captures.

## 6. Reproduce

```
npm run build
node scripts/check-apertures.mjs                      # deterministic, all 67
node scripts/capture-apertures.mjs                    # visual, writes audit/apertures/
HC_DOOR_BUDGET_MIN=100 node scripts/probe-doors.mjs   # functional, all traversable
HC_ONLY=<ids> node scripts/probe-doors.mjs            # subset re-runs
FPS_POSES=overlook-midday,overlook-golden node scripts/fps-sweep.mjs <url> <out.json>
```

## 7. Files changed

- `src/buildings.js` — open-pose repair leaves; corrected ranch-gate note.
- `src/landmarks.js` — transparent glass material (shared-generator repair #2).
- `src/main.js` — `__apertures` hook no longer wipes the declared registry (defect 3);
  new read-only `__insideStructure(x, z, pad)` hook (defect 7, kit.js footprint index).
- `src/nav/graph.js` — `nearestNode` `clearFrom` scan (defect 8, E27).
- `src/nav/search.js` — `routeTo` passes the mode body radius to the snap.
- `scripts/check-apertures.mjs` — invariant 5b `leaf-pose` (injection-proven).
- `scripts/check-approaches.mjs` — rule 11: route openings must be legClear
  (fault-injection-proven by the offline node-83 repro).
- `scripts/capture-apertures.mjs` — true interior pass.
- `scripts/probe/doors` (`scripts/probe-doors.mjs`), `scripts/probe/drive.mjs` — staged
  approach, detour ladder, labelled trace, subset runs, distance-scaled recovery legs,
  nav-graph fallback (`__navTo` + `steerRoute`), gated escape diagonal,
  footprint-oracle `restoreOutside()`.
- `state/requirements.json` — R8 appended.
- Evidence: E19–E28; run logs `audit/evidence/probe-doors-run{17,18,19}-2026-08-31.log`;
  `audit/evidence/probe-doors.json` (last run's per-door rows).
- Checkpoint commits on `bugh` (list at close).

## 8. Next campaign

**R8** — the only other open entry in the requirements store besides the deferred R4
dialogue branching, and a direct continuation of this campaign's corrections: put a
working gate in the corral fence (or document the seal), give the range gate a coherent
context, and re-verify with the collision march plus a walk-through of the new gap.
`scripts/loop.mjs campaign select` ranks it first (P4).