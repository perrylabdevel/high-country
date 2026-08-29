/**
 * Episode 1's smallest playable loop — "Smoke on the North Wind".
 *
 * One complete circuit of travel, arrival, interaction, discovery,
 * consequence, and return, in the family-drama register (pillar P2):
 * Harlan sends you to the ridge; from the Ranch Overlook you glass the
 * burn line to the north; what you see (a fire line, burning green wood)
 * is deliberately set, which is the seed of Episode 1's conflict; you ride
 * back and tell Nell, and the family's dialogue and state change because
 * of what you found.
 *
 * The state machine is pure data + plain functions so `check:missions` can
 * drive it headlessly: stages declare how they complete (talk / arrive /
 * examine), and `update()`/`onTalk()`/`useExamine()` are the only mutators.
 * The player never sees stage ids — only objective text, prompts, and toasts.
 *
 * Save/load intentionally does not live here. R2 owns persistence; the
 * serialize()/hydrate() pair below is the seam it will use.
 */
import { POS } from "./map.js";

/**
 * Where you stand on the overlook to read the smoke. The POI centre is the
 * arrival target; the glassing spot is a few metres past it, so arrival and
 * examination stay two distinct player moments.
 */
const GLASS_SPOT = { x: POS.overlook.x + 0, z: POS.overlook.z - 9, r: 6 };

const MISSIONS = [
  {
    id: "smoke",
    title: "Smoke on the North Wind",
    stages: [
      {
        id: "find-harlan",
        objective: "Find Harlan Calder at the ranch",
        completeOn: { talk: "Harlan Calder" }
      },
      {
        id: "ride-ridge",
        objective: "Ride the ridge trail north to the Ranch Overlook",
        completeOn: {
          arrive: { x: POS.overlook.x, z: POS.overlook.z, r: 45 },
          onEnter: {
            flag: "sawTheLine",
            toast:
              "The Ranch Overlook. Far to the north, a column of smoke stands on the wind — and it is not one fire."
          }
        }
      },
      {
        id: "glass-smoke",
        objective: "Glass the smoke from the overlook",
        examine: {
          x: GLASS_SPOT.x,
          z: GLASS_SPOT.z,
          r: GLASS_SPOT.r,
          label: "E — Glass the smoke",
          speaker: "The ridge",
          lines: [
            "Three columns, spaced even as fence posts, burning in a line a mile long.",
            "The smoke runs heavy and white. Green wood. Nobody's trash burn smokes like that.",
            "Somebody built this fire line. And lit it on a week of dry north wind."
          ],
          onDone: { flag: "sawArson" }
        }
      },
      {
        id: "report-nell",
        objective: "Ride back and tell Nell what you saw",
        completeOn: { talk: "Nell Calder" },
        // The conversation itself is the consequence beat: she answers what
        // you saw, instead of her opener and the reaction on separate visits.
        reply: true,
        onEnter: { toast: "Nell is at the ranch. The family will want your eyes on what you saw." }
      }
    ]
  }
];

// Every flag the loop itself ever sets, derived from the stage data — the
// whitelist hydrate filters saved flags through, so a hand-mangled or
// foreign save cannot inject state the mission data does not know.
const KNOWN_FLAGS = (() => {
  const known = new Set(["loopComplete"]);
  for (const m of MISSIONS) {
    for (const st of m.stages) {
      if (st.completeOn && st.completeOn.onEnter && st.completeOn.onEnter.flag) {
        known.add(st.completeOn.onEnter.flag);
      }
      if (st.examine && st.examine.onDone && st.examine.onDone.flag) {
        known.add(st.examine.onDone.flag);
      }
      if (st.onEnter && st.onEnter.flag) {
        known.add(st.onEnter.flag);
      }
    }
  }
  return known;
})();

/**
 * Lines keyed to a DISCOVERED flag rather than to a loop boundary: what a
 * character says the moment you come back carrying the arson finding, before
 * the family has been told. The POST_LOOP_LINES below take over once the
 * loop completes, so Wade's reaction is two-stage, not static.
 */
const MIDLOOP_FLAGS = {
  "Wade Calder": {
    flag: "sawArson",
    line: "You saw the line yourself? A mile, laid straight? Burners stack their logs in dome kilns. Nobody stacks an argument like that."
  }
};

const POST_LOOP_LINES = {
  // Consequence stage: what the family does with the discovery. These replace
  // the calders' opening lines once the loop is complete, so the world reflects
  // what happened instead of replaying it.
  "Nell Calder":
    "A fire line, laid by hand. Wade is saddling for town. We hold the ranch and we hold each other — and when the county asks who lit this, a Calder will have an answer.",
  "Harlan Calder":
    "You saw what I smelled. Whatever happens at that fire line, this family does not face it split. Stay close to the house till we hear from town.",
  "Wade Calder":
    "Riding for Silver Creek. If the county wants to blame burners for this, they can look me in the eye first."
};

export function createMissions() {
  const state = {
    mission: "smoke",
    stage: 0,
    done: false,
    flags: {}
  };

  const mission = MISSIONS.find((m) => m.id === state.mission);

  function setFlag(flag) {
    if (flag) {
      state.flags[flag] = true;
    }
  }

  /** The current stage definition, or null when the loop is finished. */
  function stage() {
    if (state.done || state.stage >= mission.stages.length) {
      return null;
    }
    return mission.stages[state.stage];
  }

  function complete() {
    state.done = true;
    setFlag("loopComplete");
    return {
      toast:
        "The Calders know. The fire line is deliberate, and now the family that has to live with it knows you know too."
    };
  }

  function advance() {
    state.stage += 1;
    if (state.stage >= mission.stages.length) {
      return complete();
    }
    const next = stage();
    if (next.onEnter) {
      setFlag(next.onEnter.flag);
      return { toast: next.onEnter.toast };
    }
    return null;
  }

  /**
   * Per-frame: proximity stages complete on their own the moment the player
   * stands inside their radius. Returns an event for main.js to surface
   * (a toast), or null.
   */
  function update(x, z) {
    const s = stage();
    if (!s || !s.completeOn || !s.completeOn.arrive) {
      return null;
    }
    const a = s.completeOn.arrive;
    if (Math.hypot(x - a.x, z - a.z) <= a.r) {
      // Arrival flavour lives alongside `arrive` in the stage data, not
      // inside it — `onEnter` is the stage's own entrance event.
      const enter = s.completeOn.onEnter;
      if (enter) {
        setFlag(enter.flag);
      }
      const ev = advance();
      // A completing stage's own entrance flavour yields to the loop's
      // completion event — dropping that toast would hide the payoff.
      if (ev) {
        return ev;
      }
      return enter && enter.toast ? { toast: enter.toast } : null;
    }
    return null;
  }

  /** A player talked to an NPC and their dialogue reached its end. */
  function onTalk(name) {
    const s = stage();
    if (!s || !s.completeOn || s.completeOn.talk !== name) {
      return null;
    }
    return advance();
  }

  /** The examine interaction within range of (x, z), if the stage wants one. */
  function examineAt(x, z) {
    const s = stage();
    if (!s || !s.examine) {
      return null;
    }
    const e = s.examine;
    if (Math.hypot(x - e.x, z - e.z) <= e.r) {
      return e;
    }
    return null;
  }

  /** An examine interaction was completed; returns a toast event or null. */
  function onExamined(e) {
    const s = stage();
    if (!s || s.examine !== e) {
      return null;
    }
    if (e.onDone) {
      setFlag(e.onDone.flag);
    }
    const ev = advance();
    if (ev) {
      return ev;
    }
    return null;
  }

  /**
   * The dialogue an NPC speaks right now. `line` stays as the static fallback;
   * the loop's stages override it so the family responds to where you are,
   * and the post-loop lines carry the consequence.
   *
   * A conversation that a stage waits on IS the moment for the consequence
   * line: when you ride back and start talking to Nell, she is answering
   * your report — hearing her opening line first and the reaction only on a
   * second visit played as a dialogue bug, not as delayed gratification.
   */
  function dialogueFor(npc) {
    const s = stage();
    // Only a stage whose conversation IS the consequence (Nell's report
    // stage, marked reply) replaces the opener early; Harlan's talk stage
    // must still open on his authored line — that line starts the loop.
    const reply = s && s.reply && s.completeOn && s.completeOn.talk === npc.name;
    if (POST_LOOP_LINES[npc.name] && (state.done || reply)) {
      return [POST_LOOP_LINES[npc.name]];
    }
    // Carrying a discovery changes a conversation before the loop closes:
    // Wade reacts to the arson finding the moment you have it, not only
    // after you have told the family.
    const mid = MIDLOOP_FLAGS[npc.name];
    if (mid && state.flags[mid.flag]) {
      return [mid.line];
    }
    if (Array.isArray(npc.line)) {
      return npc.line;
    }
    return [npc.line];
  }

  function objective() {
    if (state.done) {
      return `Loop complete — ${mission.title}`;
    }
    const s = stage();
    return s ? s.objective : mission.title;
  }

  function serialize() {
    return { version: 1, mission: state.mission, stage: state.stage, done: state.done, flags: { ...state.flags } };
  }

  function hydrate(saved) {
    if (!saved || saved.version !== 1) {
      return false;
    }
    const mission = MISSIONS.find((m) => m.id === saved.mission);
    if (!mission) {
      return false;
    }
    // A stage the mission data no longer contains (a save from an older or
    // modified build) is refused, not applied: a half-restored stage would
    // complete on no interaction at all.
    if (!Number.isInteger(saved.stage) || saved.stage < 0 || saved.stage > mission.stages.length) {
      return false;
    }
    state.mission = saved.mission;
    state.stage = saved.stage;
    // Flags land first, so the done normalisation below stamps loopComplete
    // ON TOP of the saved flags instead of being overwritten by them.
    state.flags = {};
    if (saved.flags && typeof saved.flags === "object" && !Array.isArray(saved.flags)) {
      for (const flag of Object.keys(saved.flags)) {
        if (KNOWN_FLAGS.has(flag)) {
          state.flags[flag] = Boolean(saved.flags[flag]);
        }
      }
    }
    state.done = saved.stage >= mission.stages.length ? true : Boolean(saved.done);
    if (state.done) {
      setFlag("loopComplete");
    }
    return true;
  }

  return { state, update, onTalk, examineAt, onExamined, dialogueFor, objective, serialize, hydrate };
}