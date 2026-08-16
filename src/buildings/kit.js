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
import { addOrientedBoxCollider } from "../collision.js";
import { defineAnchor, recordMate } from "./anchors.js";

/** Registry of every structure Group built via structure(), for the geometry checks. */
export const STRUCTURES = [];

/** Lakeside meshes that must sit on WATER, not terrain. */
export const WATER_PLACED = [];

export function clearStructures() {
  STRUCTURES.length = 0;
  WATER_PLACED.length = 0;
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
  const deck = new THREE.Mesh(new THREE.BoxGeometry(length, 0.4, width), material);
  deck.position.set(0, y + height, 0);
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  // A front fascia board makes the raised edge read clearly against the street.
  const fascia = new THREE.Mesh(new THREE.BoxGeometry(length, height + 0.4, 0.16), material);
  fascia.position.set(0, y + (height + 0.4) / 2, -width / 2);
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
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const rot = (lx, lz) => ({ x: x + lx * cos - lz * sin, z: z + lx * sin + lz * cos });
  for (const wall of walls) {
    const openings = wall.openings || [];
    if (!openings.length) {
      const p = rot(wall.x, wall.z);
      addOrientedBoxCollider(p.x, p.z, wall.halfX + 0.1, wall.halfZ + 0.1, yaw);
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
          addOrientedBoxCollider(p.x, p.z, h, thick + 0.1, yaw);
        } else {
          const p = rot(wall.x, c);
          addOrientedBoxCollider(p.x, p.z, thick + 0.1, h, yaw);
        }
      }
      cursor = right;
    }
    if (half > cursor + 0.05) {
      const c = (cursor + half) / 2;
      const h = (half - cursor) / 2;
      if (axis === "x") {
        const p = rot(c, wall.z);
        addOrientedBoxCollider(p.x, p.z, h, thick + 0.1, yaw);
      } else {
        const p = rot(wall.x, c);
        addOrientedBoxCollider(p.x, p.z, thick + 0.1, h, yaw);
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
  name = "structure", waterAdjacent = false, habitable = false
}) {
  const f = footing(x, z, w, d, yaw);
  const group = new THREE.Group();
  group.position.set(x, f.y, z);
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
    placementY: f.y,
    drop: f.drop,
    foundation: Boolean(foundation),
    foundationEmitted: false,
    wallTop: f.y + eave,
    waterAdjacent: Boolean(waterAdjacent),
    habitable: Boolean(habitable)
  };
  if (foundation && f.drop > 0.15) {
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, f.drop + 0.2, d + 0.4), material);
    skirt.position.y = -f.drop / 2 - 0.1;
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
