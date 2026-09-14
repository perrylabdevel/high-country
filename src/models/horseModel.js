import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { measureClipGroundSpeed } from "../gait.js";

/**
 * The authored horse (scripts/blender-horse, public/models/horse.glb): one
 * skinned body with two tack sets on the same rig — HorseSaddle for a ridden
 * horse, HorseHarness for a team in draught — and four looping clips.
 *
 * Model frame: feet on y = 0, barrel centre at the origin, facing local +Z.
 * Hosts that face +X (horse.js, the traffic mounts) turn the visual by
 * FACE_PLUS_X.
 *
 * Gait: clip weights crossfade on ground speed and each gait clip's playback
 * rate follows speed / its authored stride speed, so hooves keep pace with
 * the ground at any speed the host drives.
 */
export const HORSE_URL = "/models/horse.glb";
export const FACE_PLUS_X = Math.PI / 2;

/**
 * Ground speed (m/s) each gait clip covers at rate 1, measured from the
 * clip's planted hooves when the model loads (gait.js). Blend bands below
 * are placed between these, so a re-authored stride moves them too.
 */
const GAITS = ["Walk", "Trot", "Gallop"];
const HOOVES = ["hoof_f.L", "hoof_f.R", "hoof_h.L", "hoof_h.R"];
const TACK = { saddle: "HorseSaddle", harness: "HorseHarness" };

let template = null;

export function loadHorseModel(url = HORSE_URL) {
  if (!template) {
    template = new GLTFLoader().loadAsync(url).then(prepareHorseGltf);
  }
  return template;
}

/** Shadow flags and measured clip ground speeds on a parsed horse.glb (also for offline checks). */
export function prepareHorseGltf(gltf) {
  gltf.scene.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      // Skinned bounds from the bind pose are too small once a leg swings.
      o.frustumCulled = false;
    }
  });
  const speeds = {};
  for (const name of GAITS) {
    const clip = gltf.animations.find((c) => c.name === name);
    const probe = cloneSkeleton(gltf.scene);
    const feet = [];
    probe.traverse((o) => {
      // GLTFLoader strips the dot: hoof_f.L arrives as hoof_fL.
      if (o.isBone && HOOVES.some((h) => h.replace(".", "") === o.name)) feet.push(o);
    });
    speeds[name] = measureClipGroundSpeed(probe, clip, feet);
  }
  gltf.userData.gaitSpeed = speeds;
  return gltf;
}

function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * An independent horse visual from the loaded template.
 * @param {object} gltf loaded horse.glb
 * @param {{ tack?: "saddle" | "harness" | "none", phase?: number }} opts
 */
export function createHorseVisual(gltf, { tack = "saddle", phase = Math.random() } = {}) {
  const source = cloneSkeleton(gltf.scene);
  for (const [kind, name] of Object.entries(TACK)) {
    const node = source.getObjectByName(name);
    if (node) {
      node.visible = kind === tack;
    }
  }
  const object = new THREE.Group();
  object.name = "horseVisual";
  object.add(source);
  const gaitSpeed = gltf.userData.gaitSpeed || { Walk: 1.6, Trot: 3.7, Gallop: 10.5 };
  const mixer = new THREE.AnimationMixer(source);
  const actions = {};
  for (const clip of gltf.animations) {
    const action = mixer.clipAction(clip);
    action.play();
    action.setEffectiveWeight(clip.name === "Idle" ? 1 : 0);
    action.time = phase * clip.duration;
    actions[clip.name] = action;
  }
  return {
    object,
    actions,
    /** Ground speed (m/s) each gait clip covers at rate 1. */
    gaitSpeed,
    /**
     * @param {number} dt frame delta
     * @param {number} speed planar ground speed, m/s (sign ignored)
     */
    update(dt, speed) {
      const sp = Math.abs(speed);
      // Walk takes over from idle, trot from walk, gallop from trot.
      const moving = smooth(0.15, 0.7, sp);
      // A horse walks to about 1.8 m/s and trots to about 5 m/s before it
      // breaks into a gallop; the clips' own rates stretch across each band.
      const trot = smooth(Math.max(1.3, gaitSpeed.Walk * 1.5), 2.3, sp);
      const gallop = smooth(5.2, 6.5, sp);
      const w = {
        Idle: 1 - moving,
        Walk: moving * (1 - trot),
        Trot: moving * trot * (1 - gallop),
        Gallop: moving * gallop
      };
      for (const [name, action] of Object.entries(actions)) {
        action.setEffectiveWeight(w[name] ?? 0);
        const clipSpeed = gaitSpeed[name];
        if (clipSpeed) {
          action.setEffectiveTimeScale(Math.min(3, Math.max(0.3, sp / clipSpeed)));
        }
      }
      mixer.update(dt);
    }
  };
}
