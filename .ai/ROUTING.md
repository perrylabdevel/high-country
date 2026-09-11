# Model Routing Policy

> **Status (2026-09-10):** the local Generation-1 `hc-agent` and shared `~/.ai-harness` are installed. `airoute` is not on PATH.

Role, model, and provider are separate. Mappings live in `~/.ai-harness/config/models.json` and optional project overlays.

Default OpenAI hierarchy through Codex CLI (ChatGPT auth, not API billing):

| Role | Default model | Use |
|---|---|---|
| SCOUT | GPT-5.6 Luna | Search, inventories, logs, tests, reproduction, lint, screenshots, mechanical checks |
| WORKER | GPT-5.6 Terra | Default implementation, features, ordinary fixes, refactors, UI |
| SENIOR | GPT-5.6 Sol | Hard debugging, cross-subsystem issues, competing strategies, review after Worker failure |
| EXPERT | GPT-6 Astra | Architecture decisions, unresolved Senior analysis, high-impact tradeoffs |

## Pattern

Cheap models collect → normal models build → strong models solve → cheap models verify.

Every inference is routed independently. Never inherit an expensive tier from the previous call.

HoH hard-stops Planner, Visual, and Expert on any tool start; Developer if tool 11 starts; and Tester if tool 7 starts. Developer and Tester active context auto-compacts at 32K tokens. Budget exhaustion stops the campaign and must not trigger an automatic retry or continuation.

Examples:

- Astra architecture → Terra implementation
- Sol analysis → Terra implementation
- Terra implementation → Luna verification
- Luna evidence → Sol analysis

## Auto routing

`airoute run auto "<task>"` uses deterministic/rule-based classification. It does not ask Astra which model to use.

When uncertain between Scout and Worker: investigation → Scout, implementation → Worker. A compile error is not enough to escalate.

## Budget modes

- `economy` — prefer Scout; Senior gated; Expert almost always needs explicit escalation
- `balanced` — default policy
- `quality` — easier Senior review; Astra safeguards remain

Quality mode does **not** mean "use Astra everywhere."

## Astra firewall

Before EXPERT, start a fresh invocation and build this compact escalation packet:

```text
# Objective
# Expected Behavior
# Actual Behavior
# Reproduction
# Critical Evidence
# Relevant Files/Symbols
# Attempts Already Made
# Current Hypotheses
# Exact Decision Needed
```

Target less than 10K tokens, and usually much less. Do not include the working transcript, full source files, raw logs, screenshot bytes, tool output, or previous model responses. Summarize critical evidence and point to relevant files/symbols. Reject an automatic expert call when the packet exceeds 10K tokens until it is reduced.

The expert invocation must use a packet-only working directory outside the project tree so project bootstrap/history is not injected again. Astra may reason and return a decision but must not inspect the repository, call tools, implement, or verify.

Default `maxExpertCallsPerCampaign = 1`. A second Astra call needs new evidence, an unexpected result after implementing the last expert decision, or an explicit override.

Astra should think, diagnose, decide, plan, and hand off. After that, return to Terra; use Luna for verification.

## Failure escalation

Mechanical failures (typo, syntax, missing import, bad filename) stay on Worker/Scout.

Substantive Worker failure may justify Senior only when the planner explicitly sets `escalationRecommended` and supplies a non-empty reason. A first failed iteration does not justify Astra.

Only a repeated substantive failure in the same affected subsystem, after a Sol-planned attempt, may justify one packet-only Expert decision. Mechanical failures and unrelated later failures never count toward that threshold.

## Claude Code

Claude is the orchestrator and may do work itself. Delegate to `airoute` when OpenAI roles are useful. Do not double-call models for trivial questions.

## Manual override

```text
airoute run scout "<task>"
airoute run worker "<task>"
airoute run senior "<task>"
airoute run expert "<task>"
```
