/**
 * The route matrix — the GLOBAL half of two-stage navigation, proven.
 *
 * 5 origins x 26 destinations, every destination through its PRIMARY arrival
 * approach, in the same dry-built world check-approaches uses (real colliders,
 * graph built after the world). Reverting any part of the graph work must fail
 * here:
 *  - reachability: an unreachable POI is a red build AND appends a living
 *    requirement to state/requirements.json (via scripts/loop/lib.mjs), so the
 *    gap survives this session as tracked campaign work. A check that merely
 *    printed "unreachable" once was how a severed western map shipped.
 *  - contiguity: every consecutive waypoint pair is an actual graph edge. The
 *    matrix must catch a search that fakes progress for free — disconnected
 *    hops read as a valid polyline to a distance check only.
 *  - degeneracy: a "route" shorter than half the straight line means the graph
 *    collapsed (teleporting through dropped edges).
 *  - water: a route that spends the majority of its length underwater is not a
 *    route (WATER_COST penalises; it must still be penalising).
 *
 * Writes audit/evidence/nav-routes-<UTC>.json — the full 130-row table is the
 * evidence the driven probes sample from, not replace.
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

const { bakeHeightfield, heightAt } = await import("../src/heightfield.js");
const { clearStructures } = await import("../src/buildings/kit.js");
const { clearColliders } = await import("../src/collision.js");
const { createRanch } = await import("../src/buildings.js");
const { createLandmarks } = await import("../src/landmarks.js");
const { createInteriors } = await import("../src/interiors.js");
const { createShore } = await import("../src/shore.js");
const { createIndustry } = await import("../src/industry.js");
const { POS, WATER } = await import("../src/map.js");
const { resetNavGraph, navGraph, linkApproaches } = await import("../src/nav/graph.js");
const { primaryApproach, approachLinkRows } = await import("../src/nav/arrivals.js");
const { NAV } = await import("../src/nav/costs.js");
const { routeTo, markEdgeBlocked } = await import("../src/nav/search.js");
const { hasColliderNear } = await import("../src/collision.js");
const { CONNECTOR_KINDS } = await import("../src/nav/graph.js");
const { STATE, requirements, validateRequirements, writeJson, sealIds } = await import("./loop/lib.mjs");

const failures = [];

// --- environment: the world, then the graph ---------------------------------
bakeHeightfield();
const sceneStub = { add() {} };
clearStructures();
clearColliders();
createRanch();
createLandmarks(sceneStub);
createInteriors(sceneStub);
createShore(sceneStub);
createIndustry(sceneStub);
resetNavGraph();
linkApproaches(approachLinkRows());
navGraph();

// --- origins: one per region, both of the network's historical components ---
// ranch (spawn country, main component), silverCreek (town), fortGrant
// (western), mines (iron valley), tribal (the component the Divide cut had to
// stitch back in). An origin starts from the standable connector nearest its
// POI — where a player at that place joins the network — because a POI centre
// can be walled in by its own facades.
const ORIGINS = ["ranch", "silverCreek", "fortGrant", "mines", "tribal"];

function originPoint(poiId) {
  const p = POS[poiId];
  const g = navGraph();
  let best = null;
  let bestD = 240;
  for (const n of g.nodes) {
    if (!CONNECTOR_KINDS.includes(n.kind) || hasColliderNear(n.x, n.z, 1.2)) {
      continue;
    }
    const d = Math.hypot(n.x - p.x, n.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best ? { x: best.x, z: best.z } : { x: p.x, z: p.z };
}

const edgeKeys = new Set(navGraph().edges.map((e) => e.key));
const key = (a, b) => Math.min(a, b) * 1000000 + Math.max(a, b);

/** Contiguity: consecutive node waypoints must share a graph edge; the final
 * approach point hangs off its poi node within the link radius. */
function contiguous(route) {
  const w = route.waypoints;
  for (let i = 1; i < w.length; i += 1) {
    const a = w[i - 1];
    const b = w[i];
    if (a.id >= 0 && b.id >= 0 && !edgeKeys.has(key(a.id, b.id))) {
      return `hop ${i - 1}->${i} is not a graph edge`;
    }
    if (b.id === -1 && Math.hypot(b.x - a.x, b.z - a.z) > NAV.SNAP_RADIUS) {
      return `final approach leg is ${Math.hypot(b.x - a.x, b.z - a.z).toFixed(0)} m — over the link radius`;
    }
  }
  return null;
}

/** Share of route length underwater, sampled every 8 m. */
function waterShare(route) {
  let total = 0;
  let wet = 0;
  for (let i = 1; i < route.waypoints.length; i += 1) {
    const a = route.waypoints[i - 1];
    const b = route.waypoints[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(len / 8));
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      total += 1;
      if (heightAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t) <= WATER) {
        wet += 1;
      }
    }
  }
  return total ? wet / total : 0;
}

// --- the matrix ---------------------------------------------------------------
const rows = [];
for (const originId of ORIGINS) {
  const o = originPoint(originId);
  for (const p of Object.values(POS)) {
    const ap = primaryApproach(p.id);
    if (!ap) {
      rows.push({ origin: originId, destination: p.id, status: "no-primary-approach" });
      failures.push(`${p.id} has no primary approach to route to`);
      continue;
    }
    const mode = ap.type === "door" || ap.type === "porch" ? "walk" : "horse";
    const route = routeTo(o.x, o.z, ap, mode);
    const straight = Math.hypot(ap.x - o.x, ap.z - o.z);
    const row = {
      origin: originId,
      destination: p.id,
      approach: ap.id,
      mode,
      status: route.status,
      length: Math.round(route.length),
      detour: route.length > 0 ? Number((route.length / Math.max(straight, 1)).toFixed(2)) : null,
      hops: Math.max(0, route.waypoints.length - 1),
      replans: route.replans,
      blocked: route.blocked.length,
      searchMs: Number(route.searchMs.toFixed(2)),
      component: route.component
    };
    rows.push(row);
    if (route.status !== "routed") {
      failures.push(
        `${originId} -> ${p.id} is ${route.status} via ${ap.id} — a destination the graph cannot reach is map scenery`
      );
      continue;
    }
    if (route.waypoints.length < 2) {
      failures.push(`${originId} -> ${p.id}: routed but carries no waypoints`);
      continue;
    }
    if (route.length < 0.5 * straight) {
      failures.push(`${originId} -> ${p.id}: route ${route.length.toFixed(0)} m vs straight ${straight.toFixed(0)} m — the graph degenerated`);
    }
    const gap = contiguous(route);
    if (gap) {
      failures.push(`${originId} -> ${p.id}: disjoint polyline (${gap})`);
    }
    const wet = waterShare(route);
    row.waterShare = Number(wet.toFixed(3));
    if (wet > 0.5 && p.id !== "lakeMercy") {
      failures.push(`${originId} -> ${p.id}: ${(wet * 100).toFixed(0)}% of the route underwater — WATER_COST stopped penalising`);
    }
  }
}

// --- failure memory answers a proven-dead edge --------------------------------
// One injection, one re-route: an edge a driver proved impassable leaves the
// search and the same query must still route — or honestly report unreachable.
{
  const g = navGraph();
  const e = g.edges.find((x) => x.kind === "road" && x.cost < 100);
  if (e) {
    const o = originPoint("ranch");
    const before = routeTo(o.x, o.z, primaryApproach("silverCreek"), "horse");
    markEdgeBlocked(e.a, e.b, "check-routes fault injection");
    const after = routeTo(o.x, o.z, primaryApproach("silverCreek"), "horse");
    const hit = after.blocked.includes(e.key) || after.status === "unreachable";
    if (!hit) {
      failures.push(`blocking edge ${e.a}:${e.b} changed nothing — failure memory is not consulted by the search`);
    }
    if (before.status === "routed" && after.status === "routed" && after.cost <= before.cost) {
      failures.push(`blocked-edge route is no dearer than the free one — the blacklist did not force a detour`);
    }
  }
}

// --- evidence -------------------------------------------------------------------
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const evidencePath = STATE(`../audit/evidence/nav-routes-${stamp}.json`);
writeJson(evidencePath, {
  generatedAt: new Date().toISOString(),
  origins: ORIGINS,
  destinations: Object.keys(POS).length,
  rows,
  graph: navGraph().diagnostics,
  summary: {
    rows: rows.length,
    routed: rows.filter((r) => r.status === "routed").length,
    unreachable: rows.filter((r) => r.status !== "routed").length
  }
});

// --- unreachable rows become living requirements, then the build still fails --
const unreachable = rows.filter((r) => r.status !== "routed");
if (unreachable.length) {
  const store = { requirements: requirements() };
  const maxR = Math.max(...store.requirements.map((r) => Number(r.id.slice(1))), 0);
  const id = `R${maxR + 1}`;
  const existing = store.requirements.find((r) => r.title === "POI the route matrix cannot reach");
  const target = existing || {
    id,
    title: "POI the route matrix cannot reach",
    status: "proposed",
    locked: false,
    priority: 2,
    confidence: 0.9,
    cost: "M",
    risk: "M",
    source: "scripts/check-routes.mjs route matrix",
    observation: `Route matrix found ${unreachable.length} unreachable origin/destination row(s) in the five-origin table.`,
    playerExperience: "A place the chart names cannot be reached by following the guidance the game provides.",
    acceptance: [
      "Every POI's primary arrival approach is routable from the route matrix's five regional origins.",
      "No routed leg spends the majority of its length underwater or shorter than half its straight line."
    ],
    verification: ["node scripts/check-routes.mjs exits 0 with zero unreachable rows in the written evidence table"],
    history: [
      {
        date: new Date().toISOString().slice(0, 10),
        action: "created",
        note: `check-routes found ${unreachable.length} unreachable row(s): ${unreachable.map((r) => `${r.origin}->${r.destination} (${r.status})`).join("; ")}`
      }
    ],
    evidenceRefs: [`audit/evidence/nav-routes-${stamp}.json`],
    files: ["src/nav/graph.js", "src/nav/search.js", "src/map.js"],
    deps: [],
    attempts: []
  };
  if (!existing) {
    store.requirements.push(target);
  }
  writeJson(STATE("requirements.json"), store);
  sealIds();
  const errs = validateRequirements({ requirements: requirements() });
  if (errs.length) {
    failures.push(`living-requirement write failed validation: ${errs.join("; ")}`);
  }
}

if (failures.length) {
  console.error(failures.map((f) => "  - " + f).join("\n"));
  throw new Error(`check-routes: ${failures.length} failure(s)`);
}
const t = rows.filter((r) => r.status === "routed");
console.log(JSON.stringify({
  rows: rows.length,
  routed: t.length,
  medianSearchMs: t.length ? Number(t.map((r) => r.searchMs).sort((a, b) => a - b)[Math.floor(t.length / 2)].toFixed(2)) : null
}));
console.log("PASS");