# Silver Creek hotel

Authored through the Blender MCP bridge in scene "High Country • Hotel", over
the kit's `hotel` lot in `src/landmarks.js`. The model is in lot-local metres:
x runs across the facade, y is up from the lot floor, and +z points toward the
street. No `.blend` is committed; `hotel.py` is the reproducible source of
truth.

`HOTEL` in `src/buildings/hotel.js` is the runtime contract: the apertures the
kit has to cut, the gallery posts and the furniture standing under them.

## Why the gallery

The hotel is the largest mass on the row — 812 m³, topping out at 10.67 m,
against 533 for the saloon — and its front wall shipped with nothing in it but
a door. An 11 × 8.2 m blank board, the most conspicuous empty elevation in the
town. Decorating that wall would not have fixed it; the answer is the form the
row was missing, a full-width two-storey gallery, which puts real structure,
shadow and depth in front of it. The six windows are new apertures that come
with the elevation, not trim over holes that already existed.

## Two storeys

The hotel is now a two-storey building with an authored interior to the
saloon's depth. The **storey section is the saloon's**: floor 0.10, lobby
ceiling 3.20, upper floor 3.44 on 0.24 m of structure, upper ceiling 6.60, and
18 risers of 185.6 mm — the saloon's exact rise. The upper floor is flush with
the gallery deck, so the gallery door is a level threshold.

- **Ground:** the lobby and parlour. Floorboards, beadboard wainscot, sage
  striped paper, picture rail and crown, every opening cased; a beaded ceiling
  open over the stairwell; the stair up the west wall with an open stringer,
  turned balusters and a panelled spandrel closet; the reception desk with its
  pigeonhole key rack and bell; the parlour hearth, long table and cupboard.
- **Upper:** a hall along the front, onto the gallery through its door; three
  guest rooms behind board partitions with cased doorways, doors folded open
  and brass number plates; curtains at every window; one back window per room.
- **Gallery:** walkable, reached from the hall, with a rail.

`HOTEL` in `src/buildings/hotel.js` is the single contract. `export-layout.mjs`
snapshots it with every kit wall frame and opening into `layout.json`, and both
`hotel.py` and `interior.py` read that — so the authored work cannot disagree
with the apertures the kit actually cuts. **Run order:** `export-layout.mjs`,
then `hotel.py` `build()`/`export()`, then `interior.py` `build()`/`export()`.
`interior.py` reuses `hotel.py`'s helpers and shares its scene under its own
tag. It deliberately does *not* import the saloon's `interior.py`, whose
helpers close over the saloon's own dimensions and `layout.json`.

## Files

- `hotel.py` builds the exterior: the clapboard elevation with its sash
  windows, fanlight entry and bracketed eave cornice; the two-storey gallery
  (deck on joists, name board fascia, posts with sawn brackets, balustrade,
  standing-seam shed roof, benches and a trunk); the roofscape (ridge cap, two
  brick stacks, two dormers); and the gable-end returns with verge boards and
  a louvred vent.
- `export-layout.mjs` writes `layout.json` — the lot's world frame, which the
  street builder decides, not this script. `capture.mjs` hangs lot-local poses
  off it.
- `src/models/hotel.json` is the synchronous runtime asset;
  `public/models/buildings/hotel.glb` is a portable copy.

## Running

    ns = runpy.run_path('<repo>/scripts/blender-hotel/hotel.py')
    ns['build'](); ns['preview'](); ns['export']()

Every entry point resolves `bpy.data.scenes[SCENE]` itself instead of trusting
`bpy.context.scene`, so this can run while another authoring script owns the
window's active scene.

## The kit is not where you think it is

This lot takes a **gable, not a false front**, and `gableRoof` picks its ridge
axis with `w >= d`: 11 ≥ 9, so the ridge runs *parallel to the facade* at z = 0
and the street sees a roof plane sloping up and away — the gable triangles are
on the **side** walls. Everything below was measured off the built lot rather
than assumed:

| kit part | extent |
| --- | --- |
| front wall outer face | z 4.61 |
| roof overhang | z ±4.95, \|x\| ±5.95 |
| ridge | y 10.675 at z 0 |
| front roof plane | y = 10.675 − 0.5·z |
| eave soffit | closes wall→overhang at y 8.2 |
| foundation | z ±4.70, \|x\| ±5.70, below y 0 only |

Trim drawn past any of those is inside solid kit geometry and does not render.
The store lost a whole pass to exactly this, so `preview()` proxies the shell,
the gable roof with both slopes and triangles, the eave soffit and the
foundation, to scale — without them Blender happily renders trim the game
hides. `roof_y(z)` is what keeps the dormers on the roof plane; a first pass
put them at `dz = 2.55`, where the dormer peak reached 11.14 against a ridge of
10.675 and the pair read as cupolas straddling the ridge.

`preview()` also multiplies the per-face `Col` attribute into each material,
because the runtime multiplies the batch texture by that tint and `hotel.py`
puts the *entire* paint scheme in the tints.

**The material sets the hue ceiling.** Painted joinery lives on the `paint`
batch, never `wood`: `wood` carries a strongly brown texture, so cream on it
can only come out brown. The first in-game pass had all 23 painted members —
posts, rails, balusters, casings, cornice, verge boards — on `wood`, and the
whole gallery read as bare timber instead of paint. `wood` now keeps only
genuinely bare timber: deck boards, joists, battens, benches, the trunk.

## More traps this building hit

- **Siding across the openings.** `hotel.py` once hard-coded its window
  positions and drew clapboard in full-width courses straight across every
  opening, plus a solid door slab and an authored pane in each window. Measured
  with a ray test the entrance and all six windows were **0% clear**: the door
  rendered shut and a window seen from inside looked onto the back of a board.
  Siding is now the wall *minus* its openings, split at every sill and head so
  no sliver enters a hole; casings are frames, not slabs; and no authored pane
  is drawn, because the kit already glazes each opening with two half-density
  panes. `check:occlusion` guards this for every building.
- **The ceiling invariant.** A first pass tied the upper floor to a 3.72 m
  deck, putting the lobby ceiling at 3.46 and breaking `check:buildings`'
  habitable-ceiling rule (2.3–3.2). The design moved to conform — the rule did
  not move to fit it (`HARD_WON` 3.6).
- **A door leaf across its own opening.** The gallery door's leaf was first
  folded flat against the wall, straight across the doorway (0% clear). It now
  swings 90° into the hall, beside the opening — the only position that also
  keeps clear of the neighbouring window.
- **Rooms lit only by the hall.** The upper front windows open onto the hall,
  so without the back row every guest room would be a dark box.
- **A cold ceiling.** A downward-facing ceiling catches little direct light, so
  a neutral cream read cold grey in every capture. Its tint is deliberately
  warmer than it looks like it should be.

## Checks and captures

`npm run check:hotel` guards the fit offline.
- Footprint and all six apertures still match `HOTEL`, every sill clears the
  kit's 0.5 m glazing threshold, and no window runs into a corner board or the
  eave.
- All six material batches render, and the export is not inverted in Y or Z
  (the sheriff shipped a facade that was correct in Blender and upside-down in
  the game): the chimneys must clear the ridge without becoming a tower, and
  the gallery must reach the boardwalk without overshooting into the street.
- The side treatment reaches the gable ends without spilling toward the
  neighbours, which sit on 14 m centres.
- Both shells carry the door plus six matching windows.
- The doorway is walkable and the windows are not; the gallery posts and
  furniture are solid at knee height; there is still a gap between the posts
  to reach the door; and nothing is collidable above the deck, because the
  upper gallery is deliberately **not** walkable — no stair reaches it, so a
  collider there would only be a surface to clip onto. The saloon balcony is
  walkable precisely because its interior stair leads there.

`check:hotel` also guards the interior, mirroring `check:saloon`: boards
where the decks say the floor is on both storeys (probing the boards, not the
rugs lying on them); every tread on the stair ramp; ceilings closed and the
camera's storey ceilings right, including over the stairwell; and a **walker**
that goes from the street into the lobby, climbs all 18 risers to the hall,
enters all three rooms and walks out onto the gallery — and cannot get under
the stair, through a partition, into the stairwell, or off the gallery.
Fault-injected: removing the gallery rail lets the walker fall off; sealing a
room's doorway makes it unreachable.

`capture.mjs` takes WebGPU captures from lot-local poses at the project's
`EYE = 1.62` (`HARD_WON` 5) — the street, back and gallery, the lobby, desk and
stair, the hall and a room. It needs `npm run build` and a preview on :8765:

    node scripts/blender-hotel/capture.mjs audit/hotel/current [pose...]

Note that lot-local z is measured from the lot **centre**, so the front wall is
at z 4.5 and the far row of buildings starts around z 20; a first pass put the
street camera at z 22 and rendered the inside of the building opposite. There
is no lens control — `__captureView` in `src/main.js` honours only
`px/py/pz/tx/ty/tz` — so the poses frame the building by staying inside the
street width at the default field of view.
