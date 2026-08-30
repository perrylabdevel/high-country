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
export async function steerTo(target, { arrive = 5, timeout = 160000, label = "", pulse = null } = {}) {
  let gain = 300; // px per radian of yaw error; recalibrated against live look scale
  let lastDist = Infinity;
  let progressAt = Date.now();
  let shuffles = 0;
  const t0 = Date.now();
  await page.keyboard.down("KeyW");
  let sprinting = false;
  try {
    while (Date.now() - t0 < timeout) {
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
      await dragAim(px);
      await page.waitForTimeout(150);
      const p2 = await gs();
      const turned = Math.abs(wrapPi(p2.player.yaw - before));
      if (Math.abs(err) > 0.05 && turned > 1e-4) {
        gain = clamp(gain * 0.7 + 0.3 * (Math.abs(px) / turned), 1, 60);
      }
      // Stuck? The collider wedges us straight into an obstacle while W is held.
      if (process.env.HC_PROBE_TRACE && Math.random() < 0.08) {
        console.error(`  [trace] d=${d.toFixed(0)}m dLast=${lastDist.toFixed(0)}m yaw=${p2.player.yaw.toFixed(2)} err=${err.toFixed(2)} gain=${gain.toFixed(1)} shuffles=${shuffles}`);
      }
      if (lastDist - d < 0.2) {
        if (Date.now() - progressAt > 3200) {
          shuffles += 1;
          if (shuffles > 14) {
            throw new Error(`still wedged after ${shuffles} shuffles near ${label || "target"}`);
          }
          const dir = shuffles % 2 ? "KeyD" : "KeyA";
          await page.keyboard.up("KeyW");
          await page.keyboard.down(dir);
          await page.waitForTimeout(700);
          await page.keyboard.up(dir);
          // Back off a touch, then face the target again and re-press W.
          await page.keyboard.down("KeyS");
          await page.waitForTimeout(500);
          await page.keyboard.up("KeyS");
          await page.keyboard.down("KeyW");
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