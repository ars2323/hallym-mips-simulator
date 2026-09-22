#!/usr/bin/env python3
"""Colour the Lucide icons for the tool bar.

    tools/make-theme-icons.py OUT_DIR

Reads QtSpim/edu/theme/icons/lucide/<name>.svg (stroke="currentColor") and
writes OUT_DIR/<action object name>.svg, .active.svg and .disabled.svg in the
token colours (docs/design/tokens.md: icon default / hover / disabled).
The mapping below is the one the tool bar uses.
"""
import os
import re
import sys

ACTIONS = {
    "action_File_Load": "folder-open",
    "action_File_Reload": "refresh-cw",
    "action_File_SaveLog": "save",
    "action_File_Print": "printer",
    "action_Sim_ClearRegisters": "eraser",
    "action_Sim_Reinitialize": "rotate-ccw",
    "action_Sim_Run": "play",
    "action_Sim_Pause": "pause",
    "action_Sim_Stop": "square",
    "action_Sim_SingleStep": "step-forward",
    "action_Sim_Settings": "settings",
    "action_Help_ViewHelp": "circle-question-mark",
    "action_Edu_Assemble": "hammer",
}

# icon.default / icon.hover / icon.disabled
COLOURS = {"": "#00205B", ".active": "#0055A5", ".disabled": "#BCBEC0"}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = sys.argv[1]
    src = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                       "QtSpim", "edu", "theme", "icons", "lucide")
    os.makedirs(out, exist_ok=True)
    for action, icon in ACTIONS.items():
        with open(os.path.join(src, icon + ".svg"), encoding="utf-8") as f:
            svg = f.read()
        assert 'stroke="currentColor"' in svg, icon
        for suffix, colour in COLOURS.items():
            coloured = svg.replace('stroke="currentColor"', 'stroke="%s"' % colour)
            coloured = re.sub(r"\s*\n\s*", " ", coloured).strip() + "\n"
            with open(os.path.join(out, action + suffix + ".svg"), "w",
                      encoding="utf-8") as f:
                f.write(coloured)
    print("%d icons x %d states -> %s" % (len(ACTIONS), len(COLOURS), out))


if __name__ == "__main__":
    main()
