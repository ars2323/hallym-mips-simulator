#!/usr/bin/env bash
#
# Capture a theme mock-up (PLAN stage H1) in the agreed state:
# 1920x1080, helloworld.s assembled from the editor and run to the end,
# Window > Layout > Editor | Text, one instruction selected so that the
# inspector is filled.  Three PNGs per mock-up: the window, the register
# panel + inspector, the Text panel; plus the window at 1366x768.
#
#   tools/capture-theme.sh -t docs/design/mockups/A-campus.tokens -o OUT_DIR
#                          [-b BUILD_DIR] [-c CONFIG_DIR]
#
# The QSS is docs/design/mockups/common.qss.in with the @name@ placeholders
# replaced from the tokens file.  The panel fonts (D2Coding) are settings, so
# a private XDG_CONFIG_HOME with a prepared HallymMIPS.conf is used (-c);
# without -c one is made with D2Coding 10pt and the teal changed-value colour.
# Needs a CONFIG+=edu_devtools build and the bundled fonts under
# QtSpim/edu/theme/fonts.
#
# Linux only: fontconfig classes D2Coding as "dual" spacing (Hangul is two
# cells wide), so Qt's QFontInfo::fixedPitch() is false and the inspector
# falls back to another font.  The font itself says it is monospaced
# (post.isFixedPitch=1, PANOSE proportion 9), which is what Windows reads, so
# a private fonts.conf declares it mono here to match.

set -euo pipefail

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
build="$repo/build"
tokens=""
out=""
config=""

while getopts ":b:t:o:c:h" opt; do
  case "$opt" in
    b) build=$OPTARG ;;
    t) tokens=$OPTARG ;;
    o) out=$OPTARG ;;
    c) config=$OPTARG ;;
    h) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option -$OPTARG" >&2; exit 2 ;;
  esac
done
[ -n "$tokens" ] && [ -n "$out" ] || { echo "need -t TOKENS -o OUT_DIR" >&2; exit 2; }

app="$build/HallymMIPS"
[ -x "$app" ] || { echo "no executable at $app" >&2; exit 1; }
mkdir -p "$out"

# QSS from the template and the tokens.
qss="$out/theme.qss"
cp "$repo/docs/design/mockups/common.qss.in" "$qss"
while IFS='=' read -r key value; do
  [ -n "$key" ] && [ "${key#\#}" = "$key" ] || continue
  sed -i "s|@$key@|$value|g" "$qss"
done < "$tokens"
if grep -q '@[a-z-]*@' "$qss"; then
  echo "unreplaced placeholders:" >&2; grep -o '@[a-z-]*@' "$qss" | sort -u >&2; exit 1
fi

# Icons in the token colours.
icons="$out/icons"
python3 "$repo/tools/make-theme-icons.py" "$icons" > /dev/null

# Panel font and changed-value colour are settings.
if [ -z "$config" ]; then
  config="$out/config"
  mkdir -p "$config/HallymMIPS"
  cat > "$config/HallymMIPS/HallymMIPS.conf" <<'CONF'
[RegWin]
Font="D2Coding,10,-1,5,50,0,0,0,1,0"
ChangedRegColor=#00736F

[TextWin]
Font="D2Coding,10,-1,5,50,0,0,0,1,0"
CONF
fi

# A copy of the fonts: fontconfig writes a .uuid file into every directory it
# scans, which must not land in the source tree.
fonts="$out/fonts"
mkdir -p "$fonts" "$out/fc-cache"
cp "$repo"/QtSpim/edu/theme/fonts/*.ttf "$repo"/QtSpim/edu/theme/fonts/*.otf "$fonts/"
fontsconf="$out/fonts.conf"
cat > "$fontsconf" <<CONF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <include ignore_missing="yes">/etc/fonts/fonts.conf</include>
  <dir>$fonts</dir>
  <cachedir>$out/fc-cache</cachedir>
  <match target="scan">
    <test name="family"><string>D2Coding</string></test>
    <edit name="spacing" mode="assign"><const>mono</const></edit>
  </match>
</fontconfig>
CONF
export FONTCONFIG_FILE="$fontsconf"

theme=(--font-dir "$fonts" --ui-font "Pretendard,13px"
       --qss "$qss" --icon-dir "$icons")
state=(--editor-open "$repo/helloworld.s" --assemble
       --trigger action_Edu_LayoutPrimary --run --select-instruction 00400028)

XDG_CONFIG_HOME="$config" QT_QPA_PLATFORM=offscreen "$app" "${theme[@]}" "${state[@]}" \
  --window-size 1920x1080 \
  --capture window --out "$out/window.png" \
  --capture intregs --out "$out/intregs.png" \
  --capture inspector --out "$out/inspector.png" \
  --capture text --out "$out/text.png"

XDG_CONFIG_HOME="$config" QT_QPA_PLATFORM=offscreen "$app" "${theme[@]}" "${state[@]}" \
  --window-size 1366x768 --capture window --out "$out/window-1366.png"

echo "mock-up in $out"
