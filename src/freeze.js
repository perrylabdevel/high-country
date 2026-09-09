/**
 * Freeze a finished static subtree out of the per-frame matrix update.
 *
 * three.js recomputes each object's local matrix from position/rotation/scale
 * on every frame while matrixAutoUpdate is on — even for objects nothing will
 * ever move, and even for INVISIBLE ones (updateMatrixWorld recurses into
 * hidden children; visibility is a render-time test, not a graph-time one).
 * The scene carries thousands of such nodes (the hidden merge originals, 500
 * terrain chunks, the merged statics, water, roads), and the CPU profile
 * measured updateMatrixWorld at ~9% of frame time.
 *
 * updateMatrixWorld(true) stamps every matrixWorld once; matrixAutoUpdate off
 * then leaves the cached matrices untouched. Children that DO move under a
 * frozen root still work: their updateMatrix sets matrixWorldNeedsUpdate and
 * their matrixWorld is rebuilt from the parent's cached one each frame. Only
 * a local transform written AFTER freezing is lost — so pass a skip predicate
 * for every subtree the frame loop animates (windmill fans), and freeze only
 * after the world is fully built.
 */
export function freezeTransforms(root, skip = null) {
  if (!root) {
    return 0;
  }
  root.updateMatrixWorld(true);
  let count = 0;
  root.traverse((o) => {
    if (skip && skip(o)) {
      return;
    }
    if (o.matrixAutoUpdate) {
      o.matrixAutoUpdate = false;
      count += 1;
    }
  });
  return count;
}