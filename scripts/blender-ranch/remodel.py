"""Blender-authored exterior for the existing ranch kit. Metres, game XYZ.
Run with Blender MCP: exec(open(__file__).read()); build(); export().
The original scene is retained; this creates a separate authoring scene.
"""
import bpy, math, json
from pathlib import Path
from mathutils import Vector
ROOT = Path(__file__).resolve().parents[2]
PALETTE = {'timber': (0.24,0.13,0.065,1), 'trim': (0.66,0.59,0.44,1),
           'shutter': (0.16,0.23,0.19,1), 'stone': (0.43,0.40,0.34,1),
           'roof': (0.20,0.16,0.12,1), 'iron': (0.055,0.065,0.06,1)}

def point(v): return Vector((v[0],-v[2],v[1]))
def box(name, size, loc, material='timber', bevel=0.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=point(loc))
    o=bpy.context.object; o.name=name
    o.dimensions=(size[0],size[2],size[1])
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    o.data.materials.append(MATS[material])
    if bevel:
        m=o.modifiers.new('Soft hand-worked edges','BEVEL'); m.width=bevel; m.segments=1
        bpy.ops.object.modifier_apply(modifier=m.name)
    return o

def beam(name,a,b,width=0.13,material='timber'):
    delta=point(b)-point(a)
    o=box(name,(width,delta.length,width),tuple((Vector(a)+Vector(b))/2),material)
    o.rotation_euler=delta.to_track_quat('Z','Y').to_euler()
    return o

def window(x,z,bottom,w,h,side=0):
    # Frame in a temporary local collection of objects, then rotate onto facade.
    before=set(bpy.context.scene.objects)
    for s in (-1,1):
        box('Window casing',(0.13,h+0.2,0.14),(s*(w/2+0.065),bottom+h/2,0),'trim')
        for k in range(3):
            box('Shutter vertical board',(0.17,h,0.07),(s*(w/2+0.27+k*0.18),bottom+h/2,0.025),'shutter',0.006)
        for y in (bottom+0.15,bottom+h-0.15):
            box('Shutter strap',(0.53,0.045,0.035),(s*(w/2+0.45),y,0.07),'iron',0.003)
    box('Drip cap',(w+0.43,0.13,0.24),(0,bottom+h+0.11,0.03),'trim')
    box('Sill',(w+0.4,0.12,0.28),(0,bottom-0.055,0.05),'trim')
    for o in set(bpy.context.scene.objects)-before:
        v=o.location.copy(); a=side
        o.location=(x+math.cos(a)*v.x-math.sin(a)*v.y,-z+math.sin(a)*v.x+math.cos(a)*v.y,v.z)
        o.rotation_euler.z+=a

def build_windows():
    """Use the same kit frames as cladding; never repeat world coordinates."""
    global MATS
    from mathutils import Matrix
    MATS={name:bpy.data.materials.get('Ranch_'+name) for name in PALETTE}
    names=('Window casing','Shutter vertical board','Shutter strap','Drip cap','Sill')
    for o in list(bpy.context.scene.objects):
        if o.get('ranch_window') or o.name.startswith(names):
            bpy.data.objects.remove(o,do_unlink=True)
    convert=Matrix(((1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
    count=0
    for wall in json.loads((ROOT/'scripts/blender-ranch/walls-layout.json').read_text()):
        frame=Matrix([wall['matrix'][i::4] for i in range(4)])
        transform=convert @ frame @ convert.inverted()
        for opening in wall['openings']:
            if opening['fromFloor']<=0.5: continue
            before=set(bpy.context.scene.objects)
            window(opening['x'],0.17,opening['fromFloor'],opening['w'],opening['h'])
            bpy.context.view_layer.update()
            for obj in set(bpy.context.scene.objects)-before:
                obj.matrix_world=transform @ obj.matrix_world
                obj['ranch_window']=True
            count+=1
    bpy.context.view_layer.update()
    print('Fitted shutter pairs and casings to',count,'actual kit windows')

def build():
    global MATS
    scene=bpy.data.scenes.new('High Country • Ranch Remodel')
    bpy.context.window.scene=scene
    MATS={}
    for name,color in PALETTE.items():
        m=bpy.data.materials.new('Ranch_'+name); m.diffuse_color=color; m.use_nodes=True
        bs=m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=color
        bs.inputs['Roughness'].default_value=0.85
        MATS[name]=m
    # Main cornice: deep fascia, shadow line and modest dentils.
    for z in (-5.35,7):
        for y,h,d in ((5.94,0.15,0.17),(6.13,0.18,0.29)):
            box('Main cornice',(22.9,h,d),(0.75,y,z),'trim')
        for i in range(45):
            box('Cornice dentil',(0.14,0.18,0.19),(-10.25+i*0.5,5.79,z),'timber',0.004)
    for x in (-10.5,12):
        box('Return cornice',(0.29,0.23,12.45),(x,6.09,0.825),'trim')
    # Corner pilasters sit flat against the shell, clear of all apertures.
    for x,z in ((-10.5,7),(12,7),(-10.5,-5.35),(16,-16.5),(4,-16.5),(16,-5.35)):
        h=6.0 if x in (-10.5,12) else 4.5
        box('Corner pilaster',(0.24,h,0.24),(x,h/2,z),'trim')
        box('Pilaster capital',(0.37,0.18,0.37),(x,h-0.14,z),'trim')
    build_windows()
    # Existing porch post locations: enrich their silhouette without new obstacles.
    for i in range(8):
        x=-10.5+i*22.5/7
        box('Post foot',(0.31,0.30,0.31),(x,0.35,11.6),'trim')
        box('Post collar',(0.32,0.18,0.32),(x,2.87,11.6),'trim')
        for s in (-1,1):
            if (i==0 and s<0) or (i==7 and s>0): continue
            beam('Porch knee brace',(x,2.55,11.6),(x+s*0.57,3.18,11.6),0.14)
    box('Porch fascia',(22.85,0.26,0.22),(0.75,3.38,11.78),'trim')
    # Entrance gable grows above the existing shed roof; no support obstructs door.
    for z in (7.2,11.85):  # 7.2: clear of the front wall's inner face
        beam('Entry bargeboard',(-2.3,4.35,z),(0,5.75,z),0.19,'trim')
        beam('Entry bargeboard',(0,5.75,z),(2.3,4.35,z),0.19,'trim')
    for s in (-1,1):
        o=box('Entry roof',(2.76,0.12,4.85),(s*1.15,5.05,9.6),'roof')
        o.rotation_euler.y=s*math.atan2(1.4,2.3)
    beam('Pediment tie',(-2.2,4.38,11.83),(2.2,4.38,11.83),0.20)
    beam('King post',(0,4.38,11.84),(0,5.63,11.84),0.17)
    for s in (-1,1): beam('Fan truss',(s*1.55,4.4,11.84),(0,5.5,11.84),0.11)
    box('Ranch nameboard',(3.75,0.44,0.13),(0,4.05,11.86),'timber')
    bpy.ops.object.text_add(location=point((0,3.96,11.94)))
    o=bpy.context.object; o.name='HIGH COUNTRY lettering'; o.data.body='HIGH COUNTRY'
    o.data.align_x='CENTER'; o.data.size=0.26; o.data.extrude=0.006
    o.rotation_euler=(math.pi/2,0,0); o.data.materials.append(MATS['trim'])
    bpy.ops.object.convert(target='MESH')
    # Dressed courses around the existing continuous chimney cores.
    for x,z,w,top,base in ((-6.8,-3.4,1.15,11.1125,6.8),(10.2,-16.35,1.05,8.9125,4.9)):
        for row in range(int((top-base)/0.27)):
            y=base+row*0.27
            for s in (-1,1):
                for j in range(3):
                    a=(j-1)*w/3
                    box('Chimney dressed stone',(w/3-0.018,0.25,0.1),(x+a,y,z+s*(w/2+0.03)),'stone')
                    box('Chimney return stone',(0.1,0.25,w/3-0.018),(x+s*(w/2+0.03),y,z+a),'stone')
        box('Chimney crown',(w+0.33,0.19,w+0.33),(x,top+0.13,z),'stone')
    build_walls()
    build_roof_closures()
    print('Authored',len(scene.objects),'objects in separate ranch scene')

def export():
    scene=bpy.context.scene
    # Indexed, material-batched geometry keeps synchronous building construction
    # and its checks intact. Reuse the game's PBR textures via metre-scale UVs.
    batches={}
    for o in scene.objects:
        if o.type!='MESH' or o.get('ranch_context'): continue
        mesh=o.data; mesh.calc_loop_triangles()
        key=o.data.materials[0].name.removeprefix('Ranch_').split('.')[0]
        b=batches.setdefault(key,{'position':[],'index':[],'lookup':{}})
        for tri in mesh.loop_triangles:
            n=o.matrix_world.to_3x3() @ tri.normal; n.normalize()
            # Integer millimetres; the normal only keeps faces from sharing
            # vertices (the game recomputes it). Materials are triplanar: no UVs.
            normal=(round(n.x,3),round(n.z,3),round(-n.y,3))
            for vi in tri.vertices:
                v=o.matrix_world @ mesh.vertices[vi].co; p=(round(v.x*1000),round(v.z*1000),round(-v.y*1000))
                vertex=p+normal
                if vertex not in b['lookup']:
                    b['lookup'][vertex]=len(b['position'])//3
                    b['position'].extend(p)
                b['index'].append(b['lookup'][vertex])
    for b in batches.values(): del b['lookup']
    target=ROOT/'src/models/ranch-remodel.json'
    target.write_text(json.dumps({'generator':'scripts/blender-ranch/remodel.py','units':{'position':0.001,'color':1},'batches':batches},separators=(',',':')))
    dest=ROOT/'public/models/buildings'; dest.mkdir(parents=True,exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in scene.objects:
        if o.type=='MESH' and not o.get('ranch_context'): o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(dest/'ranch-remodel.glb'),export_format='GLB',use_selection=True, use_active_scene=True)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'scripts/blender-ranch/ranch-remodel.blend'))
    print('Exported',sum(len(b['index'])//3 for b in batches.values()),'triangles;',len(batches),'draw batches')


def build_walls():
    """Lay real boards around the kit's measured apertures, never across them.
    walls-layout.json records the existing kit wall frames and opening rectangles.
    """
    from mathutils import Matrix
    colors={'wall':(0.52,0.46,0.35,1),'wall_light':(0.59,0.53,0.42,1),'wall_dark':(0.45,0.40,0.31,1)}
    mats={}
    for name,c in colors.items():
        m=bpy.data.materials.get('Ranch_'+name) or bpy.data.materials.new('Ranch_'+name)
        m.diffuse_color=c; m.use_nodes=True
        m.node_tree.nodes.get('Principled BSDF').inputs['Base Color'].default_value=c
        m.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=0.9
        mats[name]=m
    # Safe to rerun on the authoring scene without accumulating old cladding.
    for o in list(bpy.context.scene.objects):
        if o.get('ranch_cladding'): bpy.data.objects.remove(o,do_unlink=True)
    count=0
    def board(frame,xa,xb,ya,yb,material,batten=False,vertical=False):
        nonlocal count
        if xb-xa<0.008 or yb-ya<0.004:return
        back=0.112; top=0.148 if vertical else 0.133; bottom=0.148 if vertical else 0.171
        if batten:back=0.145;top=bottom=0.185
        verts=[(xa,ya,back),(xb,ya,back),(xb,yb,back),(xa,yb,back),
               (xa,ya,bottom),(xb,ya,bottom),(xb,yb,top),(xa,yb,top)]
        verts=[point(frame @ Vector(v)) for v in verts]
        faces=[(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
        mesh=bpy.data.meshes.new('Cladding board');mesh.from_pydata(verts,[],faces);mesh.update()
        obj=bpy.data.objects.new(('Batten' if batten else 'Cedar siding')+' %04d'%count,mesh)
        bpy.context.scene.collection.objects.link(obj);obj.data.materials.append(mats[material]);obj['ranch_cladding']=True;count+=1
    def subtract(a,b,cuts):
        runs=[(a,b)]
        for ca,cb in cuts:
            next_runs=[]
            for ra,rb in runs:
                if cb<=ra or ca>=rb:next_runs.append((ra,rb));continue
                if ca>ra:next_runs.append((ra,ca))
                if cb<rb:next_runs.append((cb,rb))
            runs=next_runs
        return runs
    for wi,wall in enumerate(json.loads((ROOT/'scripts/blender-ranch/walls-layout.json').read_text())):
        # Three matrices are column-major, mathutils constructor is row-major.
        a=wall['matrix'];frame=Matrix([a[i::4] for i in range(4)])
        length=wall['length'];height=wall['height'];holes=wall['openings']
        if wall['structure']=='ranchHouse':
            for row in range(math.ceil(height/0.24)):
                lo=row*0.24;hi=min(height,(row+1)*0.24-0.008)
                cuts=sorted(set([lo,hi]+[v for o in holes for v in (o['fromFloor'],o['fromFloor']+o['h']) if lo<v<hi]))
                for ya,yb in zip(cuts,cuts[1:]):
                    covered=[(o['x']-o['w']/2-0.006,o['x']+o['w']/2+0.006) for o in holes if o['fromFloor']<yb and o['fromFloor']+o['h']>ya]
                    for xa,xb in subtract(-length/2,length/2,covered):
                        seams=[xa]+[v for k in range(-10,11) if xa<(v:=k*3.6+(row%3)*1.2)<xb]+[xb]
                        for i,(x0,x1) in enumerate(zip(seams,seams[1:])):
                            kind=['wall','wall','wall_light','wall','wall_dark'][(row*13+i*7+wi)%5]
                            board(frame,x0+0.003,x1-0.003,ya,yb,kind)
        else:
            for i in range(math.ceil(length/0.32)):
                xa=-length/2+i*0.32;xb=min(length/2,xa+0.316)
                cuts=sorted(set([xa,xb]+[v for o in holes for v in (o['x']-o['w']/2-0.006,o['x']+o['w']/2+0.006) if xa<v<xb]))
                for x0,x1 in zip(cuts,cuts[1:]):
                    covered=[(o['fromFloor']-0.006,o['fromFloor']+o['h']+0.006) for o in holes if o['x']-o['w']/2<x1 and o['x']+o['w']/2>x0]
                    for ya,yb in subtract(0,height,covered):board(frame,x0,x1,ya,yb,['wall','wall_light','wall','wall_dark'][i%4],vertical=True)
                x=xa
                covered=[(o['fromFloor']-0.006,o['fromFloor']+o['h']+0.006) for o in holes if o['x']-o['w']/2<x+0.022 and o['x']+o['w']/2>x-0.022]
                for ya,yb in subtract(0,height,covered):board(frame,max(-length/2,x-0.022),min(length/2,x+0.022),ya,yb,'wall_light',batten=True)
    print('Authored',count,'clapboards and battens fitted to 8 exterior wall planes')


def build_roof_closures():
    """Close ranch-specific junctions and keep the porch below upstairs sills."""
    global MATS
    MATS={name:bpy.data.materials.get('Ranch_'+name) for name in PALETTE}
    MATS['wall']=bpy.data.materials.get('Ranch_wall')
    for obj in list(bpy.context.scene.objects):
        if obj.get('ranch_roof_closure'):bpy.data.objects.remove(obj,do_unlink=True)
    # Seat the entry gable on the now shallow porch roof, once per object.
    entry=('Entry bargeboard','Entry roof','Pediment tie','King post','Fan truss','Ranch nameboard','HIGH COUNTRY lettering')
    for obj in bpy.context.scene.objects:
        if obj.name.startswith(entry) and not obj.get('ranch_entry_lowered'):
            obj.location.z-=0.82;obj['ranch_entry_lowered']=True
    before=set(bpy.context.scene.objects)
    # Above the low ell, the main block requires a wall up to its own eave.
    # Bottom overlaps the ell roof; the ground-floor connection stays open.
    for row in range(7):
        lo=4.55+row*0.24;hi=min(6.2,lo+0.245)
        if hi>lo:box('Kitchen junction clapboard',(8.04,hi-lo,0.23),(8,(lo+hi)/2,-5.35),'wall',0)
    # Small solid wedges cap every otherwise open side of the shed roofs.
    def wedge(name,corners,delta):
        verts=[point(v) for v in corners]+[point(tuple(Vector(v)+Vector(delta))) for v in corners]
        n=len(corners);faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
        faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
        mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
        obj=bpy.data.objects.new(name,mesh);bpy.context.scene.collection.objects.link(obj);obj.data.materials.append(MATS['trim'])
        # Normals outwards, independent of the side the wedge sits on.
        import bmesh
        bm=bmesh.new();bm.from_mesh(mesh);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(mesh);bm.free()
    for x in (-10.68,12.16):
        wedge('Front porch rake closure',[(x,3.37,6.8),(x,3.525,6.8),(x,3.4,11.8),(x,3.37,11.8)],(0.04,0,0))
    for z in (-2.205,7.355):
        wedge('East porch rake closure',[(11.8,3.37,z),(11.8,3.515,z),(16.4,3.4,z),(16.4,3.37,z)],(0,0,0.04))
    box('East porch fascia',(0.06,0.17,9.6),(16.4,3.36,2.575),'trim',0)
    # Entry gable cheeks descend to the porch skin, closing daylight slots.
    for x in (-2.25,2.25):
        wedge('Entry cheek',[(x,3.40,7.12),(x,3.61,7.12),(x,3.61,11.85),(x,3.40,11.85)],(0.06,0,0))
    wedge('Entry pediment backing',[(-2.3,3.39,11.76),(2.3,3.39,11.76),(2.3,3.55,11.76),(0,4.88,11.76),(-2.3,3.55,11.76)],(0,0,0.05))
    # Counterflashing at roof/wall contacts, short enough to clear window sills.
    box('Front apron flashing',(22.6,0.045,0.14),(0.75,3.552,7.05),'iron',0)
    box('East apron flashing',(0.14,0.045,9.2),(12.05,3.542,2.575),'iron',0)
    box('Kitchen apron flashing',(8.0,0.055,0.16),(8,4.65,-5.43),'iron',0)
    for obj in set(bpy.context.scene.objects)-before:obj['ranch_roof_closure']=True
    bpy.context.view_layer.update()
    print('Closed kitchen junction, porch rakes, and entry cheeks; seated gable below upstairs sills')
