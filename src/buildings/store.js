import * as THREE from "three/webgpu";
import { color } from "three/tsl";
import model from "../models/general-store.json";
import interiorModel from "../models/general-store-interior.json";
import { batched } from "./ranchRemodel.js";
import { block } from "./kit.js";
import { mate, anchorsOf } from "./anchors.js";
import { addDeckPlatform, addOrientedBoxCollider } from "../collision.js";
import { makeTexturedMat } from "../materials/texturedMat.ts";
import { addLocalPropSpot } from "../propSpots.js";

/**
 * Lot-local contract for the Blender-authored general store exterior. The kit
 * in landmarks.js stays the source of truth for the 9.5 x 8 shell, the shed
 * roof, the false front and the apertures; this detail layer adds only visual
 * trim plus the awning posts and the goods standing on the boardwalk.
 *
 * `frontWindows` must match the display windows the authoring script frames:
 * the glass runs from the sill at 0.89 to the head at 2.62 (store.py BULK and
 * HEAD), and the aperture has to be at or above 0.5 or the kit declines to
 * glaze it at all.
 */
export const STORE = {
  model: "scripts/blender-store/store.py",
  footprint: { w: 9.5, d: 8 },
  frontWindows: [
    { x: -2.75, w: 2.40, h: 1.73, fromFloor: 0.89 },
    { x: 2.75, w: 2.40, h: 1.73, fromFloor: 0.89 }
  ],
  awningPosts: [{ x: -4.20, z: 5.81 }, { x: 4.20, z: 5.81 }],
  awningHeight: 2.56,
  /** Crates, kegs and sacks the shop keeps out under the awning. */
  boardwalkGoods: [
    { x: -4.03, z: 4.73, halfX: 0.34, halfZ: 0.34, top: 0.86 },
    { x: -3.37, z: 4.69, halfX: 0.32, halfZ: 0.32, top: 0.80 },
    { x: 3.95, z: 4.71, halfX: 0.33, halfZ: 0.28, top: 0.80 },
    { x: 3.03, z: 4.67, halfX: 0.36, halfZ: 0.26, top: 0.62 }
  ],
  /** The stepped display nooks standing just inside the window glass. */
  displayNooks: [
    // Behind the interior shell's inner face (z 3.78), not in the wall's
    // reveal: store.py sets the display zf = 3.73, zb = 3.17.
    { x: -2.75, z: 3.45, halfX: 1.14, halfZ: 0.30 },
    { x: 2.75, z: 3.45, halfX: 1.14, halfZ: 0.30 }
  ],
  displayTop: 2.62,

  // The storeys. The facade has always carried a loft door and a hoist beam at
  // y 4.06-5.62, over a void the kit left empty: a 2.7 m shop ceiling and
  // nothing above it until the roof's flat underside at 5.74. There is now a
  // storage loft behind that door. The section is the saloon's and the hotel's
  // (ceiling within check-buildings' 2.3-3.2 invariant); the loft ceiling sits
  // just under the kit roof. Every number is asserted in check:store.
  FLOOR: 0.10,
  CEIL: 3.20,
  UPPER: 3.44,
  UPPER_CEIL: 5.62,
  INNER: { x: 4.53, z: 3.78 },
  // 18 risers of 185.6 mm up the west wall, climbing toward the street, clear
  // of the west display nook; landings 1.36 m at the foot and 1.78 m at the top.
  STAIR: { x0: -4.53, x1: -3.53, z0: -2.42, z1: 2.0, risers: 18, well: [-4.53, -3.53, -1.11, 2.0] },
  // A walkable loft has an open well edge: a rail along the well's east side
  // and across its back end. The front end is the stair top.
  LOFT_RAIL: [
    { x0: -3.59, x1: -3.47, z0: -1.11, z1: 2.0 },
    { x0: -4.53, x1: -3.47, z0: -1.17, z1: -1.05 }
  ],
  // A loading gate round the loft door: rails on three sides of the bay in front
  // of the hoist door. The loft door is not an opening, but the kit's street
  // wall collider has a 3 m gap for the ground doorway, full height, so without
  // this a walker in the loft could pass through the closed door and drop onto
  // the awning. It cannot simply be a wall collider across the door: check-
  // interiors and check-buildings probe the street door height-blind, so no
  // collider at any height may cross the door's column. check-interiors walks
  // 1.08 m in with a 0.42 m radius (to z 2.28); the gate's front rail stops at
  // 2.11 and its side rails stand 0.75 m off the centre line.
  LOFT_GATE: [
    { x0: -0.81, x1: 0.81, z0: 1.99, z1: 2.11 },
    { x0: -0.81, x1: -0.69, z0: 2.11, z1: 3.78 },
    { x0: 0.69, x1: 0.81, z0: 2.11, z1: 3.78 }
  ],
  DOOR: { w: 0.9, h: 2.1 },
  PARTITIONS: [],
  // Sales counter on the east side, [x0, x1, z0, z1], shelving behind it on
  // the east wall and along the back wall, clear of the stair's foot.
  COUNTER: [2.30, 2.95, -2.60, 1.90],
  SHELVES: [[4.13, 4.53, -3.30, 2.80], [-3.30, 4.13, -3.78, -3.38]],
  // The cookstove model (props furniture.glb) is one merged mesh 1.13 x 2.49 x
  // 0.70 with its own flue: measured from its vertices, the flue is centred at
  // (0.350, -0.210) in the model frame, radius 0.075, top 2.49. At yaw PI/2
  // that rotates to `flue` below. interior.py carries the pipe on from the
  // model's pipe top and store.py's roof pipe from the same point -- drawing it
  // at the stove centre put two pipes side by side.
  STOVE: { x: 1.0, z: -1.2, yaw: Math.PI / 2, flueModel: { x: 0.350, z: -0.210, top: 2.49 }, flue: { x: 0.79, z: -1.55 } },
  // The loft, lit from behind. Wall-local x: the back wall faces -z, so this is
  // lot x +1.80.
  backWindows: [
    { x: -1.80, w: 0.90, h: 1.10, fromFloor: 4.05 }
  ]
};

function mat(base, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color: base, roughness: 0.88, ...extra });
}

/**
 * Batch materials for the authored export.
 *
 * `batched()` multiplies each material by the per-face tint baked into the
 * model, and store.py puts the ENTIRE paint scheme in those tints. So every
 * material here has to stay close to neutral and contribute only its texture:
 * a saturated base multiplies twice and collapses the facade to one hue --
 * cream trim goes mint and the red awning stripe goes brown.
 */
function tinted(maps) {
  const hasMaps = Boolean(maps?.wood && maps?.siding && maps?.rock && maps?.roof);
  return {
    // Gain is doing real work here, not taste: both the texture and the tint
    // are below white, so the product lands far darker than either. At the
    // first pass the green read near-black against the row's bare wood.
    paint: hasMaps
      ? makeTexturedMat(maps.siding, { tiling: 1.45, tint: 0xffffff, gain: 1.55 })
      : mat(0xdbd9d4),
    wood: hasMaps
      ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xfffaf0, gain: 1.9, rough: 0.9 })
      : mat(0xe6d4bc),
    stone: hasMaps
      ? makeTexturedMat(maps.rock, { tiling: 2.2, tint: 0xf2ecdf, gain: 1.2, rough: 0.95 })
      : mat(0xdbd4c4),
    roof: hasMaps
      ? makeTexturedMat(maps.roof, { tiling: 1.4, tint: 0xf0f0e8, gain: 1.05, rough: 0.82 })
      : mat(0xccccc3),
    // Mid-grey, not near-black: the authored tints carry both the dark iron
    // strap work and the bright tinware off this one batch.
    iron: mat(0x9ea3a1, { metalness: 0.6, roughness: 0.45 }),
    glass: mat(0xb3c7c3, { transparent: true, opacity: 0.34, metalness: 0.15, roughness: 0.15 })
  };
}

function lotFrame(lot) {
  const group = lot.group;
  group.updateWorldMatrix(true, false);
  const quat = new THREE.Quaternion();
  const yaw = new THREE.Euler().setFromQuaternion(group.getWorldQuaternion(quat), "YXZ").y;
  const point = new THREE.Vector3();
  return {
    box(x, z, halfX, halfZ, span) {
      group.localToWorld(point.set(x, 0, z));
      addOrientedBoxCollider(point.x, point.z, halfX, halfZ, -yaw, span);
    }
  };
}

/** Add the Blender-authored general store facade to the procedural town lot. */
export function attachStore(lot, maps) {
  const group = batched("generalStore", model, tinted(maps));
  lot.group.add(group);

  const frame = lotFrame(lot);
  const floor = lot.group.userData.placementY;

  // The awning supports stand on the shared boardwalk. Keep their footprints
  // solid only up to the awning, so they read as posts to walk around rather
  // than a wall across the storefront.
  for (const post of STORE.awningPosts) {
    frame.box(post.x, post.z, 0.11, 0.11, { minY: floor, maxY: floor + STORE.awningHeight });
  }

  // Stock left out front is authored geometry standing at knee height; without
  // colliders the player walks straight through the kegs and crates.
  for (const item of STORE.boardwalkGoods) {
    frame.box(item.x, item.z, item.halfX, item.halfZ, { minY: floor, maxY: floor + item.top });
  }

  // The window displays sit inside the shell, against the front wall. They are
  // shop fittings, so they block the strip of floor they stand on.
  for (const nook of STORE.displayNooks) {
    frame.box(nook.x, nook.z, nook.halfX, nook.halfZ, { minY: floor, maxY: floor + STORE.displayTop });
  }
  return group;
}

/**
 * Interior batch materials: the saloon's and the hotel's, so walking between
 * the three crosses no material cliff. Each base is the texture's grain over
 * near-white and the per-face tint carries the colour.
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
    // Near-white, like every other batch: the tints carry the tins, the stove
    // and the register's dark metal.
    iron: new THREE.MeshStandardNodeMaterial({ color: 0xd8d8d2, roughness: 0.5, metalness: 0.45 }),
    glass: new THREE.MeshStandardNodeMaterial({ color: 0x9fb6b2, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.4 })
  };
}

/** Lot-local collider and deck helper for the storeys, spans relative to the floor. */
function storeyFrame(lot) {
  const g = lot.group;
  g.updateWorldMatrix(true, false);
  const yaw = new THREE.Euler().setFromQuaternion(g.getWorldQuaternion(new THREE.Quaternion()), "YXZ").y;
  const p = new THREE.Vector3();
  const py = g.userData.placementY;
  const at = (x, z) => g.localToWorld(p.set(x, 0, z));
  return {
    box(x0, x1, z0, z1, span = null) {
      const c = at((x0 + x1) / 2, (z0 + z1) / 2);
      addOrientedBoxCollider(c.x, c.z, (x1 - x0) / 2, (z1 - z0) / 2, -yaw,
        span && { minY: py + span[0], maxY: py + span[1] });
    },
    deck(x0, x1, z0, z1, y, yFar = y) {
      const c = at((x0 + x1) / 2, (z0 + z1) / 2);
      addDeckPlatform(c.x, c.z, (x1 - x0) / 2, (z1 - z0) / 2, -yaw, py + y, py + yFar);
    }
  };
}

/**
 * The store's sales floor and storage loft, in the lot's own frame. Replaces
 * the procedural store props: a counter and six free-standing shelf units on a
 * 2.7 m ceiling, under the facade's loft door that opened onto nothing.
 */
export function storeInterior(lot, maps, slabMaterial) {
  const { FLOOR, CEIL, UPPER, UPPER_CEIL, INNER, STAIR, LOFT_RAIL, COUNTER, SHELVES, STOVE } = STORE;
  const g = lot.group;
  const [wx0, wx1, wz0, wz1] = STAIR.well;
  const X = INNER.x;
  const Z = INNER.z;

  // Loft floor slab round the well; its underside is the sales-floor ceiling.
  for (const [x0, x1, z0, z1] of [[wx1, X, -Z, Z], [-X, wx1, wz1, Z], [-X, wx1, -Z, wz0]]) {
    const slab = block({ w: x1 - x0, h: UPPER - 0.02 - CEIL, d: z1 - z0, material: slabMaterial, role: "ceiling", extra: { height: CEIL } });
    mate(slab, "base", anchorsOf(g).get("footing"), { offset: { x: (x0 + x1) / 2, y: CEIL, z: (z0 + z1) / 2 } });
  }
  g.userData.storeys = { ceiling: CEIL, upperFloor: UPPER, upperCeiling: UPPER_CEIL, well: [wx0, wx1, wz0, wz1] };

  const f = storeyFrame(lot);
  const rise = (UPPER - FLOOR) / STAIR.risers;
  f.deck(-X, X, -Z, Z + 0.33, FLOOR);
  f.deck(STAIR.x0, STAIR.x1, STAIR.z0, STAIR.z1, FLOOR + rise / 2, UPPER - rise / 2);
  f.deck(wx1, X, -Z, Z, UPPER);
  f.deck(-X, wx1, wz1, Z, UPPER);
  f.deck(-X, wx1, -Z, wz0, UPPER);

  const low = [-1, CEIL];
  const high = [UPPER + 0.1, UPPER_CEIL];
  // Under the stair: the spandrel closes the flight's open side once the treads
  // are too high to step onto, and the closet end under the top of the flight.
  const stepOn = STAIR.z0 + ((0.55 - FLOOR) / rise) * ((STAIR.z1 - STAIR.z0) / (STAIR.risers - 1));
  f.box(STAIR.x1, STAIR.x1 + 0.1, stepOn, STAIR.z1 + 0.1, low);
  f.box(STAIR.x0, STAIR.x1 + 0.1, STAIR.z1, STAIR.z1 + 0.1, [-1, FLOOR + 1.2]);
  f.box(COUNTER[0], COUNTER[1], COUNTER[2], COUNTER[3], low);
  for (const [x0, x1, z0, z1] of SHELVES) f.box(x0, x1, z0, z1, low);
  // The cookstove's real footprint (props.js hx 0.57, hz 0.34), which does not
  // collide on its own; the pipe above it is solid in the loft.
  f.box(STOVE.x - 0.57, STOVE.x + 0.57, STOVE.z - 0.34, STOVE.z + 0.34, low);
  f.box(STOVE.flue.x - 0.1, STOVE.flue.x + 0.1, STOVE.flue.z - 0.1, STOVE.flue.z + 0.1, high);
  // The loft's open well edges, and the loading gate round the loft door.
  for (const r of [...LOFT_RAIL, ...STORE.LOFT_GATE]) f.box(r.x0, r.x1, r.z0, r.z1, high);
  // Close the rest of the kit's 3 m street-wall gap upstairs, outside the gate.
  f.box(-1.6, -0.75, Z, Z + 0.22, high);
  f.box(0.75, 1.6, Z, Z + 0.22, high);

  const group = batched("generalStoreInterior", interiorModel, interiorMaterials(maps));
  g.add(group);

  const put = (kind, x, z, yaw = 0, extra = {}, y = FLOOR) => addLocalPropSpot("interiors", g, kind, x, y, z, yaw, extra);
  const up = (kind, x, z, yaw = 0, extra = {}) => put(kind, x, z, yaw, extra, UPPER);
  // Sales floor: the cookstove with chairs round it and a checker table,
  // cracker barrels, sacks by the counter.
  put("cookstove", STOVE.x, STOVE.z, STOVE.yaw);
  put("chair", STOVE.x - 1.0, STOVE.z + 0.2, Math.PI / 2 + 0.3);
  put("chair", STOVE.x - 0.4, STOVE.z - 1.0, 0.4);
  put("table_square", -1.6, -1.5, 0.2);
  put("chair", -2.35, -1.5, Math.PI / 2);
  put("chair", -0.85, -1.5, -Math.PI / 2);
  // Out of the aisle from the door, which the walker in check:store uses.
  put("barrel", -1.4, 1.8, 0.4);
  put("barrel", -0.9, 2.3, 1.1);
  put("crate", 1.7, 2.6, 0.2);
  // Loft: stock stacked clear of the rail, the stair top and the walk through.
  up("crate", 3.6, -3.2, 0.1);
  up("crate", 2.6, -3.3, -0.2);
  up("crate", 3.7, -2.2, 1.4);
  up("barrel", 1.2, -3.3, 0);
  up("barrel", 0.6, -3.35, 0.7);
  up("crate", -1.4, -3.2, 0.3);
  up("barrel", -2.3, -3.3, 0.9);
  // No wool_sacks: the camp-kit model stands as tall pale cocoons indoors.
  up("barrel", 3.8, 0.4, 0.2);
  up("crate", 3.8, 1.2, 1.5);
  return group;
}

