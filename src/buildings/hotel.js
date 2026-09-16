import * as THREE from "three/webgpu";
import { color } from "three/tsl";
import model from "../models/hotel.json";
import interiorModel from "../models/hotel-interior.json";
import { batched } from "./ranchRemodel.js";
import { block } from "./kit.js";
import { mate, anchorsOf } from "./anchors.js";
import { addDeckPlatform, addOrientedBoxCollider } from "../collision.js";
import { makeTexturedMat } from "../materials/texturedMat.ts";
import { addLocalPropSpot } from "../propSpots.js";

/**
 * Lot-local contract for the Blender-authored hotel exterior. The kit in
 * landmarks.js stays the source of truth for the 11 x 9 shell, the gable roof,
 * the apertures and the collisions; this detail layer adds the two-storey
 * gallery, the elevation's joinery, the roofscape and the side treatment.
 *
 * The hotel's front wall shipped with nothing in it but a door -- a blank
 * 11 x 8.2 m board, the largest empty elevation in the town -- so the windows
 * below are new apertures, not decoration over existing holes. They must match
 * what `hotel.py` frames, and every sill has to stay at or above 0.5 or the
 * kit declines to glaze the opening.
 */
export const HOTEL = {
  model: "scripts/blender-hotel/hotel.py",
  interiorModel: "scripts/blender-hotel/interior.py",
  footprint: { w: 11, d: 9 },

  // Storeys: the saloon's proven section. UPPER is flush with the gallery deck
  // top (hotel.py DECK_Y) so the gallery door is a level threshold, and CEIL is
  // that deck's underside -- the ground ceiling IS the upper floor.
  //
  // A first pass tied UPPER to a 3.72 m deck, which put the lobby ceiling at
  // 3.46 and broke check-buildings' habitable-ceiling invariant (2.3-3.2). The
  // design moved to conform rather than the invariant moving to fit it
  // (HARD_WON 3.6). Every number here is asserted in check:hotel.
  FLOOR: 0.10,        // ground floorboard top (the kit slab below tops at 0.08)
  CEIL: 3.20,
  UPPER: 3.44,
  UPPER_CEIL: 6.60,
  INNER: { x: 5.28, z: 4.28 },   // inner faces of the interior shell

  // 18 risers of 185.6 mm -- the saloon's exact rise -- up the west wall,
  // climbing toward the street, with a 1.24 m landing at the foot. `well` is
  // the opening in the upper floor wherever a tread plus 2.0 m would hit the
  // ground ceiling.
  STAIR: { x0: -5.28, x1: -4.18, z0: -3.04, z1: 1.38, risers: 18, well: [-5.28, -4.18, -1.73, 1.38] },

  // Upper plan: a hall along the front (onto the gallery), three rooms behind.
  // Partitions are centre lines, 0.12 thick, with doorway centres.
  HALL_Z: 1.38,
  PARTITIONS: [
    { axis: "x", at: 1.38, from: -4.06, to: 5.28, doors: [-2.50, 0.60, 3.71] },  // hall / rooms
    { axis: "z", at: -4.06, from: -4.28, to: 1.38, doors: [] },                   // stairwell side
    { axis: "z", at: -0.95, from: -4.28, to: 1.38, doors: [] },                   // room 1 / 2
    { axis: "z", at: 2.15, from: -4.28, to: 1.38, doors: [] }                     // room 2 / 3
  ],
  DOOR: { w: 0.9, h: 2.1 },

  // The front wall shipped with nothing but a door. Ground windows flank it;
  // the upper row opens onto the HALL, and the gallery door leads out.
  frontWindows: [
    { x: -2.60, w: 1.50, h: 1.80, fromFloor: 0.85 },
    { x: 2.60, w: 1.50, h: 1.80, fromFloor: 0.85 },
    { x: -4.00, w: 1.10, h: 1.80, fromFloor: 4.30 },
    { x: -1.50, w: 1.10, h: 1.80, fromFloor: 4.30 },
    { x: 1.50, w: 1.10, h: 1.80, fromFloor: 4.30 },
    { x: 4.00, w: 1.10, h: 1.80, fromFloor: 4.30 },
    { x: 0, w: 1.0, h: 2.1, fromFloor: 3.44, class: "door" }
  ],
  // The upper windows light the hall, so without these every room would be a
  // dark box. Wall-local x: the back wall faces -z, so its x runs opposite the
  // lot's -- these are the three rooms at lot x -2.50, 0.60, 3.71, and the
  // ground parlour at lot x -1.20 and 2.80.
  backWindows: [
    { x: 2.50, w: 0.95, h: 1.60, fromFloor: 4.30 },
    { x: -0.60, w: 0.95, h: 1.60, fromFloor: 4.30 },
    { x: -3.71, w: 0.95, h: 1.60, fromFloor: 4.30 },
    { x: 1.20, w: 1.20, h: 1.70, fromFloor: 0.85 },
    { x: -2.80, w: 1.20, h: 1.70, fromFloor: 0.85 }
  ],

  // Reception desk on the east side of the lobby, [x0, x1, z0, z1].
  DESK: [3.55, 4.35, 0.40, 3.10],
  // The gallery: walkable at UPPER out to the rail on the post line.
  GALLERY: { x: 5.40, z0: 4.61, rail: 7.16 },

  /** Ground-storey gallery posts, on the shared boardwalk. */
  galleryPosts: [-5.06, -3.04, -1.01, 1.01, 3.04, 5.06].map((x) => ({ x, z: 7.16 })),
  /** Underside of the first-floor deck: the posts are solid up to here. */
  galleryDeck: 3.20,
  /** Benches and a trunk standing under the gallery. */
  galleryFurniture: [
    { x: -3.5, z: 5.33, halfX: 0.80, halfZ: 0.26, top: 0.94 },
    { x: 3.5, z: 5.33, halfX: 0.80, halfZ: 0.26, top: 0.94 },
    { x: 1.68, z: 5.23, halfX: 0.40, halfZ: 0.30, top: 0.54 }
  ]
};

function mat(base, extra = {}) {
  return new THREE.MeshStandardNodeMaterial({ color: base, roughness: 0.88, ...extra });
}

/**
 * Batch materials for the authored export.
 *
 * `batched()` multiplies each material by the per-face tint baked into the
 * model and `hotel.py` puts the entire paint scheme in those tints, so these
 * stay close to neutral and contribute only texture. Gain is load-bearing:
 * texture and tint are both below white, so the product lands far darker than
 * either, which is what made the store's first pass read near-black.
 */
function tinted(maps) {
  const hasMaps = Boolean(maps?.wood && maps?.siding && maps?.rock && maps?.roof);
  return {
    paint: hasMaps
      ? makeTexturedMat(maps.siding, { tiling: 1.5, tint: 0xffffff, gain: 1.55 })
      : mat(0xd8d2c6),
    wood: hasMaps
      ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xfffaf0, gain: 1.9, rough: 0.9 })
      : mat(0xe6d4bc),
    stone: hasMaps
      ? makeTexturedMat(maps.rock, { tiling: 2.2, tint: 0xf2ecdf, gain: 1.2, rough: 0.95 })
      : mat(0xdbd4c4),
    roof: hasMaps
      ? makeTexturedMat(maps.roof, { tiling: 1.4, tint: 0xf0f0e8, gain: 1.05, rough: 0.82 })
      : mat(0xccccc3),
    iron: mat(0x9ea3a1, { metalness: 0.6, roughness: 0.45 }),
    glass: mat(0xb3c7c3, { transparent: true, opacity: 0.34, metalness: 0.15, roughness: 0.15 })
  };
}

/**
 * Interior batch materials. Mirrors the saloon's exactly, so walking from one
 * interior to the other crosses no material cliff: each base is the texture's
 * grain over near-white and the per-face tint carries the colour.
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
    glass: new THREE.MeshStandardNodeMaterial({ color: 0x9fb6b2, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.4 })
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
    // Oriented boxes and decks take the inverse of rotation.y. `span` is
    // [minY, maxY] relative to the lot floor.
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

/** Add the Blender-authored hotel facade to the procedural town lot. */
export function attachHotel(lot, maps) {
  const group = batched("hotelBuilding", model, tinted(maps));
  lot.group.add(group);

  const f = lotFrame(lot);
  const { UPPER, UPPER_CEIL, GALLERY: gal } = HOTEL;

  // The gallery posts stand on the shared boardwalk. Solid only up to the deck
  // above them, so they read as posts to walk between rather than a wall
  // across the frontage.
  for (const post of HOTEL.galleryPosts) {
    f.box(post.x - 0.15, post.x + 0.15, post.z - 0.15, post.z + 0.15, [0, HOTEL.galleryDeck]);
  }
  for (const item of HOTEL.galleryFurniture) {
    f.box(item.x - item.halfX, item.x + item.halfX, item.z - item.halfZ, item.z + item.halfZ, [0, item.top]);
  }

  // The gallery is walkable now: the hall's gallery door leads onto it, level
  // with the upper floor, the way the saloon's balcony door does. The deck
  // starts inside the wall line so the threshold has no gap to drop through;
  // the rail and its returns keep a walker from stepping off the edge.
  const high = [UPPER + 0.1, UPPER_CEIL];
  f.deck(-gal.x, gal.x, gal.z0 - 0.2, gal.rail, UPPER);
  f.box(-gal.x, gal.x, gal.rail - 0.08, gal.rail + 0.08, high);
  for (const sx of [-1, 1]) {
    f.box(sx * (gal.x - 0.08) - 0.08, sx * (gal.x - 0.08) + 0.08, gal.z0, gal.rail, high);
  }
  return group;
}

/**
 * The hotel's two storeys, in the lot's own frame: the upper-floor slab round
 * the well (which is also the ground ceiling), walkable decks, colliders by
 * storey, the authored interior, and furniture. Replaces the procedural hotel
 * props, whose four-box "stair" climbed to 0.88 m under a 2.7 m ceiling.
 */
export function hotelInterior(lot, maps, slabMaterial) {
  const { FLOOR, CEIL, UPPER, UPPER_CEIL, INNER, STAIR, PARTITIONS, DOOR, DESK } = HOTEL;
  const g = lot.group;
  const [wx0, wx1, wz0, wz1] = STAIR.well;
  const X = INNER.x;
  const Z = INNER.z;

  // Upper floor slab round the well; its underside is the ground ceiling.
  for (const [x0, x1, z0, z1] of [[wx1, X, -Z, Z], [-X, wx1, wz1, Z], [-X, wx1, -Z, wz0]]) {
    const slab = block({ w: x1 - x0, h: UPPER - 0.02 - CEIL, d: z1 - z0, material: slabMaterial, role: "ceiling", extra: { height: CEIL } });
    mate(slab, "base", anchorsOf(g).get("footing"), { offset: { x: (x0 + x1) / 2, y: CEIL, z: (z0 + z1) / 2 } });
  }
  g.userData.storeys = { ceiling: CEIL, upperFloor: UPPER, upperCeiling: UPPER_CEIL, well: [wx0, wx1, wz0, wz1] };

  const f = lotFrame(lot);
  // Walkable: the ground boards out through the threshold, the stair as a ramp
  // through its tread centres, and the upper floor round the well.
  const rise = (UPPER - FLOOR) / STAIR.risers;
  f.deck(-X, X, -Z, Z + 0.33, FLOOR);
  f.deck(STAIR.x0, STAIR.x1, STAIR.z0, STAIR.z1, FLOOR + rise / 2, UPPER - rise / 2);
  f.deck(wx1, X, -Z, Z + 0.33, UPPER);
  f.deck(-X, wx1, wz1, Z + 0.33, UPPER);
  f.deck(-X, wx1, -Z, wz0, UPPER);

  const low = [-1, CEIL];
  const high = [UPPER + 0.1, UPPER_CEIL];
  // Under the stair: the spandrel closes the flight's open side once the treads
  // are too high to step onto, and the closet end stops a walker on the ground
  // floor wandering under the top of the flight.
  const stepOn = STAIR.z0 + ((0.55 - FLOOR) / rise) * ((STAIR.z1 - STAIR.z0) / (STAIR.risers - 1));
  f.box(STAIR.x1, STAIR.x1 + 0.1, stepOn, STAIR.z1 + 0.1, low);
  f.box(STAIR.x0, STAIR.x1 + 0.1, STAIR.z1, STAIR.z1 + 0.1, [-1, FLOOR + 1.2]);
  f.box(DESK[0], DESK[1], DESK[2], DESK[3], low);
  // Upstairs partitions, each run broken at its doorways.
  for (const p of PARTITIONS) {
    let cursor = p.from;
    for (const c of [...[...p.doors].sort((a, b) => a - b), p.to + DOOR.w]) {
      const end = Math.min(p.to, c - DOOR.w / 2);
      if (end > cursor + 0.05) {
        if (p.axis === "x") f.box(cursor, end, p.at - 0.06, p.at + 0.06, high);
        else f.box(p.at - 0.06, p.at + 0.06, cursor, end, high);
      }
      cursor = c + DOOR.w / 2;
    }
  }
  // The street wall's collider gap is the ground doorway's, full height;
  // upstairs only the gallery door is open.
  const door = HOTEL.frontWindows.find((o) => o.class === "door");
  f.box(-1.6, door.x - door.w / 2, Z, Z + 0.22, high);
  f.box(door.x + door.w / 2, 1.6, Z, Z + 0.22, high);

  const group = batched("hotelInterior", interiorModel, interiorMaterials(maps));
  g.add(group);

  // Furniture. Footprints from props.js (hx, hz), placed clear of walls, the
  // stair and every doorway swing.
  const put = (kind, x, z, yaw = 0, extra = {}, y = FLOOR) => addLocalPropSpot("interiors", g, kind, x, y, z, yaw, extra);
  const up = (kind, x, z, yaw = 0, extra = {}) => put(kind, x, z, yaw, extra, UPPER);

  // Lobby: a table and chairs by the west window; a strongbox behind the desk.
  put("table_square", -2.3, 2.6, 0.15);
  put("chair", -3.05, 2.6, Math.PI / 2);
  put("chair", -1.55, 2.6, -Math.PI / 2);
  put("strongbox", 4.8, 2.6, Math.PI / 2);
  // Parlour: a long table, chairs, the hearth on the east wall.
  put("table_long", 1.2, -2.3, 0);
  for (const cx of [0.55, 1.85]) {
    put("chair", cx, -1.55, Math.PI);
    put("chair", cx, -3.05, 0);
  }
  put("hearth", X - 0.72, -2.6, -Math.PI / 2);
  f.box(X - 1.42, X, -3.75, -1.45, low);
  put("cupboard", -1.8, -Z + 0.3, 0);
  f.box(-2.44, -1.16, -Z, -Z + 0.58, low);

  // Room 1: a double bed against the back wall.
  up("bed_double", -2.5, -3.5, 0);
  f.box(-3.55, -1.45, -4.22, -2.78, high);
  up("washstand", -3.55, 0.6, Math.PI / 2);
  up("chair", -1.5, 0.3, -0.6);
  // Room 2: two singles along the partitions.
  for (const bx of [-0.35, 1.55]) {
    up("bed_single", bx, -3.2, Math.PI / 2);
    f.box(bx - 0.5, bx + 0.5, -4.2, -2.2, high);
  }
  up("trunk", 0.6, 0.35, 0);
  // Room 3: a double bed and a wardrobe on the east wall.
  up("bed_double", 3.71, -3.5, 0);
  f.box(2.66, 4.76, -4.22, -2.78, high);
  up("wardrobe", X - 0.35, -0.6, -Math.PI / 2);
  f.box(X - 0.68, X, -1.2, 0.0, high);
  // Hall: a chair and a small table by the gallery door.
  up("chair", -2.6, 3.4, Math.PI + 0.3);
  up("table_square", 2.8, 3.3, 0, { sx: 0.7 });
  return group;
}
