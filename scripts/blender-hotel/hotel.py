"""Blender-authored exterior detail for Silver Creek's hotel.

The gameplay shell stays in ``src/landmarks.js``: it owns the 11 x 9 m
footprint, the gable roof, the apertures, the interior and the collisions.
This script owns the visual form in the shell's lot-local frame:

    x = across the facade, y = up from the lot floor, +z = toward the street

The hotel is the largest mass on the row (812 m3, topping out at 10.67 m) and
its front wall shipped with nothing in it but a door: a blank 11 x 8.2 m
board, the most conspicuous empty elevation in the town. The answer is the
form the row is missing -- a full-width two-storey gallery -- which puts real
structure, shadow and depth in front of that wall instead of decorating it.

Run through the Blender MCP bridge:

    ns = runpy.run_path('<repo>/scripts/blender-hotel/hotel.py')
    ns['build'](); ns['preview'](); ns['export']()

Every entry point resolves its own scene rather than trusting
``bpy.context.scene``, so this can run while another authoring script owns the
window's active scene.
"""

import bpy
import json
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SCENE = 'High Country \u2022 Hotel'
TAG = 'hotel_building'
OUT = Path('/tmp/hc_hotel')

# Must track the `hotel` lot in src/landmarks.js.
W, D, EAVE = 11.0, 9.0, 8.2
FRONT = D / 2 + 0.11
BACK = -D / 2 - 0.11
SIDE = W / 2 + 0.11

# Measured kit geometry, not guessed. The hotel takes a GABLE, not a false
# front, and `gableRoof` picks its ridge axis with `w >= d`: 11 >= 9, so the
# ridge runs PARALLEL to the facade at z = 0 and the street sees a roof plane
# sloping up and away, not a gable triangle. The triangles are on the side
# walls. Overhang is 0.45, so the roof reaches z 4.95 / |x| 5.95 and peaks at
# 10.675; the foundation juts to z 4.70 / |x| 5.70 below y = 0. Trim drawn
# past any of these is inside solid kit geometry and simply does not render --
# the same trap that cost the store a whole pass.
RIDGE_Y = EAVE + ((D + 0.9) / 2) * 0.5
ROOF_Z = D / 2 + 0.45
ROOF_X = W / 2 + 0.45
FOUND_Z = D / 2 + 0.20
FOUND_X = W / 2 + 0.20


def roof_y(z):
    """Height of the kit's front roof plane at a given +z, for dormers."""
    return RIDGE_Y - 0.5 * abs(z)


# The gallery. Ground headroom, then the first-floor deck, then the upper
# storey and its own shed roof.
DECK_Y = 3.44          # walking plane of the upper gallery (= HOTEL.UPPER)
DECK_T = 0.24          # deck and joists; underside = HOTEL.CEIL (3.20)
UPPER_Y = 6.70         # gallery roof edge: clears the upper casings, under the frieze
PROJ = 2.55            # how far the gallery stands off the facade
POST_Z = FRONT + PROJ
RAIL_Y = 1.02          # gallery rail height above the deck

DOOR_HALF = 0.46

# The openings come from the kit, via layout.json (export-layout.mjs), never
# from constants here. A first version hard-coded its window positions and drew
# clapboard in full-width courses straight across every one of them: measured
# with the saloon's ray test, the entrance and all six windows were 0% clear --
# the door read as closed and every pane was covered by siding, so from inside
# a window looked out onto the back of a board.
LAYOUT = json.loads((HERE / 'layout.json').read_text())
HOTEL = LAYOUT['hotel']


def _exterior_openings(sign):
    """Openings of the kit's exterior wall at z = sign * D/2, in LOT x.

    Walls are picked by position: the layout's `interior` flag is unreliable
    because the interior shell is mated onto the same group. The back wall's
    frame faces -z, so its opening x runs opposite the lot's.
    """
    for wall in LAYOUT['walls']:
        if abs(wall['matrix'][14] - sign * D / 2) < 1e-3 and wall['openings']:
            return [dict(o, x=o['x'] if sign > 0 else -o['x']) for o in wall['openings']]
    return []


FRONT_OPENINGS = _exterior_openings(1)
BACK_OPENINGS = _exterior_openings(-1)
WINDOWS_FRONT = [o for o in FRONT_OPENINGS if o['fromFloor'] > 0 and o.get('class') != 'door']
GALLERY_DOOR = next(o for o in FRONT_OPENINGS if o.get('class') == 'door')


def runs(a, b, cuts):
    """The interval [a, b] with every (lo, hi) in `cuts` removed."""
    out, cur = [], a
    for lo, hi in sorted(cuts):
        if hi <= cur or lo >= b:
            continue
        if lo > cur:
            out.append((cur, min(lo, b)))
        cur = max(cur, hi)
    if cur < b:
        out.append((cur, b))
    return [(x0, x1) for x0, x1 in out if x1 - x0 > 1e-3]


def bands(y0, y1, openings):
    """Split [y0, y1] at every opening sill and head that falls inside it, so
    each sub-band is either wholly beside an opening or wholly clear of it.
    Cutting a whole siding course would otherwise leave a sliver of siding
    inside the hole wherever a course straddles a sill."""
    edges = {y0, y1}
    for o in openings:
        for e in (o['fromFloor'], o['fromFloor'] + o['h']):
            if y0 < e < y1:
                edges.add(e)
    e = sorted(edges)
    return list(zip(e, e[1:]))


def cuts_at(openings, ya, yb, pad=0.02):
    """x intervals an opening occupies across the band [ya, yb]."""
    return [(o['x'] - o['w'] / 2 - pad, o['x'] + o['w'] / 2 + pad)
            for o in openings
            if o['fromFloor'] < yb - 1e-6 and o['fromFloor'] + o['h'] > ya + 1e-6]

MATERIALS = {
    'paint': (0.86, 0.85, 0.83),
    'wood': (0.90, 0.83, 0.72),
    'stone': (0.86, 0.83, 0.77),
    'roof': (0.80, 0.80, 0.76),
    'iron': (0.62, 0.64, 0.63),
    'glass': (0.70, 0.78, 0.76),
}

# The runtime multiplies each batch's texture by the per-face Col tint and both
# are below white, so the tints carry the whole paint scheme and the bases stay
# neutral. See src/buildings/hotel.js.
CREAM = (0.98, 0.94, 0.80)
CREAM_DIM = (0.88, 0.83, 0.68)
OCHRE = (0.86, 0.66, 0.34)
OCHRE_DARK = (0.62, 0.45, 0.22)
BODY = (0.82, 0.68, 0.46)
BODY_DARK = (0.70, 0.57, 0.37)
WOOD = (0.44, 0.26, 0.12)
WOOD_LIGHT = (0.66, 0.46, 0.24)
WOOD_GREY = (0.56, 0.51, 0.43)
BOARD = (0.44, 0.40, 0.34)
TIN = (0.78, 0.79, 0.74)
TIN_DARK = (0.54, 0.56, 0.54)
IRON = (0.13, 0.15, 0.15)
GLASS = (0.30, 0.42, 0.40)
GOLD = (1.00, 0.82, 0.32)
GREEN = (0.24, 0.40, 0.30)
RED = (0.62, 0.22, 0.18)
BRICK = (0.60, 0.30, 0.22)
STONE = (0.68, 0.64, 0.54)


def point(v):
    """Game XYZ -> Blender XYZ (Blender Z-up, game Y-up)."""
    return Vector((v[0], -v[2], v[1]))


class Acc:
    def __init__(self):
        self.verts = []
        self.faces = []
        self.tints = []

    def face(self, pts, tint):
        base = len(self.verts)
        self.verts.extend(pts)
        self.faces.append(tuple(range(base, base + len(pts))))
        self.tints.append(tint)


ACC = {}


def acc(material):
    return ACC.setdefault(material, Acc())


def solid(material, tint, loop_a, loop_b):
    """Closed prism between two matching game-coordinate vertex loops."""
    a = acc(material)
    pts = [Vector(p) for p in loop_a + loop_b]
    centre = sum(pts, Vector()) / len(pts)
    n = len(loop_a)

    def add(indices):
        poly = [pts[i] for i in indices]
        face_centre = sum(poly, Vector()) / len(poly)
        normal = (poly[1] - poly[0]).cross(poly[2] - poly[0])
        if normal.length < 1e-12 and len(poly) > 3:
            normal = (poly[2] - poly[1]).cross(poly[3] - poly[1])
        if normal.dot(face_centre - centre) < 0:
            poly.reverse()
        a.face([tuple(p) for p in poly], tint)

    add(list(range(n)))
    add(list(range(n, 2 * n)))
    for i in range(n):
        j = (i + 1) % n
        add([i, j, j + n, i + n])


def box(material, tint, x0, x1, y0, y1, z0, z1):
    if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
        return
    solid(material, tint,
          [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)],
          [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)])


def profile_z(material, tint, points_xy, z0, z1):
    solid(material, tint,
          [(x, y, z0) for x, y in points_xy],
          [(x, y, z1) for x, y in points_xy])


def profile_x(material, tint, points_yz, x0, x1):
    solid(material, tint,
          [(x0, y, z) for y, z in points_yz],
          [(x1, y, z) for y, z in points_yz])


def cylinder(material, tint, cx, cy, cz, radius, height, segments=12, axis='y'):
    pts = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        pts.append((radius * math.cos(a), radius * math.sin(a)))
    if axis == 'y':
        solid(material, tint,
              [(cx + u, cy, cz + v) for u, v in pts],
              [(cx + u, cy + height, cz + v) for u, v in pts])
    else:
        solid(material, tint,
              [(cx, cy + u, cz + v) for u, v in pts],
              [(cx + height, cy + u, cz + v) for u, v in pts])


def text(scene, material, tint, body, x, y, z, size, depth, spacing=1.0, plane='front'):
    """Bake raised Blender font lettering into the game-space accumulator.

    ``plane`` chooses the wall the glyphs face.  ``front`` lays them in the
    facade plane extruding toward the street; ``west``/``east`` lay them in a
    side-wall plane, where the glyph's own x runs along -z/+z and the extrusion
    runs out through x.  Rewriting baked faces afterwards to fake a side wall
    is what this parameter replaces.
    """
    curve = bpy.data.curves.new('store lettering', 'FONT')
    curve.body = body
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.size = size
    curve.space_character = spacing
    curve.extrude = depth / 2
    curve.resolution_u = 3
    obj = bpy.data.objects.new('temporary store lettering', curve)
    scene.collection.objects.link(obj)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = obj.evaluated_get(depsgraph).to_mesh()
    dest = acc(material)

    if plane == 'front':
        def place(co):
            return (x + co.x, y + co.y, z + depth / 2 + co.z)
    elif plane == 'west':
        # Facing -x: glyph x runs toward +z so the text reads left-to-right
        # from outside, and the extrusion pushes out through -x.
        def place(co):
            return (x - depth / 2 - co.z, y + co.y, z + co.x)
    elif plane == 'east':
        def place(co):
            return (x + depth / 2 + co.z, y + co.y, z - co.x)
    else:
        raise ValueError('unknown lettering plane ' + repr(plane))

    for poly in mesh.polygons:
        dest.face([place(mesh.vertices[i].co) for i in poly.vertices], tint)
    obj.evaluated_get(depsgraph).to_mesh_clear()
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.curves.remove(curve)



# ---------------------------------------------------------------- elevation

def sash_window(x, y0, width, height, sill=True):
    """A cased two-over-two sash window standing proud of the wall.

    No authored pane. The kit already glazes the opening with two half-density
    panes (facade wall and interior shell) that read as one; a third pane here
    only muddied the view and, being solid, blocked it in the ray test.
    """
    x0, x1 = x - width / 2, x + width / 2
    y1 = y0 + height
    z = FRONT + 0.04
    # Meeting rail and the two vertical muntins.
    box('paint', CREAM, x0, x1, (y0 + y1) / 2 - 0.035, (y0 + y1) / 2 + 0.035, z, z + 0.06)
    box('paint', CREAM, x - 0.03, x + 0.03, y0, y1, z, z + 0.055)
    # Casing: stiles, head and a projecting sill.
    for xx in (x0 - 0.085, x1 + 0.085):
        box('paint', CREAM, xx - 0.085, xx + 0.085, y0 - 0.06, y1 + 0.10, FRONT, z + 0.15)
    box('paint', CREAM, x0 - 0.20, x1 + 0.20, y1 + 0.10, y1 + 0.24, FRONT, z + 0.20)
    box('paint', CREAM_DIM, x0 - 0.22, x1 + 0.22, y1 + 0.24, y1 + 0.30, FRONT, z + 0.24)
    if sill:
        box('paint', CREAM_DIM, x0 - 0.20, x1 + 0.20, y0 - 0.14, y0 - 0.04, FRONT, z + 0.22)


def back_window(x, y0, width, height):
    """A cased window on the back wall, projecting toward -z. No authored pane:
    the kit glazes the opening. `x` is in LOT coordinates."""
    x0, x1 = x - width / 2, x + width / 2
    y1 = y0 + height
    z = BACK - 0.04
    box('paint', CREAM, x - 0.03, x + 0.03, y0, y1, z - 0.055, z)
    box('paint', CREAM, x0, x1, (y0 + y1) / 2 - 0.035, (y0 + y1) / 2 + 0.035, z - 0.06, z)
    for xx in (x0 - 0.085, x1 + 0.085):
        box('paint', CREAM, xx - 0.085, xx + 0.085, y0 - 0.06, y1 + 0.10, z - 0.15, BACK)
    box('paint', CREAM, x0 - 0.20, x1 + 0.20, y1 + 0.10, y1 + 0.24, z - 0.20, BACK)
    box('paint', CREAM_DIM, x0 - 0.20, x1 + 0.20, y0 - 0.14, y0 - 0.04, z - 0.22, BACK)


def clapboard(y0, y1, z0, openings, course=0.20):
    """Lapped siding cut around the kit's openings.

    Each course stands proud of the one above it, so the wall carries a real
    shadow line. Courses are split at every sill and head inside them and then
    broken into runs beside each opening, so siding never enters a hole.
    """
    y = y0
    i = 0
    while y < y1 - 1e-4:
        top = min(y + course, y1)
        tint = BODY if i % 2 else BODY_DARK
        for ya, yb in bands(y, top, openings):
            # Keep the lap: interpolate the course's proud face across the band.
            fa = 0.075 - 0.04 * (ya - y) / (top - y)
            fb = 0.075 - 0.04 * (yb - y) / (top - y)
            for xa, xb in runs(-W / 2, W / 2, cuts_at(openings, ya, yb)):
                solid('paint', tint,
                      [(xa, ya, z0), (xb, ya, z0), (xb, yb, z0), (xa, yb, z0)],
                      [(xa, ya, z0 + fa), (xb, ya, z0 + fa),
                       (xb, yb, z0 + fb), (xa, yb, z0 + fb)])
        y = top
        i += 1


def elevation(scene):
    clapboard(0.0, EAVE - 0.55, FRONT, FRONT_OPENINGS)

    # Water table at the base and a stone plinth course, broken at the door.
    for xa, xb in runs(-W / 2, W / 2, cuts_at(FRONT_OPENINGS, 0.30, 0.44)):
        box('paint', CREAM_DIM, xa, xb, 0.30, 0.44, FRONT, FRONT + 0.14)
    for xa, xb in runs(-W / 2, W / 2, cuts_at(FRONT_OPENINGS, 0.0, 0.30)):
        box('stone', STONE, xa, xb, 0.0, 0.30, FRONT, FRONT + 0.10)

    # Entry: a FRAME round the kit's doorway -- two stiles and a head -- with a
    # fanlight over it. It used to be a solid casing slab plus a painted door
    # panel spanning the whole opening, so the entrance rendered as shut.
    dh = DOOR_HALF + 0.02
    box('paint', CREAM, -(dh + 0.26), -dh, 0.0, 2.68, FRONT, FRONT + 0.13)
    box('paint', CREAM, dh, dh + 0.26, 0.0, 2.68, FRONT, FRONT + 0.13)
    box('paint', CREAM, -dh - 0.26, dh + 0.26, 2.12, 2.18, FRONT, FRONT + 0.13)
    # Fanlight above the kit door head (2.10): solid wall behind it, not a hole.
    box('glass', GLASS, -DOOR_HALF, DOOR_HALF, 2.20, 2.56, FRONT + 0.02, FRONT + 0.05)
    for i in range(5):
        a = math.pi * (i + 0.5) / 5
        box('paint', CREAM, math.cos(a) * DOOR_HALF - 0.025, math.cos(a) * DOOR_HALF + 0.025,
            2.20, 2.56, FRONT + 0.05, FRONT + 0.10)
    box('paint', CREAM_DIM, -dh - 0.28, dh + 0.28, 2.56, 2.68, FRONT, FRONT + 0.22)

    for o in WINDOWS_FRONT:
        sash_window(o['x'], o['fromFloor'], o['w'], o['h'])

    # The gallery door: a frame round the kit opening, level with the deck.
    g = GALLERY_DOOR
    gh = g['w'] / 2 + 0.02
    gy0, gy1 = g['fromFloor'], g['fromFloor'] + g['h']
    box('paint', CREAM, -(gh + 0.20), -gh, gy0, gy1 + 0.12, FRONT, FRONT + 0.13)
    box('paint', CREAM, gh, gh + 0.20, gy0, gy1 + 0.12, FRONT, FRONT + 0.13)
    box('paint', CREAM, -(gh + 0.20), gh + 0.20, gy1 + 0.02, gy1 + 0.12, FRONT, FRONT + 0.13)
    box('paint', CREAM_DIM, -(gh + 0.24), gh + 0.24, gy1 + 0.12, gy1 + 0.20, FRONT, FRONT + 0.18)

    # Corner boards, tying the elevation to the side walls.
    for sx in (-1, 1):
        box('paint', CREAM, sx * (W / 2 - 0.13) - 0.13, sx * (W / 2 - 0.13) + 0.13,
            0.0, EAVE - 0.40, FRONT, FRONT + 0.16)

    # Frieze and cornice under the eave. The kit's soffit closes the gap from
    # the wall out to the overhang at z 4.95, so this has to stay inside it.
    box('paint', CREAM, -W / 2, W / 2, EAVE - 0.55, EAVE - 0.16, FRONT, FRONT + 0.15)
    box('paint', CREAM_DIM, -W / 2 - 0.06, W / 2 + 0.06, EAVE - 0.16, EAVE - 0.02,
        FRONT, ROOF_Z - 0.08)
    brackets = 11
    for i in range(brackets):
        bx = -W / 2 + 0.44 + i * (W - 0.88) / (brackets - 1)
        solid('paint', CREAM,
              [(bx - 0.05, EAVE - 0.16, FRONT), (bx + 0.05, EAVE - 0.16, FRONT),
               (bx + 0.05, EAVE - 0.68, FRONT), (bx - 0.05, EAVE - 0.68, FRONT)],
              [(bx - 0.05, EAVE - 0.16, ROOF_Z - 0.12), (bx + 0.05, EAVE - 0.16, ROOF_Z - 0.12),
               (bx + 0.05, EAVE - 0.34, ROOF_Z - 0.12), (bx - 0.05, EAVE - 0.34, ROOF_Z - 0.12)])


# ------------------------------------------------------------------ gallery

def gallery(scene):
    """The two-storey veranda: the whole point of the elevation."""
    x0, x1 = -W / 2 + 0.10, W / 2 - 0.10
    zf = POST_Z

    # ---- first-floor deck, carried on a beam and joists
    box('wood', WOOD_GREY, x0, x1, DECK_Y - DECK_T, DECK_Y, FRONT, zf + 0.16)
    n = 26
    for i in range(n):
        jx = x0 + 0.2 + i * (x1 - x0 - 0.4) / n
        box('wood', BOARD, jx - 0.045, jx + 0.045, DECK_Y - DECK_T - 0.10, DECK_Y - DECK_T,
            FRONT, zf + 0.16)
    # Fascia board across the front of the deck, which is where the name goes.
    box('paint', GREEN, x0, x1, DECK_Y - DECK_T - 0.44, DECK_Y - DECK_T,
        zf + 0.16, zf + 0.22)
    text(scene, 'paint', GOLD, 'SILVER CREEK HOTEL', 0.0,
         DECK_Y - DECK_T - 0.21, zf + 0.22, 0.31, 0.024, 1.06)

    # ---- posts, ground and upper storey
    posts = 6
    for i in range(posts):
        px = x0 + 0.34 + i * (x1 - x0 - 0.68) / (posts - 1)
        # Ground storey: a square post with a chamfered cap and a plinth.
        box('paint', CREAM, px - 0.115, px + 0.115, 0.0, DECK_Y - DECK_T - 0.44, zf - 0.115, zf + 0.115)
        box('paint', CREAM_DIM, px - 0.145, px + 0.145, 0.0, 0.24, zf - 0.145, zf + 0.145)
        box('paint', CREAM_DIM, px - 0.14, px + 0.14, DECK_Y - DECK_T - 0.58,
            DECK_Y - DECK_T - 0.44, zf - 0.14, zf + 0.14)
        # Sawn brackets at the head, the detail that makes a veranda read.
        for sx in (-1, 1):
            solid('paint', CREAM,
                  [(px + sx * 0.085, DECK_Y - DECK_T - 0.46, zf - 0.05),
                   (px + sx * 0.085, DECK_Y - DECK_T - 0.46, zf + 0.05),
                   (px + sx * 0.085, DECK_Y - DECK_T - 0.92, zf + 0.05),
                   (px + sx * 0.085, DECK_Y - DECK_T - 0.92, zf - 0.05)],
                  [(px + sx * 0.46, DECK_Y - DECK_T - 0.46, zf - 0.05),
                   (px + sx * 0.46, DECK_Y - DECK_T - 0.46, zf + 0.05),
                   (px + sx * 0.46, DECK_Y - DECK_T - 0.60, zf + 0.05),
                   (px + sx * 0.46, DECK_Y - DECK_T - 0.60, zf - 0.05)])
        # Upper storey: a turned post, thinner, on the deck.
        box('paint', CREAM, px - 0.07, px + 0.07, DECK_Y, UPPER_Y, zf - 0.07, zf + 0.07)
        for by in (DECK_Y + 0.10, UPPER_Y - 0.16):
            box('paint', CREAM_DIM, px - 0.10, px + 0.10, by, by + 0.10, zf - 0.10, zf + 0.10)

    # ---- gallery rail: top rail, bottom rail, turned balusters
    for yy, th in ((DECK_Y + RAIL_Y - 0.08, 0.08), (DECK_Y + 0.10, 0.06)):
        box('paint', CREAM, x0, x1, yy, yy + th, zf - 0.06, zf + 0.06)
    bal = 54
    for i in range(bal):
        bx = x0 + 0.12 + i * (x1 - x0 - 0.24) / bal
        box('paint', CREAM_DIM, bx - 0.028, bx + 0.028, DECK_Y + 0.16, DECK_Y + RAIL_Y - 0.08,
            zf - 0.035, zf + 0.035)
    # Return the rail to the wall at both ends, so the gallery is enclosed.
    for sx in (-1, 1):
        ex = x1 if sx > 0 else x0
        for yy, th in ((DECK_Y + RAIL_Y - 0.08, 0.08), (DECK_Y + 0.10, 0.06)):
            box('paint', CREAM, ex - 0.06, ex + 0.06, yy, yy + th, FRONT, zf)
        for i in range(9):
            bz = FRONT + 0.18 + i * (PROJ - 0.36) / 9
            box('paint', CREAM_DIM, ex - 0.028, ex + 0.028, DECK_Y + 0.16,
                DECK_Y + RAIL_Y - 0.08, bz - 0.035, bz + 0.035)

    # ---- benches and a trunk under the gallery, so the ground storey is not
    # just an empty colonnade
    for bx in (-3.5, 3.5):
        bz = FRONT + 0.72
        box('wood', WOOD_LIGHT, bx - 0.78, bx + 0.78, 0.44, 0.50, bz - 0.22, bz + 0.22)
        box('wood', WOOD_LIGHT, bx - 0.78, bx + 0.78, 0.50, 0.94, bz - 0.24, bz - 0.18)
        for lx in (bx - 0.68, bx + 0.68):
            box('wood', WOOD, lx - 0.045, lx + 0.045, 0.0, 0.44, bz - 0.18, bz - 0.09)
            box('wood', WOOD, lx - 0.045, lx + 0.045, 0.0, 0.44, bz + 0.11, bz + 0.20)
    tz = FRONT + 0.62
    box('wood', WOOD, 1.30, 2.06, 0.0, 0.46, tz - 0.26, tz + 0.26)
    box('wood', BOARD, 1.30, 2.06, 0.46, 0.54, tz - 0.28, tz + 0.28)
    for by in (0.12, 0.36):
        box('iron', IRON, 1.28, 2.08, by - 0.025, by + 0.025, tz - 0.28, tz + 0.28)

    # ---- gallery roof: a shed, sloping out and down over the upper storey
    y_wall, y_edge = UPPER_Y + 0.42, UPPER_Y
    z_edge = zf + 0.55
    solid('roof', TIN,
          [(x0 - 0.16, y_wall, FRONT), (x1 + 0.16, y_wall, FRONT),
           (x1 + 0.16, y_edge, z_edge), (x0 - 0.16, y_edge, z_edge)],
          [(x0 - 0.16, y_wall - 0.07, FRONT), (x1 + 0.16, y_wall - 0.07, FRONT),
           (x1 + 0.16, y_edge - 0.07, z_edge), (x0 - 0.16, y_edge - 0.07, z_edge)])
    # Standing seams, so the tin reads as tin at street distance.
    for i in range(15):
        sx = x0 - 0.16 + 0.2 + i * (x1 - x0 + 0.32 - 0.4) / 14
        solid('roof', TIN_DARK,
              [(sx - 0.022, y_wall + 0.03, FRONT), (sx + 0.022, y_wall + 0.03, FRONT),
               (sx + 0.022, y_edge + 0.03, z_edge), (sx - 0.022, y_edge + 0.03, z_edge)],
              [(sx - 0.022, y_wall, FRONT), (sx + 0.022, y_wall, FRONT),
               (sx + 0.022, y_edge, z_edge), (sx - 0.022, y_edge, z_edge)])
    box('paint', CREAM, x0 - 0.18, x1 + 0.18, y_edge - 0.22, y_edge - 0.05,
        z_edge - 0.03, z_edge + 0.07)


# -------------------------------------------------------------------- roof

def roofscape():
    """Chimneys, ridge cap and two dormers on the kit's front roof plane."""
    # Ridge cap along the whole ridge.
    box('roof', TIN_DARK, -ROOF_X, ROOF_X, RIDGE_Y - 0.02, RIDGE_Y + 0.10, -0.16, 0.16)

    # Two brick stacks, straddling the ridge where a chimney belongs.
    for cx in (-3.4, 3.4):
        box('stone', BRICK, cx - 0.42, cx + 0.42, EAVE + 1.30, RIDGE_Y + 1.35, -0.46, 0.46)
        box('stone', BRICK, cx - 0.50, cx + 0.50, RIDGE_Y + 1.35, RIDGE_Y + 1.52, -0.54, 0.54)
        for i in range(2):
            ox = cx - 0.18 + i * 0.36
            cylinder('stone', BRICK, ox, RIDGE_Y + 1.52, 0.0, 0.085, 0.20)

    # Dormers: the roof slopes toward the street, so these read from the road
    # and break up what is otherwise one unmodulated plane.
    for dx in (-1.7, 1.7):
        # Far enough DOWN the slope that the dormer sits on the roof plane.
        # At dz = 2.55 its head rose past the ridge at 10.675 and the pair read
        # as cupolas straddling the ridge rather than dormers.
        dz = 3.55
        base = roof_y(dz)
        w2, h = 0.66, 1.34
        # Cheeks following the slope, front wall, and a little gable over it.
        for sx in (-1, 1):
            profile_x('paint', BODY,
                      [(base - 0.10, dz + 0.72), (base + h, dz + 0.72),
                       (base + h, dz - 0.62), (base - 0.10, dz - 0.10)],
                      dx + sx * w2 - 0.035, dx + sx * w2 + 0.035)
        box('paint', BODY, dx - w2, dx + w2, base - 0.10, base + h, dz + 0.68, dz + 0.72)
        box('glass', GLASS, dx - w2 + 0.16, dx + w2 - 0.16, base + 0.22, base + h - 0.22,
            dz + 0.72, dz + 0.745)
        box('paint', CREAM, dx - 0.028, dx + 0.028, base + 0.22, base + h - 0.22,
            dz + 0.745, dz + 0.785)
        box('paint', CREAM, dx - w2 - 0.07, dx + w2 + 0.07, base + h - 0.22, base + h - 0.08,
            dz + 0.66, dz + 0.82)
        profile_z('roof', TIN,
                  [(dx - w2 - 0.16, base + h - 0.06), (dx, base + h + 0.40),
                   (dx + w2 + 0.16, base + h - 0.06)],
                  dz - 0.30, dz + 0.86)


# ---------------------------------------------------------- sides and back

def sides_and_back(scene):
    """Gable-end treatment, a fire stair, and the back elevation.

    The gable triangles are on the SIDE walls here, not the street front, so
    the verge boards and the loft vent go there.
    """
    for sx in (-1, 1):
        px = sx * SIDE
        face = (px, px + 0.03) if sx > 0 else (px - 0.03, px)
        lift = 0.04 if sx > 0 else -0.04

        # Clapboard on the return, and the gable triangle above the eave.
        n = 30
        for i in range(n):
            y = 0.30 + i * (EAVE - 0.50) / n
            box('paint', BODY if i % 2 else BODY_DARK, face[0], face[1],
                y, y + (EAVE - 0.50) / n - 0.035, -D / 2, D / 2)
        # Gable field: a triangle from the eave up to the ridge.
        profile_x('paint', BODY, [(EAVE, -D / 2), (EAVE, D / 2), (RIDGE_Y, 0.0)],
                  px + lift - 0.02, px + lift + 0.02)
        # Verge boards down both slopes, and a louvred vent in the gable.
        for zs in (-1, 1):
            solid('paint', CREAM,
                  [(px + lift - 0.05, EAVE, zs * (D / 2 + 0.16)),
                   (px + lift + 0.05, EAVE, zs * (D / 2 + 0.16)),
                   (px + lift + 0.05, EAVE - 0.22, zs * (D / 2 + 0.16)),
                   (px + lift - 0.05, EAVE - 0.22, zs * (D / 2 + 0.16))],
                  [(px + lift - 0.05, RIDGE_Y + 0.08, 0.0), (px + lift + 0.05, RIDGE_Y + 0.08, 0.0),
                   (px + lift + 0.05, RIDGE_Y - 0.14, 0.0), (px + lift - 0.05, RIDGE_Y - 0.14, 0.0)])
        vy = EAVE + 0.62
        box('paint', CREAM, px + lift - 0.03, px + lift + 0.05, vy - 0.40, vy + 0.40, -0.62, 0.62)
        for i in range(5):
            box('wood', BOARD, px + lift + 0.02, px + lift + 0.07,
                vy - 0.30 + i * 0.15, vy - 0.30 + i * 0.15 + 0.075, -0.50, 0.50)
        # Corner boards.
        for zs in (-1, 1):
            box('paint', CREAM, min(px + lift, px) - 0.05, max(px + lift, px) + 0.05,
                0.0, EAVE - 0.40, zs * (D / 2) - 0.13, zs * (D / 2) + 0.13)
        box('stone', STONE, min(px, px + lift) - 0.06, max(px, px + lift) + 0.06,
            0.0, 0.30, -D / 2, D / 2)

    # Back: board-and-batten cut round the five back windows (the rooms and the
    # parlour), each window cased, and a stovepipe. Like the front, the boards
    # and battens are the wall MINUS its openings, or they cover the glass.
    y0, y1 = 0.30, EAVE - 0.12
    for ya, yb in bands(y0, y1, BACK_OPENINGS):
        for xa, xb in runs(-W / 2, W / 2, cuts_at(BACK_OPENINGS, ya, yb)):
            box('paint', BOARD, xa, xb, ya, yb, BACK - 0.016, BACK)
    n = 30
    for i in range(n + 1):
        bx = -W / 2 + 0.18 + i * (W - 0.36) / n
        # A batten that crosses an opening is split above and below it.
        blocked = [(o['fromFloor'] - 0.02, o['fromFloor'] + o['h'] + 0.02)
                   for o in BACK_OPENINGS
                   if abs(bx - o['x']) < o['w'] / 2 + 0.06]
        for ya, yb in runs(y0, y1, blocked):
            box('paint', WOOD_GREY, bx - 0.042, bx + 0.042, ya, yb, BACK - 0.045, BACK)
    for o in BACK_OPENINGS:
        back_window(o['x'], o['fromFloor'], o['w'], o['h'])
    box('stone', STONE, -W / 2, W / 2, 0.0, 0.30, BACK - 0.07, BACK + 0.02)
    cylinder('iron', IRON, -W / 2 + 1.8, EAVE - 1.2, -D / 2 + 1.2, 0.11, 2.6)
    cylinder('iron', TIN, -W / 2 + 1.8, EAVE + 1.4, -D / 2 + 1.2, 0.15, 0.13)


# ------------------------------------------------------------------ plumbing

def ensure_materials():
    """Preview materials that reproduce the runtime shading model.

    The game multiplies each batch's texture by the per-face ``Col`` attribute
    from the JSON export.  A preview material with a flat Base Color therefore
    renders every tint identically -- the whole facade comes out one colour and
    the render cannot be used to judge the paint scheme at all.  Wiring Col
    through a multiply makes the Blender preview agree with the runtime.
    """
    mats = {}
    for name, base in MATERIALS.items():
        mat = bpy.data.materials.get('HC Hotel ' + name)
        if mat is None:
            mat = bpy.data.materials.new('HC Hotel ' + name)
        mat.use_nodes = True
        tree = mat.node_tree
        bsdf = tree.nodes.get('Principled BSDF')
        if bsdf is None:
            mats[name] = mat
            continue

        attr = tree.nodes.get('HC Col') or tree.nodes.new('ShaderNodeVertexColor')
        attr.name = attr.label = 'HC Col'
        attr.layer_name = 'Col'
        attr.location = (bsdf.location.x - 620, bsdf.location.y + 260)

        mix = tree.nodes.get('HC Tint') or tree.nodes.new('ShaderNodeMix')
        mix.name = mix.label = 'HC Tint'
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.location = (bsdf.location.x - 330, bsdf.location.y + 260)
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs[6].default_value = (*base, 1)
        tree.links.new(attr.outputs['Color'], mix.inputs[7])
        tree.links.new(mix.outputs[2], bsdf.inputs['Base Color'])

        bsdf.inputs['Base Color'].default_value = (*base, 1)
        bsdf.inputs['Roughness'].default_value = 0.16 if name == 'glass' else 0.85
        if name == 'iron':
            bsdf.inputs['Metallic'].default_value = 0.8
            bsdf.inputs['Roughness'].default_value = 0.4
        if name == 'glass':
            bsdf.inputs['Alpha'].default_value = 0.30
            try:
                mat.surface_render_method = 'DITHERED'
            except AttributeError:
                pass
        mats[name] = mat
    return mats


def _scene():
    scene = bpy.data.scenes.get(SCENE)
    if scene is None:
        scene = bpy.data.scenes.new(SCENE)
    return scene


def build():
    scene = _scene()
    for obj in list(scene.objects):
        if obj.get(TAG):
            bpy.data.objects.remove(obj, do_unlink=True)
    ACC.clear()
    elevation(scene)
    gallery(scene)
    roofscape()
    sides_and_back(scene)
    mats = ensure_materials()
    total = 0
    for name, batch in ACC.items():
        mesh = bpy.data.meshes.new('Hotel ' + name)
        mesh.from_pydata([point(v) for v in batch.verts], [], batch.faces)
        mesh.update()
        col = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        for poly, tint in zip(mesh.polygons, batch.tints):
            for li in poly.loop_indices:
                col.data[li].color = (*tint, 1)
        mesh.materials.append(mats[name])
        obj = bpy.data.objects.new('Hotel ' + name, mesh)
        obj[TAG] = True
        obj['material_batch'] = name
        scene.collection.objects.link(obj)
        total += len(batch.faces)
    scene['hotel_generator'] = 'scripts/blender-hotel/hotel.py'
    print('Hotel:', total, 'faces in', len(ACC), 'material batches')
    return scene


def _look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def preview(name='hotel', eye=(-12.0, 5.6, 14.5), look=(0.0, 3.2, 4.0), lens=52):
    """Render a 3/4 street view for the visual check."""
    scene = _scene()
    for obj in list(scene.objects):
        if obj.get('hotel_preview'):
            bpy.data.objects.remove(obj, do_unlink=True)
    OUT.mkdir(parents=True, exist_ok=True)
    mats = ensure_materials()

    mesh = bpy.data.meshes.new('Hotel preview ground')
    size = 48
    mesh.from_pydata([(-size, -size, 0), (size, -size, 0), (size, size, 0), (-size, size, 0)],
                     [], [(0, 1, 2, 3)])
    mesh.update()
    dirt = bpy.data.materials.get('HC Hotel preview dirt') or \
        bpy.data.materials.new('HC Hotel preview dirt')
    dirt.use_nodes = True
    dirt_bsdf = dirt.node_tree.nodes.get('Principled BSDF')
    if dirt_bsdf:
        dirt_bsdf.inputs['Base Color'].default_value = (0.40, 0.34, 0.26, 1)
        dirt_bsdf.inputs['Roughness'].default_value = 0.95
    mesh.materials.append(dirt)
    ground = bpy.data.objects.new('Hotel preview ground', mesh)
    ground.location = point((0, -0.04, 0))
    ground['hotel_preview'] = True
    scene.collection.objects.link(ground)

    # Stand-in for the kit shell and roof that landmarks.js builds around this
    # detail layer. Without them the preview looks straight through the
    # doorway and the windows to the hotel's OWN back wall, and -- worse --
    # renders trim that the real gable roof and foundation completely hide.
    # The store shipped a first pass where exactly that went unnoticed, so the
    # occluders are proxied here to scale and the preview can catch it.
    shell = bpy.data.meshes.new('Hotel preview shell')
    verts, faces = [], []

    def quad(pts):
        base = len(verts)
        verts.extend(point(q) for q in pts)
        faces.append(tuple(range(base, base + 4)))

    def tri(pts):
        base = len(verts)
        verts.extend(point(q) for q in pts)
        faces.append(tuple(range(base, base + 3)))

    x0, x1 = -W / 2 + 0.02, W / 2 - 0.02
    y1 = EAVE - 0.02
    z0, z1 = -D / 2 + 0.02, D / 2 - 0.02
    quad([(x0, 0, z0), (x1, 0, z0), (x1, y1, z0), (x0, y1, z0)])      # back
    quad([(x0, 0, z0), (x0, 0, z1), (x0, y1, z1), (x0, y1, z0)])      # west
    quad([(x1, 0, z0), (x1, 0, z1), (x1, y1, z1), (x1, y1, z0)])      # east
    quad([(x0, 0, z0), (x1, 0, z0), (x1, 0, z1), (x0, 0, z1)])        # floor

    # The kit's GABLE: ridge along x at z = 0, both planes overhanging by 0.45,
    # plus the gable triangles closing the ends.
    quad([(-ROOF_X, EAVE, ROOF_Z), (ROOF_X, EAVE, ROOF_Z),
          (ROOF_X, RIDGE_Y, 0.0), (-ROOF_X, RIDGE_Y, 0.0)])
    quad([(-ROOF_X, EAVE, -ROOF_Z), (ROOF_X, EAVE, -ROOF_Z),
          (ROOF_X, RIDGE_Y, 0.0), (-ROOF_X, RIDGE_Y, 0.0)])
    for sx in (-W / 2, W / 2):
        tri([(sx, EAVE, -D / 2), (sx, EAVE, D / 2), (sx, RIDGE_Y, 0.0)])
    # Eave soffit, which closes wall-to-overhang at the eave line.
    for zs in (-1, 1):
        quad([(-ROOF_X, EAVE, zs * D / 2), (ROOF_X, EAVE, zs * D / 2),
              (ROOF_X, EAVE, zs * ROOF_Z), (-ROOF_X, EAVE, zs * ROOF_Z)])

    # Foundation: it juts past the walls, but only BELOW the lot floor.
    quad([(-FOUND_X, -0.92, -FOUND_Z), (FOUND_X, -0.92, -FOUND_Z),
          (FOUND_X, 0.0, -FOUND_Z), (-FOUND_X, 0.0, -FOUND_Z)])
    for sx in (-FOUND_X, FOUND_X):
        quad([(sx, -0.92, -FOUND_Z), (sx, -0.92, FOUND_Z), (sx, 0.0, FOUND_Z), (sx, 0.0, -FOUND_Z)])
    quad([(-FOUND_X, -0.92, FOUND_Z), (FOUND_X, -0.92, FOUND_Z),
          (FOUND_X, 0.0, FOUND_Z), (-FOUND_X, 0.0, FOUND_Z)])

    shell.from_pydata(verts, [], faces)
    shell.update()
    inner = bpy.data.materials.get('HC Hotel preview shell') or \
        bpy.data.materials.new('HC Hotel preview shell')
    inner.use_nodes = True
    inner_bsdf = inner.node_tree.nodes.get('Principled BSDF')
    if inner_bsdf:
        inner_bsdf.inputs['Base Color'].default_value = (0.12, 0.10, 0.08, 1)
        inner_bsdf.inputs['Roughness'].default_value = 0.95
    shell.materials.append(inner)
    shell_obj = bpy.data.objects.new('Hotel preview shell', shell)
    shell_obj['hotel_preview'] = True
    scene.collection.objects.link(shell_obj)

    def add_light(kind, location, energy, size=5.0, key='Hotel preview '):
        data = bpy.data.lights.new(key + kind, kind)
        data.energy = energy
        if kind == 'AREA':
            data.shape = 'DISK'
            data.size = size
        obj = bpy.data.objects.new(key + kind, data)
        obj.location = point(location)
        obj['hotel_preview'] = True
        scene.collection.objects.link(obj)
        _look_at(obj, point(look))
        return obj

    add_light('AREA', (-9, 11, 12), 1200, 7)
    add_light('AREA', (9, 5, 6), 520, 5)
    add_light('SUN', (-4, 9, 2), 2.2)

    cam_data = bpy.data.cameras.new('Hotel preview camera')
    cam = bpy.data.objects.new('Hotel preview camera', cam_data)
    cam.location = point(eye)
    cam_data.lens = lens
    scene.collection.objects.link(cam)
    cam['hotel_preview'] = True
    _look_at(cam, point(look))
    scene.camera = cam

    scene.render.resolution_x = 1000
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(OUT / (name + '.png'))
    if scene.world is None:
        scene.world = bpy.data.worlds.new('Hotel preview world')
    scene.world.color = (0.035, 0.045, 0.06)
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        pass
    bpy.ops.render.render(write_still=True, scene=scene.name)
    print('Preview rendered to', scene.render.filepath)
    return scene.render.filepath


def export():
    scene = _scene()
    batches = {}
    for obj in scene.objects:
        if obj.type != 'MESH' or not obj.get(TAG):
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        material = obj.get('material_batch')
        batch = batches.setdefault(material, {'position': [], 'color': [], 'index': [], 'lookup': {}})
        colours = mesh.color_attributes['Col'].data
        for tri in mesh.loop_triangles:
            for vi, li in zip(tri.vertices, tri.loops):
                vertex = tuple(round(v * 1000) for v in (obj.matrix_world @ mesh.vertices[vi].co))
                tint = tuple(round(v * 100) for v in colours[li].color[:3])
                key = vertex + tint
                idx = batch['lookup'].get(key)
                if idx is None:
                    idx = batch['lookup'][key] = len(batch['position']) // 3
                    # Invert point(): Blender (x, -game_z, game_y) -> game
                    # (x, y, z), in millimetres.  Getting these axes wrong puts
                    # the whole runtime facade below and behind the lot while
                    # Blender and the GLB still look right (see check-store).
                    batch['position'].extend((vertex[0], vertex[2], -vertex[1]))
                    batch['color'].extend(tint)
                batch['index'].append(idx)
    for batch in batches.values():
        del batch['lookup']

    target = ROOT / 'src/models/hotel.json'
    target.write_text(json.dumps({
        'generator': 'scripts/blender-hotel/hotel.py',
        'units': {'position': 0.001, 'color': 0.01},
        'batches': batches
    }, separators=(',', ':')))

    dest = ROOT / 'public/models/buildings'
    dest.mkdir(parents=True, exist_ok=True)
    keep = bpy.context.window.scene
    try:
        bpy.context.window.scene = scene
        bpy.ops.object.select_all(action='DESELECT')
        for obj in scene.objects:
            if obj.type == 'MESH' and obj.get(TAG):
                obj.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(dest / 'hotel.glb'),
                                  export_format='GLB', use_selection=True, use_active_scene=True)
        bpy.ops.object.select_all(action='DESELECT')
    finally:
        bpy.context.window.scene = keep
    print('Exported', sum(len(b['index']) // 3 for b in batches.values()),
          'triangles;', len(batches), 'batches;', target)
    return str(target)
