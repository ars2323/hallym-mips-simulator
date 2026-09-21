#!/usr/bin/env bash
#
# Capture every panel of a QtSpim-Edu development build into PNGs.
#
#   tools/capture-panels.sh [-b BUILD_DIR] [-f FILE.s] [-n STEPS] [-o OUT_DIR]
#
# Defaults: build/, helloworld.s, 3 steps, into a temporary directory whose
# path is printed at the end.
#
# The build has to be configured with development tools:
#
#   mkdir -p build && cd build
#   qmake CONFIG+=edu_devtools ../QtSpim/QtSpim.pro && make -j"$(nproc)"
#
# Captures run under the offscreen Qt platform plugin, whose fonts, DPI and
# theme differ from a real desktop. Use them to check content and layout,
# not final appearance.

set -euo pipefail

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
build="$repo/build"
file="$repo/helloworld.s"
steps=3
out=""

while getopts ":b:f:n:o:h" opt; do
  case "$opt" in
    b) build=$OPTARG ;;
    f) file=$OPTARG ;;
    n) steps=$OPTARG ;;
    o) out=$OPTARG ;;
    h) sed -n '2,20p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option -$OPTARG" >&2; exit 2 ;;
  esac
done

app="$build/QtSpimEdu"
if [ ! -x "$app" ]; then
  echo "no executable at $app -- build first (see -h)" >&2
  exit 1
fi

# A build without CONFIG+=edu_devtools has no --capture and would pop up a
# modal "Unknown argument" box instead, which would hang this script.
# grep -c rather than grep -q: -q exits early, and under "set -o pipefail"
# the SIGPIPE that gives strings would fail the whole pipeline.
if [ "$(strings "$app" | grep -c -F -- '--capture' || true)" -eq 0 ]; then
  echo "$app was not built with CONFIG+=edu_devtools" >&2
  exit 1
fi

if [ -z "$out" ]; then
  out=$(mktemp -d -t qtspim-edu-shots-XXXXXX)
fi
mkdir -p "$out"

args=(--load "$file" --steps "$steps" --select-register pc)
for panel in intregs inspector fpregs text data log console window about; do
  args+=(--capture "$panel" --out "$out/$panel.png")
done

QT_QPA_PLATFORM=offscreen "$app" "${args[@]}"

# Text panel and instruction inspector (PLAN R3).  The addresses are those of
# helloworld.s, so this part only runs for the default file.
if [ "$file" = "$repo/helloworld.s" ]; then
  shot() {  # shot NAME [app options...]
    local name=$1; shift
    QT_QPA_PLATFORM=offscreen "$app" "$@" --window-size 1920x1080 \
      --capture window --out "$out/$name-window.png" \
      --capture inspector --out "$out/$name-inspector.png" \
      --capture text --out "$out/$name-text.png"
  }
  shot r3-syscall --load "$file" --steps 7 --select-instruction 0040002c
  shot r3-lw      --load "$file" --steps 7 --select-instruction 00400030
  shot r3-jal     --load "$file" --steps 7 --select-instruction 00400014
  shot r3-breakpoints-kernel --load "$file" --steps 3 --expand-kernel \
    --click-bp 00400024 --click-bp 00400030
  # Default mode branch (note about SPIM's PC-based offsets) and pseudo
  # instruction bands, then a Bare Machine branch (PC+4, no note).
  shot r3-bne-default --load "$repo/Tests/tt.core.s" \
    --select-instruction 00400080
  shot r3-bne-bare -bare -noexception --load "$repo/tests/samples/bare-branch.s" \
    --select-instruction 00400008
fi

echo
echo "screenshots in $out"
