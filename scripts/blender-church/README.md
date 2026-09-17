# Silver Creek church

Authored through the Blender MCP bridge in scene "High Country • Church", over
the kit's `church` lot in `src/landmarks.js`. Lot-local metres: x runs across
the gable ends, y is up from the lot floor, +z points toward the street. No
`.blend` is committed; the scripts are the source of truth.

`CHURCH` in `src/buildings/church.js` is the runtime contract: the apertures
the kit has to cut, the measured kit geometry the trim is applied to, and the
nave (ceiling, tie beams, pews, chancel).

## Files

- `church.py` builds the exterior: board-and-batten over a stone skirt, corner
  boards, a water table and frieze, arched lancets with hood moulds, a gabled
  entry hood and name board, shingle courses and rake boards on the roof, gable
  vents, and the steeple's dressing (corner boards, a louvered belfry with its
  bell, a bracketed cornice, a shingled spire and a cross).
- `interior.py` builds the nave on the shared kit (`scripts/blender-kit`).
- `export-layout.mjs` writes `layout.json`: the lot's world frame, the kit's
  real wall openings and the contract. Run it before the other two.
- `capture.mjs` takes WebGPU captures from lot-local poses at EYE 1.62.

## Running

    ns = runpy.run_path('<repo>/scripts/blender-church/church.py')
    ns['build'](); ns['export']()
    ns = runpy.run_path('<repo>/scripts/blender-church/interior.py')
    ns['build'](); ns['export']()

## What the shell gives you, and where it is

Measured on the built lot, not guessed: the exterior wall faces stand at 4.11,
the interior shell's inner face at 3.78, the roof overhangs to 4.45 with its
ridge at 9.42 over z = 0 — the ridge runs along x, so **the gable ends face
+/-x and the street wall is an eave side** — and the kit steeple is a 1.4 m
tower on (4.00, 0) from 7.20 to 11.70 with a four-sided spire to 13.90.
Applied trim goes on the OUTER face of the kit part it dresses.

The nave had no window at all: one door in a 7.2 m wall. The authored elevation
brings its apertures with it (two lancets flanking the door, one behind the
altar), and the lot takes `storeys` so this building lays its own floor deck
and a 3.2 m ceiling instead of the kit's 2.7 m cap.

## Traps this building hit

- **A reversed bound is a silent delete.** `box()` mirrors everything through
  `sx`/`sz`, and a pair that arrived reversed used to be dropped without an
  error: the entire west face of the steeple, boarding and louvers alike, was
  missing from the first build. `box()` now sorts its own bounds.
- **A round opening needs a round cut.** The cladding was cut to a rectangle
  over each arched head, leaving the shell bare in the corners beside every
  lancet — outside and, in the same shape, inside. Both sides now cut in
  columns that follow the arch (`hole_top`, `arch_holes`), and the interior
  cut takes the LOWEST arch height across each column, not the highest, or the
  plaster stops short of the lining.
- **The plinth ran straight across the doorway.** It covered the bottom 0.55 m
  of a 2.1 m opening and `check:occlusion` measured the door 75% clear. The
  skirt, the stone courses and the water table are all cut round anything that
  reaches the floor; casings stand 4 cm clear of the kit jamb, because a
  doorway has to be 100% clear and the edge rays clip a casing on the jamb line.
- **Coloured glass only where the kit has no opening.** An authored pane over
  a light the kit already glazes is a blocked window to `check:occlusion`; it
  allows muntins and nothing more. So the real lancets get sash bars, and the
  colour goes in the arched heads and the blind side lights.
- **A window can be too tall for its own ceiling.** At the first pass the
  lancet heads and the cross over the altar sat above the 3.2 m ceiling, drawn
  where the nave cannot see them. The chancel light stops at 2.65 and the side
  lights at 2.40.
- **Gain alone cannot whitewash a brown texture.** A near-white tint over the
  siding texture still multiplies down to weathered plank: the church read as a
  barn with a steeple on it. The painted batches now use the interiors' method,
  keeping the texture as grain over a near-white base.

## Checks and captures

`npm run check:church` guards the fit offline: the footprint and apertures
against the contract, the envelope (the sheriff once shipped a facade that was
right in Blender and upside-down in the game), both shells carrying the door
and its lancets, the 3.2 m ceiling and the tie beams under it, boards and deck
agreeing, no bare kit wall anywhere inside, the pews clear of the aisle, rail
and walls, and a walker that goes down the aisle and through the open gate but
is stopped by the rail either side of it, the altar, the pulpit and the pews.

    node scripts/blender-church/capture.mjs audit/church/current [pose...]
