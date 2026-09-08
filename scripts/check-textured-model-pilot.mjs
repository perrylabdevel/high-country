import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { createTexturedActorFactory } from "../src/models/texturedActors.js";

const root = path.resolve(import.meta.dirname, "..");
globalThis.self = globalThis;
globalThis.ProgressEvent ??= class ProgressEvent {};
globalThis.createImageBitmap ??= async () => ({ width: 1, height: 1, close() {} });

async function load(file) {
  const bytes = fs.readFileSync(path.join(root, file));
  return new Promise((resolve, reject) => new GLTFLoader().parse(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), "", resolve, reject
  ));
}

const [cow, cowboy] = await Promise.all([load("public/models/farm-cow.glb"), load("public/models/western-cowboy.glb")]);
function bounds(scene) { scene.updateMatrixWorld(true); return new THREE.Box3().setFromObject(scene); }

const cowBounds = bounds(cow.scene);
const cowSize = cowBounds.getSize(new THREE.Vector3());
assert.ok(cow.parser.json.images?.length, "cow GLB must carry its texture");
assert.ok(cow.parser.json.materials.some((material) => material.name === "material" && material.pbrMetallicRoughness.metallicFactor > 0.69), "cow source hide must retain the metallic-export regression the adapter corrects");
assert.ok(cow.scene.getObjectByName("head_012"), "cow rig must expose its head bone");
assert.ok(cow.scene.getObjectByName("lfl1_017") && cow.scene.getObjectByName("lbl1_02") && cow.scene.getObjectByName("lbr1_031"), "cow rig must expose all fore/rear gait roots");
assert.ok(cow.animations.some((clip) => clip.name === "Armature|idle1"), "cow needs its safe idle clip");
assert.ok(cow.animations.every((clip) => !/walk/i.test(clip.name)), "cow source must not claim a walk clip");
assert.ok(cowBounds.max.z > Math.abs(cowBounds.min.z) * 1.8, "cow's actual authored forward axis must be +Z");
const cowScale = 1.42 / cowSize.y;
assert.ok(cowBounds.max.z * cowScale > 1.68 && cowBounds.max.z * cowScale < 1.74, "normalized visible cow reach must drive its head collider");

const cowboyBounds = bounds(cowboy.scene);
assert.ok(cowboy.parser.json.images?.length, "cowboy GLB must carry its texture");
assert.ok(cowboy.scene.getObjectByName("mixamorigHips_01"), "cowboy rig must expose hips");
assert.equal(cowboy.animations.length, 1, "cowboy should have only its supplied pose clip");
assert.equal(cowboy.animations[0].duration, 0, "zero-duration cowboy pose must not be used as locomotion");
assert.ok(cowboy.animations[0].tracks.some((track) => /Hips.*position/.test(track.name)), "cowboy pose has root-position data and must not tick");
assert.ok(cowboyBounds.getSize(new THREE.Vector3()).y > 6.9, "cowboy dimensions must be read from the actual GLB");

// This failed silently when the adapter looked for RightArm_033 although the
// downloaded Mixamo skeleton calls that joint RightArm_028. Loading succeeded,
// but Cole stood in a T-pose. Measure the rendered rig after its idle update.
const cowboyVisual = createTexturedActorFactory(cowboy, "/models/western-cowboy.glb")({ targetHeight: 1.78 });
cowboyVisual.update(1 / 60, { speed: 0, phase: 0 });
cowboyVisual.object.updateMatrixWorld(true);
const leftHand = cowboyVisual.object.getObjectByName("mixamorigLeftHand_010");
const rightHand = cowboyVisual.object.getObjectByName("mixamorigRightHand_030");
assert.ok(leftHand && rightHand, "cowboy rig must expose both hands for pose validation");
const handSpan = leftHand.getWorldPosition(new THREE.Vector3()).distanceTo(
  rightHand.getWorldPosition(new THREE.Vector3())
);
assert.ok(handSpan < 1.05, `cowboy idle hands span ${handSpan.toFixed(3)} m — arms are still in a T-pose`);

for (const [label, gltf, joint] of [["cow", cow, "lfl1_017"], ["cowboy", cowboy, "mixamorigHips_01"]]) {
  const first = cloneSkeleton(gltf.scene);
  const second = cloneSkeleton(gltf.scene);
  const firstJoint = first.getObjectByName(joint);
  const secondJoint = second.getObjectByName(joint);
  firstJoint.rotation.x += 0.4;
  assert.notEqual(firstJoint.quaternion.x, secondJoint.quaternion.x, `${label} skeleton clones must animate independently`);
  const rootPosition = first.position.clone();
  if (label === "cow") {
    const mixer = new THREE.AnimationMixer(first);
    mixer.clipAction(gltf.animations.find((clip) => clip.name === "Armature|idle1")).play();
    mixer.update(1.2);
  }
  first.updateMatrixWorld(true);
  assert.deepEqual(first.position.toArray(), rootPosition.toArray(), `${label} animation/pose must leave its visual root stable`);
}

console.log(JSON.stringify({ cowboyIdleHandSpanMeters: Number(handSpan.toFixed(3)) }));
console.log("TEXTURED MODEL PILOT PASS — actual cow/cowboy GLBs, relaxed idle pose, axes, dimensions, independent skeletons, and stable animation roots checked.");
