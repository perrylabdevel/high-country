/**
 * Close-vantage diagnostic grader (CAPTURE_MODE=close). NOT part of the
 * graded audit: it never reads or writes audit/reports or audit/current, and
 * it must never be compiled into a pass-NN. Its coverage formula is the same
 * one grade.mjs uses (scored / (scored + non-"n/a" nulls) >= 0.8) so the
 * diagnostic set can be held to the same bar without feeding the series.
 *
 * Usage:
 *   node scripts/close-grade.mjs --prompts            # one rubric prompt per
 *                                                     # audit/close/*.png
 *   node scripts/close-grade.mjs --stats <read-dir>   # stats from the filled
 *                                                     # per-image JSON reads
 *
 * The reads are produced by the pinned grader (gpt-5.6-luna via codex-vision)
 * one image per call, each saved as <read-dir>/<image>.json in the shape:
 *   { "image": "ranch-midday.png", "criteria": [
 *       { "id": "U1", "score": 4, "note": "..." },
 *       { "id": "G1", "score": null, "note": "n/a" }
 *   ] }
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { criteriaFor, ARID_POIS } from "./rubric.mjs";

const CAPTURE_DIR = process.env.CLOSE_CAPTURES || "audit/close";
const MIN_COVERAGE = Number(process.env.CLOSE_MIN_COVERAGE || 0.8);

const mode = process.argv[2];

function listImages() {
  if (!existsSync(CAPTURE_DIR)) {
    throw new Error(`no close captures at ${CAPTURE_DIR} — run capture-poi.mjs with CAPTURE_MODE=close`);
  }
  return readdirSync(CAPTURE_DIR)
    .filter((f) => f.endsWith(".png"))
    .sort();
}

function poiOf(image) {
  return image.replace(/-(midday|golden)\.png$/, "");
}

function lightOf(image) {
  return /-golden\.png$/.test(image) ? "golden" : "midday";
}

if (mode === "--prompts") {
  for (const image of listImages()) {
    const poi = poiOf(image);
    const criteria = criteriaFor(poi);
    const lines = criteria.map((c) => `  ${c.id} — ${c.name}: ${c.detail}`).join("\n");
    const arid = ARID_POIS.has(poi) ? " (arid POI)" : "";
    console.log(`=== ${image} === poi=${poi} light=${lightOf(image)}${arid}`);
    console.log(lines);
    console.log();
  }
  process.exit(0);
}

if (mode === "--stats") {
  const readDir = process.argv[3];
  if (!readDir) throw new Error("usage: close-grade.mjs --stats <read-dir>");
  const rows = {};
  for (const f of readdirSync(readDir).filter((f) => f.endsWith(".json"))) {
    const r = JSON.parse(readFileSync(join(readDir, f), "utf8"));
    rows[r.image] = r;
  }
  const expected = listImages();
  const missing = expected.filter((f) => !rows[f]);
  if (missing.length) {
    throw new Error(`missing reads for ${missing.length} images: ${missing.slice(0, 5).join(", ")}`);
  }

  let scored = 0, nonNaNull = 0, na = 0, fails = 0;
  const failRows = [];
  const nullByCriterion = {};
  const failByCriterion = {};
  const failByPoi = {};
  for (const image of expected) {
    const poi = poiOf(image);
    const known = criteriaFor(poi).map((c) => c.id);
    const readIds = new Set(rows[image].criteria.map((c) => c.id));
    for (const c of rows[image].criteria) {
      const s = c.score;
      if (s === null || s === undefined) {
        // Only G1's rubric text allows n/a ("no road in frame"); that is the
        // same exemption the graded path honours (pass-86 exempts exactly the
        // G1-n/a rows). Any other null is "cannot assess" and counts against
        // coverage — otherwise labelling every null "n/a" fakes a clean pass.
        if (c.id === "G1" && /n\/a/i.test(c.note || "")) na += 1;
        else {
          nonNaNull += 1;
          nullByCriterion[c.id] = (nullByCriterion[c.id] || 0) + 1;
        }
      } else {
        scored += 1;
        if (s <= 3) {
          fails += 1;
          failByCriterion[c.id] = (failByCriterion[c.id] || 0) + 1;
          failByPoi[poi] = (failByPoi[poi] || 0) + 1;
          failRows.push({ image, id: c.id, score: s, note: (c.note || "").slice(0, 110) });
        }
      }
    }
    for (const id of known) {
      if (!readIds.has(id)) {
        throw new Error(`read for ${image} is missing criterion ${id} — grader dropped a row`);
      }
    }
  }
  const coverage = scored / (scored + nonNaNull);
  console.log(`images read: ${expected.length}`);
  console.log(`scored: ${scored}  non-na null: ${nonNaNull}  n/a: ${na}  fails (<=3): ${fails}`);
  console.log(`coverage: ${(coverage * 100).toFixed(1)}%  (floor ${(MIN_COVERAGE * 100).toFixed(0)}%)  ${coverage >= MIN_COVERAGE ? "OK" : "BELOW FLOOR"}`);
  console.log(`nulls by criterion: ${JSON.stringify(nullByCriterion)}`);
  console.log(`fails by criterion: ${JSON.stringify(failByCriterion)}`);
  console.log(`fails by POI: ${JSON.stringify(failByPoi)}`);
  console.log("--- fail rows ---");
  for (const f of failRows.sort((a, b) => a.image.localeCompare(b.image))) {
    console.log(`${f.image} ${f.id}=${f.score} | ${f.note}`);
  }
  process.exit(0);
}

throw new Error("usage: close-grade.mjs --prompts | --stats <read-dir>");
