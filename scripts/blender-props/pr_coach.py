"""The Concord stagecoach kit: an egg-bodied coach on leather thoroughbraces,
a four-horse pole hitch, and its wheels as separate spinning nodes.

Same conventions as pr_props (metres, Z up, front -Y = glTF +Z). Every node
shares one coach frame EXCEPT the wheels, which are built at the origin with
their axle along X so the game can spin them:

  coach_body    body, driver's box and seat, boots, roof rail and luggage,
                lamps. Its rocking pivot (the thoroughbrace line) is
                BODY_PIVOT; the game swings it there.
  coach_gear    perch, axles, jacks and thoroughbraces, pole, doubletree and
                singletrees, lead bar, traces and lines out to the team.
  wheel_front   radius WHEEL_FRONT_R, hub at the origin.
  wheel_rear    radius WHEEL_REAR_R, hub at the origin.

Team stations (horse centre, glTF-frame x/z from the coach origin) for a
horse model whose barrel centre is its origin: TEAM in this docstring and in
src/traffic.js.

  axle front  y = -1.15, z = WHEEL_FRONT_R;  axle rear y = +1.05, z = WHEEL_REAR_R
  wheelers    x = +-0.62, y = -2.75;  leaders x = +-0.62, y = -5.55
"""

import math

from mathutils import Matrix, Vector

from pr_common import Prop

WHEEL_FRONT_R = 0.56
WHEEL_REAR_R = 0.74
TRACK = 0.82
AXLE_F = -1.15
AXLE_R = 1.05
BODY_PIVOT = (0.0, 0.0, 1.30)
WHEELERS_Y = -2.75
LEADERS_Y = -5.55
TEAM_X = 0.62


def _rand(seed):
    x = math.sin(seed * 29.917) * 43758.5453
    return x - math.floor(x)


def _wheel(name, R, spokes, seed):
    p = Prop(name, seed=seed)
    with p.at(Matrix.Rotation(math.pi / 2, 4, "Y")):
        # Iron tire over the wooden felloe.
        p.ring(R, 0.07, 0.018, sides=40, kind="iron")
        p.ring(R - 0.018, 0.065, 0.055, sides=40, kind="coach_yellow")
        # Hub with its iron bands and axle nut.
        p.lathe([(0.075, -0.13), (0.10, -0.06), (0.11, 0.0), (0.10, 0.06), (0.07, 0.14)], sides=14, kind="coach_yellow")
        for z in (-0.1, 0.1):
            p.ring(0.1, 0.02, 0.01, sides=16, loc=(0, 0, z), kind="iron")
        p.cylinder(0.045, 0.06, sides=6, loc=(0, 0, 0.14), kind="iron")
        for k in range(spokes):
            a = 2 * math.pi * k / spokes
            # Spokes staggered in and out of plane (dish), tapering to the rim.
            dz = 0.02 if k % 2 else -0.02
            p.beam((math.cos(a) * 0.1, math.sin(a) * 0.1, dz), (math.cos(a) * (R - 0.07), math.sin(a) * (R - 0.07), 0.0),
                   (0.035, 0.05), kind="coach_yellow", roll=a, bevel=0.008)
    return p


def wheel_front():
    return _wheel("wheel_front", WHEEL_FRONT_R, 12, 2001)


def wheel_rear():
    return _wheel("wheel_rear", WHEEL_REAR_R, 14, 2003)


def coach_body():
    """The body: rounded panels, curved rocker bottom, doors with drop
    windows, roof with a rail and baggage, driver's box, boots."""
    p = Prop("coach_body", seed=2005)
    L, W = 1.95, 1.30
    y0 = -0.95
    # Body shell: a stack of rounded sections along Y with a rocker curve
    # below the waist, flat top.
    n = 21
    for k in range(n):
        f = k / (n - 1)
        y = y0 + f * L
        bulge = math.sin(math.pi * f)
        # The Concord's egg: a deep rocker below the waist that sweeps up to
        # both ends, the panels tumbling in toward the roof.
        bottom = 1.28 - 0.34 * bulge ** 0.7
        waist = 1.52
        top = 2.10 + 0.08 * bulge ** 0.5
        w = W / 2 * (0.80 + 0.20 * bulge ** 0.6)
        seg = L / (n - 1) + 0.005
        if k in (0, n - 1):
            seg = L / (n - 1) / 2
            y = y + (seg / 2 if k == 0 else -seg / 2)
        # Lower body (rocker) and upper body panels.
        p.box((w * 2, seg, waist - bottom), loc=(0, y, (waist + bottom) / 2), kind="coach_red", grain="y", bevel=0.01)
        p.box((w * 2 - 0.08, seg, top - waist), loc=(0, y, (top + waist) / 2), kind="coach_red", grain="y", bevel=0.01)
    # Belt rail and moulding lines in black.
    for sx in (-1, 1):
        p.box((0.03, L + 0.02, 0.05), loc=(sx * (W / 2 + 0.005), y0 + L / 2, 1.53), kind="coach_black", grain="y", bevel=0.01)
        # Door with a dark window opening and a painted panel.
        p.box((0.02, 0.62, 0.95), loc=(sx * (W / 2 + 0.01), y0 + L / 2, 1.55), kind="coach_red", grain="z", bevel=0.01)
        p.box((0.02, 0.44, 0.34), loc=(sx * (W / 2 + 0.02), y0 + L / 2, 1.86), kind="socket", bevel=0)
        p.box((0.02, 0.46, 0.30), loc=(sx * (W / 2 + 0.02), y0 + L / 2, 1.28), kind="coach_yellow", grain="y", bevel=0.005)
        p.box((0.04, 0.05, 0.02), loc=(sx * (W / 2 + 0.04), y0 + L / 2 + 0.25, 1.52), kind="iron", bevel=0.004)
        # Fore and aft quarter windows with leather curtains rolled up.
        for dy in (-0.62, 0.62):
            p.box((0.02, 0.26, 0.32), loc=(sx * (W / 2 + 0.015), y0 + L / 2 + dy, 1.87), kind="socket", bevel=0)
            p.lathe([(0.025, -0.13), (0.025, 0.13)], sides=6, loc=(sx * (W / 2 + 0.04), y0 + L / 2 + dy, 2.06), rot=(math.pi / 2, 0, 0),
                    kind="leather")
    # Front and rear panels with windows.
    for sy, yy in ((-1, y0), (1, y0 + L)):
        p.box((0.9, 0.02, 0.32), loc=(0, yy + sy * 0.012, 1.87), kind="socket", bevel=0)
    # Roof: slightly crowned deck, iron rail on stanchions, baggage.
    p.box((W + 0.1, L + 0.12, 0.06), loc=(0, y0 + L / 2, 2.22), kind="coach_black", grain="y", bevel=0.02)
    for sx in (-1, 1):
        p.beam((sx * 0.62, y0 - 0.02, 2.40), (sx * 0.62, y0 + L + 0.02, 2.40), (0.025, 0.025), kind="iron", bevel=0.004)
        for k in range(6):
            yy = y0 + k * L / 5
            p.box((0.018, 0.018, 0.16), loc=(sx * 0.62, yy, 2.32), kind="iron", bevel=0.003)
    for sy in (-1, 1):
        p.beam((-0.62, y0 + (L if sy > 0 else 0), 2.40), (0.62, y0 + (L if sy > 0 else 0), 2.40), (0.025, 0.025), kind="iron", bevel=0.004)
    bags = [((0.9, 0.5, 0.36), (-0.1, -0.35, 2.43), "wood_dark"), ((0.6, 0.42, 0.28), (0.18, 0.25, 2.39), "leather"),
            ((0.5, 0.36, 0.26), (-0.28, 0.6, 2.38), "burlap"), ((0.7, 0.4, 0.2), (0.05, 0.62, 2.62), "canvas")]
    for size, loc, kind in bags:
        p.box(size, loc=loc, rot=(0, 0, (_rand(len(kind)) - 0.5) * 0.3), kind=kind, grain="x", bevel=0.03)
    p.tube([(-0.55, -0.6, 2.45), (0.0, -0.1, 2.72), (0.55, 0.5, 2.45)], [0.012, 0.012, 0.012], sides=5, kind="rope")
    # Driver's box: footboard, seat with backrest, box under the seat.
    yb = y0 - 0.02
    p.box((1.22, 0.55, 0.42), loc=(0, yb - 0.22, 1.98), kind="coach_red", grain="x", bevel=0.02)
    p.box((1.30, 0.50, 0.08), loc=(0, yb - 0.20, 2.22), kind="leather", grain="x", bevel=0.03)
    p.box((1.30, 0.06, 0.34), loc=(0, yb + 0.02, 2.40), rot=(-0.15, 0, 0), kind="leather", grain="x", bevel=0.02)
    for sx in (-1, 1):
        p.box((0.05, 0.5, 0.05), loc=(sx * 0.66, yb - 0.2, 2.40), kind="iron", bevel=0.005)
    p.box((1.2, 0.36, 0.04), loc=(0, yb - 0.62, 1.66), rot=(0.9, 0, 0), kind="wood_dark", grain="x", bevel=0.01)
    for sx in (-1, 1):
        p.beam((sx * 0.58, yb - 0.48, 1.60), (sx * 0.58, yb - 0.72, 1.42), (0.035, 0.035), kind="iron", bevel=0.005)
    # Front boot: leather apron under the driver.
    p.box((1.16, 0.40, 0.55), loc=(0, yb - 0.22, 1.50), kind="leather", grain="z", bevel=0.05)
    # Rear boot: a leather-covered luggage platform on iron straps.
    p.box((1.24, 0.62, 0.62), loc=(0, y0 + L + 0.34, 1.42), kind="leather", grain="z", bevel=0.06)
    for sx in (-1, 1):
        p.beam((sx * 0.55, y0 + L, 1.12), (sx * 0.55, y0 + L + 0.66, 1.10), (0.03, 0.04), kind="iron", bevel=0.004)
    # Coach lamps either side of the driver's box.
    for sx in (-1, 1):
        p.box((0.12, 0.12, 0.2), loc=(sx * 0.72, yb - 0.02, 2.02), kind="coach_black", bevel=0.01)
        p.box((0.02, 0.08, 0.12), loc=(sx * 0.785, yb - 0.02, 2.03), kind="glass", bevel=0)
        p.lathe([(0.05, 2.12), (0.02, 2.2)], sides=6, loc=(sx * 0.72, yb - 0.02, 0), kind="coach_black")
    # Step irons under the doors.
    for sx in (-1, 1):
        p.beam((sx * 0.58, y0 + L / 2, 1.00), (sx * 0.78, y0 + L / 2, 0.80), (0.03, 0.03), kind="iron", bevel=0.004)
        p.box((0.18, 0.14, 0.02), loc=(sx * 0.82, y0 + L / 2, 0.79), kind="iron", bevel=0.004)
    return p


def coach_gear():
    """Running gear and hitch, in the coach frame."""
    p = Prop("coach_gear", seed=2007)
    zf, zr = WHEEL_FRONT_R, WHEEL_REAR_R
    # Axles and axle beds.
    for y, z in ((AXLE_F, zf), (AXLE_R, zr)):
        p.beam((-TRACK - 0.12, y, z), (TRACK + 0.12, y, z), (0.07, 0.07), kind="iron", bevel=0.01)
        p.box((1.55, 0.14, 0.14), loc=(0, y, z + 0.10), kind="coach_yellow", grain="x", bevel=0.02)
    # Perch from front bolster to rear axle, and its braces.
    p.beam((0, AXLE_F, zf + 0.20), (0, AXLE_R, zr + 0.12), (0.10, 0.12), kind="coach_yellow", bevel=0.02)
    for sx in (-1, 1):
        p.beam((sx * 0.6, AXLE_R, zr + 0.14), (0, 0.1, (zf + zr) / 2 + 0.18), (0.05, 0.06), kind="coach_yellow", bevel=0.01)
    # Fifth wheel and front bolster.
    with p.at(Matrix.Translation((0, AXLE_F, zf + 0.24))):
        p.ring(0.34, 0.03, 0.03, sides=24, kind="iron")
    # Thoroughbrace jacks (C-irons) at each corner and the leather braces
    # the body hangs on.
    for sx in (-1, 1):
        for y, z in ((AXLE_F - 0.05, zf + 0.15), (AXLE_R + 0.05, zr + 0.10)):
            p.tube([(sx * 0.62, y, z), (sx * 0.62, y + (0.05 if y < 0 else -0.05), z + 0.45), (sx * 0.62, y + (0.25 if y < 0 else -0.25), z + 0.62)],
                   [0.03, 0.03, 0.025], sides=6, kind="iron")
        top_f = (sx * 0.62, AXLE_F + 0.20, zf + 0.77)
        top_r = (sx * 0.62, AXLE_R - 0.20, zr + 0.72)
        p.tube([top_f, (sx * 0.62, -0.4, 0.98), (sx * 0.62, 0.4, 0.98), top_r], [0.035, 0.035, 0.035, 0.035], sides=6, kind="leather")
    # Pole from the front gear to between the wheelers' chests, pole chains.
    pole_tip = Vector((0, WHEELERS_Y - 0.85, 1.12))
    p.beam((0, AXLE_F - 0.1, zf + 0.08), tuple(pole_tip), (0.08, 0.09), kind="coach_yellow", bevel=0.015)
    p.lathe([(0.05, 0.0), (0.06, 0.08), (0.03, 0.14)], sides=8, loc=tuple(pole_tip), rot=(math.pi / 2, 0, 0), kind="iron")
    # Doubletree and singletrees for the wheelers.
    dt_y = AXLE_F - 0.45
    p.box((1.3, 0.08, 0.08), loc=(0, dt_y, zf + 0.12), kind="coach_yellow", grain="x", bevel=0.01)
    for sx in (-1, 1):
        p.box((0.75, 0.06, 0.06), loc=(sx * TEAM_X, dt_y - 0.12, zf + 0.14), kind="coach_yellow", grain="x", bevel=0.01)
    # Lead bar at the pole tip for the leaders.
    lb_y = pole_tip.y - 0.1
    p.box((1.5, 0.07, 0.07), loc=(0, lb_y, 1.12), kind="coach_yellow", grain="x", bevel=0.01)
    # Traces: wheelers from their singletrees to their hames; leaders from
    # the lead bar to theirs. Hames sit about 0.66 m ahead of the horse's
    # centre at 1.26 m.
    for sx in (-1, 1):
        for off in (-0.3, 0.3):
            x = sx * TEAM_X + off
            p.tube([(x, dt_y - 0.12, zf + 0.14), (x * 1.02, (dt_y + WHEELERS_Y - 0.66) / 2, 1.08), (sx * TEAM_X + off * 0.8, WHEELERS_Y - 0.66, 1.26)],
                   [0.012, 0.012, 0.012], sides=4, kind="leather")
            p.tube([(sx * 0.5 + off * 0.5, lb_y, 1.12), (x * 1.03, (lb_y + LEADERS_Y - 0.66) / 2, 1.14), (sx * TEAM_X + off * 0.8, LEADERS_Y - 0.66, 1.26)],
                   [0.012, 0.012, 0.012], sides=4, kind="leather")
    # The lines: from the driver's hands to each horse's bit.
    hands = Vector((0, -1.35, 2.25))
    for sx in (-1, 1):
        for y in (WHEELERS_Y, LEADERS_Y):
            bit = Vector((sx * TEAM_X, y - 1.28, 1.42))
            mid = (hands + bit) / 2 + Vector((0, 0, -0.35 if y == WHEELERS_Y else -0.25))
            p.tube([tuple(hands + Vector((sx * 0.05, 0, 0))), tuple(mid), tuple(bit)], [0.008, 0.008, 0.008], sides=4, kind="leather")
    return p


BUILDERS = (coach_body, coach_gear, wheel_front, wheel_rear)
