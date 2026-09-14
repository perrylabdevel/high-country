"""Quadruped armature, skin weights and gait clips for the horse.

Bones lie in the sagittal plane with their local X axis on world +X, so a
pose rotation about local X swings a limb fore and aft. In this frame a
positive X rotation carries a hanging hoof toward +Y — backward, since the
horse faces -Y — so forward reach is negative.

Clips (30 fps, looped): Idle, Walk (four-beat), Trot (diagonal pairs),
Gallop (transverse, left lead, with suspension). CLIP_SPEED is the ground
speed each clip's stride covers, for the game to scale playback.
"""

import math

import bpy
from mathutils import Vector

RIG = "HorseRig"
FPS = 30

# name: (head, tail, parent)
BONES = {
    "root": ((0, 0, 0), (0, -0.3, 0), None),
    "pelvis": ((0, 0.30, 1.30), (0, 0.72, 1.32), "root"),
    "spine1": ((0, 0.30, 1.30), (0, -0.08, 1.28), "pelvis"),
    "spine2": ((0, -0.08, 1.28), (0, -0.46, 1.33), "spine1"),
    "neck1": ((0, -0.52, 1.34), (0, -0.72, 1.54), "spine2"),
    "neck2": ((0, -0.72, 1.54), (0, -0.88, 1.72), "neck1"),
    "neck3": ((0, -0.88, 1.72), (0, -0.99, 1.86), "neck2"),
    "head": ((0, -0.99, 1.86), (0, -1.30, 1.43), "neck3"),
    "ear.L": ((0.055, -1.00, 1.88), (0.07, -0.98, 2.04), "head"),
    "ear.R": ((-0.055, -1.00, 1.88), (-0.07, -0.98, 2.04), "head"),
    "tail1": ((0, 0.80, 1.42), (0, 0.93, 1.28), "pelvis"),
    "tail2": ((0, 0.93, 1.28), (0, 0.98, 1.04), "tail1"),
    "tail3": ((0, 0.98, 1.04), (0, 0.99, 0.80), "tail2"),
    "tail4": ((0, 0.99, 0.80), (0, 0.985, 0.56), "tail3"),
}
for side, sx in (("L", 1), ("R", -1)):
    BONES.update({
        f"scapula.{side}": ((0.13 * sx, -0.36, 1.42), (0.16 * sx, -0.50, 1.10), "spine2"),
        f"humerus.{side}": ((0.16 * sx, -0.50, 1.10), (0.17 * sx, -0.43, 0.94), f"scapula.{side}"),
        f"forearm.{side}": ((0.17 * sx, -0.43, 0.94), (0.15 * sx, -0.50, 0.53), f"humerus.{side}"),
        f"cannon_f.{side}": ((0.15 * sx, -0.50, 0.53), (0.15 * sx, -0.51, 0.20), f"forearm.{side}"),
        f"pastern_f.{side}": ((0.15 * sx, -0.51, 0.20), (0.15 * sx, -0.57, 0.08), f"cannon_f.{side}"),
        f"hoof_f.{side}": ((0.15 * sx, -0.57, 0.08), (0.15 * sx, -0.62, 0.0), f"pastern_f.{side}"),
        f"femur.{side}": ((0.13 * sx, 0.50, 1.30), (0.16 * sx, 0.40, 0.98), "pelvis"),
        f"tibia.{side}": ((0.16 * sx, 0.40, 0.98), (0.14 * sx, 0.63, 0.55), f"femur.{side}"),
        f"cannon_h.{side}": ((0.14 * sx, 0.63, 0.55), (0.14 * sx, 0.58, 0.20), f"tibia.{side}"),
        f"pastern_h.{side}": ((0.14 * sx, 0.58, 0.20), (0.14 * sx, 0.53, 0.08), f"cannon_h.{side}"),
        f"hoof_h.{side}": ((0.14 * sx, 0.53, 0.08), (0.14 * sx, 0.48, 0.0), f"pastern_h.{side}"),
    })

# Ground speed each clip covers (m/s): stride length / period.
CLIP_SPEED = {"Walk": 1.6, "Trot": 3.7, "Gallop": 10.5}


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
    for name, (head, tail, parent) in BONES.items():
        b = eb.new(name)
        b.head = Vector(head)
        b.tail = Vector(tail)
        d = (b.tail - b.head).normalized()
        # Local Z = +X cross the bone axis, so local X lands on world +X.
        ref = Vector((1, 0, 0)).cross(d)
        if ref.length > 1e-4:
            b.align_roll(ref)
        if parent:
            b.parent = eb[parent]
            b.use_connect = False
        b.use_deform = name != "root"
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in ob.pose.bones:
        pb.rotation_mode = "XYZ"
    return ob


# Envelope radius per bone (m): how far its influence falls off from the
# bone segment. Wide for the trunk, tight for the lower limbs so a leg's
# swing never drags the belly or the other leg.
RADIUS = {
    "pelvis": 0.42, "spine1": 0.45, "spine2": 0.42, "neck1": 0.26, "neck2": 0.20, "neck3": 0.16, "head": 0.20,
    "ear": 0.05, "tail1": 0.10, "tail2": 0.12, "tail3": 0.12, "tail4": 0.12,
    "scapula": 0.20, "humerus": 0.15, "forearm": 0.10, "cannon_f": 0.06, "pastern_f": 0.055, "hoof_f": 0.06,
    "femur": 0.22, "tibia": 0.13, "cannon_h": 0.06, "pastern_h": 0.055, "hoof_h": 0.06,
}
# Tack follows the trunk rigidly-ish; which bones each tack mesh may use.
TACK_BONES = {
    "HorseSaddle": ("spine1", "spine2", "pelvis"),
    "HorseHarness": ("spine2", "spine1", "pelvis", "neck1", "scapula.L", "scapula.R"),
}


def _radius(name):
    base = name.split(".")[0]
    return RADIUS.get(base, 0.15)


def skin(meshes, rig):
    """Envelope weights: Gaussian falloff from each bone segment, scaled by
    the bone's radius, masked by side (left bones only on the left half) and
    by region (tail hair only on tail bones), top four normalised."""
    import numpy as np
    bones = [b for b in rig.data.bones if b.use_deform]
    heads = np.array([b.head_local[:] for b in bones])
    tails = np.array([b.tail_local[:] for b in bones])
    radii = np.array([_radius(b.name) for b in bones])
    names = [b.name for b in bones]
    sides = np.array([1 if n.endswith(".L") else -1 if n.endswith(".R") else 0 for n in names])
    is_tail = np.array([n.startswith("tail") for n in names])
    is_leg = np.array([n.split(".")[0] in ("scapula", "humerus", "forearm", "cannon_f", "pastern_f", "hoof_f",
                                           "femur", "tibia", "cannon_h", "pastern_h", "hoof_h") for n in names])
    for mesh in meshes:
        mesh.parent = rig
        mesh.matrix_parent_inverse.identity()
        for vg in list(mesh.vertex_groups):
            mesh.vertex_groups.remove(vg)
        mod = mesh.modifiers.get("Armature") or mesh.modifiers.new("Armature", "ARMATURE")
        mod.object = rig
        co = np.array([v.co[:] for v in mesh.data.vertices])
        n = len(co)
        d = np.zeros((n, len(bones)))
        for i in range(len(bones)):
            ab = tails[i] - heads[i]
            t = np.clip(((co - heads[i]) @ ab) / max(ab @ ab, 1e-9), 0, 1)
            d[:, i] = np.linalg.norm(co - (heads[i] + np.outer(t, ab)), axis=1)
        w = np.exp(-(d / radii) ** 2)
        x = co[:, 0]
        for i in range(len(bones)):
            if sides[i] == 1:
                w[:, i] *= np.clip((x + 0.02) / 0.05, 0, 1)
            elif sides[i] == -1:
                w[:, i] *= np.clip((-x + 0.02) / 0.05, 0, 1)
        # The tail hangs past the quarters: only tail bones (and the pelvis at
        # the dock) move it, and tail bones move nothing else.
        tail_zone = (co[:, 1] > 0.80) & (np.abs(x) < 0.09) & (co[:, 2] < 1.46)
        w[tail_zone][:, ~is_tail] *= 0.0
        wt = w.copy()
        wt[np.ix_(tail_zone, ~is_tail & (np.array(names) != "pelvis"))] = 0.0
        wt[np.ix_(~tail_zone, is_tail)] = 0.0
        # Legs stay off the upper trunk: above the elbow/stifle line only the
        # scapula and femur may pull, and only lightly.
        high = co[:, 2] > 1.05
        lower_leg = is_leg & ~np.isin(np.array(names), [f"scapula.{s}" for s in "LR"] + [f"femur.{s}" for s in "LR"])
        wt[np.ix_(high, lower_leg)] = 0.0
        tack = TACK_BONES.get(mesh.name)
        if tack:
            allow = np.isin(np.array(names), tack)
            wt[:, ~allow] = 0.0
            wt[:, allow] += 1e-6
        idx = np.argsort(-wt, axis=1)[:, :4]
        groups = {name: mesh.vertex_groups.new(name=name) for name in names}
        for v in range(n):
            sel = idx[v]
            vals = wt[v, sel]
            tot = vals.sum()
            if tot < 1e-9:
                sel = [int(np.argmin(d[v]))]
                vals = np.array([1.0])
                tot = 1.0
            for bi, val in zip(sel, vals):
                if val / tot > 0.01:
                    groups[names[bi]].add([v], float(val / tot), "REPLACE")


# --------------------------------------------------------------------------
# Clips


def _action(rig, name):
    act = bpy.data.actions.get(name)
    if act:
        bpy.data.actions.remove(act)
    act = bpy.data.actions.new(name)
    rig.animation_data_create()
    rig.animation_data.action = act
    return act


def _key(rig, frame, rot, loc_root=None):
    for pb in rig.pose.bones:
        pb.rotation_euler = rot.get(pb.name, (0.0, 0.0, 0.0))
        pb.location = (0, 0, 0)
        pb.keyframe_insert("rotation_euler", frame=frame)
        pb.keyframe_insert("location", frame=frame)
    if loc_root is not None:
        rig.pose.bones["root"].location = loc_root
        rig.pose.bones["root"].keyframe_insert("location", frame=frame)


def _finish(act, frames):
    act.use_fake_user = True
    act.frame_range = (1, frames + 1)
    act.use_frame_range = True


def _smooth01(x):
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def _leg(u, stance, reach, flex, fore):
    """Joint rotations for one leg at cycle phase u.

    Stance: the whole limb sweeps from `reach` forward to `reach` back with
    the joints straight. Swing: it returns forward with the knee (fore) or
    hock (hind) folding and the fetlock curling, peaking mid-swing."""
    if u < stance:
        s = u / stance
        # The hoof's fore-aft position under the hip is L*sin(angle), so an
        # arcsine sweep keeps it moving at one ground speed through contact;
        # a linear sweep in angle ran fast mid-stance and skated at the ends.
        swing = math.asin((-1 + 2 * s) * math.sin(reach))
        fold = 0.0
        fet = 0.12 * math.sin(math.pi * s)      # fetlock drops under load
    else:
        s = (u - stance) / (1 - stance)
        swing = reach - 2 * reach * _smooth01(s)
        fold = math.sin(math.pi * min(1.0, s * 1.15))
        fet = -0.1 * fold
    if fore:
        return {
            "upper": swing * 0.55,              # scapula
            "mid": swing * 0.45 - fold * flex * 0.15,
            "fore": -fold * flex * 0.2,          # elbow draws forward
            "cannon": fold * flex,              # knee folds: cannon back and up
            "pastern": fold * flex * 0.7 + fet,
        }
    return {
        "upper": swing * 0.75,                  # femur
        "mid": fold * flex * 0.35,              # stifle
        "cannon": -fold * flex * 0.9,           # hock folds: cannon forward
        "pastern": fold * flex * 0.8 + fet,
    }


def _pose_legs(rot, phases, t, stance, reach, flex):
    for (leg, off) in phases.items():
        u = (t + off) % 1.0
        fore = leg.startswith("F")
        side = leg[1]
        j = _leg(u, stance, reach, flex, fore)
        if fore:
            rot[f"scapula.{side}"] = (j["upper"], 0, 0)
            rot[f"humerus.{side}"] = (j["mid"], 0, 0)
            rot[f"forearm.{side}"] = (j["fore"], 0, 0)
            rot[f"cannon_f.{side}"] = (j["cannon"], 0, 0)
            rot[f"pastern_f.{side}"] = (j["pastern"], 0, 0)
        else:
            rot[f"femur.{side}"] = (j["upper"], 0, 0)
            rot[f"tibia.{side}"] = (j["mid"], 0, 0)
            rot[f"cannon_h.{side}"] = (j["cannon"], 0, 0)
            rot[f"pastern_h.{side}"] = (j["pastern"], 0, 0)


def author_gait(rig, name, period, phases, stance, reach, flex, bob, bob_freq, neck_amp, neck_freq, pitch_amp=0.0):
    act = _action(rig, name)
    frames = int(round(period * FPS))
    for f in range(frames + 1):
        t = f / frames
        w = 2 * math.pi * t
        rot = {}
        _pose_legs(rot, phases, t, stance, reach, flex)
        # Body: bob and, at the gallop, a rocking pitch through the spine.
        z = -bob * (0.5 + 0.5 * math.cos(bob_freq * w))
        pitch = pitch_amp * math.sin(w)
        rot["pelvis"] = (-pitch, 0, 0)
        rot["spine1"] = (pitch * 0.5, 0, 0)
        rot["spine2"] = (pitch * 0.6, 0, 0)
        nod = neck_amp * math.sin(neck_freq * w + 0.6)
        rot["neck1"] = (nod * 0.5 - pitch * 0.4, 0, 0)
        rot["neck2"] = (nod * 0.3, 0, 0)
        rot["head"] = (-nod * 0.4, 0, 0)
        rot["tail1"] = (0.15 + 0.08 * math.sin(w), 0, 0.05 * math.sin(w))
        rot["tail2"] = (0.05 * math.sin(w + 0.6), 0, 0.06 * math.sin(w + 0.6))
        rot["tail3"] = (0.0, 0, 0.07 * math.sin(w + 1.2))
        _key(rig, f + 1, rot, (0, 0, z))
    _finish(act, frames)
    return act


def author_idle(rig, seconds=6.0):
    act = _action(rig, "Idle")
    frames = int(round(seconds * FPS))
    for f in range(frames + 1):
        t = f / frames
        w = 2 * math.pi * t
        rot = {}
        # Resting a hind leg: the off hind cocked, hip dropped a touch.
        rot["femur.R"] = (-0.04, 0, 0)
        rot["cannon_h.R"] = (-0.18, 0, 0)
        rot["pastern_h.R"] = (0.35, 0, 0)
        rot["pelvis"] = (0, 0.02, 0)
        breath = 0.01 * math.sin(3 * w)
        rot["spine2"] = (breath, 0, 0)
        look = 0.12 * math.sin(w + 0.4)
        rot["neck1"] = (0.10 + 0.05 * math.sin(w), 0, look * 0.4)
        rot["neck2"] = (0.04, 0, look * 0.4)
        rot["head"] = (0.05 * math.sin(2 * w), 0, look * 0.3)
        flick = math.exp(-((t * 6.0) % 1.0) * 9.0)
        rot["ear.L"] = (0.2 * flick, 0, 0.1)
        rot["ear.R"] = (0.0, 0, -0.25 * math.exp(-((t * 6.0 + 0.5) % 1.0) * 9.0))
        swish = math.sin(2 * w) * math.exp(-((t * 2.0) % 1.0) * 3.0)
        rot["tail1"] = (0.1, 0, 0.25 * swish)
        rot["tail2"] = (0.0, 0, 0.3 * swish)
        rot["tail3"] = (0.0, 0, 0.3 * swish)
        _key(rig, f + 1, rot, (0, 0, -0.005 * (1 + math.sin(3 * w))))
    _finish(act, frames)
    return act


def author_all(rig):
    author_idle(rig)
    # Four-beat walk: LH, LF, RH, RF a quarter apart.
    author_gait(rig, "Walk", 1.05, {"HL": 0.0, "FL": 0.25, "HR": 0.5, "FR": 0.75}, stance=0.62, reach=0.26, flex=0.55,
                bob=0.02, bob_freq=2, neck_amp=0.06, neck_freq=2)
    # Trot: diagonal pairs together.
    author_gait(rig, "Trot", 0.70, {"FL": 0.0, "HR": 0.0, "FR": 0.5, "HL": 0.5}, stance=0.42, reach=0.36, flex=1.0,
                bob=0.05, bob_freq=2, neck_amp=0.03, neck_freq=2)
    # Transverse gallop on the left lead: HR, HL, FR, FL, then suspension.
    author_gait(rig, "Gallop", 0.52, {"HR": 0.0, "HL": 0.12, "FR": 0.36, "FL": 0.46}, stance=0.30, reach=0.52, flex=1.35,
                bob=0.08, bob_freq=1, neck_amp=0.12, neck_freq=1, pitch_amp=0.07)
    rig.animation_data.action = None
