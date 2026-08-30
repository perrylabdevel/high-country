# Debug hooks

Everything here lives behind `isDev` in `src/main.js` and is stripped from a
production build. Open a dev build (`npm run dev`, or `?dev` against a preview)
and call these from the browser console. `scripts/capture-poi.mjs` drives the
same hooks from Playwright.

They exist because of one bug. The ground cover appeared to float for seven
attempted fixes and fifteen passing checks, and every headless measurement said
the scene was correct — because it was. The defect was a stale copy of one
per-instance attribute in GPU memory (HARD_WON 1.6), which nothing that runs in
Node can see. What found it was rendering one species alone in a flat colour and
noticing cards in a colour belonging to a species that was not in the world.

So these are not leftovers. They are the instrument for the class of bug that
only exists on the GPU, and the reason to keep them is that the next one will
look exactly as invisible.

## Ground cover

| Hook | What it does |
| --- | --- |
| `__grassSpecies()` | The four species names, in atlas order. |
| `__soloGrass(name)` | Plant one species and nothing else; `null` restores the mix. Filters where the species is chosen, so the amortised rescatter keeps honouring it. Give it a few seconds, or poll `__vegSettled()`. |
| `__speciesColour(mode)` | `1` floods each blade silhouette with its species colour; `2` forces alpha to 1 so every card draws as a solid quad — the only way to see card size, lean and edges; `0` off. blueGrama red, bunchgrass green, bluestem blue, cheatgrass yellow. |
| `__grassStats(radius)` | Card width, height and width:height percentiles for tufts within `radius`, read back from the instance matrices. What is drawn, not what the constants imply. |
| `__setWind(sway, gust)` | Wind amplitudes. `(0, 0)` stops the cover dead, which separates "the displacement is doing it" from "the shape of the bend is doing it" with no wind phase to confuse the comparison. |
| `__windProfile(exp)` | Wind bend profile exponent. `2` ships; `1` is linear between the card's vertex rows. |
| `__grassMips(on)` | Drop or restore the blade atlas mip chain. Diagnostic only — off aliases badly at distance. |
| `__grassShadow(on)` | Shadow receiving on the ground cover. Off by default — it works (see HARD_WON 1.7) but is an appearance change, so it is enabled in a measured pass, not by default. |
| `__dumpGrassAtlas({ alpha, mip })` | The blade atlas as a PNG data URL, optionally its alpha channel as greyscale and after N box-filter halvings — what the GPU samples at that mip level. |
| `__grassAtlasBase(alphaTest)` | Per panel, the lowest row painted at all versus the lowest row surviving the alpha test. The difference times card height is a gap in metres. |
| `__hideGrass(on)` | Hide the ground cover. Restores the saved count, so calling `(false)` first is safe. |

## Ground truth

| Hook | What it does |
| --- | --- |
| `__terrainProbe(radius)` | Raycasts down onto the terrain **as rendered** at each nearby tuft. `modelErrorCm` is `meshHeightAt` minus the ray hit — non-zero means the height model and the drawn mesh disagree and every grounding check is measuring the wrong surface. `cardGapCm` is the card's bottom edge minus the ray hit: positive is a card in the air, negative is the burial working. |
| `__grassPins(on, radius)` | A 12 cm magenta pin at each nearby tuft's own footing, sharing its depth. A gap between a pin's foot and the blade base is a real gap, measurable against the pin. |
| `__groundLines(on, span, step)` | The terrain surface itself: a grid on `meshHeightAt` plus 12 cm pins at each intersection, depth-tested. Reads the ground line the cover hides. |
| `__heightAt(x, z)` | The bilinear height model. Note this is *not* where the ground is drawn — `meshHeightAt` is. |

## Navigation

Two-stage navigation: the graph routes across the map, an arrival approach is
where a place can actually be reached (`src/nav/`). The player is never steered
by the game — these hooks expose the plan and its memory of failure so a probe
or a designer can verify the guidance against the terrain it will be walked on.

| Hook | What it does |
| --- | --- |
| `__nav()` | Read-only diagnostics: graph build summary (`nodes`/`edges`/`drops`/`components`), the live edge blacklist with reasons, and the route currently advertised for the active objective. |
| `__navOverlay(on, { radius = 260 })` | The system on the ground: dim graph edges, red segments where the failure memory blacklisted a crossing, a disc at every arrival approach, and the current objective's approach in **gold** with its facing tick. Call again to rebuild; `(false)` clears. |
| `__navBlockEdge(a, b, reason)` | Write failure memory: node ids from `__nav()`'s graph diagnostics. The game has no autopilot, so in shipped play nothing ever calls this — a scripted run uses it after a move proves an edge physically dead. The next `__nav().route` shows the detour or the unreachable verdict. |
| `__missions().objectivePlace` | The active objective's destination: POI centre (`name/x/z`), the arrival approach (`approach`), and with a pose, the planned `route` (`waypoints`, last is the approach point; `blocked`/`blockedPts`; `status`). |

## Camera and capture

| Hook | What it does |
| --- | --- |
| `__captureMode(on)` | Hide the HUD and take camera control. |
| `__captureView` | `{px, py, pz, tx, ty, tz}` — camera and target, applied each frame. |
| `__vegSettled()` | True when the amortised scatter has caught up with the camera. A screenshot taken before this shows the previous location's ground cover. |
| `__captureInfo()` | Renderer backend and adapter. Tests a real `GPUDevice`, not a class name — a minified build reports every class as two characters, which is how a WebGL fallback once passed a WebGPU assertion. |
| `__xray(n)` | See-through pass over every mesh. |
| `__planView(size, cx, cz)` | Orthographic plan view: a metre is a metre anywhere in frame. |
| `__POS` | Named world positions, keyed as in `src/map.js`. |

## From a capture run

`scripts/capture-poi.mjs` reads these environment variables:

- `CAPTURE_MODE=audit|close|eye` — `eye` stands at 1.65 m and looks dead level.
  Every other mode pitches down at the ground, which is exactly where the
  blade/ground junction hides behind the blades. The floating grass was
  invisible in every downward-pitched frame taken this session and obvious in
  the first level one.
- `CAPTURE_BACKEND=webgpu|webgl` — `webgpu` is canonical and the default.
- `CAPTURE_POI=<id>` — one point of interest.
- `CAPTURE_SOLO_GRASS=<species>` — plant one species, applied before the settle
  wait since it forces a rescatter.
- `CAPTURE_GROUND_LINES=1`, `CAPTURE_GRASS_PINS=1` — the ground references
  above, built after the settle wait so they centre on the final camera.

Anything but `CAPTURE_MODE=audit` on `CAPTURE_BACKEND=webgpu` is diagnostic and
the script refuses to write it into `audit/current`.
