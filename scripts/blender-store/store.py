"""Blender-authored exterior detail for Silver Creek's general store.

The gameplay shell stays in ``src/landmarks.js``: it owns the 9.5 x 8 m
footprint, the door and two display apertures, the floor, shed roof, false
front, interior and collisions.  This script owns the visual form in the
shell's lot-local frame:

    x = across the facade, y = up from the lot floor, +z = toward the street

Run through the Blender MCP bridge:

    ns = runpy.run_path('<repo>/scripts/blender-store/store.py')
    ns['build'](); ns['preview'](); ns['export']()

The JSON export is the synchronous runtime asset; the GLB is a portable copy.
Every entry point resolves its own scene rather than trusting
``bpy.context.scene`` so this can run while another authoring script owns the
window's active scene.
"""

import bpy
import json
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SCENE = 'High Country • General Store'
TAG = 'general_store'
OUT = Path('/tmp/hc_store')

# Must track the `store` lot in src/landmarks.js.
W, D, EAVE = 9.5, 8.0, 5.8
FALSE_FRONT = 3.2
TOP = EAVE + FALSE_FRONT
FRONT = D / 2 + 0.11
BACK = -D / 2 - 0.11
SIDE = W / 2 + 0.11

# The kit does not stop at the wall planes above, and trim drawn against them
# is simply invisible. `falseFront` in src/buildings/kit.js adds a board 0.4 m
# proud of the facade (z 4.10 -> 4.50), a cap over its top (y 8.86 -> 9.18,
# out to z 4.82), and two returns 0.4 m proud of BOTH side walls, running the
# full depth and the full height (|x| 4.85 -> 5.25).  The first version of this
# script drew the whole crown between FRONT and FRONT+0.42 and the whole side
# treatment at |x| = SIDE, so the kit board hid every moulding and the sign
# board, and the returns buried the battens and the ghost sign.  Applied trim
# belongs on the OUTER face of the kit part it dresses.
FF = 4.50       # outer face of the kit's false-front board
FF_CAP = 4.82   # outer face of the kit's parapet cap
RET = 5.25      # outer face of the kit's false-front side returns

# The storefront's vertical stack.  Display glass has to start at or above
# 0.5 m or the kit declines to glaze the aperture at all.
BULK = 0.78
HEAD = 2.62
TRANSOM = 3.08

DOOR_HALF = 0.46
WIN_X = 2.75
WIN_W = 2.40

# The runtime multiplies each batch's TEXTURE by the per-face Col tint, and
# every one of those textures is close to neutral (src/buildings/store.js
# tints them to white and leans on gain).  So the per-batch base here is the
# texture's neutral value and the tints carry the entire paint scheme.  A
# saturated base instead multiplies twice: a green base crushed the cream trim
# to mint and the red awning stripe to brown, and the whole facade came out
# one colour in both Blender and the game.
MATERIALS = {
    'paint': (0.86, 0.85, 0.83),
    'wood': (0.90, 0.83, 0.72),
    'stone': (0.86, 0.83, 0.77),
    'roof': (0.80, 0.80, 0.76),
    'iron': (0.62, 0.64, 0.63),
    'glass': (0.70, 0.78, 0.76),
}

CREAM = (0.98, 0.94, 0.80)
CREAM_DIM = (0.88, 0.83, 0.68)
GREEN = (0.27, 0.48, 0.37)
GREEN_DARK = (0.17, 0.32, 0.25)
OCHRE = (0.72, 0.52, 0.18)
WOOD = (0.34, 0.18, 0.08)
WOOD_LIGHT = (0.55, 0.34, 0.16)
WOOD_GREY = (0.56, 0.51, 0.43)
BOARD = (0.44, 0.40, 0.34)
SACK = (0.84, 0.76, 0.55)
CRATE = (0.58, 0.42, 0.22)
TIN = (0.74, 0.75, 0.70)
IRON = (0.13, 0.15, 0.15)
GLASS = (0.30, 0.42, 0.40)
GOLD = (1.00, 0.82, 0.32)
RED = (0.70, 0.24, 0.19)
BLUE = (0.22, 0.30, 0.44)
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


def barrel(cx, cy, cz, radius=0.30, height=0.86):
    """A staved barrel: belly wider than the heads, with two iron hoops."""
    waist = radius * 1.14
    for y0, y1, r0, r1 in ((cy, cy + height * 0.4, radius, waist),
                           (cy + height * 0.4, cy + height, waist, radius)):
        pts = [(waist * math.cos(2 * math.pi * i / 12), waist * math.sin(2 * math.pi * i / 12))
               for i in range(12)]
        k0, k1 = r0 / waist, r1 / waist
        solid('wood', CRATE,
              [(cx + u * k0, y0, cz + v * k0) for u, v in pts],
              [(cx + u * k1, y1, cz + v * k1) for u, v in pts])
    for band in (cy + height * 0.18, cy + height * 0.7):
        cylinder('iron', IRON, cx, band, cz, waist * 1.03, 0.045)


def crate(cx, cy, cz, w, h, d, tint=CRATE, banded=True):
    box('wood', tint, cx - w / 2, cx + w / 2, cy, cy + h, cz - d / 2, cz + d / 2)
    if banded:
        for y in (cy + h * 0.2, cy + h * 0.78):
            box('wood', WOOD_LIGHT, cx - w / 2 - 0.012, cx + w / 2 + 0.012,
                y - 0.028, y + 0.028, cz - d / 2 - 0.012, cz + d / 2 + 0.012)


def sack(cx, cy, cz, w=0.42, h=0.34, d=0.34, tilt=0.0):
    """A slumped flour sack: a bellied octagon with a gathered, tied neck.

    Stacking the old straight taper produced a stepped white cone rather than
    a pile of sacks, so the profile bellies out at the middle and closes to a
    small neck, and ``tilt`` leans the whole thing so a pile does not read as
    a set of concentric steps.
    """
    ring = [(math.cos(2 * math.pi * i / 8), math.sin(2 * math.pi * i / 8)) for i in range(8)]

    def loop(t, scale):
        y = cy + h * t
        lean = tilt * h * t
        return [(cx + lean + u * w / 2 * scale, y, cz + v * d / 2 * scale) for u, v in ring]

    # Base -> belly -> shoulder -> neck, so the silhouette is a sack.
    for (t0, s0), (t1, s1) in zip(
            [(0.0, 0.88), (0.38, 1.0), (0.78, 0.72)],
            [(0.38, 1.0), (0.78, 0.72), (1.0, 0.34)]):
        solid('paint', SACK, loop(t0, s0), loop(t1, s1))
    # The tied-off ear at the top.
    solid('paint', SACK, loop(1.0, 0.34), loop(1.14, 0.16))


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


# ---------------------------------------------------------------- storefront

def display_window(x):
    """A plate-glass display window over the kit's matching opening.

    The kit already glazes the aperture; this adds the frame, the mullions and
    a shallow shop nook so there is something to look AT through the glass.
    """
    x0, x1 = x - WIN_W / 2, x + WIN_W / 2
    z = FRONT + 0.04

    # Panelled bulkhead below the sill.
    box('paint', GREEN, x0 - 0.16, x1 + 0.16, 0.0, BULK, FRONT, z + 0.09)
    for i in range(3):
        px0 = x0 + 0.10 + i * (WIN_W - 0.20) / 3
        px1 = px0 + (WIN_W - 0.20) / 3 - 0.09
        box('paint', GREEN_DARK, px0, px1, 0.14, BULK - 0.18, z + 0.09, z + 0.115)
    # Sill and its water table.
    box('wood', CREAM, x0 - 0.22, x1 + 0.22, BULK, BULK + 0.11, FRONT, z + 0.20)

    # The pane itself, set back inside the casing.
    box('glass', GLASS, x0, x1, BULK + 0.11, HEAD, z - 0.02, z + 0.005)
    # Mullions: two verticals and a slim horizontal near the head.
    for m in (x0 + WIN_W / 3, x1 - WIN_W / 3):
        box('wood', CREAM, m - 0.035, m + 0.035, BULK + 0.11, HEAD, z, z + 0.065)
    box('wood', CREAM, x0, x1, HEAD - 0.44, HEAD - 0.38, z, z + 0.06)
    # Casing.
    for xx in (x0 - 0.085, x1 + 0.085):
        box('paint', CREAM, xx - 0.085, xx + 0.085, BULK, HEAD + 0.13, FRONT, z + 0.17)
    box('paint', CREAM, x0 - 0.20, x1 + 0.20, HEAD, HEAD + 0.13, FRONT, z + 0.19)

    # Gold leaf on the glass, as a painted sign shop would letter it.
    return x0, x1


def shop_nook(x):
    """Goods on a stepped riser just inside the display glass."""
    x0, x1 = x - WIN_W / 2 + 0.06, x + WIN_W / 2 - 0.06
    zb, zf = FRONT - 0.62, FRONT - 0.06
    # Two risers, back higher, so the goods read as tiered.
    box('wood', WOOD_GREY, x0, x1, BULK - 0.02, BULK + 0.16, zb, zb + 0.30)
    box('wood', WOOD_GREY, x0, x1, BULK - 0.02, BULK + 0.04, zb + 0.30, zf)
    # Backboard so the dark interior does not swallow the display.
    box('paint', GREEN_DARK, x0 - 0.06, x1 + 0.06, BULK, HEAD - 0.05, zb - 0.05, zb)
    return x0, x1, zb, zf


def storefront(scene):
    # Recessed entry: pilasters flank the door, with a panelled reveal.
    for sx in (-1, 1):
        px = sx * (DOOR_HALF + 0.30)
        box('paint', CREAM, px - 0.16, px + 0.16, 0.0, TRANSOM, FRONT, FRONT + 0.22)
        # Plinth block and a simple capital.
        box('paint', CREAM_DIM, px - 0.20, px + 0.20, 0.0, 0.24, FRONT, FRONT + 0.26)
        box('paint', CREAM_DIM, px - 0.21, px + 0.21, TRANSOM - 0.16, TRANSOM, FRONT, FRONT + 0.27)

    # Door casing and threshold over the kit's leaf (the kit hangs the door).
    box('wood', CREAM, -DOOR_HALF - 0.10, DOOR_HALF + 0.10, 2.10, 2.24, FRONT, FRONT + 0.16)
    box('wood', WOOD_GREY, -DOOR_HALF - 0.14, DOOR_HALF + 0.14, -0.01, 0.045, FRONT - 0.10, FRONT + 0.26)
    # Transom light above the door.
    box('glass', GLASS, -DOOR_HALF, DOOR_HALF, 2.26, TRANSOM - 0.10, FRONT + 0.02, FRONT + 0.045)
    box('wood', CREAM, -0.03, 0.03, 2.26, TRANSOM - 0.10, FRONT + 0.03, FRONT + 0.09)
    box('paint', CREAM, -DOOR_HALF - 0.10, DOOR_HALF + 0.10, TRANSOM - 0.10, TRANSOM, FRONT, FRONT + 0.16)

    left = display_window(-WIN_X)
    right = display_window(WIN_X)

    # Corner pilasters closing the storefront at the lot edges.
    for sx in (-1, 1):
        px = sx * (W / 2 - 0.20)
        box('paint', CREAM, px - 0.20, px + 0.20, 0.0, TRANSOM, FRONT, FRONT + 0.24)
        box('paint', CREAM_DIM, px - 0.24, px + 0.24, 0.0, 0.26, FRONT, FRONT + 0.28)
        box('paint', CREAM_DIM, px - 0.25, px + 0.25, TRANSOM - 0.18, TRANSOM, FRONT, FRONT + 0.29)

    # Transom band across the whole storefront, tying it together.
    box('paint', GREEN, -W / 2, W / 2, TRANSOM, TRANSOM + 0.26, FRONT, FRONT + 0.14)
    box('wood', CREAM, -W / 2, W / 2, TRANSOM + 0.26, TRANSOM + 0.36, FRONT, FRONT + 0.22)

    # Gold lettering on the display glass, the way a sign painter would.
    for x, label in ((-WIN_X, 'DRY GOODS'), (WIN_X, 'HARDWARE')):
        text(scene, 'wood', GOLD, label, x, HEAD - 0.62, FRONT + 0.055, 0.17, 0.014, 1.06)
    text(scene, 'wood', GOLD, 'EST. 1874', 0.0, TRANSOM + 0.09, FRONT + 0.145, 0.15, 0.012, 1.2)

    return left, right


def goods(scene):
    """The window displays and the boardwalk stock that sell the shop."""
    # West window: sacks, bolts of cloth, a scale.
    x0, x1, zb, zf = shop_nook(-WIN_X)
    for dx, w, h, tilt in ((0.30, 0.42, 0.34, 0.10), (0.76, 0.38, 0.29, -0.14),
                          (1.20, 0.40, 0.32, 0.16)):
        sack(x0 + dx, BULK + 0.16, zb + 0.17, w, h, 0.32, tilt)
    for i, tint in enumerate((RED, BLUE, CREAM_DIM, OCHRE)):
        bx = x0 + 1.62 + (i % 2) * 0.22
        by = BULK + 0.04 + (i // 2) * 0.17
        box('paint', tint, bx - 0.10, bx + 0.10, by, by + 0.155, zf - 0.40, zf - 0.06)
    crate(x0 + 0.52, BULK + 0.04, zf - 0.22, 0.34, 0.26, 0.30, CRATE)

    # East window: hardware — a keg, tools, tinware, a lantern.
    x0, x1, zb, zf = shop_nook(WIN_X)
    barrel(x0 + 0.34, BULK + 0.16, zb + 0.17, 0.20, 0.52)
    crate(x0 + 0.92, BULK + 0.16, zb + 0.16, 0.46, 0.34, 0.28, CRATE)
    crate(x0 + 1.52, BULK + 0.16, zb + 0.16, 0.40, 0.44, 0.26, WOOD_LIGHT)
    # A pair of shovels leaning against the backboard.
    for i, dx in enumerate((1.92, 2.04)):
        box('wood', WOOD_LIGHT, x0 + dx - 0.018, x0 + dx + 0.018,
            BULK + 0.10, BULK + 1.05, zb + 0.06, zb + 0.10)
        box('iron', IRON, x0 + dx - 0.075, x0 + dx + 0.075,
            BULK + 0.06, BULK + 0.28, zb + 0.055, zb + 0.075)
    # Tinware stacked on the upper riser.
    for i in range(3):
        cylinder('iron', TIN, x0 + 0.60 + i * 0.26, BULK + 0.50, zb + 0.14, 0.085, 0.10)

    # Boardwalk stock under the awning: the shop spilling into the street.
    barrel(-W / 2 + 0.72, 0.0, FRONT + 0.62, 0.30, 0.86)
    barrel(-W / 2 + 1.38, 0.0, FRONT + 0.58, 0.28, 0.80)
    crate(W / 2 - 0.80, 0.0, FRONT + 0.60, 0.62, 0.44, 0.52, CRATE)
    crate(W / 2 - 0.86, 0.44, FRONT + 0.56, 0.48, 0.34, 0.42, WOOD_LIGHT)
    for dx, dy, dz, w, tilt in ((-0.16, 0.0, -0.10, 0.48, 0.10),
                               (0.17, 0.0, 0.08, 0.46, -0.12),
                               (0.02, 0.27, -0.02, 0.44, 0.22)):
        sack(W / 2 - 1.72 + dx, dy, FRONT + 0.56 + dz, w, 0.30, 0.40, tilt)
    # A broom by the door jamb.
    box('wood', WOOD_LIGHT, 1.28, 1.32, 0.0, 1.22, FRONT + 0.14, FRONT + 0.18)
    box('paint', SACK, 1.22, 1.38, 0.0, 0.30, FRONT + 0.09, FRONT + 0.23)


# ------------------------------------------------------------------- awning

def awning():
    """A striped canvas awning on posts, shading the display glass."""
    y_wall = TRANSOM + 0.40
    y_edge = 2.56
    z_edge = FRONT + 1.70
    ribs = 13
    for i in range(ribs):
        x0 = -W / 2 + 0.10 + i * (W - 0.20) / ribs
        x1 = x0 + (W - 0.20) / ribs
        tint = CREAM if i % 2 == 0 else RED
        solid('paint', tint,
              [(x0, y_wall, FRONT + 0.10), (x1, y_wall, FRONT + 0.10),
               (x1, y_edge, z_edge), (x0, y_edge, z_edge)],
              [(x0, y_wall - 0.05, FRONT + 0.10), (x1, y_wall - 0.05, FRONT + 0.10),
               (x1, y_edge - 0.05, z_edge), (x0, y_edge - 0.05, z_edge)])
        # Scalloped valance hanging off the front edge.
        drop = 0.34 if i % 2 == 0 else 0.26
        box('paint', tint, x0, x1, y_edge - drop, y_edge, z_edge, z_edge + 0.03)

    # Front rail and the two posts that carry it.
    box('wood', WOOD_GREY, -W / 2 + 0.06, W / 2 - 0.06, y_edge - 0.02, y_edge + 0.09,
        z_edge - 0.05, z_edge + 0.07)
    for px in (-W / 2 + 0.55, W / 2 - 0.55):
        box('wood', WOOD_GREY, px - 0.075, px + 0.075, 0.0, y_edge, z_edge - 0.04, z_edge + 0.06)
        # Sawn bracket back to the facade, and a shoe at the boards.
        solid('wood', WOOD_GREY,
              [(px - 0.05, y_edge - 0.10, z_edge - 0.02), (px + 0.05, y_edge - 0.10, z_edge - 0.02),
               (px + 0.05, y_edge - 0.62, z_edge - 0.02), (px - 0.05, y_edge - 0.62, z_edge - 0.02)],
              [(px - 0.05, y_edge - 0.10, z_edge - 0.54), (px + 0.05, y_edge - 0.10, z_edge - 0.54),
               (px + 0.05, y_edge - 0.34, z_edge - 0.54), (px - 0.05, y_edge - 0.34, z_edge - 0.54)])
        box('iron', IRON, px - 0.10, px + 0.10, 0.0, 0.08, z_edge - 0.09, z_edge + 0.11)
    return z_edge


# -------------------------------------------------------------- upper facade

def upper_wall(scene):
    """Clapboards over the storefront, with a loft door and its hoist."""
    y0, y1 = TRANSOM + 0.36, EAVE
    course = 0.19
    y = y0
    while y < y1 - 1e-4:
        top = min(y + course, y1)
        # Each course stands slightly proud of the one above: a real shadow
        # line, which is what makes clapboard read as siding and not paint.
        solid('paint', GREEN if int(y / course) % 2 else GREEN_DARK,
              [(-W / 2, y, FRONT), (W / 2, y, FRONT), (W / 2, top, FRONT), (-W / 2, top, FRONT)],
              [(-W / 2, y, FRONT + 0.075), (W / 2, y, FRONT + 0.075),
               (W / 2, top, FRONT + 0.035), (-W / 2, top, FRONT + 0.035)])
        y = top

    # Loft door, battened and shut, with a hood and a hoist beam over it.
    dx, dy0, dy1 = 0.62, y0 + 0.62, y0 + 2.18
    for cx in (-dx - 0.06, dx + 0.06):
        box('wood', CREAM, cx - 0.06, cx + 0.06, dy0 - 0.12, dy1 + 0.12, FRONT + 0.05, FRONT + 0.19)
    box('wood', CREAM, -dx - 0.12, dx + 0.12, dy1, dy1 + 0.12, FRONT + 0.05, FRONT + 0.19)
    box('wood', CREAM, -dx - 0.12, dx + 0.12, dy0 - 0.12, dy0, FRONT + 0.05, FRONT + 0.19)
    box('wood', WOOD, -dx, dx, dy0, dy1, FRONT + 0.04, FRONT + 0.115)
    for i in range(5):
        bx = -dx + 0.07 + i * (2 * dx - 0.14) / 5
        box('wood', WOOD_LIGHT, bx, bx + (2 * dx - 0.14) / 5 - 0.045, dy0, dy1,
            FRONT + 0.115, FRONT + 0.135)
    for by in (dy0 + 0.22, dy1 - 0.22):
        box('iron', IRON, -dx, dx, by - 0.035, by + 0.035, FRONT + 0.135, FRONT + 0.155)
    # Hood on two brackets.
    solid('roof', TIN,
          [(-dx - 0.26, dy1 + 0.20, FRONT), (dx + 0.26, dy1 + 0.20, FRONT),
           (dx + 0.26, dy1 + 0.27, FRONT), (-dx - 0.26, dy1 + 0.27, FRONT)],
          [(-dx - 0.26, dy1 + 0.10, FRONT + 0.34), (dx + 0.26, dy1 + 0.10, FRONT + 0.34),
           (dx + 0.26, dy1 + 0.17, FRONT + 0.34), (-dx - 0.26, dy1 + 0.17, FRONT + 0.34)])
    for hx in (-dx - 0.16, dx + 0.16):
        solid('wood', CREAM,
              [(hx - 0.035, dy1 + 0.18, FRONT), (hx + 0.035, dy1 + 0.18, FRONT),
               (hx + 0.035, dy1 - 0.12, FRONT), (hx - 0.035, dy1 - 0.12, FRONT)],
              [(hx - 0.035, dy1 + 0.18, FRONT + 0.30), (hx + 0.035, dy1 + 0.18, FRONT + 0.30),
               (hx + 0.035, dy1 + 0.10, FRONT + 0.30), (hx - 0.035, dy1 + 0.10, FRONT + 0.30)])
    # Hoist beam and block, projecting over the street.
    box('wood', WOOD, -0.07, 0.07, dy1 + 0.34, dy1 + 0.48, FRONT, FRONT + 0.78)
    box('iron', IRON, -0.045, 0.045, dy1 + 0.16, dy1 + 0.34, FRONT + 0.64, FRONT + 0.73)



def false_front_dress(scene):
    """Cornice, brackets, sign board and pediment on the kit's false front.

    Everything here is applied to the street face of the kit board at FF, not
    to the facade plane: see the FF/FF_CAP/RET note at the top of this file.
    The kit already supplies the parapet cap and both side returns, so this
    adds neither.
    """
    # Frieze and its architrave moulding, just above the eave line.
    box('paint', GREEN, -W / 2, W / 2, EAVE, EAVE + 0.30, FF, FF + 0.12)
    box('wood', CREAM, -W / 2 - 0.05, W / 2 + 0.05, EAVE + 0.30, EAVE + 0.42, FF, FF + 0.22)

    # Sign board: a recessed field inside a raised moulded surround.
    sy0, sy1 = EAVE + 0.58, EAVE + 1.84
    box('paint', GREEN_DARK, -W / 2 + 0.28, W / 2 - 0.28, sy0, sy1, FF, FF + 0.055)
    for yy in (sy0 - 0.10, sy1):
        box('wood', CREAM, -W / 2 + 0.20, W / 2 - 0.20, yy, yy + 0.10, FF, FF + 0.17)
    for xx in (-W / 2 + 0.24, W / 2 - 0.24):
        box('wood', CREAM, xx - 0.06, xx + 0.06, sy0 - 0.10, sy1 + 0.10, FF, FF + 0.17)
    text(scene, 'wood', GOLD, 'MERCANTILE', 0.0, (sy0 + sy1) / 2 - 0.06,
         FF + 0.055, 0.66, 0.035, 1.03)

    # Secondary band: the trades, smaller.
    by0, by1 = EAVE + 2.02, EAVE + 2.42
    box('paint', GREEN, -W / 2 + 0.34, W / 2 - 0.34, by0, by1, FF, FF + 0.045)
    text(scene, 'wood', CREAM, 'SILVER CREEK  ·  GROCERIES  ·  FEED', 0.0,
         (by0 + by1) / 2, FF + 0.045, 0.20, 0.014, 1.1)

    # Bracketed cornice. It has to project further than the kit's cap or the
    # cap reads as the top of the building and the cornice disappears.
    cy = EAVE + 2.60
    box('wood', CREAM, -W / 2 - 0.09, W / 2 + 0.09, cy, cy + 0.16, FF, FF + 0.40)
    box('paint', GREEN_DARK, -W / 2 - 0.13, W / 2 + 0.13, cy + 0.16, cy + 0.30, FF, FF + 0.46)
    brackets = 9
    for i in range(brackets):
        bx = -W / 2 + 0.36 + i * (W - 0.72) / (brackets - 1)
        solid('wood', CREAM,
              [(bx - 0.055, cy, FF), (bx + 0.055, cy, FF),
               (bx + 0.055, cy - 0.42, FF), (bx - 0.055, cy - 0.42, FF)],
              [(bx - 0.055, cy, FF + 0.34), (bx + 0.055, cy, FF + 0.34),
               (bx + 0.055, cy - 0.16, FF + 0.34), (bx - 0.055, cy - 0.16, FF + 0.34)])

    # Pediment: a shallow centre gable standing in FRONT of the kit's cap, so
    # the crown still has a silhouette instead of being flattened by it.
    py = cy + 0.30
    pz = FF_CAP + 0.02
    profile_z('paint', GREEN, [(-2.05, py), (2.05, py), (1.55, py + 0.52), (-1.55, py + 0.52)],
              pz, pz + 0.13)
    profile_z('wood', CREAM, [(-2.05, py), (2.05, py), (1.55, py + 0.52), (-1.55, py + 0.52)],
              pz + 0.13, pz + 0.19)
    box('wood', CREAM, -1.70, 1.70, py + 0.52, py + 0.62, pz, pz + 0.24)
    # A finial ball on the peak, so the pediment tops out as a shape.
    cylinder('wood', CREAM, 0.0, py + 0.62, pz + 0.12, 0.10, 0.20)


def side_and_back(scene):
    """Board-and-batten on the kit's false-front returns, plus a stone skirt.

    The returns already stand 0.4 m proud of both side walls over the full
    depth and height, so this dresses their outer face at RET; drawn at SIDE it
    is inside solid kit geometry and nothing shows.
    """
    for sx in (-1, 1):
        px = sx * RET
        board = (px, px + 0.016) if sx > 0 else (px - 0.016, px)
        batten = (px, px + 0.045) if sx > 0 else (px - 0.045, px)
        box('paint', BOARD, board[0], board[1], 0.30, TOP - 0.22, -D / 2 - 0.26, D / 2 + 0.26)
        # Board-and-batten is wide boards with a NARROW batten over each joint.
        # Sizing the batten to the board pitch read as a stockade.
        n = 24
        pitch = (D + 0.52 - 0.36) / n
        for i in range(n + 1):
            z0 = -D / 2 - 0.26 + 0.18 + i * pitch
            box('paint', WOOD_GREY, batten[0], batten[1], 0.30, TOP - 0.22,
                z0 - 0.042, z0 + 0.042)
        # Stone skirt, tying the store to the sheriff's masonry two lots down.
        box('stone', STONE,
            px - 0.07 if sx < 0 else px - 0.02, px + 0.02 if sx < 0 else px + 0.07,
            0.0, 0.34, -D / 2 - 0.3, D / 2 + 0.3)

    # The back wall is not covered by the returns, so it dresses at BACK.
    box('paint', BOARD, -W / 2, W / 2, 0.30, EAVE - 0.12, BACK - 0.016, BACK)
    n = 28
    pitch = (W - 0.36) / n
    for i in range(n + 1):
        x0 = -W / 2 + 0.18 + i * pitch
        box('paint', WOOD_GREY, x0 - 0.042, x0 + 0.042, 0.30, EAVE - 0.12,
            BACK - 0.045, BACK)
    box('stone', STONE, -W / 2, W / 2, 0.0, 0.34, BACK - 0.07, BACK + 0.02)

    # Ghost sign on the west return, painted over the battens and weathered.
    ghost = -RET - 0.05
    box('paint', CREAM_DIM, ghost, ghost + 0.016, 1.70, 4.60, -2.1, 2.3)
    text(scene, 'wood', GREEN_DARK, 'FEED', ghost, 3.86, 0.1, 0.56, 0.012, 1.12, plane='west')
    text(scene, 'wood', GREEN_DARK, '& SEED', ghost, 3.08, 0.1, 0.44, 0.012, 1.12, plane='west')
    text(scene, 'wood', GREEN_DARK, 'SILVER CREEK', ghost, 2.30, 0.1, 0.24, 0.012, 1.12, plane='west')

    # A stovepipe over the back, so the roofline is not a bare edge.
    cylinder('iron', IRON, -W / 2 + 1.5, EAVE - 0.2, -D / 2 + 1.4, 0.10, 1.35)
    cylinder('iron', TIN, -W / 2 + 1.5, EAVE + 1.15, -D / 2 + 1.4, 0.145, 0.12)


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
        mat = bpy.data.materials.get('HC Store ' + name)
        if mat is None:
            mat = bpy.data.materials.new('HC Store ' + name)
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
    storefront(scene)
    goods(scene)
    awning()
    upper_wall(scene)
    false_front_dress(scene)
    side_and_back(scene)
    mats = ensure_materials()
    total = 0
    for name, batch in ACC.items():
        mesh = bpy.data.meshes.new('General Store ' + name)
        mesh.from_pydata([point(v) for v in batch.verts], [], batch.faces)
        mesh.update()
        col = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        for poly, tint in zip(mesh.polygons, batch.tints):
            for li in poly.loop_indices:
                col.data[li].color = (*tint, 1)
        mesh.materials.append(mats[name])
        obj = bpy.data.objects.new('General Store ' + name, mesh)
        obj[TAG] = True
        obj['material_batch'] = name
        scene.collection.objects.link(obj)
        total += len(batch.faces)
    scene['general_store_generator'] = 'scripts/blender-store/store.py'
    print('General store:', total, 'faces in', len(ACC), 'material batches')
    return scene


def _look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def preview(name='store', eye=(-12.0, 5.6, 14.5), look=(0.0, 3.2, 4.0), lens=52):
    """Render a 3/4 street view for the visual check."""
    scene = _scene()
    for obj in list(scene.objects):
        if obj.get('store_preview'):
            bpy.data.objects.remove(obj, do_unlink=True)
    OUT.mkdir(parents=True, exist_ok=True)
    mats = ensure_materials()

    mesh = bpy.data.meshes.new('Store preview ground')
    size = 44
    mesh.from_pydata([(-size, -size, 0), (size, -size, 0), (size, size, 0), (-size, size, 0)],
                     [], [(0, 1, 2, 3)])
    mesh.update()
    dirt = bpy.data.materials.get('HC Store preview dirt') or \
        bpy.data.materials.new('HC Store preview dirt')
    dirt.use_nodes = True
    dirt_bsdf = dirt.node_tree.nodes.get('Principled BSDF')
    if dirt_bsdf:
        dirt_bsdf.inputs['Base Color'].default_value = (0.40, 0.34, 0.26, 1)
        dirt_bsdf.inputs['Roughness'].default_value = 0.95
    mesh.materials.append(dirt)
    ground = bpy.data.objects.new('Store preview ground', mesh)
    ground.location = point((0, -0.04, 0))
    ground['store_preview'] = True
    scene.collection.objects.link(ground)

    # Stand-in for the kit shell that landmarks.js builds around this detail
    # layer. Without it the preview looks straight through the doorway and the
    # display glass to the store's OWN back-wall battens, which reads as
    # garbage geometry in the centre bay and invites chasing a defect that is
    # not in the model.
    shell = bpy.data.meshes.new('Store preview shell')
    x0, x1 = -W / 2 + 0.02, W / 2 - 0.02
    y0, y1 = 0.0, EAVE - 0.02
    z0, z1 = -D / 2 + 0.02, D / 2 - 0.02
    verts, faces = [], []
    def quad(pts):
        base = len(verts)
        verts.extend(point(p) for p in pts)
        faces.append(tuple(range(base, base + 4)))
    quad([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)])          # back
    quad([(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)])          # west
    quad([(x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)])          # east
    quad([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)])          # ceiling
    quad([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)])          # floor
    # The kit's false-front board, cap and side returns, to scale. These are
    # the parts that hid the entire authored crown and every bit of side
    # treatment in the first build: the Blender preview showed all of it
    # because Blender had no idea they existed. Proxying them here is what
    # makes the preview able to catch that occlusion at all.
    def kit_box(bx0, bx1, by0, by1, bz0, bz1):
        quad([(bx0, by0, bz1), (bx1, by0, bz1), (bx1, by1, bz1), (bx0, by1, bz1)])
        quad([(bx0, by0, bz0), (bx1, by0, bz0), (bx1, by1, bz0), (bx0, by1, bz0)])
        quad([(bx0, by0, bz0), (bx0, by0, bz1), (bx0, by1, bz1), (bx0, by1, bz0)])
        quad([(bx1, by0, bz0), (bx1, by0, bz1), (bx1, by1, bz1), (bx1, by1, bz0)])
        quad([(bx0, by1, bz0), (bx1, by1, bz0), (bx1, by1, bz1), (bx0, by1, bz1)])
        quad([(bx0, by0, bz0), (bx1, by0, bz0), (bx1, by0, bz1), (bx0, by0, bz1)])

    kit_box(-W / 2 - 0.3, W / 2 + 0.3, EAVE, TOP, FRONT - 0.01, FF)
    kit_box(-W / 2 - 0.5, W / 2 + 0.5, TOP - 0.14, TOP + 0.18, FRONT - 0.09, FF_CAP)
    for sx in (-1, 1):
        rx = sx * RET
        kit_box(min(rx, sx * (RET - 0.4)), max(rx, sx * (RET - 0.4)),
                0.0, TOP, -D / 2 - 0.3, D / 2 + 0.3)

    shell.from_pydata(verts, [], faces)
    shell.update()
    inner = bpy.data.materials.get('HC Store preview shell') or \
        bpy.data.materials.new('HC Store preview shell')
    inner.use_nodes = True
    inner_bsdf = inner.node_tree.nodes.get('Principled BSDF')
    if inner_bsdf:
        inner_bsdf.inputs['Base Color'].default_value = (0.10, 0.08, 0.06, 1)
        inner_bsdf.inputs['Roughness'].default_value = 0.95
    shell.materials.append(inner)
    shell_obj = bpy.data.objects.new('Store preview shell', shell)
    shell_obj['store_preview'] = True
    scene.collection.objects.link(shell_obj)

    def add_light(kind, location, energy, size=5.0, key='Store preview '):
        data = bpy.data.lights.new(key + kind, kind)
        data.energy = energy
        if kind == 'AREA':
            data.shape = 'DISK'
            data.size = size
        obj = bpy.data.objects.new(key + kind, data)
        obj.location = point(location)
        obj['store_preview'] = True
        scene.collection.objects.link(obj)
        _look_at(obj, point(look))
        return obj

    add_light('AREA', (-9, 11, 12), 1200, 7)
    add_light('AREA', (9, 5, 6), 520, 5)
    add_light('SUN', (-4, 9, 2), 2.2)

    cam_data = bpy.data.cameras.new('Store preview camera')
    cam = bpy.data.objects.new('Store preview camera', cam_data)
    cam.location = point(eye)
    cam_data.lens = lens
    scene.collection.objects.link(cam)
    cam['store_preview'] = True
    _look_at(cam, point(look))
    scene.camera = cam

    scene.render.resolution_x = 1000
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(OUT / (name + '.png'))
    if scene.world is None:
        scene.world = bpy.data.worlds.new('Store preview world')
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

    target = ROOT / 'src/models/general-store.json'
    target.write_text(json.dumps({
        'generator': 'scripts/blender-store/store.py',
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
        bpy.ops.export_scene.gltf(filepath=str(dest / 'general-store.glb'),
                                  export_format='GLB', use_selection=True, use_active_scene=True)
        bpy.ops.object.select_all(action='DESELECT')
    finally:
        bpy.context.window.scene = keep
    print('Exported', sum(len(b['index']) // 3 for b in batches.values()),
          'triangles;', len(batches), 'batches;', target)
    return str(target)
