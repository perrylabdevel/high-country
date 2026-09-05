import * as THREE from "three/webgpu";
import { heightAt } from "./world.js";
import { deckHeightAt, addCylinderCollider } from "./collision.js";
import { ROADS, ROAD_LIFT, mapToWorld, headingRotationY } from "./map.js";
import { createFigure } from "./figures.js";

/**
 * Road traffic: the world's stage lines carry life that isn't the player's.
 * Mounted riders and horse-drawn buggies work the named roads, pausing at
 * each end like a waystop before turning back.
 *
 * Traffic runs on rails — literally the road polylines from map.js — not on
 * free movement. Roads are the one part of the world guaranteed clear of
 * colliders (the nav graph routes along them), so riding the centerline
 * never fights a fence, a mill shed or a wander stock path. Free steering
 * would buy nothing on a road and cost a moveAndSlide per slice per
 * traveler, and a lane offset measured into real colliders: fort walls
 * beside the gate, bridge railings, ranch-yard buildings.
 *
 * Each traveler reuses the established kits rather than new geometry:
 *
 *   mount   — the livestock.js box-horse register (+X forward, pivot legs),
 *             rotated -pi/2 inside a +Z-forward traveler group so the
 *             figure kit's own facing holds
 *   rider   — a figures.js figure in its mounted seat pose, origin at the
 *             same RIDE_SEAT - RIDE_HIPS offset the player's avatar rides at
 *   buggy   — cart bed, bench, dash, four spoked-adjacent wheels that spin
 *             with actual road speed, shafts out to the same mount
 *
 * update advances the route distance even past CULL_DIST (traffic that
 * froze while you were away would resume in the wrong place) but skips the
 * limb animation and hides the meshes — a distant traveler costs a lerp.
 */

const CULL_DIST = 320;
const WALK_PHASE = [0, 0.5, 0.25, 0.75];

// Roads that carry traffic, by name in map.js. Buggies take the wide roads;
// riders also take the town street. silverNorth was tried and pulled: its
// middle fords Lake Mercy's shallow western rim for hundreds of metres
// (terrain ~12.8 against WATER 13), which reads as a rider walking on a
// white plain rather than a ford. The rail is freight's problem.
const ROUTES = [
  { road: "stage", kind: "buggy", speed: 4.0 },
  { road: "ranchTown", kind: "buggy", speed: 3.6 },
  { road: "townMain", kind: "rider", speed: 5.2 },
  { road: "ranchSouth", kind: "rider", speed: 4.6 }
];

// Travelers drive the road's centerline. A lane offset was tried and pulled:
// probed against clearanceAt, ±1.7 m put the buggy inside the fort walls
// beside the gate (the gate is centered on the road), into the ranchCreek
// bridge railings, and into the ranch yard's buildings. The centerline is
// the one line the world guarantees clear — the nav graph routes along it.
// One traveler per route, so there is no oncoming traffic to keep a lane
// for; crossings happen at shared endpoints, which are trimmed below.
const ROUTE_TRIMS = {
  // The stage and the two ranch roads both end at the ranch yard center
  // (0.4, 0.44); stop a wagon-width short of the dooryard instead of inside
  // it. Measured: buildings sit within ~35 m of the yard centre.
  stage: { start: 0, end: 45 },
  ranchTown: { start: 55, end: 0 },
  ranchSouth: { start: 55, end: 0 },
  townMain: { start: 0, end: 0 }
};

function mat(color, roughness = 0.8) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness });
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * A compact horse in the livestock/horse register: barrel, chest, haunch,
 * neck and head, tail, four single-pivot legs. Local +X forward, feet at
 * y=0. Built per traveler but from the herd's shared materials.
 */
function buildMount(hide, hideDark, dark) {
  const mount = new THREE.Group(); // +X forward inside its parent
  const bob = new THREE.Group();
  mount.add(bob);

  const barrel = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.56, 0.6), hide);
  barrel.position.set(-0.08, 1.12, 0);
  barrel.castShadow = true;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.6, 0.56), hide);
  chest.position.set(0.5, 1.08, 0);
  chest.castShadow = true;
  const haunch = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.6, 0.58), hideDark);
  haunch.position.set(-0.6, 1.12, 0);
  haunch.castShadow = true;
  bob.add(barrel, chest, haunch);

  const neckGroup = new THREE.Group();
  neckGroup.position.set(0.58, 1.32, 0);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.7, 0.28), hide);
  neck.position.set(0.2, 0.28, 0);
  neck.rotation.z = -0.5;
  neck.castShadow = true;
  neckGroup.add(neck);
  const headGroup = new THREE.Group();
  headGroup.position.set(0.44, 0.56, 0);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.22), hide);
  skull.position.set(0.08, 0, 0);
  skull.castShadow = true;
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.17, 0.15), dark);
  muzzle.position.set(0.31, -0.05, 0);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.13, 0.05), hideDark);
    ear.position.set(-0.02, 0.17, 0.08 * side);
    headGroup.add(ear);
  }
  headGroup.add(skull, muzzle);
  neckGroup.add(headGroup);
  neckGroup.rotation.z = -0.15;
  bob.add(neckGroup);

  const tailGroup = new THREE.Group();
  tailGroup.position.set(-0.92, 1.26, 0);
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.55, 3, 6), dark);
  tail.position.set(-0.14, -0.3, 0);
  tailGroup.add(tail);
  tailGroup.rotation.z = 0.3;
  bob.add(tailGroup);

  const legs = [];
  // Legs must reach the ground from the hip at y=1.0: upper spans [-0.88, 0],
  // hoof (0.11 tall) centered at -0.94 puts its foot at y=0.005. An earlier
  // set of segments stopped at -0.715 and the whole rig floated 28 cm.
  for (const [lx, lz] of [
    [0.5, 0.18],
    [0.5, -0.18],
    [-0.62, 0.2],
    [-0.62, -0.2]
  ]) {
    const hip = new THREE.Group();
    hip.position.set(lx, 1.0, lz);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.88, 0.17), hide);
    upper.position.y = -0.44;
    upper.castShadow = true;
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.16), dark);
    hoof.position.y = -0.94;
    hip.add(upper, hoof);
    bob.add(hip);
    legs.push({ hip });
  }

  return { mount, bob, legs, tail: tailGroup, backY: 1.42 };
}

function buildWheel(iron, radius, x, z, y) {
  const hub = new THREE.Group();
  hub.position.set(x, y, z);
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.09, 10), iron);
  // The cylinder's axis starts on Y; a quarter turn about Z lays it across
  // the buggy (X) so the hub group's rotation.x is the rolling spin.
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  hub.add(tire);
  return hub;
}

/**
 * A buggy: cart bed, footboard, dash, seat, four wheels, shafts out to a
 * mount standing at the front, and a driver seated on the bench in the
 * figure kit's mounted pose. Local +Z forward, wheels at y=0.
 */
function buildBuggy(look, wood, woodDark, iron, hide, hideDark, dark) {
  const group = new THREE.Group();
  const m = buildMount(hide, hideDark, dark);
  m.mount.rotation.y = -Math.PI / 2; // horse's +X forward becomes the group's +Z
  m.mount.position.set(0, 0, 2.05);
  group.add(m.mount);

  const bed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.14, 2.3), wood);
  bed.position.set(0, 0.82, -0.55);
  bed.castShadow = true;
  const dash = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 0.09), wood);
  dash.position.set(0, 1.08, 0.62);
  dash.castShadow = true;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.44, 0.12, 0.5), woodDark);
  seat.position.set(0, 1.28, -0.95);
  seat.castShadow = true;
  group.add(bed, dash, seat);

  for (const side of [-1, 1]) {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 1.5), woodDark);
    shaft.position.set(0.42 * side, 0.92, 1.35);
    shaft.rotation.x = 0.08;
    group.add(shaft);
  }

  const wheels = [
    buildWheel(iron, 0.4, 0.82, 0.55, 0.4),
    buildWheel(iron, 0.4, -0.82, 0.55, 0.4),
    buildWheel(iron, 0.46, 0.85, -1.35, 0.46),
    buildWheel(iron, 0.46, -0.85, -1.35, 0.46)
  ];
  for (const w of wheels) {
    group.add(w);
  }

  const figure = createFigure(look);
  // Seated: the figure's hips (0.92 up its own origin) rest on the bench top,
  // so the origin rides seatY - 0.92; the mounted pose drops the boots ahead
  // of the bench onto the bed floor.
  figure.group.position.set(0, 1.34 - 0.92, -0.95);
  group.add(figure.group);

  return { group, mount: m, wheels, figure, radius: 0.95 };
}

/**
 * A rider: the mount plus a figures.js figure seated on its back at the
 * player's own ride height.
 */
function buildRider(look, hide, hideDark, dark) {
  const group = new THREE.Group();
  const m = buildMount(hide, hideDark, dark);
  m.mount.rotation.y = -Math.PI / 2;
  group.add(m.mount);
  const figure = createFigure(look);
  // R9 seat: the figure's hips (0.92 up its own origin) rest on the mount's
  // back at backY, so the figure origin rides backY - 0.92. The small +z
  // shift seats the rider over the withers, not the loins. No rotation: the
  // figure already faces its local +Z, which is the group's travel direction
  // — rotating it to "face the mount's +X" put it sideways in the saddle,
  // because the mount itself is turned inside this group.
  figure.group.position.set(0, m.backY - 0.92, 0.14);
  group.add(figure.group);
  return { group, mount: m, figure, radius: 0.8 };
}

/** One road polyline in world space, with cumulative lengths. */
function buildRoute(road) {
  const pts = road.pts.map(([u, v]) => mapToWorld(u, v));
  const cum = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const dx = pts[i].x - pts[i - 1].x;
    const dz = pts[i].z - pts[i - 1].z;
    cum.push(cum[i - 1] + Math.hypot(dx, dz));
  }
  return { pts, cum, total: cum[cum.length - 1] };
}

/**
 * Position and heading at distance s along the route's centerline. dir flips
 * the heading: a traveler working the road the other way must face its own
 * motion, not slide along it backwards.
 */
function sampleRoute(route, s, dir) {
  const { pts, cum } = route;
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) {
    i += 1;
  }
  const t = (s - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-5);
  const ax = pts[i - 1].x, az = pts[i - 1].z;
  const bx = pts[i].x, bz = pts[i].z;
  const dx = bx - ax, dz = bz - az;
  const len = Math.max(Math.hypot(dx, dz), 1e-5);
  const nx = dx / len, nz = dz / len;
  return { x: ax + dx * t, z: az + dz * t, yaw: Math.atan2(nx * dir, -nz * dir) };
}

export function createTraffic() {
  const group = new THREE.Group();
  group.name = "traffic";

  // Shared across every traveler: one wood set, one iron, one small herd of
  // mount coats. Riders' palettes echo the settlers' look table in main.js.
  const wood = mat(0x6b4a2f, 0.85);
  const woodDark = mat(0x4a3220, 0.85);
  const iron = mat(0x2a221a, 0.6);
  const hides = [mat(0x5e3f28, 0.75), mat(0x7a5a3a, 0.75)];
  const hideDark = mat(0x472d1c, 0.8);
  const dark = mat(0x1c120c, 0.7);

  const travelers = [];
  for (const def of ROUTES) {
    const road = ROADS.find((r) => r.name === def.road);
    if (!road) {
      throw new Error(`traffic route names unknown road "${def.road}"`);
    }
    const route = buildRoute(road);
    // Trimmed ends keep travelers out of yards and doorways the polyline
    // runs into (the ranch routes all end at the dooryard centre).
    const trim = ROUTE_TRIMS[def.road] || { start: 0, end: 0 };
    route.sMin = trim.start;
    route.sMax = route.total - trim.end;
    const built = def.kind === "buggy"
      ? buildBuggy(
          {
            skin: 0xe0c29a,
            shirt: [0x6b4226, 0x7a3b1e][travelers.length % 2],
            vest: 0x4a2e18,
            pants: 0x33261a,
            hat: 0x3d2918
          },
          wood, woodDark, iron, hides[travelers.length % hides.length], hideDark, dark
        )
      : buildRider(
          {
            skin: 0xd9b58c,
            shirt: [0x5b3a24, 0x6a4e32, 0x4a3a2c][travelers.length % 3],
            vest: 0x3a2415,
            pants: 0x2a2018,
            hat: 0x2e2118
          },
          hides[travelers.length % hides.length],
          hideDark,
          dark
        );
    const collider = addCylinderCollider(0, 0, built.radius);

    const traveler = {
      ...built,
      kind: def.kind,
      route,
      collider,
      baseSpeed: def.speed * (0.9 + Math.random() * 0.2),
      // Start mid-route and mid-gait so the first sighting is a traveler at
      // work, not a procession launching from a road's end.
      s: lerp(route.sMin, route.sMax, 0.25 + Math.random() * 0.5),
      dir: Math.random() < 0.5 ? 1 : -1,
      speed: 0,
      resting: 0,
      yaw: 0,
      phase: Math.random() * Math.PI * 2,
      wheelSpin: 0
    };
    const start = sampleRoute(route, traveler.s, traveler.dir);
    built.group.position.set(start.x, heightAt(start.x, start.z), start.z);
    traveler.yaw = start.yaw;
    built.group.rotation.y = headingRotationY(traveler.yaw);
    collider.x = start.x;
    collider.z = start.z;
    group.add(built.group);
    travelers.push(traveler);
  }

  function animate(t, dt, sp) {
    const moving = sp > 0.15;
    const m = t.mount;
    if (moving) {
      t.phase += dt * (4.2 + sp * 1.1);
      const amp = Math.min(0.34, 0.14 + sp * 0.035);
      for (const [i, leg] of m.legs.entries()) {
        leg.hip.rotation.z = Math.sin(t.phase - WALK_PHASE[i] * Math.PI * 2) * amp;
      }
      m.bob.position.y = Math.abs(Math.sin(t.phase)) * 0.02;
      m.mount.rotation.z = Math.sin(t.phase) * 0.02;
    } else {
      const settle = Math.min(1, dt * 5);
      for (const leg of m.legs) {
        leg.hip.rotation.z *= 1 - settle;
      }
      m.bob.position.y *= 1 - settle;
      m.mount.rotation.z *= 1 - settle;
      // A resting team shifts weight and dips its head.
      m.bob.position.y = Math.sin(t.phase * 1.3) * 0.005;
    }
    m.tail.rotation.x = Math.sin(t.phase * 1.1) * 0.15;

    if (t.kind === "buggy") {
      // Wheels roll at road speed regardless of the mount's gait phase.
      t.wheelSpin += (sp * dt) / 0.43;
      for (const w of t.wheels) {
        w.rotation.x = t.wheelSpin;
      }
      t.figure.update(dt, 0, true);
    } else {
      t.figure.update(dt, sp, true);
    }
  }

  return {
    group,
    travelers, // dev hook: scripted capture aims at a traveler's live position
    update(dt, cameraPos) {
      for (const t of travelers) {
        const dx = t.group.position.x - cameraPos.x;
        const dz = t.group.position.z - cameraPos.z;
        const far = dx * dx + dz * dz > CULL_DIST * CULL_DIST;
        t.group.visible = !far;

        // Route distance advances even when culled — a traveler that froze
        // while you were away would meet you standing still in the wrong
        // place. Only the limb work is skipped.
        let sp = 0;
        if (t.resting > 0) {
          // The direction already flipped when the stop began (below), so the
          // rig pivots in place through the waystop and departs facing the
          // new way instead of hauling off sideways mid-turn.
          t.resting -= dt;
        } else {
          sp = t.baseSpeed;
          t.s += sp * dt * t.dir;
          if (t.s >= t.route.sMax || t.s <= t.route.sMin) {
            t.s = Math.max(t.route.sMin, Math.min(t.route.sMax, t.s));
            t.dir *= -1;
            t.resting = 3 + Math.random() * 4; // a waystop before turning back
          }
        }

        const at = sampleRoute(t.route, t.s, t.dir);
        t.group.position.x = at.x;
        t.group.position.z = at.z;
        // Same walkable surface the horse crosses: ground or bridge deck.
        const surface = Math.max(
          heightAt(at.x, at.z) + ROAD_LIFT * 0.75,
          deckHeightAt(at.x, at.z, t.group.position.y, 1.4)
        );
        t.group.position.y += (surface - t.group.position.y) * Math.min(1, 10 * dt);
        // Ease the heading so the waystop turnaround reads as a turn, and
        // lane curvature steers the mount rather than snapping it.
        let d = at.yaw - t.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        t.yaw += d * Math.min(1, dt * 2.5);
        t.group.rotation.y = headingRotationY(t.yaw);
        t.collider.x = at.x;
        t.collider.z = at.z;
        // A slow ramp on the pull: a horse-drawn load leans into its
        // collars before it is at speed, which also keeps the departure
        // from outrunning the rig's facing.
        t.speed += (sp - t.speed) * Math.min(1, 1.6 * dt);

        if (!far) {
          animate(t, dt, t.speed);
        }
      }
    }
  };
}