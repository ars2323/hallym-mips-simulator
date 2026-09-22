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
#   9. The tour always opens the example program, asking first when the
#      editor holds unsaved work (Cancel means it does not start), and every
#      one of its buttons works when clicked with the mouse.

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
      XDG_CONFIG_HOME="$work/config" timeout 120 "$app" "$@" \
      --dump console "$work/$name.console" >"$work/$name.out" 2>&1 || true
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
if [ -s "$work/bad-asm.log" ] && cmp -s "$work/bad-asm.log" "$work/bad-rel.log"; then
  pass "message log is the File menu route's, byte for byte"
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
expect 0 "start: Editor tab in front, no strip"          'banner=0 front=Editor'
expect 1 "file opened, not assembled: strip shows"      'file=keys.s modified=0 banner=1'
expect 2 "typed: modified, strip shows"                 'modified=1 banner=1 front=Editor'
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
    'modified=0 banner=0 front=Editor errors=1'
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
expect 0 "second start: last.s is open, strip shows, Editor in front" \
    'file=last.s modified=0 banner=1 front=Editor'
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

added=$(strip_text stripC --editor-open "$work/strip.s" --assemble \
    --editor-load "$work/other.s" --load-answer add --editor-report)
expect_strip "another program on top" "Text shows a different program" "$added"

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
echo "== 9. the tour always opens the example, and asks before taking the editor"
# The tour replaces whatever the editor holds with samples/tutorial.s.  That
# is worth one question when there is unsaved work, and no question at all
# otherwise; Cancel means the tour does not start and nothing changes.
printf '\t.text\nmain:\tli $v0, 10\n\tsyscall\n' >"$work/mine.s"
before=$(md5sum <"$work/mine.s")

tour_case() {  # tour_case NAME ANSWER WANT_STARTED WANT_ASKS ARGS...
  local name=$1 answer=$2 wantStarted=$3 wantAsks=$4; shift 4
  run "$name" "$@" --editor-answer "$answer" --window-size 1600x900 \
      --tutorial-report
  local out="$work/$name.out" steps skipped asked
  steps=$(sed -n 's/^tutorial steps=\([0-9]*\) .*/\1/p' "$out")
  skipped=$(sed -n 's/^tutorial steps=[0-9]* skipped=\([0-9]*\).*/\1/p' "$out")
  asked=$(grep -c '^editor question:' "$out" || true)
  if [ "$wantStarted" = "0" ]; then
    if [ -z "$steps" ]; then
      pass "$name: cancelled, the tour did not start"
    else
      fail "$name: cancelled but the tour ran ($steps steps)"
    fi
  else
    if [ "$steps" = "19" ] && [ "$skipped" = "0" ]; then
      pass "$name: 19 steps, none left out"
    else
      fail "$name: expected 19 steps and none skipped, got \"$steps\" and \"$skipped\" skipped"
      sed -n 's/^tutorial skipped: /  left out: /p' "$out"
    fi
  fi
  if [ "$asked" = "$wantAsks" ]; then
    pass "$name: $asked question(s) about unsaved work"
  else
    fail "$name: expected $wantAsks question(s), got $asked"
  fi
}

tour_case tourEmpty   discard 1 0
tour_case tourSaved   discard 1 0 --editor-open "$work/mine.s"
tour_case tourTyped   discard 1 1 --editor-type '# mine\n'
tour_case tourCancel  cancel  0 1 --editor-type '# mine\n'

if [ "$before" = "$(md5sum <"$work/mine.s")" ]; then
  pass "the file the editor held is unchanged on disk"
else
  fail "the tour wrote to $work/mine.s"
fi

# Every button, with the mouse: the tour used to end at the first click of
# Next because clicking the overlay deactivated the main window.
run tourClicks --window-size 1600x900 --tutorial-click-through
clicks=$(grep -c '^tutorial click Next: visible=1' "$work/tourClicks.out" || true)
if [ "$clicks" = "18" ]; then
  pass "Next, clicked with the mouse, walks all 19 steps"
else
  fail "expected 18 mouse clicks on Next, got $clicks"
fi
for what in "click Back: visible=1" "click finish: visible=0" "click Skip: visible=0"; do
  if grep -q "^tutorial $what" "$work/tourClicks.out"; then
    pass "mouse $what"
  else
    fail "mouse $what not reported"
    grep '^tutorial click' "$work/tourClicks.out" | tail -3
  fi
done

echo
if [ "$failures" -eq 0 ]; then
  echo "all checks passed"
  rm -rf "$work"
else
  echo "$failures check(s) failed"
  echo "outputs in $work"
  exit 1
fi
