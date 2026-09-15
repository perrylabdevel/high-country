# Ranch house remodel

Authored through Blender MCP. `ranch-remodel.blend` has two authoring scenes. "Ranch Remodel" holds the exterior, with the kit shell as an alignment reference. "Ranch Interior" holds the interior. The older horse scene is still in the file.

## Exterior

- `remodel.py`: exterior geometry in metres, in the game's house-local coordinates.
- `../../src/models/ranch-remodel.json`: indexed geometry grouped into nine material batches. It is imported synchronously, so building construction and the headless checks use the same model.
- `../../public/models/buildings/ranch-remodel.glb`: a portable copy of the exterior detail, without the reference shell.

To regenerate, run `runpy.run_path` on the absolute path to `remodel.py`, then call `build()`. Reload the script in a later call and call `export()`. After a kit footprint or opening change, run `build_walls()`, `build_windows()` and `export()` instead. Objects tagged `ranch_context` are excluded from export.

The walls have 933 physical clapboards and battens. `walls-layout.json` records the eight exterior wall frames and their opening rectangles. `check:ranch-remodel` compares these with the current kit and ray-tests the exported siding and shutters.

## Interior

- `interior.py`: generated entirely from `interior-layout.json`, which holds every wall frame (partitions included), its openings, the storey heights and the stair.
  - Floorboards on both storeys.
  - Wall finishes per room: wainscot, paper or plaster, and baseboard, rail and crown, cut around every opening.
  - Door and window casings with jamb linings.
  - Board or plaster ceilings, with joists or boxed beams.
  - A 14-riser stair with balustrade, spandrel and closet, and a guard round the stairwell.
  - The parlor fireplace, the kitchen chimney face, stovepipe, dry sink and shelves.
  - Rugs, curtains, pictures, lamps, a bookcase and a rocking chair.
- `../../src/models/ranch-interior.json`: nine material batches with a per-vertex tint. `ranchInterior()` in `src/buildings/ranchRemodel.js` multiplies each batch's game material by the tint.
- Run: `ns = runpy.run_path('<abs>/interior.py'); ns['build'](); ns['export']()`.

The kit side lives in `src/buildings.js`.
- `RANCH_HOUSE` holds the storey heights and the stair.
- Walkable decks cover the floorboards (0.13 m), the stair ramp and the upstairs floor (2.8 m).
- Colliders are limited to each storey's height band. Partitions stack on both floors.
- `userData.storeys` on the main block lets `interiorCeilingAt(x, z, feetY)` duck the camera under the right ceiling.
- Furniture from the furniture kit is placed per room, with bedrooms upstairs.

`check:ranch-interior` verifies the interior.
- The terrain stays at least 1.5 cm under the boards. (Before this interior, the ranch pad z-fought the kit floor in every room.)
- Boards sit at the height the decks register, and treads match the stair ramp.
- Every room is closed overhead, and the camera ceiling matches the storey.
- Wall rays hit a finish rather than a bare kit wall, and no interior geometry obstructs an opening.
- A walker gets from the porch into every room on both floors and cannot step into the stairwell.

## Changing the kit

If the kit footprint, openings, partitions or `RANCH_HOUSE` change:

1. Run `npx tsx scripts/blender-ranch/export-layout.mjs`. It writes both layout files.
2. Rebuild the exterior walls and windows, then the interior, in Blender.
3. Run `check:ranch-remodel`, `check:ranch-interior`, `check:buildings` and `check:apertures`.

`capture-interior.mjs` takes WebGPU captures of each room from house-local poses. It needs a preview server on port 8765.
