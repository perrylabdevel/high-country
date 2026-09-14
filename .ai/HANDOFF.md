# Current checkpoint

`STATE.json` is the canonical resume record and is the only checkpoint loaded at startup. This file is optional, deliberately compact, and should contain only details that do not fit STATE but are needed for the active task.

## Active work

- 2026-09-14 trees: inventory — 4 procedural pine prototypes (6419 placed:
  2032/2131/1453/803), 2 broadleaf (388/712), burnt snag (34). Per tree:
  trunk 80 tris, near limbs 860-1620, crowns near 258-486 / far 258-312 /
  dist 234; broadleaf crowns 192/80/48. Authored `burnt_snag` (trees.glb,
  pr_trees) swaps in via src/treeModels.js + vegetation.applyTreeModels —
  shipped on. Authored `pine_std` (pr_pine, public/models/trees/, geometry-only,
  Cycles AO in COLOR_0, game needle material) replaces PINE[1] at equal
  triangles and equal frame time, but read darker/thinner at mid range in the
  northernPines A/B, so `enabled: false`; A/B with `__treeModels(true|false)`
  and scripts/.tmp-tree-ab.mjs.

- 2026-09-14 remaining-props pass (uncommitted): three new Blender kits via MCP —
  `yard.glb` (pr_yard), `landmark.glb` (pr_landmark), `furniture.glb`
  (pr_furniture) — replace the last primitive props (ranch windmill + live
  wheel mount, lookout, dock, gate, ruins, tipis, cemetery, interiors).
  Placement faults fixed on the way: ranch gate now spans the stage road,
  lookout off logA/logB, overlook rail off cabinTrail, dock moved from open
  water to the south shore under its arrival, Burn ruin off silverNorth,
  interior colliders were mirrored (+yaw) — now from the lot transform, guarded
  in check:western-props. Terrain shows through the ranch-house and hunting-
  cabin floors (pre-existing; not addressed).

- The 3.6 m domain warp only bent the repeating source tiles into a wavy
  checkerboard. It has been replaced locally by hash-offset triangular
  sampling in `terrainMaterial.ts`: three independently phased samples are
  variance-blended and clamped for every terrain albedo, normal, and ORM map.
  Splat weights and road geometry remain in true world space.
- The shader uses a signed float hash, not TSL's float-to-uint hash, because
  negative world/lattice coordinates would otherwise collapse to the same
  uint seed in WebGPU. `check:roads` verifies the stochastic setting and its
  PBR graph wiring; it passes, as does `npm run build`.
- Render verification remains required. A Playwright Chromium download
  completed, but this execution sandbox rejects Chromium's ProcessSingleton
  socket with `Operation not permitted`, so no current WebGPU frame or GPU
  timing result was produced here. Capture and inspect a matched before/after
  Western Range frame on a browser-capable host before claiming this visual
  fix is verified. The stochastic path uses four fetches per original terrain
  map sample (three phase samples plus the mip-level mean), so measure it on
  the target GPU.
- The tribal-lands bridge issue was pre-existing, not caused by terrain warp:
  same-page warp 0/3.6 captures left its transform unchanged. `tribalCreek`
  was 9.12 m off the first foothillsTribal/Silver Creek intersection and
  19.04 degrees off its trail; it now uses the exact crossing and tangent.
  `check:roads` reports 0 m/0 degrees, after the old definition was observed
  failing the new invariant. Corrected WebGPU plan frame:
  `audit/bridge-warp-ab/tribalCreek-warp-3.6.png`.
- `npm run build` passes. `npm run check` passed 28/29; only the known
  timing-sensitive nav-graph budget failed under sustained host contention
  (52 ms vs 50 ms at load 50.60 on 8 cores); the isolated retry was 175 ms at
  load 29.74. Do not change navigation for these unrelated fixes; rerun on an
  idle host.
- `package-lock.json` and `.claude/worktrees/creek-capture-headed` predate this
  work and were not modified by the terrain fix.

## Retrieval rule

Search the archive for a named subsystem, symptom, file, or decision. Never load the complete historical HANDOFF or campaign event logs into a model context.

## 2026-09-12 — authored cast (Blender MCP)
- All 13 characters (sheriff + 12 NPCs in `public/models/chars/`, plus `public/models/player.glb`) are first-party GLBs from `scripts/blender-sheriff/` (`chars.py` specs → `sh_character.run_batch`). Build cache: `/tmp/hc_chars/<id>/<id>.blend` (volatile; rebuild ≈9 min/character).
- Runtime fix: `makeJointHandle.restore()` in `src/models/texturedActors.js` — PropertyMixer skips unchanged bone writes, so NPC poses composed onto themselves where a clip held a joint still.
- `check:textured-model-pilot` asserts every authored model: grounded soles through idle+walk, crown height, pose drift, stride, hanging arms.
- Removed the unwired Sketchfab character GLBs (cowboy, gunnar, lucille, lillian, child boy, settler woman) and their credits; only farm-cow.glb remains third-party.
- Known pre-existing: Dutch Malloy's wander spot inside the forge sits ~0.6 m below the rendered floor (floor not registered as a deck).

## 2026-09-13 — road-edge wedges (storm pose)
- Judge against `audit/terrain-macro-detail/supplied-view.json` only (storm, tier=medium, all biomes off, 1435x823@2).
- Another agent's material rewrite (stochastic sampler removal, incommensurate tilings, macro/coverage/roughFade/albedoDetailFade, shallower geometry ruts) was reverted to HEAD; its ablations showed none of it touched the wedges, and its tiling ablation set NaN tilings.
- Fix is geometric (HARD_WON 2.12): `refinedBaseHeight`/`roadCarveAt` in `heightfield.js`.
- Still open: square texture grid across grass at that pose (survived every material ablation; suspect KTX2 mips generated without wrap in `pack-textures.mjs` — unverified).
- The other agent's `scripts/.tmp-*.mjs` and `audit/terrain-macro-detail/` remain untracked.

## Western filler props (2026-09-13)

- First slice shipped locally (uncommitted): 9 authored props in `public/models/props/western.glb`, built by `scripts/blender-props/` (`import pr_build; pr_build.start()` in Blender via MCP; ~25 min bake, status in `/tmp/hc_props/status.txt`).
- `src/props.js`: `planWesternProps()` (called in main.js after createVegetation, before the nav graph) places Silver Creek furniture + roadside filler and registers colliders; `installWesternProps()` instances per 240 m cell, 420 m draw distance. Silver Creek hitch rails and the box wagon (which stood inside the blacksmith footprint) were removed from landmarks.js.
- Ranch slice: `ranch.glb` (11 props, `pr_ranch.py`). buildings.js no longer draws the corral, rail, wagon, hay, woodpile or trough; it records `propSpots.js` spots and keeps its colliders (landmarks.js rails use the same registry). props.js dresses the ranch yard (RANCH_YARD) and Barrett Ranch (planHomestead, best of 16 layout bearings). The ranch woodpile moved from z -4 to -7.5: it stood on the stage road shoulder. Yard pieces keep off each approach's leg to its road (a Barrett corral once cut the trailhead off the graph).
- Trail slice: `trail.glb` (8 props, `pr_trail.py`; new shader kinds glass, char, sign_board with procedural lettering). `planTrail()` in props.js: a telegraph line Fort Grant -> stage road -> ranch -> Silver Creek (`TELEGRAPH_WIRES`, drawn as merged tube meshes per cell), mileposts every 800 m on the wagon roads, signposts at open junctions and where roads leave settlements, cairns on high-country trails, graves, campfires, trunks (one by each roadside wreck). Road/ranch-house convergence is logged in docs/BACKLOG.md "World layout follow-ups".
- Mining slice (user chose "move works to the mines"): `mine.glb` (14 props). `src/industry.js` rewritten as the ore chain: Silver Strike Mines works at MINE_SITE (headframe, hoist house + stack + hoist rope cable, ore bin, tramway to a rail loading dock, waste dump, powder magazine); stamp mill structure moved from Iron Valley (landmarks.js) to MILL_SITE west of the rail with receiving bin, tram, stack, tailings; company office moved off the rail corner, freight platform on the S leg. Iron Valley = miners' camp (props.js MINING_CAMP); rail ends dressed (planRailEnds: buffer stop at the north terminus, stacks + track-gang tent at the 72% construction front). `stampMill.door` approach moved. Audit: new `mines` POI in capture/grade, rubric I1/I2 moved to mines, ironValley graded on I3; ungraded, see VISUAL_STATUS. Livestock `settleHead` fix (HARD_WON 2.10 addendum).
- Fort slice (user chose "move fort off the road" + "rebuild with kit"): POS.fortGrant (0.1,0.38) -> (0.07625,0.353), 64 m south of the stage road; `fortSpur` trail to the gate; heightfield fort pad 94 -> 94.8. fort.js rewritten: kit barracks/storehouse/commissary (open doors, window openings, gable roofs, door-gap colliders; check:buildings inventory + yaw-aware roof plan check), `fort.glb` props (cannon, flagpole, well, saddle rack, army wagon, sentry box, rifle crates, rubble), post cemetery east of the walls. landmarks.js stone cube removed. Telegraph skips 45 m round the fort (was place radius).
- Mission + camps slice (user chose move+rebuild mission, outlaw camps, shift tribal ring): `camp.glb` (17 props). POS.mission -> (0.51375,0.113) off the Deadman arroyo, ranchSouth extended to its forecourt; `src/mission.js` (called from createLandmarks so every check builds it) with chapel/convento structures + aperture declarations (also declared the fort's three buildings, and check:apertures now builds the fort). POS.vipers/hideout moved onto their NAV_CUTS rim ends, approaches dx/dz 0. `TRIBAL_CAMP` offset (map.js) moves tipis/lodges 30 m off the trail. props.js `planCamps` (planHomestead generalised: layout, rotate, alts, wall): timber camp (landmarks/pines box piles, stumps, sawbuck, tent removed), sheep camp (wagon + pen), outlaw camps, tribal gear, El Paso plaza. El Paso well moved off the trail. yardClear now rejects seats sinking > 0.45 m (Barrett lost 3 pieces).
- Guard: `npm run check:western-props` (ore chain, fort, mission/arroyo, no solids on roads in camps, camp dressing). All planned slices done.
