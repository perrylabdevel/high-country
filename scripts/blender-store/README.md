# Silver Creek general store

Authored through the Blender MCP bridge in scene "High Country • General Store",
over the kit's `store` lot in `src/landmarks.js`. The model is in lot-local
metres: x runs across the facade, y is up from the lot floor, and +z points
toward the street. No `.blend` is committed; `store.py` is the reproducible
source of truth.

`STORE` in `src/buildings/store.js` is the runtime contract: the display
apertures the kit has to cut, the awning posts, the boardwalk stock and the
window displays that need colliders.

## Files

- `store.py` builds the exterior in one pass.
  - Storefront: panelled bulkheads, plate-glass display windows with mullions
    and gold-leaf lettering, entry and corner pilasters, a door transom.
  - Displays: stepped nooks of sacks, bolts of cloth, kegs, crates, shovels and
    tinware standing inside the glass, so there is something to look at through
    it.
  - Awning: striped canvas on two posts with a scalloped valance and sawn
    brackets, plus the stock the shop keeps out under it.
  - Upper facade: clapboard courses, a battened loft door with its tin hood and
    hoist beam.
  - Crown: frieze, MERCANTILE sign board, a trades band, a bracketed cornice
    and a centre pediment with a finial.
  - Returns: board-and-batten, a stone skirt, the FEED & SEED ghost sign and a
    stovepipe.
- `export-layout.mjs` writes `layout.json` — the lot's world frame, which the
  street builder decides, not this script. `capture.mjs` hangs its lot-local
  poses off it.
- `src/models/general-store.json` is the synchronous runtime asset;
  `public/models/buildings/general-store.glb` is a portable copy.

## Running

    ns = runpy.run_path('<repo>/scripts/blender-store/store.py')
    ns['build'](); ns['preview'](); ns['export']()

Every entry point resolves `bpy.data.scenes[SCENE]` itself instead of trusting
`bpy.context.scene`, so this can run while another authoring script owns the
window's active scene.

## The kit is not where you think it is

Trim drawn against the wall planes is invisible. `falseFront` in
`src/buildings/kit.js` puts a board 0.4 m proud of the facade (z 4.10 → 4.50),
a cap over its top (out to z 4.82), and two returns 0.4 m proud of *both* side
walls over the full depth and height (|x| 4.85 → 5.25). The first build drew
the whole crown between `FRONT` and `FRONT+0.42` and the side treatment at
`SIDE`: in game the kit board hid every moulding and the sign board, and the
returns buried the battens and the ghost sign completely. Applied trim goes on
the OUTER face of the kit part it dresses — hence `FF`, `FF_CAP` and `RET`.

`preview()` therefore proxies those kit parts, and the shell, at scale. Without
them Blender renders trim it has no way to know is occluded, and the render
says the facade is finished when the game shows a blank panel.

`preview()` also multiplies the per-face `Col` attribute into each material.
The runtime multiplies the batch texture by that tint and `store.py` puts the
*entire* paint scheme in the tints, so a preview material with a flat base
colour renders every tint identically and cannot be used to judge the paint at
all.

## The loft and the interior

The facade always carried a loft door and a hoist beam over a void: a 2.7 m
shop ceiling with nothing above it until the roof's flat underside at 5.74. The
store now has a storage loft behind that door, on the saloon's and hotel's
section — ceiling 3.20 (within `check:buildings`' 2.3–3.2 invariant), loft
floor 3.44, loft ceiling 5.62 just under the roof — and an authored interior to
the saloon's depth:

- **Sales floor:** beadboard wainscot and painted board walls cased round the
  display windows and the door; a beaded ceiling open over the stair; the
  18-riser stair up the west wall, clear of the display nook; the counter with a
  glazed show case, brass scale and cash register; floor-to-ceiling shelving
  behind it and along the back wall, stocked with tins, jars, crocks, boxes and
  bolts of cloth; the cookstove and its flue; hanging lamps.
- **Loft:** boards round the well, a rail along its open edges, a loading gate
  round the loft door, the inside of that door with its bar and hoist rope, a
  back window, stock.

`interior.py` builds on the shared kit, `scripts/blender-kit/interior_kit.py`,
extracted from the hotel's interior. That refactor was accepted only because
the hotel re-exported through it byte-identically. Run order:
`export-layout.mjs`, then `store.py`, then `interior.py`.

### Traps this interior hit

- **A loft needs a rail, and a closed loft door needs more.** The kit's street
  wall collider has a 3 m gap for the ground doorway, full height, so a walker
  in the loft could pass through the closed loft door and drop onto the awning.
  A wall collider across it is not allowed: `check-interiors` and
  `check-buildings` probe the street door **height-blind**, so no collider at
  any height may cross the door's column. A loading gate round the loft door's
  bay does the job without crossing it; `check:store` asserts it stays clear.
- **Measure a prop before building to it.** The cookstove model is one merged
  mesh with its own flue, measured from its vertices at (0.350, −0.210) in its
  frame. The authored pipe first rose from the stove's centre — two pipes side
  by side. It now continues from the model's pipe top, the roof pipe from the
  same point, and `check:store` recomputes the rotation.
- **A display backboard to the window head blinds the window from inside.** It
  now stops above the goods, leaving ~0.7 m of glass to see the street through.
- **`wool_sacks` stand as tall pale cocoons indoors.** Crates and barrels instead.

## Checks and captures

`npm run check:store` guards the fit offline.
- The lot footprint and the display apertures still match `STORE`, and the
  sills stay at or above the kit's 0.5 m glazing threshold.
- All six material batches render, and the export's lot-local envelope is not
  inverted in Y or Z (the sheriff shipped a facade that was correct in Blender
  and upside-down in the game).
- The crown clears the kit parapet but does not become a tower, and the side
  treatment reaches outside the kit returns rather than hiding inside them.
- Both shells carry the door plus two matching windows.
- The doorway is walkable, the display windows are not, and the awning posts
  and boardwalk stock are solid at knee height but open above the awning.

`capture.mjs` takes WebGPU captures from lot-local poses. It needs
`npm run build` and a preview on :8765:

    node scripts/blender-store/capture.mjs audit/store/current [pose...]

Pass pose names to capture a subset; the full set is slow enough to be worth
chunking.
