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


const [cow, sheriffGltf] = await Promise.all([
  load("public/models/farm-cow.glb"),
  load("public/models/sheriff.glb")
]);
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

for (const [label, gltf, joint] of [["cow", cow, "lfl1_017"], ["sheriff", sheriffGltf, "hips"]]) {
  const first = cloneSkeleton(gltf.scene);
  const second = cloneSkeleton(gltf.scene);
  const firstJoint = first.getObjectByName(joint);
  const secondJoint = second.getObjectByName(joint);
  firstJoint.rotation.x += 0.4;
  assert.notEqual(firstJoint.quaternion.x, secondJoint.quaternion.x, `${label} skeleton clones must animate independently`);
  const rootPosition = first.position.clone();
  {
    const mixer = new THREE.AnimationMixer(first);
    mixer.clipAction(gltf.animations.find((clip) => clip.name === (label === "cow" ? "Armature|idle1" : "Idle"))).play();
    mixer.update(1.2);
  }
  first.updateMatrixWorld(true);
  assert.deepEqual(first.position.toArray(), rootPosition.toArray(), `${label} animation/pose must leave its visual root stable`);
}


const DEG = Math.PI / 180;
const headings = [0, 90, 180, -90];

// The authored cast (scripts/blender-sheriff) rides its own Idle/Walk clips
// under the mixer. Assert the BUILT actor: grounded soles and hat-crown height
// through the clip (the idle drops the hips, so only IK-planted feet keep the
// soles on the deck), hanging arms, a real stride along the facing at every
// heading, and pose handles bound to the sanitized Blender bone names.
async function checkAuthored(label, rel, file, HEIGHT) {
  const sheriff = await load(rel);
  assert.ok(sheriff.parser.json.images?.length >= 3, `${label} GLB must carry base colour, normal and ORM textures`);
  for (const name of ["Idle", "Walk"]) {
    const clip = sheriff.animations.find((c) => c.name === name);
    assert.ok(clip && clip.duration > 0.5, `${label} needs a playable ${name} clip`);
  }
  const _v = new THREE.Vector3();
  const build = (deg, speed, seconds) => {
    const visual = createTexturedActorFactory(sheriff, file)({ targetHeight: HEIGHT });
    const parent = new THREE.Group();
    parent.rotation.y = deg * DEG;
    parent.add(visual.object);
    parent.updateMatrixWorld(true);
    for (let t = 0; t < seconds; t += 1 / 30) visual.update(1 / 30, { speed });
    parent.updateMatrixWorld(true);
    return visual;
  };
  const idle = build(0, 0, 1.3);
  for (const handle of ["armL", "armR", "legL", "legR", "torso", "head"]) {
    assert.ok(idle.parts?.[handle], `${label} pose handle ${handle} did not bind to a bone`);
  }
  let minY = Infinity;
  let maxY = -Infinity;
  idle.object.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      mesh.applyBoneTransform(i, _v.fromBufferAttribute(pos, i)).applyMatrix4(mesh.matrixWorld);
      if (_v.y < minY) minY = _v.y;
      if (_v.y > maxY) maxY = _v.y;
    }
  });
  assert.ok(Math.abs(minY) < 0.02, `${label} idle lowest skinned vertex at ${minY.toFixed(4)} m — sunk or floating`);
  assert.ok(Math.abs(maxY - HEIGHT) < 0.04, `${label} idle crown at ${maxY.toFixed(4)} m — not ~${HEIGHT} m`);
  // The walk once drove the toe tip 3.7 cm through the deck at lift-off (the
  // toe joint snapped from flat to bent) and the heel block under it at heel
  // strike. Sweep the whole cycle, every vertex.
  {
    const walker = build(0, 1.2, 0);
    let dip = Infinity;
    for (let f = 0; f < 60; f += 1) {
      walker.update(1 / 30, { speed: 1.2 });
      walker.object.parent.updateMatrixWorld(true);
      walker.object.traverse((mesh) => {
        if (!mesh.isSkinnedMesh) return;
        const pos = mesh.geometry.attributes.position;
        for (let i = 0; i < pos.count; i += 1) {
          mesh.applyBoneTransform(i, _v.fromBufferAttribute(pos, i)).applyMatrix4(mesh.matrixWorld);
          if (_v.y < dip) dip = _v.y;
        }
      });
    }
    assert.ok(dip > -0.005, `${label} walk sinks a sole ${(-dip * 100).toFixed(1)} cm through the floor`);
  }
  const world = (visual, name) => visual.object.getObjectByName(name).getWorldPosition(new THREE.Vector3());
  // The in-game NPC pose composes onto whatever the mixer left in each bone.
  // An exporter-optimised constant track (two identical keys) stopped being
  // rewritten after the first frame, so the sheriff's arms crept out to a
  // T-pose over five seconds. Run his actual pose for 6 s and require the
  // arm to hold still.
  {
    const posed = build(0, 0, 0);
    const angles = [];
    for (let f = 0; f < 360; f += 1) {
      posed.update(1 / 60, { speed: 0 });
      const scan = Math.sin((f / 60) * 0.35);
      posed.parts.torso.rotation.y = scan * 0.3;
      posed.parts.head.rotation.y = scan * 0.45;
      posed.parts.armL.rotation.z = 0.1;
      posed.parts.armR.rotation.z = -0.1;
      posed.applyPose();
      posed.object.parent.updateMatrixWorld(true);
      const dir = world(posed, "handL").sub(world(posed, "upper_armL")).normalize();
      angles.push(Math.acos(THREE.MathUtils.clamp(-dir.y, -1, 1)) / DEG);
    }
    const drift = Math.max(...angles) - Math.min(...angles);
    assert.ok(drift < 12, `${label} posed arm drifts ${drift.toFixed(1)}deg over 6 s — pose accumulating on an unwritten bone (min ${Math.min(...angles).toFixed(1)} @${angles.indexOf(Math.min(...angles))}, max ${Math.max(...angles).toFixed(1)} @${angles.indexOf(Math.max(...angles))})`);
  }
  for (const side of ["L", "R"]) {
    const dir = world(idle, `hand${side}`).sub(world(idle, `upper_arm${side}`)).normalize();
    const fromDown = Math.acos(THREE.MathUtils.clamp(-dir.y, -1, 1)) / DEG;
    assert.ok(fromDown < 25, `${label} idle ${side} arm ${fromDown.toFixed(1)}deg off vertical — still in the A-pose bind`);
  }
  for (const deg of headings) {
    const walk = build(deg, 1.2, 0.5);
    const facing = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), deg * DEG);
    let stride = 0;
    for (let k = 0; k < 12; k += 1) {
      walk.update(1 / 15, { speed: 1.2 });
      walk.object.parent.updateMatrixWorld(true);
      const delta = world(walk, "footL").sub(world(walk, "footR"));
      stride = Math.max(stride, Math.abs(delta.dot(facing)));
    }
    // A real stride scales with the walker: 0.3 m for the 1.86 m sheriff.
    assert.ok(stride > 0.16 * HEIGHT, `${label} walk at ${deg}deg: feet stride only ${stride.toFixed(3)} m along the facing`);
  }
  console.log(`${label}: soles ${minY.toFixed(4)} m, crown ${maxY.toFixed(3)} m, clips Idle/Walk, handles bound`);
}

await checkAuthored("sheriff", "public/models/sheriff.glb", "/models/sheriff.glb", 1.86);
// Every other authored townsperson comes out of the same pipeline; hold each
// to the same bar at its own exported height (scale 1).
for (const f of fs.readdirSync(path.join(root, "public/models/chars")).filter((n) => n.endsWith(".glb")).sort()) {
  const rel = `public/models/chars/${f}`;
  const bytes = fs.readFileSync(path.join(root, rel));
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  const pos = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
  await checkAuthored(f.replace(".glb", ""), rel, `/models/chars/${f}`, pos.max[1] - pos.min[1]);
}

console.log("TEXTURED MODEL PILOT PASS — cow GLB, authored cast grounding through idle and walk, heading-independent strides and poses, dimensions, independent skeletons, and stable animation roots checked.");
