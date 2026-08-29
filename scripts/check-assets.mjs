/**
 * The asset manifest must describe every texture the game loads.
 *
 * Binary assets live in a release bundle, not git, and assets/manifest.json is
 * the committed record of what that bundle holds. Nothing tied the two ends
 * together, so they drifted: a rebuild run on a checkout that happened to be
 * missing six foliage atlases quietly published a manifest without them, and a
 * fresh clone would have fetched every texture except the ones the ground cover
 * needs. The failure surfaces only as missing art at runtime, on someone else's
 * machine, well after the commit that caused it.
 *
 * So assert it here instead: every "/textures/..." path in the source has a
 * manifest entry, and every manifest entry that is on disk still hashes to what
 * the manifest claims.
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg);
  }
}

async function sourceFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await sourceFiles(full)));
    } else if (/\.(ts|js|mjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const manifest = JSON.parse(await readFile("assets/manifest.json", "utf8"));
const listed = new Set(manifest.files.map((f) => f.path));

// Every /textures/... literal anywhere in src/, not just textureManifest.ts —
// a path added elsewhere is exactly the one that would slip through.
const referenced = new Map();
for (const file of await sourceFiles("src")) {
  const text = await readFile(file, "utf8");
  for (const [, ref] of text.matchAll(/"\/textures\/([^"]+)"/g)) {
    if (!referenced.has(ref)) {
      referenced.set(ref, file);
    }
  }
}
assert(referenced.size > 0, "found no /textures/ references in src — this check has gone blind");

const unlisted = [...referenced].filter(([ref]) => !listed.has(ref));
assert(
  unlisted.length === 0,
  `assets/manifest.json is missing textures the game loads, so a fresh clone ` +
    `will not fetch them:\n  ` +
    unlisted.map(([ref, file]) => `${ref}  (referenced by ${file})`).join("\n  ") +
    `\nRe-run "npm run assets:bundle" on a checkout that has the complete ` +
    `public/textures, then upload the tarball and commit the manifest.`
);

// The manifest also has to describe the bytes it claims. Only files present
// locally are checked: a clean checkout before assets:fetch has none of them,
// and that is not this check's business.
const wrong = [];
let hashed = 0;
for (const entry of manifest.files) {
  const full = path.join(manifest.target, entry.path);
  if (!existsSync(full)) {
    continue;
  }
  hashed += 1;
  const sha = createHash("sha256").update(await readFile(full)).digest("hex");
  if (sha !== entry.sha256) {
    wrong.push(entry.path);
  }
}
assert(
  wrong.length === 0,
  `local textures do not match their manifest hashes — the manifest is stale ` +
    `or the bundle was rebuilt without committing it:\n  ${wrong.join("\n  ")}`
);

// A tangent-space normal map is vector data, not a picture: its R/G channels
// must average to ~127.5 or the whole surface is shaded with a constant tilt.
// gravel's shipped as sRGB-encoded — mean R/G 183.9/183.3, a uniform 31.9 deg
// tangent-space slope that survived to an 8x8 mip — so every road in the game
// (splat channel A is gravel) was lit as a slope and the real gravel detail
// rode on a DC term twice its own size. `pack-textures` now decodes such a map
// and hard-errors on a bias it cannot explain; this pins the packed result.
//
// Only the intermediate .jpg can be read here: what ships is UASTC KTX2, which
// needs a transcoder Node does not have, and `assets:bundle` drops any file
// with a .ktx2 twin, so a fresh clone has neither. Checking the .jpg when it
// is present covers every machine that has actually run pack-textures — which
// is the only place the fault can be introduced.
const NORMAL_MEAN_TOLERANCE = 12;
const biased = [];
let normalsChecked = 0;
for (const file of await readdir(manifest.target).catch(() => [])) {
  if (!/_normal\.jpg$/.test(file)) {
    continue;
  }
  const { data, info } = await sharp(path.join(manifest.target, file))
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const px = info.width * info.height;
  let r = 0;
  let g = 0;
  for (let i = 0; i < px; i += 1) {
    r += data[i * info.channels];
    g += data[i * info.channels + 1];
  }
  normalsChecked += 1;
  const meanR = r / px;
  const meanG = g / px;
  if (Math.max(Math.abs(meanR - 127.5), Math.abs(meanG - 127.5)) > NORMAL_MEAN_TOLERANCE) {
    const tilt = (Math.atan(Math.hypot(meanR / 127.5 - 1, meanG / 127.5 - 1)) * 180) / Math.PI;
    biased.push(`${file}  mean R/G ${meanR.toFixed(1)}/${meanG.toFixed(1)} = ${tilt.toFixed(1)}deg constant tilt`);
  }
}
assert(
  biased.length === 0,
  `normal maps have a net tilt — they are not tangent-space vector data, so ` +
    `every surface using them is shaded as a slope:\n  ${biased.join("\n  ")}\n` +
    `Re-run "npm run pack-textures" (PACK_ONLY=<set>), which decodes an ` +
    `sRGB-encoded normal map, then re-bundle.`
);

console.log(JSON.stringify({
  manifestFiles: manifest.files.length,
  referencedInSource: referenced.size,
  hashVerifiedLocally: hashed,
  normalMapsChecked: normalsChecked
}, null, 2));
console.log("PASS");
