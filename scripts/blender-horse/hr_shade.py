"""Procedural materials for the horse, baked to the shared atlas.

Each material's Emission carries the albedo during the colour bake and the
roughness during the roughness bake (a mode switch on every material), so
one Cycles EMIT pass per map transfers them onto the atlas UVs.
"""

import bpy

MATS = {}
MODE = "color"


class _G:
    def __init__(self, mat):
        mat.use_nodes = True
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.N, self.L = self.nt.nodes, self.nt.links

    def node(self, kind, **inputs):
        n = self.N.new(kind)
        for k, v in inputs.items():
            if k.startswith("_"):
                setattr(n, k[1:], v)
            else:
                self.set(n.inputs[k], v)
        return n

    def set(self, sock, v):
        if isinstance(v, bpy.types.NodeSocket):
            self.L.new(v, sock)
        else:
            sock.default_value = v

    def math(self, op, a, b=0.0, clamp=False):
        n = self.node("ShaderNodeMath", _operation=op, _use_clamp=clamp)
        self.set(n.inputs[0], a)
        self.set(n.inputs[1], b)
        return n.outputs[0]

    def mix(self, f, a, b):
        n = self.node("ShaderNodeMix", _data_type="RGBA", _clamp_factor=True)
        ins = {s.identifier: s for s in n.inputs}
        self.set(ins["Factor_Float"], f)
        self.set(ins["A_Color"], a)
        self.set(ins["B_Color"], b)
        return {s.identifier: s for s in n.outputs}["Result_Color"]

    def ramp(self, v, lo, hi):
        n = self.node("ShaderNodeMapRange", _interpolation_type="SMOOTHSTEP")
        self.set(n.inputs["Value"], v)
        n.inputs["From Min"].default_value = lo
        n.inputs["From Max"].default_value = hi
        return n.outputs["Result"]

    def rgb(self, c):
        return (*c, 1.0)


def _finish(g, color, rough):
    """Emission = colour or roughness per MODE; Principled for previews."""
    out = g.node("ShaderNodeOutputMaterial")
    bsdf = g.node("ShaderNodeBsdfPrincipled")
    g.set(bsdf.inputs["Base Color"], color)
    g.set(bsdf.inputs["Roughness"], rough)
    emit = g.node("ShaderNodeEmission")
    if MODE == "rough":
        comb = g.node("ShaderNodeCombineColor")
        g.set(comb.inputs[0], rough)
        g.set(comb.inputs[1], rough)
        g.set(comb.inputs[2], rough)
        g.L.new(comb.outputs[0], emit.inputs["Color"])
    else:
        g.set(emit.inputs["Color"], color)
    shader = bsdf if MODE == "preview" else emit
    g.L.new(shader.outputs[0], out.inputs[0])


def coat(mat, base=(0.23, 0.095, 0.045), points=(0.03, 0.022, 0.018), blaze=True, socks=(False, False, False, True)):
    """A bay: red-brown body darker along the topline, black points below
    the knees and hocks, a dark muzzle, a white blaze and one hind sock."""
    g = _G(mat)
    tc = g.node("ShaderNodeTexCoord")
    sep = g.node("ShaderNodeSeparateXYZ")
    g.L.new(tc.outputs["Object"], sep.inputs[0])
    x, y, z = sep.outputs["X"], sep.outputs["Y"], sep.outputs["Z"]
    mottle = g.node("ShaderNodeTexNoise", Scale=6.0, Detail=6.0, Roughness=0.6)
    g.L.new(tc.outputs["Object"], mottle.inputs["Vector"])
    hair = g.node("ShaderNodeTexNoise", Scale=180.0, Detail=2.0)
    g.L.new(tc.outputs["Object"], hair.inputs["Vector"])
    dapple = g.node("ShaderNodeTexVoronoi", Scale=18.0)
    g.L.new(tc.outputs["Object"], dapple.inputs["Vector"])
    body = g.mix(g.math("MULTIPLY", mottle.outputs["Fac"], 0.35), g.rgb(base), g.rgb(tuple(c * 1.45 for c in base)))
    body = g.mix(g.math("MULTIPLY", g.ramp(dapple.outputs["Distance"], 0.2, 0.6), 0.12), body, g.rgb(tuple(c * 0.8 for c in base)))
    # Topline and flank shading: darker up the back, lighter under the belly.
    body = g.mix(g.math("MULTIPLY", g.ramp(z, 1.25, 1.55), 0.45), body, g.rgb(tuple(c * 0.55 for c in base)))
    body = g.mix(g.math("MULTIPLY", g.ramp(z, 1.0, 0.78), 0.35), body, g.rgb(tuple(c * 1.35 + 0.02 for c in base)))
    # Points: fore legs below the knee, hind below the hock, blended upward.
    fore = g.math("MULTIPLY", g.ramp(y, -0.30, -0.36), g.ramp(z, 0.70, 0.52))
    hind = g.math("MULTIPLY", g.ramp(y, 0.30, 0.36), g.ramp(z, 0.66, 0.50))
    legs = g.math("MAXIMUM", fore, hind)
    col = g.mix(legs, body, g.rgb(points))
    # Dark muzzle.
    col = g.mix(g.ramp(y, -1.22, -1.32), col, g.rgb((0.035, 0.028, 0.025)))
    # Ear tips.
    col = g.mix(g.ramp(z, 1.96, 2.02), col, g.rgb(points))
    if blaze:
        ax = g.math("ABSOLUTE", x)
        wob = g.math("MULTIPLY", g.math("SUBTRACT", mottle.outputs["Fac"], 0.5), 0.02)
        strip = g.ramp(g.math("ADD", ax, wob), 0.034, 0.02)
        on_face = g.math("MULTIPLY", g.ramp(y, -1.02, -1.08), g.ramp(z, 1.36, 1.44))
        col = g.mix(g.math("MULTIPLY", strip, on_face), col, g.rgb((0.62, 0.58, 0.52)))
    for leg, on in enumerate(socks):
        if not on:
            continue
        side = 1 if leg % 2 == 0 else -1
        is_hind = leg >= 2
        sx = g.ramp(g.math("MULTIPLY", x, side), 0.05, 0.09)
        sy = g.ramp(y, 0.30, 0.36) if is_hind else g.ramp(y, -0.30, -0.36)
        sz = g.ramp(z, 0.30, 0.24)
        m = g.math("MULTIPLY", g.math("MULTIPLY", sx, sy), sz)
        col = g.mix(m, col, g.rgb((0.60, 0.56, 0.50)))
    col = g.mix(g.math("MULTIPLY", hair.outputs["Fac"], 0.12), col, g.rgb((0.0, 0.0, 0.0)))
    rough = g.math("ADD", 0.52, g.math("MULTIPLY", hair.outputs["Fac"], 0.2))
    _finish(g, col, rough)


def flat(mat, dark, light, scale=40.0, rough=0.8, stretch=(1, 1, 1)):
    g = _G(mat)
    tc = g.node("ShaderNodeTexCoord")
    mp = g.node("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = stretch
    g.L.new(tc.outputs["Object"], mp.inputs["Vector"])
    n = g.node("ShaderNodeTexNoise", Scale=scale, Detail=6.0, Roughness=0.65)
    g.L.new(mp.outputs[0], n.inputs["Vector"])
    col = g.mix(g.ramp(n.outputs["Fac"], 0.3, 0.7), g.rgb(dark), g.rgb(light))
    _finish(g, col, rough)


def blanket(mat):
    """A striped Navajo-style saddle blanket: red, cream and indigo bands."""
    g = _G(mat)
    tc = g.node("ShaderNodeTexCoord")
    sep = g.node("ShaderNodeSeparateXYZ")
    g.L.new(tc.outputs["Object"], sep.inputs[0])
    wave = g.node("ShaderNodeTexWave", _wave_type="BANDS", _bands_direction="Y", Scale=3.2, Distortion=0.0)
    g.L.new(tc.outputs["Object"], wave.inputs["Vector"])
    fib = g.node("ShaderNodeTexNoise", Scale=260.0, Detail=2.0)
    g.L.new(tc.outputs["Object"], fib.inputs["Vector"])
    v = wave.outputs["Fac"]
    col = g.mix(g.ramp(v, 0.3, 0.36), g.rgb((0.36, 0.05, 0.03)), g.rgb((0.55, 0.47, 0.34)))
    col = g.mix(g.ramp(v, 0.72, 0.78), col, g.rgb((0.05, 0.06, 0.12)))
    col = g.mix(g.math("MULTIPLY", fib.outputs["Fac"], 0.25), col, g.rgb((0.05, 0.04, 0.03)))
    _finish(g, col, 0.95)


def build_all():
    specs = {
        "HR_Coat": lambda m: coat(m),
        "HR_Hair": lambda m: flat(m, (0.012, 0.009, 0.008), (0.045, 0.032, 0.025), scale=90.0, rough=0.55, stretch=(3, 3, 0.3)),
        "HR_Eye": lambda m: flat(m, (0.004, 0.003, 0.003), (0.02, 0.012, 0.008), scale=10.0, rough=0.08),
        "HR_Hoof": lambda m: flat(m, (0.05, 0.042, 0.035), (0.11, 0.095, 0.075), scale=30.0, rough=0.6, stretch=(1, 1, 8)),
        "HR_Leather": lambda m: flat(m, (0.10, 0.052, 0.025), (0.19, 0.11, 0.055), scale=35.0, rough=0.55),
        "HR_Blanket": lambda m: blanket(m),
        "HR_Iron": lambda m: flat(m, (0.05, 0.05, 0.052), (0.14, 0.13, 0.12), scale=60.0, rough=0.45),
        "HR_Brass": lambda m: flat(m, (0.35, 0.24, 0.08), (0.62, 0.46, 0.18), scale=40.0, rough=0.35),
        "HR_Rope": lambda m: flat(m, (0.28, 0.22, 0.14), (0.45, 0.38, 0.26), scale=120.0, rough=0.9, stretch=(1, 1, 6)),
    }
    for name, build in specs.items():
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        build(mat)
        MATS[name] = mat
    return MATS
