"""Export the skinned sheriff and its clips to public/models/sheriff.glb."""

import bpy

OUT = "/Users/brian/Projects/high-country/public/models/sheriff.glb"


def export(path=OUT):
    rig = bpy.data.objects["SheriffRig"]
    # Clips are authored at sh_rig.FPS; the scene rate sets exported timing.
    bpy.context.scene.render.fps = 30
    bpy.context.scene.render.fps_base = 1.0
    mesh = bpy.data.objects["Sheriff"]
    # Rest pose for the bind; clips are exported from the actions themselves.
    rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
    # One NLA track per clip so the exporter emits both as named animations.
    ad = rig.animation_data
    for tr in list(ad.nla_tracks):
        ad.nla_tracks.remove(tr)
    for clip in ("Idle", "Walk"):
        act = bpy.data.actions[clip]
        tr = ad.nla_tracks.new()
        tr.name = clip
        strip = tr.strips.new(clip, int(act.frame_range[0]), act)
        tr.mute = True
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    mesh.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=90,
        export_skins=True,
        export_influence_nb=4,
        export_all_influences=False,
        export_def_bones=False,
        export_rest_position_armature=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,
        export_frame_step=1,
        # Keep every frame: optimized constant tracks collapse to two keys, and
        # three's mixer stops rewriting such a bone, so the NPC pose handles
        # compose onto it cumulatively and the arms creep out to a T-pose.
        export_optimize_animation_size=False,
        export_anim_single_armature=True,
        export_reset_pose_bones=True,
        export_morph=False,
        export_lights=False,
        export_cameras=False,
        export_extras=False,
        export_attributes=False,
    )
    return path
