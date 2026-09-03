import * as THREE from "three/webgpu";
import { heightAt, normalAt } from "./world.js";
import { deckHeightAt } from "./collision.js";
import { moveAndSlide, addCylinderCollider } from "./collision.js";
import { POS, clampWorld, headingVector } from "./map.js";
import { tune } from "./debug.js";

/**
 * The horse (R10): a jointed animal in the same procedural register as the
 * figure kit — barrel with chest and haunches, an articulated neck that
 * carries and turns the head, mane and tail, and two-joint legs whose gait
 * tracks speed.
 *
 * The rig is a pivot hierarchy so `update` can animate it:
 *
 *   object (feet at y=0, local +X is forward)
 *   └─ bob                    — gait bounce and idle weight shift
 *      ├─ bodyGroup           — chest, barrel, haunches, saddle
 *      ├─ neckGroup (withers) — neck, mane, └ headGroup (muzzle, ears)
 *      ├─ tailGroup (rump)
 *      └─ legs[4] = { hip → knee → hoof }
 *
 * Like figures.js every joint is a pivot group, so this contract is the seam
 * a future skinned model drops into: same joint names, same update(dt, speed)
 * rhythm, geometry swaps out underneath.
 *
 * Facing keeps the horse's own +X-forward convention (pi/2 - yaw), which the
 * rider seat and colliders already assume.
 */

const HORSE_RADIUS = 0.78;

// Walk: a lateral four-beat (LF, RF, LH, RH offsets of the cycle). Gallop: a
// rotary pair of near-simultaneous diagonals with suspension. The gait
// crossfades between the two phase sets as speed climbs.
const WALK_PHASE = [0, 0.5, 0.25, 0.75];
const GALLOP_PHASE = [0.05, 0.15, 0.55, 0.65];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function createHorse() {
  const object = new THREE.Group();
  const hide = new THREE.MeshStandardNodeMaterial({ color: 0x5e3f28, roughness: 0.75 });
  const hideDark = new THREE.MeshStandardNodeMaterial({ color: 0x472d1c, roughness: 0.8 });
  const dark = new THREE.MeshStandardNodeMaterial({ color: 0x1c120c, roughness: 0.7 });

  const bob = new THREE.Group();
  object.add(bob);

  const parts = { legs: [] };

  // --- Body: chest, barrel, haunches ------------------------------------------------
  const bodyGroup = new THREE.Group();
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.58), hide);
  chest.position.set(0.55, 1.1, 0);
  chest.castShadow = true;
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.54, 0.64), hide);
  barrel.position.set(-0.1, 1.16, 0);
  barrel.castShadow = true;
  const haunch = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.64, 0.62), hideDark);
  haunch.position.set(-0.7, 1.12, 0);
  haunch.castShadow = true;
  bodyGroup.add(chest, barrel, haunch);

  // Saddle blanket and seat: the rider's hips sit at RIDE_SEAT = 1.42 above
  // the object origin, so the top of this stack stays at or just under that.
  const blanket = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 0.68), dark);
  blanket.position.set(-0.08, 1.44, 0);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 0.58), hideDark);
  saddle.position.set(-0.08, 1.48, 0);
  bodyGroup.add(blanket, saddle);
  bob.add(bodyGroup);

  // --- Neck and head: pivot on the topline at the withers, mane along the crest -------
  // The pivot must sit at the top of the shoulder (y ~1.4), not mid-chest —
  // a low pivot buries the neck base and the head reads as grazing.
  const neckGroup = new THREE.Group();
  neckGroup.position.set(0.62, 1.38, 0);
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.78, 0.3), hide);
  neck.position.set(0.22, 0.3, 0);
  neck.rotation.z = -0.55;
  neck.castShadow = true;
  neckGroup.add(neck);
  for (const mz of [-0.08, 0.02, 0.12]) {
    const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.34, 0.1), dark);
    tuft.position.set(0.3, 0.34, mz);
    tuft.rotation.z = -0.55;
    neckGroup.add(tuft);
  }
  const headGroup = new THREE.Group();
  headGroup.position.set(0.48, 0.62, 0);
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.26, 0.24), hide);
  skull.position.set(0.08, 0, 0);
  skull.castShadow = true;
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.16), hideDark);
  muzzle.position.set(0.32, -0.05, 0);
  const forelock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.2), dark);
  forelock.position.set(-0.1, 0.12, 0);
  const ears = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.05), hideDark);
    ear.position.set(-0.02, 0.18, 0.09 * side);
    headGroup.add(ear);
    ears.push(ear);
  }
  headGroup.add(skull, muzzle, forelock);
  neckGroup.add(headGroup);
  neckGroup.rotation.z = -0.15; // carry the head up and forward
  bob.add(neckGroup);
  parts.neck = neckGroup;
  parts.head = headGroup;
  parts.ears = ears;

  // --- Tail: pivot at the rump, hangs down-back, sways --------------------------------
  const tailGroup = new THREE.Group();
  tailGroup.position.set(-1.0, 1.3, 0);
  const tail = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.6, 3, 6), dark);
  tail.position.set(-0.16, -0.34, 0);
  tailGroup.add(tail);
  tailGroup.rotation.z = 0.3;
  bob.add(tailGroup);
  parts.tail = tailGroup;

  // --- Legs: hip pivot -> knee pivot -> hoof, both joints on the swing axis ------------
  // Front pair under the chest, rear pair under the haunches; hooves darker.
  for (const [i, [lx, lz]] of [
    [0, [0.55, 0.2]],
    [1, [0.55, -0.2]],
    [2, [-0.72, 0.22]],
    [3, [-0.72, -0.22]]
  ].entries()) {
    const hip = new THREE.Group();
    hip.position.set(lx, 1.02, lz);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.5, 0.18), i >= 2 ? hideDark : hide);
    upper.position.y = -0.25;
    upper.castShadow = true;
    const knee = new THREE.Group();
    knee.position.y = -0.5;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.13), dark);
    lower.position.y = -0.21;
    lower.castShadow = true;
    const hoof = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.16), dark);
    hoof.position.set(0.015, -0.47, 0);
    hoof.castShadow = true;
    knee.add(lower, hoof);
    hip.add(upper, knee);
    bob.add(hip);
    parts.legs.push({ hip, knee });
  }

  object.position.set(POS.ranch.x + 10.4, heightAt(POS.ranch.x + 10.4, POS.ranch.z + 13.2), POS.ranch.z + 13.2);
  const collider = addCylinderCollider(POS.ranch.x + 10.4, POS.ranch.z + 13.2, HORSE_RADIUS);

  // The horse's head is local +X, so a heading of `yaw` needs pi/2 - yaw here rather
  // than the pi - yaw used for meshes whose long axis is local +Z.
  function applyFacing(yaw) {
    object.rotation.y = Math.PI / 2 - yaw;
  }
  applyFacing(0);

  // --- Animation state ------------------------------------------------------------------
  let phase = 0;
  let idleT = Math.random() * 10;
  let prevYaw = 0;
  let headYaw = 0;

  /**
   * Drive the gait and idle motion. Called after the movement step with the
   * frame's planar speed.
   *
   * @param {number} dt frame delta
   * @param {number} speed planar speed in m/s (0 while standing)
   */
  function animate(dt, speed) {
    idleT += dt;
    const sp = Math.abs(speed);
    const moving = sp > 0.2;
    if (moving) {
      phase += dt * (6 + sp * 1.1);
    }
    // Walk amplitude saturates by a canter; the gallop blend rises from ~9 m/s.
    const amp = Math.min(sp / 7.6, 1) * 0.55;
    const g = Math.min(1, Math.max(0, (sp - 9) / 3.5)) ** 2;

    if (moving) {
      for (const [i, leg] of parts.legs.entries()) {
        const off = lerp(WALK_PHASE[i], GALLOP_PHASE[i], g) * Math.PI * 2;
        const swing = Math.sin(phase - off) * (amp + g * 0.22);
        leg.hip.rotation.z = swing;
        // The knee folds on the recovery stroke so the lower leg clears ground.
        leg.knee.rotation.z = -Math.max(0, Math.sin(phase - off - 1.1)) * (0.45 + g * 0.75);
      }
      bob.position.y = Math.abs(Math.sin(phase)) * (0.03 + g * 0.06);
      bob.rotation.z = Math.sin(phase) * 0.05 * g; // gallop rock over the suspension
      neckGroup.rotation.z = -0.15 + Math.sin(phase * 2) * 0.03 - g * 0.3; // stretch at speed
      headGroup.rotation.z = Math.sin(phase * 2 + 0.7) * 0.06;
      parts.tail.rotation.x = Math.sin(phase) * (0.1 + g * 0.12);
    } else {
      // Standing: settle the joints to a stance, then idle — weight shifts,
      // the tail sways, an ear flicks.
      const settle = Math.min(1, dt * 5);
      for (const leg of parts.legs) {
        leg.hip.rotation.z *= 1 - settle;
        leg.knee.rotation.z *= 1 - settle;
      }
      bob.position.y = Math.sin(idleT * 1.7) * 0.006;
      bob.rotation.z *= 1 - settle;
      bodyGroup.rotation.z = Math.sin(idleT * 0.4) * 0.022; // weight shift
      neckGroup.rotation.z += (-0.2 + Math.sin(idleT * 0.9) * 0.04 - neckGroup.rotation.z) * settle;
      headGroup.rotation.z = Math.sin(idleT * 1.1) * 0.05; // browsing bob
      parts.tail.rotation.x = Math.sin(idleT * 1.2) * 0.16;
      const flick = Math.exp(-((idleT % 4.3) * 5.5));
      parts.ears[0].rotation.x = -0.1 + flick * 0.45;
      parts.ears[1].rotation.x = -0.1 + flick * 0.25;
    }
  }

  const horse = {
    object,
    yaw: 0,
    speed: 0,
    mounted: false,
    radius: HORSE_RADIUS,
    collider,
    parts,
    update(dt, input, playerYaw) {
      this.yaw = playerYaw;
      applyFacing(this.yaw);
      const wish = (input.held("forward") ? 1 : 0) + (input.held("back") ? -0.4 : 0);
      const gait = (input.held("sprint") ? 14.5 : 7.6) * tune.speed;
      const target = wish * gait;
      this.speed += (target - this.speed) * Math.min(1, 3.4 * tune.speed * dt);
      if (Math.abs(this.speed) < 0.08 && wish === 0) {
        this.speed = 0;
      }
      const { x: fx, z: fz } = headingVector(this.yaw);
      const travel = this.speed * dt;
      const slices = Math.max(1, Math.ceil(Math.abs(travel) / 0.7));
      const slice = 1 / slices;
      let held = { x: object.position.x, z: object.position.z };
      for (let i = 0; i < slices; i += 1) {
        const next = moveAndSlide(
          held.x,
          held.z,
          fx * travel * slice,
          fz * travel * slice,
          HORSE_RADIUS,
          collider
        );
        held = clampWorld(next.x, next.z);
      }
      const slope = normalAt(held.x, held.z);
      if (slope.y >= 0.5) {
        object.position.x = held.x;
        object.position.z = held.z;
      }
      // Same walkable surface as the player: a horse should cross a bridge too.
      const surface = Math.max(
        heightAt(object.position.x, object.position.z),
        deckHeightAt(object.position.x, object.position.z, object.position.y, 1.4)
      );
      object.position.y += (surface - object.position.y) * Math.min(1, 14 * dt);
      collider.x = object.position.x;
      collider.z = object.position.z;
      collider.radius = this.mounted ? 0.05 : HORSE_RADIUS;

      animate(dt, this.speed);

      // Head lead into turns: the yaw rate this frame, clamped, eased onto the
      // head's yaw. Positive yaw growth is a right turn, which in the horse's
      // local frame (forward +X) is a positive head rotation.y.
      const turnRate = (playerYaw - prevYaw) / Math.max(dt, 1e-4);
      prevYaw = playerYaw;
      const lead = Math.max(-0.35, Math.min(0.35, turnRate * 0.05));
      headYaw += (lead - headYaw) * Math.min(1, dt * 8);
      parts.head.rotation.y = headYaw;
    }
  };
  return horse;
}