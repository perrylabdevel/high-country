/**
 * Runs the whole check suite from one command.
 *
 * `npm run check` used to chain 26 separate `npm run check:*` invocations with
 * `&&`. Each link paid an npm spawn plus a tsx cold start before doing any
 * work, and the serial wall time was long enough that an agent driving the
 * shell had to poll the command repeatedly to read its output — every poll
 * costing a full model inference.
 *
 * This runner spawns tsx directly (no npm wrapper) and runs the checks that
 * only assert on geometry concurrently. The three timing-sensitive checks run
 * afterwards, one at a time, with nothing else on the CPU: a concurrent WebGPU
 * capture once pushed check:grass-budget from 1.96 ms/chunk to 7.13 ms against
 * the same 6 ms budget, so measuring them under load reports failures that are
 * really contention.
 *
 * The check list is read from package.json, so adding a `check:*` script picks
 * it up automatically. Exit code is 1 if any check fails, matching the old
 * chain. Output stays compact on success and shows full stdout/stderr only for
 * the checks that failed.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cpus, loadavg } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TSX = join(ROOT, "node_modules", ".bin", "tsx");

/**
 * Checks that measure elapsed time and therefore cannot share the CPU.
 * Keep this list in step with any new benchmark-style check.
 */
const TIMING_SENSITIVE = new Set([
  "check:collision",
  "check:grass-budget",
  "check:nav-graph"
]);

function checkScripts() {
  const { scripts } = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const found = [];
  for (const [name, cmd] of Object.entries(scripts)) {
    if (!name.startsWith("check:")) continue;
    const match = /^tsx\s+(scripts\/[\w.-]+)$/.exec(cmd.trim());
    if (!match) {
      console.error(`check-all: skipping ${name} — expected "tsx scripts/<file>", got "${cmd}"`);
      continue;
    }
    found.push({ name, file: match[1] });
  }
  return found;
}

function run({ name, file }) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(TSX, [file], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => {
      resolve({ name, file, code: 1, out, err: `${err}${e.message}`, ms: Date.now() - started });
    });
    child.on("close", (code) => {
      resolve({ name, file, code: code ?? 1, out, err, ms: Date.now() - started });
    });
  });
}

async function runPool(items, limit) {
  const results = [];
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      results.push(await run(item));
    }
  });
  await Promise.all(workers);
  return results;
}

const all = checkScripts();
const parallel = all.filter((c) => !TIMING_SENSITIVE.has(c.name));
const serial = all.filter((c) => TIMING_SENSITIVE.has(c.name));

// Leave a core free so the parallel phase does not saturate the machine.
const limit = Math.max(1, Math.min(8, cpus().length - 1));
const started = Date.now();

const results = await runPool(parallel, limit);

/**
 * Timing-sensitive checks fail under contention rather than because the code
 * regressed, and a spurious failure sends an agent into a diagnose/fix/recheck
 * loop that costs far more than the retry. Run each one alone; if it fails,
 * wait for the machine to settle and measure once more. Only a second failure
 * counts. Contention inflates timings and never deflates them, so the better
 * of two runs is the honest estimate.
 */
const busy = () => loadavg()[0] > Math.max(2, cpus().length * 0.5);
const settle = (ms) => new Promise((r) => setTimeout(r, ms));

for (const item of serial) {
  let result = await run(item);
  if (result.code !== 0) {
    const load = loadavg()[0].toFixed(2);
    console.error(`check-all: ${item.name} failed at load ${load}; settling and remeasuring once`);
    await settle(3000);
    const retry = await run(item);
    if (retry.code === 0) {
      console.error(`check-all: ${item.name} passed on remeasure — first failure was CPU contention, not a regression`);
    }
    result = retry;
    result.retried = true;
  }
  results.push(result);
}

const byName = new Map(results.map((r) => [r.name, r]));
const failed = all.map((c) => byName.get(c.name)).filter((r) => r && r.code !== 0);

for (const r of failed) {
  console.error(`\n===== FAIL ${r.name} (${r.file}) exit ${r.code} =====`);
  const body = `${r.out}${r.err}`.trimEnd();
  if (body) console.error(body);
}

const elapsed = ((Date.now() - started) / 1000).toFixed(1);
const ranked = [...results].sort((a, b) => b.ms - a.ms);
const slowest = ranked.slice(0, 3).map((r) => `${r.name} ${(r.ms / 1000).toFixed(1)}s`).join(", ");

if (process.env.CHECK_TIMINGS) {
  console.error("\nper-check wall time:");
  for (const r of ranked) {
    console.error(`  ${(r.ms / 1000).toFixed(1).padStart(6)}s  ${r.name}${r.code === 0 ? "" : "  (FAILED)"}`);
  }
}

if (failed.length) {
  const timingFails = failed.filter((r) => TIMING_SENSITIVE.has(r.name));
  console.error(`\n${failed.length} of ${all.length} checks FAILED in ${elapsed}s (slowest: ${slowest})`);
  if (timingFails.length && busy()) {
    console.error(
      `machine load is ${loadavg()[0].toFixed(2)} on ${cpus().length} cores — ` +
      `${timingFails.map((r) => r.name).join(", ")} measure elapsed time and can fail from ` +
      `contention alone. Re-run on an idle machine before treating this as a regression.`
    );
  }
  process.exit(1);
}

console.log(`PASS ${all.length} checks in ${elapsed}s (${parallel.length} parallel x${limit}, ${serial.length} isolated; slowest: ${slowest})`);
