# Decisions

Meaningful architectural and process decisions only. Do not record trivial edits.

## 2026-09-06 — Install shared multi-model AI harness

Context:
The repo already had Claude Code skills for measurement-first visual work, but no shared `.ai/` state and no runtime router for OpenAI roles.

Decision:
Adopt `~/.ai-harness` / `airoute` as the common router. Claude Code remains the interactive orchestrator. OpenAI models are reached through Codex CLI with ChatGPT authentication. Default roles are Luna/Terra/Sol/Astra.

> **2026-09-10 correction:** `hc-agent` and `~/.ai-harness` are installed locally; only the `airoute` command is absent from PATH. HoH invokes `hc-agent` directly.

Reason:
Conserve premium allowance, especially Astra, while keeping High Country's existing measurement skills intact.

Alternatives considered:
- Hard-coding models in CLAUDE.md
- Using Claude `--model` to select OpenAI models (not supported)
- Enabling separately billed OpenAI API fallback (rejected)

Consequences:
Agents must read `.ai/` before substantive work. Astra requires an escalation packet and is limited to one call per campaign by default.

## 2026-09-10 — Bound active context; archive durable history

Context:
HoH experiment A consumed 5,425,790 aggregate input tokens in its first iteration. Per-request rollout telemetry showed that fresh roles were not receiving the whole prior role transcript; instead, repeated model/tool turns inside Developer and Tester replayed their own growing transcripts. The mandatory HANDOFF had also grown to 46,426 bytes.

Decision:
Mandatory startup is AGENTS/CLAUDE plus `.ai/STATE.json`, `.ai/REQUIREMENTS.md`, and `.ai/ROUTING.md`. HANDOFF and `.ai/history/` are retrieval-only. Planner and visual roles receive bounded packets without tools; Developer and Tester receive only current structured role artifacts with bounded tool output. Escalation is Luna evidence → Terra implementation → Sol difficult analysis → one packet-only Astra decision when still unresolved → Terra implementation → Luna verification.

Astra runs in a fresh external working directory with no repository transcript or tools. Its packet uses the nine headings recorded in ROUTING and must remain below 10K estimated tokens.

Reason:
Preserve durable knowledge while preventing historical bootstrap and same-role tool transcript replay from multiplying across backend requests. Prompt caching reduces compute but does not remove aggregate input-token accounting.

Consequences:
Historical checkpoints remain searchable in `.ai/history/`. Role telemetry records request counts, first/second/last input size, tool calls, output bytes, and budget violations. A real campaign is still needed to replace the conservative three-iteration projection with measured post-change aggregate usage.

### Astra review

A fresh 969-token architecture packet was sent from an external packet-only directory. Astra approved the design conditional on enforceable runaway-loop controls. The call used one backend request, 12,011 input tokens, 1,100 output tokens, zero cached input, and zero tool calls.

The local Codex CLI does not expose a supported pre-dispatch backend-request-count setting. The wrapper instead monitors completed rollout usage records: Planner/Visual/Expert are limited to one backend response, Developer to 11, and Tester to 7. It hard-stops any final allowed response that attempts another tool continuation, caps stored tool output at 4K tokens, and triggers active-context compaction at 32K. A live one-request Luna probe terminated after the first tool-producing response and recovered all 13,113 input tokens from the rollout. A single request already in flight cannot be preempted before its usage record exists.

Astra escalation also requires an explicit non-mechanical escalation recommendation, a repeated failure in the same affected subsystem, and evidence that the repeated attempt was planned by Sol. Unrelated failures no longer accumulate into an Expert call.
