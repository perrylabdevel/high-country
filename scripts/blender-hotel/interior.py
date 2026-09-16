"""Blender-authored interior for the Silver Creek hotel.

Lot-local game XYZ, the frame of hotel.py (x across the facade, y up, +z toward
the street). Everything comes from layout.json: HOTEL (storey heights, stair,
well, partitions, desk) and the kit's own wall openings, so every wainscot run,
paper strip and casing is cut round the apertures the kit actually cuts.

    ns = runpy.run_path('<repo>/scripts/blender-hotel/interior.py')
    ns['build'](); ns['export']()

Run export-layout.mjs and hotel.py's build() first; this reuses hotel.py's
geometry helpers and shares its scene, under its own tag.

Ground floor, the lobby and parlour: floorboards; beadboard wainscot, papered
walls, picture rail and crown on every wall, each opening cased; a beaded board
ceiling open over the stairwell; a 19-riser stair up the west wall with an open
stringer, turned balusters and a panelled spandrel closet; the reception desk
with its key rack and bell; hanging lamps and rugs.

Upstairs: floorboards round the well; papered walls to the floor with a
skirting; a hall along the front with the gallery door standing open; three
guest rooms behind board partitions with cased doorways, doors folded open and
brass number plates; curtains at every window; a board ceiling.

The helpers here deliberately do not import the saloon's interior.py: those
close over the saloon's own F/C/U/X/Z and its own layout.json, so reusing them
would silently build this interior to the saloon's dimensions.
"""
import bpy, json, math, random, runpy
from pathlib import Path
import runpy
from pathlib import Path

HERE = Path(__file__).resolve().parent
H = runpy.run_path(str(HERE / 'hotel.py'))
HOTEL = H['HOTEL']

# Tints. The runtime multiplies a near-neutral texture by these, so they carry
# the whole scheme (see hotel.js interiorMaterials).
TINTS = dict(
    BOARD=(0.80, 0.62, 0.44),
    WAINSCOT=(0.66, 0.46, 0.30),
    PAPER=(0.46, 0.52, 0.40),          # lobby: sage
    PAPER_STRIPE=(0.40, 0.46, 0.35),
    UP_PAPER=(0.78, 0.70, 0.54),       # upstairs: warm cream
    UP_STRIPE=(0.72, 0.64, 0.48),
    GILT=(0.90, 0.72, 0.36),
    TRIM=(0.54, 0.34, 0.20),
    MAHOGANY=(0.58, 0.30, 0.18),
    CREAM=(0.93, 0.88, 0.76),
    # Warmer and more saturated than it looks it should be. A ceiling faces down
    # and gets little direct light, so a neutral cream (0.90, 0.86, 0.76) came
    # out cold grey in every in-game capture, against warm timber throughout.
    CEILING=(0.98, 0.82, 0.58),
    RUG_FIELD=(0.56, 0.20, 0.16),
    RUG_BORDER=(0.30, 0.34, 0.22),
    CURTAIN=(0.58, 0.24, 0.20),
    BRASS=(1.0, 1.0, 1.0),
)

# The shared machinery (scripts/blender-kit/interior_kit.py), bound to HOTEL.
K = runpy.run_path(str(HERE.parent / 'blender-kit' / 'interior_kit.py'))['make'](
    HOTEL, H, TINTS, tag='hotel_interior', target='src/models/hotel-interior.json',
    generator='scripts/blender-hotel/interior.py', seed=1881,
    material_prefix='HC HotelInt ', object_prefix='Hotel Interior ')
globals().update({k: v for k, v in K.items() if k not in ('build', 'export', 'make')})
globals().update(TINTS)


# ---------------------------------------------------------------- reception
def reception():
    """The desk on the east side of the lobby, the key rack behind it, a bell."""
    x0, x1, z0, z1 = HOTEL['DESK']
    top = F + 1.05
    # Counter body, panelled on the lobby face (-x).
    box('timber', MAHOGANY, x0 + 0.04, x1, F, top - 0.05, z0, z1)
    n = max(1, int((z1 - z0) / 0.62))
    for i in range(n):
        za = z0 + 0.08 + i * (z1 - z0 - 0.16) / n
        zb = za + (z1 - z0 - 0.16) / n - 0.1
        box('timber', tuple(c * 1.12 for c in MAHOGANY), x0 + 0.01, x0 + 0.04, F + 0.18, top - 0.2, za, zb)
    box('timber', TRIM, x0, x1, F, F + 0.14, z0, z1)                    # plinth
    box('timber', TRIM, x0 - 0.05, x1 + 0.02, top - 0.05, top, z0 - 0.05, z1 + 0.05)   # top
    # Register, pen stand and bell on the counter.
    box('paint', (0.30, 0.22, 0.16), x0 + 0.12, x0 + 0.46, top, top + 0.05, (z0 + z1) / 2 - 0.24, (z0 + z1) / 2 + 0.24)
    box('paint', CREAM, x0 + 0.14, x0 + 0.44, top + 0.05, top + 0.055, (z0 + z1) / 2 - 0.22, (z0 + z1) / 2 + 0.22)
    cylinder('brass', BRASS, x0 + 0.25, top, z1 - 0.3, 0.05, 0.035)
    lathe('brass', BRASS, x0 + 0.25, z1 - 0.3, [(top + 0.035, 0.045), (top + 0.07, 0.035), (top + 0.085, 0.012)], 8)
    # Key rack: a grid of pigeonholes on the east wall behind the clerk.
    ry0, ry1 = F + 1.35, F + 2.35
    rz0, rz1 = z0 + 0.3, z1 - 0.3
    box('timber', MAHOGANY, X - 0.24, X, ry0, ry1, rz0, rz1)
    cols, rows = 8, 3
    for i in range(cols):
        for j in range(rows):
            za = rz0 + 0.05 + i * (rz1 - rz0 - 0.1) / cols
            zb = za + (rz1 - rz0 - 0.1) / cols - 0.03
            va = ry0 + 0.05 + j * (ry1 - ry0 - 0.1) / rows
            vb = va + (ry1 - ry0 - 0.1) / rows - 0.03
            box('timber', tuple(c * 0.55 for c in MAHOGANY), X - 0.25, X - 0.23, va, vb, za, zb)
            if (i + 2 * j) % 3:
                box('brass', BRASS, X - 0.27, X - 0.25, vb - 0.14, vb - 0.04, (za + zb) / 2 - 0.012, (za + zb) / 2 + 0.012)


def gallery_door_leaf(front):
    """The leaf out onto the gallery, swung 90 degrees into the hall.

    It hangs on the east jamb and stands perpendicular to the front wall, BESIDE
    the opening. A first version folded it flat against the wall at z 4.25 --
    directly across the doorway -- and the ray test measured the gallery door 0%
    clear from outside. A hinged leaf does not lie across its own opening.
    """
    g = next(o for o in front if o.get('class') == 'door')
    hx = g['x'] + g['w'] / 2 + 0.005          # just outside the east jamb
    top = U + g['h'] - 0.02
    z_wall = Z - 0.02
    z_edge = z_wall - g['w'] + 0.04
    box('timber', MAHOGANY, hx, hx + 0.045, U + 0.01, top, z_edge, z_wall)
    for v0, v1 in ((U + 0.15, U + 0.95), (U + 1.1, top - 0.35)):
        box('timber', tuple(c * 1.12 for c in MAHOGANY), hx + 0.045, hx + 0.06, v0, v1, z_edge + 0.08, z_wall - 0.08)
    box('glass', (0.62, 0.74, 0.72), hx + 0.045, hx + 0.06, top - 0.32, top - 0.08, z_edge + 0.08, z_wall - 0.08)
    box('brass', BRASS, hx + 0.06, hx + 0.1, U + 0.98, U + 1.03, z_edge + 0.06, z_edge + 0.12)


def dressing(front, back):
    for o in front:
        if o['fromFloor'] > 0.5 and o.get('class') != 'door':
            curtains('front', o)
    for o in back:
        if o['fromFloor'] > 0.5:
            curtains('back', o)
    # Lobby and parlour rugs; hall runner; a rug in each room.
    rug(-2.6, 1.8, 0.6, 3.6, F)
    rug(-0.6, 3.0, -3.4, -1.2, F)
    rug(-3.8, 4.6, HOTEL['HALL_Z'] + 0.5, Z - 0.4, U)
    for a, b in ((-4.06, -0.95), (-0.95, 2.15), (2.15, X)):
        rug(a + 0.4, b - 0.4, -1.6, 0.8, U)
    for x, z in ((-1.0, 2.2), (1.4, -1.9)):
        hanging_lamp(x, z, C, 0.55)
    for x in (-2.2, 2.4):
        hanging_lamp(x, (HOTEL['HALL_Z'] + Z) / 2, UC, 0.5)


def build():
    clear()
    front, back = walls()
    floors_and_ceilings()
    stair()
    reception()
    partitions()
    gallery_door_leaf(front)
    dressing(front, back)
    return emit()


def export():
    return K['export']()
