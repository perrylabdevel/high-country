# Handoff: Building Geometry — Shapes, Sizes, Rotations, Roofs, Openings

**Audience:** the agent fixing structure geometry across High Country.
**Written against:** repo at `629c87d`.
**Scope:** the shape and placement of every built structure — footprints, wall
heights, roof form and orientation, door and window dimensions, foundations,
and the rotation of buildings to face the things they should face.
**Not in scope:** materials and texturing. See `docs/TERRAIN_MATERIALS_HANDOFF.md`,
and read §9 of this doc for the ordering between the two.

---

## 1. The yardstick

One world unit is one meter. This is not documented anywhere but it is
unambiguous: `EYE = 1.62` (`src/player.js:8`), walk speed 3.4 and sprint 6.2
(`src/player.js:115`), horse trot 7.6 and gallop 14.5 (`src/horse.js:55`). All
metric, all correct for a human and a horse.

Every dimension below is therefore in meters and can be checked against a real
building. Most current structures fail that check by a factor of ~2 in height,
and that single error is the root of the floating roofs, the windows above the
eaves, and the disconnected chimney.

Note the map scale disagrees: the world is 4000 × 5000 units billed as "8 × 10
miles at 500 units/mile," which would make a unit 3.2 m. The buildings and the
player agree with each other at 1 m/unit; the map legend is the outlier. Do not
"fix" building scale to match the map — fix the map legend later, or accept the
territory is ~4 × 5 km. Flag it, don't act on it.

---

## 2. Five systemic causes

Nearly every individual defect in §4 traces to one of these. Fix these first or
you will be fixing the same bug thirty times.

### 2.1 Buildings are never rotated

`street()` (`src/landmarks.js:44-96`) rotates building positions around the
street axis by yaw, then places every box axis-aligned to the world. The only
thing in the entire function that gets a rotation is the sign board
(`landmarks.js:94`). So Silver Creek's buildings are arranged along a street at
0.15 rad while each one faces due north.

The same is true of the ranch (`buildings.js` — `place()` sets position only),
the fort, the mines, the timber camp, and every outlying landmark. Rotation is
used elsewhere in the codebase — ore carts (`industry.js:37`), creek strips
(`landmarks.js:321`) — so this is an omission, not a limitation.

`interiors.js` reveals how deep the workaround goes: `streetFace()`
(`interiors.js:28-35`) snaps the street direction to the nearest cardinal axis
so the interior shell can be built on world axes. The entire interior system is
scaffolding around the fact that nothing rotates.

### 2.2 Colliders are axis-aligned only — this blocks 2.1

`addBoxCollider(x, z, halfX, halfZ)` stores `{minX, maxX, minZ, maxZ}`
(`collision.js:8-16`). There is no rotated-box collider. The moment you rotate a
building, its collision box stays square to the world and the player walks
through the corners of the wall and bumps into empty air outside it.

So the first code change in this task is collision, not geometry. Add an
oriented box:

```js
export function addOrientedBoxCollider(x, z, halfX, halfZ, yaw) { ... }
```

The resolve is cheap because `resolveCircleBox` already exists
(`collision.js:29-58`): rotate the player position into the box's local frame by
`-yaw`, run the existing AABB resolve, rotate the result back. ~15 lines.
`scripts/check-collision.mjs` guards it.

### 2.3 Every object is grounded from a single center sample

`boxAt` (`landmarks.js:10`, `interiors.js:16`) and `place`/`foundation`
(`buildings.js:34-44`) all set Y from `heightAt(x, z)` at the object's center
point only. The terrain grid is ~12.5 m per quad (§2.2 of the materials handoff),
so anything wider than one quad on sloping ground floats at one corner and sinks
at the other.

Current offenders by width: fort walls 28 m, dock 18 m, barn 16 m, stamp mill
14 m, ranch house 14 m, hotel 11 m.

Worse, in `interiors.js` each wall samples the ground at its own position, so
the four walls of one building sit at four different heights on a slope, with
gaps underneath.

The fix is a footing helper: sample all four corners, seat the structure at the
minimum, and extend a foundation skirt down to cover the gap at the low corner.

### 2.4 There is no roof primitive

Every roof in the project is one of two things:

- a flat slab — `boxAt(x, z, w + 0.6, 0.35, d + 0.6, roof, false, h)`
  (`landmarks.js:82`), used on all twelve town lots
- a cone with 4 or 7 radial segments — `ConeGeometry(11.4, 4.6, 4)` rotated 45°
  to fake a pyramid (`buildings.js:137`, `buildings.js:166`, `landmarks.js:34`)

There is no gable, no hip, no shed, no ridge, no rake, no eave detail anywhere.
A 4-sided cone is a square pyramid — put one on a rectangular building and the
overhang is wrong on two sides by construction (see 4.1 and 4.3 for the exact
numbers). A 7-sided cone as a church steeple is a heptagonal spike.

This is the "roofs rotated correctly" complaint. The roofs aren't mis-rotated so
much as they are the wrong solid. Build a real roof primitive — see §5.

### 2.5 Four files each reimplement the same helpers

`box()` in `buildings.js:6`, `boxAt()` in `landmarks.js:10`, `boxAt()` again in
`interiors.js:16`, `boxAt()` again in `industry.js:11`, plus `mat()` duplicated
in `landmarks.js`, `interiors.js`, `industry.js`. Four copies means a fix to
grounding or rotation has to be made four times and will be made in three.

Consolidate into `src/buildings/kit.js` (§5) and have all four import it.

---

## 3. Reference dimensions

Period-appropriate for 1880s American West, in meters. Use these as the defaults
in the kit; deviate deliberately, not accidentally.

| Element | Correct | Notes |
|---|---|---|
| Interior ceiling, common room | 2.4–2.7 | 2.9–3.0 for a fine parlor or hotel lobby |
| Exterior door leaf | 0.86 W × 2.03 H | rough opening ~0.92 × 2.10 |
| Interior door leaf | 0.76 W × 2.03 H | |
| Barn sliding door | 3.0–3.7 W × 3.5–4.3 H | the one place a big door is right |
| Double-hung window | 0.75–0.90 W × 1.4–1.6 H | sill 0.85–0.95 above floor, head ≤ 2.15 |
| Eave height, 1 story | 3.0–3.4 | |
| Eave height, 1.5 story | 4.2–4.9 | knee wall + loft |
| Eave height, 2 story | 5.8–6.4 | |
| Roof pitch, residential | 6:12 – 12:12 (26.6°–45°) | steeper in snow country; this is snow country |
| Roof pitch, commercial behind false front | 1:12 – 2:12 shed | hidden, drains to the rear |
| Eave overhang | 0.3–0.6 | never negative — see 4.3 |
| False front parapet | 1.2–2.4 above the eave | full facade width, at the facade plane |
| Porch depth | 2.4–3.0 | post 2.4–2.7 to the beam, rail 0.9 |
| Boardwalk | 1.8–2.4 wide, 0.15–0.45 above street | |
| Fence post | 1.2–1.4 above grade, 2.4–3.0 spacing | 3 rails at ~0.4 / 0.8 / 1.2 |
| Hitching rail | 1.0–1.1 | |
| Farm windmill | tower 9–12, rotor 2.4–3.7 dia, multi-vane | not a 4-blade Dutch mill |
| Water tank | 2–3 dia on 3–4 m legs | |
| Wagon | bed 2.7–3.4 L × 1.0–1.2 W; rear wheel 1.2–1.4 dia, front 0.9–1.1 | front smaller so it steers under the bed |
| Church steeple | at the gable end over the entry, 1.5–2× eave height | not centered on the ridge |
| Chimney | 0.9–1.2 square, top ≥ 0.6 above the ridge | continuous from the hearth |

---

## 4. Defect inventory

Verified by reading the numbers, not by eye. Each one is a discrete fix.

### 4.1 Ranch house — `src/buildings.js:46-160`

1. **1.90 m of open air between the walls and the roof.** Walls: `wallY 3.85`,
   `wallH 7.2` → top at 7.45. Roof: `ConeGeometry(11.4, 4.6, 4)` at
   `position.y 11.65` → base at 9.35. You can see daylight through the top of the
   house from outside.
2. **Walls are ~2× too tall.** 7.2 m to the eave on a single-story 14 × 11 m
   house with a ceiling at 3.45. Should be 4.2–4.9 for the 1.5-story it clearly
   wants to be. Fixing this is what closes the gap above.
3. **The upper windows float above the wall.** Panes at y 7.7, h 1.1 → spans
   7.15–8.25 against a wall top of 7.45. Roughly 70% of each upper window is in
   the gap, attached to nothing.
4. **The roof is a square pyramid on a rectangular plan.** Side = 11.4·√2 =
   16.12. Footprint 14 × 11 → overhang 1.06 m on X but 2.56 m on Z. Should be a
   gable running along the long axis with an even 0.45 overhang.
5. **The chimney is disconnected in both axes.** Chimney at z = -2.0, spans y
   9.25–14.45. The hearth it serves is at z = -4.55, top at 1.26. The chimney is
   2.55 m downrange of its own fireplace and starts 1.8 m above the wall top.
6. **The door cannot close.** Leaf is 1.5 m wide; the opening is `doorW = 1.7`.
   The leaf is also 2.5 m tall — a barn door on a house — and its bottom sits at
   0.30 against a floor top of 0.13, a 17 cm gap underneath. (The 90° rotation.y
   and the `-doorHalf` offset read as deliberate — a door standing open on its
   hinge. Keep the intent, fix the dimensions: leaf 0.86 × 2.03, hinge at the
   jamb, opening 0.92 × 2.10.)
7. **The porch posts hold up nothing.** Four 3.2 m posts at z 9.2, a rail, and no
   porch roof above them. Either add the shed roof or delete the posts.
8. **The floor is buried in its own foundation.** Slab spans groundY−0.03 to
   groundY+0.43; the floor top is at groundY+0.13. You stand on terrain 0.43 m
   below the top of the slab and see stone where the floorboards should be.
   Player grounding uses `heightAt`, never the floor.

### 4.2 Barn — `src/buildings.js:162-176`

1. **Negative overhang on the long side.** Roof side = 11·√2 = 15.56 against a
   16 m body. The eaves are inset 0.22 m — the walls stick out past the roof.
   Meanwhile the Z overhang is 1.78 m. Same square-pyramid-on-rectangle error.
2. **Body 16 × 12 × 9 m is defensible for a large barn; the 5 m pyramid on top
   is not.** A barn wants a gable or gambrel along its long axis with a hay door
   in the gable end.
3. **The 4.2 × 5.5 m door is oversized even for a barn** (3.0–3.7 × 3.5–4.3).

### 4.3 Silver Creek street — `src/landmarks.js:44-96`

1. **No building is rotated to the street** (2.1). Twelve lots, all facing north,
   arranged along a street at 0.15 rad.
2. **Every roof is a 0.35 m flat slab.** Flat/shed roofs behind false fronts are
   period-correct for commercial buildings, so this is half right — but there is
   no pitch, no drainage direction, and the church and hotel need real roofs.
3. **False fronts are inside the building.** `fx = x + toward * s * (d * 0.38)`
   (`landmarks.js:78`) places the parapet at 38% of depth from the center. It
   belongs at the facade plane, `d/2 + thickness/2`. Currently the parapet is
   buried 12% of the depth back into the roof.
4. **The steeple is centered on the church.** `coneAt(x, z, 1.6, 6.5, ...)` at
   the building center — a heptagonal spike growing out of the middle of the
   roof. It belongs over the entry at the gable end.
5. **Only sheriff and saloon are enterable; the other ten are solid blocks with
   no doors and no windows.** Fine as blockout, but they are the street the
   player spends the most time in front of.

### 4.4 Interiors — `src/interiors.js`

1. **Doorways are full wall height.** `DOOR_GAP = 1.7` is the width; nothing sets
   a head height and no lintel is built. The sheriff's door is a 1.7 × 4.4 m
   slot. The saloon's is worse. Every enterable building has a doorway more than
   twice the height of a door.
2. **No door leaf, jamb, casing, or threshold** — just a gap in the wall.
3. **Walls of one building sit at four different ground heights** (2.3), each
   sampling `heightAt` at its own center.
4. **The whole shell is cardinal-snapped** (2.1). Once buildings rotate, delete
   `streetFace()` and build the shell in the structure's local frame.
5. **Floor at `heightAt + 0.04` while the player stands at `heightAt`** — the
   player's feet are 4 cm inside the floor. Small, but it is the same class of
   bug as the ranch's 0.43 m and should be fixed by the same rule (player stands
   on the floor, not the terrain, once inside).

### 4.5 Outlying structures — `src/landmarks.js:160-245`

1. **Ranch gate crossbeam is lying on the ground.**
   `boxAt(x + 4, z, 9, 0.35, 0.35, dark, false)` with no yOff → y = ground +
   0.175. The two 5.5 m posts it should span are right there. One-line fix, very
   visible.
2. **Fire watch tower has no structure.** An 18 m single pole, 0.9 m diameter,
   with a 4.2 m cabin whose center is at the pole top (so the pole ends halfway
   up the cabin's interior). No legs, no bracing, no ladder, no railing. A fire
   lookout is a four-legged braced tower.
3. **Fort Grant's east wall is 14 m short.** West wall d = 24, east wall d = 10,
   both walls 28 m runs north and south. The gap is split at both ends rather
   than forming a gate. If it's meant to be a gate, center it and add posts.
4. **Mission bell tower is a centered cone**, same error as the church steeple.
   A campanario belongs on the facade.
5. **Dock ignores the water plane.** Grounded at `heightAt + 0.175` near Lake
   Mercy while the lake surface is `WATER = 13`. Lakeside structures must
   reference `WATER`, not terrain height, or they float above / drown below the
   surface.
6. **All four cattle face the same direction.** `body.rotation.z = Math.PI / 2`
   with no per-instance yaw. Same for the five cemetery headstones (identical,
   in a perfectly straight line at 2.2 m spacing) and the four tipis.
7. **Blacksmith roof is cantilevered off two posts on one side.** An 8 × 7 m
   roof at 3.6 m, posts only at z = +2.8. Needs four. Its collider covers only
   the anvil (1.2 × 1.0), so you walk through the posts.
8. **Timber camp, Iron Valley, and El Paso clusters are solid boxes** — no
   roofs, no doors, no rotation.

### 4.6 Props — `src/buildings.js:235-334`

1. **Fence has one rail at 1.05 m on 1.5 m posts.** Three rails at 0.4 / 0.8 /
   1.2 on 1.2–1.4 m posts. (The lookAt rail orientation at `buildings.js:258` is
   correct — leave it.)
2. **Wagon wheels are all the same size** (0.55 m radius, front and rear) and
   there is no axle. Front wheels should be smaller so they can turn under the
   bed.
3. **The windmill is Dutch.** Four 4.6 m blades → a 9.2 m rotor on an 11 m tower.
   An American farm windmill is a 2.4–3.7 m multi-vane fan with a tail vane.
   Different silhouette entirely, and this one is visible from a long way off.

---

## 5. The fix: a building kit

Create `src/buildings/kit.js`. Everything below is built in the structure's
local frame and added to a parent Group that carries `rotation.y = yaw`. That
single change is what makes rotation work everywhere at once.

```js
// All dimensions in meters. Local frame: +X right along the facade,
// +Z out through the front wall, origin at the center of the floor.
structure({
  x, z, yaw,              // world placement; yaw faces the front wall +Z
  w, d,                   // footprint
  eave,                   // wall height to the eave (see §3)
  roof: { type: 'gable' | 'hip' | 'shed' | 'flat', pitch, overhang, ridgeAxis },
  falseFront,             // { height } or null
  openings: [ ... ],      // doors and windows, positioned per wall
  foundation,             // { skirt: true } — see below
})
```

Pieces it needs:

- **`footing(x, z, w, d, yaw)`** — samples `heightAt` at all four rotated
  corners, returns `{ y: min, drop: max - min }`. Seat the structure at `y`; if
  `drop` is more than ~0.15, emit a foundation skirt down to `y - drop` on the
  low side. This replaces every single-point grounding call in the project (2.3).
- **`gableRoof(w, d, pitch, overhang)`** — two sloped planes plus two triangular
  gable ends, ridge along the long axis by default. This is the missing
  primitive (2.4). `hipRoof`, `shedRoof`, and `flatRoof` follow from the same
  builder. Invariant: the roof plan is always ≥ the footprint plus overhang on
  both axes. That makes 4.2 impossible to reintroduce.
- **`wallWithOpenings(length, height, thickness, openings)`** — emits wall
  segments around each opening plus a header above it. Doors and windows become
  data, and the doorway gets a head height for free, which is the fix for 4.4.
- **`doorLeaf({ width, height, hinge, swing })`** — leaf ≥ opening width, hinged
  at the jamb, bottom at the floor. Keeps the ranch's open-door look with correct
  dimensions.
- **`porch({ depth, postSpacing, roof })`** — posts, beam, deck, rail, and the
  shed roof, so posts can't be built holding nothing (4.1).
- **`collide(group)`** — walks the structure and emits `addOrientedBoxCollider`
  per wall in the local frame, so the collider is derived from the geometry
  rather than typed in beside it. This is what kills the whole class of
  collider/mesh mismatch (4.5, blacksmith).

Then port the call sites: `buildings.js`, `landmarks.js` (street, boxAt,
coneAt), `interiors.js`, `industry.js`, `shore.js`.

---

## 6. Machine-checkable invariants

"Roofs sit on walls" is exactly the kind of property that regresses silently
three commits later. The repo already runs headless geometry checks — nine
`scripts/check-*.mjs`, with `check-interiors.mjs` demonstrating how to stub
`document`/`canvas` so scene code loads under node. Add
`scripts/check-buildings.mjs` in the same style, and write it before the fixes
so it starts red.

Assert, for every structure:

1. **No gap under the roof** — roof base within `[wallTop − 0.30, wallTop +
   0.02]`. Catches 4.1's 1.90 m.
2. **Non-negative overhang** — roof plan ≥ footprint on both axes. Catches 4.2.
3. **Nothing floats** — every mesh's lowest point is either on the terrain, on a
   foundation, or attached to a parent whose bounding box contains it. Catches
   the ranch gate beam, the upper windows, the chimney.
4. **Door dimensions** — every doorway 0.85 ≤ W ≤ 1.1 and 1.95 ≤ H ≤ 2.20, with
   a declared barn/gate class exempted to 3.0–3.7 × 3.5–4.3. Catches 4.4's
   full-height slots and the ranch's 1.7 × 2.7.
5. **Door leaf ≥ opening width.** Catches 4.1's 1.5 m leaf in a 1.7 m hole.
6. **Ceiling height** — habitable interiors 2.3–3.2.
7. **Ground conformance** — for each structure, `max|heightAt(corner) −
   placementY| ≤ 0.35` unless it declares a foundation skirt. Catches the fort
   walls, dock, barn on slope.
8. **Floor above foundation** — floor top ≥ foundation top, and the player's
   standing height at the threshold is within 0.15 m of the floor. Catches 4.1's
   buried floor.
9. **Street alignment** — every lot on a street has `|yaw − streetYaw| < 0.05`.
   Catches 4.3 and prevents its return.
10. **Collider agreement** — each structure's collider footprint matches its wall
    footprint within 0.3 m. Catches the blacksmith.
11. **Window placement** — sill ≥ 0.8 above the interior floor, head ≤ eave.
12. **Water-adjacent structures reference `WATER`, not `heightAt`.** Catches the
    dock.

All nine existing checks must keep passing throughout — `check-collision.mjs`
and `check-interiors.mjs` in particular, since §2.2 and §4.4 change exactly what
they cover.

---

## 7. Milestones

Each ends with screenshots from three positions — eye level at 5 m, eye level at
40 m, and from a hill above — at midday. Roof errors are invisible from the
ground and obvious from above; the ranch house gap has survived this long because
nobody looked down at it.

1. **Kit + collision + failing check.** `addOrientedBoxCollider`,
   `src/buildings/kit.js` with `footing` and `gableRoof`,
   `scripts/check-buildings.mjs` written and red. Nothing visual changes yet.
2. **Ranch.** House, barn, bunkhouse, blacksmith, windmill, gate, fences, wagon.
   The player spawns here and spends the most time here; it is also where the
   worst defects are (4.1, 4.2, 4.6).
3. **Silver Creek.** Street rotation, false fronts at the facade plane, real
   roofs on the church and hotel, boardwalk. Then `interiors.js` rebuilt in the
   local frame with proper doorways — delete `streetFace()`.
4. **Outlying landmarks.** Fort, fire tower, mission, mines, timber camp, dock,
   El Paso, tribal camp.
5. **Props and scatter.** Fence rails, wagon wheels, cattle/headstone/tipi yaw
   jitter, hay, troughs.
6. **Green check.** All twelve invariants passing, all nine existing checks
   passing.

---

## 8. Anti-patterns

- Cones with `radialSegments: 4` standing in for pyramid roofs
- A roof solid whose plan is narrower than the building it sits on
- Grounding anything wider than 12 m from a single `heightAt` sample
- Positioning a building by rotating its coordinates but not its mesh
- A doorway with no head height
- A door leaf narrower than its opening
- Posts that support nothing, and roofs supported by posts on one side only
- Hardcoding a collider's half-extents next to the mesh instead of deriving them
- A fifth private copy of `boxAt`
- Steeples, bell towers, and cupolas centered on the ridge instead of over the
  entry
- Lakeside geometry grounded to terrain instead of `WATER`

---

## 9. Sequencing against the materials work

Both this document and `docs/TERRAIN_MATERIALS_HANDOFF.md` rewrite the same
files. Do not run them in parallel.

Do this one first, in the current vanilla-JS stack. It is pure geometry — it
needs no TSL, no WebGPU, no npm, and it does not benefit from the migration.
Texturing buildings that are about to have their walls, roofs, and openings
rebuilt is wasted work, and a gable roof needs UVs that a square pyramid doesn't
have.

Order: building geometry (this doc) → materials Milestone 0 (toolchain
migration) → materials Milestones 1–8.

The one thing to carry across: when you rebuild roofs and walls as real
primitives, generate sensible UVs as you go. The materials pass will assume they
exist.
