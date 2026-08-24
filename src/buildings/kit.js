/**
 * Building kit — shapes, sizes, rotations, roofs, openings.
 *
 * All dimensions in meters. Everything is built in the structure's local frame
 * and added to a parent Group that carries rotation.y = yaw. Local frame:
 *   +X right along the facade, +Z out through the front wall,
 *   origin at the center of the floor.
 *
 * The kit is the single source of grounding (footing), roofs (gable/hip/shed/
 * flat), walls with openings, door leaves, porches, and colliders. It replaces
 * the four private copies of boxAt/box/mat across buildings.js, landmarks.js,
 * interiors.js, and industry.js.
 */
import * as THREE from "three/webgpu";
import { heightAt } from "../world.js";
import { addOrientedBoxCollider, addBoxCollider, addCylinderCollider } from "../collision.js";
import { defineAnchor, recordMate, mate, anchorsOf } from "./anchors.js";

/** Registry of every structure Group built via structure(), for the geometry checks. */
export const STRUCTURES = [];

/** Lakeside meshes that must sit on WATER, not terrain. */
export const WATER_PLACED = [];

export function clearStructures() {
  STRUCTURES.length = 0;
  WATER_PLACED.length = 0;
  fpGrid = null;
  fpBuiltFor = -1;
}

export function registerWaterPlacement(name, x, z, y) {
  WATER_PLACED.push({ name, x, z, y });
}

export function tag(obj, role, extra = {}) {
  obj.userData.role = role;
  Object.assign(obj.userData, extra);
  return obj;
}

function markRoof(group, extra) {
  tag(group, "roof", extra);
  defineAnchor(group, "base", {
    position: { x: 0, y: extra.roofBase, z: 0 },
    normal: { x: 0, y: -1, z: 0 }
  });
  defineAnchor(group, "ridge", {
    position: { x: 0, y: extra.roofTop, z: 0 },
    normal: { x: 0, y: 1, z: 0 }
  });
  return group;
}

/**
 * Sample heightAt at all four rotated corners of a footprint.
 * Returns { y: min corner height, drop: max - min, corners: [[x,z] x4] }.
 * Seat the structure at `y`; if `drop` > ~0.15, emit a foundation skirt.
 */
export function footing(x, z, w, d, yaw) {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const hw = w / 2;
  const hd = d / 2;
  const corners = [
    [x + cos * hw - sin * hd, z + sin * hw + cos * hd],
    [x + cos * hw + sin * hd, z + sin * hw - cos * hd],
    [x - cos * hw - sin * hd, z - sin * hw + cos * hd],
    [x - cos * hw + sin * hd, z - sin * hw - cos * hd]
  ];
  const ys = corners.map(([cx, cz]) => heightAt(cx, cz));
  const y = Math.min(...ys);
  const drop = Math.max(...ys) - y;
  return { y, drop, corners };
}

/**
 * World Y of the interior ceiling above (x, z), or Infinity when the point is
 * not inside a habitable structure.
 *
 * The third-person boom only ever tested collision in x/z, so indoors it rose
 * straight through the ceiling and left the room. Interiors put their ceiling
 * at min(2.7, eave - 0.35) above the floor (interiors.js addShell), and only
 * habitable lots get a shell at all.
 *
 * The local frame here matches the rendered one: rotation.y = yaw maps local
 * to world as (lx*cos + lz*sin, -lx*sin + lz*cos), so world to local inverts
 * to (dx*cos - dz*sin, dx*sin + dz*cos).
 */
export function interiorCeilingAt(x, z) {
  let lowest = Infinity;
  for (const group of STRUCTURES) {
    const u = group.userData;
    if (!u.habitable || !u.w) {
      continue;
    }
    const cos = Math.cos(u.yaw);
    const sin = Math.sin(u.yaw);
    const dx = x - u.x;
    const dz = z - u.z;
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    if (Math.abs(lx) > u.w / 2 || Math.abs(lz) > u.d / 2) {
      continue;
    }
    const ceiling = u.placementY + Math.min(2.7, u.eave - 0.35);
    if (ceiling < lowest) {
      lowest = ceiling;
    }
  }
  return lowest;
}

/**
 * Broad-phase index of every structure footprint, for the vegetation scatter.
 *
 * interiorCeilingAt scans STRUCTURES linearly, which is fine for one player
 * position per frame. The grass scatter tests ~60k candidate points per
 * rebuild, so a linear scan over every building on the map would cost more
 * than the placement itself. Buildings never move after the world is built, so
 * bucket them once into a uniform grid keyed by cell and re-use it.
 *
 * The index is rebuilt automatically when STRUCTURES grows (createVegetation
 * runs after the settlements are placed, but the dev reloader can re-run both).
 */
const FP_CELL = 24;
let fpGrid = null;
let fpBuiltFor = -1;

function fpKey(ix, iz) {
  return ix * 73856093 ^ iz * 19349663;
}

/**
 * Bucket each footprint into every grid cell its padded bounding box touches.
 * `pad` here is the largest margin any caller will ask for, so a lookup only
 * has to visit its own cell.
 */
const FP_MAX_PAD = 4;

export function buildFootprintIndex() {
  fpGrid = new Map();
  for (const group of STRUCTURES) {
    const u = group.userData;
    if (!u.w || !u.d) {
      continue;
    }
    // Rotating a w x d box by yaw grows its axis-aligned extent to
    // (|w cos| + |d sin|) x (|w sin| + |d cos|). Pad on top of that.
    const c = Math.abs(Math.cos(u.yaw));
    const s = Math.abs(Math.sin(u.yaw));
    const ex = (u.w * c + u.d * s) / 2 + FP_MAX_PAD;
    const ez = (u.w * s + u.d * c) / 2 + FP_MAX_PAD;
    const i0 = Math.floor((u.x - ex) / FP_CELL);
    const i1 = Math.floor((u.x + ex) / FP_CELL);
    const j0 = Math.floor((u.z - ez) / FP_CELL);
    const j1 = Math.floor((u.z + ez) / FP_CELL);
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) {
        const k = fpKey(i, j);
        let bucket = fpGrid.get(k);
        if (!bucket) {
          bucket = [];
          fpGrid.set(k, bucket);
        }
        bucket.push(u);
      }
    }
  }
  fpBuiltFor = STRUCTURES.length;
  return fpGrid;
}

/**
 * True if (x, z) falls inside a building footprint, grown by `pad` metres.
 *
 * Without this the scatter planted grass and pines through barn floors, house
 * interiors and shop rooms: the only settlement guard was inClearing(), which
 * covers the ranch and Silver Creek discs and nothing else on the map.
 *
 * `pad` is clamped to FP_MAX_PAD because the broad-phase buckets are built for
 * that margin; a larger request would miss buildings in neighbouring cells.
 */
export function insideStructure(x, z, pad = 0.75) {
  if (!fpGrid || fpBuiltFor !== STRUCTURES.length) {
    buildFootprintIndex();
  }
  const bucket = fpGrid.get(fpKey(Math.floor(x / FP_CELL), Math.floor(z / FP_CELL)));
  if (!bucket) {
    return false;
  }
  const m = pad > FP_MAX_PAD ? FP_MAX_PAD : pad;
  for (let n = 0; n < bucket.length; n += 1) {
    const u = bucket[n];
    // World to local: rotation.y = yaw maps local to world as
    // (lx*cos + lz*sin, -lx*sin + lz*cos), matching interiorCeilingAt.
    const cos = Math.cos(u.yaw);
    const sin = Math.sin(u.yaw);
    const dx = x - u.x;
    const dz = z - u.z;
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    if (Math.abs(lx) <= u.w / 2 + m && Math.abs(lz) <= u.d / 2 + m) {
      return true;
    }
  }
  return false;
}

/**
 * True if two yawed footprints overlap in plan, or come closer than
 * `clearance` metres. Used so a cross street cannot plant a lot inside an
 * already-built facade.
 */
export function footprintsOverlap(a, b, clearance = 0) {
  const corners = (p) => {
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    const hw = p.w / 2;
    const hd = p.d / 2;
    return [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd]
    ].map(([lx, lz]) => [p.x + c * lx - s * lz, p.z + s * lx + c * lz]);
  };
  const A = corners(a);
  const B = corners(b);
  const axes = [
    [Math.cos(a.yaw), Math.sin(a.yaw)],
    [-Math.sin(a.yaw), Math.cos(a.yaw)],
    [Math.cos(b.yaw), Math.sin(b.yaw)],
    [-Math.sin(b.yaw), Math.cos(b.yaw)]
  ];
  for (const [ux, uz] of axes) {
    const proj = (pts) => {
      const vs = pts.map(([px, pz]) => px * ux + pz * uz);
      return [Math.min(...vs), Math.max(...vs)];
    };
    const [amin, amax] = proj(A);
    const [bmin, bmax] = proj(B);
    if (amax + clearance < bmin || bmax + clearance < amin) {
      return false;
    }
  }
  return true;
}

/**
 * Build a roof solid from explicit vertices. `length` is the ridge axis span,
 * `width` the slope axis span, `rise` the ridge height above the eave, and
 * `ridgeLen` the ridge length (full for gable, length - width for hip).
 * Returns a single BufferGeometry mesh with computed normals.
 */
function buildRoof({ length, width, rise, ridgeLen, material }) {
  const hl = length / 2;
  const hw = width / 2;
  const hr = ridgeLen / 2;

  // Ridge endpoints
  const r0 = [-hr, rise, 0];
  const r1 = [hr, rise, 0];
  // Eave corners (z = ±hw)
  const s0 = [-hl, 0, hw];
  const s1 = [hl, 0, hw];
  const n0 = [-hl, 0, -hw];
  const n1 = [hl, 0, -hw];

  // Each face uses its own vertices (no sharing) so computeVertexNormals gives
  // each face its true geometric normal — the gable ends must point ±X, not up.
  const faces = [
    [r0, s0, s1, r1], // south slope (+Z)
    [r0, r1, n1, n0], // north slope (-Z)
    [r1, s1, n1],     // east end (+X)
    [r0, n0, s0]      // west end (-X)
  ];

  const positions = [];
  const indices = [];
  const push = (v) => positions.push(v[0], v[1], v[2]);
  for (const face of faces) {
    const base = positions.length / 3;
    for (const v of face) {
      push(v);
    }
    if (face.length === 4) {
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    } else {
      indices.push(base, base + 1, base + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  // One-sided planes vanish from below the eave and at glancing angles; roofs
  // are a shell, not a solid, so both sides have to draw.
  material.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Gable roof. Ridge along the long axis by default. `pitch` is rise/run
 * (0.5 = 6:12). `overhang` is added to both axes so the plan is always >= the
 * footprint. Returns a Group positioned so the eave sits at y = eave.
 */
export function gableRoof({ w, d, pitch, overhang = 0.45, eave = 0, ridgeAxis = "auto", material }) {
  const alongX = ridgeAxis === "auto" ? w >= d : ridgeAxis === "x";
  const length = (alongX ? w : d) + overhang * 2;
  const width = (alongX ? d : w) + overhang * 2;
  const rise = (width / 2) * pitch;
  const group = new THREE.Group();
  const roof = buildRoof({ length, width, rise, ridgeLen: length, material });
  if (!alongX) {
    roof.rotation.y = Math.PI / 2;
  }
  roof.position.y = eave;
  group.add(roof);
  markRoof(group, { roofBase: eave, roofTop: eave + rise, plan: { length, width }, type: "gable" });
  // Gable ends sit on the wall, not the overhang. Steeples mate here
  // (docs/ANCHORS.md). Ridge along X → ±X; along Z → ±Z after the roof yaw.
  if (alongX) {
    defineAnchor(group, "gableEnd.front", {
      position: { x: w / 2, y: eave, z: 0 },
      normal: { x: 1, y: 0, z: 0 }
    });
    defineAnchor(group, "gableEnd.back", {
      position: { x: -w / 2, y: eave, z: 0 },
      normal: { x: -1, y: 0, z: 0 }
    });
  } else {
    defineAnchor(group, "gableEnd.front", {
      position: { x: 0, y: eave, z: d / 2 },
      normal: { x: 0, y: 0, z: 1 }
    });
    defineAnchor(group, "gableEnd.back", {
      position: { x: 0, y: eave, z: -d / 2 },
      normal: { x: 0, y: 0, z: -1 }
    });
  }
  return group;
}

/**
 * Hip roof — a gable with a shortened ridge so the ends become hip slopes.
 */
export function hipRoof({ w, d, pitch, overhang = 0.45, eave = 0, ridgeAxis = "auto", material }) {
  const alongX = ridgeAxis === "auto" ? w >= d : ridgeAxis === "x";
  const length = (alongX ? w : d) + overhang * 2;
  const width = (alongX ? d : w) + overhang * 2;
  const rise = (width / 2) * pitch;
  const ridgeLen = Math.max(0.01, length - width);
  const group = new THREE.Group();
  const roof = buildRoof({ length, width, rise, ridgeLen, material });
  if (!alongX) {
    roof.rotation.y = Math.PI / 2;
  }
  roof.position.y = eave;
  group.add(roof);
  markRoof(group, { roofBase: eave, roofTop: eave + rise, plan: { length, width }, type: "hip" });
  return group;
}

/**
 * Shed roof — a single slope. By default high at the back (-Z) draining to the
 * front (+Z). With `highFront` the ridge sits at the front (+Z) and drains to
 * the rear (-Z), so a false-front parapet can hide the roof behind it.
 */
export function shedRoof({ w, d, pitch, overhang = 0.45, eave = 0, ridgeAxis = "auto", highFront = false, material }) {
  const alongX = ridgeAxis === "auto" ? w >= d : ridgeAxis === "x";
  const length = (alongX ? w : d) + overhang * 2;
  const width = (alongX ? d : w) + overhang * 2;
  const rise = width * pitch;
  const hl = length / 2;
  const hw = width / 2;
  const positions = [];
  const indices = [];
  const push = (v) => positions.push(v[0], v[1], v[2]);
  const base = positions.length / 3;
  const backY = highFront ? 0 : rise;
  const frontY = highFront ? rise : 0;
  push([-hl, backY, -hw]); push([hl, backY, -hw]); push([-hl, frontY, hw]); push([hl, frontY, hw]);
  const [A, B, C, D] = [0, 1, 2, 3].map((i) => base + i);
  indices.push(A, C, D, A, D, B);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  material.side = THREE.DoubleSide;
  const roof = new THREE.Mesh(geo, material);
  if (!alongX) {
    roof.rotation.y = Math.PI / 2;
  }
  const group = new THREE.Group();
  roof.position.y = eave;
  group.add(roof);
  markRoof(group, { roofBase: eave, roofTop: eave + rise, plan: { length, width }, type: "shed" });
  return group;
}

/**
 * Flat roof — a slab with a slight rear drain pitch.
 */
export function flatRoof({ w, d, overhang = 0.45, eave = 0, material }) {
  const group = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w + overhang * 2, 0.3, d + overhang * 2), material);
  slab.position.y = eave + 0.15;
  slab.castShadow = true;
  slab.receiveShadow = true;
  group.add(slab);
  markRoof(group, {
    roofBase: eave,
    roofTop: eave + 0.3,
    plan: { length: w + overhang * 2, width: d + overhang * 2 },
    type: "flat"
  });
  return group;
}

/**
 * A wall along +X with openings. `openings` is an array of
 * { x, w, h, fromFloor } (x is the opening center along the wall). Emits wall
 * segments around each opening, a header above it, and a sill under ground-
 * floor windows so they do not read as doors. Returns a Group. The wall's
 * bottom sits at y = 0 (the floor).
 */
export function wallX({ length, height, thickness, openings = [], material, y = 0 }) {
  const group = new THREE.Group();
  tag(group, "wall", { length, height, thickness, openings: openings.map((o) => ({ ...o })) });
  const segs = [];
  const sorted = [...openings].sort((a, b) => a.x - b.x);
  let cursor = -length / 2;
  for (const o of sorted) {
    const left = o.x - o.w / 2;
    const right = o.x + o.w / 2;
    if (left > cursor + 0.05) {
      segs.push([cursor, left]);
    }
    cursor = right;
  }
  if (length / 2 > cursor + 0.05) {
    segs.push([cursor, length / 2]);
  }
  for (const [a, b] of segs) {
    const w = b - a;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, thickness), material);
    mesh.position.set((a + b) / 2, y + height / 2, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const o of sorted) {
    const headerH = height - o.fromFloor - o.h;
    if (headerH > 0.05) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(o.w, headerH, thickness), material);
      mesh.position.set(o.x, y + o.fromFloor + o.h + headerH / 2, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      tag(mesh, "header", { openingW: o.w, openingH: o.h, fromFloor: o.fromFloor, class: o.class });
      group.add(mesh);
    } else if (o.fromFloor === 0) {
      group.userData.fullHeightDoor = true;
    }
    // Ground-floor windows: a sill under the hole so it does not read as a door.
    // Skip upper-story fromFloor values — those are not a slab from the floor.
    if (o.fromFloor > 0.05 && o.fromFloor <= 1.2) {
      const sill = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.fromFloor, thickness), material);
      sill.position.set(o.x, y + o.fromFloor / 2, 0);
      sill.castShadow = true;
      sill.receiveShadow = true;
      tag(sill, "sill", { openingW: o.w, openingH: o.h, fromFloor: o.fromFloor, class: o.class });
      group.add(sill);
    }
  }
  openings.forEach((o, i) => {
    defineAnchor(group, `opening.${i}`, {
      position: { x: o.x, y: y + (o.fromFloor || 0), z: 0 },
      normal: { x: 0, y: 0, z: 1 }
    });
  });
  defineAnchor(group, "wallSide", {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: -1 }
  });
  return group;
}

/**
 * A wall along +Z with openings (same semantics as wallX, rotated 90°).
 */
export function wallZ({ length, height, thickness, openings = [], material, y = 0 }) {
  const g = wallX({ length, height, thickness, openings, material, y });
  g.rotation.y = Math.PI / 2;
  return g;
}

/**
 * A door leaf. Origin is the hinge. `hinge` is the offset along the wall from
 * the opening center to that jamb (negative = left). `swing` is the open angle
 * around the hinge, not the leaf center. `frame` is the opening-center plug so
 * mate() pins the jamb, not the middle of the hole.
 */
export function doorLeaf({ width, height, thickness, hinge = 0, swing = 0, material, y = 0 }) {
  const group = new THREE.Group();
  tag(group, "door", { width, height, hinge });
  const pivot = new THREE.Group();
  pivot.rotation.y = swing;
  const intoOpening = hinge <= 0 ? 1 : -1;
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), material);
  leaf.position.set(intoOpening * width / 2, y + height / 2, 0);
  leaf.castShadow = true;
  leaf.receiveShadow = true;
  pivot.add(leaf);
  group.add(pivot);
  defineAnchor(group, "frame", {
    position: { x: -hinge, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: -1 }
  });
  return group;
}

/**
 * Chimney stack. Origin at the base (hearth plane). `exit` is the top, which
 * must clear the roof ridge (docs/ANCHORS.md).
 */
export function chimney({ width, height, depth, material }) {
  const d = depth ?? width;
  const group = new THREE.Group();
  tag(group, "chimney");
  const stack = new THREE.Mesh(new THREE.BoxGeometry(width, height, d), material);
  stack.position.y = height / 2;
  stack.castShadow = true;
  group.add(stack);
  defineAnchor(group, "base", {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: -1, z: 0 }
  });
  defineAnchor(group, "exit", {
    position: { x: 0, y: height, z: 0 },
    normal: { x: 0, y: 1, z: 0 }
  });
  return group;
}

/**
 * Anvil block. Origin at the base so `base` mates to `footing`.
 */
export function anvil({ width = 1.1, height = 0.7, depth = 0.5, material }) {
  const group = new THREE.Group();
  tag(group, "anvil");
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.y = height / 2;
  mesh.castShadow = true;
  group.add(mesh);
  defineAnchor(group, "base", {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: -1, z: 0 }
  });
  return group;
}

/**
 * A box that sits on a surface. Origin at the base so `base` mates to
 * `footing` (or any +Y socket). `y` in the mate offset is extra lift above
 * the socket — 0 seats the block on the floor.
 */
export function block({ w, h, d, material, role = "prop", extra = {} }) {
  const group = new THREE.Group();
  tag(group, role, extra);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  defineAnchor(group, "base", {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: -1, z: 0 }
  });
  return group;
}

/**
 * A cylinder that sits on a surface. Origin at the base so `base` mates to
 * `footing`. Mesh is the same CylinderGeometry the typed `cylAt` used.
 */
export function post({ rTop, rBot, h, material, radialSegments = 8, role = "prop", extra = {} }) {
  const group = new THREE.Group();
  tag(group, role, extra);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, radialSegments), material);
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  defineAnchor(group, "base", {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: -1, z: 0 }
  });
  return group;
}

/**
 * A cone that sits on a surface. Origin at the base so `base` mates to
 * `footing`. Mesh is the same ConeGeometry the typed `coneAt` used.
 */
export function cone({ r, h, material, radialSegments = 7, role = "prop", extra = {} }) {
  const group = new THREE.Group();
  tag(group, role, extra);
  const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, radialSegments), material);
  mesh.position.y = h / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  defineAnchor(group, "base", {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: -1, z: 0 }
  });
  return group;
}

/**
 * A pad on the terrain at a single heightAt sample — the same seat as
 * `place()` / `boxAt`, not four-corner footing(). Pass `y` to sit on WATER
 * (or any other plane) instead of terrain. Has a `footing` frame so pieces
 * can mate without registering a kit structure.
 */
export function grounded({ x, z, y, yaw = 0, name } = {}) {
  const group = new THREE.Group();
  if (name) {
    group.userData.name = name;
  }
  group.position.set(x, y ?? heightAt(x, z), z);
  group.rotation.y = yaw;
  defineAnchor(group, "footing", {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 }
  });
  return group;
}

/**
 * Typed `boxAt`: a block mated to a grounded pad. Returns the block so the
 * caller can yaw it. Does not register a kit structure.
 */
export function boxOnGround(parent, x, z, w, h, d, material, collide = true, yOff = 0) {
  const pad = grounded({ x, z });
  const piece = block({ w, h, d, material });
  mate(piece, "base", anchorsOf(pad).get("footing"), { offset: { y: yOff } });
  parent.add(pad);
  if (collide) {
    addBoxCollider(x, z, w / 2, d / 2);
  }
  return piece;
}

/**
 * Typed box whose base sits on an explicit world Y, not heightAt. Dock
 * decks use WATER; a terrain pad would float them or drown them.
 */
export function boxOnPlane(parent, x, y, z, w, h, d, material, collide = true, yOff = 0) {
  const pad = grounded({ x, z, y });
  const piece = block({ w, h, d, material });
  mate(piece, "base", anchorsOf(pad).get("footing"), { offset: { y: yOff } });
  parent.add(pad);
  if (collide) {
    addBoxCollider(x, z, w / 2, d / 2);
  }
  return piece;
}

/**
 * Typed fence rail: a box centered at (x, y, z) whose inner mesh looks at a
 * neighbor. lookAt runs on the mesh (origin at center), not the base group.
 */
export function boxLookAt(parent, x, y, z, w, h, d, tx, ty, tz, material) {
  const pad = grounded({ x, z, y: y - h / 2 });
  const piece = block({ w, h, d, material });
  mate(piece, "base", anchorsOf(pad).get("footing"));
  parent.add(pad);
  pad.updateMatrixWorld(true);
  piece.children[0].lookAt(tx, ty, tz);
  return piece;
}

/**
 * A wheel mated to an existing pad. `y` is the typed mesh-center height above
 * the pad. Inner-mesh rotation around X or Z matches the typed axle.
 */
export function wheelOn(pad, { x, y, z, r, thick, material, axis, radialSegments = 8 }) {
  const piece = post({ rTop: r, rBot: r, h: thick, material, radialSegments });
  mate(piece, "base", anchorsOf(pad).get("footing"), { offset: { x, y: y - thick / 2, z } });
  if (axis === "x") {
    piece.children[0].rotation.x = Math.PI / 2;
  } else if (axis === "z") {
    piece.children[0].rotation.z = Math.PI / 2;
  }
  return piece;
}

/**
 * Typed `cylAt`: a post mated to a grounded pad. Does not register a kit
 * structure.
 */
export function cylOnGround(parent, x, z, rTop, rBot, h, material, collide = true, colliderR, yOff = 0, radialSegments = 8) {
  const pad = grounded({ x, z });
  const piece = post({ rTop, rBot, h, material, radialSegments });
  mate(piece, "base", anchorsOf(pad).get("footing"), { offset: { y: yOff } });
  parent.add(pad);
  if (collide) {
    addCylinderCollider(x, z, colliderR ?? Math.max(rTop, rBot));
  }
  return piece;
}

/**
 * Typed cylinder whose base sits on an explicit world Y, not heightAt.
 * Headframe sheave uses the mill sample so the wheel stays on the A-frame.
 */
export function cylOnPlane(parent, x, y, z, rTop, rBot, h, material, collide = true, colliderR, yOff = 0, radialSegments = 8) {
  const pad = grounded({ x, z, y });
  const piece = post({ rTop, rBot, h, material, radialSegments });
  mate(piece, "base", anchorsOf(pad).get("footing"), { offset: { y: yOff } });
  parent.add(pad);
  if (collide) {
    addCylinderCollider(x, z, colliderR ?? Math.max(rTop, rBot));
  }
  return piece;
}

/**
 * Typed `coneAt`: a cone mated to a grounded pad. Does not register a kit
 * structure.
 */
export function coneOnGround(parent, x, z, r, h, material, collide = false, yOff = 0, colliderR, radialSegments = 7) {
  const pad = grounded({ x, z });
  const piece = cone({ r, h, material, radialSegments });
  mate(piece, "base", anchorsOf(pad).get("footing"), { offset: { y: yOff } });
  parent.add(pad);
  if (collide) {
    addCylinderCollider(x, z, colliderR ?? r * 0.45);
  }
  return piece;
}

/**
 * Typed cone whose base sits on an explicit world Y, not heightAt. Tailings
 * piles use the mill's sample so they do not stair-step on a slope.
 */
export function coneOnPlane(parent, x, y, z, r, h, material, collide = false, yOff = 0, colliderR, radialSegments = 7) {
  const pad = grounded({ x, z, y });
  const piece = cone({ r, h, material, radialSegments });
  mate(piece, "base", anchorsOf(pad).get("footing"), { offset: { y: yOff } });
  parent.add(pad);
  if (collide) {
    addCylinderCollider(x, z, colliderR ?? r * 0.45);
  }
  return piece;
}

/**
 * False-front parapet: street board, side returns, and a cap. Origin at the
 * facade plane so `wallSide` mates to `face.front`. Dimensions match the
 * typed Silver Creek lots (parapet 0.3 m in front of the wall).
 */
export function falseFront({ w, d, eave, height, material, capMaterial }) {
  const group = new THREE.Group();
  tag(group, "falseFront", { height });
  const ffZ = 0.3;
  const board = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, height, 0.4), material);
  board.position.set(0, eave + height / 2, ffZ);
  board.castShadow = true;
  board.receiveShadow = true;
  tag(board, "falseFront");
  group.add(board);

  for (const sx of [-w / 2 - 0.3, w / 2 + 0.3]) {
    const ret = new THREE.Mesh(new THREE.BoxGeometry(0.4, eave + height, d + 0.6), material);
    ret.position.set(sx, (eave + height) / 2, -d / 2);
    ret.castShadow = true;
    ret.receiveShadow = true;
    tag(ret, "falseFront");
    group.add(ret);
  }

  const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 1.0, 0.32, 0.8), capMaterial);
  cap.position.set(0, eave + height + 0.02, ffZ + 0.12);
  cap.castShadow = true;
  cap.receiveShadow = true;
  tag(cap, "falseFront");
  group.add(cap);

  defineAnchor(group, "wallSide", {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: -1 }
  });
  return group;
}

/**
 * Church steeple: square tower plus spire. Origin at the base so `gable`
 * plugs into `gableEnd.front` (opposed ±X).
 */
export function steeple({ material, towerH = 4.5, towerW = 1.4, spireH = 2.2, spireR = 0.7 }) {
  const group = new THREE.Group();
  tag(group, "steeple");
  const tower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerW), material);
  tower.position.y = towerH / 2;
  tower.castShadow = true;
  tag(tower, "steeple");
  group.add(tower);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(spireR, spireH, 4), material);
  spire.position.y = towerH + spireH / 2;
  spire.castShadow = true;
  tag(spire, "steeple");
  group.add(spire);
  defineAnchor(group, "gable", {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: -1, y: 0, z: 0 }
  });
  return group;
}

/**
 * Adobe parapet caps around the four wall tops. Origin at the eave plane so
 * `base` mates to `wallTop`.
 */
export function parapet({ w, d, height = 0.42, material }) {
  const group = new THREE.Group();
  tag(group, "parapet", { height });
  for (const [px, pz, pw, pd] of [
    [0, d / 2, w + 0.24, 0.2],
    [0, -d / 2, w + 0.24, 0.2],
    [w / 2, 0, 0.2, d],
    [-w / 2, 0, 0.2, d]
  ]) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(pw, height, pd), material);
    cap.position.set(px, height / 2, pz);
    cap.castShadow = true;
    group.add(cap);
  }
  defineAnchor(group, "base", {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: -1, z: 0 }
  });
  return group;
}

/**
 * Front-door steps. Origin at the lowest tread centre so `wallSide` mates to
 * a porch `deckEdge` (or a wall face) with a small outward offset.
 */
export function steps({ count = 2, width, rise = 0.16, tread = 0.5, stepUp = 0.14, material }) {
  const group = new THREE.Group();
  tag(group, "steps", { count, width, rise, tread });
  for (let i = 0; i < count; i += 1) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(width, rise, tread), material);
    step.position.set(0, rise / 2 + i * stepUp, -i * tread);
    step.castShadow = true;
    step.receiveShadow = true;
    group.add(step);
  }
  defineAnchor(group, "wallSide", {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: -1 }
  });
  return group;
}

/**
 * Adobe vigas: round beams jutting through the front wall. Origin at the
 * facade so `wallSide` mates to `face.front`.
 */
export function vigas({ w, eave, material, spacing = 1.6 }) {
  const group = new THREE.Group();
  tag(group, "vigas");
  const n = Math.max(3, Math.round(w / spacing));
  for (let i = 0; i < n; i += 1) {
    const vx = -w / 2 + 0.7 + (i / (n - 1)) * (w - 1.4);
    const viga = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.15, 6), material);
    viga.rotation.x = Math.PI / 2;
    viga.position.set(vx, eave - 0.12, 0.45);
    viga.castShadow = true;
    group.add(viga);
  }
  defineAnchor(group, "wallSide", {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: -1 }
  });
  return group;
}

/**
 * Window pane. Origin at the sill center; the glass sits at height/2.
 */
export function glazing({ width, height, thickness, material }) {
  const group = new THREE.Group();
  tag(group, "window", { sill: 0, head: height, width, height });
  const pane = new THREE.Mesh(new THREE.BoxGeometry(width, height, thickness), material);
  pane.position.y = height / 2;
  group.add(pane);
  defineAnchor(group, "frame", {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: -1 }
  });
  return group;
}

/**
 * A porch: deck, posts, beam, rail, and a shed roof over it. `depth` is the
 * porch depth (along +Z from the front wall). Returns a Group.
 */
export function porch({ width, depth, eave, postSpacing = 2.4, material, roofMaterial, y = 0 }) {
  const group = new THREE.Group();
  tag(group, "porch");
  const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.2, depth), material);
  deck.position.set(0, y + 0.1, depth / 2);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  const nPosts = Math.max(2, Math.round(width / postSpacing) + 1);
  const postH = eave - 0.2;
  for (let i = 0; i < nPosts; i += 1) {
    const px = -width / 2 + (i / (nPosts - 1)) * width;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, postH, 0.22), material);
    post.position.set(px, y + 0.2 + postH / 2, depth);
    post.castShadow = true;
    group.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(width, 0.2, 0.22), material);
  beam.position.set(0, y + eave - 0.1, depth);
  beam.castShadow = true;
  group.add(beam);

  const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, 0.1), material);
  rail.position.set(0, y + 0.9, depth);
  group.add(rail);

  const shed = shedRoof({ w: width, d: depth, pitch: 0.2, overhang: 0.2, eave: y + eave, material: roofMaterial });
  shed.position.z = depth / 2;
  group.add(shed);
  defineAnchor(group, "wallSide", {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 1, z: 0 }
  });
  defineAnchor(group, "deckEdge", {
    position: { x: 0, y: 0, z: depth },
    normal: { x: 0, y: 0, z: 1 }
  });
  defineAnchor(group, "roofSocket", {
    position: { x: 0, y: eave, z: depth },
    normal: { x: 0, y: 1, z: 0 },
    up: { x: 0, y: 0, z: -1 },
    required: true
  });
  defineAnchor(shed, "base", {
    position: { x: 0, y: shed.userData.roofBase ?? y + eave, z: 0 },
    normal: { x: 0, y: -1, z: 0 },
    up: { x: 0, y: 0, z: 1 }
  });
  recordMate(shed, "base", group, "roofSocket");
  return group;
}

/**
 * A raised boardwalk — a continuous deck along a street, seated above the
 * ground, with a front edge and posts. `length` runs along the street axis,
 * `width` across it. Returns a Group.
 */
export function boardwalk({ length, width, height = 0.45, material, y = 0 }) {
  const group = new THREE.Group();
  tag(group, "boardwalk", { length, width, height });
  // A solid raised deck: thick enough to read as an elevated platform, not a
  // thin slab that vanishes edge-on at distance.
  const deck = new THREE.Mesh(new THREE.BoxGeometry(length, 0.5, width), material);
  deck.position.set(0, y + height, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  // A front fascia board makes the raised edge read clearly against the street.
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(length, height + 0.5, 0.18), material);
  fascia.position.set(0, y + (height + 0.5) / 2, -width / 2);
  fascia.castShadow = true;
  group.add(fascia);

  const nPosts = Math.max(2, Math.round(length / 3) + 1);
  for (let i = 0; i < nPosts; i += 1) {
    const px = -length / 2 + (i / (nPosts - 1)) * length;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, height, 0.3), material);
    post.position.set(px, y + height / 2, 0);
    post.castShadow = true;
    group.add(post);
  }
  return group;
}

/**
 * Emit oriented box colliders for a structure's walls in the local frame.
 * `walls` is an array of { x, z, halfX, halfZ } in local coords. The collider
 * is derived from the geometry, not typed in beside it.
 */
/**
 * Emit oriented box colliders for a structure's walls in the local frame.
 * `walls` is an array of { x, z, halfX, halfZ, openings } where `openings` is
 * an optional array of { x, w } (opening center and width along the wall) to
 * leave a gap in the collider (e.g. a doorway). The collider is derived from
 * the geometry, not typed in beside it.
 */
export function collide(group, x, z, yaw, walls) {
  group.userData.colliderWalls = walls.map((w) => ({ ...w, openings: (w.openings || []).map((o) => ({ ...o })) }));
  // The collider layer rotates a local offset by +phi in (x,z); three.js maps
  // local to world with rotation.y = yaw, which is -yaw in that convention.
  // Use -yaw so a wall's colliders land on the wall as rendered — otherwise
  // the door gap is mirrored onto the opposite side of the facade.
  const phi = -yaw;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const rot = (lx, lz) => ({ x: x + lx * cos - lz * sin, z: z + lx * sin + lz * cos });
  for (const wall of walls) {
    const openings = wall.openings || [];
    if (!openings.length) {
      const p = rot(wall.x, wall.z);
      addOrientedBoxCollider(p.x, p.z, wall.halfX + 0.1, wall.halfZ + 0.1, phi);
      continue;
    }
    // Split the wall collider around each opening. `axis` is "x" if the wall
    // runs along +X (halfX is the long half-extent), else "z". The long axis
    // gets no margin so the door gap stays wide enough for the player; the
    // thickness axis gets a small margin so the wall still blocks.
    const axis = wall.halfX >= wall.halfZ ? "x" : "z";
    const half = axis === "x" ? wall.halfX : wall.halfZ;
    const thick = axis === "x" ? wall.halfZ : wall.halfX;
    const sorted = [...openings].sort((a, b) => a.x - b.x);
    let cursor = -half;
    for (const o of sorted) {
      const left = o.x - o.w / 2;
      const right = o.x + o.w / 2;
      if (left > cursor + 0.05) {
        const c = (cursor + left) / 2;
        const h = (left - cursor) / 2;
        if (axis === "x") {
          const p = rot(c, wall.z);
          addOrientedBoxCollider(p.x, p.z, h, thick + 0.1, phi);
        } else {
          const p = rot(wall.x, c);
          addOrientedBoxCollider(p.x, p.z, thick + 0.1, h, phi);
        }
      }
      cursor = right;
    }
    if (half > cursor + 0.05) {
      const c = (cursor + half) / 2;
      const h = (half - cursor) / 2;
      if (axis === "x") {
        const p = rot(c, wall.z);
        addOrientedBoxCollider(p.x, p.z, h, thick + 0.1, phi);
      } else {
        const p = rot(wall.x, c);
        addOrientedBoxCollider(p.x, p.z, thick + 0.1, h, phi);
      }
    }
  }
}

/**
 * High-level structure builder. Builds a parent Group at (x, z) rotated to
 * `yaw`, seats it on the terrain via footing, and records metadata on
 * userData for the geometry checks.
 */
export function structure({
  x, z, yaw = 0, w, d, eave, foundation = false, material,
  name = "structure", waterAdjacent = false, habitable = false, lift = 0
}) {
  const f = footing(x, z, w, d, yaw);
  // `lift` seats the floor deliberately above the terrain — a plinth, so a
  // storefront threshold can meet a raised boardwalk instead of sitting in the
  // dirt while the deck rides over the door. The skirt then spans the whole
  // gap, terrain to floor, which is what invariant 7 already requires.
  const seatY = f.y + lift;
  const skirtDrop = f.drop + lift;
  const group = new THREE.Group();
  group.position.set(x, seatY, z);
  group.rotation.y = yaw;
  group.name = name;
  group.userData = {
    kind: name,
    name,
    x,
    z,
    w,
    d,
    eave,
    yaw,
    placementY: seatY,
    lift,
    drop: f.drop,
    foundation: Boolean(foundation),
    foundationEmitted: false,
    wallTop: seatY + eave,
    waterAdjacent: Boolean(waterAdjacent),
    habitable: Boolean(habitable)
  };
  if (foundation && skirtDrop > 0.15) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, skirtDrop + 0.2, d + 0.4), material);
    skirt.position.y = -skirtDrop / 2 - 0.1;
    skirt.castShadow = true;
    skirt.receiveShadow = true;
    tag(skirt, "foundation");
    group.add(skirt);
    group.userData.foundationEmitted = true;
  }
  STRUCTURES.push(group);
  defineAnchor(group, "face.front", {
    position: { x: 0, y: 0, z: d / 2 },
    normal: { x: 0, y: 0, z: 1 }
  });
  defineAnchor(group, "face.back", {
    position: { x: 0, y: 0, z: -d / 2 },
    normal: { x: 0, y: 0, z: -1 }
  });
  defineAnchor(group, "face.right", {
    position: { x: w / 2, y: 0, z: 0 },
    normal: { x: 1, y: 0, z: 0 }
  });
  defineAnchor(group, "face.left", {
    position: { x: -w / 2, y: 0, z: 0 },
    normal: { x: -1, y: 0, z: 0 }
  });
  defineAnchor(group, "footing", {
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: 1, z: 0 }
  });
  defineAnchor(group, "wallTop", {
    position: { x: 0, y: eave, z: 0 },
    normal: { x: 0, y: 1, z: 0 }
  });
  return group;
}
