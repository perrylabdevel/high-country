# Campaign backlog (Episodes 2–12)

Episode 1 ("Smoke on the North Wind") actually ships a mission state machine — stages complete on talk / arrive / examine, with flags `sawTheLine`, `sawArson`, `loopComplete` — plus a versioned save that stores that mission state (not a `decision` field), nav-route travel to the Ranch Overlook, and arrival/examine interactions whose result changes family dialogue and state. It does **not** yet have per-faction reputation, family relationship notes, clue records with contradictions, or a `decision` save field; those are Episode 2 prerequisites to build, not systems to reuse.

Later episodes should reuse those systems rather than new prototypes.

| Ep | Title | New data, not new engines |
| --- | --- | --- |
| 2 | The Empty Stage | Stage-road ambush clues; missing-person timeline; barn stash hotspot |
| 3 | A Measure of Water | Survey documents; two-community reputation split; town-meeting dialogue set |
| 4 | The Doctor’s Hand | Medicine/clue inspection; family health flag on ranch state |
| 5 | Noose at Sundown | Timed jail/courthouse scenes; law reputation as a clock, not a minigame engine |
| 6 | The Widow’s Claim | Title-deed documents; ranch ownership flags |
| 7 | The Quiet Giant | Frame-job evidence; Wade-specific dialogue routes |
| 8 | Children of the Pass | Northern pass travel biome; disease/supply ranch checks |
| 9 | A Candidate’s Promise | Public-speech scene; nonpartisan fictional politics; press vs law options |
| 10 | The Iron Road | Railroad construction region; tribal-land and water flags (research-backed characterization) |
| 11 | Blood at the Table | Campaign-wide clue cross-references; ally betrayal flags from prior episodes |
| 12 | Home Before Winter | Alliance checks against saved reputation; final confrontation using existing combat/dialogue hooks |

Do not start Episode 2 until the implemented Episode 1 loop — find Harlan → ride the ridge to the Overlook → glass the smoke → ride back and tell Nell, reaching `loopComplete` — can be finished without developer intervention, and the versioned save survives that climax → aftermath transition.

## World layout follow-ups

### Roads converge inside the High Country Ranch house

Five roads end at exactly the ranch POI centre (`POS.ranch`, world (-400, 300)): `stage` (from the west), `ranchTown` (to Silver Creek), `ranchSouth`, and the `rangeRanch` and `cabinTrail` trails. That point sits against the house's south wall (`src/buildings.js`: house block roughly x -10.5..16, z -24.5..-1 in ranch-local metres), so the last leg of each diagonal road runs across the house footprint and the kitchen ell; the stage road also runs through the working yard at z = 0 (half width 4.5).

Symptoms so far: the old box woodpile at ranch (-16, -4) stood on the stage road shoulder (moved to -7.5 during the ranch prop slice), and several yard props had to be re-sited off the roads (`RANCH_YARD` in `src/props.js`).

Proposed fix, not started: give the roads a real meeting point in the open yard, a gathering circle roughly 20–25 m south of the house, and move the house (or end the roads) so it stands behind that circle, facing it, instead of on top of the junction. Anything keyed to ranch-local offsets moves with it and must be rechecked: the `ranch.yard` / `ranch.hitch` approaches (`src/nav/arrivals.js`), the NPC posts in `src/main.js`, livestock rings, the ranch prop spots and `RANCH_YARD`, and the audit/capture vantages. Run `check:approaches`, `check:routes`, `check:nav-graph`, `check:roads` and `check:western-props` afterwards.

## Vegetation follow-ups

### TODO: authored conifers (Blender) are not yet better than the procedural ones

`pine_std` (`scripts/blender-props/pr_pine.py`, `public/models/trees/pine_std.glb`) replaces PINE[1] at equal triangle counts and measured equal frame time, but in the northernPines A/B it read darker and thinner than the procedural crown at mid range, so it ships `enabled: false` in `src/treeModels.js` (dev A/B: `window.__treeModels(true|false)`). The burnt snag is authored and on.

Likely lever before retrying: author the needle *texture* in Blender — a rendered atlas of several sprig/cluster variants with real alpha and normals — shared by procedural and authored crowns, then brighten the baked AO floor and re-run the A/B at northernPines, foothills and the ranch windbreak. Only then extend to PINE[0], [2], [3] and the two broadleaf prototypes, and re-baseline the tree-bearing audit frames.

### TODO: terrain shows through the ranch-house and hunting-cabin floors

Seen while capturing the authored furniture: ground renders above the floor boards inside both buildings (the blacksmith has no floor at all). The ranch house overlaps the road-convergence item above; the cabin sits on `cabinTrail`'s end. Some ranch-house furniture is hidden under it.
