"""
Bind the settler woman's unskinned garment meshes to her skeleton.

Runs HEADLESS - no Blender GUI, no copy-paste:

    /Applications/Blender.app/Contents/MacOS/Blender --background \
        --python scripts/blender-skin-garments.py -- <in.glb> <out.glb>

WHAT IS WRONG WITH THE FILE
    medieval_poor_woman.glb ships 5 meshes but only 3 are skinned (measured by
    scripts/blender-dump-scene.py):

        SKINNED  Object_6   Body_Bodymat_0          15974 verts, 68 vgroups
        SKINNED  Object_8   default_eyes_0            804 verts
        SKINNED  Object_10  Eyelashes_Bodymat.1_0     106 verts
        NOT      CLOTHES_MUJER_03_FABRIC_2_FRONT_1732_0  11370 verts, 0 vgroups
        NOT      0003_AN_PC_Sire_F_HV0205_A00_Helmet_material0003_0  404 verts, 0 vgroups

    Blouse, sleeves, skirt and headscarf have NO vertex groups, so nothing can
    move them: they stay frozen in the T-pose bind while the arm bones rotate
    down inside them.

NOTES THAT COST TIME TO LEARN
    - Do not start from an empty scene. The glTF importer reads
      bpy.context.object while setting up armature display; with no active
      object that attribute does not exist and the import dies with
      "'Context' object has no attribute 'object'". The default startup scene
      has an active Cube, so import first and delete the Cube after.
    - Skip the "glTF_not_exported" collection. The importer parks an Icosphere
      there as the armature-display widget; it is not part of the character.
    - A mesh only deforms with BOTH an armature modifier and vertex groups.
      Bone-heat weighting can fail with only a warning, leaving a mesh that
      looks parented and still does not move - so this verifies before writing.
"""

import sys

import bpy
import mathutils

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(argv) != 2:
    raise SystemExit("usage: blender --background --python this.py -- <in.glb> <out.glb>")
SRC, DST = argv
SKIP_COLLECTIONS = {"glTF_not_exported"}

# Import into the default startup scene (its Cube keeps context.object valid).
bpy.ops.import_scene.gltf(filepath=SRC)

for name in ("Cube", "Camera", "Light"):
    ob = bpy.data.objects.get(name)
    if ob is not None:
        bpy.data.objects.remove(ob, do_unlink=True)
        print("removed startup object:", name)

armatures = [o for o in bpy.data.objects if o.type == "ARMATURE"]
if len(armatures) != 1:
    raise SystemExit("expected one armature, found %d: %s"
                     % (len(armatures), [o.name for o in armatures]))
arm = armatures[0]


def character_meshes():
    for ob in bpy.data.objects:
        if ob.type != "MESH":
            continue
        if any(c.name in SKIP_COLLECTIONS for c in ob.users_collection):
            continue
        yield ob


def is_skinned(ob):
    return (any(m.type == "ARMATURE" and m.object for m in ob.modifiers)
            and len(ob.vertex_groups) > 0)


targets = [ob for ob in character_meshes() if not is_skinned(ob)]
print("armature      :", arm.name, "(%d bones)" % len(arm.data.bones))
print("to be skinned :", [o.name for o in targets] or "<none - already skinned>")

# A glTF skinned mesh IGNORES its node transform: the exporter writes POSITION
# and the runtime skins it straight from the shared inverse-bind matrices. The
# garments hang off empties (CLOTHES_MUJER_03, HAT) carrying the source file's
# 0.01 scale, so that scale is silently dropped on export and they arrive 100x
# oversized - measured in the exported glTF as POSITION -55.6..139.2 for the
# garment against -0.72..1.56 for the body.
#
# So bake each garment's full WORLD transform into its mesh data and leave the
# object at identity, which is the domain the already-correct body exports in.
# (Baking into the body's LOCAL space instead is wrong in exactly the same way:
# that space IS the 0.01-scaled one, so the numbers come out 100x again.)
for ob in targets:
    world = ob.matrix_world.copy()
    ob.parent = None
    ob.data.transform(world)
    ob.matrix_world = mathutils.Matrix.Identity(4)
    bpy.context.view_layer.update()

    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    # ARMATURE_AUTO == Ctrl+P > With Automatic Weights (bone heat).
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    print("  parented:", ob.name, "-> vgroups now", len(ob.vertex_groups))

print()
print("=" * 66)
print("VERIFY")
print("=" * 66)
ok = True
for ob in sorted(character_meshes(), key=lambda o: o.name):
    mod = next((m for m in ob.modifiers if m.type == "ARMATURE" and m.object), None)
    groups = len(ob.vertex_groups)
    good = bool(mod) and groups > 0
    ok = ok and good
    print("%-52s armature_mod=%-5s vgroups=%-4d %s"
          % (ob.name, bool(mod), groups, "OK" if good else "*** STILL NOT SKINNED ***"))

print()
if not ok:
    raise SystemExit("refusing to export: some meshes are still unskinned")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=DST, export_format="GLB")
print("exported ->", DST)
