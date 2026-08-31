/**
 * Arrival approach invariants — the LOCAL half of two-stage navigation.
 *
 * Dry-builds the world the way the game does (document stub, then
 * createRanch/createLandmarks/createInteriors/createShore/createIndustry) so
 * every real collider, deck and footprint the player meets also exists here:
 * an approach validated against the heightfield alone would pass straight
 * through the barn it was authored next to. The graph is (re)built AFTER the
 * world build, so edge costing and approach linking see the colliders —
 * which is how a trail sample that dies inside a building gets excluded from
 * approach links rather than feeding A* a route through a wall.
 *
 * Reverting any of these must fail:
 *  - the lake dock: Lake Mercy's centre is 12.8 m of water; a dock approach
 *    at the POI centre is underwater by construction, and arrivalState at
 *    the centre must refuse (the bug that stalled the R3 return ride).
 *  - the node→approach leg: 2 m sampling with a hard standing test is the
 *    "not separated by a wall/fence/cliff/water" clause. Distance alone
 *    cannot make this check green.
 *  - gate corridors: a gate approach whose gap is shut means the graph's
 *    NAV_GATES fiction (drawn shut, never colliders) gets surfaced here.
 *
 * Graph build cost note: this check pays a second graph build (~30 ms) and a
 * full dry world build (~1 s); that is what buys the only environment where
 * colliders are honest. Startup never pays it — the game builds the world
 * before the first navGraph() call anyway.
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
        // Every 2D call returns a gradient-like object (check-buildings stub).
        const gradient = { addColorStop() {} };
        const noop = () => gradient;
        return new Proxy({}, { get: () => noop });
      }
    };
  }
};

const { bakeHeightfield, heightAt } = await import("../src/heightfield.js");
const { clearStructures, insideStructure } = await import("../src/buildings/kit.js");
const { clearColliders } = await import("../src/collision.js");
const { createRanch } = await import("../src/buildings.js");
const { createLandmarks } = await import("../src/landmarks.js");
const { createInteriors } = await import("../src/interiors.js");
const { createShore } = await import("../src/shore.js");
const { createIndustry } = await import("../src/industry.js");
const { POS, WATER, lakeFactor } = await import("../src/map.js");
const { resetNavGraph, navGraph, linkApproaches, approachNodeOf, NAV_GATES } = await import("../src/nav/graph.js");
const {
  APPROACHES,
  approachesFor,
  primaryApproach,
  approachLinkRows,
  arrivalState,
  APPROACH_CLEAR
} = await import("../src/nav/arrivals.js");
const { moveAndSlide, clearanceAt } = await import("../src/collision.js");
const { surfaceFactor, MODE_RADIUS } = await import("../src/nav/costs.js");
const { routeTo } = await import("../src/nav/search.js");

const failures = [];
const checks = [];
function check(cond, msg) {
  checks.push(Boolean(cond));
  if (!cond) {
    failures.push(msg);
  }
  return Boolean(cond);
}

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

const links = linkApproaches(approachLinkRows());
const g = navGraph();

const TYPES = new Set(Object.keys(APPROACH_CLEAR));
const DOORLIKE = new Set(["door", "porch"]);
const gateByPoi = new Map(NAV_GATES.map((gate) => [gate.place, gate]));

// --- rule 1: coverage ---------------------------------------------------------
const ids = new Set();
for (const ap of APPROACHES) {
  check(!ids.has(ap.id), `duplicate approach id ${ap.id}`);
  ids.add(ap.id);
  check(TYPES.has(ap.type), `approach ${ap.id} has unknown type ${ap.type}`);
  check(Number.isFinite(ap.face || 0) || ap.face === undefined, `approach ${ap.id} face is not a yaw`);
}
for (const p of Object.values(POS)) {
  const list = approachesFor(p.id);
  check(list.length >= 1, `POI ${p.id} has no approach at all — it is a label, not a destination`);
}

// --- rule 2: exactly one primary per POI --------------------------------------
for (const p of Object.values(POS)) {
  const primaries = approachesFor(p.id).filter((ap) => ap.primary);
  check(primaries.length === 1, `POI ${p.id} has ${primaries.length} primary approaches — exactly one is required`);
}

// --- rules 3-6: placement, standing ground, water, footprint -----------------
let clear = 0;
for (const ap of APPROACHES) {
  const place = POS[ap.poi];
  const d = Math.hypot(ap.dx, ap.dz);
  // Region bound: 1.6x radius covers authored rim cuts (~110 m off canyons
  // whose radius is 55), but the lake dock is defined by the SHORE — the rim
  // is ~500 m out and the centre is water, so dock gets the rim's own scale.
  const bound = ap.type === "dock" ? 560 : Math.max(place.radius * 1.6, 160);
  check(d <= bound, `approach ${ap.id} sits ${d.toFixed(0)} m from its POI — over the ${bound.toFixed(0)} m bound; the region it describes is not this place`);

  for (const mode of ["walk", "horse"]) {
    const sf = surfaceFactor(ap.x, ap.z, mode);
    check(sf !== null, `approach ${ap.id} is not standing ground for ${mode} — slope or collider ejects the mover`);
    if (sf === null) {
      continue;
    }
    // Rule 4 (slope) is inside surfaceFactor's gate; water is rule 5.
    if (ap.type === "dock") {
      const lf = lakeFactor(ap.x, ap.z);
      check(heightAt(ap.x, ap.z) > WATER, `dock approach ${ap.id} is underwater (h ${heightAt(ap.x, ap.z).toFixed(2)}) — a dock is the waterline, not past it`);
      check(lf >= 0.55 && lf <= 1.05, `dock approach ${ap.id} lakeFactor ${lf.toFixed(2)} outside [0.55, 1.05] — it is not on the shore band`);
    } else {
      check(heightAt(ap.x, ap.z) > WATER, `approach ${ap.id} is underwater — move it to dry ground`);
    }
  }
  const need = APPROACH_CLEAR[ap.type];
  clear += 1;
  const got = clearanceAt(ap.x, ap.z, Math.max(need + 1, 8));
  check(got >= need, `approach ${ap.id} has ${got.toFixed(1)} m clearance, its type needs ${need} m — the arrival point is squeezed by the world it describes`);

  // Not inside a structure footprint, unless the approach IS the structure
  // boundary (door stands one step outside, porch on the deck).
  if (!DOORLIKE.has(ap.type)) {
    check(!insideStructure(ap.x, ap.z, 0.25),
      `approach ${ap.id} stands inside a building footprint — arrivals cannot begin inside a wall`);
  }
}

// --- rule 7: graph link + the 2 m node→approach leg --------------------------
for (const ap of APPROACHES) {
  const link = links.find((l) => l.id === ap.id);
  if (!check(link && link.ok, `approach ${ap.id} has no graph node within ${60} m — check:nav-graph's orphan rule missed it or SNAP_RADIUS changed`)) {
    continue;
  }
  const node = g.nodes[approachNodeOf(ap.id)];
  if (!check(node, `approach ${ap.id} link table disagrees with the graph`)) {
    continue;
  }
  check(node.kind === "poi" && node.ref === ap.id, `approach ${ap.id} linked a ${node.kind} node`);

  // The leg: sampled every 2 m, each step actually walkable at the horse's
  // (strictest) radius, never underwater, never stepping a 1.2 m wall of
  // height. This is the "not separated by wall/fence/cliff/water" test.
  const steps = Math.max(1, Math.ceil(Math.hypot(node.x - ap.x, node.z - ap.z) / 2));
  let px = node.x;
  let pz = node.z;
  let lastY = heightAt(node.x, node.z);
  let ok = true;
  let firstBad = "";
  for (let i = 1; i <= steps && ok; i += 1) {
    const t = i / steps;
    const nx = node.x + (ap.x - node.x) * t;
    const nz = node.z + (ap.z - node.z) * t;
    if (heightAt(nx, nz) <= WATER && ap.type !== "dock") {
      ok = false;
      firstBad = `sample ${i} is underwater`;
    }
    const y = heightAt(nx, nz);
    if (Math.abs(y - lastY) > 1.2) {
      ok = false;
      firstBad = `sample ${i} steps ${(y - lastY).toFixed(1)} m — a cliff between the node and the approach`;
    }
    const moved = moveAndSlide(px, pz, nx - px, nz - pz, MODE_RADIUS.horse, null, lastY);
    if (Math.hypot(moved.x - nx, moved.z - nz) > 0.05) {
      ok = false;
      firstBad = `sample ${i} is blocked by a collider`;
    }
    px = moved.x;
    pz = moved.z;
    lastY = y;
  }
  check(ok, `approach ${ap.id} cannot be walked from its graph node: ${firstBad} — the leg IS the arrival, not a decoration after the route`);
}

// --- rule 8: gate corridors are physically open ------------------------------
for (const ap of APPROACHES.filter((a) => a.type === "gate")) {
  const gate = gateByPoi.get(ap.poi);
  if (!check(gate, `gate approach ${ap.id} has no NAV_GATES entry — a gate without a corridor authoring is scenery`)) {
    continue;
  }
  // 0.7 * 3 = 2.0999…996 in FP: the epsilon stops a legal radius failing the
  // multiply it was authored against.
  check(ap.r <= gate.gapHalf * 0.7 + 1e-9,
    `gate approach ${ap.id} radius ${ap.r} exceeds 0.7 * gapHalf ${gate.gapHalf} — the region claims ground the posts own`);
  // The heading runs along travel; sweep the corridor perpendicular to it.
  const h = { x: -Math.sin(ap.face), z: Math.cos(ap.face) };
  const walkable = Math.floor(gate.gapHalf * 0.8 * 2);
  let open = true;
  for (let off = -walkable / 2; off <= walkable / 2; off += 0.5) {
    const cx = ap.x + h.x * off;
    const cz = ap.z + h.z * off;
    const y = heightAt(cx, cz);
    const walkClear = moveAndSlide(cx, cz, 0, 0, MODE_RADIUS.horse, null, y);
    if (Math.hypot(walkClear.x - cx, walkClear.z - cz) > 0.05 || heightAt(cx, cz) <= WATER) {
      open = false;
      break;
    }
  }
  check(open, `gate ${gate.id} corridor is not physically open at ${ap.id} — the drawn-but-collidered fiction (Fort Grant's shut leaves) must surface HERE, not on the trail`);
}

// --- rule 9: arrival self-consistency ---------------------------------------
for (const ap of APPROACHES) {
  for (const mode of ["walk", "horse"]) {
    const st = arrivalState(ap.poi, { x: ap.x, z: ap.z }, { mode });
    check(st.arrived, `standing on approach ${ap.id} (${mode}) does not arrive: ${st.reason} — arrivalState and the approach table disagree`);
  }
}
// The lake: at the POI centre arrival must refuse. That refusal is the whole
// point of the dock — a centre-arrival revert regresses exactly this.
const lakeCentre = arrivalState("lakeMercy", { x: POS.lakeMercy.x, z: POS.lakeMercy.z }, { mode: "walk" });
check(!lakeCentre.arrived, `Lake Mercy centre arrives (${lakeCentre.approachId}) — the dock approach stopped being shore-bound`);

// --- rule 10: every primary is reachable from spawn -------------------------
const spawn = { x: POS.ranch.x + 6, z: POS.ranch.z + 18 };
for (const p of Object.values(POS)) {
  const ap = primaryApproach(p.id);
  if (!ap) {
    continue;
  }
  const mode = ap.type === "door" || ap.type === "porch" ? "walk" : "horse";
  const route = routeTo(spawn.x, spawn.z, ap, mode);
  if (!check(route.status === "routed",
    `${p.id} is unreachable from spawn (${route.status}) via ${ap.id} — components: start=${route.component} blocked=${route.blocked.slice(0, 3).join(",")}`
  )) {
    continue;
  }
  check(route.waypoints.length >= 2 && route.length > 0, `route to ${p.id} carries no waypoints`);
}

// --- rule 11: the snap leg opens the route with a REAL step -------------------
// The pose→first-node leg is the one leg of a route A* never costs, so the
// nearest-node snap used to open routes whose first instruction walked the
// rider into a building (run 17: pinned inside the ranch barn, the route to
// the ranch gate opened at a stage node straight through its walls). Route
// openings from poses deliberately parked beside known mass must be legClear
// — the same 2 m sampling rule 6 demands between a node and its approach.
const { legClear: snapLegClear } = await import("../src/nav/costs.js");
const snapProbe = { x: POS.ranch.x - 26.9, z: POS.ranch.z + 25.6 };
const gateAp = primaryApproach("ranchGate") || Object.values(POS).map((p) => primaryApproach(p.id)).find((a) => a && /gate/i.test(a.id));
if (check(Boolean(gateAp), "no gate approach exists for the snap-leg probe")) {
  const snapRoute = routeTo(snapProbe.x, snapProbe.z, gateAp, "walk");
  check(snapRoute.status === "routed" && snapRoute.waypoints.length >= 1,
    `snap-leg probe: no route from (${snapProbe.x},${snapProbe.z}) to ${gateAp.id} (${snapRoute.status})`);
  const w0 = snapRoute.waypoints[0];
  if (w0) {
    // The opening waypoint may be behind a wall only if you can still WALK to it.
    check(snapLegClear(snapProbe.x, snapProbe.z, w0.x, w0.z, "walk"),
      `route from (${snapProbe.x},${snapProbe.z}) opens at (${w0.x.toFixed(0)},${w0.z.toFixed(0)}) through un-walkable ground — the snap leg is not collision-sampled`);
  }
}

if (failures.length) {
  console.error(failures.map((f) => "  - " + f).join("\n"));
  throw new Error(`check-approaches: ${failures.length} failure(s)`);
}
console.log(JSON.stringify({
  approaches: APPROACHES.length,
  places: Object.keys(POS).length,
  legSamples: checks.length,
  nodeEdges: g.edges.filter((e) => e.kind === "poi").length
}));
console.log("PASS");