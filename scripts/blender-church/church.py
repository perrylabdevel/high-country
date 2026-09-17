"""Blender-authored exterior detail for the Silver Creek church.

The gameplay shell stays in ``src/landmarks.js``: it owns the 8 x 8 footprint,
the door and window apertures, the floor, the gable roof, the steeple and the
collisions. This script owns the applied visual form in the shell's lot-local
frame:

    x = across the gable ends, y = up from the lot floor, +z = toward the street

Run through the Blender MCP bridge:

    ns = runpy.run_path('<repo>/scripts/blender-church/church.py')
    ns['build'](); ns['preview'](); ns['export']()

The JSON export is the synchronous runtime asset; the GLB is a portable copy.
Every entry point resolves its own scene rather than trusting
``bpy.context.scene``, so this can run while another authoring script owns the
window's active scene.

The kit is not where you think it is. Measured on the built lot: the exterior
wall faces stand at 4.11, the roof overhangs to 4.45 with its ridge at 9.42
over z = 0 (the ridge runs along x, so the gable ends face +/-x and the street
wall is an eave side), and the steeple is a 1.4 m tower on (4.00, 0) from 7.20
to 11.70 with a four-sided spire to 13.90. Applied trim goes on the OUTER face
of the kit part it dresses, or the game renders a blank wall where Blender
showed a moulding.
"""

import bpy
import json
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SCENE = 'High Country • Church'
TAG = 'church'
OUT = Path('/tmp/hc_church')

LAYOUT = json.loads((HERE / 'layout.json').read_text())
CHURCH = LAYOUT['church']

W = D = 8.0
WALL = CHURCH['WALL']            # outer face of the kit walls
EAVE = CHURCH['EAVE']            # 7.20
RIDGE = CHURCH['RIDGE']          # 9.42 over z = 0
RH = CHURCH['ROOF_HALF']         # 4.45: roof overhang, and the gable end face
ST = CHURCH['STEEPLE']
SLOPE = (RIDGE - EAVE) / RH      # roof rise per metre toward z = 0

MATERIALS = {
    'paint': (0.86, 0.85, 0.83),
    'wood': (0.90, 0.83, 0.72),
    'stone': (0.86, 0.83, 0.77),
    'roof': (0.80, 0.80, 0.76),
    'iron': (0.62, 0.64, 0.63),
    'glass': (0.70, 0.78, 0.76),
}

WHITE = (0.95, 0.94, 0.90)
WHITE_DIM = (0.86, 0.85, 0.80)
SHADOW = (0.72, 0.71, 0.67)
TRIM = (0.88, 0.87, 0.82)
DOOR_GREEN = (0.24, 0.32, 0.26)
STONE = (0.60, 0.57, 0.50)
STONE_DARK = (0.44, 0.41, 0.35)
SHINGLE = (0.52, 0.51, 0.47)
SHINGLE_DARK = (0.42, 0.41, 0.38)
IRON = (0.16, 0.17, 0.17)
GOLD = (0.95, 0.80, 0.34)
# Coloured glazing: a church window is the one place in town with real colour.
GLASS_BLUE = (0.26, 0.38, 0.62)
GLASS_RED = (0.62, 0.24, 0.22)
GLASS_GOLD = (0.82, 0.68, 0.30)
GLASS_GREEN = (0.30, 0.48, 0.38)
GLASS_PALE = (0.76, 0.80, 0.78)


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
    """An axis-aligned box. It sorts its own bounds: this script mirrors nearly
    everything through `sx`/`sz`, and a bound pair that arrives reversed used to
    be dropped in silence -- the whole west face of the steeple, boarding and
    louvers alike, was missing from the first build with no error anywhere."""
    x0, x1 = sorted((x0, x1))
    y0, y1 = sorted((y0, y1))
    z0, z1 = sorted((z0, z1))
    if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
        return
    solid(material, tint,
          [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)],
          [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)])


def profile_z(material, tint, points_xy, z0, z1):
    solid(material, tint, [(x, y, z0) for x, y in points_xy], [(x, y, z1) for x, y in points_xy])


def profile_x(material, tint, points_yz, x0, x1):
    solid(material, tint, [(x0, y, z) for y, z in points_yz], [(x1, y, z) for y, z in points_yz])


def cylinder(material, tint, cx, cy, cz, radius, height, segments=12):
    pts = [(radius * math.cos(2 * math.pi * i / segments), radius * math.sin(2 * math.pi * i / segments))
           for i in range(segments)]
    solid(material, tint, [(cx + u, cy, cz + v) for u, v in pts],
          [(cx + u, cy + height, cz + v) for u, v in pts])


def text(scene, material, tint, body, x, y, z, size, depth):
    """Raised Blender font lettering baked into the game-space accumulator."""
    curve = bpy.data.curves.new('church lettering', 'FONT')
    curve.body = body
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.size = size
    curve.extrude = depth / 2
    curve.resolution_u = 3
    obj = bpy.data.objects.new('temporary church lettering', curve)
    scene.collection.objects.link(obj)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = obj.evaluated_get(depsgraph).to_mesh()
    dest = acc(material)
    for poly in mesh.polygons:
        dest.face([(x + mesh.vertices[i].co.x, y + mesh.vertices[i].co.y, z + depth / 2 + mesh.vertices[i].co.z)
                   for i in poly.vertices], tint)
    obj.evaluated_get(depsgraph).to_mesh_clear()
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.curves.remove(curve)


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
    return [(p, q) for p, q in out if q - p > 1e-3]


# --------------------------------------------------------------------------- walls
def wall_faces():
    """(axis, plane, sign) per wall. `sign` points away from the building."""
    return {
        'front': ('z', WALL, 1), 'back': ('z', -WALL, -1),
        'east': ('x', WALL, 1), 'west': ('x', -WALL, -1),
    }


def wbox(wall, u0, u1, y0, y1, n0, n1, material, tint):
    """A box on a wall: u along the wall, n outward from its outer face."""
    axis, plane, sign = wall_faces()[wall]
    a, b = sorted((plane + sign * n0, plane + sign * n1))
    if axis == 'z':
        box(material, tint, u0, u1, y0, y1, a, b)
    else:
        box(material, tint, a, b, y0, y1, u0, u1)


def wprofile(wall, pts_yn, u0, u1, material, tint):
    axis, plane, sign = wall_faces()[wall]
    if axis == 'z':
        solid(material, tint, [(u0, y, plane + sign * n) for y, n in pts_yn],
              [(u1, y, plane + sign * n) for y, n in pts_yn])
    else:
        solid(material, tint, [(plane + sign * n, y, u0) for y, n in pts_yn],
              [(plane + sign * n, y, u1) for y, n in pts_yn])


def wall_openings(wall):
    """Openings the cladding is cut round, as (u0, u1, y0, head, arch). The cut
    follows the arched head: a plain rectangular cut to the top of the hood left
    the wall bare in the corners beside every lancet."""
    out = []
    if wall == 'front':
        out.append((-0.54, 0.54, 0.0, 2.34, 0.0))
        for w in CHURCH['frontWindows']:
            out.append(window_hole(w['x'], w['w'], w['fromFloor'], w['fromFloor'] + w['h']))
    elif wall == 'back':
        for w in CHURCH['backWindows']:
            out.append(window_hole(-w['x'], w['w'], w['fromFloor'], w['fromFloor'] + w['h']))
    else:
        s = CHURCH['SIDE_WINDOW']
        for z in CHURCH['sideWindows']:
            out.append(window_hole(z, s['w'], s['fromFloor'], s['fromFloor'] + s['h']))
    return out


def window_hole(u, w, sill, head):
    """The lancet's footprint: the light, its arch and the hood mould round it."""
    return (u - w / 2 - 0.26, u + w / 2 + 0.26, sill - 0.2, head, 0.62 * w + 0.2)


def hole_top(hole, ua, ub):
    """How high the cut reaches over [ua, ub]: the head plus the arch, measured
    at the point of the span nearest the opening's centre."""
    u0, u1, y0, head, arch = hole
    if arch <= 0:
        return head
    c = (u0 + u1) / 2
    near = min(max(c, ua), ub)
    half = (u1 - u0) / 2
    t = min(1.0, abs(near - c) / half)
    return head + arch * math.sqrt(max(0.0, 1 - t * t))


def wall_top(wall, u):
    """The eave or the rake: the gable ends rise to the ridge over z = 0. The
    cladding runs a little past the rake line, where the roof covers it; taking
    the lower of a board's two edges left a staircase of bare gable."""
    if wall in ('front', 'back'):
        return EAVE - 0.06
    return min(EAVE - 0.06 + max(0.0, (RH - abs(u)) * SLOPE), RIDGE - 0.1)


def board_and_batten(wall):
    """Vertical boards with battens over the joints, cut round the openings."""
    span = W if wall in ('front', 'back') else D
    ua, ub = -span / 2 - 0.11, span / 2 + 0.11
    holes = wall_openings(wall)
    n = max(1, int(round((ub - ua) / 0.42)))
    step = (ub - ua) / n
    base = 0.55
    for i in range(n):
        u0 = ua + i * step
        u1 = u0 + step
        top = max(wall_top(wall, u0), wall_top(wall, u1))
        cuts = [(h[2], hole_top(h, u0, u1)) for h in holes if h[0] < u1 - 0.01 and h[1] > u0 + 0.01]
        tint = WHITE if i % 2 else WHITE_DIM
        for y0, y1 in runs(base, top, cuts):
            wbox(wall, u0, u1, y0, y1, 0, 0.022, 'paint', tint)
        for y0, y1 in runs(base, top, cuts):
            wbox(wall, u0 - 0.035, u0 + 0.035, y0, y1, 0.022, 0.046, 'wood', SHADOW)
    # Stone skirt, water table and frieze, all cut round a doorway. The skirt
    # first ran straight across the entrance: it covered the bottom 0.55 m of a
    # 2.1 m opening, and check:occlusion measured the door 75% clear.
    threshold = [(h[0], h[1]) for h in holes if h[2] < 0.05]
    for a, b in runs(ua, ub, threshold):
        wbox(wall, a, b, 0.0, base, 0, 0.09, 'stone', STONE)
        for i in range(int((b - a) / 0.7)):
            u0 = a + i * 0.7
            wbox(wall, u0 + 0.02, min(u0 + 0.68, b), 0.06 + (i % 2) * 0.18, 0.2 + (i % 2) * 0.18,
                 0.09, 0.105, 'stone', STONE_DARK)
        wprofile(wall, [(base, 0), (base + 0.1, 0.13), (base + 0.14, 0.13), (base + 0.14, 0)], a, b, 'wood', TRIM)
    if wall in ('front', 'back'):
        wbox(wall, ua, ub, EAVE - 0.34, EAVE - 0.06, 0, 0.07, 'wood', TRIM)


def corner_boards():
    for sx in (-1, 1):
        for sz in (-1, 1):
            box('wood', TRIM, sx * WALL - sx * 0.02, sx * (WALL + 0.07), 0.55, EAVE - 0.06,
                *sorted((sz * (WALL + 0.07), sz * WALL - sz * 0.19)))
            box('wood', TRIM, *sorted((sx * (WALL + 0.07), sx * WALL - sx * 0.19)), 0.55, EAVE - 0.06,
                sz * WALL - sz * 0.02, sz * (WALL + 0.07))


# --------------------------------------------------------------------------- windows
def lancet(wall, u, w, sill, head, glass=False, n_out=0.0):
    """A pointed window: a cased rectangular light with an arched head over it,
    a hood mould and a sill. The kit's own opening is the rectangle; the arch
    above it is applied to the wall, so the two read as one lancet."""
    arch = 0.62 * w
    top = head + arch
    frame = 0.085
    # Jamb casings and the sill.
    for e in (u - w / 2 - frame, u + w / 2):
        wbox(wall, e, e + frame, sill - 0.08, head, n_out, n_out + 0.06, 'wood', TRIM)
    wbox(wall, u - w / 2 - 0.16, u + w / 2 + 0.16, sill - 0.16, sill - 0.04, n_out, n_out + 0.11, 'stone', STONE)
    # The arch: stepped voussoir blocks following a circle, with glass behind.
    steps = 20
    for i in range(steps):
        a0 = math.pi * i / steps
        a1 = math.pi * (i + 1) / steps
        x0 = u + (w / 2 + frame) * math.cos(a1)
        x1 = u + (w / 2 + frame) * math.cos(a0)
        y = head + arch * math.sin((a0 + a1) / 2)
        wbox(wall, min(x0, x1), max(x0, x1), y - 0.075, min(y + 0.05, top), n_out, n_out + 0.06, 'wood', TRIM)
        if glass and y - 0.11 > head:
            wbox(wall, min(x0, x1) + 0.01, max(x0, x1) - 0.01, head, y - 0.08, n_out + 0.015, n_out + 0.03,
                 'glass', (GLASS_BLUE, GLASS_GOLD, GLASS_RED, GLASS_GREEN)[i % 4])
    wbox(wall, u - w / 2 - frame, u + w / 2 + frame, head - 0.03, head + 0.06, n_out, n_out + 0.06, 'wood', TRIM)
    if not glass:
        # A kit-glazed light: only sash bars go over it. An authored pane here
        # is a blocked window to check:occlusion, which allows muntins and
        # nothing more -- the store and the sheriff both shipped one once.
        for k in range(1, 4):
            y = sill + k * (head - sill) / 4
            wbox(wall, u - w / 2, u + w / 2, y - 0.014, y + 0.014, n_out, n_out + 0.022, 'wood', TRIM)
        wbox(wall, u - 0.016, u + 0.016, sill, head, n_out, n_out + 0.022, 'wood', TRIM)
    # Hood mould over the arch.
    for i in range(steps * 2 + 1):
        a = math.pi * i / (steps * 2)
        x = u + (w / 2 + frame + 0.07) * math.cos(a)
        y = head + (arch + 0.07) * math.sin(a)
        wbox(wall, x - 0.055, x + 0.055, y - 0.045, y + 0.045, n_out + 0.05, n_out + 0.09, 'wood', TRIM)


def blind_lancet(wall, z, s):
    """A gable-end window. The kit cannot open the side walls, so the light is
    authored on both faces: coloured glass in a frame here, and a matching
    window inside (interior.py), so the wall does not read as a painted-on
    window from the nave."""
    u, w, sill, head = z, s['w'], s['fromFloor'], s['fromFloor'] + s['h']
    # Leaded lights in four courses, a coloured quarry either side of a pale
    # centre light, with the lead over them.
    rows, cols = 4, 3
    palette = (GLASS_BLUE, GLASS_PALE, GLASS_RED, GLASS_GOLD, GLASS_PALE, GLASS_GREEN,
               GLASS_RED, GLASS_PALE, GLASS_BLUE, GLASS_GOLD, GLASS_PALE, GLASS_GREEN)
    for r in range(rows):
        for c in range(cols):
            y0 = sill + r * (head - sill) / rows
            x0 = u - w / 2 + c * w / cols
            wbox(wall, x0, x0 + w / cols, y0, y0 + (head - sill) / rows, 0.02, 0.05,
                 'glass', palette[(r * cols + c) % len(palette)])
    for k in range(1, rows):
        y = sill + k * (head - sill) / rows
        wbox(wall, u - w / 2, u + w / 2, y - 0.012, y + 0.012, 0.05, 0.062, 'wood', TRIM)
    for k in range(1, cols):
        x = u - w / 2 + k * w / cols
        wbox(wall, x - 0.012, x + 0.012, sill, head, 0.05, 0.062, 'wood', TRIM)
    lancet(wall, u, w, sill, head, glass=True, n_out=0.0)  # blind: no kit opening


def windows():
    for o in CHURCH['frontWindows']:
        lancet('front', o['x'], o['w'], o['fromFloor'], o['fromFloor'] + o['h'])
    for o in CHURCH['backWindows']:
        lancet('back', -o['x'], o['w'], o['fromFloor'], o['fromFloor'] + o['h'])
    s = CHURCH['SIDE_WINDOW']
    for wall in ('east', 'west'):
        for z in CHURCH['sideWindows']:
            blind_lancet(wall, z, s)


# --------------------------------------------------------------------------- entry
def entry(scene):
    """A cased doorway under a gabled hood, with a name board over it."""
    zf = WALL
    # Pilasters either side of the kit's 0.92 m doorway, and the head.
    for sx in (-1, 1):
        # Clear of the kit's jamb at 0.46: check:occlusion wants a doorway 100%
        # clear, and a casing on the jamb line clips its edge rays.
        box('wood', TRIM, sx * 0.52, sx * 0.78, 0.0, 2.42, zf, zf + 0.1)
    box('wood', TRIM, -0.84, 0.84, 2.28, 2.46, zf, zf + 0.12)
    box('wood', WHITE, -0.78, 0.78, 2.46, 2.62, zf, zf + 0.08)
    # The hood: a gable on knee braces, deep enough to read as shelter.
    profile_z('roof', SHINGLE, [(-1.45, 2.66), (0.0, 3.46), (1.45, 2.66), (1.45, 2.52), (0.0, 3.32), (-1.45, 2.52)],
              zf, zf + 1.15)
    box('wood', TRIM, -1.54, 1.54, 2.5, 2.66, zf, zf + 1.22)
    profile_z('wood', TRIM, [(-1.45, 2.52), (1.45, 2.52), (1.45, 2.62), (-1.45, 2.62)], zf + 1.15, zf + 1.22)
    for sx in (-1, 1):
        # A diagonal brace from the wall up to the hood's underside.
        solid('wood', TRIM,
              [(sx * 0.86, 1.86, zf), (sx * 0.98, 1.86, zf), (sx * 0.98, 1.98, zf), (sx * 0.86, 1.98, zf)],
              [(sx * 0.86, 2.4, zf + 0.72), (sx * 0.98, 2.4, zf + 0.72), (sx * 0.98, 2.52, zf + 0.72),
               (sx * 0.86, 2.52, zf + 0.72)])
    # Name board, clear above the hood.
    box('wood', TRIM, -1.45, 1.45, 3.92, 4.70, zf, zf + 0.06)
    box('paint', DOOR_GREEN, -1.36, 1.36, 4.0, 4.62, zf + 0.06, zf + 0.08)
    text(scene, 'wood', GOLD, 'SILVER CREEK', 0, 4.42, zf + 0.08, 0.22, 0.025)
    text(scene, 'wood', GOLD, 'CHURCH  1874', 0, 4.16, zf + 0.08, 0.19, 0.025)


def roof():
    """Shingle courses on the two roof planes, a ridge cap, and the rake and
    verge boards on the gable ends. The kit roof surface is the plane from the
    eave at z = +/-4.45 up to the ridge over z = 0."""
    n = 13
    for i in range(n):
        t0 = i / n
        t1 = (i + 1) / n
        for sz in (-1, 1):
            z0 = sz * RH * (1 - t0)
            z1 = sz * RH * (1 - t1)
            y0 = EAVE + (RIDGE - EAVE) * t0
            y1 = EAVE + (RIDGE - EAVE) * t1
            tint = SHINGLE if i % 2 else SHINGLE_DARK
            # A course, stood 4 cm off the kit plane and lapped over the one below.
            solid('roof', tint,
                  [(-RH, y0 + 0.04, z0), (RH, y0 + 0.04, z0), (RH, y0 + 0.11, z0), (-RH, y0 + 0.11, z0)],
                  [(-RH, y1 + 0.04, z1), (RH, y1 + 0.04, z1), (RH, y1 + 0.11, z1), (-RH, y1 + 0.11, z1)])
    profile_z('roof', SHINGLE_DARK, [(-RH, RIDGE + 0.04), (RH, RIDGE + 0.04), (RH, RIDGE + 0.2), (-RH, RIDGE + 0.2)],
              -0.16, 0.16)
    for sx in (-1, 1):
        x = sx * (RH + 0.02)
        # Rake boards down both slopes, and the verge under them.
        for sz in (-1, 1):
            solid('wood', TRIM,
                  [(x, EAVE + 0.04, sz * RH), (x, EAVE + 0.26, sz * RH), (x, RIDGE + 0.26, 0), (x, RIDGE + 0.04, 0)],
                  [(x + sx * 0.06, EAVE + 0.04, sz * RH), (x + sx * 0.06, EAVE + 0.26, sz * RH),
                   (x + sx * 0.06, RIDGE + 0.26, 0), (x + sx * 0.06, RIDGE + 0.04, 0)])
        # A louvered vent high in the gable, over the ceiling.
        vy, vz = EAVE + 0.95, 0.0
        box('wood', TRIM, *sorted((x + sx * 0.02, x + sx * 0.09)), vy - 0.5, vy + 0.5, vz - 0.42, vz + 0.42)
        for k in range(5):
            box('wood', SHADOW, *sorted((x + sx * 0.04, x + sx * 0.11)),
                vy - 0.42 + k * 0.18, vy - 0.34 + k * 0.18, vz - 0.34, vz + 0.34)


# --------------------------------------------------------------------------- steeple
def steeple():
    """Dressing for the kit's tower and spire: corner boards, a belfry with
    louvers and a bell, a bracketed cornice, a shingled spire skin and a cross.

    The kit tower is 1.4 m on (4.00, 0) from 7.20 to 11.70 and its spire is a
    four-sided pyramid to 13.90 whose corners point along the axes at 0.70. The
    skin here is 0.08 proud of the tower and encases the pyramid, so nothing is
    drawn inside a kit surface.
    """
    cx, cz, h = ST['x'], ST['z'], ST['half']
    base, top, spire = ST['base'], ST['top'], ST['spire']
    o = h + 0.08
    # Board the tower faces, clear of the roof it rises out of.
    for sx in (-1, 1):
        box('paint', WHITE, cx + sx * h, cx + sx * o, base + 0.3, top, cz - o, cz + o)
    for sz in (-1, 1):
        box('paint', WHITE, cx - o, cx + o, base + 0.3, top, cz + sz * h, cz + sz * o)
    # Corner boards.
    for sx in (-1, 1):
        for sz in (-1, 1):
            box('wood', TRIM, *sorted((cx + sx * o, cx + sx * (o - 0.12))), base + 0.3, top + 0.02,
                *sorted((cz + sz * o, cz + sz * (o - 0.12))))
    # Belfry: a louvered opening on each face, with the bell behind them.
    by0, by1 = top - 1.95, top - 0.55
    for sx in (-1, 1):
        for k in range(7):
            y = by0 + k * (by1 - by0) / 7
            box('wood', SHADOW, cx + sx * o, cx + sx * (o + 0.03), y, y + 0.1, cz - 0.42, cz + 0.42)
        box('wood', TRIM, cx + sx * o, cx + sx * (o + 0.05), by0 - 0.1, by1 + 0.12, cz - 0.52, cz - 0.42)
        box('wood', TRIM, cx + sx * o, cx + sx * (o + 0.05), by0 - 0.1, by1 + 0.12, cz + 0.42, cz + 0.52)
        box('wood', TRIM, cx + sx * o, cx + sx * (o + 0.05), by1 + 0.12, by1 + 0.2, cz - 0.52, cz + 0.52)
    for sz in (-1, 1):
        for k in range(7):
            y = by0 + k * (by1 - by0) / 7
            box('wood', SHADOW, cx - 0.42, cx + 0.42, y, y + 0.1, cz + sz * o, cz + sz * (o + 0.03))
        box('wood', TRIM, cx - 0.52, cx - 0.42, by0 - 0.1, by1 + 0.2, cz + sz * o, cz + sz * (o + 0.05))
        box('wood', TRIM, cx + 0.42, cx + 0.52, by0 - 0.1, by1 + 0.2, cz + sz * o, cz + sz * (o + 0.05))
    # The bell: a lathe-turned bell on a headstock, seen through the louvers.
    bell_y = by0 + 0.35
    rings = [(bell_y, 0.02), (bell_y + 0.06, 0.3), (bell_y + 0.2, 0.3), (bell_y + 0.4, 0.26),
             (bell_y + 0.62, 0.17), (bell_y + 0.7, 0.1), (bell_y + 0.76, 0.12), (bell_y + 0.82, 0.05)]
    a = acc('iron')
    sides = 10
    ang = [2 * math.pi * (k + 0.5) / sides for k in range(sides)]
    loops = [[(cx + r * math.cos(t), y, cz + r * math.sin(t)) for t in ang] for y, r in rings]
    a.face(loops[0][::-1], (0.42, 0.34, 0.18))
    a.face(loops[-1], (0.42, 0.34, 0.18))
    for lo, hi in zip(loops, loops[1:]):
        for k in range(sides):
            j = (k + 1) % sides
            a.face([lo[k], lo[j], hi[j], hi[k]], (0.42, 0.34, 0.18))
    box('wood', SHADOW, cx - 0.5, cx + 0.5, bell_y + 0.82, bell_y + 0.96, cz - 0.08, cz + 0.08)
    # Cornice with brackets, then the spire skin over the kit pyramid.
    profile_z('wood', TRIM, [(cx - o - 0.16, top), (cx + o + 0.16, top), (cx + o + 0.16, top + 0.12),
                             (cx + o + 0.04, top + 0.26), (cx - o - 0.04, top + 0.26), (cx - o - 0.16, top + 0.12)],
              cz - o - 0.16, cz + o + 0.16)
    for sx in (-1, 1):
        for sz in (-1, 1):
            box('wood', TRIM, *sorted((cx + sx * (o + 0.02), cx + sx * (o + 0.14))), top - 0.5, top,
                *sorted((cz + sz * 0.3, cz + sz * 0.42)))
    skin, apex = 0.80, spire + 0.22
    courses = 7
    for i in range(courses):
        t0 = i / courses
        t1 = (i + 1) / courses
        y0 = top + 0.26 + (apex - top - 0.26) * t0
        y1 = top + 0.26 + (apex - top - 0.26) * t1
        r0 = skin * (1 - t0)
        r1 = skin * (1 - t1)
        quad = [(1, 0), (0, 1), (-1, 0), (0, -1)]
        solid('roof', SHINGLE if i % 2 else SHINGLE_DARK,
              [(cx + r0 * dx, y0, cz + r0 * dz) for dx, dz in quad],
              [(cx + r1 * dx, y1, cz + r1 * dz) for dx, dz in quad])
    # The cross.
    box('iron', IRON, cx - 0.04, cx + 0.04, apex, apex + 0.92, cz - 0.04, cz + 0.04)
    box('iron', IRON, cx - 0.3, cx + 0.3, apex + 0.52, apex + 0.6, cz - 0.04, cz + 0.04)


def ensure_materials():
    mats = {}
    for name, colour in MATERIALS.items():
        mat = bpy.data.materials.get('Church_' + name) or bpy.data.materials.new('Church_' + name)
        mat.diffuse_color = (*colour, 1)
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        tree = mat.node_tree
        attr = tree.nodes.get('HC Col') or tree.nodes.new('ShaderNodeVertexColor')
        attr.name = attr.label = 'HC Col'
        attr.layer_name = 'Col'
        mix = tree.nodes.get('HC Tint') or tree.nodes.new('ShaderNodeMix')
        mix.name = mix.label = 'HC Tint'
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs[6].default_value = (*colour, 1)
        tree.links.new(attr.outputs['Color'], mix.inputs[7])
        tree.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.24 if name == 'glass' else 0.86
        if name == 'glass':
            bsdf.inputs['Alpha'].default_value = 0.55
            mat.surface_render_method = 'DITHERED'
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
    for wall in ('front', 'back', 'east', 'west'):
        board_and_batten(wall)
    corner_boards()
    windows()
    entry(scene)
    roof()
    steeple()
    mats = ensure_materials()
    total = 0
    for name, batch in ACC.items():
        mesh = bpy.data.meshes.new('Church ' + name)
        mesh.from_pydata([point(v) for v in batch.verts], [], batch.faces)
        mesh.update()
        col = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        for poly, tint in zip(mesh.polygons, batch.tints):
            for li in poly.loop_indices:
                col.data[li].color = (*tint, 1)
        mesh.materials.append(mats[name])
        obj = bpy.data.objects.new('Church ' + name, mesh)
        obj[TAG] = True
        obj['material_batch'] = name
        scene.collection.objects.link(obj)
        total += len(batch.faces)
    scene['church_generator'] = 'scripts/blender-church/church.py'
    print('Church:', total, 'faces in', len(ACC), 'material batches')
    return scene


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
                    # Exact inverse of point(): Blender (x, -game_z, game_y) -> game.
                    batch['position'].extend((vertex[0], vertex[2], -vertex[1]))
                    batch['color'].extend(tint)
                batch['index'].append(idx)
    for batch in batches.values():
        del batch['lookup']
    target = ROOT / 'src/models/church.json'
    target.write_text(json.dumps({
        'generator': 'scripts/blender-church/church.py',
        'units': {'position': 0.001, 'color': 0.01},
        'batches': batches
    }, separators=(',', ':')))
    dest = ROOT / 'public/models/buildings'
    dest.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:
        if obj.type == 'MESH' and obj.get(TAG):
            obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(dest / 'church.glb'), export_format='GLB',
                              use_selection=True, use_active_scene=True)
    bpy.ops.object.select_all(action='DESELECT')
    print('Exported', sum(len(b['index']) // 3 for b in batches.values()), 'triangles;', len(batches), 'batches;', target)
    return str(target)
