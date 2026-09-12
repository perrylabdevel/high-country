# Current checkpoint

`STATE.json` is the canonical resume record and is the only checkpoint loaded at startup. This file is optional, deliberately compact, and should contain only details that do not fit STATE but are needed for the active task.

## Active work

- Ground-texture checkerboard fix is implemented in `terrainMaterial.ts` and
  tuned to a 3.6 m sample-position warp over a 24 m noise period. All terrain
  PBR channels share the warp; true-world splat weights and road geometry do not.
- `check:roads` pins the useful warp range and graph wiring. Its negative test
  failed correctly at zero amplitude, then passed after restore.
- Exact WebGPU plan-view measurement reduced 6 m/24 m recurrence from ~0.995
  to 0.07-0.09/0.01-0.02. Final audit-vantage frames are under
  `audit/ground-repeat-final-range/`.
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
