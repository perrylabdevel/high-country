# Decisions

Meaningful architectural and process decisions only. Do not record trivial edits.

## 2026-09-06 — Install shared multi-model AI harness

Context:
The repo already had Claude Code skills for measurement-first visual work, but no shared `.ai/` state and no runtime router for OpenAI roles.

Decision:
Adopt `~/.ai-harness` / `airoute` as the common router. Claude Code remains the interactive orchestrator. OpenAI models are reached through Codex CLI with ChatGPT authentication. Default roles are Luna/Terra/Sol/Astra.

> **2026-09-10 — superseded in this environment:** `airoute`, `hc-agent`, and `~/.ai-harness` are not installed here. The decision stands for environments that have the router; in this environment, work is done in-session without it.

Reason:
Conserve premium allowance, especially Astra, while keeping High Country's existing measurement skills intact.

Alternatives considered:
- Hard-coding models in CLAUDE.md
- Using Claude `--model` to select OpenAI models (not supported)
- Enabling separately billed OpenAI API fallback (rejected)

Consequences:
Agents must read `.ai/` before substantive work. Astra requires an escalation packet and is limited to one call per campaign by default.
