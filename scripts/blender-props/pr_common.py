"""Part primitives for the western prop kit.

Run inside Blender (via the Blender MCP). A prop is assembled from parts —
boxes, lathed solids, rings and swept tubes — each tagged with a surface kind
(wood, iron, water, bone, ...) and a per-part tint. Every primitive is built
twice from the same parameters:

  low  the shipped mesh: hard-edged boards (each box face its own island),
       smooth-shaded round sections.
  high the bake source: the same solid with rounded edges, so the baked
       normal map carries worn board edges the low mesh does not pay for.

Each part also writes a `grain` UV in metres whose U runs along the wood
grain (or a ring's circumference, or a tube's length). The bake shaders read
it for grain, seams and cracks; the atlas UV starts as a copy of it, so every
island keeps true metric scale into the pack.

Blender frame: Z up, props stand on z=0 centred on the origin, front is -Y
(glTF +Z after export).
"""

import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

COLLECTION = "Props"
# Append only: a face stores its kind as an index into this tuple.
KINDS = ("wood", "wood_grey", "wood_dark", "stave", "iron", "water", "bone", "horn", "socket",
         "hay", "bark", "endgrain", "zinc", "board_grey", "paint_green", "paint_red", "stone",
         "glass", "char", "sign_board", "fieldstone", "canvas", "rope",
         "leather", "flag_red", "flag_blue",
         "adobe", "clay", "peeled", "burlap", "brush", "blanket", "sod", "hide", "meat")
# Kinds whose shader reads the part's own local UV (painted lettering centred
# on the board): no random grain offset.
LOCAL_UV = ("sign_board",)


def collection(name=COLLECTION):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def remove_object(name):
    ob = bpy.data.objects.get(name)
    if ob is None:
        return
    data = ob.data
    bpy.data.objects.remove(ob, do_unlink=True)
    if isinstance(data, bpy.types.Mesh) and data.users == 0:
        bpy.data.meshes.remove(data)


def _xform(loc=(0, 0, 0), rot=(0, 0, 0)):
    return Matrix.Translation(Vector(loc)) @ Euler(rot, "XYZ").to_matrix().to_4x4()


class Prop:
    """Collects parts into one low and one high mesh for a single prop."""

    def __init__(self, name, seed=1):
        self.name = name
        self.seed = seed
        self.parts = 0
        # Parent transform applied after each part's own loc/rot (see `at`).
        self.frame = Matrix.Identity(4)
        self.low = bmesh.new()
        self.high = bmesh.new()
        for bm in (self.low, self.high):
            bm.loops.layers.uv.new("grain")
            bm.faces.layers.float.new("tint")
            bm.faces.layers.int.new("kind")

    # ------------------------------------------------------------------
    # Internals

    def _rand(self):
        # Deterministic per-part jitter so a rebuild bakes identical textures.
        self.parts += 1
        x = math.sin(self.seed * 12.9898 + self.parts * 78.233) * 43758.5453
        return x - math.floor(x)

    def _emit(self, which, part, kind, tint, grain_offset):
        """Append a standalone part bmesh into the low or high accumulator."""
        dst = self.low if which == "low" else self.high
        src_uv = part.loops.layers.uv["grain"]
        dst_uv = dst.loops.layers.uv["grain"]
        t_layer = dst.faces.layers.float["tint"]
        k_layer = dst.faces.layers.int["kind"]
        # A primitive may tag faces with their own kind (a log's end-grain
        # caps); those keep their UV unshifted so the shader knows the centre.
        o_layer = part.faces.layers.int.get("kindo")
        vmap = {}
        for v in part.verts:
            vmap[v] = dst.verts.new(v.co)
        for f in part.faces:
            nf = dst.faces.new([vmap[v] for v in f.verts])
            nf.smooth = f.smooth
            nf[t_layer] = tint
            # Stored as index + 1 so the layer default (0) means "no override".
            override = f[o_layer] - 1 if o_layer is not None else -1
            nf[k_layer] = override if override >= 0 else KINDS.index(kind)
            shift = (0.0, 0.0) if override >= 0 else grain_offset
            for l_src, l_dst in zip(f.loops, nf.loops):
                u, v = l_src[src_uv].uv
                l_dst[dst_uv].uv = (u + shift[0], v + shift[1])
        part.free()

    def _add(self, build, kind, loc, rot, tint=None):
        """build(high: bool) -> bmesh in local space with a `grain` UV."""
        r = self._rand()
        tint = r if tint is None else tint
        offset = (0.0, 0.0) if kind in LOCAL_UV else (r * 37.0, r * 11.0)
        mat = self.frame @ _xform(loc, rot)
        for which in ("low", "high"):
            part = build(which == "high")
            bmesh.ops.transform(part, matrix=mat, verts=part.verts)
            self._emit(which, part, kind, tint, offset)

    def at(self, matrix):
        """Context manager: build the enclosed parts inside `matrix`."""
        prop = self

        class _Frame:
            def __enter__(self):
                self.prev = prop.frame
                prop.frame = prop.frame @ matrix

            def __exit__(self, *exc):
                prop.frame = self.prev

        return _Frame()

    # ------------------------------------------------------------------
    # Primitives

    def beam(self, p0, p1, section, kind="wood", roll=0.0, bevel=0.012, tint=None):
        """A box running from p0 to p1 (grain along its length)."""
        a, b = Vector(p0), Vector(p1)
        d = b - a
        quat = d.normalized().to_track_quat("X", "Z")
        rot = (quat.to_matrix().to_4x4() @ Matrix.Rotation(roll, 4, "X")).to_euler("XYZ")
        self.box((d.length, section[0], section[1]), loc=(a + b) / 2, rot=tuple(rot), kind=kind, grain="x", bevel=bevel, tint=tint)

    def box(self, size, loc=(0, 0, 0), rot=(0, 0, 0), kind="wood", grain="x", bevel=0.012, tint=None):
        """A board or block. `grain` names the local axis the grain runs along."""
        sx, sy, sz = size
        axis = "xyz".index(grain)

        def build(high):
            bm = bmesh.new()
            bm.loops.layers.uv.new("grain")
            bmesh.ops.create_cube(bm, size=1.0)
            bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
            if high and bevel > 0:
                b = min(bevel, 0.45 * min(sx, sy, sz))
                bmesh.ops.bevel(bm, geom=list(bm.edges), offset=b, segments=3, profile=0.5, affect="EDGES", clamp_overlap=True)
            _box_uv(bm, axis)
            for f in bm.faces:
                f.smooth = high
            if not high:
                bmesh.ops.split_edges(bm, edges=list(bm.edges))
            return bm

        self._add(build, kind, loc, rot, tint)

    def lathe(self, profile, sides=16, loc=(0, 0, 0), rot=(0, 0, 0), kind="stave", cap_top=True, cap_bottom=True, tint=None, cap_kind=None, jitter=0.0, faceted=False):
        """Solid of revolution about local Z. profile: [(radius, z), ...] bottom to top.

        cap_kind gives the end faces their own surface (end grain on a log);
        their grain UV is then centred on (5, 3) in metres. jitter roughens the
        radius per side (split firewood, a stump). faceted keeps the same
        side count on the high mesh and shades flat: a square pyramid roof
        (sides=4) would otherwise bake from an octagon."""
        seed = self._rand() if jitter else 0.0

        def build(high):
            n = sides * (2 if high and not faceted else 1)
            bm = bmesh.new()
            uv = bm.loops.layers.uv.new("grain")
            rings = []
            def rad(r, i):
                if not jitter:
                    return r
                a = 2 * math.pi * i / n
                wob = math.sin(a * 3 + seed * 17) * 0.5 + math.sin(a * 5 + seed * 29) * 0.5
                return r * (1 + jitter * wob)

            for r, z in profile:
                rings.append([bm.verts.new((rad(r, i) * math.cos(2 * math.pi * i / n), rad(r, i) * math.sin(2 * math.pi * i / n), z)) for i in range(n)])
            olayer = bm.faces.layers.int.new("kindo")
            # Side strip. The seam column duplicates its first ring vertex in UV
            # only (the island wraps), so the atlas copy can still unfold it.
            r_mean = sum(p[0] for p in profile) / len(profile)
            # U is arc length down the profile, not z: a lip that turns inward
            # at one height would otherwise get a zero-area island.
            arc = [0.0]
            for (ra, za), (rb, zb) in zip(profile, profile[1:]):
                arc.append(arc[-1] + math.hypot(rb - ra, zb - za))
            for k in range(len(rings) - 1):
                for i in range(n):
                    j = (i + 1) % n
                    f = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
                    f.smooth = not faceted
                    us = (arc[k], arc[k], arc[k + 1], arc[k + 1])
                    vs = (i, i + 1, i + 1, i)
                    for loop, u, vi in zip(f.loops, us, vs):
                        loop[uv].uv = (u, vi / n * 2 * math.pi * r_mean)
            for ring, top in ((rings[0], False), (rings[-1], True)):
                if (top and not cap_top) or (not top and not cap_bottom):
                    continue
                verts = ring if top else list(reversed(ring))
                f = bm.faces.new(verts)
                f.smooth = False
                if cap_kind is not None:
                    f[olayer] = KINDS.index(cap_kind) + 1
                for loop in f.loops:
                    co = loop.vert.co
                    if cap_kind is not None:
                        loop[uv].uv = (co.x + 5.0, co.y + 3.0)
                    else:
                        loop[uv].uv = (co.x + 5.0, co.y + (3.0 if top else 7.0))
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            if not high:
                caps = [e for e in bm.edges if len({f.smooth for f in e.link_faces}) > 1 or (faceted and len(e.link_faces) == 2)]
                bmesh.ops.split_edges(bm, edges=caps)
            return bm

        self._add(build, kind, loc, rot, tint)

    def cylinder(self, r, h, sides=8, loc=(0, 0, 0), rot=(0, 0, 0), kind="wood", r_top=None, tint=None):
        """Post or pole along local Z, base at local z=0."""
        self.lathe([(r, 0.0), (r_top if r_top is not None else r, h)], sides=sides, loc=loc, rot=rot, kind=kind, tint=tint)

    def ring(self, radius, width, thick, sides=24, loc=(0, 0, 0), rot=(0, 0, 0), kind="iron", tint=None):
        """Rectangular-section hoop about local Z: `width` along Z, `thick` radial."""
        r0, r1 = radius - thick, radius

        def build(high):
            n = sides * (2 if high else 1)
            bm = bmesh.new()
            uv = bm.loops.layers.uv.new("grain")
            section = [(r1, -width / 2), (r1, width / 2), (r0, width / 2), (r0, -width / 2)]
            loops = [[bm.verts.new((r * math.cos(2 * math.pi * i / n), r * math.sin(2 * math.pi * i / n), z)) for (r, z) in section] for i in range(n)]
            for i in range(n):
                j = (i + 1) % n
                for s in range(4):
                    t = (s + 1) % 4
                    f = bm.faces.new((loops[i][s], loops[j][s], loops[j][t], loops[i][t]))
                    f.smooth = s in (0, 2)
                    rr = section[s][0]
                    arc = 2 * math.pi * rr / n
                    # Each of the four faces is its own island: side offset in V.
                    for loop, (a, b) in zip(f.loops, ((i, 0), (i + 1, 0), (i + 1, 1), (i, 1))):
                        span = width if s in (0, 2) else thick
                        loop[uv].uv = (a * arc, b * span + s * 0.5)
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            if high:
                sharp = [e for e in bm.edges if len(e.link_faces) == 2 and e.link_faces[0].normal.angle(e.link_faces[1].normal) > 1.2]
                bmesh.ops.bevel(bm, geom=sharp, offset=min(0.004, thick * 0.3), segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)
                for f in bm.faces:
                    f.smooth = True
            else:
                sharp = [e for e in bm.edges if len(e.link_faces) == 2 and e.link_faces[0].normal.angle(e.link_faces[1].normal) > 1.2]
                bmesh.ops.split_edges(bm, edges=sharp)
            return bm

        self._add(build, kind, loc, rot, tint)

    def tube(self, path, radii, sides=8, loc=(0, 0, 0), rot=(0, 0, 0), kind="bone", flatten=1.0, tint=None, cap_end=True):
        """Swept tube along a polyline. radii per point (0 closes to a tip)."""

        def build(high):
            n = sides * (2 if high else 1)
            bm = bmesh.new()
            uv = bm.loops.layers.uv.new("grain")
            pts = [Vector(p) for p in path]
            length = [0.0]
            for a, b in zip(pts, pts[1:]):
                length.append(length[-1] + (b - a).length)
            up = Vector((0, 0, 1))
            rings = []
            for k, p in enumerate(pts):
                if k == 0:
                    t = pts[1] - pts[0]
                elif k == len(pts) - 1:
                    t = pts[-1] - pts[-2]
                else:
                    t = pts[k + 1] - pts[k - 1]
                t.normalize()
                side = t.cross(up)
                if side.length < 1e-4:
                    side = t.cross(Vector((1, 0, 0)))
                side.normalize()
                nrm = side.cross(t)
                r = radii[k]
                rings.append([bm.verts.new(p + (side * math.cos(2 * math.pi * i / n) + nrm * math.sin(2 * math.pi * i / n) * flatten) * max(r, 1e-4)) for i in range(n)])
            r_mean = max(sum(radii) / len(radii), 0.005)
            for k in range(len(rings) - 1):
                for i in range(n):
                    j = (i + 1) % n
                    f = bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
                    f.smooth = True
                    for loop, (lk, li) in zip(f.loops, ((k, i), (k, i + 1), (k + 1, i + 1), (k + 1, i))):
                        loop[uv].uv = (length[lk], li / n * 2 * math.pi * r_mean)
            f = bm.faces.new(list(reversed(rings[0])))
            for loop in f.loops:
                loop[uv].uv = (loop.vert.co.x + 9.0, loop.vert.co.y + 9.0)
            if cap_end:
                f = bm.faces.new(rings[-1])
                for loop in f.loops:
                    loop[uv].uv = (loop.vert.co.x + 11.0, loop.vert.co.y + 9.0)
            bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
            return bm

        self._add(build, kind, loc, rot, tint)

    # ------------------------------------------------------------------
    # Output

    def finish(self):
        """Create <name> (low) and <name>_HP (high) objects in the Props collection."""
        out = []
        for which, bm in (("low", self.low), ("high", self.high)):
            name = self.name if which == "low" else self.name + "_HP"
            remove_object(name)
            me = bpy.data.meshes.new(name)
            bm.to_mesh(me)
            bm.free()
            ob = bpy.data.objects.new(name, me)
            collection().objects.link(ob)
            out.append(ob)
        return out


def _box_uv(bm, axis):
    """Per-face planar UV in metres, U along the grain axis where the face allows."""
    uv = bm.loops.layers.uv["grain"]
    for fi, f in enumerate(bm.faces):
        n = f.normal
        dom = max(range(3), key=lambda i: abs(n[i]))
        plane = [i for i in range(3) if i != dom]
        if axis in plane:
            u_ax = axis
            v_ax = plane[0] if plane[1] == axis else plane[1]
        else:
            # End grain face: pattern reads as rings; any in-plane frame is fine.
            u_ax, v_ax = plane
        for loop in f.loops:
            co = loop.vert.co
            loop[uv].uv = (co[u_ax], co[v_ax] + (0.0 if axis in plane else 20.0))
