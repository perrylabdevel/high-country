/**
 * Aperture invariants (docs/HIGH_COUNTRY_DOORS_WINDOWS_VERIFICATION_HANDOFF.md).
 *
 * Reads the canonical inventory from src/buildings/apertures.js — every
 * opening the world actually builds, plus every declared facade door — and
 * asserts per-aperture, with each failure naming its aperture id. Nothing in
 * this file constructs geometry or re-derives the list.
 *
 * Intended-state contract: a "traversable" aperture must pass the same
 * collision query the player walks (closed line through the aperture plane);
 * a "facade" aperture must be sealed AND carry a note — a sealed entrance
 * without an explanation is exactly the silently-relabelled-entrance defect.
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

import { writeFileSync, mkdirSync } from "node:fs";

const { bakeHeightfield } = await import("../src/heightfield.js");
const { clearStructures } = await import("../src/buildings/kit.js");
const { clearColliders } = await import("../src/collision.js");
const { createRanch } = await import("../src/buildings.js");
const { createLandmarks } = await import("../src/landmarks.js");
const { createInteriors } = await import("../src/interiors.js");
const { createShore } = await import("../src/shore.js");
const { createIndustry } = await import("../src/industry.js");
const { createHomestead } = await import("../src/homestead.js");
const {
  enumerateApertures,
  resetApertureEnumeration,
  apertureTraversable
} = await import("../src/buildings/apertures.js");

let failures = 0;
const results = [];
const fail = (ap, rule, detail) => {
  failures += 1;
  results.push({ id: ap.id, rule, status: "FAIL", detail });
  const line = `FAIL [${ap.id}] ${rule}: ${detail}`;
  console.log(line);
};

bakeHeightfield();
clearStructures();
clearColliders();
const scene = { add() {}, remove() {} };
resetApertureEnumeration();
createRanch();
createLandmarks(scene);
createInteriors(scene);
createShore(scene);
createIndustry(scene);
createHomestead(scene);
const apertures = enumerateApertures();

if (apertures.length === 0) {
  console.log("FAIL inventory empty: enumerateApertures() returned nothing");
  process.exit(1);
}
console.log(`inventory: ${apertures.length} apertures`);

const seenIds = new Set();
const DOOR_W = [0.85, 1.1];
const DOOR_H = [1.95, 2.2];
const BARN_W = [3.0, 3.7];
const BARN_H = [3.5, 4.3];
const BAY_W = [2.0, 3.0];
const BAY_H = [2.4, 3.2];

function dimsOk(ap, [loW, hiW], [loH, hiH]) {
  if (ap.width < loW || ap.width > hiW) {
    return `width ${ap.width.toFixed(2)} outside [${loW}, ${hiW}]`;
  }
  if (ap.height < loH || ap.height > hiH) {
    return `height ${ap.height.toFixed(2)} outside [${loH}, ${hiH}]`;
  }
  return null;
}

for (const ap of apertures) {
  // 1. Classified: every aperture attributes to a POI, has unique stable id.
  if (!ap.poi) {
    fail(ap, "classified", "no POI attribution (placeAt returned null)");
  }
  if (seenIds.has(ap.id)) {
    fail(ap, "classified", `duplicate id`);
  }
  seenIds.add(ap.id);

  // 2. Human scale, per class.
  if (ap.kind === "door") {
    const bad = dimsOk(ap, DOOR_W, DOOR_H);
    if (bad) {
      fail(ap, "human-scale", bad);
    }
  } else if (ap.kind === "barn") {
    const bad = dimsOk(ap, BARN_W, BARN_H);
    if (bad) {
      fail(ap, "human-scale", bad);
    }
  } else if (ap.kind === "bay") {
    const bad = dimsOk(ap, BAY_W, BAY_H);
    if (bad) {
      fail(ap, "human-scale", bad);
    }
  }

  // 3. Aperture inside its wall's length, at a sane height band.
  const wall = ap.wallRef;
  if (wall) {
    const length = wall.userData.length;
    if (Number.isFinite(length) && ap.width > length) {
      fail(ap, "wall-fit", `opening ${ap.width} wider than wall ${length}`);
    }
  }

  // 4. Window placement: ground-floor sills sit in the 0.8-1.2 band; upper
  // storeys (sill above 1.2) still must keep their head under the eave. Glass
  // distinct from the hole: a glazing pane is mated into the opening.
  if (ap.kind === "window" && wall) {
    if (ap.fromFloor < 0.8 || ap.fromFloor > 1.2) {
      // An upper storey is only a story if the house has the walls for one.
      const structure = ap.structureRef;
      const eave = structure ? structure.userData.eave - structure.userData.lift : 0;
      if (!(ap.fromFloor >= 2.6 && ap.fromFloor + ap.height <= eave + 0.01)) {
        fail(ap, "window-placement", `sill ${ap.fromFloor.toFixed(2)} outside [0.8, 1.2] and not on a real upper storey`);
      }
    }
    const structure = ap.structureRef;
    if (structure) {
      const eave = structure.userData.eave + structure.userData.placementY;
      const head = ap.center.y + ap.height / 2;
      if (head > eave + 0.01) {
        fail(ap, "window-placement", `head ${head.toFixed(2)} above eave ${eave.toFixed(2)}`);
      }
    }
    if (!ap.glass) {
      fail(ap, "glass-distinct", "no glazing pane mated into the opening (hole without glass)");
    }
  }

  // 5. Door leaf fits its opening and hangs off the sill line.
  if (ap.kind === "door" && ap.leaf) {
    if (ap.leaf.width + 0.10 < ap.width) {
      fail(ap, "leaf-fit", `leaf ${ap.leaf.width} narrower than opening ${ap.width}`);
    }
    if (Math.abs(ap.leaf.height - ap.height) > 0.35) {
      fail(ap, "leaf-fit", `leaf height ${ap.leaf.height} differs from opening ${ap.height} by >0.35`);
    }
  }

  // 5b. leaf pose must agree with intended state. There is no door-interaction
  // system: a leaf hung shut is a door a player cannot open, so an opening the
  // colliders leave open must PRESENT open or it presents as a wall someone
  // has to phase through (the barn front and blacksmith bay both shipped this
  // way). Facade leaves are dressing and may hang either way.
  if (ap.state === "traversable" && ap.leaf && Math.abs(ap.leaf.swing) < 0.4) {
    fail(ap, "leaf-pose", `traversable opening's leaf hangs shut (swing ${ap.leaf.swing.toFixed(2)}) — no interaction system can open it`);
  }

  // 6. Intended state vs runtime truth.
  const trav = apertureTraversable(ap);
  ap.traversable = trav;
  if (ap.state === "traversable" && !trav) {
    fail(ap, "state-runtime", "declared traversable but a body circle is blocked in the opening");
  }
  if ((ap.state === "facade" || ap.state === "window") && trav) {
    fail(ap, "state-runtime", `${ap.state} but the opening is walk-through (mismatch)`);
  }
  if (ap.state === "shell" && !trav) {
    fail(ap, "state-runtime", "declared walk-through shell but the opening is blocked (mismatch)");
  }
  if ((ap.state === "facade" || ap.state === "shell") && !ap.note) {
    fail(ap, "facade-declared", "sealed or shell opening with no explanation — every such entrance needs its reason in the inventory");
  }
}

const ok = failures === 0;
const summary = {
  total: apertures.length,
  byKind: apertures.reduce((acc, a) => ((acc[a.kind] = (acc[a.kind] || 0) + 1), acc), {}),
  byState: apertures.reduce((acc, a) => ((acc[a.state] = (acc[a.state] || 0) + 1), acc), {}),
  failures,
  results: results.map((r) => r.id)
};
try {
  mkdirSync("audit/evidence", { recursive: true });
  writeFileSync("audit/evidence/apertures-inventory.json", JSON.stringify({
    summary: {
      total: summary.total, byKind: summary.byKind, byState: summary.byState, failures
    },
    apertures: apertures.map((a) => ({
      id: a.id, poi: a.poi, kind: a.kind, class: a.class, side: a.side,
      width: a.width, height: a.height, fromFloor: a.fromFloor,
      state: a.state, note: a.note, traversable: a.traversable,
      leaf: a.leaf ? { width: a.leaf.width, height: a.leaf.height, swing: a.leaf.swing } : null,
      glass: a.glass ? { width: a.glass.width, height: a.glass.height } : null,
      center: { x: +a.center.x.toFixed(2), y: +a.center.y.toFixed(2), z: +a.center.z.toFixed(2) },
      normal: { x: a.normal.x, y: a.normal.y, z: a.normal.z }
    }))
  }, null, 2));
} catch (err) {
  console.log(`evidence write skipped: ${err.message}`);
}
console.log(JSON.stringify(summary.byState ? { total: summary.total, byKind: summary.byKind, byState: summary.byState, failures: summary.failures } : summary));
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);