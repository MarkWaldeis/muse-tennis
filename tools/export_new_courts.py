"""Build the two compact static court environments.

From the repo root: blender --background --python tools/export_new_courts.py
Court lines, net, playable surfaces and lighting belong to the game renderer.
"""
from collections import defaultdict
from math import cos, pi, sin
from pathlib import Path
from random import Random

import bpy


PALETTE = {
    "concrete": (0.24, 0.30, 0.34), "pale": (0.72, 0.76, 0.74),
    "metal": (0.045, 0.065, 0.084), "steel": (0.14, 0.23, 0.27),
    "teal": (0.018, 0.38, 0.44), "red": (0.53, 0.13, 0.09),
    "amber": (0.86, 0.43, 0.08), "glass": (0.055, 0.16, 0.22),
    "light": (0.56, 0.89, 1.0), "gold_light": (1.0, 0.61, 0.22),
    "stone": (0.23, 0.24, 0.22), "mortar": (0.36, 0.33, 0.28),
    "wood": (0.31, 0.14, 0.067), "cedar": (0.60, 0.32, 0.14),
    "snow": (0.78, 0.86, 0.92), "mountain": (0.30, 0.36, 0.42),
    "ice": (0.52, 0.64, 0.70), "scree": (0.37, 0.36, 0.33),
    "granite": (0.15, 0.22, 0.28), "forest": (0.045, 0.17, 0.115),
    "pine": (0.075, 0.25, 0.14), "fern": (0.17, 0.35, 0.14),
    "water": (0.022, 0.115, 0.17),
}


class Arena:
    def __init__(self, seed, palette=PALETTE):
        self.rng = Random(seed)
        self.palette = palette
        self.meshes = defaultdict(lambda: ([], []))

    def shape(self, mat, verts, faces):
        target, polygons = self.meshes[mat]
        offset = len(target)
        # Game coordinates are Y up. Blender's glTF exporter reverses this transform.
        target.extend((x, -z, y) for x, y, z in verts)
        polygons.extend(tuple(offset + i for i in face) for face in faces)

    def box(self, mat, x, y, z, w, h, d, angle=0):
        c, s = cos(angle), sin(angle)
        verts = [(x + u*c - v*s, y + q, z + u*s + v*c)
                 for q in (-h/2, h/2) for u, v in
                 ((-w/2, -d/2), (-w/2, d/2), (w/2, d/2), (w/2, -d/2))]
        self.shape(mat, verts, [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4),
                               (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])

    def frustum(self, mat, x, y, z, lower, upper, height, sides=8):
        angles = [-2*pi*i/sides for i in range(sides)]
        verts = [(x+r*cos(a), y+h, z+r*sin(a)) for r, h in
                 ((lower, 0), (upper, height)) for a in angles]
        faces = [tuple(reversed(range(sides))), tuple(range(sides, 2*sides))]
        faces += [(i, (i+1) % sides, (i+1) % sides+sides, i+sides) for i in range(sides)]
        self.shape(mat, verts, faces)

    def roof(self, x, y, z, w, h, d):
        for side in (-1, 1):
            for i in range(13):
                a, b = x-w/2 + w*i/13, x-w/2 + w*(i+1)/13
                edge = z + side*d/2
                quad = [(a, y, edge), (b, y, edge), (b, y+h, z), (a, y+h, z)]
                self.shape("wood" if i % 4 == 0 else "cedar", quad, [(0, 1, 2, 3) if side == 1 else (3, 2, 1, 0)])
        for edge in (x-w/2, x+w/2):
            self.shape("wood", [(edge, y, z-d/2), (edge, y+h, z), (edge, y, z+d/2)],
                       [(2, 1, 0) if edge > x else (0, 1, 2)])

    def stairs(self, x, z, w, d, rows):
        for i in range(rows):
            offset = i*d
            dist = z + offset if z > 0 else z - offset
            self.box("concrete", x, .27*(i+1), dist, w, .54*(i+1), d+.015)
            for seat in range(int(w/.62)):
                xp = x-w/2+.33+seat*.62
                mat = "steel" if self.rng.random() < .22 else "teal"
                self.box(mat, xp, .54*(i+1)+.12, dist, .48, .18, .41)
                self.box(mat, xp, .54*(i+1)+.34, dist+(.2 if z > 0 else -.2), .48, .45, .083)

    def lamps(self, x, z, low=False):
        height = 5.7 if low else 10.8
        self.box("concrete", x, .28, z, 1.22, .56, 1.22)
        self.frustum("steel", x, .55, z, .18, .10, height)
        for col in (-1, 0, 1):
            for row in (0, 1):
                px, py = x+.52*col, height+.28+.31*row
                self.box("metal", px, py, z, .49, .28, .3)
                self.box("gold_light" if low else "light", px, py, z+(.16 if z < 0 else -.16), .42, .21, .03)

    def bench(self, x, z):
        for dz in (-.65, .65):
            self.box("metal", x, .24, z+dz, .46, .48, .1)
        for n in range(5):
            self.box("cedar", x-.28+n*.14, .5, z, .12, .065, 1.8)
        for n in range(3):
            self.box("wood", x+.28, .72+n*.105, z, .07, .09, 1.8)

    def ship(self, x, z):
        hull = [(x+u, y, z+v) for y, width, length in
                ((-1.38, 2.3, 16.0), (-.16, 3.55, 18.0)) for u, v in
                ((-length/2, -width/2), (-length/2, width/2), (length*.28, width/2),
                 (length/2, 0), (length*.28, -width/2))]
        self.shape("metal", hull, [(5, 6, 7, 8, 9)] + [
            (i, (i+1) % 5, (i+1) % 5+5, i+5) for i in range(5)])
        self.box("cedar", x-1.7, -.1, z, 12, .13, 2.7)
        self.box("pale", x-4.6, .51, z, 4.1, 1.21, 2.25)
        self.box("glass", x-4.3, .9, z, 3.55, .31, 2.31)
        self.box("pale", x-4.45, 1.17, z, 4.46, .13, 2.71)
        self.frustum("steel", x-4.4, 1.2, z, .065, .034, 1.56, 6)
        self.box("gold_light", x-4.4, 2.74, z, .15, .15, .15)
        for n in range(8):
            px = x-5.7+n*1.55
            self.box("pale", px, .19, z-1.61, .05, .57, .05)
            self.box("pale", px, .19, z+1.61, .05, .57, .05)
        for side in (-1, 1):
            self.box("pale", x-.3, .47, z+side*1.61, 11.1, .035, .035)

    def ridge(self, x, z, width, height, index):
        count = 12
        radii = [self.rng.uniform(.75, 1.25) for _ in range(count)]
        snowline = [self.rng.uniform(.52, .78) for _ in range(count)]
        turn = self.rng.random() * pi
        lean = self.rng.uniform(-.23, .23) * width
        rings = []
        for layer, (scale, elevation) in enumerate(((1, .02), (.77, .32), (.43, .61), (.21, .84), (.061, .97))):
            loop = []
            for i in range(count):
                angle = turn + i * 2*pi/count
                extension = radii[i] * scale * width
                px = x + cos(angle)*extension + lean*layer/4
                pz = z + sin(angle)*extension * .68 + layer*.47
                py = height * (elevation + self.rng.uniform(-.075, .075) * (layer > 0))
                loop.append((px, py, pz))
            rings.append(loop)
        for layer in range(4):
            for i in range(count):
                end = (i+1) % count
                lower, upper = rings[layer], rings[layer+1]
                top = layer == 3 or layer == 2 and snowline[i] < .67
                stone = ("granite", "mountain", "scree")[(i + layer + index) % 3]
                material = "ice" if (i+index) % 3 == 0 else "snow"
                self.shape(material if top else stone,
                           [lower[i], lower[end], upper[end], upper[i]], [(3, 2, 1, 0)])
        self.shape("snow", rings[-1], [tuple(reversed(range(count)))])

    def export(self, filename):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        for name, (verts, faces) in self.meshes.items():
            mesh = bpy.data.meshes.new(name)
            mesh.from_pydata(verts, [], faces)
            mesh.update()
            obj = bpy.data.objects.new(name, mesh)
            bpy.context.collection.objects.link(obj)
            mat = bpy.data.materials.new(name)
            mat.use_nodes = True
            shader = mat.node_tree.nodes.get("Principled BSDF")
            color = (*self.palette[name], 1)
            shader.inputs["Base Color"].default_value = color
            shader.inputs["Roughness"].default_value = .35 if name in ("metal", "glass", "water") else .86
            if name.endswith("light"):
                shader.inputs["Emission Color"].default_value = color
                shader.inputs["Emission Strength"].default_value = .85
            mesh.materials.append(mat)
        output = Path(__file__).resolve().parents[1] / "assets" / filename
        bpy.ops.export_scene.gltf(filepath=str(output), export_format="GLB", export_yup=True)


def harbor():
    a = Arena(7235)
    a.box("water", 0, -1.31, -18, 420, .32, 440)
    a.box("concrete", 0, -.64, 0, 48, 1.25, 64)
    for x in (-20, 20):
        for z in range(-29, 30, 3):
            a.box("steel", x, .06, z, 1.3, .13, 2.8)
            a.frustum("metal", x, .12, z, .13, .13, .56)
            a.frustum("amber", x, .66, z, .22, .16, .15)
        for z in (-20, 20):
            a.lamps(x*.78, z)
        for z in (-7, 7):
            a.bench(x*.42, z)
    for z in (-20.6, 20.6):
        a.stairs(0, z, 23, 1.08, 6)
        rail = z + (5.75 if z > 0 else -5.75)
        for x in range(-11, 12):
            a.box("steel", x, 3.81, rail, .052, .91, .061)
        a.box("steel", 0, 4.25, rail, 23, .077, .086)
        a.box("light", 0, 3.46, rail, 22.9, .032, .045)
        for x in (-12.2, 12.2):
            a.box("steel", x, .68, z*.92, 3.9, 1.36, .37)
            a.box("teal", x, .68, z*.905, 3.67, 1.12, .05)
    for side in (-1, 1):
        x = side*15
        a.box("steel", x, 1.65, -26, 9, 3.3, 5)
        a.box("metal", x, 3.45, -25.3, 10, .35, 6.7)
        a.box("teal", x, 3.72, -22.8, 10, .18, .23)
        for window in range(8):
            px = x-4.1+window*1.17
            a.box("glass", px, 1.85, -23.46, 1.02, 1.7, .06)
            a.box("gold_light", px, 2.57, -23.39, .84, .065, .07)
        for row in range(3):
            for col in range(4-row):
                px, pz = side*(19+3.2*col)+row*.6, -32-row*2.76
                mat = a.rng.choice(("red", "steel", "teal", "amber"))
                a.box(mat, px, 1+row*1.78, pz, 3, 1.77, 5.9)
                for j in range(12):
                    a.box(mat, px-1.49, .83+row*1.78, pz-2.69+j*.49, .08, 1.48, .07)
    for x, z in ((-30, -44), (20, -48), (36, -41), (29, 39), (-28, 39)):
        for shift in (-1.9, 1.9):
            a.box("amber", x+shift, 6, z, .43, 12, .49)
            a.box("steel", x+shift, .25, z, 1.4, .5, 2.8)
        a.box("amber", x+2.8, 12.1, z, 12.6, .52, .55)
        a.box("amber", x+.9, 10.4, z, 8.8, .31, .36)
        for j in range(5):
            a.box("amber", x-2.55+j*1.72, 11.26, z, .19, 2.12, .24)
        a.box("metal", x+7.5, 8.5, z, .065, 6.8, .065)
        a.box("red", x+7.5, 5.04, z, .68, .33, 1)
    for i in range(50):
        x, z = a.rng.uniform(-120, 120), a.rng.uniform(-130, -82)
        h = a.rng.uniform(2, 15)
        a.box("metal" if i % 3 else "steel", x, h/2-.4, z, 2.5+i%6, h, 4+i%5)
        for floor in range(1, int(h/2)):
            a.box("gold_light" if i % 3 else "light", x, floor*1.85, z+2+i%5/2+.02, 1.45, .085, .06)
    for side in (-1, 1):
        a.box("concrete", side*28, -.48, side*32, 13, .99, 38)
        a.box("steel", 21*side, .13, 36*side, 12, .26, 2.3)
        a.ship(-30*side, 37*side)
        a.ship(33*side, 45*side)
        for j in range(16):
            pos = side*(13 + 1.87*j)
            a.box("gold_light", pos, .38, side*34.9, .61, .06, .18)
    a.frustum("pale", -13.4, .0, 28.6, 1.19, .71, 8.0, 12)
    for y in (2.5, 5.2):
        a.frustum("red", -13.4, y, 28.6, 1.19-y*.059+.025, 1.19-(y+.8)*.059+.025, .8, 12)
    a.frustum("metal", -13.4, 7.95, 28.6, 1.13, 1.13, .18, 12)
    a.frustum("gold_light", -13.4, 8.13, 28.6, .69, .67, .84, 12)
    a.frustum("red", -13.4, 8.96, 28.6, .88, .1, .56, 10)
    for i in range(625):
        x, z = a.rng.uniform(-133, 133), a.rng.uniform(-104, 100)
        if abs(x) > 24 or abs(z) > 33:
            a.box("glass" if i % 5 else "steel", x, -1.133, z, a.rng.uniform(.5, 4), .013, .043)
    a.export("harbor-arena.glb")


def alpine():
    a = Arena(7639)
    a.box("forest", 0, -.97, 0, 260, 1.1, 240)
    for scale, dist in ((.86, 49), (1.34, 77)):
        for side in (-1, 1):
            for i, x in enumerate(range(-100, 105, 18)):
                z = side*(dist+a.rng.uniform(-8, 10))
                w = a.rng.uniform(15, 29)*scale
                h = a.rng.uniform(13, 37)*scale
                a.ridge(x, z, w, h, i)
    for i in range(80):
        x, z = a.rng.uniform(-49, 49), a.rng.uniform(-39, 39)
        if abs(x) < 17 and abs(z) < 24:
            continue
        a.frustum("stone" if i % 4 else "mortar", x, -.52, z, 1.04, .64,
                  a.rng.uniform(.54, 1.28), 6)
    for i in range(360):
        x, z = a.rng.uniform(-89, 89), a.rng.uniform(-58, 58)
        if abs(x) < 21 and abs(z) < 30:
            continue
        h = a.rng.uniform(2.8, 8.6)
        a.frustum("wood", x, -.4, z, h*.035, h*.019, h*.67, 5)
        for level in range(4):
            a.frustum(("forest", "pine", "fern", "pine")[(i+level) % 4],
                      x + .10*sin(i+level), h*(.12+level*.18), z + .1*cos(i+level),
                      h*(.23-level*.042), .022, h*(.47+level*.018), 6)
    for side in (-1, 1):
        for x, z in ((12, 23), (-16, 27)):
            x, z = x*side, z*side
            a.box("stone", x, .45, z, 7.7, .91, 4.6)
            a.box("wood", x, 1.69, z, 7.5, 1.68, 4.48)
            a.roof(x, 2.51, z, 8.3, 1.46, 5.24)
            a.box("mortar", x+2, 3.22, z+.64, .49, 1.3, .49)
            a.box("stone", x+2, 3.9, z+.64, .63, .14, .57)
            for j in range(12):
                y = .98+j*.129
                a.box("cedar" if j % 3 else "wood", x, y, z-2.25*side, 7.55, .09, .075)
                for end in (-1, 1):
                    a.box("cedar", x+end*3.76, y, z, .13, .12, 4.5)
            for end in (-1, 1):
                a.box("wood", x+end*3.52, 1.71, z-2.34*side, .16, 1.77, .16)
            for j in range(4):
                a.box("mortar" if j%2 else "stone", x, .049+.085*j, z-(2.66-.16*j)*side,
                      1.5-.09*j, .11, .7-.05*j)
            for i in (-2, -1, 1, 2):
                px = x+i*1.38
                front = z-2.26*side
                a.box("gold_light", px, 1.63, front, .86, .74, .055)
                a.box("cedar", px, 1.63, front-.035*side, .055, .76, .05)
                a.box("cedar", px, 1.63, front-.035*side, .89, .055, .05)
                a.box("cedar", px, 1.22, front-.13*side, 1.03, .093, .28)
            a.box("cedar", x, .94, z-2.30*side, .81, 1.68, .14)
        a.lamps(15*side, -18*side, low=True)
        a.stairs(0, 18.8*side, 13, .83, 3)
        for z in (-6, 6):
            a.bench(8.6*side, z)
        for row in range(4):
            for n in range(42):
                z = (n-20.5)*.74 + .37*(row%2)
                a.box(a.rng.choice(("stone", "mortar", "granite")), 13.5*side,
                      .06+row*.22, z, .73+a.rng.random()*.2, .21, .68+a.rng.random()*.04)
        for i in range(11):
            z = -16+i*3.2
            a.box("wood", side*13.52, 1.04, z, .22, .73, .23)
            if i:
                a.box("cedar", side*13.52, 1.28, z-1.6, .11, .12, 3.2)
                a.box("wood", side*13.52, .99, z-1.6, .09, .084, 3.2)
    a.export("alpine-arena.glb")


if __name__ == "__main__":
    harbor()
    alpine()
