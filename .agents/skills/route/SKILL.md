---
name: route
description: Classify a task with airoute and optionally delegate it. Use when the user says route this, pick a model, or wants automatic OpenAI role selection.
disable-model-invocation: true
---

# /route

1. Read `.ai/HANDOFF.md` and `.ai/ROUTING.md` if this is substantive work.
2. Run `airoute route "<task>"` to classify. Do not invoke Astra to choose a model.
3. If the user asked only for a recommendation, stop after showing the role and reason.
4. If they asked to run it, use `airoute run auto "<task>"`.
5. For EXPERT, build the packet from `.ai/ROUTING.md` first. Never smoke-test Astra.
