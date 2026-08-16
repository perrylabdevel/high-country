/**
 * Fetch the binary asset bundle described by assets/manifest.json.
 *
 *   npm run assets:fetch          # also runs on postinstall
 *   ASSETS_URL=... npm run assets:fetch
 *
 * Binary assets are not in git — see scripts/make-asset-bundle.mjs for why.
 * This pulls them into public/textures/ and verifies every file against the
 * manifest's hashes, so a truncated download or a stale bundle fails loudly
 * instead of silently rendering the wrong thing.
 *
 * Exit codes:
 *   0  assets present and verified, or the manifest has no url yet (bootstrap)
 *   1  download or verification failed
 *
 * The bootstrap case exits 0 on purpose: a fresh clone before the first bundle
 * has been uploaded should still install. It prints a loud warning, and the
 * build will fail later on the missing textures, which is the honest failure.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);
const MANIFEST = "assets/manifest.json";
const TMP = ".asset-cache";

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

/** True when every manifest file is present with the right hash. */
async function alreadyCurrent(manifest) {
  for (const entry of manifest.files) {
    const full = path.join(manifest.target, entry.path);
    if (!existsSync(full)) {
      return false;
    }
    if ((await sha256(full)) !== entry.sha256) {
      return false;
    }
  }
  return true;
}

async function verifyAll(manifest) {
  const bad = [];
  for (const entry of manifest.files) {
    const full = path.join(manifest.target, entry.path);
    if (!existsSync(full)) {
      bad.push(`${entry.path}: missing after extract`);
      continue;
    }
    const got = await sha256(full);
    if (got !== entry.sha256) {
      bad.push(`${entry.path}: sha256 ${got.slice(0, 12)} != ${entry.sha256.slice(0, 12)}`);
    }
  }
  return bad;
}

async function main() {
  if (!existsSync(MANIFEST)) {
    process.stdout.write(`no ${MANIFEST}; nothing to fetch\n`);
    return;
  }
  const manifest = JSON.parse(await readFile(MANIFEST, "utf8"));
  const url = process.env.ASSETS_URL || manifest.url;

  if (!url) {
    process.stderr.write(
      `\n  ⚠  ${MANIFEST} has no "url" — binary assets cannot be fetched.\n` +
        `     Run: npm run assets:bundle, upload the tarball as a release asset,\n` +
        `     put its download URL in the manifest, and commit it.\n` +
        `     The build will fail on missing textures until then.\n\n`
    );
    return; // bootstrap: do not block install
  }

  if (await alreadyCurrent(manifest)) {
    process.stdout.write(`assets up to date (${manifest.files.length} files)\n`);
    return;
  }

  process.stdout.write(`fetching assets from ${url}\n`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`download failed: HTTP ${res.status} ${res.statusText}`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());

  await mkdir(TMP, { recursive: true });
  const tarball = path.join(TMP, manifest.bundle || "assets.tar.gz");
  await writeFile(tarball, bytes);

  const got = createHash("sha256").update(bytes).digest("hex");
  if (manifest.bundleSha256 && got !== manifest.bundleSha256) {
    throw new Error(
      `bundle sha256 mismatch\n  expected ${manifest.bundleSha256}\n  got      ${got}\n` +
        `The manifest and the uploaded bundle disagree — re-upload or re-bundle.`
    );
  }

  await mkdir(manifest.target, { recursive: true });
  await execFileAsync("tar", ["-xzf", tarball, "-C", manifest.target]);

  const bad = await verifyAll(manifest);
  if (bad.length) {
    throw new Error(`extracted assets failed verification:\n  - ${bad.join("\n  - ")}`);
  }

  await rm(TMP, { recursive: true, force: true });
  process.stdout.write(`assets verified (${manifest.files.length} files)\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
