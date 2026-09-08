/**
 * Measure creek vs lake vs bank tone in a capture frame.
 *   node scripts/measure-creek-tone.mjs <image> <x,y,w,h> [<x,y,w,h> ...]
 * Boxes are in pixels of the 1536x1024 frame. Prints median RGB per box plus
 * a cyan-cast figure ((G+B)/2 - R, the tester-visible "teal paint" signal —
 * the lake's neutral water sits near 0, the over-painted creek sat at ~+21).
 */
import sharp from "sharp";

const [img, ...boxes] = process.argv.slice(2);
if (!img || boxes.length === 0) {
  console.error("usage: node scripts/measure-creek-tone.mjs <image> x,y,w,h ...");
  process.exit(1);
}

const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
const ch = info.channels;

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[s.length >> 1];
};

for (const spec of boxes) {
  const [x, y, w, h] = spec.split(",").map(Number);
  const r = [];
  const g = [];
  const b = [];
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      const i = (py * info.width + px) * ch;
      r.push(data[i]);
      g.push(data[i + 1]);
      b.push(data[i + 2]);
    }
  }
  const mr = median(r);
  const mg = median(g);
  const mb = median(b);
  const cast = ((mg + mb) / 2 - mr).toFixed(1);
  console.log(
    `box(${x},${y},${w}x${h})  rgb(${mr},${mg},${mb})  cyan-cast ${cast}  n=${r.length}`
  );
}