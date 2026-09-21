#!/usr/bin/env bash
#
# Build the release configuration into build-release/ and add (or refresh) a
# "QtSpim-Edu" entry in the desktop's application menu for the current user.
#
#   tools/install-linux-launcher.sh            build + install the menu entry
#   tools/install-linux-launcher.sh --remove   remove the menu entry
#
# The entry points at this checkout's build-release/QtSpimEdu, so re-run the
# script after pulling or changing code to rebuild what the menu starts.
# Nothing is installed system-wide and nothing in the source tree changes
# (build-release/ is git-ignored).

set -euo pipefail

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
desktop="$apps/qtspim-edu.desktop"

if [ "${1:-}" = "--remove" ]; then
  rm -f "$desktop"
  command -v update-desktop-database >/dev/null && update-desktop-database "$apps" || true
  echo "removed $desktop"
  exit 0
fi

build="$repo/build-release"
mkdir -p "$build"
( cd "$build" && qmake "$repo/QtSpim/QtSpim.pro" && make -j"$(nproc)" ) >"$build/build.log" 2>&1 \
  || { tail -30 "$build/build.log" >&2; echo "build failed, see $build/build.log" >&2; exit 1; }

mkdir -p "$apps"
cat >"$desktop" <<EOF
[Desktop Entry]
Type=Application
Name=QtSpim-Edu
GenericName=MIPS Simulator
Comment=Educational fork of the QtSpim MIPS32 simulator
Exec="$build/QtSpimEdu" %F
Icon=$repo/Setup/NewIcon256x256.png
Terminal=false
Categories=Education;
StartupWMClass=QtSpimEdu
EOF
chmod 644 "$desktop"
command -v update-desktop-database >/dev/null && update-desktop-database "$apps" || true

echo "built    $build/QtSpimEdu"
echo "launcher $desktop"
