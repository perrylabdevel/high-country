"""The mission and camps slice of the western prop kit: La Esperanza Mission
and El Paso Verde, the timber camp, the sheep camp, the outlaw hideouts and
the lodge camp on the tribal lands. Same conventions as pr_props (metres,
Z up, long axis X, front -Y).

The tribal camp pieces are everyday working gear (a travois, a meat-drying
rack, a hide stretched on a frame, a hearth), deliberately not ceremonial
objects the project has no research behind.
"""

import math

from mathutils import Matrix

from pr_common import Prop
from pr_props import _wheel
from pr_trail import _stone


def _rand(seed):
    x = math.sin(seed * 47.77) * 43758.5453
    return x - math.floor(x)


# --------------------------------------------------------------------------
# Mission and El Paso Verde


def horno():
    """A beehive adobe bread oven on a low plinth, door to the front (-Y)."""
    p = Prop("horno", seed=501)
    p.box((1.7, 1.7, 0.45), loc=(0, 0, 0.22), kind="adobe", grain="x", bevel=0.06)
    p.lathe([(0.78, 0.45), (0.8, 0.7), (0.72, 1.05), (0.52, 1.35), (0.25, 1.52), (0.0, 1.56)], sides=14, kind="adobe", cap_bottom=False, cap_top=False)
    # Door and smoke hole: dark insets; a board lid leaning by the door.
    p.box((0.42, 0.1, 0.4), loc=(0, -0.76, 0.72), kind="socket", bevel=0)
    p.box((0.46, 0.04, 0.44), loc=(0.42, -0.92, 0.66), rot=(0.25, 0, 0.1), kind="wood_grey", grain="z", bevel=0.005)
    p.lathe([(0.06, 1.3), (0.06, 1.52)], sides=6, loc=(0.2, 0.25, 0), kind="socket", cap_bottom=False)
    return p


def carreta():
    """A two-wheeled Mexican ox cart: solid cross-plank wheels, pole to the front (+X)."""
    p = Prop("carreta", seed=503)
    r = 0.75
    for sy in (-1, 1):
        with p.at(Matrix.Translation((0, sy * 0.72, r)) @ Matrix.Rotation(math.pi / 2, 4, "X")):
            # Solid wheel: a thick disc of three planks with a hub boss.
            p.lathe([(0.0, -0.06), (r, -0.06), (r, 0.06), (0.0, 0.06)], sides=16, kind="wood_dark", cap_bottom=False, cap_top=False)
            p.cylinder(0.16, 0.3, sides=10, loc=(0, 0, -0.15), kind="wood_dark")
            for k in (-1, 1):
                p.box((0.06, 1.4, 0.13), loc=(k * 0.26, 0, 0), kind="wood", grain="y", bevel=0.01)
    p.beam((0, -0.9, r), (0, 0.9, r), (0.12, 0.12), kind="wood_dark")
    # Bed frame and pole running forward to the yoke.
    p.beam((-1.2, 0, r + 0.15), (3.0, 0, 0.45), (0.14, 0.14), kind="wood_dark")
    p.box((2.4, 1.2, 0.08), loc=(-0.1, 0, r + 0.22), rot=(0, -0.02, 0), kind="wood_grey", bevel=0.01)
    # Stake sides of lashed poles.
    for sy in (-1, 1):
        for x in (-1.1, -0.4, 0.3, 1.0):
            p.cylinder(0.03, 0.8, sides=5, loc=(x, sy * 0.58, r + 0.25), rot=(sy * 0.1, 0, 0), kind="wood_grey")
        p.beam((-1.15, sy * 0.62, r + 0.95), (1.05, sy * 0.62, r + 0.93), (0.05, 0.05), kind="wood_grey", bevel=0.006)
    p.box((0.18, 1.4, 0.14), loc=(3.0, 0, 0.42), kind="wood_dark", grain="y", bevel=0.01)
    return p


def ollas():
    """Three clay water ollas and a bowl, at a doorway."""
    p = Prop("ollas", seed=505)
    for i, (x, y, s) in enumerate(((0, 0, 1.0), (0.46, 0.18, 0.8), (-0.1, 0.45, 0.65))):
        prof = [(0.0, 0.0), (0.16 * s, 0.02), (0.28 * s, 0.22 * s), (0.25 * s, 0.42 * s), (0.12 * s, 0.52 * s), (0.13 * s, 0.58 * s), (0.1 * s, 0.58 * s), (0.08 * s, 0.53 * s)]
        p.lathe(prof, sides=12, loc=(x, y, 0), kind="clay", cap_bottom=False, cap_top=True)
    p.lathe([(0.0, 0.0), (0.12, 0.01), (0.2, 0.1), (0.19, 0.11), (0.1, 0.05)], sides=12, loc=(0.35, -0.35, 0), kind="clay", cap_bottom=False, cap_top=True)
    return p


def grave_cross():
    """A camposanto grave: a small wooden cross and an edging of stones."""
    p = Prop("grave_cross", seed=507)
    k = 0
    for i in range(10):
        k += 1
        a = 2 * math.pi * i / 10
        x, y = math.cos(a) * 0.95, math.sin(a) * 0.42
        _stone(p, (x, y, -0.03), (0.34, 0.28, 0.2), k + 500, rot_z=a, sides=5)
    # The mounded earth over the grave inside the stones.
    with p.at(Matrix.Diagonal((1.0, 0.45, 1.0, 1.0))):
        p.lathe([(0.85, -0.02), (0.7, 0.1), (0.35, 0.18), (0.0, 0.2)], sides=10, kind="adobe", cap_bottom=False, cap_top=False)
    with p.at(Matrix.Translation((-1.05, 0, -0.3)) @ Matrix.Rotation(0.04, 4, "Y")):
        p.box((0.07, 0.06, 1.35), loc=(0, 0, 0.68), kind="wood_grey", grain="z", bevel=0.006)
        p.box((0.06, 0.52, 0.07), loc=(0, 0, 1.12), kind="wood_grey", grain="y", bevel=0.006)
    return p


# --------------------------------------------------------------------------
# Timber camp


def log_deck():
    """Peeled logs decked on two skids at a landing, ends sawn square."""
    p = Prop("log_deck", seed=511)
    L = 6.0
    for x in (-1.8, 1.8):
        p.lathe([(0.2, -1.4), (0.2, 1.4)], sides=8, loc=(x, 0, 0.18), rot=(math.pi / 2, 0, 0), kind="bark", cap_kind="endgrain")
    k = 0
    for layer, n in enumerate((5, 4, 3)):
        for i in range(n):
            k += 1
            r = 0.2 + 0.05 * _rand(k)
            y = (i - (n - 1) / 2) * 0.46
            z = 0.36 + r + layer * 0.4
            p.lathe([(r, -L / 2), (r * 0.9, L / 2)], sides=9, loc=((_rand(k + 3) - 0.5) * 0.3, y, z), rot=(0, math.pi / 2, 0), kind="peeled", cap_kind="endgrain", jitter=0.03)
    return p


def sawbuck():
    """A sawbuck with a log in its cradle and a crosscut saw leaning on it."""
    p = Prop("sawbuck", seed=513)
    for x in (-0.55, 0.55):
        for s in (-1, 1):
            p.beam((x, s * 0.35, 0.0), (x, -s * 0.2, 1.0), (0.07, 0.07), kind="wood_grey", bevel=0.01)
    p.beam((-0.65, 0, 0.35), (0.65, 0, 0.35), (0.06, 0.06), kind="wood_grey", bevel=0.008)
    p.lathe([(0.17, -1.2), (0.16, 1.2)], sides=9, loc=(0.15, 0, 0.88), rot=(0, math.pi / 2, 0.4), kind="bark", cap_kind="endgrain", jitter=0.04)
    # Crosscut saw: a long toothed blade with a handle at each end.
    with p.at(Matrix.Translation((0, 0.42, 0.05)) @ Matrix.Rotation(1.2, 4, "X")):
        p.box((1.6, 0.18, 0.004), loc=(0, 0.3, 0), kind="iron", grain="x", bevel=0)
        for sx in (-1, 1):
            p.cylinder(0.02, 0.28, sides=6, loc=(sx * 0.82, 0.1, 0), rot=(-math.pi / 2, 0, 0), kind="wood")
    return p


def stump():
    """A fresh-cut stump with its sawn face and a notch."""
    p = Prop("stump", seed=515)
    p.lathe([(0.52, -0.1), (0.46, 0.1), (0.38, 0.35), (0.36, 0.55)], sides=12, kind="bark", cap_kind="endgrain", jitter=0.08)
    for i in range(4):
        a = i * math.pi / 2 + 0.4
        p.tube([(math.cos(a) * 0.4, math.sin(a) * 0.4, 0.05), (math.cos(a) * 0.85, math.sin(a) * 0.85, -0.05)], [0.11, 0.05], sides=6, kind="bark")
    return p


# --------------------------------------------------------------------------
# Sheep camp


def sheep_wagon():
    """A sheepherder's wagon: canvas over bows, stovepipe, Dutch door at the back (-X)."""
    p = Prop("sheep_wagon", seed=521)
    for x, r in ((-1.3, 0.58), (1.2, 0.48)):
        p.beam((x, -0.85, r), (x, 0.85, r), (0.09, 0.09), kind="wood_dark")
        for y in (-0.85, 0.85):
            with p.at(Matrix.Translation((x, y, r)) @ Matrix.Rotation(math.pi / 2, 4, "X")):
                _wheel(p, r, hub_len=0.2)
    bed = 0.95
    L, W = 3.4, 1.5
    p.box((L, W, 0.12), loc=(0, 0, bed), kind="wood_dark", bevel=0.02)
    for sy in (-1, 1):
        p.box((L, 0.05, 0.55), loc=(0, sy * (W / 2), bed + 0.33), kind="paint_green", bevel=0.01)
    for sx in (-1, 1):
        p.box((0.05, W, 0.55), loc=(sx * L / 2, 0, bed + 0.33), kind="paint_green", grain="y", bevel=0.01)
    # Canvas over the bows, as a half-cylinder shell.
    top = bed + 0.6
    for i in range(8):
        a0, a1 = math.pi * i / 8, math.pi * (i + 1) / 8
        y0, z0 = W / 2 * math.cos(a0) * 1.02, top + math.sin(a0) * 0.95
        y1, z1 = W / 2 * math.cos(a1) * 1.02, top + math.sin(a1) * 0.95
        mid_y, mid_z = (y0 + y1) / 2, (z0 + z1) / 2
        seg = math.hypot(y1 - y0, z1 - z0)
        ang = math.atan2(z1 - z0, y1 - y0)
        p.box((L + 0.1, seg + 0.02, 0.03), loc=(0, mid_y, mid_z), rot=(ang, 0, 0), kind="canvas", grain="x", bevel=0)
    # Back end: board panel with a Dutch door and a step.
    p.box((0.05, W, 0.95), loc=(-L / 2 - 0.02, 0, top + 0.4), kind="board_grey", grain="z", bevel=0.005)
    p.box((0.04, 0.6, 1.3), loc=(-L / 2 - 0.05, 0.2, top + 0.05), kind="socket", bevel=0)
    p.box((0.3, 0.6, 0.05), loc=(-L / 2 - 0.3, 0.2, 0.55), kind="wood_grey", bevel=0.005)
    # Stovepipe through the canvas near the front, and a water barrel lashed on the side.
    p.cylinder(0.06, 0.9, sides=8, loc=(0.9, 0.35, top + 0.6), kind="iron")
    p.lathe([(0.2, 0.0), (0.23, 0.25), (0.2, 0.5)], sides=10, loc=(0.4, W / 2 + 0.25, 0.75), kind="stave")
    p.beam((1.4, 0, 0.55), (3.2, 0, 0.1), (0.08, 0.07), kind="wood_dark")
    return p


def wool_sacks():
    """Long burlap wool sacks, stuffed tight, leaning together."""
    p = Prop("wool_sacks", seed=523)
    for i, (x, y, a) in enumerate(((0, 0, 0.05), (0.62, 0.1, -0.12), (0.3, 0.55, 0.1))):
        with p.at(Matrix.Translation((x, y, 0)) @ Matrix.Rotation(a, 4, "X")):
            p.lathe([(0.24, 0.0), (0.3, 0.2), (0.3, 1.2), (0.26, 1.45), (0.12, 1.55), (0.0, 1.57)], sides=10, kind="burlap", cap_top=False)
    return p


# --------------------------------------------------------------------------
# Outlaw hideouts


def lean_to():
    """A pole-and-brush lean-to against the wind, open to the front (-Y)."""
    p = Prop("lean_to", seed=531)
    L = 3.6
    for sx in (-1, 1):
        p.cylinder(0.06, 2.0, sides=6, loc=(sx * L / 2, -1.0, 0), rot=(0.15, 0, 0), kind="wood_grey")
    p.beam((-L / 2 - 0.2, -0.72, 1.95), (L / 2 + 0.2, -0.72, 1.95), (0.08, 0.08), kind="wood_grey", bevel=0.01)
    for i in range(9):
        x = -L / 2 + i * L / 8
        p.beam((x, -0.72, 1.95), (x + (_rand(i) - 0.5) * 0.2, 1.3, 0.0), (0.05, 0.05), kind="wood_grey", bevel=0.006)
    # Brush and a canvas patch laid over the poles.
    ang = math.atan2(1.95, 2.02)
    with p.at(Matrix.Translation((0, 0.3, 0.97)) @ Matrix.Rotation(-ang, 4, "X")):
        p.box((L + 0.3, 2.9, 0.12), kind="brush", grain="y", bevel=0.04)
        p.box((1.6, 1.4, 0.02), loc=(0.6, -0.3, 0.08), kind="canvas", grain="x", bevel=0)
    # Bedroll inside.
    p.lathe([(0.16, -0.9), (0.18, 0.9)], sides=8, loc=(-0.4, 0.2, 0.17), rot=(0, math.pi / 2, 0), kind="blanket")
    return p


def shack():
    """A rough board shack with a sod roof, door toward -Y."""
    p = Prop("shack", seed=533)
    W, D, E = 3.2, 2.8, 2.1
    t = 0.05
    for sy in (-1, 1):
        p.box((W, t, E), loc=(0, sy * (D / 2 - t / 2), E / 2), kind="board_grey", grain="z", bevel=0.005)
    for sx in (-1, 1):
        p.box((t, D - 2 * t, E), loc=(sx * (W / 2 - t / 2), 0, E / 2), kind="board_grey", grain="z", bevel=0.005)
    for k in range(9):
        p.box((0.05, 0.06, E - 0.05), loc=(-W / 2 + 0.2 + k * 0.35, -D / 2 - 0.02, E / 2), kind="wood_grey", grain="z", bevel=0.003)
    p.box((0.8, 0.05, 1.8), loc=(0.6, -D / 2 - 0.05, 0.9), kind="socket", bevel=0)
    p.box((0.05, 0.8, 1.8), loc=(1.02, -D / 2 - 0.4, 0.9), rot=(0, 0, 0.3), kind="board_grey", grain="z", bevel=0.004)
    p.box((0.5, 0.05, 0.4), loc=(-0.8, -D / 2 - 0.05, 1.3), kind="socket", bevel=0)
    # Pole roof under sod, pitched gently to the back.
    p.box((W + 0.5, D + 0.5, 0.1), loc=(0, 0, E + 0.12), rot=(-0.08, 0, 0), kind="wood_dark", bevel=0.01)
    p.box((W + 0.3, D + 0.3, 0.2), loc=(0, 0, E + 0.26), rot=(-0.08, 0, 0), kind="sod", bevel=0.08)
    p.cylinder(0.06, 0.7, sides=7, loc=(-1.0, 0.8, E + 0.2), kind="iron")
    return p


def picket_line():
    """A picket line between two posts with halters and a saddle blanket over it."""
    p = Prop("picket_line", seed=535)
    L = 7.0
    for sx in (-1, 1):
        p.cylinder(0.08, 1.6, sides=7, loc=(sx * L / 2, 0, -0.2), rot=(0, sx * -0.06, 0), kind="wood_grey", r_top=0.07)
    p.tube([(-L / 2, 0, 1.25)] + [(-L / 2 + L * t, 0, 1.25 - 0.15 * math.sin(math.pi * t)) for t in (0.25, 0.5, 0.75)] + [(L / 2, 0, 1.25)],
           [0.015] * 5, sides=4, kind="rope")
    for x in (-1.9, -0.2, 1.6):
        z = 1.25 - 0.15 * math.sin(math.pi * (x + L / 2) / L)
        p.tube([(x, 0, z), (x + 0.05, 0.05, z - 0.55)], [0.012, 0.012], sides=4, kind="leather")
        p.ring(0.1, 0.03, 0.02, sides=8, loc=(x + 0.05, 0.05, z - 0.62), rot=(math.pi / 2, 0, 0), kind="leather")
    p.box((0.8, 0.02, 0.6), loc=(0.8, 0, 1.0), rot=(0, 0, 0.05), kind="blanket", grain="x", bevel=0)
    return p


def strongbox():
    """A Wells Fargo express box, pried open, beside a saddlebag."""
    p = Prop("strongbox", seed=537)
    L, W, H = 0.62, 0.32, 0.3
    p.box((L, W, H), loc=(0, 0, H / 2), kind="paint_green", grain="x", bevel=0.01)
    for x in (-0.22, 0.0, 0.22):
        p.box((0.04, W + 0.02, H + 0.02), loc=(x, 0, H / 2), kind="iron", grain="z", bevel=0.003)
    with p.at(Matrix.Translation((0, W / 2, H)) @ Matrix.Rotation(-1.9, 4, "X")):
        p.box((L + 0.01, W + 0.01, 0.06), loc=(0, -W / 2, 0.03), kind="paint_green", grain="x", bevel=0.008)
    p.box((0.1, 0.02, 0.1), loc=(0, -W / 2 - 0.01, H - 0.08), kind="iron", bevel=0.004)
    p.lathe([(0.0, -0.18), (0.12, -0.15), (0.14, 0.0), (0.12, 0.15), (0.0, 0.18)], sides=8, loc=(0.6, 0.15, 0.1), rot=(0, math.pi / 2, 0.3), kind="leather", cap_bottom=False, cap_top=False)
    return p


# --------------------------------------------------------------------------
# Tribal lands camp: working gear


def travois():
    """Two long poles crossed at the top, a hide-lashed platform between them."""
    p = Prop("travois", seed=541)
    for sy in (-1, 1):
        p.lathe([(0.045, 0.0), (0.035, 5.2)], sides=6, loc=(-2.4, sy * 0.7, 0.03), rot=(0, math.pi / 2 - 0.22, -sy * 0.14), kind="wood_grey")
    for x, w in ((-1.6, 1.3), (-0.9, 1.1)):
        p.beam((x, -w / 2, 0.22 + (x + 2.4) * 0.22), (x, w / 2, 0.22 + (x + 2.4) * 0.22), (0.04, 0.04), kind="wood_grey", bevel=0.005)
    p.box((1.0, 1.0, 0.02), loc=(-1.25, 0, 0.35), rot=(0, -0.22, 0), kind="hide", grain="x", bevel=0)
    return p


def hide_frame():
    """A hide laced into a pole frame, stood upright to dry."""
    p = Prop("hide_frame", seed=543)
    S = 2.0
    for sx in (-1, 1):
        p.cylinder(0.04, S + 0.4, sides=6, loc=(sx * S / 2, 0, 0), rot=(0.12, 0, 0), kind="wood_grey")
    for z in (0.25, S + 0.1):
        p.beam((-S / 2 - 0.15, 0.05 - z * 0.12, z), (S / 2 + 0.15, 0.05 - z * 0.12, z), (0.04, 0.04), kind="wood_grey", bevel=0.005)
    with p.at(Matrix.Translation((0, 0.05 - 1.2 * 0.12, 1.2)) @ Matrix.Rotation(0.12, 4, "X")):
        p.box((1.5, 0.015, 1.5), kind="hide", grain="z", bevel=0)
        for i in range(8):
            a = 2 * math.pi * i / 8
            x, z = math.cos(a) * 0.85, math.sin(a) * 0.85
            p.tube([(x * 0.88, 0, z * 0.88), (x * 1.12, 0, z * 1.12)], [0.006, 0.006], sides=3, kind="leather")
    return p


def drying_rack():
    """Forked posts carrying two poles hung with strips of meat."""
    p = Prop("drying_rack", seed=545)
    L = 2.6
    for sx in (-1, 1):
        p.cylinder(0.05, 1.85, sides=6, loc=(sx * L / 2, 0, 0), kind="wood_grey")
        for sy in (-1, 1):
            p.beam((sx * L / 2, 0, 1.6), (sx * L / 2, sy * 0.15, 1.9), (0.03, 0.03), kind="wood_grey", bevel=0.004)
    for y in (-0.1, 0.1):
        p.beam((-L / 2 - 0.2, y, 1.82), (L / 2 + 0.2, y, 1.82), (0.035, 0.035), kind="wood_grey", bevel=0.005)
    for i in range(10):
        x = -1.1 + i * 0.24
        y = -0.1 if i % 2 else 0.1
        h = 0.45 + 0.2 * _rand(i)
        p.box((0.08, 0.01, h), loc=(x, y, 1.82 - h / 2), rot=(0, (_rand(i + 5) - 0.5) * 0.2, 0), kind="meat", grain="z", bevel=0)
    return p


def fire_pit():
    """A hearth: a ring of stones around ash and burnt ends, no pot."""
    p = Prop("fire_pit", seed=547)
    n = 9
    for i in range(n):
        a = 2 * math.pi * i / n + (_rand(i) - 0.5) * 0.2
        s = 0.2 + 0.06 * _rand(i + 7)
        _stone(p, (math.cos(a) * 0.55, math.sin(a) * 0.55, -0.03), (s, s * 0.9, s * 0.7), i + 560, rot_z=a)
    p.lathe([(0.0, 0.0), (0.45, 0.0), (0.42, 0.03), (0.18, 0.06), (0.0, 0.065)], sides=12, kind="char", cap_bottom=False, cap_top=False)
    for i, a in enumerate((0.5, 2.3, 4.0)):
        p.lathe([(0.045, -0.24), (0.05, 0.24)], sides=6, loc=(math.cos(a) * 0.1, math.sin(a) * 0.1, 0.08), rot=(math.pi / 2, 0.15, a + math.pi / 2), kind="char", cap_kind="char", jitter=0.1)
    return p


BUILDERS = (horno, carreta, ollas, grave_cross, log_deck, sawbuck, stump, sheep_wagon, wool_sacks,
            lean_to, shack, picket_line, strongbox, travois, hide_frame, drying_rack, fire_pit)
