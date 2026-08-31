/**
 * Deterministic A* over the nav graph, with edge failure memory and the
 * routeTo() API the HUD, the minimap and the probes share.
 *
 * Two properties this module is not allowed to lose, because probes assert
 * both:
 *  1. Reproducibility. Same graph, same query, same result — the heap breaks
 *     ties by (cost, then node id) and the heuristic is admissible, so no
 *     clock, no randomness, no iteration-order luck.
 *  2. Failure memory. An edge a driver proved impassable leaves the search
 *     for a growing TTL (EDGE_TTL x min(4, fails)). This is the mechanism
 *     that ends the repeat-failed-approach loop: the old navigator walked
 *     into the same wall every plan, because nothing remembered the plan
 *     had already tried.
 */

import { navGraph, nearestNode, approachNodeOf, CONNECTOR_KINDS } from "./graph.js";
import { NAV } from "./costs.js";

function edgeKey(ai, bi) {
  return Math.min(ai, bi) * 1000000 + Math.max(ai, bi);
}

/** edgeKey -> { key, a, b, reason, fails, until } */
const blocked = new Map();
/** bumped on every blacklist mutation; route caches check it */
let blockedVersion = 1;
/** per-destination count of searches run (the `replans` diagnostic) */
const searchCounts = new Map();
let clock = () => performance.now();

/** Testable time: the check runs with an injected clock to fast-forward TTLs. */
export function setNavClock(fn) {
  clock = fn;
}

export function markEdgeBlocked(a, b, reason) {
  const key = edgeKey(a, b);
  const rec = blocked.get(key) || { key, a: Math.min(a, b), b: Math.max(a, b), fails: 0, reason: "", until: 0 };
  // TTL grows with each repeat failure and caps at 4x: a third failure parks
  // the edge out of the search for 12 minutes. Beyond that a stale blacklist
  // would route the whole world into detours over a wall that may have moved.
  rec.fails += 1;
  rec.reason = reason;
  rec.until = clock() + Math.min(4, rec.fails) * NAV.EDGE_TTL;
  // Where the edge sits on the ground, captured at failure time. The minimap
  // paints blocked crossings from these and the overlay ticks them red; both
  // consumers stay decoupled from the graph tables.
  const g = navGraph();
  if (g.nodes[a]) {
    rec.ax = g.nodes[a].x;
    rec.az = g.nodes[a].z;
  }
  if (g.nodes[b]) {
    rec.bx = g.nodes[b].x;
    rec.bz = g.nodes[b].z;
  }
  blocked.set(key, rec);
  blockedVersion += 1;
  return rec;
}

export function blockedEdges() {
  const now = clock();
  for (const [key, rec] of blocked) {
    if (rec.until <= now) {
      blocked.delete(key);
    }
  }
  return [...blocked.values()];
}

function isBlocked(key) {
  const rec = blocked.get(key);
  if (!rec) {
    return false;
  }
  if (rec.until <= clock()) {
    blocked.delete(key);
    return false;
  }
  return true;
}

/**
 * Binary heap of search states. Ordering is (f, then g, then id): the id
 * tie-break is what makes two equal-cost paths resolve identically run to
 * run — without it, JS object iteration noise would pick whichever was
 * pushed first and route probes would flap.
 */
function heapPush(heap, f, g, id) {
  heap.push({ f, g, id });
  let i = heap.length - 1;
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (less(heap[i], heap[p])) {
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    } else {
      break;
    }
  }
}

function heapPop(heap) {
  const top = heap[0];
  const last = heap.pop();
  if (heap.length) {
    heap[0] = last;
    let i = 0;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && less(heap[l], heap[m])) m = l;
      if (r < heap.length && less(heap[r], heap[m])) m = r;
      if (m === i) break;
      [heap[i], heap[m]] = [heap[m], heap[i]];
      i = m;
    }
  }
  return top;
}

function less(a, b) {
  if (a.f !== b.f) return a.f < b.f;
  if (a.g !== b.g) return a.g < b.g;
  return a.id < b.id;
}

/**
 * Plan a route from (x, z) to the POI the approach belongs to, ending on the
 * approach's graph node plus the approach point itself as the final waypoint.
 *
 * `approach` is an entry from src/nav/arrivals.js APPROACHES[poi].approaches.
 * The result is cached per (place, mode) and invalidated by: any edge blocked
 * or unblocked (blockedVersion), the player wandering off the polyline (> 40 m
 * — the replan trigger), or 4 s of staleness. Cached results count as the same
 * `replans` run; only a fresh search bumps it.
 */
export function routeTo(x, z, approach, mode) {
  const g = navGraph();
  const goalNode = approachNodeOf(approach.id);

  if (goalNode < 0) {
    return {
      placeId: approach.poi,
      approachId: approach.id,
      mode,
      status: "no-approach",
      waypoints: [],
      length: 0,
      cost: 0,
      replans: 0,
      blocked: [],
      blockedPts: [],
      searchMs: 0,
      component: -1
    };
  }

  // The start snaps to a travel node, never to a POI front door: a poi node
  // hangs off the graph by one link, so blocking that lone edge would read as
  // "the whole map is unreachable" — the destination's front door is where you
  // END, not where you begin (the scratch run that found this routed to a
  // ranch-side door 19 m away instead of the road 24 m away).
  const start = nearestNode(x, z, {
    kinds: CONNECTOR_KINDS,
    maxDist: 240,
    standable: true,
    // The rider → graph-node opening leg must be walkable, not merely the
    // shortest: a straight hop across a building is not a route (run 17).
    clearFrom: { x, z, mode }
  });
  if (!start) {
    return {
      placeId: approach.poi,
      approachId: approach.id,
      mode,
      status: "no-approach",
      waypoints: [],
      length: 0,
      cost: 0,
      replans: 0,
      blocked: [],
      blockedPts: [],
      searchMs: 0,
      component: -1
    };
  }

  if (!routeTo.cache) {
    routeTo.cache = new Map();
  }
  const cacheKey = `${approach.poi}:${approach.id}:${mode}`;
  const hit = routeTo.cache.get(cacheKey);
  if (hit && hit.blockedVersion === blockedVersion && hit.version === g.version
    && clock() - hit.at < 4000
    && distToChain(x, z, hit.route.waypoints) < 40) {
    return hit.route;
  }

  const t0 = clock();
  const result = astarRoute(g, start.id, goalNode, approach, mode);
  const searchMs = clock() - t0;

  const count = (searchCounts.get(cacheKey) || 0) + 1;
  searchCounts.set(cacheKey, count);

  const length = result.waypoints.reduce((sum, w, i) => {
    if (i === 0) return sum;
    return sum + Math.hypot(w.x - result.waypoints[i - 1].x, w.z - result.waypoints[i - 1].z);
  }, 0);

  const route = {
    placeId: approach.poi,
    approachId: approach.id,
    mode,
    status: result.status,
    waypoints: result.waypoints,
    length,
    cost: result.cost,
    replans: count,
    blocked: result.blocked,
    blockedPts: result.blockedPts ?? [],
    searchMs,
    component: g.comp[goalNode]
  };

  routeTo.cache.set(cacheKey, {
    route,
    blockedVersion,
    version: g.version,
    at: clock(),
    waypoints: result.waypoints
  });
  return route;
}

/** Distance from (x,z) to the nearest vertex of a polyline — the off-route test. */
function distToChain(x, z, pts) {
  let best = Infinity;
  for (const p of pts) {
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < best) {
      best = d;
    }
  }
  return best;
}

/**
 * A* core. Every edge traversed here pays its recorded build cost (which
 * already carries slope, water and collider penalties in metres-equivalent),
 * so the heuristic only needs the cheapest possible multiple of euclidean
 * distance: KIND_COST's minimum, 1.0. Anything higher would over-estimate and
 * break optimality; anything lower just explores more.
 */
function astarRoute(g, start, goal, approach, mode) {
  const n = g.nodes.length;
  const gCost = new Float64Array(n).fill(Infinity);
  const cameEdge = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const gx = g.nodes[goal].x;
  const gz = g.nodes[goal].z;
  const h = (i) => Math.hypot(g.nodes[i].x - gx, g.nodes[i].z - gz);

  const heap = [];
  gCost[start] = 0;
  heapPush(heap, h(start), 0, start);
  let blockedHit = null;

  while (heap.length) {
    const cur = heapPop(heap);
    if (closed[cur.id]) {
      continue;
    }
    closed[cur.id] = 1;
    if (cur.id === goal) {
      break;
    }
    for (const { to, edge } of g.adjacency[cur.id]) {
      if (isBlocked(g.edges[edge].key)) {
        blockedHit = { key: g.edges[edge].key, a: g.edges[edge].a, b: g.edges[edge].b };
        continue;
      }
      const next = gCost[cur.id] + g.edges[edge].cost;
      if (next < gCost[to] - 1e-9) {
        gCost[to] = next;
        cameEdge[to] = edge;
        heapPush(heap, next + h(to), next, to);
      }
    }
  }

  const blocked = blockedEdges().map((rec) => rec.key);
  // The same blacklist as ground coordinates (edges marked before this route's
  // graph build have no coords and are skipped): what the minimap ticks red.
  const blockedPts = blockedEdges().flatMap((rec) => {
    return rec.ax === undefined ? [] : [{ ax: rec.ax, az: rec.az, bx: rec.bx, bz: rec.bz }];
  });

  if (!closed[goal]) {
    // Unreachable WITH diagnostics — not a shrug. The route matrix turns
    // this into a living requirement; the caller surfaces the blocked edges
    // and the component so the next reader knows what to fix.
    return {
      status: "unreachable",
      waypoints: [],
      cost: 0,
      blocked,
      blockedPts,
      startComponent: g.comp[start],
      goalComponent: g.comp[goal]
    };
  }

  // Walk the chain back out of cameEdge, start first. The final waypoint is
  // the approach point itself — the route hands its consumer the arrival
  // anchor, not just the graph node nearest it.
  const path = [];
  let node = goal;
  while (node >= 0) {
    path.push(node);
    const e = cameEdge[node];
    if (e < 0) {
      break;
    }
    node = g.edges[e].a === node ? g.edges[e].b : g.edges[e].a;
  }
  path.reverse();

  const waypoints = path.map((id) => {
    const n = g.nodes[id];
    return { id, x: n.x, z: n.z, kind: n.kind, ref: n.ref };
  });
  waypoints.push({ id: -1, x: approach.x, z: approach.z, kind: "approach", ref: approach.id });
  return { status: "routed", waypoints, cost: gCost[goal], blocked, blockedPts };
}