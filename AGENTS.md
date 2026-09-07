# High Country

Preserve the existing measurement skills in `.claude/skills/`. Do not replace `scripts/grade.mjs` or the audit method without an explicit request.

# AI harness

Canonical AI project state lives in `.ai/`.

Read `.ai/REQUIREMENTS.md`, `.ai/HANDOFF.md`, and `.ai/ROUTING.md` before substantive work. Read them in one command (`cat .ai/REQUIREMENTS.md .ai/HANDOFF.md .ai/ROUTING.md`) rather than one file per tool call — each separate call is a full model inference over the whole conversation.

Role mappings are configured through `airoute`, not hard-coded. Prefer the assigned role for this invocation. After an EXPERT decision, hand implementation back to WORKER.

Do not store or request API keys when Codex ChatGPT authentication is available.

# Verification

`npm run check` runs the whole suite through `scripts/check-all.mjs`: the geometry checks run concurrently, then `check:collision`, `check:grass-budget` and `check:nav-graph` run one at a time with nothing else on the CPU, because they assert on elapsed time. A concurrent WebGPU capture pushed `check:grass-budget` to 7.13 ms/chunk; the isolated rerun measured 1.96 ms against the same 6 ms budget. The runner remeasures a failed timing check once after the machine settles and says so, so a contention failure is not mistaken for a regression — if it still fails and the reported load is high, re-run on an idle machine before changing any code. `npm run check:sequential` is the old one-at-a-time chain if you need it.

Do not run captures, builds, or a second agent alongside the timing checks.

Road-rut diagnostics: `node scripts/capture-ruts.mjs <preview-url> <diagnostic-output-dir>`. It requires the current production build and WebGPU, waits for the actual camera and vegetation to settle, and captures eye-level/detail views in both lights. `CAPTURE_ROAD=stage|townMain|cabinTrail` selects a road; `CAPTURE_RUT_RELIEF=0` isolates the normal-relief contribution without changing roughness or colour. These are diagnostics, not graded audit frames.
