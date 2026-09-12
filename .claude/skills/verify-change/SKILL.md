---
name: verify-change
description: Select proportionate evidence before reporting a change as done. Use at completion, not after every edit.
---

# Verify a change

A change is done when the evidence supports the claim being made. Choose the smallest meaningful verification for the affected behavior, then broaden only when scope, risk, or a failure warrants it.

## Proportionate verification

- Documentation or agent-instruction changes: inspect the diff and validate the changed format or references. Do not run the game build solely because Markdown changed.
- Localized code: run the nearest focused check or reproduction. Add a build when compilation or bundling is affected.
- Cross-cutting systems, shared rendering infrastructure, release candidates, or explicitly full verification: run `npm run build` and `npm run check`.
- Visual behavior: inspect a representative rendered result from the affected viewpoint and actual backend. Use the full capture/grade set only for a formal visual campaign or genuinely broad visual change.
- Performance timing: run the affected timing check in isolation on an idle machine.

A failure, uncertain scope, or conflicting evidence is a reason to broaden. Success on a focused, representative check is not a reason to add unrelated passes.

## Always

- Inspect `git status --short` and the relevant diff.
- Do not weaken, skip, or delete an existing check to get green.
- Do not hand-edit generated texture or asset output; use the asset workflow.
- State exactly what ran, what it showed, and what remains unverified.
- Never claim that an unrun test passed.

No mechanical second run is required unless the check is nondeterministic, timing-sensitive, the first result is suspect, or the acceptance criteria demand it.
