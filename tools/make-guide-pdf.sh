#!/usr/bin/env bash
#
# docs/GUIDE-ko.md and docs/GUIDE.md -> PDF, for the release page.
#
#   tools/make-guide-pdf.sh OUT_DIR
#
# Markdown -> HTML with pandoc (or Python's "markdown" module if PYTHON points
# at an interpreter that has it), HTML -> PDF with a headless Chrome/Chromium.
# A4, small type: the Korean guide is meant to fit two pages.  A font with
# Hangul has to be installed (CI installs fonts-nanum).

set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
out=${1:?usage: tools/make-guide-pdf.sh OUT_DIR}
mkdir -p "$out"
out=$(cd "$out" && pwd)

chrome=""
for c in google-chrome chromium chromium-browser google-chrome-stable; do
  if command -v "$c" >/dev/null 2>&1; then chrome=$c; break; fi
done
[ -n "$chrome" ] || { echo "no Chrome/Chromium for HTML -> PDF" >&2; exit 1; }

css='
@page { size: A4; margin: 14mm 15mm; }
body { font-family: "NanumGothic", "Malgun Gothic", "Noto Sans CJK KR", sans-serif;
       font-size: 9.6pt; line-height: 1.42; color: #111; }
h1 { font-size: 16pt; margin: 0 0 6pt; }
h2 { font-size: 11.5pt; margin: 10pt 0 3pt; border-bottom: 0.6pt solid #999; }
p, ul, ol { margin: 3pt 0; } li { margin: 1.5pt 0; }
table { border-collapse: collapse; width: 100%; font-size: 8.6pt; margin: 4pt 0; }
th, td { border: 0.5pt solid #888; padding: 2.5pt 4pt; vertical-align: top; }
th { background: #eee; }
code { font-family: "DejaVu Sans Mono", Consolas, monospace; font-size: 8.8pt; }
'

for name in GUIDE-ko GUIDE; do
  md="$repo/docs/$name.md"
  html="$out/$name.html"
  {
    printf '<!doctype html><html><head><meta charset="utf-8"><title>%s</title><style>%s</style></head><body>\n' "$name" "$css"
    if command -v pandoc >/dev/null 2>&1; then
      pandoc --from gfm --to html "$md"
    else
      "${PYTHON:-python3}" - "$md" <<'PY'
import sys, markdown
print(markdown.markdown(open(sys.argv[1], encoding="utf-8").read(), extensions=["tables"]))
PY
    fi
    printf '</body></html>\n'
  } >"$html"
  "$chrome" --headless --disable-gpu --no-sandbox --no-pdf-header-footer \
      --print-to-pdf="$out/QtSpim-Edu-$name.pdf" "file://$html" >/dev/null 2>&1
  [ -s "$out/QtSpim-Edu-$name.pdf" ] || { echo "no PDF for $name" >&2; exit 1; }
  rm -f "$html"
  echo "wrote $out/QtSpim-Edu-$name.pdf"
done
