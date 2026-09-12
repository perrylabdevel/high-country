# Model routing policy

> **Status (2026-09-10):** Generation-1 `hc-agent` and shared `~/.ai-harness` are installed. `airoute` is not on PATH.

Role, model, and provider are separate. Mappings live in `~/.ai-harness/config/models.json` and optional project overlays.

| Role | Default model | Use |
|---|---|---|
| SCOUT | GPT-5.6 Luna | Focused search, inventories, reproduction, logs, screenshots, mechanical checks |
| WORKER | GPT-5.6 Terra | Default implementation, ordinary fixes, refactors, UI |
| SENIOR | GPT-5.6 Sol | Difficult debugging, cross-subsystem reasoning, competing strategies |
| EXPERT | GPT-6 Astra | High-impact architecture or an unresolved Senior decision |

## Principles

Cheap models collect; normal models build; strong models solve; cheap models verify. Route every inference independently and downshift after a strong-model decision.

Prompts should define the outcome, critical evidence, hard constraints, and stop condition. Do not turn optional techniques into a mandatory itinerary. Luna may receive a concrete checklist when the task benefits from it; Terra should get clear acceptance criteria; Sol and Astra should get progressively less procedural scaffolding.

A failed compile, typo, missing import, or bad filename is not an escalation. Use Senior for a genuinely difficult or cross-subsystem problem. Use Expert only when the remaining decision has high leverage and existing evidence is insufficient for a lower tier.

## Budgets

HoH hard-stops Planner, Visual, and Expert on any tool start; Developer if tool 11 starts; and Tester if tool 7 starts. Developer and Tester active context compact at 32K tokens. These are ceilings, not targets. A role should finish as soon as the outcome is supported.

Budget exhaustion stops the campaign and must not trigger an automatic retry or continuation. Default `maxExpertCallsPerCampaign = 1`.

Budget modes:

- `economy`: prefer Scout; Senior gated; Expert almost always explicit.
- `balanced`: default.
- `quality`: easier Senior review; Astra safeguards remain.

Quality mode does not mean “use Astra everywhere.”

## Astra firewall

Start EXPERT as a fresh packet-only invocation outside the project tree. Never forward a planner/developer/tester transcript, full source files, raw logs, screenshot bytes, tool output, or prior model prose.

Include only the information that helps the decision, usually some subset of:

- objective and desired behavior
- observed behavior and reproduction
- critical evidence
- relevant files or symbols
- attempts and current hypotheses
- the exact decision needed

This is a content guide, not a required nine-step checklist. Keep the packet below 10K tokens and usually much smaller. If it is too large, reduce it before invocation.

Use this minimal expert brief:

> Determine the underlying issue and the best course of action from the supplied evidence. Explore alternative explanations when warranted; prior hypotheses are not binding. Do not implement. Return the decision, concise rationale, material risks, and recommended next action.

Astra must not inspect the repository, call tools, implement, or verify. It may choose its own reasoning path and should not be given mechanical self-review or multi-pass instructions.

A second Astra call requires materially new evidence, an unexpected result after the prior decision was implemented, or an explicit override.

## Manual routing

```text
airoute run scout "<task>"
airoute run worker "<task>"
airoute run senior "<task>"
airoute run expert "<compact decision packet>"
```

`airoute run auto "<task>"` uses deterministic classification; it does not ask Astra to select a model.
