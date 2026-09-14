"""Authored conifer for src/vegetation.js: trunk, limbs and three crown LODs.

Unlike the prop kits nothing is baked to an atlas. The parts draw with the
game's own tree materials — bark on the trunk and limbs, the alpha-tested
needle card material with its wind, tint and bent normals on the crowns — so
the GLB carries geometry only:

  <name>_trunk        position, normal, uv (u around, v = height / stem top,
                      the CylinderGeometry convention the bark map expects)
  <name>_limbs        position, normal, uv (u around, v along the limb)
  <name>_crown_near   position, normal, uv (u base->tip of the needle sprig,
  <name>_crown_far    v across it: the PlaneGeometry card convention),
  <name>_crown_dist   COLOR_0 = Cycles ambient occlusion baked per vertex

vegetation.js derives the card tangents from the uvs and bends the normals
exactly as it does for the procedural crown.

Frame (Blender, Z up; glTF Y up on export): base at the origin, the same
dimensions as the procedural PINE prototype it replaces, so instance scale,
wind height band and colliders keep their meaning.

    import pr_pine; pr_pine.start("pine_std")   # build, bake AO, export
"""

import math
import os
import time
import traceback

import bmesh
import bpy
from mathutils import Matrix, Vector

OUT = "/Users/brian/Projects/high-country/public/models/trees"
STATUS = "/tmp/hc_props/status.txt"
COLL = "Trees"

# Standard conifer (vegetation.js PINE[1]): crown 2.4-7.7 m, radius 1.9,
# stem base radius 0.34, leader to 7.7 + 0.75.
SPEC = {
    "pine_std": dict(seed=11, base_y=2.4, top_y=7.7, radius=1.9, stem_r=0.34, whorls=10,
                     per_whorl=(6, 3), budget=dict(near=390, far=276, dist=234, limbs=1300, trunk=320)),
}


def log(msg):
    os.makedirs(os.path.dirname(STATUS), exist_ok=True)
    with open(STATUS, "a") as fh:
        fh.write(f"{time.strftime('%H:%M:%S')} {msg}\n")


def _rand(seed):
    x = math.sin(seed * 12.9898 + 4.1414) * 43758.5453
    return x - math.floor(x)


def _coll():
    c = bpy.data.collections.get(COLL)
    if c is None:
        c = bpy.data.collections.new(COLL)
        bpy.context.scene.collection.children.link(c)
    return c


def _object(name, bm):
    old = bpy.data.objects.get(name)
    if old is not None:
        me_old = old.data
        bpy.data.objects.remove(old, do_unlink=True)
        if me_old.users == 0:
            bpy.data.meshes.remove(me_old)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    _coll().objects.link(ob)
    return ob


# --------------------------------------------------------------------------
# Skeleton


def skeleton(spec):
    """Limbs as (whorl fraction, points, radii, length). Deterministic."""
    s = spec["seed"]
    base_y, top_y, R = spec["base_y"], spec["top_y"], spec["radius"]
    span = top_y - base_y
    limbs = []
    k = 0
    n = spec["whorls"]
    lo, hi = spec["per_whorl"]
    for w in range(n):
        f = w / (n - 1)
        z = base_y - 0.1 + span * math.pow(f, 0.92) + (_rand(s + w * 3.1) - 0.5) * 0.18
        f = max(0.0, min(1.0, (z - base_y) / span))
        count = max(2, round(lo + (hi - lo) * f))
        phase = _rand(s + w * 7.7) * 2 * math.pi
        for i in range(count):
            k += 1
            a = phase + 2 * math.pi * i / count + (_rand(s + k * 1.3) - 0.5) * 0.7
            # Rounded cone: long sweeping lower limbs, short ascending top.
            L = (R * 1.05 * math.pow(1 - f, 0.62) + 0.38) * (0.82 + 0.34 * _rand(s + k * 2.9))
            elev0 = -0.42 + 0.78 * f + (_rand(s + k * 5.3) - 0.5) * 0.16
            lift = 0.32 + 0.1 * _rand(s + k * 8.1)   # tips sweep up
            c, sn = math.cos(a), math.sin(a)
            stem_r = spec["stem_r"] * (1 - 0.88 * min(1, z / (top_y + 0.75)))
            p0 = Vector((c * stem_r * 0.6, sn * stem_r * 0.6, z))
            d0 = Vector((c * math.cos(elev0), sn * math.cos(elev0), math.sin(elev0)))
            e1 = elev0 + lift
            d1 = Vector((c * math.cos(e1), sn * math.cos(e1), math.sin(e1)))
            p1 = p0 + d0 * (L * 0.5)
            p2 = p1 + d1 * (L * 0.5)
            # A branch tip cannot reach below the ground (vegetation clamps
            # procedural cards at 0.06 m for the same reason).
            p2.z = max(p2.z, 0.25)
            r0 = 0.07 * (1 - 0.55 * f) * (0.85 + 0.3 * _rand(s + k * 3.7))
            limbs.append(dict(f=f, a=a, pts=[p0, p1, p2], radii=[r0, r0 * 0.6, r0 * 0.22], L=L, d=(d0 + d1).normalized()))
    return limbs


# --------------------------------------------------------------------------
# Geometry


def trunk(spec, name):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    top = spec["top_y"] + 0.75
    r = spec["stem_r"]
    prof = [(r * 1.7, 0.0), (r * 1.18, 0.32), (r * 1.0, 0.9), (r * 0.92, spec["base_y"]), (r * 0.62, (spec["base_y"] + top) / 2),
            (r * 0.3, spec["top_y"] - 0.4), (max(0.045, r * 0.16), top)]
    sides = 10
    rings = []
    for ri, (rad, z) in enumerate(prof):
        ring = []
        for i in range(sides + 1):
            a = 2 * math.pi * i / sides
            wob = 1 + (0.06 * math.sin(a * 3 + 1.3) if ri < 3 else 0.0)
            ring.append(bm.verts.new((math.cos(a) * rad * wob, math.sin(a) * rad * wob, z)))
        rings.append(ring)
    for ri in range(len(rings) - 1):
        for i in range(sides):
            f = bm.faces.new((rings[ri][i], rings[ri][i + 1], rings[ri + 1][i + 1], rings[ri + 1][i]))
            f.smooth = True
            for loop, (ii, rr) in zip(f.loops, ((i, ri), (i + 1, ri), (i + 1, ri + 1), (i, ri + 1))):
                loop[uv].uv = (ii / sides, prof[rr][1] / top)
    # Close the seam column's duplicate verts so normals are continuous.
    bmesh.ops.remove_doubles(bm, verts=[v for ring in rings for v in (ring[0], ring[-1])], dist=1e-6)
    # Surface roots.
    s = spec["seed"]
    for k in range(5):
        a = 2 * math.pi * k / 5 + _rand(s + k * 9.1) * 0.6
        c, sn = math.cos(a), math.sin(a)
        _tube(bm, uv, [Vector((c * r * 0.8, sn * r * 0.8, 0.4)), Vector((c * r * 1.6, sn * r * 1.6, 0.06)), Vector((c * r * 2.5, sn * r * 2.5, -0.1))],
              [r * 0.4, r * 0.22, r * 0.05], 5, cap_start=False)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return _object(name, bm)


def _tube(bm, uv, pts, radii, sides, cap_start=False):
    rings = []
    length = [0.0]
    for a, b in zip(pts, pts[1:]):
        length.append(length[-1] + (b - a).length)
    for k, p in enumerate(pts):
        t = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
        side = t.cross(Vector((0, 0, 1)))
        if side.length < 1e-4:
            side = t.cross(Vector((1, 0, 0)))
        side.normalize()
        up = side.cross(t)
        rings.append([bm.verts.new(p + (side * math.cos(2 * math.pi * i / sides) + up * math.sin(2 * math.pi * i / sides)) * radii[k]) for i in range(sides)])
    for k in range(len(rings) - 1):
        for i in range(sides):
            j = (i + 1) % sides
            f = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
            f.smooth = True
            for loop, (ii, kk) in zip(f.loops, ((i, k), (i + 1, k), (i + 1, k + 1), (i, k + 1))):
                loop[uv].uv = (ii / sides, length[kk])
    tip = bm.faces.new(list(reversed(rings[-1])) if False else rings[-1])
    for loop in tip.loops:
        loop[uv].uv = (0.5, length[-1])
    if cap_start:
        bm.faces.new(list(reversed(rings[0])))


def limbs_mesh(spec, sk, name):
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    for limb in sk:
        _tube(bm, uv, limb["pts"], limb["radii"], 5)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    return _object(name, bm)


FOLDS = ((0.0, 1.0), (0.85, 0.72), (-0.85, 0.72))


def _card(bm, uv, base, direction, length, width, tilt, width_scale):
    """One needle card: u base->tip along `direction`, v across it."""
    d = direction.normalized()
    across = d.cross(Vector((0, 0, 1)))
    if across.length < 1e-4:
        across = Vector((1, 0, 0))
    across.normalize()
    normal = across.cross(d).normalized()
    w = width * width_scale
    # Tilted folds turn about the branch axis and sit a little below it, as
    # vegetation.js makePineCanopy does.
    rot = Matrix.Rotation(tilt, 3, d)
    a2 = rot @ across
    offset = (rot @ normal) * (-w * 0.18 * (1 if tilt > 0 else -1 if tilt < 0 else 0))
    b = base + offset - d * (length * 0.08)
    t = b + d * length
    corners = [b - a2 * (w / 2), t - a2 * (w / 2), t + a2 * (w / 2), b + a2 * (w / 2)]
    uvs = [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]
    verts = [bm.verts.new(c) for c in corners]
    f = bm.faces.new(verts)
    f.smooth = False
    for loop, uvc in zip(f.loops, uvs):
        loop[uv].uv = uvc
    return f


def crown(spec, sk, name, lod):
    """Needle cards along the authored limbs, folded into a V about each limb
    so the mass reads from the side as well as from above.

    near  two sets per limb (inner and outer half), V fold of two cards
    far   one set per limb along its chord, flat card plus the V
    dist  one set per limb, V only, 20% wider
    """
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    V = ((0.62, 1.0), (-0.62, 1.0))
    s = spec["seed"]
    for idx, limb in enumerate(sk):
        p0, p1, p2 = limb["pts"]
        chord = p2 - p0
        if lod == "near":
            inner = p1 - p0
            outer = p2 - p1
            for tilt, ws in V:
                _card(bm, uv, p0, inner, inner.length * 1.5, max(0.75, limb["L"] * 0.85), tilt, ws)
            for tilt, ws in V:
                _card(bm, uv, p1 - outer * 0.12, outer, outer.length * 1.45, max(0.7, limb["L"] * 0.78), tilt * 0.85, ws)
        else:
            # The procedural crown's cards are 0.75 as wide as they are long
            # on a longer card (radius * 1.62); narrower read as bare stems
            # at mid range in the first A/B.
            widen = 1.45 if lod == "dist" else 1.3
            folds = V if lod == "dist" else ((0.0, 1.0),) + V
            cl = chord.length * 1.12
            for tilt, ws in folds:
                _card(bm, uv, p0, chord, cl, cl * 0.72 * widen, tilt, ws if tilt == 0 else ws * 0.85)
    # Leader tuft round the stem top.
    top = spec["top_y"]
    for k in range(3):
        a = 2 * math.pi * k / 3 + _rand(s + 90) * 1.0
        d = Vector((math.cos(a) * 0.55, math.sin(a) * 0.55, 0.85))
        _card(bm, uv, Vector((0, 0, top - 0.35)), d, 0.95, 0.7, 0.0, 1.0)
    return _object(name, bm)


def tri_count(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


# --------------------------------------------------------------------------
# AO bake to vertex colour


def bake_ao(crowns, occluders, samples=64, distance=1.1):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "GPU"
    sc.cycles.samples = samples
    if sc.world is None:
        sc.world = bpy.data.worlds.new("World")
    sc.world.light_settings.distance = distance
    for ob in crowns:
        me = ob.data
        if "AO" not in me.color_attributes:
            me.color_attributes.new("AO", "FLOAT_COLOR", "POINT")
        me.color_attributes.active_color = me.color_attributes["AO"]
    for ob in bpy.data.objects:
        ob.select_set(False)
    ground = bpy.data.objects.get("PV_Ground")
    if ground:
        ground.hide_render = False
    for ob in crowns:
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS", use_clear=True)
        ob.select_set(False)
        # Floor it the way vegetation.js does: a canopy's shaded side must not
        # go near black on an already dark needle albedo.
        attr = ob.data.color_attributes["AO"]
        for c in attr.data:
            v = c.color[0]
            m = 0.46 + 0.54 * v
            c.color = (m, m, m, 1.0)


def export(name, objs):
    os.makedirs(OUT, exist_ok=True)
    path = f"{OUT}/{name}.glb"
    for ob in bpy.data.objects:
        ob.select_set(False)
    for ob in objs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials="NONE",
        export_vertex_color="ACTIVE", export_all_vertex_colors=False, export_attributes=False,
        export_extras=False, export_animations=False, export_skins=False, export_morph=False,
        export_lights=False, export_cameras=False,
    )
    return path


def build(name="pine_std", bake=True):
    spec = SPEC[name]
    for ob in list(_coll().objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    sk = skeleton(spec)
    t = trunk(spec, f"{name}_trunk")
    l = limbs_mesh(spec, sk, f"{name}_limbs")
    cn = crown(spec, sk, f"{name}_crown_near", "near")
    cf = crown(spec, sk, f"{name}_crown_far", "far")
    cd = crown(spec, sk, f"{name}_crown_dist", "dist")
    counts = {ob.name: tri_count(ob) for ob in (t, l, cn, cf, cd)}
    log(f"{name}: limbs {len(sk)} tris {counts}")
    budget = spec["budget"]
    over = [(n, c) for n, c, b in ((cn.name, counts[cn.name], budget["near"]), (cf.name, counts[cf.name], budget["far"]),
                                   (cd.name, counts[cd.name], budget["dist"]), (l.name, counts[l.name], budget["limbs"]),
                                   (t.name, counts[t.name], budget["trunk"])) if c > b]
    if over:
        log(f"{name}: OVER BUDGET {over}")
    if not bake:
        return counts
    # Each LOD is baked with only its own crown (plus trunk and limbs)
    # visible, so a far crown never darkens the near one.
    for crown_ob in (cn, cf, cd):
        for other in (cn, cf, cd):
            other.hide_render = other is not crown_ob
        bake_ao([crown_ob], [t, l])
        log(f"{name}: AO {crown_ob.name}")
    for other in (cn, cf, cd):
        other.hide_render = False
    path = export(name, [t, l, cn, cf, cd])
    log(f"exported {path} {os.path.getsize(path)} bytes")
    return counts


def start(name="pine_std"):
    if os.path.exists(STATUS):
        os.remove(STATUS)

    def job():
        try:
            build(name)
            log("DONE")
        except Exception:
            log("FAILED\n" + traceback.format_exc())
        return None

    bpy.app.timers.register(job, first_interval=0.5)
    return STATUS
