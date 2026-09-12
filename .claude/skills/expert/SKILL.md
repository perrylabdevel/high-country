---
name: expert
description: Ask GPT-6 Astra for one high-impact architecture or unresolved strategy decision. Do not use for implementation or routine debugging.
disable-model-invocation: true
---

# Expert

Use existing evidence to create a fresh, compact decision packet. Gather more evidence first only when the decision is blocked; do not force a Scout → Worker → Senior chain as ceremony.

Give Astra this brief:

> Determine the underlying issue and best course of action from the supplied evidence. Explore alternative explanations when warranted; prior hypotheses are not binding. Do not implement. Return the decision, concise rationale, material risks, and recommended next action.

Include only task-relevant facts. The optional packet fields in `.ai/ROUTING.md` are a content guide, not required headings. Keep the packet below 10K tokens and usually much smaller. Never resume or forward the working transcript.

The invocation is packet-only, outside the project tree, with no repository or tool access. Respect the campaign expert-call limit. Record a meaningful decision in `.ai/DECISIONS.md`, then hand implementation to Worker.
