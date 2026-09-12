---
name: measure-first
description: Choose a discriminating measurement for an ambiguous visual defect. Use when the cause is uncertain, evidence conflicts, or an earlier fix failed.
---

# Measure an ambiguous visual defect

## Outcome

Obtain the smallest piece of evidence that distinguishes the leading explanations before making a risky visual change.

## Invariants

- Measure the rendered or GPU-facing behavior when possible, not merely a CPU-side model of it.
- A clean measurement rejects that hypothesis; it does not prove the visible defect is absent.
- A persistent human observation is evidence. If numbers and sight disagree, question whether the instrument can observe the failure class.
- Fix the cause rather than decorating over a grader reading.

Choose the most discriminating measurement or diagnostic view; do not mechanically run every technique. If two or three clean readings fail to explain the defect, switch modality or expose the behavior visually instead of adding more of the same measurements.

For an obvious localized cause, a direct targeted fix and verification may be more appropriate than invoking this skill.

Read `REFERENCE.md` only for worked examples, known multiplier traps, or specific measurement recipes. Existing debug hooks are indexed in `docs/DEBUG_HOOKS.md`.
