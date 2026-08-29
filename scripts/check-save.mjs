/**
 * R2 dry contract: the persistence seam round-trips and fails safe.
 *
 * Drives the real save.js against an in-memory storage (injected — node has
 * no localStorage) and the real missions FSM's serialize/hydrate. Fault
 * injection is part of the file, not an anecdote: corrupt JSON, a foreign
 * schema version, a torn write, an out-of-range stage, and non-object flags
 * are all written and must each be discarded or refused, never applied.
 */
import { POS } from "../src/map.js";
import { createMissions } from "../src/missions.js";
import { readSave, writeSave, SAVE_KEY } from "../src/save.js";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg || "assertion failed");
  }
}

/** In-memory localStorage stand-in, the way a browser holds a save. */
function memoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
}

/** Walk the whole loop through the public mutators, the way a player does. */
function fullLoop() {
  const m = createMissions();
  m.onTalk("Harlan Calder");
  const ev = m.update(POS.overlook.x, POS.overlook.z);
  assert(ev && ev.toast, "arrival yields an event");
  const exam = m.examineAt(POS.overlook.x, POS.overlook.z - 9);
  m.onExamined(exam);
  m.onTalk("Nell Calder");
  assert(m.state.done, "loop completes");
  return m;
}

// --- Round trip: full loop state survives serialize -> hydrate -------------
{
  const m = fullLoop();
  const snap = m.serialize();
  assert(snap.done && snap.flags.loopComplete && snap.stage === 4, "final snapshot captures completion");

  const rev = createMissions();
  assert(rev.hydrate(snap) === true, "full snapshot hydrates");
  assert(rev.objective() === m.objective(), "restored run has the same objective");
  assert(rev.state.done === true && rev.state.flags.loopComplete === true, "restored run keeps done + flag");
  const post = rev.dialogueFor({ name: "Nell Calder", line: "Juniper is ready." });
  assert(/fire line/i.test(post[0]), "restored run keeps the consequence dialogue");
}

// --- Mid-mission round trip ------------------------------------------------
{
  const mid = createMissions();
  mid.onTalk("Harlan Calder");
  const rev = createMissions();
  assert(rev.hydrate(mid.serialize()) === true, "mid-mission snapshot hydrates");
  assert(rev.objective() === "Ride the ridge trail north to the Ranch Overlook", "restored to the travelling stage");

  // And the restored run CONTINUES: it is not a sealed checkpoint.
  const ev = rev.update(POS.overlook.x, POS.overlook.z);
  assert(ev && rev.state.stage === 2, "a restored mid-run can still complete its stage");
}

// --- save.js: write then read back, under the real key ---------------------
{
  const ls = memoryStorage();
  writeSave(
    { missions: { version: 1, mission: "smoke", stage: 1, done: false, flags: { a: true } }, player: { x: 10, z: 20 } },
    { storage: ls }
  );
  const back = readSave({ storage: ls });
  assert(back && back.version === 1, "save round-trips with schema version stamped");
  assert(back.missions.stage === 1 && back.missions.flags.a === true, "nested state round-trips");
  assert(back.player.z === 20, "payload beyond the mission state round-trips");
}

// --- Fault injection: every corrupt path is discarded, never applied -------
{
  const warnLog = [];
  const log = { warn: (...a) => warnLog.push(a.join(" ")) };

  const torn = memoryStorage();
  writeSave({ missions: { version: 1, mission: "smoke", stage: 1, done: false, flags: {} } }, { storage: torn });
  torn.setItem(SAVE_KEY, torn.getItem(SAVE_KEY).slice(0, 24));
  assert(readSave({ storage: torn, log }) === null, "a truncated save is discarded");

  const garbage = memoryStorage();
  garbage.setItem(SAVE_KEY, "{not json at all");
  assert(readSave({ storage: garbage, log }) === null, "unparsable JSON is discarded");
  assert(warnLog.length >= 1, "unparsable JSON is logged, not silent");

  const foreign = memoryStorage();
  writeSave({ missions: { version: 1, mission: "smoke", stage: 1, done: false, flags: {} } }, { storage: foreign });
  foreign.setItem(SAVE_KEY, foreign.getItem(SAVE_KEY).replace(/"version":1\}$/, '"version":99}'));
  assert(readSave({ storage: foreign, log }) === null, "a foreign schema version is discarded");

  const warningsSoFar = warnLog.length;
  const empty = memoryStorage();
  assert(readSave({ storage: empty, log }) === null, "no save reads as null");
  assert(warnLog.length === warningsSoFar, "an empty store does not warn");
}

// --- hydrate-side fault injection ------------------------------------------
{
  const fresh = createMissions();
  assert(fresh.hydrate({ version: 1, mission: "smoke", stage: 99, done: false, flags: {} }) === false,
    "an out-of-range stage is refused");
  assert(fresh.state.stage === 0, "a refused hydrate leaves the mission untouched");
  assert(fresh.hydrate({ version: 1, mission: "smoke", stage: -1, done: false, flags: {} }) === false,
    "a negative stage is refused");
  assert(fresh.hydrate({ version: 1, mission: "smoke", stage: 1.5, done: false, flags: {} }) === false,
    "a non-integer stage is refused");

  const flagsReset = createMissions();
  assert(flagsReset.hydrate({ version: 1, mission: "smoke", stage: 1, done: false, flags: "nope" }) === true,
    "malformed flags hydrate with flags reset, not refused");
  assert(Object.keys(flagsReset.state.flags).length === 0, "malformed flags reset to empty, not inherited");

  const exact = createMissions();
  assert(exact.hydrate({ version: 1, mission: "smoke", stage: 2, done: false, flags: { sawArson: true, ghost: true } }) === true,
    "a save with known and unknown flags hydrates");
  assert(exact.state.flags.sawArson === true, "known flags restore");
  assert(exact.state.flags.ghost === undefined,
    "flags the mission data never sets are filtered out, not inherited");

  // A stage at the end of the mission data IS the completed loop, whatever
  // the done byte claims — normalised, not half-restored.
  const normalized = createMissions();
  assert(normalized.hydrate({ version: 1, mission: "smoke", stage: 4, done: false, flags: {} }) === true,
    "a final-stage save hydrates");
  assert(normalized.state.done === true && normalized.state.flags.loopComplete === true,
    "a final-stage save normalises to done with the completion flag");
}

console.log("check:save PASSED — the save seam round-trips and fails safe");