# Creative Pillars — LOCKED

Locked 2026-08-28, per the autonomy handoff. These are the outcomes the project
exists to deliver. The living requirements in `state/requirements.json` must
serve them; no requirement, campaign, or grader result may weaken them.

**What "locked" means.** An agent may *clarify* a pillar (sharpen its wording,
add a measurable test for it) but may not delete it, lower it, redefine it to
match a weak implementation, or mark it satisfied without independent artifact
evidence recorded in `state/decisions.jsonl`. Pillar changes require the
highest decision tier (see `state/roles.json`) and are the one class of change
that the autonomous loop pauses for.

---

## P1 — A believable, explorable Western territory

The world rewards travel and discovery. Distance has texture: routes read as
routes, places read as places, arriving somewhere is an event and not just a
label change. Procedural systems (terrain, roads, creeks, scatter) must read as
a coherent land, never as an algorithm.

## P2 — A family-centered dramatic identity

High Country is about the Calder family holding their ranch and valley, not a
generic shooting gallery. Conflict begins as stakes, reputation, and choice.
Violence, if it ever arrives, is a consequence the player walked into — and even
then the game remains about the family.

## P3 — Human scale

One world unit is one metre; the eye is at 1.62 m and that is the yardstick for
every dimension an agent touches: buildings, doors, props, NPCs, horses,
distances, prompts. If a number cannot be defended at human scale, it is wrong.

## P4 — Smallest playable loop first, then the Episode 1 slice

The deliverable is the game, not a map. Priority order for new work: make the
smallest complete loop genuinely playable (travel → arrival → interaction →
conflict/choice → consequence → return), then grow it into the coherent
Episode 1 slice ("Ashes on the Divide"). Placeholder content is scaffolding,
never the goal.

## P5 — Meaning has structure

A playable moment has: meaningful travel, arrival, interaction, conflict or
choice, consequence, and return. A screen, a line of dialogue, or a marker that
does not end in consequence is unfinished, not shipped.

## P6 — Visual cohesion over procedural reads

The world must not read as procedural placeholders. Visual polish is pursued
through the existing measured instruments (audit passes, targeted captures,
dry-build checks) and is verified perceptually only where genuinely perceptual.

## P7 — Stable, performant, playable on the desktop-browser target

WebGPU is the baseline; WebGL2 is diagnostic only. Frame time, draw calls, and
memory are budgets, not aspirations. A change that destroys interaction or
performance is not a change that "also improved" something else.

## P8 — Accessibility, save/load stability, and failure recovery are production requirements

Progress survives a reload. Controls and prompts are discoverable and legible.
When the renderer or an asset fails, the player gets recovery, not a black
screen. These are requirements, not nice-to-haves.

## P9 — Honest reporting

Skipped, substituted, failed, and unverified work is labeled as such in commits,
reports, and the decision log. The builder is never the sole grader of its own
work. Screenshots are regenerable evidence; reports, requirements, and decision
records are durable.