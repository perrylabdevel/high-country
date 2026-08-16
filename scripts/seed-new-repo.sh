#!/usr/bin/env bash
# Seed a fresh repository from the current working tree, with no history.
#
#   ./scripts/seed-new-repo.sh [target-dir]
#
# Why: this repo's .git is ~230 MB against a ~263 MB working tree, most of it
# superseded uncompressed textures that are no longer loaded. That weight is
# permanent — every clone pays it forever. Seeding keeps every working file and
# none of the history.
#
# Verified: the produced tree passes `npm ci`, `npm run build`, all ten checks,
# and `npm run grade:selftest` from a cold start.
#
# After running, create an EMPTY repo on GitHub (no README, no .gitignore) and:
#   cd <target-dir>
#   git remote add origin git@github.com:<owner>/<name>.git
#   git push -u origin main
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-../high-country}"

if [ -e "$DEST" ]; then
  echo "refusing to overwrite existing path: $DEST" >&2
  exit 1
fi

echo "seeding from $SRC"
echo "          to $DEST"
mkdir -p "$DEST"

# git archive emits tracked files only — no stray build output, no node_modules.
git -C "$SRC" archive HEAD | tar -x -C "$DEST"

cd "$DEST"

# Dropped from the seed, with reasons:
rm -rf .specstory                  # agent transcripts; some are 11k lines each
rm -rf legacy-2d                   # archived 2D prototype, superseded
rm -rf High_Country_Game_Handoff   # original brief; docs/ supersedes it
rm -rf audit/current audit/pass-*  # screenshots are regenerable
rm -rf dist                        # build output
rm -f  update_inbox.py serve.py serve.sh IMPLEMENTATION_STATUS.md
                                   # Cursor-era helpers and a stale status file

# Binary assets are fetched, not committed. assets/manifest.json carries the
# per-file hashes and the release URL; postinstall runs scripts/fetch-assets.mjs.
# This is the single biggest structural improvement over the old repo, whose
# .git reached 230 MB because every re-encode of every texture is kept forever.
rm -rf public/textures

cat > .gitignore <<'EOF'
node_modules/
dist/
.DS_Store
Thumbs.db
*.log
.vscode/
.idea/
.env
.env.*
!.env.example
*.local

# Audit screenshots are regenerable: npm run capture
audit/current/
audit/pass-*/
audit/reports/inbox.json
audit/reports/cursor-worksheet.md

# Basis transcoder is copied in by postinstall
public/basis/

# Binary assets are fetched by postinstall: see assets/manifest.json
public/textures/
assets-dist/
.asset-cache/

# Agent transcripts do not belong in the repo
.specstory/
EOF

SRC_REF="$(git -C "$SRC" rev-parse --short HEAD)"
git init -q -b main
git add -A
git commit -q -F - <<MSG
High Country — seeded from the working tree at ${SRC_REF}

A browser game set in the 1880s American West: three.js WebGPURenderer with TSL
node materials, Vite, a 4000 x 5000 m world with 16 points of interest, and a
screenshot-grading audit loop.

Seeded rather than migrated. The previous repository carried ~230 MB of git
history against a ~263 MB working tree, most of it superseded uncompressed
textures no longer loaded by the game. This commit keeps every working file and
none of that history.

Binary assets are not in this history. assets/manifest.json describes them and
postinstall fetches them from a release asset; scripts/make-asset-bundle.mjs
rebuilds the bundle when they change.

Read docs/TAKEOVER.md first. docs/HARD_WON.md is the defect register — every
entry in it cost real time to find once already.
MSG

echo
echo "seeded: $(git ls-files | wc -l) files, .git is $(du -sh .git | cut -f1)"
echo
echo "next:"
echo "  cd $DEST"
echo "  npm ci            # fetches textures via assets/manifest.json"
echo "  npm run build && npm run check   # verify before pushing"
echo "  git remote add origin git@github.com:<owner>/<name>.git"
echo "  git push -u origin main"
