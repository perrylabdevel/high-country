# The autonomous evolution loop

How High Country evolves itself: a bounded production loop that inspects the
runnable game, discovers its largest player-facing gaps, evolves a living
requirements store, implements the highest-value improvement, verifies it
independently, and continues to the next campaign without routine human
questions.

**The game is the deliverable** — not a report, a score, or a successful
compilation. Locked creative pillars live in `docs/CREATIVE_PILLARS.md`; nothing
below may weaken them.

## The three layers

1. **Locked pillars** — `docs/CREATIVE_PILLARS.md`. Agents may clarify, never
   weaken, delete, or self-certify.
2. **Living requirements** — `state/requirements.json`, schema-validated by
   `scripts/loop/lib.mjs` (`node scripts/loop.mjs check-store`). Each carries
   id, status, evidence, priorities, acceptance conditions, verification
   methods, attempt history, and dependencies. Ids are append-only
   (`state/known-ids.json`): never redefine an id — retire it and create a
   successor linked in the history.
3. **Bounded campaigns** — `state/campaign.json`, a resumable state machine:
   selected → planned → implementing → verifying → accepted / reverted /
   deferred / escalated → next.

## Rules for mutating requirements

A requirement may evolve when play/evidence justifies it: a missing experience,
an invalid assumption, a conflict with a pillar, outcome already satisfied, a
cheaper equal-benefit solution, repeated failure demanding a split, or a
critic's insight about a missing dimension. It may **not** evolve because it is
hard, a grader was inconvenient, weakened wording would let work pass, the
builder prefers otherwise, or verification evidence was never collected.

Record every material mutation as a decision:

```sh
node scripts/loop.mjs check-store    # after editing state/requirements.json
node scripts/loop.mjs evidence add --kind observation --summary "what was seen"
```

and append the reasoning (`observation → proposed change → expected player
benefit → evidence required → decision`) to `state/decisions.jsonl` via the
evidence command above — a decision row is written by every CLI state change,
and the free-form reasoning belongs in `--summary`.

## Roles (model/vendor-neutral)

See `state/roles.json`. scout/builder are cheap; the director is the middle
tier; the critic must be independent of the builder; the expert is strongest,
read-only, and consult-only. On Claude Code: builders/critics are subagents
given only the context their role needs; the director is the main session.

**Hard guard, enforced by the CLI:** `campaign verify` refuses a verdict from
the same identity recorded as the campaign's builder. The builder is never the
sole grader of its own work.

## Verification hierarchy (cheapest sufficient evidence)

1. **Computation** — `npm run build`, `npm run check` (16 dry-build contracts),
   plus any new deterministic check the campaign adds. An invariant is only
   trusted if it has been observed failing under its target defect (HARD_WON
   §3.1) — prove a new check before trusting it.
2. **Browser play** — Playwright probes against the dev build drive real flows:
   enter, move, interact, dialogue, mission transitions, save/load, recovery.
   `scripts/probe-play.mjs` is the standard harness; write targeted routes per
   campaign.
3. **Visual review** — targeted captures only (changed area + nearby
   regression surfaces), small comparison packets with the exact question. The
   full 32-frame audit suite runs only after ~5 accepted campaigns, at a
   milestone, or after renderer/global changes — never per-change. The Cursor
   grader (`scripts/grade.mjs`) is the audit instrument, not the campaign
   verifier.

Fault injection belongs in tier 1: reintroduce the defect, watch the check
fail, restore.

## Campaign budgets (defaults)

max 4 build/repair rounds · max 30 agent calls · max 120 wall-clock minutes.
Stop repairing after two consecutive rounds with no meaningful improvement.
Require a ≥0.05 normalized delta when a numeric metric applies. Budgets end
one campaign, not production: close it, persist, and select the next.

## Resuming

All state stages persist immediately. `node scripts/loop.mjs resume` prints the
exact open campaign, its requirement, round count, and next command. An
interrupted run resumes there rather than redoing analysis.

## Loop commands

```sh
node scripts/loop.mjs status        # what the system knows
node scripts/loop.mjs dry-run       # inspect + ranked candidates (no writes)
node scripts/loop.mjs campaign select
# ... build; record each round:
node scripts/loop.mjs campaign note --stage implementing --text "..." --builder <id>
# ... then an INDEPENDENT verifier:
node scripts/loop.mjs campaign verify --verifier <id> --verdict accept|--verdict reject \
  --note "findings" --evidence E#
node scripts/loop.mjs campaign close --outcome accepted --note "..."
node scripts/loop.mjs campaign next # selects the next ranked requirement
```

## Stores

| Path | Content |
| --- | --- |
| `docs/CREATIVE_PILLARS.md` | locked pillars |
| `state/requirements.json` | living requirements (schema-validated) |
| `state/campaign.json` | current/resumable campaign |
| `state/decisions.jsonl` | append-only decision + mutation log |
| `state/evidence.json` | evidence index (compact, committed; bulky art stays under gitignored `audit/`) |
| `state/roles.json` | role tiers + routing + the builder≠verifier guard |
| `state/known-ids.json` | append-only requirement id set |

## Relationship to the vision-audit loop

The screenshot rubric (`docs/VISION_AUDIT.md`, `scripts/rubric.mjs`, the pass
reports) is demoted from project manager to occasional diagnostic instrument.
It still runs at milestones. It no longer gates small changes; deterministic
checks and play probes do. Report regeneration is still available and its
reports remain durable records.