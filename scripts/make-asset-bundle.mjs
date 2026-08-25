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

/**
 * Every file under public/textures, recursively, as repo-relative paths.
 *
 * Dotfiles are skipped. macOS tar writes an AppleDouble sidecar (._name) for
 * any file carrying an extended attribute — a downloaded texture picks up
 * com.apple.quarantine, and six of them rode into the last bundle that way.
 * They keep the real file's extension, so the .ktx2-twin filter below happily
 * keeps them: without this they would be collected on the next rebuild and
 * written into the manifest as if they were textures.
 */
async function collect(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }
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
  const all = await collect(SRC_DIR);
  if (!all.length) {
    throw new Error(`${SRC_DIR} is empty`);
  }
  // Drop pack-textures' intermediates. It writes each source as _albedo.jpg /
  // _normal.jpg / _orm.png beside the .ktx2 it encodes from them, and nothing
  // at runtime ever loads those — but they were going into the bundle anyway,
  // which is why it had grown to 273 MB that every clone downloads. A file is
  // an intermediate exactly when a .ktx2 twin of the same basename exists, so
  // test for the twin rather than blocklisting extensions: foliage albedo is
  // PNG on purpose and has no .ktx2 twin, so it stays.
  const ktx2Twins = new Set(
    all.filter((f) => f.endsWith(".ktx2")).map((f) => f.slice(0, -".ktx2".length))
  );
  const files = all.filter((f) => {
    if (f.endsWith(".ktx2")) {
      return true;
    }
    const dot = f.lastIndexOf(".");
    return dot === -1 || !ktx2Twins.has(f.slice(0, dot));
  });
  const dropped = all.length - files.length;

  // Preserve an existing url across rebuilds; only the operator sets it.
  let url = "";
  let prev = null;
  if (existsSync(MANIFEST)) {
    try {
      prev = JSON.parse(await readFile(MANIFEST, "utf8"));
      url = prev.url || "";
    } catch {
      // malformed manifest; start fresh
    }
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

  // -C so paths inside the tarball are relative to public/textures, and an
  // explicit file list rather than "." so the archive holds exactly what the
  // manifest describes. Archiving the whole directory instead meant the
  // tarball carried files the manifest never listed — downloaded by every
  // clone and verified by nothing.
  await execFileAsync("tar", [
    "-czf",
    bundlePath,
    "-C",
    SRC_DIR,
    ...entries.map((e) => e.path)
  ]);
  let bundleSha = await sha256(bundlePath);
  let bundleBytes = (await stat(bundlePath)).size;
  // gzip is not reproducible, so re-running this on a second machine produces
  // a byte-different tarball from identical inputs. Recording that local gzip
  // would point the manifest at a file nobody has uploaded, and every clone
  // would warn against a hash no artifact matches — which is exactly the
  // correction that had to be made by hand last time. When contentHash is
  // unchanged the published bundle is still the right one, so keep its
  // recorded identity and leave the local tarball as a convenience copy.
  const sameContent = prev && prev.contentHash === contentHash && prev.bundleSha256;
  if (sameContent) {
    bundleSha = prev.bundleSha256;
    bundleBytes = prev.bundleBytes;
  }

  // The bundle filename carries the content hash, so a rebuild always renames
  // it. Carrying the old url forward verbatim would commit a manifest that
  // downloads the previous bundle and then fails its own hash check — the
  // failure looks like a corrupt download rather than a missed upload. The
  // release tag is stable, so swap just the filename and keep the rest.
  const prevBundle = url.split("/").pop();
  if (prevBundle && /^textures-[0-9a-f]{12}\.tar\.gz$/.test(prevBundle)) {
    url = url.slice(0, -prevBundle.length) + bundleName;
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
      (dropped ? `  skipped ${dropped} pack-textures intermediates with .ktx2 twins\n` : "") +
      (sameContent
        ? `  contents unchanged — kept the published bundle's sha256; no re-upload needed\n`
        : "") +
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
