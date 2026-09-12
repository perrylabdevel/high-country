# High Country

High Country is an existing Three.js/WebGPU browser game. Preserve the established measurement tools in `.claude/skills/`; do not replace `scripts/grade.mjs` or weaken an existing check unless the user explicitly asks to change that system.

## Working style

Define the outcome and hard constraints, then choose the shortest sound path to it. Requirements and safety invariants are binding; documented procedures, examples, and skills are techniques to use when they fit.

Do not automatically chain measurement, capture, grading, critic, regression-check, or second-pass workflows. Use the smallest investigation and verification that can support the requested claim. Broaden only when the affected surface, risk, evidence, or a failure warrants it.

A localized task may need one focused inspection and one targeted check. Cross-cutting changes, releases, shared rendering systems, or formal visual campaigns may justify the full suite and broader evidence.

For visual claims, inspect a representative rendered result from the affected viewpoint and shipping backend. A full multi-POI capture/grade cycle is reserved for formal visual experiments, baseline changes, or changes whose impact is genuinely world-wide.

Continue until the requested outcome is working while safe, relevant steps remain. Do not add mechanical self-critique, repeated passes, or unrelated cleanup merely because a playbook lists them.

## Context

Canonical AI project state lives in `.ai/`. Read only what the task needs:

- `.ai/STATE.json` for campaign continuity or current work.
- `.ai/REQUIREMENTS.md` when changing behavior, acceptance criteria, or the harness.
- `.ai/ROUTING.md` only when routing, delegating, or escalating models.
- `.ai/HANDOFF.md` or `.ai/history/` only for a named missing detail.

If a harness prompt already embeds a file, do not read it again. Never dump history into active context.

Role mappings are configured through `airoute`, not hard-coded. Prefer the assigned role for the invocation. After an EXPERT decision, hand implementation back to WORKER.

Availability (2026-09-10): Generation-1 `hc-agent` and shared `~/.ai-harness` are installed; `airoute` is not on PATH. Use `~/.hc-agent/bin/hc-agent` for HoH campaigns; otherwise work in-session.

Do not store or request API keys when Codex ChatGPT authentication is available.

## Verification notes

`npm run check` runs the complete suite through `scripts/check-all.mjs`. Use it when the change is cross-cutting or the acceptance criteria require the whole suite; otherwise run the relevant check(s).

Timing checks must run without captures, builds, or another agent competing for the CPU. The runner remeasures a failed timing check once after contention settles. If it still fails under high load, rerun on an idle machine before changing code. `npm run check:sequential` remains available when isolation is needed.

Road-rut diagnostics are available through `node scripts/capture-ruts.mjs <preview-url> <diagnostic-output-dir>`. Use them only for road-rut work; they are not graded audit frames.
