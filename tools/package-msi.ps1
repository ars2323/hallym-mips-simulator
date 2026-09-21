<#
.SYNOPSIS
  Builds the QtSpim-Edu MSI from the folder tools/package-windows.ps1 staged.

.DESCRIPTION
  dist\QtSpimEdu-<version>-win64\  ->  dist\QtSpimEdu-<version>-win64.msi

  WiX Toolset v3 (heat, candle, light) has to be installed; the WIX
  environment variable points at it on GitHub's Windows runners.
  See Setup\QtSpimEdu_Win_Deployment\README.md.
#>
param(
  [string]$OutDir = "dist"
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
function Fail([string]$message) { Write-Error $message; exit 1 }

$header = Get-Content (Join-Path $repo "QtSpim\edu\edu_version.h") -Raw
if ($header -notmatch '#define EDU_VERSION "([0-9]+\.[0-9]+\.[0-9]+)"') { Fail "EDU_VERSION (MAJOR.MINOR.PATCH) not found" }
$version = $Matches[1]
$name = "QtSpimEdu-$version-win64"
$stage = Join-Path $OutDir $name
if (-not (Test-Path (Join-Path $stage "QtSpimEdu.exe"))) { Fail "$stage is not staged; run tools/package-windows.ps1 first" }
$stage = (Resolve-Path $stage).Path

$wixBin = $null
if ($env:WIX) { $wixBin = Join-Path $env:WIX "bin" }
if (-not $wixBin -or -not (Test-Path (Join-Path $wixBin "candle.exe"))) {
  $candle = Get-Command candle.exe -ErrorAction SilentlyContinue
  if (-not $candle) { Fail "WiX Toolset v3 not found (WIX not set, candle.exe not on PATH)" }
  $wixBin = Split-Path -Parent $candle.Source
}

$work = Join-Path $OutDir "msi-build"
if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Force -Path $work | Out-Null

$wxs = Join-Path $repo "Setup\QtSpimEdu_Win_Deployment\WiX\QtSpimEdu.wxs"
$icon = Join-Path $repo "Setup\NewIcon.ico"
$license = Join-Path $repo "Setup\QtSpim_License.rtf"

# Every file of the staged folder, as one component group.
& (Join-Path $wixBin "heat.exe") dir $stage -nologo -cg AppFiles -dr INSTALLFOLDER `
    -gg -g1 -sfrag -srd -sreg -scom -var var.StageDir `
    -out (Join-Path $work "files.wxs")
if ($LASTEXITCODE -ne 0) { Fail "heat failed" }
# (candle -arch x64 below makes every component 64-bit.)
& (Join-Path $wixBin "candle.exe") -nologo -arch x64 `
    "-dProductVersion=$version" "-dStageDir=$stage" "-dIconFile=$icon" "-dLicenseFile=$license" `
    -out "$work\" $wxs (Join-Path $work "files.wxs")
if ($LASTEXITCODE -ne 0) { Fail "candle failed" }

$msi = Join-Path $OutDir "$name.msi"
& (Join-Path $wixBin "light.exe") -nologo -ext WixUIExtension -cultures:en-us `
    -out $msi (Join-Path $work "QtSpimEdu.wixobj") (Join-Path $work "files.wixobj")
if ($LASTEXITCODE -ne 0) { Fail "light failed" }

Write-Host ("wrote {0} ({1:N1} MB)" -f $msi, ((Get-Item $msi).Length / 1MB))
