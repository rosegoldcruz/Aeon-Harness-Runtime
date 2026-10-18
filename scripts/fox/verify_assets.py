"""Blender verification and visual previews of the exported GLBs."""
import bpy
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / ".aeon-assets"


def studio(target, position, scale):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 16
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.world = bpy.data.worlds.new("Studio")
    scene.world.color = (.2,.2,.2)
    for name,pos,power in [("Key",(1,-3,3),350),("Fill",(-2,-1,2),200),("Rim",(0,2,3),500)]:
        bpy.ops.object.light_add(type="AREA", location=pos)
        light=bpy.context.object
        light.name=name
        light.data.energy=power
        light.data.size=3
        light.rotation_euler=(Vector(target)-light.location).to_track_quat("-Z","Y").to_euler()
    bpy.ops.object.camera_add(location=position)
    camera=bpy.context.object
    camera.rotation_euler=(Vector(target)-camera.location).to_track_quat("-Z","Y").to_euler()
    camera.data.type="ORTHO"
    camera.data.ortho_scale=scale
    scene.camera=camera
    return scene


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/"public/models/aeon-fox-head.glb"))
mesh=next(o for o in bpy.context.scene.objects if o.type=="MESH" and o.data.shape_keys)
assert set(("jawOpen","mouthSmile","mouthFunnel")).issubset(mesh.data.shape_keys.key_blocks.keys())
rig=next(o for o in bpy.context.scene.objects if o.type=="ARMATURE")
assert "Jaw" in rig.data.bones and "Head" in rig.data.bones
jaw=mesh.data.shape_keys.key_blocks["jawOpen"]
assert max((v.co-mesh.data.vertices[i].co).length for i,v in enumerate(jaw.data))>.04
scene=studio((0,0,0),(0,-3,.01),.62)
scene.render.filepath=str(WORK/"head-closed.png")
bpy.ops.render.render(write_still=True)
jaw.value=1
scene.render.filepath=str(WORK/"head-open.png")
bpy.ops.render.render(write_still=True)
print("HEAD VERIFIED: facial bones and three morph targets; closed/open renders saved",flush=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(ROOT/"public/models/aeon-fox-full-body.glb"))
rig=next(o for o in bpy.context.scene.objects if o.type=="ARMATURE")
assert rig.animation_data and rig.animation_data.action
scene=studio((0,0,.85),(1,-4,1.3),1.95)
scene.frame_set(15)
scene.render.filepath=str(WORK/"body-walking.png")
bpy.ops.render.render(write_still=True)
print("BODY VERIFIED: skinned armature and walking action; rendered frame 15",flush=True)
