# Silver Creek saloon

Authored through Blender MCP in `saloon.blend` (scene "High Country • Saloon"), over the kit's saloon lot in `src/landmarks.js`. The model is in lot-local metres: x runs across the facade, y is up from the lot floor, and +z points toward the street.

`SALOON` in `src/buildings/saloon.js` is the source of truth: storey heights, stair, upstairs partitions, openings, bar, stove and balcony. The kit, the colliders and both Blender scripts all read it.

## Files

- `export-layout.mjs` writes `layout.json`: `SALOON`, the lot's size and placement, and every wall frame with its openings. With `--reference` it also writes the kit shell and boardwalk to `/private/tmp/claude-501/saloon-context.json`, which `load_context()` imports as a grey alignment reference. Note that the back wall's frame faces -z, so its opening x runs opposite the lot's.
- `saloon.py` builds the exterior.
  - Storefront: pilasters, bulkheads, sashes in the glazed windows, a transom door and batwings pinned open.
  - Gallery: a balcony on four posts over the boardwalk, level with the upstairs floor, with its door standing open.
  - Upper storey: clapboards, with real windows front and back.
  - False front: bracketed cornice, pediment and the SALOON sign.
  - Back and top: board-and-batten, tin roof and parapet boarding.
- `interior.py` builds the interior.
  - Barroom: floorboards; wainscot, striped paper and crown on every wall, cut round each cased opening; a pressed-tin ceiling open over the stair; the bar with brass rail and spittoons; the back bar with mirror, columns and bottles; an 18-riser stair with balustrade and spandrel closet; the stove and pipe; lamps and pictures.
  - Upstairs: a hall to the balcony door and two rooms, with board partitions, cased doorways with open doors, curtains and a board ceiling.
- Models: `../../src/models/saloon.json` and `saloon-interior.json` hold tinted material batches.
- `src/buildings/saloon.js` wires both into the game.
  - `attachSaloon()` adds the post colliders and the balcony deck and rails.
  - `saloonInterior()` adds the upstairs slab (the barroom ceiling), walkable decks for the boards, the stair ramp, the upstairs floor and the balcony, and colliders by storey: the stair spandrel, bar, stove, partitions, beds and piano.
  - It also sets `userData.storeys` for the camera, and places the furniture.

## Running

1. Run `ns = runpy.run_path('<abs>/saloon.py'); ns['build'](); ns['export']()`.
2. Then run `ni = runpy.run_path('<abs>/interior.py'); ni['build'](); ni['export']()`.

After changing `SALOON` or the lot, run `npx tsx scripts/blender-saloon/export-layout.mjs` first.

## Checks and captures

`check:saloon` guards the fit.
- The layout and `SALOON` still match the kit.
- Both models stay within their envelopes.
- The model leaves every door and pane clear, front and back.
- The street faces are dressed.
- Floorboards and treads sit where the decks register them, both ceilings are closed, and the camera ceiling matches each storey and the well.
- A walker goes from the street through the barroom, up the stair, into both rooms and onto the balcony, but not under the stair, over the well guard or off the balcony.

`capture.mjs` takes WebGPU captures from lot-local poses, street to balcony. It needs a preview on :8765.
