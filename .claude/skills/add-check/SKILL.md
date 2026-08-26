---
name: add-check
description: Lock a fixed bug in with an automated check so it cannot come back silently. Use after fixing any bug that produced no error message, or when told to make a fix permanent.
---

# add-check

A bug that fails **loudly** rarely needs a check — the error finds it. A bug
that fails **silently** needs one, because nothing else will catch it.

Silent failures already found here: canopies rendering pure black from an
unset `instanceColor` (nothing thrown, nothing logged); the asset manifest
missing textures the game loads (breaks only on someone else's fresh clone);
screenshots showing the previous location's ground cover.

## Where checks live

`scripts/check-*.mjs`, wired into `npm run check` in `package.json`. There are
13. Each prints a small JSON summary then `PASS`, and throws with a message
that says what to do about it.

## Procedure

1. **Write the check.** Follow an existing one for shape —
   `scripts/check-assets.mjs` is a good short model. Build the world dry with
   the canvas stub from `scripts/check-vegetation.mjs` if you need scene data.
2. **Make the failure message actionable.** Name the offending items and the
   command that fixes them. Compare:
   - Bad: `Error: manifest invalid`
   - Good: `assets/manifest.json is missing textures the game loads, so a
     fresh clone will not fetch them: foliage/grass_albedo.png (referenced by
     src/materials/textureManifest.ts) … Re-run "npm run assets:bundle" on a
     checkout that has the complete public/textures.`
3. **Negative-test it.** This step is not optional. Reintroduce the exact bug,
   confirm the check fails and names the right thing, then restore:

```bash
cp src/vegetation.js /tmp/veg.bak
# reintroduce the bug with sed/edit
npx tsx scripts/check-vegetation.mjs   # must FAIL, naming the right items
cp /tmp/veg.bak src/vegetation.js
npx tsx scripts/check-vegetation.mjs   # must PASS again
```

   A check that has never failed is not known to work. Several checks in this
   repo were verified exactly this way.
4. **Wire it in.** Add `check:<name>` to `package.json` and append it to the
   `check` script.
5. Run the `verify-change` skill. `npm run check` must now print PASS 14 times
   (13 + yours).
6. **Explain the cost in the file header.** Say what went wrong, how it was
   found, and why it is silent. `docs/HARD_WON.md` is the register of these —
   add an entry there too if the cause was subtle.

## Do not

- Do not write a check that only restates the implementation. Check the
  *invariant* (every tinted mesh has `instanceColor`), not the line of code.
- Do not add a check that needs a GPU, network, or the release bundle. Checks
  run headless and offline; `check:assets` deliberately hashes only files that
  are present locally.
- Do not weaken an existing check to make a new change pass.
