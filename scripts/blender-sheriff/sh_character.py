"""Build one character end to end from a spec (see chars.py).

Stages (each resumable from the saved .blend):
  hp      sources -> unions -> folds -> paint -> bake shaders -> warp
  low     decimate -> UV atlas
  bake    per-piece high->low bakes -> ORM pack -> final material
  rig     armature -> weights -> Idle/Walk -> glTF export

Run inside Blender via the MCP; long stages are scheduled on a timer and
report to /tmp/hc_chars/<id>/status.txt.
"""

import importlib
import json
import os
import time
import traceback

import bpy
import numpy as np

import sh_assemble as A
import sh_bake as K
import sh_body as B
import sh_common as C
import sh_export as E
import sh_garments as M
import sh_gear as G
import sh_head as H
import sh_paint as P
import sh_rig as R
import sh_spec as S

ROOT = "/tmp/hc_chars"


def reload_all():
    for mod in (S, C, B, H, G, M, A, P, K, R, E):
        importlib.reload(mod)


def workdir():
    d = f"{ROOT}/{S.SPEC['id']}"
    os.makedirs(d, exist_ok=True)
    return d


def log(msg):
    with open(f"{workdir()}/status.txt", "a") as fh:
        fh.write(f"{time.strftime('%H:%M:%S')} {msg}\n")


def reset_file():
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.armatures, bpy.data.materials, bpy.data.actions,
                 bpy.data.images, bpy.data.lights, bpy.data.cameras, bpy.data.curves, bpy.data.node_groups):
        for item in list(coll):
            coll.remove(item)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)


FEMALE_SHAPE = {"shoulders": 0.90, "waist": -0.016, "head": 0.95}


def prepare(spec):
    if spec.get("sex") == "f":
        spec = {**FEMALE_SHAPE, **spec}
    S.set_spec(spec)
    B.apply_shape()
    K.TEX = f"{workdir()}/tex"


# --------------------------------------------------------------------------
# High poly


def build_sources():
    sp = S.SPEC
    A.clear(A.SRC)
    src = {}

    def keep(key, ob):
        A._move(ob, A.SRC)
        src[key] = ob
        return ob

    keep("shirt", B.torso_mesh("s_shirt", B.SHIRT_KEYS, 0.98, 1.575, 180, 180, "shirt"))
    rolled = sp["top"].get("sleeves") == "rolled"
    for s in "LR":
        keep("arm" + s, B.arm_mesh("s_arm" + s, s, rolled=0.60 if rolled else None))
        if rolled:
            keep("fore" + s, B.forearm_skin_mesh("s_fore" + s, s))
        keep("boot" + s, B.boot_mesh("s_boot" + s, s))
        keep("hand" + s, B.hand_mesh("s_hand" + s, s))
    if sp["bottom"]["style"] == "trousers":
        keep("pants", B.torso_mesh("s_pants", B.PANTS_KEYS, 0.83, 1.085, 90, 180, "pants"))
        for s in "LR":
            keep("leg" + s, B.leg_mesh("s_leg" + s, s))
    else:
        keep("skirt", A.solidify(M.skirt_mesh("s_skirt"), 0.004))
        keep("waistband", M.waistband_mesh("s_waistband"))
    if sp.get("vest"):
        keep("vest", A.solidify(B.vest_mesh("s_vest"), 0.0045))
        keep("buttons", G.buttons_mesh("s_buttons"))
        if not sp.get("coat"):
            keep("pockets", G.pocket_flaps_mesh("s_pockets"))
        if sp.get("chain"):
            keep("chain", G.watch_chain_mesh("s_chain"))
    head, rings = H.head_mesh("s_head")
    keep("head", head)
    eyes, _ = H.eyes_mesh(rings, "s_eyes")
    keep("eyes", eyes)
    keep("ears", H.ear_mesh("s_ears"))
    keep("neck", H.neck_mesh("s_neck"))
    keep("hair", A.solidify(H.hair_mesh(rings, "s_hair"), 0.002, offset=-1))
    keep("brows", H.brow_mesh(rings, "s_brows"))
    facial = sp["facial"]["style"]
    if facial in ("walrus", "chevron", "beard"):
        keep("moustache", H.moustache_mesh(rings, "s_moustache"))
    if facial == "beard":
        keep("beard", A.solidify(H.beard_mesh(rings, "s_beard"), 0.003, offset=-1))
    if sp["hat"]["style"] != "none":
        keep("hat", G.hat_mesh("s_hat"))
        if sp["hat"]["style"] == "cattleman":
            keep("concho", G.concho_mesh("s_concho"))
    if sp.get("bandana"):
        keep("bandana", A.solidify(G.bandana_mesh("s_bandana"), 0.0025, offset=1))
    if sp.get("badge"):
        keep("badge", G.badge_mesh("s_badge"))
    if sp.get("gunbelt"):
        keep("gunbelt", G.gunbelt_mesh("s_gunbelt"))
        loops, brass = G.cartridges_mesh("s_loops")
        keep("loops", loops)
        keep("brass", brass)
        keep("buckle", G.buckle_mesh("s_buckle"))
        gun, grip = G.revolver_mesh("s_gun")
        keep("gun", gun)
        keep("grip", grip)
        keep("holster", G.holster_mesh("s_holster"))
        keep("tiedown", G.tiedown_mesh("s_tiedown"))
    if sp.get("spurs"):
        keep("spurs", G.spurs_mesh("s_spurs"))
    if sp.get("coat"):
        style = sp["coat"]["style"]
        keep("coat", A.solidify(M.coat_torso_mesh("s_coat", style), 0.004))
        for s in "LR":
            keep("csleeve" + s, M.coat_sleeve_mesh("s_csleeve" + s, s))
    if sp.get("apron"):
        ap = sp["apron"]
        keep("apron", A.solidify(M.apron_mesh("s_apron", hem=ap.get("hem", 0.50), bib=ap.get("bib", False),
                                              skirt=sp["bottom"]["style"] == "skirt"), 0.003))
    if sp.get("shawl"):
        keep("shawl", A.solidify(M.shawl_mesh("s_shawl"), 0.004))
    if sp.get("suspenders"):
        keep("suspenders", M.suspenders_mesh("s_suspenders"))
    if sp["top"].get("collar"):
        keep("collar", M.collar_mesh("s_collar"))
    if "cravat" in sp["props"]:
        keep("cravat", M.cravat_mesh("s_cravat"))
    if "spectacles" in sp["props"]:
        keep("spectacles", M.spectacles_mesh("s_spectacles"))
    if "pipe" in sp["props"]:
        keep("pipe", M.pipe_mesh("s_pipe"))
    if "satchel" in sp["props"]:
        bag, papers = M.satchel_mesh("s_satchel")
        keep("satchel", bag)
        keep("papers", papers)
    if "rope" in sp["props"]:
        keep("rope", M.rope_mesh("s_rope"))
    # Women and children: the whole head (and what rides on it) sits lower so
    # the shortened face keeps a natural neck.
    drop = H.head_drop()
    if drop:
        for key in ("head", "eyes", "ears", "hair", "brows", "moustache", "beard", "hat", "concho", "spectacles"):
            if key in src:
                co = C.verts_np(src[key])
                co[:, 2] -= drop
                C.set_verts_np(src[key], co)
    C.collection(A.SRC).hide_render = True
    return src


GEAR_KEYS = ("concho", "bandana", "buttons", "pockets", "chain", "badge", "gunbelt", "loops", "brass", "buckle",
             "gun", "grip", "holster", "tiedown", "spurs", "waistband", "suspenders", "collar", "cravat",
             "spectacles", "pipe", "satchel", "papers", "rope")


def assemble_hp():
    sp = S.SPEC
    A.clear(A.HP)
    src = build_sources()
    cloth_names = [n for n in ("shirt", "pants", "legL", "legR", "armL", "armR", "foreL", "foreR") if n in src]
    cloth = A.union("HP_Cloth", [src[n] for n in cloth_names], 0.0032)
    vlabel, flabel = A.label_by_nearest(cloth, [src[n] for n in cloth_names])
    A.cloth_folds(cloth, vlabel, cloth_names)
    region = {"shirt": 0, "armL": 0, "armR": 0, "pants": 1, "legL": 1, "legR": 1, "foreL": 2, "foreR": 2}
    mi = np.array([region[cloth_names[k]] for k in flabel], dtype=np.int32)
    for slot in ("M_Shirt", "M_Pants", "M_Skin"):
        cloth.data.materials.append(bpy.data.materials.get(slot) or bpy.data.materials.new(slot))
    cloth.data.polygons.foreach_set("material_index", mi)
    sm = cloth.modifiers.new("relax", "SMOOTH")
    sm.factor = 0.35
    sm.iterations = 2
    C.apply_modifiers(cloth)

    A.union("HP_Skin", [src["head"], src["ears"], src["neck"]], 0.0010)
    A.union("HP_HandL", [src["handL"]], 0.0010, smooth_iters=2)
    A.union("HP_HandR", [src["handR"]], 0.0010, smooth_iters=2)
    hair_parts = [src[k] for k in ("hair", "brows", "moustache", "beard") if k in src]
    hair = A.union("HP_Hair", hair_parts, 0.0008)
    A.hair_strands(hair)
    A.union("HP_Boots", [src["bootL"], src["bootR"]], 0.0016)
    if "hat" in src:
        A.union("HP_Hat", [src["hat"]], 0.0014)
    C.join("HP_Eyes", [src["eyes"]], C.collection(A.HP))
    if "vest" in src:
        A.vest_folds(A.union("HP_Vest", [src["vest"]], 0.0014))
    if "skirt" in src:
        A.union("HP_Skirt", [src["skirt"]], 0.0018)
    if "coat" in src:
        coat = A.union("HP_Coat", [src["coat"], src["csleeveL"], src["csleeveR"]], 0.0020)
        A.vest_folds(coat)
    if "apron" in src:
        ap = A.union("HP_Apron", [src["apron"]], 0.0014)
        ap["leather"] = bool(sp["apron"].get("leather"))
    if "shawl" in src:
        A.union("HP_Shawl", [src["shawl"]], 0.0016)
    for key in GEAR_KEYS:
        if key in src:
            C.join("HP_Gear_" + key, [src[key]], C.collection(A.HP))
    for ob in C.collection(A.HP).objects:
        ob.data.shade_smooth()


def store_cpos():
    ob = bpy.data.objects["HP_Eyes"]
    me = ob.data
    if "cpos" in me.attributes:
        me.attributes.remove(me.attributes["cpos"])
    att = me.attributes.new("cpos", "FLOAT_VECTOR", "POINT")
    co = C.verts_np(ob)
    # The eye shader expects eyes at the canonical height; undo the face lift.
    co[:, 2] -= float(H.zmap(H.EYE["z"])) - H.EYE["z"] - H.head_drop()
    att.data.foreach_set("vector", co.ravel())


def warp_hp():
    for ob in C.collection(A.HP).objects:
        C.set_verts_np(ob, S.warp(C.verts_np(ob)))


def stage_hp():
    t = time.time()
    assemble_hp()
    log(f"hp assembled {round(time.time() - t)}s")
    P.paint_all()
    K.assign_hp_materials()
    store_cpos()
    warp_hp()
    for ob in C.collection(A.HP).objects:
        ca = ob.data.color_attributes
        if "alb" in ca:
            ca.active_color = ca["alb"]
    bpy.ops.wm.save_as_mainfile(filepath=f"{workdir()}/{S.SPEC['id']}.blend")
    log(f"hp done {round(time.time() - t)}s")


def preview(tag="hp", views=("front", "three", "back")):
    import sh_preview as V
    importlib.reload(V)
    V.OUT = workdir()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    V.lookdev_lights()
    h = S.SPEC["crown"]
    paths = V.render(tag, views=views, res=(700, 1100), focus=(0, 0, h * 0.52), dist=h * 2.0, engine="KEEP")
    face = V.render(tag + "_face", views=("front", "three"), res=(600, 600), engine="KEEP",
                    focus=(0, -0.02, h - 0.12 * S.SPEC["head"] * S.scale()), dist=0.7 * S.scale())
    return paths + face


# --------------------------------------------------------------------------
# Low poly, bake, rig, export


def stage_low():
    t = time.time()
    names = [o.name for o in C.collection(A.HP).objects]
    order = ["HP_Cloth"] + [n for n in names if n != "HP_Cloth"]
    K.configure_low(order)
    for ob in list(C.collection(K.LP).objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    K.make_lowpoly()
    K.build_atlas()
    log(f"low done {round(time.time() - t)}s tris={sum(len(p.vertices) - 2 for p in bpy.data.objects['Sheriff'].data.polygons)}")
    json.dump(list(K.LOW.keys()), open(f"{workdir()}/low_order.json", "w"))
    bpy.ops.wm.save_mainfile()


def restore_low():
    K.LOW.clear()
    for name in json.load(open(f"{workdir()}/low_order.json")):
        K.LOW[name] = (0, 1.0)


def stage_bake():
    t = time.time()
    restore_low()
    parts = K.bake_all(samples=16)
    ob = K.rejoin(parts)
    K.final_material(ob)
    bpy.data.materials["Sheriff"].use_backface_culling = True
    ob.data.materials.clear()
    ob.data.materials.append(bpy.data.materials["Sheriff"])
    bpy.ops.wm.save_mainfile()
    log(f"bake done {round(time.time() - t)}s")


def stage_rig():
    t = time.time()
    restore_low()
    rig = R.build_armature()
    ob = bpy.data.objects["Sheriff"]
    for m in list(ob.modifiers):
        ob.modifiers.remove(m)
    R.skin(ob, rig)
    R.author_idle(rig)
    R.author_walk(rig)
    # Close the loop on the real deformed mesh: lift any foot that still dips.
    lifts = {}
    for _ in range(3):
        dips = R.measure_sole_dips(rig, ob)
        worst = max(max(d.values()) for d in dips.values())
        if worst < 0.001:
            break
        for f, d in dips.items():
            cur = lifts.setdefault(f, {"L": 0.0, "R": 0.0})
            for side in ("L", "R"):
                cur[side] += d[side]
        R.author_walk(rig, lifts=lifts)
    dips = R.measure_sole_dips(rig, ob)
    worst = max(max(d.values()) for d in dips.values())
    log(f"walk sole dip after correction {worst * 100:.2f} cm")
    E.export(S.SPEC["out"])
    bpy.ops.wm.save_mainfile()
    size = os.path.getsize(S.SPEC["out"])
    log(f"rig+export done {round(time.time() - t)}s size={size}")


def run_async(spec, stages=("hp", "low", "bake", "rig"), fresh=True):
    """Schedule the requested stages on a Blender timer; returns immediately."""

    def job():
        try:
            prepare(spec)
            if fresh and "hp" in stages:
                reset_file()
            elif not fresh:
                path = f"{workdir()}/{S.SPEC['id']}.blend"
                if bpy.data.filepath != path:
                    bpy.ops.wm.open_mainfile(filepath=path)
                    prepare(spec)
            for st in stages:
                log(f"stage {st} start")
                {"hp": stage_hp, "low": stage_low, "bake": stage_bake, "rig": stage_rig}[st]()
            log("DONE")
        except Exception:
            log("ERROR\n" + traceback.format_exc())
        return None

    prepare(spec)
    open(f"{workdir()}/status.txt", "w").close()
    bpy.app.timers.register(job, first_interval=0.2)


def run_batch(specs, stages=("hp",), previews=True, done_file=f"{ROOT}/BATCH"):
    """Run characters one after another on a single timer job."""
    open(done_file, "w").write("running\n")

    def job():
        for spec in specs:
            try:
                prepare(spec)
                open(f"{workdir()}/status.txt", "w").close()
                if "hp" in stages:
                    reset_file()
                for st in stages:
                    log(f"stage {st} start")
                    {"hp": stage_hp, "low": stage_low, "bake": stage_bake, "rig": stage_rig}[st]()
                if previews and "hp" in stages:
                    preview()
                log("DONE")
                with open(done_file, "a") as fh:
                    fh.write(f"{spec['id']} ok\n")
            except Exception:
                log("ERROR\n" + traceback.format_exc())
                with open(done_file, "a") as fh:
                    fh.write(f"{spec['id']} ERROR\n")
        with open(done_file, "a") as fh:
            fh.write("ALL DONE\n")
        return None

    bpy.app.timers.register(job, first_interval=0.2)
