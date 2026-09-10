---
name: expert
description: Escalate a compact architecture or unresolved-strategy decision to the Expert role (GPT-6 Astra) via airoute. Never use for ordinary coding.
disable-model-invocation: true
---

# /expert

> **Not available in this environment:** `airoute` is not installed. Do not invoke it; perform the work in-session.

Astra is scarce. Do not use this for ordinary implementation, exploration, tests, or visual iteration.

1. Read `.ai/HANDOFF.md`.
2. Collect missing evidence with Scout/Worker/Senior first.
3. Write a compact packet with the headings in `.ai/ROUTING.md`.
4. Show the routing reason and estimated packet size.
5. Run `airoute run expert --packet <file> "<decision needed>"`.
6. Save the decision in `.ai/DECISIONS.md` and downshift to Worker.

If the campaign expert limit is reached, stop unless the user explicitly overrides.
