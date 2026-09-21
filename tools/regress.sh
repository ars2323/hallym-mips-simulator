#!/usr/bin/env bash
#
# Regression check against the untouched upstream release.
#
#   tools/regress.sh [-t TAG] [-w WORKTREE] [-b BUILD_DIR] [-k] [-j JOBS]
#
#     -t  upstream tag to compare against      (default vanilla-9.1.24)
#     -w  where to put the throwaway worktree  (default a temp directory)
#     -b  our build directory, for the GUI check (default build/)
#     -k  keep the worktree and the outputs instead of deleting them
#     -j  parallelism for make                 (default nproc)
#
# Four checks, in increasing cost (4 is described next to its code):
#
#   1. CPU/ is byte-identical to the tag.  The whole project rests on the
#      simulator core being untouched; git can prove that outright.
#
#   2. The terminal spim built from the tag and the one built from the
#      working tree produce identical output for every test program the
#      upstream spim/Makefile runs.  Both are driven with the *same* input
#      files (from the working tree) so that no path text can differ; check
#      1 is what makes that legitimate.
#
#   3. If build/QtSpimEdu was built with CONFIG+=edu_devtools, each test
#      program is also run through our GUI binary and its console pane is
#      compared with what the upstream spim printed.  This is the only check
#      that exercises the program we actually ship.
#
# Check 3 compares the program's own output, not registers: the GUI seeds
# the stack through initialize_stack(command line) while the terminal spim
# uses initialize_run_stack(argc, argv), so $sp, $a1 and $a2 legitimately
# differ.  ("--dump regs" exists for looking at the rest by hand.)
#
# It also has to account for the two front ends splitting SPIM's output
# differently.  The core writes to two ports; the terminal spim points both
# at stdout (spim/spim.cpp), while QtSpim sends console_out to the console
# window and message_out to the log pane.  So the reference for the console
# pane is the upstream stdout with the one message_out block that appears in
# this mode -- the "following symbols are undefined" notice -- removed.
# Assembler and run-time errors go to stderr in the terminal spim and to the
# log pane (plus a modal dialog) in the GUI, so they are excluded from both
# sides here; check 2 already compares them.
#
# Nothing is written inside the source tree; the worktree and all build
# output go to temporary directories.

set -euo pipefail

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
tag=vanilla-9.1.24
worktree=""
build="$repo/build"
keep=0
jobs=$(nproc 2>/dev/null || echo 2)

while getopts ":t:w:b:j:kh" opt; do
  case "$opt" in
    t) tag=$OPTARG ;;
    w) worktree=$OPTARG ;;
    b) build=$OPTARG ;;
    j) jobs=$OPTARG ;;
    k) keep=1 ;;
    h) sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option -$OPTARG" >&2; exit 2 ;;
  esac
done

scratch=$(mktemp -d -t qtspim-edu-regress-XXXXXX)
if [ -z "$worktree" ]; then
  worktree="$scratch/vanilla"
fi

cleanup() {
  if [ "$keep" -eq 1 ]; then
    echo
    echo "kept: worktree $worktree, outputs $scratch"
    return
  fi
  if [ -d "$worktree" ]; then
    git -C "$repo" worktree remove --force "$worktree" >/dev/null 2>&1 || true
  fi
  rm -rf "$scratch"
}
trap cleanup EXIT

failures=0
note() { printf '%s\n' "$*"; }
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; failures=$((failures + 1)); }

# Build the terminal spim for a source tree, out of tree.  The upstream
# Makefile assumes an in-source build, so every directory variable has to be
# overridden or it would drop objects into spim/.
build_spim() {
  local src=$1 dest=$2
  mkdir -p "$dest"
  make -s -C "$dest" -f "$src/spim/Makefile" spim \
       CPU_DIR="$src/CPU" TEST_DIR="$src/Tests" DOC_DIR="$src/Documentation" \
       VPATH="$src/spim:$src/CPU" -j"$jobs" >"$dest/build.log" 2>&1 \
    || { cat "$dest/build.log" >&2; return 1; }
}

# ---------------------------------------------------------------- 1. core

note "== 1. CPU/ unchanged since $tag"
if ! git -C "$repo" rev-parse --verify --quiet "$tag" >/dev/null; then
  fail "tag $tag does not exist"
  exit 1
fi
if git -C "$repo" diff --quiet "$tag" -- CPU; then
  pass "CPU/ is byte-identical to $tag"
else
  fail "CPU/ differs from $tag:"
  git -C "$repo" diff --stat "$tag" -- CPU
fi
# The test inputs are shared between both runs below, so they have to be the
# upstream ones too.
if git -C "$repo" diff --quiet "$tag" -- Tests; then
  pass "Tests/ is byte-identical to $tag"
else
  fail "Tests/ differs from $tag -- the comparison below would not be valid:"
  git -C "$repo" diff --stat "$tag" -- Tests
fi

# ------------------------------------------------------- 2. terminal spim

note
note "== 2. terminal spim: $tag vs working tree"
git -C "$repo" worktree add --detach "$worktree" "$tag" >/dev/null
build_spim "$worktree" "$scratch/build-vanilla"
build_spim "$repo" "$scratch/build-ours"
vanilla_spim="$scratch/build-vanilla/spim"
our_spim="$scratch/build-ours/spim"

exceptions="$repo/CPU/exceptions.s"
tests_dir="$repo/Tests"

# name|flags|stdin  -- taken from the upstream spim/Makefile "test" and
# "test_bare" targets.  The remaining files in Tests/ are interactive or
# timing dependent and upstream does not run them either.
cases=(
  "tt.bare.s|-delayed_branches -delayed_loads -noexception|"
  "tt.core.s|-ef $exceptions|$tests_dir/tt.in"
  "tt.le.s|-ef $exceptions|"
  "tt.dir.s|-ef $exceptions|"
  "tt.alu.bare.s|-bare -noexception|"
  "tt.fpu.bare.s|-bare -noexception|"
)

# run_spim BINARY FLAGS PROGRAM STDIN OUTFILE [stderr]
# The last argument selects whether stderr is folded into the output.
run_spim() {
  local binary=$1 flags=$2 program=$3 stdin=$4 outfile=$5 want_stderr=${6:-yes}
  local source=/dev/null
  if [ -n "$stdin" ]; then
    source=$stdin
  fi
  if [ "$want_stderr" = yes ]; then
    timeout 120 "$binary" $flags -file "$program" <"$source" >"$outfile" 2>&1 || true
  else
    timeout 120 "$binary" $flags -file "$program" <"$source" >"$outfile" 2>/dev/null || true
  fi
}

# Drop the message_out block the terminal spim prints on stdout but QtSpim
# puts in the log pane: the notice, its list of symbols, and its blank line.
strip_message_out() {
  awk '
    /^The following symbols are undefined:$/ { skipping = 1; next }
    skipping && /^$/                         { skipping = 0; next }
    skipping                                 { next }
    { print }
  ' "$1"
}

# A differing pair is re-run before it counts as a failure.  Upstream's
# tt.core.s contains a timer test that spins until CP0 Count, driven by a
# real-time 10 ms signal, equals exactly 10; on a busy machine the process can
# sleep through that tick and the run then never finishes (it is cut off by
# the timeout, so the two outputs differ).  That is nondeterminism in the
# test program, identical in both binaries -- a core difference would show up
# on every attempt.
attempts=3
for entry in "${cases[@]}"; do
  IFS='|' read -r name flags stdin <<<"$entry"
  program="$tests_dir/$name"
  matched=0
  for attempt in $(seq 1 "$attempts"); do
    run_spim "$vanilla_spim" "$flags" "$program" "$stdin" "$scratch/$name.vanilla"
    run_spim "$our_spim"     "$flags" "$program" "$stdin" "$scratch/$name.ours"
    if diff -u "$scratch/$name.vanilla" "$scratch/$name.ours" >"$scratch/$name.diff"; then
      matched=$attempt
      break
    fi
    note "      $name: outputs differ on attempt $attempt of $attempts"
  done

  if [ "$matched" -eq 1 ]; then
    pass "$name ($(wc -l <"$scratch/$name.vanilla") lines)"
  elif [ "$matched" -gt 1 ]; then
    pass "$name ($(wc -l <"$scratch/$name.vanilla") lines) -- on attempt $matched; see the note on timing above check 2 in this script"
  else
    fail "$name output differs on all $attempts attempts:"
    head -40 "$scratch/$name.diff"
  fi
done

# --------------------------------------------------------------- 3. GUI

note
note "== 3. our GUI binary vs $tag terminal spim (console output)"
app="$build/QtSpimEdu"
if [ ! -x "$app" ]; then
  note "SKIP  no executable at $app"
elif [ "$(strings "$app" | grep -c -F -- '--dump' || true)" -eq 0 ]; then
  note "SKIP  $app was not built with CONFIG+=edu_devtools"
else
  # The GUI reads QSettings at startup; point it at an empty store so a
  # developer's saved simulator settings cannot change the result.
  export XDG_CONFIG_HOME="$scratch/config"
  mkdir -p "$XDG_CONFIG_HOME"

  for entry in "${cases[@]}"; do
    IFS='|' read -r name flags stdin <<<"$entry"
    if [ -n "$stdin" ]; then
      note "SKIP  $name (reads console input, which this harness cannot feed)"
      continue
    fi
    program="$tests_dir/$name"

    # -q drops the startup banner; stderr is dropped because those errors
    # land in the GUI's log pane, not its console.
    run_spim "$vanilla_spim" "-q $flags" "$program" "" \
             "$scratch/$name.stdout.vanilla" no
    strip_message_out "$scratch/$name.stdout.vanilla" \
      >"$scratch/$name.console.vanilla"

    QT_QPA_PLATFORM=offscreen timeout 120 "$app" $flags --load "$program" --run \
      --dump console "$scratch/$name.console.gui" \
      --dump regs "$scratch/$name.regs.gui" >"$scratch/$name.gui.log" 2>&1 || true

    if [ ! -f "$scratch/$name.console.gui" ]; then
      fail "$name: GUI produced no console dump"
      head -20 "$scratch/$name.gui.log"
      continue
    fi

    if diff -u "$scratch/$name.console.vanilla" "$scratch/$name.console.gui" \
         >"$scratch/$name.console.diff"; then
      pass "$name console output matches"
    else
      fail "$name console output differs:"
      head -40 "$scratch/$name.console.diff"
    fi
  done
fi

# ------------------------------------------------- 4. Save Log File output

note
note "== 4. Save Log File output vs upstream rendering (goldens)"
golden="$repo/tests/golden"
if [ ! -x "$app" ] || [ "$(strings "$app" | grep -c -F -- 'text-log' || true)" -eq 0 ]; then
  note "SKIP  $app missing or not built with CONFIG+=edu_devtools"
else
  # SPIM copies the process environment onto the simulated stack, so $sp,
  # $a1 and $a2 depend on it.  The goldens were captured under exactly this
  # environment (tools/capture-goldens.sh); nothing else may leak in.
  fixed_env=(env -i QT_QPA_PLATFORM=offscreen HOME=/nonexistent
             XDG_CONFIG_HOME=/nonexistent/config)
  while IFS='|' read -r name program args stream; do
    case "$name" in ''|'#'*) continue ;; esac
    "${fixed_env[@]}" timeout 300 "$app" --load-cmdline "$repo/$program" $args \
      --dump "$stream" "$scratch/$name.txt" >"$scratch/$name.gui.log" 2>&1 || true
    if [ ! -f "$scratch/$name.txt" ]; then
      fail "$name: no log text produced"; head -20 "$scratch/$name.gui.log"
    elif cmp -s "$golden/$name.txt" "$scratch/$name.txt"; then
      pass "$name.txt is byte-identical"
    else
      fail "$name.txt differs from the golden:"
      diff -u "$golden/$name.txt" "$scratch/$name.txt" | head -20
    fi
  done <"$golden/cases.txt"
fi

note
if [ "$failures" -eq 0 ]; then
  note "all checks passed"
else
  note "$failures check(s) failed"
fi
exit $((failures == 0 ? 0 : 1))
