"""The landmark kit: large single-site pieces that were still boxes, cones and
cylinders in the structure builders — the ranch windmill tower and gate, the
fire lookout, Lake Mercy's dock and walk, the Burn's chimney and burnt cabin
remains, the Iron Valley cabin ruin and the island fishing shack. Same
conventions as pr_props (metres, Z up, base on z=0, long axis X, front -Y).

Attachment frames other code relies on:
  windmill_tower  wheel hub at (0, +0.55, 9.4) Blender = glTF (0, 9.4, -0.55);
                  the wheel (yard kit windmill_fan) turns there about glTF Z.
  dock_pier       deck top at z = 0 (glTF y = 0): seat it at the walking plane.
  dock_walk       same.
"""

import math

from mathutils import Matrix

from pr_common import Prop
from pr_trail import _stone


def _rand(seed):
    x = math.sin(seed * 71.237) * 43758.5453
    return x - math.floor(x)


def _braced_face(p, a0, a1, b0, b1, levels, section=(0.1, 0.1), kind="wood_grey"):
    """X-bracing and girts on one tower face between legs a (a0->a1) and b."""
    def lerp(u, v, t):
        return tuple(u[i] + (v[i] - u[i]) * t for i in range(3))
    for i in range(len(levels) - 1):
        t0, t1 = levels[i], levels[i + 1]
        p.beam(lerp(a0, a1, t0), lerp(b0, b1, t1), section, kind=kind, bevel=0.008)
        p.beam(lerp(b0, b1, t0), lerp(a0, a1, t1), section, kind=kind, bevel=0.008)
    for t in levels:
        p.beam(lerp(a0, a1, t), lerp(b0, b1, t), (section[0] * 1.3, section[1] * 1.3), kind=kind, bevel=0.01)


def windmill_tower():
    """A four-post wooden windmill tower, 9 m, with its iron head, wooden
    tail vane, pump rod and a lift pump at the foot."""
    p = Prop("windmill_tower", seed=701)
    H = 8.8
    B, T = 1.05, 0.32
    legs = [(sx, sy) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    for sx, sy in legs:
        p.box((0.36, 0.36, 0.3), loc=(sx * B, sy * B, 0.1), kind="stone", grain="x", bevel=0.03)
        p.beam((sx * B, sy * B, 0.2), (sx * T, sy * T, H), (0.14, 0.14), kind="wood_grey", bevel=0.012)
    levels = (0.03, 0.34, 0.64, 1.0)
    for i in range(4):
        (ax, ay), (bx, by) = legs[i], legs[(i + 1) % 4]
        _braced_face(p, (ax * B, ay * B, 0.2), (ax * T, ay * T, H), (bx * B, by * B, 0.2), (bx * T, by * T, H), levels, section=(0.07, 0.07))
    # Ladder rungs up the front face (-Y) between the front legs.
    for k in range(20):
        t = 0.06 + k * 0.047
        z = 0.2 + t * (H - 0.2)
        w = B + (T - B) * t
        p.cylinder(0.018, 2 * w, sides=5, loc=(-w, -w - 0.04, z), rot=(0, math.pi / 2, 0), kind="wood")
    # Platform.
    for k in range(5):
        p.box((0.24, 1.3, 0.05), loc=(-0.52 + k * 0.26, 0, H + 0.03), kind="board_grey", grain="y", bevel=0.005)
    # Turntable, head casting and shaft bearing; the hub sits at +Y 0.55, z 9.4.
    p.lathe([(0.3, H + 0.06), (0.3, H + 0.14), (0.18, H + 0.2)], sides=12, kind="iron")
    p.box((0.34, 0.7, 0.32), loc=(0, 0.1, 9.4), kind="iron", grain="y", bevel=0.03)
    p.cylinder(0.1, 0.34, sides=10, loc=(0, 0.2, 9.4), rot=(-math.pi / 2, 0, 0), kind="iron")
    p.box((0.14, 0.12, 0.3), loc=(0, 0.05, 9.12), kind="iron", bevel=0.01)
    # Tail boom back toward -Y with the vane board, braced.
    p.beam((0, -0.2, 9.42), (0, -2.5, 9.55), (0.08, 0.08), kind="wood_grey", bevel=0.01)
    p.beam((0, -0.2, 9.25), (0, -1.9, 9.5), (0.05, 0.05), kind="iron", bevel=0.004)
    p.box((0.03, 1.5, 0.9), loc=(0, -2.9, 9.55), kind="board_grey", grain="y", bevel=0.006)
    for z in (9.2, 9.9):
        p.box((0.05, 1.5, 0.06), loc=(0, -2.9, z), kind="wood_grey", grain="y", bevel=0.005)
    # Pump rod down the middle to a lift pump on a timber sill.
    p.cylinder(0.02, H - 1.2, sides=5, loc=(0, 0.05, 1.15), kind="iron")
    p.box((1.2, 0.3, 0.14), loc=(0, 0, 0.07), kind="wood_dark", grain="x", bevel=0.01)
    p.lathe([(0.1, 0.14), (0.1, 0.95), (0.13, 1.0), (0.13, 1.12), (0.05, 1.18)], sides=10, loc=(0, 0.05, 0), kind="iron")
    p.tube([(0.08, 0.05, 0.8), (0.45, 0.05, 0.8), (1.25, 0.05, 0.92)], [0.035, 0.035, 0.035], sides=6, kind="iron")
    return p


def lookout_tower():
    """An 18 m fire lookout: four braced timber legs, stair-ladder, a glazed
    cab with a catwalk and a hipped roof."""
    p = Prop("lookout_tower", seed=703)
    H = 18.0
    B, T = 2.1, 1.55
    legs = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for sx, sy in legs:
        p.box((0.6, 0.6, 0.45), loc=(sx * B, sy * B, 0.15), kind="stone", grain="x", bevel=0.04)
        p.beam((sx * B, sy * B, 0.35), (sx * T, sy * T, H), (0.24, 0.24), kind="wood_grey", bevel=0.02)
    levels = (0.02, 0.25, 0.5, 0.75, 1.0)
    for i in range(4):
        (ax, ay), (bx, by) = legs[i], legs[(i + 1) % 4]
        _braced_face(p, (ax * B, ay * B, 0.35), (ax * T, ay * T, H), (bx * B, by * B, 0.35), (bx * T, by * T, H), levels, section=(0.12, 0.12))
    # Ladder up the front face (-Y), with landings at each girt.
    for k in range(55):
        z = 0.6 + k * 0.315
        t = (z - 0.35) / (H - 0.35)
        y = -(B + (T - B) * t) - 0.18
        p.box((0.6, 0.05, 0.04), loc=(0, y, z), kind="wood", grain="x", bevel=0.005)
    for sx in (-1, 1):
        p.beam((sx * 0.3, -B - 0.18, 0.35), (sx * 0.3, -T - 0.18, H + 0.9), (0.07, 0.09), kind="wood_grey", bevel=0.008)
    for t in levels[1:-1]:
        y = -(B + (T - B) * t) - 0.45
        p.box((1.2, 0.8, 0.06), loc=(0, y + 0.25, 0.35 + t * (H - 0.35) - 0.05), kind="board_grey", grain="x", bevel=0.006)
    # Cab floor and catwalk.
    Z = H
    p.box((5.2, 5.2, 0.12), loc=(0, 0, Z + 0.06), kind="board_grey", grain="x", bevel=0.01)
    for sx, sy in legs:
        p.box((0.08, 0.08, 1.05), loc=(sx * 2.55, sy * 2.55, Z + 0.62), kind="wood_grey", grain="z", bevel=0.006)
    for i in range(4):
        (ax, ay), (bx, by) = legs[i], legs[(i + 1) % 4]
        for z in (Z + 0.6, Z + 1.12):
            p.beam((ax * 2.55, ay * 2.55, z), (bx * 2.55, by * 2.55, z), (0.06, 0.08), kind="wood_grey", bevel=0.006)
    # Cab: board dado, window band, corner posts, door on the ladder side.
    C, E = 2.1, 2.5
    for sx in (-1, 1):
        p.box((0.08, 2 * C, 0.95), loc=(sx * C, 0, Z + 0.6), kind="board_grey", grain="z", bevel=0.006)
        p.box((0.05, 2 * C - 0.1, 1.1), loc=(sx * C, 0, Z + 1.65), kind="glass", grain="y", bevel=0)
    for sy in (-1, 1):
        p.box((2 * C, 0.08, 0.95), loc=(0, sy * C, Z + 0.6), kind="board_grey", grain="z", bevel=0.006)
        p.box((2 * C - 0.1, 0.05, 1.1), loc=(0, sy * C, Z + 1.65), kind="glass", grain="x", bevel=0)
    for sx, sy in legs:
        p.box((0.12, 0.12, E), loc=(sx * C, sy * C, Z + 0.12 + E / 2), kind="wood_grey", grain="z", bevel=0.01)
    for sx in (-1, 1):
        for z in (Z + 1.1, Z + 2.22):
            p.box((0.1, 2 * C, 0.08), loc=(sx * C, 0, z), kind="wood_grey", grain="y", bevel=0.006)
    for sy in (-1, 1):
        for z in (Z + 1.1, Z + 2.22):
            p.box((2 * C, 0.1, 0.08), loc=(0, sy * C, z), kind="wood_grey", grain="x", bevel=0.006)
    for k in range(3):
        for sx in (-1, 1):
            p.box((0.06, 0.06, 1.1), loc=(sx * C, -C + 1.05 * (k + 1), Z + 1.65), kind="wood_grey", grain="z", bevel=0.004)
            p.box((0.06, 0.06, 1.1), loc=(-C + 1.05 * (k + 1), sx * C, Z + 1.65), kind="wood_grey", grain="z", bevel=0.004)
    p.box((0.8, 0.1, 1.95), loc=(0, -C - 0.01, Z + 1.1), kind="socket", bevel=0)
    # Hipped roof with wide eaves, and a lightning rod.
    R = 2.9
    ridge = Z + E + 0.12 + 1.5
    p.lathe([(R * math.sqrt(2), Z + E + 0.12), (0.12, ridge)], sides=4, rot=(0, 0, math.pi / 4), kind="board_grey", cap_top=True, cap_bottom=True, faceted=True)
    p.cylinder(0.02, 1.2, sides=5, loc=(0, 0, ridge - 0.05), kind="iron")
    # Firefinder stand in the middle of the cab.
    p.box((0.1, 0.1, 1.05), loc=(0, 0.3, Z + 0.64), kind="wood_dark", grain="z", bevel=0.006)
    p.lathe([(0.3, Z + 1.16), (0.3, Z + 1.22)], sides=12, loc=(0, 0.3, 0), kind="iron")
    return p


def dock_pier():
    """An 18 m plank pier, 4 m wide, deck top at z = 0, on driven piles with
    cross-bracing, a ladder and a mooring cleat."""
    p = Prop("dock_pier", seed=705)
    L, W = 18.0, 4.0
    n = int(L / 0.3)
    for k in range(n):
        x = -L / 2 + 0.15 + k * (L / n)
        jitter = (_rand(k) - 0.5) * 0.06
        p.box((0.27, W + jitter, 0.07), loc=(x, jitter / 2, -0.035), rot=(0, 0, (_rand(k + 9) - 0.5) * 0.01), kind="board_grey", grain="y", bevel=0.008)
    for sy in (-1, 1):
        p.box((L, 0.18, 0.28), loc=(0, sy * (W / 2 - 0.2), -0.21), kind="wood_dark", grain="x", bevel=0.015)
        p.box((L, 0.1, 0.1), loc=(0, sy * (W / 2 + 0.02), 0.05), kind="wood_grey", grain="x", bevel=0.01)
    for i in range(6):
        x = -L / 2 + 0.4 + i * (L - 0.8) / 5
        p.box((0.2, W + 0.3, 0.24), loc=(x, 0, -0.48), kind="wood_dark", grain="y", bevel=0.012)
        for sy in (-1, 1):
            p.lathe([(0.15, -2.4), (0.15, 0.25), (0.12, 0.3)], sides=8, loc=(x, sy * (W / 2 + 0.05), 0), kind="wood_dark", jitter=0.05)
        p.beam((x, -W / 2, -0.5), (x, W / 2, -1.9), (0.07, 0.12), kind="wood_dark", bevel=0.008)
    for k in range(6):
        p.box((0.05, 0.4, 0.05), loc=(L / 2 - 0.35, -W / 2 - 0.25, -0.3 - k * 0.32), kind="wood", grain="y", bevel=0.004)
    for sx in (-1, 1):
        p.box((0.06, 0.06, 2.1), loc=(L / 2 - 0.35 + sx * 0.22, -W / 2 - 0.3, -0.95), kind="wood_grey", grain="z", bevel=0.005)
    p.box((0.36, 0.08, 0.06), loc=(L / 2 - 1.8, W / 2 - 0.05, 0.18), kind="iron", bevel=0.01)
    p.box((0.08, 0.08, 0.12), loc=(L / 2 - 1.8, W / 2 - 0.05, 0.1), kind="iron", bevel=0.01)
    return p


def dock_walk():
    """A 10 m, 2.4 m wide plank walk on posts, deck top at z = 0."""
    p = Prop("dock_walk", seed=707)
    L, W = 10.0, 2.4
    n = int(L / 0.3)
    for k in range(n):
        x = -L / 2 + 0.15 + k * (L / n)
        p.box((0.27, W + (_rand(k) - 0.5) * 0.05, 0.06), loc=(x, 0, -0.03), kind="board_grey", grain="y", bevel=0.008)
    for sy in (-1, 1):
        p.box((L, 0.14, 0.22), loc=(0, sy * (W / 2 - 0.15), -0.17), kind="wood_dark", grain="x", bevel=0.012)
    for i in range(4):
        x = -L / 2 + 0.3 + i * (L - 0.6) / 3
        p.box((0.16, W + 0.1, 0.18), loc=(x, 0, -0.37), kind="wood_dark", grain="y", bevel=0.01)
        for sy in (-1, 1):
            p.lathe([(0.12, -2.0), (0.12, 0.0)], sides=7, loc=(x, sy * (W / 2 + 0.02), 0), kind="wood_dark", jitter=0.05)
    return p


def ranch_gate():
    """The ranch's ride-in gate: two peeled log posts 8 m apart, a double
    log crossbeam and the brand board hanging on chains."""
    p = Prop("ranch_gate", seed=709)
    S = 4.0
    for sx in (-1, 1):
        p.lathe([(0.2, -0.3), (0.18, 5.9), (0.16, 6.0)], sides=12, loc=(sx * S, 0, 0), kind="peeled", cap_kind="endgrain", jitter=0.04)
        p.box((0.6, 0.6, 0.18), loc=(sx * S, 0, 0.02), kind="fieldstone", grain="x", bevel=0.05)
        # Knee braces under the beam.
        p.beam((sx * (S - 0.12), 0, 4.5), (sx * (S - 1.1), 0, 5.35), (0.12, 0.12), kind="peeled", bevel=0.02)
    p.lathe([(0.2, -S - 0.7), (0.19, 0), (0.17, S + 0.7)], sides=12, rot=(0, math.pi / 2, 0), loc=(0, 0, 5.5), kind="peeled", cap_kind="endgrain", jitter=0.05)
    p.lathe([(0.13, -S - 0.3), (0.13, S + 0.3)], sides=10, rot=(0, math.pi / 2, 0), loc=(0, 0.02, 5.02), kind="peeled", cap_kind="endgrain", jitter=0.05)
    # Hanging brand board.
    for sx in (-1, 1):
        p.tube([(sx * 0.6, 0, 4.88), (sx * 0.6, 0, 4.42)], [0.012, 0.012], sides=4, kind="iron")
    p.box((1.6, 0.06, 0.8), loc=(0, 0, 4.0), kind="sign_board", grain="x", bevel=0.012)
    p.box((1.7, 0.08, 0.07), loc=(0, 0, 4.42), kind="wood_dark", grain="x", bevel=0.008)
    # A longhorn skull nailed over the centre of the beam.
    p.lathe([(0.1, 0.0), (0.12, 0.16), (0.07, 0.3)], sides=8, rot=(math.pi / 2, 0, 0), loc=(0, -0.22, 5.52), kind="bone")
    for sx in (-1, 1):
        p.tube([(sx * 0.08, -0.26, 5.62), (sx * 0.45, -0.3, 5.68), (sx * 0.8, -0.26, 5.9)], [0.04, 0.03, 0.006], sides=6, kind="horn")
    return p


def chimney_ruin():
    """The fieldstone chimney left standing when a cabin burnt: a firebox
    open on the front (-Y), the stack stepping in above the shoulder and
    broken off ragged, fallen stones and a charred beam at its foot."""
    p = Prop("chimney_ruin", seed=711)
    k = 0
    z = 0.0
    for course in range(12):
        h = 0.2 + 0.06 * _rand(course)
        w = 1.4 if course < 5 else (1.15 if course == 5 else 0.9)
        # Top courses broken away on one side.
        top = course >= 10
        n = 3 if w > 1 else 2
        for side in range(4):
            a = side * math.pi / 2
            ca, sa = math.cos(a), math.sin(a)
            for i in range(n):
                if course < 4 and side == 3 and i == 1:
                    continue  # the firebox mouth
                if top and _rand(course * 11 + side * 3 + i) < 0.45 + 0.2 * (course - 10):
                    continue
                k += 1
                along = (i + 0.5) / n * w - w / 2 + (0.08 if course % 2 else -0.08) * (w / n / 0.47)
                seg = w / n - 0.02
                d = 0.3
                lx, ly = along, w / 2 - d / 2
                x, y = ca * lx - sa * ly, sa * lx + ca * ly
                p.box((seg, d, h - 0.015), loc=(x, y, z + h / 2), rot=(0, 0, a + (_rand(k) - 0.5) * 0.05), kind="fieldstone", grain="x", bevel=0.035)
        z += h
    # Rubble core, so the broken top never shows daylight through the flue.
    p.box((0.5, 0.5, z - 1.5), loc=(0, 0, 1.0 + (z - 1.5) / 2), kind="fieldstone", grain="z", bevel=0.02)
    # Firebox: sooted back and iron lintel over the mouth.
    p.box((0.7, 0.62, 0.86), loc=(0, 0.02, 0.45), kind="char", bevel=0)
    p.box((0.9, 0.12, 0.12), loc=(0, -0.62, 0.94), kind="iron", bevel=0.01)
    p.box((1.6, 1.5, 0.12), loc=(0, 0, 0.06), kind="fieldstone", grain="x", bevel=0.03)
    for i in range(8):
        a = _rand(i + 40) * 6.28
        r = 1.0 + _rand(i + 60) * 0.9
        s = 0.25 + 0.15 * _rand(i + 80)
        p.box((s * 1.3, s, s * 0.8), loc=(math.cos(a) * r, math.sin(a) * r, s * 0.3), rot=(_rand(i) * 0.4, _rand(i + 3) * 0.3, a), kind="fieldstone", grain="x", bevel=0.04)
    p.lathe([(0.1, -0.8), (0.12, 0.8)], sides=7, loc=(0.9, -1.0, 0.12), rot=(math.pi / 2, 0.1, 0.8), kind="char", cap_kind="char", jitter=0.15)
    return p


def burnt_ruin():
    """Burnt cabin remains, 6 x 4 m: log walls charred down to a few courses
    and one gable stub, fallen roof beams, the stove standing in the ash."""
    p = Prop("burnt_ruin", seed=713)
    L, W = 6.0, 4.0
    r = 0.14
    heights = {"back": 5, "front": 2, "left": 7, "right": 3}
    for side, (x0, y0, x1, y1) in {"back": (-L / 2, W / 2, L / 2, W / 2), "front": (-L / 2, -W / 2, L / 2, -W / 2),
                                   "left": (-L / 2, -W / 2, -L / 2, W / 2), "right": (L / 2, -W / 2, L / 2, W / 2)}.items():
        along_x = y0 == y1
        for c in range(heights[side]):
            k = c + len(side) * 13
            # Upper courses burnt short: the log ends ragged toward one corner.
            frac = 1.0 if c < 2 else max(0.3, 1.0 - 0.14 * (c - 1) - 0.06 * _rand(k))
            z = r + c * r * 1.75 + (0.0 if along_x else r * 0.87)
            ln = (L if along_x else W) + 0.4
            ln *= frac
            off = (1.0 - frac) * ((L if along_x else W) + 0.4) / 2 * (1 if _rand(len(side) * 5) > 0.5 else -1)
            if along_x:
                p.lathe([(r, -ln / 2), (r * 0.95, ln / 2)], sides=8, rot=(0, math.pi / 2, 0), loc=(off, y0, z), kind="char", cap_kind="char", jitter=0.12)
            else:
                p.lathe([(r, -ln / 2), (r * 0.95, ln / 2)], sides=8, rot=(math.pi / 2, 0, 0), loc=(x0, off, z), kind="char", cap_kind="char", jitter=0.12)
    # Fallen ridge pole and rafters leaning into the room.
    p.lathe([(0.12, -3.3), (0.1, 3.3)], sides=8, rot=(0.0, math.pi / 2 - 0.22, 0.2), loc=(0.2, 0.3, 0.75), kind="char", cap_kind="char", jitter=0.15)
    for i, (x, a) in enumerate(((-2.0, 0.5), (-0.6, 0.9), (1.2, 0.35), (2.2, 1.1))):
        p.beam((x, W / 2 + 0.1, 0.9 + 0.3 * _rand(i)), (x + 0.3 * math.cos(a * 3), -0.4 + _rand(i + 5), 0.05), (0.1, 0.12), kind="char", bevel=0.01)
    # Ash floor and a scatter of burnt boards.
    p.box((L - 0.2, W - 0.2, 0.05), loc=(0, 0, 0.025), kind="char", grain="x", bevel=0.02)
    for i in range(7):
        p.box((0.9 + _rand(i) * 0.8, 0.16, 0.03), loc=(-2.4 + _rand(i + 20) * 4.8, -1.4 + _rand(i + 40) * 2.8, 0.07),
              rot=(0, 0.04, _rand(i + 60) * 3.14), kind="char", grain="x", bevel=0.005)
    # Box stove and its fallen pipe.
    p.box((0.8, 0.5, 0.55), loc=(1.6, 1.1, 0.45), kind="iron", grain="x", bevel=0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((0.05, 0.05, 0.2), loc=(1.6 + sx * 0.34, 1.1 + sy * 0.2, 0.1), kind="iron", bevel=0.005)
    p.tube([(1.8, 1.2, 0.72), (1.8, 1.2, 0.95), (2.6, 0.2, 0.15)], [0.07, 0.07, 0.07], sides=8, kind="iron")
    return p


def cabin_ruin():
    """A collapsed board cabin, 7 x 5 m: back wall standing to 2.4 m, the
    left side to 2.0 m falling away, a short stub on the right, open front
    with the header beam down across it. Walls are 0.3 m deep solids so the
    builder's colliders match."""
    p = Prop("cabin_ruin", seed=715)
    L, W, t = 7.0, 5.0, 0.3
    # Stone sill under the standing walls.
    # Carried 0.8 m below grade: the ruin sits on a hillside bench.
    p.box((L + 0.2, 0.4, 1.0), loc=(0, W / 2, -0.3), kind="fieldstone", grain="x", bevel=0.04)
    p.box((0.4, W, 1.0), loc=(-L / 2, 0, -0.3), kind="fieldstone", grain="y", bevel=0.04)
    p.box((0.4, W / 2, 1.0), loc=(L / 2, W / 4, -0.3), kind="fieldstone", grain="y", bevel=0.04)

    def wall(x0, y0, x1, y1, h_start, h_end, seed):
        along_x = abs(y1 - y0) < 1e-6
        length = abs((x1 - x0) if along_x else (y1 - y0))
        n = int(length / 0.26)
        for i in range(n):
            u = (i + 0.5) / n
            h = h_start + (h_end - h_start) * u
            h *= 0.82 + 0.25 * _rand(seed + i)
            x = x0 + (x1 - x0) * u
            y = y0 + (y1 - y0) * u
            size = (length / n - 0.012, 0.035, h) if along_x else (0.035, length / n - 0.012, h)
            p.box(size, loc=(x, y, 0.2 + h / 2), rot=(0, 0, 0), kind="board_grey", grain="z", bevel=0.006)
        # Frame: sill, girt and top plate where the wall still reaches.
        for z, frac in ((0.3, 1.0), (1.2, 1.0 if h_end > 1.2 else (h_start - 1.1) / max(h_start - h_end, 0.01))):
            if frac <= 0:
                continue
            frac = min(frac, 1.0)
            if along_x:
                p.box((length * frac, t - 0.07, 0.12), loc=(x0 + (x1 - x0) * frac / 2, y0 + 0.05 * (1 if y0 > 0 else -1) * -1, z), kind="wood_dark", grain="x", bevel=0.01)
            else:
                p.box((t - 0.07, length * frac, 0.12), loc=(x0 + 0.05 * (1 if x0 < 0 else -1), y0 + (y1 - y0) * frac / 2, z), kind="wood_dark", grain="y", bevel=0.01)
    wall(-L / 2, W / 2, L / 2, W / 2, 2.4, 2.0, 10)
    wall(-L / 2, W / 2, -L / 2, -W / 2, 2.0, 0.9, 40)
    wall(L / 2, W / 2, L / 2, 0.0, 1.1, 0.5, 70)
    for x in (-L / 2, L / 2):
        p.box((0.16, 0.16, 2.35), loc=(x, W / 2, 0.2 + 1.17), kind="wood_dark", grain="z", bevel=0.012)
    # Header beam down across the open front, one end on the ground.
    p.beam((-L / 4 - L / 4, -W / 2 - 0.55, 0.12), (-L / 4 + L / 4, -W / 2 - 0.5, 0.42), (0.26, 0.26), kind="wood_dark", bevel=0.02)
    # Roof boards collapsed inside, a rafter still hanging off the back plate.
    for i in range(6):
        p.box((1.8, 0.24, 0.03), loc=(-2.2 + _rand(i) * 4.4, -1.2 + _rand(i + 8) * 3.0, 0.05 + 0.12 * _rand(i + 16)),
              rot=(0.05 * _rand(i), 0.1 * _rand(i + 2), _rand(i + 24) * 3.14), kind="board_grey", grain="x", bevel=0.005)
    p.beam((1.5, W / 2 - 0.1, 2.25), (0.9, -0.6, 0.05), (0.1, 0.14), kind="wood_dark", bevel=0.01)
    return p


def fishing_shack():
    """A small board fishing shack on the island, door to the front (-Y):
    hipped board roof, stovepipe, a net drying on a pole rack."""
    p = Prop("fishing_shack", seed=717)
    W, D, E = 1.8, 1.6, 1.6
    t = 0.04
    p.box((W + 0.3, D + 0.3, 0.14), loc=(0, 0, 0.07), kind="wood_dark", grain="x", bevel=0.01)
    for sy in (-1, 1):
        p.box((W, t, E), loc=(0, sy * (D / 2 - t / 2), 0.14 + E / 2), kind="board_grey", grain="z", bevel=0.004)
    for sx in (-1, 1):
        p.box((t, D - 2 * t, E), loc=(sx * (W / 2 - t / 2), 0, 0.14 + E / 2), kind="board_grey", grain="z", bevel=0.004)
    for k in range(6):
        p.box((0.04, 0.03, E), loc=(-W / 2 + 0.15 + k * 0.3, -D / 2 - 0.015, 0.14 + E / 2), kind="wood_grey", grain="z", bevel=0.003)
    p.box((0.62, 0.03, 1.35), loc=(-0.35, -D / 2 - 0.03, 0.14 + 0.68), kind="socket", bevel=0)
    p.box((0.03, 0.62, 1.35), loc=(-0.03, -D / 2 - 0.3, 0.14 + 0.68), rot=(0, 0, -0.5), kind="board_grey", grain="z", bevel=0.004)
    p.box((0.4, 0.03, 0.3), loc=(0.45, -D / 2 - 0.03, 1.1), kind="glass", bevel=0)
    z0 = 0.14 + E
    p.lathe([(1.45, z0 - 0.05), (0.08, z0 + 0.9)], sides=4, rot=(0, 0, math.pi / 4), kind="board_grey", cap_top=True, cap_bottom=True, faceted=True)
    p.cylinder(0.06, 0.9, sides=8, loc=(0.45, 0.35, z0 + 0.3), kind="iron")
    # Net rack beside the shack (+X).
    for y in (-0.7, 0.7):
        p.cylinder(0.04, 1.6, sides=6, loc=(W / 2 + 0.9, y, 0), kind="wood_grey")
    p.cylinder(0.035, 1.6, sides=6, loc=(W / 2 + 0.9, -0.8, 1.55), rot=(-math.pi / 2, 0, 0), kind="wood_grey")
    p.box((0.02, 1.4, 1.1), loc=(W / 2 + 0.92, 0, 1.0), rot=(0.0, 0.08, 0), kind="rope", grain="z", bevel=0)
    return p


BUILDERS = (windmill_tower, lookout_tower, dock_pier, dock_walk, ranch_gate, chimney_ruin, burnt_ruin, cabin_ruin, fishing_shack)
