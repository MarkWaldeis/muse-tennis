"""Create the material-batched Muse Open stadium and seat positions in Blender.

blender --background --python-exit-code 1 --python tools/export_muse_open.py
"""
from math import cos, hypot, pi, sin
from pathlib import Path
from struct import pack
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_new_courts import Arena, PALETTE


COLORS = {
    **PALETTE,
    "concrete": (.43, .415, .381),
    "concrete_dark": (.28, .265, .24),
    "pale": (.69, .655, .59),
    "roof_shadow": (.36, .35, .32),
    "roof_metal": (.19, .185, .17),
    "metal": (.048, .054, .055),
    "steel": (.34, .39, .40),
    "glass": (.077, .116, .132),
    "green": (.026, .127, .077),
    "green_trim": (.043, .189, .108),
    "entrance": (.027, .035, .032),
    "screen_frame": (.025, .049, .042),
    "amber": (.89, .64, .11),
    "cedar": (.41, .235, .11),
    "wood": (.23, .113, .06),
    "burgundy": (.27, .036, .035),
    "skin": (.44, .236, .154),
    "skin_light": (.65, .39, .25),
    "hair": (.064, .042, .027),
    "fabric": (.089, .11, .15),
    "sandstone": (.37, .265, .196),
    "light": (.86, .89, .9),
}
arena = Arena(81246, COLORS)
seats = []


class Stand:
    def __init__(self, angle):
        self.angle = angle
        self.c, self.s = cos(angle), sin(angle)

    def coords(self, u, v):
        return u*self.c-v*self.s, u*self.s+v*self.c

    def box(self, mat, u, y, v, w, h, d):
        x, z = self.coords(u, v)
        arena.box(mat, x, y, z, w, h, d, self.angle)

    def seat(self, u, y, v):
        x, z = self.coords(u, v)
        seats.append(pack("<hhhh", round(x*100), round(y*100), round(z*100), round(-self.angle*1000)))

    def post(self, mat, u, y, v, radius, height):
        x, z = self.coords(u, v)
        arena.frustum(mat, x, y, z, radius, radius, height, 8)

    def edge(self, mat, points, width):
        """A handrail or tubular diagonal brace between two local positions."""
        a, b = points
        u1, y1, v1 = a
        u2, y2, v2 = b
        dx, dy, dz = u2-u1, y2-y1, v2-v1
        h = hypot(dx, dz)
        if h < .0001:
            self.post(mat, u1, min(y1, y2), v1, width/2, abs(dy))
            return
        nx, nz = -dz/h * width/2, dx/h * width/2
        verts = []
        for u, y, v in (a, b):
            for su, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                x, z = self.coords(u+su*nx, v+su*nz)
                verts.append((x, y+sy*width/2, z))
        arena.shape(mat, verts, [(3, 2, 1, 0), (4, 5, 6, 7), (0, 1, 5, 4),
                                 (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)])

    def bowl(self, frontage, distance, deck, upper=False):
        sections = 5
        gap = 1.46 if upper else 1.53
        span = (frontage - gap*(sections-1))/sections
        step = .78 if upper else .83
        rise = .51 if upper else .505
        rows = 11 if upper else 10
        first = -frontage/2 + span/2
        for r in range(rows):
            y = deck+r*rise
            v = distance+(r+.46)*step
            # Full terraces, with shallower half-steps and strip nosings in stair aisles.
            self.box("concrete" if r % 3 else "concrete_dark", 0, y-rise/2, v, frontage, rise, step+.009)
            self.box("pale", 0, y-.025, v-step/2+.028, frontage, .045, .076)
            for section in range(sections):
                center = first+section*(span+gap)
                entry_row = (upper and r < 3 and section in (1, 3)) or (not upper and r >= 7 and section in (1, 3))
                limit = int((span-.10)/.50)
                for i in range(limit):
                    u = center + (i-(limit-1)/2)*.50
                    if entry_row and abs(u-center) < 1.03:
                        continue
                    self.seat(u, y, v+.095)
                if section == sections-1:
                    continue
                stair = center+span/2+gap/2
                self.box("pale", stair, y+rise/4, v+step*.26, gap-.11, rise/2, step*.48)
                self.box("concrete_dark", stair, y+rise/2+.012, v+.023, gap-.15, .023, .072)
                if r%2 == 0:
                    for edge in (-1, 1):
                        self.post("steel", stair+edge*(gap/2-.105), y, v, .025, .87)
                if r < rows-1:
                    for edge in (-1, 1):
                        u = stair+edge*(gap/2-.105)
                        self.edge("steel", ((u, y+.84, v), (u, y+.84+rise, v+step)), .042)

        end = distance+rows*step
        top = deck+(rows-1)*rise
        self.box("concrete", 0, top-.32, end+.7, frontage+.4, .6, 1.56)
        self.box("pale", 0, top+.3, end+1.28, frontage+.44, 1.15, .25)
        self.box("concrete_dark", 0, top+.9, end+1.28, frontage+.44, .10, .35)
        for section in (1, 3):
            u = first+section*(span+gap)
            v = distance+2.1*step if upper else end-.52
            floor = deck+.9 if upper else top-.58
            self.box("entrance", u, floor+.51, v-.31, 1.92, 1.37, .12)
            for side in (-1, 1):
                self.box("pale", u+1.02*side, floor+.55, v-.08, .19, 1.58, .83)
                self.edge("steel", ((u+1.11*side, floor+.7, v-1.39), (u+1.11*side, floor+1.56, v+.27)), .056)
            self.box("pale", u, floor+1.36, v-.16, 2.22, .18, .84)
            self.box("green", u, floor+1.51, v-.57, .64, .17, .06)

    def court_wall(self, width, dist):
        self.box("concrete_dark", 0, .10, dist, width, .21, .55)
        self.box("green", 0, .69, dist, width, 1.03, .39)
        self.box("pale", 0, 1.26, dist, width+.05, .15, .49)
        for u in range(int(-width/2)+1, int(width/2), 2):
            self.box("green_trim", u, .7, dist-.20, .036, .971, .026)
        for side in (-1, 1):
            u = (width/2-2.3)*side
            self.box("entrance", u, .67, dist-.24, 1.08, 1.13, .038)
            self.box("steel", u+.36*side, .72, dist-.27, .10, .038, .04)

    def gallery(self, width, v):
        self.box("pale", 0, 7.03, v, width+.62, .38, 1.05)
        self.box("concrete_dark", 0, 7.3, v+.46, width, .13, .73)
        self.box("glass", 0, 7.82, v+.10, width-.28, 1.05, .09)
        self.box("steel", 0, 7.87, v+.005, width-.24, .045, .12)
        self.box("pale", 0, 8.57, v-.19, width+.85, .47, 1.35)
        for i, u in enumerate(range(int(-width/2)+1, int(width/2), 1)):
            self.box("steel" if i%5 else "pale", u, 7.82, v-.002, .063 if i%5 else .18, 1.12, .22)
            if i%3 == 0:
                self.box("roof_metal", u+.32, 7.41, v+.052, .68, .25, .059)
                self.box("gold_light", u, 8.21, v+.045, .46, .056, .025)

    def canopy(self):
        for i in range(13):
            u = (i-6)*4.9
            lip = 11.77 + (0, 0, .46, .72, .55, .20, 0)[min(i, 12-i)]
            self.box("roof_shadow", u, 15.91, (lip+31.37)/2, 4.9, .48, 31.37-lip)
            self.box("pale", u, 16.24, lip, 4.9, .61, .38)
            self.box("roof_metal", u-2.22, 15.58, 21.6, .17, .185, 19.4)
            self.box("steel", u-1.62, 15.49, 21.6, .08, .065, 19.15)
            self.box("roof_metal", u, 15.42, 26.1, 4.87, .17, .31)
            self.box("roof_metal", u, 15.57, 15.7, 4.87, .13, .24)
            self.box("light", u, 15.33, 15.7, .77, .072, .23)
            if i%2 == 0:
                self.box("steel", u, 11.04, 28.66, .44, 9.72, .54)


def corner_terraces():
    # Extend row treads on each side of the diagonal corner transition.
    # The two extensions meet the end stand and one another at the same elevation.
    for r in range(10):
        y = 1.48+r*.505
        side_front = 10.59+(r-.04)*.83
        end_front = 18.72+(r-.04)*.83
        x_overhang = side_front+.837-15
        z_overhang = end_front-36.95/2
        for sign in (-1, 1):
            side = Stand(sign*pi/2)
            end = Stand(0 if sign > 0 else pi)
            for corner in (-1, 1):
                u = corner*(36.95/2+z_overhang/2)
                side.box("concrete_dark", u, y-.2525, side_front+.415, z_overhang, .505, .837)
                side.box("pale", u, y-.025, side_front+.03, z_overhang, .044, .068)
                for n in range(1, int(z_overhang/.50)):
                    side.seat(corner*(36.95/2+.50*n), y, side_front+.51)
                if x_overhang > .005:
                    u = corner*(15+x_overhang/2)
                    end.box("concrete", u, y-.2525, end_front+.415, x_overhang, .505, .837)
                    end.box("pale", u, y-.025, end_front+.03, x_overhang, .044, .068)
                    for n in range(1, int(x_overhang/.50)):
                        end.seat(corner*(15+.50*n), y, end_front+.51)
                # The structural wall closes the underside between the stand ends.
                if r == 9:
                    for deck in (False, True):
                        h = 1.0 if deck else 7.5
                        mat = "pale" if deck else "concrete_dark"
                        end.box(mat, corner*17.94, 6.58 if deck else 2.83, 27.07, 6.24, h, .44)


def floodlight(x, z):
    s = Stand(0 if z > 0 else pi)
    x, z = (x, z) if z > 0 else (-x, -z)
    y = 14.4
    for edge in (-1, 1):
        s.box("steel", x+edge*.59, y+3.1, z, .126, 6.2, .13)
    for n in range(9):
        base = y+n*.67
        s.edge("steel", ((x-.59, base, z), (x+.59, base+.64, z)), .058)
        s.edge("steel", ((x+.59, base, z), (x-.59, base+.64, z)), .058)
    s.box("roof_metal", x, y+6.56, z, 3.94, 2.0, .38)
    for row in range(5):
        for col in range(9):
            u, h = x+(col-4)*.411, y+5.83+row*.366
            s.box("steel", u, h, z-.26, .355, .314, .22)
            s.box("light", u, h, z-.387, .238, .221, .043)


def attendant(s, x, y, z, shirt, seated=False):
    skin = "skin" if x > 0 else "skin_light"
    s.box("fabric", x, y+.54, z, .32, .25, .20)
    height = .32 if seated else .47
    for side in (-1, 1):
        s.box("fabric", x+side*.091, y+.43-height*.5, z, .142, height, .145)
        s.box("pale", x+side*.091, y+.04, z-.052, .141, .094, .25)
        s.edge(skin, ((x+side*.22, y+1.05, z), (x+side*.25, y+.81, z-.06)), .087)
        s.box(shirt, x+side*.21, y+1.12, z, .124, .21, .17)
    s.box(shirt, x, y+.94, z, .347, .49, .211)
    a, b = s.coords(x, z)
    arena.frustum(skin, a, y+1.17, b, .064, .069, .16, 10)
    arena.frustum(skin, a, y+1.31, b, .076, .109, .075, 10)
    arena.frustum(skin, a, y+1.385, b, .109, .106, .104, 10)
    arena.frustum("hair", a, y+1.458, b, .108, .067, .07, 10)
    s.box(shirt, x, y+1.507, z-.036, .223, .055, .26)
    s.box("pale", x-.08, y+1.09, z-.112, .053, .041, .009)


def courtside():
    for direction in (-1, 1):
        stand = Stand(-direction*pi/2)
        # Towels, wood benches, towel box, drinks cooler, server cameras and spare nets.
        for u in (-4.1, 4.1):
            for j in range(5):
                stand.box("cedar", u, .41, 8.3+j*.103, 2.15, .062, .088)
            for end in (-1, 1):
                stand.box("metal", u+end*.76, .20, 8.50, .13, .39, .48)
            stand.box("pale", u-.56, .47, 8.42, .64, .061, .31)
            stand.box("green", u+1.63, .375, 8.49, .59, .746, .62)
            stand.box("green_trim", u+1.63, .764, 8.49, .63, .076, .66)
            stand.box("pale", u+1.63, .40, 8.174, .24, .21, .028)
            stand.post("amber", u-1.57, .00, 8.52, .24, .59)
            stand.post("pale", u-1.57, .59, 8.52, .247, .075)
        for u in (-10.7, 10.7):
            for v in (8.55, 9.08):
                stand.edge("metal", ((u, 1.12, 8.75), (u+.4, .06, v)), .056)
                stand.edge("metal", ((u, 1.12, 8.75), (u-.4, .06, v)), .051)
            stand.box("metal", u, 1.27, 8.75, .48, .29, .38)
            stand.box("roof_metal", u, 1.29, 8.52, .19, .174, .18)
            stand.box("pale", u+.105, 1.446, 8.81, .15, .052, .15)
            attendant(stand, u+.72, 0, 9.40, "fabric")
        if direction > 0:
            for leg in (-.34, .34):
                stand.edge("pale", ((leg, .03, 7.01), (leg, 2.36, 7.89)), .073)
                stand.edge("steel", ((leg, .03, 8.35), (leg, 2.36, 7.89)), .064)
            for row in range(1, 8):
                stand.box("pale", 0, row*.29, 6.99+row*.108, .71, .07, .156)
            stand.box("green", 0, 2.41, 7.90, .86, .11, .63)
            stand.box("green", 0, 2.75, 8.19, .86, .71, .13)
            stand.box("green_trim", 0, 2.67, 7.58, .96, .43, .15)
            attendant(stand, 0, 2.04, 7.91, "burgundy", seated=True)
        attendant(stand, -7.55, .0, 8.12, "burgundy")

    for direction in (0, pi):
        stand = Stand(direction)
        for lane in (-5.7, 0, 5.7):
            attendant(stand, lane, 0, 17.38, "burgundy" if lane else "fabric")


def build():
    arena.box("sandstone", 0, -.46, 0, 98, .75, 110)
    for angle in (0, pi, pi/2, -pi/2):
        s = Stand(angle)
        side = abs(angle) == pi/2
        s.court_wall(37.1 if side else 19.82, 10.2 if side else 18.35)
        s.bowl(36.95 if side else 30, 10.59 if side else 18.72, 1.48)
        s.gallery(53.3 if side else 41.8, 18.35 if side else 26.77)
        s.bowl(55.3 if side else 45.1, 17.64 if side else 25.83, 9.07, upper=True)
        if side:
            s.canopy()
    corner_terraces()
    for x in (-14.3, 14.3):
        for z in (-36.7, 36.7):
            floodlight(x, z)
    for z in (-35.1, 35.1):
        arena.box("screen_frame", 0, 16.42, z, 6.45, 2.95, .76)
        for x in (-2.8, 2.8):
            arena.box("steel", x, 14.73, z, .23, 2.2, .23)
    courtside()

    arena.export("muse-open-arena.glb")
    (Path(__file__).resolve().parents[1] / "assets" / "muse-open-seats.bin").write_bytes(b"".join(seats))
    print(f"Exported {len(seats)} stadium seats")


if __name__ == "__main__":
    build()
