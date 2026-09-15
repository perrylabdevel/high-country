import * as THREE from 'three/webgpu';
import { color } from 'three/tsl';
import model from '../models/saloon.json';
import interiorModel from '../models/saloon-interior.json';
import { batched } from './ranchRemodel.js';
import { block } from './kit.js';
import { mate, anchorsOf } from './anchors.js';
import { makeTexturedMat } from '../materials/texturedMat.ts';
import { addDeckPlatform, addOrientedBoxCollider } from '../collision.js';
import { addLocalPropSpot } from '../propSpots.js';

/**
 * The Silver Creek saloon, in lot-local metres: x across the facade, y up from
 * the lot floor, +z toward the street. scripts/blender-saloon builds its
 * facade and interior from these numbers (export-layout.mjs snapshots them),
 * and check:saloon holds the two to each other.
 */
export const SALOON = {
  FLOOR: 0.1,        // barroom floorboard top (the kit slab below tops at 0.08)
  CEIL: 3.2,         // pressed-tin ceiling; the joists above carry the upstairs
  UPPER: 3.44,       // upstairs floorboard top, level with the balcony deck
  UPPER_CEIL: 6.4,
  INNER: { x: 4.28, z: 3.78 },   // inner faces of the interior shell
  // 18 risers up the west wall, climbing toward the street. `well` is the
  // opening in the upstairs floor over the upper flight [x0, x1, z0, z1].
  STAIR: { x0: -4.28, x1: -3.18, z0: -3.0, z1: 1.25, risers: 18, well: [-4.28, -3.18, -1.75, 1.25] },
  // Upstairs partitions as centre lines, 0.12 thick, with doorway centres.
  PARTITIONS: [
    { axis: 'x', at: 1.31, from: -3.18, to: 4.28, doors: [-1.6, 2.3] },   // hall / rooms
    { axis: 'z', at: -3.12, from: -1.75, to: 1.25, doors: [] },           // stairwell side
    { axis: 'x', at: -1.81, from: -4.28, to: -3.06, doors: [] },          // stairwell end
    { axis: 'z', at: 0.4, from: -3.78, to: 1.25, doors: [] }              // between rooms
  ],
  DOOR: { w: 0.9, h: 2.1 },
  // Front wall: storefront windows, the upstairs hall windows and the door
  // onto the balcony. Back wall: one window per upstairs room.
  FRONT: [
    { x: -2.72, w: 2.0, h: 1.7, fromFloor: 0.8 },
    { x: 2.72, w: 2.0, h: 1.7, fromFloor: 0.8 },
    { x: -2.62, w: 1.05, h: 1.75, fromFloor: 4.3 },
    { x: 2.62, w: 1.05, h: 1.75, fromFloor: 4.3 },
    { x: 0, w: 1.0, h: 2.1, fromFloor: 3.44, class: 'door' }
  ],
  // Wall-local x: the back wall faces -z, so its x runs opposite the lot's
  // (these are the east room's window at lot x 2.75, the west room's at -2.1).
  BACK: [
    { x: -2.75, w: 0.95, h: 1.6, fromFloor: 4.3 },
    { x: 2.1, w: 0.95, h: 1.6, fromFloor: 4.3 }
  ],
  // The bar and back bar on the east wall, and the stove, as [x0, x1, z0, z1].
  BAR: [2.72, 3.36, -2.6, 1.8],
  BACK_BAR: [3.72, 4.28, -3.0, 2.1],
  STOVE: { x: 1.6, z: -2.9, r: 0.42 },
  BALCONY: { x: 5.0, z0: 4.11, z1: 7.9, rail: 7.72 }
};

/** Gallery posts on the boardwalk, lot-local (x, z) with half width. Must match
 * POSTS / REACH in scripts/blender-saloon/saloon.py. */
export const SALOON_POSTS = [-4.72, -1.58, 1.58, 4.72].map((x) => ({ x, z: 7.72, half: 0.13 }));

/** Lot-local placement helpers bound to one lot group. */
function lotFrame(lot) {
  const g = lot.group;
  g.updateWorldMatrix(true, false);
  const yaw = new THREE.Euler().setFromQuaternion(g.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
  const p = new THREE.Vector3();
  const py = g.userData.placementY;
  const at = (x, z) => g.localToWorld(p.set(x, 0, z));
  return {
    py,
    // Oriented boxes and decks take the inverse of rotation.y.
    box(x0, x1, z0, z1, span = null) {
      const c = at((x0 + x1) / 2, (z0 + z1) / 2);
      addOrientedBoxCollider(c.x, c.z, (x1 - x0) / 2, (z1 - z0) / 2, -yaw, span && { minY: py + span[0], maxY: py + span[1] });
    },
    deck(x0, x1, z0, z1, y, yFar = y) {
      const c = at((x0 + x1) / 2, (z0 + z1) / 2);
      addDeckPlatform(c.x, c.z, (x1 - x0) / 2, (z1 - z0) / 2, -yaw, py + y, py + yFar);
    }
  };
}

function tinted(maps) {
  const hasMaps = Boolean(maps?.wood && maps?.siding && maps?.rock);
  // Each base is the texture's grain over near-white; the per-face tint
  // carries the colour.
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
    wood,
    floor: wood,
    timber: hasMaps
      ? makeTexturedMat(maps.wood, { tiling: 1.8, tint: 0xcfa06a, gain: 1.6, rough: 0.9 })
      : new THREE.MeshStandardNodeMaterial({ color: 0x6b4226, roughness: 0.9 }),
    plaster: neutral(maps?.rock, 0.05, 0.95),
    fabric: neutral(maps?.siding, 0.35, 1),
    roof: new THREE.MeshStandardNodeMaterial({ color: 0x8c8a84, roughness: 0.55, metalness: 0.55 }),
    iron: new THREE.MeshStandardNodeMaterial({ color: 0x3a3a38, roughness: 0.6, metalness: 0.5 }),
    // Painted pressed tin: a sheen, but lit like paint (metal read as a black lid).
    tin: new THREE.MeshStandardNodeMaterial({ color: 0xe6dcc4, roughness: 0.55, metalness: 0.15 }),
    brass: new THREE.MeshStandardNodeMaterial({ color: 0xb58a42, roughness: 0.35, metalness: 0.85 }),
    pane: new THREE.MeshStandardNodeMaterial({ color: 0x1a2022, roughness: 0.18, metalness: 0.35 }),
    // The back-bar mirror: bright and sharp, but not a real reflection.
    mirror: new THREE.MeshStandardNodeMaterial({ color: 0x9aa4a6, roughness: 0.06, metalness: 0.95 }),
    glass: new THREE.MeshStandardNodeMaterial({ color: 0x2a3436, roughness: 0.15, metalness: 0.3 })
  };
}

/**
 * Blender-authored saloon facade (scripts/blender-saloon/saloon.py): storefront,
 * balcony gallery on posts over the boardwalk, false front and sign, tin roof.
 * Parented to the saloon lot group. The kit keeps the openings and walls; this
 * adds the posts, and the balcony as a deck with its railings.
 */
export function attachSaloon(lot, maps = {}) {
  const group = batched('saloon', model, tinted(maps));
  lot.group.add(group);
  const f = lotFrame(lot);
  for (const post of SALOON_POSTS) {
    f.box(post.x - post.half, post.x + post.half, post.z - post.half, post.z + post.half);
  }
  const { UPPER, UPPER_CEIL, BALCONY: b } = SALOON;
  const high = [UPPER + 0.1, UPPER_CEIL];
  // From inside the wall line, so the threshold has no gap to drop through.
  f.deck(-b.x, b.x, b.z0 - 0.2, b.z1, UPPER);
  f.box(-b.x, b.x, b.rail - 0.08, b.rail + 0.08, high);
  for (const s of [-1, 1]) f.box(s * (b.x - 0.08) - 0.08, s * (b.x - 0.08) + 0.08, b.z0, b.rail, high);
  return group;
}

/**
 * The saloon's two storeys on top of the lot's interior shell: the upstairs
 * floor slab (the barroom ceiling, open over the stair), walkable decks, the
 * colliders of each storey, the camera ceilings, the Blender interior
 * (scripts/blender-saloon/interior.py) and its furniture.
 */
export function saloonInterior(lot, maps = {}, slabMaterial) {
  const { FLOOR, CEIL, UPPER, UPPER_CEIL, INNER, STAIR, PARTITIONS, DOOR, BAR, BACK_BAR, STOVE } = SALOON;
  const g = lot.group;
  const [wx0, wx1, wz0, wz1] = STAIR.well;
  const X = INNER.x, Z = INNER.z;

  // Upstairs floor slab around the well; its underside is the barroom ceiling.
  for (const [x0, x1, z0, z1] of [[wx1, X, -Z, Z], [-X, wx1, wz1, Z], [-X, wx1, -Z, wz0]]) {
    const slab = block({ w: x1 - x0, h: UPPER - 0.02 - CEIL, d: z1 - z0, material: slabMaterial, role: 'ceiling', extra: { height: CEIL } });
    mate(slab, 'base', anchorsOf(g).get('footing'), { offset: { x: (x0 + x1) / 2, y: CEIL, z: (z0 + z1) / 2 } });
  }
  g.userData.storeys = { ceiling: CEIL, upperFloor: UPPER, upperCeiling: UPPER_CEIL, well: [wx0, wx1, wz0, wz1] };

  const f = lotFrame(lot);
  // Walkable surfaces: the barroom boards out to the threshold, the stair as a
  // ramp through its tread centres, and the upstairs floor around the well.
  const rise = (UPPER - FLOOR) / STAIR.risers;
  f.deck(-X, X, -Z, Z + 0.33, FLOOR);
  f.deck(STAIR.x0, STAIR.x1, STAIR.z0, STAIR.z1, FLOOR + rise / 2, UPPER - rise / 2);
  f.deck(wx1, X, -Z, Z + 0.33, UPPER);
  f.deck(-X, wx1, wz1, Z + 0.33, UPPER);
  f.deck(-X, wx1, -Z, wz0, UPPER);

  // Colliders by storey.
  const low = [-1, CEIL];
  const high = [UPPER + 0.1, UPPER_CEIL];
  // Under the stair: the spandrel closes the flight's open side once the
  // treads are too high to step onto, and the closet end under the top.
  const stepOn = STAIR.z0 + ((0.55 - FLOOR) / rise) * ((STAIR.z1 - STAIR.z0) / (STAIR.risers - 1));
  f.box(STAIR.x1, STAIR.x1 + 0.1, stepOn, STAIR.z1 + 0.1, low);
  // The closet end stops well below the top treads, which a climber passes
  // over; it only has to stop someone on the barroom floor.
  f.box(STAIR.x0, STAIR.x1 + 0.1, STAIR.z1, STAIR.z1 + 0.1, [-1, FLOOR + 1.2]);
  f.box(BAR[0], BAR[1], BAR[2], BAR[3], low);
  f.box(BACK_BAR[0], BACK_BAR[1], BACK_BAR[2], BACK_BAR[3], low);
  f.box(STOVE.x - STOVE.r, STOVE.x + STOVE.r, STOVE.z - STOVE.r, STOVE.z + STOVE.r, low);
  // Upstairs partitions, each run broken at its doorways.
  for (const p of PARTITIONS) {
    let cursor = p.from;
    for (const c of [...p.doors, p.to + DOOR.w]) {
      const end = Math.min(p.to, c - DOOR.w / 2);
      if (end > cursor + 0.05) {
        if (p.axis === 'x') f.box(cursor, end, p.at - 0.06, p.at + 0.06, high);
        else f.box(p.at - 0.06, p.at + 0.06, cursor, end, high);
      }
      cursor = c + DOOR.w / 2;
    }
  }
  // The street wall's collider gap is the ground-floor doorway's, full height;
  // upstairs only the balcony door is open.
  const door = SALOON.FRONT.find((o) => o.class === 'door');
  f.box(-1.6, door.x - door.w / 2, Z, Z + 0.22, high);
  f.box(door.x + door.w / 2, 1.6, Z, Z + 0.22, high);

  const group = batched('saloonInterior', interiorModel, tinted(maps));
  g.add(group);

  // Furniture: barroom tables and the piano, bedrooms upstairs.
  const put = (kind, x, z, yaw = 0, extra = {}, y = FLOOR) => addLocalPropSpot('interiors', g, kind, x, y, z, yaw, extra);
  const up = (kind, x, z, yaw = 0, extra = {}) => put(kind, x, z, yaw, extra, UPPER);
  // Footprints from props.js (hx, hz), so nothing runs into a wall or a door.
  put('piano', -0.6, -3.2, 0);
  f.box(-1.33, 0.13, -3.75, -2.65, low);
  for (const [tx, tz, turn] of [[-1.75, 1.7, 0.1], [0.55, -0.6, -0.25], [-1.9, -1.35, 0.4]]) {
    put('table_square', tx, tz, turn);
    put('chair', tx - 0.78 * Math.cos(turn), tz + 0.78 * Math.sin(turn), turn + Math.PI / 2);
    put('chair', tx + 0.78 * Math.cos(turn), tz - 0.78 * Math.sin(turn), turn - Math.PI / 2);
    put('chair', tx + 0.78 * Math.sin(turn), tz + 0.78 * Math.cos(turn), turn + Math.PI);
  }
  for (const sz of [-2.0, -1.0, 0.0, 1.0]) put('stool', BAR[0] - 0.42, sz);
  put('barrel', -3.9, 2.95, 0.3);
  put('crate', 3.95, 3.3, 0.2);

  // West room over the barroom: a double bed; east room: two singles along
  // the east wall. Beds collide, like every bed in town.
  up('bed_double', -1.35, -2.8, 0);
  f.box(-2.4, -0.3, -3.52, -2.08, high);
  up('washstand', -0.05, -0.8, -Math.PI / 2);
  up('dresser', -2.8, -0.2, Math.PI / 2);
  up('chair', -2.6, -1.4, 0.9);
  for (const bz of [-2.7, -0.35]) {
    up('bed_single', 3.7, bz, -Math.PI / 2);
    f.box(3.2, 4.2, bz - 1.0, bz + 1.0, high);
  }
  up('trunk', 2.5, -3.45, 0);
  up('washstand', 0.72, 0.4, Math.PI / 2);
  // Hall: a chair and a small table by the windows.
  up('chair', -1.35, 3.35, Math.PI + 0.3);
  up('table_square', 3.3, 3.2, 0, { sx: 0.7 });
  return group;
}
