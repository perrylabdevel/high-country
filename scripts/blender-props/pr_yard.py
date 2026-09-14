"""The yard kit: the smaller pieces that were still drawn as boxes and cones
in the structure builders — the ranch windmill's wheel and stock tank, the
blacksmith's anvil and forge, Lake Mercy's rowboats, the lodge-camp tipis,
the cemetery's headstones and gateposts, El Paso's plaza cross, the timber
camp's charcoal pits, the Burn's charred logs, the overlook bench, the town
lot signs and the mission altar. Same conventions as pr_props (metres, Z up,
base on z=0, long axis X, front -Y).

windmill_fan is the one moving part: its origin is the wheel hub, the wheel
turns about local Y (glTF Z), and it is drawn as a live mesh on the ranch
windmill's `blades` group, not instanced (src/buildings.js).
"""

import math

from mathutils import Matrix

from pr_common import Prop
from pr_trail import _stone


def _rand(seed):
    x = math.sin(seed * 63.719) * 43758.5453
    return x - math.floor(x)


# --------------------------------------------------------------------------
# Ranch windmill and smithy


def windmill_fan():
    """A wooden sectional wheel, 3.6 m across: 18 pitched slats between two
    iron rings on six arms. Hub at the origin; the wheel faces -Y."""
    p = Prop("windmill_fan", seed=601)
    R_IN, R_OUT = 0.62, 1.8
    with p.at(Matrix.Rotation(math.pi / 2, 4, "X")):
        # Hub casting and the shaft stub behind it (toward +Y, into the head).
        p.lathe([(0.16, -0.12), (0.18, 0.0), (0.16, 0.14), (0.07, 0.2)], sides=10, kind="iron")
        p.cylinder(0.05, 0.3, sides=8, loc=(0, 0, -0.42), kind="iron")
        p.ring(R_IN, 0.06, 0.04, sides=24, kind="iron")
        p.ring(R_OUT, 0.07, 0.045, sides=36, kind="iron")
    for k in range(6):
        a = 2 * math.pi * k / 6
        c, s = math.cos(a), math.sin(a)
        p.beam((c * 0.12, 0.03, s * 0.12), (c * (R_OUT + 0.02), 0.03, s * (R_OUT + 0.02)), (0.06, 0.05), kind="wood_grey", roll=0.0, bevel=0.008)
    n = 18
    for k in range(n):
        a = 2 * math.pi * (k + 0.5) / n
        # Local frame: X radial, Y the wheel axis, Z tangential.
        with p.at(Matrix.Rotation(-a, 4, "Y")):
            p.box((R_OUT - R_IN + 0.08, 0.018, 0.27), loc=((R_IN + R_OUT) / 2, -0.03, 0), rot=(0.42, 0, 0),
                  kind="wood_grey", grain="x", bevel=0.004)
    return p


def stock_tank():
    """A round stave stock tank under the windmill's pipe, hooped, holding water."""
    p = Prop("stock_tank", seed=603)
    R, H, t = 1.3, 0.72, 0.06
    p.lathe([(R, 0.0), (R, H), (R - t, H), (R - t, 0.08)], sides=24, kind="stave", cap_top=False, cap_bottom=True)
    p.cylinder(R - t + 0.01, H - 0.12, sides=24, kind="water")
    for z in (0.14, 0.4, 0.64):
        p.ring(R + 0.012, 0.045, 0.014, sides=32, loc=(0, 0, z), kind="iron")
    # Supply pipe over the rim from the pump side (-X).
    p.tube([(-R - 0.9, 0, 0.95), (-R + 0.05, 0, 0.95), (-R + 0.25, 0, 0.85)], [0.035, 0.035, 0.035], sides=6, kind="iron")
    p.box((0.18, 0.18, 0.95), loc=(-R - 0.9, 0, 0.475), kind="wood_grey", grain="z", bevel=0.01)
    return p


def anvil():
    """A London-pattern anvil on an oak stump, hammer and tongs beside it."""
    p = Prop("anvil", seed=605)
    p.lathe([(0.3, 0.0), (0.28, 0.05), (0.26, 0.55)], sides=12, kind="bark", cap_kind="endgrain", jitter=0.05)
    z0 = 0.55
    # Feet, waist, body and face.
    p.box((0.46, 0.26, 0.08), loc=(0, 0, z0 + 0.04), kind="iron", bevel=0.01)
    p.box((0.24, 0.14, 0.14), loc=(0, 0, z0 + 0.15), kind="iron", bevel=0.02)
    p.box((0.42, 0.13, 0.12), loc=(0.02, 0, z0 + 0.28), kind="iron", bevel=0.015)
    # Horn tapering out along -X, heel with hardy hole along +X.
    p.tube([(-0.19, 0, z0 + 0.3), (-0.33, 0, z0 + 0.3), (-0.45, 0, z0 + 0.31)], [0.055, 0.04, 0.008], sides=10, kind="iron")
    p.box((0.14, 0.1, 0.06), loc=(0.28, 0, z0 + 0.31), kind="iron", bevel=0.008)
    p.box((0.02, 0.02, 0.02), loc=(0.3, 0, z0 + 0.34), kind="socket", bevel=0)
    # Hammer lying on the face; tongs leaning on the stump.
    p.box((0.1, 0.035, 0.035), loc=(0.05, 0.02, z0 + 0.36), kind="iron", bevel=0.005)
    p.beam((0.05, 0.02, z0 + 0.36), (0.12, -0.24, z0 + 0.36), (0.022, 0.022), kind="wood", bevel=0.004)
    for dy in (-0.012, 0.012):
        p.beam((0.29, 0.1 + dy, 0.0), (0.24, 0.16 + dy, 0.62), (0.014, 0.01), kind="iron", bevel=0.002)
    return p


def forge():
    """A fieldstone smithy forge: raised hearth, brick hood and stack, the
    bellows on its frame to one side and a quench tub in front."""
    p = Prop("forge", seed=607)
    W, D, H = 1.5, 1.1, 0.8
    p.box((W, D, H), loc=(0, 0, H / 2), kind="fieldstone", grain="x", bevel=0.04)
    p.box((W + 0.08, D + 0.08, 0.08), loc=(0, 0, H + 0.04), kind="stone", grain="x", bevel=0.015)
    # Fire pot: coals in a shallow iron pan.
    p.box((0.55, 0.45, 0.06), loc=(-0.1, -0.05, H + 0.1), kind="iron", bevel=0.01)
    p.box((0.45, 0.35, 0.04), loc=(-0.1, -0.05, H + 0.125), kind="char", bevel=0.01)
    # Back wall carried up to the hood, the sheet-iron hood sitting on it and
    # canted out over the fire, the square stack rising out of the hood.
    p.box((W, 0.3, 1.25), loc=(0, D / 2 - 0.15, H + 0.625), kind="fieldstone", grain="x", bevel=0.03)
    p.box((1.1, 0.75, 0.08), loc=(-0.1, 0.12, H + 1.3), rot=(-0.22, 0, 0), kind="iron", grain="x", bevel=0.01)
    for sx in (-1, 1):
        p.box((0.06, 0.75, 0.42), loc=(-0.1 + sx * 0.52, 0.12, H + 1.12), rot=(-0.22, 0, 0), kind="iron", grain="y", bevel=0.006)
    p.box((0.46, 0.46, 1.4), loc=(-0.1, D / 2 - 0.23, H + 1.25 + 0.7), kind="fieldstone", grain="z", bevel=0.03)
    # Great bellows on a timber frame beside the hearth (+X), handle out.
    bx = W / 2 + 0.55
    for sy in (-1, 1):
        p.box((0.08, 0.08, 0.9), loc=(bx, sy * 0.3, 0.45), kind="wood_dark", grain="z", bevel=0.008)
    p.box((0.9, 0.7, 0.06), loc=(bx, 0, 0.95), kind="wood_dark", grain="x", bevel=0.01)
    p.box((0.85, 0.62, 0.18), loc=(bx, 0, 1.08), kind="leather", grain="x", bevel=0.05)
    p.box((0.9, 0.66, 0.05), loc=(bx, 0, 1.2), kind="wood_dark", grain="x", bevel=0.01)
    p.tube([(bx - 0.45, 0, 1.08), (W / 2 + 0.02, 0, 1.0)], [0.05, 0.035], sides=8, kind="iron")
    p.beam((bx + 0.45, 0, 1.2), (bx + 1.05, 0, 1.45), (0.04, 0.04), kind="wood", bevel=0.005)
    # Quench tub.
    p.lathe([(0.26, 0.0), (0.28, 0.5), (0.25, 0.5), (0.23, 0.05)], sides=12, loc=(-W / 2 - 0.35, -0.5, 0), kind="stave", cap_top=False)
    p.cylinder(0.24, 0.42, sides=12, loc=(-W / 2 - 0.35, -0.5, 0), kind="water")
    for z in (0.1, 0.4):
        p.ring(0.28, 0.03, 0.01, sides=16, loc=(-W / 2 - 0.35, -0.5, z), kind="iron")
    return p


# --------------------------------------------------------------------------
# Lake Mercy


def rowboat():
    """A lapstrake rowboat, 3.1 m, bow toward +X, a pair of oars shipped."""
    p = Prop("rowboat", seed=611)
    L, B = 3.1, 1.25
    stern_w = 0.9
    # Bottom boards and keel.
    p.box((L - 0.55, 0.55, 0.04), loc=(-0.2, 0, 0.06), kind="board_grey", grain="x", bevel=0.006)
    p.box((L, 0.06, 0.08), loc=(0, 0, 0.04), kind="wood_dark", grain="x", bevel=0.01)
    # Three strakes per side, each lapping outboard of the one below, running
    # from the transom corner to the stem.
    for sy in (-1, 1):
        for k in range(3):
            z = 0.12 + k * 0.13
            w_stern = stern_w / 2 - 0.12 + k * 0.08
            w_mid = B / 2 - 0.22 + k * 0.11
            pts = [(-L / 2 + 0.03, sy * w_stern, z), (-0.2, sy * w_mid, z + 0.02), (L / 2 - 0.25, sy * (w_mid * 0.45), z + 0.05), (L / 2, 0.0, z + 0.1)]
            for a, b in zip(pts, pts[1:]):
                p.beam(a, b, (0.025, 0.16), kind="board_grey", roll=sy * (0.35 + k * 0.12), bevel=0.004)
        p.beam((-L / 2 + 0.03, sy * (stern_w / 2 + 0.04), 0.5), (-0.2, sy * (B / 2 + 0.02), 0.52), (0.05, 0.04), kind="wood_dark", bevel=0.006)
        p.beam((-0.2, sy * (B / 2 + 0.02), 0.52), (L / 2, 0.0, 0.58), (0.05, 0.04), kind="wood_dark", bevel=0.006)
    p.box((0.05, stern_w, 0.44), loc=(-L / 2, 0, 0.3), kind="board_grey", grain="y", bevel=0.008)
    p.box((0.08, 0.08, 0.6), loc=(L / 2 - 0.02, 0, 0.32), rot=(0, -0.25, 0), kind="wood_dark", grain="z", bevel=0.008)
    # Thwarts.
    for x, w in ((-1.05, 0.86), (0.05, 1.08), (0.85, 0.8)):
        p.box((0.22, w, 0.04), loc=(x, 0, 0.36), kind="wood", grain="y", bevel=0.006)
    # Oars laid fore and aft across the thwarts.
    for sy in (-1, 1):
        p.beam((-1.25, sy * 0.28, 0.42), (1.05, sy * 0.2, 0.42), (0.04, 0.04), kind="wood", bevel=0.006)
        p.box((0.5, 0.13, 0.02), loc=(1.25, sy * 0.19, 0.42), rot=(0, 0, -sy * 0.03), kind="wood", grain="x", bevel=0.004)
    return p


# --------------------------------------------------------------------------
# Lodge camp


def tipi():
    """A plain lodge: canvas cover on a pole frame, poles crossing above the
    smoke hole, door to the front (-Y), pinned and staked. Undecorated."""
    p = Prop("tipi", seed=613)
    R, H = 2.6, 3.75
    apex = 4.1
    # Cover: slightly bellied cone, open at the smoke hole.
    p.lathe([(R, 0.0), (R * 0.72, H * 0.3), (R * 0.4, H * 0.64), (0.28, H)], sides=18, kind="canvas", cap_top=False, cap_bottom=False)
    # Inner lining face so the open bottom never shows through.
    p.lathe([(0.3, H - 0.02), (R * 0.4 - 0.03, H * 0.64), (R * 0.72 - 0.03, H * 0.3), (R - 0.03, 0.02)], sides=18, kind="canvas", cap_top=False, cap_bottom=False)
    n = 13
    for k in range(n):
        a = 2 * math.pi * (k + 0.3) / n + (_rand(k) - 0.5) * 0.12
        base = (math.cos(a) * (R + 0.02), math.sin(a) * (R + 0.02), 0.0)
        # Through the crossing and on past it by 0.9 - 1.4 m.
        over = 0.9 + 0.5 * _rand(k + 20)
        tip = (-math.cos(a) * 0.38 * over, -math.sin(a) * 0.38 * over, apex + over)
        p.beam(base, tip, (0.06, 0.06), kind="wood_grey", roll=a, bevel=0.008)
    # Smoke flaps either side of the front seam, each on its own pole.
    for sx in (-1, 1):
        with p.at(Matrix.Translation((sx * 0.35, -0.42, H - 0.55)) @ Matrix.Rotation(sx * 0.35, 4, "Y") @ Matrix.Rotation(-0.35, 4, "X")):
            p.box((0.5, 0.03, 1.3), kind="canvas", grain="z", bevel=0.004)
        p.beam((sx * 0.55, -0.6, H + 0.4), (sx * 1.4, -3.2, 0.0), (0.045, 0.045), kind="wood_grey", bevel=0.006)
    # Door: an oval opening with a rolled flap over it; lacing pins up the seam.
    # The cover leans back ~0.58 rad here (radius 2.6 at the ground, 1.87 at
    # 1.1 m): the opening and the rolled flap lie on it, not standing off it.
    lean = math.atan2(R - R * 0.72, H * 0.3)
    with p.at(Matrix.Translation((0, -(R - math.tan(lean) * 0.62) - 0.015, 0.62)) @ Matrix.Rotation(-lean, 4, "X")):
        p.lathe([(0.34, -0.02), (0.34, 0.02)], sides=12, rot=(math.pi / 2, 0, 0), kind="socket", cap_top=True, cap_bottom=False)
    with p.at(Matrix.Translation((0, -(R - math.tan(lean) * 1.05) - 0.05, 1.05)) @ Matrix.Rotation(-lean, 4, "X")):
        p.lathe([(0.07, -0.42), (0.07, 0.42)], sides=8, rot=(0, math.pi / 2, 0), kind="canvas")
    for k in range(7):
        z = 1.35 + k * 0.33
        rr = R * (1 - z / (H * 1.08)) + 0.03
        p.beam((-0.08, -rr, z), (0.08, -rr, z - 0.02), (0.012, 0.012), kind="wood", bevel=0.002)
    for k in range(12):
        a = 2 * math.pi * k / 12
        if abs(math.sin(a) + 1) < 0.2:
            continue
        p.beam((math.cos(a) * (R + 0.02), math.sin(a) * (R + 0.02), 0.08), (math.cos(a) * (R + 0.16), math.sin(a) * (R + 0.16), -0.05), (0.03, 0.03), kind="wood_dark", bevel=0.003)
    return p


# --------------------------------------------------------------------------
# Cemetery, crosses and posts


def headstone():
    """A weathered sandstone headstone with a rounded top on a low base."""
    p = Prop("headstone", seed=617)
    W, T, H = 0.42, 0.12, 0.72
    p.box((W + 0.14, T + 0.14, 0.12), loc=(0, 0, 0.04), kind="stone", grain="x", bevel=0.02)
    p.box((W, T, H - W / 2), loc=(0, 0, 0.1 + (H - W / 2) / 2), kind="stone", grain="z", bevel=0.012)
    with p.at(Matrix.Translation((0, 0, 0.1 + H - W / 2)) @ Matrix.Rotation(math.pi / 2, 4, "X")):
        p.lathe([(W / 2, -T / 2), (W / 2, T / 2)], sides=14, kind="stone", cap_top=True, cap_bottom=True)
    # Cut panel on the face.
    p.box((W * 0.7, 0.016, 0.34), loc=(0, -T / 2 - 0.006, 0.5), kind="stone", grain="x", bevel=0.006)
    return p


def headstone_cross():
    """A carved stone cross on a stepped base."""
    p = Prop("headstone_cross", seed=619)
    p.box((0.5, 0.36, 0.14), loc=(0, 0, 0.05), kind="stone", grain="x", bevel=0.02)
    p.box((0.34, 0.24, 0.12), loc=(0, 0, 0.17), kind="stone", grain="x", bevel=0.015)
    p.box((0.12, 0.1, 0.85), loc=(0, 0, 0.23 + 0.425), kind="stone", grain="z", bevel=0.012)
    p.box((0.46, 0.1, 0.11), loc=(0, 0, 0.82), kind="stone", grain="x", bevel=0.012)
    return p


def plaza_cross():
    """A tall hewn-timber cross on a mortared fieldstone base."""
    p = Prop("plaza_cross", seed=621)
    k = 0
    for ring, (r, z, n) in enumerate(((0.62, 0.0, 9), (0.45, 0.24, 7), (0.28, 0.46, 5))):
        for i in range(n):
            k += 1
            a = 2 * math.pi * (i + 0.5 * ring) / n
            _stone(p, (math.cos(a) * r, math.sin(a) * r, z), (0.34, 0.26, 0.26), k + 640, rot_z=a + math.pi / 2, sides=5)
    p.box((0.18, 0.18, 3.1), loc=(0, 0, 0.35 + 1.55), kind="wood_grey", grain="z", bevel=0.02)
    p.box((1.3, 0.15, 0.16), loc=(0, 0, 2.6), kind="wood_grey", grain="x", bevel=0.02)
    for sy in (-1, 1):
        p.box((0.02, 0.02, 0.02), loc=(0, sy * 0.09, 2.6), kind="iron", bevel=0)
    return p


def gatepost_stone():
    """A square cemetery gatepost of dressed stone with a pyramidal cap."""
    p = Prop("gatepost_stone", seed=623)
    for k in range(4):
        p.box((0.34 - 0.01 * (k % 2), 0.34 - 0.01 * ((k + 1) % 2), 0.32), loc=(0, 0, 0.16 + k * 0.32), rot=(0, 0, (_rand(k) - 0.5) * 0.04),
              kind="stone", grain="x", bevel=0.02)
    p.box((0.42, 0.42, 0.08), loc=(0, 0, 1.32), kind="stone", grain="x", bevel=0.015)
    p.lathe([(0.26, 1.36), (0.0, 1.56)], sides=4, rot=(0, 0, math.pi / 4), kind="stone", cap_top=False, faceted=True)
    return p


# --------------------------------------------------------------------------
# Timber camp, the Burn, the overlook


def charcoal_pit():
    """A burnt-out charcoal kiln: a low char-black mound, half raked open,
    billets of charred wood pulled out around it."""
    p = Prop("charcoal_pit", seed=627)
    p.lathe([(2.45, 0.0), (2.3, 0.1), (1.7, 0.26), (0.9, 0.4), (0.0, 0.46)], sides=20, kind="char", cap_bottom=False, cap_top=False)
    p.lathe([(1.0, 0.0), (0.7, 0.34), (0.3, 0.5), (0.0, 0.52)], sides=10, loc=(0.9, -0.4, 0.02), kind="sod", cap_bottom=False, cap_top=False, jitter=0.2)
    for i in range(11):
        a = _rand(i) * 6.28
        r = 0.6 + 1.7 * _rand(i + 30)
        ln = 0.7 + 0.5 * _rand(i + 50)
        p.lathe([(0.07, -ln / 2), (0.08, ln / 2)], sides=6, loc=(math.cos(a) * r, math.sin(a) * r, 0.36 - 0.12 * r / 2.3 + 0.04),
                rot=(math.pi / 2, 0.08, a + 1.2 + _rand(i + 70)), kind="char", cap_kind="char", jitter=0.15)
    # A rake left on the mound.
    p.beam((-1.9, 0.9, 0.08), (0.2, -0.2, 0.5), (0.04, 0.04), kind="wood", bevel=0.005)
    p.box((0.06, 0.45, 0.05), loc=(-1.95, 0.93, 0.07), rot=(0, 0, 0.48), kind="iron", grain="y", bevel=0.005)
    return p


def log_charred():
    """A 5 m fallen pine trunk burnt black, branch stubs snapped short."""
    p = Prop("log_charred", seed=629)
    L = 5.0
    p.lathe([(0.24, -L / 2), (0.2, -L / 6), (0.18, L / 6), (0.13, L / 2)], sides=10, rot=(0, math.pi / 2, 0), loc=(0, 0, 0.21),
            kind="char", cap_kind="char", jitter=0.12)
    for i in range(6):
        x = -L / 2 + 0.7 + i * 0.75
        a = _rand(i) * 6.28
        p.lathe([(0.05, 0.0), (0.02, 0.35 + 0.3 * _rand(i + 9))], sides=5, loc=(x, math.cos(a) * 0.15, 0.21 + math.sin(a) * 0.15),
                rot=(a - math.pi / 2, 0.4, 0), kind="char", cap_top=False)
    # The root plate, torn up at the thick end.
    p.lathe([(0.55, -0.12), (0.6, 0.0), (0.4, 0.12)], sides=9, loc=(-L / 2 - 0.08, 0, 0.36), rot=(0, math.pi / 2, 0), kind="char", jitter=0.3)
    return p


def bench_log():
    """A split-log bench on two pairs of pegged legs."""
    p = Prop("bench_log", seed=631)
    L = 2.2
    with p.at(Matrix.Translation((0, 0, 0.42))):
        p.lathe([(0.16, -L / 2), (0.16, L / 2)], sides=10, rot=(0, math.pi / 2, 0), loc=(0, 0, -0.06), kind="bark", cap_kind="endgrain")
        p.box((L, 0.3, 0.04), loc=(0, 0, 0.1), kind="wood_grey", grain="x", bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.beam((sx * 0.8, sy * 0.06, 0.34), (sx * 0.9, sy * 0.2, 0.0), (0.06, 0.06), kind="wood_grey", bevel=0.01)
    return p


def sign_stand():
    """A painted board on two short stakes: a lot sign at the street edge."""
    p = Prop("sign_stand", seed=633)
    p.box((0.7, 0.04, 0.55), loc=(0, 0, 0.8), kind="sign_board", grain="x", bevel=0.01)
    p.box((0.76, 0.05, 0.04), loc=(0, 0, 1.1), kind="wood_dark", grain="x", bevel=0.006)
    for sx in (-1, 1):
        p.box((0.06, 0.06, 1.15), loc=(sx * 0.3, 0.05, 0.575), kind="wood_grey", grain="z", bevel=0.008)
    return p


def altar():
    """An adobe altar under a linen cloth, candlesticks and a small cross."""
    p = Prop("altar", seed=637)
    W, D, H = 2.2, 0.9, 1.0
    p.box((W, D, H - 0.06), loc=(0, 0, (H - 0.06) / 2), kind="adobe", grain="x", bevel=0.05)
    p.box((W + 0.1, D + 0.08, 0.06), loc=(0, 0, H - 0.03), kind="wood_dark", grain="x", bevel=0.01)
    p.box((W - 0.2, D + 0.1, 0.012), loc=(0, 0.0, H + 0.006), kind="canvas", grain="x", bevel=0)
    p.box((W - 0.2, 0.012, 0.45), loc=(0, -D / 2 - 0.05, H - 0.22), kind="canvas", grain="z", bevel=0)
    p.box((W * 0.7, 0.4, 0.12), loc=(0, 0.2, 0.06), kind="adobe", grain="x", bevel=0.02)
    for x in (-0.7, 0.7):
        p.lathe([(0.07, 0.0), (0.05, 0.03), (0.02, 0.05), (0.02, 0.3), (0.04, 0.32), (0.0, 0.34)], sides=10, loc=(x, 0.15, H + 0.012), kind="iron")
        p.cylinder(0.018, 0.16, sides=6, loc=(x, 0.15, H + 0.34), kind="bone")
    p.box((0.05, 0.05, 0.55), loc=(0, 0.25, H + 0.29), kind="wood_dark", grain="z", bevel=0.005)
    p.box((0.3, 0.05, 0.05), loc=(0, 0.25, H + 0.43), kind="wood_dark", grain="x", bevel=0.005)
    return p


BUILDERS = (windmill_fan, stock_tank, anvil, forge, rowboat, tipi, headstone, headstone_cross, plaza_cross,
            gatepost_stone, charcoal_pit, log_charred, bench_log, sign_stand, altar)
