"""Blender-authored exterior for the Silver Creek saloon. Metres, lot-local game
XYZ: x across the facade, y up from the lot floor, z toward the street (+z).

Run with Blender MCP:
    ns = runpy.run_path('<abs path>/saloon.py'); ns['build'](); ns['export']()

layout.json (export-layout.mjs) holds the kit's wall frames and openings. The
kit keeps collision, the doorway and the interior shell; this model dresses
every face the street sees:
  - a storefront of pilasters, bulkhead panels, glazed windows and a transom,
  - a balcony gallery on turned posts over the boardwalk, with its own roof,
  - a clapboarded upper storey with blind sashes (no upstairs rooms yet),
  - a bracketed false front with a stepped pediment and the SALOON sign,
  - board-and-batten returns and back wall.

Geometry accumulates as closed solids per material with a per-face tint (the
'Col' colour attribute), exported like the ranch interior: one batch per game
material, the game's texture multiplied by the tint.
"""
import bpy, json, math
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT / 'scripts/blender-saloon'
LAYOUT = json.loads((HERE / 'layout.json').read_text())
LOT = LAYOUT['lot']
SAL = LAYOUT['saloon']          # SALOON in src/buildings/saloon.js
W, D, EAVE = LOT['w'], LOT['d'], LOT['h']
T = 0.22
FRONT = D / 2 + T / 2          # outer face of the kit front wall (4.11)
SIDE = W / 2 + 0.5             # outer face of the false-front returns (5.0)
FF = FRONT + 0.39              # face of the kit false-front board (4.5)
FF_TOP = EAVE + 3.2            # top of the kit false-front board (10.6)
SCENE = 'High Country • Saloon'
# The back wall's frame faces -z, so its opening x is mirrored into lot x here.
BACK = [dict(o, x=-o['x']) for o in next(w for w in LAYOUT['walls'] if abs(w['matrix'][14] + D / 2) < 1e-3)['openings']]

# Storefront and gallery dimensions.
DECK = SAL['UPPER']            # balcony walking surface, level with the upstairs floor
GALLERY = DECK - 0.16          # top of the belt beam; balcony joists sit on it
REACH = 7.72                   # post centre line over the boardwalk (deck edge 8.0)
POSTS = (-4.72, -1.58, 1.58, 4.72)
ROOF_HI, ROOF_LO = 7.05, 6.62  # gallery roof at the facade / at the posts

# Base colours only steer the Blender preview; the game multiplies its own
# material by the per-face tint.
MATERIALS = {
    'paint': (0.8, 0.78, 0.72), 'wood': (0.42, 0.28, 0.16), 'roof': (0.2, 0.16, 0.12),
    'iron': (0.06, 0.06, 0.06), 'glass': (0.35, 0.42, 0.42), 'pane': (0.08, 0.09, 0.09),
}
BODY = (0.62, 0.30, 0.22)      # faded oxblood boards
BODY_DK = (0.52, 0.25, 0.19)
CREAM = (0.93, 0.86, 0.70)     # trim
GREEN = (0.30, 0.40, 0.32)     # sashes, panels, sign field
GOLD = (1.0, 0.78, 0.36)       # lettering
DECKING = (0.86, 0.78, 0.66)
SHADE = (0.86, 0.74, 0.52)     # drawn blinds behind the upper sashes


def point(v):
    return Vector((v[0], -v[2], v[1]))


class Acc:
    def __init__(self):
        self.verts, self.faces, self.tints = [], [], []

    def face(self, pts, tint):
        base = len(self.verts)
        self.verts.extend(pts)
        self.faces.append(tuple(range(base, base + len(pts))))
        self.tints.append(tint)


ACC = {}


def acc(mat):
    return ACC.setdefault(mat, Acc())


def solid(mat, tint, loop_a, loop_b):
    """Closed prism between two matching vertex loops (game coords). Faces are
    oriented outward from the prism centroid, so loop winding is free."""
    a = acc(mat)
    pts = [Vector(p) for p in loop_a + loop_b]
    c = sum(pts, Vector()) / len(pts)
    n = len(loop_a)

    def add(idx):
        poly = [pts[i] for i in idx]
        fc = sum(poly, Vector()) / len(poly)
        nrm = (poly[1] - poly[0]).cross(poly[2] - poly[0])
        if nrm.length < 1e-12 and len(poly) > 3:
            nrm = (poly[2] - poly[1]).cross(poly[3] - poly[1])
        if nrm.dot(fc - c) < 0:
            poly = poly[::-1]
        a.face([tuple(p) for p in poly], tint)

    add(list(range(n)))
    add(list(range(n, 2 * n)))
    for i in range(n):
        j = (i + 1) % n
        add([i, j, j + n, i + n])


def box(mat, tint, x0, x1, y0, y1, z0, z1):
    if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
        return
    solid(mat, tint, [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)],
          [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)])


def profile_x(mat, tint, pts_yz, x0, x1):
    """A (y, z) profile extruded across x. Must be convex or star-shaped from
    its centroid; concave outlines are split by the caller."""
    solid(mat, tint, [(x0, y, z) for y, z in pts_yz], [(x1, y, z) for y, z in pts_yz])


def profile_z(mat, tint, pts_xy, z0, z1):
    solid(mat, tint, [(x, y, z0) for x, y in pts_xy], [(x, y, z1) for x, y in pts_xy])


def profile_y(mat, tint, pts_xz, y0, y1):
    solid(mat, tint, [(x, y0, z) for x, z in pts_xz], [(x, y1, z) for x, z in pts_xz])


def lathe(mat, tint, cx, cz, rings, sides=8):
    """Turned work: rings = [(y, radius)] bottom to top, capped both ends."""
    a = acc(mat)
    ang = [2 * math.pi * (k + 0.5) / sides for k in range(sides)]
    loops = [[(cx + r * math.cos(t), y, cz + r * math.sin(t)) for t in ang] for y, r in rings]
    a.face(loops[0][::-1], tint)
    a.face(loops[-1], tint)
    for lo, hi in zip(loops, loops[1:]):
        for k in range(sides):
            j = (k + 1) % sides
            a.face([lo[k], lo[j], hi[j], hi[k]], tint)


def square_post(mat, tint, cx, cz, rings):
    """Square turned-look post: rings = [(y, half width)]."""
    a = acc(mat)
    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    loops = [[(cx + h * sx, y, cz + h * sz) for sx, sz in corners] for y, h in rings]
    a.face(loops[0][::-1], tint)
    a.face(loops[-1], tint)
    for lo, hi in zip(loops, loops[1:]):
        for k in range(4):
            j = (k + 1) % 4
            a.face([lo[k], lo[j], hi[j], hi[k]], tint)


def text(mat, tint, body, x, y, z, size, depth, spacing=1.0):
    """Raised lettering on a +z facing board, centred on (x, y)."""
    curve = bpy.data.curves.new('lettering', 'FONT')
    curve.body = body
    curve.align_x, curve.align_y = 'CENTER', 'CENTER'
    curve.size, curve.extrude, curve.space_character = size, depth / 2, spacing
    curve.resolution_u = 3
    obj = bpy.data.objects.new('lettering', curve)
    bpy.context.scene.collection.objects.link(obj)
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = obj.evaluated_get(dg).to_mesh()
    a = acc(mat)
    for p in mesh.polygons:
        a.face([(x + mesh.vertices[i].co.x, y + mesh.vertices[i].co.y, z + depth / 2 + mesh.vertices[i].co.z)
                for i in p.vertices], tint)
    obj.evaluated_get(dg).to_mesh_clear()
    bpy.data.objects.remove(obj)
    bpy.data.curves.remove(curve)


def spans(a, b, cuts):
    out = [(a, b)]
    for c0, c1 in cuts:
        nxt = []
        for r0, r1 in out:
            if c1 <= r0 or c0 >= r1:
                nxt.append((r0, r1))
                continue
            if c0 > r0:
                nxt.append((r0, c0))
            if c1 < r1:
                nxt.append((c1, r1))
        out = nxt
    return [(r0, r1) for r0, r1 in out if r1 - r0 > 0.01]


def openings():
    front = [w for w in LAYOUT['walls'] if abs(w['matrix'][14] - D / 2) < 1e-3]
    assert front, 'no kit front wall in layout.json'
    return front[0]['openings']


# ---------------------------------------------------------------- storefront
def storefront():
    ops = openings()
    door = next(o for o in ops if o['fromFloor'] < 0.01)
    windows = [o for o in ops if o['fromFloor'] > 0.3 and o['fromFloor'] < GALLERY]
    z0, z1 = FRONT, FRONT + 0.05
    top = GALLERY - 0.3
    # Beaded boards behind everything, cut around each opening's casing.
    holes = [(o['x'] - o['w'] / 2, o['x'] + o['w'] / 2, o['fromFloor'], o['fromFloor'] + o['h']) for o in ops]
    if not windows:
        holes += [(x - 1.0, x + 1.0, 0.3, 2.53) for x in (-2.72, 2.72)]
    holes.append((door['x'] - door['w'] / 2, door['x'] + door['w'] / 2, door['h'], door['h'] + 0.6))   # transom
    siding(-W / 2 - 0.11, W / 2 + 0.11, 0.0, top, z0, holes, BODY, vertical=True)

    # Pilasters: corners over the kit return ends, and one each side of the door.
    for x, half in ((-(SIDE - 0.22), 0.25), (SIDE - 0.22, 0.25), (-1.24, 0.17), (1.24, 0.17)):
        zf = FRONT + (0.34 if half > 0.2 else 0.12)
        box('paint', CREAM, x - half, x + half, 0.0, top, FRONT, zf)
        box('paint', CREAM, x - half - 0.04, x + half + 0.04, 0.0, 0.32, FRONT, zf + 0.04)   # plinth
        box('paint', CREAM, x - half - 0.05, x + half + 0.05, top - 0.22, top - 0.1, FRONT, zf + 0.05)  # capital
        box('paint', GREEN, x - half + 0.06, x + half - 0.06, 0.55, top - 0.45, zf, zf + 0.02)  # recessed panel

    # Frieze and belt beam carrying the balcony, with SALOON-level dentils.
    box('paint', CREAM, -SIDE - 0.05, SIDE + 0.05, top, GALLERY, FRONT, FRONT + 0.36)
    box('paint', GREEN, -SIDE + 0.3, SIDE - 0.3, top + 0.06, GALLERY - 0.08, FRONT + 0.36, FRONT + 0.38)
    for i in range(int((2 * SIDE) / 0.42)):
        x = -SIDE + 0.21 + i * 0.42
        box('paint', CREAM, x - 0.06, x + 0.06, top - 0.12, top, FRONT + 0.2, FRONT + 0.34)

    # Door: casing, head with a glazed transom (blind: the kit ceiling is at 2.7).
    dx, dw, dh = door['x'], door['w'], door['h']
    for s in (-1, 1):
        box('paint', CREAM, dx + s * dw / 2 - (0.16 if s < 0 else 0), dx + s * dw / 2 + (0.16 if s > 0 else 0),
            0.0, dh + 0.6, FRONT, FRONT + 0.1)
    box('paint', CREAM, dx - dw / 2 - 0.22, dx + dw / 2 + 0.22, dh + 0.6, dh + 0.78, FRONT, FRONT + 0.16)
    box('paint', CREAM, dx - dw / 2, dx + dw / 2, dh, dh + 0.08, FRONT, FRONT + 0.1)
    box('pane', GREEN, dx - dw / 2, dx + dw / 2, dh + 0.08, dh + 0.6, FRONT + 0.02, FRONT + 0.03)
    for k in (1, 2):
        x = dx - dw / 2 + k * dw / 3
        box('paint', CREAM, x - 0.02, x + 0.02, dh + 0.08, dh + 0.6, FRONT + 0.03, FRONT + 0.06)
    batwings(dx, dw)

    for o in windows:
        shopwindow(o)
    if not windows:
        # No kit openings yet: blind bulkhead-and-sash windows keep the facade.
        for x in (-2.72, 2.72):
            shopwindow({'x': x, 'w': 2.0, 'h': 1.75, 'fromFloor': 0.78}, blind=True)


def batwings(dx, dw):
    """Saloon doors folded back flat against the facade either side of the
    casing, the way they are pinned open by day, so the kit doorway stays clear."""
    leaf, y0, y1 = dw / 2 - 0.02, 0.52, 1.7
    z0 = FRONT + 0.1
    for s in (-1, 1):
        xa = dx + s * (dw / 2 + 0.17)
        xb = xa + s * leaf
        lo, hi = min(xa, xb), max(xa, xb)
        box('paint', GREEN, lo, hi, y0, y1 - 0.12, z0, z0 + 0.045)
        # Rails and stiles framing a louvred panel; a scalloped crest rail.
        for y in (y0, y0 + 0.42):
            box('paint', GREEN, lo, hi, y, y + 0.08, z0 + 0.045, z0 + 0.065)
        for x in (lo, hi - 0.06):
            box('paint', GREEN, x, x + 0.06, y0, y1 - 0.12, z0 + 0.045, z0 + 0.065)
        for k in range(6):
            y = y0 + 0.52 + k * 0.095
            profile_x('paint', CREAM, [(y, z0 + 0.045), (y + 0.05, z0 + 0.045), (y, z0 + 0.075)], lo + 0.06, hi - 0.06)
        hinge_side = xa
        crest = [(lo, y1 - 0.12), (hi, y1 - 0.12), (hi, y1 - 0.02 if hinge_side == hi else y1 + 0.06),
                 ((lo + hi) / 2, y1 + 0.02), (lo, y1 + 0.06 if hinge_side == hi else y1 - 0.02)]
        profile_z('paint', GREEN, crest, z0, z0 + 0.065)
        for y in (y0 + 0.12, y1 - 0.22):
            box('iron', (0.75, 0.62, 0.35), min(xa, xa + s * 0.14), max(xa, xa + s * 0.14), y, y + 0.05, z0 + 0.065, z0 + 0.075)


def shopwindow(o, blind=False):
    x, w, sill, h = o['x'], o['w'], o['fromFloor'], o['h']
    xa, xb, top = x - w / 2, x + w / 2, sill + h
    # Casing, sill and cornice head.
    for s in (xa - 0.14, xb):
        box('paint', CREAM, s, s + 0.14, sill - 0.05, top + 0.05, FRONT, FRONT + 0.1)
    box('paint', CREAM, xa - 0.22, xb + 0.22, sill - 0.12, sill - 0.02, FRONT, FRONT + 0.2)
    box('paint', CREAM, xa - 0.2, xb + 0.2, top + 0.05, top + 0.2, FRONT, FRONT + 0.12)
    profile_x('paint', CREAM, [(top + 0.2, FRONT), (top + 0.34, FRONT), (top + 0.34, FRONT + 0.2), (top + 0.2, FRONT + 0.14)], xa - 0.26, xb + 0.26)
    # Bulkhead panel under the sill.
    box('paint', CREAM, xa - 0.14, xb + 0.14, 0.3, sill - 0.12, FRONT, FRONT + 0.06)
    box('paint', GREEN, xa + 0.05, xb - 0.05, 0.42, sill - 0.24, FRONT + 0.06, FRONT + 0.08)
    # Sash: a light frame with one muntin; the glass sits in the kit opening.
    # Real openings take the kit's glazing (wall centre, 0.1 thick); the sash
    # sits just outside it, inside the reveal.
    zs = FRONT - 0.055 if not blind else FRONT + 0.01
    if blind:
        box('pane', (1, 1, 1), xa, xb, sill, top, zs - 0.01, zs)
    for x0, x1, y0, y1 in ((xa, xb, sill, sill + 0.07), (xa, xb, top - 0.07, top), (xa, xa + 0.07, sill, top),
                           (xb - 0.07, xb, sill, top), (xa, xb, sill + h * 0.72 - 0.03, sill + h * 0.72 + 0.03),
                           (x - 0.03, x + 0.03, sill + h * 0.72, top)):
        box('paint', GREEN, x0, x1, y0, y1, zs, zs + 0.05)


def siding(xa, xb, ya, yb, z, holes, tint, vertical=False, pitch=0.2):
    """Boards from xa..xb, ya..yb on the plane z (outward +z), cut around holes
    (x0, x1, y0, y1). Vertical beaded boards or horizontal lap."""
    def runs(a, b, cuts):
        out = [(a, b)]
        for c0, c1 in cuts:
            nxt = []
            for r0, r1 in out:
                if c1 <= r0 or c0 >= r1:
                    nxt.append((r0, r1))
                    continue
                if c0 > r0:
                    nxt.append((r0, c0))
                if c1 < r1:
                    nxt.append((c1, r1))
            out = nxt
        return [(r0, r1) for r0, r1 in out if r1 - r0 > 0.01]

    shades = [tint, tuple(c * 0.94 for c in tint), tuple(c * 1.04 for c in tint), tint]
    if vertical:
        n = int(round((xb - xa) / pitch))
        for i in range(n):
            x0, x1 = xa + i * (xb - xa) / n, xa + (i + 1) * (xb - xa) / n
            cuts = [(h[2], h[3]) for h in holes if h[0] < x1 and h[1] > x0]
            # Boards stop at an opening, so split where a hole starts mid-board.
            for c0, c1 in runs(ya, yb, cuts):
                box('paint', shades[i % 4], x0 + 0.004, x1 - 0.004, c0, c1, z, z + 0.04)
    else:
        n = int(math.ceil((yb - ya) / pitch))
        for r in range(n):
            y0, y1 = ya + r * pitch, min(yb, ya + (r + 1) * pitch)
            cuts = [(h[0], h[1]) for h in holes if h[2] < y1 and h[3] > y0]
            for c0, c1 in runs(xa, xb, cuts):
                # Lap: thin at the top, thick at the drip edge.
                profile_x('paint', shades[(r * 3) % 4], [(y0, z), (y1, z), (y1, z + 0.018), (y0, z + 0.045)], c0, c1)


# ---------------------------------------------------------------- gallery
def gallery():
    zf, zr = FRONT, REACH
    # Balcony floor: rim joists, decking, soffit boards seen from the boardwalk.
    box('paint', CREAM, -SIDE, SIDE, GALLERY, DECK - 0.03, zr - 0.02, zr + 0.2)          # front rim
    for s in (-1, 1):
        box('paint', CREAM, s * SIDE - 0.1, s * SIDE + 0.1, GALLERY, DECK - 0.03, zf + 0.36, zr + 0.2)
    for i in range(13):
        x = -SIDE + 0.25 + i * (2 * SIDE - 0.5) / 12
        box('wood', (0.7, 0.58, 0.46), x - 0.05, x + 0.05, GALLERY - 0.02, DECK - 0.03, zf + 0.36, zr)
    box('wood', (0.78, 0.7, 0.6), -SIDE + 0.1, SIDE - 0.1, GALLERY + 0.02, GALLERY + 0.04, zf + 0.36, zr)
    # Boards run toward the street, like the floors inside: the plank texture
    # laid across them read as a tiled grid.
    n = int((2 * SIDE + 0.04) / 0.14)
    for k in range(n):
        x = -SIDE - 0.02 + k * (2 * SIDE + 0.04) / n
        box('wood', DECKING if k % 3 else tuple(c * 0.93 for c in DECKING), x + 0.003, x + (2 * SIDE + 0.04) / n - 0.003, DECK - 0.03, DECK, zf + 0.01, zr + 0.2)

    # Posts: chamfered square shafts with turned collars, bracketed at both levels.
    for x in POSTS:
        square_post('paint', CREAM, x, zr, [(0.05, 0.13), (0.3, 0.13), (0.3, 0.1), (GALLERY - 0.35, 0.1),
                                             (GALLERY - 0.35, 0.12), (GALLERY - 0.25, 0.12), (GALLERY - 0.25, 0.1), (GALLERY, 0.1)])
        square_post('paint', CREAM, x, zr, [(DECK, 0.09), (DECK + 0.2, 0.09), (DECK + 0.2, 0.075),
                                             (ROOF_LO - 0.3, 0.075), (ROOF_LO - 0.3, 0.095), (ROOF_LO - 0.02, 0.095)])
        for s in (-1, 1):
            if abs(x + s * 0.5) > SIDE:
                continue
            bracket(x, zr, s, GALLERY - 0.02, 0.55)
            bracket(x, zr, s, ROOF_LO - 0.04, 0.45)
    # Street-side brackets from post to belt beam read in profile along the walk.
    for x in POSTS:
        profile_x('paint', CREAM, [(GALLERY, zr - 0.1), (GALLERY, zr - 0.9), (GALLERY - 0.1, zr - 0.9), (GALLERY - 0.72, zr - 0.18), (GALLERY - 0.72, zr - 0.1)], x - 0.035, x + 0.035)

    # Balustrade: top rail, bottom rail and turned balusters on three sides.
    rail_y0, rail_y1 = DECK + 0.1, DECK + 0.95
    runs = [((POSTS[i] + 0.09, POSTS[i + 1] - 0.09), 'x') for i in range(3)]
    for (a, b), _ in runs:
        box('paint', CREAM, a, b, rail_y1 - 0.02, rail_y1 + 0.06, zr - 0.07, zr + 0.07)
        box('paint', CREAM, a, b, rail_y0, rail_y0 + 0.07, zr - 0.05, zr + 0.05)
        n = int((b - a) / 0.16)
        for k in range(1, n):
            lathe('paint', CREAM, a + k * (b - a) / n, zr, baluster(rail_y0 + 0.07, rail_y1 - 0.02), 6)
    for s in (-1, 1):
        x = s * (SIDE - 0.08)
        a, b = zf + 0.4, zr - 0.1
        box('paint', CREAM, x - 0.07, x + 0.07, rail_y1 - 0.02, rail_y1 + 0.06, a, b)
        box('paint', CREAM, x - 0.05, x + 0.05, rail_y0, rail_y0 + 0.07, a, b)
        n = int((b - a) / 0.16)
        for k in range(1, n):
            lathe('paint', CREAM, x, a + k * (b - a) / n, baluster(rail_y0 + 0.07, rail_y1 - 0.02), 6)
        square_post('paint', CREAM, x, zf + 0.42, [(DECK, 0.08), (rail_y1 + 0.12, 0.08)])

    # Gallery roof: rafters, boarded soffit, standing-seam tin, fascia with a
    # scalloped valance.
    def roof_y(z):
        return ROOF_HI + (ROOF_LO - ROOF_HI) * (z - zf) / (zr + 0.35 - zf)
    box('paint', CREAM, -SIDE - 0.1, SIDE + 0.1, ROOF_LO - 0.24, ROOF_LO, zr - 0.08, zr + 0.08)   # plate beam
    for i in range(14):
        x = -SIDE - 0.05 + i * (2 * SIDE + 0.1) / 13
        profile_x('paint', CREAM, [(roof_y(zf) - 0.14, zf), (roof_y(zf), zf), (roof_y(zr + 0.35), zr + 0.35), (roof_y(zr + 0.35) - 0.12, zr + 0.35)], x - 0.035, x + 0.035)
    profile_x('wood', (0.74, 0.64, 0.52), [(roof_y(zf) - 0.14, zf), (roof_y(zf) - 0.12, zf), (roof_y(zr + 0.35) - 0.1, zr + 0.35), (roof_y(zr + 0.35) - 0.12, zr + 0.35)], -SIDE - 0.1, SIDE + 0.1)
    for i in range(17):
        x0 = -SIDE - 0.25 + i * (2 * SIDE + 0.5) / 17
        x1 = x0 + (2 * SIDE + 0.5) / 17
        profile_x('roof', (1, 1, 1), [(roof_y(zf), zf - 0.02), (roof_y(zf) + 0.02, zf - 0.02), (roof_y(zr + 0.45) + 0.02, zr + 0.45), (roof_y(zr + 0.45), zr + 0.45)], x0, x1)
        profile_x('iron', (0.55, 0.55, 0.52), [(roof_y(zf) + 0.02, zf), (roof_y(zf) + 0.06, zf), (roof_y(zr + 0.45) + 0.06, zr + 0.45), (roof_y(zr + 0.45) + 0.02, zr + 0.45)], x1 - 0.012, x1 + 0.012)
    yf = roof_y(zr + 0.45)
    box('paint', CREAM, -SIDE - 0.28, SIDE + 0.28, yf - 0.22, yf + 0.04, zr + 0.45, zr + 0.5)
    for i in range(int((2 * SIDE + 0.5) / 0.3)):
        x = -SIDE - 0.25 + 0.15 + i * 0.3
        profile_z('paint', CREAM, [(x - 0.15, yf - 0.22), (x + 0.15, yf - 0.22), (x + 0.1, yf - 0.3), (x, yf - 0.34), (x - 0.1, yf - 0.3)], zr + 0.45, zr + 0.48)
    # Flashing where the gallery roof meets the facade; end rakes close the gap.
    box('iron', (0.5, 0.5, 0.48), -SIDE - 0.25, SIDE + 0.25, roof_y(zf) + 0.02, roof_y(zf) + 0.2, zf, zf + 0.04)
    for s in (-1, 1):
        x = s * (SIDE + 0.25)
        profile_x('paint', CREAM, [(roof_y(zf) - 0.2, zf), (roof_y(zf) + 0.06, zf), (roof_y(zr + 0.45) + 0.06, zr + 0.45), (roof_y(zr + 0.45) - 0.22, zr + 0.45)], x - 0.03, x + 0.03)


def baluster(y0, y1):
    h = y1 - y0
    return [(y0, 0.03), (y0 + h * 0.08, 0.03), (y0 + h * 0.12, 0.022), (y0 + h * 0.35, 0.04), (y0 + h * 0.55, 0.018),
            (y0 + h * 0.7, 0.028), (y0 + h * 0.88, 0.02), (y0 + h * 0.92, 0.03), (y1, 0.03)]


def bracket(x, z, s, y, reach):
    """Scroll-cut bracket in the facade plane (x-y), under a beam at y."""
    x0 = x + s * 0.1
    x1 = x + s * (0.1 + reach)
    pts = [(x0, y), (x1, y), (x1, y - 0.07), (x0 + s * reach * 0.45, y - reach * 0.35), (x0 + s * 0.1, y - reach * 0.85), (x0, y - reach * 0.85)]
    profile_z('paint', CREAM, pts, z - 0.035, z + 0.035)


# ---------------------------------------------------------------- upper storey
def upper():
    z = FRONT
    ya, yb = GALLERY, EAVE
    ops = openings()
    windows = [o for o in ops if o['fromFloor'] > DECK and o.get('class') != 'door']
    door = next(o for o in ops if o.get('class') == 'door')
    dx, dw, y0, top = door['x'], door['w'], door['fromFloor'], door['fromFloor'] + door['h']
    holes = [(o['x'] - o['w'] / 2, o['x'] + o['w'] / 2, o['fromFloor'], o['fromFloor'] + o['h']) for o in windows]
    holes.append((dx - dw / 2, dx + dw / 2, y0, top + 0.42))
    siding(-W / 2 - 0.11, W / 2 + 0.11, ya, yb + 0.15, z, holes, BODY)
    for s in (-1, 1):
        box('paint', CREAM, s * (W / 2 + 0.11) - 0.18, s * (W / 2 + 0.11) + 0.18, ya, yb + 0.2, z, z + 0.09)  # corner boards
    for o in windows:
        sash(o['x'], o['w'], o['fromFloor'], o['h'])
    # Door onto the balcony: casing, a blind transom, and two glazed leaves
    # folded back against the wall, clear of the kit opening.
    for s in (-1, 1):
        box('paint', CREAM, dx + s * (dw / 2 + 0.07) - 0.07, dx + s * (dw / 2 + 0.07) + 0.07, y0, top + 0.5, z, z + 0.1)
    box('paint', CREAM, dx - dw / 2 - 0.22, dx + dw / 2 + 0.22, top + 0.5, top + 0.66, z, z + 0.14)
    box('paint', CREAM, dx - dw / 2, dx + dw / 2, top, top + 0.07, z, z + 0.1)
    box('pane', (1, 1, 1), dx - dw / 2, dx + dw / 2, top + 0.07, top + 0.5, z, z + 0.02)
    box('paint', GREEN, dx - 0.02, dx + 0.02, top + 0.07, top + 0.5, z + 0.02, z + 0.05)
    leaf = dw / 2
    for s in (-1, 1):
        xa = dx + s * (dw / 2 + 0.14)
        lo, hi = min(xa, xa + s * leaf), max(xa, xa + s * leaf)
        zl = z + 0.1
        box('paint', GREEN, lo, hi, y0 + 0.02, top - 0.02, zl, zl + 0.045)
        for p0, p1 in ((0.15, 0.7), (0.85, 1.1)):
            box('paint', tuple(v * 0.85 for v in GREEN), lo + 0.08, hi - 0.08, y0 + p0, y0 + p1, zl + 0.045, zl + 0.06)
        box('pane', (1, 1, 1), lo + 0.08, hi - 0.08, y0 + 1.22, top - 0.14, zl + 0.045, zl + 0.05)
        box('paint', GREEN, (lo + hi) / 2 - 0.02, (lo + hi) / 2 + 0.02, y0 + 1.22, top - 0.14, zl + 0.05, zl + 0.07)
        box('paint', SHADE, lo + 0.1, hi - 0.1, top - 0.5, top - 0.16, zl + 0.05, zl + 0.055)


def sash(x, w, sill, h, z=None):
    """A real window: casings and head on the wall face, sash bars in the
    reveal outside the kit glazing (wall centre, 0.1 thick)."""
    z = FRONT if z is None else z
    xa, xb, top = x - w / 2, x + w / 2, sill + h
    zs = z - 0.055
    for x0, x1, y0, y1 in ((xa, xb, sill, sill + 0.06), (xa, xb, top - 0.06, top), (xa, xa + 0.06, sill, top),
                           (xb - 0.06, xb, sill, top), (xa, xb, sill + h / 2 - 0.035, sill + h / 2 + 0.035),
                           (x - 0.02, x + 0.02, sill, top)):
        box('paint', GREEN, x0, x1, y0, y1, zs, zs + 0.045)
    for s in (xa - 0.12, xb):
        box('paint', CREAM, s, s + 0.12, sill - 0.05, top + 0.05, z, z + 0.1)
    box('paint', CREAM, xa - 0.2, xb + 0.2, sill - 0.1, sill - 0.02, z, z + 0.18)
    # Pedimented head.
    box('paint', CREAM, xa - 0.18, xb + 0.18, top + 0.05, top + 0.18, z, z + 0.12)
    profile_z('paint', CREAM, [(xa - 0.24, top + 0.18), (xb + 0.24, top + 0.18), (x, top + 0.46)], z, z + 0.14)


# ---------------------------------------------------------------- false front
def false_front():
    z = FF
    y0, y1 = EAVE - 0.2, FF_TOP - 0.3
    # Flush vertical boards over the kit board, then the sign.
    siding(-W / 2 - 0.3, W / 2 + 0.3, y0, y1, z, [], BODY_DK, vertical=True, pitch=0.24)
    box('paint', CREAM, -W / 2 - 0.36, W / 2 + 0.36, y0 - 0.2, y0 + 0.05, FRONT, z + 0.1)  # eave band
    sx0, sx1, sy0, sy1 = -3.85, 3.85, 8.05, 9.75
    box('paint', CREAM, sx0 - 0.16, sx1 + 0.16, sy0 - 0.16, sy1 + 0.16, z + 0.04, z + 0.1)
    box('paint', GREEN, sx0, sx1, sy0, sy1, z + 0.1, z + 0.13)
    box('paint', GOLD, sx0 + 0.1, sx1 - 0.1, sy0 + 0.1, sy0 + 0.14, z + 0.13, z + 0.15)
    box('paint', GOLD, sx0 + 0.1, sx1 - 0.1, sy1 - 0.14, sy1 - 0.1, z + 0.13, z + 0.15)
    text('paint', GOLD, 'SALOON', 0.0, (sy0 + sy1) / 2 + 0.04, z + 0.13, 1.18, 0.06, 1.12)
    # Corner stars on the sign field.
    for sx in (sx0 + 0.42, sx1 - 0.42):
        star(sx, (sy0 + sy1) / 2, z + 0.13, 0.22)

    # Bracketed cornice enclosing the kit cap (x +-5, y 10.46..10.78, z to 4.82).
    cy = FF_TOP - 0.3
    box('paint', CREAM, -SIDE - 0.05, SIDE + 0.05, cy, cy + 0.2, z, z + 0.14)             # frieze
    box('paint', GREEN, -SIDE + 0.2, SIDE - 0.2, cy + 0.04, cy + 0.16, z + 0.14, z + 0.15)
    profile_x('paint', CREAM, [(cy + 0.2, FRONT - 0.12), (cy + 0.2, z + 0.12), (cy + 0.34, z + 0.48), (cy + 0.58, z + 0.52),
                               (cy + 0.58, FRONT - 0.12)], -SIDE - 0.28, SIDE + 0.28)
    for i in range(12):
        x = -SIDE + 0.18 + i * (2 * SIDE - 0.36) / 11
        profile_x('paint', CREAM, [(cy + 0.2, z + 0.14), (cy + 0.2, z + 0.42), (cy + 0.05, z + 0.34), (cy - 0.36, z + 0.18), (cy - 0.36, z + 0.14)], x - 0.05, x + 0.05)
    # Stepped pediment rising above the cornice, boarded on both faces.
    py = cy + 0.58
    outline = [(-2.6, py), (2.6, py), (2.6, py + 0.42), (1.7, py + 0.42), (1.7, py + 0.78), (-1.7, py + 0.78), (-1.7, py + 0.42), (-2.6, py + 0.42)]
    for part in ((-2.6, 2.6, py, py + 0.42), (-1.7, 1.7, py + 0.42, py + 0.78)):
        box('paint', BODY_DK, part[0], part[1], part[2], part[3], FF - 0.05, FF + 0.08)
    arch = [(-1.1, py + 0.78), (1.1, py + 0.78), (0.75, py + 1.12), (0.0, py + 1.26), (-0.75, py + 1.12)]
    profile_z('paint', BODY_DK, arch, FF - 0.05, FF + 0.08)
    for (x0, x1, yb, yt) in ((-2.7, -1.6, py + 0.42, py + 0.52), (1.6, 2.7, py + 0.42, py + 0.52)):
        box('paint', CREAM, x0, x1, yb, yt, FF - 0.08, FF + 0.13)
    profile_z('paint', CREAM, [(-1.18, py + 0.76), (1.18, py + 0.76), (0.8, py + 1.18), (0.0, py + 1.34), (-0.8, py + 1.18)], FF - 0.08, FF - 0.05)
    profile_z('paint', CREAM, [(-1.18, py + 0.76), (1.18, py + 0.76), (0.8, py + 1.18), (0.0, py + 1.34), (-0.8, py + 1.18)], FF + 0.08, FF + 0.11)
    box('paint', CREAM, -1.8, 1.8, py + 0.7, py + 0.8, FF - 0.08, FF + 0.13)
    text('paint', GOLD, '1878', 0.0, py + 0.97, FF + 0.08, 0.26, 0.03)
    for x in (-2.6, 2.6):
        lathe('paint', CREAM, x, FF + 0.02, [(py, 0.07), (py + 0.55, 0.07), (py + 0.6, 0.11), (py + 0.66, 0.02), (py + 0.82, 0.06), (py + 0.9, 0.0)], 8)


def star(x, y, z, r):
    pts = []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5
        rr = r if k % 2 == 0 else r * 0.42
        pts.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    # Five convex kites around the centre, so each prism stays convex.
    for k in range(5):
        i0, i1, i2 = (2 * k - 1) % 10, 2 * k, 2 * k + 1
        profile_z('paint', GOLD, [(x, y), pts[i0], pts[i1], pts[i2]], z, z + 0.03)


# ---------------------------------------------------------------- sides and back
def sides_and_back():
    for s in (-1, 1):
        x = s * SIDE
        a = acc('paint')
        n = int((2 * (D / 2 + 0.3)) / 0.3)
        for i in range(n):
            z0 = -(D / 2 + 0.3) + i * (D + 0.6) / n
            z1 = z0 + (D + 0.6) / n
            tint = [BODY, BODY_DK, BODY, tuple(c * 1.03 for c in BODY)][i % 4]
            box('paint', tint, min(x, x + s * 0.04), max(x, x + s * 0.04), 0.0, FF_TOP, z0 + 0.003, z1 - 0.003)
            box('paint', BODY_DK, min(x + s * 0.04, x + s * 0.07), max(x + s * 0.04, x + s * 0.07), 0.0, FF_TOP, z1 - 0.025, z1 + 0.025)
        # Cap and corner boards on the returns.
        box('paint', CREAM, min(x - s * 0.45, x + s * 0.1), max(x - s * 0.45, x + s * 0.1), FF_TOP - 0.02, FF_TOP + 0.16, -D / 2 - 0.35, FRONT - 0.1)
        box('paint', CREAM, min(x, x + s * 0.1), max(x, x + s * 0.1), 0.0, FF_TOP, -D / 2 - 0.34, -D / 2 - 0.12)
    # Back wall: board and batten, a blind back door and a flue.
    zb = -D / 2 - T / 2
    n = int((W + 0.22) / 0.3)
    for i in range(n):
        x0 = -W / 2 - 0.11 + i * (W + 0.22) / n
        x1 = x0 + (W + 0.22) / n
        cuts = [(0.0, 2.25)] if x1 > 1.2 and x0 < 2.4 else []
        cuts += [(o['fromFloor'], o['fromFloor'] + o['h']) for o in BACK if x1 > o['x'] - o['w'] / 2 and x0 < o['x'] + o['w'] / 2]
        for y0, y1 in spans(0.0, EAVE, cuts):
            box('paint', [BODY_DK, BODY, BODY_DK, BODY][i % 4], max(x0 + 0.003, -W / 2 - 0.11), x1 - 0.003, y0, y1, zb - 0.04, zb)
        xb = x1 + 0.025
        bcuts = [(0.0, 2.25)] if 1.2 < xb < 2.4 else []
        bcuts += [(o['fromFloor'] - 0.06, o['fromFloor'] + o['h'] + 0.06) for o in BACK if abs(x1 - o['x']) < o['w'] / 2 + 0.13]
        for y0, y1 in spans(0.0, EAVE, bcuts):
            box('paint', BODY_DK, x1 - 0.025, x1 + 0.025, y0, y1, zb - 0.07, zb - 0.04)
    box('paint', GREEN, 1.25, 2.35, 0.0, 2.2, zb - 0.05, zb)
    for y in (0.35, 1.05, 1.8):
        box('paint', tuple(c * 0.85 for c in GREEN), 1.25, 2.35, y, y + 0.12, zb - 0.08, zb - 0.05)
    box('paint', CREAM, 1.13, 2.47, 2.2, 2.34, zb - 0.1, zb)
    for x in (1.13, 2.35):
        box('paint', CREAM, x, x + 0.12, 0.0, 2.2, zb - 0.08, zb)
    box('iron', (0.8, 0.8, 0.8), 2.2, 2.26, 1.0, 1.08, zb - 0.12, zb - 0.08)
    # Two upstairs sashes, mirrored onto the back plane.
    # Mirroring z flips winding, so each new face is reversed too; the extra
    # 0.04 lifts them onto the board face.
    for o in BACK:
        mark = {name: len(acc(name).faces) for name in ('paint', 'pane')}
        sash(o['x'], o['w'], o['fromFloor'], o['h'])
        for name, start in mark.items():
            a = acc(name)
            for f in a.faces[start:]:
                a.verts[f[0]:f[-1] + 1] = [(vx, vy, -vz - 0.04) for vx, vy, vz in a.verts[f[0]:f[-1] + 1]][::-1]
    # Stovepipe through the back of the shed roof, with a rain cap.
    lathe('iron', (0.7, 0.7, 0.68), SAL['STOVE']['x'], SAL['STOVE']['z'], [(7.3, 0.11), (9.4, 0.11), (9.4, 0.2), (9.52, 0.2), (9.62, 0.02)], 10)
    roof_and_parapet()


def roof_and_parapet():
    """Tin over the kit's shed roof (high at the false front), and boards on the
    parapet faces a rider sees from the hills."""
    zb, zf = -D / 2 - 0.3, D / 2 + 0.3
    rise = (zf - zb) * 0.15

    def ry(z):
        return EAVE + rise * (z - zb) / (zf - zb) + 0.035
    inner = W / 2 + 0.1                    # inner faces of the returns (4.6)
    n = 14
    for i in range(n):
        x0 = -inner + i * 2 * inner / n
        x1 = x0 + 2 * inner / n
        profile_x('roof', (1, 1, 1), [(ry(zb), zb - 0.08), (ry(zb) + 0.02, zb - 0.08), (ry(zf - 0.4) + 0.02, zf - 0.4), (ry(zf - 0.4), zf - 0.4)], x0 + 0.004, x1 - 0.004)
        if i:
            profile_x('iron', (0.62, 0.62, 0.6), [(ry(zb) + 0.02, zb - 0.08), (ry(zb) + 0.06, zb - 0.08), (ry(zf - 0.4) + 0.06, zf - 0.4), (ry(zf - 0.4) + 0.02, zf - 0.4)], x0 - 0.012, x0 + 0.012)
    box('paint', CREAM, -inner - 0.4, inner + 0.4, EAVE - 0.22, ry(zb) + 0.02, zb - 0.12, zb - 0.06)   # back fascia
    # Flashing up the returns and the back of the false front.
    for s in (-1, 1):
        profile_x('iron', (0.5, 0.5, 0.48), [(ry(zb), zb), (ry(zb) + 0.22, zb), (ry(zf - 0.4) + 0.22, zf - 0.4), (ry(zf - 0.4), zf - 0.4)],
                  min(s * inner, s * (inner - 0.04)), max(s * inner, s * (inner - 0.04)))
    box('iron', (0.5, 0.5, 0.48), -inner, inner, ry(zf - 0.4), ry(zf - 0.4) + 0.24, FRONT - 0.05, FRONT - 0.01)
    # Boards on the parapet's inner faces, above the tin.
    for s in (-1, 1):
        x = s * (inner - 0.04)
        k = int((zf - zb) / 0.3)
        for i in range(k):
            z0 = zb + i * (zf - zb) / k
            z1 = z0 + (zf - zb) / k
            box('paint', [BODY_DK, BODY][i % 2], min(x, x - s * 0.04), max(x, x - s * 0.04), ry(z1) + 0.1, FF_TOP, z0 + 0.003, z1 - 0.003)
        # End cap over the return's back edge.
        box('paint', CREAM, min(s * (inner - 0.08), s * (SIDE + 0.1)), max(s * (inner - 0.08), s * (SIDE + 0.1)), 0.0, FF_TOP + 0.16, zb - 0.06, zb)
    k = int(2 * inner / 0.3)
    for i in range(k):
        x0 = -inner + i * 2 * inner / k
        box('paint', [BODY_DK, BODY][i % 2], x0 + 0.003, x0 + 2 * inner / k - 0.003, ry(FRONT - 0.2) + 0.1, FF_TOP, FRONT - 0.1, FRONT - 0.06)


# ---------------------------------------------------------------- build / export
def ensure_materials():
    mats = {}
    for name, c in MATERIALS.items():
        m = bpy.data.materials.get('Saloon_' + name) or bpy.data.materials.new('Saloon_' + name)
        m.diffuse_color = (*c, 1)
        m.use_nodes = True
        bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        attr = next((n for n in m.node_tree.nodes if n.type == 'ATTRIBUTE'), None) or m.node_tree.nodes.new('ShaderNodeAttribute')
        attr.attribute_name = 'Col'
        mix = next((n for n in m.node_tree.nodes if n.type == 'MIX'), None)
        if not mix:
            mix = m.node_tree.nodes.new('ShaderNodeMix')
            mix.data_type, mix.blend_type = 'RGBA', 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            m.node_tree.links.new(attr.outputs['Color'], mix.inputs['B'])
            m.node_tree.links.new(mix.outputs['Result'], bsdf.inputs['Base Color'])
        mix.inputs['A'].default_value = (*c, 1) if name not in ('paint',) else (1, 1, 1, 1)
        bsdf.inputs['Roughness'].default_value = 0.2 if name in ('glass', 'pane') else 0.85
        mats[name] = m
    return mats


def load_context():
    """The kit shell and street as a grey alignment reference (never exported)."""
    path = Path('/private/tmp/claude-501/saloon-context.json')
    if not path.exists():
        return
    grey = bpy.data.materials.get('Saloon_context') or bpy.data.materials.new('Saloon_context')
    grey.diffuse_color = (0.5, 0.5, 0.5, 1)
    for k, m in enumerate(json.loads(path.read_text())):
        p = m['position']
        verts = [point(p[i:i + 3]) for i in range(0, len(p), 3)]
        tris = [tuple(m['index'][i:i + 3]) for i in range(0, len(m['index']), 3)]
        mesh = bpy.data.meshes.new('kit')
        mesh.from_pydata(verts, [], tris)
        obj = bpy.data.objects.new('context %s %d' % (m['name'], k), mesh)
        obj['saloon_context'] = True
        obj.data.materials.append(grey)
        bpy.context.scene.collection.objects.link(obj)


def build():
    scene = bpy.data.scenes.get(SCENE)
    if scene is None:
        scene = bpy.data.scenes.new(SCENE)
        bpy.context.window.scene = scene
        load_context()
    bpy.context.window.scene = scene
    for o in list(scene.objects):
        if o.get('saloon'):
            bpy.data.objects.remove(o, do_unlink=True)
    ACC.clear()
    storefront()
    gallery()
    upper()
    false_front()
    sides_and_back()
    mats = ensure_materials()
    total = 0
    for name, a in ACC.items():
        mesh = bpy.data.meshes.new('Saloon ' + name)
        mesh.from_pydata([point(v) for v in a.verts], [], a.faces)
        col = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        for poly, tint in zip(mesh.polygons, a.tints):
            for li in poly.loop_indices:
                col.data[li].color = (*tint, 1)
        mesh.materials.append(mats[name])
        obj = bpy.data.objects.new('Saloon ' + name, mesh)
        obj['saloon'] = True
        scene.collection.objects.link(obj)
        total += len(a.faces)
    print('Saloon:', total, 'faces in', len(ACC), 'materials')


def export():
    scene = bpy.data.scenes[SCENE]
    batches = {}
    for o in scene.objects:
        if o.type != 'MESH' or not o.get('saloon'):
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
    target = ROOT / 'src/models/saloon.json'
    target.write_text(json.dumps({'generator': 'scripts/blender-saloon/saloon.py', 'units': {'position': 0.001, 'color': 0.01},
                                  'batches': batches}, separators=(',', ':')))
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'saloon.blend'))
    print('Exported', sum(len(b['index']) // 3 for b in batches.values()), 'triangles;', len(batches), 'batches;',
          round(target.stat().st_size / 1e6, 2), 'MB')
