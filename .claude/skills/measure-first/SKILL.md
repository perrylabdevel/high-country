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

## Known multiplier traps

- **Multiplied AO terms.** Each looks sane; the product does not. Check the
  floor, not the average.
- **Chained tints.** `albedo × tint × vertexColor × instanceColor` — four
  sub-1 values crush a surface fast. Multiply them out.
- **Unset `instanceColor` renders pure black.** three leaves `vInstanceColor`
  at zero, nothing throws, nothing logs. `check:vegetation` pins this now.
- **Alpha in block-compressed textures.** KTX2 quantises alpha; fine grass
  tips go chunky. Foliage albedo stays PNG for this reason.
- **Density beats materials.** Established four separate times: raising
  near-field density transformed the look for ~0.26 M triangles and zero extra
  draw calls, while a full PBR material spike was marginal. Try density first.
