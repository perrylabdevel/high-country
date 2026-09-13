"""Head, neck, eyes, ears, hair shell, brows and moustache.

The head is a stack of superelliptic rings (a=0 faces -Y) with anatomical
features displaced in face space. Resolution is ~1 mm so the voxel remesh in
assembly can hold lids, nostrils and lip lines.
"""

import math

import numpy as np

import sh_spec as S
from sh_common import catmull, gauss, loft_rings, mesh_object, resample_polyline, smoothstep, tube

# z, half-width, front depth, back depth, centre y, front exponent
HEAD_KEYS = [
    (1.566, 0.020, 0.082, 0.010, -0.004, 1.6),
    (1.574, 0.034, 0.093, 0.022, -0.004, 1.6),
    (1.586, 0.046, 0.098, 0.036, -0.004, 1.7),
    (1.600, 0.057, 0.098, 0.052, -0.004, 1.9),
    (1.620, 0.064, 0.097, 0.070, -0.004, 2.1),
    (1.640, 0.068, 0.094, 0.086, -0.004, 2.3),
    (1.660, 0.072, 0.092, 0.096, -0.004, 2.5),
    (1.680, 0.075, 0.091, 0.101, -0.004, 2.6),
    (1.700, 0.077, 0.096, 0.106, -0.004, 2.6),
    (1.720, 0.078, 0.096, 0.108, -0.004, 2.5),
    (1.745, 0.075, 0.090, 0.106, -0.004, 2.4),
    (1.770, 0.066, 0.078, 0.096, -0.002, 2.3),
    (1.790, 0.050, 0.060, 0.076, 0.000, 2.2),
    (1.802, 0.028, 0.034, 0.045, 0.002, 2.1),
    (1.807, 0.006, 0.008, 0.010, 0.002, 2.0),
]

EYE = {"x": 0.0325, "z": 1.692, "r": 0.0122}


FACE_TOP = 1.745


def face_k():
    """Vertical scale of the face below the brow: shorter for women and children."""
    if S.SPEC["age"] < 16:
        return 0.84
    return 0.88 if S.female() else 1.0


def zmap(z):
    k = face_k()
    z = np.asarray(z, dtype=float)
    return np.where(z < FACE_TOP, FACE_TOP - (FACE_TOP - z) * k, z)


def head_drop():
    """How far the whole head sits lower so a lifted chin doesn't bare the neck."""
    return float(zmap(1.566) - 1.566) * 0.75


def zunmap(z):
    k = face_k()
    z = np.asarray(z, dtype=float)
    return np.where(z < FACE_TOP, FACE_TOP - (FACE_TOP - z) / k, z)


class HeadProfile:
    def __init__(self):
        d = catmull(np.array(HEAD_KEYS), 600)
        self.t = d[np.argsort(d[:, 0])]

    def at(self, z):
        t = self.t
        return [np.interp(z, t[:, 0], t[:, k]) for k in range(1, 6)]


def nose_height(x, z):
    """Forward protrusion of the nose (metres) at face-space (x, z)."""
    ax = np.abs(x)
    t = np.clip((1.707 - z) / 0.055, 0, 1)
    ridge = 0.004 + 0.021 * t ** 1.25
    ridge = ridge + 0.004 * gauss(z, 1.656, 0.007)  # bulbous tip
    ridge = ridge + 0.0015 * gauss(z, 1.688, 0.006)  # dorsal hump (broken once)
    below = smoothstep(1.652, 1.640, z)  # columella falls back to the lip
    h = ridge * (1 - below) + 0.004 * below
    h = h * smoothstep(1.636, 1.644, z) * smoothstep(1.715, 1.703, z)
    width = 0.0065 + 0.0085 * t
    shape = np.exp(-(ax / width) ** 1.7)
    wings = 0.012 * gauss(ax, 0.0165, 0.0058) * gauss(z, 1.648, 0.0065)
    nostril = -0.004 * gauss(ax, 0.0085, 0.0035) * gauss(z, 1.6425, 0.0022)
    return h * shape + wings + nostril


FACE_FEMALE = {"nose": 0.58, "nose_w": 0.80, "brow": 0.15, "cheek": 1.35, "hollow": 0.0, "fold": 0.15,
               "lips": 1.15, "chin": 0.55, "orbit": 0.80, "lines": 0.0, "mouth_w": 0.82}
FACE_CHILD = {"nose": 0.50, "nose_w": 0.8, "brow": 0.15, "cheek": 1.45, "hollow": 0.0, "fold": 0.0,
              "lips": 1.05, "chin": 0.45, "orbit": 0.7, "lines": 0.0, "mouth_w": 0.86}


def face_params():
    base = {"nose": 1.0, "nose_w": 1.0, "brow": 1.0, "cheek": 1.0, "hollow": 1.0, "fold": 1.0,
            "lips": 1.0, "chin": 1.0, "orbit": 1.0, "lines": 1.0, "hump": 1.0, "eye_open": 1.0}
    if S.SPEC["age"] < 16:
        base.update(FACE_CHILD)
        base["eye_open"] = 1.25
    elif S.female():
        base.update(FACE_FEMALE)
        base["eye_open"] = 1.2
    else:
        age = S.SPEC["age"]
        base["lines"] = float(np.clip((age - 25) / 30, 0, 1.3))
        base["hollow"] = 0.4 + 0.6 * base["lines"]
        base["fold"] = 0.3 + 0.7 * base["lines"]
    base.update(S.SPEC.get("face", {}))
    return base


def face_offsets(x, z, eye_y=None):
    """Forward (-Y) displacement for front-facing head points."""
    P = face_params()
    ax = np.abs(x)
    nw = P["nose_w"]
    off = nose_height(x / nw, z) * P["nose"]
    # Brow ridge and glabella.
    off += 0.0055 * P["brow"] * gauss(z, 1.713, 0.008) * smoothstep(0.066, 0.03, ax)
    off += 0.0020 * P["brow"] * gauss(z, 1.705, 0.006) * gauss(ax, 0.0, 0.012)
    # Orbits.
    off -= 0.012 * P["orbit"] * gauss(ax, EYE["x"], 0.0165) * gauss(z, EYE["z"], 0.0125)
    # Cheekbones and cheek hollows (a lean older face).
    off += 0.0065 * P["cheek"] * gauss(ax, 0.050, 0.014) * gauss(z, 1.672, 0.012)
    off -= 0.0040 * P["hollow"] * gauss(ax, 0.050, 0.013) * gauss(z, 1.640, 0.014)
    # Nasolabial folds: a groove from nose wing to past the mouth corner.
    fold_x = 0.022 + (1.652 - z) * 0.33
    off -= 0.0022 * P["fold"] * gauss(ax, fold_x, 0.004) * gauss(z, 1.630, 0.018)
    off += 0.0018 * P["fold"] * gauss(ax, fold_x - 0.006, 0.005) * gauss(z, 1.632, 0.016)
    # Lips and mouth line.
    mw = P.get("mouth_w", 1.0)
    ax_m = ax / mw
    lip_w = smoothstep(0.029, 0.018, ax_m)
    off += 0.0038 * P["lips"] * gauss(z, 1.6285, 0.0035) * lip_w
    off -= 0.0035 * (0.6 if mw < 1 else 1.0) * gauss(z, 1.6220, 0.0012) * smoothstep(0.027, 0.020, ax_m)
    off += 0.0048 * P["lips"] * gauss(z, 1.6160, 0.0040) * smoothstep(0.026, 0.014, ax_m)
    off -= 0.0022 * gauss(z, 1.6300, 0.003) * gauss(ax, 0.0, 0.004)  # philtrum
    # Chin: mentolabial sulcus, square cleft chin.
    off -= 0.0040 * gauss(z, 1.6045, 0.0045) * smoothstep(0.03, 0.01, ax)
    off += 0.0070 * P["chin"] * gauss(z, 1.5895, 0.0105) * smoothstep(0.030, 0.012, ax)
    off -= 0.0012 * gauss(ax, 0.0, 0.003) * gauss(z, 1.586, 0.006)
    # Temples.
    off -= 0.0030 * gauss(ax, 0.068, 0.010) * gauss(z, 1.712, 0.016)
    # Forehead lines (baked detail reads better, but a whisper of form helps).
    for zz in (1.738, 1.748):
        off -= 0.0004 * P["lines"] * gauss(z, zz, 0.0012) * smoothstep(0.05, 0.02, ax)
    return off


def eye_carve(x, z):
    """Inward displacement opening the eye fissure plus lid structure."""
    lx = np.abs(x) - EYE["x"]
    lz = z - EYE["z"]
    sgn = np.sign(x)
    # Almond: outer corner (lx>0) a touch lower, heavy weathered upper lid.
    centre = -0.0008 * (lx / 0.012)
    half_w = 0.0118
    P = face_params()
    upper = 0.0037 * P["eye_open"] * np.clip(1 - (lx / half_w) ** 2, 0, 1) ** 0.8
    lower = 0.0031 * (1 + 0.5 * (P["eye_open"] - 1)) * np.clip(1 - (lx / half_w) ** 2, 0, 1) ** 0.9
    rel = lz - centre
    inside_v = np.where(rel >= 0, rel / np.maximum(upper, 1e-4), -rel / np.maximum(lower, 1e-4))
    m = np.maximum(inside_v, np.abs(lx) / half_w)
    carve = 0.022 * smoothstep(1.0, 0.84, m)
    # Upper lid crease and hooded fold; lower lid bag and tear trough.
    carve += 0.0016 * gauss(lz, 0.0080, 0.0018) * gauss(lx, 0.001, 0.010)
    carve -= 0.0010 * gauss(lz, 0.0055, 0.0020) * gauss(lx, 0.0, 0.011)
    carve -= 0.0012 * gauss(lz, -0.0065, 0.0022) * gauss(lx, -0.001, 0.010)
    carve += 0.0010 * gauss(lz, -0.0110, 0.0020) * gauss(lx, -0.002, 0.012)
    # Crow's feet squint lines at the outer corner.
    for k, zz in enumerate((-0.003, 0.0, 0.003)):
        carve += 0.00045 * P["lines"] * gauss(lz - (lx - 0.016) * (k - 1) * 0.35, zz, 0.0008) * gauss(lx, 0.019, 0.004)
    return carve * (sgn != 0)


def head_rings(rows=260, segs=220):
    prof = HeadProfile()
    zs = np.linspace(HEAD_KEYS[0][0], HEAD_KEYS[-1][0], rows)
    ang = np.linspace(0, 2 * math.pi, segs, endpoint=False)
    c, s = np.cos(ang), np.sin(ang)
    rings = []
    for z in zs:
        W, F, B, cy, ex = prof.at(z)
        jaw_k = S.SPEC["jaw"] * (0.84 if S.female() else (1.0 if S.SPEC["age"] < 16 else 1.0))
        W = W * (1 + (jaw_k - 1) * smoothstep(1.66, 1.60, z))
        ef = 2.0 / ex
        eb = 2.0 / 2.1
        x = W * np.sign(s) * np.where(c >= 0, np.abs(s) ** ef, np.abs(s) ** eb)
        y = cy - np.where(c >= 0, F * np.abs(c) ** ef, -B * np.abs(c) ** eb)
        # Jaw angle: widen the lower back of the face for a square jaw.
        jaw = 0.006 * jaw_k * (0.3 if S.female() or S.SPEC["age"] < 16 else 1.0) * gauss(z, 1.615, 0.02) * gauss(np.abs(s), 0.93, 0.12) * gauss(c, 0.1, 0.45)
        x = x + np.sign(s) * jaw
        rings.append(np.stack([x, y, np.full(segs, z)], axis=1))
    rings = np.array(rings)
    front = np.clip(-(rings[..., 1] + 0.004) / 0.06, 0, 1) ** 0.7
    off = face_offsets(rings[..., 0], rings[..., 2]) * front
    rings[..., 1] -= off
    carve = eye_carve(rings[..., 0], rings[..., 2]) * front
    rings[..., 1] += carve
    if face_k() < 1.0:
        # Shorter, rounder face: lift everything below the brow toward it and
        # fill out the cheeks.
        z0 = rings[..., 2].copy()
        rings[..., 2] = zmap(z0)
        round_k = 1.0 + (0.09 if S.SPEC["age"] < 16 else 0.035) * gauss(z0, 1.62, 0.06)
        rings[..., 0] *= round_k
    return rings


def head_mesh(name="hd_head"):
    rings = head_rings()
    verts, faces = loft_rings(rings)
    return mesh_object(name, verts, faces), rings


def surface_y(rings, x, z):
    """Front surface y of the head at (x, z) (nearest ring vertex)."""
    pts = rings.reshape(-1, 3)
    frontish = pts[:, 1] < -0.02
    p = pts[frontish]
    d = (p[:, 0] - x) ** 2 + (p[:, 2] - z) ** 2
    return float(p[np.argmin(d), 1])


def eyes_mesh(rings, name="hd_eyes"):
    """Eyeballs with a cornea bulge. Returns object and centres."""
    verts, faces = [], []
    centres = []
    for sgn in (1, -1):
        cx = sgn * EYE["x"]
        # Place the eye so its front sits 1.5 mm behind the lid rim surface.
        ez = float(zmap(EYE["z"]))
        rim_y = surface_y(rings, cx, float(zmap(EYE["z"] + 0.0055)))
        cy = rim_y + EYE["r"] + 0.0012
        centre = np.array([cx, cy, ez])
        centres.append(centre)
        nlat, nlon = 24, 32
        base = len(verts)
        for i in range(nlat + 1):
            th = math.pi * i / nlat
            for j in range(nlon):
                ph = 2 * math.pi * j / nlon
                d = np.array([math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)])
                # d.z here is the forward (-Y) axis of the eye.
                r = EYE["r"] * (1 + 0.09 * max(0.0, d[2] - 0.82) / 0.18)
                local = np.array([d[0], -d[2], d[1]]) * r
                verts.append(centre + local)
        for i in range(nlat):
            for j in range(nlon):
                a = base + i * nlon + j
                b = base + i * nlon + (j + 1) % nlon
                faces.append((a, b, b + nlon, a + nlon))
    return mesh_object(name, verts, faces), centres


def ear_mesh(name="hd_ears"):
    verts, faces = [], []
    for sgn in (1, -1):
        centre = np.array([sgn * 0.0765, 0.016, float(zmap(1.670))])
        nu, nv = 40, 28
        base = len(verts)
        for i in range(nu):
            u = 2 * math.pi * i / nu
            for j in range(nv + 1):
                v = math.pi * j / nv
                # Local: a = back/forward (y), b = up (z), c = outward (x).
                ra = math.sin(v) * math.cos(u)
                rb = math.sin(v) * math.sin(u)
                rc = math.cos(v)
                radial = math.hypot(ra, rb)
                a = ra * 0.017 * (1.0 + 0.15 * max(0.0, rb))
                b = rb * 0.031
                c = rc * 0.0075
                if rc > 0:
                    # Concha bowl and helix rim on the outer face.
                    c -= 0.0075 * math.exp(-((radial - 0.35) / 0.28) ** 2) * rc
                    c += 0.0025 * math.exp(-((radial - 0.88) / 0.08) ** 2)
                # Lobe hangs a little lower at the front.
                if rb < -0.5:
                    a -= 0.003 * (-rb - 0.5)
                local = np.array([sgn * (c + 0.004), a, b])
                # Tilt top toward the back and flare the rear edge out.
                tilt = math.radians(14)
                y2 = local[1] * math.cos(tilt) + local[2] * math.sin(tilt)
                z2 = -local[1] * math.sin(tilt) + local[2] * math.cos(tilt)
                flare = sgn * 0.22 * max(0.0, y2)
                verts.append(centre + np.array([local[0] + flare, y2, z2]))
        for i in range(nu):
            for j in range(nv):
                a = base + i * (nv + 1) + j
                b = base + ((i + 1) % nu) * (nv + 1) + j
                faces.append((a, b, b + 1, a + 1))
    return mesh_object(name, verts, faces)


def neck_mesh(name="hd_neck"):
    pts = np.array([(0.0, 0.016, 1.45), (0.0, 0.010, 1.55), (0.0, 0.004, 1.63)])
    centres, _ = resample_polyline(pts, 60)
    t = np.linspace(0, 1, 60)
    rx = 0.060 - 0.004 * t
    ry = 0.058 - 0.002 * t

    def profile(k, ang):
        tt = k / 59
        # Adam's apple and sternocleidomastoid ridges.
        return 1 + 0.10 * gauss(ang, 0.0, 0.25) * gauss(tt, 0.55, 0.08) + 0.04 * gauss(np.abs(np.sin(ang)), 0.75, 0.15) * np.clip(np.cos(ang), 0, 1)

    k = 0.80 if S.female() else (0.85 if S.SPEC["age"] < 16 else 1.0)
    v, f = tube(centres, rx * k, ry * k, segments=48, profile=profile)
    return mesh_object(name, v, f)


HAIRLINES = {
    # angle 0 front .. 1 back -> hairline z
    "short": ([0.0, 0.18, 0.30, 0.345, 0.365, 0.395, 0.42, 0.47, 0.58, 0.75, 1.0],
              [1.768, 1.755, 1.735, 1.700, 1.662, 1.662, 1.700, 1.714, 1.706, 1.642, 1.630]),
    "bun": ([0.0, 0.15, 0.28, 0.36, 0.42, 0.50, 0.70, 1.0],
            [1.735, 1.730, 1.712, 1.690, 1.705, 1.690, 1.640, 1.625]),
    "mop": ([0.0, 0.12, 0.25, 0.34, 0.40, 0.48, 0.70, 1.0],
            [1.728, 1.732, 1.716, 1.685, 1.700, 1.690, 1.645, 1.628]),
    "fringe": ([0.0, 0.25, 0.33, 0.40, 0.47, 0.60, 0.80, 1.0],
               [1.99, 1.99, 1.705, 1.690, 1.700, 1.675, 1.650, 1.635]),
}
HAIR_TOP = {"short": 1.99, "bun": 1.99, "mop": 1.99, "fringe": 1.742}


def hair_mesh(rings, name="hd_hair"):
    """Hair shell over the scalp. Styles: short (under a hat), bun, mop, fringe (balding)."""
    style = S.SPEC["hair"]["style"]
    R, N, _ = rings.shape
    ang = np.linspace(0, 2 * math.pi, N, endpoint=False)
    zs = rings[:, 0, 2]
    a = np.abs(((ang + math.pi) % (2 * math.pi)) - math.pi) / math.pi  # 0 front, 1 back
    xs_line, zs_line = HAIRLINES[style]
    hairline = zmap(np.interp(a, xs_line, zs_line))
    top_z = HAIR_TOP[style]
    rows = 60
    grid = []
    vn_mop = np.random.default_rng(S.SPEC["seed"]).random(N)
    vn_mop = np.convolve(np.concatenate([vn_mop[-4:], vn_mop, vn_mop[:4]]), np.ones(9) / 9, mode="same")[4:-4]
    for j in range(N):
        mask = (zs >= hairline[j]) & (zs <= top_z)
        col = rings[mask, j, :]
        if len(col) < 2:
            col = rings[-2:, j, :]
            col = col.copy()
        res, _ = resample_polyline(col, rows)
        outward = res - np.array([0, -0.004, 0])
        outward[:, 2] = 0
        outward /= np.maximum(np.linalg.norm(outward, axis=1, keepdims=True), 1e-6)
        zc = res[:, 2]
        if style == "short":
            thick = 0.0020 + 0.0025 * smoothstep(1.72, 1.78, zc)
        elif style == "bun":
            # Pulled back with volume over the crown and temples.
            # Pulled back tight at the sides, a little lift over the crown.
            thick = 0.0035 + 0.0070 * smoothstep(1.70, 1.79, zc)
        elif style == "mop":
            thick = 0.0040 + 0.0070 * smoothstep(1.70, 1.79, zc) + 0.004 * (vn_mop[j] - 0.5)
        else:
            thick = 0.0025 + 0.0010 * smoothstep(1.66, 1.72, zc)
        feather = smoothstep(0, 14, np.arange(rows))
        if style == "bun":
            # Centre parting: a groove down the middle of the crown.
            part = gauss(res[:, 0], 0.0, 0.004) * smoothstep(1.74, 1.79, zc) * (res[:, 1] < 0.03)
            thick = thick - 0.006 * part
        if style == "fringe":
            feather = feather * smoothstep(rows - 1, rows - 12, np.arange(rows))
        up = np.zeros_like(res)
        up[:, 2] = np.where(zc > 1.78, thick * 0.9, 0.0)
        grid.append(res + outward * (thick * feather)[:, None] + up + np.array([0, 0, 0.0008]))
    grid = np.array(grid)
    flat = grid.reshape(-1, 3)
    faces = []
    for j in range(N):
        jn = (j + 1) % N
        for r in range(rows - 1):
            faces.append((j * rows + r, jn * rows + r, jn * rows + r + 1, j * rows + r + 1))
    verts = list(map(tuple, flat))
    if style == "bun":
        # Coiled bun at the back of the crown.
        c = np.array([0.0, 0.098, 1.735])
        nlat, nlon = 18, 28
        base = len(verts)
        for i in range(nlat + 1):
            th = math.pi * i / nlat
            for jj in range(nlon):
                ph = 2 * math.pi * jj / nlon
                coil = 1 + 0.08 * math.sin(ph * 3 + th * 4)
                verts.append(tuple(c + np.array([math.sin(th) * math.cos(ph) * 0.036, math.cos(th) * 0.022 + 0.004,
                                                 math.sin(th) * math.sin(ph) * 0.030]) * coil))
        for i in range(nlat):
            for jj in range(nlon):
                q = base + i * nlon + jj
                qn = base + i * nlon + (jj + 1) % nlon
                faces.append((q, qn, qn + nlon, q + nlon))
    return mesh_object(name, verts, faces)


def beard_mesh(rings, name="hd_beard"):
    """Close full beard: a thick shell over jaw, chin and lower cheeks."""
    pts = rings.reshape(-1, 3)
    R, N, _ = rings.shape
    x, y, z = pts[:, 0], pts[:, 1], pts[:, 2]
    ax = np.abs(x)
    line = 1.650 - 0.010 * smoothstep(0.02, 0.06, ax) + 0.012 * smoothstep(0.03, 0.0, ax)
    mask = (z < line) & (z > 1.555) & (ax < 0.079) & ~((ax < 0.024) & (np.abs(z - 1.622) < 0.011) & (y < -0.07))
    thick = (0.0055 + 0.0035 * smoothstep(1.62, 1.575, z)) * smoothstep(line, line - 0.010, z)
    cen = np.stack([np.zeros_like(x), np.full_like(x, -0.004), z], axis=1)
    out = pts - cen
    out[:, 2] = 0
    out /= np.maximum(np.linalg.norm(out, axis=1, keepdims=True), 1e-6)
    shell = pts + out * (thick * mask)[:, None]
    shell[:, 2] -= 0.004 * mask * smoothstep(1.60, 1.57, z)
    grid = shell.reshape(R, N, 3)
    keep = mask.reshape(R, N)
    verts = grid.reshape(-1, 3)
    faces = []
    for r in range(R - 1):
        for j in range(N):
            jn = (j + 1) % N
            if keep[r, j] and keep[r, jn] and keep[r + 1, j] and keep[r + 1, jn]:
                faces.append((r * N + j, r * N + jn, (r + 1) * N + jn, (r + 1) * N + j))
    return mesh_object(name, verts, faces)


def brow_mesh(rings, name="hd_brows"):
    verts, faces = [], []
    for sgn in (1, -1):
        xs = np.array([0.011, 0.022, 0.036, 0.050, 0.060])
        zs = np.array([1.7085, 1.7140, 1.7160, 1.7135, 1.7065])
        pts = []
        for x, z in zip(xs, zs):
            z = float(zmap(z))
            y = surface_y(rings, sgn * x, z) - 0.0016
            pts.append((sgn * x, y, z))
        centres = catmull(np.array(pts), 40)
        t = np.linspace(0, 1, 40)
        k = 0.55 if S.female() else (0.7 if S.SPEC["age"] < 16 else 1.0)
        rz = (0.0046 * (1 - 0.55 * t) + 0.0012) * k
        ry = (0.0022 * (1 - 0.5 * t) + 0.0008) * k
        v, f = tube(centres, rz, ry, segments=14, front_ref=(0, -1, 0))
        off = len(verts)
        verts += list(v)
        faces += [tuple(i + off for i in ff) for ff in f]
    return mesh_object(name, verts, faces)


def moustache_mesh(rings, name="hd_moustache"):
    """Heavy drooping walrus/horseshoe moustache over the upper lip."""
    xs = np.array([-0.036, -0.033, -0.026, -0.016, -0.006, 0.0, 0.006, 0.016, 0.026, 0.033, 0.036])
    zs = np.array([1.601, 1.612, 1.624, 1.6335, 1.6375, 1.6365, 1.6375, 1.6335, 1.624, 1.612, 1.601])
    if S.SPEC["facial"]["style"] in ("chevron", "beard"):
        xs = xs * 0.80
        zs = np.maximum(zs, 1.618) + 0.001
    pts = []
    for x, z in zip(xs, zs):
        y = surface_y(rings, x, z) - 0.0035 - 0.0015 * math.exp(-(x / 0.02) ** 2)
        pts.append((x, y, z))
    centres = catmull(np.array(pts), 90)
    t = np.linspace(-1, 1, 90)
    # Thick at the philtrum sides, tapering to twisted points.
    body = np.clip(1 - np.abs(t) ** 2.2, 0, 1)
    k = 0.65 if S.SPEC["facial"]["style"] in ("chevron", "beard") else 1.0
    rz = (0.0015 + 0.0085 * body ** 0.6 - 0.0018 * gauss(t, 0.0, 0.12)) * k
    ry = (0.0012 + 0.0045 * body ** 0.7) * (0.8 + 0.2 * k)
    v, f = tube(centres, rz, ry, segments=20, front_ref=(0, -1, 0))
    return mesh_object(name, v, f)
