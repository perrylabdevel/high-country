# Anchors — named frames instead of typed coordinates

**Status:** implemented (core) — `src/buildings/anchors.js`, locked by
`npm run check:anchors`. The design rationale below is preserved.
**Motivation:** nearly every defect in this project has been spatial, and they
share one shape — position was tracked and orientation was lost.

---

## 1. Why

The recurring failures, in one list:

- Buildings positioned by rotating their *coordinates* but never rotating the
  *object*.
- `streetFace()` in `interiors.js` snapping street direction to the nearest
  cardinal axis — an entire subsystem existing because street *direction* had
  nowhere to live.
- Interior props placed with "depth inward from the door" read as a raw local Z,
  putting the saloon bar and the jail cell out in the street.
- A billboard adding a camera-aligned offset on top of its own plane corners.
- Canopy cards spread over 2π, so half landed coplanar.
- A chimney 2.55 m from the hearth it serves, starting 1.8 m above the wall top.
- Porch posts carrying nothing.
- `THREE.LOD` measuring distance from its own origin.

None of these are hard problems. They are all the same problem: **the code is
the only representation of the world, and it is imperative.** To know whether
the door faces the street you must mentally execute a transform chain. Nothing
anywhere *states* the relationship, so nothing can check it.

Anchors make the relationship the thing you write down, and the coordinates a
derived consequence.

---

## 2. What an anchor is

**A frame, not a point.** A point says where; a frame says where *and which way
round*. Orientation is the half that keeps getting lost.

```js
// In its owner's LOCAL space.
{ name, position: Vec3, normal: Vec3, up: Vec3, required?: boolean }
```

**One convention, no exceptions:** mating two anchors makes them coincident with
**opposed** normals — plug into socket. Surface anchors (a wall top, a deck)
point *outward* from their surface, so stacking obeys the same rule.

The moment there is a second rule — "sometimes aligned, sometimes opposed" — the
reasoning step that keeps failing is back.

---

## 3. How much already exists

Phase 1 adds **no new inputs**. Every anchor below is derivable from numbers
`src/buildings/kit.js` already records.

| Anchor concept | Where it lives today |
|---|---|
| Local frame per structure | `structure()` sets `group.position` + `rotation.y` |
| Footprint extents | `userData.w`, `userData.d` |
| Seat on terrain | `footing()` → `userData.placementY`, `drop` |
| Wall-top plane | `userData.wallTop` |
| Roof base / top / plan | `userData.roofBase`, `roofTop`, `plan` |
| Openings along a wall | `wallX({ openings: [{ x, w, h, fromFloor }] })` |
| Piece typing | `tag(obj, role, extra)` |
| Node list for the graph | the `STRUCTURES` array |

---

## 4. The interface

Six functions and one lint.

```js
anchorsOf(obj)                    // Map<string, Anchor> — derived for kit pieces
defineAnchor(obj, name, frame)    // for hand-authored or imported pieces
face(obj, side, { along = 0 })    // "front"|"back"|"left"|"right" → Anchor,
                                  //   optionally slid along that face
mate(child, childAnchorName, parentAnchor, opts)
                                  // opts: { offset, yawJitter }
                                  // parents the child and sets its transform
worldAnchor(obj, name)            // → { position, normal } in world space
recordMate(child, childAnchorName, parent, parentAnchorName)
                                  // logs the mate in parent.userData.mates

unmatedRequired()                 // → [{ obj, anchor }] — required sockets with
                                  //   nothing attached
```

### Derived anchors per kit piece

```
structure(w, d, eave)
  face.front   (0, 0, +d/2)          normal +Z
  face.back    (0, 0, -d/2)          normal −Z
  face.right   (+w/2, 0, 0)          normal +X
  face.left    (−w/2, 0, 0)          normal −X
  footing      (0, 0, 0)             normal +Y
  wallTop      (0, eave, 0)          normal +Y      ← roofs mate here

gableRoof / hipRoof / shedRoof / flatRoof
  base         (0, roofBase, 0)      normal −Y
  ridge        (0, roofTop, 0)       normal +Y
  gableEnd.front / .back             normal ±X      ← steeples mate here

wallX / wallZ                        one anchor per entry in `openings`
  opening[i]   (o.x, o.fromFloor, 0) normal +Z      ← door leaves, glazing

porch(width, depth, eave)
  wallSide     (0, 0, 0)             normal −Z
  roofSocket   (0, eave, depth)      normal +Y      required: true
```

That last line converts "porch posts holding nothing" from a screenshot
judgement into a lint.

---

## 5. Worked example

`src/buildings.js` now ships the east porch anchored:

```js
mate(eastPorch, "wallSide", face(main, "right", { along: 2.575 - MCZ }));
```

Before, three things had to be right at once: the rotation sign, that `MW / 2`
named the right face, and that `2.575 - MCZ` converted house coordinates into
main-block local space.

No rotation to sign, no axis to choose, and the frame conversion disappears
because `along` is already expressed in the face's own frame.

---

## 6. What becomes checkable

The named assertions below are **not implemented** — they are the target shape.
`scripts/check-anchors.mjs` builds the same invariants from `mate()`,
`worldAnchor()` and `unmatedRequired()` directly:

```js
assertMated(porch, "roofSocket");                    // posts carry a roof
assertFacing(lot.structure, street.normalAt(lot));   // a dot product
assertMated(chimney, "base");                        // chimney meets its hearth
assertAbove(worldAnchor(chimney, "exit"),
            worldAnchor(roof, "ridge"), 0.6);
```

Compare with how the porch regression is caught today: `ranch-midday R3: 4 → 1`
— a capture run, a vision model, and three passes, to discover the porch fell
off.

### Recorded mates are a reviewable artifact

`recordMate()` records each attachment in the parent's `userData.mates`
(`{ socket, child, childAnchor }`). Two consequences:

- **Relationships are readable.** `porch.wallSide → house.face.front` can be
  checked at a glance; `post.position.set(px, 1.9, 9.2)` cannot.
- **Diffs become semantic.** A commit that accidentally detaches the porch shows
  as a changed edge, in the diff, at review time — not three audit passes later.

---

## 7. Irregularity: jitter the mate, not the coordinate

Anchors risk making a town look mechanical. Real settlements are ragged. Put the
noise in the mate:

```js
mate(shop, "face.front", lot.frontage, { yawJitter: 0.04 });
```

The relationship is preserved by construction while the look varies. Strictly
better than hand-typed offsets, where irregularity and correctness are the same
numbers and you cannot perturb one without risking the other.

---

## 8. Where anchors do not help

- **Visibility.** Whether the boardwalk reads from the street is a raycast, not
  a mate. See §9.
- **Perception.** Whether the town reads as an 1880s Western town is the vision
  loop's job and stays there.
- **Anchor soup.** Twelve anchors per piece relocates the complexity rather than
  removing it. Anchors only where things genuinely mate.
- **Mate bugs are still transform bugs.** The mitigation is that `mate()` is one
  function tested once, rather than thirty call sites each doing their own
  arithmetic.

---

## 9. The companion: analytic visibility

Anchors answer "is it attached correctly." They do not answer "can you see it."
The second question wants a different tool, and it is cheap:

- Render with a material writing **object IDs**, read the buffer back, and ask
  whether a subject's ID appears from a given camera pose. Deterministic, fast,
  no model in the loop.
- Silhouette coverage: render the subject alone versus in scene, compare pixel
  counts → occlusion as a number.
- **Orthographic plan and elevation renders.** A top-down ortho of Silver Creek
  is a plan drawing, and misalignment invisible in a 3/4 perspective is glaring
  in plan.

The five-commit boardwalk campaign — "strengthen", "more prominent",
"decisively readable", "solid raised platform" — was five attempts to answer a
question that an ID-buffer raycast answers with a number.

---

## 10. Migration, and why it is safe

1. **Derive anchors from existing `userData`.** Pure addition; nothing moves.
2. **Add `mate()` and the graph assertions** — done: `mate()` and
   `unmatedRequired()` ship, and `scripts/check-anchors.mjs` locks the
   relationships. Still nothing moves.
3. **Convert call sites one structure at a time**, asserting every object's
   world matrix is *identical* before and after.

Step 3 is what makes this tractable with agents: a refactor with an automatic
proof. Nobody is asked to preserve the layout carefully — it is asserted, and it
fails loudly on drift.

Rough size: ~120 lines for derived anchors across the eight piece types, ~40 for
`mate()`, ~60 for the lints. Mostly mechanical, all testable headlessly
with no renderer.

---

## 11. Prior art

Unreal's **sockets** on static and skeletal meshes are the closest analogue and
exist for exactly this reason — attach by name, not coordinate. CAD **mates**
(SolidWorks, Fusion) are the same idea with a solver behind them. Blender
**empties** are literally anchors, which is what makes §5 of
`docs/ASSET_PIPELINE.md` work. USD prim references are a cousin.

None of these were invented for elegance. They were invented because
coordinate-based assembly does not survive contact with a team — the same reason
it is not surviving contact with a pipeline of agents.
