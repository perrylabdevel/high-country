# Vision Audit Loop

A three-part setup for grading how High Country actually looks, rather than
whether it compiles:

1. **Capture** — `scripts/capture-poi.mjs` renders every point of interest at two
   sun angles and writes stable filenames.
2. **Implementer agent** — does the work, and hands every visual judgement to one
   pinned vision model.
3. **Auditor agent** — grades each screenshot against the rubric in §5 and keeps
   the loop running until the bar in §6 is met.

---

## 0. What this document cannot do for you

**None of this is self-applying.** A markdown file cannot select a model. Read
this section before pasting any prompt below, because two of them contain
instructions an agent physically cannot carry out.

**You must do by hand, in Cursor's UI, before starting:**

1. **Set the model on each agent.** Open the model selector, turn **Auto off**,
   choose the pinned model explicitly. Do this separately for the implementer
   agent and the auditor agent — a model set on the foreground chat does not
   apply to a background agent.
2. **Re-check it after every Cursor update** and any time you start a fresh
   agent. Auto is the default and it will silently come back.
3. **Decide the delegation mechanism** (below). This is the part with no good
   automatic answer.

**The delegation problem.** §4's implementer prompt says every visual judgement
goes to the pinned vision model. On a Cursor subscription an agent has exactly
one model — its own — and no tool for calling a different one. Cursor Gemini is
a chat model on the subscription; it is not `GEMINI_API_KEY` and cannot be
reached from a Node script. So "delegate to the vision model" is not something
the implementer can do unaided. Two ways to close that:

- **Default: two Cursor chats, you route between them.** Implementer does code
  on its own model. After capture, you open a **separate** Gemini 2.5 Flash
  chat (Auto off) and **@-attach the PNGs** so the model gets pixels — a
  Cursor Agent that only sees file paths will claim it cannot view images and
  must be stopped, not allowed to fill 3s. That chat fills
  `audit/reports/inbox.json`. Then `npm run grade -- --compile audit/reports/inbox.json`
  writes the pass report. Subscription Gemini is used; no Google API key.
- **Optional paid API — `npm run grade` with no flags.** Hits
  `generativelanguage.googleapis.com` with `GEMINI_API_KEY`. That is Google's
  Gemini product, not Cursor's. Use it only if you deliberately want extra API
  spend. See §8.

**What is genuinely self-applying** — the parts encoded as runnable commands:
`npm run capture`, `npm run build`, `npm run check`, `npm run check:buildings`,
`npm run grade:cursor`, `npm run grade -- --compile …`. Prefer moving policy
into that column whenever you can. Prose in a repo is a request; a script that
exits non-zero is a rule.

---

## 1. Which vision model

**Use Gemini 2.5 Flash, and pin it.**

Reasoning, in the order that matters here:

- **Consistency beats peak quality for grading.** A grade is only useful compared
  to the previous grade. If the model rotates — or if you leave Cursor on Auto —
  "canopy density: 3/5" this run and "4/5" next run tells you nothing about the
  code, because the grader changed underneath you. Pin one model for the whole
  campaign and only change it deliberately, recording the switch in the report.
- **Cost.** You will run 32 images per pass, many passes. Flash-tier pricing is
  roughly an order of magnitude below the frontier models and the task —
  "compare this render to written criteria and score it" — does not need
  frontier reasoning.
- **Throughput.** High rate limits matter when a single audit pass is 32 image
  calls.

Alternates, if Flash is unavailable or you dislike its output: **GPT-5-mini** or
**Claude Haiku 4.5**. Both are cheap with solid image understanding. Do not mix
them into one campaign.

Verify the exact name in Cursor's model picker before you start — the roster
changes, and this doc was written against a May 2026 knowledge cutoff. In Cursor:
open the chat model selector, turn **Auto off**, and select the model explicitly.
For the background/auditor agent, set the model on that agent's own config, not
just the foreground chat.

**On model tiers, stated precisely.** "Reasoning model" is the wrong axis —
essentially every current frontier model does extended thinking, and it is a
knob rather than a model class. The axis that matters is task shape:

- **Per-image scoring against a fixed rubric** is high-volume and shallow, and
  consistency matters more than insight. That is the cheap pinned model's job,
  and paying frontier cost per image for it buys you nothing.
- **"Every criterion passes and it still looks wrong"** is low-volume and deep.
  A rubric cannot ask that question about itself. That needs the expensive
  model, and it needs it rarely.

So run a **second tier**: every fifth pass, and any time the auditor reports two
consecutive passes with no score change, hand the frontier model the six
lowest-scoring images plus the current rubric and ask:

```
These are the weakest frames in the current build. Two questions:
1. What is wrong with them that the rubric in docs/VISION_AUDIT.md §5 does not
   currently ask about?
2. Is any criterion being scored as passing while the underlying defect is
   still present — that is, is the criterion measuring the wrong thing?
Propose specific new or amended criteria. Do not re-score anything.
```

Its output amends §5; it never produces scores, so the score series stays
comparable. Budget one of these per five passes and the cost stays negligible.

This tier exists because the defects found in this project so far were caught by
reasoning about code and geometry — a canopy LOD measuring distance from the
wrong origin, a billboard adding a camera offset on top of its own plane
corners, a 1.90 m gap between a roof and its walls. A cheap grader looking at
those frames would plausibly have scored them 4/5 and moved on. Rubric scoring
catches regressions; it does not discover what you forgot to ask.

---

## 2. Capture

```sh
npm ci
npm run build
npm run preview &                        # serves dist on 127.0.0.1:8765
node scripts/capture-poi.mjs http://127.0.0.1:8765 audit/current
```

16 points of interest × 2 sun angles = **32 screenshots**, written as
`audit/current/<poi>-<midday|golden>.png`.

Filenames are stable by design: the auditor diffs run *n* against run *n−1* by
opening the same path, and a changed image at the same path is the unit of
progress.

Keep each pass:

```sh
mv audit/current audit/pass-03
```

The script needs `?dev` for the capture hooks it drives (`window.__captureView`,
`__captureMode`, `__POS`, `__heightAt`) and captures the production WebGPU backend
by default. It writes `capture-manifest.json` alongside the 32 images; `npm run
grade` rejects a set without a complete manifest and filename inventory. Use
`CAPTURE_BACKEND=webgl` only with a disposable output directory for backend
diagnosis — WebGL2 captures are not valid normal audit inputs.

The camera is scripted rather than warped — warping drops the player inside the
POI and frames a wall. Each POI's distance, height and heading live in the POIS
table at the top of the script; adjust them there if a frame doesn't read.

**Known caveat — WebGL water is diagnostic-only.** Lake Mercy rendered as a
solid black void in the historical WebGL2 capture. It is the only water surface
built with `depthSource: "buffer"` (`landmarks.js`), so it alone samples
`viewportDepthTexture`; all non-dry water also samples `viewportSharedTexture`.
The canonical capture path is WebGPU. Compare the lake there and in a disposable
`CAPTURE_BACKEND=webgl` capture before changing water math; if it is black on
WebGPU too, treat it as a production defect before grading water criteria.

---

## 3. The reference half — read this before you start

You asked for "how they should look" alongside "as they are." **I could not
produce that half.** This sandbox's network policy blocks every external host —
ambientCG, Poly Haven, and Wikimedia all fail to connect — so I could neither
download CC0 reference photography nor fabricate target renders honestly. A
made-up "target screenshot" would be a drawing of an opinion, and grading against
it would launder that opinion into a number.

So the rubric in §5 is written as **measurable text criteria** instead. That is
the more useful artifact anyway: a vision model grades reliably against "the
canopy silhouette is conical and wider at the base than at the top" and
unreliably against "does it look like this picture."

If you want the image half, the Cursor agent **has** network access. Give it this
task first:

```
Populate audit/reference/ with 2-3 CC0 or public-domain reference photographs per
point of interest — 1880s American West: ranch houses, false-front main streets,
ponderosa/lodgepole stands, gravel roads, prairie rivers, adobe missions, timber
frame forts. Wikimedia Commons and the Library of Congress collections are good
sources. Name them <poi>-ref-1.jpg. Record the source URL and licence for each in
audit/reference/SOURCES.md. Do not use anything without a clear licence.
```

Once that folder exists, add to every grading prompt: *"Reference photographs for
this POI are in audit/reference/<poi>-ref-*.jpg. Use them to calibrate what the
criteria mean, not as a pixel target — the game is semi-realistic, not
photographic."*

---

## 4. Prompt: the implementer agent

Paste as the agent's system/task prompt. It multitasks across the backlog and
does not grade its own screenshots.

```
You are the implementer on High Country, a three.js WebGPU/TSL browser game.

Read these first and treat them as the specification:
  docs/TERRAIN_MATERIALS_HANDOFF.md
  docs/BUILDING_GEOMETRY_HANDOFF.md
  docs/VISION_AUDIT.md
  audit/reports/latest.md   (the auditor's most recent grades, if present)

YOUR MODEL POLICY — read §0 first; the human sets your model, you cannot:
- Do all code work on your own model.
- For ANY visual judgement — "does this look right", "is the canopy dense
  enough", "did that change help" — the judgement must come from a separate
  Cursor agent pinned to Gemini 2.5 Flash looking at the actual screenshot,
  never from your reasoning about the code you just wrote. An agent that
  grades its own render confirms what it meant to build.
- Do NOT run `npm run grade` with no flags. That calls Google's paid Gemini
  API (GEMINI_API_KEY). Cursor subscription Gemini cannot be reached from
  that script.
- After capture, run `npm run grade:cursor` (writes the worksheet + inbox
  template), then STOP. Tell the human to open a separate agent, pin Gemini
  2.5 Flash (Auto off), fill audit/reports/inbox.json from the PNGs, and run
  `npm run grade -- --compile audit/reports/inbox.json`. Continue only from
  audit/reports/latest.md.
- Do not substitute your own assessment of your own render while waiting.
- State the model you are running on at the top of every report you write. If
  you do not know it, write "model unknown" — do not guess.

LOOP:
1. Take the lowest-scoring criterion from audit/reports/latest.md that you have
   not already attempted twice. If there is no report yet, start with the
   backlog in section 7 of this document.
2. Make the change. Keep it scoped to that criterion.
3. npm run build && npm run check && npm run check:buildings — all must pass.
4. node scripts/capture-poi.mjs — regenerate the affected screenshots.
5. npm run grade:cursor, then stop and ask the human to run the Cursor auditor
   (Gemini 2.5 Flash). Do not grade the images yourself.
6. When audit/reports/latest.md exists, if the auditor flagged a regression on
   this criterion, revert rather than stacking a second fix on top.
7. Commit. One criterion per commit, and say in the message which criterion.

RULES:
- Never mark work done because it compiles. The screenshot is the deliverable.
- If you skip a required step (an asset you could not source, a technique you
  could not implement), SAY SO in the commit message. Silent substitution is
  the single failure mode this project has already been burned by: a texture
  pipeline was wired up complete with a transcoder and then fed uncompressed
  JPEGs, and nobody noticed for a week.
- If a check would fail, fix the code, not the check.
- You may work on several criteria in parallel ONLY if they touch different
  files. Terrain and trees, yes. Two tree changes, no.
```

---

## 5. The rubric

Score every criterion **0–5**. The auditor emits one row per criterion per POI.

Universal criteria — applied to every screenshot:

| # | Criterion | 5 looks like |
|---|---|---|
| U1 | Ground is not bare | Grass cover reads as continuous ground cover in the near field, thinning with distance; no wide expanses of untextured dirt where the biome should be grassed. **Arid POIs** (`badlands`, `burn`, `mission`, `elPaso`, `ironValley`) are exempt from the grass wording — bare ground is correct there, so U1 instead scores the arid material's richness (weathering/rock/ash/adobe micro-variation), not vegetation coverage |
| U2 | Texture scale is believable | Ground detail is human-scale against the 1.62 m eye height; no smeared low-frequency wash and no visible tiling grid |
| U3 | No visible seams or straight material lines | Transitions between grass/dirt/rock/gravel are noise-broken and irregular |
| U4 | Nothing floats or sinks | Every object meets the ground; no gaps under walls, no half-buried props |
| U5 | Lighting reads correctly | Shadows are present and directional; no blown highlights, no crushed blacks; the golden-hour frame is visibly warmer and longer-shadowed than the midday one |
| U6 | Silhouettes read at distance | Distant objects are identifiable by shape, not smeared or popping |

Per-POI criteria:

| POI | Criteria |
|---|---|
| `ranch` | Two-story L-plan house with kitchen ell; hip roofs with even overhang on all sides; porch posts carry a roof; chimneys continuous from wall to above the ridge; door reads as human-scale (≈0.9 × 2.0 m against a 1.62 m eye); barn gable runs along its long axis; 3-rail fences; windmill is a multi-vane fan, not a 4-blade Dutch mill |
| `silverCreek` | Every building faces the street at the same angle; false fronts sit at the facade plane, full width, and hide the roof behind; church steeple is over the entry at the gable end, not centered on the ridge; boardwalk present; buildings vary in height and material |
| `northernPines` | Canopies read as conifers — conical, wider at base than top, tiered branches; foliage is dense enough to occlude, not see-through scribbles; trunks have visible bark relief; stand density reads as forest, not scattered saplings; tree height believable against the player |
| `timberCamp` | Cut stumps and felled logs present; structures have roofs and doors; a working-site read, not a box cluster |
| `burn` | Charred standing trunks with no canopy; ground darkened; smoke plume visible and anchored to a source |
| `lakeMercy` | Water shows a depth gradient from shore to center; two scales of surface motion; shoreline foam; dock sits at the water plane, neither floating nor drowned; the surface shows a visible sky reflection or sun-glint highlight, not a flat diffuse plane |
| `westernRange` | Open grassland reads as grass to the horizon; cattle vary in orientation; fence lines follow terrain |
| `ironValley` | Industrial silhouette — headframes, stamp mill, tailings; rust and iron materials distinct from timber |
| `badlands` | Layered/striated rock; sparse vegetation; rock material dominates by slope, not by a flat color |
| `tribal` | Tipis vary in rotation and scale; camp reads as arranged, not gridded |
| `mission` | Adobe material distinct from timber; bell tower on the facade, not centered on the roof |
| `fortGrant` | Four walls enclose a courtyard with a centered gate; interior structures present |
| `cemetery` | Headstones vary in size, spacing, and rotation; not a straight evenly-spaced line |
| `huntingCabin` | One-story cabin with a pitched roof, door, and chimney |
| `overlook` | The vista is the subject — foreground framing, readable middle distance, aerial perspective toward the horizon |
| `elPaso` | Adobe cluster with varied heights; reads as a settlement, not repeated boxes |

Where a road crosses any frame, add: **gravel edges are ragged and noise-broken,
the road never has a clean straight boundary against grass, and the wheel-track
center is visibly smoother and darker than the loose margins.**

---

## 6. Prompt: the auditor agent

This one only grades. It never edits code — that separation is the point, because
an agent that both writes and grades its own work will pass itself.

```
You are the visual auditor for High Country. You do not write game code. You
do not run npm install, npx playwright install, npm run capture, or npm run
dev. Capture is the implementer's job. If audit/current/*.png is missing, STOP
and tell the human to run capture in the implementer chat.

You only edit audit/reports/inbox.json (scores) and then run the compile
command. The compile script, not you, decides CONTINUE vs PASSED.

MODEL: this loop assumes you were pinned to Gemini 2.5 Flash by hand (see §0 —
you cannot set this yourself). Put that model name in inbox.json's `model`
field before compiling. If you do not know it, write "model unknown".

INPUTS:
  audit/current/*.png              32 screenshots, <poi>-<light>.png
  audit/reports/cursor-worksheet.md  per-image criterion list
  audit/reports/inbox.json         fill this; do not invent a second format
  audit/reference/*.jpg            reference photography, if present
  docs/VISION_AUDIT.md §5          the rubric
  audit/reports/                   previous compiled passes

EACH PASS:
1. You MUST see the picture. In Cursor, @-mention the PNG in the chat
   (or drag it onto the prompt) so the image is in your context. Reading a
   path as text is not looking. If you do not actually see pixels — sky,
   ground, buildings — STOP and tell the human. Do not invent scores.
2. For each image you can see, score every listed criterion 0-5 in inbox.json.
   Use null only if the frame does not show that detail.
3. For any score <= 3, write one sentence in `note` naming what you SEE that
   is wrong — not what you infer from the code.
4. Never fill 3 (or any uniform score) because you "cannot view images".
   That is a failed run, not a grade. The compile script will reject it.
5. Grade a few images per turn (about 4), not all 32 at once.
6. Do not write pass-NN.md yourself. After scores are real, run:
     npm run grade -- --compile audit/reports/inbox.json

STOP CONDITION — the loop ends only when ALL of these hold:
  a. Every universal criterion scores >= 4 on every one of the 32 screenshots.
  b. Every per-POI criterion scores >= 4.
  c. No criterion anywhere scores <= 2.
  d. Two consecutive passes both satisfy a-c. One clean pass is not enough;
     it is too easy to get one good frame by accident.
Until then the verdict is CONTINUE, no matter how much work went into the pass.

You do not get to lower the bar. If a criterion seems unachievable, say so in
the report and score it honestly as it stands. Deciding to relax a criterion is
the human's call, not yours.

HONESTY RULES:
- If an image is missing or failed to render, score it 0 and say so. Do not
  skip it and do not average around it.
- If you cannot tell from the screenshot — the detail is too small, the angle is
  wrong — say "cannot assess from this frame" and request a specific camera
  position. Do not guess a middle score.
- If your note names a concrete violation of the criterion's own text (a gap, a
  float, a seam, a straight boundary where noise is required, a missing roof or
  door), the score is capped at 3 no matter how you hedge it ("minimal",
  "slight", "minor"). A described defect and a passing score cannot coexist.
- Never award points for effort, for a good commit message, or for the
  implementer telling you something is fixed. Only for what is in the image.
```

---

## 7. Current backlog, worst first

Standing state at the time of writing, for the implementer's first pass:

1. **No scanned bark or leaf atlas** (§3.2 of the materials handoff). Both are
   still procedural canvas textures. This is the single biggest lever on how the
   forest reads, and it needs network access this sandbox did not have.
2. **KTX2 transcodes nothing.** The loader is wired, `copy-basis.mjs` runs, the
   build ships 527 KB of `basis_transcoder.wasm`, and every path in
   `textureManifest.ts` is `.jpg`/`.png`. Texture memory measures **403 MB**
   against a 512 MB budget.
3. **Two texture sets are the wrong material.** `dirt_2k_albedo.jpg` is a smooth
   concrete or plaster surface; `gravel_2k_albedo.jpg` is dark soil with no
   crushed stone. Gravel surfaces every road in the game.
4. **`check-buildings.mjs` cannot fail.** Of the twelve invariants in §6 of the
   building handoff, two are genuinely implemented, six are absent, and four are
   tautologies that assert values constructed in the same file. Verified: revert
   the ranch roof to float 1.9 m above its walls and it still prints PASS; set
   the interior doorway back to 4.4 m and it still prints PASS.
5. **Stochastic/hex-grid sampling** (§2.5 item 3) was never implemented.
6. **Tree LOD.** The broken `THREE.LOD` was removed rather than replaced; there
   is currently no distance LOD on trees. Real per-instance LOD needs a
   bucketing pass that rewrites the matrices of a near/far mesh pair.

7. **Lake Mercy renders black** in the WebGL2 capture — see the caveat in §2.
   Establish first whether it reproduces under WebGPU; if it does, it goes to
   the top of this list.

Items 1 and 3 are asset work and need network. Item 4 is the one to do first
anyway: until the check can fail, nothing else it covers is protected.

---

## 8. Grading — Cursor path (default) vs paid API

Cursor Gemini is **not** the Google Gemini API. Do not set `GEMINI_API_KEY` to
use your Cursor subscription; that key hits `generativelanguage.googleapis.com`
and bills Google, not Cursor.

**Default (subscription Gemini in Cursor):**

```sh
npm run capture
npm run grade:cursor
# pin a separate Cursor agent to Gemini 2.5 Flash (Auto off)
# that agent opens audit/current/*.png and fills audit/reports/inbox.json
npm run grade -- --compile audit/reports/inbox.json
```

`grade:cursor` writes `audit/reports/cursor-worksheet.md` and a scored-empty
`inbox.json`. `--compile` reads the filled inbox, scores against
`scripts/rubric.mjs`, and writes `audit/reports/pass-NN.md` plus a `pass-NN.json`
sidecar. The next run compares against that sidecar rather than parsing markdown
back.

**Optional paid Google/OpenAI API** (extra spend, not the Cursor subscription):

```sh
export GEMINI_API_KEY=...        # or OPENAI_API_KEY with GRADE_PROVIDER=openai
npm run grade
```

| | |
|---|---|
| Model | `gemini-2.5-flash`, a constant at the top of `scripts/grade.mjs` |
| Temperature | 0 — a creative grader turns the score series into noise |
| Exit 0 | PASSED, the §6 stop condition is met |
| Exit 2 | CONTINUE, graded fine, bar not met |
| Exit 1 | the run failed — no captures, bad inbox, or (API path only) no key / API errors |
| Env | `GRADE_PROVIDER` (gemini\|openai), `GRADE_CAPTURES`, `GRADE_CONCURRENCY`, `OPENAI_BASE_URL` |

Behaviour worth knowing:

- **A failed image scores 0 and says so.** It is never skipped — a skipped image
  looks exactly like a passing one once you average.
- **A criterion the grader omits is recorded as unassessed**, not as passing.
- **Unassessable criteria** (`score: null`) are listed in their own section and
  never counted toward the bar in either direction, so "cannot see it from this
  angle" can't quietly become a pass.
- **A changed model is flagged at the top of the report** with a warning that the
  series is no longer comparable.
- The §6 two-consecutive-clean-passes rule is enforced in `evaluateStop`, not
  left to the agent's judgement.

**`scripts/rubric.mjs` is the executable copy of §5.** They must be amended
together in the same commit, including when the second-tier pass (§1) proposes
new criteria. Criterion ids are the key of the score series: never renumber one,
retire it and add a new id instead, or every past report silently changes
meaning.

**Cost.** The default Cursor path uses the Gemini model already on the
subscription. `npm run grade` with no flags is extra Google/OpenAI API spend
and is optional.

**Caveat: not exercised against a live API.** It was written in a sandbox with
no outbound network, so the Gemini and OpenAI request shapes come from their
documented formats and the first real run may need a correction. Everything that
does not need the network — capture discovery, score parsing, regression
detection, the stop condition, report rendering — is covered by
`npm run grade:selftest`, which passes.
