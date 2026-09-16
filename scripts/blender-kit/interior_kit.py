"""Shared machinery for Blender-authored town interiors.

The hotel was the first interior built from a contract plus a layout snapshot
(scripts/blender-hotel). The store and the sheriff need the same machinery:
wall finishes cut round the kit's real openings, casings, floors and ceilings
round a stairwell, a stair with its balustrade and spandrel, board partitions
with cased doorways, curtains, rugs, lamps, and the batch export. Three copies
of that would drift apart, so it lives here once, parameterised by the
building's contract.

    K = runpy.run_path('<repo>/scripts/blender-kit/interior_kit.py')['make'](
        CONTRACT, H, TINTS, tag=..., target=..., generator=..., seed=...,
        material_prefix=..., object_prefix=...)

`H` is the building's exterior script namespace (its box/solid/cylinder/text,
ACC/acc, point, LAYOUT, ROOT, SCENE, MATERIALS). The returned namespace holds
every helper, bound to that contract; a building script adds only what is its
own (a reception desk, a counter) and its build order.

Extracted verbatim from scripts/blender-hotel/interior.py. The refactor was
accepted only because re-exporting the hotel through it reproduced
src/models/hotel-interior.json byte for byte: same geometry, same tints, same
random sequence (the rng is seeded here and consumed in build order).
"""
import bpy, json, math, random


def make(CONTRACT, H, TINTS, *, tag, target, generator, seed, material_prefix, object_prefix,
         extra_materials=None):
    box, solid, cylinder, text = H['box'], H['solid'], H['cylinder'], H['text']
    ACC, acc, point = H['ACC'], H['acc'], H['point']
    LAYOUT, ROOT, SCENE = H['LAYOUT'], H['ROOT'], H['SCENE']
    TAG = tag
    target = ROOT / target

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

    F, C, U, UC = CONTRACT['FLOOR'], CONTRACT['CEIL'], CONTRACT['UPPER'], CONTRACT['UPPER_CEIL']
    X, Z = CONTRACT['INNER']['x'], CONTRACT['INNER']['z']
    ST = CONTRACT['STAIR']
    RISE = (U - F) / ST['risers']
    TREAD = (ST['z1'] - ST['z0']) / (ST['risers'] - 1)
    WX0, WX1, WZ0, WZ1 = ST['well']
    DOOR = CONTRACT['DOOR']
    rng = random.Random(seed)

    MATERIALS = dict(H['MATERIALS'])
    MATERIALS.update(extra_materials or {
        'floor': (0.90, 0.80, 0.66), 'timber': (0.88, 0.78, 0.64),
        'fabric': (0.86, 0.84, 0.80), 'brass': (0.80, 0.66, 0.34),
    })
    BOARD, WAINSCOT = TINTS['BOARD'], TINTS['WAINSCOT']
    PAPER, PAPER_STRIPE = TINTS['PAPER'], TINTS['PAPER_STRIPE']
    UP_PAPER, UP_STRIPE = TINTS['UP_PAPER'], TINTS['UP_STRIPE']
    GILT, TRIM, MAHOGANY, CREAM = TINTS['GILT'], TINTS['TRIM'], TINTS['MAHOGANY'], TINTS['CREAM']
    CEILING, RUG_FIELD, RUG_BORDER = TINTS['CEILING'], TINTS['RUG_FIELD'], TINTS['RUG_BORDER']
    CURTAIN, BRASS = TINTS['CURTAIN'], TINTS['BRASS']

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
        a = acc(mat)
        corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
        loops = [[(cx + h * sx, y, cz + h * sz) for sx, sz in corners] for y, h in rings]
        a.face(loops[0][::-1], tint)
        a.face(loops[-1], tint)
        for lo, hi in zip(loops, loops[1:]):
            for k in range(4):
                j = (k + 1) % 4
                a.face([lo[k], lo[j], hi[j], hi[k]], tint)


    def baluster(y0, y1):
        h = y1 - y0
        return [(y0, 0.028), (y0 + 0.06 * h, 0.028), (y0 + 0.09 * h, 0.02), (y0 + 0.3 * h, 0.024),
                (y0 + 0.5 * h, 0.016), (y0 + 0.78 * h, 0.022), (y0 + 0.92 * h, 0.028), (y1, 0.028)]


    # ---------------------------------------------------------------- wall frame
    # Room-facing wall planes. `n` measures into the room.
    WALLS = {
        'front': ('x', Z, -1), 'back': ('x', -Z, 1),
        'west': ('z', -X, 1), 'east': ('z', X, -1),
    }


    def openings(wall):
        """Openings on a wall in wall u (lot x for front/back), from the interior
        shell's own frame -- its centre sits at Z + 0.11."""
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
        axis, plane, sign = WALLS[wall]
        if axis == 'x':
            solid(mat, tint, [(u0, v, plane + sign * n) for v, n in pts_vn],
                  [(u1, v, plane + sign * n) for v, n in pts_vn])
        else:
            solid(mat, tint, [(plane + sign * n, v, u0) for v, n in pts_vn],
                  [(plane + sign * n, v, u1) for v, n in pts_vn])


    def wall_span(wall):
        return (-X, X) if WALLS[wall][0] == 'x' else (-Z, Z)


    def finish_wall(wall, y0, y1, holes, scheme):
        """Skirting, optional beadboard wainscot, striped paper, picture rail and
        crown, from y0 to y1, cut round holes (u0, u1, v0, v1)."""
        ua, ub = wall_span(wall)
        paper, stripe, wains = scheme
        base = y0
        cap = base + 1.0 if wains else base
        for u0, u1 in runs(ua, ub, [(h[0], h[1]) for h in holes if h[2] < base + 0.2]):
            wbox(wall, u0, u1, base, base + 0.2, 0, 0.025, 'timber', TRIM)
            wprofile(wall, [(base + 0.2, 0), (base + 0.2, 0.025), (base + 0.24, 0)], u0, u1, 'timber', TRIM)
        if wains:
            n = max(1, int((ub - ua) / 0.11))
            for i in range(n):
                u0 = ua + i * (ub - ua) / n
                u1 = u0 + (ub - ua) / n
                cuts = [(h[2], h[3]) for h in holes if h[0] < u1 and h[1] > u0]
                for v0, v1 in runs(base + 0.2, cap, cuts):
                    wbox(wall, u0 + 0.004, u1 - 0.004, v0, v1, 0, 0.015, 'timber',
                         tuple(c * (0.92 + 0.12 * rng.random()) for c in WAINSCOT))
            for u0, u1 in runs(ua, ub, [(h[0], h[1]) for h in holes if h[2] < cap + 0.08 and h[3] > cap]):
                wprofile(wall, [(cap, 0), (cap, 0.045), (cap + 0.05, 0.045), (cap + 0.08, 0)], u0, u1, 'timber', TRIM)
        top = y1 - 0.16
        n = max(1, int((ub - ua) / 0.3))
        for i in range(n):
            u0 = ua + i * (ub - ua) / n
            u1 = u0 + (ub - ua) / n
            cuts = [(h[2], h[3]) for h in holes if h[0] < u1 and h[1] > u0]
            for v0, v1 in runs(cap + 0.08 if wains else base + 0.24, top, cuts):
                wbox(wall, u0, u0 + (u1 - u0) * 0.62, v0, v1, 0, 0.006, 'paint', paper)
                wbox(wall, u0 + (u1 - u0) * 0.62, u1 - 0.012, v0, v1, 0, 0.006, 'paint', stripe)
                wbox(wall, u1 - 0.012, u1, v0, v1, 0, 0.008, 'paint', GILT)
        for u0, u1 in runs(ua, ub, [(h[0], h[1]) for h in holes if h[3] > top - 0.3]):
            wprofile(wall, [(top - 0.3, 0), (top - 0.26, 0.03), (top - 0.24, 0)], u0, u1, 'timber', TRIM)
        wprofile(wall, [(top, 0), (y1, 0), (y1, 0.16), (y1 - 0.05, 0.12), (top + 0.04, 0.03)], ua, ub, 'timber', TRIM)


    def casing(wall, o, y_base, depth=0.22):
        """Architrave on the room face, jamb linings through the reveal, and a
        stool and apron under a window."""
        u, w, v0, h = o['x'], o['w'], y_base, o['h']
        v1 = v0 + h
        is_door = v0 - (F if v0 < U - 1 else U) < 0.05
        for s in (-1, 1):
            e = u + s * w / 2
            wbox(wall, min(e, e + s * 0.13), max(e, e + s * 0.13),
                 v0 if not is_door else v0 - 0.02, v1 + 0.13, 0, 0.035, 'timber', TRIM)
            wbox(wall, min(e, e - s * 0.02), max(e, e - s * 0.02), v0, v1, -depth, 0, 'timber', TRIM)
        wbox(wall, u - w / 2 - 0.16, u + w / 2 + 0.16, v1 + 0.13, v1 + 0.24, 0, 0.05, 'timber', TRIM)
        wbox(wall, u - w / 2, u + w / 2, v1 - 0.02, v1, -depth, 0, 'timber', TRIM)
        if not is_door:
            wbox(wall, u - w / 2 - 0.1, u + w / 2 + 0.1, v0 - 0.035, v0, -depth, 0.07, 'timber', TRIM)
            wbox(wall, u - w / 2, u + w / 2, v0 - 0.2, v0 - 0.035, 0, 0.025, 'timber', TRIM)


    def hole(o, v0, pad=0.14):
        return (o['x'] - o['w'] / 2 - pad, o['x'] + o['w'] / 2 + pad, v0 - 0.22, v0 + o['h'] + 0.26)


    def walls():
        front, back = openings('front'), openings('back')
        low = lambda o: o['fromFloor'] < U - 0.5
        for wall, ops in (('front', [o for o in front if low(o)]), ('back', [o for o in back if low(o)]),
                          ('west', []), ('east', [])):
            holes = [hole(o, max(F, o['fromFloor'])) for o in ops]
            finish_wall(wall, F, C, holes, (PAPER, PAPER_STRIPE, True))
            for o in ops:
                casing(wall, o, max(F, o['fromFloor']))
        for wall, ops in (('front', [o for o in front if not low(o)]), ('back', [o for o in back if not low(o)]),
                          ('west', []), ('east', [])):
            holes = [hole(o, o['fromFloor']) for o in ops]
            finish_wall(wall, U, UC, holes, (UP_PAPER, UP_STRIPE, False))
            for o in ops:
                casing(wall, o, o['fromFloor'])
        # Thresholds: the street door onto the boardwalk, the gallery door onto the deck.
        for o in front:
            if o['fromFloor'] < 0.01:
                box('floor', BOARD, o['x'] - o['w'] / 2, o['x'] + o['w'] / 2, F - 0.03, F + 0.012, Z, Z + 0.33)
            elif o.get('class') == 'door':
                box('floor', BOARD, o['x'] - o['w'] / 2, o['x'] + o['w'] / 2, U - 0.03, U + 0.012, Z, Z + 0.33)
        return front, back


    # ---------------------------------------------------------------- floors, ceilings
    def floor_boards(y, rects, tint=BOARD):
        """Boards running toward the street, 0.14 wide, butt joints staggered."""
        for x0, x1, z0, z1 in rects:
            n = max(1, int(round((x1 - x0) / 0.14)))
            for i in range(n):
                a = x0 + i * (x1 - x0) / n
                b = a + (x1 - x0) / n
                joint = z0 + ((i * 7) % 5) * 0.9 + 0.4
                cuts = [z0] + [j for j in (joint, joint + 3.6) if z0 < j < z1] + [z1]
                for c0, c1 in zip(cuts, cuts[1:]):
                    t = tuple(c * (0.86 + 0.2 * rng.random()) for c in tint)
                    box('floor', t, a + 0.003, b - 0.003, y - 0.022, y, c0 + 0.002, c1 - 0.002)


    def board_ceiling(y, rects, tint=CEILING):
        """Beaded boards on the underside of a floor, running across the room."""
        for x0, x1, z0, z1 in rects:
            n = max(1, int((z1 - z0) / 0.16))
            for k in range(n):
                a = z0 + k * (z1 - z0) / n
                box('paint', tuple(c * (0.94 + 0.08 * rng.random()) for c in tint),
                    x0, x1, y - 0.02, y, a + 0.004, a + (z1 - z0) / n - 0.004)


    def around_well():
        """The upper floor, and so the ground ceiling, is the plan minus the well."""
        return [(WX1, X, -Z, Z), (-X, WX1, WZ1, Z), (-X, WX1, -Z, WZ0)]


    def floors_and_ceilings():
        floor_boards(F, [(-X, X, -Z, Z)])
        board_ceiling(C, around_well())
        floor_boards(U, around_well())
        board_ceiling(UC, [(-X, X, -Z, Z)])
        # Well edges: a fascia on the slab edge, a nosing at the upper floor.
        box('timber', TRIM, WX1 - 0.02, WX1 + 0.03, C - 0.14, U, WZ0, WZ1)
        box('timber', TRIM, WX0, WX1 + 0.03, C - 0.14, U, WZ0 - 0.03, WZ0 + 0.02)
        box('floor', BOARD, WX0, WX1, U - 0.03, U + 0.012, WZ1 - 0.02, WZ1 + 0.06)


    # ---------------------------------------------------------------- stair
    def stair():
        x0, x1, z0, z1, n = ST['x0'], ST['x1'], ST['z0'], ST['z1'], ST['risers']
        for k in range(1, n):
            za, zb = z0 + (k - 1) * TREAD, z0 + k * TREAD
            y = F + k * RISE
            box('timber', TRIM, x0, x1, y - 0.035, y, za - 0.03, zb)
            box('paint', CREAM, x0, x1 - 0.04, y - RISE, y - 0.035, za - 0.005, za + 0.02)
            box('timber', tuple(c * 0.8 for c in TRIM), x0, x1 - 0.04, max(F, y - RISE - 0.1), y - RISE, za, zb)
        box('paint', CREAM, x0, x1 - 0.04, F + (n - 1) * RISE, U - 0.035, z1 - 0.005, z1 + 0.02)
        # Wall stringer.
        solid('timber', TRIM,
              [(x0, F, z0 - 0.1), (x0, F + RISE + 0.28, z0 - 0.1), (x0, U + 0.28, z1), (x0, U - 0.2, z1), (x0, F, z0 + 0.4)],
              [(x0 + 0.04, F, z0 - 0.1), (x0 + 0.04, F + RISE + 0.28, z0 - 0.1), (x0 + 0.04, U + 0.28, z1),
               (x0 + 0.04, U - 0.2, z1), (x0 + 0.04, F, z0 + 0.4)])
        # Open stringer.
        sx = x1 - 0.04
        solid('timber', TRIM, [(sx, F, z0 - 0.03), (sx, F + RISE, z0 - 0.03), (sx, U, z1), (sx, U - 0.3, z1)],
              [(x1 + 0.01, F, z0 - 0.03), (x1 + 0.01, F + RISE, z0 - 0.03), (x1 + 0.01, U, z1), (x1 + 0.01, U - 0.3, z1)])
        # Spandrel: beaded boards under the stringer, with a closet door near the foot.
        door_z = (z0 + 0.35, z0 + 1.15)
        for i in range(int((z1 - z0) / 0.11)):
            za = z0 + i * 0.11
            zb = za + 0.107
            ytop = F + max(0.0, (zb - z0) / TREAD) * RISE - 0.05
            if ytop <= F + 0.05:
                continue
            cuts = [(F, F + 1.95)] if door_z[0] < za < door_z[1] else []
            for v0, v1 in runs(F, min(ytop, C - 0.14), cuts):
                box('timber', tuple(c * (0.92 + 0.12 * rng.random()) for c in WAINSCOT), x1 - 0.03, x1, v0, v1, za, zb)
        box('timber', MAHOGANY, x1 - 0.02, x1 + 0.01, F, F + 1.95, door_z[0], door_z[1])
        for v0, v1 in ((F + 0.15, F + 0.85), (F + 1.0, F + 1.8)):
            box('timber', tuple(c * 1.1 for c in MAHOGANY), x1 + 0.01, x1 + 0.03, v0, v1, door_z[0] + 0.1, door_z[1] - 0.1)
        box('brass', BRASS, x1 + 0.03, x1 + 0.06, F + 0.95, F + 1.0, door_z[1] - 0.14, door_z[1] - 0.08)
        # Balustrade: newel, raked handrail, two turned balusters per tread.
        rail = 0.9
        bx = x1 - 0.06
        square_post('timber', MAHOGANY, bx, z0 - 0.12,
                    [(F, 0.075), (F + 0.3, 0.075), (F + 0.3, 0.06), (F + 1.05, 0.06), (F + 1.05, 0.08), (F + 1.14, 0.08)])
        lathe('timber', MAHOGANY, bx, z0 - 0.12, [(F + 1.14, 0.07), (F + 1.2, 0.07), (F + 1.26, 0.03)], 8)
        for k in range(1, n):
            for f in (0.25, 0.75):
                z = z0 + (k - 1 + f) * TREAD
                y = F + k * RISE
                lathe('timber', CREAM, bx, z, baluster(y, F + RISE * ((z - z0) / TREAD + 0.5) + rail - 0.04), 6)
        ya = F + RISE * 0.5 + rail
        yb = F + RISE * ((z1 - z0) / TREAD + 0.5) + rail
        solid('timber', MAHOGANY,
              [(bx - 0.04, ya, z0 - 0.12), (bx + 0.04, ya, z0 - 0.12), (bx + 0.04, ya + 0.07, z0 - 0.12), (bx - 0.04, ya + 0.07, z0 - 0.12)],
              [(bx - 0.04, yb, z1), (bx + 0.04, yb, z1), (bx + 0.04, yb + 0.07, z1), (bx - 0.04, yb + 0.07, z1)])



    # ---------------------------------------------------------------- partitions
    def partitions():
        for p in CONTRACT['PARTITIONS']:
            doors = sorted(p['doors'])
            cuts = [(d - DOOR['w'] / 2, d + DOOR['w'] / 2) for d in doors]
            for a, b in runs(p['from'], p['to'], cuts):
                for side in (-1, 1):
                    face = p['at'] + side * 0.06
                    n = max(1, int((b - a) / 0.16))
                    for k in range(n):
                        ua = a + k * (b - a) / n
                        ub = ua + (b - a) / n
                        t = tuple(c * (0.95 + 0.08 * rng.random()) for c in UP_PAPER)
                        if p['axis'] == 'x':
                            box('paint', t, ua + 0.003, ub - 0.003, U, UC, min(face, p['at']), max(face, p['at']))
                        else:
                            box('paint', t, min(face, p['at']), max(face, p['at']), U, UC, ua + 0.003, ub - 0.003)
                    if p['axis'] == 'x':
                        box('timber', TRIM, a, b, U, U + 0.18, *sorted((face, face + side * 0.02)))
                    else:
                        box('timber', TRIM, *sorted((face, face + side * 0.02)), U, U + 0.18, a, b)
            for d in doors:
                h = U + DOOR['h']
                if p['axis'] != 'x':
                    continue
                # Head over the doorway, casings on both faces, jamb linings.
                box('paint', UP_PAPER, d - DOOR['w'] / 2, d + DOOR['w'] / 2, h, UC, p['at'] - 0.06, p['at'] + 0.06)
                for side in (-1, 1):
                    zf = p['at'] + side * 0.06
                    for s in (-1, 1):
                        e = d + s * DOOR['w'] / 2
                        box('timber', TRIM, min(e, e + s * 0.1), max(e, e + s * 0.1), U, h + 0.1, *sorted((zf, zf + side * 0.03)))
                    box('timber', TRIM, d - DOOR['w'] / 2 - 0.1, d + DOOR['w'] / 2 + 0.1, h, h + 0.12, *sorted((zf, zf + side * 0.035)))
                for s in (-1, 1):
                    box('timber', TRIM, d + s * DOOR['w'] / 2 - (0.02 if s > 0 else 0),
                        d + s * DOOR['w'] / 2 + (0.02 if s < 0 else 0), U, h, p['at'] - 0.06, p['at'] + 0.06)
                # Leaf folded 90 degrees into the room (toward -z), along the hinge jamb.
                hx = d - DOOR['w'] / 2 + 0.03
                box('timber', MAHOGANY, hx, hx + 0.045, U + 0.01, h - 0.02, p['at'] - 0.06 - DOOR['w'] + 0.04, p['at'] - 0.06)
                for v0, v1 in ((U + 0.15, U + 0.95), (U + 1.1, h - 0.15)):
                    box('timber', tuple(c * 1.12 for c in MAHOGANY), hx + 0.045, hx + 0.06, v0, v1,
                        p['at'] - DOOR['w'] + 0.02, p['at'] - 0.18)
                box('brass', BRASS, hx + 0.06, hx + 0.1, U + 0.98, U + 1.03, p['at'] - DOOR['w'] + 0.06, p['at'] - DOOR['w'] + 0.12)
        # Room numbers on the hall side.
        hall = CONTRACT['PARTITIONS'][0]
        for d, label in zip(sorted(hall['doors']), ('1', '2', '3')):
            zf = hall['at'] + 0.06
            box('brass', BRASS, d - 0.09, d + 0.09, U + 2.28, U + 2.48, zf + 0.03, zf + 0.04)



    # ---------------------------------------------------------------- dressing
    def curtains(wall, o):
        """A pair of drawn-back curtains on a rod above a window."""
        u, w = o['x'], o['w']
        v1 = o['fromFloor'] + o['h']
        wbox(wall, u - w / 2 - 0.3, u + w / 2 + 0.3, v1 + 0.3, v1 + 0.33, 0.07, 0.1, 'brass', BRASS)
        for s in (-1, 1):
            e = u + s * (w / 2 + 0.05)
            wbox(wall, min(e, e + s * 0.28), max(e, e + s * 0.28), o['fromFloor'] - 0.1, v1 + 0.3, 0.02, 0.1, 'fabric', CURTAIN)


    def rug(x0, x1, z0, z1, y, field=RUG_FIELD, border=RUG_BORDER):
        box('fabric', border, x0, x1, y, y + 0.008, z0, z1)
        box('fabric', field, x0 + 0.12, x1 - 0.12, y + 0.008, y + 0.012, z0 + 0.12, z1 - 0.12)


    def hanging_lamp(x, z, ceiling, drop):
        y = ceiling - drop
        box('brass', BRASS, x - 0.008, x + 0.008, y + 0.12, ceiling, z - 0.008, z + 0.008)
        lathe('brass', BRASS, x, z, [(y, 0.02), (y + 0.04, 0.07), (y + 0.09, 0.07), (y + 0.12, 0.02)], 10)
        lathe('glass', (0.92, 0.86, 0.66), x, z, [(y - 0.16, 0.04), (y - 0.08, 0.06), (y, 0.03)], 10)
        lathe('fabric', (0.94, 0.88, 0.72), x, z, [(y - 0.22, 0.2), (y - 0.14, 0.12), (y - 0.12, 0.05)], 12)



    # ---------------------------------------------------------------- build / export
    def ensure_materials():
        mats = {}
        for name, base in MATERIALS.items():
            mat = bpy.data.materials.get(material_prefix + name) or bpy.data.materials.new(material_prefix + name)
            mat.use_nodes = True
            tree = mat.node_tree
            bsdf = tree.nodes.get('Principled BSDF')
            if bsdf is not None:
                attr = tree.nodes.get('HC Col') or tree.nodes.new('ShaderNodeVertexColor')
                attr.name = attr.label = 'HC Col'
                attr.layer_name = 'Col'
                mix = tree.nodes.get('HC Tint') or tree.nodes.new('ShaderNodeMix')
                mix.name = mix.label = 'HC Tint'
                mix.data_type = 'RGBA'
                mix.blend_type = 'MULTIPLY'
                mix.inputs['Factor'].default_value = 1.0
                mix.inputs[6].default_value = (*base, 1)
                tree.links.new(attr.outputs['Color'], mix.inputs[7])
                tree.links.new(mix.outputs[2], bsdf.inputs['Base Color'])
                bsdf.inputs['Roughness'].default_value = 0.4 if name in ('brass', 'glass') else 0.85
                if name == 'brass':
                    bsdf.inputs['Metallic'].default_value = 0.85
            mats[name] = mat
        return mats


    def _scene():
        return bpy.data.scenes.get(SCENE) or bpy.data.scenes.new(SCENE)



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
        target.write_text(json.dumps({
            'generator': generator,
            'units': {'position': 0.001, 'color': 0.01},
            'batches': batches
        }, separators=(',', ':')))
        print('Exported', sum(len(b['index']) // 3 for b in batches.values()), 'triangles;', len(batches), 'batches;', target)
        return str(target)


    def emit():
        """Turn the accumulated batches into tagged Blender objects."""
        scene = _scene()
        mats = ensure_materials()
        total = 0
        for name, batch in ACC.items():
            mesh = bpy.data.meshes.new(object_prefix + name)
            mesh.from_pydata([point(v) for v in batch.verts], [], batch.faces)
            mesh.update()
            col = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
            for poly, tint in zip(mesh.polygons, batch.tints):
                for li in poly.loop_indices:
                    col.data[li].color = (*tint, 1)
            mesh.materials.append(mats[name])
            obj = bpy.data.objects.new(object_prefix + name, mesh)
            obj[TAG] = True
            obj['material_batch'] = name
            scene.collection.objects.link(obj)
            total += len(batch.faces)
        print(object_prefix.strip() + ':', total, 'faces in', len(ACC), 'material batches')
        return scene

    def clear():
        scene = _scene()
        for obj in list(scene.objects):
            if obj.get(TAG):
                bpy.data.objects.remove(obj, do_unlink=True)
        ACC.clear()

    return {k: v for k, v in locals().items() if not k.startswith('__')}
