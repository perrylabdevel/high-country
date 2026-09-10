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

const [cow, cowboy, childboy] = await Promise.all([
  load("public/models/farm-cow.glb"),
  load("public/models/western-cowboy.glb"),
  load("public/models/child_boy_character_animated_blender.glb")
]);
// The GLB ships the blouse/sleeve/skirt mesh and the bonnet unskinned, so the
// adapter binds them at load. Assert the BUILT actor, not the file: all five
// meshes must be skinned with nonzero weights or the garment silently stays in
// the T-pose bind, sleeves frozen while the arms hang inside them.
const womanPath = path.join(root, "public/models/medieval_poor_woman.glb");
if (fs.existsSync(womanPath)) {
  const woman = await load("public/models/medieval_poor_woman.glb");
  const visual = createTexturedActorFactory(woman, "/models/medieval_poor_woman.glb")({ targetHeight: 1.66 });
  const holder = new THREE.Group();
  holder.add(visual.object);
  holder.updateMatrixWorld(true);
  const meshes = [];
  visual.object.traverse((o) => { if (o.isMesh) meshes.push(o); });
  assert.equal(meshes.length, 5, "settler woman must build exactly five character meshes");
  for (const mesh of meshes) {
    assert.ok(mesh.isSkinnedMesh, `${mesh.name}: not skinned after the adapter bind`);
    const weights = mesh.geometry.attributes.skinWeight;
    assert.ok(weights, `${mesh.name}: missing vertex weights`);
    for (let i = 0; i < weights.count; i++) {
      assert.ok(weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i) > 0,
        `${mesh.name} vertex ${i}: unweighted`);
    }
  }

  // Behavioral: the sleeve must follow the arm drop while the blouse and skirt
  // stay pinned. Full proximity weight transfer failed exactly here before — it
  // moved the sleeves but collapsed the blouse chest onto the body — so this is
  // the assertion that distinguishes a sleeve fix from a garment collapse.
  const garment = meshes.find((m) => m.name.startsWith("CLOTHES"));
  const armBones = new Set();
  garment.skeleton.bones.forEach((bone, i) => { if (/Arm|Shoulder|Hand/.test(bone.name)) armBones.add(i); });
  const gPos = garment.geometry.attributes.position;
  const gIndex = garment.geometry.attributes.skinIndex;
  const gWeight = garment.geometry.attributes.skinWeight;
  const before = [];
  const at = new THREE.Vector3();
  for (let i = 0; i < gPos.count; i++) {
    garment.getVertexPosition(i, at.fromBufferAttribute(gPos, i));
    before.push(at.clone().applyMatrix4(garment.matrixWorld));
  }
  for (let i = 0; i < 30; i++) visual.update(1 / 60, { speed: 0, phase: 0 });
  holder.updateMatrixWorld(true);
  let armMove = 0, armCount = 0, staticMove = 0, staticCount = 0;
  for (let i = 0; i < gPos.count; i++) {
    garment.getVertexPosition(i, at.fromBufferAttribute(gPos, i));
    const moved = at.applyMatrix4(garment.matrixWorld).distanceTo(before[i]);
    let armWeight = 0;
    for (const c of ["X", "Y", "Z", "W"]) if (armBones.has(gIndex[`get${c}`](i))) armWeight += gWeight[`get${c}`](i);
    if (armWeight > 0.5) { armMove += moved; armCount += 1; } else if (armWeight < 0.01) { staticMove += moved; staticCount += 1; }
  }
  const sleeves = armMove / armCount;
  const body = staticMove / staticCount;
  assert.ok(armCount > 500, `sleeve region has only ${armCount} arm-weighted vertices`);
  assert.ok(sleeves > 0.1, `sleeves did not follow the arm drop (mean ${sleeves.toFixed(3)} m)`);
  assert.ok(body < 0.02, `blouse/skirt collapsed with the arm (mean static move ${body.toFixed(3)} m)`);
  console.log(`settler woman: five skinned meshes; sleeves moved ${sleeves.toFixed(3)} m, blouse/skirt kept ${body.toFixed(3)} m`);
}
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

// This failed silently twice. First when the adapter looked for RightArm_033
// although the downloaded Mixamo skeleton calls that joint RightArm_028 — Cole
// stood in a T-pose. Then again when the pose was applied about fixed world
// axes: the in-game NPC group faces a point and re-rotates while wandering, so
// at 90 degrees the arms stayed horizontal and at 180 they pointed up. The old
// check only ever built at heading 0, so it could not see either. Measure the
// rendered rig at four headings, idle and walking.
const DEG = Math.PI / 180;
function cowboyRig(headingDeg, speed, phase) {
  const visual = createTexturedActorFactory(cowboy, "/models/western-cowboy.glb")({ targetHeight: 1.78 });
  const parent = new THREE.Group();
  parent.rotation.y = headingDeg * DEG;
  parent.add(visual.object);
  parent.updateMatrixWorld(true);
  visual.update(1 / 60, { speed, phase });
  parent.updateMatrixWorld(true);
  return visual.object;
}
const headings = [0, 90, 180, -90];
let handSpan = 0;
for (const deg of headings) {
  const rig = cowboyRig(deg, 0, 0);
  const leftHand = rig.getObjectByName("mixamorigLeftHand_010");
  const rightHand = rig.getObjectByName("mixamorigRightHand_030");
  assert.ok(leftHand && rightHand, "cowboy rig must expose both hands for pose validation");
  const span = leftHand.getWorldPosition(new THREE.Vector3()).distanceTo(
    rightHand.getWorldPosition(new THREE.Vector3())
  );
  handSpan = Math.max(handSpan, span);
  assert.ok(span < 0.72, `cowboy idle at ${deg}deg: hands span ${span.toFixed(3)} m — arms are spread`);
  const arm = rig.getObjectByName("mixamorigLeftArm_08").getWorldPosition(new THREE.Vector3());
  const hand = leftHand.getWorldPosition(new THREE.Vector3());
  const dir = hand.sub(arm).normalize();
  const fromDown = Math.acos(THREE.MathUtils.clamp(-dir.y, -1, 1)) / DEG;
  assert.ok(fromDown < 22, `cowboy idle at ${deg}deg: arms ${fromDown.toFixed(1)}deg off vertical — not hanging`);
}
for (const deg of headings) {
  const rig = cowboyRig(deg, 1.2, Math.PI / 2);
  const leftFoot = rig.getObjectByName("mixamorigLeftFoot_049").getWorldPosition(new THREE.Vector3());
  const rightFoot = rig.getObjectByName("mixamorigRightFoot_054").getWorldPosition(new THREE.Vector3());
  const facing = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), deg * DEG);
  const delta = leftFoot.sub(rightFoot);
  const along = Math.abs(delta.dot(facing));
  const across = Math.abs(delta.x * facing.z - delta.z * facing.x);
  assert.ok(along > 0.3, `cowboy walk at ${deg}deg: feet stride only ${along.toFixed(3)} m along the facing`);
  assert.ok(across < 0.25, `cowboy walk at ${deg}deg: feet stride ${across.toFixed(3)} m sideways`);
}

// Human scale. The factory normalizes the hat-inclusive GLB to 1.78 m and
// grounds the feet, putting Cole's eyes near the player's 1.62 m eye line
// (src/player.js EYE). The cowboy's hat is what fills 1.78 — the person below
// it is a normal adult, not a child.
{
  const rig = cowboyRig(0, 0, 0);
  const y = (name) => rig.getObjectByName(name).getWorldPosition(new THREE.Vector3()).y;
  assert.ok(Math.abs(y("mixamorigHeadTop_End_06") - 1.78) < 0.06, `cowboy head top ${y("mixamorigHeadTop_End_06").toFixed(3)} m — not normalized to 1.78`);
  assert.ok(y("mixamorigHead_05") > 1.45 && y("mixamorigHead_05") < 1.58, `cowboy head bone ${y("mixamorigHead_05").toFixed(3)} m — not human scale`);
  const feet = Math.min(y("mixamorigLeftToe_End_051"), y("mixamorigRightToe_End_056"));
  assert.ok(Math.abs(feet) < 0.06, `cowboy feet at ${feet.toFixed(3)} m — not grounded`);
}

// The sole test, measured the way the player sees it: every vertex of the
// built rig, skinned into its settled stance, in world space. A toe-bone probe
// is not enough — a 300-vertex sampled "stance re-grounding" once shifted every
// actor down by the amount its sample missed the true lowest sole vertex, and
// the toe bone stayed inside the old 6 cm tolerance while the cowboy's boots
// disappeared into the boardwalk and eyeballs sat alone on the deck. Both wired
// models rest at bind, which `-bounds.min.y * scale` grounds exactly.
{
  const _v = new THREE.Vector3();
  for (const [label, gltf, file, height] of [
    ["cowboy", cowboy, "/models/western-cowboy.glb", 1.78],
    ["childboy", childboy, "/models/child_boy_character_animated_blender.glb", 1.38]
  ]) {
    const visual = createTexturedActorFactory(gltf, file)({ targetHeight: height });
    const parent = new THREE.Group();
    parent.add(visual.object);
    parent.updateMatrixWorld(true);
    for (let i = 0; i < 120; i += 1) visual.update(1 / 60, { speed: 0, phase: 0 });
    parent.updateMatrixWorld(true);
    let minY = Infinity;
    let maxY = -Infinity;
    visual.object.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 1) {
        _v.fromBufferAttribute(pos, i);
        if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, _v);
        _v.applyMatrix4(mesh.matrixWorld);
        if (_v.y < minY) minY = _v.y;
        if (_v.y > maxY) maxY = _v.y;
      }
    });
    assert.ok(Math.abs(minY) < 0.012, `${label} lowest skinned vertex at ${minY.toFixed(4)} m — sunk into or floating over the deck`);
    assert.ok(Math.abs(maxY - height) < 0.012, `${label} crown at ${maxY.toFixed(4)} m — not normalized to ${height} m`);
  }
}

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

console.log(JSON.stringify({ cowboyWorstIdleHandSpanMeters: Number(handSpan.toFixed(3)) }));
console.log("TEXTURED MODEL PILOT PASS — actual cow/cowboy GLBs, heading-independent idle and walk poses, axes, dimensions, independent skeletons, and stable animation roots checked.");
