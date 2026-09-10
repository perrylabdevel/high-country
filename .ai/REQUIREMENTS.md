# Product Requirements

High Country is an existing Three.js/WebGPU browser game. This harness installation does not change gameplay requirements. Visual and measurement rules already encoded in `.claude/skills/` and `docs/` remain in force.

# Technical Requirements

- Canonical project state lives in `.ai/`.
- Model-role mappings live in configuration, not source.
  - _2026-09-10: not met in this environment — no router (`airoute` / `hc-agent` / `~/.ai-harness`) is installed. The requirement text is unchanged; this is a status note._
- OpenAI access prefers Codex ChatGPT authentication.
- Separately billed OpenAI API usage is disabled unless explicitly enabled.

# Visual Requirements

(none recorded)

# Performance Requirements

- Conserve premium model usage, especially GPT-6 Astra.
- Downshift after expensive inferences.

# Acceptance Criteria

- Agents read `.ai/REQUIREMENTS.md`, `.ai/HANDOFF.md`, and `.ai/ROUTING.md` before substantive work.
- Astra is not used for ordinary implementation, exploration, tests, or visual iteration.

# Constraints

- Do not silently alter these requirements.
- Do not commit credentials, OAuth tokens, or secret environment values.

# Deferred Requirements

(none recorded)
