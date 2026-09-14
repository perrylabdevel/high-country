"""The Silver Creek slice of the western prop kit: one builder per prop.

Every builder returns a finished Prop (see pr_common). Dimensions are metres
and period-true where it matters for scale against the 1.8 m cast: a 50-gallon
oak barrel, a 1.2 m rear wagon wheel, a 4.9 m hitching rail matching the
town's rail spacing, a 3 m post-and-rail fence bay.
"""

import math

from mathutils import Matrix, Vector

from pr_common import Prop


def barrel():
    p = Prop("barrel", seed=11)
    prof = [(0.25, 0.0), (0.272, 0.1), (0.293, 0.26), (0.302, 0.45), (0.293, 0.64), (0.272, 0.8), (0.25, 0.9), (0.232, 0.9), (0.232, 0.872)]
    p.lathe(prof, sides=16, kind="stave")

    def radius_at(z):
        for (ra, za), (rb, zb) in zip(prof, prof[1:]):
            if za <= z <= zb and zb > za:
                return ra + (rb - ra) * (z - za) / (zb - za)
        return prof[0][0]

    for z in (0.1, 0.28, 0.62, 0.8):
        p.ring(radius_at(z) + 0.007, 0.045, 0.013, sides=16, loc=(0, 0, z), kind="iron")
    return p


def crate():
    p = Prop("crate", seed=23)
    w, d, h = 0.9, 0.62, 0.6
    # Core boards (stave kind draws the board seams), battens proud of each face.
    p.box((w - 0.04, d - 0.04, h - 0.04), loc=(0, 0, h / 2), kind="stave", grain="x", bevel=0.006)
    bt, bw = 0.022, 0.075
    for sy in (-1, 1):
        y = sy * (d / 2 - bt / 2)
        for sz in (0, 1):
            z = bw / 2 if sz == 0 else h - bw / 2
            p.box((w, bt, bw), loc=(0, y, z), kind="wood")
        for sx in (-1, 1):
            p.box((bw, bt, h - 2 * bw), loc=(sx * (w / 2 - bw / 2), y, h / 2), kind="wood", grain="z")
        diag = math.hypot(w - 2 * bw, h - 2 * bw)
        ang = math.atan2(h - 2 * bw, w - 2 * bw) * (-sy)
        p.box((diag - 0.02, bt * 0.9, bw * 0.9), loc=(0, y, h / 2), rot=(0, ang, 0), kind="wood")
    for sx in (-1, 1):
        x = sx * (w / 2 - bt / 2)
        for sz in (0, 1):
            z = bw / 2 if sz == 0 else h - bw / 2
            p.box((bt, d - 2 * bt, bw), loc=(x, 0, z), kind="wood", grain="y")
    # Stencil-free lid battens across the top.
    for sx in (-1, 1):
        p.box((bw, d - 0.02, bt), loc=(sx * 0.28, 0, h + bt / 2 - 0.004), kind="wood", grain="y")
    return p


def trough():
    p = Prop("trough", seed=37)
    L, W = 2.4, 0.72
    base_z, wall_h, t = 0.2, 0.36, 0.05
    p.box((L, W, t), loc=(0, 0, base_z + t / 2), kind="wood_grey")
    for sy in (-1, 1):
        # Two boards per long wall; the seam is real geometry.
        for k in range(2):
            p.box((L, t, wall_h / 2 - 0.004), loc=(0, sy * (W / 2 - t / 2), base_z + t + wall_h / 4 + k * wall_h / 2), kind="wood_grey")
    for sx in (-1, 1):
        p.box((t, W - 2 * t, wall_h), loc=(sx * (L / 2 - t / 2), 0, base_z + t + wall_h / 2), kind="wood_grey", grain="y")
        # Iron strap wrapping the corner joints.
        for sy in (-1, 1):
            p.box((0.05, 0.008, wall_h + 0.02), loc=(sx * (L / 2 - 0.1), sy * (W / 2 + 0.004), base_z + t + wall_h / 2), kind="iron", grain="z", bevel=0.002)
        # Trestle: skid on the ground, two legs up to the floor.
        x = sx * (L / 2 - 0.35)
        p.box((0.1, W + 0.16, 0.07), loc=(x, 0, 0.035), kind="wood_dark", grain="y")
        for sy in (-1, 1):
            p.box((0.08, 0.08, base_z - 0.07), loc=(x, sy * (W / 2 - 0.08), 0.07 + (base_z - 0.07) / 2), kind="wood_dark", grain="z")
    p.box((L - 2 * t - 0.01, W - 2 * t - 0.01, 0.02), loc=(0, 0, base_z + t + wall_h - 0.07), kind="water", bevel=0)
    return p


def hitch_rail():
    p = Prop("hitch_rail", seed=41)
    for sx, lean in ((-1, 0.018), (1, -0.012)):
        # Posts run 0.25 m below grade so a slope never shows their foot.
        p.cylinder(0.085, 1.4, sides=8, loc=(sx * 2.2, 0, -0.25), rot=(lean, lean * 0.5, 0), kind="wood_grey", r_top=0.075)
    p.cylinder(0.062, 4.9, sides=8, loc=(-2.45, 0, 1.02), rot=(0, math.pi / 2, 0), kind="wood_grey", r_top=0.056)
    for x in (-0.9, 1.1):
        p.ring(0.072, 0.024, 0.012, sides=10, loc=(x, 0, 1.02), rot=(0, math.pi / 2, 0), kind="iron")
        # Tie ring hanging from the band.
        p.ring(0.05, 0.012, 0.01, sides=10, loc=(x, -0.07, 0.95), rot=(0.25, 0, 0), kind="iron")
    return p


def _wheel(p, radius, hub_len=0.24, spokes=12):
    """A spoked wheel in the current frame: axis local Z, centred at the origin."""
    tire_t = 0.022
    fel_t = 0.07
    p.ring(radius, 0.06, tire_t, sides=24, kind="iron")
    p.ring(radius - tire_t, 0.075, fel_t, sides=24, kind="wood_dark")
    hub_r = 0.095 * radius / 0.6 + 0.02
    p.cylinder(hub_r, hub_len, sides=12, loc=(0, 0, -hub_len / 2), kind="wood_dark", r_top=hub_r * 0.85)
    for z in (-hub_len * 0.35, hub_len * 0.3):
        p.ring(hub_r + 0.006, 0.03, 0.012, sides=12, loc=(0, 0, z), kind="iron")
    inner = radius - tire_t - fel_t + 0.02
    for k in range(spokes):
        a = 2 * math.pi * k / spokes
        c, s = math.cos(a), math.sin(a)
        # Wheels are dished: spokes lean outboard toward the rim.
        p.beam((c * hub_r * 0.8, s * hub_r * 0.8, -0.01), (c * inner, s * inner, 0.03), (0.042, 0.032), kind="wood", roll=0.0, bevel=0.008)


def wheel_lean():
    p = Prop("wheel_lean", seed=53)
    radius = 0.62
    lean = math.radians(14)
    # Stand the wheel on its rim at the origin, then tip it back onto a wall (+Y).
    frame = Matrix.Rotation(-lean, 4, "X") @ Matrix.Translation((0, 0, radius)) @ Matrix.Rotation(math.pi / 2, 4, "X")
    with p.at(frame):
        _wheel(p, radius)
    return p


def _plane_frame(p1, p2, p3):
    """Frame whose XY plane passes through three points, X kept along world X."""
    a, b, c = Vector(p1), Vector(p2), Vector(p3)
    n = (b - a).cross(c - a).normalized()
    if n.z < 0:
        n = -n
    x = (Vector((1, 0, 0)) - n * n.x).normalized()
    y = n.cross(x)
    rot = Matrix((x, y, n)).transposed().to_4x4()
    z0 = a.z - (n.x * (0 - a.x) + n.y * (0 - a.y)) / n.z
    return Matrix.Translation((0, 0, z0)) @ rot


def wagon_broken():
    """A farm wagon that lost its near front wheel and dropped that corner."""
    p = Prop("wagon_broken", seed=67)
    rear_r, front_r = 0.6, 0.48
    # Axles.
    p.beam((-1.0, -0.86, rear_r), (-1.0, 0.86, rear_r), (0.09, 0.09), kind="wood_dark")
    front_hub = Vector((1.0, -0.86, front_r))
    front_drop = Vector((1.0, 0.74, 0.07))
    p.beam(front_hub, front_drop, (0.09, 0.09), kind="wood_dark")
    for y in (-0.86, 0.86):
        with p.at(Matrix.Translation((-1.0, y, rear_r)) @ Matrix.Rotation(math.pi / 2, 4, "X")):
            _wheel(p, rear_r)
    with p.at(Matrix.Translation(front_hub) @ Matrix.Rotation(math.pi / 2, 4, "X")):
        _wheel(p, front_r, hub_len=0.2)
    # The lost wheel, lying on the ground propped on its hub.
    with p.at(Matrix.Translation((2.05, 1.45, 0.1)) @ Matrix.Rotation(0.12, 4, "Y")):
        _wheel(p, front_r, hub_len=0.2)
    # Tongue dropped to the dirt.
    p.beam((1.05, -0.05, 0.3), (3.0, -0.45, 0.05), (0.09, 0.08), kind="wood_dark")
    p.beam((2.3, -0.75, 0.12), (2.3, 0.2, 0.1), (0.07, 0.06), kind="wood_dark")

    # Bed, resting on the rear bolster and the tipped front axle.
    bed = _plane_frame((-1.0, 0.0, rear_r + 0.12), (1.0, -0.62, 0.55), (1.0, 0.6, 0.2))
    with p.at(bed):
        for y in (-0.62, 0.62):
            p.box((0.12, 0.12, 0.12), loc=(-1.0, y, -0.06), kind="wood_dark")
        for y in (-0.38, 0.38):
            p.box((3.3, 0.1, 0.1), loc=(0, y, 0.05), kind="wood_dark")
        for k, y in enumerate((-0.44, -0.22, 0.0, 0.22, 0.44)):
            if k == 3:
                # Sprung board: shorter and lifted at the break.
                p.box((2.0, 0.21, 0.035), loc=(-0.6, y, 0.12), rot=(0, -0.03, 0.01), kind="wood_grey")
            else:
                p.box((3.3, 0.21, 0.035), loc=(0, y, 0.118), kind="wood_grey")
        for sy in (-1, 1):
            y = sy * 0.57
            p.box((3.3, 0.035, 0.17), loc=(0, y, 0.23), kind="wood_grey")
            if sy > 0:
                p.box((1.9, 0.035, 0.17), loc=(-0.7, y, 0.41), rot=(0, 0.02, 0), kind="wood_grey")
            else:
                p.box((3.3, 0.035, 0.17), loc=(0, y, 0.41), kind="wood_grey")
            for x in (-1.5, -0.5, 0.5, 1.5):
                p.box((0.05, 0.05, 0.5), loc=(x, sy * 0.605, 0.3), kind="iron", grain="z", bevel=0.004)
        p.box((0.035, 1.16, 0.34), loc=(-1.63, 0, 0.32), kind="wood_grey", grain="y")
    # Fallen boards.
    p.box((1.3, 0.17, 0.035), loc=(0.3, 1.2, 0.018), rot=(0, 0, 0.45), kind="wood_grey")
    p.box((1.16, 0.34, 0.035), loc=(2.35, -1.05, 0.018), rot=(0, 0, 1.25), kind="wood_grey")
    return p


def fence_rail():
    """One 3 m post-and-rail bay: a post at -X, rails running to the next post."""
    p = Prop("fence_rail", seed=71)
    p.cylinder(0.09, 1.55, sides=7, loc=(-1.5, 0, -0.25), rot=(0.01, -0.012, 0), kind="wood_grey", r_top=0.08)
    for k, (z, sag, twist) in enumerate(((0.38, 0.015, 0.2), (0.72, 0.02, -0.3), (1.06, 0.01, 0.1))):
        p.beam((-1.52, 0.02 * (k - 1), z), (1.52, -0.02 * (k - 1), z - sag), (0.11, 0.075), kind="wood_grey", roll=twist, bevel=0.015)
    return p


def fence_post():
    p = Prop("fence_post", seed=73)
    p.cylinder(0.09, 1.55, sides=7, loc=(0, 0, -0.25), rot=(-0.01, 0.015, 0), kind="wood_grey", r_top=0.08)
    return p


def skull_longhorn():
    """Sun-bleached longhorn skull lying on the ground, muzzle toward -Y."""
    p = Prop("skull_longhorn", seed=83)
    p.tube([(0, 0.2, 0.1), (0, 0.12, 0.13), (0, 0.0, 0.125), (0, -0.14, 0.1), (0, -0.28, 0.07), (0, -0.36, 0.05)],
           [0.08, 0.105, 0.1, 0.075, 0.052, 0.035], sides=10, kind="bone", flatten=0.75)
    # Poll ridge between the horns.
    p.tube([(-0.1, 0.16, 0.16), (0, 0.17, 0.18), (0.1, 0.16, 0.16)], [0.035, 0.045, 0.035], sides=8, kind="bone")
    for sx in (-1, 1):
        p.tube([(sx * 0.08, 0.16, 0.16), (sx * 0.3, 0.2, 0.17), (sx * 0.52, 0.18, 0.22), (sx * 0.68, 0.1, 0.32), (sx * 0.74, 0.02, 0.42)],
               [0.042, 0.036, 0.028, 0.016, 0.002], sides=8, kind="horn")
        # Eye orbit and nostril pits: dark insets on the bone.
        p.tube([(sx * 0.052, -0.03, 0.148), (sx * 0.078, -0.035, 0.152)], [0.028, 0.024], sides=8, kind="socket")
        p.tube([(sx * 0.025, -0.33, 0.085), (sx * 0.03, -0.34, 0.09)], [0.016, 0.014], sides=6, kind="socket")
    # Jaw bone dropped beside the skull.
    p.tube([(0.22, -0.05, 0.02), (0.26, -0.25, 0.025), (0.24, -0.42, 0.02)], [0.03, 0.022, 0.015], sides=6, kind="bone", flatten=0.5)
    return p


BUILDERS = (barrel, crate, trough, hitch_rail, wheel_lean, wagon_broken, fence_rail, fence_post, skull_longhorn)
