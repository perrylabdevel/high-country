import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

// GLTFLoader's PropertyBinding.sanitizeNodeName strips colons, dots and
// slashes from node names and three's exporter renumbers with a trailing _NN,
// so an authored `DEF-upper_arm.L_0122` arrives as `DEF-upper_armL_0122`.
// Matching on a "core" (sanitized form with trailing _NN dropped) is robust
// against both the authored and the runtime form and against the differing
// numeric suffixes of the cowboy vs child skeletons.
function coreBoneName(name) {
  // Order matters: drop the exporter's trailing _NN BEFORE collapsing the
  // remaining separators, or `mixamorig_LeftArm_011` would core as
  // `mixamorigLeftArm011`. Collapsing underscores is what lets one table serve
  // skeletons that differ only in punctuation — the cowboy exports
  // `mixamorigLeftArm_08` while the settler woman exports
  // `mixamorig_LeftArm_011`, and both core to `mixamorigLeftArm`.
  return name.replace(/[.:/]/g, "").replace(/_(\d+)$/, "").replace(/_/g, "");
}
function boneByCore(bones, core) {
  for (const [name, bone] of bones) {
    if (coreBoneName(name) === core) return bone;
  }
  return null;
}

const CORES_DEF = {
  armL: "DEF-upperarmL",
  armR: "DEF-upperarmR",
  legL: "DEF-thighL",
  legR: "DEF-thighR",
  torso: "DEF-spine",
  head: "DEF-spine006"
};
// Gunnar is a Character Creator export: a third skeleton naming scheme
// alongside Mixamo and the Blender DEF rig. `coreBoneName` drops the trailing
// _NN, so `CC_Base_L_Upperarm_45` resolves as `CC_Base_L_Upperarm`.
const CORES_CC = {
  armL: "CCBaseLUpperarm",
  armR: "CCBaseRUpperarm",
  legL: "CCBaseLThigh",
  legR: "CCBaseRThigh",
  torso: "CCBaseSpine02",
  head: "CCBaseHead"
};
const CORES_MIXA = {
  armL: "mixamorigLeftArm",
  armR: "mixamorigRightArm",
  legL: "mixamorigLeftUpLeg",
  legR: "mixamorigRightUpLeg",
  torso: "mixamorigSpine1",
  head: "mixamorigHead"
};

// The source models do not share a coordinate convention. The cow was measured
// from its GLB rig: its muzzle is +Z of _rootJoint, while High Country actors
// face local +X. Keep those facts here instead of making call sites guess.
const MODEL = {
  cow: { sourceForward: new THREE.Vector3(0, 0, 1), hostHeading: Math.PI / 2, idle: "Armature|idle1", gait: true },
  cowboy: {
    sourceForward: new THREE.Vector3(0, 0, 1), hostHeading: 0,
    // The only exported cowboy action is a zero-duration Mixamo pose with a
    // hips position track. It is not an idle/walk clip; never play it.
    gait: true, coreHandles: CORES_MIXA
  },
  lucille: {
    sourceForward: new THREE.Vector3(0, 0, 1), hostHeading: 0,
    idle: "Idle_g", walk: "Walk_g", coreHandles: CORES_DEF
  },
  lillian: {
    sourceForward: new THREE.Vector3(0, 0, 1), hostHeading: 0,
    idle: "Idle_g", walk: null, coreHandles: CORES_DEF
  },
  // The settler woman is a Mixamo skeleton (underscored export) with no clips,
  // so she rides the same procedural gait as the cowboy — the collapsed cores
  // above resolve both skeletons from one table.
  settlerwoman: {
    sourceForward: new THREE.Vector3(0, 0, 1), hostHeading: 0,
    gait: true, coreHandles: CORES_MIXA
  },
  gunnar: {
    sourceForward: new THREE.Vector3(0, 0, 1), hostHeading: 0,
    // Ships real locomotion, so no procedural gait: hand-on-holster is the
    // general-purpose idle ("04-leaning" only reads right against a post).
    idle: "03-handonholster", walk: "02-walk-normal", coreHandles: CORES_CC
  },
  childboy: {
    sourceForward: new THREE.Vector3(0, 0, 1), hostHeading: 0,
    idle: null, walk: null, coreHandles: CORES_MIXA, gait: true
  }
};

const templates = new Map();
const legNames = ["lfl1_017", "lfr1_021", "lbl1_02", "lbr1_031"];

function kindFor(url) {
  if (url.includes("farm-cow.glb")) return "cow";
  if (url.includes("gunnar")) return "gunnar";
  if (url.includes("medieval_poor_woman")) return "settlerwoman";
  if (url.includes("lucille")) return "lucille";
  if (url.includes("lillian")) return "lillian";
  if (url.includes("child")) return "childboy";
  return "cowboy";
}

// Sleeve-only skinning for the settler woman. Full proximity weight transfer
// was tried and rejected twice: it fixes the sleeves but drags the blouse's
// chest panel off the body, because the garment is a separate outer layer over
// a nude body and copying the body's weights for EVERY vertex collapses that
// layer onto it. This bind is scoped instead: each garment vertex borrows the
// weights of the nearest body vertex, but keeps only its arm-bone share; the
// non-arm remainder stays on the bind-static root. Sleeve fabric therefore
// follows the arm exactly as far as the body under it does, while the blouse
// torso and skirt keep a single static root weight and cannot collapse.
const SETTLER_ARM_CHAIN = {
  L: ["mixamorigLeftShoulder", "mixamorigLeftArm", "mixamorigLeftForeArm", "mixamorigLeftHand"],
  R: ["mixamorigRightShoulder", "mixamorigRightArm", "mixamorigRightForeArm", "mixamorigRightHand"]
};
// A garment vertex further than this from every body vertex (metres) is fully
// static rather than borrowing a distant bone; the grid cell sets lookup cost.
const SLEEVE_MATCH_M = 0.30;
const SLEEVE_CELL_M = 0.05;

function bindSettlerGarments(scene) {
  scene.updateMatrixWorld(true);
  const bodyMeshes = [];
  scene.traverse((node) => { if (node.isSkinnedMesh) bodyMeshes.push(node); });
  if (!bodyMeshes.length) return;
  const body = bodyMeshes[0];
  const skeleton = body.skeleton;
  const indexByName = new Map(skeleton.bones.map((bone, i) => [bone.name, i]));
  const findCore = (core) => skeleton.bones.find((bone) => coreBoneName(bone.name) === core) ?? null;
  const armBones = new Set();
  for (const side of ["L", "R"]) {
    const chain = SETTLER_ARM_CHAIN[side].map(findCore);
    // Unknown skeleton: leave the garment static rather than guess.
    if (chain.some((bone) => !bone)) return;
    for (const bone of chain) armBones.add(indexByName.get(bone.name));
  }
  const rootBone = findCore("rootJoint") ?? skeleton.bones[0];
  const rootIndex = indexByName.get(rootBone.name);
  const headBone = findCore("mixamorigHead");
  const headIndex = headBone ? indexByName.get(headBone.name) : rootIndex;
  // Converts any mesh's world matrix into the body's bind space at bind time.
  const bodyBindSpace = body.bindMatrix.clone().multiply(body.matrixWorld.clone().invert());

  // Every body vertex position and its four bone weights, in world space, in a
  // uniform grid, so each garment vertex can find the surface it sits on.
  const samples = [];
  const sampleBone = [];
  const sampleWeight = [];
  const vertex = new THREE.Vector3();
  const components = ["X", "Y", "Z", "W"];
  for (const mesh of bodyMeshes) {
    const position = mesh.geometry.attributes.position;
    const skinIndex = mesh.geometry.attributes.skinIndex;
    const skinWeight = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < position.count; i += 1) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      samples.push(vertex.x, vertex.y, vertex.z);
      for (const c of components) {
        sampleBone.push(skinIndex[`get${c}`](i));
        sampleWeight.push(skinWeight[`get${c}`](i));
      }
    }
  }
  const cellKey = (x, y, z) => `${Math.floor(x / SLEEVE_CELL_M)},${Math.floor(y / SLEEVE_CELL_M)},${Math.floor(z / SLEEVE_CELL_M)}`;
  const grid = new Map();
  for (let i = 0; i < samples.length / 3; i += 1) {
    const key = cellKey(samples[i * 3], samples[i * 3 + 1], samples[i * 3 + 2]);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }
  const maxRing = Math.ceil(SLEEVE_MATCH_M / SLEEVE_CELL_M) + 1;
  const nearestSample = (x, y, z) => {
    const bx = Math.floor(x / SLEEVE_CELL_M);
    const by = Math.floor(y / SLEEVE_CELL_M);
    const bz = Math.floor(z / SLEEVE_CELL_M);
    let bestDistance = Infinity;
    let bestIndex = -1;
    for (let r = 0; r <= maxRing; r += 1) {
      for (let dx = -r; dx <= r; dx += 1) for (let dy = -r; dy <= r; dy += 1) for (let dz = -r; dz <= r; dz += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue;
        const bucket = grid.get(`${bx + dx},${by + dy},${bz + dz}`);
        if (!bucket) continue;
        for (const index of bucket) {
          const ox = samples[index * 3] - x;
          const oy = samples[index * 3 + 1] - y;
          const oz = samples[index * 3 + 2] - z;
          const distance = ox * ox + oy * oy + oz * oz;
          if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
        }
      }
      // A point in the next shell is at least r cells away, so once the best
      // hit is closer than that shell's floor, no later shell can beat it.
      if (bestIndex >= 0 && r * SLEEVE_CELL_M > Math.sqrt(bestDistance) + SLEEVE_CELL_M) break;
    }
    return { index: bestIndex, distance: bestIndex >= 0 ? Math.sqrt(bestDistance) : Infinity };
  };

  const loose = [];
  scene.traverse((node) => { if (node.isMesh && !node.isSkinnedMesh) loose.push(node); });
  for (const mesh of loose) {
    const position = mesh.geometry.attributes.position;
    const count = position.count;
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    // Small static meshes over the head (scarf/bonnet) ride the head bone.
    const isGarment = count > 1000;
    for (let i = 0; i < count; i += 1) {
      const o = i * 4;
      if (!isGarment) {
        skinIndex[o] = headIndex;
        skinWeight[o] = 1;
        continue;
      }
      vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      const near = nearestSample(vertex.x, vertex.y, vertex.z);
      if (near.index < 0 || near.distance > SLEEVE_MATCH_M) {
        skinIndex[o] = rootIndex;
        skinWeight[o] = 1;
        continue;
      }
      let armSum = 0;
      for (let c = 0; c < 4; c += 1) {
        if (armBones.has(sampleBone[near.index * 4 + c])) armSum += sampleWeight[near.index * 4 + c];
      }
      if (armSum <= 0.001) {
        skinIndex[o] = rootIndex;
        skinWeight[o] = 1;
        continue;
      }
      // Keep the body's arm weights; the non-arm remainder (the torso share at
      // the shoulder) stays on the static root, so the seam blends, not tears.
      const kept = [];
      for (let c = 0; c < 4; c += 1) {
        const bone = sampleBone[near.index * 4 + c];
        const weight = sampleWeight[near.index * 4 + c];
        if (armBones.has(bone) && weight > 0) kept.push([bone, weight]);
      }
      if (armSum < 1 - 1e-4) kept.push([rootIndex, 1 - armSum]);
      kept.sort((a, b) => b[1] - a[1]);
      let slot = 0;
      for (const [bone, weight] of kept) {
        if (slot >= 4) break;
        skinIndex[o + slot] = bone;
        skinWeight[o + slot] = weight;
        slot += 1;
      }
      if (slot === 0) {
        skinIndex[o] = rootIndex;
        skinWeight[o] = 1;
      }
    }
    mesh.geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndex, 4));
    mesh.geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeight, 4));
    const skinned = new THREE.SkinnedMesh(mesh.geometry, mesh.material);
    skinned.name = mesh.name;
    skinned.position.copy(mesh.position);
    skinned.quaternion.copy(mesh.quaternion);
    skinned.scale.copy(mesh.scale);
    skinned.castShadow = mesh.castShadow;
    skinned.receiveShadow = mesh.receiveShadow;
    // The garment geometry shares the body's armature-local space, but a
    // mesh like the bonnet sits under an empty that places it at the head, so
    // neither the body's bind matrix nor the mesh's own world matrix is right
    // on its own. Map the mesh into the body's bind space: B_body · M_body⁻¹ ·
    // M_mesh reproduces the mesh's world position at bind for either case.
    const bindMatrix = bodyBindSpace.clone().multiply(mesh.matrixWorld);
    skinned.bind(skeleton, bindMatrix);
    const parent = mesh.parent;
    parent.add(skinned);
    parent.remove(mesh);
  }
  scene.updateMatrixWorld(true);
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
  if (kind === "settlerwoman") bindSettlerGarments(scene);
}

function sourceBounds(scene) {
  scene.updateMatrixWorld(true);
  const boxes = [];
  scene.traverse((node) => {
    if (!node.isMesh) return;
    if (node.isSkinnedMesh) {
      // A Blender DEF-rig exported through Sketchfab binds the mesh in a
      // different scale domain than the skinned result (Lucille: geometry
      // bind height ~185 units, skinned height ~703). Raw geometry bbox
      // therefore reports a tiny height and the factory scales the character
      // metres tall. computeBoundingBox() gives the SKINNED local bounds;
      // applying matrixWorld yields true world extent. For Mixamo models
      // (bind ≈ skinned) this is a no-op.
      node.computeBoundingBox();
      boxes.push(node.boundingBox.clone().applyMatrix4(node.matrixWorld));
      return;
    }
    node.geometry.computeBoundingBox();
    boxes.push(node.geometry.boundingBox.clone().applyMatrix4(node.matrixWorld));
  });
  // Some Sketchfab exports carry orphan meshes far outside the body. A naive
  // union would skew the grounding. Reject any mesh whose min.y is a clear
  // outlier below the median min.y; the body's own meshes dominate.
  const mins = boxes.map((b) => b.min.y).sort((a, b) => a - b);
  const medianMin = mins[Math.floor(mins.length / 2)];
  const kept = boxes.filter((b) => b.min.y > medianMin - 2.0);
  const box = new THREE.Box3().makeEmpty();
  for (const b of (kept.length ? kept : boxes)) box.union(b);
  return box;
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

// A pose authored for the procedural figure writes absolute Euler angles on
// plain groups. A mixamorig bone's rest is a non-trivial bind pose, so an
// absolute local Euler would snap the limb somewhere unmeant. A joint handle
// keeps the pose's Euler semantics but applies each component as a world-axis
// rotation composed onto the bone's CURRENT quaternion — the same mechanism
// the gait uses — so authored poses transfer unchanged.
// x -> pitch about lateral, y -> yaw about world up, z -> roll about forward.
// Composition is safe from accumulation only because the gait re-primes every
// handle bone from its own rest each frame (arms get the hanging arm-drop,
// spine its idle sway, legs the stride or 0, head an identity prime), so the
// bone's current quaternion is always bind-primed baseline, never last
// frame's pose.
const _UP = new THREE.Vector3(0, 1, 0);

function makeJointHandle(bone, axes) {
  const rotation = new THREE.Euler();
  const apply = () => {
    // Zero rotation leaves the bone untouched: while the NPC walks, the pose
    // Eulers decay toward 0 and the gait owns the limbs.
    if (!rotation.x && !rotation.y && !rotation.z) return;
    const { forward, lateral } = axes();
    if (rotation.x) { _rest.copy(bone.quaternion); worldAxisPose(bone, _rest, lateral, rotation.x); }
    if (rotation.y) { _rest.copy(bone.quaternion); worldAxisPose(bone, _rest, _UP, rotation.y); }
    if (rotation.z) { _rest.copy(bone.quaternion); worldAxisPose(bone, _rest, forward, rotation.z); }
  };
  return { rotation, apply };
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

function makeCowboyGait(bones, object, axes = bodyAxes(object)) {
  const joint = (core) => {
    const bone = boneByCore(bones, core);
    return bone ? { bone, rest: bone.quaternion.clone() } : null;
  };
  const leftArm = joint("mixamorigLeftArm");
  const rightArm = joint("mixamorigRightArm");
  const leftLeg = joint("mixamorigLeftUpLeg");
  const rightLeg = joint("mixamorigRightUpLeg");
  const spine = joint("mixamorigSpine1");
  const head = joint("mixamorigHead");
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
    // Prime the head from its bind every frame so the pose handle can compose
    // onto a known baseline (the gait itself never rotates the head).
    if (head) head.bone.quaternion.copy(head.rest);
  };
}

function actorFactory(template) {
  return ({ targetHeight, heading = 0, tint }) => {
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

    if (tint != null) {
      const tintColor = tint instanceof THREE.Color ? tint : new THREE.Color(tint);
      source.traverse((node) => {
        if (!node.isMesh || !node.material) return;
        if (Array.isArray(node.material)) {
          node.material = node.material.map((material) => {
            const instanceMaterial = material.clone();
            instanceMaterial.color?.multiply(tintColor);
            return instanceMaterial;
          });
        } else {
          node.material = node.material.clone();
          node.material.color?.multiply(tintColor);
        }
      });
    }

    const bones = findBones(source);
    const axes = template.kind === "cow" ? null : bodyAxes(object);
    let parts;
    if (config.coreHandles) {
      parts = {};
      for (const [name, core] of Object.entries(config.coreHandles)) {
        const bone = boneByCore(bones, core);
        if (bone) parts[name] = makeJointHandle(bone, axes);
      }
    }
    const idleClip = config.idle ? template.clips.find((c) => c.name === config.idle) : null;
    const walkClip = config.walk ? template.clips.find((c) => c.name === config.walk) : null;
    const mixer = (idleClip || walkClip) ? new THREE.AnimationMixer(source) : null;
    const idleAction = idleClip ? mixer.clipAction(idleClip).play() : null;
    const walkAction = walkClip ? mixer.clipAction(walkClip).play() : null;
    if (walkAction) walkAction.setEffectiveWeight(0);
    const gait = config.gait ? (template.kind === "cow" ? makeCowGait(bones, object) : makeCowboyGait(bones, object, axes)) : null;
    const forwardReach = config.sourceForward.z > 0 ? template.bounds.max.z * scale : -template.bounds.min.z * scale;
    let phaseClock = 0;

    // No runtime stance re-grounding. A previous pass measured the lowest
    // skinned vertex at 0.6 s and shifted the group to match; it sampled only
    // ~300 of the mesh's vertices, so it almost never found the true lowest
    // sole vertex and shifted every actor DOWN by the sampling error — the
    // cowboy's boots vanished into the boardwalk and the (now unwired) Blender
    // DEF-rig women sank a whole body, leaving their eyes resting on the deck.
    // It existed only for those women. Every wired model rests at its bind
    // pose, which `-bounds.min.y * scale` above already grounds exactly;
    // check:textured-model-pilot asserts the cowboy's feet land at y=0.

    return {
      object,
      parts,
      forwardReach,
      // The pose author writes Eulers onto the handles; this applies them to
      // the bones. Called after visual.update in the frame loop, so the gait
      // has already primed every handle bone from its own rest.
      applyPose() {
        if (!parts) return;
        for (const h of Object.values(parts)) h.apply();
      },
      update(dt, state = {}) {
        if (typeof state === "number") state = { speed: state };
        phaseClock += dt * (state.speed > 0.05 ? 6.2 : 1.4);
        if (state.phase == null) state.phase = phaseClock;
        if (mixer) {
          const walkWeight = walkAction ? THREE.MathUtils.clamp((state.speed - 0.05) / 0.5, 0, 1) : 0;
          if (idleAction) idleAction.setEffectiveWeight(1 - walkWeight);
          if (walkAction) walkAction.setEffectiveWeight(walkWeight);
          mixer.update(dt);
        }
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
