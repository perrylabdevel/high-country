/**
 * Mean-abs-diff two capture passes frame by frame. Diagnostic helper.
 *   node scripts/probe-capture-diff.mjs audit/current audit/weather-baseline
 */
import { readdirSync } from "node:fs";
import sharp from "sharp";

const [aDir, bDir] = process.argv.slice(2);
const files = readdirSync(aDir).filter((f) => f.endsWith(".png")).sort();
let worst = { file: "", diff: 0 };
let sum = 0;
for (const f of files) {
  const a = await sharp(`${aDir}/${f}`).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(`${bDir}/${f}`).raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    console.log(`${f}: SIZE MISMATCH`);
    continue;
  }
  let d = 0;
  const n = Math.min(a.data.length, b.data.length);
  for (let i = 0; i < n; i += 1) {
    d += Math.abs(a.data[i] - b.data[i]);
  }
  const mean = d / n;
  sum += mean;
  if (mean > worst.diff) {
    worst = { file: f, diff: mean };
  }
  console.log(`${f}: ${mean.toFixed(3)}`);
}
console.log(`\nmean over ${files.length} frames: ${(sum / files.length).toFixed(4)}  worst: ${worst.file} ${worst.diff.toFixed(3)}`);