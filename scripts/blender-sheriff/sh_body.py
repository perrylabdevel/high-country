"""Clothed body: shirt torso, vest, trousers, sleeves, boots, hands.

Blender space, metres, Z up, character faces -Y (glTF export turns this into
+Z forward, matching player.glb). The character's left is +X.

Every piece is a closed lofted volume. They are unioned by voxel remesh in the
assembly stage, and each remeshed face takes its material from the nearest
source piece, so overlapping layers (vest over shirt) resolve by proximity.
"""

import math

import numpy as np

import sh_spec as S
from sh_common import (
    catmull, gauss, loft_rings, mesh_object, mirror_x, flip_faces, resample_polyline,
    smoothstep, tube,
)

# Joint landmarks for the LEFT side (+X); the right side mirrors X.
SKEL = {
    "root": (0.0, 0.0, 0.0),
    "hips": (0.0, 0.01, 0.96),
    "spine": (0.0, 0.015, 1.08),
    "chest": (0.0, 0.02, 1.26),
    "upper_chest": (0.0, 0.02, 1.40),
    "neck": (0.0, 0.01, 1.515),
    "head": (0.0, -0.005, 1.60),
    "head_end": (0.0, -0.005, 1.80),
    "shoulder": (0.035, 0.0, 1.45),
    "upper_arm": (0.185, 0.012, 1.445),
    "forearm": (0.330, 0.030, 1.185),
    "hand": (0.452, 0.000, 0.968),
    "hand_end": (0.505, -0.012, 0.878),
    "thigh": (0.094, 0.005, 0.940),
    "shin": (0.108, -0.010, 0.515),
    "foot": (0.120, 0.012, 0.092),
    "toe": (0.128, -0.105, 0.030),
    "toe_end": (0.134, -0.200, 0.028),
}

LEFT_SUFFIX = {"shoulder", "upper_arm", "forearm", "hand", "hand_end", "thigh", "shin", "foot", "toe", "toe_end"}


def joint(name, side="L"):
    p = np.array(SKEL[name], dtype=float)
    if side == "R" and name in LEFT_SUFFIX:
        p[0] *= -1
    return p


# --------------------------------------------------------------------------
# Torso profile tables: z, half-width, front depth, back depth, centre y.

SHIRT_KEYS = [
    (0.980, 0.158, 0.104, 0.110, 0.012),
    (1.060, 0.156, 0.112, 0.101, 0.014),
    (1.140, 0.160, 0.119, 0.099, 0.016),
    (1.220, 0.168, 0.121, 0.103, 0.018),
    (1.300, 0.177, 0.119, 0.109, 0.020),
    (1.370, 0.186, 0.112, 0.112, 0.020),
    (1.430, 0.192, 0.099, 0.106, 0.018),
    (1.475, 0.178, 0.082, 0.090, 0.016),
    (1.510, 0.138, 0.067, 0.075, 0.014),
    (1.540, 0.086, 0.059, 0.064, 0.012),
    (1.575, 0.064, 0.056, 0.060, 0.010),
]

PANTS_KEYS = [
    (0.830, 0.085, 0.060, 0.070, 0.010),
    (0.880, 0.150, 0.098, 0.108, 0.010),
    (0.940, 0.176, 0.110, 0.114, 0.010),
    (1.000, 0.174, 0.113, 0.114, 0.012),
    (1.050, 0.169, 0.119, 0.110, 0.013),
    (1.085, 0.170, 0.122, 0.108, 0.014),
]


BASE_SHIRT = [tuple(k) for k in SHIRT_KEYS]
BASE_PANTS = [tuple(k) for k in PANTS_KEYS]


def apply_shape():
    """Rewrite the torso tables in place from the current spec."""
    sp = S.SPEC
    fem = S.female()
    shirt = []
    for z, W, F, B, cy in BASE_SHIRT:
        g = lambda mu, sig: math.exp(-((z - mu) / sig) ** 2)
        W2 = W + sp["waist"] * g(1.10, 0.08) + (sp["hips"] * g(0.98, 0.06) if fem else 0.0)
        F2 = F + sp["belly"] * g(1.13, 0.09) + sp["chest"] * g(1.34, 0.07)
        B2 = B
        if fem:
            if z >= 1.40:
                W2 *= 0.93
            if z >= 1.53:
                W2 *= 0.88
                F2 *= 0.92
                B2 *= 0.92
            W2 -= 0.012 * g(1.12, 0.07)
            F2 -= 0.012 * g(1.14, 0.07)
        shirt.append((z, W2, F2, B2, cy))
    pants = []
    for z, W, F, B, cy in BASE_PANTS:
        g = lambda mu, sig: math.exp(-((z - mu) / sig) ** 2)
        pants.append((z, W + sp["hips"] * g(0.95, 0.08), F + sp["belly"] * 0.7 * g(1.07, 0.05), B, cy))
    SHIRT_KEYS[:] = shirt
    PANTS_KEYS[:] = pants


class Profile:
    def __init__(self, keys, samples=400):
        dense = catmull(np.array(keys), samples)
        order = np.argsort(dense[:, 0])
        self.table = dense[order]

    def at(self, z):
        t = self.table
        return tuple(np.interp(z, t[:, 0], t[:, k]) for k in range(1, 5))


def torso_point(profile, z, a, extra=0.0, exponent=2.35):
    """Point on a superelliptic torso ring. a=0 front (-Y), a=pi/2 left (+X)."""
    W, F, B, cy = profile.at(z)
    c, s = np.cos(a), np.sin(a)
    e = 2.0 / exponent
    x = (W + extra) * np.sign(s) * np.abs(s) ** e
    depth = np.where(c >= 0, F + extra, B + extra)
    y = cy - np.sign(c) * depth * np.abs(c) ** e
    return np.stack([x, y, np.broadcast_to(z, np.shape(x))], axis=-1)


def torso_bumps(a, z, kind):
    """Anatomical/garment offsets (metres, outward)."""
    x = np.sin(a)
    front = np.clip(np.cos(a), 0, 1)
    back = np.clip(-np.cos(a), 0, 1)
    off = 0.0
    if kind == "shirt" and S.female():
        off = off + 0.024 * front * gauss(np.abs(x), 0.40, 0.20) * gauss(z, 1.325, 0.048)  # bust
    elif kind == "shirt":
        off = off + 0.007 * front * gauss(np.abs(x), 0.42, 0.25) * gauss(z, 1.35, 0.045)  # pectorals
    if kind == "shirt":
        off = off + 0.008 * back * gauss(np.abs(x), 0.45, 0.22) * gauss(z, 1.37, 0.06)  # scapulae
        off = off - 0.005 * back * gauss(x, 0.0, 0.08) * gauss(z, 1.25, 0.15)  # spine groove
        off = off + 0.010 * front * gauss(x, 0.0, 0.55) * gauss(z, 1.13, 0.06)  # belly
        off = off + 0.005 * back * gauss(np.abs(x), 0.25, 0.3) * gauss(z, 1.50, 0.03)  # trapezius
    if kind == "pants":
        off = off + 0.003 * back * gauss(np.abs(x), 0.42, 0.28) * gauss(z, 0.93, 0.045)  # glutes
        off = off - 0.010 * back * gauss(x, 0.0, 0.07) * smoothstep(1.0, 0.86, z)  # cleft
        off = off + 0.004 * front * gauss(x, 0.0, 0.3) * gauss(z, 0.87, 0.02)  # fly
    return off


def torso_mesh(name, keys, z0, z1, rows, segs, kind, extra=0.0):
    prof = Profile(keys)
    zs = np.linspace(z0, z1, rows)
    ang = np.linspace(0, 2 * math.pi, segs, endpoint=False)
    rings = []
    for z in zs:
        rings.append(torso_point(prof, z, ang, extra + torso_bumps(ang, z, kind)))
    verts, faces = loft_rings(rings)
    return mesh_object(name, verts, faces)


# --------------------------------------------------------------------------
# Limbs


def limb_centres(points, samples):
    pts, _length = resample_polyline(points, samples)
    return pts


def interp_radii(keys, samples):
    """keys: list of (t, rx, ry) with t in [0, 1] along the limb."""
    k = np.array(keys, dtype=float)
    dense = catmull(k, samples * 4)
    order = np.argsort(dense[:, 0])
    d = dense[order]
    t = np.linspace(0, 1, samples)
    return np.interp(t, d[:, 0], d[:, 1]), np.interp(t, d[:, 0], d[:, 2])


def leg_mesh(name, side):
    top = joint("thigh", side) + np.array([0.0, 0.0, 0.05])
    knee = joint("shin", side)
    ankle = joint("foot", side)
    shin_dir = (ankle - knee) / np.linalg.norm(ankle - knee)
    over = S.SPEC["boots"]["style"] != "western"
    # Tucked inside a tall shaft, or hanging over a short boot/shoe.
    end = knee + shin_dir * (0.37 if over else 0.21)
    n = 120
    centres = limb_centres([top, joint("thigh", side), knee, end], n)
    rx, ry = interp_radii([
        (0.00, 0.102, 0.110),
        (0.10, 0.101, 0.108),
        (0.30, 0.093, 0.099),
        (0.50, 0.083, 0.087),
        (0.64, 0.075, 0.078),
        (0.72, 0.071, 0.074),
        (0.80, 0.066, 0.070),
        (0.88, 0.052, 0.056) if not over else (0.88, 0.062, 0.066),
        (1.00, 0.046, 0.050) if not over else (1.00, 0.062, 0.068),
    ], n)

    def profile(k, ang):
        t = k / (n - 1)
        # Kneecap and a slight hamstring flatten.
        front = np.clip(np.cos(ang), 0, 1)
        return 1.0 + 0.06 * front ** 3 * gauss(t, 0.70, 0.03) - 0.03 * np.clip(-np.cos(ang), 0, 1) * gauss(t, 0.7, 0.05)

    verts, faces = tube(centres, rx, ry, segments=110, exponent=2.1, profile=profile)
    return mesh_object(name, verts, faces)


def arm_mesh(name, side, rolled=None):
    """Sleeve tube. rolled: sleeve ends (and bunches) at this fraction of the arm."""
    sh = joint("upper_arm", side)
    el = joint("forearm", side)
    wr = joint("hand", side)
    inner = sh + np.array([-0.07 if side == "L" else 0.07, 0.0, 0.02])
    d_fore = (wr - el) / np.linalg.norm(wr - el)
    cuff_end = wr + d_fore * 0.012
    n = 120
    centres = limb_centres([inner, sh, el, wr, cuff_end], n)
    rx, ry = interp_radii([
        (0.00, 0.072, 0.076),
        (0.10, 0.069, 0.073),
        (0.20, 0.064, 0.065),
        (0.32, 0.057, 0.056),
        (0.45, 0.051, 0.050),
        (0.52, 0.049, 0.051),
        (0.62, 0.050, 0.047),
        (0.80, 0.043, 0.039),
        (0.93, 0.036, 0.031),
        (0.95, 0.039, 0.034),
        (1.00, 0.039, 0.034),
    ], n)

    def profile(k, ang):
        t = k / (n - 1)
        if rolled is not None:
            # Rolled cuff: a thick band of turned-back fabric, then nothing.
            return 1.0 + 0.16 * gauss(t, rolled - 0.03, 0.035)
        # Arm garter bunching above the elbow and a cuff lip at the wrist.
        return 1.0 + 0.05 * gauss(t, 0.36, 0.012) + 0.03 * gauss(t, 0.40, 0.03)

    if rolled is not None:
        keep = int(n * rolled)
        centres, rx, ry = centres[:keep], rx[:keep], ry[:keep]
    verts, faces = tube(centres, rx, ry, segments=96, exponent=2.0, profile=profile, front_ref=(0, -1, 0))
    return mesh_object(name, verts, faces)


# --------------------------------------------------------------------------
# Boots


def forearm_skin_mesh(name, side, start=0.56):
    """Bare forearm below a rolled sleeve, into the wrist."""
    el = joint("forearm", side)
    wr = joint("hand", side)
    sh = joint("upper_arm", side)
    pts, _ = resample_polyline([sh, el, wr + (wr - el) / np.linalg.norm(wr - el) * 0.02], 120)
    k0 = int(120 * (start - 0.04))
    centres = pts[k0:]
    m = len(centres)
    t = np.linspace(0, 1, m)
    rx = 0.041 - 0.013 * t ** 1.2
    ry = 0.037 - 0.013 * t ** 1.2
    def profile(k, ang):
        tt = k / max(m - 1, 1)
        # Forearm muscle mass near the elbow, flatter wrist.
        return 1.0 + 0.08 * gauss(tt, 0.2, 0.18) * np.clip(np.cos(ang + 0.6), 0, 1)
    v, f = tube(centres, rx, ry, segments=64, profile=profile, front_ref=(0, -1, 0))
    return mesh_object(name, v, f)


def boot_mesh(name, side):
    sign = 1 if side == "L" else -1
    style = S.SPEC["boots"]["style"]
    knee = joint("shin", side)
    ankle = joint("foot", side)
    shin_dir = (ankle - knee) / np.linalg.norm(ankle - knee)
    top = knee + shin_dir * {"western": 0.075, "work": 0.25, "shoe": 0.36}[style]
    n = 70
    centres = limb_centres([top, ankle + np.array([0, 0.01, 0.03])], n)
    rx, ry = interp_radii([
        (0.00, 0.068, 0.074),
        (0.06, 0.064, 0.069),
        (0.30, 0.058, 0.062),
        (0.60, 0.049, 0.053),
        (0.85, 0.044, 0.051),
        (1.00, 0.045, 0.058),
    ], n)
    if style != "western":
        # Short shafts hug the ankle.
        tt = np.linspace(0, 1, n)
        rx = 0.047 + 0.004 * (1 - tt) + (0.045 - 0.047) * tt
        ry = 0.050 + 0.008 * tt
    verts, faces = tube(centres, rx, ry, segments=96, exponent=2.0, caps=True)
    verts = np.array(verts)
    segs = 96
    ang = np.linspace(0, 2 * math.pi, segs, endpoint=False)
    if style == "western":
        # Scalloped western top: higher at front and back, dipped at the sides.
        for r in range(4):
            w = (4 - r) / 4
            verts[r * segs:(r + 1) * segs, 2] += w * 0.022 * np.cos(2 * ang) ** 2 - w * 0.004

    # Foot: rings along the foot axis (forward -Y, toes angled out).
    splay = math.radians(7) * sign
    fwd = np.array([math.sin(splay), -math.cos(splay), 0.0])
    side_ax = np.array([math.cos(splay), math.sin(splay), 0.0])
    base = np.array([ankle[0], ankle[1], 0.0])
    # (along, half-width, sole z, top z)
    keys = np.array([
        (-0.090, 0.018, 0.040, 0.060),
        (-0.080, 0.033, 0.038, 0.085),
        (-0.050, 0.041, 0.037, 0.120),
        (0.000, 0.045, 0.036, 0.118),
        (0.050, 0.049, 0.026, 0.092),
        (0.100, 0.052, 0.014, 0.068),
        (0.150, 0.050, 0.011, 0.057),
        (0.200, 0.039, 0.011, 0.047),
        (0.240, 0.020, 0.013, 0.037),
        (0.258, 0.006, 0.018, 0.030),
    ])
    if style != "western":
        # Lower heel, rounder working toe.
        keys[:, 2] = np.where(keys[:, 0] <= 0.02, keys[:, 2] - 0.012, keys[:, 2])
        keys[:, 3] = np.where(keys[:, 0] <= 0.02, keys[:, 3] - 0.008, keys[:, 3])
        keys[-3:, 1] = [0.046, 0.034, 0.016]
        keys[-3:, 3] += 0.008
    rows = catmull(keys, 90)
    segs_f = 96
    rings = []
    for along, hw, zb, zt in rows:
        a = np.linspace(0, 2 * math.pi, segs_f, endpoint=False)
        c, s = np.cos(a), np.sin(a)
        # Flat-ish sole, domed top.
        e = 2.0 / 2.6
        lat = np.sign(s) * np.abs(s) ** e * max(hw, 0.002)
        up = np.where(c >= 0, zt, zb)
        mid = 0.5 * (zt + zb)
        vz = mid + np.sign(c) * np.abs(c) ** (2.0 / np.where(c >= 0, 2.2, 5.0)) * np.where(c >= 0, zt - mid, mid - zb)
        pts = base + np.outer(np.full(segs_f, along), fwd) + np.outer(lat, side_ax)
        pts[:, 2] = vz
        rings.append(pts)
    fv, ff = loft_rings(rings)
    # Riding heel block.
    heel = []
    hz0, hz1 = 0.0, (0.037 if style == "western" else 0.024)
    for zc, grow in ((hz0, 0.0), (hz1, 0.006)):
        for along, lat in ((-0.088, -0.028), (-0.088, 0.028), (-0.030 + grow, 0.032), (-0.030 + grow, -0.032)):
            p = base + fwd * along + side_ax * (lat * (1 + grow * 8))
            p[2] = zc
            heel.append(p)
    hf = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    # Welt/sole plate, slightly proud of the upper.
    sole_rows = catmull(np.array([
        (-0.030, 0.043), (0.000, 0.047), (0.050, 0.053), (0.100, 0.057), (0.150, 0.055), (0.200, 0.044),
        (0.240, 0.025), (0.262, 0.008),
    ]), 40)
    sole = []
    for along, hw in sole_rows:
        for zc in (0.008, 0.020):
            for lat in (-hw, hw):
                p = base + fwd * along + side_ax * lat
                p[2] = zc
                sole.append(p)
    sf = []
    R = len(sole_rows)
    for r in range(R - 1):
        a0 = r * 4
        b0 = (r + 1) * 4
        # order within a row: (z0,-), (z0,+), (z1,-), (z1,+)
        sf += [(a0 + 0, a0 + 1, b0 + 1, b0 + 0), (a0 + 2, b0 + 2, b0 + 3, a0 + 3),
               (a0 + 1, a0 + 3, b0 + 3, b0 + 1), (a0 + 0, b0 + 0, b0 + 2, a0 + 2)]
    sf += [(0, 2, 3, 1), ((R - 1) * 4, (R - 1) * 4 + 1, (R - 1) * 4 + 3, (R - 1) * 4 + 2)]

    all_v = list(verts)
    all_f = list(faces)
    for vv, ffs in ((fv, ff), (heel, hf), (sole, sf)):
        off = len(all_v)
        all_v += [tuple(v) for v in vv]
        all_f += [tuple(i + off for i in f) for f in ffs]
    return mesh_object(name, all_v, all_f)


# --------------------------------------------------------------------------
# Hands


FINGERS = {
    # name: (base v offset, lengths of 3 phalanges, base radius, splay deg)
    "index": (0.028, (0.046, 0.027, 0.022), 0.0098, 4),
    "middle": (0.009, (0.051, 0.031, 0.024), 0.0102, 0),
    "ring": (-0.010, (0.047, 0.029, 0.023), 0.0096, -4),
    "pinky": (-0.028, (0.037, 0.022, 0.020), 0.0086, -9),
}
FINGER_CURL = (math.radians(18), math.radians(26), math.radians(14))


def hand_frame(side):
    """Orthonormal hand frame: u along fingers, v toward thumb, w back of hand."""
    wr = joint("hand", side)
    end = joint("hand_end", side)
    u = (end - wr) / np.linalg.norm(end - wr)
    # Palm faces the thigh; thumb points forward (-Y).
    v = np.array([0.0, -1.0, 0.0])
    v = v - u * np.dot(v, u)
    v /= np.linalg.norm(v)
    w = np.cross(u, v)
    outward = np.array([1.0 if side == "L" else -1.0, 0, 0])
    if np.dot(w, outward) < 0:
        w = -w
    return wr, u, v, w


def finger_chain(origin, u, v, w, lengths, splay, curl):
    """Returns joint positions for a finger, bending toward the palm (-w)."""
    d = u * math.cos(math.radians(splay)) + v * math.sin(math.radians(splay))
    d /= np.linalg.norm(d)
    pts = [origin]
    ang = 0.0
    for L, c in zip(lengths, curl):
        ang += c
        dir_k = d * math.cos(ang) - w * math.sin(ang)
        pts.append(pts[-1] + dir_k * L)
    return np.array(pts)


def hand_layout(side):
    wr, u, v, w = hand_frame(side)
    layout = {}
    palm_len = 0.095
    for name, (voff, lengths, _r, splay) in FINGERS.items():
        knuckle_len = palm_len - 0.012 * abs(voff) / 0.028 - (0.006 if name == "pinky" else 0.0)
        base = wr + u * knuckle_len + v * voff + w * 0.002
        layout[name] = finger_chain(base, u, v, w, lengths, splay, FINGER_CURL)
    # Thumb: from the wrist's thumb side, angled across the palm.
    t_base = wr + u * 0.022 + v * 0.030 - w * 0.008
    t_dir = u * 0.55 + v * 0.62 - w * 0.55
    t_dir /= np.linalg.norm(t_dir)
    pts = [t_base]
    bend = [0.0, math.radians(20), math.radians(22)]
    lens = [0.046, 0.034, 0.028]
    d = t_dir
    for L, b in zip(lens, bend):
        d = d * math.cos(b) - w * math.sin(b) * 0.4 + u * math.sin(b) * 0.3
        d /= np.linalg.norm(d)
        pts.append(pts[-1] + d * L)
    layout["thumb"] = np.array(pts)
    return layout, (wr, u, v, w)


def hand_mesh(name, side):
    layout, (wr, u, v, w) = hand_layout(side)
    parts_v, parts_f = [], []

    def add(vs, fs):
        off = len(parts_v)
        parts_v.extend([tuple(x) for x in vs])
        parts_f.extend([tuple(i + off for i in f) for f in fs])

    # Palm: rows along u, superelliptic cross-section in (v, w).
    rows = catmull(np.array([
        # t along u, half-width (v), half-thickness (w), centre v shift, centre w shift
        (-0.030, 0.026, 0.021, 0.000, 0.000),
        (0.000, 0.030, 0.019, 0.002, 0.000),
        (0.030, 0.040, 0.017, 0.004, 0.000),
        (0.060, 0.045, 0.016, 0.001, 0.001),
        (0.085, 0.046, 0.014, 0.000, 0.002),
        (0.100, 0.042, 0.012, 0.000, 0.002),
    ]), 40)
    rings = []
    segs = 32
    a = np.linspace(0, 2 * math.pi, segs, endpoint=False)
    for t, hw, ht, cv, cw in rows:
        c, s = np.cos(a), np.sin(a)
        e = 2.0 / 3.0
        pv = cv + np.sign(c) * np.abs(c) ** e * hw
        pw = cw + np.sign(s) * np.abs(s) ** e * ht
        # Thenar pad bulge on the palm side toward the thumb.
        pw = pw - 0.006 * np.clip(-np.sin(a), 0, 1) * np.clip(np.cos(a), 0, 1) * gauss(t, 0.03, 0.03)
        rings.append(wr + np.outer(np.full(segs, t), u) + np.outer(pv, v) + np.outer(pw, w))
    add(*loft_rings(rings))

    for finger, pts in layout.items():
        if finger == "thumb":
            radii = [0.0125, 0.0112, 0.0098, 0.0085]
        else:
            r0 = FINGERS[finger][2]
            radii = [r0, r0 * 0.93, r0 * 0.85, r0 * 0.74]
        n = 36
        centres, _ = resample_polyline(pts, n)
        seg_len = np.linalg.norm(np.diff(pts, axis=0), axis=1)
        cum = np.concatenate([[0], np.cumsum(seg_len)]) / seg_len.sum()
        tt = np.linspace(0, 1, n)
        base_r = np.interp(tt, cum, radii)
        # Knuckle swelling at the joints, tapered rounded tip.
        swell = sum(0.10 * gauss(tt, c, 0.035) for c in cum[1:-1])
        tip = np.sqrt(np.clip(1 - ((tt - 0.90) / 0.10).clip(0, 1) ** 2, 0.05, 1))
        r = base_r * (1 + swell) * tip
        vv, ff = tube(centres, r, r * 0.92, segments=16, exponent=2.0, front_ref=tuple(w))
        add(vv, ff)
    return mesh_object(name, parts_v, parts_f)


# --------------------------------------------------------------------------
# Vest (open shell, solidified in assembly)


def _strip(prof, a_values, bottoms, tops, rows, extra):
    cols = len(a_values)
    verts = []
    for a, zb, zt in zip(a_values, bottoms, tops):
        for z in np.linspace(zb, zt, rows):
            aa = np.array([a])
            verts.append(torso_point(prof, z, aa, extra + torso_bumps(aa, z, "shirt"))[0])
    faces = []
    for c in range(cols - 1):
        for r in range(rows - 1):
            k = c * rows + r
            faces.append((k, k + rows, k + rows + 1, k + 1))
    return verts, faces


def vest_mesh(name, extra=0.009):
    """Western vest: pointed front hem, V neckline, deep armholes, shoulder straps.

    Built as two column-parameterised strips (main panel and the strap over the
    shoulder) so the armhole is a real hole. s = |angle|/pi: 0 front, 1 back.
    """
    prof = Profile(SHIRT_KEYS)
    cols = 260
    ang = np.linspace(-math.pi, math.pi, cols)
    s = np.abs(ang) / math.pi
    bottom = np.interp(s, [0.0, 0.035, 0.075, 0.14, 0.30, 0.5, 1.0],
                          [1.040, 1.022, 0.998, 1.030, 1.052, 1.062, 1.072])
    top = np.interp(s, [0.0, 0.10, 0.15, 0.22, 0.28, 0.33, 0.50, 0.66, 0.72, 0.78, 1.0],
                       [1.245, 1.420, 1.500, 1.495, 1.420, 1.345, 1.330, 1.350, 1.470, 1.520, 1.530])
    v1, f1 = _strip(prof, ang, bottom, top, 120, extra)
    # Shoulder strap strip, one per side, overlapping the panel tops.
    verts, faces = list(v1), list(f1)
    for sign in (-1, 1):
        sa = np.linspace(0.19, 0.76, 90)
        a_vals = sign * sa * math.pi
        lo = np.interp(sa, [0.19, 0.28, 0.45, 0.66, 0.76], [1.470, 1.478, 1.488, 1.478, 1.490])
        hi = np.interp(sa, [0.19, 0.45, 0.76], [1.512, 1.522, 1.528])
        v2, f2 = _strip(prof, a_vals, lo, hi, 24, extra + 0.003)
        off = len(verts)
        verts += v2
        faces += [tuple(i + off for i in f) for f in f2]
    return mesh_object(name, verts, faces)
