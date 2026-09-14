"""Quick EEVEE contact renders of the horse collection from set angles."""

import math
import os

import bpy
import numpy as np
from mathutils import Vector

OUT = "/tmp/hc_horse/preview"
TILE = (720, 560)


def _rig():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.view_settings.view_transform = "AgX"
    sc.render.resolution_x, sc.render.resolution_y = TILE
    if sc.world is None:
        sc.world = bpy.data.worlds.new("World")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.55, 0.62, 0.72, 1)
    bg.inputs[1].default_value = 0.5
    cam = bpy.data.objects.get("HV_Cam") or bpy.data.objects.new("HV_Cam", bpy.data.cameras.new("HV_Cam"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    sun = bpy.data.objects.get("HV_Sun") or bpy.data.objects.new("HV_Sun", bpy.data.lights.new("HV_Sun", "SUN"))
    if sun.name not in sc.collection.objects:
        sc.collection.objects.link(sun)
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(-40))
    sc.camera = cam
    return cam


def render(names=None, views=((90, 8), (-35, 14), (180, 10), (0, 10)), path=f"{OUT}/sheet.png", target=(0, 0, 1.0), dist=5.2, lens=50, frame=None):
    os.makedirs(OUT, exist_ok=True)
    cam = _rig()
    cam.data.lens = lens
    sc = bpy.context.scene
    if frame is not None:
        sc.frame_set(frame)
    if names is not None:
        for ob in sc.objects:
            if ob.type in {"MESH", "ARMATURE", "META"}:
                ob.hide_render = ob.name not in names
    tiles = []
    for i, (yaw, pitch) in enumerate(views):
        a, e = math.radians(yaw), math.radians(pitch)
        d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        cam.location = Vector(target) + d * dist
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        p = f"{OUT}/tile_{i}.png"
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        tiles.append(p)
    cols = 2
    rows = math.ceil(len(tiles) / cols)
    sheet = np.zeros((rows * TILE[1], cols * TILE[0], 4), dtype=np.float32)
    for i, t in enumerate(tiles):
        img = bpy.data.images.load(t)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(TILE[1], TILE[0], 4)
        r, c = divmod(i, cols)
        y0 = (rows - 1 - r) * TILE[1]
        sheet[y0:y0 + TILE[1], c * TILE[0]:(c + 1) * TILE[0]] = px
        bpy.data.images.remove(img)
    out = bpy.data.images.new("HV_Sheet", cols * TILE[0], rows * TILE[1], alpha=True)
    out.pixels = sheet.ravel()
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)
    return path
