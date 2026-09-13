"""Per-vertex surface painting on the high-poly meshes.

Each HP mesh gets two FLOAT_COLOR point attributes that the bake shaders read:
  alb  linear base colour
  orm  R roughness, G metallic, B detail-bump strength (0..1)
Colours are authored in sRGB 0-255 and converted to linear here.
"""

import math

import bpy
import numpy as np

import sh_body as B
import sh_spec as S
from sh_common import gauss, smoothstep, verts_np

EYE_Z = 1.692


def lin(rgb):
    c = np.asarray(rgb, dtype=float) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _hash(ix, iy, iz, seed):
    with np.errstate(over="ignore"):
        h = (ix.astype(np.uint64) * np.uint64(0x9E3779B97F4A7C15)
             + iy.astype(np.uint64) * np.uint64(0xC2B2AE3D27D4EB4F)
             + iz.astype(np.uint64) * np.uint64(0x165667B19E3779F9)
             + np.uint64(seed * 7919 + 1))
        h ^= h >> np.uint64(31)
        h *= np.uint64(0x7FB5D329728EA185)
        h ^= h >> np.uint64(27)
        h *= np.uint64(0x81DADEF4BC2DD44D)
        h ^= h >> np.uint64(33)
    return (h >> np.uint64(40)).astype(np.float64) / float(1 << 24)


def vnoise(p, freq, seed=0):
    P = np.asarray(p, dtype=np.float64) * freq
    i = np.floor(P).astype(np.int64)
    f = P - i
    u = f * f * (3 - 2 * f)
    out = np.zeros(len(P))
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (u[:, 0] if dx else 1 - u[:, 0]) * (u[:, 1] if dy else 1 - u[:, 1]) * (u[:, 2] if dz else 1 - u[:, 2])
                out += w * _hash(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return out


def fbm(p, freq, octaves=4, seed=0):
    total, amp, norm = np.zeros(len(p)), 1.0, 0.0
    for k in range(octaves):
        total += amp * vnoise(p, freq * (2 ** k), seed + k * 17)
        norm += amp
        amp *= 0.5
    return total / norm


def normals(ob):
    n = np.empty(len(ob.data.vertices) * 3)
    ob.data.vertices.foreach_get("normal", n)
    return n.reshape(-1, 3)


def curvature(ob, co=None, nrm=None, iterations=1):
    """Signed mean-curvature proxy: + in creases/valleys, - on ridges."""
    me = ob.data
    co = verts_np(ob) if co is None else co
    nrm = normals(ob) if nrm is None else nrm
    e = np.empty(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", e)
    e = e.reshape(-1, 2)
    n = len(co)
    deg = np.bincount(e.ravel(), minlength=n).astype(float)
    acc = np.zeros_like(co)
    np.add.at(acc, e[:, 0], co[e[:, 1]])
    np.add.at(acc, e[:, 1], co[e[:, 0]])
    avg = acc / np.maximum(deg, 1)[:, None]
    L = np.linalg.norm(co[e[:, 0]] - co[e[:, 1]], axis=1).mean()
    curv = np.einsum("ij,ij->i", avg - co, nrm) / L
    for _ in range(iterations):
        s = np.zeros(n)
        np.add.at(s, e[:, 0], curv[e[:, 1]])
        np.add.at(s, e[:, 1], curv[e[:, 0]])
        curv = 0.5 * curv + 0.5 * s / np.maximum(deg, 1)
    return curv


def write(ob, alb, rough, metal, bump):
    me = ob.data
    for name in ("alb", "orm"):
        if name in me.color_attributes:
            me.color_attributes.remove(me.color_attributes[name])
    a = me.color_attributes.new("alb", "FLOAT_COLOR", "POINT")
    o = me.color_attributes.new("orm", "FLOAT_COLOR", "POINT")
    n = len(me.vertices)
    rgba = np.ones((n, 4))
    rgba[:, :3] = np.clip(alb, 0, 1)
    a.data.foreach_set("color", rgba.ravel())
    orm = np.ones((n, 4))
    orm[:, 0] = np.clip(rough, 0.02, 1)
    orm[:, 1] = np.clip(metal, 0, 1)
    orm[:, 2] = np.clip(bump, 0, 1)
    o.data.foreach_set("color", orm.ravel())


def mix(a, b, t):
    t = np.clip(np.asarray(t, dtype=float), 0, 1)[:, None]
    return a * (1 - t) + b * t


def full(n, rgb):
    return np.tile(lin(rgb), (n, 1))


# --------------------------------------------------------------------------


def paint_skin(ob):
    co = verts_np(ob)
    n = len(co)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    import sh_head as Hd
    # Undo sh_head's face compression and head drop so painted features land on the form.
    z = Hd.zunmap(z + Hd.head_drop())
    ax = np.abs(x)
    front = smoothstep(0.0, -0.05, y)
    skin = S.SPEC["skin"]
    alb = full(n, skin)
    # Sun-weathered: a hat line keeps the upper forehead paler.
    if S.SPEC["hat"]["style"] != "none":
        alb = mix(alb, full(n, S.shade(skin, 1.12)), smoothstep(1.735, 1.760, z) * 0.8)
    # Neck under the collar is paler.
    alb = mix(alb, full(n, S.shade(skin, 1.10)), smoothstep(1.56, 1.50, z))
    # Blood-rich zones: nose, cheeks, ears, lower lip.
    red = full(n, (156, 102, 90))
    nose = gauss(ax, 0.0, 0.014) * gauss(z, 1.660, 0.018) * front
    cheeks = gauss(ax, 0.046, 0.016) * gauss(z, 1.662, 0.016) * front
    ears = smoothstep(0.070, 0.080, ax) * gauss(z, 1.670, 0.035) * (1 - front)
    alb = mix(alb, red, np.clip(nose * 0.35 + cheeks * 0.22 + ears * 0.25, 0, 1))
    # Eye sockets: darker, cooler skin; lids slightly pink.
    sock = gauss(ax, 0.033, 0.016) * gauss(z, EYE_Z - 0.002, 0.011) * front
    alb = mix(alb, full(n, (118, 94, 88)), sock * 0.45)
    if S.female():
        # Lash line and a touch of colour on the lids.
        lash = gauss(ax, 0.033, 0.010) * gauss(z, EYE_Z + 0.0035, 0.0016) * front
        alb = mix(alb, full(n, (48, 34, 30)), np.clip(lash, 0, 1) * 0.8)
        cheek_f = gauss(ax, 0.042, 0.014) * gauss(z, 1.655, 0.012) * front
        alb = mix(alb, full(n, (176, 112, 104)), cheek_f * 0.25)
    # Lips.
    lips = smoothstep(0.028, 0.018, ax) * (gauss(z, 1.6285, 0.0035) + gauss(z, 1.6160, 0.0045)) * front
    lip_col = (162, 86, 88) if S.female() else ((158, 100, 96) if S.SPEC["age"] < 16 else (136, 96, 90))
    alb = mix(alb, full(n, lip_col), np.clip(lips * 1.3, 0, 1) * (0.8 if S.female() else 0.55))
    # Stubble: jaw, chin, upper lip and cheeks below the cheekbone line, a
    # salt-and-pepper grey speckle over a blue-grey shadow.
    beard_line = 1.650 - 0.012 * smoothstep(0.02, 0.06, ax) + 0.010 * smoothstep(0.03, 0.0, ax)
    beard = smoothstep(beard_line + 0.004, beard_line - 0.008, z) * smoothstep(1.535, 1.575, z)
    beard = beard * (1 - smoothstep(0.070, 0.082, ax) * (1 - front)) * (1 - lips * 0.9)
    style = S.SPEC["facial"]["style"]
    stubble = {"walrus": 1.0, "chevron": 0.9, "stubble": 0.75, "beard": 0.7, "none": 0.25}[style]
    if style in ("stubble", "none"):
        # Upper-lip stubble alone reads as a moustache; keep it lighter.
        beard = beard * (1 - 0.55 * gauss(z, 1.633, 0.008) * smoothstep(0.03, 0.01, ax))
    if S.female() or S.SPEC["age"] < 16:
        stubble = 0.0
    beard = beard * stubble
    speck = vnoise(co, 1400, 3)
    shadow = full(n, (96, 84, 80))
    grey = full(n, (132, 124, 118))
    alb = mix(alb, shadow, beard * 0.5)
    alb = mix(alb, grey, beard * smoothstep(0.70, 0.95, speck) * 0.30)
    alb = mix(alb, full(n, (52, 42, 38)), beard * smoothstep(0.65, 0.95, 1 - speck) * 0.40)
    # Mottling, freckles and a few age spots.
    mott = fbm(co, 90, 4, 11)
    alb *= (0.90 + 0.20 * mott)[:, None]
    spots = smoothstep(0.80, 0.90, vnoise(co, 220, 5)) * smoothstep(1.66, 1.76, z)
    alb = mix(alb, full(n, (116, 88, 70)), spots * 0.35)
    # Deep creases pick up grime.
    curv = curvature(ob, co, iterations=3)
    alb *= (1 - 0.30 * smoothstep(0.02, 0.25, curv))[:, None]
    rough = 0.56 + 0.10 * beard - 0.12 * (nose + gauss(z, 1.73, 0.02) * front * 0.7) - 0.08 * lips + 0.06 * (fbm(co, 200, 2, 9) - 0.5)
    write(ob, alb, rough, np.zeros(n), 0.55 + 0.35 * beard)


def paint_hands(ob):
    co = verts_np(ob)
    n = len(co)
    alb = full(n, S.shade(S.SPEC["skin"], 1.02))
    mott = fbm(co, 120, 3, 21)
    alb *= (0.9 + 0.2 * mott)[:, None]
    # Knuckles redder, back of the hand tanned darker.
    curv = curvature(ob, co, iterations=2)
    alb = mix(alb, full(n, (156, 106, 94)), smoothstep(-0.05, -0.3, curv) * 0.3)
    alb *= (1 - 0.3 * smoothstep(0.02, 0.3, curv))[:, None]
    rough = 0.55 + 0.05 * (fbm(co, 300, 2, 4) - 0.5)
    write(ob, alb, rough, np.zeros(n), np.full(n, 0.5))


def paint_hair(ob):
    co = verts_np(ob)
    n = len(co)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    salt = vnoise(co * np.array([1, 1, 0.25]), 900, 13)
    hc = S.SPEC["hair"]["color"]
    grey = S.SPEC["hair"].get("grey", 0.0)
    # Roughly `grey` of the strands have gone to silver.
    # Silver strands blend in softly; hard speckle reads as TV static.
    grey_col = S.shade((156, 151, 146), 0.9)
    base = mix(full(n, hc), mix(full(n, hc), full(n, grey_col), np.full(n, 0.75)),
               smoothstep(0.80 - grey * 0.8, 1.20 - grey * 0.8, salt))
    base = mix(base, full(n, grey_col), np.full(n, grey * 0.35))
    base = mix(base, full(n, S.shade(hc, 1.35)), smoothstep(0.55, 0.9, salt) * 0.35)
    tache = gauss(z, 1.625, 0.018) * smoothstep(-0.07, -0.09, y)
    # Nicotine-yellowed centre of the moustache, whiter tips at the droop.
    base = mix(base, full(n, (150, 124, 92)), tache * gauss(np.abs(x), 0.0, 0.012) * 0.45)
    base = mix(base, full(n, (160, 154, 146)), tache * smoothstep(0.02, 0.036, np.abs(x)) * 0.35)
    brows = gauss(z, 1.713, 0.006) * smoothstep(-0.07, -0.09, y)
    base = mix(base, full(n, (96, 88, 80)), brows * 0.5)
    base *= (0.85 + 0.3 * fbm(co, 160, 3, 2))[:, None]
    rough = 0.88 + 0.06 * (salt - 0.5)
    write(ob, base, rough, np.zeros(n), np.full(n, 0.9))


def paint_eyes(ob):
    n = len(ob.data.vertices)
    write(ob, full(n, (220, 212, 198)), np.full(n, 0.08), np.zeros(n), np.zeros(n))


def paint_cloth(ob):
    me = ob.data
    co = verts_np(ob)
    n = len(co)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    mi = np.zeros(len(me.polygons), dtype=np.int32)
    me.polygons.foreach_get("material_index", mi)
    loop_start = np.zeros(len(me.polygons), dtype=np.int64)
    loop_total = np.zeros(len(me.polygons), dtype=np.int64)
    me.polygons.foreach_get("loop_start", loop_start)
    me.polygons.foreach_get("loop_total", loop_total)
    loops = np.zeros(len(me.loops), dtype=np.int64)
    me.loops.foreach_get("vertex_index", loops)
    region = np.zeros(n, dtype=np.int32)
    region[loops] = np.repeat(mi, loop_total)
    shirt, pants, skin_r = region == 0, region == 1, region == 2
    top_c = S.SPEC["top"]["color"]
    bot_c = S.SPEC["bottom"]["color"]

    curv = curvature(ob, co, iterations=4)
    crease = smoothstep(0.02, 0.35, curv)
    ridge = smoothstep(-0.02, -0.35, curv)
    grain = fbm(co, 60, 4, 31)

    alb = np.zeros((n, 3))
    rough = np.zeros(n)
    bump = np.zeros(n)

    # Shirt: faded butternut cotton, sweat and grime.
    s = shirt
    a = full(n, top_c)
    a = mix(a, full(n, S.shade(top_c, 1.14)), ridge * 0.5)
    a *= (0.9 + 0.2 * grain)[:, None]
    pits = gauss(np.abs(x), 0.17, 0.035) * gauss(z, 1.35, 0.05)
    a = mix(a, full(n, S.shade(top_c, 0.74)), pits * 0.45)
    cuffs = 0.0
    for side in "LR":
        wr = B.joint("hand", side)
        cuffs = cuffs + gauss(np.linalg.norm(co - wr, axis=1), 0.02, 0.03)
    a = mix(a, full(n, S.shade(top_c, 0.72)), np.clip(cuffs, 0, 1) * 0.45)
    a = mix(a, full(n, S.shade(top_c, 0.70)), smoothstep(1.53, 1.575, z) * 0.5)
    alb[s] = a[s]
    rough[s] = 0.86
    bump[s] = 0.45

    # Trousers: brown wool canvas, trail dust climbing from the boots, worn
    # seat and knees.
    p = pants
    a = full(n, bot_c)
    a *= (0.88 + 0.24 * grain)[:, None]
    dust_n = fbm(co, 25, 4, 41)
    dust = smoothstep(0.78, 0.40, z) * (0.35 + 0.65 * dust_n) + ridge * 0.25 * smoothstep(0.9, 0.5, z)
    a = mix(a, full(n, (150, 128, 100)), np.clip(dust, 0, 0.75) * 0.7)
    knees = 0.0
    for side in "LR":
        kn = B.joint("shin", side) + np.array([0, -0.06, 0])
        knees = knees + gauss(np.linalg.norm(co - kn, axis=1), 0.0, 0.05)
    a = mix(a, full(n, S.shade(bot_c, 1.40)), np.clip(knees, 0, 1) * 0.35)
    seat = smoothstep(0.02, 0.10, y) * gauss(z, 0.92, 0.07) + smoothstep(0.06, 0.02, np.abs(x)) * gauss(z, 0.84, 0.06)
    a = mix(a, full(n, S.shade(bot_c, 0.72)), np.clip(seat, 0, 1) * 0.4)
    a *= (1 - 0.35 * crease)[:, None]
    alb[p] = a[p]
    rough[p] = (0.9 - 0.2 * np.clip(seat, 0, 1))[p]
    bump[p] = 0.6

    # Bare forearms below rolled sleeves.
    if skin_r.any():
        a = full(n, S.shade(S.SPEC["skin"], 0.98)) * (0.9 + 0.2 * fbm(co, 120, 3, 21))[:, None]
        a *= (1 - 0.25 * crease)[:, None]
        alb[skin_r] = a[skin_r]
        rough[skin_r] = 0.55
        bump[skin_r] = 0.5

    write(ob, alb, rough, np.zeros(n), bump)
    return region


def paint_vest(ob):
    co = verts_np(ob)
    n = len(co)
    curv = curvature(ob, co, iterations=3)
    a = full(n, S.SPEC["vest"]["color"]) * (0.9 + 0.2 * fbm(co, 60, 4, 31))[:, None]
    a = mix(a, full(n, S.shade(S.SPEC["vest"]["color"], 1.7)), smoothstep(-0.05, -0.5, curv) * 0.7)
    a *= (1 - 0.25 * smoothstep(0.02, 0.35, curv))[:, None]
    write(ob, a, np.full(n, 0.72), np.zeros(n), np.full(n, 0.35))


def paint_boots(ob):
    co = verts_np(ob)
    n = len(co)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    curv = curvature(ob, co, iterations=3)
    bc = S.SPEC["boots"]["color"]
    a = full(n, bc)
    polish = fbm(co, 40, 3, 51)
    a *= (0.8 + 0.4 * polish)[:, None]
    scuff = smoothstep(0.55, 0.8, fbm(co, 180, 3, 52)) * (smoothstep(-0.12, -0.2, y) + smoothstep(0.06, 0.1, y) * smoothstep(0.08, 0.04, z) + 0.3)
    a = mix(a, full(n, S.shade(bc, 1.75)), np.clip(scuff, 0, 1) * 0.6)
    a = mix(a, full(n, (126, 108, 86)), smoothstep(0.10, 0.02, z) * fbm(co, 30, 3, 53) * 0.7)
    a = mix(a, full(n, (26, 20, 16)), smoothstep(0.024, 0.018, z))
    a = mix(a, full(n, (34, 24, 18)), smoothstep(0.038, 0.036, z) * smoothstep(0.02, 0.05, y))
    a *= (1 - 0.35 * smoothstep(0.02, 0.3, curv))[:, None]
    a = mix(a, full(n, (104, 76, 52)), smoothstep(-0.05, -0.4, curv) * 0.35)
    rough = 0.42 + 0.35 * np.clip(scuff, 0, 1) + 0.2 * smoothstep(0.1, 0.02, z)
    write(ob, a, rough, np.zeros(n), np.full(n, 0.35))


def paint_hat(ob):
    co = verts_np(ob)
    n = len(co)
    x, y, z = co[:, 0], co[:, 1], co[:, 2]
    nrm = normals(ob)
    curv = curvature(ob, co, iterations=3)
    a = full(n, S.SPEC["hat"]["color"])
    a *= (0.85 + 0.3 * fbm(co, 70, 4, 61))[:, None]
    r = np.sqrt(x ** 2 + (y - 0.01) ** 2)
    brim_top = smoothstep(0.1, 0.13, r) * smoothstep(0.3, 0.8, nrm[:, 2])
    a = mix(a, full(n, (118, 102, 84)), brim_top * fbm(co, 25, 3, 62) * 0.6)
    a = mix(a, full(n, (120, 104, 88)), smoothstep(-0.05, -0.4, curv) * 0.5)
    band = smoothstep(0.1, 0.09, r) * gauss(z, 1.768, 0.016)
    a = mix(a, full(n, S.SPEC["hat"]["band"]), smoothstep(0.3, 0.6, band))
    sweat = gauss(z, 1.800, 0.012) * smoothstep(0.1, 0.085, r)
    a = mix(a, full(n, (54, 42, 32)), sweat * 0.6)
    rough = 0.92 - 0.2 * smoothstep(0.3, 0.6, band)
    write(ob, a, rough, np.zeros(n), np.full(n, 0.6))


GEAR = {
    # key: (sRGB, roughness, metallic, bump)
    "concho": ((196, 196, 190), 0.30, 1.0, 0.2),
    "bandana": ((112, 36, 30), 0.85, 0.0, 0.5),
    "buttons": ((44, 34, 28), 0.35, 0.0, 0.1),
    "pockets": ((40, 30, 24), 0.75, 0.0, 0.3),
    "chain": ((186, 146, 80), 0.32, 1.0, 0.1),
    "badge": ((206, 204, 196), 0.24, 1.0, 0.2),
    "gunbelt": ((96, 60, 34), 0.55, 0.0, 0.5),
    "loops": ((80, 50, 28), 0.58, 0.0, 0.5),
    "brass": ((190, 150, 82), 0.34, 1.0, 0.1),
    "buckle": ((170, 168, 160), 0.36, 1.0, 0.2),
    "gun": ((54, 56, 62), 0.30, 1.0, 0.15),
    "grip": ((82, 44, 24), 0.42, 0.0, 0.4),
    "holster": ((104, 66, 38), 0.52, 0.0, 0.5),
    "tiedown": ((90, 58, 34), 0.58, 0.0, 0.4),
    "spurs": ((96, 94, 92), 0.42, 1.0, 0.2),
    "suspenders": ((70, 50, 34), 0.60, 0.0, 0.4),
    "spectacles": ((176, 150, 96), 0.28, 1.0, 0.1),
    "pipe": ((70, 40, 24), 0.40, 0.0, 0.3),
    "satchel": ((96, 70, 46), 0.62, 0.0, 0.5),
    "papers": ((208, 200, 180), 0.90, 0.0, 0.3),
    "rope": ((150, 126, 88), 0.90, 0.0, 0.8),
    "collar": ((214, 208, 194), 0.80, 0.0, 0.3),
    "cravat": ((30, 28, 30), 0.60, 0.0, 0.3),
    "waistband": ((60, 46, 36), 0.80, 0.0, 0.3),
}


def paint_fabric(ob, color, roughness=0.85, dust=0.5, leather=False):
    """Generic garment: grain, fold highlights, crease grime, hem dust."""
    co = verts_np(ob)
    n = len(co)
    z = co[:, 2]
    curv = curvature(ob, co, iterations=3)
    a = full(n, color) * (0.88 + 0.24 * fbm(co, 60, 4, 81))[:, None]
    a = mix(a, full(n, S.shade(color, 1.35 if leather else 1.18)), smoothstep(-0.05, -0.4, curv) * 0.55)
    a *= (1 - 0.30 * smoothstep(0.02, 0.35, curv))[:, None]
    if dust:
        d = smoothstep(0.45, 0.08, z) * (0.4 + 0.6 * fbm(co, 25, 4, 83))
        a = mix(a, full(n, (150, 128, 100)), np.clip(d, 0, 0.8) * dust)
    if leather:
        scuff = smoothstep(0.6, 0.85, fbm(co, 160, 3, 84))
        a = mix(a, full(n, S.shade(color, 1.6)), scuff * 0.4)
    write(ob, a, np.full(n, roughness), np.zeros(n), np.full(n, 0.45))


def paint_gear(key, ob):
    rgb, r, m, b = GEAR[key]
    if key == "bandana" and S.SPEC.get("bandana"):
        rgb = S.SPEC["bandana"]["color"]
    co = verts_np(ob)
    n = len(co)
    a = full(n, rgb) * (0.85 + 0.3 * fbm(co, 120, 3, sum(map(ord, key)) % 97))[:, None]
    rough = np.full(n, r)
    if key == "brass":
        # Lead bullet noses above the casing mouth.
        tip = np.zeros(n, dtype=bool)
        # Every cartridge is two cylinders; the second (nose) begins 10 mm up.
        per = n // 56 if n >= 56 else 1
        idx = np.arange(n)
        tip = ((idx // per) % 2) == 1
        a[tip] = lin((112, 112, 116))
        rough[tip] = 0.55
    if key == "bandana":
        curv = curvature(ob, co, iterations=2)
        a = mix(a, full(n, (150, 70, 58)), smoothstep(-0.05, -0.3, curv) * 0.4)
        a *= (1 - 0.35 * smoothstep(0.02, 0.3, curv))[:, None]
    if key == "gun":
        # Case-hardened frame colours mottle near the cylinder window.
        mott = fbm(co, 260, 3, 71)
        frame = gauss(np.linalg.norm(co - co.mean(axis=0), axis=1), 0.0, 0.05)
        case = mix(full(n, (92, 74, 70)), full(n, (60, 72, 104)), smoothstep(0.35, 0.65, mott))
        a = mix(a, case, frame * 0.5)
    write(ob, a, rough, np.full(n, m), np.full(n, b))


def paint_all():
    objs = bpy.data.collections["Sheriff_HP"].objects
    sp = S.SPEC
    for ob in objs:
        name = ob.name
        if name == "HP_Skin":
            paint_skin(ob)
        elif name.startswith("HP_Hand"):
            paint_hands(ob)
        elif name == "HP_Hair":
            paint_hair(ob)
        elif name == "HP_Eyes":
            paint_eyes(ob)
        elif name == "HP_Cloth":
            paint_cloth(ob)
        elif name == "HP_Boots":
            paint_boots(ob)
        elif name == "HP_Hat":
            paint_hat(ob)
        elif name == "HP_Vest":
            paint_vest(ob)
        elif name == "HP_Skirt":
            paint_fabric(ob, sp["bottom"]["color"], 0.86, dust=0.55)
        elif name == "HP_Coat":
            paint_fabric(ob, sp["coat"]["color"], 0.80, dust=0.7 if sp["coat"]["style"] == "duster" else 0.0)
        elif name == "HP_Apron":
            ap = sp["apron"]
            paint_fabric(ob, ap["color"], 0.55 if ap.get("leather") else 0.88, dust=0.2, leather=ap.get("leather", False))
        elif name == "HP_Shawl":
            paint_fabric(ob, sp["shawl"]["color"], 0.95, dust=0.0)
        elif name.startswith("HP_Gear_"):
            paint_gear(name[len("HP_Gear_"):], ob)
