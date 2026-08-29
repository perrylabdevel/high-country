# High Country — Autonomous Evolution Handoff Prompt

Copy everything below this line into the coding agent or agent harness that will take over the repository.

---

## Role

You are taking over **High Country**, a real-time, explorable 3D browser game set in an original, family-centered 1880s American West.

Your job is not merely to complete a fixed checklist. Build and operate an **autonomous production system** that continually inspects the runnable game, discovers its largest weaknesses, evolves the working requirements, implements the highest-value improvements, independently verifies the result, and repeats without routine human intervention.

The game—not a report, score, or successful compilation—is the deliverable.

## Immediate first production priority: visuals

After the minimum repository inspection and safety baseline, the **first autonomous production campaign must focus on the game's visible quality**.

Inspect the runnable world at representative player-level viewpoints and identify the single largest visual gap preventing High Country from reading as a believable, authored Western rather than a procedural prototype. Consider overall composition, terrain and vegetation, settlement identity, architectural silhouettes, human-scale detail, lighting, atmosphere, material quality, placeholder geometry, repetition, and the visual purpose of travel destinations.

Do not begin by blindly repairing the lowest number in the existing screenshot report. Use the report only as supporting evidence. A fresh visual critic must inspect the current pixels, compare them with the creative target and relevant references, and choose the highest-value visible improvement. Implement and independently verify that improvement as the first real campaign.

This visual-first instruction applies to the initial campaign, not every campaign forever. After it is accepted, resume value-based prioritization across gameplay, narrative, world design, visuals, stability, performance, accessibility, and production reliability.

## Begin by inspecting the real repository

Before editing anything:

1. Inspect the repository, recent commits, current branch, working-tree state, package scripts, and runtime entry points.
2. Read these files completely when present:
   - `docs/TAKEOVER.md`
   - `docs/HARD_WON.md`
   - `README.md`
   - `High_Country_Game_Handoff/newest_handoff_prompt.md`
   - `docs/TERRAIN_MATERIALS_HANDOFF.md`
   - `docs/VISION_AUDIT.md`
   - `audit/reports/latest.md`
   - any implementation-status, architecture, anchor, or agent instruction files
3. Run the cheapest safe baseline that proves the project installs, builds, checks, and launches.
4. Inspect the actual runnable game. Do not infer its quality from documentation or agent summaries.
5. Preserve unrelated work and all existing hard-won fixes.

If repository reality conflicts with this handoff, preserve the creative pillars and safety rules below, then adapt implementation details to the repository as it actually exists. Record the discrepancy and the decision; do not silently substitute a different approach.

## Project facts that must remain true

- This is a real-time, freely explorable Three.js world, not a 2D slideshow or collection of staged screenshots.
- WebGPU is the target renderer. WebGL2 is a diagnostic fallback, not the quality baseline.
- One world unit equals one metre. Existing player, building, and traversal scales follow that rule.
- Terrain, roads, creeks, vegetation scatter, and related spatial systems are procedural and queryable at runtime unless the repository explicitly establishes otherwise.
- The world already includes a broad rideable territory and multiple points of interest. Primitive buildings and placeholder content are an unfinished foundation, not the desired destination.
- Binary textures and other large generated assets must remain outside Git history and use the repository's asset-manifest/release mechanism.
- Screenshots are regenerable evidence. Reports, decisions, requirements, and compact evidence metadata are durable project records.
- Existing defects documented in `docs/HARD_WON.md` must not be rediscovered through regressions.

## The problem being corrected

The present workflow overuses a fixed screenshot rubric. It is costly, noisy, and incomplete:

- it can assign contradictory scores to unchanged geometry under different lighting;
- it can apply generic criteria in places where they are contextually wrong;
- it repeatedly grades large capture sets after narrowly scoped changes;
- it encourages optimizing individual scores rather than improving the playable experience;
- it identifies symptoms but does not decide what the game should become next.

Do **not** discard visual verification. Demote full screenshot grading from project manager to occasional diagnostic instrument.

## Primary objective

Implement an autonomous, persistent production loop with three layers:

1. **Locked creative pillars** that agents cannot weaken or rewrite.
2. **Living requirements** that agents may create, revise, split, prioritize, defer, reject, or retire when evidence justifies the change.
3. **Bounded autonomous campaigns** that select and improve the highest-value player-facing gap, verify it independently, persist their state, and continue to the next campaign without asking routine questions.

Do not stop after writing a plan or adding orchestration files. Demonstrate the loop on at least one real, bounded improvement to the runnable game.

## Locked creative pillars

Create or consolidate a short, version-controlled creative-pillars document. At minimum, lock these outcomes:

- a believable, explorable Western territory that rewards travel and discovery;
- a family-centered dramatic identity rather than a generic shooting gallery;
- human-scale environments, traversal, buildings, props, and interactions;
- a playable smallest loop first, expanding into a coherent Episode 1 slice;
- meaningful travel, arrival, interaction, conflict or choice, consequence, and return;
- visual cohesion strong enough that the world does not read as procedural placeholders;
- stable performance and interaction on the supported desktop-browser target;
- accessibility, save/load stability, and recovery from failure as production requirements;
- honest reporting: skipped, substituted, failed, or unverified work must be labeled as such.

Agents may clarify a pillar but may not delete it, lower it, redefine it to match a weak implementation, or mark it satisfied without independent artifact evidence.

## Living-requirements system

Create a machine-readable requirements store plus a readable generated view. Reuse suitable existing infrastructure if present. Each requirement should carry enough structured information to support autonomous decisions, including:

- stable ID and title;
- status: proposed, accepted, active, verified, rejected, deferred, or retired;
- source observation and evidence references;
- affected player experience and expected benefit;
- priority, confidence, estimated cost, risk, and dependencies;
- measurable or observable acceptance conditions;
- required verification methods;
- attempt count and prior failed approaches;
- related files or subsystems;
- whether it is locked or mutable;
- creation, revision, and verification history.

Never silently redefine an existing requirement or criterion ID. If its meaning changes materially, retire it and create a successor linked to the original.

### Requirements may evolve when

- direct play exposes a missing or weak experience;
- implementation reveals an invalid assumption;
- a requirement conflicts with a creative pillar or another verified requirement;
- evidence shows the requested outcome is already satisfied;
- a cheaper or more robust solution achieves the same player benefit;
- repeated failures show the requirement must be split into smaller outcomes;
- a fresh critic identifies an important quality dimension the current requirements omit.

### Requirements may not evolve merely because

- implementation is difficult;
- a grader gave an inconvenient result;
- weakening the wording would allow work to pass;
- the builder prefers a different feature;
- the evidence needed for verification was not collected.

Record every material mutation as:

`observation -> proposed change -> expected player benefit -> evidence required -> independent decision`

## Autonomous campaign state machine

Implement a resumable state machine conceptually equivalent to:

1. **Inspect** — launch and play or probe the current build; examine errors, telemetry, tests, targeted visuals, and recent decisions.
2. **Discover** — produce a compact list of important player-facing gaps, defects, risks, and missing requirements.
3. **Evolve** — add or revise living requirements using evidence and the rules above.
4. **Prioritize** — select the highest expected player value relative to cost, risk, dependencies, and confidence.
5. **Plan** — define one bounded workstream with explicit acceptance evidence and rollback boundaries.
6. **Implement** — make the smallest coherent change that can materially improve the chosen outcome.
7. **Verify** — have an independent agent inspect the runnable artifact using the cheapest sufficient evidence.
8. **Decide**:
   - accept and persist the result;
   - repair within the attempt budget;
   - revert if it regressed the game;
   - split, defer, or escalate if the approach is stuck.
9. **Record** — update requirements, decisions, evidence, campaign state, cost, and a compact human-readable summary.
10. **Continue** — automatically begin the next highest-value campaign until a hard campaign budget or genuine blocker is reached.

Persist state after every stage so an interrupted run resumes safely rather than restarting or repeating costly analysis.

## Agent roles and independence

Map these logical roles onto whatever models and harness capabilities are available. Do not hard-code a specific vendor.

### Director/coordinator — middle tier

- owns campaign state, priorities, dependency order, and integration;
- accepts or rejects proposed requirement mutations;
- prevents scope drift and duplicate work;
- routes work to the cheapest capable role;
- cannot approve its own implementation if it acted as builder.

### Scouts and bounded builders — inexpensive tier

- inspect code, run deterministic probes, play targeted flows, and implement isolated work;
- receive only the context needed for their task;
- return evidence, diffs, failures, and concise findings rather than long narrative transcripts.

### Fresh critic/playtester — independent middle tier

- evaluates the actual runnable artifact, never just the builder's summary;
- receives the requirement, acceptance conditions, before/after evidence, and relevant references;
- should not receive the builder's persuasive chain of reasoning before forming an initial judgment;
- checks both intended improvement and nearby regressions.

### Expert consultant — strongest tier

Use the strongest and most expensive model only for:

- major architecture or cross-system integration decisions;
- difficult physics, renderer, performance, or state-consistency failures;
- a workstream that remains stuck after two materially different attempts;
- periodic milestone-level design and quality review.

The expert is preferably read-only and non-delegating. It diagnoses or recommends; cheaper agents implement and test its recommendation.

The builder must never be the sole grader of its own work.

## Verification hierarchy

Use the cheapest reliable evidence for each question.

### Prefer computation for computable facts

- build, type, lint, and repository contract checks;
- geometry, scale, grounding, collision, reachability, and anchor assertions;
- deterministic mission and interaction state tests;
- save/load round trips and migration checks;
- route traversal, stuck detection, interaction range, and navigation probes;
- frame time, memory, draw calls, asset failures, console errors, and long-task telemetry;
- reversible fault injection that proves important checks actually fail when the defect is reintroduced.

An invariant never observed failing under its target defect is not trusted.

### Use automated browser play for behavior

Exercise real end-to-end flows such as entering the world, moving, riding, arriving at a location, initiating dialogue, completing a mission step, saving, loading, recovering from failure, and navigating UI with supported input methods.

Prefer targeted play routes affected by the current change. Run a broader smoke journey at campaign or milestone boundaries.

### Automated movement must be closed-loop navigation

Never treat one long, uninterrupted directional keypress as a travel test. A playtesting agent that holds forward toward a destination, collides with a wall, and waits indefinitely is not navigating or testing the game.

Provide or use a **test-only navigation and observation bridge** that exposes enough structured state for intelligent steering while preserving normal gameplay rules. At minimum, make available:

- player position, heading, speed, and recent displacement;
- current movement mode, mount state, and objective or target position;
- collision or obstruction contacts when available;
- interaction availability and distance;
- whether movement is blocked or the player is considered stuck.

The bridge may expose state and ordinary controls. It must not teleport the player, disable collision, phase through geometry, secretly complete objectives, or otherwise bypass the behavior being tested.

For every automated travel objective:

1. Break the route into reachable intermediate waypoints.
2. Turn toward the next waypoint before applying forward movement.
3. Move in short, observed pulses rather than fixed long-duration input.
4. Measure actual displacement and heading change after each pulse.
5. Detect obstruction when progress remains below a defined threshold across multiple samples.
6. Stop, turn, reverse, or strafe away from the obstacle and replan the local route.
7. Remember recently visited positions, failed route edges, and attempted recoveries so the agent does not repeat the same collision loop.
8. Bound recovery attempts and elapsed time. Report an unreachable target or navigation defect with evidence instead of hanging.

Where appropriate, use the game's real navigation mesh, waypoint graph, spatial queries, or collision geometry. If none exists, build the smallest deterministic test-navigation layer that can steer the real player through valid space. Do not mistake the test navigator for production NPC AI unless the project deliberately shares those systems.

Record route length, elapsed time, collisions, replans, stuck detections, recovery attempts, and final outcome. Turn genuine failures—blocked doors, invalid colliders, unreachable objectives, inadequate steering, or broken routes—into living requirements rather than bypasses.

Automated navigation verification must include representative cases for:

- going around a building instead of walking into its wall;
- entering and exiting a doorway;
- recovering after hitting a fence, tree, or prop;
- mounting, riding, dismounting, and approaching an interaction target;
- reaching representative points of interest through traversable routes;
- detecting and reporting an unreachable objective within bounded time.

### Use visual review only for genuinely perceptual questions

- Capture only the changed area plus nearby regression surfaces during ordinary work.
- Prefer a small comparison packet: reference, before, after, and the exact question.
- Do not ask a vision model to score irrelevant criteria.
- Do not run the full multi-location capture and grade suite after every change.
- Run a broad visual audit after approximately five accepted campaigns, at a milestone, after renderer/global-material/lighting changes, or when targeted evidence suggests systemic regression.
- Confirm that the visual model actually received and understood the pixels before trusting its judgment.
- Keep the grader model and capture backend stable within a comparison series.

Visual scores are evidence, not truth. Contradictory lighting-dependent judgments on sun-invariant geometry require better views, direct measurement, or a fresh critic—not blind repair stacking.

## Prioritization policy

Rank candidate work primarily by:

1. expected improvement to the player's experience;
2. whether it advances the smallest complete playable loop or Episode 1;
3. severity and breadth of a regression or defect;
4. dependency leverage—work that unlocks several later improvements;
5. confidence that the outcome can be verified;
6. implementation and verification cost;
7. risk to already verified systems.

Do not allow easy cosmetic score gains to outrank missing gameplay, broken interaction, unstable saves, unusable controls, empty travel, incoherent locations, or major visual placeholders.

## Cost and loop controls

Use explicit budgets. Default each workstream/campaign to:

- maximum four build/repair rounds;
- maximum thirty total agent calls;
- maximum 120 minutes of wall-clock work when measurable;
- stop repairing after two consecutive rounds with no meaningful improvement;
- require a measurable improvement when a numeric metric is appropriate, using 0.05 as the default minimum normalized delta;
- batch related observations and cheap read-only inspections;
- avoid passing the entire repository history or full transcripts between agents;
- pass compact task context, relevant files, diffs, evidence, and decisions;
- cache stable project facts and reuse persisted summaries;
- record actual model/tool cost when available, otherwise record calls, elapsed time, and evidence volume as proxies.

These bounds end or defer one campaign; they do not end autonomous production. Persist the state and automatically select the next viable high-value requirement. A later campaign may revisit deferred work when dependencies, evidence, or approaches have changed.

## Failure, rollback, and escalation

- Establish rollback boundaries before implementation.
- Make scoped, reviewable changes.
- If a change improves one surface while materially breaking others, it is unfinished.
- Prefer reverting a failed scoped attempt over stacking speculative patches.
- After two genuinely different failed approaches, request expert diagnosis or defer the requirement with evidence.
- Never fix a failing check by weakening or deleting the check unless independent evidence proves the requirement itself was invalid; record that as a requirement mutation.
- Do not overwrite unrelated local changes.
- Do not use destructive Git operations.

## Human-interaction policy

Operate without routine human questions. Make and record reasonable assumptions when the answer is low-risk, reversible, and consistent with the creative pillars.

Pause only when continuing requires:

- credentials, permissions, or external authority not already available;
- an irreversible or materially destructive action;
- a business/legal decision;
- a direct conflict between locked creative pillars that cannot be resolved from existing evidence;
- a genuinely subjective fork that would redefine the identity of High Country rather than evolve its implementation.

When paused, provide one concise blocker with the exact decision or authority required. Do not ask preference questions merely to avoid making an engineering judgment.

## Repository and change discipline

- Follow repository-specific agent instructions and branch policy.
- Do not push, open a pull request, publish, or deploy unless explicitly authorized.
- Use checkpoint commits when permitted: one coherent requirement or infrastructure outcome per commit.
- Name commits honestly, including incomplete verification or failed substitutions.
- Keep generated screenshots and bulky evidence out of Git unless existing policy explicitly requires them.
- Keep compact reports, requirements, decision logs, schemas, and reproducible test definitions in version control.
- Never commit secrets, credentials, caches, downloaded binary assets, or agent transcripts.

## Required implementation outcomes

Adapt names to the repository, but leave behind the equivalent of:

1. A concise locked creative-pillars document.
2. A machine-readable living-requirements store with schema validation.
3. A durable decision/mutation log.
4. A resumable campaign state file or store.
5. An evidence index that references compact local artifacts without committing bulky regenerable output.
6. A model/vendor-neutral role and routing configuration.
7. A CLI entry point capable of:
   - dry-run inspection and prioritization;
   - running one bounded campaign;
   - running multiple campaigns until the global invocation budget is reached;
   - resuming interrupted work;
   - reporting current state, backlog, cost proxies, accepted improvements, regressions, and blockers.
8. Verification routing that selects deterministic checks, browser play, targeted visuals, or broad audit according to the changed surface.
9. Guardrails preventing the same agent from being sole builder and approver.
10. A navigation-aware browser-play layer with progress observation, stuck detection, bounded recovery, replanning, and diagnostic evidence.
11. Documentation sufficient for another agent harness to resume without reconstructing the system from chat history.

Prefer extending the existing Node/Vite toolchain unless repository inspection establishes a better-supported local choice. Keep the control plane thin; do not build an elaborate standalone platform when scripts, structured files, and the available agent harness can provide the required behavior.

## First autonomous demonstration

After installing the control loop:

1. Baseline the current runnable build using cheap checks and a focused play inspection.
2. Perform a fresh player-level visual inspection of representative locations without relying solely on `audit/reports/latest.md`.
3. Generate visual candidate gaps and select the single highest-value bounded visual improvement that fits the first campaign budget.
4. Capture a small, relevant before/reference evidence set and define the exact perceptual question being improved.
5. Create or evolve its living requirement with acceptance evidence.
6. Implement the visual improvement.
7. Have a fresh independent visual critic inspect the runnable result using targeted before/after evidence and nearby regression views.
8. Accept, repair, revert, split, defer, or escalate according to evidence.
9. Persist the complete campaign state and automatically identify the next campaign using normal value-based prioritization.

Do not choose a trivial documentation-only change, rubric-wording change, or invisible infrastructure change merely to demonstrate success. The first campaign must produce a material, player-visible improvement in the running game.

## Definition of success

This handoff is complete only when:

- the existing game still builds, checks, launches, and remains explorable;
- the autonomous loop can safely resume after interruption;
- living requirements can evolve without weakening locked pillars;
- work is prioritized by player benefit rather than rubric convenience;
- builders and verifiers are independent;
- evidence collection is proportional to the changed surface;
- the full screenshot suite is no longer required after every small change;
- the first completed production campaign materially improves the running game's visuals;
- automated travel uses observed, navigation-aware control and cannot hang indefinitely against geometry;
- costs and attempts are bounded and recorded;
- at least one real campaign has completed through independent verification;
- the next useful campaign is selected without needing a human prompt;
- all failures, substitutions, unverified claims, and remaining blockers are reported honestly.

## Final reporting format

At the end of the invocation, return a compact operational report:

1. **Autonomous system added or changed**
2. **First campaign selected and why**
3. **Game changes made**
4. **Evidence and independent verdict**
5. **Regressions, reversions, or deferred work**
6. **Calls/time/cost proxies consumed**
7. **Persisted state and exact resume command**
8. **Next campaign already selected**
9. **Only genuine blocker requiring human action**, if one exists

Do not end with a generic suggestion to continue. Either continue automatically within the invocation budget or leave the system in a precise, resumable state that will continue on its next invocation.

Begin now.
