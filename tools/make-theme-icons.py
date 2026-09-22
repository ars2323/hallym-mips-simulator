#!/usr/bin/env python3
"""Render the theme's SVG sources to the PNGs the program embeds.

    tools/make-theme-icons.py

Tool bar icons: QtSpim/edu/theme/icons/lucide/<name>.svg (stroke="currentColor")
-> QtSpim/edu/theme/icons/png/<name>-<state>.png and <name>-<state>@2x.png at
the token icon size, in the token colours (state = normal / active / disabled).
Brand marks: QtSpim/edu/theme/brand/<name>.svg -> <name>-<width>.png and
<name>-<width>@2x.png at the widths edu_theme.cpp asks for.

The colours and sizes are read from QtSpim/edu/theme/tokens.h so that this
file never holds a value of its own.  Needs cairosvg (pip install cairosvg).
The PNGs are committed; the program has no SVG renderer at run time.
"""
import os
import re
import sys

import cairosvg

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
THEME = os.path.join(ROOT, "QtSpim", "edu", "theme")

ICONS = ["folder-open", "refresh-cw", "save", "printer", "eraser", "rotate-ccw",
         "play", "pause", "square", "step-forward", "settings",
         "circle-question-mark", "hammer", "file-plus", "file-text"]
STATES = {"normal": "kNavy", "active": "kBlue", "disabled": "kGray"}
BRAND = {"emblem-a-navy": [112], "logotype-ko-en": [220],
         "signature-h-ko-en": [320], "symbol-basic": [64]}


def tokens():
    text = open(os.path.join(THEME, "tokens.h"), encoding="utf-8").read()
    colours = {m.group(1): "#" + m.group(2)
               for m in re.finditer(r"const QRgb (k\w+) = 0xff([0-9a-f]{6});", text)}
    size = int(re.search(r"const int kToolIconSize = (\d+);", text).group(1))
    return colours, size


def main():
    colours, size = tokens()
    out = os.path.join(THEME, "icons", "png")
    os.makedirs(out, exist_ok=True)
    for name in ICONS:
        svg = open(os.path.join(THEME, "icons", "lucide", name + ".svg"),
                   encoding="utf-8").read()
        assert 'stroke="currentColor"' in svg, name
        for state, token in STATES.items():
            coloured = svg.replace('stroke="currentColor"',
                                   'stroke="%s"' % colours[token])
            for scale, suffix in ((1, ""), (2, "@2x")):
                cairosvg.svg2png(bytestring=coloured.encode("utf-8"),
                                 write_to=os.path.join(out, "%s-%s%s.png" % (name, state, suffix)),
                                 output_width=size * scale, output_height=size * scale)
    for name, widths in BRAND.items():
        src = os.path.join(THEME, "brand", name + ".svg")
        for width in widths:
            for scale, suffix in ((1, ""), (2, "@2x")):
                cairosvg.svg2png(url=src,
                                 write_to=os.path.join(THEME, "brand", "%s-%d%s.png" % (name, width, suffix)),
                                 output_width=width * scale)
    print("%d icons x %d states x 2, %d brand marks" % (len(ICONS), len(STATES), len(BRAND)))


if __name__ == "__main__":
    sys.exit(main())
