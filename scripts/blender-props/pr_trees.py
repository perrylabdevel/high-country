"""The tree kit: authored trunks and snags for src/vegetation.js.

Solid tree parts only — they bake through the same atlas pipeline as the
props. Foliage cards are a separate problem (alpha cards with vertex AO,
tangents and the wind contract) and are not built here.

Frames match the procedural geometry they replace, so the instance matrices
in vegetation.js keep their meaning:
  burnt_snag  base at the origin, 5.2 m to the broken top, trunk radius 0.26
              at breast height; vegetation scales it (girth, 0.55-0.95 x
              height, girth).
Same conventions as pr_props (metres, Z up, front -Y).
"""

import math

from mathutils import Matrix, Vector

from pr_common import Prop


def _rand(seed):
    x = math.sin(seed * 39.113) * 43758.5453
    return x - math.floor(x)


def burnt_snag():
    """A fire-killed pine: bark burnt to alligator char low down, weathered
    grey wood above where it has sloughed off, limbs burnt back to stubs, the
    top snapped off in a splintered spike, roots flared into the ash."""
    p = Prop("burnt_snag", seed=1001)
    H = 5.2
    # Root flare into the trunk, charred; jittered so the base is not a lathe.
    p.lathe([(0.44, -0.12), (0.4, 0.05), (0.31, 0.3), (0.27, 0.7), (0.25, 1.6), (0.22, 2.8)], sides=10, kind="char", cap_bottom=False, cap_top=False, jitter=0.1)
    # Upper stem: sloughed, sun-greyed wood, tapering to the break.
    p.lathe([(0.22, 2.8), (0.17, 4.1), (0.12, 4.85)], sides=10, kind="wood_grey", cap_bottom=False, cap_top=False, jitter=0.06)
    # Char tongues licking up the grey wood on the windward side.
    for k in range(3):
        a = -0.6 + k * 0.55
        z0 = 2.6 + 0.2 * k
        h = 0.9 + 0.5 * _rand(k)
        r = 0.2 - 0.015 * k
        with p.at(Matrix.Translation((math.cos(a) * r, math.sin(a) * r, z0 + h / 2)) @ Matrix.Rotation(a, 4, "Z")):
            p.box((0.02, 0.11, h), kind="char", grain="z", bevel=0.004)
    # Splintered break: three spikes of differing length off the stem top.
    for k, (dx, dy, top, lean) in enumerate(((0.03, 0.02, H, 0.05), (-0.05, 0.04, 5.0 - 0.1, -0.12), (0.02, -0.06, 4.95, 0.15))):
        with p.at(Matrix.Translation((dx, dy, 4.8)) @ Matrix.Rotation(lean, 4, "Y") @ Matrix.Rotation(lean * 0.5, 4, "X")):
            p.lathe([(0.07, 0.0), (0.035, top - 4.95), (0.0, top - 4.8)], sides=5, kind="wood_grey", cap_bottom=False)
    # Branch stubs, burnt back: shorter and thinner up the stem, drooping.
    stubs = 11
    for i in range(stubs):
        f = 0.3 + (i / stubs) * 0.6
        z = H * f
        ln = (0.55 - f * 0.35) * (0.6 + 0.8 * _rand(i * 3 + 1))
        r = (0.06 - f * 0.03) * (0.8 + 0.5 * _rand(i * 5 + 2))
        a = _rand(i * 7 + 3) * 2 * math.pi
        droop = -0.2 - 0.5 * _rand(i * 11 + 4)
        stem_r = 0.25 - 0.13 * max(0.0, (z - 1.6) / 3.25)
        base = Vector((math.cos(a) * stem_r * 0.8, math.sin(a) * stem_r * 0.8, z))
        d = Vector((math.cos(a) * math.cos(droop), math.sin(a) * math.cos(droop), math.sin(droop)))
        mid = base + d * ln * 0.55
        tip = base + d * ln + Vector((0, 0, -0.03))
        p.tube([tuple(base), tuple(mid), tuple(tip)], [r, r * 0.8, r * 0.6], sides=5, kind="char" if z < 3.0 else "wood_grey")
    # Three surface roots into the ground.
    for k in range(4):
        a = k * math.pi / 2 + _rand(k + 40) * 0.8
        c, s = math.cos(a), math.sin(a)
        p.tube([(c * 0.25, s * 0.25, 0.25), (c * 0.6, s * 0.6, 0.05), (c * 1.0, s * 1.0, -0.06)], [0.11, 0.07, 0.02], sides=5, kind="char")
    return p


BUILDERS = (burnt_snag,)
