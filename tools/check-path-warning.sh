#!/usr/bin/env bash
#
# End-to-end check of the "path cannot be passed to the simulator" warning
# (edu/edu_path_check.h) using a CONFIG+=edu_devtools build.
#
#   tools/check-path-warning.sh [-b BUILD_DIR] [-o OUT_DIR]
#
# On a UTF-8 Linux system every path is representable, so the warning is
# provoked by telling the build to pretend the system encoding is
# ISO-8859-1 (--local-codec).  The same file is then loaded without that
# pretence to show the check does not get in the way of a normal load.

set -euo pipefail

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
build="$repo/build"
out=""
while getopts ":b:o:h" opt; do
  case "$opt" in
    b) build=$OPTARG ;;
    o) out=$OPTARG ;;
    h) sed -n '2,14p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option -$OPTARG" >&2; exit 2 ;;
  esac
done

app="$build/HallymMIPS"
if [ ! -x "$app" ] || [ "$(strings "$app" | grep -c -F -- '--local-codec' || true)" -eq 0 ]; then
  echo "$app is missing or was not built with CONFIG+=edu_devtools" >&2
  exit 1
fi

if [ -z "$out" ]; then
  out=$(mktemp -d -t hallym-mips-pathcheck-XXXXXX)
fi
mkdir -p "$out"

# A Korean directory name, as a student's Windows user name would give.
korean_dir="$out/한글 경로"
mkdir -p "$korean_dir"
cp "$repo/helloworld.s" "$korean_dir/helloworld.s"

failures=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; failures=$((failures + 1)); }

run() {  # run LOGFILE ARGS...
  local log=$1; shift
  XDG_CONFIG_HOME="$out/config" QT_QPA_PLATFORM=offscreen \
    timeout 60 "$app" "$@" >"$log" 2>&1 || true
}

echo "== 1. system encoding cannot carry the path (pretend ISO-8859-1)"
# --load-cmdline: with the pretended encoding Qt's own file dialog cannot see
# the Korean directory either, so the menu route (--load) cannot get as far
# as our check here.  Both routes call the same edu::confirmPathLoadable().
run "$out/warn.stdout" --local-codec ISO-8859-1 --dialog-shots "$out/shots" \
    --load-cmdline "$korean_dir/helloworld.s" --run \
    --dump console "$out/warn.console" --dump log "$out/warn.log"

if grep -q "cannot be passed to the simulator" "$out/warn.stdout"; then
  pass "warning dialog was shown"
else
  fail "no warning dialog:"; head -20 "$out/warn.stdout"
fi
# The dialog must name the actual encoding, not a Qt alias such as "System".
if grep -q "System text encoding: ISO-8859-1" "$out/warn.stdout"; then
  pass "dialog names the encoding (ISO-8859-1)"
else
  fail "dialog does not name the encoding:"; grep "dialog:" "$out/warn.stdout" | head -3
fi
if grep -q "Cannot open file" "$out/warn.log"; then
  fail "the core still tried to open the file (log has 'Cannot open file')"
else
  pass "load was skipped, no core error"
fi
if [ ! -s "$out/warn.console" ]; then
  pass "nothing ran (console empty)"
else
  fail "console is not empty:"; cat "$out/warn.console"
fi
if ls "$out"/shots/dialog-*.png >/dev/null 2>&1; then
  pass "dialog screenshot: $(ls "$out"/shots/dialog-*.png | head -1)"
else
  fail "no dialog screenshot written"
fi

echo
echo "== 2. real system encoding ($(locale charmap 2>/dev/null || echo '?'))"
run "$out/ok.stdout" --load "$korean_dir/helloworld.s" --run \
    --dump console "$out/ok.console"
if grep -q "cannot be passed to the simulator" "$out/ok.stdout"; then
  fail "warning shown although the path is representable"
else
  pass "no warning"
fi
if [ "$(cat "$out/ok.console")" = "Hello World" ]; then
  pass "program ran from the Korean path"
else
  fail "unexpected console output:"; cat "$out/ok.console"; head -20 "$out/ok.stdout"
fi

echo
if [ "$failures" -eq 0 ]; then echo "all checks passed"; else echo "$failures check(s) failed"; fi
echo "outputs in $out"
exit $((failures == 0 ? 0 : 1))
