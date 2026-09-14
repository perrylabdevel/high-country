"""The fort slice of the western prop kit: an abandoned frontier army post of
the 1870s. Same conventions as pr_props (metres, Z up, long axis X, front -Y).

Frames other code depends on (src/fort.js):
  cannon       carriage centred at the origin, muzzle toward +X.
  flagpole     base at the origin; the flag hangs off the halyard toward +X.
  army_wagon   same frame as wagon_farm (tongue toward +X).
"""

import math

from mathutils import Matrix, Vector

from pr_common import Prop
from pr_props import _wheel
from pr_trail import _stone


def _rand(seed):
    x = math.sin(seed * 63.71) * 43758.5453
    return x - math.floor(x)


def cannon():
    """A 12-pounder mountain howitzer on its trail carriage, muzzle +X."""
    p = Prop("cannon", seed=401)
    axle_z = 0.52
    # Barrel: bronze gone dark; a lathe along +X, trunnions on the axle line.
    with p.at(Matrix.Translation((0.05, 0, axle_z + 0.3)) @ Matrix.Rotation(math.pi / 2, 4, "Y") @ Matrix.Rotation(0.06, 4, "X")):
        p.lathe([(0.0, -0.55), (0.09, -0.55), (0.14, -0.42), (0.16, -0.2), (0.15, 0.2), (0.12, 0.7), (0.105, 0.72), (0.13, 0.78), (0.13, 0.82), (0.05, 0.82)],
                sides=14, kind="iron", cap_bottom=False, cap_top=True)
    for sy in (-1, 1):
        p.cylinder(0.05, 0.1, sides=8, loc=(0.05, sy * 0.13, axle_z + 0.3), rot=(math.pi / 2, 0, 0), kind="iron")
    # Carriage cheeks and trail running back to the ground.
    for sy in (-1, 1):
        p.beam((0.35, sy * 0.19, axle_z + 0.22), (-1.55, sy * 0.1, 0.08), (0.08, 0.2), kind="paint_green", bevel=0.01)
    p.box((0.2, 0.3, 0.12), loc=(-1.5, 0, 0.1), kind="iron", bevel=0.01)
    for x in (-0.4, -1.0):
        p.box((0.1, 0.36, 0.1), loc=(x, 0, axle_z - 0.05 + x * 0.22), kind="paint_green", grain="y", bevel=0.01)
    p.beam((0, -0.6, axle_z), (0, 0.6, axle_z), (0.08, 0.08), kind="iron", bevel=0.006)
    for sy in (-1, 1):
        with p.at(Matrix.Translation((0, sy * 0.52, axle_z)) @ Matrix.Rotation(math.pi / 2, 4, "X")):
            _wheel(p, 0.5, hub_len=0.16, spokes=12)
    return p


def cannonballs():
    """A pyramid of shot beside the gun."""
    p = Prop("cannonballs", seed=403)
    r = 0.06
    for layer, n in enumerate((4, 3, 2, 1)):
        for i in range(n):
            for j in range(n):
                x = (i - (n - 1) / 2) * 2 * r
                y = (j - (n - 1) / 2) * 2 * r
                z = r + layer * r * 1.42
                p.lathe([(0.0, -r), (r * 0.87, -r * 0.5), (r * 0.87, r * 0.5), (0.0, r)], sides=6, loc=(x, y, z), kind="iron", cap_bottom=False, cap_top=False)
    p.box((0.62, 0.62, 0.04), loc=(0, 0, -0.01), kind="wood_dark", bevel=0.005)
    return p


def flagpole():
    """A post flagpole with a topmast, halyard and a tattered, faded flag."""
    p = Prop("flagpole", seed=405)
    p.box((0.9, 0.9, 0.35), loc=(0, 0, 0.1), kind="stone", bevel=0.04)
    p.lathe([(0.13, 0.0), (0.11, 7.0), (0.09, 7.2)], sides=10, kind="wood_grey", cap_bottom=False)
    p.lathe([(0.07, 7.0), (0.05, 11.5), (0.09, 11.55), (0.09, 11.7), (0.0, 11.75)], sides=8, kind="wood_grey", cap_bottom=False)
    for z in (7.0, 7.2):
        p.ring(0.13, 0.06, 0.02, sides=10, loc=(0, 0, z), kind="iron")
    p.box((1.6, 0.08, 0.08), loc=(0, 0, 8.0), kind="wood_grey", bevel=0.01)
    # Halyard, and a small faded flag hanging at half height from years of wind.
    p.tube([(0.1, 0, 11.6), (0.12, 0, 1.2)], [0.008, 0.008], sides=4, kind="rope")
    flag_w, flag_h, top = 1.5, 0.95, 9.9
    cols, rows = 8, 5
    for i in range(cols):
        for j in range(rows):
            if (i >= cols - 2 and j in (0, rows - 1)) or (i == cols - 1 and j == 2 and _rand(i) > 0.3):
                continue  # frayed fly end
            u = (i + 0.5) / cols
            x = 0.14 + u * flag_w
            z = top - (j + 0.5) / rows * flag_h - u * u * 0.25
            y = math.sin(u * 5.0) * 0.08
            kind = "flag_blue" if (i < 3 and j < 3) else ("flag_red" if j % 2 == 0 else "canvas")
            p.box((flag_w / cols + 0.005, 0.012, flag_h / rows + 0.005), loc=(x, y, z), rot=(0, 0.25 * u * u, math.cos(u * 5.0) * 0.12), kind=kind, grain="x", bevel=0)
    return p


def well():
    """A stone-curbed well with a windlass, roof and bucket."""
    p = Prop("well", seed=407)
    k = 0
    for ring in range(3):
        z = 0.15 + ring * 0.24
        n = 8
        for i in range(n):
            k += 1
            a = 2 * math.pi * (i + 0.5 * (ring % 2)) / n
            _stone(p, (math.cos(a) * 0.72, math.sin(a) * 0.72, z - 0.15), (0.5, 0.3, 0.26), k + 200, rot_z=a + math.pi / 2, sides=5)
    p.lathe([(0.55, 0.0), (0.55, 0.62)], sides=14, kind="socket", cap_bottom=False, cap_top=True)
    for sy in (-1, 1):
        p.box((0.12, 0.12, 2.1), loc=(0, sy * 0.95, 1.05), kind="wood_grey", grain="z", bevel=0.01)
    p.cylinder(0.08, 2.0, sides=8, loc=(0, -1.0, 1.35), rot=(-math.pi / 2, 0, 0), kind="wood")
    p.beam((0, 1.0, 1.35), (0.28, 1.1, 1.1), (0.04, 0.04), kind="iron", bevel=0.004)
    pitch = math.atan2(0.55, 0.8)
    for sx in (-1, 1):
        with p.at(Matrix.Translation((sx * 0.4, 0, 2.35)) @ Matrix.Rotation(sx * pitch, 4, "Y")):
            p.box((1.05, 2.3, 0.04), kind="wood_dark", grain="y", bevel=0.008)
    p.tube([(0, 0, 1.35), (0, 0, 0.9)], [0.008, 0.008], sides=4, kind="rope")
    p.lathe([(0.1, 0.0), (0.13, 0.25), (0.13, 0.27)], sides=10, loc=(0, 0, 0.64), kind="stave", cap_top=False)
    return p


def saddle_rack():
    """A timber rack with three cavalry saddles left on it."""
    p = Prop("saddle_rack", seed=409)
    L = 2.4
    for sx in (-1, 1):
        p.box((0.1, 0.5, 0.1), loc=(sx * L / 2, 0, 0.05), kind="wood_grey", grain="y")
        p.beam((sx * L / 2, -0.2, 0.1), (sx * L / 2, 0, 1.0), (0.08, 0.08), kind="wood_grey", bevel=0.01)
        p.beam((sx * L / 2, 0.2, 0.1), (sx * L / 2, 0, 1.0), (0.08, 0.08), kind="wood_grey", bevel=0.01)
    p.box((L + 0.2, 0.1, 0.1), loc=(0, 0, 1.02), kind="wood_grey", bevel=0.01)
    for i, x in enumerate((-0.75, 0.05, 0.8)):
        with p.at(Matrix.Translation((x, 0, 1.08)) @ Matrix.Rotation((_rand(i) - 0.5) * 0.2, 4, "Z")):
            # McClellan saddle: a split tree over the rail, skirts either side.
            p.lathe([(0.0, -0.28), (0.14, -0.24), (0.2, -0.05), (0.18, 0.12), (0.12, 0.28), (0.0, 0.3)], sides=10,
                    rot=(math.pi / 2, 0, math.pi / 2), kind="leather", cap_bottom=False, cap_top=False)
            for sy in (-1, 1):
                p.box((0.46, 0.03, 0.34), loc=(0, sy * 0.2, -0.16), rot=(sy * 0.3, 0, 0), kind="leather", grain="x", bevel=0.01)
                p.tube([(0, sy * 0.23, -0.1), (0.02, sy * 0.25, -0.45)], [0.008, 0.008], sides=4, kind="leather")
                p.ring(0.05, 0.015, 0.01, sides=8, loc=(0.02, sy * 0.25, -0.5), rot=(math.pi / 2, 0, 0), kind="iron")
    return p


def army_wagon():
    """A six-mule army escort wagon, its canvas cover rotted to rags on the bows."""
    p = Prop("army_wagon", seed=411)
    rear_r, front_r = 0.66, 0.54
    for x, r in ((-1.1, rear_r), (1.1, front_r)):
        p.beam((x, -0.9, r), (x, 0.9, r), (0.1, 0.1), kind="wood_dark")
        for y in (-0.9, 0.9):
            with p.at(Matrix.Translation((x, y, r)) @ Matrix.Rotation(math.pi / 2, 4, "X")):
                _wheel(p, r, hub_len=0.22)
    p.beam((-1.3, 0, rear_r - 0.02), (1.3, 0, front_r + 0.02), (0.08, 0.08), kind="wood_dark")
    bed = rear_r + 0.14
    with p.at(Matrix.Translation((0, 0, bed))):
        for y in (-0.4, 0.4):
            p.box((3.5, 0.1, 0.1), loc=(0, y, 0.05), kind="wood_dark")
        for y in (-0.46, -0.23, 0.0, 0.23, 0.46):
            p.box((3.5, 0.22, 0.035), loc=(0, y, 0.118), kind="wood_grey")
        for sy in (-1, 1):
            for z in (0.24, 0.43, 0.62):
                p.box((3.5, 0.035, 0.18), loc=(0, sy * 0.6, z), kind="paint_green" if z > 0.3 else "wood_grey")
        for x in (-1.72, 1.72):
            p.box((0.035, 1.22, 0.55), loc=(x, 0, 0.42), kind="paint_green", grain="y")
        # Bows: five hoops, the cover hanging in tatters from three of them.
        for i, x in enumerate((-1.5, -0.75, 0.0, 0.75, 1.5)):
            pts = [(x, -0.62 + 0.0, 0.6)] + [(x, -0.62 * math.cos(a), 0.6 + 0.95 * math.sin(a)) for a in (0.4, 0.8, 1.2, 1.5708, 1.95, 2.35, 2.75)] + [(x, 0.62, 0.6)]
            p.tube(pts, [0.02] * len(pts), sides=5, kind="wood_grey", cap_end=True)
        # What is left of the cover, rolled and lashed behind the seat.
        p.tube([(1.45, -0.62, 0.72), (1.45, 0.0, 0.8), (1.45, 0.62, 0.72)], [0.13, 0.15, 0.13], sides=8, kind="canvas")
    # Tongue down in the grass.
    p.beam((1.2, 0, front_r - 0.05), (3.6, 0.2, 0.06), (0.09, 0.08), kind="wood_dark")
    return p


def sentry_box():
    p = Prop("sentry_box", seed=413)
    W, D, H = 1.1, 1.0, 2.3
    t = 0.04
    for sx in (-1, 1):
        p.box((t, D, H), loc=(sx * (W / 2 - t / 2), 0, H / 2), kind="board_grey", grain="z", bevel=0.005)
    p.box((W, t, H), loc=(0, D / 2 - t / 2, H / 2), kind="board_grey", grain="z", bevel=0.005)
    p.box((W, D, 0.06), loc=(0, 0, 0.1), kind="wood_dark", bevel=0.005)
    for sy in (-1, 1):
        with p.at(Matrix.Translation((0, sy * D / 4, H + 0.15)) @ Matrix.Rotation(-sy * 0.5, 4, "X")):
            p.box((W + 0.2, D / 2 / math.cos(0.5) + 0.15, 0.04), kind="wood_dark", grain="x", bevel=0.008)
    for sx in (-1, 1):
        p.box((0.06, D + 0.05, 0.3), loc=(sx * (W / 2 - 0.03), 0, H + 0.1), kind="board_grey", grain="y", bevel=0.005)
    return p


def rifle_crates():
    """Long rifle crates, one burst open and empty, and a keg of cartridges."""
    p = Prop("rifle_crates", seed=415)
    for i, (x, y, z, a) in enumerate(((0, -0.25, 0, 0.0), (0.05, 0.25, 0, 0.03), (0.0, 0.0, 0.36, -0.05))):
        with p.at(Matrix.Translation((x, y, z)) @ Matrix.Rotation(a, 4, "Z")):
            p.box((1.3, 0.42, 0.34), loc=(0, 0, 0.17), kind="wood", grain="x", bevel=0.01)
            p.box((0.6, 0.01, 0.12), loc=(0, -0.215, 0.19), kind="sign_board", grain="x", bevel=0)
            for sx in (-1, 1):
                p.box((0.04, 0.44, 0.36), loc=(sx * 0.6, 0, 0.17), kind="wood_dark", grain="z", bevel=0.005)
    # Lid prised off the top crate, lying against the stack.
    p.box((1.3, 0.035, 0.42), loc=(0.1, -0.62, 0.22), rot=(0.25, 0, 0.05), kind="wood", grain="x", bevel=0.006)
    p.lathe([(0.17, 0.0), (0.2, 0.25), (0.17, 0.5), (0.15, 0.5)], sides=12, loc=(0.95, 0.1, 0), kind="stave", cap_top=True)
    for z in (0.06, 0.44):
        p.ring(0.19 - abs(z - 0.25) * 0.1, 0.03, 0.01, sides=12, loc=(0.95, 0.1, z), kind="iron")
    return p


def rubble_pile():
    """Stones fallen from the top of a wall, with a charred timber in them."""
    p = Prop("rubble_pile", seed=417)
    k = 0
    for i in range(16):
        k += 1
        x = (_rand(k) - 0.5) * 3.2
        y = (_rand(k + 2) - 0.5) * 1.2
        s = 0.25 + 0.35 * _rand(k + 4) * (1 - abs(x) / 2.2)
        _stone(p, (x, y, -0.05 + _rand(k + 6) * 0.15), (s * 1.3, s, s * 0.7), k + 300, rot_z=_rand(k + 8) * 3.1)
    p.beam((-1.2, 0.4, 0.15), (1.1, -0.2, 0.45), (0.18, 0.16), kind="char", bevel=0.02)
    return p


BUILDERS = (cannon, cannonballs, flagpole, well, saddle_rack, army_wagon, sentry_box, rifle_crates, rubble_pile)
