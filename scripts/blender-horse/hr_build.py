"""Build the horse end to end inside Blender and export public/models/horse.glb.

    import hr_build; hr_build.start()          # full build on a timer
    import hr_build; hr_build.build(bake=False) # geometry + rig only

Stages: body and parts -> game meshes (decimated body) -> shared UV atlas ->
colour / roughness / AO bakes from the procedural materials -> armature,
weights, Idle/Walk/Trot/Gallop -> glTF. Status in /tmp/hc_horse/status.txt.

Output meshes, all skinned to HorseRig and sharing one material:
  Horse         body, hooves, mane, tail, eyes, bridle and bit
  HorseSaddle   blanket, saddle, rigging, stirrups, lariat (ridden horse)
  HorseHarness  collar, hames, pad, breeching, traces (coach team)
"""

import importlib
import math
import os
import time
import traceback

import bmesh
import bpy
import numpy as np

import hr_body
import hr_parts
import hr_preview
import hr_rig
import hr_shade

OUT = "/Users/brian/Projects/high-country/public/models/horse.glb"
TEX = "/tmp/hc_horse/tex"
STATUS = "/tmp/hc_horse/status.txt"
RES = 2048
BODY_TRIS = 16000


def log(msg):
    os.makedirs(os.path.dirname(STATUS), exist_ok=True)
    with open(STATUS, "a") as fh:
        fh.write(f"{time.strftime('%H:%M:%S')} {msg}\n")


def tris(ob):
    return sum(len(p.vertices) - 2 for p in ob.data.polygons)


def _select(obs, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for ob in obs:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = active or obs[0]


def _join(obs, name):
    _select(obs)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def geometry():
    hr_shade.MODE = "color"
    M = hr_shade.build_all()
    body, hooves = hr_body.build()
    # Game body: collapse-decimate the voxel remesh to the budget.
    dec = body.modifiers.new("dec", "DECIMATE")
    dec.ratio = BODY_TRIS / max(tris(body), 1)
    dec.use_collapse_triangulate = True
    _select([body])
    bpy.ops.object.modifier_apply(modifier="dec")
    body.data.materials.append(M["HR_Coat"])
    hooves.data.materials.append(M["HR_Hoof"])
    main = [body, hooves, hr_parts.mane(M["HR_Hair"]), hr_parts.tail(M["HR_Hair"]), hr_parts.eyes(M["HR_Eye"])]
    main += list(hr_parts.bridle(M["HR_Leather"], M["HR_Iron"]))
    saddle = hr_parts.saddle(M["HR_Leather"], M["HR_Blanket"], M["HR_Iron"], M["HR_Rope"])
    harness = hr_parts.harness(M["HR_Leather"], M["HR_Iron"], M["HR_Brass"])
    horse = _join(main, "Horse")
    sad = _join(saddle, "HorseSaddle")
    har = _join(harness, "HorseHarness")
    for ob in (horse, sad, har):
        for p in ob.data.polygons:
            p.use_smooth = True
    log(f"tris Horse {tris(horse)} Saddle {tris(sad)} Harness {tris(har)}")
    return horse, sad, har


def atlas(obs):
    for ob in obs:
        me = ob.data
        while me.uv_layers:
            me.uv_layers.remove(me.uv_layers[0])
        me.uv_layers.new(name="UVMap")
    _select(obs)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=0.0, area_weight=0.0, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(rotate=True, margin_method="FRACTION", margin=0.003, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")


def _image(name, colorspace):
    img = bpy.data.images.get(name)
    if img:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, RES, RES, alpha=False)
    img.colorspace_settings.name = colorspace
    return img


def _bake(obs, img, bake_type, fill, **kw):
    img.pixels = np.tile(np.array(fill, dtype=np.float32), RES * RES)
    for mat in hr_shade.MATS.values():
        nt = mat.node_tree
        node = nt.nodes.get("BakeTarget") or nt.nodes.new("ShaderNodeTexImage")
        node.name = "BakeTarget"
        node.image = img
        nt.nodes.active = node
    for ob in obs:
        _select([ob])
        bpy.ops.object.bake(type=bake_type, margin=6, use_clear=False, **kw)


def bake(obs, samples=32):
    os.makedirs(TEX, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "GPU"
    sc.cycles.samples = 1
    hr_shade.MODE = "color"
    hr_shade.build_all()
    base = _image("horse_basecolor", "sRGB")
    _bake(obs, base, "EMIT", (0.2, 0.1, 0.05, 1))
    log("baked colour")
    hr_shade.MODE = "rough"
    hr_shade.build_all()
    rough = _image("horse_rough", "Non-Color")
    _bake(obs, rough, "EMIT", (0.6, 0.6, 0.6, 1))
    log("baked roughness")
    sc.cycles.samples = samples
    if sc.world is None:
        sc.world = bpy.data.worlds.new("World")
    sc.world.light_settings.distance = 0.35
    ao = _image("horse_ao", "Non-Color")
    _bake(obs, ao, "AO", (1, 1, 1, 1))
    log("baked AO")
    px_r = np.array(rough.pixels[:], dtype=np.float32).reshape(RES, RES, 4)
    px_a = np.array(ao.pixels[:], dtype=np.float32).reshape(RES, RES, 4)
    orm = _image("horse_orm", "Non-Color")
    out = np.ones((RES, RES, 4), dtype=np.float32)
    out[..., 0] = np.clip(0.3 + 0.7 * px_a[..., 0], 0, 1)
    out[..., 1] = px_r[..., 0]
    out[..., 2] = 0.0
    orm.pixels = out.ravel()
    for img, fn in ((base, "horse_basecolor.png"), (orm, "horse_orm.png")):
        img.filepath_raw = f"{TEX}/{fn}"
        img.file_format = "PNG"
        img.save()
    return base, orm


def final_material(base, orm):
    mat = bpy.data.materials.get("HorseMat") or bpy.data.materials.new("HorseMat")
    mat.use_backface_culling = True
    g = hr_shade._G(mat)
    out = g.node("ShaderNodeOutputMaterial")
    bsdf = g.node("ShaderNodeBsdfPrincipled")
    g.L.new(bsdf.outputs[0], out.inputs[0])
    tb = g.node("ShaderNodeTexImage")
    tb.image = base
    g.L.new(tb.outputs["Color"], bsdf.inputs["Base Color"])
    to = g.node("ShaderNodeTexImage")
    to.image = orm
    sep = g.node("ShaderNodeSeparateColor")
    g.L.new(to.outputs["Color"], sep.inputs[0])
    g.L.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    g.L.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    grp = bpy.data.node_groups.get("glTF Material Output")
    if grp is None:
        grp = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
        grp.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    gn = g.node("ShaderNodeGroup")
    gn.node_tree = grp
    g.L.new(sep.outputs["Red"], gn.inputs["Occlusion"])
    return mat


def export(rig, meshes, path=OUT):
    sc = bpy.context.scene
    sc.render.fps = hr_rig.FPS
    sc.render.fps_base = 1.0
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
    ad = rig.animation_data
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    for clip in ("Idle", "Walk", "Trot", "Gallop"):
        act = bpy.data.actions[clip]
        tr = ad.nla_tracks.new()
        tr.name = clip
        tr.strips.new(clip, int(act.frame_range[0]), act)
        tr.mute = True
    _select([rig] + list(meshes), rig)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
        export_texcoords=True, export_normals=True, export_tangents=False, export_materials="EXPORT",
        export_image_format="JPEG", export_jpeg_quality=90, export_skins=True, export_influence_nb=4,
        export_all_influences=False, export_def_bones=True, export_rest_position_armature=True,
        export_animations=True, export_animation_mode="NLA_TRACKS", export_force_sampling=True,
        export_frame_step=1, export_optimize_animation_size=False, export_anim_single_armature=True,
        export_reset_pose_bones=True, export_morph=False, export_lights=False, export_cameras=False,
        export_extras=False, export_attributes=False,
    )
    return path


def build(bake_maps=True):
    for mod in (hr_body, hr_shade, hr_parts, hr_rig, hr_preview):
        importlib.reload(mod)
    for name in ("HorseRig",):
        ob = bpy.data.objects.get(name)
        if ob:
            bpy.data.objects.remove(ob, do_unlink=True)
    horse, sad, har = geometry()
    meshes = (horse, sad, har)
    atlas(meshes)
    log("atlas packed")
    rig = hr_rig.build_armature()
    hr_rig.skin(meshes, rig)
    log("skinned")
    hr_rig.author_all(rig)
    log("clips authored")
    if not bake_maps:
        return rig, meshes
    # The last authored key leaves every pose bone at a gait pose; the
    # materials read object coordinates of the deformed mesh, so bake at rest
    # or the leg points land wherever the gallop left the legs.
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)
    bpy.context.view_layer.update()
    base, orm = bake(meshes)
    mat = final_material(base, orm)
    for ob in meshes:
        ob.data.materials.clear()
        ob.data.materials.append(mat)
    path = export(rig, meshes)
    log(f"exported {path} {os.path.getsize(path)} bytes")
    return rig, meshes


def start():
    if os.path.exists(STATUS):
        os.remove(STATUS)

    def job():
        try:
            build()
            log("DONE")
        except Exception:
            log("FAILED\n" + traceback.format_exc())
        return None

    bpy.app.timers.register(job, first_interval=0.5)
    return STATUS
