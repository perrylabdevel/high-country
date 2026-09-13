"""Wardrobe beyond the sheriff's kit: skirts, coats, aprons, shawls,
suspenders, collars and small props. Everything is built in canonical space
against the same torso profiles as the shirt, so layers sit on the body.
"""

import math

import numpy as np

import sh_spec as S
from sh_body import PANTS_KEYS, SHIRT_KEYS, Profile, joint, torso_bumps, torso_point
from sh_common import catmull, gauss, loft_rings, mesh_object, resample_polyline, smoothstep, tube
from sh_gear import Builder, box, cylinder, front_angle_for_x, sphere, surface_frame


_PROFILES = {}


def _profile(keys):
    sig = tuple(map(tuple, keys))
    if sig not in _PROFILES:
        _PROFILES.clear() if len(_PROFILES) > 8 else None
        _PROFILES[sig] = Profile(keys)
    return _PROFILES[sig]


def _body_radius_point(z, a, extra):
    """Outermost of the shirt and trouser surfaces at (z, a), so outer layers
    pass smoothly over the waistband instead of stepping at the seam."""
    aa = np.array([a])
    zc = min(max(z, 0.83), 1.575)
    best = None
    for keys, kind, lo, hi in ((SHIRT_KEYS, "shirt", 0.98, 1.575), (PANTS_KEYS, "pants", 0.83, 1.085)):
        if not (lo - 0.05 <= zc <= hi + 0.05):
            continue
        p = torso_point(_profile(keys), min(max(zc, lo), hi), aa, extra + torso_bumps(aa, z, kind))[0]
        p[2] = zc
        r = math.hypot(p[0], p[1] - 0.012)
        if best is None or r > best[0]:
            best = (r, p)
    return best[1]


def _strip(columns, rows, fn):
    """Grid surface: columns of (param) -> rows of points via fn(col, t)."""
    verts = []
    C = len(columns)
    for c in columns:
        for t in np.linspace(0, 1, rows):
            verts.append(fn(c, t))
    faces = []
    for i in range(C - 1):
        for r in range(rows - 1):
            k = i * rows + r
            faces.append((k, k + rows, k + rows + 1, k + 1))
    return verts, faces


# --------------------------------------------------------------------------
# Skirt


def skirt_mesh(name="gm_skirt", hem_z=0.075, flare=1.0):
    """Full-length gathered skirt from the natural waist."""
    prof_p = Profile(PANTS_KEYS)
    prof_s = Profile(SHIRT_KEYS)
    segs = 180
    rows = 90
    ang = np.linspace(0, 2 * math.pi, segs, endpoint=False)
    c, s = np.cos(ang), np.sin(ang)
    waist_z = 1.075
    hip_z = 0.93
    rng = np.random.default_rng(S.SPEC["seed"])
    phases = rng.uniform(0, 2 * math.pi, 3)
    rings = []
    for z in np.linspace(waist_z, hem_z, rows):
        if z >= hip_z:
            prof = prof_s if z > 1.0 else prof_p
            ring = torso_point(prof, z, ang, 0.012 + 0.006 * smoothstep(waist_z, hip_z, z))
        else:
            hip = torso_point(prof_p, hip_z, ang, 0.018)
            t = (hip_z - z) / (hip_z - hem_z)
            grow = 1.0 + (0.75 * flare) * t ** 1.1
            ring = hip.copy()
            ring[:, 0] *= grow
            ring[:, 1] = (ring[:, 1] - 0.01) * (1.0 + (0.58 * flare) * t ** 1.1) + 0.01
            ring[:, 2] = z
        # Gathers: soft vertical folds deepening toward the hem.
        tt = smoothstep(waist_z, hem_z, z)
        fold = (0.003 + 0.020 * tt ** 1.4) * (0.55 * np.sin(ang * 11 + phases[0] + 0.8 * np.sin(ang * 3 + z * 6))
                                             + 0.35 * np.sin(ang * 5 + phases[1]) + 0.12 * np.sin(ang * 19 + phases[2]))
        radial = ring[:, :2] - np.array([0.0, 0.01])
        radial /= np.maximum(np.linalg.norm(radial, axis=1, keepdims=True), 1e-6)
        ring[:, :2] += radial * fold[:, None]
        rings.append(ring)
    v, f = loft_rings(np.array(rings), cap_start=False, cap_end=False)
    return mesh_object(name, v, f)


def waistband_mesh(name="gm_waistband"):
    prof = Profile(SHIRT_KEYS)
    segs = 120
    ang = np.linspace(0, 2 * math.pi, segs, endpoint=False)
    rings = [torso_point(prof, z, ang, e) for z, e in ((1.060, 0.016), (1.094, 0.016), (1.094, 0.006), (1.060, 0.006))]
    v, f = loft_rings(np.array(rings), cap_start=False, cap_end=False)
    f = list(f) + [(3 * segs + i, 3 * segs + (i + 1) % segs, (i + 1) % segs, i) for i in range(segs)]
    return mesh_object(name, v, f)


# --------------------------------------------------------------------------
# Coats


def coat_torso_mesh(name="gm_coat", style="sack"):
    """Coat body hung from the chest: below the ribs it never narrows (it
    drapes over belly, belt and hips instead of following them in), then
    flares to the hem. Open front with lapels."""
    hem = {"sack": 0.80, "duster": 0.36}[style]
    cols = 240
    rows = 150
    gap = 0.018 if style == "sack" else 0.030
    ang = np.linspace(-math.pi, math.pi, cols)
    cy = 0.012
    verts_by_side = {}
    for side_name, sel in (("R", ang > gap), ("L", ang < -gap)):
        A_ = ang[sel]
        grid = []
        for a in A_:
            u = abs(a) / math.pi
            top = float(np.interp(u, [0.0, 0.05, 0.12, 0.20, 1.0], [1.25, 1.36, 1.50, 1.565, 1.575]))
            zs = np.linspace(top, hem, rows)
            pts = []
            radii = []
            for z in zs:
                zb = max(z, 0.90)
                p = _body_radius_point(zb, a, 0.0)
                pts.append(p)
                radii.append(math.hypot(p[0], p[1] - cy))
            radii = np.array(radii)
            # Hang: running max from the chest down (index grows downward).
            hang = zs < 1.30
            r = radii.copy()
            run = 0.0
            for k in range(rows):
                if hang[k]:
                    run = max(run, radii[k])
                    r[k] = run
            # Clear the thighs (leg tubes stand proud of the trouser profile).
            r = r + 0.024 + 0.030 * smoothstep(1.02, 0.90, zs)
            dirs = np.array([[p[0], p[1] - cy] for p in pts])
            dirs /= np.maximum(np.linalg.norm(dirs, axis=1, keepdims=True), 1e-6)
            below = np.clip((0.93 - zs) / max(0.93 - hem, 1e-3), 0, 1)
            spread_x = 1.0 + (0.10 if style == "sack" else 0.30) * below ** 1.2
            spread_y = 1.0 + (0.05 if style == "sack" else 0.18) * below
            col = []
            for k, z in enumerate(zs):
                x = dirs[k, 0] * r[k] * spread_x[k]
                y = cy + dirs[k, 1] * r[k] * spread_y[k]
                if style == "duster":
                    fold = 0.007 * math.sin(a * 9) * below[k]
                    x += math.sin(a) * fold
                    y -= math.cos(a) * fold
                side = abs(math.sin(a))
                lift = side ** 3 * float(smoothstep(1.36, 1.46, z))
                col.append((x + math.copysign(1, math.sin(a)) * 0.018 * lift, y, z + 0.006 * lift))
            grid.append(col)
        verts_by_side[side_name] = np.array(grid)
    verts, faces = [], []
    for g in verts_by_side.values():
        C_, R_, _ = g.shape
        off = len(verts)
        verts += [tuple(v) for v in g.reshape(-1, 3)]
        for c in range(C_ - 1):
            for r in range(R_ - 1):
                k = off + c * R_ + r
                faces.append((k, k + R_, k + R_ + 1, k + 1))
    # Lapels: folded-back triangles on each front edge.
    for sgn in (1, -1):
        lv, lf = [], []
        for z, w in ((1.26, 0.004), (1.32, 0.040), (1.40, 0.055), (1.47, 0.050), (1.52, 0.030)):
            base = _body_radius_point(z, sgn * (gap + 0.03), 0.030)
            outer = _body_radius_point(z, sgn * (gap + 0.01 + w * 3.2), 0.031)
            lv += [tuple(base), tuple(outer)]
        for k in range(4):
            i2 = 2 * k
            lf.append((i2, i2 + 2, i2 + 3, i2 + 1) if sgn > 0 else (i2, i2 + 1, i2 + 3, i2 + 2))
        o = len(verts)
        verts += lv
        faces += [tuple(i2 + o for i2 in f) for f in lf]
    return mesh_object(name, verts, faces)


def coat_sleeve_mesh(name, side):
    sh = joint("upper_arm", side)
    el = joint("forearm", side)
    wr = joint("hand", side)
    inner = sh + np.array([-0.08 if side == "L" else 0.08, 0.0, 0.03])
    d = (wr - el) / np.linalg.norm(wr - el)
    n = 110
    centres, _ = resample_polyline([inner, sh, el, wr - d * 0.012], n)
    t = np.linspace(0, 1, n)
    rx = np.interp(t, [0, 0.12, 0.35, 0.55, 0.8, 1.0], [0.085, 0.078, 0.064, 0.058, 0.052, 0.050])
    ry = rx * 1.02

    def profile(k, ang):
        tt = k / (n - 1)
        return 1.0 + 0.04 * np.sin(ang * 3 + tt * 20) * smoothstep(0.4, 0.6, tt) * smoothstep(0.75, 0.6, tt)

    v, f = tube(centres, rx, ry, segments=72, profile=profile)
    return mesh_object(name, v, f)


# --------------------------------------------------------------------------
# Apron, shawl, suspenders, collar


def apron_mesh(name="gm_apron", top=1.06, hem=0.50, bib=False, width=1.05, skirt=False):
    hip_z = 0.93

    def lower(a, t):
        z = top + (hem - top) * t
        if z >= hip_z:
            p = _body_radius_point(z, a, 0.028 if skirt else 0.020)
        else:
            hip = _body_radius_point(hip_z, a, 0.030 if skirt else 0.022)
            k = (hip_z - z) / max(hip_z - hem, 1e-3)
            p = hip.copy()
            if skirt:
                # Ride over the skirt's own flare (skirt_mesh).
                ts = (hip_z - z) / (hip_z - 0.075)
                p[0] *= 1.0 + 0.75 * ts ** 1.1 + 0.07
                p[1] = (p[1] - 0.01) * (1.0 + 0.58 * ts ** 1.1 + 0.10) + 0.01
            else:
                # Hangs straight down off the belly and hips.
                p[0] *= 1 + 0.05 * k
                p[1] = p[1] - 0.008 * k
            p[2] = z
        p[:2] += np.array([math.sin(a), -math.cos(a)]) * 0.003 * math.sin(a * 11 + t * 3) * t
        return p

    b = Builder()
    v, f = _strip(np.linspace(-width, width, 70), 90, lower)
    b.add(v, f)
    if bib:
        def upper(a, t):
            z = 1.38 + (top + 0.03 - 1.38) * t
            half = 0.30 + 0.10 * t
            return _body_radius_point(z, a * half / 0.34, 0.022 if z > 1.2 else 0.020)
        v, f = _strip(np.linspace(-0.34, 0.34, 30), 40, upper)
        b.add(v, f)
    # Waist tie band and, for a bib apron, a neck strap.
    prof = Profile(SHIRT_KEYS)
    segs = 90
    ang = np.linspace(0, 2 * math.pi, segs, endpoint=False)
    rings = [torso_point(prof, z, ang, e) for z, e in ((1.050, 0.024), (1.068, 0.024))]
    tv, tf = loft_rings(np.array(rings), cap_start=False, cap_end=False)
    b.add(tv, tf)
    if bib:
        for sgn in (1, -1):
            pts = []
            for x, z in ((0.095, 1.38), (0.085, 1.46), (0.06, 1.53)):
                aa = front_angle_for_x(prof, z, sgn * x, 0.02)
                p, n = surface_frame(prof, z, aa, 0.02)
                pts.append(p)
            pts.append(np.array([sgn * 0.045, 0.02, 1.565]))
            c = catmull(np.array(pts), 20)
            sv, sf = tube(c, np.full(20, 0.009), np.full(20, 0.0015), segments=8, front_ref=(0, -1, 0))
            b.add(sv, sf)
    return b.build(name)


def shawl_mesh(name="gm_shawl"):
    """Wool shawl over the shoulders: one piece wrapping round the back to a
    point, its ends hanging down the front either side of the collar."""
    cols = np.linspace(0.34, 2 * math.pi - 0.34, 240)

    def fn(a, t):
        u = abs(((a + math.pi) % (2 * math.pi)) - math.pi) / math.pi  # 0 front, 1 back
        bottom = float(np.interp(u, [0.10, 0.25, 0.45, 0.70, 1.0], [1.22, 1.26, 1.25, 1.17, 1.08]))
        z = 1.555 + (bottom - 1.555) * t
        side = abs(math.sin(a))
        extra = 0.020 + 0.040 * side ** 4 * gauss(z, 1.43, 0.07) + 0.004 * math.sin(a * 20) * t
        return _body_radius_point(z, a, extra)

    v, f = _strip(cols, 60, fn)
    return mesh_object(name, v, f)


def suspenders_mesh(name="gm_suspenders"):
    prof = Profile(SHIRT_KEYS)
    b = Builder()
    for sgn in (1, -1):
        # Front: waist to shoulder.
        front = []
        for x, z in ((0.080, 1.08), (0.084, 1.20), (0.090, 1.32), (0.098, 1.44), (0.104, 1.50)):
            a = front_angle_for_x(prof, z, sgn * x, 0.012)
            front.append(surface_frame(prof, z, a, 0.012)[0])
        back = []
        for x, z in ((0.104, 1.50), (0.090, 1.42), (0.050, 1.30), (0.020, 1.20), (-0.010, 1.10)):
            a = front_angle_for_x(prof, z, sgn * x, 0.012, front=False)
            back.append(surface_frame(prof, z, a, 0.012)[0])
        top = np.array([sgn * 0.110, 0.02, 1.528])
        path = catmull(np.array(front + [top] + back[1:]), 60)
        ref = np.array([0.0, -1.0, 0.0])
        v, f = tube(path, np.full(60, 0.011), np.full(60, 0.0016), segments=8, front_ref=tuple(ref))
        b.add(v, f)
        # Button tabs at the waistband.
        p, n = surface_frame(prof, 1.075, front_angle_for_x(prof, 1.075, sgn * 0.08, 0.014), 0.014)
        v, f = cylinder(p - n * 0.001, p + n * 0.004, 0.006, segs=12)
        b.add(v, f)
    return b.build(name)


def collar_mesh(name="gm_collar"):
    """High banded collar for a blouse or a doctor's shirt."""
    prof = Profile(SHIRT_KEYS)
    segs = 96
    ang = np.linspace(0, 2 * math.pi, segs, endpoint=False)
    rings = []
    for z, e in ((1.540, 0.012), (1.590, 0.010), (1.590, 0.005), (1.540, 0.006)):
        pts = torso_point(prof, min(z, 1.575), ang, e)
        pts[:, 2] = z
        rings.append(pts)
    v, f = loft_rings(np.array(rings), cap_start=False, cap_end=False)
    f = list(f) + [(3 * segs + i, 3 * segs + (i + 1) % segs, (i + 1) % segs, i) for i in range(segs)]
    return mesh_object(name, v, f)


def cravat_mesh(name="gm_cravat"):
    """Bow tie knotted at the collar."""
    b = Builder()
    c = np.array([0.0, -0.068, 1.548])
    for sgn in (1, -1):
        pts = [c, c + np.array([sgn * 0.025, -0.004, 0.010]), c + np.array([sgn * 0.034, -0.002, 0.0]),
               c + np.array([sgn * 0.025, -0.004, -0.010]), c]
        path = catmull(np.array(pts), 16)
        v, f = tube(path, np.full(16, 0.006), np.full(16, 0.003), segments=10, front_ref=(0, 0, 1))
        b.add(v, f)
    v, f = sphere(c + np.array([0, -0.003, 0]), 0.007, 8, 12)
    b.add(v, f)
    return b.build(name)


# --------------------------------------------------------------------------
# Props


def spectacles_mesh(name="gm_spectacles"):
    import sh_head as H
    b = Builder()
    for sgn in (1, -1):
        cx = sgn * H.EYE["x"]
        c = np.array([cx, -0.105, float(H.zmap(H.EYE["z"]))])
        ring = []
        for k in range(33):
            th = 2 * math.pi * k / 32
            ring.append(c + np.array([math.cos(th) * 0.0165, 0.0, math.sin(th) * 0.0135]))
        ring = np.array(ring)
        v, f = tube(ring, np.full(33, 0.0011), np.full(33, 0.0011), segments=6, front_ref=(0, -1, 0), caps=False)
        b.add(v, f)
        temple = catmull(np.array([c + np.array([sgn * 0.0165, 0.0, 0.0]), np.array([sgn * 0.074, -0.06, 1.694]),
                                   np.array([sgn * 0.080, 0.0, 1.690]), np.array([sgn * 0.078, 0.022, 1.672])]), 20)
        v, f = tube(temple, np.full(20, 0.0009), np.full(20, 0.0009), segments=6, front_ref=(0, 0, 1))
        b.add(v, f)
    bridge = catmull(np.array([[0.0160, -0.106, 1.696], [0.0, -0.112, 1.702], [-0.0160, -0.106, 1.696]]), 10)
    v, f = tube(bridge, np.full(10, 0.001), np.full(10, 0.001), segments=6, front_ref=(0, -1, 0))
    b.add(v, f)
    return b.build(name)


def pipe_mesh(name="gm_pipe"):
    """Briar pipe riding in the vest's upper right pocket, stem up."""
    prof = Profile(SHIRT_KEYS)
    z = 1.325
    a = front_angle_for_x(prof, z, -0.085, 0.016)
    p, n = surface_frame(prof, z, a, 0.016)
    b = Builder()
    bowl = p + n * 0.010 + np.array([0, 0, 0.018])
    v, f = cylinder(bowl - np.array([0, 0, 0.014]), bowl + np.array([0, 0, 0.012]), 0.0105, 0.0120, segs=16)
    b.add(v, f)
    stem = catmull(np.array([bowl - np.array([0, 0, 0.010]), bowl + np.array([0.010, 0.004, -0.004]),
                             bowl + np.array([0.030, 0.006, 0.020]), bowl + np.array([0.040, 0.004, 0.048])]), 16)
    v, f = tube(stem, np.linspace(0.0040, 0.0028, 16), np.linspace(0.0040, 0.0028, 16), segments=10)
    b.add(v, f)
    return b.build(name)


def satchel_mesh(name="gm_satchel"):
    prof = Profile(SHIRT_KEYS)
    b = Builder()
    # Strap: left shoulder, across the chest, to the right hip.
    path = []
    for x, z in ((0.110, 1.50), (0.060, 1.40), (0.0, 1.30), (-0.070, 1.18), (-0.140, 1.06)):
        a = front_angle_for_x(prof, z, x, 0.016)
        path.append(surface_frame(prof, z, a, 0.016)[0])
    back = []
    for x, z in ((0.110, 1.50), (0.060, 1.40), (0.0, 1.30), (-0.070, 1.18), (-0.140, 1.06)):
        a = front_angle_for_x(prof, z, x, 0.016, front=False)
        back.append(surface_frame(prof, z, a, 0.016)[0])
    for pts in (path, back):
        c = catmull(np.array([np.array([0.118, 0.01, 1.53])] + pts), 40)
        v, f = tube(c, np.full(40, 0.014), np.full(40, 0.0018), segments=8, front_ref=(0, -1, 0))
        b.add(v, f)
    bag_c = np.array([-0.205, 0.0, 0.93])
    v, f = box(bag_c, ((0, 1, 0), (0, 0, 1), (1, 0, 0)), (0.105, 0.085, 0.030))
    b.add(v, f)
    v, f = box(bag_c + np.array([-0.032, 0.0, 0.050]), ((0, 1, 0), (0, 0, 1), (1, 0, 0)), (0.107, 0.040, 0.004))
    b.add(v, f)
    leather = b.build(name)
    papers = Builder()
    for k in range(3):
        v, f = box(bag_c + np.array([0.004 * k, -0.02 + 0.02 * k, 0.098 + 0.004 * k]), ((0, 1, 0), (0, 0, 1), (1, 0, 0)),
                   (0.070, 0.030, 0.006))
        papers.add(v, f)
    return leather, papers.build(name + "_papers")


def rope_mesh(name="gm_rope"):
    """Coiled lariat hung from the left hip."""
    b = Builder()
    c = np.array([0.205, 0.015, 0.88])
    pts = []
    turns = 5
    for k in range(turns * 40 + 1):
        th = 2 * math.pi * k / 40
        r = 0.085 + 0.004 * math.sin(k * 0.7)
        pts.append(c + np.array([0.004 * (k / 40) - 0.01, math.cos(th) * r * 0.9, math.sin(th) * r * 1.1]))
    pts = np.array(pts)
    v, f = tube(pts, np.full(len(pts), 0.0065), np.full(len(pts), 0.0065), segments=8, front_ref=(1, 0, 0))
    b.add(v, f)
    return b.build(name)

