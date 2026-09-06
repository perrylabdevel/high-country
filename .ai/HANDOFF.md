# Current Objective

Install the multi-model coding harness

# Current State

Harness initialized. No active campaign.

Harness installed. Existing High Country measurement skills preserved.

Git status:
```
## main...origin/main
 M .gitignore
 M src/buildings.js
 M src/dev/panel.ts
 M src/landmarks.js
 M src/main.js
 M src/map.js
 M src/materials/settings.ts
 M src/materials/splatMap.ts
 M src/materials/terrainMaterial.ts
?? .ai/
?? .claude/skills/checkpoint/
?? .claude/skills/expert/
?? .claude/skills/route/
?? .claude/skills/scout/
?? .claude/skills/senior/
?? .claude/skills/worker/
?? .cursor/
?? AGENTS.md
?? CLAUDE.md
?? audit/evidence/nav-routes-2026-09-06T00-51-51.json
?? audit/evidence/nav-routes-2026-09-06T00-55-02.json
?? audit/evidence/nav-routes-2026-09-06T01-01-07.json
?? audit/evidence/nav-routes-2026-09-06T02-00-38.json
?? audit/evidence/nav-routes-2026-09-06T02-01-37.json
?? audit/evidence/nav-routes-2026-09-06T02-06-05.json
```

Recent commits:
```
b8cc7a5 Refactor creek rendering and lake interaction in landmarks.js
58dd2dd A hitching rail stood across the gateway approach with one post in the middle of the corridor, and the gate itself was two bare sticks under a floating slat with the "doors" flat against the wall reading as patches
6e61672 Creeks were straight hoses clipped by terrain triangles, and the lake rim was a smooth ellipse the ground kept sawtoothing through
cf895f4 The water read as painted navy: a non-wrapping noise lattice seamed a grid into every surface, foam striped every shore and filled the creeks solid, and the colour mix never let the bottom or the sky through
7aaa626 Road traffic rode the polylines blind: the figure kit's mounted seat hung the boots backward, and the box-horse's legs stopped 28 cm above the ground
```

# Architecture

Canonical AI state lives in `.ai/`. Claude Code is the interactive orchestrator. OpenAI models are reached through `airoute` / Codex CLI.

# Relevant Files

- `.ai/REQUIREMENTS.md`
- `.ai/ROUTING.md`
- `.ai/STATE.json`
- `.claude/skills/` (existing measurement skills plus new router skills)
- `docs/HARD_WON.md`
- `docs/VISUAL_STATUS.md`

# Completed Work

- Project initialized with the shared AI harness.

# Known Failures

(none recorded)

# Important Decisions

- Premium models, especially Astra, are reserved for exceptional decisions.

# Verification Status

unknown

# Current Hypotheses

(none recorded)

# Next Actions

- In this repo: `claude`
- Delegate with `airoute run auto "<task>"` or `/scout` `/worker` `/senior` `/expert`
- Continue the in-progress navigation/visual work without using Astra unless an architecture decision is actually blocked
