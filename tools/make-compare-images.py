#!/usr/bin/env python3
"""Rebuild docs/images/compare/*.png (and en/) for the current build.

    tools/make-compare-images.py [-b BUILD_DIR]

Each image is standard QtSpim 9.1.24 on the left and this program on the
right, same file (helloworld.s), same steps, 1600x900 window.  The left halves
are the captures made for QtSpim-Edu 1.0.0 (commit 8f61a4d: vanilla through a
probe patched into a scratch worktree, environment USER=student); vanilla has
not changed, so they are reused from git.  Only the right halves are captured
here, with the CONFIG+=edu_devtools build.  Needs Pillow.
"""
import argparse
import io
import os
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
LEFT_REV = "qtspim-edu-1.0.1"       # the images with the old right halves
FONT = os.path.join(REPO, "QtSpim", "edu", "theme", "fonts", "Pretendard-Medium.otf")
NAVY, GRAY, WHITE = "#00205B", "#5A5A5A", "#FFFFFF"
BAR = 36
VERSION = None


def version():
    for line in open(os.path.join(REPO, "QtSpim", "edu", "edu_version.h")):
        if line.startswith("#define EDU_VERSION "):
            return line.split('"')[1]
    sys.exit("EDU_VERSION not found")


def old_image(name):
    data = subprocess.check_output(["git", "-C", REPO, "show",
                                    "%s:docs/images/compare/%s" % (LEFT_REV, name)])
    return Image.open(io.BytesIO(data)).convert("RGB")


def capture(app, out, args, env):
    cmd = [app, "--window-size", "1600x900"] + args
    subprocess.run(cmd, check=True, env=env, stdout=subprocess.DEVNULL,
                   stderr=subprocess.DEVNULL)


def label(width, text, colour):
    bar = Image.new("RGB", (width, BAR), colour)
    draw = ImageDraw.Draw(bar)
    draw.text((12, 8), text, fill=WHITE, font=ImageFont.truetype(FONT, 17))
    return bar


def compose(left, right, left_text, right_text):
    # Same height as the old image; the right half keeps the old width.
    half = left.width // 2
    right = right.convert("RGB")
    if right.width > half:
        right = right.crop((0, 0, half, right.height))
    canvas = Image.new("RGB", (left.width, left.height), WHITE)
    canvas.paste(left.crop((0, 0, half, left.height)), (0, 0))
    panel = Image.new("RGB", (half, left.height - BAR), WHITE)
    panel.paste(right.crop((0, 0, min(right.width, half), min(right.height, left.height - BAR))), (0, 0))
    canvas.paste(label(half, right_text, NAVY), (half, 0))
    canvas.paste(panel, (half, BAR))
    # The old left label (Korean or English) is kept as it was.
    del left_text
    return canvas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-b", default=os.path.join(REPO, "build"))
    opts = ap.parse_args()
    app = os.path.join(opts.b, "HallymMIPS")
    if not os.access(app, os.X_OK):
        sys.exit("no executable at " + app + " (CONFIG+=edu_devtools build)")
    ver = version()
    work = tempfile.mkdtemp(prefix="hallym-compare-")
    env = dict(os.environ, QT_QPA_PLATFORM="offscreen", USER="student",
               XDG_CONFIG_HOME=os.path.join(work, "config"),
               HOME="/nonexistent")
    hello = os.path.join(REPO, "helloworld.s")
    errors = os.path.join(REPO, "tests", "samples", "editor-errors.s")
    shots = {
        "01-registers": (["--load", hello, "--run", "--capture", "intregs"], None),
        "02-text": (["--load", hello, "--steps", "9", "--capture", "text"], None),
        "03-inspector": (["--load", hello, "--steps", "9", "--select-instruction", "00400030",
                          "--capture", "text", "--out", os.path.join(work, "03-text.png"),
                          "--capture", "inspector"], "inspector"),
        "04-data": (["--load", hello, "--raise", "data", "--capture", "data"], None),
        "05-editor": (["--editor-open", errors, "--assemble", "--capture", "editor"], None),
    }
    for lang, right_text in (("", "Hallym MIPS Simulator " + ver),
                             ("en", "Hallym MIPS Simulator " + ver)):
        for name, (args, kind) in shots.items():
            out = os.path.join(work, name + ".png")
            capture(app, out, args + ["--out", out], env)
            right = Image.open(out)
            if kind == "inspector":
                # Three Text rows around the selected instruction, then the
                # inspector, then a caption -- as the 1.0.0 image was laid out.
                text = Image.open(os.path.join(work, "03-text.png")).convert("RGB")
                # The selected row is the one painted in the selection tint
                # (tokens.h kBlueTint2); take it with a row above and below.
                tint = (0xD3, 0xE2, 0xF3)
                selected = next(y for y in range(text.height)
                                if text.getpixel((text.width // 2, y)) == tint)
                top = max(0, selected - 20)
                rows = text.crop((0, top, text.width, top + 60))
                insp = Image.open(out).convert("RGB")
                right = Image.new("RGB", (text.width, 66 + insp.height + 40), WHITE)
                right.paste(rows, (0, 0))
                right.paste(insp, (0, 66))
                draw = ImageDraw.Draw(right)
                caption = ("Fields of the selected instruction (Inspector)" if lang
                           else "선택한 명령어의 필드 분해 (Inspector)")
                draw.text((8, 66 + insp.height + 8), caption, fill="#1F2933",
                          font=ImageFont.truetype(FONT, 15))
            old_name = ("en/" if lang else "") + name + ".png"
            left = old_image(old_name)
            image = compose(left, right, None, right_text)
            dest = os.path.join(REPO, "docs", "images", "compare", old_name)
            image.save(dest)
            print("wrote", os.path.relpath(dest, REPO), image.size)


if __name__ == "__main__":
    main()
