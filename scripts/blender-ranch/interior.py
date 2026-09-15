"""Blender-authored interior for the ranch house. Metres, house-local game XYZ
(x east, y up, z south), the same frame as remodel.py.

Run with Blender MCP:
    ns = runpy.run_path('<abs path>/interior.py'); ns['build'](); ns['export']()

Everything is generated from interior-layout.json (exported by
export-layout.mjs from the shipping kit): wall frames and openings, storey
heights and the stair. Nothing here restates a kit coordinate except the room
rectangles, which are the kit walls' inner faces and are checked by
check:ranch-interior.

Geometry is accumulated as closed solids per material with a per-face tint
(the 'Col' colour attribute) so the game draws each material as one batch and
multiplies the shared game texture by the tint.
"""
import bpy, bmesh, json, math, random
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[2]
LAYOUT = json.loads((ROOT / 'scripts/blender-ranch/interior-layout.json').read_text())
H = LAYOUT['house']
F, U, UC = H['FLOOR'], H['UPPER'], H['UPPER_CEIL']
GC = H['CEIL'] - 0.08          # underside of the ground-floor ceiling slab
ST = H['STAIR']
RISE = (U - F) / ST['risers']
TREAD = (ST['zBottom'] - ST['zTop']) / (ST['risers'] - 1)
T2 = 0.11                      # half wall thickness
SCENE = 'High Country • Ranch Interior'

# Base colours only steer the Blender preview; the game multiplies its own
# material by the per-face tint.
MATERIALS = {
    'floor': (0.42, 0.28, 0.16), 'paint': (0.8, 0.78, 0.72), 'plaster': (0.86, 0.83, 0.76),
    'timber': (0.25, 0.14, 0.07), 'stone': (0.45, 0.42, 0.37), 'iron': (0.06, 0.06, 0.06),
    'fabric': (0.7, 0.66, 0.6), 'brass': (0.72, 0.55, 0.25), 'brick': (0.45, 0.22, 0.15),
}
rng = random.Random(1887)


def point(v):
    return Vector((v[0], -v[2], v[1]))


class Acc:
    """Closed solids for one material, with a tint per face."""

    def __init__(self):
        self.verts, self.faces, self.colors = [], [], []

    def poly(self, pts, outward, tint):
        n = (Vector(pts[1]) - Vector(pts[0])).cross(Vector(pts[2]) - Vector(pts[0]))
        if n.dot(Vector(outward)) < 0:
            pts = pts[::-1]
        base = len(self.verts)
        self.verts.extend(pts)
        self.faces.append(tuple(range(base, base + len(pts))))
        self.colors.append(tint)


ACC = {}
TINT = (1.0, 1.0, 1.0)


def acc(material):
    return ACC.setdefault(material, Acc())


def box(material, x0, x1, y0, y1, z0, z1, tint=TINT, hide=None):
    """Axis-aligned solid. `hide` names one face that is never seen (a board's
    underside, a finish's back against the wall) and is left out."""
    if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
        return
    a = acc(material)
    c = ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    X, Y, Z = (x0, x1), (y0, y1), (z0, z1)
    for axis in range(3):
        for side in (0, 1):
            pts = []
            for u, v in ((0, 0), (1, 0), (1, 1), (0, 1)):
                p = [0, 0, 0]
                p[axis] = (X, Y, Z)[axis][side]
                p[(axis + 1) % 3] = (X, Y, Z)[(axis + 1) % 3][u]
                p[(axis + 2) % 3] = (X, Y, Z)[(axis + 2) % 3][v]
                pts.append(tuple(p))
            out = [0, 0, 0]
            out[axis] = 1 if side else -1
            if hide == ('-+'[side] + 'xyz'[axis]):
                continue
            a.poly(pts, out, tint)


def obox(material, center, axes, half, tint=TINT):
    """Oriented box: `axes` are three orthonormal game-space vectors."""
    a = acc(material)
    c = Vector(center)
    ax = [Vector(v).normalized() * h for v, h in zip(axes, half)]
    corner = lambda i, j, k: tuple(c + ax[0] * i + ax[1] * j + ax[2] * k)
    for axis in range(3):
        for s in (-1, 1):
            pts = []
            for u, v in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                ijk = [0, 0, 0]
                ijk[axis] = s
                ijk[(axis + 1) % 3] = u
                ijk[(axis + 2) % 3] = v
                pts.append(corner(*ijk))
            a.poly(pts, tuple(ax[axis] * s), tint)


def beam(material, a, b, w, d, tint=TINT, up=(0, 1, 0)):
    a, b = Vector(a), Vector(b)
    along = b - a
    side = along.cross(Vector(up))
    if side.length < 1e-6:
        side = along.cross(Vector((1, 0, 0)))
    side.normalize()
    normal = side.cross(along).normalized()
    obox(material, (a + b) / 2, (along, side, normal), (along.length / 2, w / 2, d / 2), tint)


def cyl(material, x, z, y0, y1, r, n=10, tint=TINT, r1=None):
    """Upright cylinder or frustum."""
    r1 = r if r1 is None else r1
    a = acc(material)
    ring = lambda y, rr: [(x + rr * math.cos(2 * math.pi * i / n), y, z + rr * math.sin(2 * math.pi * i / n)) for i in range(n)]
    lo, hi = ring(y0, r), ring(y1, r1)
    for i in range(n):
        j = (i + 1) % n
        mid = ((lo[i][0] + lo[j][0]) / 2 - x, 0, (lo[i][2] + lo[j][2]) / 2 - z)
        a.poly([lo[i], lo[j], hi[j], hi[i]], mid, tint)
    a.poly(lo, (0, -1, 0), tint)
    a.poly(hi, (0, 1, 0), tint)


def shade(rgb, k):
    return tuple(max(0.0, min(1.5, c * k)) for c in rgb)


def jitter(rgb, amount=0.06):
    k = 1 + rng.uniform(-amount, amount)
    return shade(rgb, k)


def subtract(a, b, cuts):
    runs = [(a, b)]
    for ca, cb in cuts:
        nxt = []
        for ra, rb in runs:
            if cb <= ra or ca >= rb:
                nxt.append((ra, rb))
                continue
            if ca > ra:
                nxt.append((ra, ca))
            if cb < rb:
                nxt.append((cb, rb))
        runs = nxt
    return [(ra, rb) for ra, rb in runs if rb - ra > 0.004]


# ---------------------------------------------------------------------------
# Walls from the kit layout

def kit_walls():
    walls = []
    for w in LAYOUT['walls']:
        m = w['matrix']
        axis = 'x' if abs(m[0]) > 0.5 else 'z'
        sign = m[0] if axis == 'x' else m[2]
        centre = m[12] if axis == 'x' else m[14]
        line = m[14] if axis == 'x' else m[12]
        base = m[13]
        ops = []
        for o in w['openings']:
            c = centre + sign * o['x']
            ops.append({'a': c - o['w'] / 2, 'b': c + o['w'] / 2,
                        'lo': base + o['fromFloor'], 'hi': base + o['fromFloor'] + o['h'],
                        'door': o['fromFloor'] < 0.5})
        walls.append({'axis': axis, 'line': line, 'a': centre - w['length'] / 2, 'b': centre + w['length'] / 2,
                      'lo': base, 'hi': base + w['height'], 'openings': ops, 'exterior': w['exterior']})
    # Upstairs above the ell roof the remodel's junction boarding is the wall.
    walls.append({'axis': 'x', 'line': -5.35, 'a': 3.89, 'b': 12.11, 'lo': 4.55, 'hi': 6.2, 'openings': [], 'exterior': True})
    return walls


WALLS = kit_walls()

# Paint and paper palettes (tints over the game's siding / plaster sets).
CREAM = (0.93, 0.88, 0.76)
STYLES = {
    'parlor': dict(wain=0.95, wainTint=(0.36, 0.45, 0.38), paper=((0.80, 0.66, 0.47), (0.70, 0.55, 0.38)),
                   trim=(0.30, 0.38, 0.32), ceiling='plaster', beams='boxed'),
    'hall': dict(wain=1.05, wainTint=None, paper=((0.90, 0.84, 0.70), None), trim=None, ceiling='boards', beams='joists'),
    'dining': dict(wain=0.9, wainTint=(0.50, 0.24, 0.19), paper=((0.70, 0.74, 0.60), (0.62, 0.66, 0.52)),
                   trim=(0.44, 0.22, 0.18), ceiling='plaster', beams='boxed'),
    'kitchen': dict(wain=1.2, wainTint=(0.86, 0.82, 0.68), paper=((0.93, 0.91, 0.85), None),
                    trim=(0.62, 0.58, 0.48), ceiling='boards', beams='joists'),
    'bedW': dict(wain=None, wainTint=None, paper=((0.66, 0.70, 0.74), (0.58, 0.62, 0.68)),
                 trim=CREAM, ceiling='plaster', beams=None),
    'landing': dict(wain=0.9, wainTint=(0.60, 0.54, 0.42), paper=((0.90, 0.84, 0.70), None),
                    trim=(0.52, 0.46, 0.36), ceiling='plaster', beams=None),
    'bedE': dict(wain=0.8, wainTint=(0.55, 0.63, 0.66), paper=((0.86, 0.74, 0.70), (0.80, 0.66, 0.62)),
                 trim=(0.50, 0.58, 0.60), ceiling='plaster', beams=None),
}
# Inner faces of the kit walls: (name, x0, x1, z0, z1, floor, ceiling)
ROOMS = [
    ('parlor', -10.39, -4.11, -5.24, 6.89, F, GC),
    ('hall', -3.89, 5.09, -5.24, 6.89, F, GC),
    ('dining', 5.31, 11.89, -5.24, 6.89, F, GC),
    ('kitchen', 4.11, 15.89, -16.39, -5.46, F, GC),
    ('bedW', -10.39, -4.11, -5.24, 6.89, U, UC),
    ('landing', -3.89, 5.09, -5.24, 6.89, U, UC),
    ('bedE', 5.31, 11.89, -5.24, 6.89, U, UC),
]
LINED = set()


def face_box(side, material, a, b, y0, y1, d0, d1, tint=TINT):
    """Box on a room side: along a..b, height y0..y1, depth d0..d1 into the room."""
    axis, face, n = side
    # The face at depth 0 lies on the wall and is never seen.
    back = None if d0 > 0 else ('-' if n > 0 else '+') + ('z' if axis == 'x' else 'x')
    if axis == 'x':
        z0, z1 = sorted((face + n * d0, face + n * d1))
        box(material, a, b, y0, y1, z0, z1, tint, back)
    else:
        x0, x1 = sorted((face + n * d0, face + n * d1))
        box(material, x0, x1, y0, y1, a, b, tint, back)


def dress_side(room, side, a, b, walls):
    name, _, _, _, _, yf, yc = room
    st = STYLES[name]
    axis, face, n = side
    covered = []
    for w in walls:
        if w['axis'] != axis or abs(w['line'] - (face - n * T2)) > 0.06:
            continue
        sa, sb = max(a, w['a']), min(b, w['b'])
        lo, hi = max(yf, w['lo'] if w['lo'] > 0.2 else yf), min(yc, w['hi'])
        # A wall that only grazes this storey (the ground partition's top
        # 2 cm above the upstairs floor) dresses nothing and covers nothing.
        if sb - sa < 0.02 or hi - lo < 0.15:
            continue
        for ra, rb in subtract(sa, sb, [(ca, cb) for ca, cb, clo, chi in covered if clo < hi - 0.1 and chi > lo + 0.1]):
            covered.append((ra, rb, lo, hi))
            finish(room, st, side, ra, rb, lo, hi, [o for o in w['openings'] if o['b'] > ra and o['a'] < rb and o['hi'] > lo and o['lo'] < hi])
        for o in w['openings']:
            if o['b'] > sa and o['a'] < sb and o['hi'] > lo and o['lo'] < hi:
                casing(room, st, side, o, w)


def finish(room, st, side, a, b, lo, hi, openings):
    name, _, _, _, _, yf, yc = room
    wain = st['wain']
    trim = st['trim'] or (1, 1, 1)
    trim_mat = 'paint' if st['trim'] else 'timber'
    bands = []
    bands.append(('base', yf, yf + 0.2))
    if wain:
        bands.append(('wain', yf + 0.2, yf + wain))
        bands.append(('rail', yf + wain - 0.035, yf + wain + 0.035))
        upper = yf + wain
    else:
        upper = yf + 0.2
    crown = 0.13
    bands.append(('upper', upper, yc - crown))
    bands.append(('crown', yc - crown, yc))
    for kind, y0, y1 in bands:
        y0, y1 = max(y0, lo), min(y1, hi)
        if y1 - y0 < 0.005:
            continue
        cuts = [(o['a'], o['b']) for o in openings if o['lo'] < y1 - 0.001 and o['hi'] > y0 + 0.001]
        for ra, rb in subtract(a, b, cuts):
            if kind == 'base':
                face_box(side, trim_mat, ra, rb, y0, y1, 0, 0.022, shade(trim, 0.85))
                face_box(side, trim_mat, ra, rb, y1 - 0.025, y1, 0.022, 0.034, shade(trim, 0.9))
            elif kind == 'wain':
                if st['wainTint'] is None:
                    # Stained raised panels on a timber frame.
                    face_box(side, 'timber', ra, rb, y0, y1, 0, 0.014, (0.9, 0.8, 0.7))
                    for pa in frange(ra + 0.1, rb - 0.1, 0.62):
                        pb = min(pa + 0.5, rb - 0.1)
                        if pb - pa > 0.15:
                            face_box(side, 'timber', pa, pb, y0 + 0.12, y1 - 0.14, 0.014, 0.026, (1.15, 1.02, 0.9))
                else:
                    x = ra
                    while x < rb - 0.004:
                        xb = min(x + 0.1, rb)
                        face_box(side, 'paint', x + 0.002, xb - 0.002, y0, y1, 0, 0.014, jitter(st['wainTint'], 0.035))
                        x = xb
                    face_box(side, 'paint', ra, rb, y0, y1, 0, 0.006, shade(st['wainTint'], 0.55))
            elif kind == 'rail':
                face_box(side, trim_mat, ra, rb, y0, y1, 0.012, 0.045, trim)
            elif kind == 'upper':
                paper, stripe = st['paper']
                face_box(side, 'plaster', ra, rb, y0, y1, 0, 0.008, paper)
                if stripe:
                    for sa in frange(ra + 0.06, rb - 0.03, 0.2):
                        face_box(side, 'plaster', sa, min(sa + 0.035, rb), y0, y1, 0.008, 0.010, stripe)
            elif kind == 'crown':
                face_box(side, trim_mat, ra, rb, y0, y1, 0, 0.03, trim)
                face_box(side, trim_mat, ra, rb, y1 - 0.05, y1, 0.03, 0.07, shade(trim, 1.08))


def frange(a, b, step):
    x = a
    while x < b:
        yield x
        x += step


def casing(room, st, side, o, wall):
    name, _, _, _, _, yf, yc = room
    trim = st['trim'] or (1, 1, 1)
    mat = 'paint' if st['trim'] else 'timber'
    a, b = o['a'], o['b']
    lo = max(o['lo'], yf) if o['door'] else o['lo']
    hi = min(o['hi'], yc - 0.14)
    cw, cd = 0.09, 0.026
    for s0, s1 in ((a - cw, a), (b, b + cw)):
        face_box(side, mat, s0, s1, lo if not o['door'] else yf, hi + cw, 0, cd, trim)
        if o['door']:
            face_box(side, mat, s0 - 0.01, s1 + 0.01, yf, yf + 0.22, 0, cd + 0.01, shade(trim, 0.9))
    face_box(side, mat, a - cw - 0.03, b + cw + 0.03, hi + cw, hi + cw + 0.035, 0, cd + 0.02, shade(trim, 1.05))
    if not o['door']:
        face_box(side, mat, a - cw - 0.04, b + cw + 0.04, lo - 0.035, lo + 0.005, 0, 0.07, shade(trim, 1.05))
        face_box(side, mat, a - cw + 0.02, b + cw - 0.02, lo - 0.2, lo - 0.035, 0, 0.02, trim)
    key = (wall['axis'], round(wall['line'], 2), round(a, 2), round(o['lo'], 2))
    if key in LINED:
        return
    LINED.add(key)
    # Jamb, head (and stool) linings through the wall thickness.
    axis, face, n = side
    line = wall['line']
    lining = [(a, a + 0.018, lo if not o['door'] else yf, hi), (b - 0.018, b, lo if not o['door'] else yf, hi),
              (a, b, hi - 0.018, hi)]
    if not o['door']:
        lining.append((a, b, lo, lo + 0.018))
    for la, lb, y0, y1 in lining:
        if axis == 'x':
            box(mat, la, lb, y0, y1, line - T2, line + T2, shade(trim, 0.95))
        else:
            box(mat, line - T2, line + T2, y0, y1, la, lb, shade(trim, 0.95))


def build_walls():
    for room in ROOMS:
        name, x0, x1, z0, z1, yf, yc = room
        dress_side(room, ('x', z0, 1), x0, x1, WALLS)
        dress_side(room, ('x', z1, -1), x0, x1, WALLS)
        dress_side(room, ('z', x0, 1), z0, z1, WALLS)
        dress_side(room, ('z', x1, -1), z0, z1, WALLS)


# ---------------------------------------------------------------------------
# Floors, ceilings, beams

WELL = ST['well']


def boards_x(x0, x1, z0, z1, y0, y1, width=0.14, tint=(1, 1, 1), material='floor', holes=()):
    """Boards running east-west with staggered butt joints."""
    row = 0
    z = z0
    while z < z1 - 0.01:
        zb = min(z + width, z1)
        x = x0 - rng.uniform(0, 2.4)
        while x < x1:
            xb = x + rng.uniform(2.2, 4.4)
            a, b = max(x, x0), min(xb, x1)
            cuts = [(h[0], h[1]) for h in holes if h[2] < zb and h[3] > z]
            for ra, rb in subtract(a + 0.002, b - 0.002, cuts):
                box(material, ra, rb, y0, y1, z + 0.0015, zb - 0.0015, jitter(tint, 0.09), '-y')
            x = xb
        z = zb
        row += 1


def boards_z(x0, x1, z0, z1, y0, y1, width=0.16, tint=(1, 1, 1), material='floor', holes=()):
    x = x0
    while x < x1 - 0.01:
        xb = min(x + width, x1)
        cuts = [(h[2], h[3]) for h in holes if h[0] < xb and h[1] > x]
        for ra, rb in subtract(z0, z1, cuts):
            box(material, x + 0.0015, xb - 0.0015, y0, y1, ra, rb, jitter(tint, 0.07), '+y')
        x = xb


def build_floors():
    # Ground floor over the kit underlay (top 0.11); the ell and main meet
    # under the kitchen doorways.
    boards_x(-10.45, 11.95, -5.35, 6.95, F - 0.02, F)
    boards_x(4.05, 15.95, -16.45, -5.35, F - 0.02, F, tint=(0.92, 0.9, 0.86))
    box('timber', -0.52, 0.52, 0.11, 0.2, 6.86, 7.13, (0.9, 0.85, 0.8))  # front threshold
    # Upstairs, on the slab (top CEIL + 0.08), open over the well.
    well = [(WELL[0], WELL[1], WELL[2], WELL[3])]
    boards_x(-10.45, 11.95, -5.3, 6.95, U - 0.02, U, width=0.16, tint=(1.05, 1.0, 0.95), holes=well)


def build_ceilings():
    for name, x0, x1, z0, z1, yf, yc in ROOMS:
        st = STYLES[name]
        holes = [(WELL[0], WELL[1], WELL[2], WELL[3])] if name == 'hall' else []
        if st['ceiling'] == 'plaster':
            # Painted narrow boards: lighter than raw boards, and the seams
            # read where flat plaster only showed the sampler's mottle.
            boards_z(x0, x1, z0, z1, yc - 0.02, yc + 0.005, width=0.1, tint=shade(CREAM, 1.15), material='paint', holes=holes)
        else:
            boards_z(x0, x1, z0, z1, yc - 0.02, yc + 0.005, tint=(1.1, 1.0, 0.9), holes=holes)
        if st['beams'] == 'joists':
            for x in frange(x0 + 0.45, x1 - 0.3, 0.8):
                cuts = [(h[2] - 0.05, h[3] + 0.05) for h in holes if h[0] - 0.1 < x < h[1] + 0.1]
                for za, zb in subtract(z0, z1, cuts):
                    box('timber', x - 0.055, x + 0.055, yc - 0.19, yc - 0.02, za, zb, jitter((1, 1, 1), 0.08))
        elif st['beams'] == 'boxed':
            zc = (z0 + z1) / 2
            box('paint', x0, x1, yc - 0.24, yc - 0.02, zc - 0.13, zc + 0.13, st['trim'])
            box('paint', x0, x1, yc - 0.08, yc - 0.02, zc - 0.19, zc + 0.19, shade(st['trim'], 1.08))
    # Trimmers round the stairwell, and the landing nosing.
    x0, x1, z0, z1 = WELL
    box('timber', x0 - 0.05, x0, GC - 0.2, U, z0, z1 + 0.05)
    box('timber', x0 - 0.05, x1, GC - 0.2, U, z1, z1 + 0.05)
    box('timber', ST['x0'], ST['x1'], U - 0.2, U + 0.004, z0 - 0.02, z0 + 0.03)


# ---------------------------------------------------------------------------
# Stair

def stair_rail_y(z, top):
    """Height of the raked handrail over z (house coords)."""
    t = (ST['zBottom'] - z) / (ST['zBottom'] - ST['zTop'])
    return F + RISE + 0.86 + t * (U - F - RISE)


def build_stair():
    x0, x1 = ST['x0'], ST['x1']
    zb, zt = ST['zBottom'], ST['zTop']
    n = ST['risers']
    for k in range(1, n):
        za, zc = zb - k * TREAD, zb - (k - 1) * TREAD
        top = F + k * RISE
        box('floor', x0 + 0.02, x1, top - 0.035, top, za, zc + 0.03, jitter((1.0, 0.92, 0.82), 0.05))
        box('paint', x0 + 0.03, x1, top - RISE, top - 0.035, zc - 0.02, zc, (0.9, 0.86, 0.76))
    # Top riser under the landing nosing.
    box('paint', x0 + 0.03, x1, U - RISE, U - 0.035, zt - 0.02, zt, (0.9, 0.86, 0.76))
    # Stringers along the nosing line, 0.3 deep.
    a = Vector((0, F + RISE, zb + 0.03))
    b = Vector((0, U, zt))
    for x, w in ((x0 + 0.02, 0.05), (x1 - 0.015, 0.03)):
        pa, pb = a.copy(), b.copy()
        pa.x = pb.x = x
        drop = Vector((0, -0.14, 0))
        beam('timber', pa + drop, pb + drop, w, 0.3)
    # Spandrel: beadboard from the floor to the outer stringer's underside.
    for z in frange(zt, zb - 0.3, 0.1):
        zc = min(z + 0.1, zb)
        t = (zb + 0.03 - (z + zc) / 2) / (zb + 0.03 - zt)
        top = F + RISE + t * (U - F - RISE) - 0.3
        if top > F + 0.05:
            box('paint', x0 - 0.01, x0 + 0.01, F, top, z + 0.002, zc - 0.002, jitter((0.62, 0.56, 0.44), 0.03))
    # Closet end wall under the landing, with a low door.
    for x in frange(x0 + 0.02, x1, 0.1):
        box('paint', x, min(x + 0.098, x1), F, GC, zt - 0.02, zt, jitter((0.62, 0.56, 0.44), 0.03))
    box('paint', x0 + 0.2, x1 - 0.2, F + 0.05, F + 1.75, zt, zt + 0.02, (0.52, 0.46, 0.36))
    cyl('brass', x1 - 0.28, zt + 0.045, F + 0.9, F + 0.93, 0.02, 8)
    # Newels, raked rail and balusters on the open side.
    xr = x0 - 0.02
    for z, ytop in ((zb - 0.1, F + RISE + 1.02), (zt + 0.06, U + 1.0)):
        box('timber', xr - 0.06, xr + 0.06, F, ytop, z - 0.06, z + 0.06, (1.1, 1.0, 0.9))
        box('timber', xr - 0.08, xr + 0.08, ytop, ytop + 0.05, z - 0.08, z + 0.08)
    ra = Vector((xr, stair_rail_y(zb - 0.1, 0), zb - 0.1))
    rb = Vector((xr, stair_rail_y(zt + 0.06, 0), zt + 0.06))
    beam('timber', ra, rb, 0.07, 0.06, (1.05, 0.95, 0.85))
    for k in range(1, n):
        for f in (0.3, 0.75):
            z = zb - (k - f) * TREAD
            if z > zb - 0.2 or z < zt + 0.15:
                continue
            box('paint', xr - 0.017, xr + 0.017, F + k * RISE, stair_rail_y(z, 0) - 0.03, z - 0.017, z + 0.017, CREAM)
    # Wall handrail on brackets along the partition.
    wa = Vector((x1 - 0.06, stair_rail_y(zb - 0.3, 0) - 0.04, zb - 0.3))
    wb = Vector((x1 - 0.06, stair_rail_y(zt + 0.3, 0) - 0.04, zt + 0.3))
    beam('timber', wa, wb, 0.05, 0.05)
    for t in (0.1, 0.5, 0.9):
        p = wa.lerp(wb, t)
        box('iron', p.x, x1, p.y - 0.06, p.y - 0.02, p.z - 0.015, p.z + 0.015)
    # Upstairs guard round the well: west edge and far (south) end.
    gx = WELL[0] - 0.035
    box('timber', gx - 0.035, gx + 0.035, U + 0.86, U + 0.92, WELL[2] + 0.06, WELL[3] + 0.035)
    box('timber', gx - 0.035, WELL[1], U + 0.86, U + 0.92, WELL[3], WELL[3] + 0.07)
    box('timber', gx - 0.05, gx + 0.05, U, U + 0.95, WELL[3] - 0.05, WELL[3] + 0.08, (1.1, 1.0, 0.9))
    for z in frange(WELL[2] + 0.25, WELL[3] - 0.1, 0.16):
        box('paint', gx - 0.016, gx + 0.016, U, U + 0.86, z - 0.016, z + 0.016, CREAM)
    for x in frange(gx + 0.16, WELL[1] - 0.05, 0.16):
        box('paint', x - 0.016, x + 0.016, U, U + 0.86, WELL[3] + 0.02, WELL[3] + 0.052, CREAM)


# ---------------------------------------------------------------------------
# Fireplace, kitchen fittings

def stones(x0, x1, y0, y1, z0, z1, course=0.22, face_axis='z'):
    """Coursed rubble face: blocks jittered in depth and tint."""
    y = y0
    row = 0
    while y < y1 - 0.02:
        yb = min(y + course * rng.uniform(0.8, 1.2), y1)
        if face_axis == 'z':
            x = x0 - (0.18 if row % 2 else 0)
            while x < x1:
                xb = min(x + rng.uniform(0.25, 0.45), x1)
                a = max(x, x0)
                if xb - a > 0.03:
                    box('stone', a + 0.008, xb - 0.008, y + 0.008, yb - 0.008, z0, z1 + rng.uniform(0, 0.02), jitter((1, 0.98, 0.95), 0.12))
                x = xb
        else:
            z = z0 - (0.18 if row % 2 else 0)
            while z < z1:
                zb = min(z + rng.uniform(0.25, 0.45), z1)
                a = max(z, z0)
                if zb - a > 0.03:
                    box('stone', x0 - rng.uniform(0, 0.02), x1, y + 0.008, yb - 0.008, a + 0.008, zb - 0.008, jitter((1, 0.98, 0.95), 0.12))
                z = zb
        y = yb
        row += 1


def build_fireplace():
    bx0, bx1, bz0, bz1 = -7.75, -5.85, -5.24, -2.4
    # Mortar body, then the dressed faces.
    box('stone', bx0, bx1, F, GC, bz0, bz1 - 0.02, (0.62, 0.58, 0.52))
    fx0, fx1, fy = -7.25, -6.35, F + 0.82
    for a, b in ((bx0, fx0), (fx1, bx1)):
        stones(a, b, F, GC, bz1 - 0.03, bz1)
    stones(fx0, fx1, fy, GC, bz1 - 0.03, bz1)
    stones(bx0 - 0.03, bx0, F, GC, bz0, bz1, face_axis='x')
    stones(bx1, bx1 + 0.03, F, GC, bz0, bz1, face_axis='x')
    # Firebox: sooty brick back and cheeks, iron grate, embers.
    box('brick', fx0, fx1, F, fy, bz1 - 0.42, bz1 - 0.38, (0.35, 0.3, 0.28))
    for a, b in ((fx0, fx0 + 0.04), (fx1 - 0.04, fx1)):
        box('brick', a, b, F, fy, bz1 - 0.4, bz1 - 0.02, (0.5, 0.42, 0.38))
    box('brick', fx0, fx1, fy - 0.04, fy, bz1 - 0.4, bz1 - 0.02, (0.3, 0.26, 0.24))
    box('stone', fx0 - 0.08, fx1 + 0.08, fy, fy + 0.18, bz1 - 0.01, bz1 + 0.03, (1.05, 1.0, 0.94))
    for x in frange(fx0 + 0.1, fx1 - 0.08, 0.1):
        box('iron', x, x + 0.02, F + 0.08, F + 0.1, bz1 - 0.34, bz1 - 0.08)
    for i in range(3):
        beam('timber', (fx0 + 0.18 + i * 0.08, F + 0.13, bz1 - 0.3), (fx0 + 0.5 + i * 0.05, F + 0.16, bz1 - 0.12), 0.08, 0.08, (0.5, 0.4, 0.35))
    # Hearthstone and mantel shelf.
    box('stone', bx0 + 0.15, bx1 - 0.15, F - 0.01, F + 0.04, bz1, bz1 + 0.5, (0.9, 0.88, 0.84))
    box('timber', bx0 - 0.2, bx1 + 0.2, F + 1.36, F + 1.44, bz1 - 0.02, bz1 + 0.24, (1.1, 0.95, 0.8))
    for x in (bx0 - 0.1, bx1 + 0.1):
        beam('timber', (x, F + 1.24, bz1), (x, F + 1.36, bz1 + 0.2), 0.08, 0.08)
    # Mantel dressing: clock, candlesticks, a mirror.
    box('timber', -6.95, -6.65, F + 1.44, F + 1.78, bz1 + 0.03, bz1 + 0.17, (1.2, 0.95, 0.75))
    cyl('paint', -6.8, bz1 + 0.175, F + 1.55, F + 1.72, 0.085, 14, CREAM)
    for x in (-7.5, -6.1):
        cyl('brass', x, bz1 + 0.12, F + 1.44, F + 1.47, 0.045, 10)
        cyl('brass', x, bz1 + 0.12, F + 1.47, F + 1.68, 0.014, 8)
        cyl('fabric', x, bz1 + 0.12, F + 1.68, F + 1.8, 0.012, 8, (0.95, 0.92, 0.8))
    box('timber', -7.35, -6.25, F + 1.62, F + 2.25, bz1 - 0.01, bz1 + 0.02, (0.9, 0.7, 0.4))
    box('iron', -7.28, -6.32, F + 1.68, F + 2.19, bz1 + 0.02, bz1 + 0.025, (6, 6.5, 7))
    # Upstairs the breast is plastered.
    box('plaster', -7.55, -6.1, U, UC, bz0, -2.7, (0.66, 0.70, 0.74))
    box('paint', -7.57, -6.08, U, U + 0.18, bz0, -2.68, CREAM)
    # Kitchen stack: stone face round the kit chimney, splashback, stovepipe.
    stones(9.62, 10.78, F, GC, -15.84, -15.8)
    stones(9.6, 9.62, F, GC, -16.39, -15.8, face_axis='x')
    stones(10.78, 10.8, F, GC, -16.39, -15.8, face_axis='x')
    box('stone', 9.3, 11.1, F - 0.01, F + 0.03, -15.8, -14.85, (0.8, 0.78, 0.74))
    cyl('iron', 10.05, -15.55, F + 0.8, F + 1.72, 0.075, 12)
    beam('iron', (10.05, F + 1.72, -15.55), (10.2, F + 1.72, -15.78), 0.15, 0.15)
    cyl('iron', 10.05, -15.55, F + 1.2, F + 1.24, 0.1, 12)


def build_kitchen():
    # Dry sink under the kitchen window.
    x0, x1, z0, z1 = 12.4, 13.6, -16.39, -15.7
    box('timber', x0, x1, F, F + 0.78, z0, z1, (1.2, 1.0, 0.8))
    box('timber', x0 - 0.02, x1 + 0.02, F + 0.78, F + 0.84, z0, z1 + 0.03, (1.1, 0.92, 0.75))
    for xa in (x0 + 0.05, (x0 + x1) / 2 + 0.02):
        box('timber', xa, xa + 0.53, F + 0.12, F + 0.7, z1, z1 + 0.02, (1.35, 1.15, 0.9))
    cyl('iron', 13.0, -15.98, F + 0.84, F + 1.0, 0.22, 16, (4, 4, 4), r1=0.26)
    cyl('paint', 12.62, -16.14, F + 0.84, F + 1.08, 0.07, 12, (0.85, 0.82, 0.74), r1=0.055)
    # Wood box by the stove.
    box('timber', 11.0, 11.6, F, F + 0.5, -16.35, -15.85, (1.1, 0.95, 0.8))
    for i in range(6):
        z = -16.28 + i * 0.08
        beam('timber', (11.06, F + 0.53 + (i % 2) * 0.05, z), (11.54, F + 0.55, z), 0.075, 0.075, (0.9, 0.75, 0.6))
    # Wall shelf with crocks above the table's west wall, and pans on pegs.
    box('timber', 4.11, 4.4, F + 1.55, F + 1.58, -9.6, -8.0)
    for i, z in enumerate(frange(-9.45, -8.1, 0.28)):
        cyl('stone', 4.27, z, F + 1.58, F + 1.58 + 0.16 + (i % 2) * 0.08, 0.08, 12, jitter((1.2, 1.1, 0.95), 0.15), r1=0.07)
    box('timber', 4.11, 4.16, F + 1.6, F + 1.66, -14.6, -13.2)
    for i, z in enumerate((-14.4, -13.9, -13.4)):
        box('iron', 4.16, 4.2, F + 1.62, F + 1.64, z - 0.01, z + 0.01)
        cyl('iron', 4.21, z, F + 1.2 + i * 0.05, F + 1.24 + i * 0.05, 0.13 - i * 0.02, 14)
        beam('iron', (4.21, F + 1.24 + i * 0.05, z), (4.18, F + 1.62, z), 0.02, 0.02)


# ---------------------------------------------------------------------------
# Soft furnishings and dressing

RUG_A = ((0.46, 0.14, 0.12), (0.72, 0.58, 0.36), (0.22, 0.24, 0.36))
RUG_B = ((0.26, 0.32, 0.42), (0.78, 0.72, 0.58), (0.52, 0.2, 0.16))
RUG_C = ((0.44, 0.40, 0.30), (0.62, 0.30, 0.22), (0.70, 0.64, 0.50))


def rug(x0, x1, z0, z1, y, colors):
    border, field, centre = colors
    box('fabric', x0, x1, y, y + 0.008, z0, z1, border)
    box('fabric', x0 + 0.12, x1 - 0.12, y + 0.008, y + 0.010, z0 + 0.12, z1 - 0.12, field)
    box('fabric', x0 + 0.2, x1 - 0.2, y + 0.010, y + 0.011, z0 + 0.2, z1 - 0.2, shade(field, 1.12))
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    hx, hz = (x1 - x0) * 0.2, (z1 - z0) * 0.2
    box('fabric', cx - hx, cx + hx, y + 0.011, y + 0.012, cz - hz, cz + hz, centre)


def curtains(side, o, room):
    """Rod and gathered panels on the room side of a window."""
    axis, face, n = side
    a, b, lo, hi = o['a'], o['b'], o['lo'], o['hi']
    long_drop = room[0] in ('parlor', 'dining', 'bedW')
    bottom = room[5] + 0.03 if long_drop else lo - 0.08
    top = hi + 0.2
    cloth = {'parlor': (0.55, 0.16, 0.14), 'dining': (0.78, 0.72, 0.56), 'kitchen': (0.9, 0.88, 0.8),
             'bedW': (0.36, 0.42, 0.55), 'bedE': (0.86, 0.8, 0.66), 'landing': (0.8, 0.74, 0.6)}.get(room[0], CREAM)
    face_box(side, 'iron', a - 0.22, b + 0.22, top - 0.02, top + 0.01, 0.1, 0.125, (2.5, 2.2, 1.6))
    for s0 in (a - 0.2, b - 0.12):
        for i in range(6):
            fa = s0 + i * 0.053
            depth = 0.07 + (0.03 if i % 2 else 0)
            face_box(side, 'fabric', fa, fa + 0.056, bottom, top - 0.02, depth, depth + 0.02, jitter(cloth, 0.08))


def picture(side, along, y, w, h, canvas):
    face_box(side, 'timber', along - w / 2, along + w / 2, y - h / 2, y + h / 2, 0.01, 0.035, (1.3, 1.0, 0.6))
    face_box(side, 'fabric', along - w / 2 + 0.05, along + w / 2 - 0.05, y - h / 2 + 0.05, y + h / 2 - 0.05, 0.035, 0.038, canvas)
    face_box(side, 'fabric', along - w / 2 + 0.05, along + w / 2 - 0.05, y - h / 2 + 0.05, y - 0.02, 0.038, 0.04, shade(canvas, 0.7))


def lamp(x, y, z):
    cyl('brass', x, z, y, y + 0.02, 0.07, 12)
    cyl('brass', x, z, y + 0.02, y + 0.14, 0.035, 10, r1=0.065)
    cyl('brass', x, z, y + 0.14, y + 0.18, 0.065, 12, r1=0.03)
    cyl('fabric', x, z, y + 0.18, y + 0.36, 0.045, 12, (1.3, 1.25, 1.1), r1=0.03)


def book_row(x0, x1, y, zc, depth, along='x'):
    s = x0
    while s < x1 - 0.03:
        t = rng.uniform(0.025, 0.06)
        h = rng.uniform(0.18, 0.27)
        col = rng.choice(((0.45, 0.12, 0.1), (0.15, 0.25, 0.2), (0.55, 0.42, 0.24), (0.2, 0.18, 0.32), (0.35, 0.22, 0.14)))
        if along == 'x':
            box('fabric', s, s + t - 0.004, y, y + h, zc - depth / 2, zc + depth / 2, col)
        else:
            box('fabric', zc - depth / 2, zc + depth / 2, y, y + h, s, s + t - 0.004, col)
        s += t


def build_dressing():
    rooms = {r[0]: r for r in ROOMS}
    # Curtains on every window, from the room each faces.
    for room in ROOMS:
        name, x0, x1, z0, z1, yf, yc = room
        for side, a, b in ((('x', z0, 1), x0, x1), (('x', z1, -1), x0, x1), (('z', x0, 1), z0, z1), (('z', x1, -1), z0, z1)):
            axis, face, n = side
            for w in WALLS:
                if w['axis'] != axis or abs(w['line'] - (face - n * T2)) > 0.06:
                    continue
                for o in w['openings']:
                    if not o['door'] and a < o['a'] < b and yf < o['lo'] < yc:
                        curtains(side, o, room)
    # Rugs.
    rug(-8.7, -5.3, -0.9, 3.1, F, RUG_A)
    rug(-0.65, 0.65, -4.2, 6.3, F, RUG_C)
    rug(6.9, 10.3, 0.7, 3.3, F, RUG_B)
    rug(-8.0, -6.0, -2.4, 0.6, U, RUG_B)
    rug(9.1, 10.2, 2.6, 5.4, U, RUG_C)
    rug(9.1, 10.2, -4.6, -2.0, U, RUG_C)
    rug(-2.8, 2.6, -1.8, 0.6, U, RUG_A)
    # Pictures.
    picture(('x', -5.24, 1), -9.2, F + 1.75, 0.7, 0.5, (0.55, 0.6, 0.5))
    picture(('z', -4.11, -1), 1.6, F + 1.8, 0.5, 0.62, (0.4, 0.34, 0.26))
    picture(('x', -5.24, 1), 0.3, F + 1.75, 0.9, 0.6, (0.62, 0.55, 0.42))
    picture(('z', 11.89, -1), 2.2, F + 1.75, 0.8, 0.55, (0.5, 0.52, 0.56))
    picture(('z', 5.31, 1), 3.2, U + 1.65, 0.55, 0.45, (0.6, 0.5, 0.45))
    picture(('z', -10.39, 1), -0.9, U + 1.9, 0.6, 0.8, (0.45, 0.5, 0.42))
    picture(('x', -5.24, 1), -2.2, U + 1.7, 0.5, 0.4, (0.66, 0.6, 0.5))
    # Hall: wall clock, coat pegs with hats, a boot bench.
    face_box(('x', -5.24, 1), 'timber', -0.25, 0.25, F + 1.4, F + 2.2, 0, 0.14, (1.2, 0.9, 0.6))
    cyl('paint', 0.0, -5.24 + 0.15, F + 1.9, F + 1.9 + 0.001, 0.14, 16, CREAM)
    face_box(('x', -5.24, 1), 'paint', -0.14, 0.14, F + 1.76, F + 2.04, 0.14, 0.145, CREAM)
    face_box(('x', -5.24, 1), 'brass', -0.02, 0.02, F + 1.45, F + 1.7, 0.1, 0.12, (1, 1, 1))
    face_box(('z', -3.89, 1), 'timber', 5.9, 6.8, F + 1.62, F + 1.72, 0, 0.03, (1.1, 0.9, 0.7))
    for i, z in enumerate((6.0, 6.3, 6.6)):
        box('timber', -3.86, -3.76, F + 1.66, F + 1.69, z - 0.015, z + 0.015)
        if i != 1:
            cyl('fabric', -3.72, z, F + 1.52, F + 1.6, 0.17, 14, (0.38, 0.3, 0.22))
            cyl('fabric', -3.72, z, F + 1.6, F + 1.72, 0.09, 12, (0.34, 0.27, 0.2))
    box('fabric', -3.84, -3.72, F + 0.95, F + 1.62, 6.12, 6.42, (0.32, 0.28, 0.24))
    # Parlor: bookcase on the partition, rocking chair, lamp.
    bx0, bx1, bz0, bz1 = -4.43, -4.11, 1.35, 2.45
    box('timber', bx0, bx1, F, F + 1.9, bz0, bz0 + 0.04, (1.1, 0.95, 0.8))
    box('timber', bx0, bx1, F, F + 1.9, bz1 - 0.04, bz1, (1.1, 0.95, 0.8))
    box('timber', bx0 - 0.02, bx1, F + 1.9, F + 1.95, bz0 - 0.02, bz1 + 0.02, (1.1, 0.95, 0.8))
    box('timber', bx1 - 0.02, bx1, F, F + 1.9, bz0, bz1)
    for i in range(5):
        y = F + 0.08 + i * 0.37
        box('timber', bx0, bx1, y - 0.03, y, bz0, bz1, (1.1, 0.95, 0.8))
        if i < 4:
            book_row(bz0 + 0.06, bz1 - 0.06, y, (bx0 + bx1) / 2 + 0.02, 0.2, along='z')
    rocker(-8.2, F, -1.35, 2.7)
    lamp(-7.0, F + 0.76, 1.2)
    lamp(8.6, F + 0.76, 2.0)
    lamp(-1.8, U + 0.76, -4.4)
    lamp(-9.9, U + 0.95, 3.4)
    # Kitchen curtainless shelf of tins over the cupboard is the kit's.


def rocker(x, y, z, yaw):
    """A rocking chair; local +Z is its front."""
    c, s = math.cos(yaw), math.sin(yaw)
    def at(lx, ly, lz):
        return (x + lx * c + lz * s, y + ly, z - lx * s + lz * c)
    fwd = Vector((s, 0, c))
    right = Vector((c, 0, -s))
    up = Vector((0, 1, 0))
    wood = (0.95, 0.7, 0.5)
    for lx in (-0.24, 0.24):
        pts = [at(lx, 0.06 + 0.05 * (u * u), 0.42 * u) for u in (-1, -0.5, 0, 0.5, 1)]
        for p, q in zip(pts, pts[1:]):
            beam('timber', p, q, 0.035, 0.035, wood, up=tuple(right))
        for lz, top in ((0.22, 0.46), (-0.2, 1.05)):
            beam('timber', at(lx, 0.07, lz), at(lx, top, lz - (0.12 if top > 0.6 else 0)), 0.04, 0.04, wood)
        beam('timber', at(lx, 0.62, 0.26), at(lx, 0.64, -0.22), 0.05, 0.04, wood)
    obox('timber', at(0, 0.44, 0.02), (right, up, fwd), (0.25, 0.02, 0.22), wood)
    obox('fabric', at(0, 0.47, 0.02), (right, up, fwd), (0.22, 0.015, 0.19), (0.55, 0.16, 0.14))
    for i in range(5):
        lx = -0.18 + i * 0.09
        beam('timber', at(lx, 0.47, -0.22), at(lx, 1.0, -0.33), 0.035, 0.015, wood)
    beam('timber', at(-0.26, 1.02, -0.34), at(0.26, 1.02, -0.34), 0.06, 0.04, wood)


# ---------------------------------------------------------------------------

def realise():
    scene = bpy.context.scene
    for o in list(scene.objects):
        if o.get('ranch_interior'):
            bpy.data.objects.remove(o, do_unlink=True)
    for name, a in ACC.items():
        mat = bpy.data.materials.get('Interior_' + name) or bpy.data.materials.new('Interior_' + name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        attr = mat.node_tree.nodes.get('Tint') or mat.node_tree.nodes.new('ShaderNodeVertexColor')
        attr.name = 'Tint'
        attr.layer_name = 'Col'
        mix = mat.node_tree.nodes.get('TintMix') or mat.node_tree.nodes.new('ShaderNodeMix')
        mix.name = 'TintMix'
        mix.data_type = 'RGBA'
        mix.blend_type = 'MULTIPLY'
        mix.inputs['Factor'].default_value = 1.0
        mix.inputs[6].default_value = (*MATERIALS[name], 1)
        mat.node_tree.links.new(attr.outputs['Color'], mix.inputs[7])
        mat.node_tree.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
        bsdf.inputs['Roughness'].default_value = 0.85
        mat.diffuse_color = (*MATERIALS[name], 1)
        mesh = bpy.data.meshes.new('Interior ' + name)
        mesh.from_pydata([point(v) for v in a.verts], [], a.faces)
        col = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        k = 0
        for poly, tint in zip(mesh.polygons, a.colors):
            for li in poly.loop_indices:
                col.data[li].color = (*tint, 1)
        mesh.update()
        obj = bpy.data.objects.new('Interior ' + name, mesh)
        scene.collection.objects.link(obj)
        obj.data.materials.append(mat)
        obj['ranch_interior'] = True
    print('Interior batches:', {n: len(a.faces) for n, a in ACC.items()})


def build():
    global ACC, LINED
    ACC, LINED = {}, set()
    rng.seed(1887)
    scene = bpy.data.scenes.get(SCENE) or bpy.data.scenes.new(SCENE)
    bpy.context.window.scene = scene
    build_floors()
    build_walls()
    build_ceilings()
    build_stair()
    build_fireplace()
    build_kitchen()
    build_dressing()
    realise()


def export():
    scene = bpy.data.scenes[SCENE]
    batches = {}
    for o in scene.objects:
        if o.type != 'MESH' or not o.get('ranch_interior'):
            continue
        mesh = o.data
        mesh.calc_loop_triangles()
        key = o.data.materials[0].name.removeprefix('Interior_').split('.')[0]
        col = mesh.color_attributes['Col'].data
        b = batches.setdefault(key, {'position': [], 'color': [], 'index': [], 'lookup': {}})
        for tri in mesh.loop_triangles:
            n = o.matrix_world.to_3x3() @ tri.normal
            n.normalize()
            # The normal only keeps faces from sharing vertices; the game
            # recomputes it, exactly, from the unshared flat faces.
            normal = (round(n.x, 3), round(n.z, 3), round(-n.y, 3))
            for vi, li in zip(tri.vertices, tri.loops):
                v = o.matrix_world @ mesh.vertices[vi].co
                c = col[li].color
                # Millimetres and hundredths of a tint: integers keep the
                # bundled JSON about half the size of rounded floats.
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
    target = ROOT / 'src/models/ranch-interior.json'
    target.write_text(json.dumps({'generator': 'scripts/blender-ranch/interior.py', 'units': {'position': 0.001, 'color': 0.01}, 'batches': batches}, separators=(',', ':')))
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT / 'scripts/blender-ranch/ranch-remodel.blend'))
    print('Exported', sum(len(b['index']) // 3 for b in batches.values()), 'triangles;', len(batches), 'batches;',
          round(target.stat().st_size / 1e6, 2), 'MB')
