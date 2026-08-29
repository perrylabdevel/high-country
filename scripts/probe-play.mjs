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
 * Exits 0 only if every leg and every dialogue beat passed. The driving
 * helpers themselves live in scripts/probe/drive.mjs, shared with probe-save.
 */
import { spawn } from "node:child_process";
import {
  chromium,
  createStepper,
  enterWorld,
  gs,
  launchOptions,
  objectiveText,
  spawnPreviewServer,
  steerTo,
  talkThrough
} from "./probe/drive.mjs";

const BASE = process.argv[2];
const PORT = 8765;
const URL_ = BASE || `http://127.0.0.1:${PORT}/?dev`;
const { step, finish } = createStepper();

let page;

async function main() {
  const server = await spawnPreviewServer(spawn, { port: PORT, base: BASE });
  try {
    const browser = await chromium.launch(launchOptions());
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await enterWorld(URL_, page);

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
    const lines = await talkThrough({ expectSpeaker: "Harlan Calder", minLines: 2 });
    step("dialogue: Harlan speaks a two-line conversation", lines.length >= 2,
      lines.map((l) => l.body.slice(0, 28)).join(" / "));
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

    // --- Leg 4: ride back — Wade reacts before you have told the family ----
    const wadeSpot = { x: POS.ranch.x - 28, z: POS.ranch.z + 27.5 };
    await steerTo({ x: wadeSpot.x + 0.8, z: wadeSpot.z - 0.8 }, { arrive: 3.0, label: "Wade", timeout: 300000 });
    const promptW = await page.evaluate(() => document.getElementById("prompt").textContent);
    step("prompt: Wade is addressable on the way home", /Wade/.test(promptW), promptW);
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(400);
    const wade = await talkThrough({ expectSpeaker: "Wade Calder", minLines: 1 });
    step("dialogue: Wade reacts to what you carried back, pre-completion",
      /dome kilns/.test(wade[0].body), wade[0].body.slice(0, 60));
    await page.waitForTimeout(400);

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
    finish("probe-play");
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