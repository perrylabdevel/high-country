# Product requirements

High Country is an existing Three.js/WebGPU browser game. This harness work does not silently change gameplay, visual intent, or measurement contracts already encoded in code, `.claude/skills/`, and `docs/`.

## Hard invariants

- Do not weaken or bypass an existing check to make a change pass.
- Do not replace `scripts/grade.mjs` or its comparison method without an explicit request.
- Ground visual claims in relevant rendered evidence from the affected viewpoint and shipping backend.
- Report what was and was not verified; never imply an unrun check passed.
- Do not silently alter requirements.
- Do not commit credentials, OAuth tokens, or secret environment values.

## Completion outcomes

- The requested behavior works.
- The behavior materially affected by the change is verified.
- No known related regression is left unexplained.
- Premium model usage, especially GPT-6 Astra, is conserved.
- Durable history remains available without becoming default active context.

## Context and routing outcomes

- `AGENTS.md` or `CLAUDE.md` supplies the always-on repository guidance.
- Read `.ai/STATE.json`, `.ai/REQUIREMENTS.md`, and `.ai/ROUTING.md` according to the task-specific map in the repository guidance. HoH may embed the compact set for tool-less roles.
- `.ai/HANDOFF.md` and `.ai/history/` remain retrieval-only.
- Astra is not used for ordinary implementation, exploration, tests, or visual iteration.
- Astra receives a fresh compact decision packet, never a working transcript.

## Techniques, not universal gates

Measurement, captures, full-suite checks, grading, fault injection, critic review, and repeated passes are available when they materially increase confidence. They are not all required for every prompt or edit. Prefer targeted verification; broaden it based on scope, risk, or evidence.
