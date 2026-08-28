/**
 * Cycle-B close-reads: drive the pinned grader (gpt-5.6-luna) over the A/B
 * frames. Two instruments:
 *  1. scored reads — same rubric wording before/after, per frame;
 *  2. blind pair preference — before/after side by side, grader not told
 *     which is which (A = left, B = right).
 * Diagnostic-only; never compiled into audit/reports.
 */
import { readdirSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolveCodexVision } from "./codex-vision.mjs";

const VISION = resolveCodexVision();
const MODE = process.argv[2]; // "scored" | "pair"
const BEFORE = process.env.BEFORE_DIR || "/tmp/cycleB-before";
const AFTER = process.env.AFTER_DIR || "/tmp/cycleB-after";
const OUT = process.env.READS_OUT || "/tmp/cycleB-reads";
mkdirSync(OUT, { recursive: true });

// Wall-tiling A/B (5218984, macro noise in texturedMat): the three POIs whose
// fixed audit cameras take a building facade in at a glance — the repeat
// distance the report names. Replaced the grass cycle-B names.
const NAMES = [
  "silverCreek-midday", "silverCreek-golden",
  "elPaso-midday", "elPaso-golden",
  "fortGrant-midday", "fortGrant-golden"
];

function run(image, prompt) {
  return execFileSync(VISION, ["--stdin-prompt", image], {
    input: prompt, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 180000
  });
}

if (MODE === "scored") {
  for (const name of NAMES) {
    for (const [side, dir] of [["before", BEFORE], ["after", AFTER]]) {
      const out = `${OUT}/${name}-${side}.json`;
      if (existsSync(out)) continue;
      const prompt = `You are the visual auditor for High Country. This is a diagnostic screenshot (${name}, midday or golden hour) of one or more buildings with textured walls. Judge ONLY this one criterion.
1. "tilingRepeat" (0-5): Does the wall/facade texture read as a natural surface, or as ONE texture tile stamped repeatedly at a fixed period — the same marks recurring across the wall so it reads as printed rather than built? 5 = no visible repeat period, each stretch of wall reads distinct; 0 = the same tile pattern is obviously stamped end to end. Note this is judged at the distance shown in the frame.
Return ONLY JSON: {"image":"${name}-${side}","criteria":[{"id":"tilingRepeat","score":4,"note":"..."}]}`;
      try {
        const raw = run(`${dir}/${name}.png`, prompt);
        const m = raw.match(/\{[\s\S]*\}/);
        if (!m) { console.error(`NO JSON ${name}-${side}`); continue; }
        writeFileSync(out, JSON.stringify(JSON.parse(m[0]), null, 2));
        console.log(`read ${name}-${side}`);
      } catch (e) { console.error(`FAILED ${name}-${side}: ${e.message}`); }
    }
  }
}

if (MODE === "pair") {
  let i = 0;
  for (const name of NAMES) {
    const out = `${OUT}/pair-${name}.json`;
    if (existsSync(out)) continue;
    // Side-swap controlled by env so position bias can be measured and
    // cancelled: PAIR_SIDE=left|right|alternate (default alternate).
    const afterLeft = process.env.PAIR_SIDE === "left" ? true
      : process.env.PAIR_SIDE === "right" ? false
      : (i % 2) === 1;
    i += 1;
    const left = afterLeft ? `${AFTER}/${name}.png` : `${BEFORE}/${name}.png`;
    const right = afterLeft ? `${BEFORE}/${name}.png` : `${AFTER}/${name}.png`;
    const dark = name.startsWith("barnWall");
    const prompt = `You are the visual auditor for High Country. Two renders of the SAME view are attached side by side; they may be identical or may differ in the wall surface texturing. LEFT image first, RIGHT image second.
Question: In which image does the building's wall/facade texture read as LESS repeated or stamped at this distance — i.e. whose walls look less like one texture tile printed over and over, with the same marks recurring at a fixed period?
Answer "left", "right", or "same". Then one sentence saying what you SEE that justifies it.
Return ONLY JSON: {"image":"${name}","answer":"left|right|same","note":"...","afterWas":"left|right"}`;
    const full = prompt.replace('"afterWas":"left|"', "").replace(',"afterWas":"left|right"', "");
    try {
      const raw = runPair(left, right, full);
      const m = raw.match(/\{[\s\S]*\}/);
      if (!m) { console.error(`NO JSON pair ${name}`); continue; }
      const parsed = JSON.parse(m[0]);
      parsed.afterWas = afterLeft ? "left" : "right";
      writeFileSync(out, JSON.stringify(parsed, null, 2));
      console.log(`pair ${name}: ${parsed.answer} (after was ${parsed.afterWas})`);
    } catch (e) { console.error(`FAILED pair ${name}: ${e.message}`); }
  }
}

function runPair(left, right, prompt) {
  return execFileSync(VISION, ["-i", left, "-i", right, "--stdin-prompt"], {
    input: prompt, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 180000
  });
}