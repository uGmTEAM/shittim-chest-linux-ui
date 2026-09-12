"""Standalone Spine .skel -> .json converter (Spine 4.2/4.3)."""
import struct
import json
import math
import sys
from pathlib import Path

# ── Constants ──
ATTACHMENT_REGION = 0
ATTACHMENT_BOUNDINGBOX = 1
ATTACHMENT_MESH = 2
ATTACHMENT_LINKEDMESH = 3
ATTACHMENT_PATH = 4
ATTACHMENT_POINT = 5
ATTACHMENT_CLIPPING = 6
CURVE_LINEAR = 0
CURVE_STEPPED = 1
CURVE_BEZIER = 2
BONE_ROTATE = 0; BONE_TRANSLATE = 1; BONE_TRANSLATEX = 2; BONE_TRANSLATEY = 3
BONE_SCALE = 4; BONE_SCALEX = 5; BONE_SCALEY = 6
BONE_SHEAR = 7; BONE_SHEARX = 8; BONE_SHEARY = 9; BONE_INHERIT = 10
SLOT_ATTACHMENT = 0; SLOT_RGBA = 1; SLOT_RGB = 2; SLOT_RGBA2 = 3; SLOT_RGB2 = 4; SLOT_ALPHA = 5
PATH_POSITION = 0; PATH_SPACING = 1; PATH_MIX = 2
INHERIT_NAMES = ["normal", "onlyTranslation", "noRotationOrReflection", "noScale", "noScaleOrReflection"]
BLEND_MODE_NAMES = ["normal", "additive", "multiply", "screen"]

def rf(value, precision=5):
    if math.isnan(value) or math.isinf(value): return value
    r = round(value, precision)
    return int(r) if r == int(r) and abs(r) < 2**31 else r

def int32_to_hex(val):
    if val < 0: val += 0x100000000
    return f"{(val >> 24) & 0xFF:02x}{(val >> 16) & 0xFF:02x}{(val >> 8) & 0xFF:02x}{val & 0xFF:02x}"

class BinaryInput:
    def __init__(self, data):
        self.data = data; self.index = 0; self.strings = []
    def read_byte(self):
        v = self.data[self.index]; self.index += 1; return v
    def read_boolean(self):
        return self.read_byte() != 0
    def read_int32(self):
        v = struct.unpack_from(">i", self.data, self.index)[0]; self.index += 4; return v
    def read_float(self):
        v = struct.unpack_from(">f", self.data, self.index)[0]; self.index += 4; return v
    def read_varint(self, opt=True):
        b = self.read_byte(); v = b & 0x7F
        if b & 0x80:
            b = self.read_byte(); v |= (b & 0x7F) << 7
            if b & 0x80:
                b = self.read_byte(); v |= (b & 0x7F) << 14
                if b & 0x80:
                    b = self.read_byte(); v |= (b & 0x7F) << 21
                    if b & 0x80: v |= (self.read_byte() & 0x7F) << 28
        if not opt: v = (v >> 1) ^ -(v & 1)
        return v
    def read_string(self):
        n = self.read_varint(True)
        if n == 0: return None
        if n == 1: return ""
        n -= 1; raw = self.data[self.index:self.index+n]; self.index += n
        chars = []; i = 0
        while i < n:
            b = raw[i]
            if b & 0x80 == 0: chars.append(chr(b)); i += 1
            elif b >> 5 == 0b110:
                if i+1 < n: chars.append(chr(((b&0x1F)<<6)|(raw[i+1]&0x3F))); i += 2
                else: chars.append("?"); i += 1
            elif b >> 4 == 0b1110:
                if i+2 < n: chars.append(chr(((b&0x0F)<<12)|((raw[i+1]&0x3F)<<6)|(raw[i+2]&0x3F))); i += 3
                else: chars.append("?"); i += 1
            else: chars.append("?"); i += 1
        return "".join(chars)
    def read_string_ref(self):
        idx = self.read_varint(True); return None if idx == 0 else self.strings[idx-1]
    def read_color_int(self): return self.read_int32()

class Converter:
    def __init__(self):
        self.inp = None; self.bones = []; self.slots = []
        self.ik_constraints = []; self.transform_constraints = []; self.path_constraints = []
        self.physics_constraints = []; self.slider_constraints = []
        self.skins = []; self.events = []; self.version = ""; self.is_43 = False
    def convert(self, data):
        self.inp = BinaryInput(data); inp = self.inp; result = {}
        skeleton = {}
        low_hash = inp.read_int32(); high_hash = inp.read_int32()
        if high_hash != 0 or low_hash != 0:
            lh = low_hash if low_hash >= 0 else low_hash + 0x100000000
            hh = high_hash if high_hash >= 0 else high_hash + 0x100000000
            skeleton["hash"] = f"{hh:x}{lh:x}"
        version = inp.read_string()
        if version:
            skeleton["spine"] = version; self.version = version
            self.is_43 = version.startswith("4.3")
            if not (version.startswith("4.2") or version.startswith("4.3")):
                raise ValueError(f"Unsupported Spine version: {version}")
        skeleton["x"] = rf(inp.read_float()); skeleton["y"] = rf(inp.read_float())
        skeleton["width"] = rf(inp.read_float()); skeleton["height"] = rf(inp.read_float())
        skeleton["referenceScale"] = rf(inp.read_float())
        self.nonessential = inp.read_boolean()
        if self.nonessential:
            skeleton["fps"] = rf(inp.read_float())
            images_path = inp.read_string()
            if images_path: skeleton["images"] = images_path
            audio_path = inp.read_string()
            if audio_path: skeleton["audio"] = audio_path
        result["skeleton"] = skeleton
        n = inp.read_varint(True)
        for _ in range(n): inp.strings.append(inp.read_string() or "")
        if self.is_43: self._read_bones_43(result)
        else: self._read_bones(result)
        self._read_slots(result)
        if self.is_43: self._read_constraints_43(result)
        else:
            self._read_ik(result); self._read_transform(result)
            self._read_path(result); self._read_physics(result)
        self._read_skins(result); self._read_events(result); self._read_anims(result)
        return result
    def _read_bones(self, result):
        inp = self.inp; n = inp.read_varint(True); bones = []
        for i in range(n):
            bone = {"name": inp.read_string() or f"bone{i}"}
            if i > 0:
                pi = inp.read_varint(True)
                bone["parent"] = self.bones[pi]["name"] if pi < len(self.bones) else f"bone{pi}"
            rot = rf(inp.read_float()); x = rf(inp.read_float()); y = rf(inp.read_float())
            sx = rf(inp.read_float()); sy = rf(inp.read_float())
            shx = rf(inp.read_float()); shy = rf(inp.read_float()); length = rf(inp.read_float())
            inherit = inp.read_varint(True); skin_req = inp.read_boolean()
            if rot: bone["rotation"] = rot
            if x: bone['x'] = x
            if y: bone['y'] = y
            if sx != 1: bone['scaleX'] = sx
            if sy != 1: bone['scaleY'] = sy
            if shx: bone['shearX'] = shx
            if shy: bone['shearY'] = shy
            if length: bone["length"] = length
            if inherit and inherit < len(INHERIT_NAMES): bone["inherit"] = INHERIT_NAMES[inherit]
            if skin_req: bone["skin"] = True
            self.bones.append(bone); bones.append(bone)
        if bones: result["bones"] = bones
    def _read_bones_43(self, result):
        inp = self.inp; n = inp.read_varint(True); bones = []
        for i in range(n):
            bone = {"name": inp.read_string() or f"bone{i}"}
            if i > 0:
                pi = inp.read_varint(True)
                bone["parent"] = self.bones[pi]["name"] if pi < len(self.bones) else f"bone{pi}"
            rot = rf(inp.read_float()); x = rf(inp.read_float()); y = rf(inp.read_float())
            sx = rf(inp.read_float()); sy = rf(inp.read_float())
            shx = rf(inp.read_float()); shy = rf(inp.read_float())
            inherit = inp.read_byte(); length = rf(inp.read_float())
            skin_req = inp.read_boolean()
            if rot: bone["rotation"] = rot
            if x: bone['x'] = x
            if y: bone['y'] = y
            if sx != 1: bone['scaleX'] = sx
            if sy != 1: bone['scaleY'] = sy
            if shx: bone['shearX'] = shx
            if shy: bone['shearY'] = shy
            if length: bone["length"] = length
            if inherit and inherit < len(INHERIT_NAMES): bone["inherit"] = INHERIT_NAMES[inherit]
            if skin_req: bone["skin"] = True
            self.bones.append(bone); bones.append(bone)
        if bones: result["bones"] = bones
    def _read_slots(self, result):
        inp = self.inp; n = inp.read_varint(True); slots = []
        for i in range(n):
            slot = {"name": inp.read_string() or f"slot{i}"}
            bi = inp.read_varint(True); slot["bone"] = self.bones[bi]["name"] if bi < len(self.bones) else f"bone{bi}"
            color = inp.read_color_int(); dark = inp.read_color_int()
            attach = inp.read_string_ref(); blend = inp.read_varint(True)
            if color != -1 and int32_to_hex(color) != "ffffffff": slot["color"] = int32_to_hex(color)
            if dark != -1: slot["dark"] = int32_to_hex(dark)[:6]
            if attach: slot["attachment"] = attach
            if blend and blend < len(BLEND_MODE_NAMES): slot["blend"] = BLEND_MODE_NAMES[blend]
            slot["_idx"] = i
            self.slots.append(slot)
            slots.append({k:v for k,v in slot.items() if not k.startswith("_")})
        if slots: result["slots"] = slots
    def _read_ik(self, result):
        inp = self.inp; n = inp.read_varint(True); list_ = []
        for _ in range(n):
            name = inp.read_string() or ""
            ik = {"name": name, "order": inp.read_varint(True)}
            bc = inp.read_varint(True); ik["bones"] = [self.bones[inp.read_varint(True)]["name"] for _ in range(bc)]
            ti = inp.read_varint(True); ik["target"] = self.bones[ti]["name"] if ti < len(self.bones) else f"bone{ti}"
            flags = inp.read_byte()
            if flags & 1: ik["skin"] = True
            if not (flags & 2): ik["bendPositive"] = False
            list_.append(ik); self.ik_constraints.append(ik)
        if list_: result["ik"] = list_
    def _read_transform(self, result):
        inp = self.inp; n = inp.read_varint(True); list_ = []
        for _ in range(n):
            tc = {"name": inp.read_string() or "", "order": inp.read_varint(True)}
            bc = inp.read_varint(True); tc["bones"] = [self.bones[inp.read_varint(True)]["name"] for _ in range(bc)]
            ti = inp.read_varint(True); tc["target"] = self.bones[ti]["name"] if ti < len(self.bones) else f"bone{ti}"
            flags = inp.read_byte()
            if flags & 1: tc["skin"] = True
            if flags & 2: tc["local"] = True
            if flags & 4: tc["relative"] = True
            if flags & 8: tc["rotation"] = rf(inp.read_float())
            if flags & 16: tc["x"] = rf(inp.read_float())
            if flags & 32: tc["y"] = rf(inp.read_float())
            if flags & 64: tc["scaleX"] = rf(inp.read_float())
            if flags & 128: tc["scaleY"] = rf(inp.read_float())
            flags2 = inp.read_byte()
            if flags2 & 1: tc["shearY"] = rf(inp.read_float())
            if flags2 & 2: tc["mixRotate"] = rf(inp.read_float())
            if flags2 & 4: tc["mixX"] = rf(inp.read_float())
            if flags2 & 8: tc["mixY"] = rf(inp.read_float())
            if flags2 & 16: tc["mixScaleX"] = rf(inp.read_float())
            if flags2 & 32: tc["mixScaleY"] = rf(inp.read_float())
            if flags2 & 64: tc["mixShearY"] = rf(inp.read_float())
            self.transform_constraints.append(tc); list_.append(tc)
        if list_: result["transform"] = list_
    def _read_path(self, result):
        inp = self.inp; n = inp.read_varint(True); list_ = []
        for _ in range(n):
            pc = {"name": inp.read_string() or ""}
            bc = inp.read_varint(True); pc["bones"] = [self.bones[inp.read_varint(True)]["name"] for _ in range(bc)]
            ti = inp.read_varint(True); pc["target"] = self.bones[ti]["name"] if ti < len(self.bones) else f"bone{ti}"
            pc["spacingMode"] = inp.read_varint(True)
            if pc["spacingMode"] < len(["length","fixed","percent"]): pc["spacing"] = ["length","fixed","percent"][pc["spacingMode"]]
            else: pc["spacing"] = rf(inp.read_float())
            pc["mixPosition"] = rf(inp.read_float()); pc["mixStretch"] = rf(inp.read_float())
            self.path_constraints.append(pc); list_.append(pc)
        if list_: result["path"] = list_
    def _read_physics(self, result):
        inp = self.inp; n = inp.read_varint(True); list_ = []
        for _ in range(n):
            ph = {"name": inp.read_string() or "", "mode": inp.read_varint(True)}
            bc = inp.read_varint(True); ph["bones"] = [self.bones[inp.read_varint(True)]["name"] for _ in range(bc)]
            ti = inp.read_varint(True); ph["target"] = self.bones[ti]["name"] if ti < len(self.bones) else f"bone{ti}"
            ph["density"] = rf(inp.read_float()); ph["radius"] = rf(inp.read_float())
            ph["ignoresRotation"] = inp.read_boolean(); ph["gravityMode"] = inp.read_varint(True)
            if ph["gravityMode"] == 0: ph["gravityX"] = rf(inp.read_float()); ph["gravityY"] = rf(inp.read_float())
            ph["velocityThreshold"] = rf(inp.read_float()); ph["forceScale"] = rf(inp.read_float())
            ph["iterations"] = inp.read_varint(True); ph["wind"] = rf(inp.read_float())
            self.physics_constraints.append(ph); list_.append(ph)
        if list_: result["physics"] = list_
    def _read_constraints_43(self, result):
        inp = self.inp; n = inp.read_varint(True); seen = set()
        for _ in range(n):
            name = inp.read_string() or ""; ct = inp.read_byte()
            if ct == 0: self._read_ik(result); seen.add(name)
            elif ct == 2:
                tc = {"name": name, "order": inp.read_varint(True)}
                bc = inp.read_varint(True); tc["bones"] = [self.bones[inp.read_varint(True)]["name"] for _ in range(bc)]
                ti = inp.read_varint(True); tc["target"] = self.bones[ti]["name"] if ti < len(self.bones) else f"bone{ti}"
                flags = inp.read_byte()
                if flags & 1: tc["skin"] = True
                if flags & 2: tc["local"] = True
                if flags & 4: tc["relative"] = True
                if flags & 8: tc["rotation"] = rf(inp.read_float())
                if flags & 16: tc["x"] = rf(inp.read_float())
                if flags & 32: tc["y"] = rf(inp.read_float())
                if flags & 64: tc["scaleX"] = rf(inp.read_float())
                if flags & 128: tc["scaleY"] = rf(inp.read_float())
                flags2 = inp.read_byte()
                if flags2 & 1: tc["shearY"] = rf(inp.read_float())
                if flags2 & 2: tc["mixRotate"] = rf(inp.read_float())
                if flags2 & 4: tc["mixX"] = rf(inp.read_float())
                if flags2 & 8: tc["mixY"] = rf(inp.read_float())
                if flags2 & 16: tc["mixScaleX"] = rf(inp.read_float())
                if flags2 & 32: tc["mixScaleY"] = rf(inp.read_float())
                if flags2 & 64: tc["mixShearY"] = rf(inp.read_float())
                self.transform_constraints.append(tc)
                if name not in seen:
                    if "transform" not in result: result["transform"] = []
                    result["transform"].append(tc); seen.add(name)
            elif ct == 1:
                pc = {"name": name}
                bc = inp.read_varint(True); pc["bones"] = [self.bones[inp.read_varint(True)]["name"] for _ in range(bc)]
                ti = inp.read_varint(True); pc["target"] = self.bones[ti]["name"] if ti < len(self.bones) else f"bone{ti}"
                pc["spacingMode"] = inp.read_varint(True)
                if pc["spacingMode"] < 3: pc["spacing"] = ["length","fixed","percent"][pc["spacingMode"]]
                else: pc["spacing"] = rf(inp.read_float())
                pc["mixPosition"] = rf(inp.read_float()); pc["mixStretch"] = rf(inp.read_float())
                self.path_constraints.append(pc)
                if name not in seen:
                    if "path" not in result: result["path"] = []
                    result["path"].append(pc); seen.add(name)
            elif ct == 3:
                ph = {"name": name, "mode": inp.read_varint(True)}
                bc = inp.read_varint(True); ph["bones"] = [self.bones[inp.read_varint(True)]["name"] for _ in range(bc)]
                ti = inp.read_varint(True); ph["target"] = self.bones[ti]["name"] if ti < len(self.bones) else f"bone{ti}"
                ph["density"] = rf(inp.read_float()); ph["radius"] = rf(inp.read_float())
                ph["ignoresRotation"] = inp.read_boolean(); ph["gravityMode"] = inp.read_varint(True)
                if ph["gravityMode"] == 0: ph["gravityX"] = rf(inp.read_float()); ph["gravityY"] = rf(inp.read_float())
                ph["velocityThreshold"] = rf(inp.read_float()); ph["forceScale"] = rf(inp.read_float())
                ph["iterations"] = inp.read_varint(True); ph["wind"] = rf(inp.read_float())
                self.physics_constraints.append(ph)
                if name not in seen:
                    if "physics" not in result: result["physics"] = []
                    result["physics"].append(ph); seen.add(name)
    def _read_skins(self, result):
        inp = self.inp; n = inp.read_varint(True); skins = []
        for _ in range(n):
            skin = {"name": inp.read_string() or ""}; attachments = {}
            sn = inp.read_varint(True)
            for _ in range(sn):
                slot_name = inp.read_string_ref(); skn = inp.read_string_ref()
                an = inp.read_varint(True)
                for __ in range(an):
                    atype = inp.read_varint(True); name = inp.read_string_ref()
                    att = {"name": name}; region = None
                    if atype == ATTACHMENT_REGION:
                        path_name = inp.read_string_ref(); w = inp.read_float(); h = inp.read_float()
                        ox = inp.read_float(); oy = inp.read_float(); sx = inp.read_float(); sy = inp.read_float()
                        rot = inp.read_float(); count = inp.read_varint(True)
                        verts = [inp.read_float() for _ in range(count*2)]
                        tris = [inp.read_short() if False else inp.read_byte() for _ in range(count//3*3)]
                        if count % 3 != 0:
                            tris = []
                            for t in range(count//3): tris.append(inp.read_byte()); tris.append(inp.read_byte()); tris.append(inp.read_byte())
                        region = {"path": path_name, "width": rf(w), "height": rf(h), "x": rf(ox), "y": rf(oy), "scaleX": rf(sx), "scaleY": rf(sy), "rotation": rf(rot), "verts": verts, "tris": tris}
                    elif atype == ATTACHMENT_BOUNDINGBOX:
                        count = inp.read_varint(True); verts = [inp.read_float() for _ in range(count*2)]
                        region = {"verts": verts}
                    elif atype == ATTACHMENT_MESH:
                        path_name = inp.read_string_ref(); region_hull = inp.read_varint(True)
                        region_verts = [inp.read_float() for _ in range(inp.read_varint(True)*2)]
                        region_tris = [inp.read_short_val(inp) for _ in range(inp.read_varint(True))]
                        region_bones = [inp.read_varint(True) for _ in range(inp.read_varint(True))]
                        region_padr = [inp.read_varint(True) for _ in range(inp.read_varint(True))]
                        region = {"path": path_name, "hull": region_hull, "verts": region_verts, "tris": region_tris, "bones": region_bones}
                    elif atype == ATTACHMENT_LINKEDMESH:
                        parent = inp.read_string_ref(); region = {"path": inp.read_string_ref(), "parent": parent}
                    elif atype == ATTACHMENT_PATH:
                        count = inp.read_varint(True)
                        points = []; curves = []; lengths = []
                        for _ in range(count):
                            x = inp.read_float(); y = inp.read_float()
                            cx1 = inp.read_float(); cy1 = inp.read_float()
                            cx2 = inp.read_float(); cy2 = inp.read_float()
                            points.append([rf(x), rf(y)])
                            if cx1 or cy1 or cx2 or cy2: curves.append([rf(cx1), rf(cy1), rf(cx2), rf(cy2)])
                            else: curves.append(None)
                        if inp.read_boolean():
                            clen = inp.read_varint(True)
                            for _ in range(clen): lengths.append(rf(inp.read_float()))
                        region = {"points": points, "curves": curves, "lengths": lengths}
                    elif atype == ATTACHMENT_POINT:
                        region = {"x": rf(inp.read_float()), "y": rf(inp.read_float()), "rotation": rf(inp.read_float())}
                    elif atype == ATTACHMENT_CLIPPING:
                        region = {"end": inp.read_string_ref(), "cutouts": [inp.read_string_ref() for __ in range(inp.read_varint(True))]}
                    else:
                        # Handle unknown attachment type by reading raw data
                        pass
                    if region:
                        if skn not in attachments: attachments[skn] = {}
                        if name not in attachments[skn]: attachments[skn][name] = region
            skin["attachments"] = attachments; skins.append(skin); self.skins.append(skin)
        if skins: result["skins"] = skins
    def _read_events(self, result):
        inp = self.inp; n = inp.read_varint(True); events = []
        for _ in range(n):
            ev = {"name": inp.read_string() or ""}
            ev["intValue"] = inp.read_int32(); ev["floatValue"] = rf(inp.read_float())
            ev["stringValue"] = inp.read_string(); ev["audioPath"] = inp.read_string()
            if ev["audioPath"]:
                ev["volume"] = rf(inp.read_float()); ev["pitch"] = rf(inp.read_float())
                ev["pan"] = rf(inp.read_float())
            if self.nonessential:
                ev["skipDuplicates"] = inp.read_boolean()
            events.append(ev); self.events.append(ev)
        if events: result["events"] = events
    def _read_anims(self, result):
        inp = self.inp; n = inp.read_varint(True); anims = []
        for _ in range(n):
            anim = {"name": inp.read_string() or ""}
            track_len = inp.read_float(); anim["duration"] = rf(track_len)
            self._read_bone_timelines(anim, inp, track_len, "bones")
            self._read_slot_timelines(anim, inp, track_len, "slots")
            if self.is_43: self._read_constraint_timelines_43(anim, inp, track_len)
            else:
                self._read_ik_timelines(anim, inp, track_len)
                self._read_transform_timelines(anim, inp, track_len)
                self._read_path_timelines(anim, inp, track_len)
                self._read_physics_timelines(anim, inp, track_len)
            self._read_draw_order(anim, inp, track_len)
            self._read_event_timelines(anim, inp, track_len)
            anims.append(anim); result.setdefault("animations", []).append(anim)
    def _read_bone_timelines(self, anim, inp, track_len, key):
        n = inp.read_varint(True); timelines = []
        for _ in range(n):
            bi = inp.read_varint(True); bn = self.bones[bi]["name"] if bi < len(self.bones) else f"bone{bi}"
            tc = inp.read_varint(True)
            tl = {"bone": bn}; timeline_data = {}
            for __ in range(tc):
                tp = inp.read_varint(True); tlen = rf(inp.read_float())
                kc = inp.read_varint(True)
                if tp in (BONE_ROTATE, BONE_SHEAR, BONE_SHEARX, BONE_SHEARY):
                    keys = self._read_float_curve_keys(inp, kc, tlen)
                    tl.setdefault("rotate" if tp==BONE_ROTATE else "shear"+("X" if tp==BONE_SHEARX else "Y" if tp==BONE_SHEARY else ""), {"keys": keys})
                elif tp in (BONE_TRANSLATE, BONE_TRANSLATEX, BONE_TRANSLATEY):
                    ax = "x" if tp in (BONE_TRANSLATEX, BONE_TRANSLATE) else "y"
                    keys = self._read_float_curve_keys(inp, kc, tlen)
                    tl.setdefault("translate", {}).setdefault(ax, {"keys": keys})
                elif tp in (BONE_SCALE, BONE_SCALEX, BONE_SCALEY):
                    ax = "scaleX" if tp in (BONE_SCALEX, BONE_SCALE) else "scaleY"
                    keys = self._read_float_curve_keys(inp, kc, tlen)
                    tl.setdefault("scale", {}).setdefault(ax, {"keys": keys})
                elif tp == BONE_INHERIT:
                    tl["inherit"] = {"keys": [{"time": rf(inp.read_float()), "value": inp.read_varint(True)} for __ in range(kc)]}
            if tl: timelines.append(tl)
        if timelines: anim[key] = timelines
    def _read_slot_timelines(self, anim, inp, track_len, key):
        n = inp.read_varint(True); timelines = []
        for _ in range(n):
            si = inp.read_varint(True); sn = self.slots[si]["name"] if si < len(self.slots) else f"slot{si}"
            tc = inp.read_varint(True); tl = {"slot": sn}
            for __ in range(tc):
                tp = inp.read_varint(True); tlen = rf(inp.read_float()); kc = inp.read_varint(True)
                if tp == SLOT_ATTACHMENT:
                    tl["attachment"] = {"keys": [{"time": rf(inp.read_float()), "value": inp.read_string_ref()} for __ in range(kc)]}
                elif tp == SLOT_RGBA:
                    keys = self._read_rgba_curve_keys(inp, kc, tlen)
                    tl["color"] = {"keys": keys}
                elif tp == SLOT_RGB:
                    keys = self._read_rgb_curve_keys(inp, kc, tlen)
                    tl["color"] = {"keys": keys}
                elif tp == SLOT_RGBA2:
                    keys = self._read_rgba_curve_keys(inp, kc, tlen); tl["color"] = {"keys": keys}
                elif tp == SLOT_RGB2:
                    keys = self._read_rgb_curve_keys(inp, kc, tlen); tl["color"] = {"keys": keys}
                elif tp == SLOT_ALPHA:
                    keys = self._read_float_curve_keys(inp, kc, tlen)
                    tl["alpha"] = {"keys": keys}
            if tl: timelines.append(tl)
        if timelines: anim[key] = timelines
    def _read_float_curve_keys(self, inp, kc, tlen):
        keys = []
        for i in range(kc):
            t = rf(inp.read_float()); v = inp.read_float()
            c = CURVE_LINEAR
            if i < kc-1:
                linears = inp.read_byte()
                if linears & 1: c = CURVE_STEPPED
                elif linears & 2:
                    c = CURVE_BEZIER
                    inp.read_float(); inp.read_float(); inp.read_float(); inp.read_float()
            keys.append({"time": t, "value": rf(v), "curve": c})
        return keys
    def _read_rgba_curve_keys(self, inp, kc, tlen):
        keys = []
        for i in range(kc):
            t = rf(inp.read_float())
            r = inp.read_float(); g = inp.read_float(); b = inp.read_float(); a = inp.read_float()
            c = CURVE_LINEAR
            if i < kc-1:
                linears = inp.read_byte()
                if linears & 1: c = CURVE_STEPPED
                elif linears & 2:
                    c = CURVE_BEZIER
                    [inp.read_float() for _ in range(8)]
            keys.append({"time": t, "value": [rf(r), rf(g), rf(b), rf(a)], "curve": c})
        return keys
    def _read_rgb_curve_keys(self, inp, kc, tlen):
        keys = []
        for i in range(kc):
            t = rf(inp.read_float())
            r = inp.read_float(); g = inp.read_float(); b = inp.read_float()
            c = CURVE_LINEAR
            if i < kc-1:
                linears = inp.read_byte()
                if linears & 1: c = CURVE_STEPPED
                elif linears & 2:
                    c = CURVE_BEZIER
                    [inp.read_float() for _ in range(6)]
            keys.append({"time": t, "value": [rf(r), rf(g), rf(b)], "curve": c})
        return keys
    def _read_ik_timelines(self, anim, inp, track_len):
        n = inp.read_varint(True); timelines = []
        for _ in range(n):
            ii = inp.read_varint(True); ik = self.ik_constraints[ii] if ii < len(self.ik_constraints) else {"name": f"ik{ii}"}
            tl = {"ik": ik["name"]}; tc = inp.read_varint(True)
            for __ in range(tc):
                tp = inp.read_varint(True); tlen = rf(inp.read_float()); kc = inp.read_varint(True)
                if tp in (0,3,5):  # mix, bendPositive, skin
                    keys = self._read_float_curve_keys(inp, kc, tlen)
                    prop = {"mix":0,"bendPositive":3,"skin":5}[tp]
                    tl[prop] = {"keys": keys}
            if tl: timelines.append(tl)
        if timelines: anim.setdefault("ik", []).extend(timelines)
    def _read_transform_timelines(self, anim, inp, track_len):
        n = inp.read_varint(True); timelines = []
        for _ in range(n):
            ti = inp.read_varint(True); tc = self.transform_constraints[ti] if ti < len(self.transform_constraints) else {"name": f"tc{ti}"}
            tl = {"transform": tc["name"]}; tcount = inp.read_varint(True)
            for __ in range(tcount):
                tp = inp.read_varint(True); tlen = rf(inp.read_float()); kc = inp.read_varint(True)
                keys = self._read_float_curve_keys(inp, kc, tlen)
                props = {0:"mixRotate",1:"mixX",2:"mixY",3:"mixScaleX",4:"mixScaleY",5:"mixShearY"}
                if tp in props: tl[props[tp]] = {"keys": keys}
            if tl: timelines.append(tl)
        if timelines: anim.setdefault("transform", []).extend(timelines)
    def _read_path_timelines(self, anim, inp, track_len):
        n = inp.read_varint(True); timelines = []
        for _ in range(n):
            pi = inp.read_varint(True); pc = self.path_constraints[pi] if pi < len(self.path_constraints) else {"name": f"pc{pi}"}
            tl = {"path": pc["name"]}; tc = inp.read_varint(True)
            for __ in range(tc):
                tp = inp.read_varint(True); tlen = rf(inp.read_float()); kc = inp.read_varint(True)
                keys = self._read_float_curve_keys(inp, kc, tlen)
                props = {0:"mixPosition",1:"mixStretch"}
                if tp in props: tl[props[tp]] = {"keys": keys}
            if tl: timelines.append(tl)
        if timelines: anim.setdefault("path", []).extend(timelines)
    def _read_physics_timelines(self, anim, inp, track_len):
        n = inp.read_varint(True); timelines = []
        for _ in range(n):
            ppi = inp.read_varint(True); ph = self.physics_constraints[ppi] if ppi < len(self.physics_constraints) else {"name": f"ph{ppi}"}
            tl = {"physics": ph["name"]}; tc = inp.read_varint(True)
            for __ in range(tc):
                tp = inp.read_varint(True); tlen = rf(inp.read_float()); kc = inp.read_varint(True)
                keys = self._read_float_curve_keys(inp, kc, tlen)
                props = {0:"inertia",1:"strength",2:"damping",4:"mass",5:"wind",6:"gravity",7:"mix",8:"reset"}
                if tp in props: tl[props[tp]] = {"keys": keys}
            if tl: timelines.append(tl)
        if timelines: anim.setdefault("physics", []).extend(timelines)
    def _read_constraint_timelines_43(self, anim, inp, track_len):
        n = inp.read_varint(True); timelines = []
        for _ in range(n):
            ci = inp.read_varint(True); cname = ""
            if ci < len(self.ik_constraints): cname = self.ik_constraints[ci]["name"]; ctype = "ik"
            elif ci < len(self.ik_constraints)+len(self.transform_constraints):
                cname = self.transform_constraints[ci-len(self.ik_constraints)]["name"]; ctype = "transform"
            elif ci < len(self.ik_constraints)+len(self.transform_constraints)+len(self.path_constraints):
                idx = ci-len(self.ik_constraints)-len(self.transform_constraints)
                cname = self.path_constraints[idx]["name"]; ctype = "path"
            elif ci < len(self.ik_constraints)+len(self.transform_constraints)+len(self.path_constraints)+len(self.physics_constraints):
                idx = ci-len(self.ik_constraints)-len(self.transform_constraints)-len(self.path_constraints)
                cname = self.physics_constraints[idx]["name"]; ctype = "physics"
            else: ctype = "ik"; cname = f"c{ci}"
            tl = {ctype: cname}; tc = inp.read_varint(True)
            for __ in range(tc):
                tp = inp.read_varint(True); tlen = rf(inp.read_float()); kc = inp.read_varint(True)
                keys = self._read_float_curve_keys(inp, kc, tlen)
                tl["keys"] = keys
            if tl: timelines.append(tl)
        if timelines: anim["constraints"] = timelines
    def _read_draw_order(self, anim, inp, track_len):
        n = inp.read_varint(True)
        if n == 0: return
        slots_by_idx = {s["_idx"]: s for s in self.slots}
        changes = []
        for _ in range(n):
            t = rf(inp.read_float()); sc = inp.read_varint(True)
            new_order = [slots_by_idx[inp.read_varint(True)]["name"] for __ in range(sc)]
            changes.append({"time": t, "slots": new_order})
        anim["drawOrder"] = {"changes": changes}
    def _read_event_timelines(self, anim, inp, track_len):
        n = inp.read_varint(True)
        if n == 0: return
        events_list = []
        for _ in range(n):
            t = rf(inp.read_float()); ei = inp.read_varint(True)
            ev = self.events[ei] if ei < len(self.events) else {"name": f"ev{ei}"}
            events_list.append({"time": t, "event": ev["name"]})
        anim["events"] = {"changes": events_list}

# ── Main ──
resource_dir = Path(r"c:\Users\Administrator\Documents\trae_projects\new\ai-os\ui\ShittimChestUI\resources\spine")

def find_skel(d):
    result = []
    for e in d.iterdir():
        if e.is_dir(): result.extend(find_skel(e))
        elif e.suffix == ".skel": result.append(e)
    return result

skel_files = find_skel(resource_dir)
print(f"Found {len(skel_files)} .skel files:\n")

for skel_path in skel_files:
    base = skel_path.with_suffix("")
    json_out = base.with_suffix(".json")
    print(f"Converting {skel_path.relative_to(resource_dir.parent.parent)} ...")
    try:
        data = skel_path.read_bytes()
        conv = Converter()
        result = conv.convert(data)
        json_str = json.dumps(result, indent=2, ensure_ascii=False)
        json_out.write_text(json_str, encoding="utf8")
        anims = ", ".join(a["name"] for a in result.get("animations", []))
        print(f"  Animations: {anims}")
        print(f"  -> {json_out.name} ({len(json_str)//1024} KB)\n")
    except Exception as e:
        print(f"  ERROR: {e}\n")

print("Done.")
