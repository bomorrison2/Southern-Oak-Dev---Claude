"""
build_landscape.py — Dashlands landscape → glTF (.glb) for the ArchForm viewer.

Reads a scheme exported from editor.js (scene.json) and builds a Blender model:
terrain, site slab, road ribbon, per-type Sussex homes (body + pitched roof),
attenuation SuDS, and buffer-edge trees. Coordinates are the app's centroid-
relative SITE metres (x east, y north); heights on Z. Blender's glTF exporter
converts Z-up -> Y-up so the model drops straight into the Three.js scene
(site (x,y) -> three (x, height, -y)).

Run headless:
  blender --background --python build_landscape.py -- scene.json landscape.glb

Everything here is procedural massing for an internal working scenario — not a
surveyed or architectural model.
"""
import bpy, json, sys, math

# ── args after "--" ──────────────────────────────────────────
argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []
scene_path = argv[0] if len(argv) > 0 else "scene.json"
out_path   = argv[1] if len(argv) > 1 else "landscape.glb"

with open(scene_path, "r") as fh:
    data = json.load(fh)

# ── fresh empty scene ────────────────────────────────────────
bpy.ops.wm.read_factory_settings(use_empty=True)
coll = bpy.context.collection

# ── colour + material helpers ────────────────────────────────
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def hex_lin(h):
    h = h.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)

_mat_cache = {}
def make_mat(name, hexcol, rough=0.85, metal=0.0):
    key = (name, hexcol, round(rough, 2), round(metal, 2))
    if key in _mat_cache:
        return _mat_cache[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = False  # exports doubleSided -> no winding worries
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_lin(hexcol)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    _mat_cache[key] = m
    return m

def new_obj(name, verts, faces, mat, loc=(0, 0, 0), rotz=0.0):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    if mat:
        ob.data.materials.append(mat)
    ob.location = loc
    ob.rotation_euler = (0, 0, rotz)
    coll.objects.link(ob)
    return ob

# ── boundary extent ──────────────────────────────────────────
B = data["boundary"]
xs = [p[0] for p in B]; ys = [p[1] for p in B]
minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)

def point_in_poly(x, y, poly=None):
    if poly is None:
        poly = B
    inside = False
    n = len(poly); j = n - 1
    for i in range(n):
        xi, yi = poly[i]; xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside

def in_any_suds(x, y):
    for f in data.get("suds", []):
        if len(f["pts"]) >= 3 and point_in_poly(x, y, f["pts"]):
            return True
    return False

def dist_to_boundary(x, y):
    best = 1e9
    n = len(B); j = n - 1
    for i in range(n):
        ax, ay = B[j]; bx, by = B[i]
        dx, dy = bx - ax, by - ay
        L2 = dx * dx + dy * dy
        t = 0 if L2 == 0 else max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / L2))
        fx, fy = ax + t * dx, ay + t * dy
        d = math.hypot(x - fx, y - fy)
        if d < best: best = d
        j = i
    return best

# ── undulating context terrain (site kept flat) ──────────────
# Gentle value-noise, ramped to zero inside the boundary so homes stay grounded.
Mg = 150
def terrain_z(x, y):
    if point_in_poly(x, y):
        return 0.0
    ramp = min(1.0, dist_to_boundary(x, y) / 30.0)
    n = (math.sin(x * 0.028) * math.cos(y * 0.024)
         + 0.5 * math.sin(x * 0.011 + y * 0.017)
         + 0.3 * math.cos(x * 0.05 - y * 0.03))
    return n * 3.2 * ramp

gx0, gx1 = minx - Mg, maxx + Mg
gy0, gy1 = miny - Mg, maxy + Mg
NX, NY = 70, 70
verts, faces = [], []
for iy in range(NY + 1):
    for ix in range(NX + 1):
        x = gx0 + (gx1 - gx0) * ix / NX
        y = gy0 + (gy1 - gy0) * iy / NY
        verts.append((x, y, terrain_z(x, y)))
for iy in range(NY):
    for ix in range(NX):
        a = iy * (NX + 1) + ix
        faces.append((a, a + 1, a + NX + 2, a + NX + 1))
new_obj("Terrain", verts, faces, make_mat("grass", "#6f8a52", rough=1.0))

new_obj("Slab", [(p[0], p[1], 0.05) for p in B],
        [tuple(range(len(B)))], make_mat("slab", "#86a05e", rough=1.0))

# ── road ribbon ──────────────────────────────────────────────
road = data.get("road", {})
c = road.get("centre", []); rw = road.get("width", 5)
if len(c) >= 2:
    tarmac = make_mat("tarmac", "#43464b", rough=0.9)
    concrete = make_mat("footway", "#9a9c96", rough=0.95)
    fverts, ffaces = [], []
    def ribbon(store_v, store_f, half0, half1, z):
        for i in range(1, len(c)):
            ax, ay = c[i - 1]; bx, by = c[i]
            dx, dy = bx - ax, by - ay
            L = math.hypot(dx, dy) or 1.0
            ux, uy = -dy / L, dx / L
            for s in (1, -1):
                base = len(store_v)
                store_v += [(ax + ux * s * half1, ay + uy * s * half1, z),
                            (ax + ux * s * half0, ay + uy * s * half0, z),
                            (bx + ux * s * half0, by + uy * s * half0, z),
                            (bx + ux * s * half1, by + uy * s * half1, z)]
                store_f.append((base, base + 1, base + 2, base + 3))
    verts, faces = [], []
    for i in range(1, len(c)):
        ax, ay = c[i - 1]; bx, by = c[i]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1.0
        nx, ny = -dy / L * rw / 2, dx / L * rw / 2
        base = len(verts)
        verts += [(ax + nx, ay + ny, 0.12), (ax - nx, ay - ny, 0.12),
                  (bx - nx, by - ny, 0.12), (bx + nx, by + ny, 0.12)]
        faces.append((base, base + 1, base + 2, base + 3))
    new_obj("Road", verts, faces, tarmac)
    ribbon(fverts, ffaces, rw / 2, rw / 2 + 1.6, 0.14)          # footway both sides
    if fverts:
        new_obj("Footway", fverts, ffaces, concrete)

# ── retained hedgerow along every boundary edge ──────────────
hedge_mat = make_mat("hedge", "#3c5a2e", rough=1.0)
cxp = sum(p[0] for p in B) / len(B)
cyp = sum(p[1] for p in B) / len(B)
for i in range(len(B)):
    ax, ay = B[i]; bx, by = B[(i + 1) % len(B)]
    dx, dy = bx - ax, by - ay
    L = math.hypot(dx, dy)
    if L < 3:
        continue
    nx, ny = -dy / L, dx / L
    mxp, myp = (ax + bx) / 2, (ay + by) / 2
    if nx * (cxp - mxp) + ny * (cyp - myp) < 0:
        nx, ny = -nx, -ny
    off = 1.8
    hx, hy = mxp + nx * off, myp + ny * off
    hl = L - 1
    hw2, hd2, hh = hl / 2, 0.65, 1.7
    ca, sa = dx / L, dy / L  # cos/sin of edge angle
    corners = [(-hw2, -hd2), (hw2, -hd2), (hw2, hd2), (-hw2, hd2)]
    bot = [(hx + cx2 * ca - cy2 * sa, hy + cx2 * sa + cy2 * ca, 0) for cx2, cy2 in corners]
    top = [(vx, vy, hh) for vx, vy, _ in bot]
    hv = bot + top
    hf = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    new_obj("Hedge_%d" % i, hv, hf, hedge_mat)

# ── homes (body + pitched roof) ──────────────────────────────
wallcols = data["materials"]["walls"]; roofcols = data["materials"]["roofs"]
for i, d in enumerate(data["dwellings"]):
    w, dep = d["w"], d["d"]
    eave = d["storeys"] * 3.0
    rise = min(w, dep) * 0.32
    hw, hd = w / 2, dep / 2
    wall = make_mat("wall_" + d["walls"], wallcols.get(d["walls"], "#a8503c"), rough=0.9)
    roofm = make_mat("roof_" + d["roof"], roofcols.get(d["roof"], "#8a3b2a"), rough=0.8)
    bv = [(-hw, -hd, 0), (hw, -hd, 0), (hw, hd, 0), (-hw, hd, 0),
          (-hw, -hd, eave), (hw, -hd, eave), (hw, hd, eave), (-hw, hd, eave)]
    bf = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4),
          (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    new_obj("House_%d" % i, bv, bf, wall, loc=(d["cx"], d["cy"], 0), rotz=d["rot"])
    rv = [(-hw, -hd, eave), (hw, -hd, eave), (hw, hd, eave), (-hw, hd, eave),
          (-hw, 0, eave + rise), (hw, 0, eave + rise)]
    rf = [(0, 1, 5, 4), (2, 3, 4, 5), (0, 4, 3), (1, 2, 5)]
    new_obj("Roof_%d" % i, rv, rf, roofm, loc=(d["cx"], d["cy"], 0), rotz=d["rot"])

# ── attenuation SuDS ─────────────────────────────────────────
sudscols = data["materials"].get("suds", {})
for i, f in enumerate(data.get("suds", [])):
    pts = f["pts"]
    if len(pts) < 3:
        continue
    is_pond = f["type"] == "pond"
    z = -0.30 if is_pond else 0.14
    col = sudscols.get(f["type"], "#2196f3")
    mat = make_mat("suds_" + f["type"], col, rough=0.05 if is_pond else 0.7,
                   metal=0.0)
    new_obj("SuDS_%d" % i, [(p[0], p[1], z) for p in pts],
            [tuple(range(len(pts)))], mat)

# ── buffer-edge trees (deterministic scatter inside the bands) ─
trunk_mat = make_mat("trunk", "#5b4327", rough=0.9)
leaf_mats = [make_mat("leaf_a", "#4f7a3a", rough=1.0),
             make_mat("leaf_b", "#5f8c46", rough=1.0)]

def add_tree(x, y, z0, k):
    th = 3.2 + (k % 3) * 0.7            # trunk height
    r  = 2.6 + (k % 4) * 0.5            # canopy radius
    new_obj("Trunk_%d" % k,
            [(-0.3, -0.3, 0), (0.3, -0.3, 0), (0.3, 0.3, 0), (-0.3, 0.3, 0),
             (-0.3, -0.3, th), (0.3, -0.3, th), (0.3, 0.3, th), (-0.3, 0.3, th)],
            [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5),
             (2, 3, 7, 6), (3, 0, 4, 7)], trunk_mat, loc=(x, y, z0))
    cz = th + r * 0.5
    cv = [(0, 0, cz + r * 1.3), (r, 0, cz), (0, r, cz), (-r, 0, cz),
          (0, -r, cz), (0, 0, cz - r * 0.6)]
    cf = [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 1),
          (5, 2, 1), (5, 3, 2), (5, 4, 3), (5, 1, 4)]
    new_obj("Canopy_%d" % k, cv, cf, leaf_mats[k % 2], loc=(x, y, z0))

DW = data.get("dwellings", [])
def near_dwelling(x, y, r=9):
    return any(math.hypot(x - d["cx"], y - d["cy"]) < r for d in DW)
def near_road(x, y, r=6):
    for i in range(1, len(c)):
        ax, ay = c[i - 1]; bx, by = c[i]
        dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy
        t = 0 if L2 == 0 else max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / L2))
        if math.hypot(x - (ax + t * dx), y - (ay + t * dy)) < r:
            return True
    return False

bufE = data.get("buffers", {}).get("bufferE", 15)
bufW = data.get("buffers", {}).get("bufferW", 12)
k = 0
# buffer + open-space trees inside the site (flat, z=0), avoiding homes/road/SuDS
y = miny + 5
while y <= maxy - 5:
    for x in (maxx - bufE * 0.5, minx + bufW * 0.5, maxx - bufE * 0.25, minx + bufW * 0.25):
        if point_in_poly(x, y) and not near_dwelling(x, y) and not near_road(x, y) \
           and not in_any_suds(x, y):
            add_tree(x, y, 0.0, k); k += 1
    y += 8
# context trees in the surrounding countryside (on the undulating terrain)
gy = gy0
while gy <= gy1:
    gx = gx0
    while gx <= gx1:
        jitter = ((k * 37) % 11 - 5)
        x, y = gx + jitter, gy - jitter
        if not point_in_poly(x, y) and abs(x) < 300 and abs(y) < 320:
            add_tree(x, y, terrain_z(x, y), k); k += 1
        gx += 26
    gy += 26

# ── export ───────────────────────────────────────────────────
bpy.ops.export_scene.gltf(filepath=out_path, export_format="GLB", use_selection=False)
print("EXPORTED %s (objects=%d)" % (out_path, len(bpy.data.objects)))
