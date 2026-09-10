# High Country

An original family-centered Western. The product brief lives in `.ai/REQUIREMENTS.md`: a **real-time explorable 3D world** in the browser (Three.js/WebGPU), not a 2D slideshow. See `docs/ARCHITECTURE.md` for the stack.

## Stack

Three.js 0.185.1 (WebGPURenderer + TSL node materials), Vite, TypeScript (`allowJs` so `src/` can migrate file by file). The previous "no compile step" path is gone: three's WebGPU/TSL subpaths are not in a single vendored file.

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

## Checks

```sh
npm run check
```

Runs the 29-check suite through `scripts/check-all.mjs` (geometry checks in parallel, then the timing-sensitive checks isolated; see `AGENTS.md`).

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

- `.ai/REQUIREMENTS.md`
- `.ai/HANDOFF.md`
- `docs/ARCHITECTURE.md`
- `docs/VISUAL_STATUS.md`
- `docs/TERRAIN_MATERIALS_HANDOFF.md`
