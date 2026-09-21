<#
.SYNOPSIS
  Package a Windows release build of QtSpim-Edu as a self-contained zip.

.DESCRIPTION
  Collects QtSpimEdu.exe, Qt's assistant.exe (the help browser), everything
  windeployqt says they need, the MSVC runtime DLLs, the generated help
  collection and a few documents into

      <OutDir>\QtSpimEdu-<version>-win64\

  and zips that folder.  <version> is read from QtSpim/edu/edu_version.h.

  Run after building with qmake/nmake (see .github/workflows/ci.yml for the
  exact commands).  Needs windeployqt.exe on PATH or -QtBinDir, and the
  VCToolsRedistDir environment variable that vcvarsall sets, or -RedistDir.

.PARAMETER BuildDir
  The qmake shadow-build directory (contains QtSpimEdu.exe or
  release\QtSpimEdu.exe, and help\qtspim.qch / help\qtspim.qhc).
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
  [string]$RedistDir = ""
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot

function Fail([string]$message) { Write-Error $message; exit 1 }

# ---- version -----------------------------------------------------------
$header = Get-Content (Join-Path $repo "QtSpim\edu\edu_version.h") -Raw
if ($header -notmatch '#define EDU_BASE_VERSION "([^"]+)"') { Fail "EDU_BASE_VERSION not found" }
$baseVersion = $Matches[1]
if ($header -notmatch '#define EDU_VERSION EDU_BASE_VERSION "([^"]+)"') { Fail "EDU_VERSION not found" }
$version = $baseVersion + $Matches[1]
$name = "QtSpimEdu-$version-win64"
Write-Host "packaging $name"

# ---- inputs ------------------------------------------------------------
$exe = @("$BuildDir\QtSpimEdu.exe", "$BuildDir\release\QtSpimEdu.exe") |
       Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $exe) { Fail "QtSpimEdu.exe not found under $BuildDir" }

foreach ($f in @("$BuildDir\help\qtspim.qch", "$BuildDir\help\qtspim.qhc")) {
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
foreach ($target in @("QtSpimEdu.exe", "assistant.exe")) {
  & $windeployqt --release --no-translations --no-compiler-runtime `
      --dir $stage (Join-Path $stage $target)
  if ($LASTEXITCODE -ne 0) { Fail "windeployqt failed for $target" }
}

Copy-Item (Join-Path $RedistDir "*.dll") $stage
Copy-Item "$BuildDir\help\qtspim.qch" (Join-Path $stage "help")
Copy-Item "$BuildDir\help\qtspim.qhc" (Join-Path $stage "help")

Copy-Item (Join-Path $repo "helloworld.s") $stage
Copy-Item (Join-Path $repo "README") (Join-Path $stage "README-SPIM.txt")
Copy-Item (Join-Path $repo "Setup\QtSpim_License.rtf") (Join-Path $stage "QtSpim_License.rtf")

$readme = Get-Content (Join-Path $repo "tools\windows-zip-README.txt") -Raw
$readme = $readme.Replace("@VERSION@", $version).Replace("@BASE_VERSION@", $baseVersion)
# UTF-8 with BOM so Notepad shows the Korean half correctly.
[System.IO.File]::WriteAllText((Join-Path $stage "README-QtSpim-Edu.txt"), $readme,
                                (New-Object System.Text.UTF8Encoding $true))

# ---- sanity checks on the result ----------------------------------------
$required = @("QtSpimEdu.exe", "assistant.exe", "Qt5Core.dll", "Qt5Gui.dll",
              "Qt5Widgets.dll", "Qt5PrintSupport.dll", "Qt5Help.dll", "Qt5Sql.dll",
              "platforms\qwindows.dll", "sqldrivers\qsqlite.dll",
              "msvcp140.dll", "vcruntime140.dll",
              "help\qtspim.qch", "help\qtspim.qhc", "helloworld.s",
              "README-QtSpim-Edu.txt")
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
