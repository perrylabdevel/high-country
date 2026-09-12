---
name: capture-poi
description: Capture trustworthy in-game evidence for a specific visual claim. Use only when taking or evaluating a screenshot.
---

# Capture a POI

## Outcome

Produce the smallest set of frames that reliably shows the affected behavior. One representative POI and viewpoint is often enough; use the full audit set only for a formal visual campaign or world-wide rendering change.

## Hard invariants

- Wait for `window.__vegSettled()`; a stale frame is not evidence.
- Confirm the actual backend with `window.__captureInfo()`. WebGPU is the shipping target; label a fallback frame accurately.
- Wait for the preview server to answer before capture. `npm run capture` already enforces readiness and settling.
- Cite the frame that supports each visual claim. Do not claim a visual result from a build alone.

Choose the vantage that exposes the reported defect. Eye-level is useful for grounding and silhouettes; audit views are for the graded set. Do not automatically capture multiple lights, opposite angles, or every POI unless the question requires them.

Read `REFERENCE.md` only when you need manual capture commands, specialized switches, backend troubleshooting, or the detailed known traps. `docs/DEBUG_HOOKS.md` lists available hooks.
