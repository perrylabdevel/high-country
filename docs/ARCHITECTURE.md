# High Country — Architecture

## Governing brief

`High_Country_Game_Handoff/newest_handoff_prompt.md` — real-time explorable 3D Western, not 2D scenes.

## Stack

Three.js 0.170 (vendored). ES modules. Any static HTTP server (`python3 serve.py`, `python3 -m http.server`, `npx serve`). Vite/TypeScript/glTF can be added later; the playable path does not wait on that.

## World axes

Standard Three.js / glTF right-handed frame:

| Direction | Axis |
| --- | --- |
| East | `+X` |
| Up | `+Y` |
| **North** | **`-Z`** (so `+Z` is south) |

Player yaw is a compass heading: `0` = north, `π/2` = east, and it grows clockwise, so
mouse-right increases it. `map.js` owns the conversions — `headingVector` for motion,
`headingRotationY` for mesh orientation, `mapToWorld` / `worldToMap` for the (u, v)
territory art. Derive from those rather than writing `Math.sin(yaw)` inline.

Making north `+Z` looks harmless and is not. In a right-handed Y-up world the direction
on your screen-right is `look × up`, so looking along `+Z` puts `+X` on your **left**:
the 3D world then renders as a mirror of the minimap, and the compass needle appears to
swing opposite the camera. That bug survived several rounds of "fixes" to the needle
because the needle was never the problem. `scripts/check-handedness.mjs` locks it down.

## Runtime

| Module | Role |
| --- | --- |
| `src/main.js` | Scene, loop, interaction, HUD |
| `src/map.js` | Territory layout from the overhead map (places, biomes, roads, creeks) |
| `src/heightfield.js` | Baked terrain heights matching the map |
| `src/world.js` | Textures; re-exports height sampling |
| `src/environment.js` | Terrain mesh, sky, sun, fog, shadows |
| `src/buildings.js` | Ranch house, barn, bunkhouse, smith, windmill, corral |
| `src/landmarks.js` | Blockout settlements, lake, creeks, and region markers |
| `src/roads.js` | Dirt roads, trails, unfinished rail, and creek bridges on the heightfield |
| `src/vegetation.js` | Instanced pines, grass, rocks, burn smoke |
| `src/player.js` | Walk/sprint, first/third camera |
| `src/horse.js` | Mounted travel and gaits |
| `src/input.js` | Keyboard + pointer lock look |
| `src/minimap.js` | Zoomed parchment overlay that follows the player |
| `src/debug.js` | Dev panel for speed, look sensitivity, and landmark warp |

Narrative data from the 2D slice remains in `legacy-2d/` until it is ported onto 3D world objects.

## Extension

Keep quest/save schemas data-driven and independent of the renderer so Episode 1 systems can attach to this world without a second prototype.
