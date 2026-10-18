"""Run with Blender --background --python scripts/fox/prepare_assets.py.

Exports the Meshy walk rig and builds an independent facial rig from the same mesh.
The mouth has a split lip seam, an interior, and jawOpen / mouthFunnel / mouthSmile
shape keys. Blender projects are saved locally alongside the original Meshy assets.
"""
import bpy
import bmesh
import json
import math
from mathutils import Vector, Matrix
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / ".aeon-assets"
OUTPUT = ROOT / "public" / "models"
OUTPUT.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT / "assets" / "fox"
SOURCE.mkdir(parents=True, exist_ok=True)


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def bounds(objects):
    graph = bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in objects:
        if obj.type != "MESH": continue
        data = obj.evaluated_get(graph).data
        used = {index for face in data.polygons for index in face.vertices}
        points.extend(obj.matrix_world @ data.vertices[index].co for index in used)
    return Vector(tuple(min(v[i] for v in points) for i in range(3))), Vector(tuple(max(v[i] for v in points) for i in range(3)))


def export(name):
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT / name), export_format="GLB", export_animations=True,
        export_morph=True, export_skins=True, export_yup=True, export_image_format="AUTO", export_tangents=True)


def smoothstep(a, b, value):
    t = max(0, min(1, (value-a)/(b-a)))
    return t*t*(3-2*t)


def body():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(WORK / "walking.glb"))
    scene = bpy.context.scene
    for obj in scene.objects:
        if obj.type != "MESH": continue
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
    arms = [o for o in scene.objects if o.type == "ARMATURE"]
    for arm in arms:
        arm.data.pose_position = "REST"
        if arm.animation_data and arm.animation_data.action:
            arm.animation_data.action.name = "Walk"
    bpy.context.view_layer.update()
    # Meshy's rig is already scaled to 1.7m. Preserve its bind-space transforms.
    # Its zero-weight helper vertices must not be used to rescale the character.
    for arm in arms:
        arm.data.pose_position = "POSE"
    scene.frame_set(1)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "aeon-fox-full-body.blend"), compress=True)
    export("aeon-fox-full-body.glb")
    print("FULL BODY EXPORTED", flush=True)


def head():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(WORK / "source.glb"))
    mesh = next(o for o in bpy.context.scene.objects if o.type == "MESH")
    mesh.name = "AeonFoxHead"
    activate(mesh)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    lo, hi = bounds([mesh])
    scale = 1.7/(hi.z-lo.z)
    for vertex in mesh.data.vertices:
        vertex.co = (vertex.co-Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z))) * scale

    # Cut at the neck, then cap the open neck boundary.
    bm = bmesh.new()
    bm.from_mesh(mesh.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces), dist=.00001,
        plane_co=(0,0,1.235), plane_no=(0,0,1), clear_inner=True, clear_outer=False)
    neck_edges = [e for e in bm.edges if e.is_boundary and all(abs(v.co.z-1.235)<.0001 for v in e.verts)]
    if neck_edges:
        bmesh.ops.holes_fill(bm, edges=neck_edges, sides=0)
    # Remove tiny disconnected shoulder/collar fragments left by the neck cut.
    unseen = set(bm.verts)
    components = []
    while unseen:
        pending = [unseen.pop()]
        component = set(pending)
        while pending:
            vertex = pending.pop()
            for edge in vertex.link_edges:
                neighbor = edge.other_vert(vertex)
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    component.add(neighbor)
                    pending.append(neighbor)
        components.append(component)
    largest = max(map(len,components))
    fragments = [vertex for component in components
        if len(component)<largest*.05 and max(v.co.z for v in component)<1.26
        and min(abs(v.co.x+.035) for v in component)>.17 for vertex in component]
    bmesh.ops.delete(bm, geom=fragments, context="VERTS")

    # Split only the front lip seam. Lower seam vertices can now move independently.
    mouth_z = 1.279
    center_x = -.035
    def lip_rise(co):
        return .11*abs(co.x-center_x)*(1-smoothstep(-.285,-.215,co.y))
    for vertex in bm.verts: vertex.co.z -= lip_rise(vertex.co)
    bmesh.ops.bisect_plane(bm, geom=list(bm.verts)+list(bm.edges)+list(bm.faces), dist=.000001,
        plane_co=(0,0,mouth_z), plane_no=(0,0,1), clear_inner=False, clear_outer=False)
    seam = [e for e in bm.edges if all(abs(v.co.z-mouth_z)<.00001 for v in e.verts)
        and (e.verts[0].co.y+e.verts[1].co.y)/2 < -.245
        and abs((e.verts[0].co.x+e.verts[1].co.x)/2-center_x)<.125]
    if not seam:
        raise RuntimeError("Lip seam was not found; inspect the model before exporting.")
    bmesh.ops.split_edges(bm, edges=seam)
    lower_seam = set()
    bm.verts.index_update()
    for vertex in bm.verts:
        if abs(vertex.co.z-mouth_z)<.00001 and vertex.link_faces:
            if all(face.calc_center_median().z < mouth_z+.000001 for face in vertex.link_faces):
                lower_seam.add(vertex.index)
    for vertex in bm.verts: vertex.co.z += lip_rise(vertex.co)
    bmesh.ops.triangulate(bm, faces=list(bm.faces))
    bm.to_mesh(mesh.data)
    bm.free()
    mesh.data.update()
    mesh.shape_key_add(name="Basis")
    jaw = mesh.shape_key_add(name="jawOpen")
    funnel = mesh.shape_key_add(name="mouthFunnel")
    smile = mesh.shape_key_add(name="mouthSmile")
    for key in (jaw,funnel,smile): key.value = 0
    jaw_weights = {}
    hinge = Vector((center_x,-.14,1.285))
    rotation = Matrix.Rotation(.32, 3, "X")
    for vertex in mesh.data.vertices:
        co = vertex.co
        front = 1-smoothstep(-.285,-.215,co.y)
        side = 1-smoothstep(.06,.125,abs(co.x-center_x))
        lower = co.z < mouth_z+lip_rise(co)-.00001 or vertex.index in lower_seam
        weight = front*side*smoothstep(1.205,1.245,co.z) if lower else 0
        jaw_weights[vertex.index] = weight
        target = hinge+rotation@(co-hinge)
        jaw.data[vertex.index].co = co.lerp(target,weight)
        lip = front*side*(1-smoothstep(.005,.04,abs(co.z-mouth_z-lip_rise(co))))
        funnel.data[vertex.index].co.y -= .018*lip
        funnel.data[vertex.index].co.x += (center_x-co.x)*.18*lip
        smile.data[vertex.index].co.x += (co.x-center_x)*.15*lip
        smile.data[vertex.index].co.z += .012*lip*smoothstep(.015,.07,abs(co.x-center_x))

    # A dark oral cavity is recessed behind the opened lip seam.
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=(center_x,-.205,1.276))
    cavity = bpy.context.object
    cavity.name = "MouthInterior"
    cavity.scale = (.06,.015,.005)
    activate(cavity)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    cavity.shape_key_add(name="Basis")
    cavity_jaw = cavity.shape_key_add(name="jawOpen")
    cavity_jaw.value = 0
    for vertex in cavity_jaw.data:
        vertex.co.z = vertex.co.z*4-.012
    material = bpy.data.materials.new("MouthInterior")
    material.diffuse_color = (.018,.003,.008,1)
    material.use_nodes = True
    shader = material.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (.018,.003,.008,1)
    shader.inputs["Roughness"].default_value = .85
    cavity.data.materials.append(material)
    for face in cavity.data.polygons:
        face.use_smooth = True

    # Independent facial armature for downstream Blender editing and retargeting.
    armature = bpy.data.armatures.new("AeonFaceRig")
    rig = bpy.data.objects.new("AeonFaceRig", armature)
    bpy.context.scene.collection.objects.link(rig)
    activate(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    locations = {
        "Neck": ((center_x,0,1.205),(center_x,0,1.29),None),
        "Head": ((center_x,0,1.29),(center_x,0,1.5),"Neck"),
        "Jaw": (tuple(hinge),(center_x,-.32,1.26),"Head"),
        "Ear.L": ((.10,-.1,1.48),(.15,-.12,1.68),"Head"),
        "Ear.R": ((-.17,-.1,1.48),(-.22,-.12,1.68),"Head"),
    }
    for name, (start,end,parent) in locations.items():
        bone = armature.edit_bones.new(name)
        bone.head, bone.tail = start,end
        if parent: bone.parent = armature.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")
    for obj in (mesh,cavity):
        groups = {name: obj.vertex_groups.new(name=name) for name in locations}
        for vertex in obj.data.vertices:
            co = obj.matrix_world @ vertex.co
            weight = jaw_weights.get(vertex.index,0) if obj == mesh else 0
            ear = smoothstep(1.48,1.55,co.z) * smoothstep(.08,.14,abs(co.x-center_x)) if obj == mesh else 0
            ear_name = "Ear.L" if co.x > center_x else "Ear.R"
            groups[ear_name].add([vertex.index],ear,"REPLACE")
            groups["Jaw"].add([vertex.index],weight*(1-ear),"REPLACE")
            groups["Head"].add([vertex.index],(1-weight)*(1-ear),"REPLACE")
        modifier = obj.modifiers.new("AeonFaceRig","ARMATURE")
        modifier.object = rig
        obj.parent = rig

    # Center the head at the origin; keep a useful natural scale for glTF viewers.
    rig.location = (-center_x,.15,-1.4675)
    rig.show_in_front = True
    bpy.context.scene["facial_controls"] = "jawOpen, mouthFunnel, mouthSmile; Jaw and Ear bones"
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / "aeon-fox-head.blend"), compress=True)
    export("aeon-fox-head.glb")
    print("HEAD EXPORTED",len(mesh.data.vertices),"vertices",len(seam),"lip seam edges",flush=True)


body()
head()
state = json.loads((WORK / "pipeline.json").read_text())
(OUTPUT / "aeon-fox.json").write_text(json.dumps({
    "name": "Aeon Fox", "source": "User-provided Aeon Fox.png", "generator": "Meshy image-to-3d",
    "generation_task": state["generation"], "rigging_task": state["rigging"],
    "full_body": "aeon-fox-full-body.glb", "head": "aeon-fox-head.glb",
    "body_animation": "Walk", "head_morphs": ["jawOpen","mouthFunnel","mouthSmile"],
    "processing": "Blender: normalization, head isolation, neck cap, lip seam, mouth interior and facial armature",
}, indent=2), encoding="utf-8")
