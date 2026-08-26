---
name: asset-bundle
description: Change, rebuild, or publish the binary texture assets. Use when adding or re-baking a texture, when the manifest is stale, when assets fail to fetch, or when a fresh clone is missing art.
---

# asset-bundle

Binary assets are **not in git**. `public/textures/` is gitignored. They live
as a GitHub Release asset described by `assets/manifest.json`, and
`scripts/fetch-assets.mjs` pulls them in on postinstall.

This pipeline has produced six separate faults. Follow the procedure exactly.

## Commands

```bash
npm run assets:fetch     # pull the published bundle (also runs on postinstall)
npm run bake:foliage     # regenerate the foliage atlases (deterministic)
npm run assets:bundle    # rebuild tarball + manifest from public/textures
npx tsx scripts/check-assets.mjs
```

## Publishing a change

1. Make sure `public/textures/` is **complete and current** — run
   `npm run assets:fetch` first. Bundling from an incomplete directory is
   exactly how six foliage atlases were silently dropped from the manifest and
   a fresh clone stopped getting them.
2. Re-bake or replace what changed.
3. `npm run assets:bundle`. Read the output:
   - `contents unchanged — kept the published bundle's sha256` → nothing to
     upload, and the manifest is untouched. Stop here.
   - A new `textures-<hash>.tar.gz` → continue.
4. Upload that tarball to the **`textures`** release tag. The manifest already
   points at the filename; no second commit is needed.
5. Commit `assets/manifest.json`.
6. Verify from the live URL, not from local state:

```bash
curl -sSL -o /tmp/b.tar.gz "$(node -p "require('./assets/manifest.json').url")"
mkdir -p /tmp/t && tar -xzf /tmp/b.tar.gz -C /tmp/t
```
Then check every manifest entry exists in `/tmp/t` with a matching sha256.

## Rules

- **`bundleSha256` must describe the file you actually uploaded.** gzip is not
  reproducible, so a rebuild on another machine produces different compressed
  bytes from identical inputs. `assets:bundle` keeps the published hash when
  `contentHash` is unchanged — do not defeat that by hand-editing.
- **A `bundleSha256` mismatch is a warning, not a failure.** Per-file hashes
  decide. But never leave the manifest pointing at a hash no uploaded file has.
- **Never hand-edit `assets/manifest.json`** except to set `url`.
- **Never add a texture path to `src/materials/textureManifest.ts` without
  bundling it.** `check:assets` catches this — it asserts every
  `"/textures/..."` literal in `src/` has a manifest entry.
- **The foliage baker is seeded and reproducible.** Two bakes give
  byte-identical files. If they differ, someone reintroduced unseeded
  randomness — fix that rather than shipping the drift.
- **Do not bundle intermediates.** `pack-textures` writes `_albedo.jpg`,
  `_normal.jpg`, `_orm.png` beside the `.ktx2` it encodes from them. Nothing
  loads them. `assets:bundle` drops any file with a `.ktx2` twin, and skips
  dotfiles (macOS writes `._name` sidecars for files with xattrs).

## If a fresh clone fails to fetch

Read the error. "failed verification" naming specific files means the manifest
and the uploaded tarball disagree — republish per above. It does **not** mean
disable the check.
