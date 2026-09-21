#!/usr/bin/env bash
#
# Regenerate tests/golden/intregs-*.txt from a CONFIG+=edu_devtools build.
#
#   tools/capture-goldens.sh [-b BUILD_DIR]
#
# ONLY meaningful on a build whose Save Log File output is known to be
# upstream's -- the committed goldens came from the commit before the
# register panel was replaced.  tools/regress.sh check 4 replays exactly the
# same cases under exactly the same environment and compares.
#
# The environment is pinned because SPIM copies the process environment onto
# the simulated stack, which moves $sp, $a1 and $a2.

set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
build="$repo/build"
while getopts ":b:" opt; do
  case "$opt" in b) build=$OPTARG ;; *) echo "usage: $0 [-b BUILD_DIR]" >&2; exit 2 ;; esac
done
app="$build/QtSpimEdu"
fixed_env=(env -i QT_QPA_PLATFORM=offscreen HOME=/nonexistent
           XDG_CONFIG_HOME=/nonexistent/config)
cases=(
  "intregs-load|"
  "intregs-step1|--steps 1"
  "intregs-run|--run"
  "intregs-run-base2|--reg-base 2 --run"
  "intregs-run-base10|--reg-base 10 --run"
)
for entry in "${cases[@]}"; do
  IFS='|' read -r name args <<<"$entry"
  "${fixed_env[@]}" timeout 120 "$app" --load "$repo/helloworld.s" $args \
    --dump intregs-log "$repo/tests/golden/$name.txt" >/dev/null 2>&1
  echo "captured tests/golden/$name.txt"
done
