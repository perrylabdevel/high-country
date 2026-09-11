---
name: expert
description: Escalate a compact architecture or unresolved-strategy decision to the Expert role (GPT-6 Astra) via airoute. Never use for ordinary coding.
disable-model-invocation: true
---

# /expert

> `airoute` is not on PATH in this environment. Use an available native expert router when present.

Astra is scarce. Do not use this for ordinary implementation, exploration, tests, or visual iteration.

1. Read `.ai/STATE.json` and relevant task evidence. Read HANDOFF/history only for a named missing detail.
2. Collect missing evidence with Scout/Worker/Senior first.
3. Start a fresh expert invocation; never resume or forward the working transcript.
4. Write a packet with exactly the headings in `.ai/ROUTING.md`, preferably below 10K tokens. Summarize logs and prior model prose; reference source files/symbols and screenshot paths instead of dumping them.
5. Show the routing reason and estimated packet size.
6. Run the available EXPERT route with the packet.
7. Save the decision in `.ai/DECISIONS.md` and downshift to Worker.

If the campaign expert limit is reached, stop unless the user explicitly overrides.
