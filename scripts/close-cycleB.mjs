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
const BEFORE = "/tmp/cycleB-before";
const AFTER = "/tmp/cycleB-after";
const OUT = process.env.READS_OUT || "/tmp/cycleB-reads";
mkdirSync(OUT, { recursive: true });

const NAMES = ["barnWall-midday", "barnWall-golden", "openGround-midday", "openGround-golden"];

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
      const dark = name.startsWith("barnWall");
      const open = name.startsWith("openGround");
      const prompt = `You are the visual auditor for High Country. This is an eye-height diagnostic screenshot (${name}, midday or golden hour) of grass rendered as alpha-cutout blade cards.
${dark ? "The subject: grass tufts standing in front of a dark barn wall. Judge ONLY these two criteria." : "The subject: open grassland at eye height, no dark backdrop behind it. Judge ONLY these two criteria."}
1. "grounded" (0-5): ${dark
  ? "Does each grass tuft in front of the dark wall read as growing out of the ground — blade bases connecting to the soil — or do the darker lower halves of blades fall below the wall and vanish, so lit blades appear to start in mid-air? 5 = every tuft clearly rooted; 0 = most blades look like they float."
  : "Does each grass tuft read as growing out of the ground with a visible base, or do blades look detached from the soil? 5 = every tuft clearly rooted; 0 = blades float."}
2. "tonalRange" (0-5): ${open
  ? "Does the grass keep a natural range of tones — darker shaded interiors inside clumps against lighter lit blades — or has it gone flat/washed-out, one uniform value across the field? 5 = rich internal depth; 0 = flat wash."
  : "Does the grass keep a natural range of tones with darker interiors inside each clump, or has it gone flat/uniform? 5 = rich internal depth; 0 = flat wash."}
Return ONLY JSON: {"image":"${name}-${side}","criteria":[{"id":"tonalRange","score":4,"note":"..."},{"id":"grounded","score":4,"note":"..."}]}`;
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
    const prompt = `You are the visual auditor for High Country. Two renders of the SAME view are attached side by side; they may be identical or may differ in the grass blade colouring. LEFT image first, RIGHT image second.
Question: ${dark
  ? "In which image do the grass tufts in front of the dark barn wall read better — more clearly growing out of the ground, with blade bases that do not vanish against the dark wood?"
  : "In which image does the open grassland read better — keeping natural tonal depth inside the clumps without looking washed out or flat?"}
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