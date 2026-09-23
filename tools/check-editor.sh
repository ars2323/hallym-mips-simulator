#!/usr/bin/env bash
#
# End-to-end checks of the editor (PLAN R4) with a CONFIG+=edu_devtools build.
#
#   tools/check-editor.sh [-b BUILD_DIR]
#
#   1. Open -> Save As without a change gives the same bytes: Korean comments
#      in UTF-8 and CP949, LF and CRLF, with and without a byte order mark.
#   2. An edit keeps the file's encoding and line ends.
#   3. Simulator > Assemble builds the same text and data segments as File >
#      Reinitialize and Load File, and reports no error.
#      Unsaved changes are saved first, without a question.
#   4. A file with errors: no modal box, the errors are counted, and the
#      message log reads exactly as it does for Reinitialize and Load File.
#   5. A file loaded through the File menu is what the editor holds.
#   6. A file rewritten by another program is offered for reloading.
#   3b. Saving is assembling: a real Ctrl+S saves, assembles and goes to the
#      Text tab; the "Source changed" strip comes and goes; a failed assemble
#      keeps the file saved and says the simulator was reset.
#   7. The last file is reopened at the next start and not assembled.
#   9. The tutorial always opens the example program, asking first when the
#      editor holds unsaved work (Cancel means it does not start), and every
#      one of its buttons works when clicked with the mouse.
#  10. The first-run route and Help > Tutorial produce the same tutorial, line
#      for line.
#  11. The Console tab takes typed input for a read syscall, and an error
#      brings the Messages tab forward.
#  12. The three lines between the four panels: the vertical one moves both
#      rows, the horizontal one both columns, the crossing handle both.
#  13. The tutorial's example is read-only, the display settings are the ones
#      its cards describe, and all four exits give everything back.
#  14. Each panel can be scrolled sideways, and nothing the simulator does
#      moves it there by itself -- not even for one frame; the tutorial puts
#      the position back.  Every panel leaves both bars to Qt, its far right
#      can be reached, and Shift with the wheel moves it.
#  15. The frozen strip and the panel under it show the same row at the same
#      height, through every base, text size, moment and scroll position.
#  16. No panel can be taken out of the window, and a saved state that has
#      one floating is brought back inside.
#  18. The third arrangement: the editor and the two panels in one tabbed
#      place, for a window half a screen wide.
#  19. Every run starts from the same screen: nothing about the window is
#      carried over, an older settings file is cleaned out, and Window >
#      Reset Layout gives the same state back without a restart.
#  17. Assemble is one cycle -- save, clear, assemble -- that says one line,
#      keeps the breakpoints on their statements and leaves the editor and
#      the panels where they were.  Running with nothing loaded says so.

set -euo pipefail

repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
build="$repo/build"
while getopts ":b:h" opt; do
  case "$opt" in
    b) build=$OPTARG ;;
    h) sed -n '2,17p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown option -$OPTARG" >&2; exit 2 ;;
  esac
done

app="$build/HallymMIPS"
if [ ! -x "$app" ] || [ "$(strings "$app" | grep -c -F -- '--editor-open' || true)" -eq 0 ]; then
  echo "$app is missing or was not built with CONFIG+=edu_devtools" >&2
  exit 1
fi

work=$(mktemp -d -t hallym-mips-editor-XXXXXX)
failures=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; failures=$((failures + 1)); }

run() {  # run NAME ARGS...  -> $work/NAME.out
  local name=$1; shift
  rm -rf "$work/config"
  env -i QT_QPA_PLATFORM=offscreen HOME=/nonexistent \
      XDG_CONFIG_HOME="$work/config" timeout 300 "$app" "$@" \
      --dump console "$work/$name.console" >"$work/$name.out" \
      2>"$work/$name.err" || true
  cat "$work/$name.err" >>"$work/$name.out"
}

# "출력" is EC B6 9C EB A0 A5 in UTF-8 and C3 E2 B7 C2 in CP949.
utf8='\xEC\xB6\x9C\xEB\xA0\xA5'
cp949='\xC3\xE2\xB7\xC2'
mk() {  # mk FILE COMMENT EOL [PREFIX]
  printf "${4:-}\t.text${3}main:\tli \$v0, 10\t# ${2}${3}\tsyscall${3}" >"$1"
}
mk "$work/utf8-lf.s"     "$utf8"  '\n'
mk "$work/utf8-crlf.s"   "$utf8"  '\r\n'
mk "$work/utf8-bom-crlf.s" "$utf8" '\r\n' '\xEF\xBB\xBF'
mk "$work/cp949-lf.s"    "$cp949" '\n'
mk "$work/cp949-crlf.s"  "$cp949" '\r\n'
printf 'a:\tnop\nb:\tnop' >"$work/no-final-newline.s"

echo "== 1. open -> save as, unchanged"
for f in utf8-lf utf8-crlf utf8-bom-crlf cp949-lf cp949-crlf no-final-newline; do
  run "rt-$f" --editor-open "$work/$f.s" --editor-save-as "$work/$f.copy.s"
  if cmp -s "$work/$f.s" "$work/$f.copy.s"; then
    pass "$f: byte-identical"
  else
    fail "$f: differs"; cmp "$work/$f.s" "$work/$f.copy.s" 2>&1 | head -2 || true
  fi
done

echo
echo "== 2. an edit keeps encoding and line ends"
run edit --editor-open "$work/cp949-crlf.s" --editor-type '# edited\n' \
    --editor-save-as "$work/cp949-crlf.edited.s"
{ printf '# edited\r\n'; cat "$work/cp949-crlf.s"; } >"$work/cp949-crlf.expected.s"
if cmp -s "$work/cp949-crlf.expected.s" "$work/cp949-crlf.edited.s"; then
  pass "CP949 + CRLF file stays CP949 + CRLF after an edit"
else
  fail "edited CP949 + CRLF file is not what was expected"
fi

echo
echo "== 3. Assemble = Reinitialize and Load File"
file="$repo/helloworld.s"
for stream in text-log data-log; do
  run "asm-$stream" --editor-open "$file" --assemble --dump $stream "$work/asm.$stream"
  run "rel-$stream" --reload "$file" --dump $stream "$work/rel.$stream"
  if [ -s "$work/asm.$stream" ] && cmp -s "$work/asm.$stream" "$work/rel.$stream"; then
    pass "$stream after Assemble is the one after Reinitialize and Load File"
  else
    fail "$stream differs between Assemble and Reinitialize and Load File"
  fi
done
if grep -q '^assemble: 0 error(s)' "$work/asm-text-log.out" &&
   [ "$(grep -c '^dialog:' "$work/asm-text-log.out" || true)" -eq 0 ]; then
  pass "no errors, no dialog"
else
  fail "Assemble of helloworld.s:"; grep -E '^(assemble|dialog):' "$work/asm-text-log.out" | head -3
fi

echo
echo "== 4. a file with errors"
bad="$repo/tests/samples/editor-errors.s"
run bad-asm --editor-open "$bad" --assemble --dump log "$work/bad-asm.log"
run bad-rel --reload "$bad" --dump log "$work/bad-rel.log"
if grep -q '^assemble: 3 error(s)' "$work/bad-asm.out"; then
  pass "three errors listed"
else
  fail "expected three errors:"; grep '^assemble' "$work/bad-asm.out" || true
fi
if [ "$(grep -c '^dialog:' "$work/bad-asm.out" || true)" -eq 0 ] &&
   [ "$(grep -c '^dialog:' "$work/bad-rel.out" || true)" -eq 3 ]; then
  pass "no modal box from Assemble (the File menu route shows three)"
else
  fail "dialogs: Assemble $(grep -c '^dialog:' "$work/bad-asm.out" || true), File menu $(grep -c '^dialog:' "$work/bad-rel.out" || true)"
fi
# The errors are word for word the File menu route's.  The one line that
# differs is by design: inside an Assemble the clear in the middle says
# nothing of its own, because the cycle says one line at the end (X).
grep -v -e "Memory and registers cleared" -e "^$" "$work/bad-asm.log" \
    >"$work/bad-asm.errors"
grep -v -e "Memory and registers cleared" -e "^$" "$work/bad-rel.log" \
    >"$work/bad-rel.errors"
if [ -s "$work/bad-asm.errors" ] &&
   cmp -s "$work/bad-asm.errors" "$work/bad-rel.errors"; then
  pass "message log is the File menu route's, but for the clearing line"
else
  fail "message log differs from the File menu route's"
fi

# Edited but not saved: Assemble saves without asking and assembles what was
# typed.
cp "$repo/helloworld.s" "$work/typed.s"
run typed --editor-open "$work/typed.s" --editor-type 'nop\n' --assemble \
    --dump text-log "$work/typed.text"
if [ "$(grep -cE '^(dialog|editor question):' "$work/typed.out" || true)" -eq 0 ] &&
   grep -q '^assemble: 0 error(s)' "$work/typed.out" &&
   [ "$(head -c 3 "$work/typed.s")" = 'nop' ] &&
   grep -q 'nop' "$work/typed.text"; then
  pass "unsaved changes: saved without a question, and the new instruction is in the text segment"
else
  fail "Assemble with unsaved changes:"; grep -E '^assemble' "$work/typed.out" || true
fi

echo
echo "== 3b. saving is assembling (real key presses)"
cp "$repo/helloworld.s" "$work/keys.s"
run keys --editor-report --editor-open "$work/keys.s" --editor-report \
    --editor-type 'nop\n' --editor-report --editor-key ctrl+s --editor-report \
    --editor-type 'nop\n' --editor-report --editor-click-banner --editor-report \
    --dump text-log "$work/keys.text"
mapfile -t rep < <(grep '^editor:' "$work/keys.out")
expect() {  # expect INDEX WHAT PATTERN
  if [[ "${rep[$1]:-}" == *$3* ]]; then pass "$2"; else fail "$2: ${rep[$1]:-<no report>}"; fi
}
expect 0 "start: the editor is on screen, no strip"      'modified=0 banner=0 front='
expect 1 "file opened, not assembled: strip shows"      'file=keys.s modified=0 banner=1'
expect 2 "typed: modified, strip shows"                 'modified=1 banner=1 front='
expect 3 "Ctrl+S: saved, assembled, Text tab, strip gone" 'modified=0 banner=0 front=Text errors=0 status="Saved and assembled"'
expect 4 "typed again: strip is back"                   'modified=1 banner=1'
expect 5 "click on the strip: saved and assembled"      'modified=0 banner=0 front=Text errors=0'
if [ "$(head -c 10 "$work/keys.s" | tr -d '\r')" = "$(printf 'nop\nnop\n')" ] &&
   [ "$(grep -c ' nop ' "$work/keys.text" || true)" -ge 2 ]; then
  pass "both edits are on disk and in the text segment"
else
  fail "edits not on disk / not assembled"
fi

# A failed assemble: the file is saved all the same, the errors are listed,
# and the status bar says the simulator was reset.
cp "$repo/helloworld.s" "$work/fails.s"
run fails --editor-open "$work/fails.s" --editor-key f3 \
    --editor-type 'addi $t0, $t0, )\n' --editor-key f3 --editor-report \
    --dump text-log "$work/fails.text"
mapfile -t rep < <(grep '^editor:' "$work/fails.out")
expect 0 "F3 on a broken file: stays in the Editor, one error, no strip" \
    'modified=0 banner=0 front=Text errors=1'
expect 0 "status bar: failed, simulator was reset" \
    'badge="Assemble failed — 1 error. Simulator was reset."'
if [ "$(head -c 4 "$work/fails.s")" = "addi" ]; then
  pass "the broken file was saved (the student's work is kept)"
else
  fail "the broken file was not saved"
fi
if ! grep -q 'la \$a0, msg' "$work/fails.text"; then
  pass "the program that ran before is gone (simulator reinitialized)"
else
  fail "the old program is still in the text segment"
fi

echo
echo "== 5. File > Load File also opens the file in the editor"
run loaded --load "$file" --editor-save-as "$work/loaded.copy.s"
if cmp -s "$file" "$work/loaded.copy.s"; then
  pass "the editor holds the loaded file"
else
  fail "the editor does not hold the loaded file"
fi

echo
echo "== 6. changed by another program"
cp "$work/utf8-lf.s" "$work/watched.s"
run watched --editor-open "$work/watched.s" \
    --editor-rewrite-on-disk '# rewritten elsewhere\n' \
    --editor-save-as "$work/watched.copy.s"
if grep -q '^editor question: watched.s was changed by another program. -> Yes' "$work/watched.out" &&
   [ "$(cat "$work/watched.copy.s")" = "# rewritten elsewhere" ]; then
  pass "asked, and reloaded the new contents"
else
  fail "external change:"; grep '^editor question' "$work/watched.out" || echo "  (no question)"
fi

echo
echo "== 7. the last file is reopened at the next start, and not assembled"
cp "$repo/helloworld.s" "$work/last.s"
keep="$work/keep-config"
persist() {  # like run, but with a settings directory that survives
  local name=$1; shift
  env -i QT_QPA_PLATFORM=offscreen HOME=/nonexistent XDG_CONFIG_HOME="$keep" \
      timeout 120 "$app" "$@" >"$work/$name.out" 2>&1 || true
}
persist last1 --editor-open "$work/last.s" --assemble --save-settings \
    --dump console "$work/last1.console"
persist last2 --editor-report --dump text-log "$work/last2.text"
run fresh --dump text-log "$work/fresh.text"
mapfile -t rep < <(grep '^editor:' "$work/last2.out")
expect 0 "second start: last.s is open and not assembled" \
    'file=last.s modified=0 banner=1 front='
if [ -s "$work/last2.text" ] && cmp -s "$work/last2.text" "$work/fresh.text"; then
  pass "nothing was assembled: the text segment is a fresh start's"
else
  fail "the text segment differs from a fresh start's"
fi
rm -f "$work/last.s"
persist last3 --editor-report --dump console "$work/last3.console"
mapfile -t rep < <(grep '^editor:' "$work/last3.out")
expect 0 "file deleted meanwhile: starts empty, no message" 'file= modified=0 banner=0'
if [ "$(grep -c '^dialog:' "$work/last3.out" || true)" -eq 0 ]; then
  pass "no dialog about the missing file"
else
  fail "a dialog came up for the missing file"
fi

echo
echo "== 8. the strip over Text says which of the three things happened"
cp "$repo/helloworld.s" "$work/strip.s"
cp "$repo/samples/tutorial.s" "$work/other.s"
strip_text() {  # strip_text NAME ARGS... -> the strip's text, or empty
  local name=$1; shift
  run "$name" "$@"
  sed -n 's/.*bannertext="\([^"]*\)".*/\1/p' "$work/$name.out"
}
expect_strip() {  # expect_strip WHAT WANTED GOT
  case "$3" in
    *"$2"*) pass "$1: $3" ;;
    *) fail "$1: expected \"$2\", got \"$3\"" ;;
  esac
}
edited=$(strip_text stripA --editor-open "$work/strip.s" --assemble \
    --editor-type '# typed' --editor-report)
expect_strip "edited since the assemble" "Source changed" "$edited"

cleared=$(strip_text stripB --editor-open "$work/strip.s" --assemble \
    --editor-trigger action_Sim_Reinitialize --editor-report)
expect_strip "reinitialized" "Simulator was reinitialized" "$cleared"

# The Text panel holding one program while the editor holds another: a
# file on the command line, then a different one opened in the editor.
# (Loading one program on top of another is gone -- every load starts from
# a clean simulator now -- so that is no longer the way to get here.)
added=$(strip_text stripC --load "$work/other.s" --editor-open "$work/strip.s" \
    --editor-report)
expect_strip "the Text panel holds another program" \
    "Text shows a different program" "$added"

instep=$(strip_text stripD --editor-open "$work/strip.s" --assemble --editor-report)
if [ -z "$instep" ]; then
  pass "assembled and untouched: no strip"
else
  fail "no strip expected, got \"$instep\""
fi

fresh=$(strip_text stripE --editor-report)
if [ -z "$fresh" ]; then
  pass "empty editor, nothing loaded: no strip"
else
  fail "no strip expected for an empty editor, got \"$fresh\""
fi

echo
echo "== 9. the tutorial always opens the example, and asks before taking the editor"
# The tutorial replaces whatever the editor holds with samples/tutorial.s.  That
# is worth one question when there is unsaved work, and no question at all
# otherwise; Cancel means the tutorial does not start and nothing changes.
printf '\t.text\nmain:\tli $v0, 10\n\tsyscall\n' >"$work/mine.s"
before=$(md5sum <"$work/mine.s")

tutorial_case() {  # tutorial_case NAME ANSWER WANT_STARTED WANT_ASKS ARGS...
  local name=$1 answer=$2 wantStarted=$3 wantAsks=$4; shift 4
  run "$name" "$@" --editor-answer "$answer" --window-size 1600x900 \
      --tutorial-report
  local out="$work/$name.out" steps skipped asked
  steps=$(sed -n 's/^tutorial steps=\([0-9]*\) .*/\1/p' "$out")
  skipped=$(sed -n 's/^tutorial steps=[0-9]* skipped=\([0-9]*\).*/\1/p' "$out")
  asked=$(grep -c '^editor question:' "$out" || true)
  if [ "$wantStarted" = "0" ]; then
    if [ -z "$steps" ]; then
      pass "$name: cancelled, the tutorial did not start"
    else
      fail "$name: cancelled but the tutorial ran ($steps steps)"
    fi
  else
    if [ "$steps" = "20" ] && [ "$skipped" = "0" ]; then
      pass "$name: 20 steps, none left out"
    else
      fail "$name: expected 20 steps and none skipped, got \"$steps\" and \"$skipped\" skipped"
      sed -n 's/^tutorial skipped: /  left out: /p' "$out"
    fi
  fi
  if [ "$asked" = "$wantAsks" ]; then
    pass "$name: $asked question(s) about unsaved work"
  else
    fail "$name: expected $wantAsks question(s), got $asked"
  fi
}

tutorial_case tutorialEmpty   discard 1 0
tutorial_case tutorialSaved   discard 1 0 --editor-open "$work/mine.s"
tutorial_case tutorialTyped   discard 1 1 --editor-type '# mine\n'
tutorial_case tutorialCancel  cancel  0 1 --editor-type '# mine\n'

if [ "$before" = "$(md5sum <"$work/mine.s")" ]; then
  pass "the file the editor held is unchanged on disk"
else
  fail "the tutorial wrote to $work/mine.s"
fi

# Every button, with the mouse: the tutorial used to end at the first click of
# Next because clicking the overlay deactivated the main window.
run tutorialClicks --window-size 1600x900 --tutorial-click-through
clicks=$(grep -c '^tutorial click Next: visible=1' "$work/tutorialClicks.out" || true)
if [ "$clicks" = "19" ]; then
  pass "Next, clicked with the mouse, walks all 20 steps"
else
  fail "expected 19 mouse clicks on Next, got $clicks"
fi
for what in "click Back: visible=1" "click finish: visible=0" "click Skip: visible=0"; do
  if grep -q "^tutorial $what" "$work/tutorialClicks.out"; then
    pass "mouse $what"
  else
    fail "mouse $what not reported"
    grep '^tutorial click' "$work/tutorialClicks.out" | tail -3
  fi
done

echo
echo "== 10. the first run and Help > Tutorial give exactly the same tutorial"
# Both routes call SpimView::eduShowTutorial(); the start-up one only adds
# the "Tutorial/Shown" check and a delay.  This proves it from the outside:
# the same window size, the same fresh settings, and every line of
# --tutorial-report compared -- the example loaded, where it stopped (PC and
# $sp), the step count, each card's rectangle, and every title and body in
# both languages.
run tutorialMenu  --window-size 1600x900 --tutorial-report
run tutorialFirst --window-size 1600x900 --tutorial-first-run --tutorial-report
grep '^tutorial ' "$work/tutorialMenu.out"  >"$work/tutorial-menu.txt" || true
grep '^tutorial ' "$work/tutorialFirst.out" >"$work/tutorial-first.txt" || true
if [ ! -s "$work/tutorial-first.txt" ]; then
  fail "the start-up route reported nothing (did the tutorial open?)"
elif diff -u "$work/tutorial-menu.txt" "$work/tutorial-first.txt" >"$work/tutorial.diff"; then
  pass "both routes: $(wc -l <"$work/tutorial-menu.txt") identical lines of report"
  pass "$(sed -n 's/^tutorial state /state: /p' "$work/tutorial-menu.txt")"
else
  fail "the two routes differ:"
  head -20 "$work/tutorial.diff"
fi

echo
echo "== 11. the Console and Messages tabs"
# The console is a tab of the bottom panel now.  Two things have to hold:
# a program that asks for input gets what is typed into that tab, and an
# error puts the Messages tab in front by itself.
printf '\t.data\nask:\t.asciiz "N? "\n\t.text\n\t.globl main\nmain:\tli $v0, 4\n\tla $a0, ask\n\tsyscall\n\tli $v0, 5\n\tsyscall\n\tadd $t0, $v0, $v0\n\tli $v0, 1\n\tmove $a0, $t0\n\tsyscall\n\tli $v0, 10\n\tsyscall\n' >"$work/ask.s"
run consoleIn --load "$work/ask.s" --console-type '21\n' --run \
    --dump console "$work/ask.console"
if grep -q '^console: focus=1 tab=Console' "$work/consoleIn.out"; then
  pass "input syscall: the Console tab takes the keyboard"
else
  fail "input syscall: $(grep -m1 '^console:' "$work/consoleIn.out" || echo 'nothing reported')"
fi
if [ "$(tr -d '\r\n ' <"$work/ask.console")" = "21N?42" ]; then
  pass "input syscall: what was typed reached the program (21 -> 42)"
else
  fail "input syscall: the console holds \"$(tr '\n' ' ' <"$work/ask.console")\""
fi

printf '\t.text\nmain:\tbogus\n' >"$work/bad.s"
run consoleErr --editor-open "$work/bad.s" --assemble --window-size 1600x900 \
    --layout-report
if grep -q '^bottom: tab=Messages visible=1' "$work/consoleErr.out"; then
  pass "an error brings the Messages tab forward"
else
  fail "after an error: $(grep -m1 '^bottom:' "$work/consoleErr.out" || echo 'nothing reported')"
fi

run consoleOut --load "$repo/samples/tutorial.s" --run --window-size 1600x900 \
    --layout-report
if grep -q '^bottom: tab=Console' "$work/consoleOut.out"; then
  pass "a program that prints leaves the Console tab in front"
else
  fail "after a run: $(grep -m1 '^bottom:' "$work/consoleOut.out" || echo 'nothing reported')"
fi

echo
echo "== 12. the three lines between the four panels"
# The vertical line moves both rows, the horizontal line moves both
# columns, and the handle where they cross moves everything.  What is
# checked is the line, not the panel heights: a panel with a tab bar above
# it is shorter than one without.
split_case() {  # split_case NAME DRAG WANT
  local name=$1 drag=$2 want=$3
  run "$name" --editor-open "$repo/samples/tutorial.s" --assemble \
      --window-size 1600x900 --drag-split "$drag"
  local before after
  before=$(sed -n 's/^split before .*: lines y=\([0-9]*\)\/\([0-9]*\) x=\([0-9]*\)/\1 \2 \3/p' "$work/$name.out")
  after=$(sed -n 's/^split after  .*: lines y=\([0-9]*\)\/\([0-9]*\) x=\([0-9]*\)/\1 \2 \3/p' "$work/$name.out")
  local bl br bx al ar ax
  read -r bl br bx <<<"$before"
  read -r al ar ax <<<"$after"
  if [ -z "$al" ]; then
    fail "$name: nothing reported"
    return
  fi
  if [ "$al" = "$ar" ]; then
    pass "$name: the horizontal line is level across both columns ($al)"
  else
    fail "$name: the two columns' lines are at $al and $ar"
  fi
  case "$want" in
    horizontal)
      if [ "$al" != "$bl" ] && [ "$ax" = "$bx" ]; then
        pass "$name: the rows moved, the columns did not"
      else
        fail "$name: rows $bl->$al, columns $bx->$ax"
      fi ;;
    vertical)
      if [ "$ax" != "$bx" ] && [ "$al" = "$bl" ]; then
        pass "$name: the columns moved, the rows did not"
      else
        fail "$name: rows $bl->$al, columns $bx->$ax"
      fi ;;
    both)
      if [ "$ax" != "$bx" ] && [ "$al" != "$bl" ]; then
        pass "$name: both moved"
      else
        fail "$name: rows $bl->$al, columns $bx->$ax"
      fi ;;
  esac
}

split_case splitH "horizontal=-90" horizontal
split_case splitV "vertical=-120" vertical
split_case splitX "cross=-100,-70" both

# With a panel closed there is no block, and nothing is synchronised.
run splitNone --editor-open "$repo/samples/tutorial.s" --assemble \
    --window-size 1600x900 --trigger action_Edu_ToggleInspector \
    --drag-split "horizontal=-60"
if grep -q "no block" "$work/splitNone.out"; then
  pass "a closed panel breaks the block, and the drag is left alone"
else
  fail "with the inspector closed: $(grep -m1 '^split' "$work/splitNone.out" || echo 'nothing reported')"
fi

echo
echo "== 13. the tutorial borrows the screen and gives it back"
# While it runs, the example is read-only and the display settings are the
# ones the cards describe.  However it ends, the settings come back, the
# example is closed and the editor shows its start screen -- and the file
# in the installation folder is untouched.
sample_before=$(md5sum <"$repo/samples/tutorial.s")
run tutorialReadOnly --reg-base 2 --window-size 1600x900 --tutorial-report \
    --layout-report
if grep -q '^tutorial state .* readonly=1 base=16' "$work/tutorialReadOnly.out"; then
  pass "during the tutorial: the example is read-only and the base is hexadecimal"
else
  fail "during the tutorial: $(grep -m1 '^tutorial state' "$work/tutorialReadOnly.out")"
fi
# (The layout report runs before the tutorial opens, so what it prints is the
# state the tutorial was handed -- which is the thing the exits below restore.)

for exit in finish skip escape close; do
  run "tutorialBack-$exit" --reg-base 2 --window-size 1600x900 \
      --tutorial-exit "$exit" --editor-report --layout-report
  if grep -q 'start_screen=1 readonly=0' "$work/tutorialBack-$exit.out"; then
    pass "$exit: the editor is back to its start screen"
  else
    fail "$exit: $(grep -m1 '^editor:' "$work/tutorialBack-$exit.out")"
  fi
  if grep -q '^bases: reg=2 ' "$work/tutorialBack-$exit.out"; then
    pass "$exit: the register base the student had is back"
  else
    fail "$exit: $(grep -m1 '^bases:' "$work/tutorialBack-$exit.out")"
  fi
done
if [ "$sample_before" = "$(md5sum <"$repo/samples/tutorial.s")" ]; then
  pass "the example in the installation folder is unchanged"
else
  fail "the tutorial wrote to samples/tutorial.s"
fi

echo "== 14. the panels do not move sideways on their own"
# All three have somewhere to go sideways (in binary they are far wider
# than the panel), and a step, a selection and a refresh of the model all
# leave them where the student put them.  The tutorial is allowed to scroll --
# it has to reach the cell it points at -- but gives the position back.
run hscroll --window-size 1600x900 --load "$repo/helloworld.s" --steps 5 \
    --reg-base 2 --trigger action_Data_DisplayBinary --hscroll-report
for panel in text data intregs; do
  line=$(grep -m1 "^hscroll: $panel max=" "$work/hscroll.out" || true)
  case "$line" in
    "hscroll: $panel max=0 "*) fail "$panel has nothing to scroll sideways" ;;
    "") fail "$panel: no horizontal scroll report" ;;
    *) pass "${line#hscroll: }" ;;
  esac
done
moved=$(grep -c MOVED "$work/hscroll.out" || true)
if [ "$moved" -eq 0 ]; then
  pass "steps, a selection, a Go to and a refresh leave all three in place"
else
  fail "$(grep -m1 MOVED "$work/hscroll.out")"
fi
# Not only "it ended up where it started": a scrollTo that moves sideways
# and is put back afterwards still blits one frame of the wrong thing.
if grep -q "^hscroll: sideways frames drawn 0$" "$work/hscroll.out"; then
  pass "not one frame was drawn with a panel moved sideways"
else
  fail "$(grep -m1 'sideways frames drawn' "$work/hscroll.out")"
fi

# Every panel, including the editor and the two bottom tabs: the bars are
# left to Qt, the far right of the content can be reached, and Shift with
# the wheel gets there.
run scrollbars --window-size 1200x800 --load "$repo/helloworld.s" \
    --editor-open "$repo/helloworld.s" --reg-base 2 \
    --trigger action_Data_DisplayBinary --scrollbar-report
for panel in intregs text data editor console messages; do
  line=$(grep -m1 "^scrollbar: $panel hpolicy=" "$work/scrollbars.out" || true)
  case "$line" in
    "scrollbar: $panel hpolicy=0 "*"vpolicy=0 "*) pass "${line#scrollbar: }" ;;
    "") fail "$panel: no scroll bar report" ;;
    *) fail "${line#scrollbar: }" ;;
  esac
done
if grep -q "CUT OFF" "$work/scrollbars.out"; then
  fail "$(grep -m1 'CUT OFF' "$work/scrollbars.out")"
else
  pass "the last column of each panel can be brought into view"
fi
if grep -q "STUCK" "$work/scrollbars.out"; then
  fail "$(grep -m1 STUCK "$work/scrollbars.out")"
else
  pass "Shift and the wheel move every panel that has somewhere to go"
fi

run hscrollTutorial --window-size 1600x900 --load "$repo/helloworld.s" \
    --reg-base 2 --hscroll text=60 --hscroll intregs=5 \
    --tutorial-exit finish
if grep -q 'hscroll .* MOVED' "$work/hscrollTutorial.out"; then
  fail "$(grep -m1 'hscroll .* MOVED' "$work/hscrollTutorial.out")"
else
  pass "the tutorial gives the sideways position back when it ends"
fi

echo "== 15. the frozen strip and the panel agree, row for row"
# Registers, Data and Text, each through its bases, five text sizes, folded
# and unfolded, three scroll positions, at two window sizes, and after each
# of eight moments in the program's life.  The check is what the student
# sees: walk down the panel and ask both views which row is at that pixel.
run align --load "$repo/helloworld.s" --editor-open "$repo/helloworld.s" \
    --align-sweep
groups=$(grep -c "^align: [0-9]" "$work/align.out" || true)
bad=$(grep -c "^align: .* FAIL" "$work/align.out" || true)
if [ "$groups" -ge 40 ] && [ "$bad" -eq 0 ]; then
  pass "$groups combinations of panel, base, size, moment and scroll: all aligned"
else
  fail "$bad of $groups alignment groups failed"
  grep -m1 -A3 "align: FAIL" "$work/align.err" 2>/dev/null || true
fi

echo "== 16. no panel can leave the window"
run docks --window-size 1400x900 --dock-report
docks_total=$(grep -c "^dock: [A-Z]" "$work/docks.out" || true)
docks_bad=$(grep -c "^dock: .* floatable=1" "$work/docks.out" || true)
docks_out=$(grep -c "^dock: .* floating=1" "$work/docks.out" || true)
if [ "$docks_total" -ge 7 ] && [ "$docks_bad" -eq 0 ] && [ "$docks_out" -eq 0 ]; then
  pass "$docks_total panels: none can float, none is floating"
else
  fail "$docks_bad of $docks_total panels can float, $docks_out are floating"
fi
if grep -q "^dock: after eduDockEverything() 0 panel" "$work/docks.out"; then
  pass "a saved state with a floating panel comes back inside the window"
else
  fail "$(grep -m1 'after eduDockEverything' "$work/docks.out")"
fi

echo "== 17. Assemble is one cycle"
cp "$repo/helloworld.s" "$work/cycle.s"
run cycle10 --editor-open "$work/cycle.s" \
    --assemble --assemble --assemble --assemble --assemble \
    --assemble --assemble --assemble --assemble --assemble \
    --dump log "$work/cycle10.log"
assembled=$(grep -c "cycle.s assembled" "$work/cycle10.log" || true)
cleared=$(grep -c "Memory and registers cleared" "$work/cycle10.log" || true)
if [ "$assembled" -eq 10 ] && [ "$cleared" -le 1 ]; then
  pass "ten saves: ten lines in Messages, no pile of clearings"
else
  fail "ten saves left $assembled lines and $cleared clearings"
fi
if grep -qE "undefined symbol|already defined|Duplicate" "$work/cycle10.log"; then
  fail "$(grep -m1 -E 'undefined symbol|already defined|Duplicate' "$work/cycle10.log")"
else
  pass "ten saves of the same file: no duplicate-label or undefined-symbol error"
fi

# A breakpoint set between two assembles is still on its statement
# afterwards, even when a line has been inserted above it.
printf '\t.text\nmain:\tli $v0, 1\n\tli $a0, 7\n\tsyscall\n\tli $v0, 10\n\tsyscall\n' \
    >"$work/bp.s"
run bpkeep --editor-open "$work/bp.s" --assemble \
    --editor-breakpoint 0040002c --editor-goto-line 2 \
    --editor-type '\tnop\n' --assemble --dump text-log "$work/bpkeep.text" \
    --dump log "$work/bpkeep.log"
if grep -q "bp.s assembled (1 breakpoint(s) kept)" "$work/bpkeep.log"; then
  pass "the assemble said it kept the breakpoint"
else
  fail "$(grep -m1 'bp.s assembled' "$work/bpkeep.log")"
fi
if grep -qE "^N .*; 5: syscall" "$work/bpkeep.text"; then
  pass "the breakpoint moved with its statement (line 4 -> line 5)"
else
  fail "the breakpoint is not on the statement it was on"
fi

# Run with nothing loaded: a sentence, not the core's address, and no box.
run noprogram --trigger action_Sim_Reinitialize --run \
    --dump log "$work/noprogram.log"
if grep -q "No program is loaded" "$work/noprogram.log" &&
   ! grep -q "undefined symbol" "$work/noprogram.log"; then
  pass "running with nothing loaded says what to do"
else
  fail "$(grep -m1 -E 'undefined symbol|No program' "$work/noprogram.log")"
fi
if grep -q "^dialog:" "$work/noprogram.out"; then
  fail "$(grep -m1 '^dialog:' "$work/noprogram.out")"
else
  pass "and does not put a box over the window"
fi

echo "== 18. the editor and the two panels in one place"
# A window half a 1920 screen wide.  In the two-column arrangements the
# code columns are about 300 pixels; in this one the panels have the width
# of the window less the registers.
for preset in Primary Mirrored Tabbed; do
  run "narrow$preset" --window-size 960x1080 --load "$repo/helloworld.s" \
      --editor-open "$repo/helloworld.s" \
      --trigger "action_Edu_Layout$preset" --layout-report
  textw=$(grep -m1 "^layout: text " "$work/narrow$preset.out" |
          sed -n 's/.* w=\([0-9]*\) .*/\1/p')
  regw=$(grep -m1 "^layout: intregs " "$work/narrow$preset.out" |
         sed -n 's/.* w=\([0-9]*\) .*/\1/p')
  pass "960x1080 $preset: text panel ${textw}px, registers ${regw}px"
  eval "width_$preset=\$textw"
done
if [ "${width_Tabbed:-0}" -gt "${width_Primary:-0}" ]; then
  pass "the tabbed arrangement gives the panels more width (${width_Tabbed} > ${width_Primary})"
else
  fail "the tabbed arrangement is no wider: ${width_Tabbed} vs ${width_Primary}"
fi
if grep -q "^layout: tabs Editor.* | Text.* | Data" "$work/narrowTabbed.out"; then
  pass "one tab bar holds Editor, Text and Data"
else
  fail "$(grep -m1 '^layout: tabs' "$work/narrowTabbed.out")"
fi

# A panel behind its tab cannot show the "Source changed" strip, so its
# tab carries a dot until it is the one in front.
run tabdot --window-size 960x1080 --editor-open "$repo/helloworld.s" \
    --assemble --editor-trigger action_Edu_LayoutTabbed --editor-type 'x' \
    --layout-report
if grep -qE "^layout: tabs Editor.*\| Text .*\| Data" "$work/tabdot.out"; then
  pass "$(grep -m1 '^layout: tabs Editor' "$work/tabdot.out" | sed 's/^layout: //')"
else
  fail "no dot on the tabs of the panels that are out of date"
fi
run tabdotfront --window-size 960x1080 --editor-open "$repo/helloworld.s" \
    --assemble --editor-trigger action_Edu_LayoutTabbed --editor-type 'x' \
    --raise text --layout-report
if grep -qE "^layout: tabs Editor.*\| Text\*? \|" "$work/tabdotfront.out"; then
  pass "the dot goes when that panel is the one in front"
else
  fail "$(grep -m1 '^layout: tabs Editor' "$work/tabdotfront.out")"
fi

# The tutorial brings each panel forward as it points at it, and puts the
# one the student was on back.
for panel in text data; do
  run "tabtutorial-$panel" --window-size 960x1080 --load "$repo/helloworld.s" \
      --trigger action_Edu_LayoutTabbed --raise "$panel" \
      --tutorial-exit finish
  if grep -q "front .* ok" "$work/tabtutorial-$panel.out"; then
    pass "the tutorial gives the $panel tab back"
  else
    fail "$(grep -m1 'front ' "$work/tabtutorial-$panel.out")"
  fi
done

# Ctrl+S still lands where it should in this arrangement.
run tabsave --window-size 960x1080 --editor-open "$repo/helloworld.s" \
    --editor-trigger action_Edu_LayoutTabbed --editor-key ctrl+s --editor-report
if grep -q "shared=Text" "$work/tabsave.out"; then
  pass "a good assemble brings the Text tab forward"
else
  fail "$(grep -m1 '^editor:' "$work/tabsave.out")"
fi
run tabsavebad --window-size 960x1080 \
    --editor-open "$repo/tests/samples/editor-errors.s" \
    --editor-trigger action_Edu_LayoutTabbed --editor-key ctrl+s --editor-report
if grep -q "shared=Editor" "$work/tabsavebad.out"; then
  pass "a failed assemble leaves the Editor tab in front"
else
  fail "$(grep -m1 '^editor:' "$work/tabsavebad.out")"
fi

echo "== 19. every run starts from the same screen"
# The "run" helper throws the settings away each time, so this part keeps
# one settings directory across three starts of the program.
keep="$work/keep-config"
rm -rf "$keep"
sticky() {  # sticky NAME ARGS...
  local name=$1; shift
  env -i QT_QPA_PLATFORM=offscreen HOME=/nonexistent \
      XDG_CONFIG_HOME="$keep" timeout 300 "$app" "$@" \
      >"$work/$name.out" 2>"$work/$name.err" || true
  cat "$work/$name.err" >>"$work/$name.out"
}
sticky aaFirst --window-size 1400x900 --load "$repo/helloworld.s" \
    --reg-base 2 --trigger action_Data_DisplayBinary \
    --editor-trigger action_Edu_LayoutTabbed --save-settings --layout-report
if grep -q "^bases: reg=2 data=2 .* layout=2" "$work/aaFirst.out"; then
  pass "first run: the student changed the bases and the arrangement"
else
  fail "$(grep -m1 '^bases:' "$work/aaFirst.out")"
fi
conf=$(find "$keep" -name "HallymMIPS.conf" | head -1)
screen=$(grep -icE "geometry|windowstate|DisplayBase|FontPointSize|DisplayUnit|^Show" "$conf" || true)
if [ "$screen" -eq 0 ]; then
  pass "nothing about the screen was written to the settings file"
else
  fail "$screen screen-state key(s) in $conf"
fi
sticky aaSecond --window-size 1400x900 --load "$repo/helloworld.s" --layout-report
if grep -q "^bases: reg=16 data=16 unit=4 layout=0" "$work/aaSecond.out"; then
  pass "the next run starts from the default screen"
else
  fail "$(grep -m1 '^bases:' "$work/aaSecond.out")"
fi

# A settings file from 1.2.0, with a saved window state in it.
mkdir -p "$keep/HallymMIPS"
cat >"$keep/HallymMIPS/HallymMIPS.conf" <<'CONF'
[MainWin]
Geometry=@ByteArray(nonsense)
WindowState=@ByteArray(nonsense)
LogVisible=false

[RegWin]
RegisterDisplayBase=2

[DataWin]
DataSegmentDisplayBase=2
EduDisplayUnit=1

[Text]
FontPointSize=28
CONF
sticky aaOld --window-size 1400x900 --load "$repo/helloworld.s" \
    --save-settings --layout-report
if grep -q "^bases: reg=16 data=16 unit=4 layout=0" "$work/aaOld.out"; then
  pass "a settings file from an older version starts at the defaults"
else
  fail "$(grep -m1 '^bases:' "$work/aaOld.out")"
fi
left=$(grep -icE "geometry|windowstate|DisplayBase|FontPointSize|DisplayUnit" \
       "$keep/HallymMIPS/HallymMIPS.conf" || true)
if [ "$left" -eq 0 ]; then
  pass "and the old screen-state keys are gone from the file"
else
  fail "$left old screen-state key(s) survived"
fi

# Window > Reset Layout: the same screen again, without a restart.
# Without --window-size, so that both runs get the size the default state
# asks for and the two screens can be compared.  The pixel geometry is left
# out of the comparison: what is being checked is that the same panels are
# in the same places with the same options, not that a window manager gave
# the same numbers twice.
run aaReset --load "$repo/helloworld.s" \
    --reg-base 2 --trigger action_Data_DisplayBinary \
    --editor-trigger action_Edu_LayoutTabbed \
    --trigger action_Win_Restore --layout-report
run aaPlain --load "$repo/helloworld.s" --layout-report
state() {  # state FILE -> the screen, without the pixel numbers
  grep -E "^(layout|bases|bottom):" "$1" |
    sed -E 's/ (x|y|w|h)=-?[0-9]+//g; s/[0-9]+/N/g' | sort
}
if diff <(state "$work/aaReset.out") <(state "$work/aaPlain.out") >/dev/null; then
  pass "Reset Layout gives back the screen a run starts from"
else
  fail "Reset Layout differs: $(diff <(state "$work/aaReset.out") <(state "$work/aaPlain.out") | head -3 | tr '\n' ' ')"
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
