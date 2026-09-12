# Current checkpoint

`STATE.json` is the canonical resume record and is the only checkpoint loaded at startup. This file is optional, deliberately compact, and should contain only details that do not fit STATE but are needed for the active task.

## Active work

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
