/**
 * Named frames for kit pieces. See docs/ANCHORS.md.
 *
 * A frame is where *and* which way. Mating two anchors makes them coincident
 * with opposed normals. This module records those relationships; it does not
 * yet move objects (phase 1: derive + graph, nothing relocates).
 *
 * `unmatedRequired` is the lint that turns "porch posts holding nothing"
 * into a failing check instead of a screenshot score.
 */
import * as THREE from "three/webgpu";

function copyVec(v) {
  if (v.isVector3) {
    return v.clone();
  }
  return new THREE.Vector3(v.x, v.y, v.z);
}

function ensure(obj) {
  if (!obj.userData.anchors) {
    obj.userData.anchors = new Map();
  }
  if (!obj.userData.mates) {
    obj.userData.mates = [];
  }
}

/** Register a local-space frame on `obj`. */
export function defineAnchor(obj, name, frame) {
  ensure(obj);
  obj.userData.anchors.set(name, {
    name,
    position: copyVec(frame.position),
    normal: copyVec(frame.normal).normalize(),
    up: copyVec(frame.up || { x: 0, y: 1, z: 0 }).normalize(),
    required: Boolean(frame.required)
  });
  return obj;
}

/** Map<string, Anchor> of frames defined on this object. Empty Map if none. */
export function anchorsOf(obj) {
  return obj.userData.anchors || new Map();
}

/**
 * Record that `child`'s named frame is mated to `parent`'s named frame.
 * Does not change transforms.
 */
export function recordMate(child, childAnchorName, parent, parentAnchorName) {
  ensure(parent);
  const parentAnchor = anchorsOf(parent).get(parentAnchorName);
  if (!parentAnchor) {
    throw new Error(`parent has no anchor "${parentAnchorName}"`);
  }
  parent.userData.mates.push({
    socket: parentAnchorName,
    child,
    childAnchor: childAnchorName
  });
}

function isDescendant(root, node) {
  let cur = node;
  while (cur) {
    if (cur === root) {
      return true;
    }
    cur = cur.parent;
  }
  return false;
}

/**
 * Required sockets under `roots` that have no occupant still in the tree.
 * @returns {{ obj: object, name: string, anchor: object }[]}
 */
export function unmatedRequired(roots) {
  const out = [];
  function visit(obj) {
    const anchors = obj.userData.anchors;
    if (anchors) {
      const mates = obj.userData.mates || [];
      for (const [name, anchor] of anchors) {
        if (!anchor.required) {
          continue;
        }
        const occupied = mates.some(
          (m) => m.socket === name && m.child && isDescendant(obj, m.child)
        );
        if (!occupied) {
          out.push({ obj, name, anchor });
        }
      }
    }
    for (const child of obj.children) {
      visit(child);
    }
  }
  for (const root of roots) {
    visit(root);
  }
  return out;
}
