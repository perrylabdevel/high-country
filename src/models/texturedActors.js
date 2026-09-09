import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

// The source models do not share a coordinate convention. The cow was measured
// from its GLB rig: its muzzle is +Z of _rootJoint, while High Country actors
// face local +X. Keep those facts here instead of making call sites guess.
const MODEL = {
  cow: { sourceForward: new THREE.Vector3(0, 0, 1), hostHeading: Math.PI / 2, idle: "Armature|idle1", gait: true },
  cowboy: {
    sourceForward: new THREE.Vector3(0, 0, 1), hostHeading: 0,
    // The only exported cowboy action is a zero-duration Mixamo pose with a
    // hips position track. It is not an idle/walk clip; never play it.
    gait: true
  }
};

const templates = new Map();
const legNames = ["lfl1_017", "lfr1_021", "lbl1_02", "lbr1_031"];

function kindFor(url) {
  return url.includes("farm-cow.glb") ? "cow" : "cowboy";
}

function prepare(scene, kind) {
  scene.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    // Sketchfab's farm-cow hide was exported metallic 0.6987. It is hide,
    // not lacquered metal. Do not alter the separate eye material.
    if (kind === "cow" && node.material?.name === "material") node.material.metalness = 0;
  });
}

function sourceBounds(scene) {
  scene.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(scene);
}

function findBones(object) {
  const bones = new Map();
  object.traverse((node) => { if (node.isBone) bones.set(node.name, node); });
  return bones;
}

// Scratch state for worldAxisPose. The pose pass ran per bone per actor per
// frame (six joints on a walking cowboy, seven on a grazing cow) and each
// call allocated three Quaternions; reused scratch turns that into zero.
const _parentWorld = new THREE.Quaternion();
const _delta = new THREE.Quaternion();
const _axisQ = new THREE.Quaternion();
const _rest = new THREE.Quaternion();

function worldAxisPose(bone, rest, axis, angle) {
  bone.parent.updateWorldMatrix(true, false);
  bone.parent.getWorldQuaternion(_parentWorld);
  // localDelta = parentWorld⁻¹ · rot(axis, angle) · parentWorld
  _delta.copy(_parentWorld).invert()
    .multiply(_axisQ.setFromAxisAngle(axis, angle))
    .multiply(_parentWorld);
  bone.quaternion.copy(_delta).multiply(rest);
}

// Body-relative world axes, resolved every frame from the actor's actual
// world orientation. The actor is parented to a rig group that the host
// rotates to face the walk (and re-rotates while it wanders), so a fixed
// world axis only reads correctly at heading 0: at 90 degrees the cowboy
// arms stayed in the T-pose and at 180 they pointed up. Deriving the axes
// from the live world quaternion keeps every pose correct at any heading.
function bodyAxes(object) {
  const worldQ = new THREE.Quaternion();
  const forward = new THREE.Vector3();
  const lateral = new THREE.Vector3();
  return () => {
    object.getWorldQuaternion(worldQ);
    forward.set(0, 0, 1).applyQuaternion(worldQ);
    lateral.set(1, 0, 0).applyQuaternion(worldQ);
    return { forward, lateral };
  };
}

function makeCowGait(bones, object) {
  const legs = legNames.map((name) => bones.get(name)).filter(Boolean).map((bone) => ({ bone, rest: bone.quaternion.clone() }));
  const necks = [bones.get("neck2_010"), bones.get("neck_011"), bones.get("head_012")]
    .filter(Boolean).map((bone) => ({ bone, rest: bone.quaternion.clone() }));
  const axes = bodyAxes(object);
  return ({ speed = 0, phase = 0, grazing = false, headPitch = 0 }) => {
    const axis = axes().lateral;
    const walking = speed > 0.05;
    if (walking) {
      const offsets = [0, Math.PI, Math.PI, 0];
      for (let i = 0; i < legs.length; i += 1) {
        const swing = Math.sin(phase + offsets[i]) * Math.min(0.42, 0.2 + speed * 0.12);
        worldAxisPose(legs[i].bone, legs[i].rest, axis, swing);
      }
    }
    // livestock's headPitch is negative when grazing because its old head
    // faced +X. This source faces +Z, so invert it for an X-axis dip.
    const dip = grazing ? Math.max(0.3, -headPitch) : 0;
    if (grazing) {
      for (const [i, neck] of necks.entries()) {
        worldAxisPose(neck.bone, neck.rest, axis, dip * [0.32, 0.42, 0.26][i]);
      }
    }
  };
}

function makeCowboyGait(bones, object) {
  const joint = (name) => {
    const bone = bones.get(name);
    return bone ? { bone, rest: bone.quaternion.clone() } : null;
  };
  const leftArm = joint("mixamorigLeftArm_08");
  const rightArm = joint("mixamorigRightArm_028");
  const leftLeg = joint("mixamorigLeftUpLeg_047");
  const rightLeg = joint("mixamorigRightUpLeg_052");
  const spine = joint("mixamorigSpine1_03");
  const axes = bodyAxes(object);
  // Lower from the T-pose bind into a relaxed hang. 1.42 rad leaves the arm
  // ~9 degrees off vertical, a natural stance rather than the old A-pose.
  const ARM_DROP = 1.42;
  // Compose a second world-axis rotation on top of whatever the joint already
  // carries (worldAxisPose takes the current quaternion as its rest). The
  // current quaternion must be snapshotted before copy() overwrites it.
  const addWorld = (joint, axis, angle) => {
    if (joint) {
      _rest.copy(joint.bone.quaternion);
      worldAxisPose(joint.bone, _rest, axis, angle);
    }
  };

  return ({ speed = 0, phase = 0 }) => {
    const moving = speed > 0.05;
    const stride = moving ? Math.sin(phase) * Math.min(0.48, 0.2 + speed * 0.2) : 0;
    const { forward, lateral } = axes();
    if (leftArm) {
      worldAxisPose(leftArm.bone, leftArm.rest, forward, -ARM_DROP);
      if (moving) addWorld(leftArm, lateral, -stride * 0.6);
    }
    if (rightArm) {
      worldAxisPose(rightArm.bone, rightArm.rest, forward, ARM_DROP);
      if (moving) addWorld(rightArm, lateral, stride * 0.6);
    }
    if (leftLeg) worldAxisPose(leftLeg.bone, leftLeg.rest, lateral, stride);
    if (rightLeg) worldAxisPose(rightLeg.bone, rightLeg.rest, lateral, -stride);
    if (spine) worldAxisPose(spine.bone, spine.rest, lateral, moving ? 0.06 : Math.sin(phase * 0.23) * 0.012);
  };
}

function actorFactory(template) {
  return ({ targetHeight, heading = 0 }) => {
    const source = cloneSkeleton(template.scene);
    const config = MODEL[template.kind];
    const scale = targetHeight / template.height;
    // Wrapper owns grounding/scale/heading; a mixer cannot overwrite those
    // values, and the cloned source retains every authored transform.
    const object = new THREE.Group();
    const normalized = new THREE.Group();
    object.rotation.y = config.hostHeading + heading;
    normalized.scale.setScalar(scale);
    normalized.position.y = -template.bounds.min.y * scale;
    normalized.add(source);
    object.add(normalized);

    const bones = findBones(source);
    const idle = config.idle ? template.clips.find((clip) => clip.name === config.idle) : null;
    const mixer = idle ? new THREE.AnimationMixer(source) : null;
    const action = mixer ? mixer.clipAction(idle).play() : null;
    const gait = config.gait ? (template.kind === "cow" ? makeCowGait(bones, object) : makeCowboyGait(bones, object)) : null;
    const forwardReach = config.sourceForward.z > 0 ? template.bounds.max.z * scale : -template.bounds.min.z * scale;
    let phaseClock = 0;

    return {
      object,
      forwardReach,
      update(dt, state = {}) {
        if (typeof state === "number") state = { speed: state };
        phaseClock += dt * (state.speed > 0.05 ? 6.2 : 1.4);
        if (state.phase == null) state.phase = phaseClock;
        if (action) action.timeScale = state.speed > 0.05 ? 0.35 : 0.7;
        if (mixer) mixer.update(dt);
        gait?.(state);
      }
    };
  };
}

/** Build from parsed data too, so offline checks exercise the shipped pose. */
export function createTexturedActorFactory(gltf, url) {
  if (!gltf.scene) throw new Error(`GLB has no scene: ${url}`);
  const kind = kindFor(url);
  prepare(gltf.scene, kind);
  const bounds = sourceBounds(gltf.scene);
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height <= 0) throw new Error(`GLB has no usable upright bounds: ${url}`);
  return actorFactory({ scene: gltf.scene, clips: gltf.animations, bounds, height, kind });
}

/** Load once, then return independently skinned, normalized actor visuals. */
export async function loadTexturedActor(url) {
  let factory = templates.get(url);
  if (!factory) {
    factory = createTexturedActorFactory(await new GLTFLoader().loadAsync(url), url);
    templates.set(url, factory);
  }
  return factory;
}

/** Load a visual without ever making the actor unavailable on failure. */
export async function installTexturedPilot(url, install) {
  try {
    const factory = await loadTexturedActor(url);
    install(factory);
    return true;
  } catch (err) {
    console.warn(`Textured actor pilot unavailable (${url}); using procedural fallback.`, err);
    return false;
  }
}
