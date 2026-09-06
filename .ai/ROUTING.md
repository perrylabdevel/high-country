# Model Routing Policy

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

Before EXPERT, build a compact escalation packet unless `--force`:

```text
# Objective
# Expected Behavior
# Actual Behavior
# Reproduction
# Evidence
# Relevant Files
# Attempts Already Made
# Current Hypotheses
# Exact Decision Needed
```

Soft warning above 20K estimated tokens. Strong warning above 50K.

Default `maxExpertCallsPerCampaign = 1`. A second Astra call needs new evidence, an unexpected result after implementing the last expert decision, or an explicit override.

Astra should think, diagnose, decide, plan, and hand off. After that, return to Terra.

## Failure escalation

Mechanical failures (typo, syntax, missing import, bad filename) stay on Worker/Scout.

Substantive Worker failure may justify Senior.

Substantive Senior failure first collects new evidence with Scout, then consider Expert.

## Claude Code

Claude is the orchestrator and may do work itself. Delegate to `airoute` when OpenAI roles are useful. Do not double-call models for trivial questions.

## Manual override

```text
airoute run scout "<task>"
airoute run worker "<task>"
airoute run senior "<task>"
airoute run expert "<task>"
```
