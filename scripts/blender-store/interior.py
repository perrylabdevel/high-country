"""Blender-authored interior for the Silver Creek general store.

Lot-local game XYZ, the frame of store.py (x across the facade, y up, +z toward
the street). Everything comes from layout.json: STORE (storey heights, stair,
well, loft rail, counter, shelving, stove) and the kit's own wall openings.

    ns = runpy.run_path('<repo>/scripts/blender-store/interior.py')
    ns['build'](); ns['export']()

Run export-layout.mjs and store.py's build() first. The walls, floors,
ceilings and stair come from the shared kit (scripts/blender-kit); this file
adds only what is the store's own.

Sales floor: floorboards; beadboard wainscot and painted board walls cased round
the display windows and the door; a beaded ceiling open over the stair; the
stair up the west wall; the counter on the east side with its glazed case,
scale and cash register; shelving floor to ceiling behind the counter and along
the back wall, stocked with tins, jars, crocks, boxes and bolts of cloth; the
stovepipe rising from the cookstove; hanging lamps.

Loft: floorboards round the well, rough board walls, a rail along the well's
open edges, the inside of the loft door with its bar and hoist rope, and the
pipe on its way to the roof.
"""
import math, runpy
from pathlib import Path

HERE = Path(__file__).resolve().parent
H = runpy.run_path(str(HERE / 'store.py'))
STORE = H['STORE']

TINTS = dict(
    BOARD=(0.78, 0.60, 0.42),
    WAINSCOT=(0.50, 0.38, 0.26),
    PAPER=(0.76, 0.72, 0.58),          # sales floor: painted boards, not paper
    PAPER_STRIPE=(0.72, 0.68, 0.54),
    UP_PAPER=(0.66, 0.52, 0.36),       # loft: bare boards
    UP_STRIPE=(0.60, 0.47, 0.32),
    GILT=(0.52, 0.44, 0.32),           # no gilt in a store: a dark board joint
    TRIM=(0.46, 0.32, 0.20),
    MAHOGANY=(0.52, 0.30, 0.18),
    CREAM=(0.93, 0.88, 0.76),
    CEILING=(0.98, 0.82, 0.58),        # warm, for the reason the hotel's is
    RUG_FIELD=(0.56, 0.20, 0.16),
    RUG_BORDER=(0.30, 0.34, 0.22),
    CURTAIN=(0.58, 0.24, 0.20),
    BRASS=(1.0, 1.0, 1.0),
)

K = runpy.run_path(str(HERE.parent / 'blender-kit' / 'interior_kit.py'))['make'](
    STORE, H, TINTS, tag='store_interior', target='src/models/general-store-interior.json',
    generator='scripts/blender-store/interior.py', seed=1874,
    material_prefix='HC StoreInt ', object_prefix='Store Interior ',
    extra_materials={'floor': (0.90, 0.80, 0.66), 'timber': (0.88, 0.78, 0.64),
                     'fabric': (0.86, 0.84, 0.80), 'brass': (0.80, 0.66, 0.34),
                     'glass': (0.70, 0.78, 0.76)})
globals().update({k: v for k, v in K.items() if k not in ('build', 'export', 'make')})
globals().update(TINTS)

GOODS = [(0.62, 0.20, 0.14), (0.22, 0.34, 0.52), (0.80, 0.70, 0.40), (0.34, 0.46, 0.28),
         (0.86, 0.84, 0.78), (0.70, 0.50, 0.24), (0.48, 0.22, 0.34), (0.90, 0.62, 0.20)]


def stock_shelf(x0, x1, z0, z1, y, facing):
    """Goods along one shelf board. `facing` is the room side: +x/-x/+z."""
    along_x = facing == '+z'
    a, b = (x0, x1) if along_x else (z0, z1)
    u = a + 0.06
    while u < b - 0.12:
        kind = rng.random()
        tint = GOODS[int(rng.random() * len(GOODS))]
        if kind < 0.35:                                   # tins and jars
            r = 0.045 + 0.02 * rng.random()
            h = 0.10 + 0.12 * rng.random()
            cx, cz = ((u + r, (z0 + z1) / 2) if along_x else ((x0 + x1) / 2, u + r))
            lathe('iron' if rng.random() < 0.5 else 'glass', tint, cx, cz, [(y, r), (y + h, r), (y + h + 0.01, r * 0.8)], 8)
            u += 2 * r + 0.03
        elif kind < 0.65:                                 # boxes and packets
            w = 0.14 + 0.16 * rng.random()
            h = 0.12 + 0.18 * rng.random()
            d = 0.8 * ((z1 - z0) if along_x else (x1 - x0))
            if along_x:
                box('paint', tint, u, u + w, y, y + h, (z0 + z1) / 2 - d / 2, (z0 + z1) / 2 + d / 2)
            else:
                box('paint', tint, (x0 + x1) / 2 - d / 2, (x0 + x1) / 2 + d / 2, y, y + h, u, u + w)
            u += w + 0.025
        elif kind < 0.85:                                 # bolts of cloth, laid flat
            w = 0.26
            if along_x:
                box('fabric', tint, u, u + w, y, y + 0.09, z0 + 0.04, z1 - 0.04)
                box('fabric', tint, u, u + w, y + 0.09, y + 0.18, z0 + 0.06, z1 - 0.06)
            else:
                box('fabric', tint, x0 + 0.04, x1 - 0.04, y, y + 0.09, u, u + w)
                box('fabric', tint, x0 + 0.06, x1 - 0.06, y + 0.09, y + 0.18, u, u + w)
            u += w + 0.03
        else:                                             # crocks
            r = 0.08
            cx, cz = ((u + r, (z0 + z1) / 2) if along_x else ((x0 + x1) / 2, u + r))
            lathe('paint', (0.80, 0.76, 0.66), cx, cz, [(y, r * 0.8), (y + 0.06, r), (y + 0.2, r * 0.9), (y + 0.24, r * 0.6)], 10)
            u += 2 * r + 0.04


def shelving():
    """Floor-to-ceiling shelving behind the counter and along the back wall."""
    for i, (x0, x1, z0, z1) in enumerate(STORE['SHELVES']):
        along_x = (x1 - x0) > (z1 - z0)
        facing = '+z' if along_x else '-x'
        top = C - 0.06
        # Carcass: back board, two ends, a plinth and the shelf boards.
        if along_x:
            box('timber', TRIM, x0, x1, F, top, z0, z0 + 0.03)
            for xe in (x0, x1 - 0.04):
                box('timber', TRIM, xe, xe + 0.04, F, top, z0, z1)
        else:
            box('timber', TRIM, x1 - 0.03, x1, F, top, z0, z1)
            for ze in (z0, z1 - 0.04):
                box('timber', TRIM, x0, x1, F, top, ze, ze + 0.04)
        box('timber', MAHOGANY, x0, x1, F, F + 0.14, z0, z1)
        levels = [F + 0.14 + k * 0.46 for k in range(7) if F + 0.14 + k * 0.46 < top - 0.3]
        for y in levels:
            box('timber', TRIM, x0, x1, y - 0.025, y, z0, z1)
            if y > F + 0.3:
                stock_shelf(x0 + (0.05 if along_x else 0), x1 - (0.05 if along_x else 0.03),
                            z0 + (0.03 if along_x else 0.05), z1 - (0.0 if along_x else 0.05), y, facing)
        box('timber', TRIM, x0, x1, top - 0.03, top, z0, z1)


def counter():
    """The long counter, with a glazed show case at its street end."""
    x0, x1, z0, z1 = STORE['COUNTER']
    top = F + 0.98
    box('timber', MAHOGANY, x0 + 0.04, x1, F, top - 0.05, z0, z1)
    n = max(1, int((z1 - z0) / 0.7))
    for i in range(n):
        za = z0 + 0.08 + i * (z1 - z0 - 0.16) / n
        zb = za + (z1 - z0 - 0.16) / n - 0.1
        box('timber', tuple(c * 1.12 for c in MAHOGANY), x0 + 0.01, x0 + 0.04, F + 0.18, top - 0.2, za, zb)
    box('timber', TRIM, x0, x1, F, F + 0.14, z0, z1)
    box('timber', TRIM, x0 - 0.05, x1 + 0.02, top - 0.05, top, z0 - 0.05, z1 + 0.05)
    # Glazed show case on the counter's street end: a frame, glass and goods.
    cz0, cz1 = z1 - 1.1, z1 - 0.08
    ch = top + 0.34
    for zz in (cz0, cz1 - 0.03):
        box('timber', TRIM, x0 + 0.02, x1 - 0.02, top, ch, zz, zz + 0.03)
    box('timber', TRIM, x0 + 0.02, x1 - 0.02, ch, ch + 0.02, cz0, cz1)
    box('glass', (0.80, 0.88, 0.86), x0 + 0.01, x0 + 0.02, top, ch, cz0 + 0.03, cz1 - 0.03)
    for k in range(4):
        cz = cz0 + 0.14 + k * 0.23
        box('paint', GOODS[k * 2 % len(GOODS)], x0 + 0.18, x1 - 0.18, top, top + 0.05, cz, cz + 0.14)
    # Brass scale and a cash register.
    sx, sz = (x0 + x1) / 2, z0 + 0.9
    box('iron', (0.3, 0.3, 0.3), sx - 0.14, sx + 0.14, top, top + 0.06, sz - 0.1, sz + 0.1)
    box('brass', BRASS, sx - 0.02, sx + 0.02, top + 0.06, top + 0.34, sz - 0.02, sz + 0.02)
    box('brass', BRASS, sx - 0.2, sx + 0.2, top + 0.34, top + 0.36, sz - 0.015, sz + 0.015)
    for e in (-1, 1):
        lathe('brass', BRASS, sx + e * 0.19, sz, [(top + 0.24, 0.02), (top + 0.26, 0.1), (top + 0.28, 0.1)], 10)
    rz = z0 + 1.8
    box('iron', (0.24, 0.24, 0.22), x0 + 0.12, x1 - 0.08, top, top + 0.22, rz - 0.22, rz + 0.22)
    solid('iron', (0.30, 0.30, 0.28),
          [(x0 + 0.12, top + 0.22, rz - 0.22), (x1 - 0.08, top + 0.22, rz - 0.22), (x1 - 0.08, top + 0.22, rz + 0.22), (x0 + 0.12, top + 0.22, rz + 0.22)],
          [(x0 + 0.40, top + 0.40, rz - 0.20), (x1 - 0.08, top + 0.40, rz - 0.20), (x1 - 0.08, top + 0.40, rz + 0.20), (x0 + 0.40, top + 0.40, rz + 0.20)])
    box('brass', BRASS, x1 - 0.12, x1 - 0.08, top + 0.40, top + 0.52, rz - 0.18, rz + 0.18)


def loft_rail():
    """Rails along the well's open edges and round the loft door's loading bay,
    with a newel at each end."""
    rail_h = 1.0
    for r in STORE['LOFT_RAIL'] + STORE['LOFT_GATE']:
        x0, x1, z0, z1 = r['x0'], r['x1'], r['z0'], r['z1']
        along_z = (z1 - z0) > (x1 - x0)
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        if along_z:
            box('timber', MAHOGANY, cx - 0.04, cx + 0.04, U + rail_h - 0.07, U + rail_h, z0, z1)
            box('timber', TRIM, cx - 0.03, cx + 0.03, U, U + 0.1, z0, z1)
            n = int((z1 - z0) / 0.14)
            for i in range(n):
                lathe('timber', CREAM, cx, z0 + (i + 0.5) * (z1 - z0) / n, baluster(U + 0.1, U + rail_h - 0.07), 6)
            for zz in (z0, z1):
                square_post('timber', MAHOGANY, cx, zz, [(U, 0.06), (U + rail_h + 0.08, 0.06)])
        else:
            box('timber', MAHOGANY, x0, x1, U + rail_h - 0.07, U + rail_h, cz - 0.04, cz + 0.04)
            box('timber', TRIM, x0, x1, U, U + 0.1, cz - 0.03, cz + 0.03)
            n = int((x1 - x0) / 0.14)
            for i in range(n):
                lathe('timber', CREAM, x0 + (i + 0.5) * (x1 - x0) / n, cz, baluster(U + 0.1, U + rail_h - 0.07), 6)


def loft_door():
    """The inside of the facade's loft door: battens, a bar and a hoist rope.

    The kit wall behind it is solid -- the loft door is not a kit opening, so
    it is closed, and the loft's front wall carries the only collider there.
    """
    # Capped under the crown moulding (UC - 0.16) and stood proud of the
    # picture rail (0.03 into the room); at the facade's full 5.62 head its top
    # sat inside the crown and its boards overlapped the rail.
    dx, y0, y1 = 0.62, 4.06, UC - 0.18
    zf = Z - 0.04
    box('timber', WAINSCOT, -dx, dx, y0, y1, zf - 0.035, zf)
    for i in range(6):
        bx = -dx + 0.05 + i * (2 * dx - 0.1) / 6
        box('timber', tuple(c * (0.9 + 0.2 * rng.random()) for c in WAINSCOT),
            bx, bx + (2 * dx - 0.1) / 6 - 0.03, y0, y1, zf - 0.05, zf - 0.035)
    for by in (y0 + 0.25, y1 - 0.25):
        box('timber', TRIM, -dx - 0.05, dx + 0.05, by - 0.06, by + 0.06, zf - 0.08, zf - 0.05)
    box('iron', (0.2, 0.2, 0.2), -dx - 0.15, dx + 0.15, y0 + 0.72, y0 + 0.78, zf - 0.13, zf - 0.08)
    # Hoist rope hanging from the ceiling beside the door, coiled at the floor.
    box('fabric', (0.70, 0.58, 0.38), dx + 0.28, dx + 0.31, U + 0.12, UC, zf - 0.3, zf - 0.27)
    lathe('fabric', (0.70, 0.58, 0.38), dx + 0.3, zf - 0.45, [(U, 0.2), (U + 0.06, 0.2), (U + 0.12, 0.12)], 12)


def stovepipe():
    """The flue from the cookstove model's own pipe top, through the sales-floor
    ceiling and the loft, to the roof -- where store.py carries it on up. The
    model supplies the pipe below its top, so this starts there (a hair under,
    to join cleanly) at the model's flue, not the stove's centre."""
    sv = STORE['STOVE']
    fx, fz = sv['flue']['x'], sv['flue']['z']
    y0 = F + sv['flueModel']['top'] - 0.04
    cylinder('iron', (0.22, 0.22, 0.20), fx, y0, fz, 0.075, UC - y0)
    cylinder('iron', (0.30, 0.30, 0.28), fx, C - 0.02, fz, 0.12, 0.04)
    cylinder('iron', (0.30, 0.30, 0.28), fx, U, fz, 0.12, 0.03)


def dressing():
    hanging_lamp(-0.8, 0.8, C, 0.6)
    hanging_lamp(1.2, -1.8, C, 0.6)
    hanging_lamp(0.6, 2.2, UC, 0.45)


def build():
    clear()
    front, back = walls()
    floors_and_ceilings()
    stair()
    shelving()
    counter()
    loft_rail()
    loft_door()
    stovepipe()
    dressing()
    return emit()


def export():
    return K['export']()
