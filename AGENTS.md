# High Country

Preserve the existing measurement skills in `.claude/skills/`. Do not replace `scripts/grade.mjs` or the audit method without an explicit request.

# AI harness

Canonical AI project state lives in `.ai/`.

Read `.ai/REQUIREMENTS.md`, `.ai/HANDOFF.md`, and `.ai/ROUTING.md` before substantive work.

Role mappings are configured through `airoute`, not hard-coded. Prefer the assigned role for this invocation. After an EXPERT decision, hand implementation back to WORKER.

Do not store or request API keys when Codex ChatGPT authentication is available.

# Verification

Run timing-sensitive checks without browser captures in parallel. A concurrent WebGPU capture pushed `check:grass-budget` to 7.13 ms/chunk; the isolated rerun measured 1.96 ms against the same 6 ms budget.

Road-rut diagnostics: `node scripts/capture-ruts.mjs <preview-url> <diagnostic-output-dir>`. It requires the current production build and WebGPU, waits for the actual camera and vegetation to settle, and captures eye-level/detail views in both lights. `CAPTURE_ROAD=stage|townMain|cabinTrail` selects a road; `CAPTURE_RUT_RELIEF=0` isolates the normal-relief contribution without changing roughness or colour. These are diagnostics, not graded audit frames.
