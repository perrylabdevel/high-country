/**
 * Collapse a finished, static hierarchy into one mesh per material.
 *
 * The town, ranch and outposts were built as 670 individual meshes. Each one
 * is its own draw call, and 659 of them cast shadows, so they were drawn a
 * second time into the shadow map too — together roughly 1330 of the frame's
 * ~1490 draws, for about 0.01M triangles. The geometry is nothing; the call
 * count is everything.
 *
 * They share only 16 materials, so merging by material collapses that to a
 * couple of dozen draws.
 *
 * The authored hierarchy is kept and hidden rather than thrown away. Colliders,
 * anchors, interiors, the look-at overlay and the geometry checks all read the
 * individual meshes and their userData roles — check-buildings alone inspects
 * foundations, roofs, walls, chimneys, headers, lintels and door leaves. Hiding
 * costs one visibility test per mesh per frame (three's projectObject returns
 * immediately on an invisible object) and keeps every one of those consumers
 * working against the real structure.
 */
import * as THREE from "three/webgpu";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Anything a frame animates must stay a live mesh. Windmill fans are parked on
 * their structure as userData.blades and spun every frame in main.js.
 */
function movingRoots(root) {
  const moving = new Set();
  root.traverse((o) => {
    if (o.userData && o.userData.blades) {
      moving.add(o.userData.blades);
    }
  });
  return moving;
}

function isMoving(mesh, moving, root) {
  if (moving.size === 0) {
    return false;
  }
  let n = mesh;
  while (n && n !== root.parent) {
    if (moving.has(n)) {
      return true;
    }
    n = n.parent;
  }
  return false;
}

export function mergeStatic(root, name = "static-merge") {
  if (!root) {
    return null;
  }
  root.updateWorldMatrix(true, true);
  const moving = movingRoots(root);
  const groups = new Map();
  const originals = [];

  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material)) {
      return;
    }
    if (isMoving(o, moving, root)) {
      return;
    }
    // mergeGeometries refuses a mix of indexed and non-indexed inputs, and the
    // kit produces both, so flatten everything to non-indexed first. Building
    // geometry is ~0.01M triangles, so the extra vertices cost nothing next to
    // the draw calls this saves.
    const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    geo.applyMatrix4(o.matrixWorld);
    // Merge also needs an identical attribute set, and a few kit shapes carry
    // no uv, so the bucket key is material plus attribute signature.
    const sig = Object.keys(geo.attributes).sort().join(",");
    const key = `${o.material.uuid}|${sig}`;
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = { material: o.material, geos: [], cast: false, receive: false, failed: false };
      groups.set(key, bucket);
    }
    bucket.geos.push(geo);
    bucket.cast = bucket.cast || o.castShadow;
    bucket.receive = bucket.receive || o.receiveShadow;
    originals.push({ mesh: o, key });
  });

  const merged = new THREE.Group();
  merged.name = name;
  let drawn = 0;
  for (const bucket of groups.values()) {
    const geo = bucket.geos.length === 1 ? bucket.geos[0] : mergeGeometries(bucket.geos);
    if (!geo) {
      // Merge refused this bucket; leave its originals visible rather than
      // silently dropping the geometry from the world.
      for (const g of bucket.geos) {
        g.dispose();
      }
      bucket.failed = true;
      continue;
    }
    const mesh = new THREE.Mesh(geo, bucket.material);
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = bucket.receive;
    merged.add(mesh);
    drawn += 1;
  }

  // Hide only the meshes whose bucket actually merged. A refused bucket keeps
  // its originals on screen rather than dropping geometry from the world.
  for (const { mesh, key } of originals) {
    if (!groups.get(key).failed) {
      mesh.visible = false;
    }
  }

  merged.userData.mergedFrom = originals.length;
  merged.userData.drawCalls = drawn;
  return merged;
}
