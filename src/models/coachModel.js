import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * The Concord stagecoach kit (scripts/blender-props/pr_coach.py,
 * `pr_build.start("coach")`). Nodes share the coach frame — origin on the
 * ground midway between the axles, front toward local +Z — except the two
 * wheels, which sit at their hubs with the axle along X.
 *
 * The numbers below are pr_coach.py's, converted to the glTF frame
 * (Blender -Y forward becomes +Z): keep them in step.
 */
export const COACH_URL = "/models/props/coach.glb";
export const COACH = {
  wheelFront: { r: 0.56, z: 1.15 },
  wheelRear: { r: 0.74, z: -1.05 },
  track: 0.82,
  bodyPivot: { y: 1.3, z: 0 },
  wheelers: { x: 0.62, z: 2.75 },
  leaders: { x: 0.62, z: 5.55 },
  // Driver's seat top, and where the team's middle is for the collider.
  seat: { y: 2.26, z: 1.12 },
  teamCentre: 4.15
};

let pending = null;

export function loadCoachModel(url = COACH_URL) {
  if (!pending) {
    pending = new GLTFLoader().loadAsync(url).then((gltf) => {
      const nodes = {};
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.material.side = THREE.FrontSide;
          o.castShadow = true;
          o.receiveShadow = true;
          nodes[o.name] = o;
        }
      });
      for (const name of ["coach_body", "coach_gear", "wheel_front", "wheel_rear"]) {
        if (!nodes[name]) {
          throw new Error(`coach.glb has no node ${name}`);
        }
      }
      return nodes;
    });
  }
  return pending;
}
