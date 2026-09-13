"""Hat, bandana, gun belt, holster, Colt revolver, badge, buttons, watch chain."""

import math

import numpy as np

from sh_body import PANTS_KEYS, SHIRT_KEYS, Profile, joint, torso_bumps, torso_point
import sh_spec as S
from sh_common import catmull, gauss, loft_rings, mesh_object, resample_polyline, smoothstep, tube


class Builder:
    """Accumulates verts/faces from several parts into one mesh."""

    def __init__(self):
        self.v, self.f = [], []

    def add(self, verts, faces):
        off = len(self.v)
        self.v.extend([tuple(map(float, p)) for p in verts])
        self.f.extend([tuple(int(i) + off for i in fc) for fc in faces])

    def build(self, name):
        return mesh_object(name, self.v, self.f)


def box(center, axes, half):
    """Oriented box. axes: 3 unit vectors, half: 3 half-extents."""
    c = np.asarray(center, dtype=float)
    ax = [np.asarray(a, dtype=float) * h for a, h in zip(axes, half)]
    verts = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                verts.append(c + sx * ax[0] + sy * ax[1] + sz * ax[2])
    faces = [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)]
    return verts, faces


def cylinder(p0, p1, r0, r1=None, segs=16, caps=True):
    r1 = r0 if r1 is None else r1
    centres = np.linspace(p0, p1, 3)
    radii = np.linspace(r0, r1, 3)
    return tube(centres, radii, radii, segments=segs, caps=caps)


def front_angle_for_x(prof, z, x, extra=0.0, front=True):
    a = np.linspace(-math.pi / 2, math.pi / 2, 721) if front else np.linspace(math.pi / 2, 3 * math.pi / 2, 721)
    pts = torso_point(prof, z, a, extra)
    return float(a[np.argmin(np.abs(pts[:, 0] - x))])


def surface_frame(prof, z, a, extra, kind="shirt"):
    """Point and outward normal on a torso surface."""
    e = extra + torso_bumps(np.array([a]), z, kind)
    p = torso_point(prof, z, np.array([a]), e)[0]
    da = 1e-3
    dz = 1e-3
    pa = torso_point(prof, z, np.array([a + da]), e)[0]
    pz = torso_point(prof, z + dz, np.array([a]), e)[0]
    n = np.cross(pa - p, pz - p)
    n /= np.linalg.norm(n)
    cen = np.array([0, p[1], z])
    if np.dot(n, p - np.array([0, prof.at(z)[3], z])) < 0:
        n = -n
    return p, n


# --------------------------------------------------------------------------
# Hat


HAT_BASE = np.array([0.0, 0.006, 1.748])
HAT_TILT = math.radians(5.0)  # brim pulled down at the front


def _hat_xform(pts):
    pts = np.asarray(pts, dtype=float)
    c, s = math.cos(HAT_TILT), math.sin(HAT_TILT)
    y = pts[..., 1] * c + pts[..., 2] * s
    z = -pts[..., 1] * s + pts[..., 2] * c
    out = np.stack([pts[..., 0], y, z], axis=-1)
    return out + HAT_BASE


HAT_STYLES = {
    #            H     taper pinch crease side  roll  brim(x, yf, yb)          curl  dip   bowl
    "cattleman": (0.104, 0.16, 0.26, 0.040, 0.014, 0.016, (0.176, 0.200, 0.190), 0.034, 0.010, 0.0),
    "flat":      (0.092, 0.05, 0.00, 0.008, 0.000, 0.010, (0.182, 0.202, 0.198), 0.006, 0.000, 0.0),
    "slouch":    (0.100, 0.12, 0.10, 0.028, 0.004, 0.020, (0.190, 0.214, 0.206), 0.010, 0.034, 0.0),
    "bowler":    (0.098, 0.00, 0.00, 0.000, 0.000, 0.000, (0.128, 0.150, 0.146), 0.022, 0.004, 1.0),
}


def hat_mesh(name="gr_hat"):
    b = Builder()
    ax, ay = 0.083, 0.103  # crown base semi-axes (outer)
    style = S.SPEC["hat"]["style"]
    H, TAPER, PINCH, CREASE, SIDE, ROLL, BRIM, CURL, DIP, BOWL = HAT_STYLES[style]
    segs = 96
    ang = np.linspace(0, 2 * math.pi, segs, endpoint=False)
    c, s = np.cos(ang), np.sin(ang)

    # Crown walls + creased top as one closed surface.
    rings = []
    wall_rows = 40
    for t in np.linspace(0, 1, wall_rows):
        taper = 1 - TAPER * t ** 1.3
        if BOWL:
            taper = np.sqrt(max(1 - (t * 0.92) ** 2.2, 0.0)) * 0.97 + 0.03
        pinch = 1 - PINCH * smoothstep(0.35, 1.0, t) * np.clip(c, 0, 1) ** 1.2 * np.abs(s) ** 0.7
        x = s * ax * taper * pinch
        y = -c * ay * taper * (1 - 0.03 * t)
        zt = t * (H - 0.012)
        if BOWL:
            zt = (H - 0.004) * math.sin(t * math.pi / 2) ** 0.8
        z = np.full(segs, zt)
        rings.append(np.stack([x, y, z], axis=1))
    top_rows = 30
    last = rings[-1]
    for k, u in enumerate(np.linspace(1, 0.02, top_rows)):
        x = last[:, 0] * u
        y = last[:, 1] * u
        # Roll over the crown edge, then the cattleman crease.
        roll = ROLL * np.sqrt(np.clip(1 - ((1 - u) / 0.28) ** 2, 0, 1)) if u > 0.72 else ROLL
        if BOWL:
            roll = 0.004 * np.sqrt(max(1 - u * u, 0.0))
        crease = CREASE * np.exp(-(x / 0.024) ** 2) * smoothstep(-0.10, -0.03, y) * (1 - 0.45 * smoothstep(0.02, 0.1, y))
        crease += 0.030 * np.exp(-(x / 0.020) ** 2) * smoothstep(-0.11, -0.04, y) * 0
        side = SIDE * np.exp(-((np.abs(x) - 0.052) / 0.014) ** 2) * smoothstep(0.03, -0.07, y)
        z = (H - 0.012) + roll - crease * smoothstep(0.95, 0.6, u) - side * smoothstep(0.95, 0.6, u)
        rings.append(np.stack([x, y, z], axis=1))
    v, f = loft_rings(np.array(rings), cap_start=True, cap_end=True)
    b.add(_hat_xform(v), f)

    # Brim: closed rounded cross-section swept around the crown.
    inner_ax, inner_ay = ax - 0.010, ay - 0.010
    out_ax, out_ay_f, out_ay_b = BRIM
    prof_pts = []
    n_rad = 22
    for i in range(n_rad):  # top surface inner -> outer
        prof_pts.append((i / (n_rad - 1), 1.0))
    for k in range(1, 8):  # rounded outer edge
        th = math.pi * k / 8
        prof_pts.append((1.0 + 0.012 * math.sin(th) / 0.09, math.cos(th)))
    for i in range(n_rad - 1, -1, -1):  # bottom outer -> inner
        prof_pts.append((i / (n_rad - 1), -1.0))
    brim_rings = []
    for a_i in range(segs):
        cc, ss = c[a_i], s[a_i]
        oy = out_ay_f if cc > 0 else out_ay_b
        ix, iy = ss * inner_ax, -cc * inner_ay
        ox, oy2 = ss * out_ax, -cc * oy
        ring = []
        for r, side in prof_pts:
            x = ix + (ox - ix) * r
            y = iy + (oy2 - iy) * r
            rr = min(r, 1.0)
            curl = CURL * abs(ss) ** 2.5 * rr ** 2.2 - DIP * abs(cc) ** 4 * rr ** 1.5 * (1 if cc > 0 else 0.6)
            if style == "slouch":
                # A hat that has been sat on: the brim waves.
                curl += 0.008 * math.sin(3 * math.atan2(ss, cc) + 0.7) * rr ** 2
            thick = 0.0028 * (1 - 0.25 * rr)
            ring.append((x, y, 0.002 + curl + side * thick))
        brim_rings.append(ring)
    brim_rings = np.array(brim_rings).transpose(1, 0, 2)  # profile x angle
    # Loft across the profile, closing around the angle axis.
    P, A, _ = brim_rings.shape
    verts = brim_rings.reshape(-1, 3)
    faces = []
    for p in range(P):
        pn = (p + 1) % P
        for a_i in range(A):
            an = (a_i + 1) % A
            faces.append((p * A + a_i, p * A + an, pn * A + an, pn * A + a_i))
    b.add(_hat_xform(verts), faces)

    # Hat band with a small concho on the left side.
    band = []
    for t in (0.0, 0.028):
        band.append(np.stack([s * (ax + 0.0022) * (1 - 0.07 * t / H), -c * (ay + 0.0022), np.full(segs, 0.004 + t)], axis=1))
    band.append(np.stack([s * (ax - 0.002), -c * (ay - 0.002), np.full(segs, 0.032)], axis=1))
    band.append(np.stack([s * (ax - 0.002), -c * (ay - 0.002), np.full(segs, 0.004)], axis=1))
    v, f = loft_rings(np.array(band), cap_start=False, cap_end=False)
    faces = list(f) + [tuple((i + 3 * segs, (i + 1) % segs + 3 * segs, (i + 1) % segs, i)) for i in range(segs)]
    b.add(_hat_xform(v), faces)
    return b.build(name)


def concho_mesh(name="gr_hat_concho"):
    b = Builder()
    ax = 0.083
    p = _hat_xform(np.array([[ax + 0.0045, -0.01, 0.018]]))[0]
    v, f = cylinder(p - np.array([0.002, 0, 0]), p + np.array([0.003, 0, 0]), 0.0095, 0.0075, segs=20)
    b.add(v, f)
    return b.build(name)


# --------------------------------------------------------------------------
# Bandana and shirt details


def bandana_mesh(name="gr_bandana"):
    prof = Profile(SHIRT_KEYS)
    b = Builder()
    segs = 96
    ang = np.linspace(0, 2 * math.pi, segs, endpoint=False)
    rows = []
    for z in np.linspace(1.520, 1.568, 10):
        wrinkle = 0.0025 * np.sin(ang * 9 + z * 300) * gauss(z, 1.545, 0.015)
        rows.append(torso_point(prof, z, ang, 0.011 + wrinkle + torso_bumps(ang, z, "shirt")))
    v, f = loft_rings(np.array(rows))
    b.add(v, f)
    # Front drape: a folded triangle lying on the chest.
    cols, nrow = 48, 30
    grid = []
    for a in np.linspace(-0.62, 0.62, cols):
        bottom = 1.425 + 0.19 * abs(a) ** 1.25
        col = []
        for z in np.linspace(1.545, bottom, nrow):
            t = (1.545 - z) / max(1.545 - bottom, 1e-3)
            fold = 0.0035 * np.sin(a * 11 + t * 2.0) * t
            col.append(torso_point(prof, z, np.array([a]), 0.014 + fold + torso_bumps(np.array([a]), z, "shirt"))[0])
        grid.append(col)
    grid = np.array(grid)
    top = grid.reshape(-1, 3)
    faces = []
    for ci in range(cols - 1):
        for r in range(nrow - 1):
            k = ci * nrow + r
            faces.append((k, k + 1, k + nrow + 1, k + nrow))
    b.add(top, faces)
    return b.build(name)


def buttons_mesh(name="gr_buttons"):
    prof = Profile(SHIRT_KEYS)
    b = Builder()
    for z in (1.080, 1.125, 1.170, 1.215):
        p, n = surface_frame(prof, z, 0.0, 0.0145)
        v, f = cylinder(p - n * 0.002, p + n * 0.0035, 0.0068, 0.0058, segs=16)
        b.add(v, f)
    return b.build(name)


def pocket_flaps_mesh(name="gr_pockets"):
    """Welt pocket lips on the vest (thin raised strips)."""
    prof = Profile(SHIRT_KEYS)
    b = Builder()
    for sgn, z, w, slant in ((1, 1.105, 0.052, 0.10), (-1, 1.105, 0.052, -0.10), (1, 1.335, 0.042, 0.0), (-1, 1.335, 0.042, 0.0)):
        cx = sgn * 0.090
        pts = []
        for u in np.linspace(-w / 2, w / 2, 12):
            x = cx + u
            zz = z + u * slant * sgn
            a = front_angle_for_x(prof, zz, x, 0.0135)
            p, n = surface_frame(prof, zz, a, 0.0135)
            pts.append(p + n * 0.0008)
        pts = np.array(pts)
        v, f = tube(pts, np.full(len(pts), 0.0028), np.full(len(pts), 0.0014), segments=10, front_ref=(0, -1, 0))
        b.add(v, f)
    return b.build(name)


def watch_chain_mesh(name="gr_chain"):
    prof = Profile(SHIRT_KEYS)
    b = Builder()
    # From the third vest button, sagging across to the lower right pocket.
    anchors = []
    for x, z in ((0.0, 1.170), (-0.030, 1.140), (-0.060, 1.126), (-0.085, 1.118)):
        a = front_angle_for_x(prof, z, x, 0.016)
        p, n = surface_frame(prof, z, a, 0.016)
        anchors.append(p + n * 0.0015)
    path = catmull(np.array(anchors), 60)
    links = 34
    pts, _ = resample_polyline(path, links + 1)
    for k in range(links):
        mid = 0.5 * (pts[k] + pts[k + 1])
        d = pts[k + 1] - pts[k]
        L = np.linalg.norm(d)
        d /= L
        v, f = cylinder(mid - d * L * 0.45, mid + d * L * 0.45, 0.0011, segs=6)
        b.add(v, f)
    return b.build(name)


def badge_mesh(name="gr_badge"):
    """Five-point star in a ring, pinned to the vest's left chest."""
    prof = Profile(SHIRT_KEYS)
    z = 1.360
    x = 0.088
    a = front_angle_for_x(prof, z, x, 0.0135)
    p, n = surface_frame(prof, z, a, 0.0135)
    up = np.array([0, 0, 1.0])
    right = np.cross(up, n)
    right /= np.linalg.norm(right)
    up = np.cross(n, right)
    b = Builder()
    R_out, R_in = 0.028, 0.0118
    # Star (bevelled: centre raised).
    star_pts = []
    for k in range(10):
        th = math.pi / 2 + k * math.pi / 5
        r = R_out if k % 2 == 0 else R_in
        star_pts.append((math.cos(th) * r, math.sin(th) * r))
    verts = []
    faces = []
    base = p + n * 0.0015
    verts.append(base + n * 0.0045)  # raised centre
    for sx, sy in star_pts:
        verts.append(base + right * sx + up * sy + n * 0.0016)
    for sx, sy in star_pts:
        verts.append(base + right * sx + up * sy)
    for k in range(10):
        kn = (k + 1) % 10
        faces.append((0, 1 + k, 1 + kn))
        faces.append((1 + k, 11 + k, 11 + kn, 1 + kn))
    b.add(verts, faces)
    # Ball tips.
    for k in range(0, 10, 2):
        th = math.pi / 2 + k * math.pi / 5
        c = base + (right * math.cos(th) + up * math.sin(th)) * (R_out + 0.002) + n * 0.0012
        v, f = sphere(c, 0.0032, 8, 12)
        b.add(v, f)
    # Ring.
    ring_c = []
    for k in range(48):
        th = 2 * math.pi * k / 48
        ring_c.append(base + (right * math.cos(th) + up * math.sin(th)) * 0.0215 + n * 0.0012)
    ring_c.append(ring_c[0])
    ring_c = np.array(ring_c)
    v, f = tube(ring_c, np.full(len(ring_c), 0.0019), np.full(len(ring_c), 0.0019), segments=8, front_ref=tuple(n), caps=False)
    b.add(v, f)
    return b.build(name)


def sphere(c, r, nlat=10, nlon=16):
    verts, faces = [], []
    for i in range(nlat + 1):
        th = math.pi * i / nlat
        for j in range(nlon):
            ph = 2 * math.pi * j / nlon
            verts.append(np.asarray(c) + r * np.array([math.sin(th) * math.cos(ph), math.sin(th) * math.sin(ph), math.cos(th)]))
    for i in range(nlat):
        for j in range(nlon):
            a = i * nlon + j
            bb = i * nlon + (j + 1) % nlon
            faces.append((a, bb, bb + nlon, a + nlon))
    return verts, faces


# --------------------------------------------------------------------------
# Gun belt, cartridges, holster, revolver


def belt_z(a):
    # Slung low on the right (gun) hip, riding higher on the left.
    return 0.992 + 0.022 * np.sin(a) - 0.010 * np.clip(np.cos(a), 0, 1) ** 2


def gunbelt_mesh(name="gr_gunbelt"):
    prof = Profile(PANTS_KEYS)
    b = Builder()
    segs = 160
    ang = np.linspace(0, 2 * math.pi, segs, endpoint=False)
    half_h = 0.025
    section = [(-1.0, 0.004), (-1.0, 0.0115), (-0.8, 0.0135), (0.8, 0.0135), (1.0, 0.0115), (1.0, 0.004)]
    rings = []
    for vz, ext in section:
        pts = []
        for a in ang:
            z = belt_z(a) + vz * half_h
            pts.append(torso_point(prof, z, np.array([a]), ext + torso_bumps(np.array([a]), z, "pants"))[0])
        rings.append(pts)
    v, f = loft_rings(np.array(rings), cap_start=False, cap_end=False)
    R = len(section)
    faces = list(f) + [((R - 1) * segs + i, (R - 1) * segs + (i + 1) % segs, (i + 1) % segs, i) for i in range(segs)]
    b.add(v, faces)
    return b.build(name)


def cartridges_mesh(name="gr_cartridges"):
    """Leather loops (returned separately) and brass/lead cartridge tips."""
    prof = Profile(PANTS_KEYS)
    loops = Builder()
    brass = Builder()
    angles = list(np.linspace(0.42, 2.55, 22)) + list(np.linspace(-2.85, -2.20, 6))
    for a in angles:
        z = belt_z(a)
        p, n = surface_frame(prof, z, a, 0.0135, kind="pants")
        up = np.array([0, 0, 1.0])
        t = np.cross(up, n)
        t /= np.linalg.norm(t)
        v, f = box(p + n * 0.003 + up * 0.002, (t, up, n), (0.0062, 0.017, 0.0032))
        loops.add(v, f)
        tip0 = p + n * 0.0055 + up * 0.016
        v, f = cylinder(tip0, tip0 + up * 0.010, 0.0046, 0.0044, segs=10)
        brass.add(v, f)
        v, f = cylinder(tip0 + up * 0.010, tip0 + up * 0.0165, 0.0040, 0.0012, segs=10)
        brass.add(v, f)
    return loops.build(name), brass.build(name + "_brass")


def buckle_mesh(name="gr_buckle"):
    prof = Profile(PANTS_KEYS)
    a = 0.05
    z = belt_z(a)
    p, n = surface_frame(prof, z, a, 0.0135, kind="pants")
    up = np.array([0, 0, 1.0])
    t = np.cross(up, n)
    t /= np.linalg.norm(t)
    b = Builder()
    w, h, bar = 0.030, 0.026, 0.0045
    c = p + n * 0.003
    for cx, cz, hx, hz in ((0, h, w, bar), (0, -h, w, bar), (w, 0, bar, h), (-w, 0, bar, h)):
        v, f = box(c + t * cx + up * cz, (t, up, n), (hx, hz, 0.0028))
        b.add(v, f)
    v, f = box(c + t * 0.004, (t, up, n), (0.0018, h, 0.0022))  # tongue bar
    b.add(v, f)
    return b.build(name)


def gun_frame():
    """Holster/gun frame on the right hip: A (muzzle, down), U (sights, forward), S (outward)."""
    prof = Profile(PANTS_KEYS)
    a = -math.pi / 2 - 0.12
    z = belt_z(a) - 0.005
    p, n = surface_frame(prof, z, a, 0.013, kind="pants")
    A = np.array([0.0, 0.07, -1.0])
    A /= np.linalg.norm(A)
    S = np.array([-1.0, 0.0, 0.0])
    U = np.cross(S, A)
    if U[1] > 0:
        U = -U
    origin = p + n * 0.0215 + np.array([0.0, 0.004, -0.004])
    return origin, A, U, S


def revolver_mesh(name="gr_revolver"):
    """Colt Single Action Army, 5.5 in barrel, built in gun space."""
    O, A, U, S = gun_frame()
    metal = Builder()
    wood = Builder()

    def g(a, u, s=0.0):
        return O + A * a + U * u + S * s

    # Cylinder with chamber flutes suggested by a slight polygon.
    v, f = cylinder(g(-0.021, 0.0), g(0.021, 0.0), 0.0190, segs=18)
    metal.add(v, f)
    # Barrel and muzzle crown, front sight.
    v, f = cylinder(g(0.021, 0.0085), g(0.160, 0.0085), 0.0078, 0.0072, segs=18)
    metal.add(v, f)
    v, f = box(g(0.154, 0.0175), (A, U, S), (0.004, 0.003, 0.0009))
    metal.add(v, f)
    # Ejector rod housing on the right (outward) side.
    v, f = cylinder(g(0.030, -0.0045, 0.0055), g(0.140, -0.0045, 0.0055), 0.0048, segs=12)
    metal.add(v, f)
    v, f = cylinder(g(0.140, -0.0045, 0.0055), g(0.146, -0.0045, 0.0055), 0.0038, 0.003, segs=10)
    metal.add(v, f)
    # Frame: recoil shield, top strap, lower frame, cylinder window sides.
    v, f = box(g(-0.030, 0.0, 0.0), (A, U, S), (0.010, 0.023, 0.0110))
    metal.add(v, f)
    v, f = box(g(0.004, 0.0205, 0.0), (A, U, S), (0.028, 0.0035, 0.0085))
    metal.add(v, f)
    v, f = box(g(0.006, -0.0195, 0.0), (A, U, S), (0.030, 0.0045, 0.0090))
    metal.add(v, f)
    v, f = box(g(0.030, 0.0, 0.0), (A, U, S), (0.006, 0.021, 0.0095))
    metal.add(v, f)
    # Hammer with a chequered spur (spur reads as a hook).
    hp = [g(-0.036, 0.012), g(-0.046, 0.022), g(-0.056, 0.030), g(-0.062, 0.028)]
    c = catmull(np.array(hp), 12)
    v, f = tube(c, np.linspace(0.0035, 0.0028, 12), np.linspace(0.0050, 0.0036, 12), segments=10, front_ref=tuple(S))
    metal.add(v, f)
    # Trigger guard arc and trigger.
    guard = []
    for th in np.linspace(0, math.pi, 16):
        guard.append(g(-0.018 + 0.017 * math.cos(th), -0.024 - 0.020 * math.sin(th)))
    guard = np.array(guard)
    v, f = tube(guard, np.full(16, 0.0022), np.full(16, 0.0030), segments=8, front_ref=tuple(S))
    metal.add(v, f)
    tp = catmull(np.array([g(-0.012, -0.022), g(-0.016, -0.032), g(-0.022, -0.040)]), 8)
    v, f = tube(tp, np.full(8, 0.0020), np.full(8, 0.0010), segments=8, front_ref=tuple(S))
    metal.add(v, f)
    # Plow-handle grip: backstrap (metal) and walnut panels.
    grip_c = catmull(np.array([g(-0.036, -0.018), g(-0.050, -0.045), g(-0.066, -0.078), g(-0.074, -0.102)]), 30)
    t = np.linspace(0, 1, 30)
    along_w = 0.0125 + 0.004 * np.sin(t * math.pi) + 0.002 * t
    v, f = tube(grip_c, along_w, np.full(30, 0.0150) + 0.002 * t, segments=18, front_ref=tuple(S), exponent=2.6)
    wood.add(v, f)
    # Butt cap.
    v, f = cylinder(grip_c[-1], grip_c[-1] + (grip_c[-1] - grip_c[-2]) * 0.6, 0.012, 0.010, segs=12)
    metal.add(v, f)
    return metal.build(name), wood.build(name + "_grip")


def holster_mesh(name="gr_holster"):
    O, A, U, S = gun_frame()
    b = Builder()
    n = 40
    t = np.linspace(-0.026, 0.178, n)
    centres = np.array([O + A * a + U * (0.002 - 0.02 * max(0, (0.02 - a)) ) for a in t])
    tt = (t - t[0]) / (t[-1] - t[0])
    ru = 0.030 - 0.017 * smoothstep(0.1, 0.5, tt) - 0.003 * tt
    rs = 0.0165 - 0.005 * tt
    # Mouth flare (throat) for the cylinder.
    ru = ru + 0.004 * gauss(tt, 0.02, 0.06)
    v, f = tube(centres, rs, ru, segments=28, front_ref=tuple(-U), exponent=2.4)
    b.add(v, f)
    # Belt loop flap: a slab from the belt down the back of the holster.
    v, f = box(O + A * 0.020 - S * 0.016 - U * 0.006, (A, U, S), (0.040, 0.034, 0.0035))
    b.add(v, f)
    # Hammer thong (keeper strap) over the hammer.
    strap = catmull(np.array([O + A * -0.010 - U * 0.018 + S * 0.012, O + A * -0.050 - U * 0.002 + S * 0.004,
                              O + A * -0.052 + U * 0.012 - S * 0.004, O + A * -0.010 + U * 0.022 - S * 0.010]), 14)
    v, f = tube(strap, np.full(14, 0.0011), np.full(14, 0.0045), segments=6, front_ref=tuple(S))
    b.add(v, f)
    return b.build(name)


def tiedown_mesh(name="gr_tiedown"):
    O, A, U, S = gun_frame()
    b = Builder()
    kn = joint("shin", "R")
    th = joint("thigh", "R")
    z = 0.795
    t = (th[2] - z) / (th[2] - kn[2])
    c = th + (kn - th) * t
    segs = 48
    ang = np.linspace(0, 2 * math.pi, segs)
    rings = []
    for dz in (-0.006, 0.006):
        pts = []
        for a in ang:
            r = 0.0835
            pts.append(c + np.array([math.sin(a) * r, -math.cos(a) * r * 1.06, dz]))
        rings.append(pts)
    for dz, rr in ((0.006, 0.0795), (-0.006, 0.0795)):
        pts = []
        for a in ang:
            pts.append(c + np.array([math.sin(a) * rr, -math.cos(a) * rr * 1.06, dz]))
        rings.append(pts)
    v, f = loft_rings(np.array(rings), cap_start=False, cap_end=False)
    b.add(v, f)
    return b.build(name)


# --------------------------------------------------------------------------
# Spurs


def spurs_mesh(name="gr_spurs"):
    metal = Builder()
    for side in ("L", "R"):
        sgn = 1 if side == "L" else -1
        ank = joint("foot", side)
        heel = np.array([ank[0], ank[1] + 0.090, 0.060])
        # Heel band hugging the boot counter.
        band = []
        for th in np.linspace(-1.25, 1.25, 20):
            band.append(np.array([ank[0] + math.sin(th) * 0.047, ank[1] + 0.010 + math.cos(th) * 0.078, 0.060 + 0.004 * th * th]))
        band = np.array(band)
        v, f = tube(band, np.full(20, 0.0028), np.full(20, 0.0017), segments=8, front_ref=(0, 0, 1))
        metal.add(v, f)
        # Shank and rowel.
        v, f = cylinder(heel, heel + np.array([0, 0.030, -0.006]), 0.0026, 0.0022, segs=8)
        metal.add(v, f)
        rc = heel + np.array([0, 0.040, -0.008])
        spikes = 10
        verts = [rc + np.array([0.0014, 0, 0]), rc - np.array([0.0014, 0, 0])]
        faces = []
        for k in range(spikes * 2):
            th = 2 * math.pi * k / (spikes * 2)
            r = 0.019 if k % 2 == 0 else 0.007
            verts.append(rc + np.array([0.0, math.cos(th) * r, math.sin(th) * r]))
        for k in range(spikes * 2):
            kn = (k + 1) % (spikes * 2)
            faces.append((0, 2 + k, 2 + kn))
            faces.append((1, 2 + kn, 2 + k))
        metal.add(verts, faces)
    return metal.build(name)
