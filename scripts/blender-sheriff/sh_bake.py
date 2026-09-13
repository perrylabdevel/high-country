"""Low-poly generation, UV atlas, and high->low texture baking.

Outputs (in /tmp/hc_sheriff/tex):
  sheriff_basecolor.png  sRGB
  sheriff_normal.png     tangent-space, OpenGL (+Y) as glTF expects
  sheriff_orm.png        R occlusion, G roughness, B metallic
"""

import math
import os

import bmesh
import bpy
import numpy as np

from sh_common import apply_modifiers, collection

HP = "Sheriff_HP"
LP = "Sheriff_LP"
TEX = "/tmp/hc_sheriff/tex"
RES = 2048

# name: (target triangles, texel priority)
LOW = {
    "HP_Cloth": (11000, 1.0),
    "HP_Vest": (2600, 1.0),
    "HP_Skin": (5200, 3.2),
    "HP_HandL": (1500, 1.7),
    "HP_HandR": (1500, 1.7),
    "HP_Hair": (2600, 1.6),
    "HP_Eyes": (480, 2.5),
    "HP_Boots": (3200, 1.0),
    "HP_Hat": (2600, 1.1),
    "HP_Gear_bandana": (1400, 1.2),
    "HP_Gear_gunbelt": (960, 1.2),
    "HP_Gear_holster": (1244, 1.5),
    "HP_Gear_gun": (648, 2.2),
    "HP_Gear_grip": (558, 2.2),
    "HP_Gear_badge": (884, 3.0),
    "HP_Gear_buckle": (30, 2.0),
    "HP_Gear_buttons": (256, 2.0),
    "HP_Gear_pockets": (520, 1.0),
    "HP_Gear_chain": (816, 1.0),
    "HP_Gear_loops": (168, 1.2),
    "HP_Gear_brass": (2240, 1.5),
    "HP_Gear_tiedown": (144, 1.0),
    "HP_Gear_spurs": (480, 1.2),
    "HP_Gear_concho": (80, 2.0),
}


# --------------------------------------------------------------------------
# Bake shaders on the high-poly meshes


def _nodes(mat):
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    return nt, nt.nodes, nt.links


def hp_material(name, kind="generic", noise_scale=300.0, stretch=(1, 1, 1), color_var=0.12, bump=0.25):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    nt, N, L = _nodes(mat)
    out = N.new("ShaderNodeOutputMaterial")
    bsdf = N.new("ShaderNodeBsdfPrincipled")
    L.new(bsdf.outputs[0], out.inputs[0])
    alb = N.new("ShaderNodeAttribute")
    alb.attribute_name = "alb"
    orm = N.new("ShaderNodeAttribute")
    orm.attribute_name = "orm"
    sep = N.new("ShaderNodeSeparateColor")
    L.new(orm.outputs["Color"], sep.inputs[0])

    tc = N.new("ShaderNodeTexCoord")
    mapping = N.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = stretch
    L.new(tc.outputs["Object"], mapping.inputs[0])
    noise = N.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = noise_scale
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.6
    L.new(mapping.outputs[0], noise.inputs["Vector"])

    # Colour variation: base * (1 + (noise - 0.5) * var)
    sub = N.new("ShaderNodeMath")
    sub.operation = "SUBTRACT"
    sub.inputs[1].default_value = 0.5
    L.new(noise.outputs["Fac"], sub.inputs[0])
    mul = N.new("ShaderNodeMath")
    mul.operation = "MULTIPLY"
    mul.inputs[1].default_value = color_var
    L.new(sub.outputs[0], mul.inputs[0])
    add = N.new("ShaderNodeMath")
    add.operation = "ADD"
    add.inputs[1].default_value = 1.0
    L.new(mul.outputs[0], add.inputs[0])
    tint = N.new("ShaderNodeMix")
    tint.data_type = "RGBA"
    tint.blend_type = "MULTIPLY"
    tint.inputs["Factor"].default_value = 1.0
    L.new(alb.outputs["Color"], tint.inputs["A"])
    comb = N.new("ShaderNodeCombineColor")
    for i in range(3):
        L.new(add.outputs[0], comb.inputs[i])
    L.new(comb.outputs[0], tint.inputs["B"])
    base_socket = tint.outputs["Result"]

    height = noise.outputs["Fac"]
    if kind == "cloth":
        wave_a = N.new("ShaderNodeTexWave")
        wave_a.wave_type = "BANDS"
        wave_a.bands_direction = "X"
        wave_a.inputs["Scale"].default_value = 900
        wave_b = N.new("ShaderNodeTexWave")
        wave_b.wave_type = "BANDS"
        wave_b.bands_direction = "Z"
        wave_b.inputs["Scale"].default_value = 900
        L.new(tc.outputs["Object"], wave_a.inputs["Vector"])
        L.new(tc.outputs["Object"], wave_b.inputs["Vector"])
        mx = N.new("ShaderNodeMath")
        mx.operation = "MAXIMUM"
        L.new(wave_a.outputs["Fac"], mx.inputs[0])
        L.new(wave_b.outputs["Fac"], mx.inputs[1])
        hmix = N.new("ShaderNodeMath")
        hmix.operation = "ADD"
        L.new(mx.outputs[0], hmix.inputs[0])
        L.new(noise.outputs["Fac"], hmix.inputs[1])
        height = hmix.outputs[0]
    if kind == "skin":
        vor = N.new("ShaderNodeTexVoronoi")
        vor.feature = "DISTANCE_TO_EDGE"
        vor.inputs["Scale"].default_value = 2600
        L.new(tc.outputs["Object"], vor.inputs["Vector"])
        hmix = N.new("ShaderNodeMath")
        hmix.operation = "ADD"
        L.new(vor.outputs["Distance"], hmix.inputs[0])
        L.new(noise.outputs["Fac"], hmix.inputs[1])
        height = hmix.outputs[0]
    if kind == "pinstripe":
        wave = N.new("ShaderNodeTexWave")
        wave.wave_type = "BANDS"
        wave.bands_direction = "X"
        wave.bands_direction = "X"
        wave.wave_profile = "SAW"
        wave.inputs["Scale"].default_value = 520
        L.new(tc.outputs["Object"], wave.inputs["Vector"])
        ramp = N.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.88
        ramp.color_ramp.elements[0].color = (0, 0, 0, 1)
        ramp.color_ramp.elements[1].position = 0.94
        ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
        L.new(wave.outputs["Fac"], ramp.inputs[0])
        stripe = N.new("ShaderNodeMix")
        stripe.data_type = "RGBA"
        stripe.blend_type = "SCREEN"
        L.new(ramp.outputs["Color"], stripe.inputs["Factor"])
        L.new(base_socket, stripe.inputs["A"])
        stripe.inputs["B"].default_value = (0.075, 0.068, 0.062, 1)
        base_socket = stripe.outputs["Result"]

    if kind == "eye":
        base_socket = _eye_colour(N, L, tc)

    L.new(base_socket, bsdf.inputs["Base Color"])
    L.new(sep.outputs["Red"], bsdf.inputs["Roughness"])
    L.new(sep.outputs["Green"], bsdf.inputs["Metallic"])

    bmp = N.new("ShaderNodeBump")
    bmp.inputs["Distance"].default_value = 0.0004
    strength = N.new("ShaderNodeMath")
    strength.operation = "MULTIPLY"
    strength.inputs[1].default_value = bump
    L.new(sep.outputs["Blue"], strength.inputs[0])
    L.new(strength.outputs[0], bmp.inputs["Strength"])
    L.new(height, bmp.inputs["Height"])
    L.new(bmp.outputs["Normal"], bsdf.inputs["Normal"])

    # Emission carries (roughness, metallic) for the ORM bake; strength 0
    # during colour/normal bakes, toggled by bake_orm().
    emit = N.new("ShaderNodeCombineColor")
    L.new(sep.outputs["Red"], emit.inputs[1])
    L.new(sep.outputs["Green"], emit.inputs[2])
    emit.name = "ORM_EMIT"
    L.new(emit.outputs[0], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.0
    return mat


def _eye_colour(N, L, tc):
    # Canonical (pre-warp) position, stored by the character pipeline, so the
    # iris lands on the eye whatever the head's final size and height.
    geo = N.new("ShaderNodeAttribute")
    geo.attribute_name = "cpos"
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(geo.outputs["Vector"], sep.inputs[0])

    def math(op, a, b=None, val=None):
        m = N.new("ShaderNodeMath")
        m.operation = op
        if isinstance(a, float):
            m.inputs[0].default_value = a
        else:
            L.new(a, m.inputs[0])
        if b is not None:
            L.new(b, m.inputs[1])
        elif val is not None:
            m.inputs[1].default_value = val
        return m.outputs[0]

    ax = math("ABSOLUTE", sep.outputs["X"])
    dx = math("SUBTRACT", ax, val=0.0325)
    dz = math("SUBTRACT", sep.outputs["Z"], val=1.692)
    r = math("SQRT", math("ADD", math("MULTIPLY", dx, dx), math("MULTIPLY", dz, dz)))
    ramp = N.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    stops = [
        (0.0000, (0.004, 0.004, 0.004)),
        (0.0021, (0.006, 0.006, 0.006)),
        (0.0024, (0.17, 0.13, 0.06)),
        (0.0040, (0.10, 0.14, 0.17)),
        (0.0054, (0.06, 0.08, 0.10)),
        (0.0061, (0.02, 0.022, 0.025)),
        (0.0068, (0.62, 0.56, 0.48)),
        (0.0120, (0.55, 0.40, 0.36)),
    ]
    cr.elements[0].position = stops[0][0] / 0.013
    cr.elements[0].color = (*stops[0][1], 1)
    cr.elements[1].position = stops[1][0] / 0.013
    cr.elements[1].color = (*stops[1][1], 1)
    for pos, col in stops[2:]:
        e = cr.elements.new(pos / 0.013)
        e.color = (*col, 1)
    L.new(math("DIVIDE", r, val=0.013), ramp.inputs[0])
    # Behind the cornea everything is sclera.
    front = math("LESS_THAN", sep.outputs["Y"], val=-0.064)
    mix = N.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    L.new(front, mix.inputs["Factor"])
    mix.inputs["A"].default_value = (0.55, 0.42, 0.38, 1)
    L.new(ramp.outputs["Color"], mix.inputs["B"])
    return mix.outputs["Result"]


def assign_hp_materials():
    objs = bpy.data.collections[HP].objects
    shirt = hp_material("HPM_Shirt", "cloth", 420, (1, 1, 1), 0.10, 0.35)
    pants = hp_material("HPM_Pants", "cloth", 380, (1, 1, 1), 0.14, 0.45)
    vest = hp_material("HPM_Vest", "pinstripe", 500, (1, 1, 1), 0.10, 0.25)
    cloth = objs["HP_Cloth"].data
    skin_cloth = hp_material("HPM_SkinArm", "skin", 900, (1, 1, 1), 0.06, 0.08)
    for i, m in enumerate((shirt, pants, skin_cloth)[:len(cloth.materials)]):
        cloth.materials[i] = m
    table = {
        "HP_Skin": hp_material("HPM_Skin", "skin", 900, (1, 1, 1), 0.06, 0.08),
        "HP_HandL": hp_material("HPM_Hands", "skin", 900, (1, 1, 1), 0.06, 0.08),
        "HP_Hair": hp_material("HPM_Hair", "generic", 2400, (1, 1, 0.07), 0.35, 0.3),
        "HP_Eyes": hp_material("HPM_Eyes", "eye", 3000, (1, 1, 1), 0.02, 0.0),
        "HP_Boots": hp_material("HPM_Boots", "generic", 520, (1, 1, 1), 0.12, 0.22),
        "HP_Vest": vest,
        "HP_Hat": hp_material("HPM_Hat", "generic", 600, (1, 1, 1), 0.10, 0.06),
    }
    table["HP_HandR"] = table["HP_HandL"]
    leather = hp_material("HPM_Leather", "generic", 700, (1, 1, 1), 0.15, 0.35)
    metal = hp_material("HPM_Metal", "generic", 900, (1, 1, 6), 0.08, 0.10)
    wood = hp_material("HPM_Wood", "generic", 250, (1, 1, 12), 0.30, 0.25)
    fabric = hp_material("HPM_Bandana", "cloth", 700, (1, 1, 1), 0.12, 0.35)
    for key in ("gunbelt", "holster", "loops", "tiedown", "pockets", "buttons"):
        table["HP_Gear_" + key] = leather
    for key in ("gun", "badge", "buckle", "chain", "brass", "spurs", "concho"):
        table["HP_Gear_" + key] = metal
    table["HP_Gear_grip"] = wood
    table["HP_Gear_bandana"] = fabric
    wool = hp_material("HPM_Wool", "cloth", 520, (1, 1, 1), 0.12, 0.30)
    knit = hp_material("HPM_Knit", "generic", 1400, (1, 1, 0.5), 0.20, 0.45)
    for key in ("suspenders", "satchel", "waistband"):
        table["HP_Gear_" + key] = leather
    for key in ("spectacles",):
        table["HP_Gear_" + key] = metal
    table["HP_Gear_pipe"] = wood
    for key in ("papers", "collar", "cravat"):
        table["HP_Gear_" + key] = fabric
    table["HP_Gear_rope"] = hp_material("HPM_Rope", "generic", 900, (1, 1, 1), 0.25, 0.6)
    table["HP_Skirt"] = pants
    table["HP_Coat"] = wool
    table["HP_Shawl"] = knit
    table["HP_Apron"] = leather if (objs.get("HP_Apron") and objs["HP_Apron"].get("leather")) else shirt
    for name, mat in table.items():
        if name not in objs:
            continue
        me = objs[name].data
        if len(me.materials):
            for i in range(len(me.materials)):
                me.materials[i] = mat
        else:
            me.materials.append(mat)


# --------------------------------------------------------------------------
# Low poly + UV

GEAR_BUDGET = {
    "suspenders": (800, 1.2), "spectacles": (700, 2.0), "pipe": (500, 2.0), "satchel": (700, 1.2),
    "papers": (100, 1.0), "rope": (2200, 1.0), "collar": (700, 1.2), "cravat": (400, 1.5), "waistband": (500, 1.0),
}
PIECE_BUDGET = {
    "HP_Cloth": (10000, 1.0), "HP_Vest": (2400, 1.0), "HP_Skirt": (3600, 1.0), "HP_Coat": (5200, 1.0),
    "HP_Apron": (1600, 1.0), "HP_Shawl": (1900, 1.0), "HP_Skin": (5000, 3.2), "HP_HandL": (1400, 1.7),
    "HP_HandR": (1400, 1.7), "HP_Hair": (3000, 1.6), "HP_Eyes": (480, 2.5), "HP_Boots": (3000, 1.0),
    "HP_Hat": (2400, 1.1),
}


def configure_low(names):
    """Rebuild LOW (ordered) for the high-poly objects present."""
    base = dict(LOW)
    LOW.clear()
    for name in names:
        if name in PIECE_BUDGET:
            LOW[name] = PIECE_BUDGET[name]
        elif name.startswith("HP_Gear_"):
            key = name[len("HP_Gear_"):]
            LOW[name] = GEAR_BUDGET.get(key) or base.get(name) or (800, 1.0)
    return LOW



def _link_unique(ob, coll):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    coll.objects.link(ob)


def make_lowpoly():
    lpc = collection(LP)
    for ob in list(lpc.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    lows = []
    for name, (target, prio) in LOW.items():
        hp = bpy.data.objects[name]
        lo = hp.copy()
        lo.data = hp.data.copy()
        lo.name = name.replace("HP_", "LP_")
        lo.data.name = lo.name
        _link_unique(lo, lpc)
        tris = sum(len(p.vertices) - 2 for p in lo.data.polygons)
        if tris > target * 1.05:
            dec = lo.modifiers.new("dec", "DECIMATE")
            dec.decimate_type = "COLLAPSE"
            dec.ratio = target / tris
            dec.use_collapse_triangulate = True
            apply_modifiers(lo)
        for attr in list(lo.data.color_attributes):
            lo.data.color_attributes.remove(attr)
        lo["texel_priority"] = prio
        lows.append(lo)
    return lows


def _uv_unwrap(ob, prio):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    me = ob.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name="UVMap")
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.object.mode_set(mode="OBJECT")
    # Normalise UV area to 3D area, then weight by texel priority.
    bm = bmesh.new()
    bm.from_mesh(me)
    uv = bm.loops.layers.uv.active
    a3 = sum(f.calc_area() for f in bm.faces)
    auv = 0.0
    for f in bm.faces:
        pts = [l[uv].uv for l in f.loops]
        s = 0.0
        for i in range(len(pts)):
            x0, y0 = pts[i]
            x1, y1 = pts[(i + 1) % len(pts)]
            s += x0 * y1 - x1 * y0
        auv += abs(s) * 0.5
    k = math.sqrt(a3 / max(auv, 1e-12)) * prio
    for f in bm.faces:
        for l in f.loops:
            l[uv].uv = l[uv].uv * k
    bm.to_mesh(me)
    bm.free()


def build_atlas():
    lows = list(collection(LP).objects)
    for ob in lows:
        _uv_unwrap(ob, ob.get("texel_priority", 1.0))
    # Join into one mesh with one material slot per source (kept for skinning
    # regions) and pack every island into the shared atlas.
    bpy.ops.object.select_all(action="DESELECT")
    for ob in lows:
        ob["source"] = ob.name
        # Remember which piece each face came from for weighting.
        ob.data.attributes.new("piece", "INT", "FACE")
    for idx, ob in enumerate(lows):
        att = ob.data.attributes["piece"]
        att.data.foreach_set("value", [idx] * len(ob.data.polygons))
        ob.data.materials.clear()
        ob.select_set(True)
    target = bpy.data.objects.get("LP_Cloth")
    bpy.context.view_layer.objects.active = target
    names = [ob.name for ob in lows]
    bpy.ops.object.join()
    target.name = "Sheriff"
    target.data.name = "Sheriff"
    target["pieces"] = ",".join(names)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin_method="FRACTION", margin=0.004, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")
    return target


# --------------------------------------------------------------------------
# Baking


def _image(name, colorspace, alpha=False, float_buffer=False):
    img = bpy.data.images.get(name)
    if img is not None:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, RES, RES, alpha=alpha, float_buffer=float_buffer)
    img.colorspace_settings.name = colorspace
    return img


def _bake_material(ob, img):
    mat = bpy.data.materials.get("BAKE_Target") or bpy.data.materials.new("BAKE_Target")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    node = nt.nodes.new("ShaderNodeTexImage")
    node.image = img
    nt.nodes.active = node
    ob.data.materials.clear()
    ob.data.materials.append(mat)


def _set_emit(strength):
    for mat in bpy.data.materials:
        if not mat.name.startswith("HPM_") or not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf:
            bsdf.inputs["Emission Strength"].default_value = strength


EXTRUDE = {"Skirt": 0.006, "Coat": 0.007, "Apron": 0.004, "Shawl": 0.005, "Cloth": 0.007, "Vest": 0.004, "Skin": 0.004, "Hand": 0.003, "Hair": 0.006, "Eyes": 0.002,
           "Boots": 0.006, "Hat": 0.008, "Gear": 0.003}


def _extrusion(name):
    for key, val in EXTRUDE.items():
        if key in name:
            return val
    return 0.004


def split_pieces(ob):
    """Separate the joined low-poly by its 'piece' attribute."""
    # Piece attribute values index the LOW table order (see build_atlas).
    names = ["LP_" + k[3:] for k in LOW]
    me = ob.data
    me.materials.clear()
    for i, n in enumerate(names):
        mat = bpy.data.materials.get("PIECE_" + n) or bpy.data.materials.new("PIECE_" + n)
        me.materials.append(mat)
    piece = np.zeros(len(me.polygons), dtype=np.int32)
    me.attributes["piece"].data.foreach_get("value", piece)
    me.polygons.foreach_set("material_index", piece)
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.separate(type="MATERIAL")
    bpy.ops.object.mode_set(mode="OBJECT")
    parts = {}
    for o in bpy.context.selected_objects:
        mats = [m for m in o.data.materials if m]
        used = set()
        mi = np.zeros(len(o.data.polygons), dtype=np.int32)
        o.data.polygons.foreach_get("material_index", mi)
        for k in np.unique(mi):
            used.add(o.data.materials[int(k)].name)
        (name,) = tuple(used)
        lp = name[len("PIECE_"):]
        o.name = "BK_" + lp
        parts[lp] = o
    return parts


def _target_material(mat, img):
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    node = nt.nodes.new("ShaderNodeTexImage")
    node.image = img
    nt.nodes.active = node


def bake_all(samples=16):
    os.makedirs(TEX, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.bake.use_clear = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    scene.world.light_settings.distance = 0.06

    joined = bpy.data.objects["Sheriff"]
    parts = split_pieces(joined)
    hps = {o.name: o for o in bpy.data.collections[HP].objects}
    rays = ("visible_camera", "visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter", "visible_shadow")
    for o in parts.values():
        for vis in rays:
            setattr(o, vis, False)
    for o in hps.values():
        o.hide_render = False

    def pass_(bake_type, img, fill, **kw):
        # Pre-fill so islands missed by every ray read neutral, not black.
        img.pixels = np.tile(np.array(fill, dtype=np.float32), RES * RES)
        for lp, ob in parts.items():
            hp = hps[lp.replace("LP_", "HP_")]
            for slot in ob.data.materials:
                _target_material(slot, img)
            # Only the matching high-poly needs to be in the render scene
            # (AO wants everything); scene sync dominated the bake time.
            for other in hps.values():
                other.hide_render = (other is not hp) and bake_type != "AO"
            bpy.ops.object.select_all(action="DESELECT")
            hp.select_set(True)
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            ext = _extrusion(lp)
            bpy.ops.object.bake(type=bake_type, use_selected_to_active=True, cage_extrusion=ext,
                                max_ray_distance=ext * 3, margin=3, use_clear=False, **kw)

    _set_emit(0.0)
    base = _image("sheriff_basecolor", "sRGB")
    pass_("DIFFUSE", base, (0.2, 0.16, 0.12, 1), pass_filter={"COLOR"})
    nrm = _image("sheriff_normal", "Non-Color")
    pass_("NORMAL", nrm, (0.5, 0.5, 1.0, 1), normal_space="TANGENT")
    _set_emit(1.0)
    rm = _image("sheriff_rm", "Non-Color")
    pass_("EMIT", rm, (0.0, 0.8, 0.0, 1))
    _set_emit(0.0)
    scene.cycles.samples = 48
    ao = _image("sheriff_ao", "Non-Color")
    pass_("AO", ao, (1, 1, 1, 1))
    pack_orm(rm, ao)
    for o in hps.values():
        o.hide_render = False

    for o in parts.values():
        for vis in rays:
            setattr(o, vis, True)
    for img, fname in ((base, "sheriff_basecolor.png"), (nrm, "sheriff_normal.png"), (ao, "sheriff_ao.png"), (rm, "sheriff_rm.png")):
        img.filepath_raw = f"{TEX}/{fname}"
        img.file_format = "PNG"
        img.save()
    return parts


def pack_orm(rm, ao):
    px_rm = np.array(rm.pixels[:]).reshape(RES, RES, 4)
    px_ao = np.array(ao.pixels[:]).reshape(RES, RES, 4)
    orm = _image("sheriff_orm", "Non-Color")
    out = np.ones((RES, RES, 4))
    out[..., 0] = np.clip(0.3 + 0.7 * px_ao[..., 0], 0, 1)
    out[..., 1] = px_rm[..., 1]
    out[..., 2] = px_rm[..., 2]
    orm.pixels = out.ravel()
    orm.filepath_raw = f"{TEX}/sheriff_orm.png"
    orm.file_format = "PNG"
    orm.save()
    return orm


def rejoin(parts):
    bpy.ops.object.select_all(action="DESELECT")
    objs = list(parts.values())
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = "Sheriff"
    ob.data.name = "Sheriff"
    return ob


def final_material(ob):
    mat = bpy.data.materials.get("Sheriff") or bpy.data.materials.new("Sheriff")
    mat.use_nodes = True
    nt = mat.node_tree
    N, L = nt.nodes, nt.links
    N.clear()
    out = N.new("ShaderNodeOutputMaterial")
    bsdf = N.new("ShaderNodeBsdfPrincipled")
    L.new(bsdf.outputs[0], out.inputs[0])

    def tex(fname, colorspace):
        img = bpy.data.images.load(f"{TEX}/{fname}", check_existing=True)
        img.reload()
        img.colorspace_settings.name = colorspace
        node = N.new("ShaderNodeTexImage")
        node.image = img
        return node

    base = tex("sheriff_basecolor.png", "sRGB")
    L.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    orm = tex("sheriff_orm.png", "Non-Color")
    sep = N.new("ShaderNodeSeparateColor")
    L.new(orm.outputs["Color"], sep.inputs[0])
    L.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    L.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nrm = tex("sheriff_normal.png", "Non-Color")
    nmap = N.new("ShaderNodeNormalMap")
    L.new(nrm.outputs["Color"], nmap.inputs["Color"])
    L.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    # glTF occlusion socket.
    group = bpy.data.node_groups.get("glTF Material Output")
    if group is None:
        group = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        group.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    gnode = N.new("ShaderNodeGroup")
    gnode.node_tree = group
    L.new(sep.outputs["Red"], gnode.inputs["Occlusion"])
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    return mat
