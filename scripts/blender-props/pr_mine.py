"""The mining slice of the western prop kit: a hard-rock silver mine of the
1870s-80s and the camp and railroad that serve it. Same conventions as
pr_props (metres, Z up, long axis X, front -Y).

Frames that other code depends on (src/props.js MINE_*):
  headframe      shaft centre at the origin; back legs rake toward +X, where
                 the hoist house stands. Hoist cable leaves the sheave top at
                 local (0, 0, 13.05).
  hoist_house    centre at the origin, front wall (rope port) at -X, stack at
                 +X with its top at local (4.9, 0, 11.4); rope port at
                 local (-4.05, 0, 2.2).
  ore_bin        bin centre at the origin, chute to the front (-Y), lip at
                 local y -3.35.
  mine_track     one 5 m section along X, centred; gauge 0.6 m.
  smokestack     base at the origin, top at z 13.
"""

import math

from mathutils import Matrix, Vector

from pr_common import Prop
from pr_ranch import _gable_fill
from pr_trail import _stone


def _rand(seed):
    x = math.sin(seed * 71.37) * 43758.5453
    return x - math.floor(x)


def headframe():
    p = Prop("headframe", seed=301)
    # Shaft collar: square cribbing round a dark two-compartment opening.
    for k in range(3):
        z = 0.15 + k * 0.28
        for sy in (-1, 1):
            p.box((4.2, 0.3, 0.28), loc=(0, sy * 1.95, z), kind="wood_dark", grain="x", bevel=0.02)
        for sx in (-1, 1):
            p.box((0.3, 3.6, 0.28), loc=(sx * 1.95, 0, z + 0.14), kind="wood_dark", grain="y", bevel=0.02)
    p.box((3.55, 3.55, 0.05), loc=(0, 0, 0.62), kind="socket", bevel=0)
    p.box((0.2, 3.6, 0.22), loc=(0, 0, 0.82), kind="wood_dark", grain="y")
    # Landing deck on the tramway side (-Y) of the collar.
    for k in range(6):
        p.box((0.24, 2.4, 0.07), loc=(-1.25 + k * 0.5, -3.2, 0.92), kind="board_grey", grain="y", bevel=0.006)
    for sx in (-1, 1):
        p.box((0.18, 2.4, 0.2), loc=(sx * 1.3, -3.2, 0.78), kind="wood_dark", grain="y")
    # Gallows frame: two posts either side of the shaft, girts and X-bracing.
    H = 11.0
    for sy in (-1, 1):
        y = sy * 1.5
        p.box((0.38, 0.38, H), loc=(0, y, H / 2 + 0.3), kind="wood_grey", grain="z", bevel=0.02)
        # Back leg raking to the hoist side.
        p.beam((0.2, y, H - 1.2), (6.2, y, 0.2), (0.34, 0.34), kind="wood_grey", bevel=0.02)
        # Knee brace from post to back leg.
        p.beam((0.15, y, 4.0), (3.9, y, 3.9), (0.22, 0.22), kind="wood_grey", bevel=0.015)
        p.box((0.8, 0.6, 0.5), loc=(6.2, y, 0.15), kind="stone", grain="x", bevel=0.03)
    for z in (3.5, 7.0, 10.3):
        p.box((0.26, 3.4, 0.26), loc=(0, 0, z), kind="wood_grey", grain="y", bevel=0.015)
    for z0, z1 in ((0.9, 3.5), (3.5, 7.0), (7.0, 10.3)):
        for sy in (-1, 1):
            p.beam((0.0, sy * 1.45, z0), (0.0, -sy * 1.45, z1), (0.16, 0.16), kind="wood_grey", roll=0.0, bevel=0.012)
    # Cap and sheave.
    p.box((1.2, 3.6, 0.4), loc=(0, 0, H + 0.5), kind="wood_grey", grain="y", bevel=0.02)
    for sy in (-1, 1):
        p.box((0.5, 0.25, 0.35), loc=(0, sy * 0.35, H + 0.87), kind="iron", bevel=0.01)
    with p.at(Matrix.Translation((0, 0, H + 1.05 + 0.95)) @ Matrix.Rotation(math.pi / 2, 4, "X")):
        p.ring(0.95, 0.12, 0.08, sides=28, kind="iron")
        p.cylinder(0.12, 0.3, sides=10, loc=(0, 0, -0.15), kind="iron")
        for k in range(8):
            a = 2 * math.pi * k / 8
            p.beam((math.cos(a) * 0.1, math.sin(a) * 0.1, 0), (math.cos(a) * 0.88, math.sin(a) * 0.88, 0), (0.05, 0.03), kind="iron", bevel=0.004)
    # Cable down the shaft from the sheave's front.
    p.tube([(-0.95, 0, H + 2.0), (-0.95, 0, 0.9)], [0.025, 0.025], sides=5, kind="rope")
    # Ladder up the -Y post.
    for k in range(14):
        p.cylinder(0.02, 0.5, sides=5, loc=(0.25, -1.75, 1.2 + k * 0.62), rot=(math.pi / 2, 0, 0), kind="iron")
    for sx in (0.0, 0.5):
        p.box((0.06, 0.06, 9.0), loc=(sx, -1.75, 5.5), kind="wood_grey", grain="z", bevel=0.005)
    return p


def hoist_house():
    """Board-and-batten engine house with a boiler stack and the hoist rope port."""
    p = Prop("hoist_house", seed=303)
    L, W, E = 8.0, 6.0, 3.6
    t = 0.12
    p.box((L + 0.4, W + 0.4, 0.3), loc=(0, 0, 0.15), kind="stone", grain="x", bevel=0.03)
    for sy in (-1, 1):
        p.box((L, t, E), loc=(0, sy * (W / 2 - t / 2), 0.3 + E / 2), kind="board_grey", grain="z", bevel=0.01)
    for sx in (-1, 1):
        p.box((t, W - 2 * t, E), loc=(sx * (L / 2 - t / 2), 0, 0.3 + E / 2), kind="board_grey", grain="z", bevel=0.01)
        # Gable ends: panels whose top edge follows the roof line.
        for sy in (-1, 1):
            _gable_fill(p, sx * (L / 2 - t / 2), sy * W / 2, 0.3 + E, 0.0, 0.3 + E + 1.55, t, depth=1.7)
    # Battens.
    for sy in (-1, 1):
        for k in range(9):
            x = -L / 2 + 0.45 + k * 0.89
            p.box((0.07, 0.05, E - 0.1), loc=(x, sy * (W / 2 + 0.01), 0.3 + E / 2), kind="wood_grey", grain="z", bevel=0.005)
    # Openings: a big door on the front (-Y), windows, the rope port at -X.
    p.box((1.8, 0.04, 2.5), loc=(1.2, -W / 2 - 0.02, 0.3 + 1.25), kind="socket", bevel=0)
    for x in (-2.4, 3.1):
        p.box((0.9, 0.04, 0.9), loc=(x, -W / 2 - 0.02, 2.4), kind="socket", bevel=0)
        p.box((1.05, 0.06, 0.08), loc=(x, -W / 2 - 0.04, 1.9), kind="wood_grey")
    p.box((0.04, 0.8, 0.7), loc=(-L / 2 - 0.02, 0, 2.2), kind="socket", bevel=0)
    # Roof: two board planes on a 30 degree pitch.
    pitch = math.atan2(1.55, W / 2)
    for sy in (-1, 1):
        with p.at(Matrix.Translation((0, sy * (W / 4), 0.3 + E + 0.8)) @ Matrix.Rotation(-sy * pitch, 4, "X")):
            p.box((L + 0.6, W / 2 / math.cos(pitch) + 0.45, 0.06), kind="wood_dark", grain="x", bevel=0.01)
    # Boiler stack out the back, guyed to the ground.
    sx = L / 2 + 0.9
    p.box((1.2, 1.2, 1.0), loc=(sx, 0, 0.5), kind="stone", bevel=0.03)
    p.lathe([(0.34, 1.0), (0.3, 11.0), (0.36, 11.1), (0.36, 11.4), (0.3, 11.4)], sides=12, loc=(sx, 0, 0), kind="iron", cap_top=False)
    for z in (4.0, 7.5):
        p.ring(0.34, 0.08, 0.03, sides=12, loc=(sx, 0, z), kind="iron")
    for a in (0.5, 2.6, 4.7):
        gx, gy = sx + math.cos(a) * 3.2, math.sin(a) * 3.2
        p.tube([(sx + math.cos(a) * 0.3, math.sin(a) * 0.3, 8.8), (gx, gy, 0.05)], [0.012, 0.012], sides=4, kind="iron")
        p.box((0.12, 0.12, 0.3), loc=(gx, gy, 0.05), kind="wood_dark", grain="z")
    return p


def ore_bin():
    """Trackside ore bin on timber legs with a chute over the rails (front, -Y)."""
    p = Prop("ore_bin", seed=305)
    bx, by, base, bh = 3.6, 3.0, 3.0, 2.3
    for sx in (-1, 0, 1):
        for sy in (-1, 1):
            p.box((0.3, 0.3, base + 0.2), loc=(sx * (bx / 2 - 0.15), sy * (by / 2 - 0.15), (base + 0.2) / 2), kind="wood_grey", grain="z", bevel=0.015)
    for sy in (-1, 1):
        p.beam((-bx / 2 + 0.15, sy * (by / 2 - 0.15), 0.4), (bx / 2 - 0.15, sy * (by / 2 - 0.15), base - 0.2), (0.16, 0.16), kind="wood_grey", bevel=0.01)
    p.box((bx + 0.2, by + 0.2, 0.3), loc=(0, 0, base + 0.15), kind="wood_dark", grain="x", bevel=0.02)
    for sy in (-1, 1):
        p.box((bx, 0.1, bh), loc=(0, sy * (by / 2 - 0.05), base + 0.3 + bh / 2), kind="board_grey", grain="x", bevel=0.01)
    for sx in (-1, 1):
        p.box((0.1, by - 0.2, bh), loc=(sx * (bx / 2 - 0.05), 0, base + 0.3 + bh / 2), kind="board_grey", grain="y", bevel=0.01)
    for sx in (-1, 0, 1):
        for sy in (-1, 1):
            p.box((0.18, 0.18, bh + 0.2), loc=(sx * (bx / 2 - 0.1), sy * (by / 2 + 0.06), base + 0.3 + bh / 2), kind="wood_grey", grain="z", bevel=0.01)
    # Ore heaped inside.
    k = 0
    for i in range(7):
        k += 1
        _stone(p, ((_rand(k) - 0.5) * 2.6, (_rand(k + 3) - 0.5) * 2.0, base + 1.9 + _rand(k + 5) * 0.4), (0.7, 0.6, 0.4), k + 40, rot_z=_rand(k + 9) * 3)
    # Chute: a sloped open trough from the bin's front out over the track.
    ang = math.radians(28)
    with p.at(Matrix.Translation((0, -by / 2, base + 0.55)) @ Matrix.Rotation(-ang, 4, "X")):
        p.box((0.9, 2.1, 0.06), loc=(0, -1.05, 0), kind="iron", grain="y", bevel=0.005)
        for sx in (-1, 1):
            p.box((0.06, 2.1, 0.35), loc=(sx * 0.45, -1.05, 0.17), kind="wood_grey", grain="y", bevel=0.008)
    p.box((1.0, 0.08, 0.7), loc=(0, -by / 2 - 0.05, base + 0.9), kind="iron", bevel=0.008)
    # Ladder at the back.
    for k in range(9):
        p.cylinder(0.02, 0.5, sides=5, loc=(-0.25, by / 2 + 0.35, 0.4 + k * 0.6), rot=(0, math.pi / 2, 0), kind="iron")
    for x in (-0.28, 0.28):
        p.box((0.07, 0.07, 5.6), loc=(x, by / 2 + 0.35, 2.8), kind="wood_grey", grain="z", bevel=0.005)
    return p


def mine_track():
    """5 m of 24-inch-gauge mine track."""
    p = Prop("mine_track", seed=307)
    for k in range(9):
        x = -2.5 + 0.28 + k * 0.555
        p.box((0.16, 1.0, 0.1), loc=(x, (_rand(k) - 0.5) * 0.06, 0.05), rot=(0, 0, (_rand(k + 4) - 0.5) * 0.08), kind="wood_dark", grain="y", bevel=0.01)
    for sy in (-1, 1):
        p.box((5.0, 0.05, 0.07), loc=(0, sy * 0.3, 0.135), kind="iron", grain="x", bevel=0.004)
    return p


def mine_car():
    """A side-dump ore car heaped with ore, on 24-inch gauge."""
    p = Prop("mine_car", seed=309)
    z0 = 0.34
    p.box((1.3, 0.8, 0.08), loc=(0, 0, z0), kind="iron", bevel=0.01)
    for sy in (-1, 1):
        p.beam((-0.66, sy * 0.4, z0), (-0.66, sy * 0.48, z0 + 0.55), (0.04, 0.04), kind="iron", bevel=0.004)
        p.box((1.36, 0.04, 0.55), loc=(0, sy * 0.44, z0 + 0.3), rot=(sy * 0.12, 0, 0), kind="iron", bevel=0.006)
    for sx in (-1, 1):
        p.box((0.04, 0.9, 0.55), loc=(sx * 0.66, 0, z0 + 0.3), kind="iron", bevel=0.006)
    for x in (-0.66, 0.66):
        p.box((0.06, 1.0, 0.06), loc=(x, 0, z0 + 0.58), kind="iron", bevel=0.004)
    for sx in (-1, 1):
        for sy in (-1, 1):
            with p.at(Matrix.Translation((sx * 0.4, sy * 0.3, 0.19)) @ Matrix.Rotation(math.pi / 2, 4, "X")):
                p.lathe([(0.17, -0.03), (0.17, 0.03)], sides=12, kind="iron")
        p.box((0.12, 0.7, 0.1), loc=(sx * 0.4, 0, 0.26), kind="wood_dark", grain="y", bevel=0.008)
    k = 0
    for i in range(6):
        k += 1
        _stone(p, ((_rand(k) - 0.5) * 0.9, (_rand(k + 2) - 0.5) * 0.5, z0 + 0.45 + _rand(k + 7) * 0.12), (0.34, 0.3, 0.22), k + 60, rot_z=_rand(k + 11) * 3)
    return p


def powder_magazine():
    """A squat stone powder house with an iron door, well apart from the works."""
    p = Prop("powder_magazine", seed=311)
    L, W, H = 3.4, 2.8, 2.3
    k = 0
    for row in range(6):
        z = 0.2 + row * 0.38
        for side in range(4):
            along = L if side < 2 else W
            n = 5 if side < 2 else 4
            for i in range(n):
                k += 1
                u = -along / 2 + (i + 0.5 + (0.5 if row % 2 else 0)) * along / n
                if abs(u) > along / 2 - 0.2:
                    u = math.copysign(along / 2 - 0.2, u)
                size = (along / n * 0.95, 0.42, 0.36)
                if side < 2:
                    loc = (u, (1 if side else -1) * (W / 2 - 0.21), z)
                    p.box(size, loc=loc, kind="stone", grain="x", bevel=0.04)
                else:
                    loc = ((1 if side == 3 else -1) * (L / 2 - 0.21), u, z)
                    p.box((0.42, along / n * 0.95, 0.36), loc=loc, kind="stone", grain="y", bevel=0.04)
    # Iron door on the front, a painted board above it.
    p.box((0.9, 0.05, 1.7), loc=(0, -W / 2 - 0.02, 0.9), kind="iron", grain="z", bevel=0.01)
    for z in (0.35, 1.45):
        for x in (-0.3, 0.3):
            p.box((0.05, 0.03, 0.05), loc=(x, -W / 2 - 0.05, z), kind="iron", bevel=0.005)
    p.box((1.3, 0.04, 0.26), loc=(0, -W / 2 - 0.03, 2.05), kind="sign_board", grain="x", bevel=0.006)
    # Flat roof of heavy planks under a mound of earth and stones.
    p.box((L + 0.3, W + 0.3, 0.18), loc=(0, 0, H + 0.09), kind="wood_dark", grain="x", bevel=0.02)
    for i in range(6):
        k += 1
        _stone(p, ((_rand(k) - 0.5) * 2.4, (_rand(k + 2) - 0.5) * 1.8, H + 0.12), (0.5, 0.45, 0.2), k + 80, rot_z=_rand(k + 5) * 3)
    return p


def water_tank():
    """Boiler water: a staved tank on a braced timber tower."""
    p = Prop("water_tank", seed=313)
    s, h = 1.3, 3.6
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.beam((sx * (s + 0.2), sy * (s + 0.2), 0.0), (sx * s, sy * s, h), (0.26, 0.26), kind="wood_grey", bevel=0.015)
    for z0, z1 in ((0.3, h - 0.3),):
        for sx in (-1, 1):
            p.beam((sx * (s + 0.15), -s - 0.1, z0), (sx * s, s, z1), (0.12, 0.12), kind="wood_grey", bevel=0.01)
            p.beam((-s - 0.1, sx * (s + 0.15), z0), (s, sx * s, z1), (0.12, 0.12), kind="wood_grey", bevel=0.01)
    p.box((2 * s + 0.6, 2 * s + 0.6, 0.22), loc=(0, 0, h + 0.11), kind="wood_dark", grain="x", bevel=0.02)
    tank = [(1.45, 0.0), (1.5, 0.3), (1.52, 1.2), (1.5, 2.1), (1.45, 2.4)]
    p.lathe(tank, sides=18, loc=(0, 0, h + 0.22), kind="stave", cap_bottom=True, cap_top=False)
    for z in (0.3, 1.2, 2.1):
        p.ring(1.54, 0.05, 0.015, sides=18, loc=(0, 0, h + 0.22 + z), kind="iron")
    p.lathe([(1.6, 0.0), (1.6, 0.05), (0.05, 0.7)], sides=18, loc=(0, 0, h + 2.62), kind="wood_dark", cap_bottom=True, cap_top=False)
    p.tube([(1.3, 0, h + 0.4), (1.9, 0, h + 0.2), (2.05, 0, 1.2)], [0.06, 0.06, 0.06], sides=6, kind="iron")
    return p


def timber_stack():
    """Square-set mine timbers waiting at the collar."""
    p = Prop("timber_stack", seed=315)
    k = 0
    for layer in range(4):
        z = 0.14 + layer * 0.26
        if layer % 2 == 0:
            for i in range(5):
                k += 1
                p.box((3.2, 0.25, 0.25), loc=((_rand(k) - 0.5) * 0.15, -0.7 + i * 0.35, z), rot=(0, 0, (_rand(k + 2) - 0.5) * 0.04), kind="wood", grain="x", bevel=0.02)
        else:
            for x in (-1.3, 0.0, 1.3):
                k += 1
                p.box((0.22, 1.7, 0.22), loc=(x, 0, z), kind="wood_dark", grain="y", bevel=0.02)
    return p


def powder_crates():
    """A stack of blasting-powder boxes with painted lids."""
    p = Prop("powder_crates", seed=317)
    for i, (x, y, z, a) in enumerate(((-0.34, 0, 0, 0.02), (0.34, 0.03, 0, -0.03), (0.0, -0.02, 0.36, 0.1), (-0.05, 0.4, 0.0, 0.3))):
        with p.at(Matrix.Translation((x, y, z)) @ Matrix.Rotation(a, 4, "Z")):
            p.box((0.62, 0.38, 0.34), loc=(0, 0, 0.17), kind="wood", grain="x", bevel=0.01)
            p.box((0.5, 0.01, 0.12), loc=(0, -0.195, 0.19), kind="sign_board", grain="x", bevel=0)
            for sx in (-1, 1):
                p.box((0.04, 0.4, 0.36), loc=(sx * 0.29, 0, 0.17), kind="wood_dark", grain="z", bevel=0.005)
    return p


def smokestack():
    """A free-standing iron boiler stack for the mill, on a stone base, guyed."""
    p = Prop("smokestack", seed=319)
    p.box((1.4, 1.4, 1.2), loc=(0, 0, 0.5), kind="stone", bevel=0.04)
    p.lathe([(0.42, 1.1), (0.36, 12.7), (0.44, 12.8), (0.44, 13.0), (0.36, 13.0)], sides=14, kind="iron", cap_top=False)
    for z in (4.0, 8.0, 11.5):
        p.ring(0.42 - z * 0.004, 0.08, 0.03, sides=14, loc=(0, 0, z), kind="iron")
    for a in (0.3, 2.4, 4.5):
        gx, gy = math.cos(a) * 3.6, math.sin(a) * 3.6
        p.tube([(math.cos(a) * 0.38, math.sin(a) * 0.38, 10.0), (gx, gy, 0.05)], [0.012, 0.012], sides=4, kind="iron")
        p.box((0.12, 0.12, 0.3), loc=(gx, gy, 0.05), kind="wood_dark", grain="z")
    return p


def wall_tent():
    """A canvas wall tent, door flap tied back, guyed out."""
    p = Prop("wall_tent", seed=321)
    L, W, wall, ridge = 4.0, 3.0, 1.3, 2.5
    t = 0.03
    for sy in (-1, 1):
        p.box((L, t, wall), loc=(0, sy * W / 2, wall / 2), kind="canvas", grain="x", bevel=0.005)
    # Roof panels sagging very slightly between ridge and eave.
    half = math.hypot(W / 2, ridge - wall)
    ang = math.atan2(ridge - wall, W / 2)
    for sy in (-1, 1):
        with p.at(Matrix.Translation((0, sy * W / 4, (ridge + wall) / 2)) @ Matrix.Rotation(-sy * ang, 4, "X")):
            p.box((L + 0.3, half + 0.1, t), kind="canvas", grain="x", bevel=0.005)
    # End walls: back closed, front with a dark doorway and a tied-back flap.
    for sx in (-1, 1):
        x = sx * L / 2
        p.box((t, W, wall), loc=(x, 0, wall / 2), kind="canvas", grain="y", bevel=0.005)
        for sy in (-1, 1):
            _gable_fill(p, x, sy * W / 2, wall, 0.0, ridge, t, depth=1.2, kind="canvas")
    p.box((0.04, 1.0, 1.9), loc=(-L / 2 - 0.02, 0, 0.95), kind="socket", bevel=0)
    p.box((0.05, 0.35, 1.8), loc=(-L / 2 - 0.05, 0.6, 0.92), rot=(0.1, 0, 0), kind="canvas", grain="z", bevel=0.004)
    # Poles and ridge.
    for sx in (-1, 1):
        p.cylinder(0.035, ridge + 0.15, sides=6, loc=(sx * (L / 2 + 0.05), 0, 0), kind="wood_grey")
    p.cylinder(0.035, L + 0.2, sides=6, loc=(-L / 2 - 0.1, 0, ridge + 0.02), rot=(0, math.pi / 2, 0), kind="wood_grey")
    # Guy ropes and stakes along both sides.
    for sy in (-1, 1):
        for x in (-1.4, 0.0, 1.4):
            p.tube([(x, sy * W / 2, wall), (x, sy * (W / 2 + 1.1), 0.05)], [0.01, 0.01], sides=4, kind="rope")
            p.box((0.04, 0.04, 0.25), loc=(x, sy * (W / 2 + 1.12), 0.05), kind="wood_dark", grain="z", bevel=0)
    # Stovepipe through the back roof.
    p.cylinder(0.08, 1.2, sides=8, loc=(L / 2 - 0.6, 0.55, ridge - 0.4), kind="iron")
    return p


def cook_fly():
    """The camp cookhouse: a canvas fly on poles over a plank table and a stove."""
    p = Prop("cook_fly", seed=323)
    L, W = 5.0, 4.0
    for sx in (-1, 0, 1):
        for sy in (-1, 1):
            h = 2.2 + (0.35 if sx == 0 else 0)
            p.cylinder(0.05, h, sides=6, loc=(sx * L / 2, sy * W / 2, 0), kind="wood_grey")
    ang = math.atan2(0.35, W / 2)
    for sy in (-1, 1):
        with p.at(Matrix.Translation((0, sy * W / 4, 2.2 + 0.2)) @ Matrix.Rotation(-sy * ang, 4, "X")):
            p.box((L + 0.5, W / 2 + 0.4, 0.03), kind="canvas", grain="x", bevel=0.005)
    # Plank table and benches.
    p.box((3.0, 0.9, 0.06), loc=(-0.3, 0.4, 0.78), kind="board_grey", grain="x", bevel=0.008)
    for sx in (-1, 1):
        p.box((0.08, 0.7, 0.75), loc=(-0.3 + sx * 1.3, 0.4, 0.375), kind="wood_grey", grain="z", bevel=0.008)
    for sy in (-1, 1):
        p.box((3.0, 0.3, 0.05), loc=(-0.3, 0.4 + sy * 0.75, 0.45), kind="board_grey", grain="x", bevel=0.006)
        for sx in (-1, 1):
            p.box((0.06, 0.25, 0.43), loc=(-0.3 + sx * 1.3, 0.4 + sy * 0.75, 0.215), kind="wood_grey", grain="z", bevel=0.005)
    # Box stove with its pipe up past the fly.
    p.box((0.9, 0.6, 0.55), loc=(1.8, -1.0, 0.5), kind="iron", grain="x", bevel=0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((0.06, 0.06, 0.25), loc=(1.8 + sx * 0.38, -1.0 + sy * 0.23, 0.12), kind="iron", bevel=0.005)
    p.cylinder(0.07, 2.4, sides=8, loc=(2.1, -1.0, 0.78), kind="iron")
    p.lathe([(0.075, 0.0), (0.085, 0.02), (0.07, 0.17), (0.045, 0.2), (0.0, 0.22)], sides=10, loc=(1.6, -1.0, 0.78), kind="zinc")
    return p


def buffer_stop():
    """End of track: a timber buffer across the rails, braced back into the ground."""
    p = Prop("buffer_stop", seed=325)
    # Track runs along X toward +X; the buffer faces -X.
    for sy in (-1, 1):
        p.box((1.6, 0.26, 0.9), loc=(0.2, sy * 0.58, 0.45), kind="wood_dark", grain="x", bevel=0.03)
        p.beam((0.9, sy * 0.58, 0.8), (2.2, sy * 0.58, 0.05), (0.26, 0.26), kind="wood_dark", bevel=0.02)
    p.box((0.4, 2.6, 0.45), loc=(-0.45, 0, 0.72), kind="wood_grey", grain="y", bevel=0.03)
    p.box((0.06, 0.3, 0.3), loc=(-0.67, 0, 0.72), kind="iron", bevel=0.01)
    for sy in (-1, 1):
        p.box((0.05, 0.3, 0.3), loc=(-0.67, sy * 0.9, 0.72), kind="sign_board", grain="y", bevel=0.004)
    for k in range(3):
        p.box((0.26, 2.4, 0.16), loc=(0.2 + k * 1.0, 0, 0.08), kind="wood_dark", grain="y", bevel=0.015)
    return p


def rail_stack():
    """Construction front: a pile of rails on skids and a cribbed stack of ties."""
    p = Prop("rail_stack", seed=327)
    for x in (-2.5, 0.0, 2.5):
        p.box((0.24, 1.6, 0.2), loc=(x, 0, 0.1), kind="wood_dark", grain="y", bevel=0.015)
    for layer in range(2):
        for i in range(5 - layer):
            y = -0.6 + (i + layer * 0.5) * 0.3
            z = 0.26 + layer * 0.13
            p.box((7.0, 0.1, 0.12), loc=((_rand(i + layer * 7) - 0.5) * 0.3, y, z), kind="iron", grain="x", bevel=0.006)
    # Ties, cribbed 2.4 m long, beside the rails.
    for layer in range(6):
        z = 0.08 + layer * 0.165
        for i in range(4):
            if layer % 2 == 0:
                p.box((2.4, 0.24, 0.16), loc=(0.5 + (_rand(layer + i) - 0.5) * 0.1, 1.5 + i * 0.3, z), kind="wood_dark", grain="x", bevel=0.012)
            else:
                p.box((0.24, 1.2, 0.16), loc=(-0.5 + i * 0.66, 1.95, z), kind="wood_dark", grain="y", bevel=0.012)
    return p


BUILDERS = (headframe, hoist_house, ore_bin, mine_track, mine_car, powder_magazine, water_tank, timber_stack,
            powder_crates, smokestack, wall_tent, cook_fly, buffer_stop, rail_stack)
