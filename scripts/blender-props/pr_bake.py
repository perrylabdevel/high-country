"""Shared atlas, procedural surface shaders, high->low bake, glTF export.

Outputs per kit (in /tmp/hc_props/tex): <prefix>_basecolor.png (sRGB),
<prefix>_normal.png (tangent, OpenGL +Y as glTF expects), <prefix>_orm.png
(R occlusion, G roughness, B metallic). Each kit's GLB carries one shared
material over every prop in it.
"""

import os

import bpy
import numpy as np

from pr_common import KINDS, collection

TEX = "/tmp/hc_props/tex"
RES = 2048
MODELS = "/Users/brian/Projects/high-country/public/models/props"
# kit: (glb path, texture prefix, material name)
KITS = {
    "western": (f"{MODELS}/western.glb", "props", "WesternProps"),
    "ranch": (f"{MODELS}/ranch.glb", "ranch", "RanchProps"),
    "trail": (f"{MODELS}/trail.glb", "trail", "TrailProps"),
    "mine": (f"{MODELS}/mine.glb", "mine", "MineProps"),
    "fort": (f"{MODELS}/fort.glb", "fort", "FortProps"),
    "camp": (f"{MODELS}/camp.glb", "camp", "CampProps"),
    "yard": (f"{MODELS}/yard.glb", "yard", "YardProps"),
    "landmark": (f"{MODELS}/landmark.glb", "landmark", "LandmarkProps"),
    "furniture": (f"{MODELS}/furniture.glb", "furniture", "FurnitureProps"),
    "trees": (f"{MODELS}/trees.glb", "trees", "TreeParts"),
}
SPACING = 8.0

# kind: (light, dark) base colours in linear RGB, roughness range
WOOD = {
    "wood": ((0.40, 0.28, 0.17), (0.17, 0.11, 0.06)),
    "wood_grey": ((0.43, 0.39, 0.33), (0.17, 0.15, 0.13)),
    "wood_dark": ((0.22, 0.15, 0.10), (0.08, 0.055, 0.035)),
    "stave": ((0.36, 0.22, 0.11), (0.15, 0.085, 0.04)),
    "board_grey": ((0.43, 0.39, 0.33), (0.17, 0.15, 0.13)),
    "sign_board": ((0.46, 0.42, 0.36), (0.19, 0.17, 0.14)),
    "paint_green": ((0.40, 0.30, 0.19), (0.17, 0.11, 0.06)),
    "paint_red": ((0.40, 0.30, 0.19), (0.17, 0.11, 0.06)),
    # Debarked logs: pale sapwood, weathered toward grey.
    "peeled": ((0.62, 0.52, 0.38), (0.36, 0.28, 0.19)),
}
# Faded period wagon paint over the wood (Studebaker green box, red gear).
PAINT = {"paint_green": (0.075, 0.13, 0.085), "paint_red": (0.29, 0.065, 0.035)}
# Seam spacing across the grain for board kinds.
SEAMS = {"stave": 0.095, "board_grey": 0.15}


def low_objects():
    return [o for o in collection().objects if not o.name.endswith("_HP") and o.type == "MESH"]


def lay_out():
    """Space props apart so no bake ray or AO sample sees a neighbour.

    Gaps are SPACING between footprints, not between origins: a fixed 8 m
    pitch overlapped the 12 m hoist house with its neighbours, and the AO
    pass would have baked each one's shadow onto the other."""
    cursor = 0.0
    for ob in sorted(low_objects(), key=lambda o: o.name):
        hp = bpy.data.objects[ob.name + "_HP"]
        xs = [v[0] for v in ob.bound_box]
        cursor += -min(xs)
        ob.location = hp.location = (cursor, 0, 0)
        cursor += max(xs) + SPACING
        ob.hide_render = False
        hp.hide_render = False
        hp.hide_set(False)


# --------------------------------------------------------------------------
# Shaders (on the high meshes)


class _G:
    """Tiny node-graph helper."""

    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.N, self.L = self.nt.nodes, self.nt.links

    def node(self, kind, **inputs):
        n = self.N.new(kind)
        for key, val in inputs.items():
            if key.startswith("_"):
                setattr(n, key[1:], val)
            else:
                self.set(n.inputs[key], val)
        return n

    def set(self, sock, val):
        if isinstance(val, bpy.types.NodeSocket):
            self.L.new(val, sock)
        else:
            sock.default_value = val

    def math(self, op, a, b=0.0, clamp=False):
        n = self.node("ShaderNodeMath", _operation=op, _use_clamp=clamp)
        self.set(n.inputs[0], a)
        self.set(n.inputs[1], b)
        return n.outputs[0]

    def mix(self, fac, a, b):
        n = self.node("ShaderNodeMix", _data_type="RGBA", _clamp_factor=True)
        # The Mix node carries float/vector/colour sockets under the same
        # names; address the colour ones by identifier.
        ins = {s.identifier: s for s in n.inputs}
        self.set(ins["Factor_Float"], fac)
        self.set(ins["A_Color"], a)
        self.set(ins["B_Color"], b)
        return {s.identifier: s for s in n.outputs}["Result_Color"]

    def smooth(self, v, lo, hi):
        n = self.node("ShaderNodeMapRange", _interpolation_type="SMOOTHSTEP")
        self.set(n.inputs["Value"], v)
        n.inputs["From Min"].default_value = lo
        n.inputs["From Max"].default_value = hi
        return n.outputs["Result"]

    def rgb(self, c):
        return (*c, 1.0)


def _surface(mat, kind):
    g = _G(mat)
    out = g.node("ShaderNodeOutputMaterial")
    bsdf = g.node("ShaderNodeBsdfPrincipled")
    g.L.new(bsdf.outputs[0], out.inputs[0])
    uvn = g.node("ShaderNodeUVMap", _uv_map="grain")
    sep = g.node("ShaderNodeSeparateXYZ")
    g.L.new(uvn.outputs["UV"], sep.inputs[0])
    u, v = sep.outputs["X"], sep.outputs["Y"]
    tint = g.node("ShaderNodeAttribute", _attribute_name="tint", _attribute_type="GEOMETRY").outputs["Fac"]
    tc = g.node("ShaderNodeTexCoord")
    obj = g.node("ShaderNodeSeparateXYZ")
    # Object space per prop: every prop is modelled at its own origin.
    g.L.new(tc.outputs["Object"], obj.inputs[0])
    z = obj.outputs["Z"]

    def stretched(su, sv, off=0.0):
        comb = g.node("ShaderNodeCombineXYZ")
        g.set(comb.inputs["X"], g.math("MULTIPLY", g.math("ADD", u, g.math("MULTIPLY", tint, 13.0 + off)), su))
        g.set(comb.inputs["Y"], g.math("MULTIPLY", v, sv))
        g.set(comb.inputs["Z"], g.math("MULTIPLY", tint, 7.0 + off))
        return comb.outputs[0]

    ground_dust = g.math("SUBTRACT", 1.0, g.smooth(z, 0.0, 0.3))
    grime = g.node("ShaderNodeTexNoise", Scale=2.5, Detail=4.0, Roughness=0.6)
    g.L.new(tc.outputs["Object"], grime.inputs["Vector"])
    grime_f = g.smooth(grime.outputs["Fac"], 0.45, 0.75)

    if kind in WOOD:
        light, dark = WOOD[kind]
        fibre = g.node("ShaderNodeTexNoise", Scale=2.5, Detail=6.0, Roughness=0.6)
        g.L.new(stretched(0.35, 6.0), fibre.inputs["Vector"])
        warp = g.node("ShaderNodeTexNoise", Scale=1.2, Detail=3.0)
        g.L.new(stretched(0.25, 1.5, 3.0), warp.inputs["Vector"])
        rings = g.node("ShaderNodeTexWave", _wave_type="BANDS", _bands_direction="Y", Scale=5.0, Distortion=9.0, **{"Detail": 3.0})
        vec = g.node("ShaderNodeVectorMath", _operation="ADD")
        g.L.new(stretched(0.2, 4.0), vec.inputs[0])
        g.L.new(warp.outputs["Color"], vec.inputs[1])
        g.L.new(vec.outputs[0], rings.inputs["Vector"])
        cracks = g.node("ShaderNodeTexVoronoi", _feature="DISTANCE_TO_EDGE", Scale=5.0)
        g.L.new(stretched(0.5, 14.0, 5.0), cracks.inputs["Vector"])
        crack = g.math("SUBTRACT", 1.0, g.smooth(cracks.outputs["Distance"], 0.0, 0.045 if kind == "wood_grey" else 0.025))
        figure = g.math("ADD", g.math("MULTIPLY", fibre.outputs["Fac"], 0.7), g.math("MULTIPLY", rings.outputs["Fac"], 0.3))
        col = g.mix(g.smooth(figure, 0.22, 0.8), g.rgb(dark), g.rgb(light))
        # Per-board value shift so neighbouring boards are not one colour.
        shade = g.node("ShaderNodeHueSaturation", Hue=0.5, Saturation=1.0)
        g.set(shade.inputs["Value"], g.math("ADD", 0.82, g.math("MULTIPLY", tint, 0.36)))
        g.set(shade.inputs["Color"], col)
        col = shade.outputs["Color"]
        bump_h = g.math("SUBTRACT", g.math("MULTIPLY", figure, 0.5), g.math("MULTIPLY", crack, 0.8))
        col = g.mix(g.math("MULTIPLY", crack, 0.65), col, g.rgb((0.05, 0.04, 0.03)))
        if kind in SEAMS:
            # Board seams across the grain (barrel staves, crate and wall boards).
            s = g.math("FRACT", g.math("DIVIDE", v, SEAMS[kind]))
            edge = g.math("MINIMUM", s, g.math("SUBTRACT", 1.0, s))
            seam = g.math("SUBTRACT", 1.0, g.smooth(edge, 0.0, 0.05))
            col = g.mix(g.math("MULTIPLY", seam, 0.7), col, g.rgb((0.04, 0.03, 0.02)))
            bump_h = g.math("SUBTRACT", bump_h, g.math("MULTIPLY", seam, 1.2))
        col = g.mix(g.math("MULTIPLY", grime_f, 0.3), col, g.rgb((0.07, 0.055, 0.04)))
        col = g.mix(g.math("MULTIPLY", ground_dust, 0.55), col, g.rgb((0.30, 0.24, 0.17)))
        rough = g.math("ADD", 0.8, g.math("MULTIPLY", fibre.outputs["Fac"], 0.15), clamp=True)
        if kind == "sign_board":
            # Hand-painted lettering: one line of glyphs, 5 cm tall, centred
            # on the board (sign_board parts keep local UV, see
            # pr_common.LOCAL_UV). Each 1.1 x 1.25 cm cell is inked or not by
            # a white-noise hash; every fourth column is a letter gap.
            col_i = g.math("FLOOR", g.math("DIVIDE", u, 0.011))
            row_i = g.math("FLOOR", g.math("DIVIDE", g.math("ADD", v, 0.025), 0.0125))
            cell = g.node("ShaderNodeCombineXYZ")
            g.set(cell.inputs["X"], col_i)
            g.set(cell.inputs["Y"], row_i)
            g.set(cell.inputs["Z"], g.math("MULTIPLY", tint, 31.0))
            hashn = g.node("ShaderNodeTexWhiteNoise", _noise_dimensions="3D")
            g.L.new(cell.outputs[0], hashn.inputs["Vector"])
            inked = g.math("GREATER_THAN", hashn.outputs["Value"], 0.5)
            gap = g.math("LESS_THAN", g.math("FRACT", g.math("DIVIDE", col_i, 4.0)), 0.7)
            band = g.math("LESS_THAN", g.math("ABSOLUTE", v), 0.025)
            glyph = g.math("MULTIPLY", g.math("MULTIPLY", inked, gap), band)
            flake = g.node("ShaderNodeTexNoise", Scale=30.0, Detail=4.0)
            g.L.new(stretched(1.0, 1.0, 9.0), flake.inputs["Vector"])
            glyph = g.math("MULTIPLY", glyph, g.smooth(flake.outputs["Fac"], 0.3, 0.45))
            col = g.mix(g.math("MULTIPLY", glyph, 0.9), col, g.rgb((0.03, 0.025, 0.02)))
        if kind in PAINT:
            wear = g.node("ShaderNodeTexNoise", Scale=4.0, Detail=9.0, Roughness=0.72)
            g.L.new(stretched(0.8, 2.5, 6.0), wear.inputs["Vector"])
            # Paint survives in the middle of boards and flakes along the grain.
            paint = g.math("MULTIPLY", g.smooth(wear.outputs["Fac"], 0.42, 0.52), g.math("SUBTRACT", 1.0, crack))
            fade = g.mix(g.math("MULTIPLY", fibre.outputs["Fac"], 0.5), g.rgb(PAINT[kind]), g.rgb(tuple(c * 1.5 + 0.03 for c in PAINT[kind])))
            col = g.mix(g.math("MULTIPLY", paint, 0.9), col, fade)
            rough = g.math("SUBTRACT", rough, g.math("MULTIPLY", paint, 0.15))
            bump_h = g.math("ADD", bump_h, g.math("MULTIPLY", paint, 0.35))
        metal = 0.0
        strength, dist = 0.55, 0.004
    elif kind == "iron":
        rust_n = g.node("ShaderNodeTexNoise", Scale=9.0, Detail=10.0, Roughness=0.7)
        g.L.new(stretched(1.0, 1.0), rust_n.inputs["Vector"])
        rust = g.smooth(rust_n.outputs["Fac"], 0.46, 0.62)
        pits = g.node("ShaderNodeTexNoise", Scale=60.0, Detail=4.0)
        g.L.new(stretched(1.0, 1.0, 2.0), pits.inputs["Vector"])
        rust_col = g.mix(pits.outputs["Fac"], g.rgb((0.20, 0.07, 0.025)), g.rgb((0.36, 0.16, 0.06)))
        col = g.mix(rust, g.rgb((0.055, 0.052, 0.05)), rust_col)
        col = g.mix(g.math("MULTIPLY", ground_dust, 0.4), col, g.rgb((0.26, 0.2, 0.14)))
        rough = g.math("ADD", g.math("MULTIPLY", rust, 0.42), 0.5)
        metal = g.math("SUBTRACT", 0.75, g.math("MULTIPLY", rust, 0.65))
        bump_h = g.math("ADD", g.math("MULTIPLY", rust, 0.6), g.math("MULTIPLY", pits.outputs["Fac"], 0.3))
        strength, dist = 0.5, 0.002
    elif kind == "hay":
        straw = g.node("ShaderNodeTexNoise", Scale=4.0, Detail=10.0, Roughness=0.75)
        g.L.new(stretched(0.6, 40.0), straw.inputs["Vector"])
        clump = g.node("ShaderNodeTexNoise", Scale=5.0, Detail=3.0)
        g.L.new(tc.outputs["Object"], clump.inputs["Vector"])
        col = g.mix(g.smooth(straw.outputs["Fac"], 0.3, 0.75), g.rgb((0.20, 0.15, 0.06)), g.rgb((0.56, 0.45, 0.20)))
        col = g.mix(g.math("MULTIPLY", g.smooth(clump.outputs["Fac"], 0.45, 0.7), 0.45), col, g.rgb((0.30, 0.31, 0.14)))
        col = g.mix(g.math("MULTIPLY", ground_dust, 0.4), col, g.rgb((0.30, 0.24, 0.17)))
        rough, metal = 0.95, 0.0
        bump_h = straw.outputs["Fac"]
        strength, dist = 0.8, 0.006
    elif kind == "bark":
        ridge = g.node("ShaderNodeTexNoise", Scale=3.0, Detail=8.0, Roughness=0.7)
        g.L.new(stretched(0.4, 12.0), ridge.inputs["Vector"])
        fissure = g.node("ShaderNodeTexVoronoi", _feature="DISTANCE_TO_EDGE", Scale=4.0)
        g.L.new(stretched(0.3, 5.0, 2.0), fissure.inputs["Vector"])
        gap = g.math("SUBTRACT", 1.0, g.smooth(fissure.outputs["Distance"], 0.0, 0.08))
        col = g.mix(ridge.outputs["Fac"], g.rgb((0.06, 0.045, 0.032)), g.rgb((0.20, 0.16, 0.12)))
        col = g.mix(g.math("MULTIPLY", gap, 0.8), col, g.rgb((0.025, 0.02, 0.015)))
        col = g.mix(g.math("MULTIPLY", ground_dust, 0.4), col, g.rgb((0.30, 0.24, 0.17)))
        rough, metal = 0.95, 0.0
        bump_h = g.math("SUBTRACT", ridge.outputs["Fac"], g.math("MULTIPLY", gap, 1.2))
        strength, dist = 0.9, 0.008
    elif kind == "endgrain":
        du = g.math("SUBTRACT", u, 5.0)
        dv = g.math("SUBTRACT", v, 3.0)
        radial = g.math("SQRT", g.math("ADD", g.math("MULTIPLY", du, du), g.math("MULTIPLY", dv, dv)))
        wob = g.node("ShaderNodeTexNoise", Scale=12.0, Detail=3.0)
        g.L.new(stretched(1.0, 1.0, 1.0), wob.inputs["Vector"])
        phase = g.math("ADD", g.math("MULTIPLY", radial, 150.0), g.math("MULTIPLY", g.math("ADD", wob.outputs["Fac"], tint), 5.0))
        rings = g.smooth(g.math("SINE", phase), -0.2, 1.0)
        checks = g.node("ShaderNodeTexVoronoi", _feature="DISTANCE_TO_EDGE", Scale=9.0)
        g.L.new(stretched(1.0, 1.0, 3.0), checks.inputs["Vector"])
        crack = g.math("SUBTRACT", 1.0, g.smooth(checks.outputs["Distance"], 0.0, 0.02))
        col = g.mix(rings, g.rgb((0.46, 0.34, 0.20)), g.rgb((0.29, 0.19, 0.10)))
        col = g.mix(g.math("MULTIPLY", crack, 0.6), col, g.rgb((0.08, 0.06, 0.04)))
        col = g.mix(g.math("MULTIPLY", grime_f, 0.35), col, g.rgb((0.20, 0.16, 0.12)))
        rough, metal = 0.88, 0.0
        bump_h = g.math("SUBTRACT", g.math("MULTIPLY", rings, 0.3), crack)
        strength, dist = 0.5, 0.003
    elif kind == "zinc":
        spangle = g.node("ShaderNodeTexVoronoi", Scale=18.0)
        g.L.new(stretched(1.0, 1.0), spangle.inputs["Vector"])
        oxide = g.node("ShaderNodeTexNoise", Scale=5.0, Detail=8.0, Roughness=0.65)
        g.L.new(stretched(1.0, 1.0, 4.0), oxide.inputs["Vector"])
        white = g.smooth(oxide.outputs["Fac"], 0.5, 0.68)
        base = g.mix(spangle.outputs["Distance"], g.rgb((0.30, 0.31, 0.31)), g.rgb((0.46, 0.47, 0.47)))
        col = g.mix(g.math("MULTIPLY", white, 0.7), base, g.rgb((0.58, 0.58, 0.55)))
        col = g.mix(g.math("MULTIPLY", ground_dust, 0.5), col, g.rgb((0.30, 0.24, 0.17)))
        rough = g.math("ADD", 0.42, g.math("MULTIPLY", white, 0.4))
        metal = g.math("SUBTRACT", 0.85, g.math("MULTIPLY", white, 0.6))
        bump_h = g.math("MULTIPLY", white, 0.4)
        strength, dist = 0.3, 0.002
    elif kind == "glass":
        # Pale green-blue insulator glass, bubbled and dusty.
        bub = g.node("ShaderNodeTexNoise", Scale=60.0, Detail=2.0)
        g.L.new(tc.outputs["Object"], bub.inputs["Vector"])
        col = g.mix(g.math("MULTIPLY", bub.outputs["Fac"], 0.5), g.rgb((0.10, 0.26, 0.24)), g.rgb((0.22, 0.40, 0.36)))
        col = g.mix(g.math("MULTIPLY", grime_f, 0.4), col, g.rgb((0.25, 0.22, 0.17)))
        rough = g.math("ADD", 0.1, g.math("MULTIPLY", grime_f, 0.4))
        metal = 0.0
        bump_h = bub.outputs["Fac"]
        strength, dist = 0.1, 0.001
    elif kind == "char":
        # Charred wood and ash: alligatored black with grey ash in the cracks.
        cells = g.node("ShaderNodeTexVoronoi", _feature="DISTANCE_TO_EDGE", Scale=14.0)
        g.L.new(stretched(0.7, 2.0, 5.0), cells.inputs["Vector"])
        crack = g.math("SUBTRACT", 1.0, g.smooth(cells.outputs["Distance"], 0.0, 0.06))
        ash = g.node("ShaderNodeTexNoise", Scale=8.0, Detail=6.0)
        g.L.new(tc.outputs["Object"], ash.inputs["Vector"])
        col = g.mix(g.smooth(ash.outputs["Fac"], 0.45, 0.65), g.rgb((0.018, 0.015, 0.013)), g.rgb((0.20, 0.19, 0.17)))
        col = g.mix(g.math("MULTIPLY", crack, 0.8), col, g.rgb((0.09, 0.085, 0.08)))
        rough, metal = 0.96, 0.0
        bump_h = g.math("SUBTRACT", 1.0, crack)
        strength, dist = 0.7, 0.004
    elif kind in ("adobe", "clay", "sod", "hide", "meat", "burlap", "brush", "blanket"):
        # Earth and fibre surfaces: a base colour pair mottled by large noise,
        # a fine texture noise for the bump, and ground dust low down.
        looks = {
            # kind: (dark, light, fine scale, bump strength, roughness)
            "adobe": ((0.36, 0.24, 0.15), (0.55, 0.40, 0.27), 45.0, 0.45, 0.93),
            "clay": ((0.36, 0.17, 0.08), (0.56, 0.31, 0.16), 60.0, 0.2, 0.8),
            "sod": ((0.14, 0.12, 0.07), (0.28, 0.27, 0.13), 25.0, 0.8, 0.98),
            "hide": ((0.42, 0.33, 0.22), (0.66, 0.56, 0.42), 30.0, 0.3, 0.85),
            "meat": ((0.16, 0.05, 0.03), (0.33, 0.12, 0.07), 40.0, 0.4, 0.7),
            "burlap": ((0.30, 0.23, 0.14), (0.48, 0.38, 0.25), 220.0, 0.3, 0.97),
            "brush": ((0.12, 0.10, 0.06), (0.32, 0.28, 0.16), 18.0, 1.0, 0.98),
            "blanket": ((0.24, 0.07, 0.05), (0.42, 0.28, 0.20), 150.0, 0.2, 0.95),
        }
        dark_c, light_c, fine_scale, bstr, rgh = looks[kind]
        mottle = g.node("ShaderNodeTexNoise", Scale=4.0, Detail=6.0, Roughness=0.6)
        g.L.new(tc.outputs["Object"], mottle.inputs["Vector"])
        fine = g.node("ShaderNodeTexNoise", Scale=fine_scale, Detail=4.0, Roughness=0.7)
        g.L.new(stretched(1.0, 1.0, 2.0) if kind in ("burlap", "blanket") else tc.outputs["Object"], fine.inputs["Vector"])
        f = g.math("ADD", g.math("MULTIPLY", mottle.outputs["Fac"], 0.6), g.math("MULTIPLY", fine.outputs["Fac"], 0.4))
        col = g.mix(g.smooth(f, 0.3, 0.72), g.rgb(dark_c), g.rgb(light_c))
        if kind == "blanket":
            # Trade-blanket stripes across the weave.
            stripe = g.smooth(g.math("SINE", g.math("MULTIPLY", v, 40.0)), 0.6, 0.8)
            col = g.mix(g.math("MULTIPLY", stripe, 0.8), col, g.rgb((0.05, 0.08, 0.14)))
        col = g.mix(g.math("MULTIPLY", ground_dust, 0.5), col, g.rgb((0.30, 0.24, 0.17)))
        rough, metal = rgh, 0.0
        bump_h = fine.outputs["Fac"]
        strength, dist = bstr, 0.004
    elif kind in ("flag_red", "flag_blue"):
        # Wool bunting bleached by years of sun: dull red, washed-out blue.
        weave = g.node("ShaderNodeTexNoise", Scale=200.0, Detail=1.0)
        g.L.new(stretched(1.0, 1.0), weave.inputs["Vector"])
        fade = g.node("ShaderNodeTexNoise", Scale=3.0, Detail=4.0)
        g.L.new(tc.outputs["Object"], fade.inputs["Vector"])
        base = (0.24, 0.05, 0.04) if kind == "flag_red" else (0.05, 0.07, 0.16)
        col = g.mix(g.math("MULTIPLY", g.smooth(fade.outputs["Fac"], 0.35, 0.7), 0.5), g.rgb(base), g.rgb((0.42, 0.36, 0.30)))
        col = g.mix(g.math("MULTIPLY", weave.outputs["Fac"], 0.15), col, g.rgb((0.1, 0.08, 0.07)))
        rough, metal = 0.95, 0.0
        bump_h = weave.outputs["Fac"]
        strength, dist = 0.15, 0.001
    elif kind == "leather":
        # Cracked, sun-dried saddle leather.
        grain_n = g.node("ShaderNodeTexNoise", Scale=90.0, Detail=3.0)
        g.L.new(stretched(1.0, 1.0), grain_n.inputs["Vector"])
        cracks = g.node("ShaderNodeTexVoronoi", _feature="DISTANCE_TO_EDGE", Scale=30.0)
        g.L.new(stretched(1.0, 1.0, 3.0), cracks.inputs["Vector"])
        crack = g.math("SUBTRACT", 1.0, g.smooth(cracks.outputs["Distance"], 0.0, 0.04))
        wear = g.node("ShaderNodeTexNoise", Scale=4.0, Detail=5.0)
        g.L.new(tc.outputs["Object"], wear.inputs["Vector"])
        col = g.mix(g.smooth(wear.outputs["Fac"], 0.4, 0.7), g.rgb((0.10, 0.05, 0.025)), g.rgb((0.26, 0.15, 0.08)))
        col = g.mix(g.math("MULTIPLY", crack, 0.5), col, g.rgb((0.36, 0.26, 0.17)))
        rough = g.math("ADD", 0.55, g.math("MULTIPLY", grain_n.outputs["Fac"], 0.3))
        metal = 0.0
        bump_h = g.math("SUBTRACT", grain_n.outputs["Fac"], crack)
        strength, dist = 0.35, 0.002
    elif kind in ("canvas", "rope"):
        # Weathered duck canvas: off-white weave, water stains low down and
        # smoke-dark near the top. Rope is the same fibre, darker.
        weave = g.node("ShaderNodeTexNoise", Scale=300.0, Detail=1.0)
        g.L.new(stretched(1.0, 1.0), weave.inputs["Vector"])
        stain = g.node("ShaderNodeTexNoise", Scale=2.5, Detail=5.0, Roughness=0.6)
        g.L.new(tc.outputs["Object"], stain.inputs["Vector"])
        if kind == "canvas":
            base = g.mix(weave.outputs["Fac"], g.rgb((0.46, 0.42, 0.34)), g.rgb((0.60, 0.56, 0.46)))
            col = g.mix(g.math("MULTIPLY", g.smooth(stain.outputs["Fac"], 0.5, 0.75), 0.6), base, g.rgb((0.30, 0.25, 0.18)))
            col = g.mix(g.math("MULTIPLY", ground_dust, 0.7), col, g.rgb((0.28, 0.22, 0.15)))
        else:
            col = g.mix(weave.outputs["Fac"], g.rgb((0.18, 0.15, 0.10)), g.rgb((0.30, 0.25, 0.17)))
        rough, metal = 0.95, 0.0
        bump_h = weave.outputs["Fac"]
        strength, dist = 0.2, 0.001
    elif kind == "fieldstone":
        # Weathered granite fieldstone: brown-grey, darker in the hollows,
        # lichen spots on the upper faces.
        grit = g.node("ShaderNodeTexNoise", Scale=70.0, Detail=5.0)
        g.L.new(tc.outputs["Object"], grit.inputs["Vector"])
        mottle = g.node("ShaderNodeTexNoise", Scale=5.0, Detail=6.0, Roughness=0.65)
        g.L.new(tc.outputs["Object"], mottle.inputs["Vector"])
        lichen = g.node("ShaderNodeTexVoronoi", Scale=22.0)
        g.L.new(tc.outputs["Object"], lichen.inputs["Vector"])
        col = g.mix(mottle.outputs["Fac"], g.rgb((0.075, 0.066, 0.056)), g.rgb((0.19, 0.17, 0.145)))
        col = g.mix(g.math("MULTIPLY", grit.outputs["Fac"], 0.35), col, g.rgb((0.05, 0.045, 0.04)))
        spots = g.math("MULTIPLY", g.math("SUBTRACT", 1.0, g.smooth(lichen.outputs["Distance"], 0.05, 0.16)), g.smooth(mottle.outputs["Fac"], 0.5, 0.62))
        col = g.mix(g.math("MULTIPLY", spots, 0.7), col, g.rgb((0.22, 0.2, 0.11)))
        col = g.mix(g.math("MULTIPLY", ground_dust, 0.5), col, g.rgb((0.20, 0.16, 0.11)))
        rough, metal = 0.9, 0.0
        bump_h = g.math("ADD", g.math("MULTIPLY", grit.outputs["Fac"], 0.6), mottle.outputs["Fac"])
        strength, dist = 0.6, 0.003
    elif kind == "stone":
        grit = g.node("ShaderNodeTexNoise", Scale=90.0, Detail=4.0)
        g.L.new(tc.outputs["Object"], grit.inputs["Vector"])
        mottle = g.node("ShaderNodeTexNoise", Scale=6.0, Detail=6.0)
        g.L.new(tc.outputs["Object"], mottle.inputs["Vector"])
        col = g.mix(mottle.outputs["Fac"], g.rgb((0.36, 0.30, 0.22)), g.rgb((0.56, 0.49, 0.38)))
        col = g.mix(g.math("MULTIPLY", grit.outputs["Fac"], 0.3), col, g.rgb((0.22, 0.19, 0.15)))
        rough, metal = 0.92, 0.0
        bump_h = g.math("ADD", grit.outputs["Fac"], g.math("MULTIPLY", mottle.outputs["Fac"], 0.3))
        strength, dist = 0.5, 0.002
    elif kind == "water":
        col = g.rgb((0.025, 0.035, 0.025))
        rough, metal = 0.08, 0.0
        ripple = g.node("ShaderNodeTexNoise", Scale=14.0, Detail=2.0)
        g.L.new(tc.outputs["Object"], ripple.inputs["Vector"])
        bump_h = ripple.outputs["Fac"]
        strength, dist = 0.08, 0.002
    elif kind in ("bone", "horn"):
        porous = g.node("ShaderNodeTexNoise", Scale=40.0, Detail=6.0, Roughness=0.7)
        g.L.new(stretched(1.0, 1.0), porous.inputs["Vector"])
        cracks = g.node("ShaderNodeTexVoronoi", _feature="DISTANCE_TO_EDGE", Scale=7.0)
        g.L.new(stretched(0.6, 3.0, 4.0), cracks.inputs["Vector"])
        crack = g.math("SUBTRACT", 1.0, g.smooth(cracks.outputs["Distance"], 0.0, 0.03))
        if kind == "bone":
            col = g.mix(porous.outputs["Fac"], g.rgb((0.48, 0.43, 0.34)), g.rgb((0.70, 0.66, 0.56)))
        else:
            tip = g.smooth(u, 0.25, 0.8)
            base = g.mix(porous.outputs["Fac"], g.rgb((0.50, 0.44, 0.34)), g.rgb((0.62, 0.57, 0.46)))
            col = g.mix(tip, base, g.rgb((0.10, 0.08, 0.06)))
            growth = g.math("SINE", g.math("MULTIPLY", u, 90.0))
            crack = g.math("MAXIMUM", crack, g.math("MULTIPLY", g.smooth(growth, 0.7, 1.0), g.math("SUBTRACT", 1.0, tip)))
        col = g.mix(g.math("MULTIPLY", crack, 0.5), col, g.rgb((0.18, 0.14, 0.1)))
        col = g.mix(g.math("MULTIPLY", ground_dust, 0.6), col, g.rgb((0.30, 0.24, 0.17)))
        rough = g.math("ADD", 0.68, g.math("MULTIPLY", porous.outputs["Fac"], 0.2))
        metal = 0.0
        bump_h = g.math("SUBTRACT", g.math("MULTIPLY", porous.outputs["Fac"], 0.4), crack)
        strength, dist = 0.4, 0.002
    else:  # socket
        col = g.rgb((0.045, 0.035, 0.025))
        rough, metal = 1.0, 0.0
        bump_h = 0.0
        strength, dist = 0.0, 0.001

    g.set(bsdf.inputs["Base Color"], col)
    g.set(bsdf.inputs["Roughness"], rough)
    g.set(bsdf.inputs["Metallic"], metal)
    bump = g.node("ShaderNodeBump", Strength=strength, Distance=dist)
    g.set(bump.inputs["Height"], bump_h)
    g.L.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    # Roughness/metal ride the emission colour for the EMIT bake pass.
    comb = g.node("ShaderNodeCombineColor")
    g.set(comb.inputs["Green"], rough)
    g.set(comb.inputs["Blue"], metal)
    g.L.new(comb.outputs[0], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.0
    return mat


def assign_hp_materials():
    mats = []
    for kind in KINDS:
        mat = bpy.data.materials.get("PRM_" + kind) or bpy.data.materials.new("PRM_" + kind)
        mats.append(_surface(mat, kind))
    for ob in low_objects():
        for target in (ob, bpy.data.objects[ob.name + "_HP"]):
            me = target.data
            me.materials.clear()
            for m in mats:
                me.materials.append(m)
            kind = np.zeros(len(me.polygons), dtype=np.int32)
            me.attributes["kind"].data.foreach_get("value", kind)
            me.polygons.foreach_set("material_index", kind)
            me.update()


def _set_emit(strength):
    for mat in bpy.data.materials:
        if mat.name.startswith("PRM_") and mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED":
                    n.inputs["Emission Strength"].default_value = strength


# --------------------------------------------------------------------------
# Atlas


def build_atlas():
    """Copy each low mesh's metric grain UV to `atlas` and pack all props together."""
    lows = low_objects()
    for ob in lows:
        me = ob.data
        grain = me.uv_layers["grain"]
        atlas = me.uv_layers.get("atlas") or me.uv_layers.new(name="atlas")
        buf = np.zeros(len(me.loops) * 2, dtype=np.float32)
        grain.data.foreach_get("uv", buf)
        atlas.data.foreach_set("uv", buf)
        me.uv_layers.active = atlas
    bpy.ops.object.select_all(action="DESELECT")
    for ob in lows:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = lows[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, scale=True, margin_method="FRACTION", margin=0.002, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")


# --------------------------------------------------------------------------
# Bake


def _image(name, colorspace):
    img = bpy.data.images.get(name)
    if img is not None:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, RES, RES, alpha=False)
    img.colorspace_settings.name = colorspace
    return img


def _target(img):
    mat = bpy.data.materials.get("PR_BakeTarget") or bpy.data.materials.new("PR_BakeTarget")
    g = _G(mat)
    out = g.node("ShaderNodeOutputMaterial")
    bsdf = g.node("ShaderNodeBsdfPrincipled")
    g.L.new(bsdf.outputs[0], out.inputs[0])
    node = g.node("ShaderNodeTexImage")
    node.image = img
    g.N.active = node
    return mat


def bake_all(kit="western", samples=16, log=print):
    prefix = KITS[kit][1]
    os.makedirs(TEX, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    scene.world.light_settings.distance = 0.3
    for name in ("PV_Ground",):
        ob = bpy.data.objects.get(name)
        if ob:
            ob.hide_render = True

    lows = low_objects()
    rays = ("visible_camera", "visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow")
    for ob in lows:
        for r in rays:
            setattr(ob, r, False)

    # A ground plane per prop for AO: props stand on dirt.
    gme = bpy.data.meshes.get("PR_AOGround") or bpy.data.meshes.new("PR_AOGround")
    if not len(gme.polygons):
        gme.from_pydata([(-3, -3, 0), (3, -3, 0), (3, 3, 0), (-3, 3, 0)], [], [(0, 1, 2, 3)])
    grounds = []
    for ob in lows:
        gob = bpy.data.objects.get("PR_AOGround_" + ob.name) or bpy.data.objects.new("PR_AOGround_" + ob.name, gme)
        if gob.name not in collection().objects:
            collection().objects.link(gob)
        gob.location = ob.location
        grounds.append(gob)

    def pass_(bake_type, img, fill, **kw):
        img.pixels = np.tile(np.array(fill, dtype=np.float32), RES * RES)
        tgt = _target(img)
        for ob in lows:
            hp = bpy.data.objects[ob.name + "_HP"]
            saved = list(ob.data.materials)
            ob.data.materials.clear()
            ob.data.materials.append(tgt)
            bpy.ops.object.select_all(action="DESELECT")
            hp.select_set(True)
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            bpy.ops.object.bake(type=bake_type, use_selected_to_active=True, cage_extrusion=0.015,
                                max_ray_distance=0.045, margin=4, use_clear=False, uv_layer="atlas", **kw)
            ob.data.materials.clear()
            for m in saved:
                ob.data.materials.append(m)
            log(f"{bake_type} {ob.name}")

    for gob in grounds:
        gob.hide_render = True
    _set_emit(0.0)
    base = _image(f"{prefix}_basecolor", "sRGB")
    pass_("DIFFUSE", base, (0.2, 0.16, 0.12, 1), pass_filter={"COLOR"})
    nrm = _image(f"{prefix}_normal", "Non-Color")
    pass_("NORMAL", nrm, (0.5, 0.5, 1.0, 1), normal_space="TANGENT")
    _set_emit(1.0)
    rm = _image(f"{prefix}_rm", "Non-Color")
    pass_("EMIT", rm, (0.0, 0.85, 0.0, 1))
    _set_emit(0.0)
    for gob in grounds:
        gob.hide_render = False
    scene.cycles.samples = 64
    ao = _image(f"{prefix}_ao", "Non-Color")
    pass_("AO", ao, (1, 1, 1, 1))
    for gob in grounds:
        bpy.data.objects.remove(gob, do_unlink=True)
    for ob in lows:
        for r in rays:
            setattr(ob, r, True)

    px_rm = np.array(rm.pixels[:], dtype=np.float32).reshape(RES, RES, 4)
    px_ao = np.array(ao.pixels[:], dtype=np.float32).reshape(RES, RES, 4)
    orm = _image(f"{prefix}_orm", "Non-Color")
    out = np.ones((RES, RES, 4), dtype=np.float32)
    out[..., 0] = np.clip(0.25 + 0.75 * px_ao[..., 0], 0, 1)
    out[..., 1] = px_rm[..., 1]
    out[..., 2] = px_rm[..., 2]
    orm.pixels = out.ravel()
    for img, fname in ((base, f"{prefix}_basecolor.png"), (nrm, f"{prefix}_normal.png"), (orm, f"{prefix}_orm.png"), (ao, f"{prefix}_ao.png")):
        img.filepath_raw = f"{TEX}/{fname}"
        img.file_format = "PNG"
        img.save()


# --------------------------------------------------------------------------
# Final material and export


def final_material(kit="western"):
    _, prefix, name = KITS[kit]
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    # Closed solids: export single-sided (glTF doubleSided false).
    mat.use_backface_culling = True
    g = _G(mat)
    out = g.node("ShaderNodeOutputMaterial")
    bsdf = g.node("ShaderNodeBsdfPrincipled")
    g.L.new(bsdf.outputs[0], out.inputs[0])

    def tex(fname, colorspace):
        img = bpy.data.images.load(f"{TEX}/{fname}", check_existing=True)
        img.reload()
        img.colorspace_settings.name = colorspace
        node = g.node("ShaderNodeTexImage")
        node.image = img
        uvn = g.node("ShaderNodeUVMap", _uv_map="atlas")
        g.L.new(uvn.outputs["UV"], node.inputs["Vector"])
        return node

    base = tex(f"{prefix}_basecolor.png", "sRGB")
    g.L.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    orm = tex(f"{prefix}_orm.png", "Non-Color")
    sep = g.node("ShaderNodeSeparateColor")
    g.L.new(orm.outputs["Color"], sep.inputs[0])
    g.L.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    g.L.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nrm = tex(f"{prefix}_normal.png", "Non-Color")
    nmap = g.node("ShaderNodeNormalMap", _uv_map="atlas")
    g.L.new(nrm.outputs["Color"], nmap.inputs["Color"])
    g.L.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    group = bpy.data.node_groups.get("glTF Material Output")
    if group is None:
        group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        group.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    gnode = g.node("ShaderNodeGroup")
    gnode.node_tree = group
    g.L.new(sep.outputs["Red"], gnode.inputs["Occlusion"])
    return mat


def export(kit="western"):
    path = KITS[kit][0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    mat = final_material(kit)
    lows = low_objects()
    saved = {}
    for ob in lows:
        saved[ob.name] = tuple(ob.location)
        ob.location = (0, 0, 0)
        me = ob.data
        me.materials.clear()
        me.materials.append(mat)
        me.polygons.foreach_set("material_index", np.zeros(len(me.polygons), dtype=np.int32))
        if "grain" in me.uv_layers:
            me.uv_layers.remove(me.uv_layers["grain"])
        me.uv_layers.active = me.uv_layers["atlas"]
    bpy.ops.object.select_all(action="DESELECT")
    for ob in lows:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = lows[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=88,
        export_attributes=False,
        export_extras=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_lights=False,
        export_cameras=False,
    )
    for ob in lows:
        ob.location = saved[ob.name]
    return path
