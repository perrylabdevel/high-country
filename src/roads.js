/** Rail ballast, unfinished rail, and creek bridges.
 * Stage / road / trail ribbons are retired — those are the terrain gravel splat.
 */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { heightAt, dirtTexture } from "./world.js";
import { addDeckPlatform, addOrientedBoxCollider, addCylinderCollider } from "./collision.js";
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
    const base = heightAt(p.x, p.z) + lift + bridgeLift(p.x, p.z);
    return {
      x: p.x,
      y: road.kind === "rail" ? railDeckY(p.x, p.z, base) : base,
      z: p.z,
      tx: tan.x,
      tz: tan.z,
      lift
    };
  });
}

/**
 * Rail trestle decks.
 *
 * bridgeLift's radial bump was built for road decals: on 3D ties and rails it
 * read as a camel hump — the track rose 2 m above the banks right at the
 * channel edge, then dipped back. A railroad crossing is flat over the water
 * and ramps down to the banks at a fixed grade, so rail crossings solve that
 * profile here instead: hold crown height across the span, descend at 8% (a
 * wagon-road grade) until the deck meets the ground exactly, same solved
 * landing the timber bridges use. The ties, the rails and the trestle
 * structure all ride this one profile.
 */
const BRIDGE_LIFT = 3.5;

const railProfiles = [];

function buildRailProfiles() {
  for (const br of BRIDGES) {
    if (!br.rail) {
      continue;
    }
    const p = mapToWorld(br.u, br.v);
    const spin = headingRotationY(br.yaw);
    const ax = Math.sin(spin);
    const az = Math.cos(spin);
    const groundAlong = (lz) => heightAt(p.x + ax * lz, p.z + az * lz);
    const flatHalf = (br.length || 16) / 2;
    const crown = heightAt(p.x, p.z) + BRIDGE_LIFT + 0.14;

    const landing = (dir) => {
      const path = [{ u: flatHalf, y: crown }];
      let u = flatHalf;
      let y = crown;
      let gPrev = groundAlong(u * dir) + 0.14;
      for (let i = 0; i < 4000; i += 1) {
        const nu = u + RAMP_STEP;
        const g = groundAlong(nu * dir) + 0.14;
        // Fall at DECK_GRADE at minimum — and fast enough that ground falling
        // away beneath the ramp can't reopen the gap. (The valley west of the
        // toxic-north crossing descends ~7% for 60 m; a plain 8% ramp chases
        // it forever and the deck ends mid-air.) Closing speed is therefore
        // always >= DECK_GRADE, so the ramp touches down within ~50 m.
        const fall = Math.max(DECK_GRADE, (gPrev - g) / RAMP_STEP + DECK_GRADE) * RAMP_STEP;
        const ny = y - fall;
        if (ny <= g) {
          const closing = (y - gPrev) - (ny - g);
          const t = closing > 1e-6 ? (y - gPrev) / closing : 0;
          const fu = u + RAMP_STEP * t;
          path.push({ u: fu, y: y - fall * t });
          return { u: fu, y: path[path.length - 1].y, path };
        }
        path.push({ u: nu, y: ny });
        u = nu;
        y = ny;
        gPrev = g;
      }
      return { u, y, path };
    };
    const endA = landing(-1);
    const endB = landing(1);

    const deckYAt = (lz) => {
      const a = Math.abs(lz);
      if (a <= flatHalf) {
        return crown;
      }
      const side = lz < 0 ? endA : endB;
      const path = side.path;
      for (let i = 1; i < path.length; i += 1) {
        if (a <= path[i].u) {
          const p0 = path[i - 1];
          const p1 = path[i];
          const t = (a - p0.u) / (p1.u - p0.u || 1);
          return p0.y + (p1.y - p0.y) * t;
        }
      }
      return side.y;
    };

    railProfiles.push({
      p,
      ax,
      az,
      halfWidth: (br.width || 4.2) / 2 + 1.5,
      zA: -endA.u,
      zB: endB.u,
      deckYAt
    });
  }
}

/** All trestle decks covering (x, z), with their local along-span values. */
function railDecksAt(x, z) {
  if (!railProfiles.length) {
    buildRailProfiles();
  }
  const hits = [];
  for (const prof of railProfiles) {
    const lx = x - prof.p.x;
    const lz0 = z - prof.p.z;
    const lz = lx * prof.ax + lz0 * prof.az;
    const lt = -lx * prof.az + lz0 * prof.ax;
    if (Math.abs(lt) <= prof.halfWidth && lz >= prof.zA - 1 && lz <= prof.zB + 1) {
      hits.push({ prof, lz });
    }
  }
  return hits;
}

/**
 * The trestle deck at (x, z), or the unlifted `base` off the span. Where two
 * crossings sit close enough to overlap (the toxic/twin junction 12 m apart),
 * the higher deck wins: the trestle runs straight across both creeks instead
 * of stepping off one deck down a cliff onto the next.
 */
function railDeckY(x, z, base) {
  let y = null;
  for (const hit of railDecksAt(x, z)) {
    const dy = hit.prof.deckYAt(hit.lz);
    if (y === null || dy > y) {
      y = dy;
    }
  }
  return y === null ? base : y;
}

function railDeckAt(x, z) {
  return railDecksAt(x, z).length ? railDecksAt(x, z)[0] : null;
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
  const samples = ribbonSamples(road, 3);
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
  // 2.4 m ties on 1.16 m gauge: the old 4.1 m ties overhung the rails by
  // 2 m a side, which read as rails squeezed together on planks. Real tie
  // overhang is about half a metre.
  const tieGeo = new THREE.BoxGeometry(2.4, 0.16, 0.26);
  const railGeo = new THREE.BoxGeometry(0.12, 0.12, 1);
  let along = 0;
  let nextTie = 0;
  const builtUntil = polylineLength(road.pts) * 0.72;

  const ties = [];
  const rails = [];
  const piles = [];
  const dummy = new THREE.Object3D();
  // Pitch is applied about the yawed local x (across-track) axis, so each
  // rail and tie connects its true end heights instead of stepping: the old
  // horizontal segments stacked into a 1.1 m staircase on the 22% sections.
  dummy.rotation.order = "YXZ";

  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    const seg = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const pitch = -Math.atan2(b.y - a.y, seg);
    const segStart = along;
    along += seg;
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const my = (a.y + b.y) / 2;
    const px = -(b.z - a.z) / seg;
    const pz = (b.x - a.x) / seg;

    // Ties every 1.2 m — the old 2.3 m spacing read as bare rail — each
    // seated on its own ground sample and lying on the ballast, not half
    // buried under it (tie centre used to sit 0.1 m below the ballast skin).
    // The seat is the sample line, not a fresh heightAt: on a trestle deck the
    // terrain is metres below, and ties keyed to it dangle in mid-air under
    // the rails.
    for (let t = nextTie - segStart; t <= seg; t += 1.2) {
      const f = t / seg;
      const x = a.x + (b.x - a.x) * f;
      const z = a.z + (b.z - a.z) * f;
      const y = a.y + (b.y - a.y) * f + 0.08;
      dummy.position.set(x, y, z);
      dummy.rotation.set(pitch, yaw, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      ties.push(dummy.matrix.clone());
    }
    nextTie += Math.ceil((seg - (nextTie - segStart)) / 1.2) * 1.2;

    if ((segStart + seg / 2) < builtUntil) {
      for (const side of [-0.58, 0.58]) {
        dummy.position.set(mx + px * side, my + 0.22, mz + pz * side);
        dummy.rotation.set(pitch, yaw, 0);
        dummy.scale.set(1, 1, seg + 0.06);
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

  addRailTrestles(group, samples);
}

/**
 * The trestles themselves. A rail crossing is flat over the water on a deck
 * of ties — what carries it is the load path the eye reads as a bridge:
 * longitudinal stringers under the ties, trestle bents (capped, cross-braced
 * posts driven into the bed) at intervals, and abutment sills where the deck
 * lands on the banks. The walking surface follows the same deck profile the
 * ties ride, so the player can walk a crossing instead of swimming it.
 */
function addRailTrestles(group, samples) {
  const beamMat = new THREE.MeshStandardNodeMaterial({ color: 0x51371f, roughness: 0.92 });
  const postMat = new THREE.MeshStandardNodeMaterial({ color: 0x412c19, roughness: 0.94 });

  // contiguous sample runs riding a deck
  const runs = [];
  let cur = null;
  for (let i = 0; i < samples.length; i += 1) {
    if (railDeckAt(samples[i].x, samples[i].z)) {
      if (!cur) {
        cur = [];
        runs.push(cur);
      }
      cur.push(i);
    } else {
      cur = null;
    }
  }

  for (const run of runs) {
    const banks = new Map();
    const bank = (geo, mat) => {
      let list = banks.get(mat);
      if (!list) {
        list = [];
        banks.set(mat, list);
      }
      list.push(geo);
    };
    const place = new THREE.Object3D();
    place.rotation.order = "YXZ";
    const shape = (geo, mat, x, y, z, yaw, pitch = 0, len = 1) => {
      place.position.set(x, y, z);
      place.rotation.set(pitch, yaw, 0);
      place.scale.set(1, 1, len);
      place.updateMatrix();
      geo.applyMatrix4(place.matrix);
      bank(geo, mat);
    };

    let bentDist = 2.2;
    for (let k = 1; k < run.length; k += 1) {
      const a = samples[run[k - 1]];
      const b = samples[run[k]];
      const seg = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const pitch = -Math.atan2(b.y - a.y, seg);
      const mx = (a.x + b.x) / 2;
      const mz = (a.z + b.z) / 2;
      const my = (a.y + b.y) / 2;
      const px = -(b.z - a.z) / seg;
      const pz = (b.x - a.x) / seg;

      // stringers under the ties, one pair per sample step, stretched to span
      // the step — at unit length they read as dashed floating planks
      for (const side of [-0.7, 0.7]) {
        shape(new THREE.BoxGeometry(0.24, 0.34, 1), beamMat,
          mx + px * side, my - 0.19, mz + pz * side, yaw, pitch, seg + 0.06);
      }

      // walkable deck following the profile
      addDeckPlatform(mx, mz, 2.1, seg / 2 + 0.2, -yaw, a.y, b.y);

      // bents at fixed intervals, skipped where the deck meets the bank
      bentDist += seg;
      if (bentDist >= 4.4) {
        bentDist = 0;
        const deckGround = Math.min(
          heightAt(mx - px * 0.9, mz - pz * 0.9),
          heightAt(mx + px * 0.9, mz + pz * 0.9)
        );
        const capBase = my - 0.36 - 0.22;
        if (capBase - deckGround > 0.7) {
          shape(new THREE.BoxGeometry(2.9, 0.22, 0.34), beamMat, mx, capBase + 0.11, mz, yaw);
          const rise = capBase - deckGround;
          for (const side of [-0.9, 0.9]) {
            const gx = mx + px * side;
            const gz = mz + pz * side;
            const g = heightAt(gx, gz) - 0.45;
            const h = capBase - g;
            if (h > 0.2) {
              const post = new THREE.CylinderGeometry(0.16, 0.2, h, 8);
              place.position.set(gx, g + h / 2, gz);
              place.rotation.set(0, 0, 0);
              place.scale.set(1, 1, 1);
              place.updateMatrix();
              post.applyMatrix4(place.matrix);
              bank(post, postMat);
              addCylinderCollider(gx, gz, 0.3, { minY: g, maxY: capBase });
            }
          }
          if (rise > 1.4) {
            const span = 1.8;
            const len = Math.hypot(span, rise);
            for (const dir of [1, -1]) {
              // cross-brace: a box tilted in the vertical plane across the
              // track — tilt about the local z needs its own placement, so
              // rotate about world z after the yaw via the shape helper's
              // roll argument below
              const brace = new THREE.BoxGeometry(0.12, len, 0.12);
              place.position.set(mx, deckGround + 0.45 + rise / 2, mz);
              place.rotation.set(0, yaw, dir * Math.atan2(span, rise));
              place.scale.set(1, 1, 1);
              place.updateMatrix();
              brace.applyMatrix4(place.matrix);
              bank(brace, beamMat);
            }
          }
        }
      }
    }

    // abutment sills where the deck lands, squared to the track's heading
    for (const [idx, i0, i1] of [
      [run[0], run[0], run[1]],
      [run[run.length - 1], run[run.length - 2], run[run.length - 1]]
    ]) {
      const s = samples[idx];
      const n = samples[i1];
      const p = samples[i0];
      const sillYaw = Math.atan2(n.x - p.x, n.z - p.z);
      shape(new THREE.BoxGeometry(3.0, 0.5, 1.0), postMat, s.x, s.y - 0.44, s.z, sillYaw);
    }

    for (const [mat, geos] of banks) {
      if (!geos.length) {
        continue;
      }
      const merged = new THREE.Mesh(mergeGeometries(geos), mat);
      merged.castShadow = true;
      merged.receiveShadow = true;
      group.add(merged);
    }
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
/** Approach grade. The deck holds level over the channel, then descends at
 * this slope until it meets the ground exactly. 8% is a wagon-road grade. */
const DECK_GRADE = 0.08;
const RAMP_STEP = 0.25;

function addBridges(group) {
  const deckMat = new THREE.MeshStandardNodeMaterial({ color: 0x6b4a2c, roughness: 0.88 });
  const railMat = new THREE.MeshStandardNodeMaterial({ color: 0x4a3020, roughness: 0.9 });
  const beamMat = new THREE.MeshStandardNodeMaterial({ color: 0x51371f, roughness: 0.92 });
  const postMat = new THREE.MeshStandardNodeMaterial({ color: 0x412c19, roughness: 0.94 });

  for (const br of BRIDGES) {
    if (br.rail) {
      // Rail crossings build their own trestles in addRail — the ties and
      // rails are the deck, so a plank road deck here would bury them.
      continue;
    }
    const p = mapToWorld(br.u, br.v);
    const crown = heightAt(p.x, p.z) + bridgeLift(p.x, p.z) + 0.22 + 0.16;
    const spin = headingRotationY(br.yaw);
    const cos = Math.cos(spin);
    const sin = Math.sin(spin);

    const bridge = new THREE.Group();
    bridge.name = `bridge-${br.name}`;
    bridge.position.set(p.x, 0, p.z);
    bridge.rotation.y = spin;
    group.add(bridge);

    // Collider yaw is not three's rotation.y. resolveCircleBox builds its local
    // frame as dx = lx*cos - lz*sin, whereas rotation.y = spin gives
    // dx = lx*cos + lz*sin — the inverse rotation. So the collision frame for
    // this bridge is -spin. With yaw 0 (the ranch crossing) sin is 0 and both
    // agree, which is exactly why only the yawed tribal crossing was wrong.
    const colliderYaw = -spin;

    const worldX = (lx, lz) => p.x + lx * cos + lz * sin;
    const worldZ = (lx, lz) => p.z - lx * sin + lz * cos;
    const groundAlong = (lz) => heightAt(worldX(0, lz), worldZ(0, lz));

    /**
     * Where the deck lands, solved rather than tolerated.
     *
     * The span used to stop when the ground came within LAND_DROP of a flat
     * deck — an arbitrary metre of slack that left the walking surface a step
     * above grade at every end, with a bulkhead wall hiding the gap. A bridge
     * approach is not flat: it ramps. Holding the deck level over the channel
     * and then descending at a fixed grade, the deck meets the terrain at an
     * exact crossing, so there is nothing left to tolerate.
     *
     * Marches out until the descending deck line crosses the ground, then
     * interpolates the crossing within the last step.
     */
    const flatHalf = br.length / 2;
    const landing = (dir) => {
      let u = flatHalf;
      let y = crown;
      for (let i = 0; i < 4000; i += 1) {
        const nu = u + RAMP_STEP;
        const ny = y - DECK_GRADE * RAMP_STEP;
        const g = groundAlong(nu * dir);
        if (ny <= g) {
          // Deck falls at DECK_GRADE, ground rises at (g - gPrev)/step. Solve
          // where the two lines meet inside this step.
          const gPrev = groundAlong(u * dir);
          const closing = (y - gPrev) - (ny - g);
          const t = closing > 1e-6 ? (y - gPrev) / closing : 0;
          return { u: u + RAMP_STEP * t, y: y - DECK_GRADE * RAMP_STEP * t };
        }
        u = nu;
        y = ny;
      }
      return { u, y };
    };
    const endA = landing(-1);
    const endB = landing(1);
    const zA = -endA.u;
    const zB = endB.u;

    /** Deck surface height at a position along the span. */
    const deckYAt = (lz) => {
      const a = Math.abs(lz);
      if (a <= flatHalf) {
        return crown;
      }
      const floorY = lz < 0 ? endA.y : endB.y;
      return Math.max(floorY, crown - DECK_GRADE * (a - flatHalf));
    };
    /** Pitch of the deck at lz, as a rotation about the local X axis. */
    const pitchAt = (lz) => {
      const a = Math.abs(lz);
      if (a <= flatHalf || a >= (lz < 0 ? endA.u : endB.u)) {
        return 0;
      }
      return Math.sign(lz) * Math.atan(DECK_GRADE);
    };

    const PLANK = 0.14;
    const STRINGER = 0.36;
    const CAP = 0.24;

    // Every member used to be its own Mesh, so one bridge cost a draw call per
    // plank brace and rail post — the two crossings together were 256 of the
    // scene's ~1049 draws. They are static and share four materials, so bank
    // each member's geometry by material and merge once at the end.
    const banks = new Map();
    const bank = (geo, mat) => {
      let list = banks.get(mat);
      if (!list) {
        list = [];
        banks.set(mat, list);
      }
      list.push(geo);
    };
    const place = new THREE.Object3D();
    const shape = (geo, mat, x, y, z, rotX = 0, rotZ = 0) => {
      place.position.set(x, y, z);
      place.rotation.set(rotX, 0, rotZ);
      place.updateMatrix();
      geo.applyMatrix4(place.matrix);
      bank(geo, mat);
    };

    /** Box with its base at `baseY`, in the bridge's local frame. */
    const beam = (lx, baseY, lz, w, h, d, mat, pitch = 0) => {
      shape(new THREE.BoxGeometry(w, h, d), mat, lx, baseY + h / 2, lz, pitch);
    };

    /** The three runs of the deck: down-ramp, level over the channel, up-ramp. */
    const runs = [
      { z0: zA, z1: -flatHalf },
      { z0: -flatHalf, z1: flatHalf },
      { z0: flatHalf, z1: zB }
    ].filter((r) => r.z1 - r.z0 > 0.05);

    /** A member following one run, e.g. a stringer or a rail. */
    const runBeam = (lx, drop, w, h, mat) => {
      for (const r of runs) {
        const y0 = deckYAt(r.z0) - drop;
        const y1 = deckYAt(r.z1) - drop;
        const dz = r.z1 - r.z0;
        const len = Math.hypot(dz, y1 - y0);
        shape(
          new THREE.BoxGeometry(w, h, len), mat,
          lx, (y0 + y1) / 2 + h / 2, (r.z0 + r.z1) / 2,
          Math.atan2(y0 - y1, dz)
        );
      }
    };

    // --- transverse decking, following the profile ---
    const span = zB - zA;
    const plankCount = Math.max(2, Math.floor(span / 0.46));
    const planks = new THREE.InstancedMesh(
      new THREE.BoxGeometry(br.width, PLANK, (span / plankCount) * 0.82),
      deckMat,
      plankCount
    );
    const dummy = new THREE.Object3D();
    for (let i = 0; i < plankCount; i += 1) {
      const lz = zA + (i + 0.5) * (span / plankCount);
      dummy.position.set(Math.sin(i * 1.3) * 0.02, deckYAt(lz) - PLANK / 2, lz);
      dummy.rotation.set(pitchAt(lz), Math.sin(i * 0.9) * 0.006, 0);
      dummy.updateMatrix();
      planks.setMatrixAt(i, dummy.matrix);
    }
    planks.instanceMatrix.needsUpdate = true;
    planks.castShadow = true;
    planks.receiveShadow = true;
    bridge.add(planks);

    // --- stringers ---
    for (const f of [-0.38, -0.13, 0.13, 0.38]) {
      runBeam(f * br.width, PLANK + STRINGER, 0.2, STRINGER, beamMat);
    }

    // --- bents, each sized to the deck height above it ---
    const bents = Math.max(2, Math.round(span / BENT_SPACING) - 1);
    for (let b = 0; b < bents; b += 1) {
      const lz = zA + span * ((b + 1) / (bents + 1));
      const capBase = deckYAt(lz) - PLANK - STRINGER - CAP;
      const legTop = capBase;
      if (capBase - groundAlong(lz) < 0.35) {
        continue;
      }
      beam(0, capBase, lz, br.width * 0.94, CAP, 0.3, beamMat);

      const grounds = [];
      for (const f of [-0.36, 0, 0.36]) {
        const lx = f * br.width;
        const g = heightAt(worldX(lx, lz), worldZ(lx, lz));
        grounds.push(g);
        const h = legTop - (g - POST_EMBED);
        if (h <= 0.2) {
          continue;
        }
        shape(new THREE.CylinderGeometry(0.17, 0.22, h, 8), postMat, lx, g - POST_EMBED + h / 2, lz);
        addCylinderCollider(worldX(lx, lz), worldZ(lx, lz), 0.3, { minY: g - POST_EMBED, maxY: legTop });
      }

      const gOuter = Math.min(grounds[0], grounds[2]);
      const braceSpan = br.width * 0.72;
      const braceRise = legTop - (gOuter + 0.3);
      if (braceRise > 0.8) {
        const len = Math.hypot(braceSpan, braceRise);
        for (const dir of [1, -1]) {
          shape(
            new THREE.BoxGeometry(0.14, len, 0.14), beamMat,
            0, gOuter + 0.3 + braceRise / 2, lz, 0,
            dir * Math.atan2(braceSpan, braceRise)
          );
        }
      }
    }

    // --- sill beam at each landing, where the deck runs onto the bank ---
    for (const [lz, sgn] of [[zA, -1], [zB, 1]]) {
      const y = deckYAt(lz);
      beam(0, y - PLANK - 0.5, lz + sgn * 0.3, br.width * 1.02, 0.5, 0.6, postMat);
    }

    // --- railings, following the profile ---
    const railPosts = Math.max(3, Math.round(span / 2.1));
    for (const side of [-1, 1]) {
      const lx = side * br.width * 0.45;
      for (let i = 0; i <= railPosts; i += 1) {
        const lz = zA + (span * i) / railPosts;
        beam(lx, deckYAt(lz) - 0.1, lz, 0.16, 1.02, 0.16, railMat, pitchAt(lz));
      }
      runBeam(lx, -0.78, 0.13, 0.14, railMat);
      runBeam(lx, -0.4, 0.1, 0.11, railMat);

      // Rails are solid at deck height only: a plain collider would also wall
      // off the creek bed you can walk underneath.
      for (const r of runs) {
        const mz = (r.z0 + r.z1) / 2;
        addOrientedBoxCollider(
          worldX(lx, mz),
          worldZ(lx, mz),
          0.16,
          (r.z1 - r.z0) / 2,
          colliderYaw,
          { minY: Math.min(deckYAt(r.z0), deckYAt(r.z1)), maxY: Math.max(deckYAt(r.z0), deckYAt(r.z1)) + 1.05 }
        );
      }
    }

    // One merged mesh per material: 4 draws a bridge instead of ~130.
    for (const [mat, geos] of banks) {
      if (!geos.length) {
        continue;
      }
      const merged = new THREE.Mesh(mergeGeometries(geos), mat);
      merged.castShadow = true;
      merged.receiveShadow = true;
      bridge.add(merged);
    }

    // --- the walking surface, one platform per run so the ramps slope ---
    for (const r of runs) {
      const mz = (r.z0 + r.z1) / 2;
      addDeckPlatform(
        worldX(0, mz),
        worldZ(0, mz),
        br.width / 2,
        (r.z1 - r.z0) / 2,
        colliderYaw,
        deckYAt(r.z0),
        deckYAt(r.z1)
      );
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
