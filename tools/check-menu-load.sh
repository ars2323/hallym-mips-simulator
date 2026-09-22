#!/usr/bin/env bash
#
# Loads files the way a user does -- File > Load File and File > Reinitialize
# and Load File, through the real QActions and SpimView::file_LoadFile() /
# file_ReloadFile() -- and checks what the assembler says.
#
#   tools/check-menu-load.sh [-b BUILD_DIR] [--compare-vanilla]
#
# Part 1 (always; needs a CONFIG+=edu_devtools build):
#   a. Load File once                       -> no error, program is there
#   b. Reinitialize and Load File once      -> no error
#   c. Reinitialize and Load File twice     -> no error
#   d. Load File, then Reinitialize and Load-> no error
#   e. the text segment after (a)/(b) is the one a command-line load gives
#   f. Load File twice, answering "Add to current program" to the question
#      QtSpim-Edu asks (= what upstream does unasked) -> exactly upstream's error,
#      "Label is defined for the second time ... main".  That one is the
#      core's doing (a global label is still in the symbol table) and
#      vanilla QtSpim shows it for the same clicks; it is pinned here so that
#      a change in either direction is noticed.
#   g. Load File twice, answering "Reinitialize and load" -> no error
#   h. Load File twice, answering Cancel -> no error, first program intact
#   i. the question is asked exactly when a program is loaded and the action
#      is Load File
#
# Part 2 (--compare-vanilla; slow, builds two GUIs): the same click sequences
# on a vanilla-9.1.24 worktree and on a worktree of HEAD, both instrumented
# by tools/menu-probe.py, with default settings and with Settings > Bare
# Machine on.  The message boxes must be the same, word for word.

set -euo pipefail

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
build="$repo/build"
compare=0
while [ $# -gt 0 ]; do
  case "$1" in
    -b) build=$2; shift 2 ;;
    --compare-vanilla) compare=1; shift ;;
    -h|--help) sed -n '2,26p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option $1" >&2; exit 2 ;;
  esac
done

app="$build/HallymMIPS"
if [ ! -x "$app" ] || [ "$(strings "$app" | grep -c -F -- '--load-cmdline' || true)" -eq 0 ]; then
  echo "$app is missing or was not built with CONFIG+=edu_devtools" >&2
  exit 1
fi

work=$(mktemp -d -t hallym-mips-menuload-XXXXXX)
file="$repo/helloworld.s"
failures=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; failures=$((failures + 1)); }

# Pinned environment, fresh settings for every run.
harness() {  # harness NAME ARGS...  -> $work/NAME.out, $work/NAME.text
  local name=$1; shift
  rm -rf "$work/config"
  env -i QT_QPA_PLATFORM=offscreen HOME=/nonexistent \
      XDG_CONFIG_HOME="$work/config" timeout 120 "$app" "$@" \
      --dump text-log "$work/$name.text" >"$work/$name.out" 2>&1 || true
}
dialogs() { grep -c '^dialog:' "$work/$1.out" || true; }

echo "== 1. the menu actions (development harness)"
harness cmdline --load-cmdline "$file"
harness load    --load "$file"
harness reload  --reload "$file"
harness reload2 --reload "$file" --reload "$file"
harness loadreload --load "$file" --reload "$file"
harness load2   --load "$file" --load "$file"
harness load2reinit --load "$file" --load-answer reinit --load "$file"
harness load2cancel --load "$file" --load-answer cancel --load "$file"

for case in load reload reload2 loadreload load2reinit load2cancel; do
  if [ "$(dialogs $case)" -eq 0 ]; then
    pass "$case: no error dialog"
  else
    fail "$case: $(grep '^dialog:' "$work/$case.out" | head -2)"
  fi
  if [ -s "$work/$case.text" ] && cmp -s "$work/$case.text" "$work/cmdline.text"; then
    pass "$case: text segment is the command-line load's"
  else
    fail "$case: text segment differs from a command-line load (or is missing)"
  fi
done

if [ "$(dialogs load2)" -eq 1 ] &&
   grep -q '^dialog: spim: (parser) Label is defined for the second time on line 40 of file .*helloworld.s main:' "$work/load2.out"; then
  pass "load2: upstream's 'Label is defined for the second time ... main' and nothing else"
else
  fail "load2: expected exactly upstream's duplicate-label error, got:"
  grep '^dialog:' "$work/load2.out" | head -5
fi

# Hallym MIPS Simulator (as QtSpim-Edu did) asks before loading on top of a loaded program (PLAN decision
# "Load File 확인"); the three answers are the cases load2 (the harness's
# default answer, "Add to current program"), load2reinit and load2cancel.
questions() { grep -c '^load question:' "$work/$1.out" || true; }
for case in load2 load2reinit load2cancel; do
  if [ "$(questions $case)" -eq 1 ]; then
    pass "$case: asked once whether to reinitialize"
  else
    fail "$case: expected one question, got $(questions $case)"
  fi
done
for case in load reload reload2 loadreload; do
  if [ "$(questions $case)" -eq 0 ]; then
    pass "$case: not asked"
  else
    fail "$case: asked, but nothing was loaded (or it was a Reinitialize and Load)"
  fi
done

if [ "$compare" -eq 1 ]; then
  echo
  echo "== 2. same clicks on vanilla-9.1.24 and on HEAD (tools/menu-probe.py)"
  for rev in vanilla-9.1.24 HEAD; do
    rm -rf "$work/src-$rev"
    git -C "$repo" worktree add -f --detach "$work/src-$rev" "$rev" >/dev/null 2>&1
    "$repo/tools/menu-probe.py" "$work/src-$rev"
    mkdir -p "$work/build-$rev"
    ( cd "$work/build-$rev" && qmake "$work/src-$rev/QtSpim/QtSpim.pro" >/dev/null 2>&1 &&
      make -j"$(nproc)" >make.log 2>&1 ) || { fail "$rev did not build"; }
  done

  probe() {  # probe REV STEPS BARE -> prints the DIALOG lines
    local rev=$1 steps=$2 bare=$3
    local bin="$work/build-$rev/HallymMIPS"
    [ -x "$bin" ] || bin="$work/build-$rev/QtSpimEdu"
    [ -x "$bin" ] || bin="$work/build-$rev/QtSpim"
    rm -rf "$work/pconfig"
    if [ "$bare" = bare ]; then   # what Settings > Bare Machine saves
      for dir in LarusStone/QtSpim.conf QtSpim-Edu/QtSpimEdu.conf HallymMIPS/HallymMIPS.conf; do
        mkdir -p "$work/pconfig/$(dirname $dir)"
        printf '[Spim]\nBareMachine=true\n' >"$work/pconfig/$dir"
      done
    fi
    env -i QT_QPA_PLATFORM=offscreen HOME=/nonexistent \
        XDG_CONFIG_HOME="$work/pconfig" QTSPIM_PROBE="$steps" \
        QTSPIM_PROBE_FILE="$file" timeout 120 "$bin" 2>/dev/null |
      grep -E '^(DIALOG|DONE)' || true
  }

  for bare in default bare; do
    for steps in load reload load,load reload,reload load,reload reload,load; do
      v=$(probe vanilla-9.1.24 "$steps" $bare)
      h=$(probe HEAD "$steps" $bare)
      n=$(printf '%s\n' "$h" | grep -c '^DIALOG' || true)
      if [ "$v" = "$h" ] && printf '%s' "$h" | grep -q '^DONE'; then
        pass "[$bare settings] $steps: same as vanilla ($n message box(es))"
      else
        fail "[$bare settings] $steps: differs from vanilla"
        printf '  vanilla: %s\n  HEAD:    %s\n' "$v" "$h"
      fi
    done
  done

  for rev in vanilla-9.1.24 HEAD; do
    git -C "$repo" worktree remove --force "$work/src-$rev" >/dev/null 2>&1 || true
  done
fi

echo
if [ "$failures" -eq 0 ]; then
  echo "all checks passed"
  rm -rf "$work"
else
  echo "$failures check(s) failed"
  echo "outputs in $work"
  exit 1
fi
