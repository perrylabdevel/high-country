import * as THREE from "three/webgpu";

/**
 * Legs that match their velocity.
 *
 * Two kinds of walker share this contract:
 *
 * Procedural pivot legs (figures.js, livestock.js, horse.js, traffic mounts)
 * swing a leg of length L through `amp * sin(phase)` about its hip. The foot
 * then moves at L * amp * phaseRate (cos phase) relative to the body, fastest
 * at mid-stance, the moment it stands under the hip. For that planted foot to
 * stand still on the ground while the body moves at `speed`, the phase must
 * advance at speed / (L * amp): strideRate. Anything else skates — a fixed
 * base rate (the old `4.2 + 1.1 * speed`) paddles in place at a crawl and
 * drags its feet at a run.
 *
 * Clip-driven skinned models (texturedActors.js, horseModel.js) carry the
 * stride in the clip. measureClipGroundSpeed reads it back from the planted
 * feet of the clip itself, so playback rate = speed / clipGroundSpeed with no
 * hand-typed constant to drift from what Blender authored.
 */

/** Smallest swing the rate divides by, so a near-zero amplitude cannot spin the legs. */
export const MIN_SWING = 0.08;

/**
 * Phase rate (rad/s) that keeps a planted foot still.
 * @param {number} speed ground speed, m/s
 * @param {number} legLength hip pivot to sole, m
 * @param {number} amp swing amplitude, rad (the multiplier on sin(phase))
 */
export function strideRate(speed, legLength, amp) {
  return Math.abs(speed) / (legLength * Math.max(amp, MIN_SWING));
}

/**
 * Ground speed (m/s at the model's own scale) a looping locomotion clip
 * covers at playback rate 1: the median backward speed of each foot bone
 * over the samples where it is at its lowest (planted), averaged over feet.
 *
 * The clip plays on `root` (a throwaway skeleton clone: the bones are left
 * posed), sampled in root space. Models face local +Z, so a planted foot
 * travels toward -Z.
 *
 * @param {THREE.Object3D} root skinned scene root to pose
 * @param {THREE.AnimationClip} clip
 * @param {THREE.Bone[]} feet bones whose world position is the foot
 * @returns {number} m/s, or 0 when nothing planted could be found
 */
export function measureClipGroundSpeed(root, clip, feet, samples = 96) {
  if (!clip || !feet.length) {
    return 0;
  }
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();
  const dur = clip.duration;
  const dt = dur / samples;
  const track = feet.map(() => []);
  const inv = new THREE.Matrix4();
  const p = new THREE.Vector3();
  for (let i = 0; i < samples; i += 1) {
    mixer.setTime(i * dt);
    root.updateMatrixWorld(true);
    inv.copy(root.matrixWorld).invert();
    feet.forEach((bone, k) => {
      bone.getWorldPosition(p).applyMatrix4(inv);
      track[k].push({ y: p.y, z: p.z });
    });
  }
  action.stop();
  mixer.uncacheRoot(root);
  const speeds = [];
  for (const t of track) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const s of t) {
      lo = Math.min(lo, s.y);
      hi = Math.max(hi, s.y);
    }
    const band = lo + (hi - lo) * 0.2;
    const planted = [];
    for (let i = 0; i < samples; i += 1) {
      const prev = t[(i - 1 + samples) % samples];
      const next = t[(i + 1) % samples];
      if (t[i].y <= band && prev.y <= band && next.y <= band) {
        planted.push(Math.abs(next.z - prev.z) / (2 * dt));
      }
    }
    if (planted.length) {
      planted.sort((a, b) => a - b);
      speeds.push(planted[Math.floor(planted.length / 2)]);
    }
  }
  return speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
}
