"""Blender-authored interior for the Silver Creek sheriff's office and jail.

Lot-local game XYZ, the frame of sheriff_building.py (x across the facade, y
up, +z toward the street). Everything comes from layout.json: SHERIFF_REMODEL
(ceiling, cells, furniture footprints) and the kit's own wall openings.

    ns = runpy.run_path('<repo>/scripts/blender-sheriff-building/interior.py')
    ns['build'](); ns['export']()

Run export-layout.mjs first. The wall finishes, casings, floor, ceiling and
lamps come from the shared kit (scripts/blender-kit); this file adds only what
is the sheriff's own.

One storey, under the kit's ceiling slab. The office: floorboards, a beadboard
wainscot and painted boards cased round the door and both windows, a beaded
ceiling, a pot-belly stove whose pipe goes out through the roof, a safe, a
notice board of wanted bills, a regulator clock, pigeonholes, a bench under the
east window and hat pegs by the door. The cells: two, down the west side under
the barred windows the exterior draws, behind a bar front with one door
standing open and one locked; strap-iron bunks chained to the wall, buckets.
"""
import json, math, runpy
from pathlib import Path

HERE = Path(__file__).resolve().parent
H = dict(runpy.run_path(str(HERE / 'sheriff_building.py')))
H['LAYOUT'] = json.loads((HERE / 'layout.json').read_text())
SHERIFF = H['LAYOUT']['sheriff']


def cylinder(material, tint, cx, cy, cz, radius, height, segments=12):
    pts = [(radius * math.cos(2 * math.pi * i / segments), radius * math.sin(2 * math.pi * i / segments))
           for i in range(segments)]
    H['solid'](material, tint, [(cx + u, cy, cz + v) for u, v in pts],
               [(cx + u, cy + height, cz + v) for u, v in pts])


H['cylinder'] = cylinder

TINTS = dict(
    BOARD=(0.72, 0.56, 0.40),
    WAINSCOT=(0.40, 0.30, 0.22),
    PAPER=(0.80, 0.76, 0.62),          # painted boards, a worn buff
    PAPER_STRIPE=(0.76, 0.72, 0.58),
    UP_PAPER=(0.80, 0.76, 0.62),       # unused: one storey
    UP_STRIPE=(0.76, 0.72, 0.58),
    GILT=(0.56, 0.50, 0.38),           # a dark board joint
    TRIM=(0.40, 0.27, 0.17),
    MAHOGANY=(0.46, 0.27, 0.16),
    CREAM=(0.93, 0.88, 0.76),
    CEILING=(0.96, 0.84, 0.62),
    RUG_FIELD=(0.50, 0.22, 0.16),
    RUG_BORDER=(0.28, 0.30, 0.22),
    CURTAIN=(0.50, 0.26, 0.20),
    BRASS=(1.0, 1.0, 1.0),
)

K = runpy.run_path(str(HERE.parent / 'blender-kit' / 'interior_kit.py'))['make'](
    SHERIFF, H, TINTS, tag='sheriff_interior', target='src/models/sheriff-interior.json',
    generator='scripts/blender-sheriff-building/interior.py', seed=1877,
    material_prefix='HC SheriffInt ', object_prefix='Sheriff Interior ',
    extra_materials={'paint': (0.86, 0.85, 0.83), 'floor': (0.90, 0.80, 0.66), 'timber': (0.88, 0.78, 0.64),
                     'fabric': (0.86, 0.84, 0.80), 'brass': (0.80, 0.66, 0.34),
                     'iron': (0.62, 0.64, 0.63), 'glass': (0.70, 0.78, 0.76)})
globals().update({k: v for k, v in K.items() if k not in ('build', 'export', 'make')})
globals().update(TINTS)
box, solid, text = H['box'], H['solid'], H['text']

IRON = (0.17, 0.17, 0.16)
IRON_WORN = (0.26, 0.25, 0.23)
CELLS = SHERIFF['CELLS']
BAR_PITCH = 0.13


# ---------------------------------------------------------------- shell
def cased(o, v0):
    """The wall finish cut only as far as the casing reaches. The kit's hole()
    pads 0.14 round the opening and 0.22 / 0.26 below and above it, wider than
    the architrave and head; over the hotel's and store's pale shells that
    margin never showed, but the sheriff's kit wall is stone, and it framed
    every window and the door in grey rock."""
    return (o['x'] - o['w'] / 2 - 0.12, o['x'] + o['w'] / 2 + 0.12, v0, v0 + o['h'] + 0.23)


def shell():
    front = openings('front')
    holes = [cased(o, max(F, o['fromFloor'])) for o in front]
    finish_wall('front', F, C, holes, (PAPER, PAPER_STRIPE, True), exact=True)
    for o in front:
        v0 = max(F, o['fromFloor'])
        casing('front', o, v0)
        # The kit's casing has side boards and a head cap from 0.13 over the
        # opening, but nothing across that band: bare wall over every window
        # and the door, which on the sheriff's stone shell read as a rock lintel.
        # From the opening's real head: the door's is 2.10 off the wall base,
        # 8 cm under the head the casing assumes from the floor.
        wbox('front', o['x'] - o['w'] / 2 - 0.13, o['x'] + o['w'] / 2 + 0.13,
             o['fromFloor'] + o['h'], v0 + o['h'] + 0.13, 0, 0.035, 'timber', TRIM)
        if o['fromFloor'] < 0.01:
            box('floor', BOARD, o['x'] - o['w'] / 2, o['x'] + o['w'] / 2, F - 0.03, F + 0.012, Z, Z + 0.33)
    finish_wall('back', F, C, [], (PAPER, PAPER_STRIPE, True), exact=True)
    finish_wall('east', F, C, [], (PAPER, PAPER_STRIPE, True), exact=True)
    west = [dict(x=w['z'], w=w['w'], h=w['h'], fromFloor=w['fromFloor']) for w in CELLS['windows']]
    # The cut stops 5 cm under the sill, clear of the wainscot cap at F + 1.08
    # -- at 7 cm it took the cap too and left a strip of stone under the frame.
    finish_wall('west', F, C, [(o['x'] - o['w'] / 2 - 0.07, o['x'] + o['w'] / 2 + 0.07, o['fromFloor'] - 0.05, o['fromFloor'] + o['h'] + 0.07) for o in west], (PAPER, PAPER_STRIPE, True), exact=True)
    for o in west:
        cell_window(o)
    floor_boards(F, [(-X, X, -Z, Z)])
    board_ceiling(C, [(-X, X, -Z, Z)])


def cell_window(o):
    """The inside of a barred jail window. The kit wall has no opening here, so
    the pane is whitewashed glass: light, but not a view."""
    u0, u1 = o['x'] - o['w'] / 2, o['x'] + o['w'] / 2
    v0, v1 = o['fromFloor'], o['fromFloor'] + o['h']
    wbox('west', u0, u1, v0, v1, 0, 0.01, 'paint', (0.86, 0.88, 0.84))
    wbox('west', u0 - 0.08, u1 + 0.08, v1, v1 + 0.08, 0, 0.12, 'timber', TRIM)
    wbox('west', u0 - 0.08, u1 + 0.08, v0 - 0.08, v0, 0, 0.16, 'timber', TRIM)
    for e in (u0 - 0.08, u1):
        wbox('west', e, e + 0.08, v0, v1, 0, 0.12, 'timber', TRIM)
    wbox('west', (u0 + u1) / 2 - 0.02, (u0 + u1) / 2 + 0.02, v0, v1, 0.01, 0.04, 'timber', CREAM)
    n = 6
    for i in range(n):
        u = u0 + (i + 0.5) * (u1 - u0) / n
        wbox('west', u - 0.018, u + 0.018, v0 - 0.02, v1 + 0.02, 0.1, 0.136, 'iron', IRON)
    for v in (v0 + 0.1, v1 - 0.1):
        wbox('west', u0 - 0.04, u1 + 0.04, v - 0.025, v + 0.025, 0.136, 0.16, 'iron', IRON)


# ---------------------------------------------------------------- cells
def bar(x, z, y0=None, y1=None):
    cylinder('iron', IRON, x, F if y0 is None else y0, z, 0.019, (C if y1 is None else y1) - (F if y0 is None else y0), 6)


def bars_along_z(x, z0, z1, rails=True):
    n = max(1, int(round((z1 - z0) / BAR_PITCH)))
    for i in range(n):
        bar(x, z0 + (i + 0.5) * (z1 - z0) / n)
    if rails:
        for y in (F, F + 1.05, C - 0.08):
            box('iron', IRON_WORN, x - 0.03, x + 0.03, y, y + 0.06, z0, z1)


def bars_along_x(z, x0, x1):
    n = max(1, int(round((x1 - x0) / BAR_PITCH)))
    for i in range(n):
        bar(x0 + (i + 0.5) * (x1 - x0) / n, z)
    for y in (F, F + 1.05, C - 0.08):
        box('iron', IRON_WORN, x0, x1, y, y + 0.06, z - 0.03, z + 0.03)


def post(x, z):
    box('iron', IRON_WORN, x - 0.04, x + 0.04, F, C, z - 0.04, z + 0.04)


def lock(x, z, y, facing):
    """A lock box on a door's latch stile, its keyhole toward `facing` (+1/-1 in x)."""
    box('iron', IRON_WORN, x - 0.05, x + 0.05, y - 0.11, y + 0.11, z - 0.07, z + 0.07)
    box('brass', BRASS, x + facing * 0.05, x + facing * 0.056, y - 0.03, y + 0.03, z - 0.012, z + 0.012)


def cells():
    fx, dv, end = CELLS['front'], CELLS['divider'], CELLS['end']
    # The bar front, broken at each door, with a post either side of it.
    cuts = sorted((d['z0'], d['z1']) for d in CELLS['doors'])
    for a, b in runs(-Z, end, cuts):
        bars_along_z(fx, a, b)
    for d in CELLS['doors']:
        post(fx, d['z0'] - 0.04)
        post(fx, d['z1'] + 0.04)
        box('iron', IRON_WORN, fx - 0.04, fx + 0.04, F + 2.1, C, d['z0'], d['z1'])
        h0, h1 = F + 0.03, F + 2.08
        if d['open']:
            # Swung 90 degrees into the office on its hinge at z0.
            zl = d['z0'] - 0.04
            x0, x1 = fx + 0.05, fx + 0.05 + (d['z1'] - d['z0'])
            n = int(round((x1 - x0) / BAR_PITCH))
            for i in range(n):
                bar(x0 + (i + 0.5) * (x1 - x0) / n, zl, h0, h1)
            for y in (h0, (h0 + h1) / 2, h1 - 0.06):
                box('iron', IRON_WORN, x0, x1, y, y + 0.06, zl - 0.03, zl + 0.03)
            for xe in (x0, x1 - 0.05):
                box('iron', IRON_WORN, xe, xe + 0.05, h0, h1, zl - 0.03, zl + 0.03)
            lock(x1 - 0.1, zl, F + 1.05, 1)
            box('iron', IRON_WORN, x1 - 0.14, x1 - 0.06, F + 1.0, F + 1.1, zl - 0.14, zl + 0.14)
        else:
            n = int(round((d['z1'] - d['z0']) / BAR_PITCH))
            for i in range(n):
                bar(fx, d['z0'] + (i + 0.5) * (d['z1'] - d['z0']) / n, h0, h1)
            for y in (h0, (h0 + h1) / 2, h1 - 0.06):
                box('iron', IRON_WORN, fx - 0.03, fx + 0.03, y, y + 0.06, d['z0'], d['z1'])
            for ze in (d['z0'], d['z1'] - 0.05):
                box('iron', IRON_WORN, fx - 0.03, fx + 0.03, h0, h1, ze, ze + 0.05)
            lock(fx, d['z1'] - 0.12, F + 1.05, 1)
            # A padlocked hasp across to the post.
            box('iron', IRON, fx + 0.03, fx + 0.06, F + 1.25, F + 1.29, d['z1'] - 0.1, d['z1'] + 0.1)
            box('brass', BRASS, fx + 0.05, fx + 0.1, F + 1.12, F + 1.24, d['z1'] - 0.02, d['z1'] + 0.05)
    bars_along_x(dv, -X, fx - 0.04)
    bars_along_x(end, -X, fx - 0.04)
    post(fx, end)
    post(fx, -Z + 0.04)
    for z0, z1 in CELLS['bunks']:
        bunk(z0, z1)
    # A bucket in each cell, in the corner by the bars.
    for zc in ((-Z + dv) / 2 - 0.9, (dv + end) / 2 + 0.9):
        lathe('iron', (0.34, 0.33, 0.30), fx - 0.45, zc, [(F, 0.12), (F + 0.3, 0.15), (F + 0.31, 0.14)], 10)
    # The key ring on its hook by the open door, office side.
    d = next(d for d in CELLS['doors'] if d['open'])
    kz = d['z1'] + 0.2
    box('iron', IRON, fx + 0.04, fx + 0.1, F + 1.55, F + 1.58, kz - 0.01, kz + 0.01)
    box('brass', BRASS, fx + 0.08, fx + 0.1, F + 1.4, F + 1.55, kz - 0.05, kz + 0.05)
    for k in range(3):
        box('iron', IRON_WORN, fx + 0.085, fx + 0.1, F + 1.25 - k * 0.02, F + 1.42, kz - 0.04 + k * 0.035, kz - 0.025 + k * 0.035)


def bunk(z0, z1):
    """A strap-iron bunk hinged to the west wall and held level by two chains."""
    x0, x1, top = -X, -X + 0.70, F + 0.50
    box('iron', IRON_WORN, x0, x1, top - 0.06, top - 0.02, z0, z0 + 0.04)
    box('iron', IRON_WORN, x0, x1, top - 0.06, top - 0.02, z1 - 0.04, z1)
    box('iron', IRON_WORN, x1 - 0.04, x1, top - 0.08, top - 0.02, z0, z1)
    for i in range(5):
        bx = x0 + 0.03 + i * 0.13
        box('timber', tuple(c * (0.9 + 0.15 * rng.random()) for c in (0.46, 0.34, 0.22)), bx, bx + 0.12, top - 0.02, top, z0 + 0.02, z1 - 0.02)
    for ze in (z0 + 0.02, z1 - 0.02):
        n = 9
        for k in range(n):
            t0, t1 = k / n, (k + 0.6) / n
            xa, ya = x0 + 0.02 + (x1 - 0.06 - x0) * t0, F + 1.55 - (1.55 - 0.48) * t0
            xb, yb = x0 + 0.02 + (x1 - 0.06 - x0) * t1, F + 1.55 - (1.55 - 0.48) * t1
            solid('iron', IRON, [(xa, ya, ze - 0.012), (xa, ya, ze + 0.012), (xa + 0.015, ya, ze)],
                  [(xb, yb, ze - 0.012), (xb, yb, ze + 0.012), (xb + 0.015, yb, ze)])
        box('iron', IRON, x0, x0 + 0.03, F + 1.52, F + 1.6, ze - 0.03, ze + 0.03)
    # A folded grey blanket at the foot.
    box('fabric', (0.44, 0.42, 0.38), x0 + 0.08, x1 - 0.1, top, top + 0.07, z1 - 0.62, z1 - 0.1)
    box('fabric', (0.52, 0.30, 0.22), x0 + 0.08, x1 - 0.1, top + 0.02, top + 0.05, z1 - 0.5, z1 - 0.44)


# ---------------------------------------------------------------- office
def stove():
    """A pot-belly stove on its iron plate, the pipe straight up to the roof,
    where sheriff_building.py carries it out."""
    sx, sz = SHERIFF['STOVE']['x'], SHERIFF['STOVE']['z']
    box('iron', (0.30, 0.29, 0.26), sx - 0.55, sx + 0.55, F, F + 0.008, sz - 0.55, sz + 0.55)
    for a in range(4):
        t = math.pi / 4 + a * math.pi / 2
        lx, lz = sx + 0.2 * math.cos(t), sz + 0.2 * math.sin(t)
        box('iron', IRON, lx - 0.03, lx + 0.03, F, F + 0.2, lz - 0.03, lz + 0.03)
    lathe('iron', IRON, sx, sz, [(F + 0.18, 0.24), (F + 0.24, 0.26), (F + 0.26, 0.22), (F + 0.4, 0.29),
                                 (F + 0.58, 0.32), (F + 0.78, 0.29), (F + 0.9, 0.23), (F + 0.94, 0.27),
                                 (F + 0.99, 0.27), (F + 1.03, 0.2), (F + 1.12, 0.14), (F + 1.16, 0.09)], 14)
    # Door and draft on the room side (+x, toward the desk... and the door).
    box('iron', IRON_WORN, sx - 0.12, sx + 0.12, F + 0.45, F + 0.7, sz + 0.28, sz + 0.33)
    box('brass', BRASS, sx - 0.02, sx + 0.06, F + 0.56, F + 0.59, sz + 0.33, sz + 0.36)
    lathe('iron', IRON_WORN, sx, sz, [(F + 1.25, 0.23), (F + 1.27, 0.23), (F + 1.29, 0.08)], 12)
    cylinder('iron', (0.22, 0.22, 0.20), sx, F + 1.12, sz, 0.075, C - F - 1.12, 12)
    cylinder('iron', (0.30, 0.30, 0.28), sx, C - 0.04, sz, 0.12, 0.04, 12)
    # Coal scuttle and a poker.
    lathe('iron', (0.24, 0.23, 0.21), sx - 0.62, sz + 0.1, [(F, 0.13), (F + 0.3, 0.17), (F + 0.33, 0.16)], 10)
    box('iron', IRON, sx - 0.5, sx - 0.48, F, F + 0.8, sz - 0.4, sz - 0.38)


def safe():
    x0, x1, z0, z1 = SHERIFF['SAFE']
    green, top = (0.20, 0.28, 0.23), F + 1.05
    box('iron', IRON, x0 + 0.04, x1 - 0.04, F, F + 0.06, z0 + 0.04, z1 - 0.04)
    box('iron', green, x0, x1, F + 0.06, top, z0, z1)
    box('iron', (0.16, 0.22, 0.18), x0 - 0.01, x1 + 0.01, top - 0.04, top, z0 - 0.01, z1 + 0.01)
    # The door on the room face (+z), with gold lining, dial and handle.
    box('iron', (0.22, 0.31, 0.25), x0 + 0.06, x1 - 0.06, F + 0.14, top - 0.1, z1, z1 + 0.02)
    for y in (F + 0.2, top - 0.16):
        box('brass', (0.95, 0.78, 0.36), x0 + 0.1, x1 - 0.1, y, y + 0.01, z1 + 0.02, z1 + 0.024)
    for x in (x0 + 0.1, x1 - 0.11):
        box('brass', (0.95, 0.78, 0.36), x, x + 0.01, F + 0.2, top - 0.15, z1 + 0.02, z1 + 0.024)
    cx = (x0 + x1) / 2
    box('brass', BRASS, cx - 0.06, cx + 0.06, F + 0.66, F + 0.78, z1 + 0.02, z1 + 0.05)
    box('iron', IRON, cx - 0.02, cx + 0.02, F + 0.7, F + 0.74, z1 + 0.05, z1 + 0.07)
    box('brass', BRASS, cx - 0.015, cx + 0.015, F + 0.38, F + 0.56, z1 + 0.02, z1 + 0.07)
    # A ledger and a lamp on top.
    box('paint', (0.30, 0.14, 0.10), x0 + 0.1, x0 + 0.42, top, top + 0.05, z0 + 0.12, z0 + 0.36)


def notice_board():
    """Wanted bills on a board on the back wall, over the wainscot."""
    x0, x1, y0, y1 = -1.1, 1.3, F + 1.2, F + 2.05
    zb = -Z
    box('timber', TRIM, x0 - 0.06, x1 + 0.06, y0 - 0.06, y1 + 0.06, zb, zb + 0.03)
    box('paint', (0.52, 0.40, 0.28), x0, x1, y0, y1, zb + 0.03, zb + 0.035)
    bills = [(-0.95, -0.45, 0.62), (-0.35, 0.2, 0.7), (0.3, 0.8, 0.58), (0.88, 1.24, 0.5)]
    for i, (a, b, h) in enumerate(bills):
        top = y1 - 0.06 - 0.04 * (i % 2)
        paper = (0.92, 0.88, 0.72) if i % 2 else (0.86, 0.80, 0.62)
        zf = zb + 0.036 + 0.002 * i
        box('paint', paper, a, b, top - h, top, zf, zf + 0.003)
        cx = (a + b) / 2
        text('paint', (0.22, 0.14, 0.10), 'WANTED', cx, top - 0.07, zf + 0.002, 0.06 * (b - a) / 0.5, 0.002)
        box('paint', (0.36, 0.30, 0.24), cx - 0.1, cx + 0.1, top - 0.36, top - 0.12, zf + 0.003, zf + 0.005)
        text('paint', (0.22, 0.14, 0.10), '$500' if i != 2 else '$1000', cx, top - 0.44, zf + 0.002, 0.05, 0.002)
        for k in range(3):
            yy = top - 0.52 - k * 0.04
            if yy > top - h + 0.03:
                box('paint', (0.46, 0.40, 0.32), a + 0.05, b - 0.05 - 0.04 * k, yy, yy + 0.012, zf + 0.003, zf + 0.004)
        box('brass', BRASS, cx - 0.008, cx + 0.008, top - 0.03, top - 0.014, zf + 0.004, zf + 0.012)


def clock():
    """A regulator clock on the east wall, over the desk."""
    z, y = -0.4, F + 1.55
    xw = X
    box('timber', MAHOGANY, xw - 0.1, xw, y, y + 0.72, z - 0.19, z + 0.19)
    box('timber', MAHOGANY, xw - 0.12, xw, y + 0.72, y + 0.8, z - 0.22, z + 0.22)
    box('paint', CREAM, xw - 0.105, xw - 0.1, y + 0.44, y + 0.68, z - 0.12, z + 0.12)
    box('iron', IRON, xw - 0.11, xw - 0.105, y + 0.55, y + 0.66, z - 0.006, z + 0.006)
    box('iron', IRON, xw - 0.11, xw - 0.105, y + 0.555, y + 0.565, z - 0.006, z + 0.08)
    box('glass', (0.80, 0.86, 0.84), xw - 0.105, xw - 0.1, y + 0.06, y + 0.4, z - 0.12, z + 0.12)
    box('brass', BRASS, xw - 0.08, xw - 0.07, y + 0.08, y + 0.36, z - 0.006, z + 0.006)
    box('brass', BRASS, xw - 0.085, xw - 0.065, y + 0.06, y + 0.12, z - 0.05, z + 0.05)


def pigeonholes():
    """Pigeonholes of warrants and papers in the front alcove, facing east."""
    x0, x1, z0, z1 = SHERIFF['PIGEONHOLES']
    top = F + 1.9
    box('timber', MAHOGANY, x0, x0 + 0.03, F, top, z0, z1)
    for ze in (z0, z1 - 0.03):
        box('timber', MAHOGANY, x0, x1, F, top, ze, ze + 0.03)
    box('timber', MAHOGANY, x0, x1 + 0.02, top - 0.03, top + 0.02, z0 - 0.02, z1 + 0.02)
    box('timber', MAHOGANY, x0, x1, F, F + 0.1, z0, z1)
    rows, cols = 6, 5
    y0 = F + 0.8
    box('timber', TRIM, x0, x1, y0 - 0.03, y0, z0, z1)
    # Closed cupboard below.
    for k in range(2):
        za = z0 + 0.05 + k * (z1 - z0 - 0.1) / 2
        box('timber', tuple(c * 1.1 for c in MAHOGANY), x1, x1 + 0.02, F + 0.14, y0 - 0.06, za + 0.01, za + (z1 - z0 - 0.1) / 2 - 0.01)
        box('brass', BRASS, x1 + 0.02, x1 + 0.035, F + 0.5, F + 0.54, za + 0.1, za + 0.13)
    for r in range(rows + 1):
        y = y0 + r * (top - 0.03 - y0) / rows
        box('timber', TRIM, x0, x1, y - 0.012, y, z0 + 0.03, z1 - 0.03)
    for c in range(1, cols):
        z = z0 + 0.03 + c * (z1 - z0 - 0.06) / cols
        box('timber', TRIM, x0, x1, y0, top - 0.03, z - 0.006, z + 0.006)
    for r in range(rows):
        for c in range(cols):
            if rng.random() < 0.25:
                continue
            ya = y0 + r * (top - 0.03 - y0) / rows
            za = z0 + 0.03 + c * (z1 - z0 - 0.06) / cols
            hgt = 0.04 + 0.08 * rng.random()
            box('paint', tuple(v * (0.88 + 0.12 * rng.random()) for v in (0.90, 0.86, 0.72)),
                x0 + 0.05, x1 - 0.04 - 0.08 * rng.random(), ya, ya + hgt, za + 0.02, za + 0.2)


def bench():
    x0, x1, z0, z1 = SHERIFF['BENCH']
    seat = F + 0.45
    box('timber', MAHOGANY, x0, x1, seat - 0.04, seat, z0, z1 - 0.04)
    for xe in (x0 + 0.06, x1 - 0.1):
        box('timber', TRIM, xe, xe + 0.04, F, seat - 0.04, z0 + 0.04, z1 - 0.06)
    box('timber', TRIM, x0 + 0.06, x1 - 0.06, F + 0.12, F + 0.16, (z0 + z1) / 2 - 0.02, (z0 + z1) / 2 + 0.02)
    box('timber', MAHOGANY, x0, x1, seat + 0.1, seat + 0.38, z1 - 0.05, z1 - 0.02)


def hat_pegs():
    """A peg rail by the door on the front wall, with a hat and a gun belt."""
    x0, x1, y = -1.55, -0.72, F + 1.72
    zf = Z
    box('timber', TRIM, x0, x1, y - 0.05, y + 0.05, zf - 0.025, zf)
    for k in range(4):
        px = x0 + 0.1 + k * (x1 - x0 - 0.2) / 3
        box('timber', MAHOGANY, px - 0.015, px + 0.015, y - 0.015, y + 0.015, zf - 0.11, zf - 0.025)
    hx = x0 + 0.1
    lathe('fabric', (0.34, 0.26, 0.18), hx, zf - 0.16, [(y - 0.02, 0.2), (y + 0.0, 0.2), (y + 0.01, 0.11), (y + 0.15, 0.1), (y + 0.16, 0.07)], 12)
    # A gun belt hanging in a loop from the third peg, its holster at the bottom.
    bx = x0 + 0.1 + 2 * (x1 - x0 - 0.2) / 3
    leather = (0.30, 0.18, 0.10)
    for sx in (-1, 1):
        solid('fabric', leather, [(bx, y, zf - 0.09), (bx, y, zf - 0.05), (bx + sx * 0.012, y, zf - 0.07)],
              [(bx + sx * 0.16, F + 1.02, zf - 0.07), (bx + sx * 0.16, F + 1.02, zf - 0.03), (bx + sx * 0.2, F + 1.02, zf - 0.05)])
    box('fabric', leather, bx - 0.2, bx + 0.2, F + 0.96, F + 1.02, zf - 0.07, zf - 0.03)
    box('fabric', (0.36, 0.22, 0.12), bx + 0.04, bx + 0.14, F + 0.7, F + 1.0, zf - 0.1, zf - 0.03)
    for k in range(6):
        box('brass', BRASS, bx - 0.18 + k * 0.035, bx - 0.165 + k * 0.035, F + 0.975, F + 1.005, zf - 0.075, zf - 0.068)

def dressing():
    d = SHERIFF['DESK']
    hanging_lamp(d['x'], d['z'], C, 0.5)
    hanging_lamp(1.0, 2.2, C, 0.5)
    hanging_lamp(-3.0, -0.7, C, 0.45)
    lathe('brass', BRASS, d['x'] - 1.05, d['z'] - 0.2, [(F, 0.1), (F + 0.08, 0.14), (F + 0.14, 0.08), (F + 0.18, 0.12)], 12)
    # A county map on the east wall, north of the gun rack.
    box('timber', TRIM, X - 0.025, X, F + 1.3, F + 2.1, 2.0, 3.1)
    box('paint', (0.86, 0.80, 0.62), X - 0.03, X - 0.025, F + 1.35, F + 2.05, 2.05, 3.05)
    for k in range(5):
        za = 2.15 + k * 0.17
        box('paint', (0.52, 0.40, 0.26) if k % 2 else (0.38, 0.48, 0.44), X - 0.032, X - 0.03,
            F + 1.45 + 0.1 * rng.random(), F + 1.95 - 0.1 * rng.random(), za, za + 0.012)


def build():
    clear()
    shell()
    cells()
    stove()
    safe()
    notice_board()
    clock()
    pigeonholes()
    bench()
    hat_pegs()
    dressing()
    return emit()


def export():
    return K['export']()
