"""Hair, eyes and tack for the horse, built as moderate-poly solids that go
straight into the game mesh (no high/low bake: their colour is baked from
the same object's procedural material into the shared atlas).

Every part is tagged with a material kind (hr_shade): hair, eye, hoof,
leather, blanket, iron, brass, rope. The saddle set and the harness set are
separate objects so the game can show one or the other on the same rig.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

from hr_body import _catmull, collection, loft


def _mesh(name, bm, material):
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    collection().objects.link(ob)
    ob.data.materials.append(material)
    return ob


def _box(bm, size, loc, rot=Matrix.Identity(3)):
    geom = bmesh.ops.create_cube(bm, size=1.0)
    v = geom["verts"]
    bmesh.ops.scale(bm, vec=size, verts=v)
    bmesh.ops.transform(bm, matrix=rot.to_4x4(), verts=v)
    bmesh.ops.translate(bm, vec=Vector(loc), verts=v)


def _tube(bm, pts, r, n=6, sub=3):
    pts = _catmull([tuple(p) for p in pts], sub) if len(pts) > 2 else [tuple(p) for p in pts]
    loft(bm, pts, [(r, r, r, 0.0)] * len(pts), n=n, exponent=2.0, sub=1)


def mane(mat):
    """A crest of hair falling to the off (right, -X) side, and a forelock."""
    bm = bmesh.new()
    crest = [(0.0, -0.975, 1.965), (0.0, -0.87, 1.90), (0.0, -0.75, 1.80), (0.0, -0.62, 1.68), (0.0, -0.50, 1.58), (0.0, -0.40, 1.53)]
    for k in range(len(crest) - 1):
        a, b = Vector(crest[k]), Vector(crest[k + 1])
        for i in range(4):
            t = i / 4
            p = a.lerp(b, t)
            length = 0.20 + 0.06 * math.sin((k + t) * 1.7)
            # A lock: a flattened tube from the crest falling out and down the off side.
            root = p + Vector((0.01, 0.0, -0.02))
            mid = root + Vector((-0.09, 0.015, -length * 0.35))
            tip = root + Vector((-0.13, 0.04, -length))
            loft(bm, [tuple(root), tuple(mid), tuple(tip)], [(0.022, 0.045, 0.045, 0.0), (0.024, 0.04, 0.04, 0.0), (0.005, 0.008, 0.008, 0.0)],
                 n=6, exponent=2.0, sub=2)
    # Forelock over the forehead.
    loft(bm, [(0.0, -1.00, 1.93), (0.0, -1.06, 1.86), (0.0, -1.10, 1.76)], [(0.035, 0.012, 0.012, 0.0), (0.04, 0.012, 0.012, 0.0), (0.01, 0.004, 0.004, 0.0)],
         n=8, exponent=2.0, sub=2)
    return _mesh("P_Mane", bm, mat)


def tail(mat):
    """Dock and a full hanging tail, flattened side to side, flaring low."""
    bm = bmesh.new()
    pts = [(0.0, 0.80, 1.43), (0.0, 0.88, 1.37), (0.0, 0.94, 1.26), (0.0, 0.97, 1.12), (0.0, 0.985, 0.96), (0.0, 0.99, 0.80),
           (0.0, 0.99, 0.66), (0.0, 0.985, 0.58), (0.0, 0.98, 0.54)]
    secs = [(0.045, 0.05, 0.05, 0.0), (0.05, 0.055, 0.055, 0.0), (0.052, 0.062, 0.062, 0.0), (0.054, 0.07, 0.07, 0.0), (0.056, 0.078, 0.078, 0.0),
            (0.056, 0.085, 0.085, 0.0), (0.05, 0.08, 0.08, 0.0), (0.035, 0.055, 0.055, 0.0), (0.01, 0.015, 0.015, 0.0)]
    loft(bm, pts, secs, n=12, exponent=2.0, sub=1)
    return _mesh("P_Tail", bm, mat)


def eyes(mat):
    bm = bmesh.new()
    for s in (-1, 1):
        geom = bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=0.026)
        bmesh.ops.scale(bm, vec=(0.7, 1.0, 0.85), verts=geom["verts"])
        bmesh.ops.translate(bm, vec=Vector((0.088 * s, -1.075, 1.765)), verts=geom["verts"])
    return _mesh("P_Eyes", bm, mat)


def bridle(leather, iron):
    """Headstall, browband, noseband, bit rings and reins to the withers."""
    bm = bmesh.new()
    # Headstall behind the ears down both cheeks to the bit.
    for s in (-1, 1):
        _tube(bm, [(0.0, -0.965, 1.93), (0.08 * s, -0.99, 1.86), (0.10 * s, -1.08, 1.70), (0.085 * s, -1.22, 1.50), (0.07 * s, -1.28, 1.42)], 0.01, n=5)
        # Noseband and throatlatch halves.
        _tube(bm, [(0.0, -1.26, 1.51), (0.075 * s, -1.24, 1.49), (0.07 * s, -1.19, 1.43)], 0.009, n=5)
        _tube(bm, [(0.09 * s, -0.99, 1.83), (0.07 * s, -0.94, 1.72), (0.0, -0.93, 1.66)], 0.008, n=5)
        # Reins from the bit back along the neck to the saddle horn / hames.
        _tube(bm, [(0.075 * s, -1.28, 1.42), (0.13 * s, -1.05, 1.52), (0.16 * s, -0.75, 1.52), (0.12 * s, -0.42, 1.62), (0.02 * s, -0.30, 1.66)], 0.007, n=4, sub=2)
    _tube(bm, [(-0.09, -1.02, 1.89), (0.0, -1.04, 1.91), (0.09, -1.02, 1.89)], 0.009, n=5)
    leather_ob = _mesh("P_Bridle", bm, leather)
    bm = bmesh.new()
    for s in (-1, 1):
        geom = bmesh.ops.create_cone(bm, cap_ends=False, segments=10, radius1=0.028, radius2=0.028, depth=0.008)
        bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, "Y"), verts=geom["verts"])
        bmesh.ops.translate(bm, vec=Vector((0.07 * s, -1.28, 1.42)), verts=geom["verts"])
    _tube(bm, [(-0.07, -1.28, 1.42), (0.07, -1.28, 1.42)], 0.006, n=5)
    iron_ob = _mesh("P_Bit", bm, iron)
    return leather_ob, iron_ob


def saddle(leather, blanket, iron, rope):
    """A western stock saddle on a folded blanket: seat, horn, cantle,
    skirts, fenders, cinch, stirrups on their leathers, a coiled rope."""
    parts = []
    # Blanket draped over the back behind the withers.
    bm = bmesh.new()
    for i in range(9):
        y = -0.36 + i * 0.075
        top = 1.50 if y < -0.2 else 1.44 + 0.02 * (y + 0.05)
        pass
    rows = []
    n_w, n_l = 12, 8
    for j in range(n_l + 1):
        y = -0.40 + j * (0.66 / n_l)
        row = []
        for i in range(n_w + 1):
            u = -1 + 2 * i / n_w
            ang = u * 1.35
            r = 0.30
            x = math.sin(ang) * r
            z = 1.49 - (1 - math.cos(ang)) * r * 1.15 - 0.02 * math.cos(math.pi * (j / n_l - 0.5))
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for j in range(n_l):
        for i in range(n_w):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.025)
    parts.append(_mesh("P_Blanket", bm, blanket))
    # Saddle: skirts, seat, fork and horn, cantle, fenders.
    bm = bmesh.new()
    rows = []
    for j in range(7):
        y = -0.30 + j * 0.085
        row = []
        for i in range(11):
            u = -1 + 2 * i / 10
            ang = u * 1.1
            x = math.sin(ang) * 0.305
            z = 1.525 - (1 - math.cos(ang)) * 0.33
            row.append(bm.verts.new((x, y, z)))
        rows.append(row)
    for j in range(6):
        for i in range(10):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
    bmesh.ops.solidify(bm, geom=list(bm.faces), thickness=0.03)
    # Seat: dished from fork to cantle.
    loft(bm, [(0, -0.22, 1.545), (0, -0.10, 1.535), (0, 0.04, 1.54), (0, 0.13, 1.56)],
         [(0.15, 0.018, 0.02, 0.0), (0.17, 0.015, 0.02, 0.0), (0.165, 0.018, 0.02, 0.0), (0.14, 0.03, 0.02, 0.0)], n=14, exponent=3.0, sub=2)
    # Fork, horn post and cap.
    loft(bm, [(0, -0.28, 1.53), (0, -0.25, 1.62), (0, -0.25, 1.70)], [(0.12, 0.05, 0.05, 0.3), (0.06, 0.035, 0.035, 0.0), (0.025, 0.02, 0.02, 0.0)], n=12, exponent=2.2, sub=2)
    loft(bm, [(0, -0.25, 1.70), (0, -0.25, 1.725)], [(0.05, 0.045, 0.045, 0.0), (0.05, 0.045, 0.045, 0.0)], n=12, exponent=2.0, sub=1)
    # Cantle.
    loft(bm, [(-0.13, 0.14, 1.56), (-0.08, 0.16, 1.61), (0, 0.17, 1.63), (0.08, 0.16, 1.61), (0.13, 0.14, 1.56)], [(0.02, 0.025, 0.025, 0.0)] * 5, n=8, exponent=2.4, sub=2)
    for s in (-1, 1):
        # Fender over each stirrup leather.
        _box(bm, (0.012, 0.20, 0.24), (0.30 * s, -0.05, 1.30), Matrix.Rotation(-0.12 * s, 3, "Y"))
    parts.append(_mesh("P_Saddle", bm, leather))
    # Stirrups and leathers, cinch.
    bm = bmesh.new()
    for s in (-1, 1):
        _tube(bm, [(0.30 * s, -0.05, 1.35), (0.32 * s, -0.05, 1.10), (0.33 * s, -0.05, 1.00)], 0.012, n=5, sub=1)
        _box(bm, (0.012, 0.03, 0.30), (0.305 * s, -0.03, 1.07))
        # Wooden stirrup: a flat-bottomed loop.
        loft(bm, [(0.33 * s, -0.12, 0.93), (0.33 * s, -0.12, 1.00), (0.33 * s, -0.05, 1.03), (0.33 * s, 0.02, 1.00), (0.33 * s, 0.02, 0.93)],
             [(0.03, 0.012, 0.012, 0.0)] * 5, n=6, exponent=2.4, sub=2)
        _box(bm, (0.07, 0.15, 0.015), (0.33 * s, -0.05, 0.925))
    # Cinch under the barrel.
    loft(bm, [(0.29, -0.28, 1.24), (0.22, -0.30, 0.95), (0.0, -0.31, 0.80), (-0.22, -0.30, 0.95), (-0.29, -0.28, 1.24)],
         [(0.05, 0.006, 0.006, 0.0)] * 5, n=6, exponent=2.4, sub=4)
    parts.append(_mesh("P_Rigging", bm, rope))
    # A coiled lariat on the near (left, +X) side of the fork.
    bm = bmesh.new()
    for k in range(3):
        c = Vector((0.33, -0.28, 1.36 - k * 0.012))
        ring = [(c.x + 0.004 * k, c.y + math.cos(a) * 0.12, c.z + math.sin(a) * 0.14) for a in [2 * math.pi * i / 12 for i in range(13)]]
        loft(bm, ring, [(0.008, 0.008, 0.008, 0.0)] * len(ring), n=5, exponent=2.0, cap=False, sub=1)
    parts.append(_mesh("P_Lariat", bm, rope))
    for ob in parts:
        ob["set"] = "saddle"
    return parts


def harness(leather, iron, brass):
    """Team harness for the coach: collar and hames, back pad and girth,
    breeching round the quarters, traces running back."""
    parts = []
    bm = bmesh.new()
    # Collar: a padded ring standing on the shoulders around the neck base.
    ring = []
    for i in range(17):
        a = 2 * math.pi * i / 16
        ring.append((math.sin(a) * 0.20, -0.66 - 0.03 * math.cos(a), 1.40 + math.cos(a) * 0.26))
    loft(bm, ring, [(0.06, 0.045, 0.045, 0.0)] * len(ring), n=10, exponent=2.0, cap=False, sub=1)
    # Back pad and girth.
    loft(bm, [(0.22, -0.20, 1.30), (0.10, -0.20, 1.49), (0.0, -0.20, 1.51), (-0.10, -0.20, 1.49), (-0.22, -0.20, 1.30)], [(0.07, 0.02, 0.02, 0.0)] * 5, n=6, exponent=2.4, sub=3)
    loft(bm, [(0.29, -0.22, 1.24), (0.22, -0.24, 0.95), (0.0, -0.25, 0.80), (-0.22, -0.24, 0.95), (-0.29, -0.22, 1.24)], [(0.04, 0.006, 0.006, 0.0)] * 5, n=6, exponent=2.4, sub=4)
    for s in (-1, 1):
        # Breeching round the quarters and the hip straps.
        _tube(bm, [(0.26 * s, 0.30, 1.10), (0.29 * s, 0.60, 1.08), (0.22 * s, 0.80, 1.10), (0.0, 0.86, 1.12)], 0.02, n=5)
        _tube(bm, [(0.26 * s, 0.50, 1.10), (0.20 * s, 0.50, 1.42), (0.0, 0.50, 1.50)], 0.012, n=5)
        # Traces from the hames back along the flank.
        _tube(bm, [(0.24 * s, -0.66, 1.26), (0.30 * s, -0.20, 1.14), (0.31 * s, 0.40, 1.08), (0.30 * s, 0.95, 1.02)], 0.012, n=5)
    parts.append(_mesh("P_HarnessLeather", bm, leather))
    bm = bmesh.new()
    for s in (-1, 1):
        # Hames along each side of the collar, a brass knob on top.
        _tube(bm, [(0.17 * s, -0.70, 1.20), (0.23 * s, -0.71, 1.40), (0.18 * s, -0.69, 1.62), (0.10 * s, -0.66, 1.70)], 0.013, n=6)
    parts.append(_mesh("P_Hames", bm, iron))
    bm = bmesh.new()
    for s in (-1, 1):
        geom = bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.025)
        bmesh.ops.translate(bm, vec=Vector((0.10 * s, -0.66, 1.72)), verts=geom["verts"])
    parts.append(_mesh("P_Knobs", bm, brass))
    for ob in parts:
        ob["set"] = "harness"
    return parts
