---
name: measured-experiment
description: Run a formal ship-or-revert evaluation for a graded visual experiment or continuous visual-improvement campaign. Do not use for ordinary localized fixes.
---

# Measured visual experiment

## Use this workflow when

The task explicitly changes the graded visual baseline, compares alternative looks, or runs a continuing visual-improvement campaign. An ordinary correctness fix or localized user-reported visual bug needs targeted reproduction and evidence, not automatically a full grade cycle.

## Outcome

Decide whether the experiment should ship using comparable evidence.

## Invariants

- Use the configured grader; do not substitute self-grading or another provider for a comparable series.
- Do not compare scores across a renderer change as though they share one baseline.
- A correctness fix or reproduced human-visible defect is not overruled by a flat aggregate score.
- Record a formal experiment’s result, including a revert, so it is not retried blindly.

Choose an experiment scope that preserves causal attribution. One change per pass is useful when comparing a specific hypothesis, but it is not a universal rule for unrelated implementation work.

Use targeted checks and captures first. Run the full capture/grade/compile loop only when needed to answer the ship-or-revert question. Stop once the evidence is decisive; do not add a ceremonial second pass unless comparability or noise requires it.

Read `REFERENCE.md` for exact commands, the current noise-band history, fault-injection guidance, and grading details. Read `docs/VISUAL_STATUS.md` only when establishing or changing the formal baseline.
