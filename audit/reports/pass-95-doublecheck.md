# pass-95 — variance measurement (NO code change)

Not an experiment: this pass exists to measure the grader/noise floor. The
tree is byte-identical to pass-94's (HEAD a492a5a); nothing was shipped,
reverted, or edited between the two passes.

**This is the first pass where captures are reproducible** (seeded atlases,
88c57e7): the re-capture is pixel-near-identical to pass-94's — mean
whole-frame diff 0.017/255, no frame above 0.5 (residual = wind phase).
Any score difference between pass-94 and pass-95 is therefore grader
variance plus wind-phase pixels, not change.

Raw pass: 99 fails / 297 scored. All failing rows blind re-scored (28/32
frames had fails): moved rows below; again no 3/4 boundary crossings.

Double-checked result: **99 fails / 297 scored** vs pass-94's 94/294 on the
identical tree — a +5 no-change swing. Observed no-change per-criterion
deltas (p94 -> p95): U3 -4, U6 +3, U1 +3, U4 +2, G1 +2, U2 +1, E1 -2,
everything else ±1. Across the three same-prompt passes G1 has read
14 -> 9 -> 14 -> 16 and U6 10 -> 6 -> 8 -> 11 with at most grass-tone
changes in between.

**The threshold this establishes** (written into docs/VISUAL_STATUS.md):
a total-fails move of <=5 or any single-criterion move of <=4 is NOT
interpretable as change. G1 and U6 specifically swing +-3-5 on their own.

Re-scored rows that moved:
- badlands-golden.png U2: 3 -> 2
- badlands-golden.png U5: 3 -> 2
- badlands-golden.png D2: 2 -> 3
- burn-midday.png G1: 3 -> 2
- elPaso-midday.png G1: 3 -> 2
- ironValley-golden.png I2: 3 -> 2
- ironValley-midday.png U1: 3 -> 2
- ironValley-midday.png I1: 0 -> 1
- lakeMercy-golden.png U6: 3 -> 1
- mission-midday.png M2: 3 -> 2
- northernPines-golden.png P3: 3 -> 2
- overlook-golden.png U2: 3 -> 2
- overlook-golden.png U5: 3 -> 2
- overlook-midday.png U5: 3 -> 2
- silverCreek-golden.png U1: 0 -> 1
- tribal-midday.png N1: 3 -> 2
- westernRange-golden.png U2: 3 -> 2
- westernRange-golden.png U3: 3 -> 2
- westernRange-golden.png U6: 3 -> 2
- westernRange-midday.png U2: 3 -> 2
- westernRange-midday.png U5: 3 -> 2
- westernRange-midday.png U6: 3 -> 2
