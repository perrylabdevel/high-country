# Canonical AI project state

This directory is shared by Claude Code, Codex CLI, Cursor, and `airoute`. Availability (2026-09-10): `airoute` is not installed in this environment — work in-session and do not invoke it.

| File | Purpose |
|---|---|
| `HANDOFF.md` | Living checkpoint. Keep it short. |
| `REQUIREMENTS.md` | Durable requirements. Do not silently change them. |
| `DECISIONS.md` | Meaningful decisions only. |
| `ROUTING.md` | Model-routing policy. |
| `STATE.json` | Machine-readable campaign/budget/expert-call state. |
| `metrics/routing.jsonl` | Routing telemetry, local-only. Generated on the first routed run; absent until then. |
| `runtime/` | Transient files. Git-ignored. |
| `hoh/` | Generation-1 HoH campaign overlay (driven by `hc-agent`, which is not installed in this environment). Campaigns are git-ignored. |

Do not store credentials here.

Initialize another repository with `airoute init` (not available in this environment).
