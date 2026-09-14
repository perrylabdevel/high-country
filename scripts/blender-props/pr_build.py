"""Run a prop kit build inside Blender on a timer, logging progress.

    import pr_build; pr_build.start("ranch")      # full build: bake + export
    import pr_build; pr_build.build("ranch", bake=False)   # geometry + shaders only, for review

Kits: "western" (pr_props), "ranch" (pr_ranch), "trail" (pr_trail), "mine"
(pr_mine), "fort" (pr_fort) and "camp" (pr_camp), each
to public/models/props/<kit>.glb. Status goes to
/tmp/hc_props/status.txt.
"""

import importlib
import os
import time
import traceback

import bpy

import pr_bake
import pr_common
import pr_preview
import pr_props
import pr_ranch
import pr_trail
import pr_mine
import pr_fort
import pr_camp

STATUS = "/tmp/hc_props/status.txt"


def log(msg):
    os.makedirs(os.path.dirname(STATUS), exist_ok=True)
    with open(STATUS, "a") as fh:
        fh.write(f"{time.strftime('%H:%M:%S')} {msg}\n")


def builders(kit):
    return {"western": pr_props.BUILDERS, "ranch": pr_ranch.BUILDERS, "trail": pr_trail.BUILDERS, "mine": pr_mine.BUILDERS, "fort": pr_fort.BUILDERS, "camp": pr_camp.BUILDERS}[kit]


def build(kit="western", samples=16, bake=True):
    for mod in (pr_common, pr_props, pr_ranch, pr_trail, pr_mine, pr_fort, pr_camp, pr_bake, pr_preview):
        importlib.reload(mod)
    for ob in list(pr_common.collection().objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for builder in builders(kit):
        builder().finish()
    pr_bake.lay_out()
    pr_bake.assign_hp_materials()
    if not bake:
        return
    pr_bake.build_atlas()
    log(f"{kit}: atlas packed")
    pr_bake.bake_all(kit, samples=samples, log=log)
    log(f"{kit}: baked")
    path = pr_bake.export(kit)
    log(f"exported {path} {os.path.getsize(path)} bytes")


def start(kit="western", samples=16):
    if os.path.exists(STATUS):
        os.remove(STATUS)

    def job():
        try:
            build(kit, samples)
            log("DONE")
        except Exception:
            log("FAILED\n" + traceback.format_exc())
        return None

    bpy.app.timers.register(job, first_interval=0.5)
    return STATUS
