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
nohup npx vite preview --host 127.0.0.1 --port 8765 > /tmp/preview.log 2>&1 &
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
