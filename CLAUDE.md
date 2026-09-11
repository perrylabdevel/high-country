# High Country

This is a Three.js/WebGPU browser game. Existing measurement skills in `.claude/skills/` still apply: `measure-first`, `verify-change`, `capture-poi`, `measured-experiment`, `asset-bundle`, `add-check`. Those skills are project discipline, not a replacement for `.ai/` routing.

Before visual work, also consult `docs/HARD_WON.md` and `docs/VISUAL_STATUS.md`.

# AI harness

Canonical AI project state lives in `.ai/`.

At the start of substantive work, inspect:

- `.ai/STATE.json`
- `.ai/REQUIREMENTS.md`
- `.ai/ROUTING.md`

Read `.ai/HANDOFF.md` only when the compact state points to it or the task needs its topic. Historical checkpoints live under `.ai/history/` and are retrieval-only.

If a harness prompt embeds the compact bootstrap, do not read those files again.

Use the `airoute` router when delegation to OpenAI models is useful.

Availability (2026-09-10): the local Generation-1 `hc-agent` and shared `~/.ai-harness` are installed. `airoute` is not on PATH. Use `~/.hc-agent/bin/hc-agent` for HoH campaigns.

Do not invoke GPT-6 Astra for ordinary implementation, repository exploration, test execution, or repetitive visual iteration.

Before invoking the EXPERT role, construct the escalation packet required by `.ai/ROUTING.md`.

After an expert decision, downshift implementation to WORKER whenever practical.

Keep `.ai/STATE.json` current at meaningful checkpoints. Keep `.ai/HANDOFF.md` compact and archive superseded detail instead of appending a journal.

Claude remains the interactive orchestrator. Launching `claude` uses Claude, not GPT. GPT is used only through an installed OpenAI harness. When a router provides a role banner, show it so the user can see which model ran.

Do the work yourself when that is cheaper and sufficient. Do not launch a second model for a trivial question.
