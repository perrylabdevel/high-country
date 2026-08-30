/**
 * R-matrix driven probe — six real legs across the territory, proving that the
 * graph's routes are followable ON THE GROUND by the player's own affordances.
 *
 *   npm run build
 *   node scripts/probe-routes.mjs [baseUrl]
 *   HC_ROUTE_BUDGET_MIN=120 node scripts/probe-routes.mjs   # longer budget
 *   HC_NAV_OVERLAY=1 EVIDENCE_DIR=audit/evidence/probe-routes-R4 ... # visuals
 *
 * Every leg: request the primary approach's route through `__navTo` (the same
 * answer the HUD target line and minimap trail render), follow its waypoints
 * with the shared steerRoute driver, close the final approach on foot when its
 * type is a threshold a horse should not close, then assert ARRIVAL — the
 * player standing inside the approach's arrival region AND the world's place
 * label naming the destination. Distance alone is not arrival; region + label
 * is the affordance pair the headless matrix rows cannot prove.
 *
 * Legs (the plan's six, chained geographically with de-asserted transit rides
 * between the far chains):
 *   ranch -> ranchGate -> overlook -> huntingCabin   (the home country)
 *   fortGrant -> westernRange                        (the western range)
 *   silverCreek -> lakeMercy                         (the town and its shore)
 *   mines -> stampMill                               (iron valley)
 *
 * Bounded: HC_ROUTE_BUDGET_MIN (default 90) minutes for the whole journey;
 * when exhausted, remaining legs are skipped and marked so — pass needs >=5/6
 * legs arrived. An exhausted approach is never retried: its evidence is
 * recorded and the journey moves on.
 */
import { spawn } from "node:child_process";
import {
  chromium,
  createStepper,
  enterWorld,
  gs,
  launchOptions,
  spawnPreviewServer,
  steerRoute,
  steerTo
} from "./probe/drive.mjs";

const BASE = process.argv[2];
const PORT = Number(process.env.PROBE_PORT || 8767);
const URL_ = BASE || `http://127.0.0.1:${PORT}/?dev`;
const BUDGET_MS = Number(process.env.HC_ROUTE_BUDGET_MIN || 90) * 60000;
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || null;
const { step, finish } = createStepper();

let page;
let start = Date.now();

async function shot(name) {
  if (!EVIDENCE_DIR) {
    return;
  }
  const fs = await import("node:fs");
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png` });
}

async function navTo(poiId, mode) {
  return page.evaluate((id, m) => window.__navTo(id, m), poiId, mode || null);
}

function placeLabel() {
  return page.evaluate(() => document.getElementById("hud-place").textContent);
}

async function playerPose() {
  const s = await gs();
  return { x: s.player.x, z: s.player.z, mounted: s.player.mounted };
}

/** Get off the horse (E is Dismount while mounted). */
async function dismount() {
  if (!(await playerPose()).mounted) {
    return true;
  }
  await page.bringToFront();
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(900);
  return !(await playerPose()).mounted;
}

/** Find the (parked) horse and mount it: walk to its recorded pose, press E. */
async function mount() {
  for (let i = 0; i < 4; i += 1) {
    const s = await gs();
    const h = { x: s.horse.x, z: s.horse.z };
    const d = Math.hypot(h.x - s.player.x, h.z - s.player.z);
    if (d > 2.2) {
      try {
        await steerTo(h, { arrive: 1.6, label: "return to Juniper", timeout: Math.min(60000, Math.max(20000, 6000 + 3200 * d)) });
      } catch {
        // wedged near the horse: sidestep once, try the press anyway
        await page.keyboard.down("KeyA");
        await page.waitForTimeout(700);
        await page.keyboard.up("KeyA");
      }
    }
    await page.bringToFront();
    for (let press = 0; press < 3; press += 1) {
      await page.keyboard.press("KeyE");
      await page.waitForTimeout(1200);
      if ((await playerPose()).mounted) {
        return true;
      }
    }
  }
  return false;
}

/**
 * One leg: route to `to`'s primary approach, ride the waypoints, arrive.
 * Returns { status, detail, t0 } — a failed leg is recorded and the journey
 * moves on (an approach that failed once is never retried at the same wall).
 */
async function runLeg(to, label) {
  const t0 = Date.now();
  const plan = await navTo(to, "horse");
  if (!plan || plan.route.status !== "routed") {
    return { status: "failed", detail: plan ? `no routed plan (${plan.route.status})` : "no __navTo result", t0 };
  }
  if (!(await playerPose()).mounted) {
    return { status: "failed", detail: "probe lost the horse before the leg", t0 };
  }
  const hops = await steerRoute(plan.route, { label });
  // Dismount for thresholds a horse should not close, then remount after —
  // the porch is the arrival; the horse waits at the trailhead like it always
  // has, and the next leg needs a rider again.
  const pose = await playerPose();
  const d = Math.hypot(plan.x - pose.x, plan.z - pose.z);
  let walked = false;
  if (plan.type === "door" || plan.type === "porch") {
    if (d < 40) {
      await dismount();
      walked = true;
    }
  }
  await steerTo({ x: plan.x, z: plan.z }, {
    arrive: Math.max(2.2, plan.r * 0.6),
    label: `${label} final approach (${plan.type})`,
    timeout: walked ? 120000 : 60000
  });
  const pose2 = await playerPose();
  const inRegion = Math.hypot(plan.x - pose2.x, plan.z - pose2.z) <= plan.r + 2;
  const worldLabel = await placeLabel();
  const destName = (await navTo(to)).name;
  const named = worldLabel === destName;
  const status = inRegion && named ? "arrived" : "failed";
  return {
    status,
    detail: `inRegion=${inRegion} label="${worldLabel}" want="${destName}" hops=${hops.hops}/${plan.route.waypoints.length} (${hops.of})`,
    t0
  };
}

async function main() {
  start = Date.now();
  const server = await spawnPreviewServer(spawn, { port: PORT, base: BASE });
  try {
    const browser = await chromium.launch(launchOptions());
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => {
      errors.push(String(e));
      console.log(`PAGEERROR — ${String(e).slice(0, 300)}`);
    });
    await enterWorld(URL_, page);

    // --- Mount: every leg is ridden. Juniper stands in the ranch yard. ------
    const mounted = await mount();
    step("mount: the probe rides the legs", mounted, `mounted=${mounted}`);
    if (!mounted) {
      finish("probe-routes");
      return;
    }

    // The journey. `leg` entries are the six asserted arrivals; the transit
    // entries between them simply carry the rider to the next leg's origin
    // POI (de-asserted: crossing the map between chains is not one of the six).
    const SEQUENCE = [
      { to: "ranchGate", leg: "ranch -> ranchGate" },
      { to: "overlook", leg: "ranchGate -> overlook" },
      { to: "huntingCabin", leg: "overlook -> huntingCabin" },
      { to: "fortGrant", transitFor: "fortGrant -> westernRange" },
      { to: "westernRange", leg: "fortGrant -> westernRange" },
      { to: "silverCreek", transitFor: "silverCreek -> lakeMercy" },
      { to: "lakeMercy", leg: "silverCreek -> lakeMercy" },
      { to: "mines", transitFor: "mines -> stampMill" },
      { to: "stampMill", leg: "mines -> stampMill" }
    ];
    const legs = [];
    let exhausted = false;
    for (const s of SEQUENCE) {
      if (errors.length) {
        exhausted = true; // a broken page makes every later leg meaningless
      }
      if (exhausted || Date.now() - start > BUDGET_MS) {
        if (s.leg) {
          legs.push({ leg: s.leg, status: "skipped", detail: exhausted ? "page error" : "journey budget exhausted" });
        }
        continue;
      }
      let out;
      try {
        out = await runLeg(s.to, s.leg || `transit to ${s.to}`);
      } catch (e) {
        out = { status: "failed", detail: String(e.message).slice(0, 160) };
      }
      if (s.leg) {
        legs.push({ leg: s.leg, ...out, ms: Date.now() - out.t0 });
        step(`leg: ${s.leg}`, out.status === "arrived", `${out.status} — ${out.detail || ""}`);
        await shot(`${s.leg.replace(/\W+/g, "-").toLowerCase()}`);
        // A leg that ended on foot needs its horse back before the next one.
        if (!(await playerPose()).mounted && !(await mount())) {
          exhausted = true;
          console.log("    [mount] could not remount; remaining legs skipped");
        }
      } else {
        console.log(`    [transit] to ${s.to}: ${out.status} — ${out.detail || ""}`);
        if (out.status !== "arrived") {
          legs.push({ leg: s.transitFor || s.to, status: "skipped", detail: `transit to ${s.to} failed: ${out.detail || ""}` });
          exhausted = true;
        }
      }
    }

    const good = legs.filter((l) => l.status === "arrived").length;
    const total = SEQUENCE.filter((s) => s.leg).length;
    step(`journey: >=${total - 1}/${total} legs arrived`, good >= total - 1,
      legs.map((l) => `${l.leg}: ${l.status}`).join(" · "));
    step("no page errors during the whole journey", errors.length === 0, errors.join(" | ").slice(0, 200));
    await shot("99-journey-end");

    if (process.env.HC_NAV_OVERLAY) {
      await page.evaluate(() => window.__navOverlay(true, { radius: 400 }));
      await shot("99-nav-overlay");
      await page.evaluate(() => window.__navOverlay(false));
    }
    finish("probe-routes");
    await browser.close();
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error("probe-routes: FAILED —", err.message);
  process.exit(1);
});