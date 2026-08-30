/**
 * R3 acceptance probe — travel with purpose, driven by in-game affordances.
 *
 *   npm run build
 *   node scripts/probe-travel.mjs [baseUrl]     # spawns `vite preview` if no URL
 *
 * The probe reads ONE thing the game shows a player: the destination line
 * ("◇ <place> · <range> m <bearing>") under the objective, and — through the
 * read-only ?dev instrument — `objectivePlace`, the same resolved place the
 * HUD and minimap marker render. No coordinate in this file names a place:
 * every steer target comes from `window.__missions().objectivePlace`, i.e.
 * from what the world announces. A player unfamiliar with the map can do the
 * whole loop with those two affordances (R3's acceptance conditions 1-3).
 *
 * Steering is the shared closed-loop driver (scripts/probe/drive.mjs) with
 * its live displacement checks and stuck shuffle. On arrival at a place the
 * loop walks an expanding ring of stops (see reachPerson) until the
 * addressable person shows in the prompt — what a player does when the marker
 * says "here" but the person stands some metres off — and records the
 * attempts. Exits 0 only if every leg passes.
 */
import { spawn } from "node:child_process";
import {
  chromium,
  createStepper,
  enterWorld,
  gs,
  launchOptions,
  spawnPreviewServer,
  steerTo,
  talkThrough
} from "./probe/drive.mjs";

const BASE = process.argv[2];
const PORT = Number(process.env.PROBE_PORT || 8766);
const URL_ = BASE || `http://127.0.0.1:${PORT}/?dev`;
const { step, finish } = createStepper();

let page;

const BEARING_RE = /(north|northeast|east|southeast|south|southwest|west|northwest)$/;
const route = { startedAt: Date.now(), legs: [] };
// Set EVIDENCE_DIR to drop a screenshot at each leg into that directory —
// the campaign's visual record of the guidance affordances at work.
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || null;

async function evidenceShot(name) {
  if (!EVIDENCE_DIR) {
    return;
  }
  const fs = await import("node:fs");
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  await page.screenshot({ path: `${EVIDENCE_DIR}/${name}.png` });
}

/** The place the game is currently asking the player to reach. */
async function placeOf() {
  const s = await gs();
  return s.objectivePlace;
}

/** The destination line the HUD shows the player. */
function targetLine() {
  return page.evaluate(() => document.getElementById("objective-target").textContent);
}

/** The prompt as the player sees it: a hidden element's text is stale signage. */
function readPrompt() {
  return page.evaluate(() => {
    const el = document.getElementById("prompt");
    return { visible: !el.classList.contains("hidden"), text: el.textContent };
  });
}

/** True while the asked-for affordance is live: prompt visible and matching. */
async function promptLive(promptRe) {
  const p = await readPrompt();
  return p.visible && promptRe.test(p.text);
}

/**
 * Press E until the dialogue box opens, re-acquiring the prompt first on each
 * attempt. One press can be eaten: a frame consumes the tap while the player
 * has drifted out of interaction range, and use() returns without acting. A
 * player steps back toward the person and presses again; so do we — the hunt
 * walks back into range, the press lands.
 */
async function openTalk(promptRe) {
  let last = null;
  for (let i = 0; i < 4; i += 1) {
    await hunt(promptRe, { label: "talk-reacquire" });
    await page.bringToFront(); // blur clears buffered taps (input.js clearKeys)
    // Mash E while the affordance is up: on a throttled frame loop one tap can
    // land on a frame whose consume() runs after momentum carried the player
    // out of range, and use() eats it silently. A player keeps pressing.
    for (let press = 0; press < 3; press += 1) {
      await page.keyboard.press("KeyE");
      await page.waitForTimeout(900);
      last = await page.evaluate(() => ({
        dialogue: document.getElementById("dialogue").className,
        speaker: document.getElementById("dialogue-speaker").textContent
      }));
      if (!/hidden/.test(last.dialogue)) {
        return last;
      }
    }
  }
  throw new Error(`E never opened a conversation (speaker: ${last && last.speaker || "none"})`);
}

/** Get off the horse (E is Dismount while mounted). Returns true when on foot. */
async function dismount() {
  let s = await gs();
  if (!s.player.mounted) {
    return true;
  }
  await page.keyboard.press("KeyE");
  await page.waitForTimeout(700);
  s = await gs();
  return !s.player.mounted;
}

/**
 * Walk an expanding ring of stops around an anchor until the prompt matches.
 * This is what a player does around an unfamiliar yard: the marked centre can
 * be a building's doorstep (the ranch house door sits exactly on the bearing
 * to the ranch POI) and people or the horse stand up to ~20 m off, so the
 * ring — not the centre — is the search. Stops nearest the player's current
 * bearing come first, so the hunt usually ends in one or two hops. Wedged or
 * timed-out hops are skipped, not fatal.
 */
/**
 * Let momentum die: at a throttled ~2fps the frame loop applies full walking
 * speed per clamped dt, so a stopped player keeps gliding for seconds. Poll
 * until two reads see the same spot (small drift), then wait out the settle.
 */
async function settle(ms = 700) {
  await page.waitForTimeout(ms);
  for (let i = 0; i < 6; i += 1) {
    const a = await gs();
    await page.waitForTimeout(ms);
    const b = await gs();
    const moved = Math.hypot(a.player.x - b.player.x, a.player.z - b.player.z);
    if (moved < 0.15) {
      break;
    }
  }
}

async function hunt(promptRe, { anchor = null, label = "" } = {}) {
  const start = anchor ? { player: anchor } : await gs();
  const cx = start.player.x;
  const cz = start.player.z;
  const t0 = Date.now();
  const stops = [];
  // Who the loop asks for stands anywhere from the marker's centre (Harlan
  // ~4 m) to the yard's far side (Juniper ~14 m, Nell ~20 m). With 8 stops a
  // ring's chords leave annulus gaps wider than the ~3.4 m interaction radius;
  // even 16 stops / 22.5° let BOTH interleaved rings skirt a point by >3.2 m
  // (run 16's capture attempt hunted around the horse for 94 stops without
  // once entering its 3.2 m mount radius). 24 stops put the chord at ~3.6 m at
  // the mid rings, so some stop or hop always passes within range.
  for (const r of [4, 8, 12, 16, 20, 22, 26]) {
    const count = r <= 8 ? 8 : 24;
    const first = (r / 4) % 2 === 0 ? 0 : Math.PI / 12; // interleave the rings
    for (let i = 0; i < count; i += 1) {
      const a = i * ((Math.PI * 2) / count) + first;
      stops.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, r });
    }
  }
  let attempts = 0;
  let prompt = "";
  let caughtText = null; // observed live by a pulse — it may be hidden again by read time
  const reasons = { wedged: 0, timedOut: 0 };
  // Walk the yard the way a player does: from wherever you're standing, go to
  // the nearest corner you haven't checked yet. A fixed spiral order grinds
  // through the yard's buildings stop after stop (42 of 90 hops timed out
  // against the house block for run 14's Nell leg) and revisits one sector;
  // nearest-unvisited lets the path bend around each collider instead.
  const remaining = [...stops];
  while (remaining.length) {
    if (attempts === 0) {
      prompt = await readPrompt();
      attempts += 1;
      remaining.shift();
      if (promptRe.test(prompt.text) && prompt.visible) {
        break;
      }
      continue;
    }
    // Tiered greedy: inner rings are checked before outer ones (the marked
    // centre gets its fair shot — run 15's pure-nearest walk orbited at middle
    // radius and never stepped in to Harlan), and within a tier the nearest
    // unvisited stop goes first so the path bends around buildings.
    const tier = remaining[0].r;
    const p = await gs();
    let best = Infinity;
    let bestIdx = -1;
    for (let i = 0; i < remaining.length && remaining[i].r === tier; i += 1) {
      const dTry = Math.hypot(remaining[i].x - p.player.x, remaining[i].z - p.player.z);
      if (dTry < best) {
        best = dTry;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) {
      remaining.shift(); // nothing reachable matched this tier's scan; move on
      continue;
    }
    if (best <= 1.7) {
      remaining.splice(bestIdx, 1);
      continue; // already standing there
    }
    const stop = remaining.splice(bestIdx, 1)[0];
    try {
      // The affordance can be live only WHILE passing through range on a
      // throttled frame loop, so poll the prompt mid-approach, not just
      // after arriving.
      await steerTo(stop, {
        arrive: 1.6,
        label: `${label || "hunt"} ring r${stop.r}`,
        // At throttle a 20 s window buys ~8 m of walk, so a hop's budget must
        // grow with its length or long hops never arrive — they just burn 20 s
        // against a collider and the hunt wanders one sector forever.
        timeout: Math.min(60000, Math.max(20000, 6000 + 3200 * best)),
        pulse: async () => {
          const live = await readPrompt();
          if (live.visible && promptRe.test(live.text)) {
            caughtText = live.text;
            return true;
          }
          return false;
        }
      });
      if (caughtText) {
        // The pulse saw it live mid-approach; a re-read now can be one stale
        // throttled frame behind (player glided on) — trust the observation.
        prompt = { visible: true, text: caughtText };
        attempts += 1;
        break;
      }
      await settle(); // momentum must die before the prompt means anything
    } catch (e) {
      // Wedged or timed out on this hop: sidestep off the collider and back
      // off before the next bearing — retrying in place is how the whole hunt
      // stalls against the same wall.
      attempts += 1;
      reasons[String(e.message).includes("wedged") ? "wedged" : "timedOut"] += 1;
      const side = attempts % 2 ? "KeyA" : "KeyD";
      try {
        await page.keyboard.down(side);
        await page.waitForTimeout(900);
        await page.keyboard.up(side);
        await page.keyboard.down("KeyS");
        await page.waitForTimeout(700);
        await page.keyboard.up("KeyS");
      } catch {
        // keyboard is best-effort during a dying page
      }
      continue; // a player would just move on
    }
    prompt = await readPrompt();
    attempts += 1;
    if (promptRe.test(prompt.text) && prompt.visible) {
      break;
    }
    const pNow = await gs();
    console.log(`    [hunt ${attempts}] player=(${pNow.player.x.toFixed(1)}, ${pNow.player.z.toFixed(1)}) wedged=${reasons.wedged} timedOut=${reasons.timedOut} prompt="${prompt.text.slice(0, 40)}"`);
  }
  route.legs.push({ place: label || promptRe.source, kind: "hunt", attempts, ms: Date.now() - t0 });
  if (!(prompt.visible && promptRe.test(prompt.text))) {
    const end = await gs().catch(() => null);
    throw new Error(`${label || promptRe} never showed in the prompt after ${attempts} stops (last prompt: ${prompt.text || "none"}; wedged=${reasons.wedged} timedOut=${reasons.timedOut}; player at ${end ? `(${end.player.x.toFixed(1)}, ${end.player.z.toFixed(1)})` : "?"})`);
  }
  return { prompt: prompt.text, attempts };
}

/** Reach the person the loop is asking for, from the announced place. */
async function reachPerson(name) {
  const place = await placeOf();
  return hunt(new RegExp(`Talk to ${name}`), { anchor: { x: place.x, z: place.z }, label: place.name });
}

/** Steer toward the announced place until the objective's arrival stage fires.
 *
 * Two-stage navigation is what fixed the R3 stall: the target is the place's
 * ARRIVAL APPROACH (never the POI centre — the old centre-steering rode the
 * return leg straight across the lake basin and died at 909 m), and when the
 * game advertises a planned route the probe rides its waypoints, letting the
 * search replan underneath it. No route (or an unreachable verdict) falls back
 * to short-hop steering at the approach.
 */
async function rideToPlace({ timeout = 900000 } = {}) {
  const place = await placeOf();
  const t0 = Date.now();
  // Follow the marker, not the map: re-read the announced target every pulse
  // so the loop cannot drift from what the game says.
  let d0 = null;
  let bestD = null; // stall guard: a ride that stops closing is a failed ride
  let bestAt = Date.now();
  let midShot = false;
  let fails = 0;
  let rescued = false;
  let ridden = null;
  while (Date.now() - t0 < timeout) {
    const live = await placeOf();
    if (!live || !live.approach) {
      throw new Error("the objective stopped resolving to an arrival approach mid-ride");
    }
    const s = await gs();
    // Range to the approach — what the HUD measures and what a player closes.
    const d = Math.hypot(live.approach.x - s.player.x, live.approach.z - s.player.z);
    if (d0 === null) {
      d0 = d;
    }
    if (bestD === null || d < bestD - 2) {
      bestD = d;
      bestAt = Date.now();
    }
    if (Date.now() - bestAt > 180000) {
      const here = await gs();
      if (rescued) {
        throw new Error(`ride to ${place.name} stalled at ${Math.round(d)} m (best ${Math.round(bestD)} m; player (${here.player.x.toFixed(0)}, ${here.player.z.toFixed(0)}) even after a back-off rescue)`);
      }
      // One rescue: the mount point can wedge the horse against a fence or
      // the horse's own collider — back off, sidestep, re-aim once.
      rescued = true;
      await page.keyboard.down("KeyS");
      await page.waitForTimeout(1500);
      await page.keyboard.up("KeyS");
      await page.keyboard.down("KeyA");
      await page.waitForTimeout(900);
      await page.keyboard.up("KeyA");
      bestAt = Date.now();
      continue;
    }
    if (!midShot && d0 > 80 && d < d0 / 2) {
      midShot = true; // halfway across the ride: the marker should still read
      await evidenceShot(`02-mid-ride-${live.name.replace(/\W+/g, "-").toLowerCase()}`);
    }
    // On the approach ground: within its arrival region (minus a margin), the
    // stage transition — not a coordinate — is what the caller waits on.
    if (d < Math.max(6, live.approach.r - 2)) {
      break;
    }
    // Ride the planned polyline when the game advertises one: the first
    // waypoint still more than a hop ahead. The search re-plans under us (the
    // player's drift, a blacklisted edge), so stale chains self-correct.
    const rt = live.route;
    let wp = null;
    if (rt && rt.status === "routed" && rt.waypoints.length) {
      for (const w of rt.waypoints) {
        if (Math.hypot(w.x - s.player.x, w.z - s.player.z) > 14) {
          wp = w;
          break;
        }
      }
      if (!wp) {
        wp = { x: live.approach.x, z: live.approach.z, kind: "approach" };
      }
    }
    // Fallback: short-hop steering at the approach, never a long straight
    // drive (a long hop wedges the yard exit and oscillates at a fixed radius).
    if (!wp) {
      const hopLen = Math.min(60, Math.max(20, d - 10));
      wp = {
        x: s.player.x + ((live.approach.x - s.player.x) / d) * hopLen,
        z: s.player.z + ((live.approach.z - s.player.z) / d) * hopLen
      };
    }
    try {
      await steerTo(wp, {
        arrive: wp.kind === "approach" ? 4 : 12,
        label: live.name,
        timeout: Math.min(240000, Math.max(90000, 30000 + d * 300))
      });
      fails = 0;
      ridden = wp.kind === "approach" ? "approach" : "route";
      console.log(`    [ride] ${live.name}${wp.kind ? ` (${ridden}${wp.ref ? `: ${wp.ref}` : ""})` : ` (fallback)`}: ${Math.round(d)} m to go at (${s.player.x.toFixed(0)}, ${s.player.z.toFixed(0)})`);
    } catch {
      // A wedged or timed-out hop is not a failed ride: sidestep off the
      // collider (what a player does), then re-read the marker and carry on.
      fails += 1;
      const side = fails % 2 ? "KeyA" : "KeyD";
      await page.keyboard.down(side);
      await page.waitForTimeout(1200);
      await page.keyboard.up(side);
      await page.keyboard.down("KeyS");
      await page.waitForTimeout(700);
      await page.keyboard.up("KeyS");
      await page.waitForTimeout(400);
      continue;
    }
    place.name = live.name;
  }
  route.legs.push({ place: place.name, kind: "place", fromM: Math.round(d0), ms: Date.now() - t0 });
  return place;
}

/** Poll until the mission FSM's stage advances (the arrival transition), with
 * a bounded window — an arrival that never registers is the finding. */
async function waitForStage(want, { tries = 10, ms = 1500 } = {}) {
  let s = await gs();
  for (let i = 0; i < tries && s.state.stage !== want; i += 1) {
    await page.waitForTimeout(ms);
    s = await gs();
  }
  return s;
}

async function main() {
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

    // --- Announce: the HUD names where the loop wants you -------------------
    let line = await targetLine();
    // Two-stage navigation in the player-facing line: range to the arrival
    // approach, the bearing, and HOW to arrive ("via the yard") — the word
    // that turned "a place" into "a place you can actually close on".
    const announceM = line.match(/· (\d+) m (north|northeast|east|southeast|south|southwest|west|northwest) · via (the \w+)/);
    step("announce: the destination line names the place, range, bearing, and the approach",
      /High Country Ranch/.test(line) && Boolean(announceM) && BEARING_RE.test(announceM[2]), line);
    await evidenceShot("01-announce");

    // --- Leg 1: reach the announced place and find Harlan -------------------
    const harlan = await reachPerson("Harlan Calder");
    step("leg1: Harlan is addressable from the announced place",
      /Talk to Harlan Calder/.test(harlan.prompt), `${harlan.prompt} — after ${harlan.attempts} stop(s)`);
    const opened = await openTalk(/Talk to Harlan Calder/);
    step("leg1: E opens the conversation", /Harlan/.test(opened.speaker), JSON.stringify(opened));
    // Harlan's opener is one authored line (check-missions asserts it).
    await talkThrough({ expectSpeaker: "Harlan Calder", minLines: 1 });
    await page.waitForTimeout(600);
    const after = await gs();
    step("leg1: talking to the family starts the loop",
      after.state.stage === 1, `stage=${after.state.stage} objective=${after.objective}`);

    // --- Mount: the ride north is a real ride, and Juniper stands in the yard
    let mountedNow = false;
    const juniperHint = /Mount Juniper/;
    for (let i = 0; i < 3 && !mountedNow; i += 1) {
      // Hunt from where the player stands: after stage 1 the announced place is
      // the OVERLOOK (the ride's destination), and the horse stands in the yard
      // the player is already in. Hunting from the current position won 4/4.
      try {
        await hunt(juniperHint, { label: "Juniper" });
      } catch (e) {
        // An exhausted hunt is not fatal while tries remain: the next attempt
        // starts wherever this one ended, which changes every ring's geometry.
        console.log(`    [mount] attempt ${i} exhausted: ${e.message}`);
        continue;
      }
      await page.bringToFront();
      for (let press = 0; press < 3 && !mountedNow; press += 1) {
        await page.keyboard.press("KeyE"); // one tap can be eaten by a frame that runs after the glide
        await page.waitForTimeout(1200); // >2 throttled frames: a second tap must not land mid-mount
        mountedNow = (await gs()).player.mounted === true;
      }
    }
    step("mount: the hint's E mounts the horse", mountedNow, `mounted=${mountedNow}`);

    // --- Leg 2: follow the announced place north ----------------------------
    const next = await rideToPlace();
    await page.waitForTimeout(1200);
    await evidenceShot("03-arrived-overlook");
    const arrived = await waitForStage(2);
    step("leg2: arriving at the announced place is an event",
      arrived.state.stage === 2 && arrived.state.flags.sawTheLine === true,
      `objective=${arrived.objective}`);
    const toast = await page.evaluate(() => document.getElementById("toast").textContent);
    step("leg2: the world announces what you arrived at", /smoke|ridge|overlook/i.test(toast), toast.slice(0, 60));
    step("leg2: the target line still resolves the loop's next place",
      /Ranch overlook/.test(await targetLine()), await targetLine());

    // Range check on the live affordance: the range shrinks as you close.
    const nearM = (await targetLine()).match(/(\d+) m /);
    step("leg2: the announced range shrank across the ride", nearM && Number(nearM[1]) < 220, await targetLine());

    // --- Leg 3: read the smoke, then the loop asks you home ----------------
    const place = await rideToPlace();
    await steerTo({ x: place.x, z: place.z - 9 }, { arrive: 4, label: "glassing spot" });
    // E while mounted means Dismount, so get off before examining.
    const off = await dismount();
    step("dismount: off the horse at the overlook", off === true, String(off));
    await settle();
    const promptB = await readPrompt();
    step("leg3: the examination is offered at the announced place",
      promptB.visible && /Glass the smoke/.test(promptB.text), promptB.text);
    await openTalk(/Glass the smoke/);
    const reading = await talkThrough({ expectSpeaker: "The ridge", minLines: 3 });
    step("leg3: the discovery is recorded", /arson|fire line/i.test(reading.map((r) => r.body).join(" ")) ||
      (await gs()).state.flags.sawArson === true, "flag sawArson");

    // --- Leg 4: the loop asks you home, by name -----------------------------
    const home = await rideToPlace();
    await dismount();
    await page.waitForTimeout(600);
    const homeLine = await targetLine();
    step("leg4: the target line announces the return place", /High Country Ranch/.test(homeLine), homeLine);
    const nell = await reachPerson("Nell Calder");
    step("leg4: Nell is addressable from the announced place", /Talk to Nell Calder/.test(nell.prompt), nell.prompt);
    await openTalk(/Talk to Nell Calder/);
    const talk = await talkThrough({ expectSpeaker: "Nell Calder", minLines: 1 });
    step("leg4: the report conversation is the consequence beat",
      talk.length >= 1, talk[0].body.slice(0, 60));
    await page.waitForTimeout(800);

    const done = await gs();
    step("completing: the loop closes with no place to point at",
      done.state.done === true, JSON.stringify(done.state));
    step("completing: the destination line retires with the loop",
      (await targetLine()).trim() === "", await targetLine());
    await evidenceShot("04-loop-complete");

    step("no page errors during the whole route", errors.length === 0, errors.join(" | ").slice(0, 200));
    route.elapsed = Date.now() - route.startedAt;
    console.log(`route: ${route.elapsed / 1000 | 0}s — ${route.legs.map((l) => `${l.place}(${l.kind},${l.attempts ?? ""}${l.attempts ? " hunt" : ""}${l.fromM ? ` from ${l.fromM}m` : ""})`).join(" -> ")}`);
    finish("probe-travel");
    await browser.close();
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error("probe-travel: FAILED —", err.message);
  process.exit(1);
});