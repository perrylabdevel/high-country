"""The trail and roadside slice of the western prop kit: what a stage road
and the trails off it collect over twenty years of use. Same conventions as
pr_props (metres, Z up, base on z=0, long axis X, front -Y).

Two pieces are assembled at runtime rather than modelled whole:
  signpost + sign_arm  the post stands alone; src/props.js yaws one arm per
      road branch. An arm's pivot is the post axis, board along +X, centred
      on z = 0 (placed at an explicit height).
  telegraph_pole  wires are drawn between poles by src/props.js from the
      insulator grooves at local (+-0.5, -0.13, 6.69), glTF (+-0.5, 6.69, 0.13).
"""

import math

from mathutils import Matrix, Vector

from pr_common import Prop


def _rand(seed):
    x = math.sin(seed * 57.113) * 43758.5453
    return x - math.floor(x)


def _stone(p, loc, size, seed, rot_z=0.0, tilt=0.0, kind="fieldstone", sides=7):
    """A rounded fieldstone: a jittered, flattened lathe blob."""
    sx, sy, sz = size
    frame = Matrix.Translation(loc) @ Matrix.Rotation(rot_z, 4, "Z") @ Matrix.Rotation(tilt, 4, "X") @ Matrix.Diagonal((sx, sy, sz, 1.0))
    with p.at(frame):
        p.lathe([(0.35, 0.0), (0.5, 0.2), (0.48, 0.62), (0.3, 0.92), (0.08, 1.0)], sides=sides, kind=kind, jitter=0.22 + 0.1 * _rand(seed))


def telegraph_pole():
    p = Prop("telegraph_pole", seed=201)
    # Cedar pole, butt sunk 0.4 m below grade.
    p.lathe([(0.14, -0.4), (0.13, 1.0), (0.11, 5.0), (0.095, 7.0), (0.07, 7.08)], sides=8, kind="wood_grey", cap_bottom=False)
    arm_z = 6.5
    p.box((1.3, 0.1, 0.09), loc=(0, -0.13, arm_z), kind="wood_grey", bevel=0.01)
    for sx in (-1, 1):
        # Diagonal braces from the arm back to the pole.
        p.beam((sx * 0.38, -0.1, arm_z - 0.04), (0, -0.1, arm_z - 0.55), (0.05, 0.012), kind="iron", bevel=0.002)
        # Oak pin and a glass insulator on it.
        x = sx * 0.5
        p.cylinder(0.018, 0.09, sides=6, loc=(x, -0.13, arm_z + 0.045), kind="wood")
        p.lathe([(0.03, 0.0), (0.045, 0.01), (0.043, 0.06), (0.03, 0.075), (0.036, 0.09), (0.02, 0.12), (0.0, 0.125)],
                sides=10, loc=(x, -0.13, arm_z + 0.1), kind="glass", cap_bottom=True, cap_top=False)
    # Step spikes up the pole.
    for k in range(6):
        z = 2.2 + k * 0.7
        a = math.pi / 2 if k % 2 else -math.pi / 2
        p.cylinder(0.012, 0.22, sides=5, loc=(0, 0, z), rot=(a, 0, 0), kind="iron")
    return p


def mile_marker():
    """A squared stage-road milepost with painted plates front and back."""
    p = Prop("mile_marker", seed=203)
    h = 1.1
    p.box((0.17, 0.17, h + 0.25), loc=(0, 0, (h - 0.25) / 2), kind="wood_grey", grain="z", bevel=0.015)
    # Pyramid cap: a four-sided lathe turned to sit square on the post.
    p.lathe([(0.125, h), (0.125, h + 0.03), (0.0, h + 0.13)], sides=4, rot=(0, 0, math.pi / 4), kind="wood_grey", cap_bottom=True, cap_top=False)
    for sy in (-1, 1):
        p.box((0.145, 0.012, 0.3), loc=(0, sy * 0.091, h - 0.28), kind="sign_board", grain="x", bevel=0.003)
        for sx in (-1, 1):
            p.box((0.012, 0.006, 0.012), loc=(sx * 0.055, sy * 0.099, h - 0.16), kind="iron", bevel=0)
    return p


def signpost():
    p = Prop("signpost", seed=205)
    p.lathe([(0.085, -0.35), (0.08, 2.0), (0.075, 2.75)], sides=8, kind="wood_grey", cap_bottom=False, cap_kind="endgrain")
    return p


def sign_arm():
    """One pointing board. Pivot on the post axis, board along +X, centred on z=0."""
    p = Prop("sign_arm", seed=207)
    y = -0.1
    p.box((0.82, 0.03, 0.19), loc=(0.51, y, 0), kind="sign_board", grain="x", bevel=0.006)
    # Arrow point: a diamond set into the board's end.
    p.box((0.135, 0.028, 0.135), loc=(0.92, y, 0), rot=(0, math.pi / 4, 0), kind="wood_grey", grain="x", bevel=0.004)
    # Square-headed nails into the post.
    for z in (-0.05, 0.05):
        p.box((0.018, 0.012, 0.018), loc=(0.14, y - 0.018, z), kind="iron", bevel=0)
    # Backing cleat that meets the post.
    p.box((0.1, 0.05, 0.15), loc=(0.08, -0.06, 0), kind="wood_grey", grain="z")
    return p


def cairn():
    """A trail cairn of fieldstones, about 0.9 m."""
    p = Prop("cairn", seed=211)
    layers = [
        [(0.0, 0.0, 0.0, (0.62, 0.55, 0.26)), (0.34, 0.1, 0.0, (0.36, 0.32, 0.22)), (-0.3, -0.18, 0.0, (0.34, 0.3, 0.2))],
        [(0.04, 0.02, 0.22, (0.5, 0.44, 0.22)), (-0.18, 0.14, 0.2, (0.28, 0.26, 0.18))],
        [(-0.02, 0.0, 0.4, (0.4, 0.34, 0.2))],
        [(0.03, -0.02, 0.57, (0.3, 0.28, 0.17))],
        [(0.0, 0.01, 0.72, (0.2, 0.18, 0.16))],
    ]
    k = 0
    for layer in layers:
        for x, y, z, size in layer:
            k += 1
            _stone(p, (x, y, z), size, k, rot_z=_rand(k) * 3.1, tilt=(_rand(k + 5) - 0.5) * 0.15)
    return p


def grave_trail():
    """A roadside grave: stones heaped over it, a weathered cross at the head."""
    p = Prop("grave_trail", seed=213)
    k = 0
    for i in range(9):
        k += 1
        x = -0.75 + (i % 5) * 0.37 + (_rand(k) - 0.5) * 0.12
        y = (0.2 if i % 2 else -0.2) + (_rand(k + 2) - 0.5) * 0.1
        s = 0.26 + 0.12 * _rand(k + 4)
        _stone(p, (x, y, -0.02), (s, s * 0.85, s * 0.55), k, rot_z=_rand(k + 6) * 3.1)
    for i in range(3):
        k += 1
        _stone(p, (-0.45 + i * 0.45, 0.0, 0.1), (0.24, 0.22, 0.14), k, rot_z=_rand(k) * 3.1)
    # Cross at the head (-X end), leaning a little.
    with p.at(Matrix.Translation((-1.05, 0, -0.3)) @ Matrix.Rotation(-0.06, 4, "Y") @ Matrix.Rotation(0.04, 4, "X")):
        p.box((0.075, 0.05, 1.3), loc=(0, 0, 0.65), kind="wood_grey", grain="z", bevel=0.008)
        p.box((0.05, 0.46, 0.08), loc=(0, 0, 1.08), kind="sign_board", grain="y", bevel=0.006)
    return p


def trunk():
    """A lost steamer trunk: pine body, iron corners and bands, leather handles."""
    p = Prop("trunk", seed=217)
    L, W, H = 0.86, 0.5, 0.36
    lid = 0.16
    p.box((L, W, H), loc=(0, 0, H / 2), kind="wood_dark", grain="x", bevel=0.01)
    # Lid, slightly ajar, hinged along the back edge.
    with p.at(Matrix.Translation((0, W / 2, H)) @ Matrix.Rotation(-0.06, 4, "X")):
        p.box((L + 0.01, W + 0.01, lid), loc=(0, -W / 2, lid / 2), kind="wood_dark", grain="x", bevel=0.012)
        for x in (-0.27, 0.27):
            p.box((0.05, W + 0.03, 0.012), loc=(x, -W / 2, lid + 0.004), kind="iron", grain="y", bevel=0.002)
            p.box((0.05, 0.012, lid + 0.01), loc=(x, -W - 0.004, lid / 2), kind="iron", grain="z", bevel=0.002)
    for x in (-0.27, 0.27):
        for sy in (-1, 1):
            p.box((0.05, 0.012, H), loc=(x, sy * (W / 2 + 0.004), H / 2), kind="iron", grain="z", bevel=0.002)
    for sx in (-1, 1):
        for sy in (-1, 1):
            for z in (0.035, H - 0.035):
                p.box((0.07, 0.07, 0.07), loc=(sx * (L / 2 - 0.03), sy * (W / 2 - 0.03), z), kind="iron", bevel=0.006)
        # Leather handle on each end.
        p.tube([(sx * (L / 2 + 0.005), -0.1, H - 0.11), (sx * (L / 2 + 0.04), 0.0, H - 0.14), (sx * (L / 2 + 0.005), 0.1, H - 0.11)],
               [0.012, 0.014, 0.012], sides=5, kind="wood_dark", flatten=0.5)
    p.box((0.08, 0.014, 0.1), loc=(0, -W / 2 - 0.007, H - 0.05), kind="iron", bevel=0.003)
    return p


def campfire_ring():
    """A cold camp: stone ring, burnt ends, ash, and a coffee pot left on a rock."""
    p = Prop("campfire_ring", seed=219)
    n = 10
    for i in range(n):
        a = 2 * math.pi * i / n + (_rand(i) - 0.5) * 0.2
        r = 0.58 + (_rand(i + 3) - 0.5) * 0.06
        s = 0.2 + 0.07 * _rand(i + 7)
        _stone(p, (math.cos(a) * r, math.sin(a) * r, -0.03), (s, s * 0.9, s * 0.75), i + 11, rot_z=a)
    p.lathe([(0.0, 0.0), (0.48, 0.0), (0.46, 0.03), (0.2, 0.06), (0.0, 0.065)], sides=12, kind="char", cap_bottom=False, cap_top=False)
    for i, (a, lift) in enumerate(((0.3, 0.07), (1.9, 0.1), (3.6, 0.08))):
        c, s = math.cos(a), math.sin(a)
        p.lathe([(0.045, -0.26), (0.05, 0.26)], sides=6, loc=(c * 0.12, s * 0.12, lift), rot=(math.pi / 2, 0.12, a + math.pi / 2), kind="char", cap_kind="char", jitter=0.1)
    # Flat rock by the ring with the pot on it.
    _stone(p, (0.95, 0.35, -0.04), (0.36, 0.32, 0.2), 31, rot_z=0.6)
    pot = [(0.075, 0.0), (0.085, 0.02), (0.07, 0.17), (0.045, 0.2), (0.05, 0.21), (0.0, 0.22)]
    p.lathe(pot, sides=12, loc=(0.95, 0.35, 0.155), kind="zinc", cap_bottom=True, cap_top=False)
    p.tube([(1.02, 0.35, 0.19), (1.08, 0.35, 0.25), (1.11, 0.35, 0.27)], [0.014, 0.01, 0.007], sides=5, kind="zinc")
    p.tube([(0.88, 0.35, 0.33), (0.95, 0.35, 0.4), (1.02, 0.35, 0.33)], [0.004, 0.004, 0.004], sides=4, kind="iron")
    return p


BUILDERS = (telegraph_pole, mile_marker, signpost, sign_arm, cairn, grave_trail, trunk, campfire_ring)
