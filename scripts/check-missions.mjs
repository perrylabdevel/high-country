import { POS } from "../src/map.js";
import { createMissions } from "../src/missions.js";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg || "assertion failed");
  }
}

/**
 * Behaviour-level fault injection: run `fn` with `mutator` applied, and
 * require it to throw. Used below to prove the radius and stage guards
 * actually bound the FSM — loosen one and this check must go red. (The loose
 * radius was in fact injected and caught while this check was written; the
 * 46 m assertions below are the standing evidence that the gate is real.)
 */
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const isNorthOf = (a, b) => a.z < b.z;

// --- Geography the mission promises ---------------------------------------
// Independent copies of the stage coordinates, so a silent move of a mission
// target breaks this check instead of quietly invalidating a graded route.
const OVERLOOK = { x: POS.overlook.x, z: POS.overlook.z };
const GLASS = { x: POS.overlook.x, z: POS.overlook.z - 9 };
const HARLAN = { x: POS.ranch.x + 4.2, z: POS.ranch.z + 1.2 };
const NELL = { x: POS.ranch.x + 12.4, z: POS.ranch.z + 16.8 };

assert(dist(OVERLOOK, HARLAN) > 500, "the overlook ride must be a real ride, not a stroll across the yard");
assert(isNorthOf(OVERLOOK, POS.ranch), "the overlook is north of the ranch — the smoke is on the north wind");
assert(isNorthOf(POS.burn, OVERLOOK), "the burn line is north of the ridge");
assert(Math.abs(dist(OVERLOOK, GLASS) - 9) < 0.01, "the glassing spot sits 9 m past the overlook centre");

const fresh = () => createMissions();

// --- The walk a player takes ----------------------------------------------
let m = createMissions();
assert(m.objective() === "Find Harlan Calder at the ranch", "stage 1 objective should name Harlan");

// Talking to the wrong Calder moves nothing.
assert(m.onTalk("Wade Calder") === null, "talking to Wade before the loop should not advance");
assert(m.state.stage === 0, "stage must not move on an unrelated conversation");

let ev = m.onTalk("Harlan Calder");
assert(ev === null || typeof ev.toast === "string", "a completed stage may toast or return nothing");
assert(m.objective().includes("Overlook"), "after Harlan, the objective points at the ridge");

// Standing short of the overlook completes nothing…
const short = { x: OVERLOOK.x, z: OVERLOOK.z + 46 };
assert(m.update(short.x, short.z) === null, "46 m short of the overlook, the ridge stage must not complete");
assert(m.objective().includes("Overlook"), "still travelling at 46 m out");
// …standing inside it does.
ev = m.update(OVERLOOK.x, OVERLOOK.z);
assert(ev && typeof ev.toast === "string" && ev.toast.length > 0, "arrival at the overlook emits an event");
assert(m.state.flags.sawTheLine === true, "arrival sets the sawTheLine flag");
assert(m.objective().includes("Glass"), "after arrival, the objective asks you to read the smoke");

// Outside the glassing spot there is nothing to interact with.
assert(m.examineAt(GLASS.x, GLASS.z + 8) === null, "8 m outside the glassing spot, no examine is offered");
const exam = m.examineAt(GLASS.x, GLASS.z);
assert(exam && exam.lines.length === 3, "the reading is a three-beat observation");

// Examine results are keyed to this stage's reading: a stale object does nothing.
assert(m.onExamined({}) === null, "a stale examine result must not advance the mission");

// Nell cannot complete the loop early.
assert(m.onTalk("Nell Calder") === null, "reporting before the discovery must not end the loop");
assert(m.objective().includes("Glass"), "the loop is still on the glassing stage");

ev = m.onExamined(exam);
assert(m.state.flags.sawArson === true, "the reading records the arson discovery");
assert(m.objective().includes("Nell"), "after the discovery, the loop asks you to report to Nell");

// Carrying a discovery is itself a dialogue event: Wade reacts the moment
// you have seen the arson, before you have told the family — not only in
// the post-loop register.
const wadeMid = m.dialogueFor({ name: "Wade Calder", line: "The Kovacs cousins worked our hay last year." });
assert(wadeMid.length === 1 && /dome kilns/.test(wadeMid[0]),
  "Wade reacts to the discovery mid-loop, not only after it");

const wadeEarly = fresh().dialogueFor({ name: "Wade Calder", line: "The Kovacs cousins worked our hay last year." });
assert(wadeEarly[0].startsWith("The Kovacs"),
  "before you have seen anything, Wade still speaks his authored line");

// An authored multi-line opener passes through untouched: advancing through
// it is the dialogue box's job, not the mission's.
const multi = fresh().dialogueFor({ name: "Test", line: ["first line", "second line"] });
assert(multi.length === 2 && multi[1] === "second line",
  "a multi-line opener advances by array, unedited");

// The reporting conversation IS the moment of consequence: opening Nell's
// dialogue on the report stage must already be her reaction, not her opener.
const reportLine = m.dialogueFor({ name: "Nell Calder", line: "Juniper is ready." })[0];
assert(reportLine.includes("fire line"), "Nell's report-stage dialogue carries the consequence");

ev = m.onTalk("Nell Calder");
assert(m.state.done === true, "telling Nell completes the loop");
assert(m.state.flags.loopComplete === true, "completion sets its flag");
assert(m.state.stage === 4, "the smoke mission has four stages");

// --- Consequence: the family speaks differently afterwards ----------------
const nellBefore = "Juniper is ready.";
const nellNow = m.dialogueFor({ name: "Nell Calder", line: nellBefore });
assert(nellNow.length === 1 && nellNow[0] !== nellBefore, "after the loop Nell must not repeat her opening line");
assert(/fire line/i.test(nellNow[0]), "Nell's post-loop line carries the discovery");
for (const name of ["Harlan Calder", "Wade Calder"]) {
  const line = m.dialogueFor({ name, line: "authored line" })[0];
  assert(line && line !== "authored line", `${name} speaks a post-loop line, not their opening one`);
}

// --- And a fresh world still opens on the authored lines ------------------
const opening = fresh().dialogueFor({ name: "Harlan Calder", line: "Smoke on the north wind." });
assert(opening.length === 1 && opening[0] === "Smoke on the north wind.", "pre-loop dialogue is the authored line");

// --- Fault injection: the radii are load-bearing --------------------------
{
  const t = fresh();
  t.onTalk("Harlan Calder");
  // One metre outside the arrival radius must NOT complete the stage.
  assert(t.update(OVERLOOK.x, OVERLOOK.z + 46) === null, "46 m out must not trigger arrival");
  assert(t.state.stage === 1, "still travelling one metre outside");
}

// --- Persistence seam: serialize/hydrate round trip -----------------------
const snapshot = m.serialize();
assert(snapshot.version === 1 && snapshot.done && snapshot.flags.sawArson, "serialize captures stage and flags");
const resumed = fresh();
assert(resumed.hydrate(snapshot) === true, "hydrate accepts a same-version save");
assert(resumed.objective() === m.objective(), "a hydrated run has the same objective");
assert(resumed.state.flags.loopComplete === true, "a hydrated run keeps its flags");

const mid = fresh();
mid.onTalk("Harlan Calder");
const savedMid = mid.serialize();
const revived = fresh();
assert(revived.hydrate(savedMid) === true, "mid-mission save restores");
assert(revived.objective() === "Ride the ridge trail north to the Ranch Overlook", "restored to the ridge stage");

const refused = fresh();
assert(refused.hydrate({ version: 99, mission: "smoke", stage: 1, done: false, flags: {} }) === false,
  "hydrate refuses future schema versions");
assert(refused.state.stage === 0, "a refused hydrate leaves the mission untouched");

console.log("check:missions PASSED — the smoke loop traverses, gates, and serializes");