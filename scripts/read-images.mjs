/**
 * Pass-read harness: drives the pinned grader (gpt-5.6-luna via codex-vision)
 * over capture frames, one image per call, each scored against the rubric in
 * scripts/rubric.mjs. This is the wrapper that produced pass-96 — the graded
 * path when the grader cannot be driven from a Cursor chat directly.
 *
 * The read shape is what `npm run grade -- --compile audit/reports/inbox.json`
 * merges:
 *   { "image": "ranch-midday.png", "criteria": [
 *       { "id": "U1", "score": 4, "note": "..." },
 *       { "id": "G1", "score": null, "note": "n/a" } ] }
 *
 * Usage:
 *   node scripts/read-images.mjs <image-dir> <out-dir> <image.png> [image...]
 * e.g. the 32 audit frames:
 *   node scripts/read-images.mjs audit/current /tmp/pass-reads \
 *     $(ls audit/current/*.png | xargs -n1 basename)
 *
 * The prompt is the pinned pass-92 grading prompt — byte-identical to the
 * shape in docs/VISUAL_STATUS. Do not reword it: pass-92+ counts are only
 * comparable within that prompt (HARD_WON 3.4, the pass-92 note in
 * VISUAL_STATUS).
 *
 * Invocation note (HARD_WON 4): codex-vision stat()s every positional argument
 * to decide image-vs-prompt, so a multi-KB prompt passed as argv dies with
 * "File name too long" (Errno 63) before grading anything. The prompt goes via
 * --stdin-prompt, always. The earlier /tmp harness that passed it positionally
 * is the one that crashed every frame.
 *
 * No silent fallbacks: a failed call prints FAILED with the grader's own
 * stderr tail and that frame gets no read file — the inbox assembly step then
 * exits non-zero instead of compiling a partial grade.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { resolveCodexVision } from "./codex-vision.mjs";
import { criteriaFor } from "./rubric.mjs";

const VISION = resolveCodexVision();
const [imgDir, outDir, ...images] = process.argv.slice(2);
if (!imgDir || !outDir || !images.length) {
  throw new Error("usage: node scripts/read-images.mjs <image-dir> <out-dir> <image...>");
}
mkdirSync(outDir, { recursive: true });

let failed = 0;
for (const image of images) {
  const poi = image.replace(/-(midday|golden)\.png$/, "");
  const criteria = criteriaFor(poi);
  const lines = criteria.map((c) => `  ${c.id} — ${c.name}: ${c.detail}`).join("\n");
  const prompt = `You are the visual auditor for High Country. Grade the attached screenshot (${image}, ${poi}, ${
    /-golden\.png$/.test(image) ? "golden hour" : "midday"
  }) against the rubric below. Score every criterion 0-5. Use score null ONLY when the frame genuinely cannot show the detail; the ONLY criterion that may be "n/a" is G1 when no road is visible (note exactly "n/a"). Any other null is "cannot assess" and counts against coverage. For every score <= 3 write one sentence naming what you SEE that is wrong. Do not fill 3 because you cannot view images. Return ONLY a JSON object, no prose, no markdown fence:
{"image": "${image}", "criteria": [{"id": "U1", "score": 4, "note": "..."}]}

Criteria:
${lines}`;

  let out;
  try {
    const run = spawnSync(VISION, ["-i", path.join(imgDir, image), "--stdin-prompt"], {
      input: prompt,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: 180000
    });
    if (run.status !== 0) {
      console.error(`FAILED ${image}: exit ${run.status}: ${(run.stderr || "").slice(-300)}`);
      failed++;
      continue;
    }
    out = run.stdout;
  } catch (e) {
    console.error(`FAILED ${image}: ${e.message}`);
    failed++;
    continue;
  }
  const m = out.match(/\{[\s\S]*\}/);
  if (!m) {
    console.error(`NO JSON ${image}: ${out.slice(0, 200)}`);
    failed++;
    continue;
  }
  try {
    const parsed = JSON.parse(m[0]);
    writeFileSync(path.join(outDir, `${image}.json`), JSON.stringify(parsed, null, 2));
    console.log(`read ${image}: ${parsed.criteria?.length || 0} criteria`);
  } catch (e) {
    console.error(`BAD JSON ${image}: ${e.message}`);
    failed++;
  }
}

if (failed) {
  throw new Error(`${failed}/${images.length} frame(s) failed to grade — see FAILED lines above`);
}