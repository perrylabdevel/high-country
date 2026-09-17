"""Blender-authored interior for the Silver Creek church.

Lot-local game XYZ, the frame of church.py (x across the gable ends, y up, +z
toward the street). Everything comes from layout.json: CHURCH (ceiling, tie
beams, chancel, rail, pews) and the kit's own wall openings.

    ns = runpy.run_path('<repo>/scripts/blender-church/interior.py')
    ns['build'](); ns['export']()

Run export-layout.mjs first. The wall finishes, casings, floor, ceiling and
lamps come from the shared kit (scripts/blender-kit); this file adds only what
is the church's own.

One storey. The nave takes the 3.2 m the ceiling invariant allows rather than
the kit's 2.7 m cap, on exposed tie beams: a plastered nave over a dark
wainscot, cased round the door and the three lancets, with the coloured side
lights that the gable-end walls cannot open repeated on the inside face. The
chancel end has panelling behind the altar, a communion rail with a gate on the
aisle, and a lectern. A bell rope falls from the hatch under the steeple.
"""
import math, runpy
from pathlib import Path

HERE = Path(__file__).resolve().parent
H = dict(runpy.run_path(str(HERE / 'church.py')))
CHURCH = H['LAYOUT']['church']

TINTS = dict(
    BOARD=(0.74, 0.58, 0.42),
    WAINSCOT=(0.42, 0.30, 0.22),
    PAPER=(0.90, 0.88, 0.82),          # lime plaster, near white
    PAPER_STRIPE=(0.87, 0.85, 0.79),
    UP_PAPER=(0.90, 0.88, 0.82),       # unused: one storey
    UP_STRIPE=(0.87, 0.85, 0.79),
    GILT=(0.78, 0.76, 0.70),           # a quiet joint, no gilt in a mission church
    TRIM=(0.88, 0.86, 0.80),           # painted trim
    MAHOGANY=(0.46, 0.28, 0.16),
    CREAM=(0.93, 0.90, 0.82),
    CEILING=(0.94, 0.90, 0.80),
    RUG_FIELD=(0.46, 0.20, 0.18),
    RUG_BORDER=(0.32, 0.26, 0.18),
    CURTAIN=(0.50, 0.26, 0.20),
    BRASS=(1.0, 1.0, 1.0),
)

K = runpy.run_path(str(HERE.parent / 'blender-kit' / 'interior_kit.py'))['make'](
    CHURCH, H, TINTS, tag='church_interior', target='src/models/church-interior.json',
    generator='scripts/blender-church/interior.py', seed=1874,
    material_prefix='HC ChurchInt ', object_prefix='Church Interior ',
    extra_materials={'paint': (0.86, 0.85, 0.83), 'floor': (0.90, 0.80, 0.66), 'timber': (0.88, 0.78, 0.64),
                     'fabric': (0.86, 0.84, 0.80), 'brass': (0.80, 0.66, 0.34),
                     'iron': (0.62, 0.64, 0.63), 'glass': (0.70, 0.78, 0.76)})
globals().update({k: v for k, v in K.items() if k not in ('build', 'export', 'make')})
globals().update(TINTS)
box, solid, cylinder = H['box'], H['solid'], H['cylinder']

GLASS = [(0.26, 0.38, 0.62), (0.76, 0.80, 0.78), (0.62, 0.24, 0.22),
         (0.82, 0.68, 0.30), (0.76, 0.80, 0.78), (0.30, 0.48, 0.38)]
OAK = (0.50, 0.34, 0.20)
TIE = CHURCH['TIE']


# ---------------------------------------------------------------- shell
def cased(o, v0):
    """The finish cut to what the casing covers (the kit pads wider than its
    own architrave, and bare shell shows round every opening)."""
    return (o['x'] - o['w'] / 2 - 0.12, o['x'] + o['w'] / 2 + 0.12, v0, v0 + o['h'] + 0.23)


def shell():
    front, back = openings('front'), openings('back')
    for wall, ops in (('front', front), ('back', back)):
        holes = [cased(o, max(F, o['fromFloor'])) for o in ops]
        finish_wall(wall, F, C, holes, (PAPER, PAPER_STRIPE, True), exact=True)
        for o in ops:
            v0 = max(F, o['fromFloor'])
            casing(wall, o, v0)
            # The kit's casing starts its head cap 0.13 over the opening and
            # leaves the band between bare (HARD_WON 3.9).
            wbox(wall, o['x'] - o['w'] / 2 - 0.13, o['x'] + o['w'] / 2 + 0.13,
                 o['fromFloor'] + o['h'], v0 + o['h'] + 0.13, 0, 0.035, 'timber', TRIM)
            if o['fromFloor'] < 0.01:
                box('floor', BOARD, o['x'] - o['w'] / 2, o['x'] + o['w'] / 2, F - 0.03, F + 0.012, Z, Z + 0.33)
            # No arched lining over a kit light: its head is high enough that
            # the arch would sit above the ceiling boards, drawn where the nave
            # cannot see it. The arch stays on the outside wall, which runs on
            # up to the eave, and the blind side lights keep theirs.
    s = CHURCH['SIDE_WINDOW']
    side = [dict(x=z, w=s['w'], h=s['h'], fromFloor=s['fromFloor']) for z in CHURCH['sideWindows']]
    for wall in ('east', 'west'):
        holes = [h for o in side for h in arch_holes(o)]
        finish_wall(wall, F, C, holes, (PAPER, PAPER_STRIPE, True), exact=True)
        for o in side:
            side_light(wall, o)
    floor_boards(F, [(-X, X, -Z, Z)])
    board_ceiling(C, [(-X, X, -Z, Z)])


def arch_holes(o, cols=7):
    """The cut for a lancet, as columns that follow the arched head. One
    rectangle to the top of the arch leaves the plaster missing in the corners
    beside it, which on this shell is bare kit wall."""
    u, w = o['x'], o['w']
    head = o['fromFloor'] + o['h']
    # The lining is an ellipse of the same half-width whose top runs 0.05 over
    # the curve, so the cut takes a slightly smaller radius and always lands
    # under the wood rather than a few centimetres above it.
    r = 0.62 * w + 0.02
    half = w / 2 + 0.1
    out = []
    for k in range(cols):
        a = u - half + k * 2 * half / cols
        b = a + 2 * half / cols
        # The farthest point of the column from the centre, so the cut takes the
        # LOWEST arch height across it: the highest left plaster missing where
        # the lining had already come down.
        near = max(abs(a - u), abs(b - u)) if (a - u) * (b - u) > 0 else max(abs(a - u), abs(b - u))
        t = min(1.0, near / half)
        out.append((a, b, o['fromFloor'] - 0.05, head + r * math.sqrt(max(0.0, 1 - t * t))))
    return out


def arch(wall, u, w, head):
    """The inside of a lancet's arched head: the plaster soffit is cut to the
    arch outside, so the same arch is lined here, over the kit's square light."""
    r = 0.62 * w
    steps = 10
    for i in range(steps):
        a0 = math.pi * i / steps
        a1 = math.pi * (i + 1) / steps
        x0 = u + (w / 2 + 0.1) * math.cos(a1)
        x1 = u + (w / 2 + 0.1) * math.cos(a0)
        y = head + r * math.sin((a0 + a1) / 2)
        wbox(wall, min(x0, x1), max(x0, x1), y - 0.09, y + 0.05, 0, 0.05, 'timber', TRIM)
        # Coloured glass in the head: outside the kit's opening, so it colours
        # the light without covering a pane the kit already glazes.
        if y - 0.09 > head:
            wbox(wall, min(x0, x1) + 0.01, max(x0, x1) - 0.01, head, y - 0.085, 0.05, 0.065,
                 'glass', GLASS[i % len(GLASS)])
    wbox(wall, u - w / 2 - 0.12, u + w / 2 + 0.12, head - 0.03, head + 0.05, 0, 0.06, 'timber', TRIM)


def side_light(wall, o):
    """A gable-end window from inside: the kit wall has no opening here, so the
    coloured lights the exterior shows are repeated on the room face."""
    u, w = o['x'], o['w']
    v0, v1 = o['fromFloor'], o['fromFloor'] + o['h']
    rows, cols = 4, 3
    for r in range(rows):
        for c in range(cols):
            y0 = v0 + r * (v1 - v0) / rows
            x0 = u - w / 2 + c * w / cols
            wbox(wall, x0, x0 + w / cols, y0, y0 + (v1 - v0) / rows, 0.0, 0.03,
                 'glass', GLASS[(r * cols + c) % len(GLASS)])
    for k in range(1, rows):
        wbox(wall, u - w / 2, u + w / 2, v0 + k * (v1 - v0) / rows - 0.012, v0 + k * (v1 - v0) / rows + 0.012,
             0.03, 0.042, 'timber', TRIM)
    for k in range(1, cols):
        x = u - w / 2 + k * w / cols
        wbox(wall, x - 0.012, x + 0.012, v0, v1, 0.03, 0.042, 'timber', TRIM)
    # Casing, sill and the arched head, as the exterior has.
    for e in (u - w / 2 - 0.1, u + w / 2):
        wbox(wall, e, e + 0.1, v0 - 0.1, v1, 0, 0.055, 'timber', TRIM)
    wbox(wall, u - w / 2 - 0.18, u + w / 2 + 0.18, v0 - 0.12, v0, 0, 0.1, 'timber', TRIM)
    arch(wall, u, w, v1)


# ---------------------------------------------------------------- structure
def tie_beams():
    """Exposed ties across the nave under the boarded ceiling, on wall corbels,
    each with a king post up to the ceiling."""
    for z in (-2.45, -0.85, 0.75, 2.35):
        box('timber', OAK, -X, X, TIE, TIE + 0.22, z - 0.08, z + 0.08)
        box('timber', tuple(c * 0.9 for c in OAK), -X, X, TIE + 0.22, TIE + 0.25, z - 0.1, z + 0.1)
        box('timber', OAK, -0.07, 0.07, TIE + 0.25, C, z - 0.06, z + 0.06)
        for sx in (-1, 1):
            # Corbel where the tie meets the wall.
            solid('timber', OAK,
                  [(sx * X, TIE, z - 0.1), (sx * X, TIE, z + 0.1), (sx * X, TIE - 0.3, z + 0.1), (sx * X, TIE - 0.3, z - 0.1)],
                  [(sx * (X - 0.26), TIE, z - 0.1), (sx * (X - 0.26), TIE, z + 0.1),
                   (sx * (X - 0.26), TIE - 0.04, z + 0.1), (sx * (X - 0.26), TIE - 0.04, z - 0.1)])


def bell_rope():
    """The rope from the belfry, through a boarded hatch in the ceiling, to a
    cleat on the wall by the door."""
    bx, bz = CHURCH['BELL_ROPE']['x'], CHURCH['BELL_ROPE']['z']
    box('timber', TRIM, bx - 0.22, bx + 0.22, C - 0.03, C, bz - 0.22, bz + 0.22)
    box('timber', tuple(c * 0.9 for c in TRIM), bx - 0.26, bx + 0.26, C - 0.06, C - 0.03, bz - 0.26, bz + 0.26)
    cylinder('fabric', (0.72, 0.62, 0.44), bx, F + 1.25, bz, 0.016, C - F - 1.25, 6)
    # The tail hangs in a loop off a cleat on the wall.
    box('timber', MAHOGANY, X - 0.07, X - 0.03, F + 1.32, F + 1.4, bz - 0.1, bz + 0.1)
    cylinder('fabric', (0.72, 0.62, 0.44), bx, F + 1.12, bz, 0.05, 0.16, 8)
    solid('fabric', (0.72, 0.62, 0.44),
          [(bx - 0.016, F + 1.28, bz - 0.016), (bx + 0.016, F + 1.28, bz - 0.016),
           (bx + 0.016, F + 1.28, bz + 0.016), (bx - 0.016, F + 1.28, bz + 0.016)],
          [(X - 0.05, F + 1.38, bz - 0.016), (X - 0.05, F + 1.38, bz - 0.016),
           (X - 0.05, F + 1.38, bz + 0.016), (X - 0.05, F + 1.38, bz + 0.016)])


# ---------------------------------------------------------------- chancel
def reredos():
    """Panelling behind the altar, either side of the back lancet, with a
    moulded cap and a plain cross over the window."""
    back = openings('back')
    w = back[0]['w'] if back else 1.1
    cut = (-w / 2 - 0.3, w / 2 + 0.3)
    top = F + 2.0
    for x0, x1 in runs(-X + 0.1, X - 0.1, [cut]):
        box('timber', MAHOGANY, x0, x1, F, top, -Z, -Z + 0.04)
        n = max(1, int((x1 - x0) / 0.52))
        for i in range(n):
            a = x0 + i * (x1 - x0) / n
            b = a + (x1 - x0) / n
            box('timber', tuple(c * 1.12 for c in MAHOGANY), a + 0.06, b - 0.06, F + 0.22, top - 0.22, -Z + 0.04, -Z + 0.06)
        box('timber', TRIM, x0, x1, top, top + 0.07, -Z, -Z + 0.1)
    # A cross on the wall over the window head.
    cy = F + 2.68
    box('timber', MAHOGANY, -0.05, 0.05, cy, cy + 0.42, -Z, -Z + 0.05)
    box('timber', MAHOGANY, -0.2, 0.2, cy + 0.24, cy + 0.32, -Z, -Z + 0.05)


def rail():
    """The communion rail: a turned balustrade across the nave with a gate on
    the aisle, standing open toward the chancel."""
    r = CHURCH['RAIL']
    z, h, gate = r['z'], F + r['h'], r['gate']
    for x0, x1 in ((-r['x'], -gate / 2), (gate / 2, r['x'])):
        box('timber', MAHOGANY, x0, x1, h - 0.07, h, z - 0.06, z + 0.06)
        box('timber', TRIM, x0, x1, F + 0.08, F + 0.14, z - 0.04, z + 0.04)
        n = max(2, int((x1 - x0) / 0.19))
        for i in range(n):
            lathe('timber', CREAM, x0 + (i + 0.5) * (x1 - x0) / n, z, baluster(F + 0.14, h - 0.07), 6)
        for xe in (x0, x1):
            square_post('timber', MAHOGANY, xe, z,
                        [(F, 0.06), (F + 0.12, 0.06), (F + 0.12, 0.05), (h - 0.06, 0.05), (h - 0.06, 0.07), (h + 0.06, 0.07)])
    # The gate leaf, swung back against the left rail.
    gx = -gate / 2
    box('timber', MAHOGANY, gx - 0.04, gx + 0.04, F + 0.1, h - 0.02, z - 0.06, z - 0.06 - gate + 0.12)
    for yy in (F + 0.16, h - 0.14):
        box('timber', MAHOGANY, gx - 0.03, gx + 0.03, yy, yy + 0.06, z - 0.1, z - 0.06 - gate + 0.16)
    for i in range(3):
        lathe('timber', CREAM, gx, z - 0.2 - i * 0.22, baluster(F + 0.22, h - 0.14), 6)


def lectern():
    """A reading desk opposite the pulpit, with a Bible open on it."""
    lx, lz = CHURCH['LECTERN']['x'], CHURCH['LECTERN']['z']
    lathe('timber', MAHOGANY, lx, lz, [(F, 0.26), (F + 0.06, 0.24), (F + 0.1, 0.12), (F + 0.7, 0.09),
                                       (F + 0.78, 0.13), (F + 0.86, 0.1)], 8)
    solid('timber', MAHOGANY,
          [(lx - 0.28, F + 0.86, lz - 0.2), (lx + 0.28, F + 0.86, lz - 0.2),
           (lx + 0.28, F + 0.9, lz - 0.2), (lx - 0.28, F + 0.9, lz - 0.2)],
          [(lx - 0.28, F + 1.06, lz + 0.18), (lx + 0.28, F + 1.06, lz + 0.18),
           (lx + 0.28, F + 1.1, lz + 0.18), (lx - 0.28, F + 1.1, lz + 0.18)])
    box('timber', MAHOGANY, lx - 0.28, lx + 0.28, F + 0.84, F + 0.9, lz - 0.24, lz - 0.19)
    # The book: two leaves open over the slope.
    for sx in (-1, 1):
        solid('paint', (0.92, 0.90, 0.84),
              [(lx + sx * 0.02, F + 0.95, lz - 0.16), (lx + sx * 0.24, F + 0.95, lz - 0.16),
               (lx + sx * 0.24, F + 0.98, lz - 0.16), (lx + sx * 0.02, F + 0.98, lz - 0.16)],
              [(lx + sx * 0.02, F + 1.08, lz + 0.14), (lx + sx * 0.24, F + 1.08, lz + 0.14),
               (lx + sx * 0.24, F + 1.11, lz + 0.14), (lx + sx * 0.02, F + 1.11, lz + 0.14)])


def hymn_board():
    """The hymn board on the chancel wall, with the week's numbers slotted in."""
    hx, y0 = -2.55, F + 1.55
    box('timber', MAHOGANY, hx - 0.34, hx + 0.34, y0, y0 + 0.95, -Z, -Z + 0.05)
    box('timber', TRIM, hx - 0.38, hx + 0.38, y0 + 0.95, y0 + 1.04, -Z, -Z + 0.07)
    for k, digits in enumerate(('124', '87', '301', '46')):
        yy = y0 + 0.76 - k * 0.2
        box('paint', (0.16, 0.16, 0.15), hx - 0.28, hx + 0.28, yy, yy + 0.16, -Z + 0.05, -Z + 0.055)
        for d in range(len(digits)):
            box('paint', (0.92, 0.90, 0.84), hx - 0.2 + d * 0.13, hx - 0.12 + d * 0.13, yy + 0.03, yy + 0.13,
                -Z + 0.055, -Z + 0.06)


def font():
    """A plain table font by the entry, with a bowl on it."""
    fx, fz = -2.9, 2.9
    for sx in (-1, 1):
        for sz in (-1, 1):
            box('timber', MAHOGANY, fx + sx * 0.26 - 0.04, fx + sx * 0.26 + 0.04, F, F + 0.78,
                fz + sz * 0.22 - 0.04, fz + sz * 0.22 + 0.04)
    box('timber', MAHOGANY, fx - 0.36, fx + 0.36, F + 0.78, F + 0.84, fz - 0.3, fz + 0.3)
    lathe('paint', (0.86, 0.84, 0.78), fx, fz, [(F + 0.84, 0.14), (F + 0.9, 0.17), (F + 0.98, 0.16), (F + 1.0, 0.13)], 10)


def dressing():
    hanging_lamp(0, 1.9, C, 0.55)
    hanging_lamp(0, -0.5, C, 0.55)
    # Clear of the cross over the chancel window, which it hung in front of.
    hanging_lamp(0, -1.95, C, 0.5)
    # Sconces down both side walls, between the windows.
    for sx in (-1, 1):
        for z in (-3.0, 0.0, 3.0):
            wall = 'east' if sx > 0 else 'west'
            wbox(wall, z - 0.1, z + 0.1, F + 1.62, F + 1.72, 0, 0.14, 'brass', BRASS)
            lathe('glass', (0.92, 0.88, 0.7), sx * (X - 0.16), z, [(F + 1.72, 0.05), (F + 1.82, 0.07), (F + 1.94, 0.04)], 8)
    # A runner down the aisle.
    rug(-CHURCH['AISLE'] / 2, CHURCH['AISLE'] / 2, CHURCH['RAIL']['z'] + 0.2, Z - 0.3, F,
        field=(0.44, 0.20, 0.18), border=(0.30, 0.25, 0.17))


def build():
    clear()
    shell()
    tie_beams()
    reredos()
    rail()
    lectern()
    hymn_board()
    font()
    bell_rope()
    dressing()
    return emit()


def export():
    return K['export']()
