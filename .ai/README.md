# Canonical AI project state

This directory is shared by Claude Code, Codex CLI, Cursor, and `airoute`.

| File | Purpose |
|---|---|
| `HANDOFF.md` | Living checkpoint. Keep it short. |
| `REQUIREMENTS.md` | Durable requirements. Do not silently change them. |
| `DECISIONS.md` | Meaningful decisions only. |
| `ROUTING.md` | Model-routing policy. |
| `STATE.json` | Machine-readable campaign/budget/expert-call state. |
| `metrics/routing.jsonl` | Routing telemetry. Local-only by default. |
| `runtime/` | Transient files. Git-ignored. |
| `hoh/` | Generation-1 HoH campaign overlay (`hc-agent`). Campaigns are git-ignored. |

Do not store credentials here.

Initialize another repository with `airoute init`.
