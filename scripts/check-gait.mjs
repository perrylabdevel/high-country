/**
 * Legs match their velocity: no walker's planted foot skates.
 *
 * Every locomotion system is run through its real update code at set ground
 * speeds while its body moves, and the world-space foot is tracked. Where a
 * foot is at the bottom of its stride (planted), its ground speed should be
 * a small fraction of the body's. The old stride clocks (`4.2 + 1.1 *
 * speed`, clips at their authored rate regardless of speed) failed this by
 * 2-4x: the player jogged at 3.4 m/s on a 1 m/s walk clip.
 *
 * Covered: procedural figures, livestock box rigs, traffic box mounts, the
 * box horse, the authored player / cast / sheriff clips (walk and run) and
 * the authored horse (walk, trot, gallop), plus the cow's bone gait.
 */
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

globalThis.document = { createElement() { return { width: 256, height: 256, getContext() { const g = { addColorStop() {} }; return new Proxy({}, { get: () => () => g }); } }; } };
globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });
const root = path.resolve(import.meta.dirname, "..");

const { bakeHeightfield } = await import("../src/heightfield.js");
bakeHeightfield();
const { createFigure } = await import("../src/figures.js");
const { createLivestock } = await import("../src/livestock.js");
const { createTraffic } = await import("../src/traffic.js");
const { createHorse } = await import("../src/horse.js");
const { createTexturedActorFactory } = await import("../src/models/texturedActors.js");
const { createHorseVisual, prepareHorseGltf } = await import("../src/models/horseModel.js");

// Planted-foot ground speed may be at most this fraction of body speed.
// Pivot legs are exact by construction (a few % from bob and lean); authored
// clips carry heel roll and hoof arcs, so they get more room.
const LIMIT = { pivot: 0.1, clip: 0.15, hoof: 0.3 };
const DT = 1 / 60;
const failures = [];
const report = {};

/**
 * Track feet over a run. `step(i)` advances the system one frame; `feet()`
 * returns world-space foot points; `body()` the body's world position.
 * Returns the median planted slip ratio across feet.
 */
function slip(label, limit, frames, step, feet, body, warm = 90) {
  const tracks = [];
  const bodies = [];
  for (let i = 0; i < frames; i += 1) {
    step(i);
    if (i < warm) continue;
    const pts = feet().map((p) => p.clone());
    tracks.push(pts);
    bodies.push(body().clone());
  }
  const n = tracks.length;
  const ratios = [];
  const nFeet = tracks[0].length;
  // Height relative to the body, so terrain undulation does not decide
  // "planted"; a foot is planted in the lowest 15% of its own range.
  const rel = [];
  const band = [];
  for (let k = 0; k < nFeet; k += 1) {
    rel.push(tracks.map((t, i) => t[k].y - bodies[i].y));
    const rlo = Math.min(...rel[k]);
    const rhi = Math.max(...rel[k]);
    band.push(rlo + (rhi - rlo) * 0.15);
  }
  for (let i = 1; i < n - 1; i += 1) {
    const bv = Math.hypot(bodies[i + 1].x - bodies[i - 1].x, bodies[i + 1].z - bodies[i - 1].z) / (2 * DT);
    if (bv < 0.2) continue;
    // A pivot leg without a knee fold is at its lowest at mid-swing too, so
    // the foot that is standing is the slowest of the low feet this frame.
    let best = Infinity;
    for (let k = 0; k < nFeet; k += 1) {
      if (rel[k][i] > band[k] || rel[k][i - 1] > band[k] || rel[k][i + 1] > band[k]) continue;
      const fv = Math.hypot(tracks[i + 1][k].x - tracks[i - 1][k].x, tracks[i + 1][k].z - tracks[i - 1][k].z) / (2 * DT);
      best = Math.min(best, fv / bv);
    }
    if (best < Infinity) ratios.push(best);
  }
  ratios.sort((a, b) => a - b);
  const med = ratios.length ? ratios[Math.floor(ratios.length / 2)] : NaN;
  report[label] = +med.toFixed(3);
  if (!(med <= limit)) {
    failures.push(`${label}: planted feet slide at ${(med * 100).toFixed(0)}% of body speed (limit ${limit * 100}%)`);
  }
  return med;
}

const tmp = new THREE.Vector3();
const fwd = new THREE.Vector3();

// --- procedural figure ----------------------------------------------------------
for (const v of [0.9, 1.5, 3.4, 6.2]) {
  const fig = createFigure({});
  const g = fig.group;
  const L = 0.92;
  slip(`figure@${v}`, LIMIT.pivot, 360, () => { g.position.z += v * DT; fig.update(DT, v); g.updateMatrixWorld(true); },
    () => [fig.parts.legL.localToWorld(new THREE.Vector3(0, -L, 0)), fig.parts.legR.localToWorld(new THREE.Vector3(0, -L, 0))],
    () => g.position);
}

// --- livestock box rigs (their own wander and movement code) ---------------------------
{
  const stock = createLivestock();
  const species = new Map();
  for (const a of stock.animals) {
    const key = a.species.name ?? a.rig.parts.legs[0].hip.position.y.toFixed(2);
    if (!species.has(key)) species.set(key, a);
  }
  for (const [key, a] of species) {
    const legY = a.rig.parts.legs[0].hip.position.y;
    const camera = a.rig.group.position;
    const far = new THREE.Vector3(1e5, 0, 1e5);
    // Keep it walking: send it toward a fresh target whenever it idles.
    slip(`livestock:${key}`, LIMIT.pivot, 2400, () => {
      if (a.state !== "walk" || !a.target) {
        a.state = "walk";
        a.stateT = 30;
        a.target = { x: a.home.x + (Math.random() - 0.5) * 20, z: a.home.z + (Math.random() - 0.5) * 20 };
      }
      stock.update(DT, camera, far, () => 1);
      a.rig.group.updateMatrixWorld(true);
    }, () => a.rig.parts.legs.map((l) => l.hip.localToWorld(new THREE.Vector3(0, -legY, 0))), () => a.rig.group.position);
  }
}

// --- traffic box mounts (headless: no GLBs, the fallback rigs run) ---------------------
{
  const traffic = createTraffic();
  const t = traffic.travelers.find((x) => x.kind === "rider");
  t.resting = 0;
  slip("traffic:mount", LIMIT.pivot, 900, () => {
    t.resting = 0;
    traffic.update(DT, t.group.position);
    t.group.updateMatrixWorld(true);
  }, () => t.mount.legs.map((l) => l.hip.localToWorld(new THREE.Vector3(0, -1.0, 0))), () => t.group.position);
}

// --- the box horse under the rider's input --------------------------------------------
for (const sprint of [false, true]) {
  const horse = createHorse();
  const input = { held: (k) => k === "forward" || (sprint && k === "sprint") };
  slip(`horse:box${sprint ? ":sprint" : ""}`, LIMIT.pivot, 600, () => {
    horse.update(DT, input, 0.3, 1);
    horse.object.updateMatrixWorld(true);
  }, () => horse.parts.legs.map((l) => l.hip.localToWorld(new THREE.Vector3(0, -1.02, 0))), () => horse.object.position, 240);
}

// --- authored clip actors --------------------------------------------------------------
async function load(rel) {
  const bytes = fs.readFileSync(path.join(root, rel));
  return new Promise((resolve, reject) => new GLTFLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "", resolve, reject));
}
for (const [label, rel, height, speeds] of [
  ["player", "public/models/player.glb", 1.855, [3.4, 6.2]],
  ["harlan", "public/models/chars/harlan.glb", 1.8, [0.95, 1.5]],
  ["sheriff", "public/models/sheriff.glb", 1.86, [1.0]]
]) {
  const gltf = await load(rel);
  const factory = createTexturedActorFactory(gltf, rel);
  for (const v of speeds) {
    const actor = factory({ targetHeight: height });
    const o = actor.object;
    const feet = [];
    o.traverse((n) => { if (n.isBone && /^foot[LR]$/.test(n.name)) feet.push(n); });
    if (feet.length !== 2) {
      failures.push(`${label}: foot bones not found`);
      continue;
    }
    slip(`${label}@${v}`, LIMIT.clip, 480, () => { o.position.z += v * DT; actor.update(DT, { speed: v }); o.updateMatrixWorld(true); },
      () => feet.map((b) => b.getWorldPosition(new THREE.Vector3())), () => o.position);
  }
}
{
  const gltf = prepareHorseGltf(await load("public/models/horse.glb"));
  report.horseClipSpeeds = Object.fromEntries(Object.entries(gltf.userData.gaitSpeed).map(([k, v]) => [k, +v.toFixed(2)]));
  for (const v of [1.2, 3.6, 4.4, 7.6, 14.5]) {
    const h = createHorseVisual(gltf, { tack: "saddle", phase: 0 });
    const o = h.object;
    const hooves = [];
    o.traverse((n) => { if (n.isBone && /^hoof_[fh][LR]$/.test(n.name)) hooves.push(n); });
    slip(`horse:model@${v}`, LIMIT.hoof, 480, () => { o.position.z += v * DT; h.update(DT, v); o.updateMatrixWorld(true); },
      () => hooves.map((b) => b.getWorldPosition(new THREE.Vector3())), () => o.position);
  }
}

// --- the player: legs from ground actually covered, body facing the travel ---------------
// The player's input asks for a speed; collisions and releases decide what
// the body really covers. Drive the real update with scripted keys.
{
  const { createPlayer } = await import("../src/player.js");
  const { addBoxCollider } = await import("../src/collision.js");
  const camera = new THREE.PerspectiveCamera();
  const keys = new Set();
  const input = { held: (k) => keys.has(k), consume: () => false, readLook: () => ({ x: 0, y: 0 }), pressed: () => false };
  const player = createPlayer(camera);
  const run = (frames) => { for (let i = 0; i < frames; i += 1) player.update(DT, input, null, 1); };
  run(10);
  const cases = [
    ["forward", ["forward"], 0],
    ["back", ["back"], Math.PI],
    ["right", ["right"], -Math.PI / 2],
    ["left", ["left"], Math.PI / 2]
  ];
  for (const [label, held, facing] of cases) {
    keys.clear();
    held.forEach((k) => keys.add(k));
    run(90);
    const turn = Math.atan2(Math.sin(player.facing.rotation.y - facing), Math.cos(player.facing.rotation.y - facing));
    report[`player:${label}:facing`] = +player.facing.rotation.y.toFixed(2);
    if (Math.abs(turn) > 0.2) {
      failures.push(`player moving ${label}: body faces ${player.facing.rotation.y.toFixed(2)} rad, expected ${facing.toFixed(2)} (legs run one way while the body slides another)`);
    }
    if (Math.abs(player.groundSpeed - player.state.speed) > 0.3) {
      failures.push(`player moving ${label}: legs at ${player.groundSpeed.toFixed(2)} m/s on open ground moving at ${player.state.speed.toFixed(2)}`);
    }
  }
  // Blocked: a wall right ahead. The input still asks for a sprint; the legs must stop.
  keys.clear();
  run(60);
  const p = player.object.position;
  const f = { x: Math.sin(player.state.yaw), z: -Math.cos(player.state.yaw) };
  addBoxCollider(p.x + f.x * 1.2, p.z + f.z * 1.2, Math.abs(f.z) * 3 + 0.3, Math.abs(f.x) * 3 + 0.3);
  keys.add("forward");
  keys.add("sprint");
  run(120);
  report["player:blocked:legs"] = +player.groundSpeed.toFixed(2);
  if (player.groundSpeed > 0.4) {
    failures.push(`player sprinting into a wall: legs run at ${player.groundSpeed.toFixed(2)} m/s while the body is stopped (input speed ${player.state.speed.toFixed(2)})`);
  }
  keys.clear();
}

console.log(JSON.stringify(report, null, 1));
if (failures.length) {
  throw new Error(`${failures.length} gait failure(s):\n  ${failures.join("\n  ")}`);
}
console.log("PASS");
