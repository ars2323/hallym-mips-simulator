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

app="$build/QtSpimEdu"
if [ ! -x "$app" ] || [ "$(strings "$app" | grep -c -F -- '--editor-open' || true)" -eq 0 ]; then
  echo "$app is missing or was not built with CONFIG+=edu_devtools" >&2
  exit 1
fi

work=$(mktemp -d -t qtspim-edu-editor-XXXXXX)
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
if [ "$failures" -eq 0 ]; then
  echo "all checks passed"
  rm -rf "$work"
else
  echo "$failures check(s) failed"
  echo "outputs in $work"
  exit 1
fi
