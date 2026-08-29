/**
 * The road/trail/bridge/gate graph routes are planned over.
 *
 * Two-stage navigation: this file is stage one — the GLOBAL network — and
 * src/nav/arrivals.js is stage two — the local approach into a place. A route
 * ends at an approach's graph node, never at the POI's mathematical centre:
 * centre-steering is the bug this module exists to stop (the R3 return ride
 * chased POS.lakeMercy straight across the lake basin and stalled at 909 m).
 *
 * The graph builds once, lazily, deterministically from authored world data.
 * No Math.random, no Date.now in node ids or ordering: replaying the build
 * produces bit-identical tables, and scripts/check-nav-graph asserts it.
 *
 * Traversability is not assumed from geometry — every edge must pay its way
 * through segmentCost (slope gate, water, colliders) or it is dropped with a
 * counted reason. That is what keeps "the line said go" from outrunning
 * "the hill said no".
 */

import { mapToWorld, samplePolyline, ROADS, BRIDGES, POS, headingVector } from "../map.js";
import { NAV, segmentCost, inWorld } from "./costs.js";

/**
 * Gate crossings the graph may thread. Authored as offsets from a POS place so
 * the node follows the place if it is ever re-laid. gapHalf is the clear width
 * either side of the node's centre; check-approaches proves the corridor is
 * physically open (it is how Fort Grant's drawn-shut-but-uncollidered leaves
 * get surfaced as a requirement rather than silently routed through).
 */
export const NAV_GATES = [
  { id: "ranchGate", place: "ranchGate", dx: 4, dz: 0, gapHalf: 3.8 },
  { id: "fortGrant", place: "fortGrant", dx: 0, dz: -12, gapHalf: 3 }
];

/**
 * Cross-country polylines (kind "cut") that stitch the authored road network
 * together and reach the wild POIs roads never touch. Authored, not
 * auto-computed: an automatic cheapest-line search produces lines that read as
 * nonsense on the ground and cannot be reviewed in a diff. check:routes (not
 * this file) proves no POI was orphaned — a future road edit that disconnects
 * a place turns that check red instead of silently stranding players.
 */
export const NAV_CUTS = [
  // The Divide. Measured closest pair across the two road components:
  // (0.424,0.261) on ranchSouth and (0.580,0.300) on foothillsTribal, 655 m
  // apart over flat ground. Without this line tribal lands, La Esperanza's
  // eastern approach and El Paso Verde are map scenery, not destinations.
  {
    name: "divide",
    pts: [[0.424, 0.261], [0.5, 0.27], [0.58, 0.3]]
  },
  // Off the south end of ranchSouth, west along the badlands rim to Viper's
  // Roost. The rim line was measured (worst ground slope ny 0.87) rather than
  // drawn to the POI centre: the approach sits on the rim, 100 m off.
  {
    name: "viperRim",
    pts: [[0.468, 0.174], [0.36, 0.14], [0.28, 0.12], [0.225, 0.102]]
  },
  // South rim spur: ranchSouth's end serves the badlands overlook, and the
  // same line drops into Hidden Canyon. The two cuts share the (0.42,0.10)
  // waypoint — junction merging fuses them into one path — so the rim reads
  // as one passable route in a diff. Straight lines measured ny >= 0.86.
  {
    name: "badlandsRim",
    pts: [[0.495, 0.128], [0.42, 0.1]]
  },
  {
    name: "hideout",
    pts: [[0.42, 0.1], [0.35, 0.08]]
  },
  // The stamp mill rides the iron rail in the world's fiction; since the rail
  // is not traversable, the mill's switch is a dirt spur off ironTrail.
  // Measured worst slope along the line ny 1.0 (valley floor).
  {
    name: "millSpur",
    pts: [[0.8, 0.58], [0.812, 0.552], [0.82, 0.528]]
  }
];

const RAIL = "rail";
const RAIL_NOTE = "exists in the world but is not traversable; needs its own movement mode";

/**
 * Kinds a connector (bridge end, gate, approach link) may tie into. Bridge and
 * gate nodes themselves are narrow points between open stretches, not endpoints
 * a connector should chain onto.
 */
export const CONNECTOR_KINDS = ["stage", "road", "trail", "cut"];

let cached = null;

export function resetNavGraph() {
  cached = null;
}

function edgeKey(ai, bi) {
  return Math.min(ai, bi) * 1000000 + Math.max(ai, bi);
}

/**
 * Merge samples that landed within JUNCTION_MERGE of an earlier one — two
 * roads meeting must share a node or A* zigzags between nodes 2 m apart.
 * Iterated in id order so every remap points backwards: later samples inherit
 * earlier ids, keeping ids stable and the build reproducible.
 */
function mergeJunctions(raw) {
  const cell = 24;
  const buckets = new Map();
  const remap = new Int32Array(raw.length);
  let merges = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const n = raw[i];
    const cx = Math.floor(n.x / cell);
    const cz = Math.floor(n.z / cell);
    // Authored narrow points (gates, bridges) never merge out: a gate absorbed
    // into a road sample loses its identity and check-nav-graph loses the
    // corridor it proves. Roads may still snap ONTO them (a road sample 4 m
    // from the gate becomes an edge of the gate node — the crossing is the
    // shared node).
    let target = -1;
    if (n.kind !== "gate" && n.kind !== "bridge") {
      for (let ox = -1; ox <= 1 && target < 0; ox += 1) {
        for (let oz = -1; oz <= 1 && target < 0; oz += 1) {
          const bucket = buckets.get((cx + ox) * 4096 + (cz + oz));
          if (!bucket) {
            continue;
          }
          for (const j of bucket) {
            if (Math.hypot(n.x - raw[j].x, n.z - raw[j].z) <= NAV.JUNCTION_MERGE) {
              target = j;
              break;
            }
          }
        }
      }
    }
    if (target >= 0) {
      remap[i] = target;
      merges += 1;
    } else {
      remap[i] = i;
      const key = cx * 4096 + cz;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.push(i);
      } else {
        buckets.set(key, [i]);
      }
    }
  }
  return { remap, merges };
}

function computeComponents(nodes, edges) {
  const parent = new Int32Array(nodes.length);
  for (let i = 0; i < parent.length; i += 1) {
    parent[i] = i;
  }
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (const e of edges) {
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra !== rb) {
      parent[ra] = rb;
    }
  }
  // Rail nodes stay unassigned: unlinked by design (see the ROADS loop), they
  // are deliberate orphans, not a component a route could ever cross.
  const comp = new Int32Array(nodes.length).fill(-1);
  const label = new Map();
  let max = 0;
  for (const n of nodes) {
    if (n.kind === RAIL) {
      continue;
    }
    const root = find(n.id);
    if (!label.has(root)) {
      label.set(root, label.size);
    }
    comp[n.id] = label.get(root);
    max = Math.max(max, comp[n.id] + 1);
  }
  const sizes = new Array(label.size).fill(0);
  for (const e of edges) {
    sizes[comp[e.a]] += 1;
  }
  return { comp, labels: label.size, sizes };
}

function buildAdjacency(nodes, edges) {
  const out = nodes.map(() => []);
  for (let e = 0; e < edges.length; e += 1) {
    out[edges[e].a].push({ to: edges[e].b, edge: e });
    out[edges[e].b].push({ to: edges[e].a, edge: e });
  }
  return out;
}

/**
 * The built graph. `nodes`/`edges`/`comp` are the honest tables (checks diff
 * them); `adjacency` is the CSR the search walks; `version` increments on any
 * mutation (approach links, so route caches can invalidate); `approachNodes`
 * maps approach id -> graph node id once linkApproaches has run.
 */
export function navGraph() {
  if (cached) {
    return cached;
  }
  const t0 = performance.now();

  // --- generation pass -------------------------------------------------------
  const raw = [];
  const roadRows = [];
  const cutRows = [];
  const sampleIdsFor = (pts, kind) => {
    const ids = [];
    for (const s of samplePolyline(pts, NAV.SPACING)) {
      if (!inWorld(s.x, s.z)) {
        // The world border truncates a polyline: no node, and the gap in ids
        // prevents an edge reaching across it.
        ids.push(-1);
        continue;
      }
      ids.push(raw.push({ x: s.x, z: s.z, kind, ref: null }) - 1);
    }
    return ids;
  };

  for (const road of ROADS) {
    if (road.kind === "rail") {
      // The rail is there to be seen, not ridden. Bare unlinked nodes keep it
      // honest in the table instead of silently vanishing from the world.
      for (const s of samplePolyline(road.pts, NAV.SPACING)) {
        if (inWorld(s.x, s.z)) {
          raw.push({ x: s.x, z: s.z, kind: RAIL, ref: road.name });
        }
      }
      continue;
    }
    roadRows.push({ kind: road.kind, ref: road.name, ids: sampleIdsFor(road.pts, road.kind) });
  }
  // Rail samples that merged into road nodes (level crossings within 10 m)
  // inherit the road's kind — at a crossing the shared node IS road ground.
  // Anything still labelled rail must have no edges; the graph check asserts
  // that, so the rail cannot quietly become traversable.
  for (const br of BRIDGES) {
    const p = mapToWorld(br.u, br.v);
    if (inWorld(p.x, p.z)) {
      raw.push({ x: p.x, z: p.z, kind: "bridge", ref: br.name });
    }
  }
  for (const gate of NAV_GATES) {
    const place = POS[gate.place];
    if (!place) {
      throw new Error(`NAV_GATES references unknown place ${gate.place}`);
    }
    const x = place.x + gate.dx;
    const z = place.z + gate.dz;
    if (inWorld(x, z)) {
      raw.push({ x, z, kind: "gate", ref: gate.id });
    }
  }
  for (const cut of NAV_CUTS) {
    cutRows.push({ ref: cut.name, ids: sampleIdsFor(cut.pts, "cut") });
  }

  const { remap, merges } = mergeJunctions(raw);

  // --- compaction: first member of each merge group survives -----------------
  const nodes = [];
  const remapped = new Int32Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    if (remap[i] === i) {
      remapped[i] = nodes.length;
      nodes.push({ ...raw[i], id: nodes.length, y: 0 });
    } else {
      remapped[i] = remapped[remap[i]];
    }
  }
  const cid = (rawId) => (rawId < 0 ? -1 : remapped[rawId]);

  // --- edges -----------------------------------------------------------------
  // Costing runs under the horse's body: the stricter radius and slope gate.
  // The modes differ by 0.36 m of radius — a doorway matter, owned by the
  // approach leg's 2 m validation in check-approaches — not a 24 m road
  // matter, and re-costing every edge twice at startup buys nothing but time.
  const mode = "horse";
  const edges = [];
  const seen = new Set();
  const drops = { impassable: 0, border: 0, duplicate: 0 };
  const link = (ai, bi, kind) => {
    if (ai < 0 || bi < 0 || ai === bi) {
      return;
    }
    const key = edgeKey(ai, bi);
    if (seen.has(key)) {
      drops.duplicate += 1;
      return;
    }
    const cost = segmentCost(nodes[ai], nodes[bi], kind, mode);
    if (cost === null) {
      drops.impassable += 1;
      return;
    }
    seen.add(key);
    edges.push({
      a: ai,
      b: bi,
      kind,
      length: Math.hypot(nodes[ai].x - nodes[bi].x, nodes[ai].z - nodes[bi].z),
      cost,
      key
    });
  };

  for (const row of roadRows) {
    for (let i = 1; i < row.ids.length; i += 1) {
      link(cid(row.ids[i - 1]), cid(row.ids[i]), row.kind);
    }
  }

  for (const row of cutRows) {
    for (let i = 1; i < row.ids.length; i += 1) {
      link(cid(row.ids[i - 1]), cid(row.ids[i]), "cut");
    }
  }

  // Bridges tie to the nearest road on each bank: the deck axis runs along
  // heading(yaw), so its ends sit over the banks by construction. A bridge
  // end that cannot find road within SNAP_RADIUS failed its purpose — counted,
  // never silently dropped.
  const bridgeMisses = [];
  for (const br of BRIDGES) {
    const p = mapToWorld(br.u, br.v);
    const h = headingVector(br.yaw);
    const me = nodes.find((n) => n.kind === "bridge" && n.ref === br.name);
    if (!me) {
      continue;
    }
    for (const side of [-1, 1]) {
      const ex = p.x + h.x * (br.length / 2) * side;
      const ez = p.z + h.z * (br.length / 2) * side;
      const nb = nearestConnectorIn(nodes, ex, ez, NAV.SNAP_RADIUS);
      if (!nb) {
        bridgeMisses.push(`${br.name}/${side > 0 ? "north" : "south"} end`);
        continue;
      }
      link(me.id, nb.id, "bridge");
    }
  }

  for (const gate of NAV_GATES) {
    const me = nodes.find((n) => n.kind === "gate" && n.ref === gate.id);
    if (!me) {
      continue;
    }
    for (const nb of connectorIdsWithin(nodes, me.x, me.z, NAV.SNAP_RADIUS)) {
      link(me.id, nb, "gate");
    }
  }

  let comps = computeComponents(nodes, edges);
  const comp = comps.comp;

  // --- approach links (src/nav/arrivals.js wires these in) --------------------
  // A "poi" node is the graph's front door of a place's approach. Added after
  // the build proper so this file never imports the approach *data*: the seam
  // stays one-directional (search.js calls linkApproaches), which keeps
  // check-nav-graph runnable before check-approaches exists.
  const approachNodes = new Map();

  const graph = {
    nodes,
    edges,
    remapped,
    comp,
    components: comps,
    version: 1,
    adjacency: buildAdjacency(nodes, edges),
    approachNodes,
    rail: RAIL_NOTE,
    diagnostics: {
      rawNodes: raw.length,
      merges,
      nodes: nodes.length,
      edges: edges.length,
      drops,
      bridgeMisses,
      components: comps.labels,
      componentSizes: comps.sizes,
      railNodes: nodes.filter((n) => n.kind === RAIL).length,
      buildMs: Math.round(performance.now() - t0)
    }
  };
  cached = graph;
  return graph;
}

/**
 * Register the graph front doors for a set of approaches
 * ({ id, poi, x, z }[] in data order). Idempotent: re-linking is a no-op.
 * Returns one result per approach with the chosen node and its distance —
 * check-approaches turns a miss into a failure, so the diagnostic lives where
 * the data is validated, not buried in the builder.
 */
export function linkApproaches(approaches) {
  const g = navGraph();
  const results = [];
  let mutated = false;
  for (const ap of approaches) {
    if (g.approachNodes.has(ap.id)) {
      results.push({ id: ap.id, node: g.approachNodes.get(ap.id), dist: 0, ok: true });
      continue;
    }
    const nb = nearestConnectorIn(g.nodes, ap.x, ap.z, NAV.SNAP_RADIUS);
    if (!nb) {
      results.push({ id: ap.id, node: -1, dist: Infinity, ok: false });
      continue;
    }
    const node = {
      id: g.nodes.length,
      x: ap.x,
      z: ap.z,
      y: 0,
      kind: "poi",
      ref: ap.id
    };
    g.nodes.push(node);
    g.edges.push({
      a: nb.id,
      b: node.id,
      kind: "poi",
      length: nb.dist,
      cost: nb.dist * (NAV.KIND_COST.poi ?? 1.0),
      key: edgeKey(nb.id, node.id)
    });
    g.approachNodes.set(ap.id, node.id);
    mutated = true;
    results.push({ id: ap.id, node: node.id, dist: nb.dist, ok: true });
  }
  if (mutated) {
    g.comp = computeComponents(g.nodes, g.edges).comp;
    g.adjacency = buildAdjacency(g.nodes, g.edges);
    g.version += 1;
  }
  return results;
}

export function approachNodeOf(approachId) {
  const g = navGraph();
  return g.approachNodes.has(approachId) ? g.approachNodes.get(approachId) : -1;
}

// --- spatial queries ----------------------------------------------------------
// The node table is ~900 entries; a linear scan with a deterministic tie-break
// is ~microseconds and needs no hash to stay correct. If nav ever grows real
// traffic, this is where a grid goes — not into the builder.

function nearestConnectorIn(nodes, x, z, maxDist) {
  let best = -1;
  let bestD = maxDist;
  for (const n of nodes) {
    if (!CONNECTOR_KINDS.includes(n.kind)) {
      continue;
    }
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bestD || (d === bestD && best >= 0 && n.id < best)) {
      bestD = d;
      best = n.id;
    }
  }
  return best < 0 ? null : { id: best, dist: bestD };
}

/** Every connector node within `radius`, ascending id — gate links want all of them. */
function connectorIdsWithin(nodes, x, z, radius) {
  const hits = [];
  for (const n of nodes) {
    if (!CONNECTOR_KINDS.includes(n.kind)) {
      continue;
    }
    const d = Math.hypot(n.x - x, n.z - z);
    if (d <= radius) {
      hits.push({ id: n.id, dist: d });
    }
  }
  hits.sort((a, b) => a.id - b.id);
  return hits.map((h) => h.id);
}

/**
 * Nearest graph node of a tracked kind to (x, z), up to `maxDist`.
 * Deterministic tie-break: nearest, then lowest id — two calls with the same
 * arguments snap the same way, which is what keeps route probes reproducible
 * (the probe asserts routes stay stable across runs via the graph check).
 */
export function nearestNode(x, z, { kinds = null, maxDist = NAV.SNAP_RADIUS * 4 } = {}) {
  const g = navGraph();
  let best = -1;
  let bestD = maxDist;
  for (const n of g.nodes) {
    if (kinds && !kinds.includes(n.kind)) {
      continue;
    }
    const d = Math.hypot(n.x - x, n.z - z);
    if (d < bestD || (d === bestD && best >= 0 && n.id < best)) {
      bestD = d;
      best = n.id;
    }
  }
  return best < 0 ? null : { id: best, dist: bestD };
}