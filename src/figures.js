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

// The imported cowboy and cow carry authored texture maps. Hattie is the next
// named settler to get a material pass, but she still uses the lightweight
// figure rig. Keep her workwear detail in a tiny deterministic canvas map so
// the procedural fallback has a real textile read without adding an external
// asset or a new draw-call family.
const TEXTILE_CACHE = new Map();

function rgb(hex) {
  return [hex >> 16 & 255, hex >> 8 & 255, hex & 255];
}

function textileMap(color, style, part) {
  const key = `${color}|${style}|${part}`;
  let texture = TEXTILE_CACHE.get(key);
  if (texture) return texture;

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const [r, g, b] = rgb(color);
  ctx.fillStyle = `rgb(${r},${g},${b})`;
  ctx.fillRect(0, 0, size, size);

  // Two woven directions are enough to break the broad, untextured blocks at
  // close range while staying quiet at audit distance. The phase is derived
  // from the part name instead of Math.random so captures stay repeatable.
  const phase = [...part].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % 7;
  ctx.lineWidth = 1;
  for (let y = phase; y < size; y += 5) {
    ctx.strokeStyle = "rgba(255,255,255,0.075)";
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(size, y + 0.5);
    ctx.stroke();
  }
  for (let x = (phase * 3) % 5; x < size; x += 5) {
    ctx.strokeStyle = "rgba(18,20,24,0.07)";
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, size);
    ctx.stroke();
  }

  if (style === "hattie-workwear") {
    if (part === "skirt") {
      // A restrained vertical stripe gives the dark skirt a cloth direction
      // instead of another flat brown primitive.
      for (let x = 10; x < size; x += 24) {
        ctx.fillStyle = "rgba(205,215,225,0.10)";
        ctx.fillRect(x, 0, 7, size);
      }
    } else if (part === "apron") {
      ctx.strokeStyle = "rgba(236,240,240,0.19)";
      ctx.lineWidth = 2;
      ctx.strokeRect(7, 7, size - 14, size - 14);
      for (let y = 18; y < size; y += 28) {
        ctx.beginPath();
        ctx.moveTo(8, y);
        ctx.lineTo(size - 8, y);
        ctx.stroke();
      }
    } else if (part === "shirt") {
      ctx.fillStyle = "rgba(240,240,245,0.08)";
      for (let y = 14; y < size; y += 28) ctx.fillRect(0, y, size, 3);
    }
  }

  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  TEXTILE_CACHE.set(key, texture);
  return texture;
}

function figureMat(color, roughness, textureStyle, part) {
  if (!textureStyle) return mat(color, roughness);
  return new THREE.MeshStandardNodeMaterial({
    map: textileMap(color, textureStyle, part),
    color: 0xffffff,
    roughness
  });
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
  skirt = false,
  textureStyle = null,
  outfit = null
} = {}) {
  const s = height / 1.8;
  const group = new THREE.Group();
  const bob = new THREE.Group();
  group.add(bob);

  const skinMat = figureMat(skin, SKIN_ROUGHNESS, textureStyle, "skin");
  const shirtMat = figureMat(shirt, CLOTH_ROUGHNESS, textureStyle, "shirt");
  const pantsMat = figureMat(pants, CLOTH_ROUGHNESS, textureStyle, skirt ? "skirt" : "pants");
  // These are deliberately small, high-contrast details. At the camera
  // distances where a figure is only a few pixels tall, a face, collar and
  // vest edge communicate a person far better than another broad colour
  // block does.
  const leatherMat = figureMat(boots, 0.78, textureStyle, "leather");
  const eyeMat = mat(0x18120e, 0.68);
  const metalMat = mat(0xb29a6c, 0.48);

  const parts = {};

  // --- Legs: hip pivots, boot-capped ------------------------------------------------
  const hips = 0.92 * s;
  for (const side of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(0.1 * s * side, hips, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.15 * s, 0.9 * s, 0.17 * s), pantsMat);
    leg.position.y = -0.46 * s;
    leg.castShadow = true;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.17 * s, 0.15 * s, 0.24 * s), leatherMat);
    // The toe projects toward local +Z, the same direction as the figure's
    // face. It gives a planted foot rather than a pair of square stilts.
    boot.position.set(0, -0.85 * s, 0.04 * s);
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
    const vestMat = figureMat(vest, CLOTH_ROUGHNESS, textureStyle, "vest");
    // A front panel keeps the shirt visible at the shoulders and sides; the
    // old solid cuboid read as a second, featureless torso.
    const vestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42 * s, 0.42 * s, 0.035 * s), vestMat);
    vestMesh.position.set(0, 1.18 * s, 0.137 * s);
    vestMesh.castShadow = true;
    torso.add(vestMesh);
    for (const side of [-1, 1]) {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.09 * s, 0.24 * s, 0.045 * s), leatherMat);
      lapel.position.set(0.105 * s * side, 1.29 * s, 0.158 * s);
      lapel.rotation.z = -0.24 * side;
      torso.add(lapel);
    }
    for (const y of [1.19, 1.1]) {
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.023 * s, 6, 4), metalMat);
      button.position.set(0, y * s, 0.17 * s);
      torso.add(button);
    }
  }
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.46 * s, 0.07 * s, 0.28 * s), mat(0x1f150e));
  belt.position.y = 0.94 * s;
  torso.add(belt);
  if (skirt) {
    // A four-panel taper gives the skirt a real hem silhouette while keeping
    // the low-poly language and the existing single sway joint.
    const skirtMesh = new THREE.Mesh(new THREE.ConeGeometry(0.31 * s, 0.76 * s, 4), pantsMat);
    skirtMesh.position.y = 0.56 * s;
    skirtMesh.castShadow = true;
    torso.add(skirtMesh);
    parts.skirt = skirtMesh;
  }
  if (outfit === "hattie-washday") {
    const apronMat = figureMat(0x7d8995, CLOTH_ROUGHNESS, textureStyle, "apron");
    const apron = new THREE.Mesh(new THREE.BoxGeometry(0.39 * s, 0.72 * s, 0.035 * s), apronMat);
    apron.position.set(0, 0.7 * s, 0.16 * s);
    apron.castShadow = true;
    torso.add(apron);
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.48 * s, 0.055 * s, 0.05 * s), apronMat);
    tie.position.set(0, 0.96 * s, 0.17 * s);
    tie.castShadow = true;
    torso.add(tie);

    // Small washboard prop: the working pose already keeps both hands in this
    // space, so the prop gives Hattie's wash-day identity without a new rig.
    const board = new THREE.Group();
    board.position.set(0, 0.83 * s, 0.21 * s);
    board.rotation.x = -0.14;
    const boardFrame = new THREE.Mesh(new THREE.BoxGeometry(0.18 * s, 0.3 * s, 0.035 * s), figureMat(0x744b2f, 0.82, textureStyle, "washboard"));
    boardFrame.castShadow = true;
    board.add(boardFrame);
    const washMetal = new THREE.MeshStandardNodeMaterial({ color: 0xb7bcc0, roughness: 0.62 });
    for (let i = -2; i <= 2; i += 1) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.11 * s, 0.018 * s, 0.012 * s), washMetal);
      rib.position.set(0, i * 0.042 * s, 0.024 * s);
      board.add(rib);
    }
    torso.add(board);
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
    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.125 * s, 0.055 * s, 0.135 * s), leatherMat);
    cuff.position.y = -0.48 * s;
    shoulder.add(cuff);
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
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.125 * s, 0.115 * s, 0.055 * s, 8), shirtMat);
  collar.position.y = -0.035 * s;
  headGroup.add(collar);
  // Front is local +Z. Tiny inset eyes and nose survive the broad-brim
  // silhouette without turning the kit into a high-detail portrait system.
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.035 * s, 0.032 * s, 0.018 * s), eyeMat);
    eye.position.set(0.065 * s * side, 0.23 * s, 0.134 * s);
    headGroup.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.035 * s, 0.045 * s, 0.025 * s), skinMat);
  nose.position.set(0, 0.17 * s, 0.138 * s);
  headGroup.add(nose);
  if (hatStyle === "hat") {
    const hatMat = mat(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * s, 0.3 * s, 0.035 * s, 10), hatMat);
    brim.position.y = 0.32 * s;
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.19 * s, 0.15 * s, 10), hatMat);
    crown.position.y = 0.4 * s;
    crown.castShadow = true;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.193 * s, 0.193 * s, 0.025 * s, 10), leatherMat);
    band.position.y = 0.355 * s;
    headGroup.add(brim, crown, band);
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
