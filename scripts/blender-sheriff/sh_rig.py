"""Armature, skin weights, and authored Idle/Walk clips for the sheriff.

Bones are placed from the same landmarks the body was built from (sh_body.SKEL
and the hand layout), so joints sit where the garments crease.

Poses are authored as absolute world-space rotation deltas per bone (what the
bone's rest orientation is rotated by), converted to Blender's parent-relative
basis with Q_b = Rb^-1 * D_parent^-1 * D_b * Rb.
"""

import math

import bpy
import numpy as np
from mathutils import Matrix, Quaternion, Vector

import sh_body as B
import sh_spec as S
from sh_bake import LOW

RIG = "SheriffRig"

FINGER_NAMES = ("thumb", "index", "middle", "ring", "pinky")


def bone_specs():
    """(name, head, tail, parent) in armature space."""
    W = S.warp_point
    j = {k: W(np.array(v, dtype=float)) for k, v in B.SKEL.items()}
    specs = [
        ("root", (0, 0, 0), (0, 0.18, 0), None),
        ("hips", j["hips"], j["spine"], "root"),
        ("spine", j["spine"], j["chest"], "hips"),
        ("chest", j["chest"], j["upper_chest"], "spine"),
        ("upper_chest", j["upper_chest"], j["neck"], "chest"),
        ("neck", j["neck"], j["head"], "upper_chest"),
        ("head", j["head"], j["head_end"], "neck"),
    ]
    for side in "LR":
        s = "." + side
        J = lambda n: W(B.joint(n, side))
        specs += [
            ("shoulder" + s, J("shoulder") * np.array([1, 1, 1]), J("upper_arm"), "upper_chest"),
            ("upper_arm" + s, J("upper_arm"), J("forearm"), "shoulder" + s),
            ("forearm" + s, J("forearm"), J("hand"), "upper_arm" + s),
            ("hand" + s, J("hand"), None, "forearm" + s),
            ("thigh" + s, J("thigh"), J("shin"), "hips"),
            ("shin" + s, J("shin"), J("foot"), "thigh" + s),
            ("foot" + s, J("foot"), J("toe"), "shin" + s),
            ("toe" + s, J("toe"), J("toe_end"), "foot" + s),
        ]
        layout, (wr, u, v, w) = B.hand_layout(side)
        layout = {k: S.warp(np.asarray(pts)) for k, pts in layout.items()}
        knuckles = np.mean([layout[f][0] for f in ("index", "middle", "ring", "pinky")], axis=0)
        specs[-5] = ("hand" + s, J("hand"), knuckles, "forearm" + s)
        for f in FINGER_NAMES:
            pts = layout[f]
            for k in range(3):
                specs.append((f"{f}.{k + 1:02d}{s}", pts[k], pts[k + 1], "hand" + s if k == 0 else f"{f}.{k:02d}{s}"))
    return specs


def build_armature():
    old = bpy.data.objects.get(RIG)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    arm = bpy.data.armatures.new(RIG)
    ob = bpy.data.objects.new(RIG, arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.edit_bones
    for name, head, tail, parent in bone_specs():
        b = eb.new(name)
        b.head = Vector(tuple(head))
        b.tail = Vector(tuple(tail))
        # Consistent rolls: Z axis toward the character's front (-Y) where possible.
        d = (b.tail - b.head).normalized()
        ref = Vector((0, -1, 0)) if abs(d.y) < 0.9 else Vector((0, 0, 1))
        b.align_roll(ref)
        if parent:
            b.parent = eb[parent]
            b.use_connect = False
        b.use_deform = name != "root"
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


# --------------------------------------------------------------------------
# Skinning


RIGID = {
    # piece: bone weights applied uniformly (rigid attachment)
    "LP_Hat": {"head": 1.0},
    "LP_Eyes": {"head": 1.0},
    "LP_Gear_concho": {"head": 1.0},
    "LP_Gear_spectacles": {"head": 1.0},
    "LP_Gear_spurs": None,  # per side, set below
}
TRANSFER_AVERAGE = ("LP_Gear_badge", "LP_Gear_holster", "LP_Gear_gun", "LP_Gear_grip", "LP_Gear_buckle",
                    "LP_Gear_pipe", "LP_Gear_papers", "LP_Gear_rope", "LP_Gear_cravat")
TRANSFER = ("LP_Hair", "LP_Vest", "LP_Shawl", "LP_Coat", "LP_Gear_bandana", "LP_Gear_gunbelt", "LP_Gear_buttons",
            "LP_Gear_pockets", "LP_Gear_chain", "LP_Gear_loops", "LP_Gear_brass", "LP_Gear_tiedown",
            "LP_Gear_suspenders", "LP_Gear_collar", "LP_Gear_waistband", "LP_Gear_satchel")
BODY = ("LP_Cloth", "LP_Skin", "LP_HandL", "LP_HandR", "LP_Boots")
# Pieces that hang below the hips and swing between the legs.
HANG = ("LP_Skirt", "LP_Apron", "LP_Coat")


def piece_names():
    return ["LP_" + k[3:] for k in LOW]


def segment_weights(co, rig):
    """Fallback envelope weights: inverse distance to bone segments."""
    bones = [b for b in rig.data.bones if b.use_deform]
    heads = np.array([b.head_local[:] for b in bones])
    tails = np.array([b.tail_local[:] for b in bones])
    d = np.zeros((len(co), len(bones)))
    for i in range(len(bones)):
        ab = tails[i] - heads[i]
        t = np.clip(((co - heads[i]) @ ab) / max(ab @ ab, 1e-9), 0, 1)
        d[:, i] = np.linalg.norm(co - (heads[i] + np.outer(t, ab)), axis=1)
    w = 1.0 / np.maximum(d, 1e-3) ** 4
    idx = np.argsort(-w, axis=1)[:, :3]
    return bones, d, w, idx


def skin(mesh_ob, rig):
    me = mesh_ob.data
    names = piece_names()
    piece = np.zeros(len(me.polygons), dtype=np.int32)
    me.attributes["piece"].data.foreach_get("value", piece)
    # Vertex -> piece.
    lt = np.zeros(len(me.polygons), dtype=np.int64)
    me.polygons.foreach_get("loop_total", lt)
    lv = np.zeros(len(me.loops), dtype=np.int64)
    me.loops.foreach_get("vertex_index", lv)
    vpiece = np.zeros(len(me.vertices), dtype=np.int32)
    vpiece[lv] = np.repeat(piece, lt)
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)

    # 1) Bone-heat weights on a body proxy (the organic, manifold pieces).
    body_idx = [names.index(n) for n in BODY if n in names]
    body_mask = np.isin(vpiece, body_idx)
    proxy = mesh_ob.copy()
    proxy.data = me.copy()
    proxy.name = "SkinProxy"
    bpy.context.scene.collection.objects.link(proxy)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(proxy.data)
    bm.verts.ensure_lookup_table()
    kill = [bm.verts[i] for i in np.nonzero(~body_mask)[0]]
    bmesh.ops.delete(bm, geom=kill, context="VERTS")
    bm.to_mesh(proxy.data)
    bm.free()
    for vg in list(proxy.vertex_groups):
        proxy.vertex_groups.remove(vg)
    bpy.ops.object.select_all(action="DESELECT")
    proxy.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")

    bones = [b.name for b in rig.data.bones if b.use_deform]
    bindex = {n: i for i, n in enumerate(bones)}
    pco = np.zeros(len(proxy.data.vertices) * 3)
    proxy.data.vertices.foreach_get("co", pco)
    pco = pco.reshape(-1, 3)
    pw = np.zeros((len(pco), len(bones)))
    gname = {vg.index: vg.name for vg in proxy.vertex_groups}
    for v in proxy.data.vertices:
        for g in v.groups:
            n = gname[g.group]
            if n in bindex:
                pw[v.index, bindex[n]] = g.weight
    # Fill heat failures with envelope weights.
    _, dist, env, _ = segment_weights(pco, rig)
    empty = pw.sum(axis=1) < 1e-4
    pw[empty] = env[empty]
    # Keep hands off the thighs and torso off the arms: heat bleeds across
    # touching surfaces of separate pieces.
    pw /= np.maximum(pw.sum(axis=1, keepdims=True), 1e-9)

    # Map proxy vertices back to the full mesh by position (proxy kept order).
    from mathutils.kdtree import KDTree
    kd = KDTree(len(pco))
    for i, p in enumerate(pco):
        kd.insert(p, i)
    kd.balance()

    W = np.zeros((len(co), len(bones)))
    body_rows = np.nonzero(body_mask)[0]
    for i in body_rows:
        _, k, _ = kd.find(co[i])
        W[i] = pw[k]

    # Per-piece pieces of the body proxy: clamp hands to arm chain, boots to legs.
    def restrict(piece_name, allowed_prefixes):
        rows = vpiece == names.index(piece_name)
        keep = np.array([any(b.startswith(p) for p in allowed_prefixes) for b in bones])
        W[np.ix_(rows, ~keep)] = 0

    for side in "LR":
        if "LP_Hand" + side not in names:
            continue
        restrict("LP_Hand" + side, ("hand." + side, "forearm." + side) + tuple(f + "." for f in FINGER_NAMES))
    for i in np.nonzero(vpiece == names.index("LP_HandL"))[0]:
        W[i, [bindex[b] for b in bones if b.endswith(".R")]] = 0
    for i in np.nonzero(vpiece == names.index("LP_HandR"))[0]:
        W[i, [bindex[b] for b in bones if b.endswith(".L")]] = 0
    boots = vpiece == (names.index("LP_Boots") if "LP_Boots" in names else -1)
    for side, sgn in (("L", 1), ("R", -1)):
        rows = boots & (co[:, 0] * sgn > 0)
        keep = np.array([b in ("shin." + side, "foot." + side, "toe." + side) for b in bones])
        W[np.ix_(rows, ~keep)] = 0
    skin_head = vpiece == (names.index("LP_Skin") if "LP_Skin" in names else -1)
    keep = np.array([b in ("head", "neck", "upper_chest") for b in bones])
    W[np.ix_(skin_head, ~keep)] = 0

    # 2) Transfer from nearest body vertex for layered pieces.
    for pname in TRANSFER + TRANSFER_AVERAGE + HANG:
        if pname not in names:
            continue
        rows = np.nonzero(vpiece == names.index(pname))[0]
        for i in rows:
            best = kd.find_n(co[i], 4)
            acc = np.zeros(len(bones))
            tot = 0.0
            for _, k, dd in best:
                wgt = 1.0 / max(dd, 1e-4)
                acc += pw[k] * wgt
                tot += wgt
            W[i] = acc / tot
        if pname in TRANSFER_AVERAGE and len(rows):
            W[rows] = W[rows].mean(axis=0)
    # Below the hips a skirt, apron or coat tail follows the thighs partway.
    hip_z = rig.data.bones["thigh.L"].head_local.z
    hem_span = hip_z - 0.05
    for pname in HANG:
        if pname not in names:
            continue
        rows = np.nonzero(vpiece == names.index(pname))[0]
        for i in rows:
            x, z = co[i, 0], co[i, 2]
            h = float(np.clip((hip_z + 0.02 - z) / hem_span, 0, 1)) ** 0.8
            if h <= 0:
                continue
            sideL = float(np.clip((x + 0.05) / 0.10, 0, 1))
            hang = np.zeros(len(bones))
            hang[bindex["thigh.L"]] = 0.6 * h * sideL
            hang[bindex["thigh.R"]] = 0.6 * h * (1 - sideL)
            hang[bindex["hips"]] = 1 - 0.6 * h
            blend = float(np.clip(h * 3, 0, 1))
            W[i] = W[i] * (1 - blend) + hang * blend
    # Hair rides the head (nape blends into the neck).
    hair = np.nonzero(vpiece == names.index("LP_Hair"))[0] if "LP_Hair" in names else []
    neck_z = rig.data.bones["head"].head_local.z
    for i in hair:
        t = np.clip((co[i, 2] - (neck_z + 0.02)) / 0.05, 0, 1)
        W[i] = 0
        W[i, bindex["head"]] = t * 0.9 + 0.1 * (co[i, 2] > 1.6)
        W[i, bindex["neck"]] = 1 - W[i, bindex["head"]]
    for pname, spec in RIGID.items():
        if pname not in names:
            continue
        rows = np.nonzero(vpiece == names.index(pname))[0]
        if spec is None:
            for i in rows:
                W[i] = 0
                W[i, bindex["foot.L" if co[i, 0] > 0 else "foot.R"]] = 1
            continue
        for i in rows:
            W[i] = 0
            for b, wv in spec.items():
                W[i, bindex[b]] = wv

    # Limit to 4 influences, normalise, write groups.
    top = np.argsort(-W, axis=1)[:, :4]
    W4 = np.zeros_like(W)
    rr = np.arange(len(W))[:, None]
    W4[rr, top] = W[rr, top]
    W4[W4 < 0.01] = 0
    W4 /= np.maximum(W4.sum(axis=1, keepdims=True), 1e-9)
    for vg in list(mesh_ob.vertex_groups):
        mesh_ob.vertex_groups.remove(vg)
    for bi, bname in enumerate(bones):
        vg = mesh_ob.vertex_groups.new(name=bname)
        nz = np.nonzero(W4[:, bi])[0]
        for i in nz:
            vg.add([int(i)], float(W4[i, bi]), "REPLACE")
    bpy.data.objects.remove(proxy, do_unlink=True)
    mesh_ob.parent = rig
    mesh_ob.matrix_parent_inverse = Matrix.Identity(4)
    mod = mesh_ob.modifiers.get("Armature") or mesh_ob.modifiers.new("Armature", "ARMATURE")
    mod.object = rig
    return W4


# --------------------------------------------------------------------------
# Posing


def rot_between(a, b):
    a = Vector(a).normalized()
    b = Vector(b).normalized()
    return a.rotation_difference(b)


class Poser:
    def __init__(self, rig):
        self.rig = rig
        self.rest = {b.name: b.matrix_local.to_3x3().to_quaternion() for b in rig.data.bones}
        self.head = {b.name: Vector(b.head_local) for b in rig.data.bones}
        self.tail = {b.name: Vector(b.tail_local) for b in rig.data.bones}
        self.parent = {b.name: (b.parent.name if b.parent else None) for b in rig.data.bones}

    def apply(self, deltas, hips_offset, frame):
        """deltas: bone -> world rotation delta (Quaternion). Missing = inherit parent."""
        full = {}
        order = [b.name for b in self.rig.data.bones]  # parents precede children
        for n in order:
            p = self.parent[n]
            parent_d = full.get(p, Quaternion()) if p else Quaternion()
            full[n] = deltas.get(n, parent_d)
        for n in order:
            pb = self.rig.pose.bones[n]
            p = self.parent[n]
            Dp = full[p] if p else Quaternion()
            Rb = self.rest[n]
            q = Rb.inverted() @ (Dp.inverted() @ full[n]) @ Rb
            pb.rotation_mode = "QUATERNION"
            pb.rotation_quaternion = q
            pb.keyframe_insert("rotation_quaternion", frame=frame, group=n)
        hb = self.rig.pose.bones["hips"]
        hb.location = self.rest["hips"].inverted() @ Vector(hips_offset)
        hb.keyframe_insert("location", frame=frame, group="hips")


def two_bone_ik(hip, ankle, l1, l2, pole):
    d = ankle - hip
    L = min(d.length, (l1 + l2) * 0.9995)
    dn = d.normalized()
    a = (l1 * l1 - l2 * l2 + L * L) / (2 * L)
    h = math.sqrt(max(l1 * l1 - a * a, 0.0))
    pole_dir = (pole - dn * pole.dot(dn)).normalized()
    knee = hip + dn * a + pole_dir * h
    return knee, hip + dn * L


def leg_deltas(P, side, hips_pos_delta, hips_rot, ankle_target, foot_pitch, toe_bend, foot_yaw=0.0):
    s = "." + side
    rest_hip = P.head["thigh" + s]
    rest_knee = P.head["shin" + s]
    rest_ankle = P.head["foot" + s]
    hip = P.head["hips"] + Vector(hips_pos_delta) + hips_rot @ (rest_hip - P.head["hips"])
    l1 = (rest_knee - rest_hip).length
    l2 = (rest_ankle - rest_knee).length
    knee, ankle = two_bone_ik(hip, Vector(ankle_target), l1, l2, Vector((0, -1, 0.05)))
    d_thigh = rot_between(rest_knee - rest_hip, knee - hip)
    shin_after = d_thigh @ (rest_ankle - rest_knee)
    d_shin = rot_between(shin_after, ankle - knee) @ d_thigh
    d_foot = Quaternion((0, 0, 1), foot_yaw) @ Quaternion((1, 0, 0), foot_pitch)
    d_toe = d_foot @ Quaternion((1, 0, 0), toe_bend)
    return {"thigh" + s: d_thigh, "shin" + s: d_shin, "foot" + s: d_foot, "toe" + s: d_toe}


def arm_deltas(side, drop, swing, elbow, wrist=0.0, curl=0.2, twist=0.0, chest=Quaternion()):
    """drop: rotate arm toward the body from the A-pose; swing: forward(+)/back."""
    sgn = 1 if side == "L" else -1
    s = "." + side
    d_upper = chest @ Quaternion((1, 0, 0), -swing) @ Quaternion((0, 1, 0), sgn * drop) @ Quaternion((0, 0, 1), sgn * twist)
    d_fore = d_upper @ Quaternion((1, 0, 0), -elbow)
    d_hand = d_fore @ Quaternion((1, 0, 0), -wrist)
    out = {"shoulder" + s: chest, "upper_arm" + s: d_upper, "forearm" + s: d_fore, "hand" + s: d_hand}
    # Finger curl about the hand's local knuckle axis (world approx: lateral axis
    # of the hand, which for a hanging hand is +/-Y rotated).
    for f in FINGER_NAMES:
        acc = d_hand
        for k in range(3):
            amt = curl * (0.6 if f == "thumb" else 1.0) * (1.0, 1.2, 0.8)[k]
            axis = Vector((0, sgn * 1.0, 0)) if f != "thumb" else Vector((sgn * 0.3, 0.3, 1.0)).normalized()
            acc = acc @ Quaternion(axis, amt)
            out[f"{f}.{k + 1:02d}{s}"] = acc
    return out


# Boot sole landmarks from sh_body.boot_mesh, as (along-foot, height) with
# "along" measured forward from the ankle. The heel block reaches 9 cm back.
FOOT_SOLE = ((-0.092, 0.0), (-0.030, 0.0), (0.050, 0.020), (0.110, 0.011))
TOE_SOLE = ((0.170, 0.011), (0.235, 0.013), (0.262, 0.016))
TOE_JOINT = (0.117, 0.030)


def sole_clearance(A0, ankle, pitch, toe):
    """Upward correction (m) so no sole landmark goes below the floor."""
    rf = Quaternion((1, 0, 0), pitch)
    rt = rf @ Quaternion((1, 0, 0), toe)
    # Feet take the warp's depth scale (height x width) and the leg zone's
    # height scale (height x leg), so the landmarks track the actual boot.
    ka = S.scale() * S.SPEC["width"]
    kz = S.scale() * S.SPEC["leg"]
    rel = lambda along, z: Vector((0, -along * ka, z * kz - A0.z))
    lowest = min((ankle + rf @ rel(a, z)).z for a, z in FOOT_SOLE)
    joint = ankle + rf @ rel(*TOE_JOINT)
    for a, z in TOE_SOLE:
        lowest = min(lowest, (joint + rt @ (rel(a, z) - rel(*TOE_JOINT))).z)
    return max(0.0, -lowest + 0.002)


def smooth(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


FPS = 30


def measure_sole_dips(rig, mesh, action_name="Walk"):
    """Per frame, per side: how far the deformed mesh dips below the floor.

    Evaluates the real skinned mesh, so boots, heels, spurs and hems all count.
    """
    scene = bpy.context.scene
    act = bpy.data.actions[action_name]
    rig.animation_data.action = act
    if hasattr(act, "slots") and len(act.slots):
        rig.animation_data.action_slot = act.slots[0]
    f0, f1 = (int(v) for v in act.frame_range)
    dips = {}
    for f in range(f0, f1 + 1):
        scene.frame_set(f)
        dg = bpy.context.evaluated_depsgraph_get()
        ev = mesh.evaluated_get(dg)
        me = ev.to_mesh()
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        ev.to_mesh_clear()
        co = co.reshape(-1, 3)
        low = co[co[:, 2] < 0.2]
        out = {}
        for side, sel in (("L", low[:, 0] > 0), ("R", low[:, 0] <= 0)):
            zmin = float(low[sel, 2].min()) if sel.any() else 0.0
            out[side] = max(0.0, -zmin + 0.0015) if zmin < 0.0005 else 0.0
        dips[f] = out
    return dips


def author_walk(rig, period=None, step_len=None, stance=0.62, name="Walk", lifts=None):
    wk = S.SPEC["walk"]
    k = S.scale()
    period = period or wk["period"]
    step_len = (step_len or wk["step"]) * k
    swing_deg = wk.get("arm_swing", 16)
    drop_l, drop_r = wk.get("drop", (23, 19))
    hip_sway = wk.get("sway", 1.0)
    P = Poser(rig)
    act = bpy.data.actions.get(name)
    if act:
        bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    frames = int(round(period * FPS))
    L = step_len
    for f in range(frames + 1):
        t = f / frames
        deltas = {}
        # Pelvis: lowest at contact (t=0, .5), highest at mid-stance.
        bob = (-0.040 + 0.012 * (-math.cos(4 * math.pi * t))) * k
        sway = 0.012 * hip_sway * k * math.sin(2 * math.pi * t)
        hips_off = Vector((sway, 0.0, bob))
        yaw = math.radians(5) * math.sin(2 * math.pi * t + math.pi / 2)
        roll = math.radians(2.5) * math.sin(2 * math.pi * t)
        hips_rot = Quaternion((0, 0, 1), yaw) @ Quaternion((0, 1, 0), roll) @ Quaternion((1, 0, 0), math.radians(4))
        deltas["hips"] = hips_rot
        spine = hips_rot @ Quaternion((0, 0, 1), -yaw * 0.6) @ Quaternion((1, 0, 0), math.radians(1))
        deltas["spine"] = spine
        chest = spine @ Quaternion((0, 0, 1), -yaw * 0.9) @ Quaternion((0, 1, 0), -roll * 0.8)
        deltas["chest"] = chest
        deltas["upper_chest"] = chest
        head = Quaternion((1, 0, 0), math.radians(-3)) @ Quaternion((0, 0, 1), 0.0)
        deltas["neck"] = chest.slerp(head, 0.5)
        deltas["head"] = head

        for side, phase in (("L", 0.0), ("R", 0.5)):
            u = (t + phase) % 1.0
            rest_ankle = P.head["foot." + side]
            ka = k * S.SPEC["width"]
            heel = Vector((rest_ankle.x, rest_ankle.y + 0.063 * ka, 0.0))
            ball = Vector((rest_ankle.x, rest_ankle.y - 0.117 * ka, 0.0))
            A0 = Vector(rest_ankle)
            if u < stance:
                su = u / stance
                d = -L / 2 + L * su  # foot moves from front (-Y) to back
                off = Vector((0, d, 0))
                if su < 0.14:
                    th = math.radians(-18) * (1 - smooth(su / 0.14))
                    ankle = heel + off + Quaternion((1, 0, 0), th) @ (A0 - heel)
                elif su < 0.66:
                    th = 0.0
                    ankle = A0 + off
                else:
                    k = (su - 0.66) / 0.34
                    th = math.radians(38) * k ** 1.6
                    ankle = ball + off + Quaternion((1, 0, 0), th) @ (A0 - ball)
                toe = -th if th > 0 else 0.0
            else:
                k = (u - stance) / (1 - stance)
                off_a = Vector((0, L / 2, 0))
                start = ball + off_a + Quaternion((1, 0, 0), math.radians(38)) @ (A0 - ball)
                off_b = Vector((0, -L / 2, 0))
                end = heel + off_b + Quaternion((1, 0, 0), math.radians(-18)) @ (A0 - heel)
                e = smooth(k)
                ankle = start.lerp(end, e) + Vector((0, 0, 0.085 * math.sin(math.pi * min(1.0, k * 1.1))))
                th = math.radians(38 + (-18 - 38) * smooth(min(1.0, k / 0.75)))
                # Unbend the toe gradually: snapping it at lift-off drove the
                # toe tip 4 cm through the floor.
                toe = -max(th, 0.0) * (1 - smooth(k / 0.5))
            yaw_out = math.radians(6) * (1 if side == "L" else -1)
            ankle = ankle + Vector((0, 0, sole_clearance(A0, ankle, th, toe)))
            if lifts:
                ankle = ankle + Vector((0, 0, lifts.get(f + 1, {}).get(side, 0.0)))
            deltas.update(leg_deltas(P, side, hips_off, hips_rot, ankle, th, toe, yaw_out))

            # Arms swing opposite their leg: forward when the other foot leads.
            arm_phase = 2 * math.pi * (t + phase)
            swing = math.radians(swing_deg) * -math.cos(arm_phase)
            elbow = math.radians(14 + 10 * max(0.0, math.cos(arm_phase)))
            drop = math.radians(drop_l if side == "L" else drop_r)
            deltas.update(arm_deltas(side, drop, swing, elbow, wrist=math.radians(4), curl=0.28, chest=chest))
        P.apply(deltas, hips_off, f + 1)
    _finish(act, frames)
    return act


def author_idle(rig, seconds=4.0, name="Idle"):
    k = S.scale()
    drop_l, drop_r = S.SPEC["walk"].get("drop", (23, 19))
    P = Poser(rig)
    act = bpy.data.actions.get(name)
    if act:
        bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    frames = int(round(seconds * FPS))
    for f in range(frames + 1):
        t = f / frames
        w = 2 * math.pi * t
        deltas = {}
        # Weight settles onto the left leg, drifts back; slow breathing.
        sway = (0.016 * math.sin(w) + 0.010) * k
        hips_off = Vector((sway, 0.0, (-0.012 + 0.003 * math.sin(2 * w)) * k))
        roll = math.radians(-2.2) * math.sin(w) - math.radians(1.2)
        hips_rot = Quaternion((0, 1, 0), roll) @ Quaternion((0, 0, 1), math.radians(3))
        deltas["hips"] = hips_rot
        breath = math.radians(1.3) * math.sin(2 * w)
        spine = hips_rot @ Quaternion((0, 1, 0), -roll * 0.9) @ Quaternion((1, 0, 0), math.radians(-1.5))
        deltas["spine"] = spine
        chest = spine @ Quaternion((1, 0, 0), -breath) @ Quaternion((0, 0, 1), math.radians(-3))
        deltas["chest"] = chest
        deltas["upper_chest"] = chest @ Quaternion((1, 0, 0), -breath * 0.5)
        look = math.radians(6) * math.sin(w + 0.8)
        head = Quaternion((0, 0, 1), look) @ Quaternion((1, 0, 0), math.radians(2) + breath * 0.4)
        deltas["neck"] = chest.slerp(head, 0.5)
        deltas["head"] = head
        for side in "LR":
            rest = P.head["foot." + side]
            splay = (0.03 if side == "L" else -0.03) * k
            ankle = Vector((rest.x + splay, rest.y + (0.02 if side == "L" else -0.05) * k, rest.z))
            deltas.update(leg_deltas(P, side, hips_off, hips_rot, ankle, 0.0, 0.0,
                                     math.radians(10 if side == "L" else -16)))
        # Left thumb hooked near the belt, gun hand relaxed by the holster.
        deltas.update(arm_deltas("L", math.radians(drop_l), math.radians(-2), math.radians(18) + breath, wrist=math.radians(8), curl=0.35, chest=chest))
        deltas.update(arm_deltas("R", math.radians(drop_r), math.radians(-4), math.radians(14) - breath, wrist=math.radians(-6), curl=0.25, chest=chest))
        P.apply(deltas, hips_off, f + 1)
    _finish(act, frames)
    return act


def _finish(act, frames):
    act.use_fake_user = True
    act.frame_range = (1, frames + 1)
    act.use_frame_range = True
    fcurves = getattr(act, "fcurves", None)
    if fcurves is None:
        return
    for fc in fcurves:
        for kp in fc.keyframe_points:
            kp.interpolation = "LINEAR"
