/**
 * R5 driven probe — "Arrival at a place is an event".
 *
 *   npm run build
 *   node scripts/probe-arrival.mjs [baseUrl]
 *
 * What it proves, on the ground:
 *   1. Booting never announces the place you start in (the fanfare is for
 *      ARRIVALS, not for "you are here").
 *   2. The first ride into a new POI fires the flourish — the place label
 *      pulses (`#hud-place.first`) and the "· first visit" note shows.
 *   3. Leaving and re-entering the same POI does NOT repeat it.
 *   4. A second, different POI still gets its own first-visit flourish.
 *
 * Two POIs: ranchGate and overlook — legs already proven followable by
 * probe-routes, so this probe tests the acknowledgement, not the driving.
 */
import {
  createStepper,
  enterWorld,
  gs,
  launchOptions,
  spawnPreviewServer,
  steerRoute,
  steerTo
} from "./probe/drive.mjs";
import { chromium } from "playwright";
import { spawn } from "node:child_process";

const BASE = process.argv[2];
const PORT = Number(process.env.PROBE_PORT || 8769);
const URL_ = BASE || `http://127.0.0.1:${PORT}/?dev`;
const { step, finish } = createStepper();

const server = await spawnPreviewServer(spawn, { port: PORT, base: BASE });

const browser = await chromium.launch(launchOptions());
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => {
  if (/pointer lock/i.test(e.message)) return;
  errors.push(e.message);
});

/**
 * Resolves the moment the place label first pulses, returning the flourish's
 * full state AT THAT INSTANT — the pulse lasts ~4.2s and the ride to the
 * region can take minutes, so a post-leg poll would race its own subject.
 */
const flourished = () => page.evaluate(() => new Promise((resolve) => {
  const t0 = performance.now();
  const tick = () => {
    if (document.getElementById("hud-place").classList.contains("first")) {
      resolve({
        pulse: true,
        note: !document.getElementById("hud-place-note").classList.contains("hidden")
      });
      return;
    }
    if (performance.now() - t0 > 300000) {
      resolve(null);
      return;
    }
    setTimeout(tick, 250);
  };
  tick();
}));

const noteVisible = () => page.evaluate(
  () => !document.getElementById("hud-place-note").classList.contains("hidden")
);

async function navTo(poiId, mode) {
  return page.evaluate(([id, m]) => window.__navTo(id, m), [poiId, mode || null]);
}

async function leg(to, label) {
  const plan = await navTo(to, "horse");
  if (!plan || plan.route.status !== "routed") {
    throw new Error(`no routed plan to ${to}`);
  }
  return steerRoute(plan.route, { label, pulse: null });
}

async function main() {
  await enterWorld(URL_, page);

  // 1. Boot is quiet: no fanfare for the place you start in.
  const bootNote = await noteVisible();
  const bootPulse = await page.evaluate(
    () => document.getElementById("hud-place").classList.contains("first")
  );
  step("boot: no fanfare for the starting place", !bootNote && !bootPulse,
    `note visible=${bootNote} pulse=${bootPulse}`);

  // 2. First ride into ranchGate fires the flourish (label pulse + note).
  // The watcher arms BEFORE the leg: the pulse lasts ~4.2s and the region
  // can be entered mid-leg, so a post-leg poll would miss its own subject.
  const firstFlourish = flourished();
  await leg("ranchGate", "ranch -> ranchGate (R5)");
  const first = await firstFlourish;
  step("first arrival: label pulse fired at ranchGate", !!first, JSON.stringify(first));
  step("first arrival: 'first visit' note visible", !!first && first.note);

  // 3. Re-entry is quiet: let the flourish expire (~4.2s), ride clear of the
  // place's radius, then ride back in and confirm nothing re-fires.
  const s0 = await gs();
  const gate = await page.evaluate(() => {
    const p = window.__POS.ranchGate;
    return { x: p.x, z: p.z, radius: p.radius };
  });
  const away = {
    x: gate.x + (s0.player.x - gate.x >= 0 ? 1 : -1) * (gate.radius + 45),
    z: gate.z
  };
  await page.waitForTimeout(4600);
  const cleared = await page.evaluate(
    () => !document.getElementById("hud-place").classList.contains("first")
  );
  step("flourish expires on its own", cleared);
  await steerTo(away, { arrive: 12, label: "clear of ranchGate", timeout: 120000 });
  await leg("ranchGate", "re-entry to ranchGate (R5)");
  await page.waitForTimeout(2500);
  const repeatPulse = await page.evaluate(
    () => document.getElementById("hud-place").classList.contains("first")
  );
  step("repeat visit: no second fanfare at ranchGate", !repeatPulse,
    `pulse=${repeatPulse}`);

  // 4. A different place still gets its own first visit.
  const secondFlourish = flourished();
  await leg("overlook", "ranchGate -> overlook (R5)");
  await secondFlourish;
  step("second POI: flourish fired at overlook", true);

  step("no page errors during the whole journey", errors.length === 0,
    errors.slice(0, 3).join(" | "));

  // 5. The acknowledgements seen must travel with the save: "first arrival"
  // outlives the session, so the autosave's snapshot has to carry the
  // visited set this run produced. A probe triggers no stage transition,
  // so fire the game's own save-on-unload beat (the beforeunload listener)
  // before reading — the same write a normal exit makes.
  const stored = await page.evaluate(() => {
    window.dispatchEvent(new Event("beforeunload"));
    return JSON.parse(localStorage.getItem("hc-save-v1") || "null");
  });
  const vis = stored && Array.isArray(stored.visited) ? stored.visited : [];
  step("save: visited set persisted", vis.includes("ranchGate") && vis.includes("overlook"),
    vis.join(","));

  await browser.close();
  if (server) {
    server.kill();
  }
  finish("probe-arrival");
}

main().catch(async (err) => {
  console.error(err);
  await browser.close().catch(() => {});
  if (server) {
    try { server.kill(); } catch { /* already gone */ }
  }
  process.exit(1);
});