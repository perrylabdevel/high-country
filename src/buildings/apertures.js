/**
 * Canonical aperture registry — every door and window in the playable world.
 *
 * See docs/HIGH_COUNTRY_DOORS_WINDOWS_VERIFICATION_HANDOFF.md: there is exactly
 * one inventory, and it is derived, never typed. `enumerateApertures()` walks
 * the structures actually built (kit.js's STRUCTURES registry — the same
 * hierarchy check-buildings inspects and mergeStatic hides rather than
 * frees), turns each wall opening into a record, and attaches what was mated
 * into that opening: door leaves, glazing, collider gaps. Nothing downstream —
 * the deterministic checks, the aperture capture mode, the traversal probes,
 * the verify report — builds its own list.
 *
 * An aperture id is stable per build: `<structure>.<side>.<kind>.<n>`, where
 * the side is the named face the wall was mated to ("front", "back", "left",
 * "right", "partition.west", ...) and n counts within that side in build
 * order. Apertures that exist outside any wall group (gate gaps in fence or
 * fort walls, mine adits cut into colliders directly) register themselves at
 * the construction site — still generator data, still one list.
 */

import * as THREE from "three/webgpu";
import { STRUCTURES } from "./kit.js";
import { worldAnchor } from "./anchors.js";
import { placeAt } from "../map.js";
import { resolvePosition } from "../collision.js";

/** Every resolved aperture in the current build. */
export const APERTURES = [];

export function clearApertures() {
  APERTURES.length = 0;
}

/**
 * The opening's class. Same rule the ?dev look-at overlay uses, with the
 * declared class winning: barn doors (and bays) are wide by design.
 */
export function apertureKind(o) {
  if (o.class) {
    return o.class;
  }
  if ((o.w || 0) >= 2.8) {
    return "barn";
  }
  if ((o.fromFloor || 0) >= 0.5) {
    return "window";
  }
  return "door";
}

/**
 * Resolve one mated wall's openings into world-space aperture records.
 * `side` comes from the mate record (the named face the wall plugged into);
 * walls mated to anything else (partitions, interior shells) carry that
 * socket's own name.
 */
function aperturesFromWall(structure, wall) {
  const out = [];
  const openings = wall.userData.openings || [];
  if (!openings.length) {
    return out;
  }
  const mates = wall.userData.mates || [];
  // wallSide's normal is (0, 0, -1); mate() set it against the parent face's
  // outward normal, so the wall's +Z is the exterior direction no matter
  // which face the wall was hung from.
  wall.updateMatrixWorld(true);
  for (let i = 0; i < openings.length; i += 1) {
    const o = openings[i];
    const socket = `opening.${i}`;
    const anchor = worldAnchor(wall, socket);
    // The wall hangs from ONE named face. That name lives on the OWNER's
    // mate records (the wall is the child there), not on the wall's own
    // mates — the wall's own mates are the door leaves and glazing that
    // plugged INTO it. Prefer a face.* socket so the id is the name a person
    // would use; partition and shell sockets keep their own names.
    let side = null;
    let owner = structure;
    while (owner) {
      for (const m of owner.userData.mates || []) {
        if (m.child === wall) {
          if (m.socket.startsWith("face.")) {
            side = m.socket.slice(5);
            break;
          }
          side = side ?? m.socket;
        }
      }
      if (side != null) {
        break;
      }
      owner = owner.parent;
    }
    if (side == null) {
      side = "unmated";
    }
    const kind = apertureKind(o);
    out.push({
      id: null, // assigned after counting, below
      structure: structure.userData.name,
      structureRef: structure,
      side,
      kind,
      class: o.class || null,
      width: o.w,
      height: o.h,
      fromFloor: o.fromFloor || 0,
      // Aperture centre at mid-height; normal points to the exterior.
      center: new THREE.Vector3(anchor.position.x, anchor.position.y + o.h / 2, anchor.position.z),
      normal: anchor.normal.clone(),
      wallRef: wall,
      leaf: null,
      glass: null
    });
  }
  // Attachments: door leaves and glazing mated into these sockets.
  for (const m of mates) {
    const idx = Number(m.socket.slice("opening.".length));
    if (!Number.isInteger(idx) || idx >= out.length) {
      continue;
    }
    const role = m.child?.userData?.role;
    if (role === "door") {
      out[idx].leaf = {
        width: m.child.userData.width,
        height: m.child.userData.height,
        hinge: m.child.userData.hinge,
        swing: m.child.children[0]?.rotation.y || 0,
        ref: m.child
      };
    } else if (role === "window") {
      out[idx].glass = {
        width: m.child.userData.width,
        height: m.child.userData.height,
        ref: m.child
      };
    }
  }
  return out;
}

let enumerated = false;

/**
 * Apertures that exist outside any kit wall group — a painted door leaf on a
 * sealed adobe wall, a gate gap between two posts, a mine adit — register
 * here at the construction site. Same record shape as the derived ones, plus
 * two required declarations the derived ones can infer:
 *   state: what the opening is intended to let a player do
 *     ("traversable" | "facade" | "facade-visual")
 *   note: one line of why this opening is sealed, if it is.
 * Registering a painted, sealed door WITHOUT `note` is the lint that keeps
 * "relabel the entrance decorative" from becoming the silent fix.
 */
const DECLARED = [];

export function registerAperture(spec) {
  DECLARED.push({ ...spec, kind: spec.kind || apertureKind(spec) });
  enumerated = false;
}

/**
 * Walk every built structure and produce the aperture inventory.
 * Call after the world is built and mated; re-calling after
 * clearStructures() + a rebuild is the supported path (it rebuilds IDs too).
 */
export function enumerateApertures() {
  if (enumerated) {
    return APERTURES;
  }
  clearApertures();
  const counts = new Map();
  for (const structure of STRUCTURES) {
    structure.updateMatrixWorld(true);
    for (const wall of collectWalls(structure)) {
      for (const ap of aperturesFromWall(structure, wall)) {
        const key = `${ap.structure}.${ap.side}.${ap.kind}`;
        const n = counts.get(key) || 0;
        counts.set(key, n + 1);
        ap.id = `${key}.${n}`;
        // Intended state, inferred from what was constructed: gates and the
        // wide passage classes are passages; a door belongs to a habitable
        // structure or it is a facade — and a facade door is an explanation
        // the verify report must carry, not an inference the collider makes.
        // Windows are never passages: their contract is glass-in-wall.
        ap.state =
          ap.kind === "window"
            ? "window"
            : ap.kind === "gate" || ap.kind === "barn" || ap.kind === "bay" || structure.userData.habitable
              ? "traversable"
              : "facade";
        ap.note = null;
        // Explicit declarations from the table below override the inference —
        // a structure may declare its dressing doors "shell" (walk-through,
        // no interior) with the reason, still in the canonical inventory.
        // Scope: door-kind only — gates, barns and bays are passages by
        // class and never take a structure's dressing declaration.
        const declared = ap.kind === "door" ? APERTURE_DECLARATIONS[ap.structure] : null;
        if (declared) {
          if (declared.state) {
            ap.state = declared.state;
          }
          if (declared.note && ap.state !== "traversable") {
            ap.note = declared.note;
          }
        }
        const place = placeAt(ap.center.x, ap.center.z);
        ap.poi = place ? place.id : null;
        if (ap.leaf?.ref) {
          ap.leaf.ref.userData.aperture = ap.id;
        }
        if (ap.glass?.ref) {
          ap.glass.ref.userData.aperture = ap.id;
        }
        APERTURES.push(ap);
      }
    }
  }
  enumerated = true;
  // Declared apertures: id counting shares the same `${structure}.${side}.${kind}` space.
  for (const spec of DECLARED) {
    const key = `${spec.structure}.${spec.side}.${spec.kind}`;
    const n = counts.get(key) || 0;
    counts.set(key, n + 1);
    const place = placeAt(spec.x, spec.z);
    const ap = {
      id: `${key}.${n}`,
      structure: spec.structure,
      structureRef: null,
      side: spec.side,
      kind: spec.kind,
      class: spec.class || null,
      width: spec.w,
      height: spec.h,
      fromFloor: spec.fromFloor || 0,
      center: new THREE.Vector3(spec.x, spec.y, spec.z),
      normal: new THREE.Vector3(spec.nx ?? 0, 0, spec.nz ?? 1),
      wallRef: null,
      leaf: spec.leaf || null,
      glass: null,
      // Declared intended state: the contract the runtime must match.
      state: spec.state || "facade",
      note: spec.note || null
    };
    ap.poi = place ? place.id : null;
    APERTURES.push(ap);
  }
  return APERTURES;
}

/** Test hook: a rebuilt world re-enumerates and gets fresh ids. */
export function resetApertureEnumeration() {
  enumerated = false;
  clearApertures();
  DECLARED.length = 0;
}

/**
 * Declared intended states for structures whose doors are dressing —
 * inventory data co-located with the registry, not a downstream copy.
 *
 *   facade: sealed dressing; the opening passes nothing. note = why.
 *   shell:  the opening is walk-through but leads to an open dressing shell,
 *           not an interior. note = why.
 *
 * A structure name here must name a real blockout; the check fails any sealed
 * or shell door whose structure has no entry here, and fails any declaration
 * whose door's runtime truth moved under it — a wall that stopped being solid
 * is a geometry change, not a comment change.
 */
export const APERTURE_DECLARATIONS = {
  timberCabin: { state: "shell", note: "timber-camp cabin dressing — south door enters an open shell, no interior room" },
  elPasoCasa: { state: "shell", note: "El Paso Verde facade house — walk-through shell, no interior room" },
  elPasoTwoStory: { state: "shell", note: "El Paso Verde facade house — walk-through shell, no interior room" },
  elPasoCasita: { state: "shell", note: "El Paso Verde facade house — walk-through shell, no interior room" },
  elPasoStore: { state: "shell", note: "El Paso Verde facade house — walk-through shell, no interior room" },
  elPasoShed: { state: "shell", note: "El Paso Verde facade house — walk-through shell, no interior room" }
};

function collectWalls(structure) {
  const walls = [];
  structure.traverse((node) => {
    if (node.userData?.role === "wall" && (node.userData.openings || []).length) {
      walls.push(node);
    }
  });
  return walls;
}

/**
 * Traversal truth, measured at runtime — the same collision query the player
 * walks through. A standing-body circle passed through the aperture's centre
 * line must not be displaced by any collider for the door to count traversable.
 * `y` is the aperture's sill height so store-front lifts and decks resolve
 * against the colliders that actually apply there.
 */
export function apertureTraversable(ap, bodyRadius = 0.42) {
  const y = ap.center.y - (ap.leaf?.height ?? ap.height) / 2 + 0.9;
  const cx = ap.center.x - ap.normal.x * 0.6;
  const cz = ap.center.z - ap.normal.z * 0.6;
  const into = {
    x: ap.center.x + ap.normal.x * 0.6,
    z: ap.center.z + ap.normal.z * 0.6
  };
  // Walk the line the player walks: outside -> centre -> inside.
  const at = (x, z) => {
    const r = resolvePosition(x, z, bodyRadius, null, y);
    return Math.hypot(r.x - x, r.z - z) < 0.05;
  };
  return at(ap.center.x, ap.center.z) && at(into.x, into.z) && at(cx, cz);
}