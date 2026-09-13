"""Preview renders of the sheriff for visual review (Workbench or Eevee)."""

import math

import bpy
from mathutils import Vector

OUT = "/tmp/hc_sheriff"


def _camera(name="PreviewCam"):
    cam = bpy.data.objects.get(name)
    if cam is None:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        bpy.context.scene.collection.objects.link(cam)
    return cam


def aim(cam, target):
    d = Vector(target) - cam.location
    cam.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def render(tag, views=("front", "side", "back"), engine="WORKBENCH", res=(900, 1400), focus=(0, 0, 0.95),
           dist=4.2, lens=50, height=None):
    scene = bpy.context.scene
    if engine != "KEEP":
        scene.render.engine = "BLENDER_WORKBENCH" if engine == "WORKBENCH" else "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    if engine == "WORKBENCH":
        sh = scene.display.shading
        sh.light = "STUDIO"
        sh.color_type = "MATERIAL"
        sh.show_cavity = True
        sh.cavity_type = "BOTH"
        sh.show_shadows = True
        scene.display.shading.studio_light = "Default"
    cam = _camera()
    cam.data.lens = lens
    scene.camera = cam
    paths = []
    angles = {"front": 0, "side": 90, "back": 180, "three": 35, "left": -90}
    for v in views:
        a = math.radians(angles[v])
        z = focus[2] if height is None else height
        cam.location = (focus[0] + dist * math.sin(a), focus[1] - dist * math.cos(a), z)
        aim(cam, focus)
        path = f"{OUT}/{tag}_{v}.png"
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        paths.append(path)
    return paths


def lookdev_lights():
    scene = bpy.context.scene
    if scene.world is None:
        scene.world = bpy.data.worlds.new("World")
    w = scene.world
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.42, 0.48, 0.58, 1)
    bg.inputs[1].default_value = 0.45
    for name, kind, loc, rot, energy, color, size in (
        ("LD_Sun", "SUN", (0, 0, 5), (math.radians(50), 0, math.radians(-35)), 3.2, (1.0, 0.92, 0.80), 0.03),
        ("LD_Rim", "AREA", (1.5, 2.5, 2.4), (math.radians(-60), 0, math.radians(150)), 220, (0.8, 0.88, 1.0), 1.5),
    ):
        ob = bpy.data.objects.get(name)
        if ob is None:
            ld = bpy.data.lights.new(name, kind)
            ob = bpy.data.objects.new(name, ld)
            scene.collection.objects.link(ob)
        ob.location = loc
        ob.rotation_euler = rot
        ob.data.energy = energy
        ob.data.color = color
        if kind == "SUN":
            ob.data.angle = size
        else:
            ob.data.size = size


def cycles(tag, views, res=(700, 1100), focus=(0, 0, 0.95), dist=3.6, samples=48, lens=50):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.view_settings.view_transform = "AgX"
    lookdev_lights()
    scene.render.resolution_x, scene.render.resolution_y = res
    cam = _camera()
    cam.data.lens = lens
    scene.camera = cam
    angles = {"front": 0, "side": 90, "back": 180, "three": 35, "left": -90, "threeR": -35}
    paths = []
    for v in views:
        a = math.radians(angles[v])
        cam.location = (focus[0] + dist * math.sin(a), focus[1] - dist * math.cos(a), focus[2] + 0.02)
        aim(cam, focus)
        path = f"{OUT}/{tag}_{v}.png"
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        paths.append(path)
    return paths
