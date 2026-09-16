/**
 * Authored trim buried inside kit geometry, computed rather than eyeballed.
 *
 * Twice now an authored facade has looked finished in Blender and shipped a
 * blank wall in the game, because the kit does not stop at the wall planes.
 * `falseFront` puts a board 0.4 m proud of the facade, a cap over its top, and
 * two returns 0.4 m proud of BOTH side walls over the full depth and height;
 * a `gable` overhangs the eaves; every lot has a foundation wider than its
 * walls. Trim drawn inside any of those renders in Blender and disappears in
 * the game, silently, with no error.
 *
 * The store lost a whole authoring pass to this and it was only caught by
 * looking at a screenshot. It is not a perceptual question -- it is arithmetic
 * on two boxes (HARD_WON 6: anything computable should be computed). This
 * walks every authored vertex against the kit's solid boxes in the lot's own
 * frame and fails when a batch is substantially buried.
 *
 * Scope and limits, stated rather than implied:
 *  - Kit ROOF groups are skipped. They are prisms, not boxes, and authored
 *    dormers and chimneys are *meant* to cut through the roof plane, so an
 *    AABB test there reports intentional intersection as a defect. Roof-plane
 *    seating is guarded per-building instead (check-hotel asserts the chimneys
 *    clear the ridge, and hotel.py seats dormers with roof_y()).
 *  - A vertex inside a kit box is not always invisible: it may be a member
 *    that deliberately passes through one. So this fails on the FRACTION
 *    buried, not on any single vertex.
 *  - A whole-batch fraction DILUTES a localized defect, and fault injection
 *    proved it: with the store's crown reverted to the facade plane, its
 *    `wood` batch went to 57% and failed, but `paint` reached only 16.6% and
 *    passed, because ~1300 correctly placed storefront vertices outvoted the
 *    buried crown. So each batch is also scored in 1 m height bands, and a
 *    band that is substantially buried fails on its own. The crown sits in
 *    y 5.8-9.5, where it is ~100% buried and impossible to outvote.
 */
import assert from "node:assert/strict";
import * as THREE from "three/webgpu";

globalThis.document = {
  createElement: () => ({
    width: 256,
    height: 256,
    getContext: () => new Proxy({}, { get: () => () => ({ addColorStop() {} }) })
  })
};

const { bakeHeightfield } = await import("../src/heightfield.js");
const { clearColliders } = await import("../src/collision.js");
const { createLandmarks, ENTERABLE_LOTS } = await import("../src/landmarks.js");
const { createInteriors } = await import("../src/interiors.js");

bakeHeightfield();
clearColliders();
const scene = new THREE.Scene();
createLandmarks(scene);
createInteriors(scene);
scene.updateMatrixWorld(true);

// name -> the authored group added by that building's attach*().
const AUTHORED = {
  sheriff: "sheriffRemodel",
  store: "generalStore",
  hotel: "hotelBuilding",
  saloon: "saloon"
};
// A batch is allowed to be this far buried before it counts as a defect.
// Nothing legitimate should approach it: the store's hidden crown was 100% and
// its buried side treatment 100%, while a correctly applied batch sits near 0.
const LIMIT = 0.25;
// A 1 m height band needs this many vertices before its fraction means
// anything -- a band holding four stray vertices is noise, not a defect.
const BAND_MIN = 40;
// Measured, not guessed. Healthy buildings sit at <=16% overall and <=42% in
// their worst band (the saloon's roof batch, whose tin genuinely meets the kit
// parapet). The store's injected crown bug read 57% overall / 96% in band
// y8-9. FAIL is set above the highest legitimate reading; WARN surfaces the
// middle ground rather than printing it as "ok", because the same injection
// put the store's `paint` field at 53% -- diagnostic, but not damning on its
// own, and it never occurs without a hard-failing batch beside it.
const BAND_LIMIT = 0.60;
const BAND_WARN = 0.45;
const BAND = 1.0;

const EPS = 0.012;
const report = [];
let failures = 0;

for (const [lotName, groupName] of Object.entries(AUTHORED)) {
  const lot = ENTERABLE_LOTS.find((l) => l.name === lotName);
  if (!lot) continue;
  const authored = lot.group.children.find((c) => c.name === groupName);
  if (!authored) {
    report.push({ lot: lotName, skipped: "no authored group attached" });
    continue;
  }

  // Kit solids in the lot's own frame. Anything under an object tagged `roof`
  // is excluded (see the note above).
  const inv = new THREE.Matrix4().copy(lot.group.matrixWorld).invert();
  const solids = [];
  const roofs = new Set();
  lot.group.traverse((o) => {
    if (o.userData.role === "roof") roofs.add(o);
  });
  const underRoof = (o) => {
    for (let p = o; p; p = p.parent) if (roofs.has(p)) return true;
    return false;
  };
  lot.group.traverse((o) => {
    if (!o.isMesh || underRoof(o)) return;
    // Authored geometry is not an occluder: neither the group under test nor an
    // authored interior. The store's interior was first counted as kit, and
    // because a batch's bounding box spans the whole room it "buried" the
    // display goods standing behind the glass.
    for (let p = o; p; p = p.parent) {
      if (p === authored || (p.parent === lot.group && /Interior$/.test(p.name))) return;
    }
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone();
    b.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    // Shrink by EPS so trim laid flush ON a kit face is not counted as inside
    // it; only genuinely enclosed geometry should register.
    b.expandByScalar(-EPS);
    if (b.isEmpty()) return;
    solids.push({ box: b, role: o.userData.role || "(untagged)" });
  });

  const v = new THREE.Vector3();
  for (const mesh of authored.children) {
    const pos = mesh.geometry.getAttribute("position");
    let buried = 0;
    const blame = new Map();
    const bands = new Map();   // band index -> [buried, total]
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i);
      const hit = solids.find((s) => s.box.containsPoint(v));
      const bi = Math.floor(v.y / BAND);
      const band = bands.get(bi) || [0, 0];
      band[1] += 1;
      if (hit) {
        buried += 1;
        band[0] += 1;
        blame.set(hit.role, (blame.get(hit.role) || 0) + 1);
      }
      bands.set(bi, band);
    }
    const frac = pos.count ? buried / pos.count : 0;
    // Worst height band with enough vertices to be meaningful.
    let worst = null;
    for (const [bi, [b, t]] of bands) {
      if (t < BAND_MIN) continue;
      const bf = b / t;
      if (!worst || bf > worst.frac) worst = { y: bi * BAND, frac: bf, buried: b, total: t };
    }
    const bandBad = worst && worst.frac > BAND_LIMIT;
    const bandWarn = worst && !bandBad && worst.frac > BAND_WARN;
    const row = {
      lot: lotName,
      batch: mesh.name.split(".")[1] || mesh.name,
      vertices: pos.count,
      buried,
      frac: +frac.toFixed(3),
      worst,
      bad: frac > LIMIT || bandBad,
      warn: bandWarn,
      inside: [...blame.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r}:${n}`)
    };
    report.push(row);
    if (row.bad) failures += 1;
  }
}

for (const row of report) {
  if (row.skipped) {
    console.log(`${row.lot.padEnd(9)} SKIP  ${row.skipped}`);
    continue;
  }
  const flag = row.bad ? "FAIL" : row.warn ? "WARN" : "ok  ";
  const w = row.worst
    ? `worst band y${String(row.worst.y).padStart(3)}-${row.worst.y + BAND}: ` +
      `${(row.worst.frac * 100).toFixed(0).padStart(3)}% (${row.worst.buried}/${row.worst.total})`
    : "";
  console.log(
    `${row.lot.padEnd(9)} ${row.batch.padEnd(7)} ${flag} ` +
    `${String(row.buried).padStart(6)}/${String(row.vertices).padEnd(6)} ` +
    `${(row.frac * 100).toFixed(1).padStart(5)}%  ${w.padEnd(34)} ${row.inside.join(" ") || "-"}`
  );
}

// ---------------------------------------------------------------------------
// The other direction: authored geometry COVERING the kit's openings.
//
// Burial is trim hidden inside the kit. This is the kit's own apertures hidden
// behind trim, and it is just as silent. Measured with the saloon's ray test,
// the hotel's entrance and all six of its windows were 0% clear: clapboard ran
// in full-width courses straight across every opening and a painted panel
// filled the doorway, so the door rendered shut and a window seen from inside
// looked onto the back of a board. The sheriff's doorway was filled the same
// way. The store and sheriff windows were blocked only by authored glass -- a
// third pane over openings the kit already glazes with two half-density panes.
//
// Method is check-saloon's grid -- 12 x 12 rays from 1.2 m outside, against
// the authored models only; glazing needs 80% clear (sash bars and muntins are
// allowed), doorways 100% -- with one deliberate change of reach. check-saloon
// runs its rays 0.6 m into the room, which conflates "the opening is covered"
// with "the room behind it has contents". A shop display is meant to sit just
// behind the glass, so that reach flags the store's goods as a blocked window.
// What hides an opening -- siding, a pane, a door slab -- lives in the wall
// zone, so here the rays stop 5 cm past the interior shell's inner face. Every
// real defect this has found (hotel clapboard at z 4.61, the sheriff's door
// slab at 4.26, authored panes) lies inside that zone. check-saloon keeps its
// own stricter reach.
const ray = new THREE.Raycaster();
const blocked = [];
const clearRows = [];
for (const [lotName, groupName] of Object.entries(AUTHORED)) {
  const lot = ENTERABLE_LOTS.find((l) => l.name === lotName);
  const st = lot?.group;
  const authored = st?.children.find((c) => c.name === groupName);
  if (!authored) continue;
  // Include an authored interior if the building has one: it can block the
  // view in through a window just as well.
  const models = [...authored.children];
  for (const c of st.children) {
    if (c !== authored && /Interior$/.test(c.name)) models.push(...c.children);
  }
  const inverse = st.matrixWorld.clone().invert();
  const dir = new THREE.Vector3(0, 0, -1).transformDirection(st.matrixWorld);
  const walls = [];
  st.traverse((o) => { if (o.userData.role === "wall") walls.push(o); });
  const wallAt = (sign) => walls.find((w) => w.userData.openings?.length &&
    Math.abs(inverse.clone().multiply(w.matrixWorld).elements[14] - sign * lot.d / 2) < 1e-3);
  const apertures = [];
  const front = wallAt(1);
  const back = wallAt(-1);
  if (front) apertures.push(...front.userData.openings.map((o) => ({ ...o, side: 1, wall: "front" })));
  // The back wall's frame faces -z: its opening x runs opposite the lot's.
  if (back) apertures.push(...back.userData.openings.map((o) => ({ ...o, x: -o.x, side: -1, wall: "back" })));

  for (const o of apertures) {
    let clear = 0;
    let total = 0;
    const floorY = 0.12;
    for (let i = 0; i < 12; i += 1) {
      for (let j = 0; j < 12; j += 1) {
        const fx = (i + 0.5) / 12;
        const fy = (j + 0.5) / 12;
        const y0 = Math.max(o.fromFloor, floorY);
        const h = o.h - Math.max(0, floorY - o.fromFloor);
        ray.set(
          new THREE.Vector3(o.x + o.w * (fx - 0.5), y0 + h * fy, o.side * (lot.d / 2 + 1.2)).applyMatrix4(st.matrixWorld),
          dir.clone().multiplyScalar(o.side)
        );
        // Outside (1.2) + the kit wall and interior shell (2 * 0.22) + 5 cm.
        ray.far = 1.2 + 0.44 + 0.05;
        total += 1;
        if (!ray.intersectObjects(models, false).length) clear += 1;
      }
    }
    const isDoor = o.fromFloor === 0 || o.class === "door";
    const need = isDoor ? 1 : 0.8;
    const ok = clear / total >= need;
    clearRows.push({ lot: lotName, wall: o.wall, x: o.x, ff: o.fromFloor, isDoor, clear, total, need, ok });
    if (!ok) blocked.push(`${lotName} ${o.wall} ${isDoor ? "door" : "window"} x=${o.x} ff=${o.fromFloor}`);
  }
}
console.log("\n-- apertures clear of authored geometry --");
for (const r of clearRows) {
  console.log(
    `${r.lot.padEnd(9)} ${r.wall.padEnd(5)} ${(r.isDoor ? "door" : "window").padEnd(6)} ` +
    `x=${String(r.x).padStart(6)} ff=${String(r.ff).padStart(4)}  ` +
    `${String(r.clear).padStart(3)}/${r.total} = ${(100 * r.clear / r.total).toFixed(0).padStart(3)}%  ` +
    `need ${r.need * 100}%  ${r.ok ? "ok" : "BLOCKED"}`
  );
}

const warned = report.filter((r) => r.warn).length;
if (warned) {
  console.log(`\n${warned} batch(es) WARN: a height band is over ${BAND_WARN * 100}% buried. ` +
    `Not a failure on its own -- check it is a member deliberately passing ` +
    `through kit geometry, not trim applied to the wrong face.`);
}
assert.equal(blocked.length, 0,
  `${blocked.length} kit opening(s) covered by authored geometry: ${blocked.join("; ")}. ` +
  `Cut siding and casings round the opening, and do not draw a pane over glazing the kit already provides`);
assert.equal(failures, 0,
  `${failures} authored batch(es) are buried inside kit geometry ` +
  `(over ${LIMIT * 100}% overall, or over ${BAND_LIMIT * 100}% within one ${BAND} m height band); ` +
  `apply the trim to the OUTER face of the kit part it dresses`);
console.log("PASS");
