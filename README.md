# High Country

An original family-centered Western. This build follows `High_Country_Game_Handoff/newest_handoff_prompt.md`: a **real-time explorable 3D world** in the browser (Three.js), not a 2D slideshow.

## Stack

Three.js 0.185.1 (WebGPURenderer + TSL node materials), Vite, TypeScript (`allowJs` so `src/` can migrate file by file). The previous "no compile step" path is gone: three's WebGPU/TSL subpaths are not in a single vendored file.

The previous canvas 2D slice is archived under `legacy-2d/`.

## Setup

```sh
npm install
```

You need a current desktop browser. WebGPU is preferred. Append `?webgl` to the URL to force the WebGL2 backend (useful when isolating a backend bug).

## Run

Development (HMR):

```sh
npm run dev
```

Then open the URL Vite prints (default `http://127.0.0.1:8765`) and click **Enter the ranch**.

Production bundle:

```sh
npm run build
npm run preview
```

`python3 serve.py` still works, but it serves `dist/` after a build — it is no longer a no-npm path.

## Checks

```sh
npm run check
```

Runs the nine `scripts/check-*.mjs` contracts (grounding, collision, handedness, debug, settlements, needle, interiors, map layout, roads).

## Controls

| Input | Action |
| --- | --- |
| Click | Capture mouse / look |
| Mouse | Look |
| WASD / arrows | Walk or ride |
| Shift | Sprint / gallop |
| C | First / third person |
| E | Mount, dismount, talk |
| Esc | Release mouse |

## Current slice

The whole overhead territory is blocked out and rideable: High Country Ranch, Silver Creek, Lake Mercy, Northern Pines / burn smoke, Western Range, Iron Valley, foothills, Tribal Lands, and the Southern Badlands. Buildings are primitive stand-ins. This is a map-scale test bed, not the finished Episode 1.

Materials work is tracked in `docs/TERRAIN_MATERIALS_HANDOFF.md`. Milestone 0 is the toolchain and WebGPU migration.

Dev flags:

| URL | What |
| --- | --- |
| `/?lab` | MaterialLab test scene (plane, sphere, cube, slope ramp, 500m strip) |
| `/?dev` | lil-gui material panel + stats overlay on the live world |
| `/?webgl` | Force the WebGL2 backend |

Pack downloaded Poly Haven sources (gitignored `assets-src/`) into `public/textures/`:

```sh
npm run pack-textures
```

## Docs

- `IMPLEMENTATION_STATUS.md`
- `docs/TERRAIN_MATERIALS_HANDOFF.md`
- `High_Country_Game_Handoff/newest_handoff_prompt.md`
