---
name: measured-experiment
description: The ship-or-revert loop for any visual or quality change. Use when improving how the game looks, or when told to keep improving the game continuously. Governs whether a change is kept.
---

# measured-experiment

This project improves by measurement, not opinion. Most changes that look
better are not better. The record is in `audit/reports/` — dozens of passes,
and **most were reverted after being measured**. That is the loop working, not
the loop failing.

## The goal rule

> A change ships only if it beats the current baseline on a double-checked
> pass. Otherwise it is reverted and logged.

Corollary already established: **procedural fallbacks stay until a bake beats
them.** Do not replace a working fallback with new art because the new art
seems nicer.

## The noise band

Recent passes have oscillated between **48 and 53 fails**. A change that moves
the count inside that band has proved nothing. Do not ship on a 1–3 fail
improvement and do not panic over a 1–3 fail regression. Look for the
*signature*: which specific criteria at which specific POIs moved, and does
that match what you changed?

## The loop

1. **Read the baseline.** `docs/VISUAL_STATUS.md` names the current
   double-checked pass and its fail count. Start there, not from memory.
2. **Pick ONE change.** From `docs/VISUAL_STATUS.md` (current baseline and
   open items) or the latest `audit/reports/pass-NN.md`. **Not**
   `docs/BACKLOG.md` — that is the narrative/episode plan, not visual work.
   **Not** `docs/VISION_AUDIT.md` §7 — that list is from pass 05 and is
   marked stale. One change per pass or the measurement is meaningless.
3. **Check the item is still real** before fixing anything. Docs here go
   stale faster than code. §7 item 4 said `check-buildings.mjs` "cannot
   fail"; a fault injection showed it fails correctly, naming every affected
   structure. The cheapest result in this loop is finding the work already
   done — then the deliverable is a doc correction carrying the evidence, and
   you skip the capture/grade cycle entirely.
4. **Make it.** Then run the `verify-change` skill.
5. **Capture.** Start the preview server and wait for it to answer 200
   first — `npm run capture` exits 1 with a navigation error if nothing is
   serving. Follow the `capture-poi` skill; it has the exact commands.
6. **Grade.** `npm run grade` writes a worksheet and an empty inbox.
   **You do not grade.** See "Never grade yourself" below.
7. **Compile.** `npm run grade -- --compile audit/reports/inbox.json`
   writes `pass-NN.md` and `pass-NN.json`. Exit 0 = the bar is met and the
   loop is over. Exit 2 = continue. Exit 1 = the run itself failed.
8. **Decide.** Beat the baseline outside the noise band, with a signature
   that matches your change? Ship. Otherwise `git revert` / restore.
9. **Log either way.** A reverted experiment is a result. Commit the pass
   report with a message saying what was tried, what it measured, and that it
   was reverted. The next agent must not retry it blindly.

## When a fault injection is the measurement

Steps 5–7 need the grader. Some work does not: anything whose success is a
command's exit code (a check that should fail and does not, a missing
invariant, a broken script) is measured by **fault injection** instead —
reintroduce the fault, confirm the failure, restore, confirm the pass. That
path is fully available to you. Prefer these items when you cannot grade.

**Confirm your injection took effect.** The first attempt at the roof
reproduction added 1.9 m inside `markRoof`, which `mate()` then overwrote —
a no-op that printed PASS and looked exactly like proof the check was blind.
An injection that does not inject looks identical to a check that cannot
fail. Verify the perturbation reached the thing you are testing.

## Never grade yourself

`scripts/grade.mjs` refuses external providers on purpose. The grader must
stay the same model across passes or **the numbers stop being comparable to
every previous pass in `audit/reports/`**, which destroys the only baseline
this project has. Run capture and compile; let the configured grader score.
If you cannot get a grade, stop and say so — do not substitute your own
judgement and do not guess scores.

## Before you change a shader or a material

Run the `measure-first` skill. Numbers first, edits second.
