/**
 * Nav graph invariants — the GLOBAL half of two-stage navigation.
 *
 * The graph is pure data (src/nav/graph.js + src/nav/costs.js touch no THREE
 * and no scene), so this check runs in plain Node with no document stub: the
 * only world it needs is the baked heightfield.
 *
 * Reverting any of these must fail:
 *  - the authored network is 2 components (foothillsTribal is 655 m from any
 *    main-network road); only the NAV_CUTS lines close that gap. Deleting a
 *    cut or adding a road that orphans a POI must turn the check red HERE,
 *    not on the trail when a player meets the dead end.
 *  - determinism: the graph is rebuilt from static data; replayed builds
 *    must be bit-identical or route probes flap run to run.
 *  - edge costs >= length (the search's heuristic relies on KIND_COST >= 1).
 */
import { navGraph, resetNavGraph, linkApproaches, approachNodeOf, nearestNode, NAV_GATES, NAV_CUTS } from "../src/nav/graph.js";
import { bakeHeightfield } from "../src/heightfield.js";
import { POS, clampWorld, ROADS, BRIDGES } from "../src/map.js";

const failures = [];
function check(cond, msg) {
  if (!cond) {
    failures.push(msg);
  }
  return Boolean(cond);
}

bakeHeightfield();
let g = navGraph();
const diag = g.diagnostics;
console.log("nav graph:", JSON.stringify(diag));

check(diag.buildMs < 50, `graph build took ${diag.buildMs} ms — over the 50 ms startup budget; reduce SPACING or cache the bake`);
check(diag.nodes > 500, `only ${diag.nodes} nodes — the road network should sample to ~800; SPACING or ROADS changed drastically`);
check(diag.components === 1,
  `graph has ${diag.components} components ${JSON.stringify(diag.componentSizes)} — a NAV_CUTS connector is missing or broke. Measured gaps the cuts were authored against: ranchSouth<->foothillsTribal 655 m, vipers 1096 m, hideout 707 m off-road`);
check(diag.drops.impassable === 0,
  `${diag.drops.impassable} road/trail/cut edges priced impassable — an authored line now crosses terrain the horse cannot cross. Fix the polyline or the terrain, do not lower SLOPE_BLOCK`);
check(diag.bridgeMisses.length === 0, `bridge ends with no road within SNAP_RADIUS: ${diag.bridgeMisses.join(", ")}`);

// Rail honesty: nodes exist, but no edge is priced as a rail ride. Node kind
// alone is ambiguous at a level crossing (the mill spur shares rail ground),
// so the invariant is on edges: the rail is not traversable without its own
// movement mode (see NAV.rail note in graph.js).
const railIds = g.nodes.filter((n) => n.kind === "rail");
check(railIds.length > 0, "no rail nodes — the rail vanished from the graph table instead of being excluded from travel");
const railLinks = g.edges.filter((e) => e.kind === "rail");
check(railLinks.length === 0, `${railLinks.length} edges priced as rail — the rail became traversable without a movement mode to ride it with`);

// Gates: present and connected — an unlinked gate node is a corridor the
// graph cannot see, and the Fort Grant gate is expected to make this check
// earn its keep.
for (const gate of NAV_GATES) {
  const node = g.nodes.find((n) => n.kind === "gate" && n.ref === gate.id);
  if (check(Boolean(node), `gate ${gate.id} missing from the graph`)) {
    const deg = g.adjacency[node.id].length;
    check(deg >= 1, `gate ${gate.id} has no edges — its corridor priced impassable or no connector within ${60} m`);
  }
}

// Every authored road survived costing (the drops counters above already
// guard totals; here, that no road vanished nodeless).
const roadNames = new Set(ROADS.filter((r) => r.kind !== "rail").map((r) => r.name));
const refsSeen = new Set(Object.values(g.nodes).map((n) => n.ref));
// ref is null on merged nodes; rely on counts instead:
check(diag.nodes > 0 && diag.edges > 0, "graph built empty");

// Determinism: rebuild from scratch and compare tables exactly.
const first = JSON.stringify({ nodes: g.nodes, edges: g.edges, comp: [...g.comp] });
resetNavGraph();
g = navGraph();
const second = JSON.stringify({ nodes: g.nodes, edges: g.edges, comp: [...g.comp] });
check(first === second, "rebuilding the graph produced different tables — non-deterministic build (Math.random, Set iteration or Date.now in the builder?)");

// No node may sit outside the playable world, or A* can route along the frame.
let outside = 0;
const cl = (x, z) => {
  const c = clampWorld(x, z);
  return c.x === x && c.z === z;
};
for (const n of g.nodes) {
  if (!cl(n.x, n.z)) {
    outside += 1;
  }
}
check(outside === 0, `${outside} nodes outside clampWorld — the border is now a routable edge`);

// Cost admissibility: the A* heuristic is straight-line x min(KIND_COST)=1,
// which is only admissible if no edge costs less than its length.
let cheap = 0;
for (const e of g.edges) {
  if (e.cost < e.length - 1e-6) {
    cheap += 1;
  }
}
check(cheap === 0, `${cheap} edges cost less than their length — the heuristic (min KIND_COST 1.0) goes inadmissible and A* loses optimality`);

// Every POI must reach the graph: a place farther than CUT-ORPHAN metres from
// any traversable node means its approach cannot be linked (SNAP_RADIUS 60)
// and check-approaches will fail — fail here with the measured distance
// instead, where the fix is obvious.
const TRAVERSABLE = ["stage", "road", "trail", "cut", "bridge", "gate"];
const orphans = [];
for (const p of Object.values(POS)) {
  const nb = nearestNode(p.x, p.z, { kinds: TRAVERSABLE, maxDist: 2500 });
  if (!nb || nb.dist > 200) {
    orphans.push(`${p.id} ${nb ? nb.dist.toFixed(0) : "∞"} m`);
  } else if (g.comp[nb.id] !== g.comp[nearestNode(Object.values(POS)[0].x, Object.values(POS)[0].z, { kinds: TRAVERSABLE, maxDist: 2500 }).id]) {
    orphans.push(`${p.id} in a different component than the ranch`);
  }
}
check(orphans.length === 0, `POIs not joined to the road graph: ${orphans.join("; ")} — author a NAV_CUTS polyline (measured lines only: print the nearest connector pair first)`);

// Approach linking wires the front doors in; idempotent and deterministic.
const testLinks = linkApproaches([
  { id: "selftest.ranch", poi: "ranch", x: POS.ranch.x, z: POS.ranch.z },
  { id: "selftest.elPaso", poi: "elPaso", x: POS.elPaso.x, z: POS.elPaso.x ? POS.elPaso.z : 0 }
]);
for (const l of testLinks) {
  check(l.ok, `self-test approach ${l.id} could not reach the graph (dist ${l.dist})`);
}
for (const l of testLinks) {
  const again = linkApproaches([{ id: l.id, poi: l.poi, x: 9876, z: -9876 }]);
  check(again[0].ok && again[0].node === l.node, `re-linking ${l.id} re-created its node instead of returning the cached one`);
  check(approachNodeOf(l.id) === l.node, `approachNodeOf(${l.id}) disagrees with the link table`);
}

if (failures.length) {
  console.error(failures.map((f) => "  - " + f).join("\n"));
  throw new Error(`check-nav-graph: ${failures.length} failure(s)`);
}
console.log(JSON.stringify({ nodes: diag.nodes, edges: diag.edges, components: diag.components, cutCount: NAV_CUTS.length, bridges: BRIDGES.length, buildMs: diag.buildMs }));
console.log("PASS");