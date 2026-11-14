import bpy, bmesh, math, os, time
from mathutils import Vector, Matrix

D = os.path.dirname(os.path.abspath(__file__))
DL = os.path.abspath(os.path.join(D, "..", "dl"))
CARCOLOR = os.environ.get("CARCOLOR", "red")
COLORS = {"red": (0.30, 0.035, 0.030), "blue": (0.020, 0.055, 0.26), "green": (0.035, 0.135, 0.055), "graphite": (0.05, 0.05, 0.055)}
FR = os.path.join(D, f"frames_v5_{CARCOLOR}")
os.makedirs(FR, exist_ok=True)

CARS = int(os.environ.get("CARS", "16"))
PDIRS = int(os.environ.get("PDIRS", "8"))
PFRAMES = int(os.environ.get("PFRAMES", "8"))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def mat(name, color, rough=0.4, metal=0.0, coat=0.0, emit=None):
    m = bpy.data.materials.new(name)
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if coat:
        b.inputs["Coat Weight"].default_value = coat
        b.inputs["Coat Roughness"].default_value = 0.02
    if emit:
        b.inputs["Emission Color"].default_value = (*emit, 1)
        b.inputs["Emission Strength"].default_value = 5.0
    return m


PAINT = mat("paint", COLORS[CARCOLOR], 0.30, 0.10, coat=0.35)
GLASS = mat("glass", (0.055, 0.075, 0.10), 0.06, 0.65, coat=0.6)
TIRE = mat("tire", (0.045, 0.045, 0.05), 0.88)
RIM = mat("rim", (0.66, 0.67, 0.69), 0.22, 1.0)
CHROME = mat("chrome", (0.86, 0.87, 0.9), 0.1, 1.0)
DARK = mat("dark", (0.035, 0.035, 0.04), 0.5)
LIGHT_M = mat("light", (0.9, 0.9, 0.86), 0.06, 0.1, emit=(1.0, 0.97, 0.9))
TAIL_M = mat("tail", (0.7, 0.02, 0.02), 0.1, 0.1, emit=(1.0, 0.04, 0.02))
PLATE = mat("plate", (0.85, 0.85, 0.82), 0.45)
PAINT2 = mat("paint_panel", (0.26, 0.030, 0.026), 0.38, 0.08, coat=0.25)


def box(name, m_, loc, scale, bevel=0.0, rot=(0, 0, 0), segs=3, subs=0):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        b = o.modifiers.new("bev", 'BEVEL')
        b.width = bevel
        b.segments = segs
        b.limit_method = 'NONE'
        bpy.ops.object.modifier_apply(modifier=b.name)
    if subs:
        s2 = o.modifiers.new("subs", 'SUBSURF')
        s2.levels = subs
        s2.render_levels = subs
        bpy.ops.object.modifier_apply(modifier=s2.name)
    o.data.materials.append(m_)
    bpy.ops.object.shade_smooth()
    return o


# ======================= CAR =======================
def build_car():
    objs = []
    bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0.72))
    body = bpy.context.active_object
    body.name = "body"
    body.scale = (0.90, 2.25, 0.27)
    bpy.ops.object.transform_apply(scale=True)
    bev = body.modifiers.new("bev", 'BEVEL')
    bev.width = 0.17
    bev.segments = 2
    bev.limit_method = 'NONE'
    sub = body.modifiers.new("subs", 'SUBSURF')
    sub.levels = 2
    sub.render_levels = 2
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier="bev")
    bpy.ops.object.modifier_apply(modifier="subs")
    bpy.ops.object.shade_smooth()

    cutters = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            bpy.ops.mesh.primitive_cylinder_add(location=(0.92 * sx, 1.42 * sy, 0.40),
                                                radius=0.46, depth=2.4,
                                                rotation=(0, math.pi / 2, 0), vertices=32)
            cutters.append(bpy.context.active_object)
    for cut in cutters:
        m = body.modifiers.new("bool" + cut.name, 'BOOLEAN')
        m.operation = 'DIFFERENCE'
        m.solver = 'EXACT'
        m.object = cut
    bpy.context.view_layer.objects.active = body
    for cut in cutters:
        bpy.ops.object.modifier_apply(modifier="bool" + cut.name)
    for cut in cutters:
        bpy.data.objects.remove(cut, do_unlink=True)
    body.data.materials.clear()
    body.data.materials.append(PAINT)
    for poly in body.data.polygons:
        poly.material_index = 0
    outline = box("outline", DARK, (0, 0, 0.44), (0.930, 2.310, 0.040), bevel=0.24, segs=4)
    objs.append(outline)
    objs.append(body)

    # cabin
    bpy.ops.mesh.primitive_cube_add(location=(0, -0.14, 1.14))
    cab = bpy.context.active_object
    cab.name = "cabin"
    cab.scale = (0.78, 0.96, 0.30)
    bpy.ops.object.transform_apply(scale=True)
    bm = bmesh.new()
    bm.from_mesh(cab.data)
    for v in bm.verts:
        if v.co.z > 0:
            v.co.x *= 0.88
            v.co.y *= 0.78
    bm.to_mesh(cab.data)
    bm.free()
    b = cab.modifiers.new("bev", 'BEVEL')
    b.width = 0.09
    b.segments = 2
    b.limit_method = 'NONE'
    s2 = cab.modifiers.new("subs", 'SUBSURF')
    s2.levels = 2
    s2.render_levels = 2
    bpy.context.view_layer.objects.active = cab
    bpy.ops.object.modifier_apply(modifier="bev")
    bpy.ops.object.modifier_apply(modifier="subs")
    cab.data.materials.append(GLASS)
    bpy.ops.object.shade_smooth()
    objs.append(cab)

    objs.append(box("roof", PAINT, (0, -0.30, 1.452), (0.600, 0.500, 0.018), bevel=0.05, segs=3, subs=1))
    for sx in (-1, 1):
        objs.append(box(f"rail{sx}", CHROME, (0.575 * sx, -0.30, 1.468), (0.014, 0.46, 0.009), bevel=0.004, segs=2))
        objs.append(box(f"marm{sx}", DARK, (0.80 * sx, 0.62, 0.99), (0.06, 0.015, 0.015)))
        objs.append(box(f"mirror{sx}", PAINT, (0.895 * sx, 0.60, 1.00), (0.042, 0.068, 0.026), bevel=0.014, segs=3, subs=1))
        objs.append(box(f"handle{sx}", CHROME, (0.900 * sx, -0.02, 0.86), (0.010, 0.072, 0.015), bevel=0.005, segs=2))
        objs.append(box(f"sill{sx}", DARK, (0.895 * sx, -0.05, 0.50), (0.013, 1.25, 0.042), bevel=0.01, segs=2))
        objs.append(box(f"head{sx}", LIGHT_M, (0.52 * sx, 2.243, 0.86), (0.155, 0.018, 0.052), bevel=0.02, segs=3, subs=1))
        objs.append(box(f"tail{sx}", TAIL_M, (0.55 * sx, -2.243, 0.88), (0.165, 0.016, 0.048), bevel=0.018, segs=3, subs=1))

    for sy, ln in ((1, 0.80), (-1, 0.60)):
        objs.append(box(f"seamHood{sy}", DARK, (0, 1.12 * sy, 0.948), (0.760, 0.012, 0.006)))
    objs.append(box("grille", DARK, (0, 2.245, 0.80), (0.40, 0.012, 0.072), bevel=0.01, segs=2))
    for i in range(5):
        objs.append(box(f"gbar{i}", CHROME, (0, 2.251, 0.774 + i * 0.027), (0.383, 0.005, 0.005)))
    objs.append(box("plateF", PLATE, (0, 2.248, 0.60), (0.103, 0.006, 0.031)))
    objs.append(box("plateR", PLATE, (0, -2.248, 0.60), (0.103, 0.006, 0.031)))
    objs.append(box("bumperF", PAINT, (0, 2.22, 0.52), (0.855, 0.055, 0.11), bevel=0.05, segs=3, subs=1))
    objs.append(box("bumperR", PAINT, (0, -2.22, 0.52), (0.855, 0.055, 0.11), bevel=0.05, segs=3, subs=1))

    for sx in (-1, 1):
        for sy in (-1, 1):
            x, y = 0.888 * sx, 1.42 * sy
            bpy.ops.mesh.primitive_cylinder_add(location=(x, y, 0.355), radius=0.352, depth=0.310,
                                                rotation=(0, math.pi / 2, 0), vertices=48)
            tire = bpy.context.active_object
            tire.name = f"tire{sx}{sy}"
            tb = tire.modifiers.new("bev", 'BEVEL')
            tb.width = 0.035
            tb.segments = 2
            bpy.ops.object.modifier_apply(modifier="bev")
            tire.data.materials.append(TIRE)
            bpy.ops.object.shade_smooth()
            objs.append(tire)

            bpy.ops.mesh.primitive_cylinder_add(location=(x + 0.020 * sx, y, 0.355), radius=0.225, depth=0.030,
                                                rotation=(0, math.pi / 2, 0), vertices=32)
            disc = bpy.context.active_object
            disc.data.materials.append(RIM)
            bpy.ops.object.shade_smooth()
            objs.append(disc)
            for k in range(5):
                a = 2 * math.pi * k / 5
                objs.append(box(f"spoke{sx}{sy}{k}", DARK,
                                (x + 0.033 * sx, y + math.cos(a) * 0.115, 0.355 + math.sin(a) * 0.115),
                                (0.006, 0.013, 0.092), rot=(-a, 0, 0), bevel=0.003, segs=2))
            bpy.ops.mesh.primitive_cylinder_add(location=(x + 0.040 * sx, y, 0.355), radius=0.048, depth=0.028,
                                                rotation=(0, math.pi / 2, 0), vertices=20)
            hub = bpy.context.active_object
            hub.data.materials.append(CHROME)
            bpy.ops.object.shade_smooth()
            objs.append(hub)

    root = bpy.data.objects.new("car_root", None)
    scene.collection.objects.link(root)
    for o in objs:
        o.parent = root
        o.matrix_parent_inverse = root.matrix_world.inverted()
    return root, objs


# ======================= CHARACTER =======================
def load_character():
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(D, "assets", "character-casual.glb"))
    new = [o for o in scene.objects if o not in before]
    arm = next(o for o in new if o.type == 'ARMATURE')
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    char_objs = [o for o in new if o.type == 'MESH']
    root = bpy.data.objects.new("pl_root", None)
    scene.collection.objects.link(root)
    for o in new:
        if o.parent is None:
            o.parent = root
            o.matrix_parent_inverse = root.matrix_world.inverted()
    return root, arm, char_objs


def world_rot(pb, axis, angle):
    """Rotate pose bone by `angle` around a world axis."""
    rest = pb.bone.matrix_local.to_3x3()
    r = Matrix.Rotation(angle, 3, Vector(axis))
    local = rest.inverted() @ r @ rest
    pb.rotation_quaternion = local.to_quaternion()


# ======================= CAMERA / LIGHT =======================
cd = bpy.data.cameras.new("cam")
cd.type = 'ORTHO'
cam = bpy.data.objects.new("cam", cd)
scene.collection.objects.link(cam)
scene.camera = cam
tgt = bpy.data.objects.new("tgt", None)
scene.collection.objects.link(tgt)
cc = cam.constraints.new('TRACK_TO')
cc.target = tgt
cc.track_axis = 'TRACK_NEGATIVE_Z'
cc.up_axis = 'UP_Y'
EL = math.radians(float(os.environ.get("ELEV", "90")))


def place_cam(cz, ortho):
    if EL >= math.radians(89.5):
        # строго сверху: камера смотрит вдоль -Z, верх кадра = +Y (север)
        cc.mute = True
        cam.rotation_euler = (0, 0, 0)
        cam.location = (0, 0, 16 + cz)
    else:
        cc.mute = False
        cam.location = (0, -16 * math.cos(EL), 16 * math.sin(EL) + cz)
        tgt.location = (0, 0, cz)
    cd.ortho_scale = ortho


sd = bpy.data.lights.new("key", 'SUN')
sd.energy = 2.4
sd.angle = math.radians(3)
sun = bpy.data.objects.new("key", sd)
sun.rotation_euler = (math.radians(52), math.radians(4), math.radians(-25))
scene.collection.objects.link(sun)

ad = bpy.data.lights.new("rim", 'AREA')
ad.energy = 200
ad.size = 6
al = bpy.data.objects.new("rim", ad)
al.location = (-4.0, 4.0, 3.5)
al.rotation_euler = (math.radians(52), 0, math.radians(215))
scene.collection.objects.link(al)

w = bpy.data.worlds.new("w")
scene.world = w
nt = w.node_tree
sky = nt.nodes.new("ShaderNodeTexSky")
sky.sky_type = 'MULTIPLE_SCATTERING'
sky.sun_elevation = math.radians(45)
sky.sun_rotation = math.radians(220)
nt.links.new(sky.outputs[0], nt.nodes["Background"].inputs[0])
nt.nodes["Background"].inputs[1].default_value = 0.25

r = scene.render
r.resolution_x = r.resolution_y = 512
r.film_transparent = True
r.image_settings.file_format = 'PNG'
r.image_settings.color_mode = 'RGBA'
r.engine = 'BLENDER_EEVEE'
scene.eevee.taa_render_samples = 48
for attr in ("use_raytracing", "use_gtao"):
    if hasattr(scene.eevee, attr):
        try:
            setattr(scene.eevee, attr, True)
        except Exception:
            pass
scene.view_settings.view_transform = 'AgX'
scene.view_settings.exposure = -0.4

# ======================= BAKE =======================
car_root, car_objs = build_car()
place_cam(0.65, 5.05)
if CARS:
    for i in range(CARS):
        car_root.rotation_euler = (0, 0, 2 * math.pi * i / CARS)
        r.filepath = os.path.join(FR, f"car_{i:02d}.png")
        bpy.ops.render.render(write_still=True)
    print("CARS DONE", CARS, flush=True)

for o in car_objs:
    o.hide_render = True
car_root.hide_render = True

pl_root, arm, pl_objs = load_character()
place_cam(0.92, 1.80)

LEGS = ("UpperLeg.L", "UpperLeg.R", "LowerLeg.L", "LowerLeg.R")
ARMS = ("UpperArm.L", "UpperArm.R")

for i in range(PDIRS):
    for f in range(PFRAMES):
        ph = 2 * math.pi * f / PFRAMES
        sw = math.sin(ph)
        # arms down along body, then swing
        for bn, sgn in (("UpperArm.L", 1), ("UpperArm.R", -1)):
            pb = arm.pose.bones[bn]
            rest = pb.bone.matrix_local.to_3x3()
            r_down = Matrix.Rotation(sgn * math.radians(86), 3, Vector((0, 0, 1)))
            r_sw = Matrix.Rotation(sw * sgn * math.radians(18), 3, Vector((1, 0, 0)))
            l_down = rest.inverted() @ r_down @ rest
            l_sw = rest.inverted() @ r_sw @ rest
            pb.rotation_quaternion = (l_sw @ l_down).to_quaternion()
        # legs
        for bn, sgn in (("UpperLeg.L", 1), ("UpperLeg.R", -1)):
            world_rot(arm.pose.bones[bn], (1, 0, 0), sw * sgn * math.radians(19))
        for bn, sgn in (("LowerLeg.L", 1), ("LowerLeg.R", -1)):
            bend = max(0.0, -sw * sgn) * math.radians(26)
            world_rot(arm.pose.bones[bn], (1, 0, 0), -bend)
        pl_root.location.z = abs(math.sin(2 * ph)) * 0.018
        pl_root.rotation_euler = (0, 0, 2 * math.pi * i / PDIRS)
        bpy.context.view_layer.update()
        r.filepath = os.path.join(FR, f"pl_{i:02d}_{f:02d}.png")
        bpy.ops.render.render(write_still=True)
    print("PLAYER DIR", i, flush=True)

print("DONE", FR)
