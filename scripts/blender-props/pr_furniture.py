"""The furniture kit: interior pieces that were still plain boxes in the ranch
house, the hunting cabin and Silver Creek's enterable lots (src/buildings.js,
src/landmarks.js, src/interiors.js). Same conventions as pr_props (metres,
Z up, base on z=0, long axis X, front -Y: the side you use it from — a
chair's seat, a counter's customer side, a shelf's open face).
"""

import math

from mathutils import Matrix

from pr_common import Prop


def _rand(seed):
    x = math.sin(seed * 53.171) * 43758.5453
    return x - math.floor(x)


def _legs(p, hx, hy, h, section=0.05, kind="wood_dark", inset=0.04):
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((section, section, h), loc=(sx * (hx - inset), sy * (hy - inset), h / 2), kind=kind, grain="z", bevel=0.006)


# --------------------------------------------------------------------------
# Beds and seats


def bed_double():
    """A turned-post double bed, quilt and pillows; headboard at -X."""
    p = Prop("bed_double", seed=801)
    L, W = 2.05, 1.4
    for sx, h in ((-1, 1.15), (1, 0.75)):
        for sy in (-1, 1):
            p.lathe([(0.04, 0), (0.035, h - 0.1), (0.05, h - 0.06), (0.0, h)], sides=8, loc=(sx * (L / 2 - 0.04), sy * (W / 2 - 0.04), 0), kind="wood_dark")
        p.box((0.04, W - 0.08, h - 0.4), loc=(sx * (L / 2 - 0.04), 0, 0.3 + (h - 0.4) / 2), kind="wood", grain="y", bevel=0.008)
    for sy in (-1, 1):
        p.box((L - 0.08, 0.04, 0.16), loc=(0, sy * (W / 2 - 0.04), 0.3), kind="wood_dark", grain="x", bevel=0.008)
    p.box((L - 0.12, W - 0.1, 0.2), loc=(0, 0, 0.44), kind="canvas", grain="x", bevel=0.06)
    p.box((L - 0.55, W - 0.02, 0.05), loc=(0.2, 0, 0.555), kind="blanket", grain="x", bevel=0.02)
    p.box((L - 0.55, 0.03, 0.22), loc=(0.2, -W / 2, 0.47), kind="blanket", grain="x", bevel=0.01)
    p.box((L - 0.55, 0.03, 0.22), loc=(0.2, W / 2, 0.47), kind="blanket", grain="x", bevel=0.01)
    for sy in (-1, 1):
        p.box((0.36, 0.55, 0.12), loc=(-L / 2 + 0.3, sy * 0.3, 0.6), rot=(0, -0.15, 0), kind="canvas", grain="y", bevel=0.05)
    return p


def bed_single():
    """An iron-framed hotel bed: rails and bedstead, mattress, grey blanket."""
    p = Prop("bed_single", seed=803)
    L, W = 2.0, 1.0
    for sx, h in ((-1, 1.05), (1, 0.8)):
        for sy in (-1, 1):
            p.cylinder(0.02, h, sides=6, loc=(sx * (L / 2 - 0.02), sy * (W / 2 - 0.02), 0), kind="iron")
        for z in (h - 0.03, 0.32):
            p.cylinder(0.015, W - 0.04, sides=6, loc=(sx * (L / 2 - 0.02), -W / 2 + 0.02, z), rot=(-math.pi / 2, 0, 0), kind="iron")
        for k in range(5):
            y = -W / 2 + 0.18 + k * 0.16
            p.cylinder(0.009, h - 0.35, sides=5, loc=(sx * (L / 2 - 0.02), y, 0.32), kind="iron")
    for sy in (-1, 1):
        p.box((L - 0.04, 0.03, 0.05), loc=(0, sy * (W / 2 - 0.02), 0.3), kind="iron", grain="x", bevel=0.004)
    p.box((L - 0.08, W - 0.06, 0.16), loc=(0, 0, 0.4), kind="canvas", grain="x", bevel=0.05)
    p.box((L - 0.5, W, 0.04), loc=(0.2, 0, 0.49), kind="blanket", grain="x", bevel=0.015)
    p.box((0.34, 0.6, 0.1), loc=(-L / 2 + 0.26, 0, 0.53), kind="canvas", grain="y", bevel=0.04)
    return p


def cot():
    """A trapper's canvas camp cot on X legs with a rolled blanket."""
    p = Prop("cot", seed=805)
    L, W = 2.0, 0.8
    for sy in (-1, 1):
        p.cylinder(0.025, L, sides=6, loc=(-L / 2, sy * (W / 2 - 0.03), 0.42), rot=(0, math.pi / 2, 0), kind="wood")
    for x in (-L / 2 + 0.15, L / 2 - 0.15):
        for sy in (-1, 1):
            p.beam((x - 0.18, sy * (W / 2 - 0.05), 0.0), (x + 0.18, sy * (W / 2 - 0.05), 0.42), (0.035, 0.035), kind="wood", bevel=0.004)
            p.beam((x + 0.18, sy * (W / 2 - 0.08), 0.0), (x - 0.18, sy * (W / 2 - 0.08), 0.42), (0.035, 0.035), kind="wood", bevel=0.004)
    p.box((L - 0.1, W - 0.04, 0.02), loc=(0, 0, 0.41), kind="canvas", grain="x", bevel=0)
    p.lathe([(0.12, -0.35), (0.13, 0.35)], sides=10, loc=(-L / 2 + 0.35, 0, 0.55), rot=(math.pi / 2, 0, 0), kind="blanket")
    p.box((1.1, W - 0.12, 0.05), loc=(0.35, 0, 0.445), kind="blanket", grain="x", bevel=0.02)
    return p


def chair():
    """A ladder-back kitchen chair; seat faces -Y."""
    p = Prop("chair", seed=807)
    S, H = 0.44, 0.46
    for sx in (-1, 1):
        p.box((0.04, 0.04, H), loc=(sx * (S / 2 - 0.03), -S / 2 + 0.03, H / 2), kind="wood_dark", grain="z", bevel=0.006)
        p.box((0.04, 0.04, 1.0), loc=(sx * (S / 2 - 0.03), S / 2 - 0.03, 0.5), rot=(-0.06, 0, 0), kind="wood_dark", grain="z", bevel=0.006)
    p.box((S, S, 0.035), loc=(0, 0, H), kind="wood", grain="x", bevel=0.008)
    for z in (0.62, 0.78, 0.93):
        p.box((S - 0.06, 0.02, 0.07), loc=(0, S / 2 - 0.03 + (z - 0.5) * 0.06, z), kind="wood_dark", grain="x", bevel=0.005)
    for sy in (-1, 1):
        p.box((0.02, S - 0.06, 0.025), loc=(sy * (S / 2 - 0.03), 0, 0.16), kind="wood_dark", grain="y", bevel=0.003)
    return p


def stool():
    """A round three-legged plank stool."""
    p = Prop("stool", seed=809)
    p.lathe([(0.2, 0.46), (0.2, 0.5), (0.18, 0.51)], sides=12, kind="wood", cap_kind="endgrain")
    for k in range(3):
        a = 2 * math.pi * k / 3
        p.beam((math.cos(a) * 0.1, math.sin(a) * 0.1, 0.47), (math.cos(a) * 0.2, math.sin(a) * 0.2, 0.0), (0.04, 0.04), kind="wood_dark", bevel=0.005)
    return p


def pew():
    """A plain board church pew, 1.85 m; seat faces -Y."""
    p = Prop("pew", seed=811)
    L = 1.85
    for sx in (-1, 1):
        p.box((0.05, 0.5, 0.9), loc=(sx * (L / 2 - 0.025), 0.0, 0.45), kind="wood_dark", grain="z", bevel=0.01)
    p.box((L - 0.1, 0.42, 0.04), loc=(0, -0.02, 0.44), kind="wood", grain="x", bevel=0.008)
    p.box((L - 0.1, 0.04, 0.42), loc=(0, 0.22, 0.7), rot=(-0.12, 0, 0), kind="wood", grain="x", bevel=0.008)
    p.box((L - 0.1, 0.03, 0.12), loc=(0, 0.2, 0.2), kind="wood_dark", grain="x", bevel=0.006)
    return p


# --------------------------------------------------------------------------
# Tables, case goods


def table_long():
    """A plank farmhouse table, 2 x 0.95 m, with a stretcher."""
    p = Prop("table_long", seed=813)
    L, W, H = 2.0, 0.95, 0.76
    p.box((L, W, 0.05), loc=(0, 0, H - 0.025), kind="wood", grain="x", bevel=0.01)
    for k in range(3):
        p.box((0.02, W - 0.04, 0.006), loc=(-L / 2 + L / 4 * (k + 1), 0, H + 0.001), kind="wood_dark", grain="y", bevel=0)
    _legs(p, L / 2 - 0.1, W / 2 - 0.06, H - 0.05, section=0.07)
    for sy in (-1, 1):
        p.box((L - 0.3, 0.03, 0.1), loc=(0, sy * (W / 2 - 0.1), H - 0.1), kind="wood_dark", grain="x", bevel=0.005)
    p.box((L - 0.3, 0.05, 0.05), loc=(0, 0, 0.18), kind="wood_dark", grain="x", bevel=0.006)
    # A tin plate, a cup and a lamp.
    p.lathe([(0.12, H), (0.12, H + 0.015), (0.1, H + 0.015)], sides=12, loc=(-0.5, -0.15, 0), kind="zinc", cap_top=False)
    p.lathe([(0.04, H), (0.045, H + 0.09)], sides=8, loc=(-0.3, -0.25, 0), kind="zinc", cap_top=False)
    p.lathe([(0.07, H), (0.08, H + 0.08), (0.04, H + 0.12), (0.05, H + 0.2), (0.06, H + 0.3), (0.03, H + 0.34)], sides=10, loc=(0.4, 0.15, 0), kind="glass")
    return p


def table_square():
    """A square saloon table, 1.05 m, a deck of cards and a glass on it."""
    p = Prop("table_square", seed=815)
    S, H = 1.05, 0.76
    p.box((S, S, 0.045), loc=(0, 0, H - 0.022), kind="wood", grain="x", bevel=0.01)
    _legs(p, S / 2 - 0.08, S / 2 - 0.08, H - 0.045, section=0.06)
    for sy in (-1, 1):
        p.box((S - 0.24, 0.025, 0.09), loc=(0, sy * (S / 2 - 0.1), H - 0.09), kind="wood_dark", grain="x", bevel=0.004)
        p.box((0.025, S - 0.24, 0.09), loc=(sy * (S / 2 - 0.1), 0, H - 0.09), kind="wood_dark", grain="y", bevel=0.004)
    p.box((0.09, 0.06, 0.02), loc=(0.15, -0.1, H + 0.01), rot=(0, 0, 0.3), kind="bone", bevel=0.002)
    for k in range(3):
        p.box((0.09, 0.06, 0.003), loc=(-0.2 + k * 0.12, 0.2, H + 0.002), rot=(0, 0, k * 0.5), kind="bone", bevel=0)
    p.lathe([(0.035, H), (0.04, H + 0.1)], sides=8, loc=(-0.3, -0.25, 0), kind="glass", cap_top=False)
    p.lathe([(0.04, H), (0.04, H + 0.2), (0.015, H + 0.26), (0.015, H + 0.3)], sides=8, loc=(0.3, 0.3, 0), kind="glass")
    return p


def dresser():
    """A three-drawer pine dresser with a swing mirror."""
    p = Prop("dresser", seed=817)
    W, D, H = 1.0, 0.46, 0.9
    p.box((W, D, H), loc=(0, 0, H / 2), kind="wood", grain="x", bevel=0.01)
    p.box((W + 0.04, D + 0.03, 0.03), loc=(0, 0, H + 0.015), kind="wood_dark", grain="x", bevel=0.006)
    for k in range(3):
        z = 0.16 + k * 0.27
        p.box((W - 0.08, 0.02, 0.23), loc=(0, -D / 2 - 0.01, z + 0.1), kind="wood_dark", grain="x", bevel=0.006)
        for sx in (-1, 1):
            p.box((0.07, 0.025, 0.025), loc=(sx * 0.25, -D / 2 - 0.03, z + 0.11), kind="iron", bevel=0.004)
    for sx in (-1, 1):
        p.box((0.035, 0.035, 0.7), loc=(sx * 0.33, 0.12, H + 0.35), kind="wood_dark", grain="z", bevel=0.005)
    p.box((0.58, 0.02, 0.5), loc=(0, 0.12, H + 0.4), rot=(-0.08, 0, 0), kind="glass", bevel=0)
    p.box((0.62, 0.03, 0.54), loc=(0, 0.14, H + 0.4), rot=(-0.08, 0, 0), kind="wood_dark", grain="x", bevel=0.006)
    return p


def wardrobe():
    """A tall two-door wardrobe (a kas), cornice on top."""
    p = Prop("wardrobe", seed=819)
    W, D, H = 1.1, 0.6, 2.05
    p.box((W, D, H - 0.12), loc=(0, 0, 0.06 + (H - 0.12) / 2), kind="wood", grain="z", bevel=0.01)
    p.box((W + 0.1, D + 0.06, 0.1), loc=(0, 0, H - 0.05), kind="wood_dark", grain="x", bevel=0.015)
    p.box((W + 0.04, D + 0.02, 0.1), loc=(0, 0, 0.05), kind="wood_dark", grain="x", bevel=0.01)
    for sx in (-1, 1):
        p.box((W / 2 - 0.06, 0.02, H - 0.4), loc=(sx * W / 4, -D / 2 - 0.01, H / 2), kind="wood_dark", grain="z", bevel=0.008)
        p.box((W / 2 - 0.2, 0.012, H - 0.75), loc=(sx * W / 4, -D / 2 - 0.022, H / 2), kind="wood", grain="z", bevel=0.004)
        p.box((0.02, 0.03, 0.12), loc=(sx * 0.05, -D / 2 - 0.035, H / 2), kind="iron", bevel=0.003)
    return p


def cupboard():
    """A kitchen hutch: closed base, open plate shelves above with crockery."""
    p = Prop("cupboard", seed=821)
    W, D = 1.2, 0.5
    p.box((W, D, 0.85), loc=(0, 0, 0.425), kind="wood_grey", grain="x", bevel=0.01)
    p.box((W + 0.05, D + 0.05, 0.035), loc=(0, 0, 0.87), kind="wood", grain="x", bevel=0.006)
    for sx in (-1, 1):
        p.box((W / 2 - 0.05, 0.02, 0.62), loc=(sx * W / 4, -D / 2 - 0.01, 0.43), kind="wood", grain="z", bevel=0.006)
        p.box((0.025, 0.03, 0.025), loc=(sx * 0.06, -D / 2 - 0.03, 0.5), kind="iron", bevel=0.003)
        p.box((0.03, 0.3, 1.0), loc=(sx * (W / 2 - 0.015), 0.1, 1.39), kind="wood_grey", grain="z", bevel=0.005)
    p.box((W, 0.02, 1.0), loc=(0, 0.24, 1.39), kind="board_grey", grain="z", bevel=0.004)
    for z in (1.2, 1.55, 1.9):
        p.box((W - 0.06, 0.3, 0.025), loc=(0, 0.1, z), kind="wood_grey", grain="x", bevel=0.004)
    p.box((W + 0.08, 0.36, 0.06), loc=(0, 0.1, 1.92), kind="wood", grain="x", bevel=0.008)
    for i, z in enumerate((1.2, 1.55)):
        for k in range(4):
            p.lathe([(0.12, 0.0), (0.12, 0.012)], sides=12, loc=(-0.4 + k * 0.26, 0.18, z + 0.13), rot=(math.pi / 2 - 0.25, 0, 0), kind="clay")
        for k in range(3):
            p.lathe([(0.045, 0.0), (0.05, 0.1)], sides=8, loc=(-0.35 + k * 0.3, 0.0, z + 0.013), kind="clay", cap_top=False)
    return p


def washstand():
    """A washstand with an enamel basin, pitcher and a towel on the rail."""
    p = Prop("washstand", seed=823)
    W, D, H = 0.9, 0.5, 0.78
    p.box((W, D, 0.03), loc=(0, 0, H - 0.015), kind="wood", grain="x", bevel=0.006)
    _legs(p, W / 2 - 0.02, D / 2 - 0.02, H - 0.03, section=0.045)
    p.box((W - 0.08, D - 0.08, 0.02), loc=(0, 0, 0.2), kind="wood", grain="x", bevel=0.004)
    p.box((W - 0.08, 0.02, 0.22), loc=(0, D / 2 - 0.03, H + 0.11), kind="wood_dark", grain="x", bevel=0.005)
    p.lathe([(0.1, H), (0.2, H + 0.1), (0.21, H + 0.11)], sides=14, loc=(-0.1, -0.02, 0), kind="clay", cap_top=False, cap_bottom=True)
    p.lathe([(0.07, 0.0), (0.08, 0.08), (0.06, 0.2), (0.075, 0.26)], sides=10, loc=(0.3, 0.05, 0.215), kind="clay", cap_top=False)
    p.box((0.03, 0.02, 0.03), loc=(-W / 2 - 0.04, 0, 0.65), kind="wood_dark", bevel=0)
    p.box((0.02, 0.3, 0.35), loc=(-W / 2 - 0.05, 0, 0.5), kind="canvas", grain="z", bevel=0)
    return p


def desk():
    """A double-pedestal desk, 1.5 x 0.75 m, papers and an ink stand on it."""
    p = Prop("desk", seed=825)
    W, D, H = 1.5, 0.75, 0.77
    p.box((W, D, 0.04), loc=(0, 0, H - 0.02), kind="wood_dark", grain="x", bevel=0.008)
    for sx in (-1, 1):
        p.box((0.42, D - 0.06, H - 0.04), loc=(sx * (W / 2 - 0.23), 0, (H - 0.04) / 2), kind="wood", grain="z", bevel=0.008)
        # Drawers face the sitter at +Y.
        for k in range(3):
            p.box((0.36, 0.02, 0.19), loc=(sx * (W / 2 - 0.23), D / 2 - 0.02, 0.14 + k * 0.23), kind="wood_dark", grain="x", bevel=0.005)
            p.box((0.06, 0.02, 0.02), loc=(sx * (W / 2 - 0.23), D / 2 + 0.005, 0.16 + k * 0.23), kind="iron", bevel=0.003)
    p.box((W - 0.9, 0.02, 0.55), loc=(0, -D / 2 + 0.04, H - 0.32), kind="wood", grain="x", bevel=0.005)
    p.box((0.3, 0.22, 0.01), loc=(-0.2, 0.05, H + 0.005), rot=(0, 0, 0.15), kind="canvas", bevel=0)
    p.box((0.28, 0.2, 0.01), loc=(-0.15, 0.12, H + 0.012), rot=(0, 0, -0.2), kind="canvas", bevel=0)
    p.box((0.16, 0.1, 0.03), loc=(0.35, 0.1, H + 0.015), kind="wood", bevel=0.004)
    p.lathe([(0.025, H + 0.03), (0.025, H + 0.07)], sides=8, loc=(0.35, 0.1, 0), kind="glass")
    return p


def gun_rack():
    """A wall gun rack with three rifles standing in it."""
    p = Prop("gun_rack", seed=827)
    W, D = 1.1, 0.25
    p.box((W, D, 0.06), loc=(0, 0, 0.03), kind="wood_dark", grain="x", bevel=0.006)
    p.box((W, 0.03, 1.55), loc=(0, D / 2 - 0.015, 0.775), kind="wood_dark", grain="z", bevel=0.006)
    p.box((W, D, 0.04), loc=(0, 0, 1.15), kind="wood_dark", grain="x", bevel=0.006)
    for k in range(3):
        x = -0.32 + k * 0.32
        p.box((0.05, 0.12, 0.3), loc=(x, 0.0, 0.2), rot=(0.08, 0, 0), kind="wood", grain="z", bevel=0.01)
        p.box((0.035, 0.05, 0.55), loc=(x, 0.02, 0.62), rot=(0.08, 0, 0), kind="wood", grain="z", bevel=0.006)
        p.cylinder(0.012, 0.75, sides=6, loc=(x, 0.04, 0.85), rot=(0.08, 0, 0), kind="iron")
    return p


# --------------------------------------------------------------------------
# Kitchens and hearths


def cookstove():
    """A cast-iron cookstove on legs, oven door front, stovepipe up the back."""
    p = Prop("cookstove", seed=831)
    W, D = 1.05, 0.62
    p.box((W, D, 0.5), loc=(0, 0, 0.5), kind="iron", grain="x", bevel=0.015)
    p.box((W + 0.08, D + 0.06, 0.04), loc=(0, 0, 0.77), kind="iron", grain="x", bevel=0.008)
    _legs(p, W / 2 - 0.02, D / 2 - 0.02, 0.26, section=0.06, kind="iron")
    p.box((0.44, 0.03, 0.34), loc=(0.2, -D / 2 - 0.01, 0.5), kind="iron", grain="x", bevel=0.01)
    p.box((0.3, 0.03, 0.25), loc=(-0.28, -D / 2 - 0.01, 0.52), kind="iron", grain="x", bevel=0.01)
    p.box((0.1, 0.03, 0.02), loc=(0.2, -D / 2 - 0.04, 0.62), kind="zinc", bevel=0.004)
    for k in range(4):
        p.ring(0.1, 0.01, 0.015, sides=12, loc=(-0.3 + (k % 2) * 0.35, -0.12 + (k // 2) * 0.24, 0.795), kind="iron")
    p.cylinder(0.075, 1.7, sides=10, loc=(0.35, D / 2 - 0.1, 0.79), kind="iron")
    p.lathe([(0.14, 0.79), (0.13, 0.95), (0.04, 0.98)], sides=10, loc=(-0.2, 0.0, 0), kind="iron")
    p.lathe([(0.11, 0.8), (0.12, 0.98)], sides=10, loc=(0.2, 0.1, 0), kind="stave", cap_top=False)
    return p


def hearth():
    """A fieldstone fireplace, 2 m wide, mantel shelf, firebox open to -Y."""
    p = Prop("hearth", seed=833)
    W, D, H = 2.0, 0.9, 1.5
    p.box((W + 0.3, D + 0.5, 0.12), loc=(0, -0.2, 0.06), kind="stone", grain="x", bevel=0.02)
    for sx in (-1, 1):
        p.box((0.55, D, H), loc=(sx * (W / 2 - 0.275), 0, H / 2), kind="fieldstone", grain="z", bevel=0.04)
    p.box((W - 1.1, D, 0.45), loc=(0, 0, H - 0.225), kind="fieldstone", grain="x", bevel=0.03)
    p.box((W - 1.1, 0.2, H - 0.45), loc=(0, D / 2 - 0.1, (H - 0.45) / 2), kind="char", bevel=0)
    p.box((W + 0.2, D * 0.45, 0.08), loc=(0, -D / 2 + 0.1, H + 0.04), kind="wood_dark", grain="x", bevel=0.01)
    # Andirons and a couple of logs on the ash, a kettle on the crane.
    for sx in (-1, 1):
        p.box((0.04, 0.4, 0.2), loc=(sx * 0.25, 0.0, 0.22), kind="iron", bevel=0.005)
    for k in range(2):
        p.lathe([(0.07, -0.35), (0.075, 0.35)], sides=7, loc=(0, 0.05 - k * 0.12, 0.3 + k * 0.06), rot=(0, math.pi / 2, k * 0.2), kind="bark", cap_kind="char")
    p.beam((-0.4, 0.2, 0.9), (0.15, -0.1, 0.9), (0.03, 0.03), kind="iron", bevel=0.003)
    p.lathe([(0.08, 0.0), (0.12, 0.08), (0.1, 0.18), (0.04, 0.22)], sides=10, loc=(0.1, -0.1, 0.55), kind="iron")
    for k in range(3):
        p.lathe([(0.04, H + 0.08), (0.05, H + 0.2), (0.02, H + 0.27)], sides=8, loc=(-0.7 + k * 0.6, -D / 2 + 0.12, 0), kind="clay")
    return p


# --------------------------------------------------------------------------
# Town trade


def bar_counter():
    """A 4 m saloon bar: panelled front, brass foot rail, a spittoon."""
    p = Prop("bar_counter", seed=841)
    L, D, H = 4.0, 0.7, 1.08
    p.box((L, D - 0.1, H - 0.06), loc=(0, 0.05, (H - 0.06) / 2), kind="wood_dark", grain="x", bevel=0.01)
    p.box((L + 0.1, D + 0.05, 0.06), loc=(0, 0, H - 0.03), kind="wood", grain="x", bevel=0.015)
    n = 8
    for k in range(n):
        x = -L / 2 + L / n * (k + 0.5)
        p.box((L / n - 0.12, 0.02, H - 0.35), loc=(x, -D / 2 + 0.04, 0.5), kind="wood", grain="z", bevel=0.006)
    p.box((L, 0.03, 0.1), loc=(0, -D / 2 + 0.04, 0.05), kind="wood_dark", grain="x", bevel=0.005)
    p.cylinder(0.025, L - 0.2, sides=8, loc=(-L / 2 + 0.1, -D / 2 - 0.12, 0.18), rot=(0, math.pi / 2, 0), kind="zinc")
    for k in range(5):
        x = -L / 2 + 0.3 + k * (L - 0.6) / 4
        p.beam((x, -D / 2 + 0.05, 0.18), (x, -D / 2 - 0.12, 0.18), (0.03, 0.03), kind="zinc", bevel=0.003)
    p.lathe([(0.1, 0.0), (0.14, 0.08), (0.08, 0.14), (0.11, 0.18)], sides=12, loc=(0.9, -D / 2 - 0.35, 0), kind="zinc", cap_top=False)
    for k in range(4):
        p.lathe([(0.035, H), (0.04, H + 0.1)], sides=8, loc=(-1.4 + k * 0.8, -0.05 + (k % 2) * 0.1, 0), kind="glass", cap_top=False)
    return p


def bottles():
    """A back-bar row of bottles on a board, 0.6 m."""
    p = Prop("bottles", seed=843)
    p.box((0.62, 0.2, 0.02), loc=(0, 0, 0.01), kind="wood_dark", grain="x", bevel=0.004)
    for k in range(6):
        h = 0.26 + 0.06 * _rand(k)
        p.lathe([(0.035, 0.02), (0.035, 0.02 + h * 0.65), (0.012, 0.02 + h * 0.85), (0.012, 0.02 + h)], sides=8,
                loc=(-0.25 + k * 0.1, (_rand(k + 3) - 0.5) * 0.08, 0), kind="glass")
    return p


def piano():
    """An upright saloon piano with its stool; keyboard to -Y."""
    p = Prop("piano", seed=845)
    W, D, H = 1.45, 0.58, 1.25
    p.box((W, D - 0.25, H), loc=(0, 0.12, H / 2), kind="wood_dark", grain="z", bevel=0.012)
    p.box((W + 0.04, D - 0.2, 0.05), loc=(0, 0.12, H + 0.02), kind="wood_dark", grain="x", bevel=0.01)
    p.box((W - 0.12, 0.26, 0.1), loc=(0, -0.13, 0.72), kind="wood_dark", grain="x", bevel=0.008)
    p.box((W - 0.2, 0.15, 0.02), loc=(0, -0.17, 0.78), kind="bone", grain="x", bevel=0.003)
    for k in range(36):
        if k % 7 in (2, 6):
            continue
        p.box((0.012, 0.08, 0.012), loc=(-(W - 0.22) / 2 + k * (W - 0.22) / 36, -0.13, 0.795), kind="socket", bevel=0)
    for sx in (-1, 1):
        p.box((0.06, 0.08, 0.72), loc=(sx * (W / 2 - 0.05), -0.22, 0.36), kind="wood_dark", grain="z", bevel=0.01)
        p.box((0.02, 0.02, 0.12), loc=(sx * 0.35, -0.03, 1.05), kind="zinc", bevel=0.003)
    p.box((W - 0.3, 0.02, 0.4), loc=(0, -0.05, 1.0), kind="wood", grain="x", bevel=0.005)
    p.box((0.22, 0.02, 0.28), loc=(0, -0.07, 0.95), rot=(0.25, 0, 0), kind="canvas", bevel=0)
    p.lathe([(0.17, 0.46), (0.17, 0.52)], sides=12, loc=(0, -0.7, 0), kind="wood_dark")
    p.lathe([(0.04, 0.0), (0.03, 0.46)], sides=8, loc=(0, -0.7, 0), kind="wood_dark")
    for k in range(3):
        a = 2 * math.pi * k / 3
        p.beam((math.cos(a) * 0.03, -0.7 + math.sin(a) * 0.03, 0.12), (math.cos(a) * 0.2, -0.7 + math.sin(a) * 0.2, 0.0), (0.03, 0.03), kind="wood_dark", bevel=0.004)
    return p


def shelf_goods():
    """General-store shelving, 1.5 m, stocked: tins, jars, sacks, bolts of cloth."""
    p = Prop("shelf_goods", seed=847)
    W, D, H = 1.5, 0.38, 1.8
    for sx in (-1, 1):
        p.box((0.03, D, H), loc=(sx * (W / 2 - 0.015), 0, H / 2), kind="wood", grain="z", bevel=0.005)
    p.box((W, 0.02, H), loc=(0, D / 2 - 0.01, H / 2), kind="board_grey", grain="z", bevel=0.004)
    levels = (0.1, 0.55, 1.0, 1.45)
    for z in levels + (H - 0.02,):
        p.box((W - 0.06, D - 0.02, 0.025), loc=(0, 0, z), kind="wood", grain="x", bevel=0.004)
    k = 0
    for li, z in enumerate(levels):
        x = -W / 2 + 0.1
        while x < W / 2 - 0.12:
            k += 1
            r = _rand(k + li * 31)
            if li == 0:
                w = 0.32
                p.box((0.3, 0.26, 0.34), loc=(x + 0.15, -0.02, z + 0.18), rot=(0, 0, (r - 0.5) * 0.3), kind="burlap", grain="z", bevel=0.08)
            elif r < 0.35:
                w = 0.1
                p.lathe([(0.04, z + 0.013), (0.04, z + 0.13)], sides=8, loc=(x + 0.05, -0.05, 0), kind="zinc")
            elif r < 0.6:
                w = 0.12
                p.lathe([(0.05, z + 0.013), (0.05, z + 0.14), (0.035, z + 0.17)], sides=8, loc=(x + 0.06, -0.04, 0), kind="glass")
            elif r < 0.8:
                w = 0.2
                p.box((0.18, 0.14, 0.12), loc=(x + 0.1, -0.03, z + 0.075), kind="board_grey", grain="x", bevel=0.005)
            else:
                w = 0.14
                p.lathe([(0.06, -0.14), (0.06, 0.14)], sides=8, loc=(x + 0.07, -0.02, z + 0.075), rot=(math.pi / 2, 0, 0),
                        kind="blanket" if k % 2 else "canvas")
            x += w + 0.02
    return p


def pulpit():
    """A panelled pine lectern with a Bible on its sloped desk; reader at +Y."""
    p = Prop("pulpit", seed=849)
    W, D, H = 0.6, 0.5, 1.08
    p.box((W, D, H), loc=(0, 0, H / 2), kind="wood", grain="z", bevel=0.01)
    p.box((W - 0.12, 0.02, H - 0.3), loc=(0, -D / 2 - 0.01, H / 2), kind="wood_dark", grain="z", bevel=0.006)
    p.box((W + 0.1, D + 0.08, 0.05), loc=(0, 0, 0.025), kind="wood_dark", grain="x", bevel=0.008)
    p.box((W + 0.06, D + 0.1, 0.04), loc=(0, 0.02, H + 0.04), rot=(-0.3, 0, 0), kind="wood_dark", grain="x", bevel=0.008)
    p.box((0.36, 0.26, 0.06), loc=(0, 0.04, H + 0.1), rot=(-0.3, 0, 0), kind="leather", grain="x", bevel=0.01)
    return p


def altar_table():
    """A wooden church altar: panelled table under a white cloth, a brass
    cross and two candlesticks, on a one-step platform."""
    p = Prop("altar_table", seed=851)
    W, D, H = 2.2, 0.85, 1.0
    p.box((W + 0.6, D + 0.8, 0.14), loc=(0, 0.2, 0.07), kind="wood_dark", grain="x", bevel=0.01)
    p.box((W, D, H - 0.2), loc=(0, 0, 0.14 + (H - 0.2) / 2), kind="wood", grain="z", bevel=0.01)
    for k in range(3):
        p.box((W / 3 - 0.15, 0.02, H - 0.45), loc=(-W / 3 + k * W / 3, -D / 2 - 0.01, 0.14 + (H - 0.2) / 2), kind="wood_dark", grain="z", bevel=0.006)
    p.box((W + 0.08, D + 0.06, 0.05), loc=(0, 0, H - 0.035), kind="wood_dark", grain="x", bevel=0.008)
    p.box((W - 0.1, D + 0.1, 0.01), loc=(0, 0, H - 0.005), kind="canvas", grain="x", bevel=0)
    p.box((W * 0.5, 0.01, 0.4), loc=(0, -D / 2 - 0.05, H - 0.2), kind="canvas", grain="z", bevel=0)
    for x in (-0.75, 0.75):
        p.lathe([(0.07, 0.0), (0.05, 0.03), (0.02, 0.05), (0.02, 0.32), (0.045, 0.34), (0.0, 0.36)], sides=10, loc=(x, 0.15, H), kind="zinc")
        p.cylinder(0.018, 0.18, sides=6, loc=(x, 0.15, H + 0.36), kind="bone")
    p.box((0.2, 0.12, 0.05), loc=(0, 0.2, H + 0.025), kind="zinc", bevel=0.006)
    p.box((0.04, 0.04, 0.6), loc=(0, 0.2, H + 0.35), kind="zinc", grain="z", bevel=0.004)
    p.box((0.3, 0.04, 0.04), loc=(0, 0.2, H + 0.5), kind="zinc", grain="x", bevel=0.004)
    return p


BUILDERS = (bed_double, bed_single, cot, chair, stool, pew, table_long, table_square, dresser, wardrobe, cupboard,
            washstand, desk, gun_rack, cookstove, hearth, bar_counter, bottles, piano, shelf_goods, pulpit, altar_table)
