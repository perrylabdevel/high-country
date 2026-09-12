# High Country

High Country is an existing Three.js/WebGPU browser game.

The skills under `.claude/skills/` are targeted playbooks, not a mandatory chain. Invoke a skill only when its precise trigger matches the task, and read only the referenced detail needed for the current decision.

Use `docs/VISUAL_STATUS.md` for a formal graded visual experiment or baseline decision. Use `docs/HARD_WON.md` when the task intersects a known failure mode or an apparent visual defect survives an initial investigation. Do not load both before every visual edit.

## Working style

Work from outcomes and hard constraints, not a fixed itinerary. Choose the smallest useful inspection and verification. A localized fix should not automatically trigger baseline measurement, full capture, grading, critic review, fault injection, and a second pass.

Broaden verification when scope or risk is broad, a targeted check fails, evidence conflicts, or the user asks for a formal campaign. Visual claims still need representative evidence from the affected viewpoint and shipping backend.

Keep exploring and repairing until the requested outcome works while safe, relevant work remains. Do not stop after a first patch merely to request review, and do not perform unrelated cleanup or ritual extra passes.

## Context and routing

Canonical AI project state lives in `.ai/`. Read:

- `.ai/STATE.json` when current campaign state matters.
- `.ai/REQUIREMENTS.md` when requirements or acceptance criteria matter.
- `.ai/ROUTING.md` when delegating or escalating.
- `.ai/HANDOFF.md` or `.ai/history/` only for a named missing detail.

Do not reread files already embedded by the harness.

Use `airoute` when OpenAI delegation is useful. Generation-1 `hc-agent` and shared `~/.ai-harness` are installed; `airoute` is not on PATH. Use `~/.hc-agent/bin/hc-agent` for HoH campaigns.

Do not invoke GPT-6 Astra for ordinary implementation, repository exploration, tests, or repetitive visual iteration. Give EXPERT a fresh compact problem/evidence packet and minimal procedural instruction. After its decision, downshift implementation to WORKER.

Keep `.ai/STATE.json` current at meaningful checkpoints. Keep `.ai/HANDOFF.md` compact and archive superseded detail.

Claude remains the interactive orchestrator. Do the work in-session when delegation adds no value. When a router provides a role banner, show it.
