/**
 * Measure wall-texture periodicity in a captured frame.
 *
 * Crops a wall strip and computes normalized autocorrelation of the
 * column-mean (and row-mean) luminance. A tiling repetition shows up as a
 * correlation peak at the lag equal to the texture period in pixels.
 *
 *   node scripts/measure-wall-repeat.mjs audit/wall-repeat-before/ranch-midday.png 500 520 820 640
 */
import sharp from "sharp";

const [file, x0s, y0s, x1s, y1s] = process.argv.slice(2);
if (!file) {
  throw new Error("usage: node scripts/measure-wall-repeat.mjs <png> [x0 y0 x1 y1]");
}
const x0 = x0s ? parseInt(x0s) : 0;
const y0 = y0s ? parseInt(y0s) : 0;
const x1 = x1s ? parseInt(x1s) : null;
const y1 = y1s ? parseInt(y1s) : null;

const { data, info } = await sharp(file).extract({
  left: x0, top: y0,
  width: x1 ? x1 - x0 : null || undefined,
  height: y1 ? y1 - y0 : null || undefined
}).raw().toBuffer({ resolveWithObject: true });

const { width: w, height: h, channels: ch } = info;

// Mean luminance per column and per row (0..1)
const colMean = new Float64Array(w);
const rowMean = new Float64Array(h);
for (let y = 0; y < h; y++) {
  let rs = 0;
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * ch;
    const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
    colMean[x] += lum;
    rs += lum;
  }
  rowMean[y] = rs / w;
}
for (let x = 0; x < w; x++) colMean[x] /= h;

/** Remove slow luminance gradients (shadows, lighting) so only texture-scale
 * structure survives; window = 2x expected period keeps the period band. */
function detrend(signal, win) {
  const s = new Float64Array(signal.length);
  for (let i = 0; i < signal.length; i++) {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(signal.length - 1, i + win); j++) {
      sum += signal[j]; n++;
    }
    s[i] = signal[i] - sum / n;
  }
  return s;
}

function autocorr(signal, minLag, maxLag) {
  const n = signal.length;
  let mean = 0;
  for (const v of signal) mean += v;
  mean /= n;
  const s = signal.map((v) => v - mean);
  let c0 = 0;
  for (const v of s) c0 += v * v;
  const out = [];
  for (let lag = minLag; lag <= Math.min(maxLag, n - 1); lag++) {
    let c = 0;
    for (let i = 0; i + lag < n; i++) c += s[i] * s[i + lag];
    out.push({ lag, r: c / (c0 || 1e-9) });
  }
  return out;
}

function report(label, signal) {
  const dt = detrend(signal, 24);
  const ac = autocorr(dt, 4, Math.floor(signal.length / 2));
  // Peak = best local maximum above lag 4
  let best = null;
  for (const p of ac) {
    if (!best || p.r > best.r) best = p;
  }
  const acStr = ac.filter((p) => p.lag % 2 === 0).map((p) => `${p.lag}:${p.r.toFixed(3)}`).join(" ");
  console.log(`${label}: peak lag ${best.lag}px r=${best.r.toFixed(3)}  [n=${signal.length}]`);
  console.log(`  curve ${acStr}`);
}

report("horizontal (column means)", colMean);
report("vertical   (row means)  ", rowMean);
console.log(`crop ${w}x${h} at (${x0},${y0}) from ${file}`);