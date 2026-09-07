/**
 * Rain: instanced streak quads around the camera, all motion on the GPU.
 *
 * Zero per-frame uploads by construction (HARD_WON 1.9 — the instance-attrs
 * check forbids dynamic buffer-usage flags, and nothing here needs one): the
 * one attribute (aSeed) is written once at creation, the fall/billboard math
 * runs in the position node off the pinned TSL `time`, and the volume origin
 * is derived in-shader from cameraPosition snapped to a 4 m grid so the
 * volume never swims as the camera moves. Cost control is mesh.count:
 * setIntensity drops the drawn instance count with the intensity, so clear
 * weather is literally zero draw calls and a forced-clear capture renders
 * nothing.
 */
import * as THREE from "three/webgpu";
import {
  time, uniform, vec2, vec3, float, uv, fract, floor,
  cameraPosition, attribute, normalize, positionLocal
} from "three/tsl";
import { getProfile } from "../perfProfile.js";

const MAX_COUNT = 9000;
const RAIN_TINT = new THREE.Vector3(0.62, 0.68, 0.74); // typed, never a bare hex

export function createRain(scene, camera, { maxCount = MAX_COUNT } = {}) {
  const geometry = new THREE.PlaneGeometry(0.02, 0.5);

  const seeds = new Float32Array(maxCount * 3);
  for (let i = 0; i < maxCount; i += 1) {
    seeds[i * 3] = Math.random();
    seeds[i * 3 + 1] = Math.random();
    seeds[i * 3 + 2] = Math.random();
  }
  const seedAttr = new THREE.InstancedBufferAttribute(seeds, 3);
  geometry.setAttribute("aSeed", seedAttr);

  const uIntensity = uniform(0);

  const material = new THREE.MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false
  });

  // World-space streak position, computed per instance:
  //   origin = camera snapped to a 4 m grid (volume follows without swimming)
  //   spread = aSeed over a 56 m disc around it
  //   fall   = fract(seed phase + time * speed) — 30 m column, 18-24 m/s
  // The quad is billboarded about Y only, so the streak stays a vertical
  // line from any yaw, and its height rides the camera's own Y.
  const seed = attribute("aSeed", "vec3");
  const origin = floor(cameraPosition.xz.div(4)).mul(4);
  const spread = seed.xy.mul(56).sub(28);
  const px = origin.x.add(spread.x);
  const pz = origin.y.add(spread.y);
  const speed = float(18).add(seed.z.mul(6));
  const fall = fract(seed.z.mul(7.13).add(time.mul(speed.div(30)))).mul(30);
  const py = cameraPosition.y.add(25).sub(fall);

  const toCam = normalize(cameraPosition.xz.sub(vec2(px, pz)));
  const side = vec2(toCam.y.negate(), toCam.x);
  material.positionNode = vec3(px, py, pz)
    .add(vec3(side.x, 0, side.y).mul(positionLocal.x))
    .add(vec3(0, positionLocal.y, 0));

  // Faint streak: alpha peaks mid-quad, fades to nothing at both ends.
  const core = uv().y.mul(2).sub(1).abs().oneMinus();
  material.colorNode = vec3(RAIN_TINT.x, RAIN_TINT.y, RAIN_TINT.z);
  material.opacityNode = core.mul(0.25).mul(uIntensity);

  const mesh = new THREE.InstancedMesh(geometry, material, maxCount);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 2;
  mesh.count = 0; // starts invisible: zero draw calls until it rains
  scene.add(mesh);

  function setIntensity(v) {
    const clamped = Math.min(1, Math.max(0, v));
    uIntensity.value = clamped;
    const density = getProfile().rainDensity ?? 1;
    mesh.count = Math.floor(maxCount * density * clamped);
    mesh.visible = mesh.count > 0;
  }

  function dispose() {
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
  }

  return { mesh, setIntensity, dispose };
}