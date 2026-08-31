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
import { launchOptions, createStepper, enterWorld, steerTo, steerRoute, spawnPreviewServer } from "./probe/drive.mjs";
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

// Registry convention (src/buildings/apertures.js "normal points to the
// exterior", and __apertureView's verified exterior captures stand at
// center + normal*dist): the exterior point is on the +normal side. The first
// draft negated the normal, which aimed every approach at the aperture's
// INTERIOR — the walk then wedged on whatever wall lay beyond (the six town
// lots' back walls), and only a lucky detour through the door gap ever
// reached it. Getting this wrong didn't invent failures out of thin air; the
// underlying closed-loop walks happened, but named the wrong side.
const lineOf = (ap) => {
  const out = { x: ap.center.x + ap.normal.x * 1.8, z: ap.center.z + ap.normal.z * 1.8 };
  const into = { x: ap.center.x - ap.normal.x * 1.8, z: ap.center.z - ap.normal.z * 1.8 };
  const side = (p) => (p.x - ap.center.x) * ap.normal.x + (p.z - ap.center.z) * ap.normal.z;
  return { out, into, side };
};

/**
 * Straight approach with two honest recoveries before giving up:
 * (1) the nav graph — a straight line to a far target wedges on whatever
 *     fence, rail line, or ridge lies across it (run 12: the player pinned on
 *     the cemetery's rail line 800 m from town and seven legs died at the
 *     same spot); the authored route follows walkable edges and hops them
 *     with the same closed loop;
 * (2) the sidestep ladder — sidestep off the path's midpoint, real walking,
 *     real input, then re-approach; recovery legs are distance-scaled so a
 *     detour isn't given 90 s to cover 780 m.
 */
async function approachAround(target, ap, timeoutMs) {
  const label = `${ap.id} exterior`;
  try {
    return await steerTo(target, { arrive: 1.4, label, timeout: Math.min(timeoutMs, 300000) });
  } catch (e) {
    const p0 = await player();
    const far = Math.hypot(target.x - p0.x, target.z - p0.z) > 60;
    if (far) {
      try {
        // __navTo answers the same question the HUD/minimap affordance does:
        // route the WALK from the live pose to the POI's arrival approach.
        const nav = await page.evaluate((poi) => {
          try {
            return window.__navTo(poi, "walk");
          } catch {
            return null;
          }
        }, ap.poi);
        const route = nav && nav.route;
        if (route && route.status === "routed" && route.waypoints.length) {
          console.log(
            `nav route for ${label} via ${nav.name}: ${route.waypoints.length} hops, ${Math.round(route.length)} m` +
            ` (straight-line from here: ${Math.round(Math.hypot(target.x - p0.x, target.z - p0.z))} m)`
          );
          await steerRoute(route, { label: `${ap.id} approach` });
          const p1 = await player();
          if (Math.hypot(target.x - p1.x, target.z - p1.z) < 60) {
            return await steerTo(target, { arrive: 1.4, label: `${label} after route`, timeout: 150000 });
          }
          console.log(`nav route for ${label} ended far from the exterior point — falling through to the ladder`);
        } else {
          console.log(`nav has no route to ${ap.poi} (${route ? route.status : "no route"}) — using the sidestep ladder`);
        }
      } catch (e2) {
        console.log(`nav route to ${ap.poi} failed: ${String(e2.message).slice(0, 140)}`);
      }
    }
    const p = await player();
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    // Anchor the sidesteps 12 m up the lane from WHERE THE PLAYER IS, not at
    // the path midpoint: the wedge sits where the walk is happening (run 12
    // pinned 15 m into an 800 m leg, and detours aimed at the 400 m midpoint
    // could neither see nor clear it).
    const anchor = { x: p.x + (dx / len) * 12, z: p.z + (dz / len) * 12 };
    const head = Math.min(len, 400);
    for (const [sign, off] of [[1, 8], [-1, 8]]) {
      try {
        await steerTo({ x: anchor.x + nx * sign * off, z: anchor.z + nz * sign * off },
          { arrive: 2.4, label: `${label} detour`, timeout: Math.max(90000, head * 2100) });
        await steerTo(target, { arrive: 1.4, label, timeout: Math.max(90000, head * 2100) });
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
  await approachAround(out, ap, approachMs);
  const atOut = await player();
  const outsideOk = side(atOut) > 0.3;
  // Through: 3.6 m line, generous on purpose — a wedged door then reads as a
  // real defect, not a driver artifact. Never longer than 90 s.
  await steerTo(into, { arrive: 1.2, label: `${ap.id} through`, timeout: 90000 });
  const atIn = await player();
  return { outsideOk, crossed: side(atIn) < -0.3, atIn };
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
  if (side(p0) < 0) {
    // Inside (−normal side per the registry convention): step back out through
    // the nearest reachable sibling.
    await steerTo(out, { arrive: 1.4, label: `${c.id} exit`, timeout: 90000 });
  } else {
    // Outside: go in through the nearest sibling (a partition's exterior point
    // is interior; the house is entered by its own front door first). The
    // sibling crossing goes on the same stack so the later exit walks back out
    // through it — otherwise the player is left inside the house after the
    // partition pass and its exit only reaches the entry room. The porch-side
    // exterior leg gets the detour ladder like any other approach: a single
    // porch post or barrel must not end the door's attempt.
    await approachAround(out, c, 150000);
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
      if (side(p) >= 0) {
        // Already back on the exterior side — this entry already undid itself.
        crossings.pop();
        continue;
      }
      await steerTo(out, { arrive: 1.6, label: `${c.id} exit`, timeout: 120000, escapeDiagonal: false });
      crossings.pop();
    }
  }

  /**
   * Restore "before every attempt the player stands OUTSIDE every built
   * structure" — from the player's physical position, not just the crossing
   * stack. Run 11 broke the stack's assumption a run earlier: a successful
   * exit left the player beside the door, the next leg's approach hugged the
   * building's face, and the player ended up INSIDE the bunkhouse (pinned on
   * its north interior wall 6 m from the door, shuffling until the leg threw)
   * — and every later leg then ran from in there. The stack only knows the
   * apertures the probe itself crossed; it cannot see a wall slide that
   * carried the player through a gap. So after unwinding the stack, demand
   * the physical property: for each traversable aperture the player stands
   * behind (interior side within its structure's local radius), walk out
   * through the nearest such aperture — a partition's exit moves the player
   * deeper in the house but still forward through a real gap, and the next
   * iteration walks out the front door. Bounded to 4 rounds; a player who
   * is still inside after that goes to the staged path as a named failure.
   */
  async function restoreOutside() {
    await exitToOutside();
    for (let guard = 0; guard < 6; guard += 1) {
      const p = await player();
      // Door-plane side tests can't tell "inside" from "beside the wall on
      // the far side of the footprint": run 17's barn exit walked the player
      // out through barn.right, which still left them behind barn.front's
      // plane, so every later leg (ranchGate) started pinned against the
      // barn's interior wall. Ask the game's own footprint index instead
      // (kit.js insideStructure, yawed per structure) — the same geometry the
      // deterministic checks read — no probe-side wall re-derivation.
      const inside = await page.evaluate(({ px, pz }) => {
        try {
          return window.__insideStructure(px, pz, 0.5);
        } catch (err) {
          return null;
        }
      }, { px: p.x, pz: p.z });
      if (inside === null) {
        console.log("outside-invariant: __insideStructure hook unavailable — skipping position restore");
        return;
      }
      if (!inside) {
        return;
      }
      const doors = toWalk
        .map((a) => ({ a, ...lineOf(a), d: Math.hypot(a.center.x - p.x, a.center.z - p.z) }))
        .filter((t) => t.d < 30)
        .sort((t, q) => t.d - q.d);
      // Prefer a real exterior door over any partition: a partition's
      // "exterior" is the next room, and run 16 cascaded when the rescue kept
      // picking partition.east (nearest by centre) and wedging on furniture
      // inside its out-room — every later door then failed on the exit leg.
      // A front door's out is verified outside by the walkOne that crossed it.
      const pick = doors.find((t) => !/partition/.test(t.a.id)) || doors[0];
      if (!pick) {
        throw new Error(`restoreOutside: __insideStructure says the player is inside at (${p.x.toFixed(1)},${p.z.toFixed(1)}) but no traversable aperture is within 30 m`);
      }
      console.log(`outside-invariant: player stands inside ${pick.a.structure} near ${pick.a.id} — exiting through it`);
      try {
        await steerTo(pick.out, { arrive: 1.6, label: `${pick.a.id} exit`, timeout: 120000, escapeDiagonal: false });
      } catch (e) {
        // This candidate's gap wedged; try the next nearest trap on the next
        // round rather than failing every later door with the same throw.
        console.log(`outside-invariant: exit via ${pick.a.id} wedged (${String(e.message).slice(0, 80)})`);
      }
    }
    throw new Error("restoreOutside: player still inside a structure after the exit ladder");
  }

  let r = null;
  try {
    try {
      await restoreOutside();
    } catch (e0) {
      // A wedged restore is not this door's failure — name it, then still
      // attempt the door (its approach may route around, and the staged path
      // below handles an interior start honestly).
      console.log(`restore before ${ap.id} failed: ${String(e0.message).slice(0, 120)} — attempting anyway`);
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
      try {
        await restoreOutside();
      } catch (e3) {
        console.log(`restore before staged retry failed: ${String(e3.message).slice(0, 120)}`);
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
    await restoreOutside();
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