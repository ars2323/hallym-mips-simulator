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

echo
echo "screenshots in $out"
