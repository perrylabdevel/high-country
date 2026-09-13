"""Character spec: one dict drives shape, face, wardrobe, palette and motion.

Construction happens in the canonical sheriff space (sh_body.SKEL). Shape
keys (torso/head profile tables) are rewritten in place for build and face
variety; overall proportions (height, limb ratios, child head size) are a
smooth space warp applied to every finished high-poly mesh and to the rig
landmarks, so garments, gear and bones stay registered.
"""

import copy
import math

import numpy as np

DEFAULT = {
    "id": "sheriff",
    "sex": "m",
    "age": 50,
    # Proportions (warp).
    "crown": 1.807,        # top of head, metres, before the hat
    "leg": 1.0,            # crotch height multiplier relative to height
    "head": 1.0,           # head size multiplier
    "shoulders": 1.0,      # lateral scale at the shoulders (arms translate)
    "width": 1.0,          # overall lateral/depth scale of the trunk and limbs
    # Shape (canonical keys).
    "belly": 0.0,          # extra front depth at the waist, metres
    "chest": 0.0,          # chest/bust depth, metres
    "waist": 0.0,          # waist half-width delta, metres
    "hips": 0.0,           # hip half-width delta, metres
    "face": {},            # multipliers for sh_head.face_offsets features
    "jaw": 1.0,            # lower face width
    "skin": (142, 108, 92),
    "eye": "grey",
    "hair": {"style": "short", "color": (58, 50, 44), "grey": 0.45},
    "facial": {"style": "walrus"},   # walrus, chevron, beard, stubble, none
    "hat": {"style": "cattleman", "color": (74, 60, 48), "band": (30, 24, 20)},
    "top": {"style": "shirt", "color": (142, 120, 92), "sleeves": "long"},
    "vest": {"color": (48, 36, 28), "pinstripe": True},
    "bottom": {"style": "trousers", "color": (72, 58, 44)},
    "boots": {"style": "western", "color": (66, 40, 24)},
    "coat": None,          # {"style": "sack"|"duster", "color": ...}
    "apron": None,         # {"color":..., "leather": bool, "bib": bool}
    "shawl": None,
    "suspenders": None,
    "bandana": {"color": (112, 36, 30)},
    "gunbelt": True,
    "badge": True,
    "chain": True,
    "spurs": True,
    "props": [],           # spectacles, pipe, satchel, rope
    "walk": {"period": 0.92, "step": 0.58, "arm_swing": 16},
    "seed": 1877,
    "out": "/Users/brian/Projects/high-country/public/models/sheriff.glb",
}

SPEC = copy.deepcopy(DEFAULT)

CANON = {"crotch": 0.83, "shoulder": 1.47, "chin": 1.575, "crown": 1.807}


def set_spec(overrides):
    """Reset SPEC to defaults merged with overrides (one level deep for dicts)."""
    SPEC.clear()
    SPEC.update(copy.deepcopy(DEFAULT))
    for k, v in overrides.items():
        if isinstance(v, dict) and isinstance(DEFAULT.get(k), dict):
            merged = copy.deepcopy(DEFAULT[k])
            merged.update(v)
            SPEC[k] = merged
        else:
            SPEC[k] = copy.deepcopy(v)
    return SPEC


def female():
    return SPEC["sex"] == "f"


# --------------------------------------------------------------------------
# Proportion warp (canonical -> character)


def _z_knots():
    s = SPEC["crown"] / CANON["crown"]
    head_h = (CANON["crown"] - CANON["chin"]) * s * SPEC["head"]
    neck_h = (CANON["chin"] - CANON["shoulder"]) * s * (0.9 + 0.1 * SPEC["head"])
    crotch = CANON["crotch"] * s * SPEC["leg"]
    crown = SPEC["crown"]
    chin = crown - head_h
    shoulder = chin - neck_h
    src = np.array([0.0, CANON["crotch"], CANON["shoulder"], CANON["chin"], CANON["crown"], 3.0])
    dst = np.array([0.0, crotch, shoulder, chin, crown, crown + (3.0 - CANON["crown"]) * s * SPEC["head"]])
    return src, dst


def warp(points):
    """Map canonical points (N,3) into the character's proportions."""
    p = np.asarray(points, dtype=float)
    out = p.copy()
    src, dst = _z_knots()
    z = p[:, 2]
    s = SPEC["crown"] / CANON["crown"]
    # Piecewise-linear height remap with softened knees at each knot.
    zz = np.interp(z, src, dst)
    out[:, 2] = zz

    # Head zone: uniform scale about the chin centre so hat/face keep shape.
    head_w = np.clip((z - (CANON["chin"] - 0.03)) / 0.06, 0, 1)
    chin_src = CANON["chin"]
    chin_dst = np.interp(chin_src, src, dst)
    hs = s * SPEC["head"]
    head_xy = p[:, :2] * hs
    head_z = chin_dst + (z - chin_src) * hs

    # Trunk and limbs: lateral/depth scale; arms translate with the shoulders.
    w = s * SPEC["width"]
    ax = np.abs(p[:, 0])
    arm = np.clip((ax - 0.15) / 0.06, 0, 1) * np.clip((z - 0.80) / 0.1, 0, 1) * (z < 1.52)
    shoulder_shift = (SPEC["shoulders"] - 1.0) * 0.185 * s
    body_x = p[:, 0] * w * (1 + (SPEC["shoulders"] - 1.0) * np.clip((z - 1.25) / 0.2, 0, 1) * (1 - arm))
    arm_x = np.sign(p[:, 0]) * (0.15 * w * SPEC["shoulders"] + (ax - 0.15) * s) + np.sign(p[:, 0]) * 0 * shoulder_shift
    x = body_x * (1 - arm) + arm_x * arm
    y = p[:, 1] * (w * (1 - arm) + s * arm)

    out[:, 0] = x * (1 - head_w) + head_xy[:, 0] * head_w
    out[:, 1] = y * (1 - head_w) + head_xy[:, 1] * head_w
    out[:, 2] = zz * (1 - head_w) + head_z * head_w
    return out


def warp_point(p):
    return warp(np.asarray(p, dtype=float)[None, :])[0]


def scale():
    return SPEC["crown"] / CANON["crown"]


# --------------------------------------------------------------------------
# Palette helpers


def srgb(c):
    return tuple(int(v) for v in c)


def shade(c, k):
    return tuple(int(max(0, min(255, v * k))) for v in c)
