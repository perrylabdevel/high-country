/**
 * Scripted browser play of Episode 1's smallest loop — the acceptance route,
 * driven through the game's real input paths (mouse-look steering, WASD, E),
 * not debug warps or direct state mutation. The only thing it reads back is
 * the ?dev probe instrument `window.__missions()`, which is read-only: every
 * transition the probe proves was caused by synthetic-but-real player input.
 *
 *   npm run build
 *   node scripts/probe-play.mjs [baseUrl]     # spawns `vite preview` if no URL
 *
 * Route: enter → find Harlan → talk → ride north to the Ranch Overlook →
 * glass the smoke → ride back → report to Nell → the family speaks differently.
 *
 * Steering is closed-loop around the live player position and yaw, with a
 * stuck detector that strafe-shuffles — how a player works around an obstacle.
 * Exits 0 only if every leg and every dialogue beat passed.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chromium } from "playwright";

const BASE = process.argv[2];
const PORT = 8765;
const URL_ = BASE || `http://127.0.0.1:${PORT}/?dev`;

const failures = [];
function step(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) {
    failures.push(name);
  }
  return ok;
}

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function launchOptions() {
  if (process.env.PLAYWRIGHT_CHROMIUM) {
    return { executablePath: process.env.PLAYWRIGHT_CHROMIUM };
  }
  try {
    const bundled = chromium.executablePath();
    if (bundled && existsSync(bundled)) {
      // Headed on macOS: headless Chromium has no Metal GPU process, so
      // requestAdapter() returns null and the game silently runs WebGL2
      // (see scripts/capture-poi.mjs for the long version of this story).
      return process.platform === "darwin" ? { headless: false } : {};
    }
  } catch {
    // fall through
  }
  throw new Error("run `npx playwright install chromium` or set PLAYWRIGHT_CHROMIUM");
}

let page;

async function gs() {
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
async function dragAim(px) {
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

function objectiveText() {
  return page.evaluate(() => document.getElementById("objective").textContent);
}

/**
 * Closed-loop drive to (x, z). Faces the bearing with mouse deltas calibrated
 * on the live look gain, holds W (+Shift when far), shuffles sideways when the
 * collider wedges us, and stops inside `arrive` metres.
 */
async function steerTo(target, { arrive = 5, timeout = 160000, label = "" } = {}) {
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
async function talkThrough({ expectSpeaker, minLines = 1 } = {}) {
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

async function main() {
  const server = BASE ? null : spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    stdio: ["ignore", "pipe", "inherit"]
  });
  if (!server) {
    console.log(`probe: serving from explicit base ${BASE}`);
  } else {
    // vite preview fails if the port is taken by a server from THIS repo —
    // fine — but an orphan from an unrelated directory would silently feed
    // the probe a stale build. Say which we got.
    await new Promise((r) => setTimeout(r, 1200));
    console.log(`probe: using server at http://127.0.0.1:${PORT} ${server.exitCode === null ? "(spawned)" : "(pre-existing on the port — verify it serves this repo's dist/)"}`);
  }
  try {
    if (server) {
      for (let i = 0; i < 60; i += 1) {
        try {
          const res = await fetch(`http://127.0.0.1:${PORT}/`);
          if (res.ok) {
            break;
          }
        } catch {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
    const browser = await chromium.launch(launchOptions());
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector("#btn-enter", { timeout: 45000 });
    // __missions exists as soon as the isDev block runs; the world (player,
    // missions, npcs) is still building behind it. Wait until the probe hook
    // actually answers, then wait for the title screen to take the click.
    await page.waitForFunction(() => {
      try {
        return Boolean(window.__missions && window.__missions().player);
      } catch {
        return false;
      }
    }, null, { timeout: 90000 });
    await page.evaluate(() => document.getElementById("btn-enter").click());
    await page.waitForFunction(() => document.getElementById("title").classList.contains("hidden"),
      null, { timeout: 15000 });
    await page.waitForTimeout(1200);

    // --- Leg 1: find Harlan -------------------------------------------------
    step("enter: objective HUD shows the first objective", /Harlan Calder/i.test(await objectiveText()),
      await objectiveText());
    const m1 = await gs();
    const POS = await page.evaluate(() => window.__POS);
    step("spawn: the player starts near the objective", Math.hypot(m1.player.x - POS.ranch.x, m1.player.z - POS.ranch.z) < 60,
      `${Math.round(Math.hypot(m1.player.x - POS.ranch.x, m1.player.z - POS.ranch.z))} m from the ranch centre`);
    const harlanSpot = { x: POS.ranch.x + 4.2, z: POS.ranch.z + 1.2 };
    await steerTo(harlanSpot, { arrive: 2.7, label: "Harlan" });
    const promptA = await page.evaluate(() => document.getElementById("prompt").textContent);
    step("prompt: talking to Harlan is offered", /Talk to Harlan/.test(promptA), promptA);
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(400);
    const lines = await talkThrough({ expectSpeaker: "Harlan Calder", minLines: 1 });
    step("dialogue: Harlan speaks", lines.length >= 1, lines.map((l) => l.body.slice(0, 28)).join(" / "));
    await page.waitForTimeout(600);
    step("transition: objective now points at the ridge", /Overlook/i.test(await objectiveText()), await objectiveText());

    // --- Leg 2: ride north to the Ranch Overlook ----------------------------
    await steerTo({ x: POS.overlook.x, z: POS.overlook.z }, { arrive: 40, label: "Ranch Overlook", timeout: 220000 });
    await page.waitForTimeout(1200);
    const after = await gs();
    step("arrival: overlooking the burn line is an event",
      after.state.stage === 2 && after.state.flags.sawTheLine === true,
      `stage=${after.state.stage} flag=${JSON.stringify(after.state.flags)}`);
    const toast = await page.evaluate(() => document.getElementById("toast").textContent);
    step("arrival: the world says what you see", /smoke|fire/i.test(toast), toast.slice(0, 60));

    // --- Leg 3: glass the smoke ---------------------------------------------
    await steerTo({ x: POS.overlook.x, z: POS.overlook.z - 9 }, { arrive: 4, label: "glassing spot" });
    await page.waitForTimeout(300);
    const promptB = await page.evaluate(() => document.getElementById("prompt").textContent);
    step("prompt: glassing the smoke is offered", /Glass the smoke/.test(promptB), promptB);
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(400);
    const reading = await talkThrough({ expectSpeaker: "The ridge", minLines: 3 });
    const joined = reading.map((r) => r.body).join(" ");
    step("reading: what you find is the discovery", /green wood|fire line/i.test(joined), joined.slice(0, 60));
    await page.waitForTimeout(700);
    const found = await gs();
    step("discovery: the arson finding is recorded", found.state && found.state.flags.sawArson === true,
      JSON.stringify(found.state && found.state.flags));
    step("transition: the loop now asks you to return", /Nell/i.test(await objectiveText()), await objectiveText());

    // --- Leg 3: ride back and report ---------------------------------------
    const nellSpot = { x: POS.ranch.x + 12.4, z: POS.ranch.z + 16.8 };
    await steerTo(nellSpot, { arrive: 2.6, label: "Nell", timeout: 220000 });
    const promptC = await page.evaluate(() => document.getElementById("prompt").textContent);
    step("prompt: Nell will hear the report", /Nell/.test(promptC), promptC);
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(400);
    const nell = await talkThrough({ expectSpeaker: "Nell Calder", minLines: 1 });
    await page.waitForTimeout(800);
    const final = await gs();
    step("consequence: the loop completes", final.state.done === true, JSON.stringify(final.state));
    step("objective: completed loop is acknowledged", /complete/i.test(await objectiveText()), await objectiveText());
    step("consequence: the family's dialogue changed", /fire line/i.test(nell[0].body), nell[0].body.slice(0, 60));

    // Post-loop: the new line persists across a repeat conversation.
    await steerTo(nellSpot, { arrive: 3.0, label: "Nell again" });
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(400);
    const againLines = await talkThrough({ expectSpeaker: "Nell Calder", minLines: 1 });
    step("consequence: the changed dialogue persists", /fire line/i.test(againLines[0].body), againLines[0].body.slice(0, 60));

    step("no page errors during the whole route", errors.length === 0, errors.slice(0, 3).join(" | "));

    await page.screenshot({ path: "/tmp/hc-probe-final.png" });
    await browser.close();
    if (failures.length) {
      console.error(`\nprobe-play: ${failures.length} FAILED step(s)`);
      process.exit(1);
    }
    console.log("\nprobe-play: PASSED — the smallest loop is playable end to end");
    process.exit(0);
  } finally {
    if (server) {
      server.kill("SIGTERM");
    }
  }
}

main().catch((err) => {
  console.error("probe-play: FAILED —", err.message);
  process.exit(1);
});