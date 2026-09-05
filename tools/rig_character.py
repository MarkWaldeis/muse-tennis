#!/usr/bin/env python3
"""Rig the Tripo bird mascot for the tennis game.

Pipeline (research-backed, CPU, no paid addons):
  1. Fit a Mixamo-compatible biped plus bird extras (tail, crest, beak, toes)
     by analysing the mesh — same joint set Mixamo / UniRig mixamo.yaml use,
     so later tennis clips can be retargeted.
  2. Voxel geodesic heat skinning (Pinocchio / Adaptive Auto Skinning idea):
     heat diffuses only through occupied volume so fingers/feathers do not
     bleed into each other. Top-4 weights, game-engine ready.
  3. Export a skinned GLB that Three.js GLTFLoader can bind directly.

UniRig (SIGGRAPH 2025, Tripo) is the best learned auto-rigger for this mesh
but needs a GPU we do not have here; this script is the production-quality
CPU fallback used in the same studios when GPU inference is unavailable.
"""

from __future__ import annotations

import json
import math
import struct
import sys
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

SRC = Path("/workspace/mascot bird 3d model.glb")
DST = Path("/workspace/assets/mascot-bird-rigged.glb")
BONE_MAP = Path("/workspace/assets/mascot-bird-rig.json")
OTTER_SRC = Path("/workspace/cartoon otter 3d model.glb")
OTTER_DST = Path("/workspace/assets/mascot-otter-rigged.glb")
OTTER_BONE_MAP = Path("/workspace/assets/mascot-otter-rig.json")

GRID = 88
MAX_INFLUENCES = 4
PAD = 0.03


# ---------------------------------------------------------------------------
# glTF IO
# ---------------------------------------------------------------------------

def load_glb(path: Path) -> tuple[dict, bytes]:
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", raw, 0)
    if magic != b"glTF" or version != 2:
        raise RuntimeError(f"unsupported glTF {magic!r} v{version}")
    off = 12
    json_chunk = None
    bin_chunk = b""
    while off + 8 <= length:
        clen, ctype = struct.unpack_from("<I4s", raw, off)
        off += 8
        data = raw[off : off + clen]
        off += clen
        if ctype == b"JSON":
            json_chunk = json.loads(data)
        elif ctype == b"BIN\x00":
            bin_chunk = data
    if json_chunk is None:
        raise RuntimeError("missing JSON chunk")
    return json_chunk, bin_chunk


def accessor_numpy(doc: dict, blob: bytes, index: int) -> np.ndarray:
    acc = doc["accessors"][index]
    bv = doc["bufferViews"][acc["bufferView"]]
    off = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    count = acc["count"]
    ctype = acc["componentType"]
    typ = acc["type"]
    comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}[typ]
    dt = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16,
          5125: np.uint32, 5126: np.float32}[ctype]
    arr = np.frombuffer(blob, dtype=dt, count=count * comps, offset=off)
    return arr.reshape(count, comps) if comps > 1 else arr


def pad4(n: int) -> int:
    return (4 - (n % 4)) % 4


def write_glb(path: Path, doc: dict, blob: bytes) -> None:
    json_bytes = json.dumps(doc, separators=(",", ":")).encode("utf-8")
    json_bytes += b" " * pad4(len(json_bytes))
    blob = blob + b"\x00" * pad4(len(blob))
    length = 12 + 8 + len(json_bytes) + 8 + len(blob)
    out = bytearray()
    out += struct.pack("<4sII", b"glTF", 2, length)
    out += struct.pack("<I4s", len(json_bytes), b"JSON")
    out += json_bytes
    out += struct.pack("<I4s", len(blob), b"BIN\x00")
    out += blob
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(out)


# ---------------------------------------------------------------------------
# Skeleton
# ---------------------------------------------------------------------------

@dataclass
class Bone:
    name: str
    parent: str | None
    head: np.ndarray
    tail: np.ndarray
    radius: float
    deform: bool = True
    children: list[str] = field(default_factory=list)

    @property
    def length(self) -> float:
        return float(np.linalg.norm(self.tail - self.head))


def v3(*xyz: float) -> np.ndarray:
    return np.array(xyz, dtype=np.float32)


def lerp_v(a: np.ndarray, b: np.ndarray, t: float) -> np.ndarray:
    return a * (1.0 - t) + b * t


def slice_centroid(pos: np.ndarray, *, y0=None, y1=None, x0=None, x1=None,
                   z0=None, z1=None, xsign=None) -> np.ndarray:
    m = np.ones(len(pos), dtype=bool)
    if y0 is not None:
        m &= pos[:, 1] >= y0
    if y1 is not None:
        m &= pos[:, 1] < y1
    if x0 is not None:
        m &= pos[:, 0] >= x0
    if x1 is not None:
        m &= pos[:, 0] < x1
    if z0 is not None:
        m &= pos[:, 2] >= z0
    if z1 is not None:
        m &= pos[:, 2] < z1
    if xsign is not None:
        m &= pos[:, 0] * xsign > 0.02
    if not np.any(m):
        return pos.mean(axis=0)
    return pos[m].mean(axis=0).astype(np.float32)


def percentile_pt(pos: np.ndarray, mask: np.ndarray, axis: int, q: float) -> np.ndarray:
    sl = pos[mask]
    if len(sl) == 0:
        return pos.mean(axis=0).astype(np.float32)
    order = np.argsort(sl[:, axis])
    idx = int(np.clip(round((len(sl) - 1) * q), 0, len(sl) - 1))
    return sl[order[idx]].astype(np.float32)


def fit_skeleton(pos: np.ndarray) -> list[Bone]:
    """Place Mixamo bones + bird extras from mesh occupancy.

    After the facing flip the mascot looks toward -Z (net), left is -X, tail is +Z.
    """
    ymin, ymax = float(pos[:, 1].min()), float(pos[:, 1].max())
    height = ymax - ymin
    bones: dict[str, Bone] = {}

    def add(name: str, parent: str | None, head, tail, radius: float, deform=True) -> Bone:
        b = Bone(name, parent, np.asarray(head, np.float32), np.asarray(tail, np.float32),
                 radius, deform)
        bones[name] = b
        if parent:
            bones[parent].children.append(name)
        return b

    # --- axial chain (torso sits over the feet, toward -Z) ---
    foot_l = slice_centroid(pos, y0=ymin, y1=ymin + 0.12 * height, xsign=-1, z1=0.02)
    foot_r = slice_centroid(pos, y0=ymin, y1=ymin + 0.12 * height, xsign=1, z1=0.02)
    hips_y = ymin + 0.26 * height
    hips = slice_centroid(pos, y0=hips_y - 0.03, y1=hips_y + 0.03, x0=-0.12, x1=0.12, z1=0.08)
    hips[0] = 0.0
    chest_y = ymin + 0.46 * height
    chest = slice_centroid(pos, y0=chest_y - 0.03, y1=chest_y + 0.03, x0=-0.14, x1=0.14, z1=0.05)
    chest[0] = 0.0
    neck_y = ymin + 0.66 * height
    neck = slice_centroid(pos, y0=neck_y - 0.03, y1=neck_y + 0.03, x0=-0.14, x1=0.14, z1=0.02)
    neck[0] = 0.0
    head_c = slice_centroid(pos, y0=ymin + 0.78 * height, y1=ymax, z1=0.05)
    head_top = percentile_pt(pos, pos[:, 1] > ymin + 0.90 * height, 1, 0.98)
    beak = percentile_pt(pos, (pos[:, 1] > ymin + 0.78 * height) & (pos[:, 2] < 0), 2, 0.02)

    spine = lerp_v(hips, chest, 0.38)
    spine1 = lerp_v(hips, chest, 0.72)
    spine2 = chest.copy()

    add("mixamorig:Hips", None, hips, spine, 0.06)
    add("mixamorig:Spine", "mixamorig:Hips", spine, spine1, 0.07)
    add("mixamorig:Spine1", "mixamorig:Spine", spine1, spine2, 0.07)
    add("mixamorig:Spine2", "mixamorig:Spine1", spine2, neck, 0.06)
    add("mixamorig:Neck", "mixamorig:Spine2", neck, lerp_v(neck, head_c, 0.55), 0.05)
    add("mixamorig:Head", "mixamorig:Neck", lerp_v(neck, head_c, 0.55), head_c, 0.07)
    add("mixamorig:HeadTop_End", "mixamorig:Head", head_c, head_top, 0.03, deform=False)
    add("mixamorig:Head_Beak", "mixamorig:Head", head_c, beak, 0.025)

    crest_base = v3(head_c[0], min(head_top[1] - 0.02, head_c[1] + 0.04), head_c[2])
    crest_tip = v3(head_top[0], head_top[1], head_top[2] - 0.01)
    add("mixamorig:Head_Crest1", "mixamorig:Head", crest_base, lerp_v(crest_base, crest_tip, 0.55), 0.02)
    add("mixamorig:Head_Crest2", "mixamorig:Head_Crest1", lerp_v(crest_base, crest_tip, 0.55), crest_tip, 0.016)

    eye_y = head_c[1] + 0.01
    eye_z = head_c[2] - 0.08
    add("mixamorig:LeftEye", "mixamorig:Head", v3(-0.07, eye_y, eye_z), v3(-0.07, eye_y, eye_z - 0.03), 0.018)
    add("mixamorig:RightEye", "mixamorig:Head", v3(0.07, eye_y, eye_z), v3(0.07, eye_y, eye_z - 0.03), 0.018)

    # --- legs ---
    for side, foot in ((-1, foot_l), (1, foot_r)):
        tag = "Left" if side < 0 else "Right"
        hip_s = v3(side * 0.09, hips[1] - 0.01, hips[2] - 0.01)
        ankle = v3(foot[0], ymin + 0.045 * height, foot[2])
        knee = lerp_v(hip_s, ankle, 0.48)
        knee[2] -= 0.02  # slight forward knee (toward -Z)
        toe_mask = (
            (pos[:, 1] < ymin + 0.09 * height)
            & (pos[:, 0] * side > 0.03)
            & (pos[:, 2] < 0.0)
        )
        toe = percentile_pt(pos, toe_mask, 2, 0.05) if np.any(toe_mask) else v3(ankle[0], ankle[1], ankle[2] - 0.08)
        toe[1] = ymin + 0.018 * height
        add(f"mixamorig:{tag}UpLeg", "mixamorig:Hips", hip_s, knee, 0.05)
        add(f"mixamorig:{tag}Leg", f"mixamorig:{tag}UpLeg", knee, ankle, 0.042)
        add(f"mixamorig:{tag}Foot", f"mixamorig:{tag}Leg", ankle, toe, 0.032)
        add(f"mixamorig:{tag}ToeBase", f"mixamorig:{tag}Foot", toe, v3(toe[0], toe[1], toe[2] - 0.035), 0.02)
        for label, dx in (("Inner", -0.03 * side), ("Mid", 0.0), ("Outer", 0.03 * side)):
            t_head = v3(toe[0] + dx * 0.4, toe[1], toe[2] - 0.008)
            t_tail = v3(toe[0] + dx, toe[1], toe[2] - 0.045)
            add(f"mixamorig:{tag}Toe_{label}", f"mixamorig:{tag}ToeBase", t_head, t_tail, 0.011)

    # --- arms / wings + Mixamo fingers along the feather fan ---
    for side in (-1, 1):
        tag = "Left" if side < 0 else "Right"
        wing_mask = (
            (pos[:, 0] * side > 0.22)
            & (pos[:, 1] > 0.35)
            & (pos[:, 1] < 0.54)
            & (pos[:, 2] < 0.05)
        )
        wing = pos[wing_mask]
        if len(wing) < 30:
            wing = pos[(pos[:, 0] * side > 0.18) & (pos[:, 1] > 0.34) & (pos[:, 1] < 0.55)]
        w_y = float(np.median(wing[:, 1]))
        w_z = float(np.median(wing[:, 2]))
        w_z0, w_z1 = float(np.percentile(wing[:, 2], 8)), float(np.percentile(wing[:, 2], 92))
        w_y0, w_y1 = float(np.percentile(wing[:, 1], 12)), float(np.percentile(wing[:, 1], 88))
        w_x_ext = float(wing[:, 0].max()) if side > 0 else float(wing[:, 0].min())
        shoulder = v3(side * 0.13, chest[1] + 0.015, chest[2])
        elbow = v3(side * 0.27, w_y, w_z)
        wrist = v3(side * 0.37, w_y, w_z)
        hand = v3(w_x_ext * 0.90, w_y, w_z)
        add(f"mixamorig:{tag}Shoulder", "mixamorig:Spine2", shoulder, lerp_v(shoulder, elbow, 0.35), 0.038)
        add(f"mixamorig:{tag}Arm", f"mixamorig:{tag}Shoulder", lerp_v(shoulder, elbow, 0.35), elbow, 0.036)
        add(f"mixamorig:{tag}ForeArm", f"mixamorig:{tag}Arm", elbow, wrist, 0.03)
        add(f"mixamorig:{tag}Hand", f"mixamorig:{tag}ForeArm", wrist, hand, 0.026)

        fingers = ("Thumb", "Index", "Middle", "Ring", "Pinky")
        z_samples = np.linspace(w_z1, w_z0, 5)  # thumb more forward (-Z)
        y_samples = np.linspace(w_y0, w_y1, 5)
        for i, fname in enumerate(fingers):
            tip = v3(w_x_ext, y_samples[i], z_samples[i])
            p0 = lerp_v(hand, tip, 0.12)
            p1 = lerp_v(hand, tip, 0.45)
            p2 = lerp_v(hand, tip, 0.72)
            rad = 0.013 if fname != "Thumb" else 0.014
            add(f"mixamorig:{tag}Hand{fname}1", f"mixamorig:{tag}Hand", p0, p1, rad)
            add(f"mixamorig:{tag}Hand{fname}2", f"mixamorig:{tag}Hand{fname}1", p1, p2, rad * 0.9)
            add(f"mixamorig:{tag}Hand{fname}3", f"mixamorig:{tag}Hand{fname}2", p2, tip, rad * 0.8)

    # --- tail (+Z after the facing flip) ---
    tail_pts = []
    for z0, z1 in [(0.04, 0.12), (0.12, 0.22), (0.22, 0.32), (0.32, 0.42)]:
        sl = pos[(pos[:, 2] >= z0) & (pos[:, 2] < z1) & (pos[:, 1] < hips[1] + 0.15)]
        if len(sl) > 8:
            tail_pts.append(sl.mean(axis=0).astype(np.float32))
    if not tail_pts:
        tail_pts = [v3(0, hips[1] - 0.04, 0.12), v3(0.04, 0.18, 0.28)]
    tail_root = v3(hips[0], hips[1] - 0.02, hips[2] + 0.05)
    chain = [tail_root] + tail_pts
    parent = "mixamorig:Hips"
    names = ["mixamorig:Tail", "mixamorig:Tail1", "mixamorig:Tail2", "mixamorig:Tail3"]
    for i, name in enumerate(names):
        a = chain[min(i, len(chain) - 1)]
        b = chain[min(i + 1, len(chain) - 1)]
        if np.linalg.norm(b - a) < 1e-4:
            b = a + v3(0.0, 0.0, 0.06)
        add(name, parent, a, b, 0.048 - i * 0.005)
        parent = name
    tip = chain[-1]
    for label, dx in (("L", -0.05), ("M", 0.0), ("R", 0.06)):
        add(f"mixamorig:TailFeather_{label}", "mixamorig:Tail3",
            tip, v3(tip[0] + dx, tip[1] + 0.015, tip[2] + 0.05), 0.016)

    return list(bones.values())


def fit_skeleton_otter(pos: np.ndarray) -> list[Bone]:
    """Same Mixamo + extra bone set as the bird, fitted to the cartoon otter mesh.

    After the facing flip the otter looks toward -Z (net), left is -X, tail is +Z.
    """
    ymin, ymax = float(pos[:, 1].min()), float(pos[:, 1].max())
    height = ymax - ymin
    bones: dict[str, Bone] = {}

    def add(name: str, parent: str | None, head, tail, radius: float, deform=True) -> Bone:
        b = Bone(name, parent, np.asarray(head, np.float32), np.asarray(tail, np.float32),
                 radius, deform)
        bones[name] = b
        if parent:
            bones[parent].children.append(name)
        return b

    # Short legs, heavy torso, oversized head — percentages from mesh occupancy.
    foot_l = slice_centroid(pos, y0=ymin, y1=ymin + 0.14 * height, xsign=-1, z1=0.05)
    foot_r = slice_centroid(pos, y0=ymin, y1=ymin + 0.14 * height, xsign=1, z1=0.05)
    hips_y = ymin + 0.22 * height
    hips = slice_centroid(pos, y0=hips_y - 0.03, y1=hips_y + 0.03, x0=-0.14, x1=0.14, z1=0.10)
    hips[0] = 0.0
    chest_y = ymin + 0.40 * height
    chest = slice_centroid(pos, y0=chest_y - 0.03, y1=chest_y + 0.03, x0=-0.16, x1=0.16, z1=0.08)
    chest[0] = 0.0
    neck_y = ymin + 0.62 * height
    neck = slice_centroid(pos, y0=neck_y - 0.03, y1=neck_y + 0.03, x0=-0.16, x1=0.16, z1=0.06)
    neck[0] = 0.0
    head_c = slice_centroid(pos, y0=ymin + 0.74 * height, y1=ymax, z1=0.08)
    head_top = percentile_pt(pos, pos[:, 1] > ymin + 0.90 * height, 1, 0.98)
    snout = percentile_pt(pos, (pos[:, 1] > ymin + 0.72 * height) & (pos[:, 2] < 0), 2, 0.02)

    spine = lerp_v(hips, chest, 0.38)
    spine1 = lerp_v(hips, chest, 0.72)
    spine2 = chest.copy()

    add("mixamorig:Hips", None, hips, spine, 0.075)
    add("mixamorig:Spine", "mixamorig:Hips", spine, spine1, 0.08)
    add("mixamorig:Spine1", "mixamorig:Spine", spine1, spine2, 0.08)
    add("mixamorig:Spine2", "mixamorig:Spine1", spine2, neck, 0.07)
    add("mixamorig:Neck", "mixamorig:Spine2", neck, lerp_v(neck, head_c, 0.55), 0.055)
    add("mixamorig:Head", "mixamorig:Neck", lerp_v(neck, head_c, 0.55), head_c, 0.09)
    add("mixamorig:HeadTop_End", "mixamorig:Head", head_c, head_top, 0.03, deform=False)
    add("mixamorig:Head_Beak", "mixamorig:Head", head_c, snout, 0.03)

    crest_base = v3(head_c[0], min(head_top[1] - 0.02, head_c[1] + 0.04), head_c[2])
    crest_tip = v3(head_top[0], head_top[1], head_top[2] - 0.01)
    add("mixamorig:Head_Crest1", "mixamorig:Head", crest_base, lerp_v(crest_base, crest_tip, 0.55), 0.02)
    add("mixamorig:Head_Crest2", "mixamorig:Head_Crest1", lerp_v(crest_base, crest_tip, 0.55), crest_tip, 0.016)

    eye_y = head_c[1] + 0.01
    eye_z = head_c[2] - 0.09
    add("mixamorig:LeftEye", "mixamorig:Head", v3(-0.08, eye_y, eye_z), v3(-0.08, eye_y, eye_z - 0.03), 0.02)
    add("mixamorig:RightEye", "mixamorig:Head", v3(0.08, eye_y, eye_z), v3(0.08, eye_y, eye_z - 0.03), 0.02)

    for side, foot in ((-1, foot_l), (1, foot_r)):
        tag = "Left" if side < 0 else "Right"
        hip_s = v3(side * 0.11, hips[1] - 0.01, hips[2] - 0.01)
        ankle = v3(foot[0], ymin + 0.05 * height, foot[2])
        knee = lerp_v(hip_s, ankle, 0.50)
        knee[2] -= 0.015
        toe_mask = (
            (pos[:, 1] < ymin + 0.10 * height)
            & (pos[:, 0] * side > 0.03)
            & (pos[:, 2] < 0.08)
        )
        toe = percentile_pt(pos, toe_mask, 2, 0.08) if np.any(toe_mask) else v3(ankle[0], ankle[1], ankle[2] - 0.07)
        toe[1] = ymin + 0.018 * height
        add(f"mixamorig:{tag}UpLeg", "mixamorig:Hips", hip_s, knee, 0.055)
        add(f"mixamorig:{tag}Leg", f"mixamorig:{tag}UpLeg", knee, ankle, 0.045)
        add(f"mixamorig:{tag}Foot", f"mixamorig:{tag}Leg", ankle, toe, 0.034)
        add(f"mixamorig:{tag}ToeBase", f"mixamorig:{tag}Foot", toe, v3(toe[0], toe[1], toe[2] - 0.03), 0.02)
        for label, dx in (("Inner", -0.028 * side), ("Mid", 0.0), ("Outer", 0.028 * side)):
            t_head = v3(toe[0] + dx * 0.4, toe[1], toe[2] - 0.006)
            t_tail = v3(toe[0] + dx, toe[1], toe[2] - 0.038)
            add(f"mixamorig:{tag}Toe_{label}", f"mixamorig:{tag}ToeBase", t_head, t_tail, 0.012)

    for side in (-1, 1):
        tag = "Left" if side < 0 else "Right"
        arm_mask = (
            (pos[:, 0] * side > 0.16)
            & (pos[:, 1] > 0.24)
            & (pos[:, 1] < 0.52)
        )
        arm = pos[arm_mask]
        if len(arm) < 30:
            arm = pos[(pos[:, 0] * side > 0.12) & (pos[:, 1] > 0.22) & (pos[:, 1] < 0.55)]
        w_y = float(np.median(arm[:, 1]))
        w_z = float(np.median(arm[:, 2]))
        w_z0, w_z1 = float(np.percentile(arm[:, 2], 12)), float(np.percentile(arm[:, 2], 88))
        w_y0, w_y1 = float(np.percentile(arm[:, 1], 18)), float(np.percentile(arm[:, 1], 82))
        w_x_ext = float(arm[:, 0].max()) if side > 0 else float(arm[:, 0].min())
        paw = v3(w_x_ext, w_y, w_z)
        # Prefer the true lateral extremity so the racket hand sits in the paw, not the elbow.
        tip_mask = (pos[:, 0] * side > abs(w_x_ext) * 0.82) & (pos[:, 1] > 0.24) & (pos[:, 1] < 0.52)
        if np.any(tip_mask):
            paw = pos[tip_mask].mean(axis=0).astype(np.float32)
        shoulder = v3(side * 0.15, chest[1] + 0.02, chest[2])
        elbow = lerp_v(shoulder, paw, 0.42)
        wrist = lerp_v(shoulder, paw, 0.72)
        hand = lerp_v(shoulder, paw, 0.88)
        add(f"mixamorig:{tag}Shoulder", "mixamorig:Spine2", shoulder, lerp_v(shoulder, elbow, 0.35), 0.042)
        add(f"mixamorig:{tag}Arm", f"mixamorig:{tag}Shoulder", lerp_v(shoulder, elbow, 0.35), elbow, 0.038)
        add(f"mixamorig:{tag}ForeArm", f"mixamorig:{tag}Arm", elbow, wrist, 0.032)
        add(f"mixamorig:{tag}Hand", f"mixamorig:{tag}ForeArm", wrist, hand, 0.028)

        fingers = ("Thumb", "Index", "Middle", "Ring", "Pinky")
        # Compact paw, not a wing fan: small spread around the paw tip, thumb more forward (-Z).
        z_samples = np.linspace(w_z1, w_z0, 5)
        y_samples = np.linspace(w_y0, w_y1, 5)
        for i, fname in enumerate(fingers):
            tip = v3(w_x_ext, float(lerp(y_samples[i], paw[1], 0.55)), float(lerp(z_samples[i], paw[2], 0.45)))
            p0 = lerp_v(hand, tip, 0.10)
            p1 = lerp_v(hand, tip, 0.42)
            p2 = lerp_v(hand, tip, 0.72)
            rad = 0.012 if fname != "Thumb" else 0.013
            add(f"mixamorig:{tag}Hand{fname}1", f"mixamorig:{tag}Hand", p0, p1, rad)
            add(f"mixamorig:{tag}Hand{fname}2", f"mixamorig:{tag}Hand{fname}1", p1, p2, rad * 0.9)
            add(f"mixamorig:{tag}Hand{fname}3", f"mixamorig:{tag}Hand{fname}2", p2, tip, rad * 0.8)

    tail_pts = []
    for z0, z1 in [(0.04, 0.12), (0.12, 0.20), (0.20, 0.30), (0.30, 0.42)]:
        sl = pos[(pos[:, 2] >= z0) & (pos[:, 2] < z1) & (pos[:, 1] < hips[1] + 0.18)]
        if len(sl) > 8:
            tail_pts.append(sl.mean(axis=0).astype(np.float32))
    if not tail_pts:
        tail_pts = [v3(0, hips[1] - 0.06, 0.10), v3(0.02, 0.08, 0.28)]
    tail_root = v3(hips[0], hips[1] - 0.03, hips[2] + 0.04)
    chain = [tail_root] + tail_pts
    parent = "mixamorig:Hips"
    names = ["mixamorig:Tail", "mixamorig:Tail1", "mixamorig:Tail2", "mixamorig:Tail3"]
    for i, name in enumerate(names):
        a = chain[min(i, len(chain) - 1)]
        b = chain[min(i + 1, len(chain) - 1)]
        if np.linalg.norm(b - a) < 1e-4:
            b = a + v3(0.0, -0.01, 0.06)
        add(name, parent, a, b, 0.05 - i * 0.005)
        parent = name
    tip = chain[-1]
    for label, dx in (("L", -0.04), ("M", 0.0), ("R", 0.045)):
        add(f"mixamorig:TailFeather_{label}", "mixamorig:Tail3",
            tip, v3(tip[0] + dx, tip[1] + 0.01, tip[2] + 0.04), 0.016)

    return list(bones.values())


def lerp(a: float, b: float, t: float) -> float:
    return a * (1.0 - t) + b * t


def bone_index(bones: list[Bone]) -> dict[str, int]:
    return {b.name: i for i, b in enumerate(bones)}


# ---------------------------------------------------------------------------
# Volumetric geodesic skinning
# ---------------------------------------------------------------------------

def voxelize(pos: np.ndarray, idx: np.ndarray, origin: np.ndarray, voxel: float,
             shape: tuple[int, int, int]) -> np.ndarray:
    occ = np.zeros(shape, dtype=np.uint8)
    nx, ny, nz = shape
    # splat vertices
    gi = np.floor((pos - origin) / voxel).astype(np.int32)
    gi[:, 0] = np.clip(gi[:, 0], 0, nx - 1)
    gi[:, 1] = np.clip(gi[:, 1], 0, ny - 1)
    gi[:, 2] = np.clip(gi[:, 2], 0, nz - 1)
    occ[gi[:, 0], gi[:, 1], gi[:, 2]] = 1
    # sample triangle edges so thin wings stay solid
    tris = pos[idx]
    for t in (0.25, 0.5, 0.75):
        for a, b in ((0, 1), (1, 2), (2, 0)):
            pts = tris[:, a] * (1 - t) + tris[:, b] * t
            g = np.floor((pts - origin) / voxel).astype(np.int32)
            g[:, 0] = np.clip(g[:, 0], 0, nx - 1)
            g[:, 1] = np.clip(g[:, 1], 0, ny - 1)
            g[:, 2] = np.clip(g[:, 2], 0, nz - 1)
            occ[g[:, 0], g[:, 1], g[:, 2]] = 1
    # dilate twice so heat can travel inside the volume
    occ = _dilate(occ)
    occ = _dilate(occ)
    return occ


def _dilate(occ: np.ndarray) -> np.ndarray:
    out = occ.copy()
    out[1:, :, :] |= occ[:-1, :, :]
    out[:-1, :, :] |= occ[1:, :, :]
    out[:, 1:, :] |= occ[:, :-1, :]
    out[:, :-1, :] |= occ[:, 1:, :]
    out[:, :, 1:] |= occ[:, :, :-1]
    out[:, :, :-1] |= occ[:, :, 1:]
    return out


def _paint_capsule(occ: np.ndarray, origin: np.ndarray, voxel: float,
                   a: np.ndarray, b: np.ndarray, radius: float) -> list[tuple[int, int, int]]:
    nx, ny, nz = occ.shape
    length = float(np.linalg.norm(b - a)) or 1e-6
    n_steps = max(3, int(math.ceil(length / (voxel * 0.6))))
    r_vox = max(1, int(math.ceil(radius / voxel)))
    seeds = []
    for t in np.linspace(0.0, 1.0, n_steps):
        p = a * (1 - t) + b * t
        c = np.floor((p - origin) / voxel).astype(int)
        for dx in range(-r_vox, r_vox + 1):
            for dy in range(-r_vox, r_vox + 1):
                for dz in range(-r_vox, r_vox + 1):
                    if dx * dx + dy * dy + dz * dz > r_vox * r_vox + 1:
                        continue
                    x, y, z = int(c[0] + dx), int(c[1] + dy), int(c[2] + dz)
                    if 0 <= x < nx and 0 <= y < ny and 0 <= z < nz and occ[x, y, z]:
                        seeds.append((x, y, z))
    return seeds


def geodesic_field(occ: np.ndarray, seeds: list[tuple[int, int, int]]) -> np.ndarray:
    """BFS distance through occupied voxels. Unreached cells stay +inf."""
    inf = np.int32(10_000)
    dist = np.full(occ.shape, inf, dtype=np.int32)
    q: deque[tuple[int, int, int]] = deque()
    seen = set()
    for s in seeds:
        if s not in seen:
            seen.add(s)
            dist[s] = 0
            q.append(s)
    nx, ny, nz = occ.shape
    while q:
        x, y, z = q.popleft()
        d = dist[x, y, z] + 1
        for nx_, ny_, nz_ in (
            (x - 1, y, z), (x + 1, y, z),
            (x, y - 1, z), (x, y + 1, z),
            (x, y, z - 1), (x, y, z + 1),
        ):
            if 0 <= nx_ < nx and 0 <= ny_ < ny and 0 <= nz_ < nz and occ[nx_, ny_, nz_]:
                if d < dist[nx_, ny_, nz_]:
                    dist[nx_, ny_, nz_] = d
                    q.append((nx_, ny_, nz_))
    return dist


def point_segment_dist(pts: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    ab = b - a
    denom = float(np.dot(ab, ab)) or 1e-8
    t = np.clip(((pts - a) @ ab) / denom, 0.0, 1.0)
    proj = a + t[:, None] * ab
    return np.linalg.norm(pts - proj, axis=1)


def compute_weights(pos: np.ndarray, idx: np.ndarray, bones: list[Bone],
                    *, limb_x: float = 0.30, head_y: float = 0.72,
                    tail_z: float = 0.04) -> tuple[np.ndarray, np.ndarray]:
    deform = [b for b in bones if b.deform]
    bb_min = pos.min(axis=0) - PAD
    bb_max = pos.max(axis=0) + PAD
    extent = bb_max - bb_min
    voxel = float(np.max(extent) / (GRID - 1))
    shape = tuple(int(math.ceil(e / voxel)) + 1 for e in extent)
    print(f"  voxel grid {shape}  voxel={voxel:.4f}  deform bones={len(deform)}")
    occ = voxelize(pos, idx, bb_min, voxel, shape)
    print(f"  occupied {int(occ.sum())}/{occ.size}")

    n = len(pos)
    gi = np.floor((pos - bb_min) / voxel).astype(np.int32)
    for c, lim in enumerate(shape):
        gi[:, c] = np.clip(gi[:, c], 0, lim - 1)

    # keep running top-k (distance-like cost; lower is better)
    top_cost = np.full((n, MAX_INFLUENCES), 1e8, dtype=np.float32)
    top_idx = np.full((n, MAX_INFLUENCES), -1, dtype=np.int32)

    def consider(bone_i: int, cost: np.ndarray) -> None:
        mask = cost < top_cost[:, -1]
        if not np.any(mask):
            return
        comb_cost = np.concatenate([top_cost[mask], cost[mask, None]], axis=1)
        comb_idx = np.concatenate(
            [top_idx[mask], np.full((int(mask.sum()), 1), bone_i, dtype=np.int32)],
            axis=1,
        )
        order = np.argsort(comb_cost, axis=1)[:, :MAX_INFLUENCES]
        rows = np.arange(comb_cost.shape[0])[:, None]
        top_cost[mask] = comb_cost[rows, order]
        top_idx[mask] = comb_idx[rows, order]

    name_to_i = bone_index(bones)
    for b in deform:
        seeds = _paint_capsule(occ, bb_min, voxel, b.head, b.tail, max(b.radius, voxel * 1.5))
        if not seeds:
            seeds = _paint_capsule(occ, bb_min, voxel, b.head, b.tail, max(b.radius * 3.0, voxel * 3.0))
        if not seeds:
            # snap the joint into the volume so tiny finger bones still bind
            gi_h = np.floor((b.head - bb_min) / voxel).astype(int)
            nx, ny, nz = occ.shape
            gi_h = np.clip(gi_h, 0, np.array(shape) - 1)
            occ_ijk = np.argwhere(occ)
            if len(occ_ijk):
                d = np.abs(occ_ijk - gi_h).sum(axis=1)
                seeds = [tuple(int(v) for v in occ_ijk[int(d.argmin())])]
        field = geodesic_field(occ, seeds)
        geo = field[gi[:, 0], gi[:, 1], gi[:, 2]].astype(np.float32) * voxel
        eucl = point_segment_dist(pos, b.head, b.tail)
        # combine: geodesic dominates (no through-air bleed), Euclidean fills holes
        unreachable = geo > 50.0
        geo = np.where(unreachable, eucl * 1.8 + 0.15, geo)
        sigma = max(b.radius * 2.4, voxel * 2.5)
        cost = geo / sigma + 0.35 * (eucl / (sigma * 1.6))
        # side isolation for limbs so left/right never share
        if "Left" in b.name and "Tail" not in b.name:
            cost = np.where(pos[:, 0] > 0.04, cost + 8.0, cost)
        if "Right" in b.name and "Tail" not in b.name:
            cost = np.where(pos[:, 0] < -0.04, cost + 8.0, cost)
        if b.name.startswith("mixamorig:Tail"):
            # Tail bones WIN on the rear (+Z) volume, lose on the body.
            cost = np.where(pos[:, 2] > tail_z, cost * 0.22, cost + 6.0)
        if b.name in ("mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2"):
            cost = np.where(pos[:, 2] > tail_z + 0.02, cost + 5.5, cost)
            cost = np.where(np.abs(pos[:, 0]) > limb_x, cost + 4.0, cost)
            cost = np.where(pos[:, 1] > head_y, cost + 3.5, cost)
        if "Hand" in b.name and b.name.split("Hand")[-1] != "":
            # Finger phalanges: strong near the feather, weak elsewhere
            cost = np.where(eucl < max(0.05, b.radius * 8.0), cost * 0.18, cost + 5.0)
        elif b.name.endswith("Hand"):
            cost = np.where(eucl < 0.08, cost * 0.55, cost)
        if "Toe_" in b.name or b.name.endswith("ToeBase"):
            cost = np.where(eucl < 0.06, cost * 0.2, cost + 3.0)
        if "Crest" in b.name or "Beak" in b.name:
            cost = np.where(eucl < 0.08, cost * 0.3, cost + 2.0)
        consider(name_to_i[b.name], cost)
        print(f"    {b.name:32s} seeds={len(seeds):4d} r={b.radius:.3f}")

    # convert cost -> heat weights
    heat = np.exp(-np.clip(top_cost, 0, 20))
    heat[top_idx < 0] = 0.0
    sums = heat.sum(axis=1, keepdims=True)
    empty = sums[:, 0] < 1e-8
    if np.any(empty):
        hips_i = name_to_i["mixamorig:Hips"]
        heat[empty, 0] = 1.0
        top_idx[empty, 0] = hips_i
        sums = heat.sum(axis=1, keepdims=True)
    heat = heat / np.clip(sums, 1e-8, None)
    joints = np.where(top_idx < 0, 0, top_idx).astype(np.uint16)
    return joints, heat.astype(np.float32)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------

def inverse_bind_matrices(bones: list[Bone]) -> np.ndarray:
    mats = np.zeros((len(bones), 16), dtype=np.float32)
    for i, b in enumerate(bones):
        x, y, z = b.head
        mats[i] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1]
    return mats


def local_translations(bones: list[Bone]) -> list[list[float]]:
    by_name = {b.name: b for b in bones}
    out = []
    for b in bones:
        if b.parent is None:
            t = b.head
        else:
            t = b.head - by_name[b.parent].head
        out.append([float(t[0]), float(t[1]), float(t[2])])
    return out


def build_rigged_glb(src: Path, dst: Path, bone_map: Path = BONE_MAP, profile: str = "bird") -> dict:
    doc, blob = load_glb(src)
    pos = accessor_numpy(doc, blob, 0).astype(np.float32).copy()
    nor = accessor_numpy(doc, blob, 1).astype(np.float32).copy()
    uv = accessor_numpy(doc, blob, 2).astype(np.float32).copy()
    idx = accessor_numpy(doc, blob, 3).astype(np.int32).copy()

    # Face the tennis court (-Z) while keeping anatomical left at -X.
    pos[:, 2] *= -1.0
    nor[:, 2] *= -1.0
    idx = idx.reshape(-1, 3)[:, [0, 2, 1]].reshape(-1)

    print(f"fitting skeleton ({profile})…")
    if profile == "otter":
        bones = fit_skeleton_otter(pos)
        weight_kw = {"limb_x": 0.20, "head_y": 0.70, "tail_z": 0.05}
    elif profile == "bird":
        bones = fit_skeleton(pos)
        weight_kw = {}
    else:
        raise ValueError(f"unknown rig profile {profile!r}")
    print(f"  {len(bones)} bones")
    for b in bones:
        print(f"    {b.name:32s} head={b.head}  len={b.length:.3f}")

    print("computing volumetric weights…")
    joints, weights = compute_weights(pos, idx.reshape(-1, 3), bones, **weight_kw)
    ibm = inverse_bind_matrices(bones)
    locals_ = local_translations(bones)

    # Rebuild binary: image (orig bv0) + mesh attrs + skin
    orig_views = doc["bufferViews"]
    image_view = orig_views[0]
    image_bytes = blob[image_view.get("byteOffset", 0):
                       image_view.get("byteOffset", 0) + image_view["byteLength"]]

    def pack(arr: np.ndarray) -> bytes:
        return np.ascontiguousarray(arr).tobytes()

    payloads = [image_bytes, pack(pos), pack(nor), pack(uv), pack(idx.astype(np.uint32)),
                pack(joints), pack(weights), pack(ibm)]
    off = 0
    views = []
    padded_chunks = []
    for i, payload in enumerate(payloads):
        padded = payload + b"\x00" * pad4(len(payload))
        padded_chunks.append(padded)
        target = None if i in (0, 7) else (34963 if i == 4 else 34962)
        v = {"buffer": 0, "byteOffset": off, "byteLength": len(payload)}
        if target is not None:
            v["target"] = target
        views.append(v)
        off += len(padded)
    blob_out = b"".join(padded_chunks)

    accessors = [
        {"bufferView": 1, "componentType": 5126, "count": len(pos), "type": "VEC3",
         "max": pos.max(0).tolist(), "min": pos.min(0).tolist()},
        {"bufferView": 2, "componentType": 5126, "count": len(nor), "type": "VEC3"},
        {"bufferView": 3, "componentType": 5126, "count": len(uv), "type": "VEC2"},
        {"bufferView": 4, "componentType": 5125, "count": len(idx), "type": "SCALAR",
         "max": [int(idx.max())], "min": [0]},
        {"bufferView": 5, "componentType": 5123, "count": len(joints), "type": "VEC4"},
        {"bufferView": 6, "componentType": 5126, "count": len(weights), "type": "VEC4"},
        {"bufferView": 7, "componentType": 5126, "count": len(bones), "type": "MAT4"},
    ]

    mesh_name = "MascotOtter" if profile == "otter" else "MascotBird"
    skin_name = "MascotOtterSkin" if profile == "otter" else "MascotBirdSkin"
    image_name = "otter_basecolor" if profile == "otter" else "mascot_basecolor"

    # Node 0 = Armature, 1 = mesh, 2.. = bones
    bone_nodes_start = 2
    nodes = [
        {"name": "Armature", "children": [1] + [bone_nodes_start]},
        {"name": mesh_name, "mesh": 0, "skin": 0},
    ]
    parent_idx = {b.name: bone_nodes_start + i for i, b in enumerate(bones)}
    for i, b in enumerate(bones):
        node = {
            "name": b.name,
            "translation": locals_[i],
        }
        child_ids = [parent_idx[c] for c in b.children]
        if child_ids:
            node["children"] = child_ids
        nodes.append(node)

    skins = [{
        "name": skin_name,
        "skeleton": bone_nodes_start,
        "joints": [bone_nodes_start + i for i in range(len(bones))],
        "inverseBindMatrices": 6,
    }]

    out_doc = {
        "asset": {"version": "2.0", "generator": "muse-tennis volumetric rigger"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": nodes,
        "meshes": [{
            "name": mesh_name + "Mesh",
            "primitives": [{
                "attributes": {
                    "POSITION": 0,
                    "NORMAL": 1,
                    "TEXCOORD_0": 2,
                    "JOINTS_0": 4,
                    "WEIGHTS_0": 5,
                },
                "indices": 3,
                "material": 0,
            }],
        }],
        "skins": skins,
        "materials": doc["materials"],
        "textures": doc.get("textures", []),
        "samplers": doc.get("samplers", []),
        "images": [{"name": image_name, "bufferView": 0, "mimeType": "image/jpeg"}],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(blob_out)}],
        "extensionsUsed": doc.get("extensionsUsed", []),
    }

    write_glb(dst, out_doc, blob_out)
    meta = {
        "bones": [
            {
                "name": b.name,
                "parent": b.parent,
                "head": b.head.tolist(),
                "tail": b.tail.tolist(),
                "radius": b.radius,
                "deform": b.deform,
            }
            for b in bones
        ],
        "vertexCount": int(len(pos)),
        "boneCount": len(bones),
        "maxInfluences": MAX_INFLUENCES,
        "method": "voxel-geodesic-heat",
        "profile": profile,
    }
    bone_map.write_text(json.dumps(meta, indent=2))
    print(f"wrote {dst} ({dst.stat().st_size} bytes), {len(bones)} bones")
    print(f"wrote {bone_map}")
    return meta


def main() -> int:
    argv = sys.argv[1:]
    profile = None
    positional: list[str] = []
    i = 0
    while i < len(argv):
        if argv[i] == "--profile":
            if i + 1 >= len(argv):
                raise SystemExit("missing value for --profile")
            profile = argv[i + 1]
            i += 2
            continue
        positional.append(argv[i])
        i += 1
    if profile is None:
        profile = "otter" if positional and "otter" in positional[0].lower() else "bird"
    src = Path(positional[0]) if len(positional) > 0 else (OTTER_SRC if profile == "otter" else SRC)
    dst = Path(positional[1]) if len(positional) > 1 else (OTTER_DST if profile == "otter" else DST)
    if len(positional) > 2:
        bone_map = Path(positional[2])
    elif profile == "otter":
        bone_map = OTTER_BONE_MAP
    else:
        bone_map = BONE_MAP
    build_rigged_glb(src, dst, bone_map, profile)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
