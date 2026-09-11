# Canonical AI project state

This directory is shared by Claude Code, Codex CLI, Cursor, and local harnesses. Load only the compact bootstrap by default.

| File | Purpose |
|---|---|
| `STATE.json` | Mandatory compact resume state. |
| `REQUIREMENTS.md` | Durable requirements. Do not silently change them. |
| `DECISIONS.md` | Meaningful decisions only. |
| `ROUTING.md` | Model-routing policy. |
| `HANDOFF.md` | Optional current checkpoint; never mandatory startup context. |
| `history/` | Retrieval-only historical checkpoints and superseded detail. |
| `metrics/routing.jsonl` | Routing telemetry, local-only. Generated on the first routed run; absent until then. |
| `runtime/` | Transient files. Git-ignored. |
| `hoh/` | Generation-1 HoH campaign overlay driven by `~/.hc-agent/bin/hc-agent`. Campaigns are git-ignored. |

Do not store credentials here.

Do not load all of `.ai/` or all campaign evidence at startup. Follow paths from STATE and campaign indexes as needed.
