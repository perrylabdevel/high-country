/**
 * Build the binary asset bundle and its manifest.
 *
 *   npm run assets:bundle
 *
 * Produces:
 *   assets-dist/textures-<shorthash>.tar.gz   the bundle to upload
 *   assets/manifest.json                      committed; per-file hashes
 *
 * Binary assets do not belong in git history — every re-encode keeps its old
 * version forever, which is how the previous repository reached 230 MB of .git
 * against a 263 MB working tree. They live as a release asset instead, and
 * `scripts/fetch-assets.mjs` pulls them in on postinstall.
 *
 * After running this, upload the tarball as a GitHub Release asset and put its
 * download URL in assets/manifest.json under `url`, then commit the manifest.
 */
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const execFileAsync = promisify(execFile);

const SRC_DIR = "public/textures";
const OUT_DIR = "assets-dist";
const MANIFEST = "assets/manifest.json";

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

/** Every file under public/textures, recursively, as repo-relative paths. */
async function collect(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collect(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out.sort();
}

async function main() {
  if (!existsSync(SRC_DIR)) {
    throw new Error(`no ${SRC_DIR} — nothing to bundle`);
  }
  const files = await collect(SRC_DIR);
  if (!files.length) {
    throw new Error(`${SRC_DIR} is empty`);
  }

  const entries = [];
  let total = 0;
  for (const f of files) {
    const { size } = await stat(f);
    total += size;
    entries.push({
      path: path.relative(SRC_DIR, f).split(path.sep).join("/"),
      bytes: size,
      sha256: await sha256(f)
    });
  }

  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(path.dirname(MANIFEST), { recursive: true });

  // Hash the file list, not the tarball — gzip output is not reproducible
  // across versions, so a content hash of the inputs is the stable identity.
  const contentHash = createHash("sha256")
    .update(entries.map((e) => `${e.path}:${e.sha256}`).join("\n"))
    .digest("hex");
  const short = contentHash.slice(0, 12);
  const bundleName = `textures-${short}.tar.gz`;
  const bundlePath = path.join(OUT_DIR, bundleName);

  // -C so paths inside the tarball are relative to public/textures.
  await execFileAsync("tar", ["-czf", bundlePath, "-C", SRC_DIR, "."]);
  const bundleSha = await sha256(bundlePath);
  const { size: bundleBytes } = await stat(bundlePath);

  // Preserve an existing url across rebuilds; only the operator sets it.
  let url = "";
  if (existsSync(MANIFEST)) {
    try {
      url = JSON.parse(await readFile(MANIFEST, "utf8")).url || "";
    } catch {
      // malformed manifest; start fresh
    }
  }

  await writeFile(
    MANIFEST,
    JSON.stringify(
      {
        version: 1,
        // Set this to the release asset download URL, then commit the manifest.
        // scripts/fetch-assets.mjs refuses to run without it.
        url,
        bundle: bundleName,
        contentHash,
        bundleSha256: bundleSha,
        bundleBytes,
        target: SRC_DIR,
        files: entries
      },
      null,
      2
    ) + "\n"
  );

  const mb = (n) => (n / 1048576).toFixed(1);
  process.stdout.write(
    `bundled ${entries.length} files, ${mb(total)} MB raw -> ${mb(bundleBytes)} MB compressed\n` +
      `  ${bundlePath}\n` +
      `  manifest: ${MANIFEST}\n\n` +
      (url
        ? `url already set: ${url}\n`
        : `next: upload ${bundleName} as a release asset, put its download URL in\n` +
          `      ${MANIFEST} under "url", and commit the manifest.\n`)
  );
}

main().catch((err) => {
  process.stderr.write(`${err.message}\n`);
  process.exit(1);
});
