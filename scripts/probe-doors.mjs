/**
 * Functional verification — every traversable door, walked through with
 * closed-loop navigation (docs/HIGH_COUNTRY_DOORS_WINDOWS_VERIFICATION_HANDOFF.md).
 *
 * No teleporting, no collision disable, no phase-through to claim a pass:
 * the probe walks from the exterior point of each declared-traversable
 * aperture to its interior point, across the aperture plane, through the
 * game's real input paths (steerTo's right-drag aim + WASD). Each door gets
 * an explicit per-door timeout scaled to the approach distance; a wedged or
 * timed-out door is a FAIL named by its aperture id — never a hang.
 *
 * Windows are not traversable by contract; their evidence is the aperture
 * capture layer plus the deterministic check. Static dressing doors
 * (facade/shell) are inventoried, not functionally driven — their contract
 * is classification, and the check owns it.
 */
import { chromium } from "playwright";
import { launchOptions, createStepper, enterWorld, steerTo, spawnPreviewServer } from "./probe/drive.mjs";
import { spawn } from "node:child_process";

const BASE = process.env.CAPTURE_URL || "";
const PORT = 8794;
const steps = createStepper();
const { step, finish } = steps;

const DOOR_BUDGET_MIN = Number(process.env.HC_DOOR_BUDGET_MIN || 45);
const startedAt = Date.now();
const outOfBudget = () => Date.now() - startedAt > DOOR_BUDGET_MIN * 60000;

const server = await spawnPreviewServer(spawn, { port: PORT, base: BASE });
// ?dev arms the read-only `window.__*` probe hooks (__apertures, __missions);
// the traversal itself uses only the real input paths, dev hook or not.
const base = (BASE || `http://127.0.0.1:${PORT}`) + "/?dev";
const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await enterWorld(base, page);

// ---- inventory contract -------------------------------------------------
/** @type {any[]} */
const apertures = await page.evaluate(() => window.__apertures());
step(`inventory loads (${apertures.length} apertures)`, apertures.length > 0);

const ids = new Set(apertures.map((a) => a.id));
step("aperture ids unique", ids.size === apertures.length);
step(
  "every aperture has a POI",
  apertures.every((a) => a.poi)
);

/** Traversable apertures a body must be able to walk through. */
const ONLY = (process.env.HC_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
const toWalk = apertures.filter(
  (a) => a.traversable && a.kind !== "window" && (ONLY.length === 0 || ONLY.includes(a.id))
);
step(`traversable doors to walk (${toWalk.length})`, toWalk.length > 0);

// ---- the walk -----------------------------------------------------------
const player = () => page.evaluate(() => ({
  x: window.__missions().player.x,
  z: window.__missions().player.z
}));
let here = await player();

const lineOf = (ap) => {
  const out = { x: ap.center.x - ap.normal.x * 1.8, z: ap.center.z - ap.normal.z * 1.8 };
  const into = { x: ap.center.x + ap.normal.x * 1.8, z: ap.center.z + ap.normal.z * 1.8 };
  const side = (p) => (p.x - ap.center.x) * ap.normal.x + (p.z - ap.center.z) * ap.normal.z;
  return { out, into, side };
};

/**
 * Straight approach with one honest round-the-obstacle detour: if the straight
 * line wedges (fence lines are colliders a shuffle cannot round), sidestep
 * laterally off the path's midpoint — real walking, real input — and try the
 * approach from there, then the other side. Bounded throughout.
 */
async function approachAround(target, label, timeoutMs) {
  // First attempt gets the distance-scaled budget. Recovery legs are short:
  // a wedge that survives 90 s of sidestep-and-retry is structural (the target
  // sits behind a wall — a partition's exterior point is inside the house), and
  // the honest answer is to throw quickly so the staged approach can take over,
  // not to burn ten minutes on ladder retries the geometry cannot satisfy.
  try {
    return await steerTo(target, { arrive: 1.4, label, timeout: Math.min(timeoutMs, 120000) });
  } catch (e) {
    const p = await player();
    const mid = { x: (p.x + target.x) / 2, z: (p.z + target.z) / 2 };
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    for (const [sign, off] of [[1, 8], [-1, 8]]) {
      try {
        await steerTo({ x: mid.x + nx * sign * off, z: mid.z + nz * sign * off },
          { arrive: 2.4, label: `${label} detour`, timeout: 90000 });
        await steerTo(target, { arrive: 1.4, label, timeout: 90000 });
        return true;
      } catch {
        // try the next sidestep
      }
    }
    throw e;
  }
}

/** One closed-loop attempt: approach the exterior point, walk the plane. */
async function walkOne(ap) {
  const { out, into, side } = lineOf(ap);
  const p = await player();
  const d = Math.hypot(out.x - p.x, out.z - p.z);
  const approachMs = Math.max(30000, Math.min(600000, d * 2100));
  await approachAround(out, `${ap.id} exterior`, approachMs);
  const atOut = await player();
  const outsideOk = side(atOut) < -0.3;
  // Through: 3.6 m line, generous on purpose — a wedged door then reads as a
  // real defect, not a driver artifact. Never longer than 90 s.
  await steerTo(into, { arrive: 1.2, label: `${ap.id} through`, timeout: 90000 });
  const atIn = await player();
  return { outsideOk, crossed: side(atIn) > 0.3, atIn };
}

/**
 * Staged retry for doors whose straight-line exterior approach wedged: the
 * walk a person does is "step out (or in) through the opening you can reach,
 * then find the door from its own side". Still closed-loop, still real input,
 * still bounded; only the approach is staged. A pass still requires the
 * target's plane to be crossed under the player's own power.
 */
async function stagedWalk(ap) {
  const cands = toWalk.filter((c) => c.structure === ap.structure && c.id !== ap.id);
  if (!cands.length) {
    return null;
  }
  const p0 = await player();
  const c = cands
    .map((c) => ({ c, d: Math.hypot(c.center.x - p0.x, c.center.z - p0.z) }))
    .sort((a, b) => a.d - b.d)[0].c;
  const { out, into, side } = lineOf(c);
  if (side(p0) > 0) {
    // Inside: step back out through the nearest reachable sibling.
    await steerTo(out, { arrive: 1.4, label: `${c.id} exit`, timeout: 90000 });
  } else {
    // Outside: go in through the nearest sibling (a partition's exterior point
    // is interior; the house is entered by its own front door first). The
    // sibling crossing goes on the same stack so the later exit walks back out
    // through it — otherwise the player is left inside the house after the
    // partition pass and its exit only reaches the entry room.
    await steerTo(out, { arrive: 1.4, label: `${c.id} exterior`, timeout: 120000 });
    await steerTo(into, { arrive: 1.2, label: `${c.id} enter`, timeout: 90000 });
    crossings.push(c);
  }
  return await walkOne(ap);
}

// Nearest-first ordering: the walk visits regions once instead of crisscrossing.
//
// Invariant that keeps approaches honest: before every attempt the player
// stands OUTSIDE every built structure. Run 2/3 showed why this must be
// structural, not best-effort: a successful crossing leaves the player inside
// (partitions, barns), and the next leg's straight-line approach then wedges on
// whatever interior wall happens to lie between — failures that read as the
// door's fault but belong to the previous door's interior. So the probe
// maintains a crossing stack: after every traversal (success OR failure) it
// walks back out the way it came, restoring a known exterior position. The
// reverse walk is closed-loop real input like everything else, and it doubles
// as reverse-direction traversal evidence.
const pending = [...toWalk];
const perDoor = [];
/** @type {import("node:fs")} */
const crossings = []; // apertures we walked INTO, innermost last
let pos = await player();
while (pending.length) {
  if (outOfBudget()) {
    console.log(`\nbudget exhausted — ${pending.length} door(s) unverified: ${pending.map((a) => a.id).join(", ")}`);
    process.exit(1);
  }
  const door = pending
    .map((a) => ({ a, d: Math.hypot(a.center.x + a.normal.x * 1.8 - pos.x, a.center.z + a.normal.z * 1.8 - pos.z) }))
    .sort((p, q) => p.d - q.d)[0];
  pending.splice(pending.indexOf(door.a), 1);
  const ap = door.a;
  console.log(`\n[door] ${ap.id} (${Math.round(door.d)} m away)`);

  /** Walk back out through the whole crossing stack, innermost first. */
  async function exitToOutside() {
    while (crossings.length) {
      const c = crossings[crossings.length - 1];
      const { out, side } = lineOf(c);
      const p = await player();
      if (side(p) <= 0) {
        // Already on the far side — this entry already undid itself.
        crossings.pop();
        continue;
      }
      await steerTo(out, { arrive: 1.6, label: `${c.id} exit`, timeout: 120000 });
      crossings.pop();
    }
  }

  let r = null;
  try {
    if (crossings.length) {
      await exitToOutside();
    }
    // Approach the exterior point. The final leg re-aims at the aperture, so
    // the walk-in crosses the plane frontally rather than clipping an edge.
    const attempt = await walkOne(ap);
    r = attempt;
    if (attempt.crossed) {
      crossings.push(ap);
    }
  } catch (err) {
    let staged = null;
    try {
      if (crossings.length) {
        await exitToOutside();
      }
      console.log(`staged retry ${ap.id}`);
      staged = await stagedWalk(ap);
    } catch (e2) {
      console.log(`staged retry failed: ${e2.message}`);
    }
    if (staged && staged.crossed) {
      crossings.push(ap);
      perDoor.push({ id: ap.id, exterior: staged.outsideOk, traversed: true, staged: true });
      step(`walk through ${ap.id}`, true, "passed on staged approach through a sibling opening");
    } else {
      perDoor.push({ id: ap.id, exterior: false, traversed: false, error: String(err.message).slice(0, 160) });
      step(`walk through ${ap.id}`, false, err.message);
    }
  }
  if (r) {
    perDoor.push({ id: ap.id, exterior: r.outsideOk, traversed: r.crossed });
    step(`walk through ${ap.id}`, r.outsideOk && r.crossed, r.outsideOk && r.crossed ? "" : `exterior=${r.outsideOk} crossed=${r.crossed}`);
  }
  // Restore the exterior starting position (reverse traversal is evidence too).
  try {
    await exitToOutside();
  } catch (e2) {
    console.log(`exit after ${ap.id} wedged: ${e2.message}`);
  }
  pos = await player();
}

// ---- persistence: the inventory is stable across a save/load cycle ------
const before = apertures.map((a) => `${a.id}:${a.state}:${a.traversable}`);
await page.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(9000);
await page.evaluate(() => document.getElementById("btn-enter")?.click());
await page.waitForTimeout(6000);
const after = await page.evaluate(() => window.__apertures().map((a) => `${a.id}:${a.state}:${a.traversable}`));
step("aperture inventory identical after save/load", before.join("|") === after.join("|"),
  before.length === after.length ? "" : `${before.length} -> ${after.length}`);

await browser.close();

const { writeFileSync, mkdirSync } = await import("node:fs");
try {
  mkdirSync("audit/evidence", { recursive: true });
  writeFileSync("audit/evidence/probe-doors.json", JSON.stringify({
    startedAt: new Date(startedAt).toISOString(),
    minutes: Number(((Date.now() - startedAt) / 60000).toFixed(1)),
    only: ONLY.length ? ONLY : null,
    traversable: toWalk.length,
    perDoor
  }, null, 2));
} catch (err) {
  console.log(`evidence write skipped: ${err.message}`);
}
finish("probe-doors");