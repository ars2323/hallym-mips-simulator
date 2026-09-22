#!/usr/bin/env python3
"""Render the theme's SVG sources to the PNGs the program embeds.

    tools/make-theme-icons.py

Tool bar icons: QtSpim/edu/theme/icons/lucide/<name>.svg (stroke="currentColor")
-> QtSpim/edu/theme/icons/png/<name>-<state>.png and <name>-<state>@2x.png at
the token icon size, in the token colours (state = normal / active / disabled).
Brand marks: QtSpim/edu/theme/brand/<name>.svg -> <name>-<width>.png and
<name>-<width>@2x.png at the widths edu_theme.cpp asks for.  The application
icon (app-<size>.png, HallymMIPS.ico, HallymMIPS.icns) and the three-way
comparison sheet docs/design/captures/app-icon-options.png come from here
too: 16 px carries the symbol, the larger sizes the circular emblem.

The colours and sizes are read from QtSpim/edu/theme/tokens.h so that this
file never holds a value of its own.  Needs cairosvg (pip install cairosvg).
The PNGs are committed; the program has no SVG renderer at run time.
"""
import os
import re
import sys

import io
import struct

import cairosvg
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
THEME = os.path.join(ROOT, "QtSpim", "edu", "theme")

ICONS = ["folder-open", "refresh-cw", "save", "printer", "eraser", "rotate-ccw",
         "play", "pause", "square", "step-forward", "settings",
         "circle-question-mark", "hammer", "file-plus", "file-text"]
STATES = {"normal": "kNavy", "active": "kBlue", "disabled": "kGray"}
BRAND = {"emblem-a-navy": [112], "logotype-ko-en": [220],
         "signature-h-ko-en": [260, 320], "symbol-basic": [64]}

# The application icon.  At 16 px the emblem's ring of lettering turns to
# mush, so that size gets the plain symbol; every larger size gets the
# circular emblem, which is what people recognise in a task bar.  Both are
# official marks, used whole -- only scaled and padded.
APPICON = [(16, "symbol-basic"), (24, "emblem-a-navy"), (32, "emblem-a-navy"),
           (48, "emblem-a-navy"), (64, "emblem-a-navy"), (256, "emblem-a-navy")]


def tokens():
    text = open(os.path.join(THEME, "tokens.h"), encoding="utf-8").read()
    colours = {m.group(1): "#" + m.group(2)
               for m in re.finditer(r"const QRgb (k\w+) = 0xff([0-9a-f]{6});", text)}
    size = int(re.search(r"const int kToolIconSize = (\d+);", text).group(1))
    return colours, size


def app_icon(mark, size):
    """One square icon: the mark scaled to fit, centred, transparent around."""
    pad = max(0, size // 32)
    inner = size - 2 * pad
    png = cairosvg.svg2png(url=os.path.join(THEME, "brand", mark + ".svg"),
                           output_width=inner * 4)
    im = Image.open(io.BytesIO(png)).convert("RGBA")
    im.thumbnail((inner, inner), Image.LANCZOS)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return out


def write_ico(images, path):
    """An .ico whose entries are different images, which Pillow cannot do:
    its sizes= argument rescales one image for every entry, and the whole
    point here is that 16 px carries a different mark."""
    payloads = []
    for size, image in images:
        buffer = io.BytesIO()
        image.save(buffer, format="PNG")
        payloads.append((size, buffer.getvalue()))
    header = struct.pack("<HHH", 0, 1, len(payloads))
    offset = 6 + 16 * len(payloads)
    entries, blob = b"", b""
    for size, data in payloads:
        entries += struct.pack("<BBBBHHII", size if size < 256 else 0,
                               size if size < 256 else 0, 0, 0, 1, 32,
                               len(data), offset)
        blob += data
        offset += len(data)
    with open(path, "wb") as f:
        f.write(header + entries + blob)


def comparison_sheet(path):
    """Three ways to fill the .ico, at the sizes Windows actually asks for."""
    sizes = [16, 24, 32, 48]
    options = [("(a) symbol at every size", lambda s: "symbol-basic"),
               ("(b) symbol at 16, emblem above",
                lambda s: "symbol-basic" if s == 16 else "emblem-a-navy"),
               ("(c) emblem at every size", lambda s: "emblem-a-navy")]
    zoom, head, label, cell = 4, 40, 110, 48 * 4 + 40
    width = label + len(options) * cell
    row_heights = [size * zoom + 28 for size in sizes]
    height = head + sum(row_heights)
    sheet = Image.new("RGB", (width, height), "#FFFFFF")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.truetype(os.path.join(THEME, "fonts", "Pretendard-Medium.otf"), 15)
    small = ImageFont.truetype(os.path.join(THEME, "fonts", "Pretendard-Regular.otf"), 12)

    for column, (title, _) in enumerate(options):
        draw.text((label + column * cell + 12, 12), title, fill="#00205B", font=font)
    row = head
    for index, size in enumerate(sizes):
        draw.text((12, row + 4), "%d px" % size, fill="#1F2933", font=font)
        draw.text((12, row + 24), "shown %dx" % zoom, fill="#5B6B7B", font=small)
        for column, (_, rule) in enumerate(options):
            icon = app_icon(rule(size), size)
            flat = Image.new("RGB", icon.size, "#FFFFFF")
            flat.paste(icon, (0, 0), icon)
            big = flat.resize((size * zoom, size * zoom), Image.NEAREST)
            sheet.paste(big, (label + column * cell + (cell - big.width) // 2, row))
        draw.line([(0, row + row_heights[index] - 14),
                   (width, row + row_heights[index] - 14)], fill="#E1E5EA")
        row += row_heights[index]
    sheet.save(path)


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
    for size, mark in APPICON:
        app_icon(mark, size).save(os.path.join(THEME, "brand", "app-%d.png" % size))
    write_ico([(size, app_icon(mark, size)) for size, mark in APPICON],
              os.path.join(THEME, "brand", "HallymMIPS.ico"))
    icns = [app_icon("emblem-a-navy", s) for s in (1024, 512, 256, 128, 64, 32, 16)]
    icns[0].save(os.path.join(THEME, "brand", "HallymMIPS.icns"),
                 append_images=icns[1:])
    for name, widths in BRAND.items():
        src = os.path.join(THEME, "brand", name + ".svg")
        for width in widths:
            for scale, suffix in ((1, ""), (2, "@2x")):
                cairosvg.svg2png(url=src,
                                 write_to=os.path.join(THEME, "brand", "%s-%d%s.png" % (name, width, suffix)),
                                 output_width=width * scale)
    comparison_sheet(os.path.join(ROOT, "docs", "design", "captures",
                                  "app-icon-options.png"))
    print("%d icons x %d states x 2, %d brand marks" % (len(ICONS), len(STATES), len(BRAND)))


if __name__ == "__main__":
    sys.exit(main())
