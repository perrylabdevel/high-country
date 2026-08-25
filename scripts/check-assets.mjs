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

console.log(JSON.stringify({
  manifestFiles: manifest.files.length,
  referencedInSource: referenced.size,
  hashVerifiedLocally: hashed
}, null, 2));
console.log("PASS");
