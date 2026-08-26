# Takeover Brief — High Country visual quality

**For:** an agent in the Claude CLI (any backing model) with a terminal, no
memory of prior conversation.
**Written against:** commit `4cf4ef9`, after audit pass 05.
**Supersedes:** the Cursor delegation guidance in `docs/VISION_AUDIT.md` §0. The
rubric, milestones and stop condition in that document still stand.

Read this file end to end before touching anything.

**Running a smaller/cheaper model?** Start at `.claude/skills/README.md`
instead. It holds six procedural skills — verify-change, measured-experiment,
capture-poi, measure-first, asset-bundle, add-check — that encode this
project's verification discipline as steps with hard gates, plus the loop that
ties them together. This brief is the background; those are the procedure.

Note this brief was written against pass 05 and the audit is now past pass 90:
the architecture and the rules hold, but treat any specific count or commit
here as historical. `docs/VISUAL_STATUS.md` carries the current baseline.

---

## 1. What this project is

A browser game — 1880s American West, three.js `WebGPURenderer` with TSL node
materials, Vite, mixed `.js`/`.ts`. A 4000 × 5000 m world with 16 points of
interest. **One world unit is one metre**; the player's eye is at 1.62 m and
that is the yardstick for every dimension you touch.

The goal is not "make it compile." It is "make it look right." A scoring loop
already exists and has run five passes; your job is to move its numbers.

Specifications still in force:

- `docs/TERRAIN_MATERIALS_HANDOFF.md` — terrain, grass, trees, water, roads,
  lighting, texture pipeline.
- `docs/BUILDING_GEOMETRY_HANDOFF.md` — footprints, wall heights, roof form,
  openings, foundations, rotation.

Design work, not yet implemented — read before proposing architecture changes:

- `docs/ANCHORS.md` — named frames instead of typed coordinates. Addresses the
  fact that nearly every defect in this project has been spatial.
- `docs/ASSET_PIPELINE.md` — whether Blender belongs in the loop, and where the
  seam is if it does.

---

## 2. Baseline

```sh
npm ci
npm run build             # must succeed
npm run check             # ten checks, all must pass
npm run grade:selftest    # must print "selftest ok"
npm run dev               # http://127.0.0.1:8765
```

If any fail on a clean checkout, fix that before anything else — you are not
looking at the state this brief describes.

---

## 3. Cursor subscription only — what changes

This branch grades **only** through the Cursor model selected in the chat that
fills `inbox.json`. Claude CLI (`claude -p`), Google Gemini API
(`GEMINI_API_KEY`), and OpenAI are disabled in `scripts/grade.mjs`.

### 3.1 The grader is the Cursor picker, not a spawned CLI

`npm run grade` with no flags writes the worksheet. It does not spawn a model.
The agent in **this** Cursor chat looks at the PNGs and fills
`audit/reports/inbox.json`, then:

```sh
npm run grade -- --compile audit/reports/inbox.json
```

Pin the model in Cursor's UI (Auto off). Put the picker name in inbox.json's
`model` field. If you do not know it, write `model unknown` — do not guess.

The score series on `main` was already broken twice — passes 01–03 were
`gemini-2.5-flash`, 04 onward `haiku`. **This branch starts a new series.**
Grades from two models are not the same measurement. Check the report header:

```
**Grader model: `<picker name>`** (provider: cursor, temperature 0)
```

If that line names a different model than the previous pass on this branch, the
report will also print a warning that the series is broken. Do not ignore it.

### 3.2 Verify the grader can actually see, before trusting one score

The entire loop assumes Cursor's Read tool delivers pixels to the model
selected in this chat. Confirm it, once, before any grading run: open
`audit/current/lakeMercy-midday.png` (or a diagnostic capture) in this chat
and describe the water colour in one sentence.

A correct answer names the water as black or very dark. **If it says it cannot
view images, or gives a generic description that would fit any screenshot,
stop.** A grader that cannot see does not error — it fills in plausible middle
scores, and every number after that is fiction. This project has already been
burned once by a check that passed without checking anything.

Do not run `claude -p --model haiku` on this branch. Do not set
`GEMINI_API_KEY` or `OPENAI_API_KEY` to grade.

Everything else — editing, building, running checks — is model-agnostic.

---

## 3b. Splitting planning from execution

A strong model planning and a cheaper one executing is a sound split, and this
project already does it in one place: the grader is the Cursor model selected
in the auditor chat, which may be cheaper or the same as the implementer.
Extending it to implementation works, with one condition this project learned
expensively.

**The split is safe in proportion to how machine-checkable the step is.**

Safe to hand a cheap executor:

- Mechanical refactors carrying an automatic proof — `docs/ANCHORS.md` phase 3
  is the model case: convert call sites, assert every world matrix is identical
  before and after.
- Porting call sites to an API that already exists.
- Applying a documented convention across many files.
- Anything where a failing check, not a judgement, is the arbiter.

Not safe:

- **Diagnosis.** "Why is the lake black" needed reading a GPU validation error
  and knowing how three's node builder packs uniforms. No plan substitutes.
- **Writing the checks themselves.** `check-buildings.mjs` is the cautionary
  tale: the plan said "twelve invariants" and what came back was twelve
  function calls *named after* the invariants, four of them tautologies
  asserting values constructed in the same file. The plan was right and the
  execution was hollow, and a weaker executor makes that more likely, not less.
- First contact with an unfamiliar API, where the failure mode is subtle rather
  than loud.

**So the planner's job is not to write instructions. It is to write acceptance
criteria a cheap executor cannot satisfy without doing the work.** Not "make the
false fronts readable" — that produced five commits escalating from "strengthen"
to "decisively readable" with the score never moving off 1. Instead: "the
parapet plane sits at facade depth ±0.05 m, 1.2–2.4 m above the eave, spans full
facade width, and `assertFalseFront` passes." A weak model cannot fake that,
because the arbiter is not opinion.

One practical note: a model handoff loses context. The planner knows *why*; the
executor receives *what*. Put plans in the repo as documents — as these docs are
— rather than passing them through chat, so the reasoning survives the handoff.

---

## 4. Where things stand after pass 05

All five passes: **CONTINUE**. Latest is `audit/reports/pass-05.md`; read it
rather than trusting the numbers below, which go stale on your first commit.

Universal criteria, pass-05 (32 frames):

| | Avg | Frames ≤2 |
|---|---|---|
| U4 nothing floats | 4.31 | **0** |
| U5 lighting | 4.00 | 2 |
| U6 silhouettes | 3.97 | **0** |
| U2 texture scale | 3.66 | 3 |
| U3 seams | 3.23 | 7 |
| **U1 ground not bare** | **2.34** | **22** |

### The one big win, and the regression it caused

Pass 05 raised the golden-hour HDRI ambient scale from 0.7 to 1.85
(`src/materials/hdri.ts`). It worked: **U5 on golden frames went 2.94 → 4.13**,
overall average 3.24 → 3.43, and `mission-golden` went from three zeros to
U2 = 4, U5 = 4.

**But it broke the lake.** `lakeMercy-midday` was the one water frame that
worked in pass 04 and regressed across the board:

- U5 4 → 0, L1 4 → 0, L2 3 → 0, L3 1 → 0
- *"the water is rendered almost entirely black with no tonal variation, and
  the sky is blown-out pale tan"*

Golden-hour water was already black and stayed black. The only lighting change
between the two passes was that HDRI scale, so the prime suspect is tone mapping
crushing the water's dark end while the sky clips at the top. **This is the
highest-priority item**: it is the only thing that got worse rather than staying
bad, and water is now the worst-scoring subsystem in the project (L1 0.50,
L3 0.50, L2 1.00).

Related regressions likely from the same brightening — `badlands-midday` U1
4 → 1, `burn-golden` U1 4 → 1 — are probably honest new information rather than
damage: brighter ambient reveals bare ground that shadow used to hide.

### Backlog, worst first

1. **Water.** See above. Start by checking whether tone mapping is clipping it,
   and whether the fix is exposure or the water material's own colour ramp.
2. **Bare ground — U1 at 2.34, failing 22 of 32 frames.** The single biggest
   universal problem now. `W1` (western range reads as grassland) scores 1.00.
   Grass is a 46k-instance disc of 52 m radius that follows the camera
   (`src/vegetation.js`); it is still too sparse to read as ground cover.
3. **Silver Creek.** S4 boardwalk 0.50 (*"no raised boardwalk structure
   visible"*), S2 false fronts 1.00, S3 steeple 1.50. Note commit `b7a84c0`
   claimed to make false fronts readable and the score did not move — **that is
   two attempts on one criterion.** Per §6, stop retrying and run the
   second-tier review instead.
4. **U3 seams, 7 frames ≤2.** Straight material boundaries — the island-to-water
   edge at Lake Mercy, a diagonal line across Iron Valley terrain.
5. **KTX2 still transcodes nothing.** Zero `.ktx2` files in `public/textures/`;
   the loader is wired, the transcoder ships in the build, every manifest path
   is `.jpg`/`.png`. Texture memory measured 403 MB against a 512 MB budget.
6. **No tree LOD.** A broken `THREE.LOD` was removed, not replaced. Per-instance
   LOD needs a bucketing pass rewriting the matrices of a near/far mesh pair;
   `THREE.LOD` cannot do it, because it measures distance from its own origin
   and one InstancedMesh of a whole forest has a single origin.

### Fixed — do not re-fix

- **`check-buildings.mjs` is real now.** Verified: reintroduce the original
  floating roof and it fails with `roof base y=24.30 not in [22.10, 22.42]`.
  It was tautological for most of this project's life; it is not any more.
- **Capture is WebGPU by default**, writes `capture-manifest.json`, and `grade`
  refuses a set without a complete manifest. `CAPTURE_BACKEND=webgl` is
  diagnostic-only and cannot write to `audit/current`.
- **Ground textures were re-sourced.** `dirt` is stony soil and `gravel` is
  crushed stone; both were previously the wrong material entirely.
- **Nothing floats** — U4 4.31 with zero failures. The building kit's `footing()`
  and oriented colliders did their job.
- The building kit, the L-plan ranch, terrain height-blending and triplanar,
  pine canopies with `pine_twig_2k.png`, fly mode for the debug camera.

---

## 5. How to work

```sh
npm run build && npm run check      # both must pass
npm run preview &
npm run capture -- http://127.0.0.1:8765 audit/current
npm run grade                       # exit 0 PASSED · 2 CONTINUE · 1 run failed
```

Loop:

1. Read `audit/reports/latest.md`. Take the lowest-scoring criterion you have
   not already attempted **twice**.
2. Make one scoped change.
3. Build, check, capture, grade.
4. Read the new report — specifically the Regressions section. **A fix that
   lifts twenty scores and breaks four is not finished.** That is exactly what
   pass 05 did.
5. If the criterion regressed, revert rather than stacking a second fix.
6. Commit. One criterion per commit, named in the message.

**The stop condition** (`evaluateStop`, computed not asserted): every scored
criterion ≥4, none ≤2, coverage ≥80%, on **two consecutive passes**. You do not
get to lower it.

**Never grade a partial capture set.** `npm run grade` writes a numbered pass
every time. Use `GRADE_CAPTURES=/tmp/somewhere` for experiments and delete the
report.

Every fifth pass, or when a criterion resists two attempts, run the second-tier
review in `docs/VISION_AUDIT.md` §1: hand a strong model the weakest frames and
ask what the rubric is failing to ask about. Amend **both** `scripts/rubric.mjs`
and §5 of the audit doc together, and never renumber a criterion id — retire it
and add a new one, or every past report silently changes meaning.

---

## 6. Rules

- **Report what you actually did.** If you could not source an asset, could not
  implement a technique, or skipped a step, say so in the commit message. Every
  failure this project has suffered came from silent substitution: a KTX2
  pipeline built complete and fed uncompressed JPEGs; a check with the shape of
  twelve invariants and the substance of two; a commit claiming false fronts
  were readable when the score stayed at 1. All survived because nobody said
  "this didn't work."
- **Never mark work done because it compiles.** The screenshot is the
  deliverable.
- **If a check would fail, fix the code, not the check.**
- Do not commit screenshots — `audit/current/` and `audit/pass-*/` are
  gitignored. Reports under `audit/reports/` are committed.
- Parallel work is fine across different files; not two changes to the same
  subsystem.
- Branch `claude/terrain-environment-materials-c0e31j`. No PR unless asked.

---

## 7. Trip hazards

- **The title overlay swallows synthetic clicks.** Capture dispatches
  `document.getElementById("btn-enter").click()` directly; `page.click()` times
  out.
- **`waitUntil: "load"` never fires** — the HDRI keeps it pending. Use
  `domcontentloaded`.
- **`three` is aliased to `three/webgpu`** in `vite.config.ts`. A module
  importing plain `three` bundles a second copy and breaks node materials —
  `fort.js`, `homestead.js` and `pines.js` each hit this once.
- **Those three files** still carry private `boxAt`/`mat` copies and
  single-point grounding — copies five through seven of the pattern §2.5 of the
  building handoff exists to kill. Fold them into the kit when you are in there.
- **Capture needs a real GPU.** Under software rasterisation it is ~50 s per
  frame and the WebGPU path may not initialise at all. If a capture seems hung,
  check the backend before debugging the script.
- **`npx playwright install` hangs on some distros.** The script falls back to a
  system Chrome; `PLAYWRIGHT_CHROMIUM` overrides the binary.
