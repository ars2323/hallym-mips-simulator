<#
.SYNOPSIS
  Package a Windows release build of Hallym MIPS Simulator as a self-contained zip.

.DESCRIPTION
  Collects HallymMIPS.exe, Qt's assistant.exe (the help browser), everything
  windeployqt says they need, the MSVC runtime DLLs, the generated help
  collection and a few documents into

      <OutDir>\HallymMIPS-<version>-win64\

  and zips that folder.  <version> is read from QtSpim/edu/edu_version.h.

  Run after building with qmake/nmake (see .github/workflows/ci.yml for the
  exact commands).  Needs windeployqt.exe on PATH or -QtBinDir, and the
  VCToolsRedistDir environment variable that vcvarsall sets, or -RedistDir.

.PARAMETER BuildDir
  The qmake shadow-build directory (contains HallymMIPS.exe or
  release\HallymMIPS.exe, and help\HallymMIPS.qch / help\HallymMIPS.qhc).
.PARAMETER OutDir
  Where the staging folder and the zip are written.  Default: dist
.PARAMETER QtBinDir
  Qt's bin directory.  Default: the directory of windeployqt.exe on PATH.
.PARAMETER RedistDir
  Directory holding the MSVC runtime DLLs (msvcp140.dll, vcruntime140*.dll).
  Default: found under $env:VCToolsRedistDir.
#>
param(
  [string]$BuildDir = "build",
  [string]$OutDir = "dist",
  [string]$QtBinDir = "",
  [string]$RedistDir = "",
  # Folder with HallymMIPS-GUIDE-ko.pdf / HallymMIPS-GUIDE.pdf (made by
  # tools/make-guide-pdf.sh; CI hands them over from the Linux job).  The
  # guides have pictures, so the PDFs are what goes into the zip; without
  # this the Markdown files are shipped instead.
  [string]$GuideDir = ""
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot

function Fail([string]$message) { Write-Error $message; exit 1 }

# ---- version -----------------------------------------------------------
$header = Get-Content (Join-Path $repo "QtSpim\edu\edu_version.h") -Raw
if ($header -notmatch '#define EDU_BASE_VERSION "([^"]+)"') { Fail "EDU_BASE_VERSION not found" }
$baseVersion = $Matches[1]
if ($header -notmatch '#define EDU_VERSION "([^"]+)"') { Fail "EDU_VERSION not found" }
$version = $Matches[1]
$name = "HallymMIPS-$version-win64"
Write-Host "packaging $name"

# ---- inputs ------------------------------------------------------------
$exe = @("$BuildDir\HallymMIPS.exe", "$BuildDir\release\HallymMIPS.exe") |
       Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { Fail "HallymMIPS.exe not found under $BuildDir" }

foreach ($f in @("$BuildDir\help\HallymMIPS.qch", "$BuildDir\help\HallymMIPS.qhc")) {
  if (-not (Test-Path $f)) { Fail "$f missing -- was the help collection built?" }
}

if (-not $QtBinDir) {
  $wdq = Get-Command windeployqt.exe -ErrorAction SilentlyContinue
  if (-not $wdq) { Fail "windeployqt.exe not on PATH; pass -QtBinDir" }
  $QtBinDir = Split-Path -Parent $wdq.Source
}
$windeployqt = Join-Path $QtBinDir "windeployqt.exe"
$assistant = Join-Path $QtBinDir "assistant.exe"
if (-not (Test-Path $assistant)) { Fail "$assistant not found (Qt tools missing?)" }

if (-not $RedistDir) {
  if (-not $env:VCToolsRedistDir) { Fail "VCToolsRedistDir not set; run from a VS developer prompt or pass -RedistDir" }
  $crt = Get-ChildItem -Directory (Join-Path $env:VCToolsRedistDir "x64") |
         Where-Object { $_.Name -like "Microsoft.VC*.CRT" } | Select-Object -First 1
  if (-not $crt) { Fail "no Microsoft.VC*.CRT directory under $env:VCToolsRedistDir\x64" }
  $RedistDir = $crt.FullName
}

# ---- stage -------------------------------------------------------------
$stage = Join-Path $OutDir $name
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force -Path $stage | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $stage "help") | Out-Null

Copy-Item $exe $stage
Copy-Item $assistant $stage

# Qt libraries and plugins for both executables.  --no-translations keeps
# the zip small; the program is English only.  The runtime DLLs are copied
# by hand below, so windeployqt is told not to bother.
foreach ($target in @("HallymMIPS.exe", "assistant.exe")) {
  & $windeployqt --release --no-translations --no-compiler-runtime `
      --dir $stage (Join-Path $stage $target)
  if ($LASTEXITCODE -ne 0) { Fail "windeployqt failed for $target" }
}

Copy-Item (Join-Path $RedistDir "*.dll") $stage
Copy-Item "$BuildDir\help\HallymMIPS.qch" (Join-Path $stage "help")
Copy-Item "$BuildDir\help\HallymMIPS.qhc" (Join-Path $stage "help")

Copy-Item (Join-Path $repo "helloworld.s") $stage
New-Item -ItemType Directory -Force (Join-Path $stage "samples") | Out-Null
Copy-Item (Join-Path $repo "samples\tutorial.s") (Join-Path $stage "samples")
Copy-Item (Join-Path $repo "README") (Join-Path $stage "README-SPIM.txt")
Copy-Item (Join-Path $repo "Setup\QtSpim_License.rtf") (Join-Path $stage "QtSpim_License.rtf")

# The student guide, Korean and English.
if ($GuideDir) {
  $guides = @("HallymMIPS-GUIDE-ko.pdf", "HallymMIPS-GUIDE.pdf")
  foreach ($guide in $guides) {
    $pdf = Join-Path $GuideDir $guide
    if (-not (Test-Path $pdf)) { Fail "$pdf missing" }
    Copy-Item $pdf $stage
  }
} else {
  # No PDFs at hand (a local build): the Markdown text, without its pictures.
  $guides = @("GUIDE-ko.md", "GUIDE.md")
  foreach ($guide in $guides) {
    $text = Get-Content (Join-Path $repo "docs\$guide") -Raw -Encoding UTF8
    [System.IO.File]::WriteAllText((Join-Path $stage $guide), $text,
                                    (New-Object System.Text.UTF8Encoding $true))
  }
}

$readme = Get-Content (Join-Path $repo "tools\windows-zip-README.txt") -Raw
$readme = $readme.Replace("@VERSION@", $version).Replace("@BASE_VERSION@", $baseVersion)
$readme = $readme.Replace("@GUIDE_KO@", $guides[0]).Replace("@GUIDE_EN@", $guides[1])
# UTF-8 with BOM so Notepad shows the Korean half correctly.
[System.IO.File]::WriteAllText((Join-Path $stage "README-HallymMIPS.txt"), $readme,
                                (New-Object System.Text.UTF8Encoding $true))

# ---- sanity checks on the result ----------------------------------------
$required = @("HallymMIPS.exe", "assistant.exe", "Qt5Core.dll", "Qt5Gui.dll",
              "Qt5Widgets.dll", "Qt5PrintSupport.dll", "Qt5Help.dll", "Qt5Sql.dll",
              "platforms\qwindows.dll", "sqldrivers\qsqlite.dll",
              "msvcp140.dll", "vcruntime140.dll",
              "help\HallymMIPS.qch", "help\HallymMIPS.qhc", "helloworld.s",
              "samples\tutorial.s",
              "README-HallymMIPS.txt") + $guides
$missing = $required | Where-Object { -not (Test-Path (Join-Path $stage $_)) }
if ($missing) { Fail ("zip would be incomplete, missing: " + ($missing -join ", ")) }

# ---- zip ---------------------------------------------------------------
$zip = Join-Path $OutDir "$name.zip"
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path $stage -DestinationPath $zip -CompressionLevel Optimal

Write-Host ""
Write-Host "contents of $name":
Get-ChildItem -Recurse -File $stage | ForEach-Object {
  "{0,10:N0}  {1}" -f $_.Length, $_.FullName.Substring($stage.Length + 1)
}
Write-Host ""
Write-Host ("wrote {0} ({1:N1} MB)" -f $zip, ((Get-Item $zip).Length / 1MB))
