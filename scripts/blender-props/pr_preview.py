"""Contact-sheet renders of the prop kit for review (EEVEE, one tile per prop)."""

import math
import os

import bpy
import numpy as np
from mathutils import Vector

OUT = "/tmp/hc_props/preview"
TILE = (640, 480)


def _rig():
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.exposure = -0.3
    sc.render.resolution_x, sc.render.resolution_y = TILE
    sc.render.film_transparent = False
    if sc.world is None:
        sc.world = bpy.data.worlds.new("World")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.55, 0.62, 0.72, 1)
    bg.inputs[1].default_value = 0.35
    cam = bpy.data.objects.get("PV_Cam")
    if cam is None:
        cam = bpy.data.objects.new("PV_Cam", bpy.data.cameras.new("PV_Cam"))
        sc.collection.objects.link(cam)
    sc.camera = cam
    sun = bpy.data.objects.get("PV_Sun")
    if sun is None:
        sun = bpy.data.objects.new("PV_Sun", bpy.data.lights.new("PV_Sun", "SUN"))
        sc.collection.objects.link(sun)
    sun.data.energy = 3.0
    sun.data.angle = math.radians(2)
    sun.rotation_euler = (math.radians(52), 0, math.radians(35))
    ground = bpy.data.objects.get("PV_Ground")
    if ground is None:
        me = bpy.data.meshes.new("PV_Ground")
        me.from_pydata([(-200, -200, 0), (200, -200, 0), (200, 200, 0), (-200, 200, 0)], [], [(0, 1, 2, 3)])
        ground = bpy.data.objects.new("PV_Ground", me)
        sc.collection.objects.link(ground)
        m = bpy.data.materials.new("PV_Ground")
        m.use_nodes = True
        m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.36, 0.3, 0.23, 1)
        m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1.0
        me.materials.append(m)
    return cam


def render(names, path=f"{OUT}/sheet.png", cols=3, yaw=-35.0, pitch=22.0):
    os.makedirs(OUT, exist_ok=True)
    cam = _rig()
    tiles = []
    for name in names:
        ob = bpy.data.objects[name]
        pts = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        centre = (lo + hi) / 2
        radius = max((hi - lo).length / 2, 0.3)
        cam.data.lens = 50
        # Fit the narrower (vertical) field so tall props are not cropped.
        dist = radius / math.tan(min(cam.data.angle_x, cam.data.angle_y) / 2) * 1.05
        a, e = math.radians(yaw), math.radians(pitch)
        d = Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e)))
        cam.location = centre + d * dist
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        tile = f"{OUT}/tile_{name}.png"
        bpy.context.scene.render.filepath = tile
        bpy.ops.render.render(write_still=True)
        tiles.append(tile)
    rows = math.ceil(len(tiles) / cols)
    sheet = np.zeros((rows * TILE[1], cols * TILE[0], 4), dtype=np.float32)
    for i, t in enumerate(tiles):
        img = bpy.data.images.load(t)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(TILE[1], TILE[0], 4)
        r, c = divmod(i, cols)
        # Blender pixel rows run bottom-up; place row 0 at the top of the sheet.
        y0 = (rows - 1 - r) * TILE[1]
        sheet[y0:y0 + TILE[1], c * TILE[0]:(c + 1) * TILE[0]] = px
        bpy.data.images.remove(img)
    out = bpy.data.images.new("PV_Sheet", cols * TILE[0], rows * TILE[1], alpha=True)
    out.pixels = sheet.ravel()
    out.filepath_raw = path
    out.file_format = "PNG"
    out.save()
    bpy.data.images.remove(out)
    return path
