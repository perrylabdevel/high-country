---
name: route
description: Classify a task with airoute and optionally delegate it. Use when the user says route this, pick a model, or wants automatic OpenAI role selection.
disable-model-invocation: true
---

# /route

> `airoute` is not on PATH in this environment. Use an available native role router or classify and work in-session.

1. Read `.ai/STATE.json` and `.ai/ROUTING.md` if this is substantive work. Read HANDOFF/history only for a named missing detail.
2. Run `airoute route "<task>"` to classify. Do not invoke Astra to choose a model.
3. If the user asked only for a recommendation, stop after showing the role and reason.
4. If they asked to run it, use `airoute run auto "<task>"`.
5. For EXPERT, build the packet from `.ai/ROUTING.md` first. Never smoke-test Astra.
