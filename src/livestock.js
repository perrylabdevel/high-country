import * as THREE from "three/webgpu";
import { heightAt, normalAt } from "./world.js";
import { moveAndSlide, addCylinderCollider, resolvePosition } from "./collision.js";
import { POS, WATER, clampWorld } from "./map.js";

/**
 * Live stock: the first animals that move on their own. Three species in the
 * horse.js register — box primitives on pivot groups, local +X forward, feet
 * at y=0 — grazed out across the world:
 *
 *   cattle  — the ranch pasture, a loose herd that ambles between patches
 *   sheep   — the sheep camp, a tight flock that mostly keeps its head down
 *   deer    — the open range, which bolts when the player closes in
 *
 * Each animal is a small state machine (graze / wander / idle, deer add
 * flee) that picks walk targets inside its herd's home radius, so a herd
 * that scatters drifts back on its own. Movement reuses the horse's
 * contract: headingVector yaw, moveAndSlide against the world's colliders,
 * the slope gate, a lerped seat on heightAt, and a synced cylinder collider
 * so the player cannot walk through a cow.
 *
 * The rig is a pivot hierarchy so a future skinned model drops in the same
 * way the horse's contract promises:
 *
 *   object (feet at y=0, local +X forward)
 *   └─ bob                — gait bounce
 *      ├─ bodyGroup       — barrel, chest, haunches
 *      ├─ neckGroup       — neck, └ headGroup (skull, muzzle, ears, antlers)
 *      ├─ tailGroup
 *      └─ legs[4]         — single hip pivots (stock gaits stay a walk)
 *
 * Draw-call budget: statics merge exists because 670 meshes were 1330 of
 * ~1490 frame draws, so each species keeps to ~7-9 meshes and shares its
 * materials across the whole herd (materials are per-species, never
 * per-animal). Animals past CULL_DIST go invisible and skip animation
 * entirely — a herd grazing far off costs nothing.
 */

const CULL_DIST = 320;

// Phase offsets for a lateral four-beat walk, same table as the horse.
const WALK_PHASE = [0, 0.5, 0.25, 0.75];

function mat(color, roughness = 0.8) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness });
}

/** A shared hide set for one species, created once per herd module. */
function hideSet(colors) {
  return colors.map((c) => mat(c));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ---------------------------------------------------------------------------
// Species rigs. Each builder returns { group, parts } with the pivot set the
// animator needs: { bob, body, neck, head, tail, legs }.
// ---------------------------------------------------------------------------

/**
 * Cattle: heavy barrel, low-slung head, thin tail with a tuft. `hide` picks
 * the animal's coat from the herd's shared palette.
 */
function buildCow(hide, dark) {
  const group = new THREE.Group();
  const bob = new THREE.Group();
  group.add(bob);
  const parts = { legs: [] };

  const bodyGroup = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.72, 0.74), hide);
  barrel.position.set(-0.08, 0.98, 0);
  barrel.castShadow = true;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.66, 0.68), hide);
  chest.position.set(0.55, 0.92, 0);
  chest.castShadow = true;
  const haunch = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.72, 0.7), hide);
  haunch.position.set(-0.68, 1.0, 0);
  haunch.castShadow = true;
  bodyGroup.add(barrel, chest, haunch);
  bob.add(bodyGroup);

  // Head rides low: cattle carry the skull barely above the topline, so the
  // neck pivot sits at the chest top and the head hangs forward of it.
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0.82, 1.06, 0);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.32), hide);
  neck.position.set(0.14, 0.06, 0);
  neck.castShadow = true;
  neckGroup.add(neck);
  const headGroup = new THREE.Group();
  headGroup.position.set(0.3, 0.12, 0);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.3), hide);
  skull.position.set(0.1, 0, 0);
  skull.castShadow = true;
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.22), dark);
  muzzle.position.set(0.32, -0.06, 0);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.08), hide);
    ear.position.set(0.02, 0.12, 0.16 * side);
    headGroup.add(ear);
  }
  headGroup.add(skull, muzzle);
  neckGroup.add(headGroup);
  bob.add(neckGroup);

  const tailGroup = new THREE.Group();
  tailGroup.position.set(-1.0, 1.2, 0);
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.62, 3, 6), dark);
  tail.position.set(-0.1, -0.34, 0);
  tailGroup.add(tail);
  const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.09), dark);
  tuft.position.set(-0.12, -0.7, 0);
  tailGroup.add(tuft);
  tailGroup.rotation.z = 0.25;
  bob.add(tailGroup);

  for (const [lx, lz] of [
    [0.55, 0.24],
    [0.55, -0.24],
    [-0.68, 0.26],
    [-0.68, -0.26]
  ]) {
    const hip = new THREE.Group();
    hip.position.set(lx, 0.78, lz);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.66, 0.19), hide);
    upper.position.y = -0.33;
    upper.castShadow = true;
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.18), dark);
    hoof.position.y = -0.72;
    hip.add(upper, hoof);
    bob.add(hip);
    parts.legs.push({ hip });
  }

  parts.bob = bob;
  parts.body = bodyGroup;
  parts.neck = neckGroup;
  parts.head = headGroup;
  parts.tail = tailGroup;
  return { group, parts };
}

/**
 * Sheep: a wool body that reads as one rounded block over thin dark legs,
 * with the dark face bare. The wool is deliberately oversized over the
 * frame — a shorn flock would be a different game.
 */
function buildSheep(wool, dark) {
  const group = new THREE.Group();
  const bob = new THREE.Group();
  group.add(bob);
  const parts = { legs: [] };

  const bodyGroup = new THREE.Group();
  const fleece = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.62, 0.6), wool);
  fleece.position.set(-0.02, 0.66, 0);
  fleece.castShadow = true;
  const rump = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.54, 0.52), wool);
  rump.position.set(-0.52, 0.64, 0);
  rump.castShadow = true;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.5), wool);
  chest.position.set(0.44, 0.62, 0);
  chest.castShadow = true;
  bodyGroup.add(fleece, rump, chest);
  bob.add(bodyGroup);

  const neckGroup = new THREE.Group();
  neckGroup.position.set(0.56, 0.7, 0);
  const headGroup = new THREE.Group();
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.22, 0.2), dark);
  skull.position.set(0.1, 0.04, 0);
  skull.castShadow = true;
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.14), dark);
  muzzle.position.set(0.22, -0.02, 0);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.06), dark);
    ear.position.set(0.04, 0.1, 0.11 * side);
    headGroup.add(ear);
  }
  headGroup.add(skull, muzzle);
  neckGroup.add(headGroup);
  bob.add(neckGroup);

  for (const [lx, lz] of [
    [0.4, 0.18],
    [0.4, -0.18],
    [-0.44, 0.18],
    [-0.44, -0.18]
  ]) {
    const hip = new THREE.Group();
    hip.position.set(lx, 0.5, lz);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.5, 0.12), dark);
    upper.position.y = -0.25;
    upper.castShadow = true;
    hip.add(upper);
    bob.add(hip);
    parts.legs.push({ hip });
  }

  parts.bob = bob;
  parts.body = bodyGroup;
  parts.neck = neckGroup;
  parts.head = headGroup;
  parts.tail = null;
  return { group, parts };
}

/**
 * Deer: long legs, a raised head on an angled neck, a white-flag rump the
 * eye can catch at distance. Bucks carry a simple two-point rack.
 * `light` is the herd's shared pale patch material (rump, tail, antler tips).
 */
function buildDeer(hide, dark, light, buck) {
  const group = new THREE.Group();
  const bob = new THREE.Group();
  group.add(bob);
  const parts = { legs: [] };

  const bodyGroup = new THREE.Group();
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.48, 0.42), hide);
  barrel.position.set(-0.04, 0.92, 0);
  barrel.castShadow = true;
  const haunch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.52, 0.44), hide);
  haunch.position.set(-0.52, 0.94, 0);
  haunch.castShadow = true;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.4), hide);
  chest.position.set(0.42, 0.9, 0);
  chest.castShadow = true;
  // The rump patch: a lighter plate on the rear face of the haunches.
  const rump = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.3), light);
  rump.position.set(-0.78, 0.96, 0);
  bodyGroup.add(barrel, haunch, chest, rump);
  bob.add(bodyGroup);

  const neckGroup = new THREE.Group();
  neckGroup.position.set(0.58, 1.02, 0);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.44, 0.18), hide);
  neck.position.set(0.16, 0.16, 0);
  neck.rotation.z = 0.55;
  neck.castShadow = true;
  neckGroup.add(neck);
  const headGroup = new THREE.Group();
  headGroup.position.set(0.3, 0.34, 0);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.18), hide);
  skull.position.set(0.06, 0, 0);
  skull.castShadow = true;
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.13, 0.13), dark);
  muzzle.position.set(0.24, -0.04, 0);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.05), hide);
    ear.position.set(-0.04, 0.14, 0.09 * side);
    ear.rotation.x = 0.2 * side;
    headGroup.add(ear);
  }
  if (buck) {
    for (const side of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.26, 0.05), dark);
      beam.position.set(0.0, 0.26, 0.07 * side);
      beam.rotation.x = 0.28 * side;
      beam.rotation.z = -0.3;
      headGroup.add(beam);
      const tine = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.04), dark);
      tine.position.set(-0.08, 0.36, 0.12 * side);
      headGroup.add(tine);
    }
  }
  headGroup.add(skull, muzzle);
  neckGroup.add(headGroup);
  neckGroup.rotation.z = 0.1;
  bob.add(neckGroup);

  const tailGroup = new THREE.Group();
  tailGroup.position.set(-0.74, 1.06, 0);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.12), light);
  tail.position.set(-0.04, -0.08, 0);
  tailGroup.add(tail);
  bob.add(tailGroup);

  for (const [lx, lz] of [
    [0.42, 0.14],
    [0.42, -0.14],
    [-0.52, 0.16],
    [-0.52, -0.16]
  ]) {
    const hip = new THREE.Group();
    hip.position.set(lx, 0.72, lz);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.72, 0.1), hide);
    upper.position.y = -0.36;
    upper.castShadow = true;
    hip.add(upper);
    bob.add(hip);
    parts.legs.push({ hip });
  }

  parts.bob = bob;
  parts.body = bodyGroup;
  parts.neck = neckGroup;
  parts.head = headGroup;
  parts.tail = tailGroup;
  return { group, parts };
}

// ---------------------------------------------------------------------------
// Herd table. Homes are authored POIs so the stock reads as placed life, not
// scatter noise: cattle on the ranch pasture, sheep at the sheep camp, deer
// out on the open range where a bolting herd has room to run.
// ---------------------------------------------------------------------------

const SPECIES = {
  cow: {
    build: buildCow,
    radius: 0.62,
    walkSpeed: 0.9,
    palette: [0x6b4a2f, 0x8a7a66, 0x40301f],
    grazeShare: 0.55, // portion of the idle cycle spent head-down
    flees: false
  },
  sheep: {
    build: buildSheep,
    radius: 0.4,
    walkSpeed: 0.8,
    palette: [0xd8cfc0],
    grazeShare: 0.7,
    flees: false
  },
  deer: {
    build: buildDeer,
    radius: 0.45,
    walkSpeed: 1.5,
    palette: [0x9c7a52],
    grazeShare: 0.4,
    flees: true,
    fleeDist: 16,
    fleeSpeed: 6.5
  }
};

const HERDS = [
  { kind: "cow", home: POS.ranch, count: 6, ringMin: 26, ringMax: 60 },
  { kind: "sheep", home: POS.sheepCamp, count: 7, ringMin: 8, ringMax: 34 },
  { kind: "deer", home: POS.westernRange, count: 4, ringMin: 10, ringMax: 90 },
  { kind: "deer", home: POS.foothills, count: 4, ringMin: 10, ringMax: 90 }
];

/**
 * A walkable, dry, roughly level spot for one animal: a random offset in the
 * herd's ring that clears water (WATER + margin), keeps the slope gate's
 * own standard, and is pushed out of any built collider by resolvePosition.
 * Up to `tries` draws, then the last candidate wins — imperfect ground beats
 * a missing animal.
 */
function pickSpot(home, ringMin, ringMax, radius, tries = 24) {
  let spot = null;
  for (let i = 0; i < tries; i += 1) {
    const ang = Math.random() * Math.PI * 2;
    const r = lerp(ringMin, ringMax, Math.random());
    const x = home.x + Math.cos(ang) * r;
    const z = home.z + Math.sin(ang) * r;
    spot = { x, z };
    if (heightAt(x, z) < WATER + 0.8) {
      continue;
    }
    if (normalAt(x, z).y < 0.62) {
      continue;
    }
    break;
  }
  const fixed = resolvePosition(spot.x, spot.z, radius);
  return { x: fixed.x, z: fixed.z };
}

/**
 * Build every herd and return { group, update }. update(dt, cameraPos,
 * playerPos) ticks the whole population: culls by camera distance, runs the
 * wander/graze/flee state machines, moves and seats the animals.
 */
export function createLivestock() {
  const group = new THREE.Group();
  group.name = "livestock";
  const animals = [];

  for (const herd of HERDS) {
    const sp = SPECIES[herd.kind];
    // One material set per herd: colour variety within a species comes from
    // the palette, never from per-animal materials.
    const hides = hideSet(sp.palette);
    const dark = mat(0x241a12, 0.75);
    const light = mat(0xd9cbb4, 0.9); // pale rump/tail patches (deer)
    for (let i = 0; i < herd.count; i += 1) {
      const hide = hides[i % hides.length];
      const rig = sp.build(hide, dark, light, herd.kind === "deer" && i % 2 === 0);
      const spot = pickSpot(herd.home, herd.ringMin, herd.ringMax, sp.radius);
      rig.group.position.set(spot.x, heightAt(spot.x, spot.z), spot.z);
      group.add(rig.group);
      const collider = addCylinderCollider(spot.x, spot.z, sp.radius);
      animals.push({
        rig,
        species: sp,
        collider,
        home: herd.home,
        ringMax: herd.ringMax,
        yaw: Math.random() * Math.PI * 2,
        speed: 0,
        phase: Math.random() * Math.PI * 2,
        headPitch: 0,
        grazeT: 0,
        grazeFor: 0,
        state: "idle",
        stateT: Math.random() * 3,
        target: null,
        fleeT: 0
      });
    }
  }

  // --- Per-animal animation, split from movement so each reads clean --------
  function animate(a, dt, sp) {
    const p = a.rig.parts;
    const moving = sp > 0.15;
    if (moving) {
      a.phase += dt * (4.2 + sp * 1.1);
      const amp = Math.min(0.32, 0.14 + sp * 0.03);
      for (const [i, leg] of p.legs.entries()) {
        leg.hip.rotation.z = Math.sin(a.phase - WALK_PHASE[i] * Math.PI * 2) * amp;
      }
      p.bob.position.y = Math.abs(Math.sin(a.phase)) * (0.015 + sp * 0.004);
      p.bob.rotation.z = 0;
    } else {
      const settle = Math.min(1, dt * 5);
      for (const leg of p.legs) {
        leg.hip.rotation.z *= 1 - settle;
      }
      p.bob.position.y = Math.sin(a.grazeT * 1.6) * 0.004;
      p.bob.rotation.z *= 1 - settle;
    }

    // Head: down while grazing, up and slowly swinging otherwise. The pitch
    // is always lerped so the graze/walk transitions never snap.
    const grazing = !moving && a.state === "graze";
    // Down is negative around z: the head sits forward of its pivot, so
    // rotating -z dips the muzzle toward the ground.
    const wantPitch = grazing ? -0.95 + Math.sin(a.grazeT * 0.7) * 0.06 : Math.sin(a.grazeT * 0.5) * 0.1;
    a.headPitch += (wantPitch - a.headPitch) * Math.min(1, dt * 2.2);
    p.head.rotation.z = a.headPitch;
    p.neck.rotation.z = a.headPitch * 0.3;

    if (p.tail) {
      p.tail.rotation.x = Math.sin(a.grazeT * 1.3 + a.phase) * (moving ? 0.2 : 0.14);
    }
  }

  function setState(a, state, duration) {
    a.state = state;
    a.stateT = duration;
  }

  // Choose the next walk target: inside the home ring, dry, walkable.
  function pickTarget(a) {
    for (let i = 0; i < 12; i += 1) {
      const ang = Math.random() * Math.PI * 2;
      const r = lerp(4, a.ringMax, Math.random());
      const x = a.home.x + Math.cos(ang) * r;
      const z = a.home.z + Math.sin(ang) * r;
      if (heightAt(x, z) > WATER + 0.6 && normalAt(x, z).y > 0.55) {
        a.target = { x, z };
        return true;
      }
    }
    return false;
  }

  function update(a, dt, playerPos) {
    a.stateT -= dt;
    a.grazeT += dt;

    // Flee check first: it preempts whatever the animal was doing.
    if (a.species.flees) {
      const dx = a.rig.group.position.x - playerPos.x;
      const dz = a.rig.group.position.z - playerPos.z;
      const near = dx * dx + dz * dz < a.species.fleeDist * a.species.fleeDist;
      if (near && a.state !== "flee") {
        setState(a, "flee", 5);
        // Run directly away from the player, seeded with the current yaw so
        // the turn is visible rather than a snap.
        a.yaw = Math.atan2(dx, -dz) + (Math.random() - 0.5) * 0.5;
        a.target = null;
      }
    }

    let speedTarget = 0;
    switch (a.state) {
      case "flee":
        speedTarget = a.species.fleeSpeed;
        if (a.stateT <= 0) {
          setState(a, "idle", 2 + Math.random() * 2);
          a.target = null;
        }
        break;
      case "graze":
        if (a.stateT <= 0) {
          // Graze blends into an idle saunter more often than a fresh target.
          if (Math.random() < 0.55 || !pickTarget(a)) {
            setState(a, "idle", 2 + Math.random() * 3);
          } else {
            setState(a, "walk", 20);
          }
        }
        break;
      case "idle":
        if (a.stateT <= 0) {
          if (Math.random() < a.species.grazeShare) {
            setState(a, "graze", 4 + Math.random() * 7);
          } else if (pickTarget(a)) {
            setState(a, "walk", 20);
          } else {
            setState(a, "idle", 3);
          }
        }
        break;
      case "walk": {
        speedTarget = a.species.walkSpeed;
        const dx = a.target.x - a.rig.group.position.x;
        const dz = a.target.z - a.rig.group.position.z;
        const dist2 = dx * dx + dz * dz;
        if (dist2 < 4 || a.stateT <= 0) {
          // Arrived (or tired of walking): graze where we stand.
          setState(a, Math.random() < 0.7 ? "graze" : "idle", 3 + Math.random() * 6);
          a.target = null;
        } else {
          const want = Math.atan2(dx, -dz);
          // Shortest-arc turn toward the target, eased.
          let d = want - a.yaw;
          while (d > Math.PI) d -= Math.PI * 2;
          while (d < -Math.PI) d += Math.PI * 2;
          a.yaw += d * Math.min(1, dt * 2.5);
        }
        break;
      }
      default:
        setState(a, "idle", 2);
    }

    // Movement: the horse's contract — heading vector, sliced moveAndSlide,
    // slope gate, lerped seat. Fleeing animals also clamp to the world edge.
    const maxSpeed = a.state === "flee" ? a.species.fleeSpeed : a.species.walkSpeed;
    const accel = a.state === "flee" ? 6 : 2.2;
    a.speed += (speedTarget - a.speed) * Math.min(1, accel * dt);
    if (a.speed < 0.05 && speedTarget === 0) {
      a.speed = 0;
    }
    const g = a.rig.group;
    const { x: fx, z: fz } = { x: Math.sin(a.yaw), z: -Math.cos(a.yaw) };
    const travel = a.speed * dt;
    if (travel !== 0) {
      const held = { x: g.position.x, z: g.position.z };
      const slices = Math.max(1, Math.ceil(travel / 0.7));
      for (let i = 0; i < slices; i += 1) {
        const next = moveAndSlide(held.x, held.z, fx * travel / slices, fz * travel / slices, a.species.radius, a.collider);
        held.x = next.x;
        held.z = next.z;
      }
      const c = clampWorld(held.x, held.z);
      const slope = normalAt(c.x, c.z);
      if (slope.y >= 0.5) {
        g.position.x = c.x;
        g.position.z = c.z;
      }
      a.collider.x = g.position.x;
      a.collider.z = g.position.z;
    }
    const surface = heightAt(g.position.x, g.position.z);
    g.position.y += (surface - g.position.y) * Math.min(1, 10 * dt);
    g.rotation.y = Math.PI / 2 - a.yaw;

    animate(a, dt, a.speed);
  }

  return {
    group,
    update(dt, cameraPos, playerPos) {
      for (const a of animals) {
        const dx = a.rig.group.position.x - cameraPos.x;
        const dz = a.rig.group.position.z - cameraPos.z;
        const far = dx * dx + dz * dz > CULL_DIST * CULL_DIST;
        if (far) {
          if (a.rig.group.visible) {
            a.rig.group.visible = false;
          }
          continue;
        }
        if (!a.rig.group.visible) {
          a.rig.group.visible = true;
        }
        update(a, dt, playerPos);
      }
    }
  };
}