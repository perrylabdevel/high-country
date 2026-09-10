"""
Dump every collection, object, mesh, modifier, vertex group, armature and
material in the current Blender file to a text file.

WHY THIS EXISTS
    Character GLBs off asset sites arrive with inconsistent structure: garments
    that are separate static meshes, meshes parented to bones instead of skinned,
    stray collections, duplicate armatures. Guessing at object names from the
    outliner is slow and error-prone. This prints the truth in one pass.

HOW TO RUN
    Blender > Scripting tab > Open (this file) > Run Script.
    Or paste the whole thing into a new text block and Run.

    It uses ONLY the bpy.data / bpy.context.scene READ api - no bpy.ops - so it
    cannot hit the context errors that break operators run from the Text Editor
    (an operator there has no active object, which is what made the glTF import
    script die with "'Context' object has no attribute 'object'").

OUTPUT
    Written to OUT_PATH below, and echoed to Blender's system console
    (Window > Toggle System Console on Windows; launch from a terminal on macOS).
"""

import os

import bpy

OUT_PATH = "/Users/brian/Projects/high-country/audit/blender-scene-dump.txt"

lines = []


def w(text=""):
    lines.append(str(text))


def safe(fn, default="<error>"):
    try:
        return fn()
    except Exception as exc:  # noqa: BLE001 - a dump must never abort on one bad field
        return "%s (%s)" % (default, exc)


w("BLENDER SCENE DUMP")
w("blender : %s" % bpy.app.version_string)
w("file    : %s" % (bpy.data.filepath or "<unsaved>"))
w("scene   : %s" % bpy.context.scene.name)
w()

# --------------------------------------------------------------------------
# Collection tree, as the outliner shows it.
# --------------------------------------------------------------------------
w("=" * 78)
w("COLLECTION TREE")
w("=" * 78)


def dump_collection(col, depth=0):
    pad = "    " * depth
    w("%s[collection] %s  (direct objects: %d, child collections: %d)"
      % (pad, col.name, len(col.objects), len(col.children)))
    for ob in col.objects:
        w("%s      - %-44s <%s>" % (pad, ob.name, ob.type))
    for child in col.children:
        dump_collection(child, depth + 1)


dump_collection(bpy.context.scene.collection)

loose_collections = [c for c in bpy.data.collections
                     if c.name not in {x.name for x in bpy.data.scenes[0].collection.children_recursive}]
if loose_collections:
    w()
    w("collections in the file but not linked under the scene root:")
    for c in loose_collections:
        w("    - %-44s (objects: %d)" % (c.name, len(c.objects)))
w()

# --------------------------------------------------------------------------
# Every object, with the detail that actually matters for rigging.
# --------------------------------------------------------------------------
w("=" * 78)
w("OBJECTS")
w("=" * 78)

unskinned = []
skinned = []

for ob in sorted(bpy.data.objects, key=lambda o: (o.type, o.name)):
    w()
    w("%s   <%s>" % (ob.name, ob.type))
    w("    data name      : %s" % getattr(ob.data, "name", "<none>"))
    w("    collections    : %s" % (", ".join(c.name for c in ob.users_collection) or "<none>"))
    w("    parent         : %s (parent_type=%s%s)" % (
        ob.parent.name if ob.parent else "<none>",
        ob.parent_type,
        ", bone=%s" % ob.parent_bone if ob.parent_bone else "",
    ))
    w("    world scale    : %s" % safe(
        lambda: ", ".join("%.4f" % v for v in ob.matrix_world.to_scale())))
    w("    visible        : hide_viewport=%s hide_render=%s" % (ob.hide_viewport, ob.hide_render))

    mods = list(ob.modifiers)
    if mods:
        w("    modifiers      :")
        for m in mods:
            extra = ""
            if m.type == "ARMATURE":
                extra = " -> armature object: %s" % (m.object.name if m.object else "<NONE SET>")
            w("        - %-20s <%s>%s" % (m.name, m.type, extra))
    else:
        w("    modifiers      : <none>")

    if ob.type == "MESH":
        me = ob.data
        w("    mesh           : %d verts, %d polys, %d materials"
          % (len(me.vertices), len(me.polygons), len(me.materials)))
        for mat in me.materials:
            if mat is None:
                w("        - <empty material slot>")
                continue
            tex = []
            if mat.use_nodes:
                for node in mat.node_tree.nodes:
                    if node.type == "TEX_IMAGE" and node.image:
                        tex.append(node.image.name)
            w("        - %-34s textures: %s" % (mat.name, ", ".join(tex) or "<none>"))

        vgs = [g.name for g in ob.vertex_groups]
        w("    vertex groups  : %d %s" % (
            len(vgs), ("[" + ", ".join(vgs[:8]) + ("..." if len(vgs) > 8 else "") + "]") if vgs else ""))

        has_arm_mod = any(m.type == "ARMATURE" and m.object for m in ob.modifiers)
        # A mesh only deforms if BOTH are true: an armature modifier pointing at
        # a real armature, and vertex groups carrying the weights.
        if has_arm_mod and vgs:
            w("    >> SKINNED (follows the skeleton)")
            skinned.append(ob.name)
        else:
            reason = []
            if not has_arm_mod:
                reason.append("no armature modifier")
            if not vgs:
                reason.append("no vertex groups")
            w("    >> NOT SKINNED - %s" % "; ".join(reason))
            unskinned.append((ob.name, "; ".join(reason)))

    if ob.type == "ARMATURE":
        arm = ob.data
        names = [b.name for b in arm.bones]
        w("    bones          : %d" % len(names))
        w("    first bones    : %s" % ", ".join(names[:12]))
        roots = [b.name for b in arm.bones if b.parent is None]
        w("    root bones     : %s" % ", ".join(roots))

# --------------------------------------------------------------------------
# The answer we actually came for.
# --------------------------------------------------------------------------
w()
w("=" * 78)
w("DIAGNOSIS")
w("=" * 78)
w("skinned meshes   : %d %s" % (len(skinned), skinned))
w("unskinned meshes : %d" % len(unskinned))
for name, reason in unskinned:
    w("    - %-46s (%s)" % (name, reason))
w()
if unskinned:
    w("Any mesh listed as NOT SKINNED stays frozen in the bind pose while the")
    w("skeleton moves underneath it. For a garment that means sleeves stuck out")
    w("sideways while the arms hang inside them.")
    w("Fix: select the mesh, then Ctrl-click the armature LAST so it is active,")
    w("then Ctrl+P > With Automatic Weights. Repeat per mesh.")
else:
    w("Every mesh is skinned. Nothing is left frozen in the bind pose.")

text = "\n".join(lines)
print(text)

try:
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        fh.write(text + "\n")
    print("\n[dump] wrote %s" % OUT_PATH)
except Exception as exc:  # noqa: BLE001
    print("\n[dump] COULD NOT WRITE %s (%s)" % (OUT_PATH, exc))
    print("[dump] the full dump is printed above - copy it from the console")
