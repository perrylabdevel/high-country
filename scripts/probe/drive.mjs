/**
 * Driving helpers shared by the browser play probes (play, save). One closed
 * loop-steering implementation, so probe results stay comparable and a fix
 * lands once.
 *
 * Everything here drives the game's real input paths — right-drag look for
 * aim, WASD and Shift for movement, E for interaction — and reads state only
 * through the ?dev probe hooks. See probe-play.mjs for the full rationale of
 * why right-drag is the look path that works under scripted input.
 */
import { existsSync } from "node:fs";
import { chromium } from "playwright";

export { chromium };

export function launchOptions() {
  // The game's frame loop is rAF-driven. A headed window that ends up
  // occluded by other windows gets its rAF throttled to ~1fps — the DOM
  // still receives keydowns (so probes read prompts fine) but the frame
  // loop consumes input taps too late or never. Force full-speed frames
  // regardless of visibility, or scripted input becomes nondeterministic.
  const args = [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    // Kiosk: this window is the whole screen, so nothing can occlude it. This
    // is the only reliable cure for macOS's native occlusion rAF throttle
    // (no flag disables it): an occluded window runs the frame loop at ~2fps,
    // where the dt clamp makes a 700m ride take hours instead of minutes.
    "--kiosk"
  ];
  if (process.env.PLAYWRIGHT_CHROMIUM) {
    return { executablePath: process.env.PLAYWRIGHT_CHROMIUM, args };
  }
  try {
    const bundled = chromium.executablePath();
    if (bundled && existsSync(bundled)) {
      // Headed on macOS: headless Chromium has no Metal GPU process, so
      // requestAdapter() returns null and the game silently runs WebGL2
      // (see scripts/capture-poi.mjs for the long version of this story).
      return process.platform === "darwin"
        ? { headless: false, args }
        : { args };
    }
  } catch {
    // fall through
  }
  throw new Error("run `npx playwright install chromium` or set PLAYWRIGHT_CHROMIUM");
}

/** Steps that report pass/fail, accumulating failures for the exit code. */
export function createStepper() {
  const failures = [];
  return {
    failures,
    step(name, ok, detail = "") {
      console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
      if (!ok) {
        failures.push(name);
      }
      return ok;
    },
    finish(suite) {
      if (failures.length) {
        console.error(`\n${suite}: ${failures.length} FAILED step(s)`);
        process.exit(1);
      }
      console.log(`\n${suite}: PASSED`);
      process.exit(0);
    }
  };
}

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

let page;

/** Point the helpers at the probe's page; every helper then uses it. */
export function bindDriver(p) {
  page = p;
}

export async function gs() {
  return page.evaluate(() => window.__missions && window.__missions());
}

/**
 * Turn the camera by a yaw delta the way the right-drag look path does — the
 * one look input that works under scripted input, since Chromium denies
 * pointer lock to non-gesture requests and CDP clicks don't satisfy its
 * gesture check here. The game supports right-drag look as a first-class
 * control (index.html title screen says so), so this is the player's own
 * affordance, not a backdoor.
 */
export async function dragAim(px) {
  if (Math.abs(px) < 1) {
    return;
  }
  const vb = await page.viewportSize();
  const cx = vb.width / 2;
  const cy = vb.height / 2;
  // The cursor stays where the last drag left it. Return to centre FIRST,
  // while the game is not looking (no pointer lock, button up): the game
  // ignores those moves, so only the drag itself contributes delta.
  await page.mouse.move(cx, cy, { steps: 2 });
  await page.mouse.down({ button: "right" });
  await page.mouse.move(cx + px, cy, { steps: 3 });
  await page.mouse.up({ button: "right" });
}

export function objectiveText() {
  return page.evaluate(() => document.getElementById("objective").textContent);
}

/**
 * Closed-loop drive to (x, z). Faces the bearing with mouse deltas calibrated
 * on the live look gain, holds W (+Shift when far), shuffles sideways when the
 * collider wedges us, and stops inside `arrive` metres.
 *
 * `pulse(p)` runs on every displacement poll with the fresh probe state; if
 * it returns true the drive stops immediately (keyboard released). Callers
 * use this to catch pass-through affordances — a prompt that is only live
 * while the target is in interaction range, which a stop-and-look can miss.
 */
export async function steerTo(target, { arrive = 5, timeout = 160000, label = "", pulse = null, escapeDiagonal = true } = {}) {
  let gain = 300; // px per radian of yaw error; recalibrated against live look scale
  let lastDist = Infinity;
  let progressAt = Date.now();
  let shuffles = 0;
  const t0 = Date.now();
  const keyDown = new Set(); // keys currently held — W is pressed only when walking
  keyDown.add("KeyW");
  let sprinting = false;
  // macOS takes keyboard focus away from the kiosk window mid-run (any system
  // panel that fronts itself will do it), and the then-occluded window's rAF
  // collapses to ~2 fps: rides stall, aim drags die, and every distance test
  // reads "wedged". Re-assert the window periodically — cheap, and it recovers
  // the run instead of miscasting a desktop event as a door defect.
  let focusAt = 0;
  try {
    while (Date.now() - t0 < timeout) {
      if (Date.now() - focusAt > 5000) {
        await page.bringToFront();
        focusAt = Date.now();
      }
      const p = await gs();
      if (pulse && await pulse(p)) {
        return true;
      }
      const dx = target.x - p.player.x;
      const dz = target.z - p.player.z;
      const d = Math.hypot(dx, dz);
      if (d <= arrive) {
        return true;
      }
      // Sprint on the open leg, walk the final metres.
      if (d > 40 && !sprinting) {
        await page.keyboard.down("ShiftLeft");
        sprinting = true;
      } else if (d <= 40 && sprinting) {
        await page.keyboard.up("ShiftLeft");
        sprinting = false;
      }
      // Re-aim: bearing to target vs live yaw, via right-drag look.
      const yawNeeded = Math.atan2(dx, -dz);
      const err = clamp(wrapPi(yawNeeded - p.player.yaw), -Math.PI, Math.PI);
      const before = p.player.yaw;
      const px = clamp(err * gain, -440, 440);
      // Face-first: while the target sits well off-axis (>0.9 rad), walk
      // nothing. Holding W with a large error made the driver orbit the target
      // (the old gain clamp of 60 px/rad cannot close a >90 deg miss against
      // the live look scale of ~415 px/rad — the aim lagged the walk forever).
      // Turn in place first; re-press W once the facing is sane.
      const walking = Math.abs(err) <= 0.9;
      if (walking && !keyDown.has("KeyW")) {
        await page.keyboard.down("KeyW");
        keyDown.add("KeyW");
      } else if (!walking && keyDown.has("KeyW")) {
        await page.keyboard.up("KeyW");
        keyDown.delete("KeyW");
      }
      await dragAim(px);
      await page.waitForTimeout(150);
      const p2 = await gs();
      const turned = Math.abs(wrapPi(p2.player.yaw - before));
      if (Math.abs(err) > 0.05 && turned > 1e-4) {
        gain = clamp(gain * 0.7 + 0.3 * (Math.abs(px) / turned), 1, 620);
      }
      // Stuck? The collider wedges us straight into an obstacle while W is held.
      if (process.env.HC_PROBE_TRACE && Math.random() < 0.08) {
        console.error(`  [trace] ${label || "target"} d=${d.toFixed(0)}m dLast=${lastDist.toFixed(0)}m at=(${p2.player.x.toFixed(1)},${p2.player.z.toFixed(1)}) yaw=${p2.player.yaw.toFixed(2)} err=${err.toFixed(2)} gain=${gain.toFixed(1)} shuffles=${shuffles}`);
      }
      if (lastDist - d < 0.2) {
        if (Date.now() - progressAt > 3200) {
          shuffles += 1;
          if (shuffles > 14) {
            throw new Error(`still wedged after ${shuffles} shuffles near ${label || "target"}`);
          }
          // Escalating sidestep ladder. A 0.7 s strafe clears a post edge but
          // not a barrel or a porch-corner post you pinned dead centre — and a
          // shuffle that cannot move the player is wasted budget. Small strafes
          // alternate sides first; past 3 the sidestep grows long enough to
          // walk clean around a single obstacle (still A/D with real input);
          // the back-off leg keeps the resumption angled off the pin.
          const longStrafe = shuffles > 5 ? 2000 : shuffles > 2 ? 1300 : 700;
          const dir = shuffles % 2 ? "KeyD" : "KeyA";
          await page.keyboard.up("KeyW");
          keyDown.delete("KeyW");
          await page.keyboard.down(dir);
          await page.waitForTimeout(longStrafe);
          await page.keyboard.up(dir);
          // Back off a touch, then face the target again and re-press W.
          await page.keyboard.down("KeyS");
          await page.waitForTimeout(longStrafe > 700 ? 600 : 500);
          await page.keyboard.up("KeyS");
          // Past the small strafes the sidestep stops being parallel-to-the-
          // obstacle: rotate the facing several ticks OFF the bearing and walk
          // the diagonal for a moment. A strafe presses sideways relative to
          // the FACING, which when aimed at a long fence run moves the player
          // ALONG the fence forever (the cemetery rail line ate nine legs that
          // way); a quarter-turn walk takes the player OFF the rail line, and
          // the main loop re-aims at the target immediately after. OPT-IN for
          // approach legs only: run 14/15 showed the same rotate-walk inside a
          // room (post-pass exits) walks the player INTO the furniture pin
          // instead of out of it, so exits keep the plain strafe ladder.
          if (escapeDiagonal) {
            const turnSign = shuffles % 3 === 0 ? -1 : 1;
            await dragAim(turnSign * 430);
            await page.keyboard.down("KeyW");
            await page.waitForTimeout(1100);
            await page.keyboard.up("KeyW");
          }
          await page.keyboard.down("KeyW");
          keyDown.add("KeyW");
          progressAt = Date.now();
        }
      } else {
        progressAt = Date.now();
      }
      lastDist = d;
    }
  } finally {
    await page.keyboard.up("KeyW");
    await page.keyboard.up("ShiftLeft");
  }
  throw new Error(`steering to ${label || target.x + "," + target.z} timed out`);
}

/**
 * Follow a planned route waypoint by waypoint — the driver's answer to
 * two-stage navigation. Each hop re-reads the live route between legs (the
 * search replans as the player deviates or the blacklist grows), skips
 * waypoints already behind the traveller, and walks the final approach at
 * steerTo's closed loop. Waypoint hops get a distance-scaled timeout (a 400 m
 * edge at probe pace needs minutes, not seconds); a wedged hop throws, which
 * the caller may treat as "this approach failed" and move on.
 */
export async function steerRoute(route, { label = "", skipWithin = 14, pulse = null } = {}) {
  if (!route || route.status !== "routed" || !route.waypoints.length) {
    throw new Error(`steerRoute: no routed plan${route ? ` (status ${route.status})` : ""} for ${label || "leg"}`);
  }
  const wps = route.waypoints;
  // The leg's marker is its destination — the approach node the polyline ends
  // on. Hops are picked against it by the tail rule below.
  const dest = wps[wps.length - 1];
  let done = 0;
  for (let i = 0; i < wps.length; i += 1) {
    const wp = wps[i];
    const here = await gs();
    const d = Math.hypot(wp.x - here.player.x, wp.z - here.player.z);
    // Gate nodes are chokepoints: an 8 m post gap reads as "behind me" at the
    // 14 m skip while the rider is still on the wrong side of the wall, and
    // the next hop's aim line then crosses the wall face. A gate is threaded
    // or it is not a hop — skip it at arrival tightness, not skipWithin.
    const isGate = wp.kind === "gate" || (wp.ref && /(^|\.)gate/.test(wp.ref));
    if (d <= (wp.kind === "approach" ? 4 : isGate ? 1.8 : skipWithin)) {
      done += 1;
      continue;
    }
    // Skip tail waypoints that step AWAY from the destination (probe-travel's
    // see-saw rule): a polyline ends at the approach through its graph node,
    // which can sit behind a rider who just arrived there — chasing it reads
    // as progress in hops while the horse ping-pongs between two poles.
    if (i < wps.length - 1 && d < 40) {
      const dDest = Math.hypot(dest.x - here.player.x, dest.z - here.player.z);
      if (Math.hypot(wp.x - dest.x, wp.z - dest.z) > dDest) {
        done += 1;
        continue;
      }
    }
    // The approach point is the arrival, not a passthrough: tight arrive.
    const arrive = wp.kind === "approach" ? 4 : Math.min(skipWithin, Math.max(7, d * 0.12));
    // A gate's anchor sits mid-gap; aimed at dead-on from the gap's own axis
    // the horse presses the east post's face and the slide has no tangential
    // component to move it (measured: wedged 5 m short at horse radius). A
    // rider threads a gap at an angle, never along the post line — so the
    // driver biases gate waypoints a handlebar-width south of centre, which
    // is still inside the anchor's arrival region. Gates on a north-south
    // axis will need the same treatment on x; none exist yet.
    const aim = wp.kind === "gate" || (wp.ref && /(^|\.)gate/.test(wp.ref)) ? { x: wp.x, z: wp.z + 1.6 } : wp;
    const labelH = `${label} wp${i}/${wps.length - 1}${wp.kind ? ` (${wp.kind}${wp.ref ? ` ${wp.ref}` : ""})` : ""}`;
    // Departures kill more legs than the trail does: the first waypoint out
    // of an arrival ran a whole futile steer on both failing runs before one
    // wedged hop ended the leg. So a wedged or timed-out hop gets one
    // sidestep-off-the-obstacle cycle (back off, quarter turn, press on —
    // what a rider does at a stump), then the hop is re-driven once. A second
    // failure is real: throw on it, and the log shows where.
    try {
      await steerTo(aim, {
        arrive,
        label: labelH,
        timeout: Math.min(420000, Math.max(30000, 25000 + d * 1600)),
        pulse
      });
    } catch {
      const now = await gs();
      console.log(`    [steerRoute] ${labelH}: hop failed — rider at (${now.player.x.toFixed(0)}, ${now.player.z.toFixed(0)}) mounted=${now.player.mounted} target (${wp.x.toFixed(0)}, ${wp.z.toFixed(0)}) d=${Math.hypot(wp.x - now.player.x, wp.z - now.player.z).toFixed(0)} — sidestep and retry`);
      await page.keyboard.down("KeyS");
      await page.waitForTimeout(900);
      await page.keyboard.up("KeyS");
      await page.keyboard.down("KeyD");
      await page.waitForTimeout(500);
      await page.keyboard.up("KeyD");
      await page.waitForTimeout(300);
      const retry = await gs();
      const dd = Math.hypot(wp.x - retry.player.x, wp.z - retry.player.z);
      // Re-thread the gap, don't re-press the wall: every measured wedge (the
      // fort's wall corner, the gate's post face) pinned the rider against a
      // structure face where the bearing to the waypoint is perpendicular, re-
      // aiming at the same point just re-presses it, and the aim drag cancels
      // each shuffle's turn. The only guaranteed-clear line back onto the road
      // is the one the route already drew — so when the wedged hop sits past a
      // gate node, go back THROUGH that node (arrival tightness) before re-
      // aiming at the hop.
      let via = null;
      for (let j = i - 1; j >= 0; j -= 1) {
        const w = wps[j];
        if (w.kind === "gate" || (w.ref && /(^|\.)gate/.test(w.ref))) { via = w; break; }
      }
      if (via) {
        const viaD = Math.hypot(via.x - retry.player.x, via.z - retry.player.z);
        // A gate hundreds of metres back is a detour, not an escape; only a
        // near gap (the wall the wedge happened at) is worth re-threading.
        if (viaD < 45 && viaD > 2) {
          await steerTo(via, {
            arrive: 2.2,
            label: `${labelH} re-thread gate`,
            timeout: 90000
          });
        }
      }
      await steerTo(aim, {
        arrive: Math.max(arrive, 4),
        label: via ? `${labelH} re-centre` : `${labelH} retry`,
        timeout: Math.min(180000, Math.max(30000, 20000 + dd * 1200))
      });
    }
    done += 1;
  }
  return { hops: done, of: wps.length };
}

/** Press E and hold while a dialogue is open, advancing line by line. */
export async function talkThrough({ expectSpeaker, minLines = 1 } = {}) {
  const lines = [];
  for (let i = 0; i < 12; i += 1) {
    const open = await page.evaluate(() => !document.getElementById("dialogue").classList.contains("hidden"));
    if (!open) {
      break;
    }
    const reading = await page.evaluate(() => ({
      speaker: document.getElementById("dialogue-speaker").textContent,
      body: document.getElementById("dialogue-body").textContent
    }));
    lines.push(reading);
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(340);
  }
  if (expectSpeaker) {
    const speakers = new Set(lines.map((l) => l.speaker));
    if (!speakers.has(expectSpeaker)) {
      throw new Error(`expected speaker ${expectSpeaker}, saw ${[...speakers].join("|") || "nothing"}`);
    }
  }
  if (lines.length < minLines) {
    throw new Error(`dialogue had ${lines.length} line(s), expected at least ${minLines}`);
  }
  return lines;
}

/**
 * Boot a page into the playable world: navigate, wait for the probe hook to
 * answer (the world builds behind it), take the title screen, and settle.
 */
export async function enterWorld(url, pageForBind) {
  bindDriver(pageForBind);
  await pageForBind.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await pageForBind.waitForSelector("#btn-enter", { timeout: 45000 });
  await pageForBind.waitForFunction(() => {
    try {
      return Boolean(window.__missions && window.__missions().player);
    } catch {
      return false;
    }
  }, null, { timeout: 90000 });
  await pageForBind.evaluate(() => document.getElementById("btn-enter").click());
  await pageForBind.waitForFunction(() => document.getElementById("title").classList.contains("hidden"),
    null, { timeout: 15000 });
  // A background or occluded window throttles the rAF frame loop to ~1fps or
  // pauses it, and blur wipes buffered input taps (input.js clearKeys) — so
  // every probe interaction starts by putting the window front and focused.
  await pageForBind.bringToFront();
  await pageForBind.waitForTimeout(1200);
}

/**
 * Spawn `vite preview` for the probe and say which server we actually got:
 * an orphan from an unrelated directory would silently feed the probe a
 * stale build. Returns the child process, or null when BASE was explicit.
 */
export async function spawnPreviewServer(spawnFn, { port, base }) {
  if (base) {
    console.log(`probe: serving from explicit base ${base}`);
    return null;
  }
  const server = spawnFn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    stdio: ["ignore", "pipe", "inherit"]
  });
  // The stepper's finish() calls process.exit() the moment the verdict prints,
  // so main()'s finally (server.kill()) never runs — every non-zero probe run
  // left an orphan vite holding the shared port until a human noticed. Kill it
  // with the process itself, whatever path exits.
  process.once("exit", () => {
    try { server.kill(); } catch { /* already gone */ }
  });
  await new Promise((r) => setTimeout(r, 1200));
  console.log(`probe: using server at http://127.0.0.1:${port} ${server.exitCode === null ? "(spawned)" : "(pre-existing on the port — verify it serves this repo's dist/)"}`);
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.ok) {
        break;
      }
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return server;
}