"""High-poly assembly: build every source piece, union by voxel remesh,
label faces by nearest source piece, and sculpt cloth folds.

Result objects (collection "Sheriff_HP"):
  HP_Cloth   shirt/pants/vest union (material index per region)
  HP_Skin    head + ears + neck
  HP_HandL/R hands
  HP_Hair    hair shell, brows, moustache
  HP_Eyes    eyeballs
  HP_Boots   boots (+ welt/heel)
  HP_Hat     hat + band
  HP_Gear_*  hard-surface props kept as authored
"""

import math

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import sh_body as B
import sh_gear as G
import sh_head as H
from sh_common import apply_modifiers, collection, gauss, join, remesh_voxel, set_verts_np, smoothstep, verts_np

HP = "Sheriff_HP"
SRC = "Sheriff_SRC"


def _move(ob, coll_name):
    coll = collection(coll_name)
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)
    return ob


def clear(coll_name):
    coll = bpy.data.collections.get(coll_name)
    if not coll:
        return
    for ob in list(coll.objects):
        me = ob.data if ob.type == "MESH" else None
        bpy.data.objects.remove(ob, do_unlink=True)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)


def solidify(ob, thickness, offset=-1.0):
    m = ob.modifiers.new("sol", "SOLIDIFY")
    m.thickness = thickness
    m.offset = offset
    m.use_even_offset = True
    apply_modifiers(ob)
    return ob


def build_sources():
    clear(SRC)
    src = {}

    def keep(key, ob):
        _move(ob, SRC)
        src[key] = ob
        return ob

    keep("shirt", B.torso_mesh("s_shirt", B.SHIRT_KEYS, 0.98, 1.575, 180, 180, "shirt"))
    keep("pants", B.torso_mesh("s_pants", B.PANTS_KEYS, 0.83, 1.085, 90, 180, "pants"))
    for s in "LR":
        keep("leg" + s, B.leg_mesh("s_leg" + s, s))
        keep("arm" + s, B.arm_mesh("s_arm" + s, s))
        keep("boot" + s, B.boot_mesh("s_boot" + s, s))
        keep("hand" + s, B.hand_mesh("s_hand" + s, s))
    keep("vest", solidify(B.vest_mesh("s_vest"), 0.0045))
    head, rings = H.head_mesh("s_head")
    keep("head", head)
    eyes, centres = H.eyes_mesh(rings, "s_eyes")
    keep("eyes", eyes)
    keep("ears", H.ear_mesh("s_ears"))
    keep("neck", H.neck_mesh("s_neck"))
    keep("hair", solidify(H.hair_mesh(rings, "s_hair"), 0.002, offset=-1))
    keep("brows", H.brow_mesh(rings, "s_brows"))
    keep("moustache", H.moustache_mesh(rings, "s_moustache"))
    keep("hat", G.hat_mesh("s_hat"))
    keep("concho", G.concho_mesh("s_concho"))
    keep("bandana", solidify(G.bandana_mesh("s_bandana"), 0.0025, offset=1))
    keep("buttons", G.buttons_mesh("s_buttons"))
    keep("pockets", G.pocket_flaps_mesh("s_pockets"))
    keep("chain", G.watch_chain_mesh("s_chain"))
    keep("badge", G.badge_mesh("s_badge"))
    keep("gunbelt", G.gunbelt_mesh("s_gunbelt"))
    loops, brass = G.cartridges_mesh("s_loops")
    keep("loops", loops)
    keep("brass", brass)
    keep("buckle", G.buckle_mesh("s_buckle"))
    gun, grip = G.revolver_mesh("s_gun")
    keep("gun", gun)
    keep("grip", grip)
    keep("holster", G.holster_mesh("s_holster"))
    keep("tiedown", G.tiedown_mesh("s_tiedown"))
    keep("spurs", G.spurs_mesh("s_spurs"))
    collection(SRC).hide_render = True
    return src, centres


def union(name, sources, voxel, smooth_iters=0):
    ob = join(name, sources, collection(HP))
    remesh_voxel(ob, voxel, smooth_iters=smooth_iters)
    return ob


def label_by_nearest(ob, sources):
    """Per-vertex and per-face index of the nearest source object."""
    trees = []
    for s in sources:
        me = s.data
        verts = [s.matrix_world @ v.co for v in me.vertices]
        trees.append(BVHTree.FromPolygons(verts, [tuple(p.vertices) for p in me.polygons]))
    co = verts_np(ob)
    vlabel = np.zeros(len(co), dtype=np.int32)
    for i, p in enumerate(co):
        best, bi = 1e9, 0
        v = Vector(p)
        for k, t in enumerate(trees):
            hit = t.find_nearest(v)
            if hit[0] is not None and hit[3] < best:
                best, bi = hit[3], k
        vlabel[i] = bi
    # Majority filter so region borders follow garment edges, not voxel noise.
    me = ob.data
    e = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", e)
    e = e.reshape(-1, 2)
    K = len(sources)
    for _ in range(4):
        votes = np.zeros((len(co), K))
        np.add.at(votes, (e[:, 0], vlabel[e[:, 1]]), 1.0)
        np.add.at(votes, (e[:, 1], vlabel[e[:, 0]]), 1.0)
        votes[np.arange(len(co)), vlabel] += 1.5
        vlabel = votes.argmax(axis=1).astype(np.int32)
    polys = ob.data.polygons
    flabel = np.zeros(len(polys), dtype=np.int32)
    for p in polys:
        vs = [vlabel[i] for i in p.vertices]
        flabel[p.index] = max(set(vs), key=vs.count)
    return vlabel, flabel


def vertex_normals(ob):
    me = ob.data
    n = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get("normal", n)
    return n.reshape(-1, 3)


def segment_param(p, a, b):
    ab = b - a
    L = np.linalg.norm(ab)
    t = np.clip(((p - a) @ ab) / (L * L), 0, 1)
    closest = a + np.outer(t, ab)
    return t, np.linalg.norm(p - closest, axis=1), L


def ridges(s, c, specs, rng):
    """Sum of wrinkle ridges in surface space.

    s: along-limb arc length, c: circumferential arc length (wrapped by the
    caller's circumference), specs: list of (count, s_mu, s_sigma, c_centre,
    c_spread, angle_deg, angle_jitter, amp, width, length).
    """
    out = np.zeros(len(s))
    for count, s_mu, s_sig, c_mu, c_spread, ang, jit, amp, width, length, circ in specs:
        for _ in range(count):
            si = rng.normal(s_mu, s_sig)
            ci = c_mu + rng.uniform(-c_spread, c_spread)
            th = math.radians(ang + rng.uniform(-jit, jit))
            a = amp * rng.uniform(0.55, 1.0)
            w = width * rng.uniform(0.7, 1.3)
            L = length * rng.uniform(0.6, 1.3)
            dc = (c - ci + circ / 2) % circ - circ / 2
            ds = s - si
            du = ds * math.sin(th) + dc * math.cos(th)
            dv = -ds * math.cos(th) + dc * math.sin(th)
            ridge = np.exp(-(dv / w) ** 2) * np.exp(-(du / L) ** 2)
            # A fold is a ridge flanked by shallow valleys.
            valley = np.exp(-((np.abs(dv) - 1.6 * w) / (0.8 * w)) ** 2) * np.exp(-(du / L) ** 2)
            out += a * (ridge - 0.45 * valley)
    return out


def limb_coords(p, joints):
    """Arc length along a joint chain, ring angle and radius for each point."""
    best = np.full(len(p), 1e9)
    s_out = np.zeros(len(p))
    radial_out = np.zeros_like(p)
    acc = 0.0
    for a, b in zip(joints[:-1], joints[1:]):
        t, d, L = segment_param(p, a, b)
        sel = d < best
        best[sel] = d[sel]
        s_out[sel] = acc + t[sel] * L
        radial_out[sel] = (p - (a + np.outer(t, b - a)))[sel]
        acc += L
    return s_out, radial_out, acc


def _idx(names, key):
    return names.index(key) if key in names else -1


def cloth_folds(ob, vlabel, names):
    """Displace cloth vertices along normals with irregular wrinkle ridges."""
    co = verts_np(ob)
    nrm = vertex_normals(ob)
    disp = np.zeros(len(co))
    rng = np.random.default_rng(1877)

    for side, sgn in (("L", 1), ("R", -1)):
        m = vlabel == _idx(names, "arm" + side)
        if m.any():
            p = co[m]
            sh, el, wr = B.joint("upper_arm", side), B.joint("forearm", side), B.joint("hand", side)
            s, radial, total = limb_coords(p, [sh, el, wr])
            Lu = np.linalg.norm(el - sh)
            # Angle 0 = front of arm (-Y), measured around the limb.
            axis = (wr - sh) / np.linalg.norm(wr - sh)
            front = np.array([0.0, -1.0, 0.0]) - axis * (-axis[1])
            front /= np.linalg.norm(front)
            lateral = np.cross(axis, front) * sgn
            ang = np.arctan2(radial @ lateral, radial @ front)
            r = 0.047
            circ = 2 * math.pi * r
            c = ang * r
            specs = [
                # elbow crook: short compression folds, mostly inner/front
                (9, Lu, 0.030, 0.0, 0.050, 0, 28, 0.0042, 0.0045, 0.035, circ),
                (4, Lu + 0.02, 0.030, circ / 2, 0.06, 0, 20, 0.0022, 0.0040, 0.030, circ),
                # armpit pull: long diagonals off the shoulder
                (4, 0.07, 0.025, circ * 0.30, 0.03, 55, 12, 0.0030, 0.0055, 0.070, circ),
                (3, 0.07, 0.025, -circ * 0.30, 0.03, -55, 12, 0.0026, 0.0055, 0.060, circ),
                # forearm bunching above the cuff
                (8, total - 0.055, 0.025, 0.0, circ / 2, 0, 35, 0.0030, 0.0040, 0.030, circ),
                # sleeve garter gathering
                (7, 0.125, 0.010, 0.0, circ / 2, 90, 25, 0.0020, 0.0028, 0.018, circ),
            ]
            d = ridges(s, c, specs, rng)
            d -= 0.0035 * gauss(s, 0.105, 0.007)
            disp[m] += d

        m = vlabel == _idx(names, "leg" + side)
        if m.any():
            p = co[m]
            hip, kn, an = B.joint("thigh", side), B.joint("shin", side), B.joint("foot", side)
            s, radial, total = limb_coords(p, [hip, kn, an])
            L = np.linalg.norm(kn - hip)
            ang = np.arctan2(radial[:, 0] * sgn, -radial[:, 1])
            r = 0.080
            circ = 2 * math.pi * r
            c = ang * r
            s_boot = hip[2] - 0.455
            specs = [
                # behind the knee
                (8, L + 0.01, 0.030, circ / 2, 0.07, 0, 25, 0.0045, 0.0055, 0.045, circ),
                # front of knee, soft
                (3, L - 0.02, 0.030, 0.0, 0.05, 0, 30, 0.0022, 0.0060, 0.040, circ),
                # stacked folds bunching into the boot shaft
                (14, s_boot, 0.022, 0.0, circ / 2, 0, 30, 0.0055, 0.0050, 0.050, circ),
                # crotch pull on the upper inner-front thigh
                (4, 0.07, 0.03, -circ * 0.18 * sgn * 0 - circ * 0.18, 0.03, 40, 12, 0.0030, 0.0060, 0.075, circ),
                # long drape lines down the thigh
                (5, 0.25, 0.05, 0.0, circ / 2, 88, 4, 0.0014, 0.0080, 0.14, circ),
            ]
            d = ridges(s, c, specs, rng)
            d += 0.0030 * gauss(p[:, 2], 0.455, 0.035)
            disp[m] += d

    m = vlabel == _idx(names, "pants")
    if m.any():
        p = co[m]
        ang = np.arctan2(p[:, 0], -p[:, 1])
        r = 0.15
        circ = 2 * math.pi * r
        s = 1.1 - p[:, 2]
        specs = [
            (5, 0.24, 0.02, 0.0, 0.05, 45, 25, 0.0024, 0.005, 0.05, circ),
            (4, 0.10, 0.02, 0.0, circ / 2, 90, 15, 0.0018, 0.005, 0.03, circ),
        ]
        disp[m] += ridges(s, ang * r, specs, rng)

    m = vlabel == _idx(names, "shirt")
    if m.any():
        p = co[m]
        ang = np.arctan2(p[:, 0], -p[:, 1])
        r = 0.17
        circ = 2 * math.pi * r
        s = 1.6 - p[:, 2]
        specs = [
            # blousing over the waistband
            (16, 0.50, 0.02, 0.0, circ / 2, 90, 20, 0.0030, 0.0045, 0.035, circ),
            # shoulder-to-armpit strain
            (6, 0.20, 0.03, circ * 0.25, 0.04, 35, 20, 0.0018, 0.004, 0.05, circ),
            (6, 0.20, 0.03, -circ * 0.25, 0.04, -35, 20, 0.0018, 0.004, 0.05, circ),
        ]
        disp[m] += ridges(s, ang * r, specs, rng)

    m = vlabel == (names.index("vest") if "vest" in names else -1)
    if m.any():
        p = co[m]
        ang = np.arctan2(p[:, 0], -p[:, 1])
        r = 0.18
        circ = 2 * math.pi * r
        s = 1.6 - p[:, 2]
        specs = [
            (6, 0.47, 0.04, circ * 0.25, 0.05, 10, 25, 0.0013, 0.004, 0.04, circ),
            (6, 0.47, 0.04, -circ * 0.25, 0.05, -10, 25, 0.0013, 0.004, 0.04, circ),
            (4, 0.44, 0.03, 0.0, 0.02, 30, 30, 0.0010, 0.003, 0.03, circ),
        ]
        disp[m] += ridges(s, ang * r, specs, rng)

    set_verts_np(ob, co + nrm * disp[:, None])


def vest_folds(ob):
    co = verts_np(ob)
    nrm = vertex_normals(ob)
    rng = np.random.default_rng(44)
    ang = np.arctan2(co[:, 0], -co[:, 1])
    r = 0.18
    circ = 2 * math.pi * r
    s = 1.6 - co[:, 2]
    specs = [
        (6, 0.47, 0.04, circ * 0.25, 0.05, 10, 25, 0.0013, 0.004, 0.04, circ),
        (6, 0.47, 0.04, -circ * 0.25, 0.05, -10, 25, 0.0013, 0.004, 0.04, circ),
        (4, 0.44, 0.03, 0.0, 0.02, 30, 30, 0.0010, 0.003, 0.03, circ),
    ]
    d = ridges(s, ang * r, specs, rng)
    set_verts_np(ob, co + nrm * d[:, None])


def hair_strands(ob):
    """Carve strand clumps: grooves run down the scalp and moustache, out along the brows."""
    import sh_paint as P
    co = verts_np(ob)
    nrm = vertex_normals(ob)
    y, z = co[:, 1], co[:, 2]
    brow = gauss(z, 1.713, 0.006) * smoothstep(-0.07, -0.09, y)
    down = P.fbm(co * np.array([1.0, 1.0, 0.12]), 700, 3, 5)
    across = P.fbm(co * np.array([0.12, 1.0, 1.0]), 700, 3, 6)
    d = (down - 0.5) * (1 - brow) + (across - 0.5) * brow
    set_verts_np(ob, co + nrm * (d * 0.0016)[:, None])


def assemble():
    clear(HP)
    src, centres = build_sources()
    cloth_names = ["shirt", "pants", "legL", "legR", "armL", "armR"]
    cloth = union("HP_Cloth", [src[n] for n in cloth_names], 0.0032)
    vlabel, flabel = label_by_nearest(cloth, [src[n] for n in cloth_names])
    cloth_folds(cloth, vlabel, cloth_names)
    # Material index: 0 shirt, 1 pants, 2 vest.
    region = {"shirt": 0, "armL": 0, "armR": 0, "pants": 1, "legL": 1, "legR": 1}
    mi = np.array([region[cloth_names[k]] for k in flabel], dtype=np.int32)
    for slot in ("M_Shirt", "M_Pants"):
        cloth.data.materials.append(bpy.data.materials.get(slot) or bpy.data.materials.new(slot))
    cloth.data.polygons.foreach_set("material_index", mi)
    corr = cloth.modifiers.new("relax", "SMOOTH")
    corr.factor = 0.35
    corr.iterations = 2
    apply_modifiers(cloth)
    cloth["region_names"] = "shirt,pants,vest"

    skin = union("HP_Skin", [src["head"], src["ears"], src["neck"]], 0.0010)
    handL = union("HP_HandL", [src["handL"]], 0.0010, smooth_iters=2)
    handR = union("HP_HandR", [src["handR"]], 0.0010, smooth_iters=2)
    hair = union("HP_Hair", [src["hair"], src["brows"], src["moustache"]], 0.0008)
    hair_strands(hair)
    boots = union("HP_Boots", [src["bootL"], src["bootR"]], 0.0016)
    hat = union("HP_Hat", [src["hat"]], 0.0014)
    eyes = join("HP_Eyes", [src["eyes"]], collection(HP))
    vest = union("HP_Vest", [src["vest"]], 0.0014)
    vest_folds(vest)
    gear = {}
    for key in ("concho", "bandana", "buttons", "pockets", "chain", "badge", "gunbelt", "loops", "brass", "buckle",
                "gun", "grip", "holster", "tiedown", "spurs"):
        gear[key] = join("HP_Gear_" + key, [src[key]], collection(HP))
    for ob in collection(HP).objects:
        ob.data.shade_smooth()
    return {"centres": [list(c) for c in centres]}
