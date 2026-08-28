---
name: capture-poi
description: Take a screenshot of a place in the game that is actually trustworthy. Use whenever you need to see a visual change, before claiming any visual result, or when a frame looks wrong or empty.
---

# capture-poi

## The trap that invalidates screenshots here

Ground cover is scattered **amortised over ~72 frames**. Under software
rendering that is minutes of wall clock. If you move the camera and screenshot
too early, you photograph the vegetation still centred on the **previous**
location — which looks exactly like an empty biome.

This has produced wrong conclusions more than once. A location was reported
bare when a headless count showed 312 tufts per 100 m² within 25 m, nearly
double the ranch.

**Never wait a fixed number of seconds.** Wait on the game's own predicate:

```js
window.__vegSettled()   // true once the scatter has caught up with the camera
```

`npm run capture` already waits on this and throws rather than writing a stale
frame. If you write your own harness, wait on it too, and label any frame that
did not settle as unreliable.

## The standard way

`npm run capture` drives a browser against a **running preview server**. With
no server it exits 1 with a navigation error and writes nothing. Backgrounding
the server and capturing on the next line is a race — it needs ~4 s to answer,
more under load — so wait for it, do not sleep a guess:

```bash
npm run build
nohup npm run preview > /tmp/preview.log 2>&1 &   # --strictPort: it cannot drift
for i in $(seq 1 30); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8765/)" = "200" ] && break
  sleep 1
done
curl -s -o /dev/null -w 'server: %{http_code}\n' http://127.0.0.1:8765/   # must be 200
npm run capture
```

Writes to `audit/current/`. If capture exits non-zero, read the error: a
navigation failure means the server is not up, not that the game is broken.

## A one-off look at one place

Load `http://127.0.0.1:8765/?webgl&dev`, click "Enter the ranch", then:

```js
window.__captureMode(true);
const P = window.__POS.northernPines, h = window.__heightAt;
window.__captureView = { px:P.x+16, py:h(P.x+16,P.z+16)+1.7, pz:P.z+16,
                         tx:P.x, ty:h(P.x,P.z)+9, tz:P.z };
// poll window.__vegSettled() until true, THEN screenshot
```

POI ids are the keys of `window.__POS` (`ranch`, `northernPines`, `burn`,
`westernRange`, `lakeMercy`, `ironValley`, `badlands`, …) — see `src/map.js`.

## Which vantage — this decides whether you can see the defect at all

`CAPTURE_MODE` picks the camera:

- `audit` (default) — the graded set. Stands back and **pitches down**.
- `close` — nearer, still pitched down.
- `eye` — stands at 1.65 m and looks **dead level**; the target height is
  pinned to the camera's own, so pitch is exactly zero however the ground
  rises ahead.

Looking down at grass hides the blade/ground junction behind the blades
themselves. The floating-grass artefact was invisible in **every** downward
frame taken across a whole session — dozens — and obvious in the first
level one. If the defect is anything about how ground cover meets the ground,
or about silhouettes, shoot `eye`. Against the sky is where a severed or
floating card gives itself away; against ground it just reads as more grass.

`eye` and `close` are diagnostic: the script refuses to write them into
`audit/current`.

## Verify the backend before you believe the frame

WebGPU ships; `?webgl` is a fallback. A whole session was spent diagnosing on
WebGL frames while the user ran WebGPU — the single biggest methodological
failure in this project. `npm run capture` defaults to `CAPTURE_BACKEND=webgpu`
and asserts the page agrees before writing anything.

The assertion is only as good as its test. It used to read
`renderer.backend.constructor.name`, which minification turns into two
characters, so a WebGL fallback passed the WebGPU check silently. It now tests
for a real `GPUDevice`. If you write your own harness, call
`window.__captureInfo()` and check `backend`.

Note that headless Chromium usually has **no** WebGPU adapter and falls back
without saying so. Genuine WebGPU frames may need a headed launch.

## Other useful capture switches

- `CAPTURE_POI=<id>` — one location instead of sixteen.
- `CAPTURE_SOLO_GRASS=<species>` — plant one ground-cover species alone.
- `CAPTURE_GROUND_LINES=1` — magenta grid on the drawn terrain, plus 12 cm
  pins, so a frame shows where the ground actually is under the cover.
- `CAPTURE_GRASS_PINS=1` — a 12 cm pin at each tuft's own footing, sharing its
  depth, so a gap is measurable rather than arguable.

`docs/DEBUG_HOOKS.md` is the full list.

## Reading the HUD

`draws · tris · tex · mem` is in the top-left. Record it with any perf claim.

## Judging what you see

- **Backlit is not broken.** Check the sun side before calling something dark.
  Shoot the same subject from the opposite side; if it is dark from *both*,
  it is a material problem, not lighting.
- **An empty biome may be an unsettled frame.** Confirm with numbers before
  believing it — see `measure-first`.
- Say which frame supports which claim. "Looks better" with no frame is not
  a result.
