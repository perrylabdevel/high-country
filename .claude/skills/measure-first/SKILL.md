---
name: measure-first
description: Diagnose a visual defect with numbers before editing any shader, material, or texture. Use when something looks too dark, too bright, too sparse, too flat, blocky, or missing.
---

# measure-first

Almost every visual bug in this project that was "obviously lighting" turned
out to be arithmetic, and every one that was guessed at cost a wasted cycle.
Measure, then edit.

## Worked example — the black conifers

Canopies rendered near-black. The confident guess was the `DoubleSide`
back-face normal flip (three only applies `negateOnBackSide` on its default
normal path, and these materials supply their own `normalNode`). Plausible —
and wrong.

One screenshot from the sun side disproved it: just as dark front-lit. The
real cause came from measuring the chain:

| term | value |
|---|---|
| needle albedo, green | 0.29 |
| tier AO | 0.46 … 1.0 |
| along-branch AO | 0.55 … 1.0 |
| fold AO | 0.82 or 1.0 |

Three AO terms **multiplied**: `0.46 × 0.55 × 0.82 = 0.21`. On a 0.29 albedo
that is 0.06 reflectance — black. The broadleaf canopy, which looked right,
floors its single AO term at 0.5. The fix was to match the class that works,
not to invent a number.

## How to measure

**Texture brightness / coverage** — do not eyeball a PNG:

```bash
node -e "const sharp=require('sharp');(async()=>{
const {data,info}=await sharp('public/textures/foliage/needle_albedo.png').raw().toBuffer({resolveWithObject:true});
let g=0,n=0,tot=0;
for(let i=0;i<data.length;i+=info.channels){tot++;const a=info.channels===4?data[i+3]:255;if(a<128)continue;g+=data[i+1];n++;}
console.log('cover',(n/tot*100).toFixed(1)+'%','mean g',(g/n/255).toFixed(3));})()"
```

**Scene contents** — build the world headlessly and count. Faster and more
reliable than screenshots. Copy the canvas stub from
`scripts/check-vegetation.mjs`, then import `createVegetation`, collect what
gets added to a stub scene, and inspect instance matrices, counts, vertex
colours and `instanceColor` ranges directly.

This is how "the range biome is bare" was disproved in one run.

## Order of work

1. State the suspected cause **and what number would prove it**.
2. Measure that number.
3. If it does not match, your theory is wrong — say so and measure something
   else. Do not edit on a theory you just disproved.
4. Only then change code, and change the smallest thing.
5. Re-measure the same number. Report both values.

## When every measurement is clean and the defect is still there

This is the most expensive failure mode in the project's history: seven fixes,
fifteen green checks, and a user who could see the bug the whole time.

Ground cover appeared to float. Each pass measured something and got a clean
number — card origin (0 of 49,573 above 5 cm), the geometry base (local y=0),
the atlas art (blades reach the panel floor), the atlas alpha (solid to mip 5),
the mip chain (only ever trims tips), the wind (identical with amplitude at
zero), and finally a raycast against the terrain **as rendered** (all 2355
cards buried 3-11 cm, none above). Every one of those readings was correct.

The cause was that `tints` and `speciesUV` were TSL nodes, and
`node.needsUpdate = true` does nothing — `BufferAttributeNode` has no such
property and the node's buffer is `StaticDrawUsage`. Both uploaded once at
first render and never again, while the instance matrices kept updating. Cards
kept getting new positions and sizes while holding the first scatter's species.
See HARD_WON 1.6.

**Nothing headless could ever have seen it**, because the CPU side was right.
The defect lived only in a stale GPU buffer.

Two rules come out of that:

1. **A clean number means "this is not the cause", never "there is no bug".**
   After two or three clean readings, stop adding readings and ask what class
   of thing your instrument cannot see. Node scripts cannot see GPU state.
2. **When someone who can see the defect keeps saying it is still there,
   the measurement is the thing to doubt.** The user was right seven times
   running. "The numbers are clean" is not a rebuttal to an observation.

### Measure the drawn thing, not a model of it

The same trap, one level down. `heightAt` is bilinear; the terrain mesh is that
grid triangulated, and the two disagree inside every cell — so a grounding
check written against `heightAt` reported perfect seating while 9.5% of cover
floated. `meshHeightAt` replicates the triangulation and matches the drawn mesh
to 0.00 cm (`window.__terrainProbe` raycasts the real mesh to confirm it).

Ask of any measurement: *is this the number the renderer uses, or my model of
it?* Prefer, in order: read it back off the GPU-facing object (instance
matrices, `__grassStats`), raycast the actual mesh, then a model.

### Make the invisible visible instead of measuring harder

What finally found it was not a better number. It was `__soloGrass("cheatgrass")`
plus `__speciesColour(2)`: plant one species, draw every card as a flat-coloured
solid quad. Cards rendered in two other species' colours — a contradiction no
amount of numeric agreement could hide.

When a defect survives several clean measurements, build the view that makes
the wrong thing *impossible to look at without noticing*. `docs/DEBUG_HOOKS.md`
lists what already exists.

### Verify the renderer you are testing is the one that ships

WebGPU is the target; `?webgl` is a fallback. Frames from the wrong backend
answer a question nobody asked. `window.__captureInfo()` reports the real
backend — it tests for an actual `GPUDevice`, because an earlier version tested
`renderer.backend.constructor.name`, which minification turns into two
characters, so a WebGL fallback passed a WebGPU assertion silently.

## Fixing the cause vs. hiding the reading

Once you have the cause, ask whether your change removes it or merely stops
the grader seeing it. Both move the score. Only one improves the game.

A worked pair, both from the same U3 batch:

- **huntingCabin** — cause: the gravel trail's edge met the grass in a clean
  straight line. Fix: stones straddling that edge. A real trail has stones on
  its margin, so the change removes the thing that was wrong. Legitimate.
- **ranch courtyard** — cause, correctly measured: a *cast building shadow*
  with a straight edge, not a material seam. Fix: stones scattered where the
  shadow crossed the yard. The shadow is untouched — still there, still
  straight. The stones sit at fixed world offsets tuned to where it fell in
  one midday frame, and they are unrelated to the geometry, the sun, or the
  ground. That is set dressing over a symptom.

The tell: **if your fix would be pointless once the camera or the light
moved, you are hiding a reading, not fixing a cause.**

This matters most when the real fix is out of scope. "Lighting was off
limits, so I placed props where the shadow was" is not a smaller version of
the right fix — it is a different act. When the measured cause is off limits,
the honest outcome is **logged, no change**, naming the cause and what it
would take. A reverted cycle is a result; a cosmetic substitute is a score
with no improvement behind it, and it accumulates permanent clutter nobody
can attribute later.

Set dressing is a real technique — but it belongs where the straight line
should not have been there in the first place, not over a line the renderer
is drawing correctly.

## Known multiplier traps

- **Multiplied AO terms.** Each looks sane; the product does not. Check the
  floor, not the average.
- **Chained tints.** `albedo × tint × vertexColor × instanceColor` — four
  sub-1 values crush a surface fast. Multiply them out.
- **Unset `instanceColor` renders pure black.** three leaves `vInstanceColor`
  at zero, nothing throws, nothing logs. `check:vegetation` pins this now.
- **A TSL node has no `needsUpdate`.** Per-instance data written every frame
  must be a real `InstancedBufferAttribute` on the geometry with
  `DynamicDrawUsage`, read with `attribute()`, and marked dirty on the
  attribute. `check:instance-attrs` pins this now — it cost seven passes.
- **Alpha in block-compressed textures.** KTX2 quantises alpha; fine grass
  tips go chunky. Foliage albedo stays PNG for this reason.
- **Density beats materials.** Established four separate times: raising
  near-field density transformed the look for ~0.26 M triangles and zero extra
  draw calls, while a full PBR material spike was marginal. Try density first.
