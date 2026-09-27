"""The installer's and uninstaller's sidebar (NSIS welcome/finish pages,
164x314, 24-bit BMP) in the app's own look, instead of electron-builder's
default drawing:

  - the brand's navy, a little lighter towards the bottom;
  - the Hallym University symbol, as it is (colours, proportions and
    elements unchanged: assets/hallym/README.md), on a white plate with
    clear space around it, since its blue would be lost on navy;
  - the program's name in Pretendard, white.  No Korean: the name is
    "Hallym MIPS".

    python3 tools/installer-art.py

Writes packaging/installerSidebar.bmp and packaging/uninstallerSidebar.bmp
(tools/package.ts).  Needs Pillow and cairosvg.
"""

import io
import os

import cairosvg
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
SYMBOL = os.path.join(ROOT, 'src/renderer/assets/hallym/marks/symbol-basic.svg')
FONT = os.path.join(ROOT, '../QtSpim/edu/theme/fonts/Pretendard-Bold.otf')
W, H = 164, 314
NAVY, NAVY_2 = (0, 32, 91), (6, 48, 120)
SCALE = 4  # drawn at 4x, then reduced: smooth edges


def sidebar() -> Image.Image:
    w, h = W * SCALE, H * SCALE
    img = Image.new('RGB', (w, h))
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        c = tuple(round(a + (b - a) * t) for a, b in zip(NAVY, NAVY_2))
        for x in range(w):
            px[x, y] = c
    draw = ImageDraw.Draw(img)
    # The white plate, and the symbol in it with about 13 % of its height clear on every side.
    plate = (18 * SCALE, 40 * SCALE, (W - 18) * SCALE, 112 * SCALE)
    draw.rounded_rectangle(plate, radius=10 * SCALE, fill=(255, 255, 255))
    sym_w = (plate[2] - plate[0]) - 2 * 16 * SCALE
    png = cairosvg.svg2png(url=SYMBOL, output_width=sym_w)
    sym = Image.open(io.BytesIO(png)).convert('RGBA')
    img.paste(sym, (plate[0] + 16 * SCALE, (plate[1] + plate[3] - sym.height) // 2), sym)
    font = ImageFont.truetype(FONT, 17 * SCALE)
    text = 'Hallym MIPS'
    tw = draw.textlength(text, font=font)
    draw.text(((w - tw) / 2, 128 * SCALE), text, font=font, fill=(255, 255, 255))
    # A short teal rule under the name (the app's teal, #00A9A5).
    draw.rounded_rectangle(((w - 28 * SCALE) / 2, 158 * SCALE, (w + 28 * SCALE) / 2, 160 * SCALE), radius=SCALE, fill=(0, 169, 165))
    return img.resize((W, H), Image.LANCZOS)


if __name__ == '__main__':
    art = sidebar()
    for name in ('installerSidebar.bmp', 'uninstallerSidebar.bmp'):
        out = os.path.join(ROOT, 'packaging', name)
        art.save(out, 'BMP')
        print(f'{os.path.relpath(out, ROOT)}  {os.path.getsize(out)} bytes')
