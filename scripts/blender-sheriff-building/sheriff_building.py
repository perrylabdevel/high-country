"""Blender-authored exterior detail for Silver Creek's sheriff building.

The gameplay shell remains in ``src/landmarks.js``: it owns the 9 x 8 m
footprint, door/window apertures, floor, roof, interior and collisions.  This
script owns the visual form in the shell's lot-local frame:

    x = across the facade, y = up from the lot floor, +z = toward the street

Run through Blender MCP:

    ns = runpy.run_path('<repo>/scripts/blender-sheriff-building/sheriff_building.py')
    ns['build'](); ns['preview'](); ns['export']()

The JSON export is the synchronous runtime asset.  The GLB is a portable copy
for inspection and future asset-loader work.  No .blend is committed; the
script is the reproducible source of truth.
"""

import bpy
import json
import math
from pathlib import Path
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SCENE = 'High Country • Sheriff Building'
OUT = Path('/tmp/hc_sheriff-building')

W, D, EAVE = 9.0, 8.0, 4.4
FRONT = D / 2 + 0.11
BACK = -D / 2 - 0.11
SIDE = W / 2 + 0.11

# The kit does not stop at the wall planes. `falseFront` in
# src/buildings/kit.js adds two returns 0.4 m proud of BOTH side walls,
# running the full depth and the full height -- measured on the built lot at
# |x| 4.60 -> 5.00 -- plus a board 0.4 m proud of the facade and a sill block
# out to z 4.11 under each window. Trim drawn inside any of those renders in
# Blender and is invisible in the game.
#
# side_jail_detail() was drawn at SIDE and sat entirely within the return, so
# the barred windows it exists to show never appeared on screen at all;
# check:occlusion measured 63% of the iron batch buried. Applied trim belongs
# on the OUTER face of the kit part it dresses.
RET = W / 2 + 0.50      # outer face of the kit's false-front side returns
SILL_Z = D / 2 + 0.11   # outer face of the kit's window sill blocks

# Base colours steer Blender's own preview.  The game multiplies its baked
# material textures by the per-face Col attribute from the JSON export.
MATERIALS = {
    'paint': (0.72, 0.28, 0.18),
    'wood': (0.34, 0.18, 0.08),
    'stone': (0.46, 0.43, 0.36),
    'roof': (0.16, 0.18, 0.18),
    'iron': (0.055, 0.06, 0.065),
    'glass': (0.08, 0.16, 0.16),
}

CREAM = (0.93, 0.82, 0.59)
PAINT = (0.60, 0.20, 0.13)
PAINT_DARK = (0.42, 0.12, 0.09)
STONE = (0.53, 0.49, 0.40)
STONE_DARK = (0.38, 0.34, 0.28)
WOOD = (0.34, 0.18, 0.08)
WOOD_LIGHT = (0.52, 0.31, 0.14)
ROOF = (0.78, 0.79, 0.72)
IRON = (0.13, 0.15, 0.15)
GLASS = (0.10, 0.22, 0.21)
GOLD = (0.95, 0.70, 0.23)


def point(v):
    """Game XYZ -> Blender XYZ (Blender Z-up, game Y-up)."""
    return Vector((v[0], -v[2], v[1]))


class Acc:
    def __init__(self):
        self.verts = []
        self.faces = []
        self.tints = []

    def face(self, pts, tint):
        base = len(self.verts)
        self.verts.extend(pts)
        self.faces.append(tuple(range(base, base + len(pts))))
        self.tints.append(tint)


ACC = {}


def acc(material):
    return ACC.setdefault(material, Acc())


def solid(material, tint, loop_a, loop_b):
    """Closed prism between two matching game-coordinate vertex loops."""
    a = acc(material)
    pts = [Vector(p) for p in loop_a + loop_b]
    centre = sum(pts, Vector()) / len(pts)
    n = len(loop_a)

    def add(indices):
        poly = [pts[i] for i in indices]
        face_centre = sum(poly, Vector()) / len(poly)
        normal = (poly[1] - poly[0]).cross(poly[2] - poly[0])
        if normal.length < 1e-12 and len(poly) > 3:
            normal = (poly[2] - poly[1]).cross(poly[3] - poly[1])
        if normal.dot(face_centre - centre) < 0:
            poly.reverse()
        a.face([tuple(p) for p in poly], tint)

    add(list(range(n)))
    add(list(range(n, 2 * n)))
    for i in range(n):
        j = (i + 1) % n
        add([i, j, j + n, i + n])


def box(material, tint, x0, x1, y0, y1, z0, z1):
    if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
        return
    solid(material, tint,
          [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)],
          [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)])


def profile_z(material, tint, points_xy, z0, z1):
    solid(material, tint,
          [(x, y, z0) for x, y in points_xy],
          [(x, y, z1) for x, y in points_xy])


def profile_x(material, tint, points_yz, x0, x1):
    solid(material, tint,
          [(x0, y, z) for y, z in points_yz],
          [(x1, y, z) for y, z in points_yz])


def beam(material, tint, a, b, width=0.12):
    """A square beam along two game-space points."""
    start, end = Vector(a), Vector(b)
    delta = end - start
    if delta.length < 1e-4:
        return
    # Build in a local frame around the segment, then use a small cuboid
    # approximation.  These facade beams are axis/diagonal aligned, so this
    # keeps the exported mesh cheap and crisp.
    if abs(delta.x) > abs(delta.y) and abs(delta.x) > abs(delta.z):
        box(material, tint, min(start.x, end.x), max(start.x, end.x),
            (start.y + end.y) / 2 - width / 2, (start.y + end.y) / 2 + width / 2,
            (start.z + end.z) / 2 - width / 2, (start.z + end.z) / 2 + width / 2)
        return
    # Diagonal front gable trim gets a thin prism in the facade plane.
    normal = Vector((-delta.y, delta.x, 0.0)).normalized() * width / 2
    p0, p1 = start, end
    loop_a = [(p0.x + normal.x, p0.y + normal.y, p0.z),
              (p1.x + normal.x, p1.y + normal.y, p1.z),
              (p1.x - normal.x, p1.y - normal.y, p1.z),
              (p0.x - normal.x, p0.y - normal.y, p0.z)]
    solid(material, tint, loop_a,
          [(x, y, z + width) for x, y, z in loop_a])


def text(material, tint, body, x, y, z, size, depth):
    """Bake raised Blender font lettering into the game-space accumulator."""
    curve = bpy.data.curves.new('sheriff lettering', 'FONT')
    curve.body = body
    curve.align_x = 'CENTER'
    curve.align_y = 'CENTER'
    curve.size = size
    curve.extrude = depth / 2
    curve.resolution_u = 3
    obj = bpy.data.objects.new('temporary sheriff lettering', curve)
    bpy.context.scene.collection.objects.link(obj)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = obj.evaluated_get(depsgraph).to_mesh()
    dest = acc(material)
    for poly in mesh.polygons:
        dest.face([(x + mesh.vertices[i].co.x,
                    y + mesh.vertices[i].co.y,
                    z + depth / 2 + mesh.vertices[i].co.z)
                   for i in poly.vertices], tint)
    obj.evaluated_get(depsgraph).to_mesh_clear()
    bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.curves.remove(curve)


def star(material, tint, cx, cy, cz, outer=0.34, inner=0.14, points=5):
    pts = []
    for i in range(points * 2):
        angle = math.pi / 2 + i * math.pi / points
        radius = outer if i % 2 == 0 else inner
        pts.append((cx + radius * math.cos(angle), cy + radius * math.sin(angle), cz))
    # A shallow prism makes the badge visible from the street.
    solid(material, tint, pts, [(x, y, z + 0.045) for x, y, z in pts])


def window(x, y0, width=1.45, height=1.18):
    """A cased, six-pane window that sits over the kit's matching opening."""
    x0, x1 = x - width / 2, x + width / 2
    y1 = y0 + height
    z = FRONT + 0.05
    # No authored pane: the kit glazes the opening (two half-density panes that
    # read as one). A third pane here blocked the window outright.
    for xx in (x0 - 0.09, x1 + 0.09):
        box('wood', CREAM, xx - 0.065, xx + 0.065, y0 - 0.05, y1 + 0.08, z + 0.02, z + 0.15)
    box('wood', CREAM, x0 - 0.12, x1 + 0.12, y1 + 0.07, y1 + 0.20, z, z + 0.16)
    box('wood', CREAM, x0 - 0.12, x1 + 0.12, y0 - 0.16, y0 - 0.04, z - 0.02, z + 0.16)
    box('wood', CREAM, (x0 + x1) / 2 - 0.035, (x0 + x1) / 2 + 0.035, y0, y1, z + 0.025, z + 0.08)
    box('wood', CREAM, x0, x1, (y0 + y1) / 2 - 0.035, (y0 + y1) / 2 + 0.035, z + 0.025, z + 0.08)
    # A narrow iron sill bracket gives the facade a little depth. It has to
    # start OUTSIDE the kit's sill block (z 3.89 -> 4.11) or it is swallowed.
    for xx in (x0 + 0.18, x1 - 0.18):
        box('iron', IRON, xx - 0.035, xx + 0.035, y0 - 0.27, y0 - 0.15,
            SILL_Z + 0.01, SILL_Z + 0.12)


def front_wall():
    """Cladding segmented around the existing door and two window apertures."""
    door_half = 0.46
    # Keep the window heads one trim-width below the kit's 2.10 m door head.
    # Closer than 5 cm creates a wallX band that is deliberately dropped;
    # sharing the exact head lets the wider window headers consume the tag
    # before the narrower procedural door lintel.
    windows = [(-2.55, 1.45, 0.95, 1.10), (2.55, 1.45, 0.95, 1.10)]
    cuts = [(-door_half, door_half)] + [(x - w / 2, x + w / 2) for x, w, _, _ in windows]
    cuts.sort()

    # Stone plinth, with a real doorway gap preserved.
    cursor = -SIDE
    for a, b in cuts + [(SIDE, SIDE)]:
        if a > cursor:
            box('stone', STONE, cursor, a, 0.0, 1.15, FRONT, FRONT + 0.12)
        cursor = max(cursor, b)
    # Upper clapboard field, split around all openings.
    cursor = -SIDE
    for a, b in cuts + [(SIDE, SIDE)]:
        if a > cursor:
            box('paint', PAINT, cursor, a, 1.15, EAVE, FRONT, FRONT + 0.09)
        cursor = max(cursor, b)

    # Alternating clapboard shadow strips, kept shallow so they read at town
    # capture distance without becoming a noisy barcode.
    for row in range(8):
        y = 1.32 + row * 0.37
        for a, b in [(-SIDE, -3.28), (-1.82, 1.82), (3.28, SIDE)]:
            box('wood', PAINT_DARK, a, b, y, y + 0.035, FRONT + 0.09, FRONT + 0.115)

    # Corner quoins make the sheriff's stone base distinct from the generic
    # storefronts without widening the collision footprint.
    for xx in (-SIDE + 0.02, SIDE - 0.02):
        for row in range(5):
            yy = row * 0.23
            box('stone', STONE_DARK, xx - 0.16, xx + 0.16, yy, yy + 0.18, FRONT + 0.12, FRONT + 0.22)

    for x, width, y0, height in windows:
        window(x, y0, width, height)

    # The doorway is the kit's: it hangs the real leaf, standing open. This
    # used to draw a solid oak slab across the whole 0.92 x 2.10 opening -- under
    # a comment claiming the door "remains visually openable" -- with stiles
    # 0.085 m inside the jambs, so the entrance rendered shut (0% clear). Only a
    # frame belongs here, and it starts outside the opening.
    z = FRONT + 0.08
    for sx in (-1, 1):
        box('wood', CREAM, min(sx * 0.46, sx * 0.63), max(sx * 0.46, sx * 0.63),
            0.0, 2.55, z + 0.04, z + 0.18)
    box('wood', CREAM, -0.68, 0.68, 2.48, 2.70, z + 0.03, z + 0.18)
    box('glass', GLASS, -0.43, 0.43, 2.12, 2.45, z + 0.09, z + 0.11)
    box('wood', CREAM, -0.03, 0.03, 2.12, 2.45, z + 0.11, z + 0.17)
    # (The door handle went with the slab: it would float in the open doorway.)


def false_front():
    """The proud stepped sheriff false front and its painted sign."""
    z0, z1 = FRONT + 0.11, FRONT + 0.23
    # A solid pediment face dresses the kit's generated false front.
    profile_z('paint', PAINT_DARK,
              [(-4.72, 4.25), (4.72, 4.25), (4.72, 6.55),
               (3.70, 6.55), (0.0, 7.45), (-3.70, 6.55), (-4.72, 6.55)], z0, z1)
    # Light horizontal cap and diagonal rake boards create a readable outline.
    box('wood', CREAM, -4.92, 4.92, 6.48, 6.66, z1, z1 + 0.10)
    beam('wood', CREAM, (-3.78, 6.50, z1 + 0.04), (0, 7.52, z1 + 0.04), 0.16)
    beam('wood', CREAM, (0, 7.52, z1 + 0.04), (3.78, 6.50, z1 + 0.04), 0.16)
    for xx in (-4.60, 4.60):
        box('wood', CREAM, xx - 0.12, xx + 0.12, 4.22, 6.60, z1, z1 + 0.12)

    # Projecting signboard and raised lettering are the visual anchor from the
    # street.  The star gives the building a sheriff identity at a glance.
    box('wood', WOOD, -2.70, 2.70, 5.15, 6.17, z1 + 0.08, z1 + 0.24)
    box('wood', CREAM, -2.57, 2.57, 5.28, 6.04, z1 + 0.22, z1 + 0.29)
    box('paint', PAINT_DARK, -2.42, 2.42, 5.38, 5.94, z1 + 0.29, z1 + 0.32)
    text('wood', GOLD, 'SHERIFF', 0, 5.66, z1 + 0.33, 0.56, 0.08)
    star('wood', GOLD, 0, 4.82, z1 + 0.32, outer=0.25, inner=0.10)


def roof_and_cupola():
    """Low standing-seam roof behind the front and a tiny law-office cupola."""
    # Gable roof, ridge running front-to-back.  The false front conceals its
    # street end; the side profile is still unmistakable from the hills.
    profile_z('roof', ROOF,
              [(-4.72, 4.40), (0.0, 5.58), (4.72, 4.40)], BACK + 0.12, FRONT - 0.02)
    for xx in (-3.15, -1.58, 0, 1.58, 3.15):
        beam('iron', IRON, (xx, 4.47 + abs(xx) * -0.12, BACK + 0.08),
             (xx, 5.52 - abs(xx) * 0.22, FRONT - 0.10), 0.035)

    # Cupola body, open dark windows, and a simple cap.
    cx, cz = 0.0, -0.45
    box('wood', WOOD, -0.78, 0.78, 5.45, 6.42, cz - 0.66, cz + 0.66)
    for xx in (-0.76, 0.76):
        box('wood', CREAM, xx - 0.07, xx + 0.07, 5.52, 6.37, cz - 0.70, cz + 0.70)
    for zz in (cz - 0.67, cz + 0.67):
        box('wood', CREAM, -0.82, 0.82, 5.38, 5.51, zz - 0.07, zz + 0.07)
    box('glass', GLASS, -0.58, 0.58, 5.67, 6.20, cz + 0.68, cz + 0.70)
    box('glass', GLASS, -0.58, 0.58, 5.67, 6.20, cz - 0.70, cz - 0.68)
    box('wood', CREAM, -0.98, 0.98, 6.38, 6.56, cz - 0.88, cz + 0.88)
    profile_z('roof', ROOF, [(-1.05, 6.56), (0, 7.18), (1.05, 6.56)], cz - 0.92, cz + 0.92)


def porch_canopy():
    """A small hanging canopy over the threshold and two slim supports."""
    # Sloping awning: high at the facade, low at the boardwalk edge.
    profile_x('roof', ROOF, [(2.78, FRONT + 0.02), (3.12, FRONT + 0.02),
                             (2.78, 5.50), (2.62, 5.50)], -1.72, 1.72)
    # The front fascia and underside beam give it a deliberate silhouette.
    box('wood', CREAM, -1.86, 1.86, 2.60, 2.78, FRONT + 0.02, FRONT + 1.34)
    box('wood', WOOD, -1.70, 1.70, 2.54, 2.65, FRONT + 1.30, FRONT + 1.42)
    for xx in (-1.58, 1.58):
        box('wood', CREAM, xx - 0.09, xx + 0.09, 0.10, 2.60, 5.23, 5.39)
        beam('wood', CREAM, (xx, 2.52, 5.30), (xx * 0.55, 3.02, FRONT + 0.09), 0.11)
    # Lantern block under the canopy.
    box('iron', IRON, -0.16, 0.16, 2.24, 2.70, FRONT + 0.63, FRONT + 0.95)
    box('glass', GLASS, -0.10, 0.10, 2.30, 2.62, FRONT + 0.57, FRONT + 0.62)


def side_jail_detail():
    """Barred side windows sell the office's jail function without new holes.

    Applied to the OUTER face of the kit's false-front return (RET), not the
    wall plane. At SIDE the whole assembly -- frame, glass and all four bars --
    stood inside the return and never rendered in the game.
    """
    x = -RET - 0.02
    for zc in (-1.55, 0.15):
        box('wood', WOOD, x - 0.10, x + 0.02, 1.05, 2.35, zc - 0.92, zc + 0.92)
        box('glass', GLASS, x - 0.13, x - 0.09, 1.22, 2.18, zc - 0.72, zc + 0.72)
        for zz in (zc - 0.54, zc - 0.18, zc + 0.18, zc + 0.54):
            box('iron', IRON, x - 0.18, x - 0.03, 1.18, 2.22, zz - 0.035, zz + 0.035)


def stovepipe():
    """The office stove's pipe out through the roof, over the stove it serves
    (SHERIFF_REMODEL.FLUE; interior.py runs it up from the stove to the ceiling).
    The roof falls 1.18 over 4.72 from the 5.58 ridge."""
    x, z = 2.55, -2.55
    roof = 5.58 - 1.18 * abs(x) / 4.72
    n = 12
    ring = lambda r, y: [(x + r * math.cos(2 * math.pi * i / n), y, z + r * math.sin(2 * math.pi * i / n)) for i in range(n)]
    solid('iron', IRON, ring(0.075, roof - 0.2), ring(0.075, roof + 1.05))
    solid('iron', IRON, ring(0.16, roof - 0.06), ring(0.12, roof + 0.1))
    solid('iron', IRON, ring(0.15, roof + 1.05), ring(0.15, roof + 1.09))
    solid('iron', IRON, ring(0.19, roof + 1.2), ring(0.04, roof + 1.34))
    for a in range(3):
        t = a * 2 * math.pi / 3
        box('iron', IRON, x + 0.1 * math.cos(t) - 0.01, x + 0.1 * math.cos(t) + 0.01, roof + 1.07, roof + 1.22,
            z + 0.1 * math.sin(t) - 0.01, z + 0.1 * math.sin(t) + 0.01)


def ensure_materials():
    mats = {}
    for name, colour in MATERIALS.items():
        mat = bpy.data.materials.get('SheriffBuilding_' + name) or bpy.data.materials.new('SheriffBuilding_' + name)
        mat.diffuse_color = (*colour, 1)
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        bsdf.inputs['Base Color'].default_value = (*colour, 1)
        bsdf.inputs['Roughness'].default_value = 0.24 if name == 'glass' else 0.86
        if name == 'glass':
            bsdf.inputs['Alpha'].default_value = 0.30
            mat.surface_render_method = 'DITHERED'
        mats[name] = mat
    return mats


def build():
    scene = bpy.data.scenes.get(SCENE)
    if scene is None:
        scene = bpy.data.scenes.new(SCENE)
    bpy.context.window.scene = scene
    for obj in list(scene.objects):
        if obj.get('sheriff_building'):
            bpy.data.objects.remove(obj, do_unlink=True)
    ACC.clear()
    front_wall()
    false_front()
    roof_and_cupola()
    porch_canopy()
    side_jail_detail()
    stovepipe()
    mats = ensure_materials()
    total = 0
    for name, batch in ACC.items():
        mesh = bpy.data.meshes.new('Sheriff Building ' + name)
        mesh.from_pydata([point(v) for v in batch.verts], [], batch.faces)
        mesh.update()
        col = mesh.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
        for poly, tint in zip(mesh.polygons, batch.tints):
            for li in poly.loop_indices:
                col.data[li].color = (*tint, 1)
        mesh.materials.append(mats[name])
        obj = bpy.data.objects.new('Sheriff Building ' + name, mesh)
        obj['sheriff_building'] = True
        obj['material_batch'] = name
        scene.collection.objects.link(obj)
        total += len(batch.faces)
    scene['sheriff_building_generator'] = 'scripts/blender-sheriff-building/sheriff_building.py'
    print('Sheriff building:', total, 'faces in', len(ACC), 'material batches')
    return scene


def _remove_preview(scene):
    for obj in list(scene.objects):
        if obj.get('sheriff_preview'):
            bpy.data.objects.remove(obj, do_unlink=True)


def _look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def preview():
    """Render a 3/4 street view for the Blender MCP visual check."""
    scene = bpy.data.scenes[SCENE]
    bpy.context.window.scene = scene
    _remove_preview(scene)
    OUT.mkdir(parents=True, exist_ok=True)

    bpy.ops.mesh.primitive_plane_add(size=40, location=point((0, -0.04, 0)))
    ground = bpy.context.object
    ground.name = 'Sheriff preview ground'
    ground['sheriff_preview'] = True
    ground.data.materials.append(ensure_materials()['stone'])

    def add_light(kind, location, energy, size=5.0):
        data = bpy.data.lights.new('Sheriff preview ' + kind, kind)
        data.energy = energy
        if kind == 'AREA':
            data.shape = 'DISK'
            data.size = size
        obj = bpy.data.objects.new('Sheriff preview ' + kind, data)
        obj.location = point(location)
        obj['sheriff_preview'] = True
        scene.collection.objects.link(obj)
        _look_at(obj, point((0, 3.0, 4.0)))
        return obj

    add_light('AREA', (-8, 10, 11), 1050, 6)
    add_light('AREA', (8, 5, 5), 500, 5)
    add_light('SUN', (-4, 9, 2), 2.0)

    cam_data = bpy.data.cameras.new('Sheriff preview camera')
    cam = bpy.data.objects.new('Sheriff preview camera', cam_data)
    cam.location = point((-11.5, 5.2, 13.5))
    cam_data.lens = 52
    scene.collection.objects.link(cam)
    cam['sheriff_preview'] = True
    _look_at(cam, point((0, 3.0, 4.0)))
    scene.camera = cam

    scene.render.resolution_x = 1000
    scene.render.resolution_y = 800
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(OUT / 'sheriff-building.png')
    if scene.world is None:
        scene.world = bpy.data.worlds.new('Sheriff preview world')
    scene.world.color = (0.035, 0.045, 0.06)
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except TypeError:
        pass
    bpy.ops.render.render(write_still=True)
    print('Preview rendered to', scene.render.filepath)
    return scene.render.filepath


def export():
    scene = bpy.data.scenes[SCENE]
    bpy.context.window.scene = scene
    batches = {}
    for obj in scene.objects:
        if obj.type != 'MESH' or not obj.get('sheriff_building'):
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
                    # Invert point(): Blender (x, -game_z, game_y) -> game
                    # (x, y, z), preserving millimetre units.  Negating the
                    # wrong axes here silently put the whole runtime facade
                    # below the lot floor and behind the building even though
                    # Blender and the GLB preview remained correct.
                    batch['position'].extend((vertex[0], vertex[2], -vertex[1]))
                    batch['color'].extend(tint)
                batch['index'].append(idx)
    for batch in batches.values():
        del batch['lookup']

    target = ROOT / 'src/models/sheriff-building.json'
    target.write_text(json.dumps({
        'generator': 'scripts/blender-sheriff-building/sheriff_building.py',
        'units': {'position': 0.001, 'color': 0.01},
        'batches': batches
    }, separators=(',', ':')))

    dest = ROOT / 'public/models/buildings'
    dest.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in scene.objects:
        if obj.type == 'MESH' and obj.get('sheriff_building'):
            obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(dest / 'sheriff-building.glb'), export_format='GLB', use_selection=True, use_active_scene=True)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE / 'sheriff-building.blend'), copy=True)
    print('Exported', sum(len(b['index']) // 3 for b in batches.values()), 'triangles;', len(batches), 'batches;', target)
    return str(target)
