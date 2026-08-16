# Asset Pipeline — Blender, glTF, and what stays procedural

**Status:** design and evaluation, not implemented.
**Question it answers:** should authored assets come from Blender, and if so
where is the seam?

---

## 1. The short version

**Yes for authored props. No for the world.**

Blender is worth adding for hero objects — buildings, wagons, machinery,
landmark structures — and not worth adding for terrain, roads, creeks, grass,
or tree scatter. Those are generated from `src/map.js` data across 4 × 5 km and
have no business round-tripping through a DCC tool.

**The seam is anchors.** A Blender empty *is* a frame: position plus rotation.
Export it in the glTF and the loader turns it into an `Anchor`
(`docs/ANCHORS.md`). `mate()` then works identically whether a piece was
authored in code or modelled by hand. That single convention makes the two
efforts one effort rather than two pipelines that drift apart.

---

## 2. What Blender buys

- **Real modelling.** Bevels, booleans, arrays, curves, modifiers. A convincing
  barn is far easier to model than to assemble from primitives.
- **UVs.** The project currently gets whatever UVs `BoxGeometry` and friends
  hand out. Every material technique in `docs/TERRAIN_MATERIALS_HANDOFF.md`
  assumes better than that on authored props.
- **Baking.** AO and normal maps from a high-poly source; that is how a
  low-poly prop stops looking low-poly.
- **Assets.** Poly Haven and other CC0 libraries import directly.
- **Orthographic plans and elevations**, cheaply — the review format §9 of the
  anchors doc argues for.

## 3. What Blender does not fix — read this before committing

**It does not solve the spatial-reasoning problem, and it can worsen it.**
Driving Blender through `bpy` is still imperative coordinate placement, with an
extra process boundary added. `bpy.ops.transform.rotate()` is no more legible
than `mesh.rotation.y =`. If an agent cannot reason about front and back in
three.js, it will not do better in Blender.

Anchors are the fix for that. Blender is a fix for *fidelity*. Do not conflate
them, and do not let Blender adoption postpone phase 1 of the anchor work.

Other costs, honestly:

- **A pipeline is a place for drift.** `.blend` → export → import → material
  rebind. Four steps, four opportunities.
- **Binary weight.** The repo already carries uncompressed textures. `.blend`
  files and exported `.glb` add more. Decide early what is committed and what is
  built (see §7).
- **Two sources of truth.** If a barn exists as both kit code and a `.blend`,
  one of them is a lie. §4 sets the boundary.

---

## 4. Ownership — which system owns what

| Thing | Owner | Why |
|---|---|---|
| Terrain heightfield, biomes | `src/heightfield.js`, `map.js` | Generated, 4 × 5 km, needs runtime sampling |
| Roads, creeks, lake extents | `map.js` splines | Gameplay queries them (`roadFactor`, `creekFactor`) |
| Grass, tree scatter | `src/vegetation.js` | Density follows the camera; must be runtime |
| Building *layout* — which lot, which yaw | code + anchors | Must stay queryable and diffable |
| Building *form* — a specific barn's geometry | **Blender** | Fidelity work; not queried at runtime |
| Props: wagons, machinery, furniture | **Blender** | Same |
| Materials on authored props | Blender authored, three.js re-bound | See §6 |
| Terrain and water materials | TSL in `src/materials/` | Procedural, animated, camera-dependent |

The rule: **if the game asks it a question at runtime, code owns it. If it only
has to look right, Blender may own it.**

---

## 5. The glTF contract

Non-negotiable conventions. Each of these has silently broken a project
somewhere:

- **Units.** Blender scene unit = metres, scale 1.0. The game is 1 unit = 1 m
  (`EYE = 1.62`). glTF is metres. These already agree — do not introduce a
  scale factor anywhere.
- **Up axis.** Blender is Z-up, three.js is Y-up. The glTF exporter converts
  (glTF is Y-up). **Apply all transforms before export** — an unapplied rotation
  is the classic way this arrives 90° wrong.
- **Origin.** Every asset's origin sits at its **footing centre** — the point
  that meets the ground — not at the mesh centroid. This matches
  `structure()`'s local frame.
- **Facing.** Local **+Z is front**, +X is right, +Y is up, matching the kit.
- **Anchors as empties.** Add empties named `anchor.<name>`, e.g.
  `anchor.face.front`, `anchor.roofSocket`, `anchor.opening.door`. The empty's
  rotation defines the anchor normal (its local +Z). The loader strips the
  prefix, converts to an `Anchor`, and removes the empty from the scene graph.
- **Required sockets.** Add a custom property `required = true` on the empty; it
  becomes the `required` flag that `unmatedRequired()` lints.
- **Naming.** `<category>_<name>_<variant>` — `bldg_barn_a`, `prop_wagon_buck`.
  No spaces, no unicode.
- **Materials.** Export with PBR metallic-roughness. The loader re-binds to
  `MeshStandardNodeMaterial` — the project aliases `three` → `three/webgpu`, so
  a raw `MeshStandardMaterial` from `GLTFLoader` needs converting, not using
  as-is.
- **Textures.** KTX2, same as everything else. `GLTFLoader` +
  `KTX2Loader.detectSupport(renderer)`; the transcoder is already copied to
  `public/basis/` by `scripts/copy-basis.mjs`.

`GLTFLoader`, `DRACOLoader` and `KTX2Loader` all ship with the installed
three 0.185.1 under `three/examples/jsm/loaders/`. No new dependency.

---

## 6. Loading

```
public/assets/<name>.glb          committed, KTX2-textured, Draco or meshopt
src/assets/manifest.ts            paths + per-asset metadata, mirroring
                                  textureManifest.ts
src/assets/loadAsset.ts           GLTFLoader → convert materials to node
                                  materials → extract anchor.* empties →
                                  return { scene, anchors }
```

Then an authored barn is placed exactly like a kit barn:

```js
const barn = await loadAsset("bldg_barn_a");
mate(barn, "footing", lot.ground);
mate(hayHood, "wallSide", face(barn, "front", { along: 0 }));
```

That is the payoff of the anchor seam: the call site does not know or care
whether the barn came from `kit.js` or Blender.

---

## 7. What is committed

- **Commit** `.glb` exports and their KTX2 textures — the game needs them.
- **Do not commit** `.blend` sources in this repo. They are large, they churn,
  and git handles them badly. Keep them in a separate repo, an LFS store, or a
  synced folder, and record provenance in `src/assets/manifest.ts`:
  source file, author, licence.
- **Licence discipline.** Every downloaded asset records its source URL and
  licence, same rule as `audit/reference/SOURCES.md`. Nothing without a clear
  licence.

---

## 8. Agent ↔ Blender: how the conversation actually works

There is an MCP server for this — `blender-mcp` (ahujasid/blender-mcp) is the
widely used one: a Blender addon opens a socket, an MCP server bridges it, and
the agent can inspect the scene, run `bpy`, create and modify objects, and pull
Poly Haven assets. **Verify the current state of it yourself** — this document
was written against a May 2026 knowledge cutoff and I could not reach the
network to check versions or API surface.

Two modes, and they are good at different things:

**Interactive (Blender open, MCP connected).** The agent queries scene state,
runs `bpy`, and can render the viewport back to itself to look at the result.
Best when you are watching and steering — modelling a specific barn, fixing
proportions. The render-back loop is genuinely valuable: it is the same
"an agent cannot see unless you show it" principle as the audit loop, at a much
tighter cycle.

**Headless (`blender --background --python script.py`).** Reproducible, CI-able,
no GUI. This is what belongs in an automated pass: re-export all assets, bake
maps, generate orthographic plates. If a step matters, it should end up here
rather than in an interactive session nobody can replay.

Rules that apply either way, learned the hard way in this project:

- **Anything that matters gets committed as a script**, not performed in a live
  session. An interactive fix nobody can re-run is a fix that will be lost.
- **The agent still cannot see.** Whatever it does in Blender, the evidence is a
  render it looked at, or a numeric assertion. Not its own account of what it
  intended.
- **The game's audit loop remains the source of truth.** A Blender render
  validates the asset; it does not validate the runtime. Materials, lighting and
  scale only prove out in `npm run capture`.

---

## 9. A staged way in, if you want one

1. **One prop, end to end.** Pick a single object — the wagon is a good
   candidate, it is currently crude and self-contained. Model it, export with
   `anchor.*` empties, load it, place it with `mate()`. That exercises every
   step of §5 and §6 on something small enough to throw away.
2. **Decide from that** whether the fidelity gain justifies the pipeline.
3. **Then the buildings**, in priority order from the audit: El Paso and the
   hunting cabin have both scored 0 on "reads as a building" and are still
   blockout boxes.

Do not start with terrain, water or vegetation. They are procedural for good
reasons and Blender has nothing to offer them.

---

## 10. Ordering against the anchor work

Anchors first, Blender second, and not because anchors are more exciting —
because the anchor loader is *how Blender assets get placed*. Building the
pipeline first means placing imported assets with hand-typed coordinates, which
is the failure mode this whole document exists to avoid, now with an extra
process boundary in front of it.

Phase 1 and 2 of `docs/ANCHORS.md` are roughly a day and carry an automatic
correctness proof. Do those, then §9 step 1 here.
