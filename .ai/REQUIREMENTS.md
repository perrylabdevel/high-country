# Product Requirements

High Country is an existing Three.js/WebGPU browser game. This harness installation does not change gameplay requirements. Visual and measurement rules already encoded in `.claude/skills/` and `docs/` remain in force.

# Technical Requirements

- Canonical project state lives in `.ai/`.
- Model-role mappings live in harness configuration, not game source.
- OpenAI access prefers Codex ChatGPT authentication.
- Separately billed OpenAI API usage is disabled unless explicitly enabled.
- Durable history remains available but is retrieved only when relevant.

# Visual Requirements

(none recorded)

# Performance Requirements

- Conserve premium model usage, especially GPT-6 Astra.
- Downshift after expensive inferences.

# Acceptance Criteria

- Mandatory bootstrap is `AGENTS.md` or `CLAUDE.md`, then `.ai/STATE.json`, `.ai/REQUIREMENTS.md`, and `.ai/ROUTING.md`.
- `.ai/HANDOFF.md` and `.ai/history/` are not automatically loaded.
- Astra is not used for ordinary implementation, exploration, tests, or visual iteration.
- Astra receives a fresh compact escalation packet, never a planner/developer/tester transcript.

# Constraints

- Do not silently alter these requirements.
- Do not commit credentials, OAuth tokens, or secret environment values.

# Deferred Requirements

(none recorded)
