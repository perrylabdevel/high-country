"""Horse body: anatomical landmarks, a metaball high-poly and its remesh.

Blender frame: Z up, the horse faces -Y (glTF +Z, the cast's convention),
its left side toward +X, hooves on z = 0. A 15-hand stock horse: withers
1.50 m, saddle seat about 1.46 m over the centre of the barrel, so the game's
rider seat (RIDE_SEAT 1.42 at the hips) still sits in it.

    import hr_body; hr_body.build()
"""

import math

import bpy
from mathutils import Vector

COLL = "Horse"

# Landmarks (x = lateral, y = front(-)/back(+), z = up). Left side only; the
# right mirrors x.
J = {
    "poll": (0.0, -1.06, 1.86),
    "muzzle": (0.0, -1.40, 1.36),
    "throat": (0.0, -0.93, 1.62),
    "withers": (0.0, -0.42, 1.50),
    "back": (0.0, 0.02, 1.43),
    "loin": (0.0, 0.34, 1.46),
    "croup": (0.0, 0.58, 1.49),
    "tailhead": (0.0, 0.80, 1.42),
    "buttock": (0.0, 0.84, 1.24),
    "chest": (0.0, -0.66, 1.12),
    "belly": (0.0, 0.05, 0.84),
    # Fore limb
    "shoulder": (0.17, -0.52, 1.30),
    "elbow": (0.17, -0.45, 0.94),
    "knee_f": (0.15, -0.50, 0.53),
    "fetlock_f": (0.15, -0.51, 0.20),
    "coronet_f": (0.15, -0.57, 0.08),
    "toe_f": (0.15, -0.62, 0.0),
    # Hind limb
    "hip": (0.19, 0.52, 1.30),
    "stifle": (0.20, 0.30, 0.94),
    "hock": (0.14, 0.64, 0.55),
    "fetlock_h": (0.14, 0.58, 0.20),
    "coronet_h": (0.14, 0.53, 0.08),
    "toe_h": (0.14, 0.48, 0.0),
}


def P(name, side=1):
    x, y, z = J[name]
    return Vector((x * side, y, z))


def collection():
    c = bpy.data.collections.get(COLL)
    if c is None:
        c = bpy.data.collections.new(COLL)
        bpy.context.scene.collection.children.link(c)
    return c


def clear():
    for ob in list(collection().objects):
        bpy.data.objects.remove(ob, do_unlink=True)


def _frame(t):
    """An orthonormal (side, up) pair perpendicular to direction t, side along +X."""
    t = t.normalized()
    side = Vector((1, 0, 0))
    side = (side - t * side.dot(t)).normalized()
    up = t.cross(side).normalized()
    if up.z < 0:
        up = -up
    return side, up


def _catmull(pts, sub):
    """Catmull-Rom resample of a list of equal-length tuples, `sub` steps per span."""
    out = []
    m = len(pts)
    for k in range(m - 1):
        p0 = pts[max(k - 1, 0)]
        p1, p2 = pts[k], pts[k + 1]
        p3 = pts[min(k + 2, m - 1)]
        for i in range(sub):
            t = i / sub
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
                             for a, b, c, d in zip(p0, p1, p2, p3)))
    out.append(tuple(pts[-1]))
    return out


def loft(bm, path, sections, n=20, exponent=2.2, cap=True, lateral=1.0, sub=4):
    """A closed tube through `path`. sections[k] = (half_width, half_up,
    half_down, top_pinch): a superellipse, taller above the path than below
    when half_up > half_down, narrowed toward the top by top_pinch (a
    withers or a crest). `lateral` mirrors the frame for right-side limbs."""
    if sub > 1:
        path = _catmull([tuple(p) for p in path], sub)
        sections = _catmull([tuple(sc) for sc in sections], sub)
    path = [Vector(p) for p in path]
    rings = []
    for k, p in enumerate(path):
        t = path[min(k + 1, len(path) - 1)] - path[max(k - 1, 0)]
        side, up = _frame(t)
        hw, hu, hd, pinch = sections[k]
        ring = []
        for i in range(n):
            a = 2 * math.pi * i / n
            c, s = math.cos(a), math.sin(a)
            e = 2.0 / exponent
            x = math.copysign(abs(c) ** e, c)
            y = math.copysign(abs(s) ** e, s)
            h = hu if y > 0 else hd
            w = hw * (1 - pinch * max(0.0, y) ** 2)
            ring.append(bm.verts.new(p + side * (x * w * lateral) + up * (y * h)))
        rings.append(ring)
    for k in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    if cap:
        bm.faces.new(list(reversed(rings[0])))
        bm.faces.new(rings[-1])


def _sphere(bm, c, r):
    import bmesh
    geom = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
    verts = geom["verts"]
    bmesh.ops.scale(bm, vec=r, verts=verts)
    bmesh.ops.translate(bm, vec=Vector(c), verts=verts)


def sources():
    """Every body volume as one overlapping mesh; the voxel remesh unions it."""
    import bmesh
    bm = bmesh.new()
    # Trunk, chest to buttock: (y, top z, bottom z, half width, top pinch).
    T = [(-0.74, 1.22, 1.00, 0.12, 0.3), (-0.66, 1.38, 0.88, 0.20, 0.5), (-0.50, 1.50, 0.82, 0.24, 0.72),
         (-0.30, 1.46, 0.79, 0.28, 0.6), (-0.05, 1.42, 0.79, 0.31, 0.5), (0.22, 1.45, 0.82, 0.31, 0.45),
         (0.44, 1.49, 0.90, 0.28, 0.4), (0.62, 1.48, 0.98, 0.26, 0.35), (0.78, 1.40, 1.04, 0.21, 0.35),
         (0.87, 1.26, 1.08, 0.10, 0.3)]
    path = [(0, y, (top + bot) / 2) for y, top, bot, _, _ in T]
    secs = [(hw, (top - bot) / 2, (top - bot) / 2, pinch) for _, top, bot, hw, pinch in T]
    # The trunk runs along -Y..+Y, so its frame "side" is +X and "up" is +Z.
    loft(bm, path, secs, n=28, exponent=2.3)
    # Neck: from inside the chest up to the poll, crest above.
    loft(bm, [(0, -0.46, 1.22), (0, -0.66, 1.42), (0, -0.84, 1.64), (0, -0.98, 1.80), (0, -1.05, 1.88)],
         [(0.18, 0.30, 0.24, 0.35), (0.15, 0.24, 0.18, 0.4), (0.115, 0.18, 0.13, 0.4), (0.09, 0.13, 0.10, 0.3), (0.075, 0.08, 0.08, 0.2)],
         n=24, exponent=2.1)
    # Head: forehead to muzzle; a broad flat forehead, a narrow face, the
    # muzzle swelling again.
    loft(bm, [(0, -0.99, 1.87), (0, -1.08, 1.76), (0, -1.17, 1.63), (0, -1.25, 1.51), (0, -1.31, 1.42), (0, -1.335, 1.37)],
         [(0.11, 0.06, 0.20, 0.25), (0.10, 0.055, 0.18, 0.3), (0.08, 0.05, 0.13, 0.3), (0.063, 0.045, 0.095, 0.2), (0.068, 0.045, 0.08, 0.1), (0.052, 0.035, 0.05, 0.0)],
         n=24, exponent=2.0)
    for s in (-1, 1):
        _sphere(bm, (0.06 * s, -0.99, 1.68), (0.055, 0.11, 0.11))      # jowl
        _sphere(bm, (0.04 * s, -1.33, 1.40), (0.03, 0.04, 0.04))       # nostril flare
        # Ears: a pointed loft up from the poll.
        loft(bm, [(0.055 * s, -1.00, 1.87), (0.065 * s, -0.99, 1.96), (0.07 * s, -0.98, 2.04)],
             [(0.03, 0.022, 0.022, 0.0), (0.028, 0.02, 0.02, 0.0), (0.004, 0.004, 0.004, 0.0)], n=10, exponent=2.0)
        # Fore limb: shoulder into forearm, knee, cannon, fetlock, pastern.
        fore = [(0.14, -0.47, 1.22), (0.165, -0.44, 1.02), (0.165, -0.46, 0.84), (0.155, -0.49, 0.62), (0.15, -0.50, 0.53),
                (0.15, -0.50, 0.42), (0.15, -0.505, 0.28), (0.15, -0.51, 0.20), (0.15, -0.54, 0.13), (0.15, -0.57, 0.07)]
        fsec = [(0.10, 0.17, 0.17, 0), (0.085, 0.12, 0.12, 0), (0.068, 0.085, 0.085, 0), (0.052, 0.062, 0.062, 0), (0.048, 0.058, 0.058, 0),
                (0.038, 0.048, 0.048, 0), (0.035, 0.046, 0.046, 0), (0.041, 0.05, 0.05, 0), (0.038, 0.045, 0.045, 0), (0.044, 0.05, 0.05, 0)]
        loft(bm, [(x * s, y, z) for x, y, z in fore], fsec, n=16, exponent=2.0)
        # Hind limb: stifle and thigh, gaskin, hock, cannon, fetlock, pastern.
        hind = [(0.13, 0.55, 1.22), (0.155, 0.44, 1.02), (0.155, 0.47, 0.86), (0.145, 0.56, 0.68), (0.14, 0.63, 0.55),
                (0.14, 0.61, 0.44), (0.14, 0.595, 0.30), (0.14, 0.58, 0.20), (0.14, 0.555, 0.13), (0.14, 0.53, 0.07)]
        hsec = [(0.12, 0.25, 0.25, 0), (0.11, 0.22, 0.22, 0), (0.08, 0.15, 0.15, 0), (0.055, 0.10, 0.10, 0), (0.05, 0.08, 0.08, 0),
                (0.039, 0.055, 0.055, 0), (0.036, 0.049, 0.049, 0), (0.041, 0.05, 0.05, 0), (0.038, 0.045, 0.045, 0), (0.044, 0.05, 0.05, 0)]
        loft(bm, [(x * s, y, z) for x, y, z in hind], hsec, n=16, exponent=2.0)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    me = bpy.data.meshes.new("HorseSources")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("HorseSources", me)
    collection().objects.link(ob)
    return ob


def hooves():
    """Hooves as their own solids: a truncated cone, toe forward (-Y)."""
    import bmesh
    bm = bmesh.new()
    for side in (-1, 1):
        for fore in (True, False):
            c = P("coronet_f" if fore else "coronet_h", side)
            n = 16
            top, bot = [], []
            for i in range(n):
                a = 2 * math.pi * i / n
                # Toe slightly longer than the heel.
                ry = 0.06 if math.sin(a) < 0 else 0.05
                top.append(bm.verts.new((c.x + math.cos(a) * 0.046, c.y + math.sin(a) * ry * 0.8, 0.085)))
                bot.append(bm.verts.new((c.x + math.cos(a) * 0.062, c.y - 0.03 + math.sin(a) * ry * 1.1, 0.0)))
            for i in range(n):
                j = (i + 1) % n
                bm.faces.new((bot[i], bot[j], top[j], top[i]))
            bm.faces.new(list(reversed(bot)))
            bm.faces.new(top)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    me = bpy.data.meshes.new("HP_Hooves")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("HP_Hooves", me)
    collection().objects.link(ob)
    return ob


def body_mesh(voxel=0.009):
    """Lofted sources -> voxel remesh (the union) -> gentle smooth: the HP body."""
    ob = sources()
    ob.name = "HP_Body"
    ob.data.name = "HP_Body"
    rm = ob.modifiers.new("remesh", "REMESH")
    rm.mode = "VOXEL"
    rm.voxel_size = voxel
    sm = ob.modifiers.new("smooth", "CORRECTIVE_SMOOTH")
    sm.iterations = 8
    sm.scale = 1.0
    sm.use_only_smooth = True
    _apply(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def _apply(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def build():
    clear()
    body = body_mesh()
    h = hooves()
    return body, h
