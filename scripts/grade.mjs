/**
 * Score every capture in audit/current/ against the rubric and write a pass
 * report. This is the enforced half of docs/VISION_AUDIT.md.
 *
 * This branch grades only through a Cursor subscription model in chat. The
 * script never calls Claude CLI, Google Gemini, or OpenAI. The model is the
 * one selected in the Cursor picker for the chat that fills inbox.json.
 *
 *   npm run capture
 *   npm run grade                     # worksheet + empty inbox (same as grade:cursor)
 *   # this Cursor chat @-attaches the PNGs and fills inbox.json
 *   npm run grade -- --compile audit/reports/inbox.json
 *
 * Put the picker name in inbox.json's `model` field. If you do not know it,
 * write "model unknown" — do not guess, and do not substitute haiku / Gemini
 * API / OpenAI. Changing the grader breaks comparability with previous passes.
 *
 * Exit codes — the point of a script over a prompt is that these are checkable:
 *   0  PASSED   the §6 stop condition is met, the loop is over
 *   2  CONTINUE graded fine, the bar is not met yet
 *   1  the run itself failed (no captures, bad inbox)
 *
 * Writes audit/reports/pass-NN.md (human) and pass-NN.json (machine, used to
 * compare against the previous pass — markdown is not parsed back).
 *
 * Capture discovery, scoring maths, the stop condition, report writing, and
 * the cursor worksheet are covered by `node scripts/grade.mjs --selftest`.
 */
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { criteriaFor } from "./rubric.mjs";

// ---------------------------------------------------------------- config ----

/** Cursor subscription only. Any other GRADE_PROVIDER is a hard error. */
const EXTERNAL_PROVIDERS = new Set(["claude", "gemini", "openai"]);

/**
 * Optional label stamped into the empty inbox. The agent that grades must
 * overwrite this with the Cursor picker name. Do not default to haiku, Gemini
 * API, or OpenAI — those are not this branch.
 */
const MODEL = process.env.GRADE_MODEL || "";
const PROVIDER = "cursor";

/**
 * A pass cannot be declared clean while the grader has declined to assess much
 * of the rubric — otherwise nulling the hard criteria is a way to pass. Genuine
 * "n/a" (a criterion that does not apply to this frame, e.g. no road in shot)
 * is exempt and does not count against coverage.
 */
const MIN_COVERAGE = Number(process.env.GRADE_MIN_COVERAGE || 0.8);

const CAPTURE_DIR = process.env.GRADE_CAPTURES || "audit/current";
const REPORT_DIR = "audit/reports";
const CANONICAL_CAPTURE_DIR = "audit/current";
const POI_IDS = [
  "ranch", "silverCreek", "lakeMercy", "northernPines", "timberCamp", "burn",
  "westernRange", "ironValley", "tribal", "badlands", "mission", "fortGrant",
  "cemetery", "huntingCabin", "overlook", "elPaso"
];
const EXPECTED_CAPTURE_FILES = POI_IDS.flatMap((poi) => [
  `${poi}-midday.png`,
  `${poi}-golden.png`
]).sort();

// Temperature 0: grading must be as repeatable as the provider allows. A
// creative grader makes the score series noise.
const TEMPERATURE = 0;

/**
 * Refuse Claude CLI / Google Gemini API / OpenAI. This branch has no outbound
 * grader — pixels are scored in a Cursor chat, then compiled.
 */
export function assertCursorSubscriptionOnly(provider = process.env.GRADE_PROVIDER) {
  if (provider && EXTERNAL_PROVIDERS.has(provider)) {
    throw new Error(
      `GRADE_PROVIDER=${provider} is disabled on this branch. ` +
        `Grade in a Cursor chat (subscription model in the picker, Auto off), ` +
        `fill audit/reports/inbox.json, then: npm run grade -- --compile audit/reports/inbox.json`
    );
  }
}

// --------------------------------------------------------------- prompts ----

function buildPrompt(poi, light, criteria) {
  const lines = criteria.map((c) => `  ${c.id} — ${c.name}: ${c.detail}`).join("\n");
  return `You are grading a screenshot from a semi-realistic 1880s American West game.

Point of interest: ${poi}
Lighting: ${light === "golden" ? "golden hour, sun near the horizon" : "midday, sun high"}

Score each criterion 0-5 on what you can SEE in this image:
  5 = fully met
  4 = met with minor imperfections
  3 = partially met
  2 = mostly not met
  1 = not met
  0 = absent, broken, or the image failed to render

${lines}

Rules:
- Judge only what is visible. Do not infer from what you assume the code does.
- If a criterion cannot be assessed from this camera angle, use score null and
  set "note" to what camera position would show it. Do not guess a middle score.
- If the criterion says it may be n/a and it does not apply, use score null with
  note "n/a".
- For any score of 3 or below, "note" must name what you SEE that is wrong, in
  one sentence. Not what you think caused it.
- If your note names a concrete violation of the criterion's own text (a gap, a
  float, a seam, a straight boundary where noise is required, a missing roof or
  door), the score is capped at 3 no matter how you hedge it ("minimal",
  "slight", "minor"). A described defect and a passing score cannot coexist.
- Do not award points for effort or intent. Only for the image.

Reply with JSON only, no prose around it:
{"criteria":[{"id":"U1","score":4,"note":"..."}]}`;
}

// --------------------------------------------------------------- scoring ----

/** Parse the grader's reply, tolerating a stray code fence. */
export function parseScores(text) {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed?.criteria)) {
    throw new Error("reply had no criteria array");
  }
  return parsed.criteria.map((c) => ({
    id: String(c.id),
    score: c.score === null || c.score === undefined ? null : Number(c.score),
    note: typeof c.note === "string" ? c.note : ""
  }));
}

/**
 * The §6 stop condition. `passes` is this pass plus the previous one, newest
 * first. Null scores are unassessed and never satisfy the bar on their own,
 * but they do not fail it either — they are reported separately so they cannot
 * be quietly averaged away.
 */
export function evaluateStop(current, previous) {
  const clean = (pass) => {
    if (!pass) {
      return { clean: false, coverage: 0 };
    }
    const all = pass.results.flatMap((r) => r.criteria);
    // A criterion the grader marked "n/a" genuinely does not apply to this
    // frame. Anything else it left null is a criterion it declined to judge,
    // and those count against coverage so that nulling the hard ones is not a
    // route to a clean pass.
    const applicable = all.filter((c) => !(c.score === null && /^n\/a/i.test(c.note || "")));
    const scored = applicable.filter((c) => c.score !== null);
    const coverage = applicable.length ? scored.length / applicable.length : 0;
    if (!scored.length) {
      return { clean: false, coverage };
    }
    const allHigh = scored.every((c) => c.score >= 4) && !scored.some((c) => c.score <= 2);
    return { clean: allHigh && coverage >= MIN_COVERAGE, coverage };
  };
  const cur = clean(current);
  const prev = clean(previous);
  return {
    currentClean: cur.clean,
    previousClean: prev.clean,
    coverage: cur.coverage,
    minCoverage: MIN_COVERAGE,
    // (d): one clean pass is not enough.
    passed: cur.clean && prev.clean
  };
}

/**
 * Criteria whose correct answer cannot depend on sun position. A score that
 * swings more than 1 point between a POI's golden and midday frame is either a
 * real legibility bug (silhouette collapses into shadow at one angle) or grader
 * noise — either way it must be surfaced, not recorded as two independent
 * numbers. This is the second-tier review's finding 3.
 */
const SUN_INVARIANT = new Set([
  "U4", "S1", "S2", "S3", "S4", "S5", "F1", "F2", "R1", "R2", "R3", "R4", "R5", "R6",
  "T1", "T2", "N1", "N2", "M1", "M2", "C1", "H1", "I1", "I2", "E1", "P1", "P3", "P4", "P5"
]);

/** Structural criteria that swing >1 between a POI's two light frames. */
export function findInconsistencies(pass) {
  const byPoi = new Map();
  for (const r of pass.results) {
    if (!byPoi.has(r.poi)) {
      byPoi.set(r.poi, new Map());
    }
    for (const c of r.criteria) {
      if (SUN_INVARIANT.has(c.id) && c.score !== null) {
        const key = `${c.id}:${r.light}`;
        byPoi.get(r.poi).set(key, { id: c.id, score: c.score, light: r.light });
      }
    }
  }
  const out = [];
  for (const [poi, byKey] of byPoi) {
    for (const [key, v] of byKey) {
      if (v.light !== "golden") {
        continue;
      }
      const other = byKey.get(`${v.id}:midday`);
      if (other && Math.abs(other.score - v.score) > 1) {
        out.push({ poi, id: v.id, golden: v.score, midday: other.score });
      }
    }
  }
  return out;
}

/** Criteria that got worse since the previous pass. */
export function findRegressions(current, previous) {
  if (!previous) {
    return [];
  }
  const before = new Map();
  for (const r of previous.results) {
    for (const c of r.criteria) {
      before.set(`${r.image}:${c.id}`, c.score);
    }
  }
  const out = [];
  for (const r of current.results) {
    for (const c of r.criteria) {
      const was = before.get(`${r.image}:${c.id}`);
      if (was !== undefined && was !== null && c.score !== null && c.score < was) {
        out.push({ image: r.image, id: c.id, was, now: c.score, note: c.note });
      }
    }
  }
  return out.sort((a, b) => a.now - b.now || b.was - a.was);
}

// ---------------------------------------------------------------- report ----

function worstFive(pass) {
  return pass.results
    .flatMap((r) => r.criteria.filter((c) => c.score !== null).map((c) => ({ ...c, image: r.image })))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);
}

function renderReport(pass, previous, stop) {
  const regressions = findRegressions(pass, previous);
  const inconsistencies = findInconsistencies(pass);
  const unassessed = pass.results.flatMap((r) =>
    r.criteria.filter((c) => c.score === null).map((c) => ({ ...c, image: r.image }))
  );
  const lines = [];
  lines.push(`# Audit pass ${String(pass.pass).padStart(2, "0")}`);
  lines.push("");
  lines.push(`**Grader model: \`${pass.model}\`** (provider: ${pass.provider}, temperature ${TEMPERATURE})`);
  if (previous && previous.model !== pass.model) {
    lines.push("");
    lines.push(
      `> **The grader changed since pass ${previous.pass} (\`${previous.model}\`).** ` +
        `Scores across the two are not comparable; decide whether to restart the series.`
    );
  }
  lines.push("");
  lines.push(`Captures: ${pass.results.length} · Generated: ${pass.generated}`);
  if (pass.capture) {
    lines.push(`Capture backend: \`${pass.capture.backend}\` · adapter: ${pass.capture.adapter} · antialias: ${pass.capture.antialias}`);
  }
  lines.push("");

  lines.push("## Scores");
  lines.push("");
  lines.push("| Image | Criterion | Score | Note |");
  lines.push("|---|---|---|---|");
  for (const r of pass.results) {
    for (const c of r.criteria) {
      const note = (c.note || "").replace(/\|/g, "\\|");
      lines.push(`| ${r.image} | ${c.id} | ${c.score === null ? "—" : c.score} | ${note} |`);
    }
  }
  lines.push("");

  lines.push("## Regressions");
  lines.push("");
  if (!previous) {
    lines.push("_No previous pass to compare against._");
  } else if (!regressions.length) {
    lines.push("_None._");
  } else {
    for (const r of regressions) {
      lines.push(`- **${r.image} ${r.id}: ${r.was} → ${r.now}** — ${r.note}`);
    }
  }
  lines.push("");

  lines.push("## Five worst criteria");
  lines.push("");
  for (const w of worstFive(pass)) {
    lines.push(`1. **${w.image} ${w.id} (${w.score})** — ${w.note}`);
  }
  lines.push("");

  if (inconsistencies.length) {
    lines.push("## Sun-invariant criteria that disagree between light frames");
    lines.push("");
    lines.push("These criteria cannot depend on sun position, yet the same geometry scored more than 1 point apart between golden and midday. Treat as a legibility bug or grader noise, not two independent scores.");
    lines.push("");
    for (const i of inconsistencies) {
      lines.push(`- **${i.poi} ${i.id}**: golden ${i.golden} vs midday ${i.midday}`);
    }
    lines.push("");
  }

  if (unassessed.length) {
    lines.push("## Could not assess");
    lines.push("");
    for (const u of unassessed) {
      lines.push(`- ${u.image} ${u.id} — ${u.note}`);
    }
    lines.push("");
  }

  lines.push("## Verdict");
  lines.push("");
  lines.push(
    `- Rubric coverage: **${(stop.coverage * 100).toFixed(0)}%** ` +
      `(minimum ${(stop.minCoverage * 100).toFixed(0)}% — criteria the grader declined to judge count against this; genuine n/a does not)`
  );
  lines.push(`- This pass clean (all scored ≥4, none ≤2, coverage met): **${stop.currentClean ? "yes" : "no"}**`);
  lines.push(`- Previous pass clean: **${stop.previousClean ? "yes" : "no"}**`);
  lines.push("");
  lines.push(stop.passed ? "PASSED" : "CONTINUE");
  lines.push("");
  return lines.join("\n");
}

function sameFileSet(actual, expected) {
  return actual.length === expected.length && actual.every((file, index) => file === expected[index]);
}

async function listCaptureFiles() {
  if (!existsSync(CAPTURE_DIR)) {
    throw new Error(`no captures at ${CAPTURE_DIR} — run npm run capture first`);
  }
  const files = (await readdir(CAPTURE_DIR)).filter((f) => f.endsWith(".png")).sort();
  if (!files.length) {
    throw new Error(`no .png files in ${CAPTURE_DIR}`);
  }
  return files;
}

async function validateCaptureSet(files) {
  const manifestPath = path.join(CAPTURE_DIR, "capture-manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`no capture manifest at ${manifestPath} — recapture the complete set`);
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (err) {
    throw new Error(`invalid capture manifest at ${manifestPath}: ${err.message}`);
  }
  if (manifest.version !== 1) {
    throw new Error(`unsupported capture manifest version ${manifest.version}`);
  }
  if (!sameFileSet(files, EXPECTED_CAPTURE_FILES) ||
      !sameFileSet((manifest.files || []).slice().sort(), EXPECTED_CAPTURE_FILES) ||
      !sameFileSet((manifest.expectedFiles || []).slice().sort(), EXPECTED_CAPTURE_FILES)) {
    throw new Error(`capture set must contain exactly ${EXPECTED_CAPTURE_FILES.length} expected POI/light images`);
  }
  if (CAPTURE_DIR === CANONICAL_CAPTURE_DIR && manifest.backend !== "webgpu") {
    throw new Error("audit/current must be captured with WebGPU; WebGL captures are diagnostic-only");
  }
  if (!manifest.backend || typeof manifest.antialias !== "boolean") {
    throw new Error("capture manifest is missing renderer provenance");
  }
  return manifest;
}

function resultStub(file) {
  const [poi, lightWithExt] = path.basename(file, ".png").split("-");
  const light = lightWithExt || "midday";
  return {
    image: path.basename(file),
    poi,
    light,
    criteria: criteriaFor(poi).map((c) => ({ id: c.id, score: null, note: "" }))
  };
}

async function writePass(results, model, provider, capture) {
  const previous = await loadPrevious();
  const pass = {
    pass: (previous?.pass ?? 0) + 1,
    model,
    provider,
    generated: new Date().toISOString(),
    capture,
    results
  };
  const stop = evaluateStop(pass, previous);
  await mkdir(REPORT_DIR, { recursive: true });
  const nn = String(pass.pass).padStart(2, "0");
  const md = renderReport(pass, previous, stop);
  await writeFile(path.join(REPORT_DIR, `pass-${nn}.md`), md);
  await writeFile(path.join(REPORT_DIR, `pass-${nn}.json`), JSON.stringify(pass, null, 2));
  await writeFile(path.join(REPORT_DIR, "latest.md"), md);
  process.stdout.write(`\n${stop.passed ? "PASSED" : "CONTINUE"} — ${REPORT_DIR}/pass-${nn}.md\n`);
  process.exit(stop.passed ? 0 : 2);
}

async function writeCursorPrompts() {
  const files = await listCaptureFiles();
  await validateCaptureSet(files);
  await mkdir(REPORT_DIR, { recursive: true });
  const inbox = {
    model: MODEL || "model unknown",
    provider: PROVIDER,
    results: files.map(resultStub)
  };
  const inboxPath = path.join(REPORT_DIR, "inbox.json");
  await writeFile(inboxPath, JSON.stringify(inbox, null, 2));

  const lines = [];
  lines.push("# Cursor grading worksheet");
  lines.push("");
  lines.push("This branch grades only through a **Cursor subscription** model.");
  lines.push("Use the model already selected in **this** chat (Auto off). Do not spawn Claude CLI, Google Gemini API, or OpenAI.");
  lines.push("Put the picker name in `inbox.json`'s `model` field. If you do not know it, write `model unknown`.");
  lines.push("");
  lines.push("Then:");
  lines.push("");
  lines.push("1. Open every PNG in `audit/current/`. Look at the image. Do not grade from filenames or from the code.");
  lines.push("2. Fill `audit/reports/inbox.json`: each criterion gets `score` 0–5, or `null` if you cannot assess this frame.");
  lines.push("3. For any score ≤ 3, `note` must name what you SEE that is wrong, in one sentence.");
  lines.push("4. Run `npm run grade -- --compile audit/reports/inbox.json` — that writes the pass report and the stop condition. Do not compute PASSED yourself.");
  lines.push("");
  lines.push(`Captures: ${files.length}. Rubric: docs/VISION_AUDIT.md §5 / scripts/rubric.mjs.`);
  lines.push("");
  for (const file of files) {
    const stub = resultStub(file);
    const criteria = criteriaFor(stub.poi);
    lines.push(`## ${stub.image}`);
    lines.push("");
    lines.push(`File: \`${CAPTURE_DIR}/${stub.image}\``);
    lines.push("");
    for (const c of criteria) {
      lines.push(`- **${c.id} ${c.name}** — ${c.detail}`);
    }
    lines.push("");
  }
  const sheet = path.join(REPORT_DIR, "cursor-worksheet.md");
  await writeFile(sheet, lines.join("\n"));
  process.stdout.write(
    `wrote ${inboxPath} and ${sheet}\n` +
      `Grade the PNGs in this Cursor chat, fill inbox.json, then:\n` +
      `  npm run grade -- --compile ${inboxPath}\n`
  );
}

function isCopoutNote(note) {
  return /cannot vis|cannot view|cannot see|not possible for me|agent cannot|as an ai/i.test(note || "");
}

/** A uniform 3, or "I cannot see images", is not a grade. */
function rejectPlaceholder(results) {
  const numbered = results.flatMap((r) => r.criteria).filter((c) => {
    if (c.score === null || c.score === undefined) {
      return false;
    }
    if (c.note === "missing from inbox.json" || c.note === "grader omitted this criterion") {
      return false;
    }
    return true;
  });
  if (!numbered.length) {
    throw new Error("inbox has no scores — look at the PNGs and fill scores before compiling");
  }
  const copouts = numbered.filter((c) => isCopoutNote(c.note));
  if (copouts.length >= numbered.length * 0.5) {
    throw new Error(
      "inbox is a placeholder (grader claimed it cannot see images). That is not a grade. " +
        "Do not compile it. @-attach the PNGs in this Cursor chat so the selected model actually gets pixels."
    );
  }
  if (numbered.length >= 10 && numbered.every((c) => c.score === 3)) {
    throw new Error("inbox is all 3s. A real grade is not a uniform middle score. Do not compile it.");
  }
}

function mergeInbox(inbox, files) {
  if (!Array.isArray(inbox?.results)) {
    throw new Error("inbox.json must have a results array");
  }
  const byImage = new Map(inbox.results.map((r) => [r.image, r]));
  return files.map((f) => {
    const stub = resultStub(f);
    const filled = byImage.get(stub.image);
    if (!filled) {
      return {
        ...stub,
        criteria: stub.criteria.map((c) => ({ ...c, score: 0, note: "missing from inbox.json" }))
      };
    }
    const byId = new Map((filled.criteria || []).map((c) => [c.id, c]));
    return {
      image: stub.image,
      poi: stub.poi,
      light: stub.light,
      criteria: stub.criteria.map((c) => {
        const got = byId.get(c.id);
        if (!got) {
          return { id: c.id, score: null, note: "grader omitted this criterion" };
        }
        return {
          id: c.id,
          score: got.score === null || got.score === undefined ? null : Number(got.score),
          note: typeof got.note === "string" ? got.note : ""
        };
      })
    };
  });
}

async function compileInbox(inboxPath) {
  if (!existsSync(inboxPath)) {
    throw new Error(`no inbox at ${inboxPath}`);
  }
  const inbox = JSON.parse(await readFile(inboxPath, "utf8"));
  const files = await listCaptureFiles();
  const capture = await validateCaptureSet(files);
  const results = mergeInbox(inbox, files);
  rejectPlaceholder(results);
  const model = typeof inbox.model === "string" && inbox.model.trim() ? inbox.model.trim() : "model unknown";
  const provider = inbox.provider || "cursor";
  await writePass(results, model, provider, capture);
}

// ------------------------------------------------------------------ main ----

async function loadPrevious() {
  if (!existsSync(REPORT_DIR)) {
    return null;
  }
  const files = (await readdir(REPORT_DIR)).filter((f) => /^pass-\d+\.json$/.test(f)).sort();
  if (!files.length) {
    return null;
  }
  return JSON.parse(await readFile(path.join(REPORT_DIR, files[files.length - 1]), "utf8"));
}

async function main() {
  if (process.argv.includes("--selftest")) {
    return selftest();
  }
  assertCursorSubscriptionOnly();
  if (process.argv.includes("--prompts")) {
    return writeCursorPrompts();
  }
  const compileAt = process.argv.indexOf("--compile");
  if (compileAt >= 0) {
    const inboxPath = process.argv[compileAt + 1];
    if (!inboxPath) {
      throw new Error("usage: npm run grade -- --compile audit/reports/inbox.json");
    }
    return compileInbox(inboxPath);
  }

  // No Claude CLI / Gemini API / OpenAI on this branch. Default is the Cursor worksheet.
  return writeCursorPrompts();
}

/** Covers everything that does not need the network. */
function selftest() {
  const assert = (cond, msg) => {
    if (!cond) {
      throw new Error(`selftest: ${msg}`);
    }
  };

  const parsed = parseScores('```json\n{"criteria":[{"id":"U1","score":4,"note":"ok"}]}\n```');
  assert(parsed.length === 1 && parsed[0].score === 4, "parseScores should strip fences");
  assert(sameFileSet(EXPECTED_CAPTURE_FILES, EXPECTED_CAPTURE_FILES), "expected capture set should match itself");
  assert(!sameFileSet(EXPECTED_CAPTURE_FILES.slice(1), EXPECTED_CAPTURE_FILES), "partial captures must not match the canonical set");

  const mk = (score) => ({ results: [{ image: "a.png", criteria: [{ id: "U1", score, note: "" }] }] });
  assert(evaluateStop(mk(5), mk(5)).passed, "two clean passes should pass");
  assert(!evaluateStop(mk(5), mk(3)).passed, "one clean pass should not pass");
  assert(!evaluateStop(mk(3), mk(5)).passed, "a dirty current pass should not pass");
  assert(!evaluateStop(mk(2), mk(2)).passed, "a score of 2 should never pass");
  assert(!evaluateStop(mk(5), null).passed, "a first pass should never pass");

  const withNulls = (scored, declined) => ({
    results: [
      {
        image: "a.png",
        criteria: [
          ...Array.from({ length: scored }, (_, i) => ({ id: `S${i}`, score: 5, note: "" })),
          ...Array.from({ length: declined }, (_, i) => ({ id: `N${i}`, score: null, note: "cannot assess from this angle" }))
        ]
      }
    ]
  });
  assert(!evaluateStop(withNulls(5, 5), withNulls(5, 5)).passed, "50% coverage must not pass");
  assert(evaluateStop(withNulls(9, 1), withNulls(9, 1)).passed, "90% coverage with all 5s should pass");
  const naExempt = {
    results: [
      {
        image: "a.png",
        criteria: [
          { id: "S0", score: 5, note: "" },
          { id: "G1", score: null, note: "n/a" }
        ]
      }
    ]
  };
  assert(evaluateStop(naExempt, naExempt).passed, "genuine n/a must not count against coverage");

  const regs = findRegressions(mk(2), mk(4));
  assert(regs.length === 1 && regs[0].was === 4 && regs[0].now === 2, "should find the regression");
  assert(findRegressions(mk(5), mk(4)).length === 0, "an improvement is not a regression");

  const ids = criteriaFor("ranch").map((c) => c.id);
  assert(ids.includes("U1") && ids.includes("R1") && ids.includes("G1"), "ranch should get universal, per-POI and road criteria");
  assert(new Set(ids).size === ids.length, "criterion ids must be unique");

  const aridU1 = criteriaFor("burn").find((c) => c.id === "U1");
  assert(aridU1 && /arid/i.test(aridU1.detail), "arid POIs should get the arid U1 wording");
  const grassU1 = criteriaFor("ranch").find((c) => c.id === "U1");
  assert(grassU1 && /grass/i.test(grassU1.detail), "grass POIs should keep the grass U1 wording");

  const inconsistent = findInconsistencies({
    results: [
      { poi: "silverCreek", light: "golden", criteria: [{ id: "S2", score: 4, note: "" }] },
      { poi: "silverCreek", light: "midday", criteria: [{ id: "S2", score: 1, note: "" }] }
    ]
  });
  assert(inconsistent.length === 1 && inconsistent[0].id === "S2", "a >1 swing on a sun-invariant criterion should be flagged");
  const consistent = findInconsistencies({
    results: [
      { poi: "silverCreek", light: "golden", criteria: [{ id: "S2", score: 4, note: "" }] },
      { poi: "silverCreek", light: "midday", criteria: [{ id: "S2", score: 3, note: "" }] }
    ]
  });
  assert(consistent.length === 0, "a <=1 swing should not be flagged");

  const files = ["ranch-midday.png"];
  const merged = mergeInbox(
    {
      model: "cursor-test",
      results: [{ image: "ranch-midday.png", criteria: [{ id: "U1", score: 4, note: "ok" }] }]
    },
    files
  );
  assert(merged[0].criteria.find((c) => c.id === "U1").score === 4, "inbox score should be kept");
  const omitted = merged[0].criteria.find((c) => c.id === "U2");
  assert(omitted.score === null && omitted.note.includes("omitted"), "omitted criteria stay unassessed");
  const missing = mergeInbox({ results: [] }, files);
  assert(missing[0].criteria[0].score === 0, "a missing image scores 0");

  let threw = false;
  try {
    rejectPlaceholder([
      {
        image: "a.png",
        criteria: Array.from({ length: 12 }, () => ({
          id: "U1",
          score: 3,
          note: "Cannot visually assess from this frame; agent cannot view images."
        }))
      }
    ]);
  } catch {
    threw = true;
  }
  assert(threw, "placeholder all-3 cannot-view inbox must not compile");

  for (const banned of ["claude", "gemini", "openai"]) {
    let refused = false;
    try {
      assertCursorSubscriptionOnly(banned);
    } catch {
      refused = true;
    }
    assert(refused, `${banned} must be refused on this branch`);
  }
  assertCursorSubscriptionOnly(undefined);
  assertCursorSubscriptionOnly("cursor");

  process.stdout.write("selftest ok\n");
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
