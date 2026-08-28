/**
 * Where the pinned-grader wrapper finds codex-vision. Its own module so the
 * pass-read harness (read-images.mjs) and the close-read A/B driver
 * (close-cycleB.mjs) share one resolver instead of copy-pasting paths.
 *
 * Order: $CODEX_VISION, then `which codex-vision`, then ~/.codex/bin/codex-vision.
 * Every miss is an explicit throw — a silent fallthrough here would grade
 * nothing and leave an empty read directory that looks like a grader outage.
 * Hardcoded absolute paths have bitten this repo twice (bake-foliage.mjs's
 * macOS Chrome path silently broke the asset manifest).
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";

export function resolveCodexVision() {
  if (process.env.CODEX_VISION) {
    if (!existsSync(process.env.CODEX_VISION)) {
      throw new Error(
        `CODEX_VISION=${process.env.CODEX_VISION} does not exist. ` +
          `Point it at the codex-vision executable.`
      );
    }
    return process.env.CODEX_VISION;
  }
  try {
    const which = execFileSync("which", ["codex-vision"], { encoding: "utf8" }).trim();
    if (which) return which;
  } catch {
    // not on PATH — fall through to the ~/.codex location
  }
  const fallback = path.join(homedir(), ".codex", "bin", "codex-vision");
  if (existsSync(fallback)) return fallback;
  throw new Error(
    "codex-vision not found. Set CODEX_VISION to the codex-vision executable " +
      "(the pinned grader wrapper; Gemini/Claude/OpenAI are not this branch's grader)."
  );
}