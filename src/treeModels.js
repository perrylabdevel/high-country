import * as THREE from "three/webgpu";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/**
 * Authored tree parts (scripts/blender-props/pr_trees.py, `pr_build.start("trees")`).
 *
 * vegetation.js builds every tree procedurally and synchronously, so placement,
 * colliders and the headless checks never wait on a download. This loads the
 * authored meshes afterwards and vegetation's applyTreeModels() swaps them in
 * under the instance matrices it already wrote. Each model keeps the frame of
 * the procedural geometry it replaces (see the pr_trees.py docstring). A
 * failed load leaves the procedural trees drawing.
 */
export const TREE_MODELS_URL = "/models/props/trees.glb";

/** Node names in the kit, each with the vegetation mesh it replaces. */
export const TREE_MODELS = {
  burnt_snag: "burnt-snag"
};

/**
 * Authored conifers (scripts/blender-props/pr_pine.py): geometry only, drawn
 * with vegetation's own bark and needle materials. `pine` is the PINE
 * prototype index each replaces.
 */
export const PINE_MODELS = {
  // enabled: false — the first A/B at northernPines (same triangles, same frame
  // time) read darker and thinner than the procedural crown at mid range, so
  // it loads for the dev A/B (window.__treeModels) but does not draw by default.
  pine_std: { url: "/models/trees/pine_std.glb", pine: 1, enabled: false }
};
export const PINE_PARTS = ["trunk", "limbs", "crown_near", "crown_far", "crown_dist"];

export async function loadTreeModels(url = TREE_MODELS_URL) {
  const models = {};
  await Promise.all(Object.entries(PINE_MODELS).map(async ([name, { url: pineUrl, pine }]) => {
    try {
      const gltf = await new GLTFLoader().loadAsync(pineUrl);
      const parts = {};
      gltf.scene.traverse((o) => {
        for (const part of PINE_PARTS) {
          if (o.isMesh && o.name === `${name}_${part}`) {
            parts[part] = o.geometry;
          }
        }
      });
      if (PINE_PARTS.every((p) => parts[p])) {
        models[name] = { pine, parts, enabled: PINE_MODELS[name].enabled !== false };
      } else {
        console.warn(`Tree model ${name} is missing parts; its procedural pine stays.`);
      }
    } catch (err) {
      console.warn(`Tree model ${name} unavailable; its procedural pine stays.`, err);
    }
  }));
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    gltf.scene.traverse((o) => {
      if (o.isMesh && TREE_MODELS[o.name]) {
        // Closed solids: Blender exports the material double-sided.
        o.material.side = THREE.FrontSide;
        models[o.name] = o;
      }
    });
  } catch (err) {
    console.warn("Tree models unavailable; procedural trees stay.", err);
  }
  return models;
}
