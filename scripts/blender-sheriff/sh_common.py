"""Shared mesh-construction helpers for the procedural sheriff build.

Run inside Blender (via the Blender MCP or the Scripting tab). Every stage
module imports this; nothing here touches bpy.ops except `remesh_voxel`,
which uses the modifier stack so it works without a UI context.
"""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

COLLECTION = "Sheriff"


def collection(name=COLLECTION):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def remove_object(name):
    ob = bpy.data.objects.get(name)
    if ob is None:
        return
    data = ob.data
    bpy.data.objects.remove(ob, do_unlink=True)
    if data is not None and getattr(data, "users", 1) == 0:
        if isinstance(data, bpy.types.Mesh):
            bpy.data.meshes.remove(data)


def mesh_object(name, verts, faces, coll=None, smooth=True):
    """Create (replacing) a mesh object from vertex and face arrays."""
    remove_object(name)
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(map(int, f)) for f in faces])
    me.validate(clean_customdata=False)
    me.update()
    ob = bpy.data.objects.new(name, me)
    (coll or collection()).objects.link(ob)
    if smooth:
        me.shade_smooth()
    return ob


# --------------------------------------------------------------------------
# Curves and interpolation


def catmull(keys, samples):
    """Catmull-Rom through key rows. keys: (n, k) array, returns (samples, k).

    The parameter is uniform in key index, so key spacing sets detail density.
    """
    keys = np.asarray(keys, dtype=float)
    n = len(keys)
    pad = np.vstack([2 * keys[0] - keys[1], keys, 2 * keys[-1] - keys[-2]])
    out = []
    for s in np.linspace(0, n - 1, samples):
        i = min(int(math.floor(s)), n - 2)
        t = s - i
        p0, p1, p2, p3 = pad[i], pad[i + 1], pad[i + 2], pad[i + 3]
        t2, t3 = t * t, t * t * t
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return np.array(out)


def resample_polyline(points, samples):
    pts = np.asarray(points, dtype=float)
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)])
    targets = np.linspace(0, cum[-1], samples)
    return np.stack([np.interp(targets, cum, pts[:, k]) for k in range(pts.shape[1])], axis=1), cum[-1]


def smoothstep(e0, e1, x):
    t = np.clip((np.asarray(x, dtype=float) - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def gauss(x, mu, sigma):
    return np.exp(-(((np.asarray(x, dtype=float) - mu) / sigma) ** 2))


# --------------------------------------------------------------------------
# Lofting


def loft_rings(rings, cap_start=True, cap_end=True, closed=True):
    """Faces for stacked rings of equal vertex count. rings: (R, N, 3)."""
    rings = np.asarray(rings, dtype=float)
    R, N, _ = rings.shape
    verts = rings.reshape(-1, 3).tolist()
    faces = []
    span = N if closed else N - 1
    for r in range(R - 1):
        for i in range(span):
            j = (i + 1) % N
            a, b, c, d = r * N + i, r * N + j, (r + 1) * N + j, (r + 1) * N + i
            faces.append((a, b, c, d))
    if closed:
        if cap_start:
            verts.append(rings[0].mean(axis=0).tolist())
            ci = len(verts) - 1
            for i in range(N):
                faces.append((ci, (i + 1) % N, i))
        if cap_end:
            verts.append(rings[-1].mean(axis=0).tolist())
            ci = len(verts) - 1
            base = (R - 1) * N
            for i in range(N):
                faces.append((ci, base + i, base + (i + 1) % N))
    return verts, faces


def frames_along(centers, front_ref=(0.0, -1.0, 0.0)):
    """Rotation-minimising frames (side, front, dir) along a polyline."""
    centers = np.asarray(centers, dtype=float)
    dirs = np.gradient(centers, axis=0)
    dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    ref = np.asarray(front_ref, dtype=float)
    side = np.cross(dirs[0], ref)
    if np.linalg.norm(side) < 1e-6:
        side = np.cross(dirs[0], np.array([1.0, 0, 0]))
    side /= np.linalg.norm(side)
    frames = []
    for k, d in enumerate(dirs):
        if k:
            side = side - d * np.dot(side, d)
            side /= np.linalg.norm(side)
        front = np.cross(side, d)
        # Keep "front" pointing along the requested reference.
        if np.dot(front, ref) < 0 and k == 0:
            side = -side
            front = -front
        frames.append((side.copy(), front.copy(), d.copy()))
    return frames


def tube(centers, rx, ry, segments=32, exponent=2.0, profile=None, front_ref=(0.0, -1.0, 0.0), caps=True):
    """Loft an elliptical/superelliptical tube along a sampled centre line.

    rx: radius along the frame's side axis, ry: along its front axis.
    profile(k, angles) -> per-vertex radial multiplier (optional).
    """
    frames = frames_along(centers, front_ref)
    ang = np.linspace(0, 2 * math.pi, segments, endpoint=False)
    c, s = np.cos(ang), np.sin(ang)
    e = 2.0 / exponent
    cx = np.sign(c) * np.abs(c) ** e
    sy = np.sign(s) * np.abs(s) ** e
    rings = []
    for k, (side, front, _d) in enumerate(frames):
        mult = profile(k, ang) if profile else 1.0
        px = cx * rx[k] * mult
        py = sy * ry[k] * mult
        ring = centers[k] + np.outer(px, side) + np.outer(py, front)
        rings.append(ring)
    return loft_rings(rings, cap_start=caps, cap_end=caps)


# --------------------------------------------------------------------------
# Modifier-driven operations


def apply_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def join(name, objects, coll=None):
    """Join mesh objects into a new object (bmesh, no operator context)."""
    bm = bmesh.new()
    for ob in objects:
        tmp = ob.data.copy()
        tmp.transform(ob.matrix_world)
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    remove_object(name)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    out = bpy.data.objects.new(name, me)
    (coll or collection()).objects.link(out)
    return out


def remesh_voxel(ob, voxel, smooth_iters=0, smooth_factor=0.5):
    mod = ob.modifiers.new("vox", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = voxel
    mod.adaptivity = 0.0
    mod.use_smooth_shade = True
    if smooth_iters:
        sm = ob.modifiers.new("relax", "CORRECTIVE_SMOOTH")
        sm.iterations = smooth_iters
        sm.factor = smooth_factor
        sm.smooth_type = "SIMPLE"
        sm.use_only_smooth = True
    apply_modifiers(ob)
    ob.data.shade_smooth()
    return ob


def bvh_for(ob):
    me = ob.data
    verts = [ob.matrix_world @ v.co for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons]
    return BVHTree.FromPolygons(verts, polys)


def verts_np(ob):
    me = ob.data
    arr = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("co", arr)
    return arr.reshape(-1, 3)


def set_verts_np(ob, arr):
    ob.data.vertices.foreach_set("co", np.asarray(arr, dtype=float).ravel())
    ob.data.update()


def mirror_x(verts):
    v = np.array(verts, dtype=float)
    v[:, 0] *= -1
    return v


def flip_faces(faces):
    return [tuple(reversed(f)) for f in faces]


def ensure_material(name, color=(0.5, 0.5, 0.5, 1.0), roughness=0.7):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
    mat.diffuse_color = color
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
    return mat


def assign_material(ob, mat):
    ob.data.materials.clear()
    ob.data.materials.append(mat)


def look_matrix(origin, forward, up=(0, 0, 1)):
    f = Vector(forward).normalized()
    r = f.cross(Vector(up)).normalized()
    u = r.cross(f)
    m = Matrix((r, f, u)).transposed().to_4x4()
    m.translation = Vector(origin)
    return m
