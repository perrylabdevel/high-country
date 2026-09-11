# Current checkpoint

`STATE.json` is the canonical resume record and is the only checkpoint loaded at startup. This file is optional, deliberately compact, and should contain only details that do not fit STATE but are needed for the active task.

## Active work

- Context-flow audit and conservative harness redesign completed locally on 2026-09-10.
- The pre-redesign troubleshooting journal is preserved verbatim at `history/HANDOFF-2026-09-10-pre-context-redesign.md`.
- Full findings and before/after budget: `CONTEXT_AUDIT.md`.
- Astra approved the architecture conditionally; the harness now hard-stops an over-budget tool start and compacts Developer/Tester active context at 32K. Provider-internal retries remain observable, not pre-dispatch-controllable.

## Retrieval rule

Search the archive for a named subsystem, symptom, file, or decision. Never load the complete historical HANDOFF or campaign event logs into a model context.
