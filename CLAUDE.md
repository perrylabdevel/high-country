# High Country

This is a Three.js/WebGPU browser game. Existing measurement skills in `.claude/skills/` still apply: `measure-first`, `verify-change`, `capture-poi`, `measured-experiment`, `asset-bundle`, `add-check`. Those skills are project discipline, not a replacement for `.ai/` routing.

Before visual work, also consult `docs/HARD_WON.md` and `docs/VISUAL_STATUS.md`.

# AI harness

Canonical AI project state lives in `.ai/`.

At the start of substantive work, inspect:

- `.ai/REQUIREMENTS.md`
- `.ai/HANDOFF.md`
- `.ai/ROUTING.md`

Use the `airoute` router when delegation to OpenAI models is useful.

Availability (2026-09-10): no router is installed in this environment — `airoute`, `hc-agent`, and `~/.ai-harness` are absent. Work in-session and do not attempt to invoke the router.

Do not invoke GPT-6 Astra for ordinary implementation, repository exploration, test execution, or repetitive visual iteration.

Before invoking the EXPERT role, construct the escalation packet required by `.ai/ROUTING.md`.

After an expert decision, downshift implementation to WORKER whenever practical.

Keep `.ai/HANDOFF.md` current at meaningful checkpoints.

Claude remains the interactive orchestrator. Launching `claude` uses Claude, not GPT. GPT is used only when this session runs `airoute`. When you delegate, show the `[TERRA / WORKER]`-style banner from `airoute` so the user can see which model ran. In this environment `airoute` is not installed, so skip delegation and banners and do the work in-session.

Do the work yourself when that is cheaper and sufficient. Do not launch a second model for a trivial question.
