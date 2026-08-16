/**
 * Named frames for kit pieces. See docs/ANCHORS.md.
 *
 * A frame is where *and* which way. Mating two anchors makes them coincident
 * with opposed normals. `mate()` parents the child and sets its transform.
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
    obj,
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

const FACE_ALONG = {
  front: "x",
  back: "x",
  right: "z",
  left: "z"
};

/**
 * Named wall face of a structure, optionally slid along that face.
 * Does not mutate the stored anchor.
 */
export function face(obj, side, { along = 0 } = {}) {
  const name = `face.${side}`;
  const base = anchorsOf(obj).get(name);
  if (!base) {
    throw new Error(`${obj.userData?.name || obj.name || "object"} has no ${name}`);
  }
  const axis = FACE_ALONG[side];
  if (!axis) {
    throw new Error(`unknown face "${side}"`);
  }
  const position = base.position.clone();
  position[axis] += along;
  return {
    name,
    obj,
    position,
    normal: base.normal.clone(),
    up: base.up.clone(),
    required: base.required
  };
}

/**
 * Parent `child` to the object that owns `parentAnchor` and set its local
 * transform so the two frames coincide with opposed normals (plug into socket).
 */
export function mate(child, childAnchorName, parentAnchor, opts = {}) {
  const parent = parentAnchor?.obj;
  if (!parent) {
    throw new Error("parentAnchor is missing .obj — pass face() or an anchor from defineAnchor");
  }
  const childAnchor = anchorsOf(child).get(childAnchorName);
  if (!childAnchor) {
    throw new Error(`child has no anchor "${childAnchorName}"`);
  }

  const targetNormal = parentAnchor.normal.clone().negate();
  const q = new THREE.Quaternion().setFromUnitVectors(childAnchor.normal, targetNormal);
  const rotatedChildPos = childAnchor.position.clone().applyQuaternion(q);
  const localPos = parentAnchor.position.clone().sub(rotatedChildPos);
  if (opts.offset) {
    localPos.add(copyVec(opts.offset));
  }
  if (opts.yawJitter) {
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), opts.yawJitter));
  }

  parent.add(child);
  child.quaternion.copy(q);
  child.position.copy(localPos);
  recordMate(child, childAnchorName, parent, parentAnchor.name);
  return child;
}

/** Named frame in world space. */
export function worldAnchor(obj, name) {
  const a = anchorsOf(obj).get(name);
  if (!a) {
    throw new Error(`${obj.userData?.name || obj.name || "object"} has no ${name}`);
  }
  obj.updateMatrixWorld(true);
  return {
    position: a.position.clone().applyMatrix4(obj.matrixWorld),
    normal: a.normal.clone().transformDirection(obj.matrixWorld).normalize()
  };
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
