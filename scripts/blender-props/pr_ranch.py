"""The ranch slice of the western prop kit: working-yard pieces for a cattle
ranch of the 1870s-80s. Same conventions as pr_props (metres, Z up, base on
z=0, long axis X, front -Y)."""

import math

from mathutils import Matrix, Vector

from pr_common import Prop
from pr_props import _wheel


def _rand(seed):
    x = math.sin(seed * 91.345) * 47453.5453
    return x - math.floor(x)


def hay_bale():
    """A wire-tied square bale, 90 x 45 x 38 cm."""
    p = Prop("hay_bale", seed=101)
    L, W, H = 0.9, 0.46, 0.38
    p.box((L, W, H), loc=(0, 0, H / 2), kind="hay", grain="x", bevel=0.05)
    for x in (-0.22, 0.22):
        t = 0.008
        p.box((0.012, W + 2 * t, t), loc=(x, 0, H + t / 2 - 0.004), kind="wood_dark", grain="y", bevel=0)
        p.box((0.012, W + 2 * t, t), loc=(x, 0, t / 2 - 0.004), kind="wood_dark", grain="y", bevel=0)
        for sy in (-1, 1):
            p.box((0.012, t, H), loc=(x, sy * (W / 2 + t / 2 - 0.004), H / 2), kind="wood_dark", grain="z", bevel=0)
    return p


def woodpile():
    """A rick of split firewood, 1.8 m long, logs lying front to back."""
    p = Prop("woodpile", seed=103)
    length, rows = 1.8, 5
    k = 0
    for row in range(rows):
        r = 0.085
        z = r + row * r * 1.72
        count = int((length - (0.1 if row % 2 else 0)) / (2 * r * 0.98))
        for i in range(count):
            k += 1
            j = _rand(k)
            rr = r * (0.82 + 0.3 * j)
            x = -length / 2 + r + (0.09 if row % 2 else 0) + i * 2 * r * 0.98
            depth = 0.5 + 0.12 * _rand(k + 7)
            yo = (_rand(k + 3) - 0.5) * 0.08
            # Split rounds: 5-7 rough sides, bark outside, end grain on the cut faces.
            p.lathe([(rr, -depth / 2), (rr, depth / 2)], sides=5 + (k % 3), loc=(x, yo, z), rot=(math.pi / 2, 0, j * 6.28),
                    kind="bark", cap_kind="endgrain", jitter=0.12)
    # Stakes holding the ends of the rick.
    for sx in (-1, 1):
        p.box((0.07, 0.07, 0.95), loc=(sx * (length / 2 + 0.04), 0, 0.45), rot=(0, sx * 0.06, 0), kind="wood_grey", grain="z")
    return p


def chopping_block():
    p = Prop("chopping_block", seed=107)
    p.lathe([(0.3, 0.0), (0.27, 0.06), (0.25, 0.46)], sides=12, kind="bark", cap_kind="endgrain", jitter=0.06)
    # Axe bitten into the top, handle up and back at a working angle.
    # Head: blade driven down into the end grain, square poll up top.
    p.beam((0.13, 0, 0.57), (-0.01, 0, 0.40), (0.028, 0.11), kind="iron", bevel=0.004)
    p.beam((0.15, 0, 0.6), (0.11, 0, 0.55), (0.045, 0.06), kind="iron", bevel=0.004)
    p.beam((0.11, 0, 0.56), (-0.36, 0, 1.08), (0.03, 0.036), kind="wood", bevel=0.01)
    # A few split pieces dropped beside it.
    for i, (x, y, a) in enumerate(((0.5, 0.2, 0.4), (0.42, -0.3, 1.7), (-0.45, 0.35, 2.6))):
        p.lathe([(0.07, -0.2), (0.07, 0.2)], sides=5, loc=(x, y, 0.06), rot=(math.pi / 2, 0, a), kind="bark", cap_kind="endgrain", jitter=0.15)
    return p


def washtub_bench():
    """Wash day: a galvanized tub and washboard on a plank bench."""
    p = Prop("washtub_bench", seed=109)
    top = 0.55
    p.box((1.25, 0.38, 0.05), loc=(0, 0, top - 0.025), kind="board_grey")
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.beam((sx * 0.5, sy * 0.12, top - 0.05), (sx * 0.58, sy * 0.17, 0.0), (0.055, 0.055), kind="wood_grey", bevel=0.01)
        p.box((0.05, 0.3, 0.05), loc=(sx * 0.54, 0, 0.2), kind="wood_grey", grain="y")
    # Tub: outer wall, rolled lip, inner wall, with water standing in it.
    tub = [(0.26, 0.0), (0.33, 0.3), (0.345, 0.31), (0.335, 0.325), (0.32, 0.3), (0.25, 0.02)]
    p.lathe(tub, sides=20, loc=(-0.24, 0, top), kind="zinc", cap_top=True, cap_bottom=True)
    p.lathe([(0.3, 0.0), (0.3, 0.001)], sides=20, loc=(-0.24, 0, top + 0.22), kind="water", cap_bottom=False)
    for sx in (-1, 1):
        p.ring(0.055, 0.02, 0.01, sides=8, loc=(-0.24 + sx * 0.35, 0, top + 0.27), rot=(math.pi / 2, 0, 0), kind="zinc")
    # Washboard leaning in the tub.
    with p.at(Matrix.Translation((-0.1, 0.05, top + 0.05)) @ Matrix.Rotation(-0.35, 4, "Y")):
        for sx in (-1, 1):
            p.box((0.035, 0.022, 0.62), loc=(sx * 0.15, 0, 0.31), kind="wood", grain="z")
        p.box((0.3, 0.022, 0.05), loc=(0, 0, 0.6), kind="wood")
        p.box((0.27, 0.012, 0.36), loc=(0, 0, 0.33), kind="zinc", grain="z", bevel=0.002)
    return p


def butter_churn():
    p = Prop("butter_churn", seed=113)
    prof = [(0.17, 0.0), (0.165, 0.2), (0.15, 0.5), (0.135, 0.68), (0.12, 0.68), (0.12, 0.66)]
    p.lathe(prof, sides=14, kind="stave")
    for z, r in ((0.08, 0.172), (0.58, 0.146)):
        p.ring(r, 0.035, 0.01, sides=14, loc=(0, 0, z), kind="iron")
    p.lathe([(0.13, 0.66), (0.13, 0.69)], sides=14, kind="wood", cap_kind="endgrain")
    p.cylinder(0.018, 0.5, sides=6, loc=(0, 0, 0.69), kind="wood")
    return p


def plow():
    """A walking plow parked on its share, handles up."""
    p = Prop("plow", seed=127)
    # Beam: from the clevis at the front, arching back down to the standard.
    p.beam((0.95, 0, 0.42), (0.35, 0, 0.55), (0.08, 0.1), kind="wood_dark")
    p.beam((0.35, 0, 0.55), (-0.15, 0, 0.48), (0.08, 0.1), kind="wood_dark")
    p.box((0.08, 0.05, 0.14), loc=(1.0, 0, 0.42), kind="iron", bevel=0.004)
    # Standard, share and moldboard.
    p.beam((-0.1, 0, 0.5), (0.02, 0, 0.1), (0.06, 0.05), kind="iron", bevel=0.005)
    p.beam((0.35, -0.02, 0.02), (-0.2, 0.02, 0.03), (0.04, 0.2), roll=math.pi / 2 + 0.25, kind="iron", bevel=0.004)
    with p.at(Matrix.Translation((-0.1, -0.12, 0.2)) @ Matrix.Rotation(0.6, 4, "Z") @ Matrix.Rotation(-0.5, 4, "X")):
        p.box((0.5, 0.02, 0.3), kind="iron", bevel=0.004)
    p.box((0.6, 0.02, 0.12), loc=(-0.15, 0.1, 0.07), kind="iron", bevel=0.004)
    # Handles, spread and rising to the rear, with a rung between them.
    for sy in (-1, 1):
        p.beam((-0.05, sy * 0.06, 0.45), (-1.15, sy * 0.3, 0.95), (0.05, 0.035), kind="wood", bevel=0.01)
        p.beam((-0.15, sy * 0.05, 0.12), (-0.55, sy * 0.13, 0.6), (0.035, 0.03), kind="wood_dark", bevel=0.008)
    p.cylinder(0.018, 0.5, sides=6, loc=(-0.85, -0.25, 0.8), rot=(-math.pi / 2, 0, 0), kind="wood")
    return p


def _gable_fill(p, x, y0, z0, y1, z1, t, depth=0.45, kind="board_grey"):
    """Close the wall under a sloped roof line (y0,z0)->(y1,z1) at plane x.

    A thin panel whose top edge lies on the roof line and whose lower part
    sinks into the wall below; slightly thinner than the wall so the shared
    faces never z-fight."""
    d = Vector((0, y1 - y0, z1 - z0))
    length = d.length
    d.normalize()
    n = Vector((0, -d.z, d.y))
    if n.z < 0:
        n = -n
    centre = Vector((x, (y0 + y1) / 2, (z0 + z1) / 2)) - n * (depth / 2)
    ang = math.atan2(d.z, d.y)
    p.box((t * 0.9, length - 0.16, depth), loc=tuple(centre), rot=(ang, 0, 0), kind=kind, grain="z", bevel=0.004)


def outhouse():
    """Board-and-batten privy with a shed roof and the moon on the door."""
    p = Prop("outhouse", seed=131)
    W, D, Hf, Hb = 1.2, 1.25, 2.25, 2.0
    t = 0.04
    # Skids and floor.
    for sx in (-1, 1):
        p.box((0.1, D + 0.2, 0.1), loc=(sx * (W / 2 - 0.05), 0, 0.05), kind="wood_dark", grain="y")
    p.box((W, D, 0.04), loc=(0, 0, 0.12), kind="board_grey", grain="y")
    base = 0.14
    # Side walls follow the roof slope: build them as two stacked boxes.
    for sx in (-1, 1):
        p.box((t, D, Hb - base), loc=(sx * (W / 2 - t / 2), 0, base + (Hb - base) / 2), kind="board_grey", grain="z")
        _gable_fill(p, sx * (W / 2 - t / 2), -D / 2, Hf, D / 2, Hb, t)
    p.box((W - 2 * t, t, Hb - base), loc=(0, D / 2 - t / 2, base + (Hb - base) / 2), kind="board_grey", grain="z")
    # Front: jambs, header, and the door slightly proud with its Z brace.
    front_y = -D / 2 + t / 2
    for sx in (-1, 1):
        p.box((0.2, t, Hf - base), loc=(sx * (W / 2 - 0.1), front_y, base + (Hf - base) / 2), kind="board_grey", grain="z")
    p.box((W - 0.4, t, 0.25), loc=(0, front_y, Hf - 0.125), kind="board_grey")
    door_y = front_y - t * 0.6
    p.box((0.78, 0.035, 1.82), loc=(0, door_y, base + 0.93), kind="board_grey", grain="z")
    for z in (0.35, 1.55):
        p.box((0.72, 0.03, 0.1), loc=(0, door_y - 0.03, base + z), kind="wood_grey")
    p.beam((-0.3, door_y - 0.03, base + 0.4), (0.3, door_y - 0.03, base + 1.5), (0.09, 0.03), kind="wood_grey", bevel=0.006)
    for sx in (-1, 1):
        for z in (0.3, 1.6):
            p.box((0.16, 0.012, 0.035), loc=(-0.32 + sx * 0.0, door_y - 0.03, base + z), kind="iron", bevel=0.002)
    # Crescent moon: a tapered arc of dark inset high on the door.
    arc = [(0.1 * math.cos(a), door_y - 0.02, base + 1.72 + 0.1 * math.sin(a)) for a in (1.9, 2.4, 3.14, 3.9, 4.4)]
    p.tube(arc, [0.004, 0.022, 0.03, 0.022, 0.004], sides=6, kind="socket", flatten=0.4)
    # Shed roof pitched to the back, overhanging all round.
    rise = Hf - Hb
    ang = math.atan2(rise, D)
    with p.at(Matrix.Translation((0, 0, (Hf + Hb) / 2 + 0.04)) @ Matrix.Rotation(-ang, 4, "X")):
        for k in range(5):
            x = -0.62 + k * 0.31
            p.box((0.3, D + 0.35, 0.03), loc=(x, 0, 0), kind="wood_dark", grain="y", bevel=0.006)
    return p


def chicken_coop():
    p = Prop("chicken_coop", seed=137)
    L, D, lift, H = 1.6, 1.0, 0.45, 0.85
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((0.08, 0.08, lift + 0.05), loc=(sx * (L / 2 - 0.06), sy * (D / 2 - 0.06), (lift + 0.05) / 2), kind="wood_dark", grain="z")
    p.box((L, D, 0.04), loc=(0, 0, lift + 0.02), kind="board_grey", grain="x")
    t = 0.035
    for sy in (-1, 1):
        p.box((L, t, H), loc=(0, sy * (D / 2 - t / 2), lift + H / 2), kind="board_grey", grain="x")
    for sx in (-1, 1):
        p.box((t, D - 2 * t, H), loc=(sx * (L / 2 - t / 2), 0, lift + H / 2), kind="board_grey", grain="y")
        # Gable ends.
        _gable_fill(p, sx * (L / 2 - t / 2), -D / 2, lift + H, 0, lift + H + 0.3, t, depth=0.3)
        _gable_fill(p, sx * (L / 2 - t / 2), 0, lift + H + 0.3, D / 2, lift + H, t, depth=0.3)
    # Pop hole and its ramp down to the dirt.
    p.box((0.22, 0.02, 0.26), loc=(0.45, -D / 2 - 0.004, lift + 0.17), kind="socket", bevel=0)
    p.beam((0.45, -D / 2 - 0.05, lift + 0.02), (0.45, -D / 2 - 0.85, 0.02), (0.24, 0.025), roll=math.pi / 2, kind="wood_grey", bevel=0.006)
    for k in range(4):
        f = (k + 0.5) / 4
        p.box((0.22, 0.02, 0.02), loc=(0.45, -D / 2 - 0.05 - 0.8 * f, lift + 0.03 - (lift) * f + 0.012), kind="wood_grey")
    # Nesting box on the end.
    p.box((0.34, 0.7, 0.4), loc=(-L / 2 - 0.17, 0, lift + 0.3), kind="board_grey", grain="y")
    p.box((0.4, 0.78, 0.03), loc=(-L / 2 - 0.19, 0, lift + 0.52), rot=(0, -0.3, 0), kind="wood_dark", grain="y")
    # Gable roof.
    for sy in (-1, 1):
        ang = math.atan2(0.3, D / 2)
        with p.at(Matrix.Translation((0, sy * D / 4, lift + H + 0.17)) @ Matrix.Rotation(-sy * ang, 4, "X")):
            p.box((L + 0.25, D / 2 + 0.22, 0.03), kind="wood_dark", grain="x", bevel=0.006)
    return p


def wagon_farm():
    """A sound farm wagon: painted box, red running gear, tongue down."""
    p = Prop("wagon_farm", seed=139)
    rear_r, front_r = 0.62, 0.5
    for x, r, name in ((-1.0, rear_r, "rear"), (1.05, front_r, "front")):
        p.beam((x, -0.86, r), (x, 0.86, r), (0.09, 0.09), kind="paint_red")
        for y in (-0.86, 0.86):
            with p.at(Matrix.Translation((x, y, r)) @ Matrix.Rotation(math.pi / 2, 4, "X")):
                _wheel(p, r, hub_len=0.22 if r > 0.55 else 0.2)
    # Reach pole and bolsters.
    p.beam((-1.2, 0, rear_r - 0.02), (1.2, 0, front_r + 0.02), (0.08, 0.07), kind="paint_red")
    bed_z = rear_r + 0.12
    for x in (-1.0, 1.05):
        p.box((0.12, 1.25, 0.12), loc=(x, 0, bed_z - 0.06), kind="paint_red", grain="y")
    with p.at(Matrix.Translation((0, 0, bed_z))):
        for y in (-0.38, 0.38):
            p.box((3.3, 0.1, 0.1), loc=(0, y, 0.05), kind="wood_dark")
        for y in (-0.44, -0.22, 0.0, 0.22, 0.44):
            p.box((3.3, 0.21, 0.035), loc=(0, y, 0.118), kind="wood_grey")
        for sy in (-1, 1):
            for z in (0.23, 0.41):
                p.box((3.3, 0.035, 0.17), loc=(0, sy * 0.57, z), kind="paint_green")
            for x in (-1.5, -0.5, 0.5, 1.5):
                p.box((0.05, 0.05, 0.5), loc=(x, sy * 0.605, 0.3), kind="iron", grain="z", bevel=0.004)
        for x in (-1.63, 1.63):
            p.box((0.035, 1.16, 0.34), loc=(x, 0, 0.32), kind="paint_green", grain="y")
        # Spring seat across the front of the box.
        p.box((0.4, 1.1, 0.06), loc=(1.1, 0, 0.62), kind="wood_grey", grain="y")
        p.box((0.05, 1.1, 0.28), loc=(0.92, 0, 0.78), kind="wood_grey", grain="y")
        for sy in (-1, 1):
            p.box((0.3, 0.04, 0.05), loc=(1.1, sy * 0.5, 0.52), kind="iron", bevel=0.004)
    # Tongue resting on the ground ahead of the front axle, with its doubletree.
    p.beam((1.1, 0, front_r - 0.05), (3.4, 0, 0.06), (0.09, 0.08), kind="paint_red")
    p.beam((1.9, -0.55, 0.26), (1.9, 0.55, 0.26), (0.07, 0.06), kind="wood_dark")
    return p


def hitch_rail_short():
    """The ranch's 3.6 m hitching rail."""
    p = Prop("hitch_rail_short", seed=149)
    for sx, lean in ((-1, -0.014), (1, 0.02)):
        p.cylinder(0.085, 1.4, sides=8, loc=(sx * 1.55, 0, -0.25), rot=(lean, lean * 0.4, 0), kind="wood_grey", r_top=0.075)
    p.cylinder(0.06, 3.6, sides=8, loc=(-1.8, 0, 1.02), rot=(0, math.pi / 2, 0), kind="wood_grey", r_top=0.055)
    for x in (-0.6, 0.7):
        p.ring(0.07, 0.024, 0.012, sides=10, loc=(x, 0, 1.02), rot=(0, math.pi / 2, 0), kind="iron")
        p.ring(0.05, 0.012, 0.01, sides=10, loc=(x, -0.07, 0.95), rot=(0.25, 0, 0), kind="iron")
    return p


def grindstone():
    """Treadle grindstone: sandstone wheel on a wooden frame."""
    p = Prop("grindstone", seed=151)
    axle_z = 0.72
    with p.at(Matrix.Translation((0, 0, axle_z)) @ Matrix.Rotation(math.pi / 2, 4, "X")):
        p.lathe([(0.34, -0.05), (0.35, -0.03), (0.35, 0.03), (0.34, 0.05)], sides=24, kind="stone", cap_kind="stone")
        p.cylinder(0.022, 0.62, sides=8, loc=(0, 0, -0.31), kind="iron")
    # Crank on the near end of the axle.
    p.beam((0, -0.31, axle_z), (0.0, -0.31, axle_z - 0.2), (0.03, 0.02), kind="iron", bevel=0.004)
    p.cylinder(0.018, 0.12, sides=6, loc=(0, -0.31, axle_z - 0.2), rot=(math.pi / 2, 0, 0), kind="wood")
    # A-frame: two splayed leg pairs, rails along the length, a water box under the wheel.
    for sy in (-1, 1):
        y = sy * 0.2
        p.beam((0.0, y, axle_z + 0.04), (-0.45, y, 0.0), (0.07, 0.06), kind="wood_grey")
        p.beam((0.0, y, axle_z + 0.04), (0.45, y, 0.0), (0.07, 0.06), kind="wood_grey")
        p.box((1.3, 0.06, 0.07), loc=(0.15, y, 0.3), kind="wood_grey")
    p.box((0.5, 0.3, 0.14), loc=(0, 0, 0.3), kind="wood_dark")
    # Seat plank for the one sharpening.
    p.box((0.4, 0.46, 0.05), loc=(0.62, 0, 0.36), kind="board_grey", grain="y")
    return p


BUILDERS = (hay_bale, woodpile, chopping_block, washtub_bench, butter_churn, plow, outhouse, chicken_coop, wagon_farm, hitch_rail_short, grindstone)
