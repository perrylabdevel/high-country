/**
 * The western filler props (src/props.js, models from scripts/blender-props)
 * must stand where a person would leave them and match the shipped GLB.
 *
 * Every failure here is silent in the game: a crate planted on a deck that
 * isn't there floats at street level, a wagon on a slope hovers at its
 * downhill wheel, a barrel on the painted road stands in the riders' line, a
 * renamed Blender object simply never draws. (The box wagon this kit
 * replaced had stood inside the blacksmith's footprint unnoticed.)
 *
 * Runs headless and offline: dry-build the world in main.js order, plan the
 * props, then assert
 *   - every prop kind is a mesh in its kit GLB (public/models/props/*.glb),
 *     within its triangle budget, one shared material per kit;
 *   - ground props sit on the lowest terrain under their reach (not above,
 *     not sunk), deck props on the boardwalk surface with their whole
 *     footprint on the planks;
 *   - no prop stands inside a building, on a road carriageway, in water, or
 *     in Silver Creek's rider corridor (perp -1.5..1.5, rails excepted);
 *   - no two colliding props overlap.
 */
globalThis.document = {
  createElement(tag) {
    if (tag !== "canvas") {
      return {};
    }
    return {
      width: 256,
      height: 256,
      getContext() {
        const gradient = { addColorStop() {} };
        const noop = () => gradient;
        return new Proxy({}, { get: () => noop });
      }
    };
  }
};

import { readFileSync } from "node:fs";
import * as THREE from "three/webgpu";

const { bakeHeightfield, heightAt } = await import("../src/heightfield.js");
const { clearColliders, deckHeightAt, listBoxColliders } = await import("../src/collision.js");
const { clearStructures, insideStructure, lowestSeat } = await import("../src/buildings/kit.js");
const { createRanch } = await import("../src/buildings.js");
const { createLandmarks } = await import("../src/landmarks.js");
const { createInteriors } = await import("../src/interiors.js");
const { createShore } = await import("../src/shore.js");
const { createIndustry } = await import("../src/industry.js");
const { createFort } = await import("../src/fort.js");
const { createPines } = await import("../src/pines.js");
const { createHomestead } = await import("../src/homestead.js");
const { createVegetation } = await import("../src/vegetation.js");
const { POS, ROADS, CREEKS, WATER, TRIBAL_CAMP, distToPolyline, lakeFactor } = await import("../src/map.js");
const { APPROACHES } = await import("../src/nav/arrivals.js");
const { STRUCTURES } = await import("../src/buildings/kit.js");
const { planWesternProps, PROP_KINDS, PROP_KITS, TELEGRAPH_WIRES } = await import("../src/props.js");
const { groundCleared } = await import("../src/groundClear.js");

const failures = [];
function check(cond, msg) {
  if (!cond) {
    failures.push(msg);
  }
  return cond;
}
const at = (p) => `${p.kind}@(${p.x.toFixed(1)}, ${p.z.toFixed(1)})`;

bakeHeightfield();
clearStructures();
clearColliders();
const scene = { add() {}, remove() {} };
createRanch();
createLandmarks(scene);
createInteriors(scene);
createShore(scene);
createIndustry(scene);
createFort(scene);
createPines(scene);
createHomestead(scene);
createVegetation(scene);
const plan = planWesternProps().map((p) => ({ ...p }));

// --- the shipped models ------------------------------------------------------
// Default 900. Single-instance landmark pieces get more: the headframe and
// the stone powder house are seen close and only once.
const TRI_BUDGET = { wagon_broken: 4500, wagon_farm: 4500, wheel_lean: 1200, barrel: 1200, woodpile: 1400, campfire_ring: 1400, headframe: 1600, ore_bin: 1200, powder_magazine: 2000, cannon: 2000, cannonballs: 1100, well: 1300, saddle_rack: 1000, army_wagon: 4500, rubble_pile: 1100, sheep_wagon: 4500, stock_tank: 1200, plaza_cross: 1100, windmill_fan: 1000, windmill_tower: 1500, lookout_tower: 2400, dock_pier: 1700, chimney_ruin: 1600, cabin_ruin: 1000, burnt_ruin: 1000, shelf_goods: 1000 };
const meshTris = new Map();
const meshKit = new Map();
let glbBytes = 0;
for (const [kit, url] of Object.entries(PROP_KITS)) {
  const glb = readFileSync(new URL(`../public${url}`, import.meta.url));
  glbBytes += glb.length;
  check(glb.readUInt32LE(0) === 0x46546c67, `${url} is not a GLB`);
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8"));
  for (const node of json.nodes || []) {
    if (node.mesh === undefined) {
      continue;
    }
    const tris = json.meshes[node.mesh].primitives.reduce((n, prim) => n + json.accessors[prim.indices].count / 3, 0);
    meshTris.set(node.name, tris);
    meshKit.set(node.name, kit);
  }
  check((json.materials || []).length === 1, `${url} should share one material, has ${(json.materials || []).length}`);
  check(glb.length < 8 * 1024 * 1024, `${url} is ${(glb.length / 1048576).toFixed(1)} MB (budget 8 MB)`);
}
// Authored tree parts (src/treeModels.js) share the pipeline and its budget.
{
  const { TREE_MODELS, TREE_MODELS_URL } = await import("../src/treeModels.js");
  const glb = readFileSync(new URL(`../public${TREE_MODELS_URL}`, import.meta.url));
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8"));
  check((json.materials || []).length === 1, `${TREE_MODELS_URL} should share one material`);
  const TREE_BUDGET = { burnt_snag: 900 };
  for (const name of Object.keys(TREE_MODELS)) {
    const node = (json.nodes || []).find((n) => n.name === name && n.mesh !== undefined);
    check(node, `${TREE_MODELS_URL} has no node named "${name}"`);
    if (node) {
      const tris = json.meshes[node.mesh].primitives.reduce((n, prim) => n + json.accessors[prim.indices].count / 3, 0);
      check(tris <= (TREE_BUDGET[name] ?? 900), `tree part ${name} is ${tris} triangles, budget ${TREE_BUDGET[name] ?? 900}`);
    }
  }
}
// The authored horse and stagecoach: the game falls back to its box rigs on
// a missing node or clip, silently, so pin the names it binds to.
{
  const read = (url) => {
    const glb = readFileSync(new URL(`../public${url}`, import.meta.url));
    return JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8"));
  };
  const horse = read("/models/horse.glb");
  for (const name of ["Horse", "HorseSaddle", "HorseHarness"]) {
    const node = (horse.nodes || []).find((n) => n.name === name);
    check(node && node.skin !== undefined, `horse.glb has no skinned node "${name}"`);
  }
  const clips = (horse.animations || []).map((a) => a.name);
  for (const clip of ["Idle", "Walk", "Trot", "Gallop"]) {
    check(clips.includes(clip), `horse.glb has no "${clip}" clip (has ${clips.join(", ")})`);
  }
  const coach = read("/models/props/coach.glb");
  for (const name of ["coach_body", "coach_gear", "wheel_front", "wheel_rear"]) {
    check((coach.nodes || []).some((n) => n.name === name && n.mesh !== undefined), `coach.glb has no node "${name}"`);
  }
}
for (const [kind, spec] of Object.entries(PROP_KINDS)) {
  check(meshKit.get(kind) === spec.kit, `kit "${spec.kit}" GLB has no node named "${kind}" — the prop would never draw (rebuild with scripts/blender-props/pr_build.py)`);
  const budget = TRI_BUDGET[kind] ?? 900;
  check(!meshTris.has(kind) || meshTris.get(kind) <= budget, `${kind} is ${meshTris.get(kind)} triangles, budget ${budget}`);
}

// --- seating ------------------------------------------------------------------------
const counts = {};
for (const p of plan) {
  counts[p.kind] = (counts[p.kind] || 0) + 1;
  const spec = PROP_KINDS[p.kind];
  const reach = Math.hypot(spec.hx * (p.sx || 1), spec.hz) * (p.s || 1);
  if (p.deck) {
    const deck = deckHeightAt(p.x, p.z, p.y + 0.2);
    const stacked = p.y > deck + 0.3;
    check(stacked || Math.abs(p.y - deck) < 0.01, `${at(p)} is ${(p.y - deck).toFixed(3)} m off the boardwalk surface`);
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    // A stacked piece rests on the one below; round props test their rim.
    const rim = spec.collide === "cyl"
      ? Array.from({ length: 8 }, (_, k) => [Math.cos(k * Math.PI / 4) * spec.hx, Math.sin(k * Math.PI / 4) * spec.hz])
      : [[-spec.hx, -spec.hz], [spec.hx, -spec.hz], [-spec.hx, spec.hz], [spec.hx, spec.hz]];
    for (const [lx, lz] of stacked ? [] : rim) {
      const wx = p.x + c * lx + s * lz;
      const wz = p.z - s * lx + c * lz;
      check(Number.isFinite(deckHeightAt(wx, wz, p.y + 0.2)), `${at(p)} overhangs the boardwalk at (${wx.toFixed(1)}, ${wz.toFixed(1)})`);
    }
  } else if (p.mounted) {
    // A sign arm hangs on its post at an explicit height.
    const post = plan.find((q) => q.kind === "signpost" && Math.abs(q.x - p.x) < 1e-6 && Math.abs(q.z - p.z) < 1e-6);
    check(post && p.y > post.y + 1.5 && p.y < post.y + 2.75, `${at(p)} is not mounted on a signpost`);
  } else if (p.water) {
    // On the lake (a pier on its piles, a moored boat, the island shack):
    // authored against the water plane, not the terrain.
    check(Math.abs(p.y - WATER) < 0.6, `${at(p)} is authored ${(p.y - WATER).toFixed(2)} m from the lake surface`);
  } else if (p.seat === "free") {
    // Authored height (track on a ramp, a car on its rails): near the ground.
    const g = heightAt(p.x, p.z);
    check(p.y > g - 0.35 && p.y < g + 1.4, `${at(p)} is authored ${(p.y - g).toFixed(2)} m from the ground`);
  } else if (p.stacked) {
    // Rests on the prop below it (a bale on a bale): nothing to seat.
  } else if (p.kind === "fence_rail" || p.kind === "fence_post") {
    const ground = heightAt(p.x, p.z);
    check(p.y <= ground + 0.3 && p.y >= ground - 0.35, `${at(p)} is ${(p.y - ground).toFixed(2)} m from the ground (posts carry 0.25 m below grade)`);
  } else {
    const seat = lowestSeat(p.x, p.z, reach);
    check(p.y <= seat + 0.005 && p.y >= seat - 0.06, `${at(p)} base ${(p.y - seat).toFixed(3)} m from the lowest terrain under it`);
    check(heightAt(p.x, p.z) - p.y < 0.6, `${at(p)} sinks ${(heightAt(p.x, p.z) - p.y).toFixed(2)} m at its centre — too steep a seat`);
  }

  // Low props that ground cover would swallow keep a bare disc (groundClear.js).
  if (spec.bare) {
    check(groundCleared(p.x, p.z) && groundCleared(p.x + spec.bare * 0.8, p.z), `${at(p)} has no bare-ground clearing; grass would grow through it`);
  }

  // --- where it stands ----------------------------------------------------------------
  check(p.inside || !insideStructure(p.x, p.z, 0), `${at(p)} stands inside a building footprint`);
  check(p.water || (heightAt(p.x, p.z) > WATER + 0.5 && lakeFactor(p.x, p.z) < 0.3), `${at(p)} stands in water`);
  if (!p.kind.startsWith("hitch_rail") && !p.deck && !p.trackside && !p.spans && !p.inside) {
    for (const road of ROADS) {
      const d = distToPolyline(p.x, p.z, road.pts);
      check(d > road.width / 2 + reach * 0.5, `${at(p)} is ${d.toFixed(1)} m from ${road.name}'s centreline, on the carriageway (half width ${road.width / 2})`);
    }
  }
  if (p.cluster === "town" && p.kind !== "hitch_rail") {
    for (const dz of [0, -22]) {
      const t = POS.silverCreek;
      const perp = -Math.sin(0.15) * (p.x - t.x) + Math.cos(0.15) * (p.z - (t.z + dz));
      check(Math.abs(perp) > 1.5 + 0.3, `${at(p)} is in a Silver Creek rider corridor (perp ${perp.toFixed(2)})`);
    }
  }
}

// --- no two solid props overlap -------------------------------------------------------
// Builder-owned spots (the corral, the stacked hay) are laid out by their
// builder and collide through its own colliders; only free props are tested.
const solid = plan.filter((p) => PROP_KINDS[p.kind].collide && !p.stacked && !p.spot && !(p.deck && p.y > deckHeightAt(p.x, p.z, p.y + 0.2) + 0.3));
for (let i = 0; i < solid.length; i += 1) {
  for (let j = i + 1; j < solid.length; j += 1) {
    const a = solid[i];
    const b = solid[j];
    if (a.kind.startsWith("fence") && b.kind.startsWith("fence")) {
      continue;
    }
    const ra = Math.min(PROP_KINDS[a.kind].hx, PROP_KINDS[a.kind].hz);
    const rb = Math.min(PROP_KINDS[b.kind].hx, PROP_KINDS[b.kind].hz);
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    check(d > ra + rb - 0.02, `${at(a)} and ${at(b)} overlap (${d.toFixed(2)} m apart)`);
  }
}

check(counts.hitch_rail === 7, `expected Silver Creek's 7 hitching rails, planned ${counts.hitch_rail || 0}`);
check(plan.filter((p) => p.cluster !== "town").length >= 60, `roadside filler thinned to ${plan.filter((p) => p.cluster !== "town").length} props (expected >= 60)`);

const clusters = {};
for (const p of plan) {
  clusters[p.cluster] = (clusters[p.cluster] || 0) + 1;
}
const minimum = { cannon: 1, flagpole: 1, well: 1, army_wagon: 1, sentry_box: 1, rubble_pile: 2, headframe: 1, hoist_house: 1, ore_bin: 2, mine_track: 12, mine_car: 5, powder_magazine: 1, water_tank: 1, smokestack: 1, wall_tent: 6, cook_fly: 1, rail_stack: 3, telegraph_pole: 40, mile_marker: 6, signpost: 5, cairn: 8, grave_trail: 2, trunk: 2, campfire_ring: 2 };
for (const [kind, n] of Object.entries(minimum)) {
  check((counts[kind] || 0) >= n, `only ${counts[kind] || 0} ${kind} placed (expected >= ${n})`);
}
check(TELEGRAPH_WIRES.length >= 60, `only ${TELEGRAPH_WIRES.length} telegraph wires strung (expected >= 60)`);
for (const w of TELEGRAPH_WIRES.filter((wire) => wire.kind === "telegraph")) {
  const pole = (x, z) => plan.some((q) => q.kind === "telegraph_pole" && Math.hypot(q.x - x, q.z - z) < 0.6);
  check(pole(w.ax, w.az) && pole(w.bx, w.bz), `telegraph wire (${w.ax.toFixed(0)}, ${w.az.toFixed(0)}) -> (${w.bx.toFixed(0)}, ${w.bz.toFixed(0)}) does not end on two poles`);
  for (let k = 1; k < 10; k += 1) {
    const t = k / 10;
    const x = w.ax + (w.bx - w.ax) * t;
    const z = w.az + (w.bz - w.az) * t;
    const y = w.ay + (w.by - w.ay) * t - w.sag * 4 * t * (1 - t);
    if (y - heightAt(x, z) < 3 || insideStructure(x, z, 0.5)) {
      check(false, `telegraph wire sags to ${(y - heightAt(x, z)).toFixed(2)} m or crosses a building at (${x.toFixed(0)}, ${z.toFixed(0)})`);
      break;
    }
  }
}
// Grass really keeps off the clearings: settle a live scatter at two bare
// props and look for tufts inside their discs. Checking the registry alone
// passed with vegetation.js never consulting it.
{
  const added = [];
  const veg = createVegetation({
    add: (...o) => added.push(...o),
    remove: (...o) => { for (const x of o) { const i = added.indexOf(x); if (i >= 0) added.splice(i, 1); } }
  }, {});
  const bares = plan.filter((p) => PROP_KINDS[p.kind].bare && ["campfire_ring", "grave_trail"].includes(p.kind)).slice(0, 2);
  const m4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  let tuftsNear = 0;
  for (const b of bares) {
    const cam = new THREE.Vector3(b.x + 3, 0, b.z + 3);
    for (let guard = 0; !veg.scatterSettled(cam) && guard < 200; guard += 1) {
      veg.update(cam);
    }
    veg.update(cam);
    const r = PROP_KINDS[b.kind].bare * 0.9;
    for (const o of added) {
      if (!o?.isInstancedMesh) continue;
      o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox;
      if (bb.max.x - bb.min.x > 2.5 || bb.max.y - bb.min.y > 2.5) continue;
      for (let i = 0; i < o.count; i += 1) {
        o.getMatrixAt(i, m4);
        pos.setFromMatrixPosition(m4);
        const d = Math.hypot(pos.x - b.x, pos.z - b.z);
        if (d < 30) tuftsNear += 1;
        check(d >= r, `grass tuft planted ${d.toFixed(2)} m from ${at(b)}, inside its ${r.toFixed(2)} m bare clearing`);
      }
    }
  }
  check(bares.length === 2 && tuftsNear > 0, `grass clearing probe saw ${bares.length} bare props and ${tuftsNear} tufts nearby — the probe is not measuring anything`);
}

// --- the mining district follows the ore ---------------------------------------
{
  const one = (kind) => plan.filter((p) => p.kind === kind);
  const rail = ROADS.find((r) => r.name === "ironRail");
  const [hf] = one("headframe");
  check(one("headframe").length === 1 && hf, `expected one headframe, planned ${one("headframe").length}`);
  if (hf) {
    check(Math.hypot(hf.x - POS.mines.x, hf.z - POS.mines.z) < 120, `the headframe stands ${Math.hypot(hf.x - POS.mines.x, hf.z - POS.mines.z).toFixed(0)} m from Silver Strike Mines`);
    check(Math.hypot(hf.x - POS.ironValley.x, hf.z - POS.ironValley.z) > 200, "a headframe stands in the Iron Valley miners' camp again");
    const hoist = one("hoist_house").find((h) => Math.hypot(h.x - hf.x, h.z - hf.z) < 40);
    check(hoist, "no hoist house within 40 m of the headframe");
    const hoistRope = TELEGRAPH_WIRES.find((w) => w.kind === "hoist");
    check(hoistRope && Math.hypot(hoistRope.bx - hf.x, hoistRope.bz - hf.z) < 0.5 && hoist && Math.hypot(hoistRope.ax - hoist.x, hoistRope.az - hoist.z) < 5, "the hoist rope does not run from the hoist house to the headframe sheave");
    const bin = one("ore_bin").find((b) => Math.hypot(b.x - hf.x, b.z - hf.z) < 10);
    check(bin, "no ore bin beside the headframe");
    // The tramway runs from under that bin's chute to within reach of the rail.
    const tracks = plan.filter((p) => p.kind === "mine_track" && Math.hypot(p.x - hf.x, p.z - hf.z) < 80);
    const nearest = (pt) => Math.min(...tracks.map((t) => Math.hypot(t.x - pt.x, t.z - pt.z)));
    if (bin) {
      check(tracks.length && nearest({ x: bin.x - Math.sin(bin.yaw) * -3.4, z: bin.z + Math.cos(bin.yaw) * 3.4 }) < 3, "the mine tramway does not start under the headframe ore bin's chute");
    }
    check(tracks.some((t) => distToPolyline(t.x, t.z, rail.pts) < 7), "the mine tramway never reaches the railroad");
  }
  // Every ore car sits on a track section, at rail-top height.
  for (const car of one("mine_car")) {
    const on = plan.find((t) => t.kind === "mine_track" && Math.hypot(t.x - car.x, t.z - car.z) < 2.6 * (t.sx || 1) + 0.1 && Math.abs(Math.sin(t.yaw - car.yaw)) < 0.05);
    check(on, `${at(car)} is not on a mine track`);
    check(!on || Math.abs(car.y - (on.y + Math.sin(on.pitch || 0) * ((car.x - on.x) * Math.cos(on.yaw) - (car.z - on.z) * Math.sin(on.yaw)) + 0.15)) < 0.12, `${at(car)} does not sit on its rails`);
  }
  // Nothing built across the railroad: the stamp mill, the offices, the bins.
  const mill = STRUCTURES.find((s) => s.userData.name === "stampMill");
  check(mill, "the stamp mill structure is missing");
  if (mill) {
    const u = mill.userData;
    const d = distToPolyline(u.x, u.z, rail.pts);
    check(d > rail.width / 2 + Math.hypot(u.w, u.d) / 2 * 0.62, `the stamp mill footprint reaches the railroad (${d.toFixed(1)} m from its centreline)`);
    check(d < 30, `the stamp mill stands ${d.toFixed(0)} m from the railroad that serves it`);
    check(Math.hypot(u.x - POS.ironValley.x, u.z - POS.ironValley.z) > 200, "a stamp mill stands in the Iron Valley miners' camp again");
  }
  for (const b of one("ore_bin")) {
    check(distToPolyline(b.x, b.z, rail.pts) > rail.width / 2 + 1.5 || Math.hypot(b.x - hf.x, b.z - hf.z) < 10, `${at(b)} straddles the railroad`);
  }
  check(one("wall_tent").filter((t) => t.cluster === "ironValley").length >= 5, "the Iron Valley miners' camp has fewer than 5 tents");
  check(one("buffer_stop").length === 1, "the railroad's north terminus has no buffer stop");
  // Freight at the company platform stands beside the rail it is loaded from.
  for (const f of plan.filter((p) => p.cluster === "industry" && p.seat === "free" && ["crate", "barrel"].includes(p.kind))) {
    check(distToPolyline(f.x, f.z, rail.pts) < 5, `${at(f)} is on a freight platform ${distToPolyline(f.x, f.z, rail.pts).toFixed(1)} m from the railroad`);
  }
}

// --- Fort Grant stands off the road it serves --------------------------------------
{
  const F = POS.fortGrant;
  const inWalls = (x, z, pad = 0) => Math.abs(x - F.x) < 14.6 + pad && Math.abs(z - F.z) < 12.6 + pad;
  for (const road of ROADS) {
    // Sample the polyline every 2 m against the wall rectangle.
    const w = road.pts.map(([u, v]) => ({ x: (u - 0.5) * 4000, z: (0.5 - v) * 5000 }));
    let crosses = false;
    for (let i = 1; i < w.length && !crosses; i += 1) {
      const n = Math.ceil(Math.hypot(w[i].x - w[i - 1].x, w[i].z - w[i - 1].z) / 2);
      for (let k = 0; k <= n; k += 1) {
        const x = w[i - 1].x + ((w[i].x - w[i - 1].x) * k) / n;
        const z = w[i - 1].z + ((w[i].z - w[i - 1].z) * k) / n;
        if (inWalls(x, z, road.width / 2)) {
          crosses = true;
          break;
        }
      }
    }
    check(!crosses, `${road.name} runs through Fort Grant's walls`);
  }
  const spur = ROADS.find((r) => r.name === "fortSpur");
  const gate = { x: F.x, z: F.z - 12 };
  check(spur && distToPolyline(gate.x, gate.z, spur.pts) < 12, "the fort spur trail does not reach the gate");
  check(distToPolyline(F.x, F.z, ROADS.find((r) => r.name === "stage").pts) > 30, "Fort Grant stands on the stage road again");
  // The gate corridor stays open, and the post has its three buildings,
  // inside the walls, each door facing the parade ground.
  for (const p of plan) {
    const dx = p.x - F.x;
    const dz = p.z - F.z;
    if (Math.abs(dx) < 3.2 + Math.min(PROP_KINDS[p.kind].hx, PROP_KINDS[p.kind].hz) && dz > -12.6 && dz < -4) {
      check(false, `${at(p)} stands in Fort Grant's gate corridor`);
    }
  }
  for (const name of ["fortBarracks", "fortStorehouse", "fortCommissary"]) {
    const st = STRUCTURES.find((s) => s.userData.name === name);
    check(st, `Fort Grant has no ${name}`);
    if (!st) continue;
    const u = st.userData;
    // Footprint half extents in world axes against the walls' inner faces.
    const quarter = Math.abs(Math.sin(u.yaw)) > 0.7;
    const hx = (quarter ? u.d : u.w) / 2;
    const hz = (quarter ? u.w : u.d) / 2;
    check(Math.abs(u.x - F.x) + hx <= 13.45 && Math.abs(u.z - F.z) + hz <= 11.45, `${name} is not inside the fort walls`);
    // Kit front (+Z local) under yaw points (sin yaw, cos yaw).
    const door = { x: u.x + Math.sin(u.yaw) * u.d / 2, z: u.z + Math.cos(u.yaw) * u.d / 2 };
    check(Math.hypot(door.x - F.x, door.z - F.z) < Math.hypot(u.x - F.x, u.z - F.z), `${name}'s door faces the wall, not the parade ground`);
  }
}

// --- Mission and camps stand beside their roads, not on them ---------------------
{
  const deadman = CREEKS.find((c) => c.name === "deadman");
  const M = POS.mission;
  check(distToPolyline(M.x, M.z, deadman.pts) > deadman.width / 2 + 25, "La Esperanza Mission stands in the Deadman arroyo again");
  const south = ROADS.find((r) => r.name === "ranchSouth");
  const end = south.pts[south.pts.length - 1];
  const ew = { x: (end[0] - 0.5) * 4000, z: (0.5 - end[1]) * 5000 };
  const gate = APPROACHES.find((a) => a.id === "mission.trailhead");
  check(Math.hypot(ew.x - (M.x + gate.dx), ew.z - (M.z + gate.dz)) < 8, "ranchSouth does not end at the mission's forecourt arrival");
  for (const name of ["missionChapel", "missionConvento"]) {
    const st = STRUCTURES.find((x) => x.userData.name === name);
    check(st, `the mission has no ${name}`);
  }
  // No solid box in a settlement or camp overlaps a road's carriageway (the
  // timber camp's lumber piles, the mission block and El Paso's well did).
  const boxes = listBoxColliders();
  for (const id of ["mission", "timberCamp", "elPaso", "tribal", "sheepCamp", "vipers", "hideout"]) {
    const P = POS[id];
    for (const b of boxes) {
      if (Math.hypot(b.x - P.x, b.z - P.z) > P.radius) continue;
      const reach = Math.min(b.halfX, b.halfZ);
      for (const r of ROADS) {
        const d = distToPolyline(b.x, b.z, r.pts);
        if (d < r.width / 2 + reach) {
          check(false, `a ${(2 * b.halfX).toFixed(1)} x ${(2 * b.halfZ).toFixed(1)} m solid at ${id} (${(b.x - P.x).toFixed(1)}, ${(b.z - P.z).toFixed(1)}) sits on ${r.name}`);
        }
      }
    }
  }
  // The lodge camp stands beside the foothills trail.
  const trail = ROADS.find((r) => r.name === "foothillsTribal");
  const T = { x: POS.tribal.x + TRIBAL_CAMP.dx, z: POS.tribal.z + TRIBAL_CAMP.dz };
  check(distToPolyline(T.x, T.z, trail.pts) > 24, "the tribal lodge camp is centred on the foothills trail again");
  check(plan.some((p) => p.cluster === "tribal" && p.kind === "fire_pit" && Math.hypot(p.x - T.x, p.z - T.z) < 1), "the lodge camp has no hearth at its centre");
  // Camps are furnished where their arrivals are.
  const want = { timberCamp: 10, sheepCamp: 5, vipers: 5, hideout: 4, tribal: 4, elPaso: 3, mission: 6 };
  for (const [id, n] of Object.entries(want)) {
    check((clusters[id] || 0) >= n, `${id} is dressed with only ${clusters[id] || 0} props (expected >= ${n})`);
    const ap = APPROACHES.find((a) => a.poi === id && a.primary);
    const P = POS[id];
    const near = plan.filter((p) => p.cluster === id && Math.hypot(p.x - P.x - ap.dx, p.z - P.z - ap.dz) < 60).length;
    check(near >= Math.min(n, 3), `${id}'s props stand away from its arrival (${near} within 60 m)`);
  }
}

// --- interior furniture keeps its colliders under it ------------------------------
// interiors.js rotated its colliders by +yaw by hand while the lot group turns
// by three's rotation.y, so in the lots at yaw 1.42 a counter's collider stood
// 4 m from the counter (invisible walls in the aisle, walk-through counters).
{
  const boxes = listBoxColliders();
  const SOLID = ["desk", "bar_counter", "bed_single", "shelf_goods", "pew", "piano", "altar_table"];
  const pieces = plan.filter((p) => p.cluster === "interiors" && SOLID.includes(p.kind));
  check(pieces.length >= 18, `only ${pieces.length} solid interior furniture pieces planned (expected >= 18)`);
  for (const p of pieces) {
    const under = boxes.some((b) => Math.hypot(b.x - p.x, b.z - p.z) < 0.05);
    check(under, `${at(p)} has no collider under it (interior collider frame mirrored?)`);
  }
}

check((clusters.ranch || 0) >= 60, `High Country Ranch dressed with only ${clusters.ranch || 0} props (corral, hay, yard pieces expected >= 60)`);
check((clusters.barrett || 0) >= 8, `Barrett Ranch dressed with only ${clusters.barrett || 0} props (expected >= 8)`);

if (failures.length) {
  throw new Error(`${failures.length} western prop failures:\n  ${failures.slice(0, 12).join("\n  ")}`);
}
console.log(JSON.stringify({ placements: plan.length, kinds: counts, clusters, glbMeshes: Object.fromEntries(meshTris), glbBytes }));
console.log("PASS");
