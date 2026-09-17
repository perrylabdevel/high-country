import * as THREE from "three/webgpu";
import { color } from "three/tsl";
import model from "../models/church.json";
import interiorModel from "../models/church-interior.json";
import { batched } from "./ranchRemodel.js";
import { block } from "./kit.js";
import { mate, anchorsOf } from "./anchors.js";
import { addDeckPlatform, addOrientedBoxCollider } from "../collision.js";
import { makeTexturedMat } from "../materials/texturedMat.ts";
import { addLocalPropSpot } from "../propSpots.js";

/**
 * Lot-local contract for the Blender-authored church. The kit in landmarks.js
 * stays the source of truth for the 8 x 8 shell, the gable roof, the steeple
 * and the apertures; this detail layer adds the applied trim, the window
 * tracery, the steeple dressing and the whole interior.
 *
 * Measured off the built lot, because applied trim has to go outside the kit
 * part it dresses: the exterior wall faces are at 4.11, the interior shell's
 * inner face at 3.78, the eave at 7.20, the ridge at 9.42 over z = 0 (the
 * ridge runs along x, so the gable ends face +/-x), and the kit steeple is a
 * 1.4 m tower from 7.20 to 11.70 centred on (4.00, 0), with its spire to 13.90.
 */
export const CHURCH = {
  model: "scripts/blender-church/church.py",
  footprint: { w: 8, d: 8 },
  WALL: 4.11,
  EAVE: 7.20,
  RIDGE: 9.42,
  ROOF_HALF: 4.45,
  STEEPLE: { x: 4.00, z: 0, half: 0.70, base: 7.20, top: 11.70, spire: 13.90 },

  // The nave had no window at all: a single door in a 7.2 m wall. Lancets
  // flank the door and one stands behind the altar. The kit only glazes an
  // opening whose sill is at or above 0.5, and the head has to clear the
  // ceiling.
  frontWindows: [
    { x: -2.40, w: 0.90, h: 2.00, fromFloor: 0.90 },
    { x: 2.40, w: 0.90, h: 2.00, fromFloor: 0.90 }
  ],
  // The chancel light stops at 2.65 so the cross clears its head under the
  // 3.2 m ceiling; the blind side lights stop at 2.40 so their arched heads
  // are inside the room rather than above the ceiling boards.
  backWindows: [{ x: 0, w: 1.10, h: 1.70, fromFloor: 0.95 }],
  /** Blind lancets on the gable-end walls, which the kit cannot open. */
  sideWindows: [-1.30, 1.30],
  SIDE_WINDOW: { w: 0.90, h: 1.50, fromFloor: 0.90 },

  // One storey. The kit would cap a habitable shell at 2.7; a nave under a
  // 7.2 m eave takes the 3.2 the ceiling invariant allows, on exposed tie
  // beams. `storeys` is what makes the kit stand back and let this file lay
  // the floor deck and the ceiling (check-interiors reads the floor top from
  // SALOON.FLOOR for a lot with storeys, which is this 0.10).
  FLOOR: 0.10,
  CEIL: 3.20,
  TIE: 2.86,
  INNER: { x: 3.78, z: 3.78 },
  DOOR: { w: 0.9, h: 2.1 },

  // Pews either side of a centre aisle, running back from the entry.
  AISLE: 1.30,
  PEW: { x: 1.78, z0: -1.30, rows: 5, pitch: 0.95, halfX: 0.93, halfZ: 0.27 },
  // The chancel: an altar against the back wall, a pulpit and lectern either
  // side, and a rail across the nave with a gate on the aisle. The floor stays
  // flat -- check-interiors samples 25 points and wants the deck at the floor
  // top, so a raised chancel platform would read as a hole in the floor.
  RAIL: { z: -2.15, gate: 1.10, x: 3.60, h: 0.86 },
  ALTAR: { x: 0, z: -3.10 },
  PULPIT: { x: 1.70, z: -2.55 },
  LECTERN: { x: -1.70, z: -2.55 },
  STOVE: null,
  /** The bell rope falls through a ceiling hatch under the steeple. */
  BELL_ROPE: { x: 3.15, z: 0.0 }
};

function mat(base, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color: base, roughness: 0.88, ...extra });
}

/**
 * Batch materials for the authored exterior. Near-neutral bases: the per-face
 * tints carry the whole paint scheme, and a saturated base multiplies twice.
 */
function tinted(maps) {
  const hasMaps = Boolean(maps?.wood && maps?.siding && maps?.rock && maps?.roof);
  // Whitewash, not bare board. Gain alone cannot do it: the siding texture is
  // brown, so a near-white tint over it still multiplies down to weathered
  // plank -- the first pass read as a barn with a steeple on it. The interiors
  // already solve this, so the painted batches borrow their method and keep
  // the texture only as grain over a near-white base.
  const painted = (set, grain, gain, rough) => {
    if (!hasMaps) return mat(0xf0eee9, { roughness: rough });
    const m = makeTexturedMat(set, { tiling: 1.45, tint: 0xffffff, gain, rough });
    m.colorNode = m.colorNode.mul(grain).add(color(0xf4f1ea).mul(1 - grain));
    return m;
  };
  return {
    paint: painted(maps?.siding, 0.42, 1.9, 0.88),
    wood: painted(maps?.wood, 0.36, 1.9, 0.9),
    stone: hasMaps
      ? makeTexturedMat(maps.rock, { tiling: 2.2, tint: 0xf2ecdf, gain: 1.2, rough: 0.95 })
      : mat(0xdbd4c4),
    roof: hasMaps
      ? makeTexturedMat(maps.roof, { tiling: 1.4, tint: 0xf0f0e8, gain: 1.05, rough: 0.82 })
      : mat(0xccccc3),
    iron: mat(0x9ea3a1, { metalness: 0.6, roughness: 0.45 }),
    // The glass batch carries the coloured glazing, so it keeps its tints.
    glass: mat(0xb9c6c2, { transparent: true, opacity: 0.55, metalness: 0.1, roughness: 0.2 })
  };
}

function lotFrame(lot) {
  const g = lot.group;
  g.updateWorldMatrix(true, false);
  const yaw = new THREE.Euler().setFromQuaternion(g.getWorldQuaternion(new THREE.Quaternion()), "YXZ").y;
  const p = new THREE.Vector3();
  const py = g.userData.placementY;
  const at = (x, z) => g.localToWorld(p.set(x, 0, z));
  return {
    py,
    box(x0, x1, z0, z1, span = null) {
      const c = at((x0 + x1) / 2, (z0 + z1) / 2);
      addOrientedBoxCollider(c.x, c.z, (x1 - x0) / 2, (z1 - z0) / 2, -yaw,
        span && { minY: py + span[0], maxY: py + span[1] });
    },
    deck(x0, x1, z0, z1, y) {
      const c = at((x0 + x1) / 2, (z0 + z1) / 2);
      addDeckPlatform(c.x, c.z, (x1 - x0) / 2, (z1 - z0) / 2, -yaw, py + y, py + y);
    }
  };
}

/** Add the Blender-authored church exterior to the procedural town lot. */
export function attachChurch(lot, maps) {
  const group = batched("church", model, tinted(maps));
  lot.group.add(group);
  return group;
}

/**
 * Interior batch materials: the saloon's, hotel's, store's and sheriff's, so
 * walking between them crosses no material cliff.
 */
function interiorMaterials(maps) {
  const hasMaps = Boolean(maps?.wood && maps?.siding && maps?.rock);
  const neutral = (set, grain, rough) => {
    if (!hasMaps) return new THREE.MeshStandardNodeMaterial({ color: 0xe8e2d6, roughness: rough });
    const m = makeTexturedMat(set, { tiling: 1.6, tint: 0xffffff, gain: 1.4, rough });
    m.colorNode = m.colorNode.mul(grain).add(color(0xf2eee6).mul(1 - grain));
    return m;
  };
  const wood = hasMaps
    ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xf0dcc0, gain: 1.9 })
    : new THREE.MeshStandardNodeMaterial({ color: 0xb09070, roughness: 0.9 });
  return {
    paint: neutral(maps?.siding, 0.32, 0.86),
    floor: wood,
    timber: hasMaps
      ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xcfa06a, gain: 1.6, rough: 0.9 })
      : new THREE.MeshStandardNodeMaterial({ color: 0x6b4226, roughness: 0.9 }),
    fabric: neutral(maps?.siding, 0.35, 1),
    brass: new THREE.MeshStandardNodeMaterial({ color: 0xb58a42, roughness: 0.35, metalness: 0.85 }),
    iron: new THREE.MeshStandardNodeMaterial({ color: 0xd8d8d2, roughness: 0.5, metalness: 0.45 }),
    // Coloured glazing: near-white so the authored tints carry the colour.
    glass: new THREE.MeshStandardNodeMaterial({ color: 0xc8d2ce, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55 })
  };
}

/**
 * The nave and chancel, in the lot's own frame. Replaces the procedural props:
 * an altar, a pulpit and four pews under a 2.7 m shop ceiling.
 */
export function churchInterior(lot, maps, slabMaterial) {
  const { FLOOR, CEIL, INNER, PEW, RAIL, ALTAR, PULPIT, LECTERN } = CHURCH;
  const g = lot.group;
  const X = INNER.x;
  const Z = INNER.z;

  // The ceiling slab: the kit stands back for a lot with storeys, so this file
  // lays it. A degenerate well and an upper floor out of reach keep
  // interiorCeilingAt answering CEIL everywhere inside.
  const slab = block({ w: X * 2, h: 0.08, d: Z * 2, material: slabMaterial, role: "ceiling", extra: { height: CEIL } });
  mate(slab, "base", anchorsOf(g).get("footing"), { offset: { x: 0, y: CEIL, z: 0 } });
  g.userData.storeys = { ceiling: CEIL, upperFloor: 99, upperCeiling: CEIL, well: [0, 0, 0, 0] };

  const f = lotFrame(lot);
  f.deck(-X, X, -Z, Z + 0.33, FLOOR);

  const low = [-1, CEIL];
  // The altar rail, open at the gate on the aisle.
  for (const [x0, x1] of [[-RAIL.x, -RAIL.gate / 2], [RAIL.gate / 2, RAIL.x]]) {
    f.box(x0, x1, RAIL.z - 0.06, RAIL.z + 0.06, [-1, FLOOR + RAIL.h]);
  }
  f.box(ALTAR.x - 1.1, ALTAR.x + 1.1, ALTAR.z - 0.42, ALTAR.z + 0.42, low);
  f.box(PULPIT.x - 0.46, PULPIT.x + 0.46, PULPIT.z - 0.46, PULPIT.z + 0.46, low);
  f.box(LECTERN.x - 0.34, LECTERN.x + 0.34, LECTERN.z - 0.30, LECTERN.z + 0.30, low);

  const group = batched("churchInterior", interiorModel, interiorMaterials(maps));
  g.add(group);

  const put = (kind, x, z, yaw = 0, extra = {}) => addLocalPropSpot("interiors", g, kind, x, FLOOR, z, yaw, extra);
  // Pews either side of the aisle, facing the chancel (-z, so yaw PI).
  for (let row = 0; row < PEW.rows; row += 1) {
    const z = PEW.z0 + row * PEW.pitch;
    for (const side of [-1, 1]) {
      put("pew", side * PEW.x, z, Math.PI);
      f.box(side * PEW.x - PEW.halfX, side * PEW.x + PEW.halfX, z - PEW.halfZ, z + PEW.halfZ, low);
    }
  }
  put("altar_table", ALTAR.x, ALTAR.z, 0);
  put("pulpit", PULPIT.x, PULPIT.z, -0.3);
  return group;
}
