#!/usr/bin/env python3
"""Rebuild the nine original pixel scenes; Pixel Village is deliberately never rewritten.

All geometry is local SVG, on a 320x200 grid. Pals are separate native elements, never
part of these assets. Each scene reserves four foreground places for the real pet art.
"""
from pathlib import Path
import random

OUT = Path(__file__).resolve().parents[1] / 'mods/crew-roster/icons'


class Scene:
    def __init__(self, bg):
        self.parts = []
        if bg:
            self.rect(0, 0, 320, 200, bg)

    def rect(self, x, y, w, h, color):
        self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{color}"/>')

    def path(self, d, fill, stroke=None, width=1):
        edge = f' stroke="{stroke}" stroke-width="{width}"' if stroke else ''
        self.parts.append(f'<path d="{d}" fill="{fill}"{edge}/>')

    def line(self, x1, y1, x2, y2, c, width=1):
        self.path(f'M{x1} {y1}H{x2}' if y1 == y2 else f'M{x1} {y1}L{x2} {y2}', 'none', c, width)

    def dots(self, seed, colors, count, bounds=(0, 0, 320, 200)):
        rng = random.Random(seed)
        x, y, w, h = bounds
        for _ in range(count):
            self.rect(x + rng.randrange(w // 2) * 2, y + rng.randrange(h // 2) * 2,
                      2, 1 if rng.random() < .5 else 2, rng.choice(colors))

    def star(self, x, y, c):
        self.rect(x + 2, y, 1, 5, c)
        self.rect(x, y + 2, 5, 1, c)

    def save(self, name):
        (OUT / f'{name}.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" '
            'viewBox="0 0 320 200" shape-rendering="crispEdges">\n' + '\n'.join(self.parts) + '\n</svg>\n')


def steps(s, x, y, w, h, c):
    for yy in range(y, y + h, 5):
        s.rect(x, yy, w, 1, c)


def rock(s, x, y, c, top):
    s.path(f'M{x} {y+5}h3v-4h7v2h4v8H{x}Z', c)
    s.path(f'M{x+3} {y+1}h7v2h-3v3h-6v-2h2Z', top)


def tree(s, x, y, c, hi, trunk='#624d43'):
    s.rect(x + 8, y + 14, 2, 12, trunk)
    s.path(f'M{x+5} {y}h8v3h4v5h3v7h-4v5H{x+3}v-4H{x}V{y+6}h3V{y+3}h2Z', c)
    s.rect(x + 5, y + 3, 7, 2, hi)
    s.rect(x + 2, y + 7, 4, 3, hi)
    s.rect(x + 12, y + 11, 5, 2, hi)


def lamp(s, a, x, y, c, glow):
    s.rect(x + 3, y, 1, 15, c)
    s.rect(x, y + 1, 7, 1, c)
    s.rect(x + 1, y + 3, 5, 6, glow)
    s.rect(x, y + 9, 7, 1, c)
    a.rect(x + 2, y + 4, 3, 4, '#fff0c6')


def harbor():
    s, a = Scene('#07191f'), Scene(None)
    s.rect(0, 22, 320, 178, '#0d2c35')
    for y in range(25, 200, 12):
        for x in range((y % 24) // 2, 320, 26):
            s.path(f'M{x} {y}h4v2h5v-2h4', 'none', '#265360')
    s.dots(11, ['#1a404b', '#357080'], 100)
    # An interlocking network of timber piers.
    for x, y, w, h in [(26, 78, 266, 20), (26, 166, 266, 20), (150, 14, 19, 181)]:
        s.rect(x, y, w, h, '#514337')
        s.rect(x, y, w, 2, '#9d8262')
        if w > h:
            for xx in range(x, x+w, 7): s.rect(xx, y+3, 1, h-4, '#7c644b')
        else:
            steps(s, x+2, y, w-4, h, '#8c7355')
    for y in [77, 96, 165, 184]:
        for x in [26, 106, 211, 289]:
            s.rect(x, y-1, 3, 6, '#b6976b')
    for x, y, sail in [(35, 21, '#afc3b7'), (216, 21, '#93b3bf'), (35, 110, '#bcad96'), (216, 110, '#94bcaf')]:
        s.path(f'M{x} {y+43}h63l-9 12h-43Z', '#9c5b43')
        s.line(x+2, y+45, x+60, y+45, '#e2b17c')
        s.line(x+7, y+51, x+55, y+51, '#553b34')
        s.rect(x+28, y, 2, 46, '#c0a47e')
        s.path(f'M{x+25} {y+3}v33h-24Z', sail)
        s.path(f'M{x+33} {y+8}v28h23Z', '#688f94')
        steps(s, x+7, y+27, 16, 9, '#678e91')
        s.rect(x+30, y+1, 12, 4, '#ca9272')
        for xx in [15, 42]: s.rect(x+xx, y+46, 3, 3, '#e5c088')
    # Lighthouse silhouette at the central crossing.
    s.path('M143 75h34v5h-34Z M148 37h24l-3 38h-18Z', '#a9b6a7')
    s.rect(149, 50, 22, 7, '#a96450')
    s.rect(150, 28, 20, 12, '#233d45')
    s.rect(154, 30, 12, 8, '#d5b273')
    s.path('M146 28h28l-14-10Z', '#657d7a')
    a.rect(155, 31, 10, 6, '#fff0b0')
    a.path('M154 32l-24-7v18l24-7Z M166 32l24-7v18l-24-7Z', '#a7d7bd')
    for x in [3, 17, 284, 300]:
        rock(s, x, 2, '#344b51', '#718a88')
    for x, y in [(8, 108), (297, 112), (126, 151), (184, 56)]:
        s.rect(x, y, 2, 15, '#3e7766'); s.rect(x+4, y+5, 2, 11, '#4e8c77')
    for x,y in [(112,53),(181,147),(15,190)]: a.line(x,y,x+13,y,'#8dd6d5')
    return s, a


def oasis():
    s, a = Scene('#211522'), Scene(None)
    s.path('M0 21h22v-6h38v6h28v9h37v-6h38v-11h28v7h43v12h38v-12h48v180H0Z', '#45303a')
    s.path('M0 44h36v-8h49v12h43v-11h37v7h32v-9h49v11h74v154H0Z', '#634433')
    s.path('M0 61h37v-9h58v8h33v-10h38v9h54v-6h54v9h46v138H0Z', '#392d2b')
    s.dots(22, ['#654a39', '#806044', '#4c3a2e'], 350, (0, 50, 320, 150))
    # Stepped moon; open turquoise pool down the middle.
    s.path('M155 3h10v3h4v9h-4v4h-10v-4h-3V7h3Z', '#dfb988')
    s.path('M160 2h9v13h-9v-4h-3V6h3Z', '#211522')
    s.path('M137 66h39v7h12v18h-6v12h11v33h-9v18h-18v13h-32v-8h-12v-23h5v-27h-4V83h14Z', '#b38b59')
    s.path('M141 71h30v7h11v11h-6v22h11v22h-10v16h-15v12h-24v-8h-10v-18h5v-30h-4V87h12Z', '#215458')
    for y in range(83, 155, 12):
        s.line(139, y, 167 + y%7, y, '#478b85')
    for x, y, c in [(30,29,'#9e5949'),(214,29,'#806057'),(35,115,'#8e5c50'),(212,115,'#a47750')]:
        s.path(f'M{x} {y+28}l32-24 32 24v20H{x}Z', c)
        s.path(f'M{x} {y+28}h64M{x+32} {y+4}v43', 'none', '#deb380')
        for xx in [9,18,46,55]: s.line(x+32,y+6,x+xx,y+28,'#c78d68')
        s.path(f'M{x+21} {y+28}h22l-7 20h-9Z', '#251d26')
        s.rect(x+5, y+49, 57, 6, '#764950')
        for xx in range(8,60,8): s.rect(x+xx,y+51,3,2,'#d0a66e')
    def palm(x,y):
        s.path(f'M{x+10} {y+13}l-3 25h4l3-25Z', '#9f7951')
        for dx,dy in [(-14,2),(-10,-6),(0,-12),(11,-7),(16,2)]:
            s.path(f'M{x+11} {y+14}l{dx} {dy}l-2 6Z', '#608170')
        s.rect(x+7,y+15,5,4,'#bd9562')
    for x,y in [(1,33),(292,37),(104,25),(184,13),(1,139),(292,142),(105,153),(190,161)]: palm(x,y)
    for x,y in [(116,67),(194,96),(106,176)]: lamp(s,a,x,y,'#bf8e59','#dcaa6f')
    for x,y in [(144,99),(151,131)]: a.line(x,y,x+17,y,'#93d6c5')
    return s,a


def neon():
    s,a = Scene('#100f21'),Scene(None)
    s.rect(0,94,320,20,'#202237');s.rect(150,0,22,200,'#202237')
    for x in range(5,320,16): s.rect(x,104,7,1,'#657081')
    for y in range(8,200,15): s.rect(161,y,1,6,'#657081')
    for x in [145,174]: s.rect(x,0,1,200,'#3d4b64')
    for y in [93,115]: s.rect(0,y,320,1,'#3c5366')
    # Dense skyline around the resident blocks.
    for x,h,c in [(0,62,'#242840'),(17,40,'#252037'),(112,77,'#242c45'),(178,54,'#30213e'),(287,69,'#262239'),(305,44,'#203342')]:
        s.rect(x,0,13,h,c)
        for yy in range(5,h-4,8):
            for xx in [2,7]: s.rect(x+xx,yy,3,2,'#65768f' if yy%3 else '#bd718e')
        s.rect(x+5,h,2,13,'#42445f')
    for x,y in [(31,18),(214,18),(32,119),(215,119)]:
        s.path(f'M{x} {y+12}h9V{y}h40v12h10v50H{x}Z','#242c43','#566179')
        s.rect(x+4,y+16,51,39,'#151d31')
        for xx in range(8,52,9):
            for yy in range(20,48,7): s.rect(x+xx,y+yy,4,3,'#536781' if xx%2 else '#3c6778')
        s.rect(x+12,y+3,31,5,'#a4609e')
        s.rect(x+22,y+41,15,20,'#111523')
        s.rect(x+23,y+42,13,1,'#70d3dc')
        s.rect(x-5,y+23,8,25,'#402d52')
        for yy in range(26,46,5):
            s.rect(x-3,y+yy,4,2,'#e18cbd');a.rect(x-3,y+yy,4,2,'#ffc4ea')
        s.rect(x+45,y-8,1,8,'#65728a');s.rect(x+43,y-8,5,1,'#d283c0')
        a.rect(x+14,y+4,27,2,'#b5e9ff')
        # Wet reflections below the raised platform.
        for yy,ww in [(70,34),(74,22),(78,10)]: s.rect(x+12,y+yy,ww,1,'#4c456f')
    s.rect(146,91,29,27,'#322d49');s.rect(150,95,21,19,'#121c30')
    s.path('M154 100h13v3h-4v6h-5v-6h-4Z','#6bcecd');a.rect(155,101,11,2,'#baf8ec')
    for x,y in [(6,140),(117,166),(183,133),(298,170)]:
        s.rect(x,y,9,22,'#32324c');s.rect(x+2,y+4,5,13,'#b77aac');a.rect(x+3,y+5,3,10,'#f7b5d4')
    s.dots(33,['#324a63','#39475b'],60)
    return s,a


def shrine():
    s,a = Scene('#1d1725'),Scene(None)
    s.path('M0 28l24-22 22 19L79 0l31 25 21-10 28 19 36-32 39 26 22-13 38 23 26-20v33H0Z','#383646')
    s.path('M66 11L79 0l15 12-12-3-7 5Z M182 16l13-14 16 12-14-4Z','#8c8192')
    s.dots(44,['#3b3945','#50414c','#684553'],170)
    s.rect(149,42,21,158,'#46414a');steps(s,150,43,19,156,'#7b7079')
    s.rect(20,105,282,8,'#50404a');steps(s,22,105,278,8,'#75606a')
    for x,y in [(32,29),(213,29),(32,116),(213,116)]:
        s.rect(x+8,y+19,46,29,'#713e3d')
        for xx in range(12,53,7):s.rect(x+xx,y+21,1,26,'#b97568')
        s.path(f'M{x-3} {y+20}h68l-12-7h-5l-13-13-13 13h-13Z','#46515b','#9e8896')
        s.path(f'M{x+3} {y+11}h56l-12-5h-7l-8-8-8 8h-10Z','#394854','#9e8896')
        s.rect(x+23,y+28,15,20,'#241c29');s.rect(x+27,y+30,7,18,'#b08b70')
        s.rect(x+6,y+48,50,3,'#8b7780')
        for xx in [12,45]:s.rect(x+xx,y+25,5,8,'#edb68a')
    # Torii anchors the central path.
    s.rect(140,71,5,33,'#a75453');s.rect(175,71,5,33,'#a75453')
    s.path('M133 66h54v4h-54Z M137 77h46v3h-46Z','#c37667')
    s.rect(151,70,17,2,'#e1ad85');s.rect(159,72,2,7,'#b48166')
    for x,y in [(0,21),(291,24),(5,119),(290,122),(110,2),(184,174)]: tree(s,x,y,'#9c637e','#d79cb5')
    for x,y in [(119,92),(189,101),(120,156),(186,40)]:lamp(s,a,x,y,'#8d7c82','#e6b995')
    s.dots(45,['#b2829a','#8d647e'],35,(3,181,310,18))
    return s,a


def grove():
    s,a = Scene('#101c19'),Scene(None)
    s.path('M136 0h31v36h19v36h-12v40h16v32h-22v56h-29v-52h14v-34h-19V73h17V38h-15Z','#293c2c')
    s.rect(21,105,282,7,'#2d4031')
    s.dots(55,['#2b4a34','#39553b','#4a6040'],330)
    # Dense fern/trunk margins, distinct from the pine tiles of Pixel Village.
    for x in [4,18,297,310]:
        s.rect(x,0,4,200,'#2f3e2f')
        for y in range(6,200,23):
            s.path(f'M{x+2} {y+12}l-9-7h5l4 4 5-9h4l-7 12Z','#46704b')
            s.line(x+1,y+12,x+1,y+20,'#77985b')
    for x,y,c,hi in [(30,24,'#97556b','#ce8995'),(213,24,'#5c8580','#9db7a1'),(32,112,'#a27b4f','#d0a477'),(214,112,'#786788','#b99bb6')]:
        s.path(f'M{x+19} {y+28}h26v25h-26Z','#9f9674')
        s.rect(x+25,y+37,13,17,'#25382e');s.rect(x+27,y+39,9,13,'#c3bc84')
        s.path(f'M{x} {y+29}v-9h6v-8h10v-7h10V{y}h14v5h10v7h9v8h5v9Z',c)
        s.rect(x+2,y+29,61,3,hi)
        for xx,yy in [(11,17),(27,7),(42,19)]:
            s.rect(x+xx,y+yy,8,4,hi);s.rect(x+xx+2,y+yy-2,4,8,hi)
        s.rect(x+15,y+54,35,3,'#4e6140')
    # A small hollow stump and luminous toadstools at the crossing.
    s.path('M145 85h30v21h-30Z','#5a5138','#93835b')
    s.rect(150,89,20,6,'#2b3427');steps(s,148,98,24,9,'#7c704b')
    for x,y in [(116,62),(184,80),(111,154),(184,174),(122,10)]:
        s.rect(x+4,y+4,2,8,'#a7b58a');s.path(f'M{x} {y+5}v-3h3V{y}h5v2h3v3Z','#79ad93')
        a.rect(x+3,y+1,5,3,'#ceefb1')
    for x,y in [(108,43),(181,138),(130,183),(194,28),(22,90)]:a.star(x,y,'#bce592')
    return s,a


def orbital():
    s,a = Scene('#0c1324'),Scene(None)
    s.dots(66,['#344660','#536987','#91aac8'],170)
    for x,y in [(10,14),(123,48),(190,19),(297,91),(131,183)]:s.star(x,y,'#7897b7')
    # Pixel planet with stepped terminator and two narrow orbital rings.
    s.path('M146 4h28v4h9v8h5v22h-5v8h-9v4h-28v-4h-9v-8h-5V16h5V8h9Z','#315477')
    s.path('M145 8h25v6h-10v5h-11v7h-10v10h-5V17h5V12h6Z','#72a9b8')
    s.path('M158 29h18v6h-6v7h-17v-6h-7v-4h12Z','#568c9f')
    s.path('M123 38h14v4h45v-4h16M129 43h12v4h35v-4h16','none','#60718e')
    # Connecting service corridors and lattice solar wings.
    s.rect(65,88,195,10,'#283c56');steps(s,68,90,187,8,'#5d728d')
    s.rect(154,57,12,133,'#263d54')
    for y in range(60,190,8):s.rect(156,y,8,2,'#607791')
    for x in [0,300]:
        s.rect(x,55,20,96,'#1c304d')
        for xx in range(x+2,x+20,6):s.rect(xx,56,1,94,'#587f9e')
        steps(s,x+1,57,18,94,'#4e6a91')
    for x,y in [(31,27),(213,27),(31,116),(213,116)]:
        s.path(f'M{x+8} {y}h45v5h8v44h-8v5H{x+8}v-5H{x}V{y+5}h8Z','#35485e','#879eaf')
        s.rect(x+4,y+8,53,35,'#15263a')
        s.rect(x+8,y+11,45,12,'#4e8195')
        for xx in range(10,52,9):s.rect(x+xx,y+12,1,10,'#9bbbc3')
        s.rect(x+22,y+28,17,24,'#273b50');s.rect(x+25,y+31,11,20,'#6d8697')
        s.rect(x+8,y+39,8,2,'#c2af83');s.rect(x+45,y+39,8,2,'#83c7bf')
        a.rect(x+45,y+39,8,2,'#c0fcdf')
        s.rect(x+19,y-4,23,3,'#688395')
    s.path('M147 99h26v23h-26Z','#638096','#aac9d1')
    s.rect(151,103,18,15,'#162a42');a.rect(156,107,8,7,'#9ed8e6')
    s.rect(149,187,23,3,'#88a9c1');s.rect(159,178,2,10,'#718ca2')
    return s,a


def cloud():
    s,a = Scene('#242139'),Scene(None)
    for x,y in [(0,16),(117,36),(243,3),(-8,103),(107,177),(282,123)]:
        s.path(f'M{x} {y+11}h9V{y+5}h12V{y}h18v5h12v6h16v8H{x}Z','#3d3855')
        s.rect(x+5,y+19,57,2,'#514866')
    for x,y in [(113,14),(197,54),(9,174),(295,68),(178,155)]:s.star(x,y,'#c6b993');a.star(x,y,'#f7e5ad')
    s.dots(77,['#67617d','#4a4567'],55)
    for x,y in [(27,25),(209,25),(28,113),(210,113)]:
        # Floating land, tapered rock underside and trailing roots.
        s.path(f'M{x-4} {y+53}h73v7h-5v6h-12v8h-17v9h-9v-10h-14v-8H{x}Z','#625874')
        s.path(f'M{x+8} {y+65}h39v5h-13v10h-8v-8H{x+8}Z','#948198')
        s.path(f'M{x-7} {y+50}h9v-5h57v5h13v9H{x-7}Z','#a0a9a5')
        s.rect(x,y+51,65,3,'#d0cfb8')
        # Narrow castle spires rather than huts.
        for dx,h in [(5,31),(24,43),(45,29)]:
            s.rect(x+dx,y+50-h,14,h,'#9d92b2')
            s.path(f'M{x+dx-3} {y+50-h}l10-16 10 16Z','#75618d','#bfa8c6')
            s.rect(x+dx+5,y+54-h,4,8,'#e7d0a0')
            s.rect(x+dx+6,y+32-h,1,5,'#e5cb8c')
        s.rect(x+28,y+38,9,14,'#4a3c5d')
        s.line(x+12,y+76,x+12,y+85,'#66846d');s.rect(x+9,y+79,4,2,'#91aa85')
    # Suspension bridges and a central star compass.
    for y in [79,167]:
        s.path(f'M98 {y}q62 18 112 0','none','#aa96ab')
        for x in range(100,211,7):s.rect(x,y+4+(4 if 126<x<186 else 0),3,2,'#b7a2b6')
    s.path('M158 78l5 12 13 4-13 5-5 13-5-13-13-5 13-4Z','#d3b98e')
    s.path('M158 85l3 8 8 1-8 3-3 8-3-8-8-3 8-1Z','#f1ddaa')
    a.rect(156,92,4,5,'#fff0c8')
    return s,a


def forge():
    s,a = Scene('#211519'),Scene(None)
    s.path('M141 0h24v46h21v37h-15v30h20v38h-25v49h-25v-55h25v-25h-19V78h13V52h-19Z','#8e3d2b')
    s.path('M148 0h9v52h20v23h-15v46h20v22h-25v57h-9v-65h25v-5h-20V69h15V59h-20Z','#d8733c')
    s.path('M152 0h3v55h20v4h-23Z M156 95h3v34h20v3h-23Z M151 158h3v42h-3Z','#f2b765')
    for x,y in [(0,0),(105,22),(190,1),(295,5),(4,100),(290,100),(104,157),(192,177)]:
        for k in range(3):rock(s,x+(k%2)*10,y+k*11,'#453d43','#71606a')
    s.dots(88,['#553e3d','#3f3439','#6c4b3d'],180)
    for x,y in [(31,25),(214,25),(31,113),(214,113)]:
        s.rect(x+6,y+14,51,36,'#51434a')
        s.path(f'M{x} {y+16}l18-15h28l17 15Z','#433b43','#a17a70')
        s.rect(x+43,y-12,10,27,'#70514e');steps(s,x+44,y-11,8,22,'#a1745a')
        s.path(f'M{x+18} {y+50}V{y+29}h5v-5h17v5h5v21Z','#ad663e')
        s.rect(x+23,y+29,17,20,'#f0a352');s.rect(x+27,y+32,9,17,'#f3cd8c')
        a.rect(x+27,y+35,9,12,'#ffedbb')
        for xx in [10,49]:s.rect(x+xx,y+22,3,3,'#b19b8a')
        s.rect(x+1,y+50,62,3,'#8c7370')
    # Riveted iron bridge and anvil.
    s.rect(122,89,75,20,'#4f4951');steps(s,124,90,71,18,'#746c71')
    for x in range(127,194,10):s.rect(x,92,2,2,'#c1a18b')
    s.path('M145 92h29v4h-8v6h7v4h-27v-4h8v-6h-9l-8-4Z','#b4a199')
    for x,y in [(94,6),(190,61),(114,132),(280,110),(184,186)]:
        s.rect(x,y,2,3,'#bd7849');a.rect(x,y,2,3,'#ffc580')
    return s,a


def harvest():
    s,a = Scene('#211d16'),Scene(None)
    s.path('M142 0h26v200h-26Z M18 98h287v12H18Z','#4a3e27')
    s.dots(99,['#53492b','#6d5933','#3e4229'],250)
    for x,y in [(0,2),(22,0),(103,1),(183,0),(281,3),(301,9),(0,122),(295,134)]:
        tree(s,x,y,'#895a37','#bd8647')
    for x,y in [(33,25),(213,25),(33,113),(213,113)]:
        s.path(f'M{x+4} {y+19}h54v33H{x+4}Z','#854e40')
        s.path(f'M{x} {y+20}l16-18h30l16 18Z','#514743','#bba481')
        for xx in range(8,57,6):s.rect(x+xx,y+23,1,27,'#b17151')
        s.rect(x+21,y+30,20,22,'#4a3931')
        s.path(f'M{x+21} {y+30}h20v22h-20Z M{x+21} {y+30}l20 22m0-22-20 22','none','#c4b18b')
        s.rect(x+24,y+8,14,7,'#e1bd77')
        s.rect(x+1,y+52,61,3,'#82714c')
    # Small windmill at the crossroads.
    s.path('M147 105l4-40h17l5 40Z','#8d815d')
    s.path('M147 66l13-12 14 12Z','#705244')
    s.rect(157,89,7,16,'#493b2b')
    s.path('M158 73v-22h4v22h22v4h-22v22h-4V77h-22v-4Z','#c2b58d')
    s.rect(158,73,4,4,'#67523e')
    # Crop beds and pumpkins at the margins, with fence rails.
    for x,y in [(4,60),(286,65),(108,119),(184,118),(104,174),(182,174)]:
        s.rect(x,y,22,19,'#383c26')
        for yy in range(y+2,y+19,6):
            for xx in range(x+2,x+22,7):
                s.rect(xx,yy,3,4,'#92964e');s.rect(xx+1,yy-1,1,2,'#c0b969')
    for x,y in [(5,176),(25,183),(279,183),(300,171)]:
        s.path(f'M{x} {y+3}h2v-2h8v2h2v7h-2v2H{x+2}v-2H{x}Z','#bc7c3f')
        s.rect(x+5,y-1,2,5,'#8d9b57');s.rect(x+3,y+4,1,5,'#e3a954')
    for x,y in [(109,88),(190,47),(119,167),(279,95)]:a.star(x,y,'#f1d28b')
    return s,a


if __name__ == '__main__':
    for name, build in [('tide-harbor', harbor), ('amber-oasis', oasis), ('neon-district', neon),
                        ('sakura-shrine', shrine), ('mushroom-grove', grove), ('orbital-outpost', orbital),
                        ('cloud-kingdom', cloud), ('cinder-forge', forge), ('harvest-hollow', harvest)]:
        scene, ambient = build()
        scene.save(name)
        ambient.save(name + '-ambient')
        print(name)
