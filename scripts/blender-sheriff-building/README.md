# Silver Creek sheriff's office

Authored through the Blender MCP bridge in scene "High Country • Sheriff
Building", over the kit's `sheriff` lot in `src/landmarks.js`. Lot-local metres:
x runs across the facade, y is up from the lot floor, +z points toward the
street. No `.blend` is committed; the scripts are the source of truth.

`SHERIFF_REMODEL` in `src/buildings/sheriff.js` is the runtime contract: the
front windows the kit cuts, the canopy posts, and the interior (ceiling, cells,
furniture footprints, flue).

## Files

- `sheriff_building.py`: the exterior. It covers the stone plinth and clapboard,
  cased windows, the stepped false front with its SHERIFF sign and star, the
  roof and cupola, the porch canopy, the barred jail windows on the west side,
  and the stovepipe out of the roof.
- `interior.py`: the interior, on the shared kit (`scripts/blender-kit`).
- `export-layout.mjs` writes `layout.json`, which holds the lot's world frame,
  the kit's real wall openings and the contract. Run it before `interior.py`.
- `capture.mjs`: WebGPU captures from lot-local poses at EYE 1.62, with weather
  and sun pinned.

## Running

    ns = runpy.run_path('<repo>/scripts/blender-sheriff-building/sheriff_building.py')
    ns['build'](); ns['export']()
    ns = runpy.run_path('<repo>/scripts/blender-sheriff-building/interior.py')
    ns['build'](); ns['export']()

`export()` saves a `.blend` beside the script as a copy. Without `copy=True`,
`save_as_mainfile` rebinds the open Blender session to that file.

## The interior

One storey, under the kit's own ceiling slab (underside 2.62). The lot has no
`storeys`, so the kit keeps laying the floor deck and the ceiling.

- **Office:** beadboard wainscot and painted boards, cased round the door and
  both windows; a beaded ceiling; the desk (a prop) with a regulator clock
  over it; a pot-belly stove on its plate, its pipe through the ceiling and out
  of the roof; a green safe; wanted bills on the back wall; pigeonholes and a
  stool in the front alcove; a bench under the east window; a peg rail with a
  hat and a gun belt; the gun rack (a prop); a county map.
- **Cells:** two, down the west side under the exterior's barred windows
  (z −1.55 and 0.15), behind a bar front. Cell A's door stands open into the
  office and cell B's is padlocked. Each cell has a strap-iron bunk chained to
  the wall, a bucket and a whitewashed barred window. The key ring hangs by
  the open door.

The kit walls have no openings at the cell windows ("without new holes"), so
the panes inside are whitewashed glass: light, but no view.

### Traps this interior hit

- **The stone shell shows every gap in the finish.** See HARD_WON 3.9. The
  sheriff uses `finish_wall(..., exact=True)` and adds the head board the kit's
  casing lacks. `check:sheriff` raycasts every wall for bare kit.
- **The old cell bars collided with nothing.** They were 7 cm boxes with no
  colliders. The bar front, divider, street-end bars, open door leaf and bunks
  now all block, and the walker in `check:sheriff` proves it both ways.
- **A coat on a peg is a cone.** It became a gun belt.

## Checks

`npm run check:sheriff` guards the exterior envelope and apertures, plus:
- the ceiling matches the kit slab and the interior stays inside the shell;
- the cell windows sit under the exterior ones, one per cell, and the doors
  open onto the corridor, not a wall;
- the exterior stovepipe stands over the stove;
- floorboards and deck agree at four points, and the ceiling boards sit at
  2.62;
- no bare kit wall shows inside;
- a walker reaches the office and cell A through its open door, and is stopped
  at cell B's locked door, the bar front, the street-end bars and the desk.
