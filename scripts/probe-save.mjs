/**
 * Scripted browser probe for R2 — mission progress survives reload, and a
 * corrupt or foreign-versioned save fails safe, in the real browser, through
 * the real boot path.
 *
 *   npm run build
 *   node scripts/probe-save.mjs [baseUrl]     # spawns `vite preview` if no URL
 *
 * Driven like probe-play (real inputs; reads only ?dev probe hooks). Uses a
 * reload — the harshest form of "the player closed the tab".
 *
 * Fault injection works by planting the corrupt record in the context's
 * localStorage, closing the live page WITHOUT running beforeunload (its
 * autosave-on-unload would otherwise overwrite the planted record with a
 * healthy one, and the probe would silently verify nothing), and booting a
 * fresh page in the same context against the saved data.
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
import { SAVE_KEY } from "../src/save.js";

const BASE = process.argv[2];
const PORT = 8766;
const URL_ = BASE || `http://127.0.0.1:${PORT}/?dev`;
const { step, finish } = createStepper();

let page;
let ctx;
let errors = [];
const consoleNotes = [];

/** Run fn's storage mutation with no autosave able to overwrite it. */
async function plant(mutate) {
  const current = page;
  const other = await current.context().newPage();
  await other.goto(URL_, { waitUntil: "domcontentloaded" });
  await mutate(other);
  await other.close();
  await current.close(); // default: beforeunload never runs, no autosave
}

async function attach(current) {
  errors = [];
  current.on("pageerror", (e) => errors.push(String(e)));
  current.on("console", (m) => consoleNotes.push(`${m.type()}: ${m.text()}`));
}

/** Boot against whatever save the context currently holds. */
async function boot() {
  page = await ctx.newPage();
  await attach(page);
  await enterWorld(URL_, page);
  return gs();
}

async function main() {
  const server = await spawnPreviewServer(spawn, { port: PORT, base: BASE });
  try {
    const browser = await chromium.launch(launchOptions());
    ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    // Seed the driver binding with a page we immediately replace; boot() owns
    // page creation from here so every fault case starts identically.
    page = await ctx.newPage();
    await plant(async (p) => {
      await p.evaluate((key) => localStorage.removeItem(key), SAVE_KEY);
    });
    const fresh = await boot();
    const POS = await page.evaluate(() => window.__POS);
    step("fresh: no save means the loop starts unstarted", /Harlan Calder/i.test(fresh.objective), fresh.objective);

    const harlanSpot = { x: POS.ranch.x + 4.2, z: POS.ranch.z + 1.2 };
    await steerTo(harlanSpot, { arrive: 2.7, label: "Harlan" });
    await page.keyboard.press("KeyE");
    await page.waitForTimeout(400);
    await talkThrough({ expectSpeaker: "Harlan Calder", minLines: 1 });
    await page.waitForTimeout(600);
    step("transition: the loop moved to the travelling stage", /Overlook/i.test(await objectiveText()),
      await objectiveText());

    const record = await page.evaluate((key) => {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }, SAVE_KEY);
    step("autosave: the stage transition wrote a save", record !== null, `record under ${SAVE_KEY}`);
    step("autosave: the saved stage is the travelling stage",
      record && record.missions && record.missions.stage === 1, JSON.stringify(record && record.missions));
    step("autosave: the save carries the player pose",
      record && record.player && Number.isFinite(record.player.x) && Number.isFinite(record.player.yaw),
      JSON.stringify(record && record.player));

    // Reload restores — same stage, same flags, and the player is standing
    // where they saved, not back at the spawn point.
    const poseBefore = (await gs()).player;
    await page.reload({ waitUntil: "domcontentloaded" });
    await enterWorld(URL_, page);
    const restored = await gs();
    step("reload: the mission is restored to the same stage",
      restored.state.stage === 1 && restored.state.done === false, JSON.stringify(restored.state));
    step("reload: the objective is the same objective", /Overlook/i.test(await objectiveText()),
      await objectiveText());
    const drift = Math.hypot(restored.player.x - poseBefore.x, restored.player.z - poseBefore.z);
    step("reload: the player resumed where the story left off", drift < 3, `moved ${drift.toFixed(1)} m by the reload`);
    const spawnDist = Math.hypot(restored.player.x - (POS.ranch.x + 6), restored.player.z - (POS.ranch.z + 18));
    step("reload: this is really a restore, not a fresh spawn", spawnDist > 10,
      `${spawnDist.toFixed(0)} m from the default spawn`);

    // And the restored run still answers input.
    await steerTo({ x: restored.player.x + 6, z: restored.player.z }, { arrive: 2, label: "a few metres on" });

    // --- Fault injection: a torn write (the shape a crash produces) ---------
    consoleNotes.length = 0;
    await plant(async (p) => {
      await p.evaluate((key) => {
        const raw = localStorage.getItem(key);
        localStorage.setItem(key, raw.slice(0, Math.floor(raw.length / 2)));
      }, SAVE_KEY);
    });
    const torn = await boot();
    step("torn write: the game boots fresh, not stuck", torn.state.stage === 0 && torn.state.done === false,
      JSON.stringify(torn.state));
    step("torn write: the failure is logged, not silent",
      consoleNotes.some((n) => n.includes("[save]")),
      consoleNotes.filter((n) => n.includes("[save]")).slice(-1)[0] || "no [save] console note");
    step("torn write: no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));

    // --- Fault injection: foreign schema version ----------------------------
    await plant(async (p) => {
      await p.evaluate((key) => {
        localStorage.setItem(key, JSON.stringify({ version: 99, missions: {}, player: { x: 1, z: 1 } }));
      }, SAVE_KEY);
    });
    const foreign = await boot();
    step("version mismatch: the game boots fresh, not stuck", foreign.state.stage === 0 && foreign.state.done === false,
      JSON.stringify(foreign.state));
    step("version mismatch: no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));

    // --- Fault injection: schema-valid save with an impossible stage --------
    await plant(async (p) => {
      await p.evaluate((key) => {
        localStorage.setItem(key, JSON.stringify({
          version: 1,
          missions: { version: 1, mission: "smoke", stage: 42, done: false, flags: {} },
          player: { x: 1, z: 1 }
        }));
      }, SAVE_KEY);
    });
    const outOfRange = await boot();
    step("impossible stage: hydrate refuses it and the loop starts unstarted",
      outOfRange.state.stage === 0 && /Harlan/.test(await objectiveText()), JSON.stringify(outOfRange.state));
    step("impossible stage: no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));

    await browser.close();
    finish("probe-save");
  } finally {
    if (server) {
      server.kill("SIGTERM");
    }
  }
}

main().catch((err) => {
  console.error("probe-save: FAILED —", err.message);
  process.exit(1);
});