# Current Objective

Address the user's report that wheel ruts still look like slick oil/tar rather than recessed dirt.

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

- In this repo: `claude`
- Delegate with `airoute run auto "<task>"` or `/scout` `/worker` `/senior` `/expert`
- Continue the in-progress navigation/visual work without using Astra unless an architecture decision is actually blocked
