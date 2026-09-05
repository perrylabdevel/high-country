import * as THREE from "three/webgpu";

/**
 * Procedural low-poly figures for everyone the player sees up close: the
 * third-person player avatar and every NPC in a dialogue. The kit replaces
 * the capsule+torso-sphere prototypes (R9) with dressed 1880s figures —
 * torso, vest, belt, jointed legs and arms, a head with a hat or hair —
 * built from the same primitives as the building kit so they sit in the
 * world's visual register.
 *
 * The figure is a small hierarchy of pivots so `update` can animate it:
 *
 *   group (feet at y=0)
 *   └─ bob                     — the walk bounce, keeps the ground pose clean
 *      ├─ legL/legR (hip pivots at 0.92)
 *      ├─ torsoGroup (vest, belt)
 *      ├─ armL/armR (shoulder pivots at 1.44)
 *      └─ headGroup (neck, head, hat or hair)
 *
 * `update(dt, speed, mounted)` drives a procedural stride — legs and arms
 * swing against each other, the body bobs, the torso leans into speed —
 * and blends to idle breathing when the figure stands. `mounted` swaps the
 * stride for a seat: thighs forward, legs splayed to an animal's sides,
 * arms reaching for the reins.
 */

const SKIN_ROUGHNESS = 0.55;
const CLOTH_ROUGHNESS = 0.85;

function mat(color, roughness = CLOTH_ROUGHNESS) {
  return new THREE.MeshStandardNodeMaterial({ color, roughness });
}

export function createFigure({
  height = 1.8,
  skin = 0xe0c29a,
  shirt = 0x6b4226,
  vest = null,
  pants = 0x33261a,
  boots = 0x1f150e,
  hat = 0x3d2918,
  hatStyle = "hat", // "hat" | "hair" | "none"
  hair = 0x2e2118,
  skirt = false
} = {}) {
  const s = height / 1.8;
  const group = new THREE.Group();
  const bob = new THREE.Group();
  group.add(bob);

  const skinMat = mat(skin, SKIN_ROUGHNESS);
  const shirtMat = mat(shirt);
  const pantsMat = mat(pants);

  const parts = {};

  // --- Legs: hip pivots, boot-capped ------------------------------------------------
  const hips = 0.92 * s;
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.1 * s * side, hips, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15 * s, 0.9 * s, 0.17 * s), pantsMat);
    leg.position.y = -0.46 * s;
    leg.castShadow = true;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17 * s, 0.15 * s, 0.21 * s), mat(boots));
    boot.position.set(0, -0.85 * s, 0.02 * s);
    boot.castShadow = true;
    hip.add(leg, boot);
    hip.rotation.z = 0.03 * side; // a hair of stance
    bob.add(hip);
    parts[side < 0 ? "legL" : "legR"] = hip;
    if (skirt) {
      hip.visible = false;
    }
  }

  // --- Torso: shirt, vest, belt ------------------------------------------------------
  const torso = new THREE.Group();
  torso.position.y = 0;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.42 * s, 0.58 * s, 0.24 * s), shirtMat);
  chest.position.y = 1.22 * s;
  chest.castShadow = true;
  torso.add(chest);
  if (vest) {
    const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.45 * s, 0.4 * s, 0.27 * s), mat(vest));
    vestMesh.position.y = 1.18 * s;
    vestMesh.castShadow = true;
    torso.add(vestMesh);
  }
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.46 * s, 0.07 * s, 0.28 * s), mat(0x1f150e));
  belt.position.y = 0.94 * s;
  torso.add(belt);
  if (skirt) {
    // A full skirt: one tapered box from hip to mid-shin, a gentle sway in
    // update() stands in for the stride the hidden legs no longer show.
    const skirtMesh = new THREE.Mesh(new THREE.BoxGeometry(0.46 * s, 0.78 * s, 0.34 * s), pantsMat);
    skirtMesh.position.y = 0.56 * s;
    skirtMesh.castShadow = true;
    torso.add(skirtMesh);
    parts.skirt = skirtMesh;
  }
  bob.add(torso);
  parts.torso = torso;

  // --- Arms: shoulder pivots, sleeve + hand ------------------------------------------
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(0.275 * s * side, 1.44 * s, 0);
    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.11 * s, 0.52 * s, 0.12 * s), shirtMat);
    sleeve.position.y = -0.25 * s;
    sleeve.castShadow = true;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09 * s, 0.1 * s, 0.1 * s), skinMat);
    hand.position.y = -0.56 * s;
    shoulder.add(sleeve, hand);
    shoulder.rotation.z = -0.06 * side;
    bob.add(shoulder);
    parts[side < 0 ? "armL" : "armR"] = shoulder;
  }

  // --- Head: neck, head, hat or hair --------------------------------------------------
  const headGroup = new THREE.Group();
  headGroup.position.y = 1.55 * s;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 0.08 * s, 8), shirtMat);
  neck.position.y = 0.02 * s;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24 * s, 0.27 * s, 0.25 * s), skinMat);
  head.position.y = 0.19 * s;
  head.castShadow = true;
  headGroup.add(neck, head);
  if (hatStyle === "hat") {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.3 * s, 0.035 * s, 10), mat(hat));
    brim.position.y = 0.32 * s;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.19 * s, 0.15 * s, 10), mat(hat));
    crown.position.y = 0.4 * s;
    crown.castShadow = true;
    headGroup.add(brim, crown);
  } else if (hatStyle === "hair") {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.26 * s, 0.12 * s, 0.27 * s), mat(hair, 0.9));
    cap.position.y = 0.31 * s;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.26 * s, 0.18 * s, 0.08 * s), mat(hair, 0.9));
    back.position.set(0, 0.22 * s, -0.13 * s);
    headGroup.add(cap, back);
  }
  bob.add(headGroup);
  parts.head = headGroup;

  // --- Animation state -----------------------------------------------------------------
  let stride = 0;
  let idleT = Math.random() * 10; // desync NPC idle phases
  let lean = 0;

  /**
   * Drive the procedural motion.
   *
   * @param {number} dt    frame delta
   * @param {number} speed planar speed in m/s (0 while standing)
   * @param {boolean} mounted seated pose instead of the stride
   */
  function update(dt, speed, mounted = false) {
    idleT += dt;
    const moving = speed > 0.15;
    if (moving) {
      // Stride frequency tracks speed; the amplitude saturates at a run so
      // the gallop lengthens into a longer swing, not a frantic flail.
      stride += dt * (4.4 + speed * 2.6);
    }
    const amp = Math.min(speed / 3.4, 1.15) * 0.62;
    const swing = Math.sin(stride) * amp;

    if (mounted) {
      // Seated: thighs swing forward down the animal's sides, hands low and
      // forward for the reins (the figure's front is local +Z, the direction
      // the mount travels). The rotations are NEGATIVE about X: the leg mesh
      // hangs at -Y from its pivot, so a positive X rotation carries the knee
      // toward -Z — behind the rider. Verified against the hair mesh, which
      // sits at -Z and marks the figure's back. The seat keeps the figure
      // still — only breathing moves.
      for (const [leg, side] of [["legL", -1], ["legR", 1]]) {
        parts[leg].rotation.x = -1.22;
        parts[leg].rotation.z = 0.3 * side;
      }
      parts.armL.rotation.x = -0.5;
      parts.armR.rotation.x = -0.5;
      parts.torso.rotation.x = 0.04; // +Y top rotated +X leans toward +Z: a forward seat
      bob.position.y = Math.sin(idleT * 1.7) * 0.008;
    } else if (moving) {
      parts.legL.rotation.x = swing;
      parts.legR.rotation.x = -swing;
      parts.armL.rotation.x = -swing * 0.55;
      parts.armR.rotation.x = swing * 0.55;
      parts.torso.rotation.x = Math.min(speed / 6.2, 1) * 0.1;
      bob.position.y = Math.abs(Math.sin(stride)) * 0.045 * Math.min(speed / 3.4, 1);
      if (parts.skirt) {
        parts.skirt.rotation.x = swing * 0.25;
      }
    } else {
      // Idle: settle the joints home, breathe, weight-shift.
      const settle = Math.min(1, dt * 6);
      for (const j of ["legL", "legR", "armL", "armR", "torso"]) {
        parts[j].rotation.x *= 1 - settle;
      }
      if (!skirt) {
        parts.legL.rotation.z = -0.03;
        parts.legR.rotation.z = 0.03;
      }
      parts.armL.rotation.x = Math.sin(idleT * 0.9) * 0.03;
      parts.armR.rotation.x = Math.sin(idleT * 0.9 + 1.3) * 0.03;
      parts.torso.rotation.x = Math.sin(idleT * 1.7) * 0.006;
      bob.position.y = Math.sin(idleT * 1.7) * 0.008;
      if (parts.skirt) {
        parts.skirt.rotation.x *= 1 - settle;
      }
    }
    // Lean eases in and out rather than snapping with the stride.
    const leanTarget = moving ? Math.min(speed / 6.2, 1) * 0.1 : 0;
    lean += (leanTarget - lean) * Math.min(1, dt * 5);
    group.rotation.x = lean;
  }

  return { group, update, parts };
}