"""Blender-authored interior for the Silver Creek saloon. Lot-local game XYZ,
the frame of saloon.py (x across the facade, y up, +z toward the street).

Run with Blender MCP:
    ns = runpy.run_path('<abs path>/interior.py'); ns['build'](); ns['export']()

Everything comes from layout.json: SALOON (storey heights, stair, partitions,
bar, stove) and the kit's wall openings. Geometry reuses saloon.py's solids
and per-face tints and exports to src/models/saloon-interior.json, which
saloonInterior() in src/buildings/saloon.js parents to the lot.

Barroom: floorboards; beadboard wainscot, flocked paper and crown on every
wall, cut round each opening and cased; a pressed-tin ceiling open over the
stair; the bar with brass rail and spittoons; the back bar with its mirror,
columns and bottles; the stair with open stringer, balustrade and a spandrel
closet; the stove and its pipe; hanging lamps and pictures.
Upstairs: floorboards, papered walls, board partitions with cased doorways and
open doors, window and balcony-door casings, curtains, a board ceiling.
"""
import bpy, json, math, random, runpy
from pathlib import Path

HERE = Path(__file__).resolve().parent
S = runpy.run_path(str(HERE / 'saloon.py'))
box, solid, lathe, square_post = S['box'], S['solid'], S['lathe'], S['square_post']
profile_x, profile_z, text, ACC, acc = S['profile_x'], S['profile_z'], S['text'], S['ACC'], S['acc']
LAYOUT, SAL, ROOT = S['LAYOUT'], S['SAL'], S['ROOT']
SCENE = S['SCENE']

F, C, U, UC = SAL['FLOOR'], SAL['CEIL'], SAL['UPPER'], SAL['UPPER_CEIL']
X, Z = SAL['INNER']['x'], SAL['INNER']['z']
ST = SAL['STAIR']
RISE = (U - F) / ST['risers']
TREAD = (ST['z1'] - ST['z0']) / (ST['risers'] - 1)
WX0, WX1, WZ0, WZ1 = ST['well']
DOOR = SAL['DOOR']
rng = random.Random(1878)

S['MATERIALS'].update({
    'floor': (0.42, 0.28, 0.16), 'timber': (0.25, 0.14, 0.07), 'plaster': (0.86, 0.83, 0.76),
    'fabric': (0.7, 0.66, 0.6), 'tin': (0.8, 0.77, 0.68), 'brass': (0.72, 0.55, 0.25),
    'mirror': (0.6, 0.65, 0.66),
})

# Tints.
BOARD = (0.86, 0.7, 0.54)
WAINSCOT = (0.78, 0.56, 0.4)
PAPER = (0.6, 0.2, 0.17)
PAPER_STRIPE = (0.5, 0.16, 0.13)
GILT = (0.86, 0.66, 0.34)
TRIM = (0.62, 0.42, 0.28)          # stained timber trim
MAHOGANY = (0.72, 0.42, 0.3)
TIN = (0.95, 0.9, 0.76)
UP_PAPER = (0.66, 0.68, 0.54)
UP_STRIPE = (0.58, 0.6, 0.47)
CREAM = (0.93, 0.88, 0.76)
IRON = (0.55, 0.55, 0.52)
GREEN_GLASS = (0.3, 0.52, 0.34)
AMBER_GLASS = (0.8, 0.5, 0.2)

# Room-facing wall planes. `n` measures into the room.
WALLS = {
    'front': ('x', Z, -1), 'back': ('x', -Z, 1),
    'west': ('z', -X, 1), 'east': ('z', X, -1),
}


def openings(wall):
    """Openings on a wall in wall u (lot x for front/back)."""
    for w in LAYOUT['walls']:
        m = w['matrix']
        if wall == 'front' and abs(m[14] - (Z + 0.11)) < 1e-3:
            return w['openings']
        if wall == 'back' and abs(m[14] + (Z + 0.11)) < 1e-3:
            return [dict(o, x=-o['x']) for o in w['openings']]
    return []


def wbox(wall, u0, u1, v0, v1, n0, n1, mat, tint):
    axis, plane, sign = WALLS[wall]
    a, b = sorted((plane + sign * n0, plane + sign * n1))
    if axis == 'x':
        box(mat, tint, u0, u1, v0, v1, a, b)
    else:
        box(mat, tint, a, b, v0, v1, u0, u1)


def wprofile(wall, pts_vn, u0, u1, mat, tint):
    """A (v, n) moulding profile run along the wall from u0 to u1."""
    axis, plane, sign = WALLS[wall]
    if axis == 'x':
        solid(mat, tint, [(u0, v, plane + sign * n) for v, n in pts_vn], [(u1, v, plane + sign * n) for v, n in pts_vn])
    else:
        solid(mat, tint, [(plane + sign * n, v, u0) for v, n in pts_vn], [(plane + sign * n, v, u1) for v, n in pts_vn])


def runs(a, b, cuts):
    return S['spans'](a, b, sorted(cuts))


def wall_span(wall):
    return (-X, X) if WALLS[wall][0] == 'x' else (-Z, Z)


# ---------------------------------------------------------------- walls
def finish_wall(wall, y0, y1, holes, scheme):
    """Wainscot, paper, rails and crown from y0 to y1, cut round holes
    (u0, u1, v0, v1) already widened for their casings."""
    ua, ub = wall_span(wall)
    ua, ub = extent.get((wall, y0), (ua, ub))
    paper, stripe, wains = scheme
    base = y0
    cap = base + 1.05 if wains else base
    # Baseboard and wainscot of beaded boards.
    for u0, u1 in runs(ua, ub, [(h[0], h[1]) for h in holes if h[2] < base + 0.2]):
        wbox(wall, u0, u1, base, base + 0.2, 0, 0.025, 'timber', TRIM)
        wprofile(wall, [(base + 0.2, 0), (base + 0.2, 0.025), (base + 0.24, 0)], u0, u1, 'timber', TRIM)
    if wains:
        n = int((ub - ua) / 0.11)
        for i in range(n):
            u0 = ua + i * (ub - ua) / n
            u1 = u0 + (ub - ua) / n
            cuts = [(h[2], h[3]) for h in holes if h[0] < u1 and h[1] > u0]
            for v0, v1 in runs(base + 0.2, cap, cuts):
                wbox(wall, u0 + 0.004, u1 - 0.004, v0, v1, 0, 0.015, 'timber', tuple(c * (0.92 + 0.12 * rng.random()) for c in WAINSCOT))
        for u0, u1 in runs(ua, ub, [(h[0], h[1]) for h in holes if h[2] < cap + 0.08 and h[3] > cap]):
            wprofile(wall, [(cap, 0), (cap, 0.045), (cap + 0.05, 0.045), (cap + 0.08, 0)], u0, u1, 'timber', TRIM)
    # Paper in stripes, gilt pinstripe between.
    top = y1 - 0.16
    n = int((ub - ua) / 0.3)
    for i in range(n):
        u0 = ua + i * (ub - ua) / n
        u1 = u0 + (ub - ua) / n
        cuts = [(h[2], h[3]) for h in holes if h[0] < u1 and h[1] > u0]
        for v0, v1 in runs(cap + 0.08 if wains else base + 0.24, top, cuts):
            wbox(wall, u0, u0 + (u1 - u0) * 0.62, v0, v1, 0, 0.006, 'paint', paper)
            wbox(wall, u0 + (u1 - u0) * 0.62, u1 - 0.012, v0, v1, 0, 0.006, 'paint', stripe)
            wbox(wall, u1 - 0.012, u1, v0, v1, 0, 0.008, 'paint', GILT)
    # Picture rail and crown.
    for u0, u1 in runs(ua, ub, [(h[0], h[1]) for h in holes if h[3] > top - 0.3]):
        wprofile(wall, [(top - 0.3, 0), (top - 0.26, 0.03), (top - 0.24, 0)], u0, u1, 'timber', TRIM)
    wprofile(wall, [(top, 0), (y1, 0), (y1, 0.16), (y1 - 0.05, 0.12), (top + 0.04, 0.03)], ua, ub, 'timber', TRIM)


def casing(wall, o, y_base, depth=0.22):
    """Cased opening: architrave on the room face, jamb linings through the
    reveal, a stool and apron under a window."""
    u, w, v0, h = o['x'], o['w'], y_base, o['h']
    v1 = v0 + h
    is_door = v0 - (F if v0 < U - 1 else U) < 0.05
    for s in (-1, 1):
        e = u + s * w / 2
        wbox(wall, min(e, e + s * 0.13), max(e, e + s * 0.13), (v0 if not is_door else v0 - 0.02), v1 + 0.13, 0, 0.035, 'timber', TRIM)
        wbox(wall, min(e, e - s * 0.02), max(e, e - s * 0.02), v0, v1, -depth, 0, 'timber', TRIM)
    wbox(wall, u - w / 2 - 0.16, u + w / 2 + 0.16, v1 + 0.13, v1 + 0.24, 0, 0.05, 'timber', TRIM)
    wbox(wall, u - w / 2, u + w / 2, v1 - 0.02, v1, -depth, 0, 'timber', TRIM)
    if not is_door:
        wbox(wall, u - w / 2 - 0.1, u + w / 2 + 0.1, v0 - 0.035, v0, -depth, 0.07, 'timber', TRIM)
        wbox(wall, u - w / 2, u + w / 2, v0 - 0.2, v0 - 0.035, 0, 0.025, 'timber', TRIM)


def hole(o, v0, pad=0.14):
    return (o['x'] - o['w'] / 2 - pad, o['x'] + o['w'] / 2 + pad, v0 - 0.22, v0 + o['h'] + 0.26)


extent = {}


def walls():
    front, back = openings('front'), openings('back')
    low = lambda o: o['fromFloor'] < U - 0.5
    # Ground floor. The stair hides the west wall's middle; it is still papered.
    for wall, ops in (('front', [o for o in front if low(o)]), ('back', [o for o in back if low(o)]), ('west', []), ('east', [])):
        holes = [hole(o, max(F, o['fromFloor'])) for o in ops]
        finish_wall(wall, F, C, holes, (PAPER, PAPER_STRIPE, True))
        for o in ops:
            casing(wall, o, max(F, o['fromFloor']))
    # Upstairs outer walls, paper to the floor with a skirting.
    for wall, ops in (('front', [o for o in front if not low(o)]), ('back', [o for o in back if not low(o)]), ('west', []), ('east', [])):
        holes = [hole(o, o['fromFloor']) for o in ops]
        finish_wall(wall, U, UC, holes, (UP_PAPER, UP_STRIPE, False))
        for o in ops:
            casing(wall, o, o['fromFloor'])
    # The storefront door's threshold and the balcony door's.
    for o in front:
        if o['fromFloor'] < 0.01:
            box('floor', BOARD, o['x'] - o['w'] / 2, o['x'] + o['w'] / 2, F - 0.03, F + 0.012, Z, Z + 0.33)
        elif o.get('class') == 'door':
            box('floor', BOARD, o['x'] - o['w'] / 2, o['x'] + o['w'] / 2, U - 0.03, U + 0.012, Z, Z + 0.33)


# ---------------------------------------------------------------- floors and ceilings
def floor_boards(y, rects, tint=BOARD):
    """Boards running toward the street, 0.14 wide, butt joints staggered."""
    for x0, x1, z0, z1 in rects:
        n = int(round((x1 - x0) / 0.14))
        for i in range(n):
            a = x0 + i * (x1 - x0) / n
            b = a + (x1 - x0) / n
            joint = z0 + ((i * 7) % 5) * 0.9 + 0.4
            cuts = [z0] + [j for j in (joint, joint + 3.6) if z0 < j < z1] + [z1]
            for c0, c1 in zip(cuts, cuts[1:]):
                t = tuple(c * (0.86 + 0.2 * rng.random()) for c in tint)
                box('floor', t, a + 0.003, b - 0.003, y - 0.022, y, c0 + 0.002, c1 - 0.002)


def tin_ceiling():
    """Pressed tin: a flat field with raised squares, a bead grid and a coved
    cornice, open over the stairwell."""
    y = C
    field = [(WX1, X, -Z, Z), (-X, WX1, WZ1, Z), (-X, WX1, -Z, WZ0)]
    for x0, x1, z0, z1 in field:
        box('tin', TIN, x0, x1, y - 0.012, y, z0, z1)
    cell = 0.61
    nx, nz = int(2 * X / cell), int(2 * Z / cell)
    ox, oz = -X + (2 * X - nx * cell) / 2, -Z + (2 * Z - nz * cell) / 2
    for i in range(nx):
        for j in range(nz):
            cx, cz = ox + (i + 0.5) * cell, oz + (j + 0.5) * cell
            if WX0 - 0.3 < cx < WX1 + 0.3 and WZ0 - 0.3 < cz < WZ1 + 0.3:
                continue
            h = cell * 0.3
            # A stepped boss: square plinth and a smaller raised centre.
            box('tin', TIN, cx - h, cx + h, y - 0.03, y - 0.012, cz - h, cz + h)
            box('tin', tuple(c * 0.92 for c in TIN), cx - h * 0.45, cx + h * 0.45, y - 0.05, y - 0.03, cz - h * 0.45, cz + h * 0.45)
    for i in range(nx + 1):
        x = ox + i * cell
        for z0, z1 in runs(-Z, Z, [(WZ0 - 0.05, WZ1 + 0.05)] if WX0 - 0.05 < x < WX1 + 0.05 else []):
            box('tin', tuple(c * 0.88 for c in TIN), x - 0.015, x + 0.015, y - 0.03, y - 0.012, z0, z1)
    for j in range(nz + 1):
        z = oz + j * cell
        for x0, x1 in runs(-X, X, [(WX0 - 0.05, WX1 + 0.05)] if WZ0 - 0.05 < z < WZ1 + 0.05 else []):
            box('tin', tuple(c * 0.88 for c in TIN), x0, x1, y - 0.03, y - 0.012, z - 0.015, z + 0.015)
    # Well edges: fascia boards on the slab edge, nosing at the upstairs floor.
    box('timber', TRIM, WX1 - 0.02, WX1 + 0.03, C - 0.14, U, WZ0, WZ1)
    box('timber', TRIM, WX0, WX1 + 0.03, C - 0.14, U, WZ0 - 0.03, WZ0 + 0.02)
    box('floor', BOARD, WX0, WX1, U - 0.03, U + 0.012, WZ1 - 0.02, WZ1 + 0.06)


def board_ceiling(y, rects, tint):
    for x0, x1, z0, z1 in rects:
        n = int((z1 - z0) / 0.16)
        for k in range(n):
            a = z0 + k * (z1 - z0) / n
            box('paint', tuple(c * (0.94 + 0.08 * rng.random()) for c in tint), x0, x1, y, y + 0.02, a + 0.004, a + (z1 - z0) / n - 0.004)


# ---------------------------------------------------------------- bar
def bar():
    x0, x1, z0, z1 = SAL['BAR']
    top = F + 1.08
    face = x0 + 0.08
    # Carcass, kick recess and the top with a rounded front edge.
    box('timber', tuple(c * 0.7 for c in MAHOGANY), face + 0.06, x1, F, F + 0.14, z0, z1)
    box('timber', MAHOGANY, face, x1, F + 0.14, top - 0.06, z0, z1)
    box('timber', tuple(c * 0.8 for c in MAHOGANY), x0 - 0.06, x1 + 0.04, top - 0.06, top, z0 - 0.05, z1 + 0.05)
    box('timber', tuple(c * 0.9 for c in MAHOGANY), x0 - 0.08, x0 - 0.02, top - 0.1, top - 0.02, z0 - 0.05, z1 + 0.05)
    # Raised panels between pilasters on the customer face.
    bays = int((z1 - z0) / 0.72)
    for k in range(bays + 1):
        z = z0 + k * (z1 - z0) / bays
        box('timber', tuple(c * 0.82 for c in MAHOGANY), face - 0.05, face, F + 0.14, top - 0.06, z - 0.05, z + 0.05)
        if k < bays:
            za, zb = z + 0.1, z + (z1 - z0) / bays - 0.1
            box('timber', tuple(c * 1.08 for c in MAHOGANY), face - 0.025, face, F + 0.26, top - 0.2, za, zb)
            box('timber', tuple(c * 0.95 for c in MAHOGANY), face - 0.045, face - 0.025, F + 0.34, top - 0.28, za + 0.08, zb - 0.08)
    # End panel at the street end, then the brass foot rail on standoffs.
    box('timber', MAHOGANY, face - 0.05, x1, F + 0.14, top - 0.06, z1 - 0.04, z1)
    rail_x, rail_y = x0 - 0.18, F + 0.2
    for k in range(int((z1 - z0) / 0.18)):
        a = z0 + 0.05 + k * 0.18
        box('brass', (1, 1, 1), rail_x - 0.025, rail_x + 0.025, rail_y - 0.025, rail_y + 0.025, a, a + 0.18)
    for k in range(bays + 1):
        z = z0 + 0.05 + k * (z1 - z0 - 0.1) / bays
        box('brass', (0.9, 0.9, 0.9), rail_x, face - 0.05, rail_y - 0.012, rail_y + 0.012, z - 0.012, z + 0.012)
    for z in (z0 + 0.4, (z0 + z1) / 2 + 0.2, z1 - 0.3):
        spittoon(x0 - 0.42, z)
    # Glasses and a bottle on the top.
    for z, t in ((z0 + 0.6, AMBER_GLASS), (z0 + 0.72, AMBER_GLASS), (z1 - 1.2, GREEN_GLASS)):
        lathe('mirror', t, (x0 + x1) / 2 - 0.05, z, [(top, 0.03), (top + 0.08, 0.035)], 8)
    bottle((x0 + x1) / 2 + 0.05, z1 - 1.05, top, GREEN_GLASS)


def spittoon(x, z):
    lathe('brass', (1, 1, 1), x, z, [(F, 0.09), (F + 0.05, 0.13), (F + 0.12, 0.12), (F + 0.15, 0.06), (F + 0.17, 0.12), (F + 0.18, 0.11)], 10)


def bottle(x, z, y, tint, h=0.3):
    lathe('mirror', tint, x, z, [(y, 0.035), (y + h * 0.6, 0.038), (y + h * 0.72, 0.014), (y + h, 0.012)], 8)


def back_bar():
    x0, x1, z0, z1 = SAL['BACK_BAR']
    wall = X
    counter = F + 0.95
    # Base cabinet with panelled doors.
    box('timber', tuple(c * 0.7 for c in MAHOGANY), x0 + 0.06, wall, F, F + 0.12, z0, z1)
    box('timber', MAHOGANY, x0, wall, F + 0.12, counter - 0.05, z0, z1)
    n = int((z1 - z0) / 0.6)
    for k in range(n):
        za = z0 + k * (z1 - z0) / n + 0.05
        zb = za + (z1 - z0) / n - 0.1
        box('timber', tuple(c * 1.1 for c in MAHOGANY), x0 - 0.02, x0, F + 0.2, counter - 0.14, za, zb)
        box('brass', (1, 1, 1), x0 - 0.04, x0 - 0.02, counter - 0.3, counter - 0.26, zb - 0.1, zb - 0.06)
    box('timber', tuple(c * 0.8 for c in MAHOGANY), x0 - 0.05, wall, counter - 0.05, counter, z0 - 0.04, z1 + 0.04)
    # Mirror between turned columns, a shelf of bottles before it, entablature.
    top = F + 2.55
    cols = [z0 + 0.08, z0 + (z1 - z0) / 3, z0 + 2 * (z1 - z0) / 3, z1 - 0.08]
    for i, z in enumerate(cols):
        lathe('timber', MAHOGANY, wall - 0.14, z, [(counter, 0.07), (counter + 0.1, 0.07), (counter + 0.13, 0.05),
                                                   (top - 0.25, 0.045), (top - 0.2, 0.07), (top - 0.12, 0.07)], 10)
        if i < 3:
            za, zb = z + 0.1, cols[i + 1] - 0.1
            box('mirror', (0.95, 0.95, 0.95), wall - 0.03, wall - 0.01, counter + 0.28, top - 0.3, za, zb)
            box('timber', TRIM, wall - 0.05, wall - 0.01, counter + 0.22, counter + 0.28, za - 0.04, zb + 0.04)
            box('timber', TRIM, wall - 0.05, wall - 0.01, top - 0.3, top - 0.24, za - 0.04, zb + 0.04)
            box('timber', TRIM, wall - 0.05, wall - 0.01, counter + 0.22, top - 0.24, za - 0.06, za)
            box('timber', TRIM, wall - 0.05, wall - 0.01, counter + 0.22, top - 0.24, zb, zb + 0.06)
            shelf_y = counter + 0.62
            box('timber', MAHOGANY, wall - 0.24, wall - 0.03, shelf_y - 0.03, shelf_y, za, zb)
            k = int((zb - za) / 0.11)
            for j in range(k):
                zz = za + 0.06 + j * (zb - za - 0.12) / max(1, k - 1)
                t = [GREEN_GLASS, AMBER_GLASS, (0.85, 0.82, 0.7), AMBER_GLASS][(i + j) % 4]
                bottle(wall - 0.12, zz, shelf_y, t, 0.26 + 0.06 * ((i * 3 + j) % 3))
                if j % 2 == 0:
                    bottle(wall - 0.3, zz + 0.04, counter, t, 0.28)
    box('timber', MAHOGANY, x0 + 0.1, wall, top - 0.12, top + 0.06, z0 - 0.06, z1 + 0.06)
    profile_z_like_cornice(x0 + 0.02, wall, top + 0.06, z0 - 0.1, z1 + 0.1)
    # A painted name board on the entablature, read from the bar.
    box('paint', (0.3, 0.4, 0.32), x0 + 0.08, x0 + 0.1, top - 0.1, top + 0.04, z0 + 0.3, z1 - 0.3)


def profile_z_like_cornice(xa, xb, y, z0, z1):
    solid('timber', MAHOGANY, [(xb, y, z0), (xa + 0.06, y, z0), (xa - 0.02, y + 0.1, z0), (xa - 0.02, y + 0.18, z0), (xb, y + 0.18, z0)],
          [(xb, y, z1), (xa + 0.06, y, z1), (xa - 0.02, y + 0.1, z1), (xa - 0.02, y + 0.18, z1), (xb, y + 0.18, z1)])


# ---------------------------------------------------------------- stair
def stair():
    x0, x1, z0, z1, n = ST['x0'], ST['x1'], ST['z0'], ST['z1'], ST['risers']
    for k in range(1, n):
        za, zb = z0 + (k - 1) * TREAD, z0 + k * TREAD
        y = F + k * RISE
        box('timber', TRIM, x0, x1, y - 0.035, y, za - 0.03, zb)                          # tread with nosing
        box('paint', CREAM, x0, x1 - 0.04, y - RISE, y - 0.035, za - 0.005, za + 0.02)   # riser
        box('timber', tuple(c * 0.8 for c in TRIM), x0, x1 - 0.04, max(F, y - RISE - 0.1), y - RISE, za, zb)  # carriage
    box('paint', CREAM, x0, x1 - 0.04, F + (n - 1) * RISE, U - 0.035, z1 - 0.005, z1 + 0.02)  # last riser
    # Wall stringer.
    solid('timber', TRIM, [(x0, F, z0 - 0.1), (x0, F + RISE + 0.28, z0 - 0.1), (x0, U + 0.28, z1), (x0, U - 0.2, z1), (x0, F, z0 + 0.4)],
          [(x0 + 0.04, F, z0 - 0.1), (x0 + 0.04, F + RISE + 0.28, z0 - 0.1), (x0 + 0.04, U + 0.28, z1), (x0 + 0.04, U - 0.2, z1), (x0 + 0.04, F, z0 + 0.4)])
    # Open stringer with cut brackets under each tread end.
    sx = x1 - 0.04
    solid('timber', TRIM, [(sx, F, z0 - 0.03), (sx, F + RISE, z0 - 0.03), (sx, U, z1), (sx, U - 0.3, z1)],
          [(x1 + 0.01, F, z0 - 0.03), (x1 + 0.01, F + RISE, z0 - 0.03), (x1 + 0.01, U, z1), (x1 + 0.01, U - 0.3, z1)])
    # Spandrel: beaded boards under the stringer, a closet door, then the
    # boarded end under the top of the flight.
    for i in range(int((z1 - z0) / 0.11)):
        za = z0 + i * 0.11
        zb = za + 0.107
        ytop = F + max(0.0, (zb - z0) / TREAD) * RISE - 0.05
        if ytop <= F + 0.05:
            continue
        cuts = [(F, F + 1.95)] if 0.0 < za < 0.8 else []
        for v0, v1 in runs(F, ytop, cuts):
            box('timber', tuple(c * (0.92 + 0.12 * rng.random()) for c in WAINSCOT), x1 - 0.03, x1, v0, v1, za, zb)
    box('timber', MAHOGANY, x1 - 0.02, x1 + 0.01, F, F + 1.95, 0.0, 0.8)
    for v0, v1 in ((F + 0.15, F + 0.85), (F + 1.0, F + 1.8)):
        box('timber', tuple(c * 1.1 for c in MAHOGANY), x1 + 0.01, x1 + 0.03, v0, v1, 0.1, 0.7)
    box('brass', (1, 1, 1), x1 + 0.03, x1 + 0.06, F + 0.95, F + 1.0, 0.66, 0.72)
    for s in (0, 0.8):
        box('timber', TRIM, x1, x1 + 0.03, F, F + 2.05, s - 0.08 if s else -0.08, s + 0.08 if s else 0.0)
    box('timber', TRIM, x1, x1 + 0.03, F + 1.95, F + 2.05, -0.08, 0.88)
    for i in range(int((x1 - x0) / 0.11)):
        xa = x0 + i * 0.11
        box('timber', tuple(c * (0.92 + 0.12 * rng.random()) for c in WAINSCOT), xa + 0.003, xa + 0.107, F, C - 0.14, z1 + 0.02, z1 + 0.05)
    # Balustrade: newels, a raked handrail, two balusters per tread.
    rail = 0.9
    bx = x1 - 0.06
    lathe('timber', MAHOGANY, bx, z0 - 0.12, [(F, 0.09), (F + 0.2, 0.09), (F + 0.25, 0.06), (F + 1.05, 0.05), (F + 1.12, 0.08), (F + 1.2, 0.07), (F + 1.26, 0.03)], 8)
    square_post('timber', MAHOGANY, bx, z0 - 0.12, [(F, 0.075), (F + 0.3, 0.075), (F + 0.3, 0.06), (F + 1.05, 0.06), (F + 1.05, 0.08), (F + 1.14, 0.08)])
    for k in range(1, n):
        for f in (0.25, 0.75):
            z = z0 + (k - 1 + f) * TREAD
            y = F + k * RISE
            lathe('timber', CREAM, bx, z, S['baluster'](y, F + RISE * ((z - z0) / TREAD + 0.5) + rail - 0.04), 6)
    ya, yb = F + RISE * 0.5 + rail, F + RISE * ((z1 - z0) / TREAD + 0.5) + rail
    solid('timber', MAHOGANY, [(bx - 0.04, ya, z0 - 0.12), (bx + 0.04, ya, z0 - 0.12), (bx + 0.04, ya + 0.07, z0 - 0.12), (bx - 0.04, ya + 0.07, z0 - 0.12)],
          [(bx - 0.04, yb, z1), (bx + 0.04, yb, z1), (bx + 0.04, yb + 0.07, z1), (bx - 0.04, yb + 0.07, z1)])


# ---------------------------------------------------------------- stove, lamps, pictures
def stove():
    st = SAL['STOVE']
    x, z = st['x'], st['z']
    box('iron', (0.75, 0.75, 0.72), x - 0.5, x + 0.5, F, F + 0.012, z - 0.5, z + 0.5)   # zinc floor plate
    for a in range(4):
        t = math.pi / 4 + a * math.pi / 2
        box('iron', IRON, x + 0.2 * math.cos(t) - 0.03, x + 0.2 * math.cos(t) + 0.03, F, F + 0.18, z + 0.2 * math.sin(t) - 0.03, z + 0.2 * math.sin(t) + 0.03)
    lathe('iron', IRON, x, z, [(F + 0.16, 0.24), (F + 0.24, 0.26), (F + 0.3, 0.2), (F + 0.45, 0.3), (F + 0.7, 0.33), (F + 0.9, 0.26),
                               (F + 0.95, 0.2), (F + 1.0, 0.27), (F + 1.06, 0.27), (F + 1.12, 0.12), (F + 1.16, 0.08)], 14)
    box('iron', (0.7, 0.4, 0.2), x - 0.09, x + 0.09, F + 0.5, F + 0.66, z + 0.3, z + 0.34)   # glowing mica door
    for y0, y1 in ((F + 1.16, C), (U, UC + 0.03)):
        lathe('iron', IRON, x, z, [(y0, 0.08), (y1, 0.08)], 10)
    lathe('iron', IRON, x, z, [(C - 0.02, 0.14), (C, 0.14)], 10)
    lathe('iron', IRON, x, z, [(U, 0.14), (U + 0.02, 0.14)], 10)


def hanging_lamp(x, z, ceiling, drop):
    y = ceiling - drop
    box('brass', (1, 1, 1), x - 0.006, x + 0.006, y + 0.3, ceiling, z - 0.006, z + 0.006)
    lathe('brass', (1, 1, 1), x, z, [(ceiling - 0.03, 0.08), (ceiling, 0.08)], 10)
    lathe('tin', (0.95, 0.92, 0.82), x, z, [(y + 0.26, 0.02), (y + 0.3, 0.26), (y + 0.33, 0.26), (y + 0.36, 0.02)], 14)  # shade
    lathe('brass', (1, 1, 1), x, z, [(y, 0.05), (y + 0.06, 0.1), (y + 0.13, 0.09), (y + 0.17, 0.03)], 10)            # font
    lathe('fabric', (1.0, 0.92, 0.7), x, z, [(y + 0.17, 0.04), (y + 0.24, 0.05), (y + 0.3, 0.03)], 10)                 # chimney


def picture(wall, u, v, w, h, canvas):
    wbox(wall, u - w / 2 - 0.07, u + w / 2 + 0.07, v - 0.07, v + h + 0.07, 0, 0.04, 'brass', (0.8, 0.7, 0.5))
    wbox(wall, u - w / 2, u + w / 2, v, v + h, 0.02, 0.045, 'paint', canvas[0])
    # A painted horizon and a band of subject, enough to read as a scene.
    wbox(wall, u - w / 2, u + w / 2, v, v + h * 0.4, 0.045, 0.047, 'paint', canvas[1])
    wbox(wall, u - w * 0.3, u + w * 0.25, v + h * 0.3, v + h * 0.62, 0.047, 0.049, 'paint', canvas[2])


# ---------------------------------------------------------------- upstairs
def partitions():
    for p in SAL['PARTITIONS']:
        doors = sorted(p['doors'])
        cuts = [(d - DOOR['w'] / 2, d + DOOR['w'] / 2) for d in doors]
        for a, b in runs(p['from'], p['to'], cuts):
            for side in (-1, 1):
                face = p['at'] + side * 0.06
                n = int((b - a) / 0.16) or 1
                for k in range(n):
                    ua = a + k * (b - a) / n
                    ub = ua + (b - a) / n
                    t = tuple(c * (0.95 + 0.08 * rng.random()) for c in UP_PAPER)
                    lo, hi = sorted((face, face - side * 0.12))
                    if p['axis'] == 'x':
                        box('paint', t, ua + 0.003, ub - 0.003, U, UC, min(face, p['at']), max(face, p['at']))
                    else:
                        box('paint', t, min(face, p['at']), max(face, p['at']), U, UC, ua + 0.003, ub - 0.003)
                ylo = U
                if p['axis'] == 'x':
                    box('timber', TRIM, a, b, ylo, ylo + 0.18, *sorted((face, face + side * 0.02)))
                else:
                    box('timber', TRIM, *sorted((face, face + side * 0.02)), ylo, ylo + 0.18, a, b)
        # Head over each doorway, casings both faces, a leaf folded open.
        for d in doors:
            h = U + DOOR['h']
            if p['axis'] == 'x':
                box('paint', UP_PAPER, d - DOOR['w'] / 2, d + DOOR['w'] / 2, h, UC, p['at'] - 0.06, p['at'] + 0.06)
                for side in (-1, 1):
                    zf = p['at'] + side * 0.06
                    for s in (-1, 1):
                        e = d + s * DOOR['w'] / 2
                        box('timber', TRIM, min(e, e + s * 0.1), max(e, e + s * 0.1), U, h + 0.1, *sorted((zf, zf + side * 0.03)))
                    box('timber', TRIM, d - DOOR['w'] / 2 - 0.1, d + DOOR['w'] / 2 + 0.1, h, h + 0.12, *sorted((zf, zf + side * 0.035)))
                for s in (-1, 1):
                    box('timber', TRIM, d + s * DOOR['w'] / 2 - (0.02 if s > 0 else 0), d + s * DOOR['w'] / 2 + (0.02 if s < 0 else 0), U, h, p['at'] - 0.06, p['at'] + 0.06)
                # Leaf swung 90 degrees into the room (toward -z), along the hinge jamb.
                hx = d - DOOR['w'] / 2 + 0.03
                box('timber', MAHOGANY, hx, hx + 0.045, U + 0.01, h - 0.02, p['at'] - 0.06 - DOOR['w'] + 0.04, p['at'] - 0.06)
                for v0, v1 in ((U + 0.15, U + 0.95), (U + 1.1, h - 0.15)):
                    box('timber', tuple(c * 1.12 for c in MAHOGANY), hx + 0.045, hx + 0.06, v0, v1, p['at'] - DOOR['w'] + 0.02, p['at'] - 0.18)
                box('brass', (1, 1, 1), hx + 0.06, hx + 0.1, U + 0.98, U + 1.03, p['at'] - DOOR['w'] + 0.06, p['at'] - DOOR['w'] + 0.12)
        # Number plates on the hall side of the room doors.
    for d, label in zip(SAL['PARTITIONS'][0]['doors'], ('1', '2')):
        zf = SAL['PARTITIONS'][0]['at'] + 0.06
        box('brass', (1, 1, 1), d - 0.09, d + 0.09, U + 2.3, U + 2.48, zf + 0.03, zf + 0.04)


def curtains(wall, o):
    u, w, v0, h = o['x'], o['w'], o['fromFloor'], o['h']
    v1 = v0 + h + 0.3
    wbox(wall, u - w / 2 - 0.3, u + w / 2 + 0.3, v1, v1 + 0.03, 0.05, 0.1, 'brass', (1, 1, 1))
    for s in (-1, 1):
        e = u + s * (w / 2 + 0.05)
        for k in range(4):
            a = e + s * k * 0.07
            wbox(wall, min(a, a + s * 0.07), max(a, a + s * 0.07), v0 - 0.25, v1, 0.07 + 0.02 * (k % 2), 0.1 + 0.02 * (k % 2), 'fabric', (0.72, 0.28, 0.22))
    wbox(wall, u - w / 2 - 0.2, u + w / 2 + 0.2, v1 - 0.28, v1, 0.1, 0.13, 'fabric', (0.62, 0.22, 0.18))


def rug(x0, x1, z0, z1, y, field, border):
    box('fabric', border, x0, x1, y, y + 0.008, z0, z1)
    box('fabric', field, x0 + 0.12, x1 - 0.12, y + 0.008, y + 0.011, z0 + 0.12, z1 - 0.12)


# ---------------------------------------------------------------- build / export
def build():
    scene = bpy.data.scenes.get(SCENE)
    bpy.context.window.scene = scene
    for o in list(scene.objects):
        if o.get('saloon_interior'):
            bpy.data.objects.remove(o, do_unlink=True)
    ACC.clear()
    rng.seed(1878)

    floor_boards(F + 0.0, [(-X, X, -Z, Z)])
    floor_boards(U, [(WX1, X, -Z, Z), (-X, WX1, WZ1, Z), (-X, WX1, -Z, WZ0)])
    extent[('west', F)] = (-Z, Z)
    walls()
    tin_ceiling()
    board_ceiling(UC, [(-X, X, -Z, Z)], CREAM)
    bar()
    back_bar()
    stair()
    stove()
    partitions()
    hanging_lamp(-1.2, 0.2, C - 0.05, 0.95)
    hanging_lamp(1.0, -1.3, C - 0.05, 0.95)
    hanging_lamp(-1.6, 2.55, UC, 0.7)
    hanging_lamp(-1.6, -1.2, UC, 0.8)
    hanging_lamp(2.4, -1.4, UC, 0.8)
    # Barroom pictures: a reclining painting over the piano, a landscape by the door.
    picture('back', -0.6, F + 1.75, 1.5, 0.85, ((0.55, 0.42, 0.3), (0.35, 0.28, 0.2), (0.9, 0.72, 0.6)))
    picture('front', 1.08, F + 1.5, 0.34, 0.5, ((0.45, 0.55, 0.62), (0.5, 0.42, 0.28), (0.3, 0.3, 0.26)))
    picture('east', 3.05, F + 1.5, 0.9, 0.6, ((0.5, 0.6, 0.68), (0.62, 0.5, 0.32), (0.4, 0.3, 0.22)))
    picture('front', -1.62, U + 1.3, 0.34, 0.46, ((0.62, 0.55, 0.4), (0.45, 0.4, 0.3), (0.3, 0.26, 0.22)))
    picture('west', -2.8, U + 1.45, 0.7, 0.5, ((0.55, 0.62, 0.66), (0.5, 0.55, 0.35), (0.35, 0.3, 0.25)))
    picture('east', -1.2, U + 1.45, 0.7, 0.5, ((0.6, 0.5, 0.42), (0.45, 0.35, 0.25), (0.8, 0.7, 0.55)))
    for o in openings('front') + openings('back'):
        if o['fromFloor'] > U and o.get('class') != 'door':
            curtains('front' if o in openings('front') else 'back', o)
    rug(-2.9, -0.5, 0.9, 2.5, F, (0.55, 0.22, 0.16), (0.3, 0.2, 0.12))
    rug(-2.9, 3.9, 2.0, 3.4, U, (0.5, 0.26, 0.2), (0.28, 0.2, 0.14))
    rug(-2.6, -0.2, -3.2, -1.6, U, (0.42, 0.34, 0.5), (0.3, 0.24, 0.3))

    mats = S['ensure_materials']()
    total = 0
    for name, a in ACC.items():
        mesh = bpy.data.meshes.new('Saloon interior ' + name)
        mesh.from_pydata([S['point'](v) for v in a.verts], [], a.faces)
        col = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        for poly, tint in zip(mesh.polygons, a.tints):
            for li in poly.loop_indices:
                col.data[li].color = (*tint, 1)
        mesh.materials.append(mats[name])
        obj = bpy.data.objects.new('Saloon interior ' + name, mesh)
        obj['saloon_interior'] = True
        scene.collection.objects.link(obj)
        total += len(a.faces)
    print('Saloon interior:', total, 'faces in', len(ACC), 'materials')


def export():
    scene = bpy.data.scenes[SCENE]
    batches = {}
    for o in scene.objects:
        if o.type != 'MESH' or not o.get('saloon_interior'):
            continue
        mesh = o.data
        mesh.calc_loop_triangles()
        key = o.data.materials[0].name.removeprefix('Saloon_').split('.')[0]
        col = mesh.color_attributes['Col'].data
        b = batches.setdefault(key, {'position': [], 'color': [], 'index': [], 'lookup': {}})
        for tri in mesh.loop_triangles:
            n = o.matrix_world.to_3x3() @ tri.normal
            n.normalize()
            normal = (round(n.x, 3), round(n.z, 3), round(-n.y, 3))
            for vi, li in zip(tri.vertices, tri.loops):
                v = o.matrix_world @ mesh.vertices[vi].co
                c = col[li].color
                pos = (round(v.x * 1000), round(v.z * 1000), round(-v.y * 1000))
                tint = (round(c[0] * 100), round(c[1] * 100), round(c[2] * 100))
                vertex = pos + normal + tint
                idx = b['lookup'].get(vertex)
                if idx is None:
                    idx = b['lookup'][vertex] = len(b['position']) // 3
                    b['position'].extend(pos)
                    b['color'].extend(tint)
                b['index'].append(idx)
    for b in batches.values():
        del b['lookup']
    target = ROOT / 'src/models/saloon-interior.json'
    target.write_text(json.dumps({'generator': 'scripts/blender-saloon/interior.py', 'units': {'position': 0.001, 'color': 0.01},
                                  'batches': batches}, separators=(',', ':')))
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'saloon.blend'))
    print('Exported', sum(len(b['index']) // 3 for b in batches.values()), 'triangles;', len(batches), 'batches;',
          round(target.stat().st_size / 1e6, 2), 'MB')
