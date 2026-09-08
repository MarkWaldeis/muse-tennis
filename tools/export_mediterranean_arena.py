"""Export the Mediterranean clay arena to a game-ready GLB.

Opens the tennis .blend from disk (never Dark Temple), unrotates ROOT so the
court sits in X=width / Y=length / Z=up, flips Y so glTF Y-up maps Blender +Y
to Three.js +Z, hides cameras/lights/duplicate court lines+net (the game draws
those), and writes assets/mediterranean-arena.glb.

Run:
  blender --factory-startup --background --python tools/export_mediterranean_arena.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
from mathutils import Vector

REPO = Path(r"C:\Users\Mark Waldeis\Desktop\tennis game\muse-tennis-repo")
BLEND = Path(r"C:\Users\Mark Waldeis\Desktop\tennis game\codex tennis\mediterranean_tennis_court.blend")
OUT_GLB = REPO / "assets" / "mediterranean-arena.glb"
OUT_META = REPO / "assets" / "mediterranean-arena.json"
SCRATCH = Path(r"C:\Users\MARKWA~1\AppData\Local\Temp\grok-goal-4be40d795356\implementer")

# Never touch this file.
DARK_TEMPLE = Path(r"C:\Users\Mark Waldeis\Desktop\Blender Ai\Dark_Temple_Environment.blend")

HIDE_PREFIXES = (
    "CAM_",
    "LIGHT_",
    "Camera",
    "Court_Baseline",
    "Court_Doubles",
    "Court_Singles",
    "Court_Service",
    "Court_Centre",
    "Court_Net",
    "SM_Line_",
    "SM_Net",
    "Net_Post",
    "Net_Centre",
    "Net_Head",
    "Net_Mesh",
    "Sun",
    "Area",
    "Spot",
    "Point",
)

KEEP_ALWAYS = {
    "SM_Court_Clay_Slab",
    "SM_Court_PlaySurface",
    "SM_Scoreboard",
    "Court_PlaySurface",
    "Court_ClayApron",
}


def log(msg: str) -> None:
    print(msg, flush=True)


def assert_safe_filepath() -> None:
    opened = Path(bpy.data.filepath).resolve() if bpy.data.filepath else None
    if opened and opened.resolve() == DARK_TEMPLE.resolve():
        raise RuntimeError("refusing to operate on Dark_Temple_Environment.blend")
    if not BLEND.exists():
        raise FileNotFoundError(BLEND)


def hide_object(obj) -> None:
    try:
        obj.hide_set(True)
    except Exception:
        pass
    obj.hide_render = True
    obj.hide_viewport = True
    if hasattr(obj, "hide_export"):
        obj.hide_export = True


def should_hide(obj) -> bool:
    if obj.name in KEEP_ALWAYS:
        return False
    if obj.type in {"CAMERA", "LIGHT", "SPEAKER"}:
        return True
    for prefix in HIDE_PREFIXES:
        if obj.name.startswith(prefix) or obj.name == prefix.rstrip("_"):
            return True
    return False


def local_bound(obj, inv):
    corners = [inv @ (obj.matrix_world @ Vector(c)) for c in obj.bound_box]
    xs = [v.x for v in corners]
    ys = [v.y for v in corners]
    zs = [v.z for v in corners]
    return {
        "min": [min(xs), min(ys), min(zs)],
        "max": [max(xs), max(ys), max(zs)],
        "size": [max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)],
    }


def apply_modifiers(obj) -> None:
    if obj.type != "MESH":
        return
    try:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        for mod in list(obj.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=mod.name)
            except Exception:
                obj.modifiers.remove(mod)
        obj.select_set(False)
    except Exception as exc:
        log(f"modifier skip {obj.name}: {exc}")


def make_normals_consistent(obj) -> None:
    if obj.type != "MESH" or obj.data is None:
        return
    try:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        obj.select_set(False)
    except Exception:
        try:
            bpy.ops.object.mode_set(mode="OBJECT")
        except Exception:
            pass


def resize_images(max_px: int = 1024) -> int:
    n = 0
    for img in bpy.data.images:
        try:
            w, h = img.size
        except Exception:
            continue
        if w <= 0 or h <= 0:
            continue
        if max(w, h) <= max_px:
            continue
        scale = max_px / float(max(w, h))
        nw = max(1, int(w * scale))
        nh = max(1, int(h * scale))
        try:
            img.scale(nw, nh)
            n += 1
        except Exception as exc:
            log(f"image scale skip {img.name}: {exc}")
    return n


def main() -> None:
    if DARK_TEMPLE.exists() and BLEND.resolve() == DARK_TEMPLE.resolve():
        raise RuntimeError("blend path collision with Dark Temple")
    assert_safe_filepath()
    log(f"opening {BLEND}")
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    assert_safe_filepath()
    log(f"opened {bpy.data.filepath} objects={len(bpy.data.objects)}")

    # Drop the default factory cube/light/camera that factory-startup may add
    # before open_mainfile; after open they should be gone.

    root = bpy.data.objects.get("ROOT_Arena_Complex")
    if root is None:
        raise RuntimeError("ROOT_Arena_Complex missing")

    # Unrotate so court-local XY (width/length) becomes world XY, Z up.
    # Do NOT apply a Y-flip here: glTF Y-up already maps (x, y, z) -> (x, z, -y)
    # so Blender height (Z) becomes Three.js Y and the court stays upright.
    # A baked scale of -1 inverts hundreds of meshes and dumps villas underground.
    root.rotation_euler = (0.0, 0.0, 0.0)
    root.location = (0.0, 0.0, 0.0)
    root.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()

    hidden = []
    kept = []
    bpy.ops.object.select_all(action="DESELECT")
    for obj in list(bpy.data.objects):
        if should_hide(obj):
            hide_object(obj)
            hidden.append(obj.name)
            continue
        kept.append(obj.name)
        if obj.type == "MESH" and obj.modifiers:
            apply_modifiers(obj)

    resized = resize_images(1024)
    log(f"hidden={len(hidden)} kept={len(kept)} images_resized={resized}")

    clay = bpy.data.objects.get("SM_Court_Clay_Slab")
    play = bpy.data.objects.get("SM_Court_PlaySurface")
    inv = root.matrix_world.inverted()
    clay_b = local_bound(clay, inv) if clay else None
    play_b = local_bound(play, inv) if play else None
    log(f"clay_local={clay_b}")
    log(f"play_local={play_b}")

    OUT_GLB.parent.mkdir(parents=True, exist_ok=True)
    SCRATCH.mkdir(parents=True, exist_ok=True)

    # Visible-only export (hidden objects stay out of the GLB).
    bpy.ops.export_scene.gltf(
        filepath=str(OUT_GLB),
        export_format="GLB",
        use_selection=False,
        use_visible=True,
        export_apply=True,
        export_cameras=False,
        export_extras=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_keep_originals=False,
        export_draco_mesh_compression_enable=False,
    )

    size = OUT_GLB.stat().st_size if OUT_GLB.exists() else 0
    meta = {
        "source": str(BLEND),
        "glb": str(OUT_GLB),
        "bytes": size,
        "hidden": hidden,
        "kept_count": len(kept),
        "clay_local": clay_b,
        "play_local": play_b,
        "align": {
            "blender_court": "X=width Y=length Z=up after unrotate",
            "gltf": "Y-up, Three.js Z = -Blender Y (north at -Z, court is symmetric)",
            "game_court": "X=width Y=up Z=length, net at z=0",
        },
    }
    OUT_META.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    (SCRATCH / "export_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    log(f"wrote {OUT_GLB} bytes={size}")
    log("EXPORT_OK")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        log(f"EXPORT_FAIL {exc}")
        raise
    sys.exit(0)
