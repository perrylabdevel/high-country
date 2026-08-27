# pass-93 double-check (blind re-score)

Full 32-frame pass on the current tree — the re-baseline cycle (no code
change; the tree adds grass terrain tiling 10->6, seeded procedural painters,
blade atlas 1024->2048, __hideGrass toggle since pass-92's tree). Graded with
the pinned grader (gpt-5.6-luna via codex-vision) and the pass-92 prompt,
which is now the pinned prompt: the prompt is part of the grader
(HARD_WON 3.4) and pass-93 is comparable only to passes graded with the same
wording (pass-92: 116/297; same-tree before-reads: 93/277).

**Reproducibility note (recorded before interpreting the count):** the grass,
sage and broadleaf atlases were repainted with unseeded Math.random() on every
page load before 88c57e7, so pass-91/92 captures were never reproducible.
They are seeded now. pass-93 therefore differs from pass-91/92 because the
frames are now deterministic — that is not a regression and not an
improvement; it is a measurement-conditions change.

Raw pass: 90 fails / 296 scored (pass-93.md). All 90 failing rows re-scored
by a fresh blind Luna pass (28/32 frames had fails; /tmp/cycleA-dc):
64 unchanged, 24 moved down 1, 2 moved up 1, NONE crossed the 3/4 boundary.

Double-checked result: **90 fails / 296 scored** — the new baseline.

Re-scored rows that moved:
- badlands-golden.png U5: 3 -> 2 — Terrain is dominated by noisy, repetitive mottling with little readable surface structure;
- badlands-golden.png D2: 3 -> 2 — The scene feels visually flat and washed out: pale sky, weak shadows, and low-contrast ter
- burn-midday.png U2: 3 -> 2 — Scattered black blocks, poles, and debris dominate the clearing and look unfinished.
- burn-midday.png U3: 3 -> 2 — Terrain is highly repetitive and visually noisy, with patchy textures and sparse vegetatio
- burn-midday.png U4: 2 -> 1 — Several objects appear incorrectly placed or floating, including block structures and pole
- burn-midday.png U5: 3 -> 2 — Smoke is faint and poorly integrated, while the scene lacks clear fire/burn detail.
- ironValley-golden.png U2: 3 -> 2 — The central structure and path are identifiable, but the composition is cluttered by debug
- ironValley-golden.png U5: 3 -> 2 — Debug overlays remain on screen, and the scene shows obvious placeholder-quality assets an
- ironValley-midday.png I1: 3 -> 2 — The environment lacks visual cohesion: the road, shelter, playground-like structure, rocks
- lakeMercy-golden.png U4: 3 -> 2 — Shoreline vegetation is sparse and repetitive, while the low-poly rocks and trees lack vis
- lakeMercy-midday.png U6: 3 -> 2 — Visible debug HUD text and the large performance graph intrude on the image, while the low
- mission-midday.png U2: 3 -> 2 — Large opaque gray wall obscures the building and dominates the center of the frame.
- mission-midday.png U6: 3 -> 2 — Debug text/FPS overlays and visibly unfinished low-poly assets reduce presentation polish.
- northernPines-midday.png P3: 2 -> 3 — Terrain and foliage appear visibly low-detail, with repetitive ground texture and sparse, 
- northernPines-midday.png P4: 3 -> 2 — Tree models and placement look highly repetitive and billboard-like, with harsh dark outli
- overlook-golden.png U6: 3 -> 2 — Visible debug overlays in the upper-left and top edge detract from presentation polish.
- silverCreek-golden.png U1: 0 -> 1 — Large foreground wall and empty dirt expanse dominate the frame, obscuring the settlement 
- silverCreek-midday.png U2: 3 -> 2 — Buildings are poorly differentiated, with repetitive box-like forms and minimal readable d
- silverCreek-midday.png U5: 3 -> 2 — Strong contrast between nearly black facades and washed-out ground reduces visual clarity.
- tribal-golden.png U2: 3 -> 2 — Visible low-poly placeholder geometry, highly noisy ground textures, and debug text/graph 
- westernRange-golden.png U1: 3 -> 2 — The scene is extremely flat and empty, with little readable environmental structure.
- westernRange-golden.png U5: 3 -> 2 — Debug overlays are prominently visible and distract from the game presentation.
- westernRange-golden.png W1: 3 -> 2 — The landscape lacks convincing western-range composition, depth, and landmark variety.
- westernRange-midday.png U1: 3 -> 2 — The scene feels visually unfinished: terrain is extremely flat and repetitive, with sparse
- westernRange-midday.png U5: 3 -> 2 — The landscape has limited variation, with repetitive ground detail and very few environmen
- westernRange-midday.png W1: 3 -> 2 — The world appears empty and placeholder-like, with a broad barren field, minimal vegetatio
