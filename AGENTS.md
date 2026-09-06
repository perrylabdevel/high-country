# High Country

Preserve the existing measurement skills in `.claude/skills/`. Do not replace `scripts/grade.mjs` or the audit method without an explicit request.

# AI harness

Canonical AI project state lives in `.ai/`.

Read `.ai/REQUIREMENTS.md`, `.ai/HANDOFF.md`, and `.ai/ROUTING.md` before substantive work.

Role mappings are configured through `airoute`, not hard-coded. Prefer the assigned role for this invocation. After an EXPERT decision, hand implementation back to WORKER.

Do not store or request API keys when Codex ChatGPT authentication is available.
