/** Rail ballast, unfinished rail, and creek bridges.
 * Stage / road / trail ribbons are retired — those are the terrain gravel splat.
 */
import * as THREE from "three/webgpu";
import { heightAt, dirtTexture } from "./world.js";
import {
  ROADS,
  BRIDGES,
  mapToWorld,
  samplePolyline,
  polylineLength,
  bridgeLift,
  headingRotationY
} from "./map.js";
import { TEXTURE_SETS } from "./materials/textureManifest.ts";
import { tryLoadTexture } from "./materials/loadTexture.ts";

const KIND_LOOK = {
  stage: { color: [0.38, 0.25, 0.14], rut: [0.24, 0.14, 0.08], lift: 0.22, slices: 5 },
  road: { color: [0.44, 0.3, 0.16], rut: [0.3, 0.18, 0.1], lift: 0.2, slices: 3 },
  trail: { color: [0.5, 0.36, 0.2], rut: [0.36, 0.24, 0.12], lift: 0.16, slices: 2 },
  rail: { color: [0.34, 0.32, 0.28], rut: [0.26, 0.24, 0.22], lift: 0.14, slices: 2 }
};

const UV_ALONG = 12;
let ribbonDirt = null;

function ribbonDirtMap() {
  if (!ribbonDirt) {
    ribbonDirt = dirtTexture();
    ribbonDirt.wrapS = THREE.RepeatWrapping;
    ribbonDirt.wrapT = THREE.RepeatWrapping;
  }
  return ribbonDirt;
}

function dirtMat(map) {
  return new THREE.MeshStandardNodeMaterial({
    color: 0xffffff,
    map: map || ribbonDirtMap(),
    roughness: 0.96,
    metalness: 0.02,
    vertexColors: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
}

function mixColor(a, b, t) {
  return [
    a[0] * (1 - t) + b[0] * t,
    a[1] * (1 - t) + b[1] * t,
    a[2] * (1 - t) + b[2] * t
  ];
}

function sliceColor(look, slices, s) {
  if (slices === 2) {
    return s === 0 ? look.color : look.rut;
  }
  const u = slices === 1 ? 0 : s / (slices - 1);
  const fromCenter = Math.abs(u - 0.5) * 2;
  const rutBand = fromCenter > 0.25 && fromCenter < 0.75 ? 1 - Math.abs(fromCenter - 0.5) * 2 : 0;
  return mixColor(look.color, look.rut, rutBand);
}

function tangentAt(samples, i) {
  const prev = samples[Math.max(0, i - 1)];
  const next = samples[Math.min(samples.length - 1, i + 1)];
  const dx = next.x - prev.x;
  const dz = next.z - prev.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

export function ribbonSamples(road, spacing = 7) {
  const look = KIND_LOOK[road.kind] || KIND_LOOK.road;
  const lift = road.lift || look.lift;
  const samples = samplePolyline(road.pts, spacing);
  return samples.map((p, i) => {
    const tan = tangentAt(samples, i);
    return {
      x: p.x,
      y: heightAt(p.x, p.z) + lift + bridgeLift(p.x, p.z),
      z: p.z,
      tx: tan.x,
      tz: tan.z,
      lift
    };
  });
}

function makeRibbonMesh(road, samples, map) {
  const look = KIND_LOOK[road.kind] || KIND_LOOK.road;
  const slices = look.slices;
  const half = road.width * 0.5;
  const dashed = road.kind === "trail";
  const dash = 8;
  const gap = 5;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  let along = 0;
  let prevOn = false;
  let base = 0;

  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (i > 0) {
      along += Math.hypot(s.x - samples[i - 1].x, s.z - samples[i - 1].z);
    }
    const on = !dashed || along % (dash + gap) < dash;
    const px = -s.tz;
    const pz = s.tx;
    for (let k = 0; k < slices; k += 1) {
      const u = slices === 1 ? 0 : k / (slices - 1);
      const across = (u - 0.5) * 2 * half;
      const x = s.x + px * across;
      const z = s.z + pz * across;
      const y = heightAt(x, z) + s.lift + bridgeLift(x, z);
      positions.push(x, y, z);
      uvs.push(u, along / UV_ALONG);
      const c = sliceColor(look, slices, k);
      colors.push(c[0], c[1], c[2]);
    }
    if (i > 0 && on && prevOn) {
      for (let k = 0; k < slices - 1; k += 1) {
        const a = base + k;
        const b = base + k + 1;
        const c = base - slices + k;
        const d = base - slices + k + 1;
        indices.push(c, a, d, d, a, b);
      }
    }
    prevOn = on;
    base += slices;
  }

  if (indices.length < 3) {
    return null;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, dirtMat(map));
  if (mesh.material.map) {
    mesh.material.map.wrapS = THREE.RepeatWrapping;
    mesh.material.map.wrapT = THREE.RepeatWrapping;
  }
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.kind = road.kind;
  mesh.userData.name = road.name;
  return mesh;
}

function addRail(group, road, map) {
  const samples = ribbonSamples(road, 5);
  const ballast = makeRibbonMesh(road, samples, map);
  if (ballast) {
    group.add(ballast);
  }
  const tieMat = new THREE.MeshStandardNodeMaterial({ color: 0x5a4030, roughness: 0.92 });
  const railMat = new THREE.MeshStandardNodeMaterial({
    color: 0x4a4a4e,
    metalness: 0.55,
    roughness: 0.4
  });
  const pileMat = new THREE.MeshStandardNodeMaterial({ color: 0x6a4e32, roughness: 0.9 });
  const tieGeo = new THREE.BoxGeometry(4.1, 0.16, 0.38);
  const railGeo = new THREE.BoxGeometry(0.12, 0.12, 1);
  let along = 0;
  const builtUntil = polylineLength(road.pts) * 0.72;

  const ties = [];
  const rails = [];
  const piles = [];
  const dummy = new THREE.Object3D();

  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    along += seg;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const my = (a.y + b.y) / 2;
    const inv = seg || 1;
    const px = -(b.z - a.z) / inv;
    const pz = (b.x - a.x) / inv;

    if (along % 2.3 < seg + 0.05) {
      dummy.position.set(mx, my + 0.04, mz);
      dummy.rotation.set(0, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      ties.push(dummy.matrix.clone());
    }

    if (along < builtUntil) {
      for (const side of [-0.58, 0.58]) {
        dummy.position.set(mx + px * side, my + 0.16, mz + pz * side);
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(1, 1, seg + 0.04);
        dummy.updateMatrix();
        rails.push(dummy.matrix.clone());
      }
    } else if (i % 7 === 0) {
      const ox = mx + px * 3.2;
      const oz = mz + pz * 3.2;
      dummy.position.set(ox, heightAt(ox, oz) + 0.28, oz);
      dummy.rotation.set(0, yaw * 0.4, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      piles.push(dummy.matrix.clone());
    }
  }

  if (ties.length) {
    const tieMesh = new THREE.InstancedMesh(tieGeo, tieMat, ties.length);
    ties.forEach((m, i) => tieMesh.setMatrixAt(i, m));
    tieMesh.instanceMatrix.needsUpdate = true;
    tieMesh.count = ties.length;
    tieMesh.receiveShadow = true;
    group.add(tieMesh);
  }
  if (rails.length) {
    const railMesh = new THREE.InstancedMesh(railGeo, railMat, rails.length);
    rails.forEach((m, i) => railMesh.setMatrixAt(i, m));
    railMesh.instanceMatrix.needsUpdate = true;
    railMesh.count = rails.length;
    group.add(railMesh);
  }
  if (piles.length) {
    const pileMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.55, 1.1), pileMat, piles.length);
    piles.forEach((m, i) => pileMesh.setMatrixAt(i, m));
    pileMesh.instanceMatrix.needsUpdate = true;
    pileMesh.count = piles.length;
    pileMesh.castShadow = true;
    group.add(pileMesh);
  }
}

/**
 * Timber trestle bridges.
 *
 * A bridge used to be three boxes: one deck slab and two continuous rails,
 * hovering 2.4-4.2 m over the creek along their whole length with nothing
 * reaching the ground anywhere, not even at the abutments. They read as
 * floating planks because structurally that is all they were.
 *
 * A real timber crossing carries its deck on stringers, the stringers on
 * bents, and the bents on posts driven into the bank. That load path is what
 * the eye reads as "bridge", so it is built here: transverse decking, four
 * longitudinal stringers, bents at intervals with capped and cross-braced
 * posts that run down to wherever the terrain actually is, timber abutment
 * cribs at both banks, and railings made of posts with top and mid rails
 * instead of one floating bar.
 *
 * Everything is built inside a group positioned at the crossing and rotated by
 * the bridge yaw, so local x is across the deck, local z runs along it, and
 * local y stays world height (the group has no Y offset and no other rotation).
 */
const BENT_SPACING = 4.4;
const POST_EMBED = 0.45;
/** Grow the deck per end until the ground is within this of it, then abut. */
const LAND_DROP = 1.1;
const MAX_HALF_SPAN = 22;

function addBridges(group) {
  const deckMat = new THREE.MeshStandardNodeMaterial({ color: 0x6b4a2c, roughness: 0.88 });
  const railMat = new THREE.MeshStandardNodeMaterial({ color: 0x4a3020, roughness: 0.9 });
  const beamMat = new THREE.MeshStandardNodeMaterial({ color: 0x51371f, roughness: 0.92 });
  const postMat = new THREE.MeshStandardNodeMaterial({ color: 0x412c19, roughness: 0.94 });
  const cribMat = new THREE.MeshStandardNodeMaterial({ color: 0x6a5334, roughness: 0.95 });
  const footingMat = new THREE.MeshStandardNodeMaterial({ color: 0x6d6555, roughness: 0.97 });

  for (const br of BRIDGES) {
    const p = mapToWorld(br.u, br.v);
    const y = heightAt(p.x, p.z) + bridgeLift(p.x, p.z) + 0.22;
    const spin = headingRotationY(br.yaw);
    const cos = Math.cos(spin);
    const sin = Math.sin(spin);

    const bridge = new THREE.Group();
    bridge.name = `bridge-${br.name}`;
    bridge.position.set(p.x, 0, p.z);
    bridge.rotation.y = spin;
    group.add(bridge);

    // Local (across, along) -> world, for sampling terrain under a member.
    const worldX = (lx, lz) => p.x + lx * cos + lz * sin;
    const worldZ = (lx, lz) => p.z - lx * sin + lz * cos;

    /** Box with its base at `baseY`, in the bridge's local frame. */
    const beam = (lx, baseY, lz, w, h, d, mat) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(lx, baseY + h / 2, lz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      bridge.add(mesh);
      return mesh;
    };

    // How long the bridge actually has to be.
    //
    // The authored span (18 m / 16 m) stopped with the deck still 2.4-2.8 m
    // above the ground at both ends, so the trestle finished in mid-air. The
    // crossing is not a channel with banks — creekFactor is still 0.42 fifty
    // metres out — it is a broad shallow wash, and the ground only climbs back
    // to deck level around 37 m from the centre.
    //
    // The other way to close that gap is to raise the ground instead, which is
    // what bridgeLift was authored for. It cannot work here: the heightfield
    // bakes on a 12.5 m grid, so an abutment 9 m from the centre is barely one
    // cell and any embankment smears across it. The deck is authored geometry
    // and lands exactly where it is put, so the deck goes to the ground: the
    // trestle grows until the drop is small enough for an abutment to close,
    // per end, since the banks are not symmetric.
    const deckTop = y + 0.16;
    const reachEnd = (dir) => {
      let d = br.length / 2;
      for (; d <= MAX_HALF_SPAN; d += 0.5) {
        if (deckTop - heightAt(p.x + sin * d * dir, p.z + cos * d * dir) <= LAND_DROP) {
          break;
        }
      }
      return Math.min(d, MAX_HALF_SPAN);
    };
    const halfA = reachEnd(-1);
    const halfB = reachEnd(1);
    const zA = -halfA;
    const zB = halfB;
    const span = halfA + halfB;
    const mid = (zA + zB) / 2;
    const PLANK = 0.14;
    const STRINGER = 0.36;
    const CAP = 0.24;
    const plankBase = deckTop - PLANK;
    const stringerBase = plankBase - STRINGER;
    const capBase = stringerBase - CAP;

    // --- transverse decking: individual planks with gaps, not one slab ---
    const step = 0.46;
    const plankCount = Math.max(2, Math.floor(span / step));
    const planks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(br.width, PLANK, step * 0.82),
      deckMat,
      plankCount
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < plankCount; i += 1) {
      const lz = zA + (i + 0.5) * (span / plankCount);
      // A little sag and scuff so the deck is not a machined grid.
      const wobble = Math.sin(i * 2.7) * 0.012;
      dummy.position.set(Math.sin(i * 1.3) * 0.02, plankBase + PLANK / 2 + wobble, lz);
      dummy.rotation.set(0, Math.sin(i * 0.9) * 0.006, 0);
      dummy.updateMatrix();
      planks.setMatrixAt(i, dummy.matrix);
    }
    planks.instanceMatrix.needsUpdate = true;
    planks.castShadow = true;
    planks.receiveShadow = true;
    bridge.add(planks);

    // --- stringers: what the decking actually rests on ---
    const stringerAt = [-0.38, -0.13, 0.13, 0.38];
    for (const f of stringerAt) {
      beam(f * br.width, stringerBase, mid, 0.2, STRINGER, span, beamMat);
    }

    // --- bents: capped, braced post frames carrying the stringers down ---
    const bents = Math.max(2, Math.round(span / BENT_SPACING) - 1);
    for (let b = 0; b < bents; b += 1) {
      const lz = zA + span * ((b + 1) / (bents + 1));
      beam(0, capBase, lz, br.width * 0.94, CAP, 0.3, beamMat);

      const legs = [-0.36, 0, 0.36];
      const legTop = capBase;
      const groundAt = [];
      for (const f of legs) {
        const lx = f * br.width;
        const g = heightAt(worldX(lx, lz), worldZ(lx, lz));
        groundAt.push(g);
        const h = legTop - (g - POST_EMBED);
        if (h <= 0.2) {
          continue;
        }
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, h, 8), postMat);
        post.position.set(lx, g - POST_EMBED + h / 2, lz);
        post.castShadow = true;
        post.receiveShadow = true;
        bridge.add(post);
      }

      // Sway bracing between the outer legs: the X under a trestle.
      const gOuter = Math.min(groundAt[0], groundAt[2]);
      const braceSpan = br.width * 0.72;
      const braceRise = legTop - (gOuter + 0.3);
      if (braceRise > 0.8) {
        const len = Math.hypot(braceSpan, braceRise);
        for (const dir of [1, -1]) {
          const brace = new THREE.Mesh(new THREE.BoxGeometry(0.14, len, 0.14), beamMat);
          brace.position.set(0, gOuter + 0.3 + braceRise / 2, lz);
          brace.rotation.z = dir * Math.atan2(braceSpan, braceRise);
          brace.castShadow = true;
          bridge.add(brace);
        }
      }
    }

    // --- abutments: a battered crib closing the last of the drop ---
    // These were a single near-black slab hung under the deck end, which is the
    // dark box that read as part of the floating. An abutment is a retaining
    // wall: widest at its footing, stepped back as it rises, carrying the deck
    // end onto the bank and holding the bank back.
    for (const [lz, sgn] of [[zA, -1], [zB, 1]]) {
      const g = heightAt(worldX(0, lz), worldZ(0, lz));
      const top = stringerBase;
      const total = top - (g - 0.5);
      if (total <= 0.3) {
        continue;
      }
      const courses = 3;
      const courseH = total / courses;
      for (let c = 0; c < courses; c += 1) {
        const t = c / (courses - 1 || 1);
        beam(
          0,
          g - 0.5 + c * courseH,
          lz + sgn * (0.75 - t * 0.2),
          br.width * (1.18 - t * 0.14),
          courseH * 1.02,
          1.9 - t * 0.5,
          c === 0 ? footingMat : cribMat
        );
      }
      // Wing walls, angled back into the bank on each side.
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(0.4, Math.max(0.6, total * 0.72), 3.2),
          cribMat
        );
        wing.position.set(
          side * br.width * 0.58,
          g - 0.4 + Math.max(0.6, total * 0.72) / 2,
          lz + sgn * 1.5
        );
        wing.rotation.y = -side * sgn * 0.28;
        wing.castShadow = true;
        wing.receiveShadow = true;
        bridge.add(wing);
      }
    }

    // --- railings: posts with a top and mid rail, not one floating bar ---
    const railPosts = Math.max(3, Math.round(span / 2.1));
    for (const side of [-1, 1]) {
      const lx = side * br.width * 0.45;
      for (let i = 0; i <= railPosts; i += 1) {
        const lz = zA + (span * i) / railPosts;
        beam(lx, deckTop - 0.1, lz, 0.16, 1.02, 0.16, railMat);
      }
      beam(lx, deckTop + 0.78, mid, 0.13, 0.14, span, railMat);
      beam(lx, deckTop + 0.4, mid, 0.1, 0.11, span, railMat);
    }
  }
}

export async function createRoads(scene) {
  const group = new THREE.Group();
  group.name = "roads";
  const gravelMap = await tryLoadTexture(TEXTURE_SETS.gravel.albedo, "albedo");
  for (const road of ROADS) {
    if (road.kind === "rail") {
      addRail(group, road, gravelMap);
    }
  }
  addBridges(group);
  scene.add(group);
  return group;
}
