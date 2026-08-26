---
name: verify-change
description: The gate every change passes before it is committed or reported as done. Run it after any edit to src/, scripts/, or assets/. Use whenever you are about to say a change works.
---

# verify-change

The one rule this project runs on: **a change is not done because it looks
done. It is done when a command says so.**

## Run these, in order

```bash
npm run build      # must print "built in"; any error means stop
npm run check      # must print PASS 13 times
```

`npm run check` is 13 contract checks. Read the output. `12/13` is a failure,
not a rounding error.

## Then answer these in your report

1. Which command proved it? Paste the line.
2. What did you NOT verify? Say so explicitly.
3. Did anything else change? `git status --short` — an unexpected modified
   file is a bug you have not found yet.

## Never do these

- **Never claim a visual change works without a screenshot.** The build
  passing proves the code compiles, nothing more. Use `capture-poi`.
- **Never skip, delete, weaken, or `.skip` a check to get green.** If a check
  fails, the check is right until you prove otherwise with a command.
- **Never edit `public/textures/**` or `assets-dist/**` by hand.** They are
  generated. See `asset-bundle`.
- **Never commit a file you did not intend to change.** Check `git status`.
- **Never write "should now work", "this fixes", or "verified" for something
  you did not run.** Write what you ran and what it printed.

## One change at a time

If you changed three things and the check fails, you have three suspects and
no information. Change one thing, verify, commit. Then the next.

## Reporting

State the outcome plainly:

- Worked: name the command and its output.
- Failed: paste the actual error. Do not summarise it away.
- Partly: say which part is unverified.

An honest "I could not verify this" is worth more than a confident wrong
claim. Wrong claims in this repo have cost days.
