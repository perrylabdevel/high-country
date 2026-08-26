# Skills — running this project on a small model

These six skills exist so a cheaper, faster model can improve this game
continuously without breaking it. They are plain Markdown with a small YAML
header: usable by any harness. Paste the body into a system prompt, load it as
a rule file, or let a skill-aware runner pick by description.

## What they encode

The skills carry the **discipline**, not the creativity. Everything in this
project that went well came from measurement; everything that went badly came
from a confident guess. A small model guesses more, so the guardrails matter
more, not less.

## The six

| Skill | Use it when |
|---|---|
| `verify-change` | After **any** edit. The gate before "done". |
| `measured-experiment` | Improving how the game looks. The ship-or-revert loop. |
| `capture-poi` | You need to see something. Screenshots that aren't lies. |
| `measure-first` | Something looks dark / sparse / flat. Numbers before shaders. |
| `asset-bundle` | Textures, the manifest, or the release bundle. |
| `add-check` | You fixed a bug that failed silently. Make it stay fixed. |

## The loop, end to end

```
pick ONE item (docs/BACKLOG.md, or the audit's worst-first list)
  └─ measure-first      diagnose with numbers, not theories
  └─ make the change    smallest thing that could work
  └─ verify-change      build + 13 checks
  └─ capture-poi        look at it, settled
  └─ measured-experiment capture → grade → compile → ship or revert
  └─ add-check          if the bug was silent
  └─ commit, with what it measured — even when reverted
```

## Five rules that override anything else

1. **A command must prove it.** Not the diff, not the reasoning.
2. **One change per measurement.** Three changes and a red check is no
   information.
3. **Never grade yourself.** `scripts/grade.mjs` refuses external providers on
   purpose — a changed grader breaks comparability with every pass in
   `audit/reports/`, destroying the only baseline this project has.
4. **Revert is a normal outcome.** Most passes here were reverted after being
   measured. Log the result either way so nobody retries it blindly.
5. **Report honestly.** "I could not verify this" beats a confident wrong
   claim. Wrong claims have cost days.

## What a small model should NOT do alone

Hand these to a stronger model, or stop and ask:

- Changing the rubric, the grader, or the audit method.
- Renderer architecture: the WebGPU/TSL node graph, LOD banding, the
  amortised scatter, the collision model.
- Anything needing a judgement call about whether the *game* is fun.
- Publishing a release bundle for the first time on a new machine.

## Required reading before the first change

- `docs/HARD_WON.md` — the defect register. Symptom → cause → fix, and how it
  was actually found. Most were caught by computing or by reading an error,
  not by looking at the scene.
- `docs/VISUAL_STATUS.md` — the current baseline pass and fail count.
- `docs/VISION_AUDIT.md` — the audit loop and its stop condition.
