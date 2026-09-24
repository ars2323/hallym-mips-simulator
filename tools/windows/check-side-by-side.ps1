<#
.SYNOPSIS
  Installs the Qt build (Hallym MIPS Simulator 1.2.4, its release MSI) and
  this one (the NSIS installer, per user) on the same Windows, and checks
  that neither touches the other.

.DESCRIPTION
  Phases, each printing PASS/FAIL lines; the script fails if any FAIL:
    qt        install the 1.2.4 MSI, run it once (it writes its settings)
    manifest  our installer asks for no elevation (asInvoker)
    install   our installer, silent, per user: where it went, the Start menu
              entry, no desktop shortcut, no .s association, the uninstall
              entry under HKCU; the Qt install untouched
    together  both programs running at once
    (the caller then runs the e2e tests against $env:SPIM_E2E_EXE)
    after     Qt's settings unchanged by anything of ours
    uninstall ours removed; Qt still installed, its settings unchanged

  Usage (CI, administrator for the MSI):
    check-side-by-side.ps1 -Phase before -QtMsi q.msi -Setup s.exe -Report dir
    check-side-by-side.ps1 -Phase after  -Report dir
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet('before', 'after')][string]$Phase,
  [string]$QtMsi = '',
  [string]$Setup = '',
  [Parameter(Mandatory = $true)][string]$Report
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Report | Out-Null
$script:failures = 0
function Pass([string]$m) { Write-Host "PASS  $m"; Add-Content "$Report/side-by-side.txt" "PASS  $m" }
function Bad([string]$m) { Write-Host "FAIL  $m"; Add-Content "$Report/side-by-side.txt" "FAIL  $m"; $script:failures += 1 }
function Check([bool]$ok, [string]$m) { if ($ok) { Pass $m } else { Bad $m } }
function Note([string]$m) { Write-Host "      $m"; Add-Content "$Report/side-by-side.txt" "      $m" }

$qtDir = Join-Path $env:ProgramFiles 'Hallym MIPS Simulator'
$qtExe = Join-Path $qtDir 'HallymMIPS.exe'
$qtMenu = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Hallym MIPS Simulator\Hallym MIPS Simulator.lnk'
$qtKey = 'HKCU:\Software\HallymMIPS'
$ourMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Hallym MIPS Simulator 2.lnk'
$ourData = Join-Path $env:APPDATA 'HallymMIPS2'
$uninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'

function QtSettings() {
  # Qt's own settings (QSettings, organisation and application "HallymMIPS").
  $file = Join-Path $env:TEMP "qt-settings-$([guid]::NewGuid()).reg"
  & reg.exe export 'HKCU\Software\HallymMIPS' $file /y | Out-Null
  if (-not (Test-Path $file)) { return '' }
  return (Get-Content $file -Raw).TrimEnd()
}
function Ours() {
  Get-ChildItem $uninstallRoot -ErrorAction SilentlyContinue | ForEach-Object { Get-ItemProperty $_.PSPath } |
    Where-Object { $_.DisplayName -like 'Hallym MIPS Simulator 2*' }
}
function Association() { (& cmd.exe /c 'assoc .s' 2>&1) -join ' ' }
function StartAndClose([string]$exe, [int]$seconds) {
  $p = Start-Process $exe -PassThru
  Start-Sleep -Seconds $seconds
  $alive = -not $p.HasExited
  if ($alive) { $null = $p.CloseMainWindow(); if (-not $p.WaitForExit(10000)) { Stop-Process -Id $p.Id -Force } }
  return $alive
}

if ($Phase -eq 'before') {
  Write-Host '== qt: the Qt build, 1.2.4, from its release MSI'
  $assocBefore = Association
  $p = Start-Process msiexec.exe -ArgumentList "/i `"$((Resolve-Path $QtMsi).Path)`" /qn /norestart" -Wait -PassThru
  Check ($p.ExitCode -eq 0) "Qt 1.2.4 MSI installed (exit $($p.ExitCode))"
  Check (Test-Path $qtExe) "Qt: $qtExe"
  Check (Test-Path $qtMenu) "Qt: Start menu Hallym MIPS Simulator\Hallym MIPS Simulator"
  Check (StartAndClose $qtExe 6) 'Qt: runs, and closes (writing its settings)'
  QtSettings | Set-Content "$Report/qt-settings-before.reg"

  Write-Host '== manifest: our installer asks for no elevation'
  $bytes = [System.IO.File]::ReadAllBytes((Resolve-Path $Setup).Path)
  $text = [System.Text.Encoding]::ASCII.GetString($bytes)
  $m = [regex]::Match($text, 'requestedExecutionLevel\s+level="([a-zA-Z]+)"')
  Check ($m.Success -and $m.Groups[1].Value -eq 'asInvoker') "installer manifest: requestedExecutionLevel $($m.Groups[1].Value)"

  Write-Host '== install: ours, silent, per user'
  $p = Start-Process (Resolve-Path $Setup).Path -ArgumentList '/S' -Wait -PassThru
  Check ($p.ExitCode -eq 0) "installer /S exit $($p.ExitCode)"
  $entry = Ours
  Check ($null -ne $entry) 'uninstall entry under HKCU (per user)'
  $dir = $entry.InstallLocation
  if (-not $dir) { $dir = Split-Path -Parent ($entry.UninstallString -replace '"', '' -replace ' /currentuser', '') }
  Note "installed in: $dir"
  Note "uninstall entry: $($entry.DisplayName) $($entry.DisplayVersion), publisher $($entry.Publisher)"
  Check ($dir -like "$env:LOCALAPPDATA\Programs\*") 'installed under %LOCALAPPDATA%\Programs (no Program Files, no administrator)'
  Check ($dir -ne $qtDir) 'not in the Qt build''s folder'
  $exe = Join-Path $dir 'HallymMIPS.exe'
  Check (Test-Path $exe) 'HallymMIPS.exe'
  foreach ($f in 'LICENSE.txt', 'NOTICE.txt', 'LICENSE.electron.txt', 'LICENSES.chromium.html') {
    Check (Test-Path (Join-Path $dir $f)) "notice next to the program: $f"
  }
  Check (Test-Path $ourMenu) 'Start menu: Hallym MIPS Simulator 2'
  Check (-not (Test-Path (Join-Path $env:LOCALAPPDATA 'hallym-mips-simulator-updater'))) 'no copy of the installer kept (no updater folder)'
  $size = (Get-ChildItem $dir -Recurse -File | Measure-Object Length -Sum).Sum
  Note ('installed size: {0:N1} MB' -f ($size / 1MB))
  Check (-not (Test-Path (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Hallym MIPS Simulator 2.lnk'))) 'no desktop shortcut'
  Check (-not (Test-Path 'HKCU:\Software\Classes\.s')) 'no .s under HKCU\Software\Classes'
  Check ((Association) -eq $assocBefore) "assoc .s unchanged ($assocBefore)"
  Check (Test-Path $qtExe) 'Qt build still installed'
  Check (Test-Path $qtMenu) 'Qt Start menu entry still there'
  Set-Content "$Report/installed.txt" $exe

  Write-Host '== together: both running at once'
  $qt = Start-Process $qtExe -PassThru
  $ourP = Start-Process $exe -PassThru
  Start-Sleep -Seconds 10
  Check (-not $qt.HasExited) 'Qt build running'
  Check (-not $ourP.HasExited) 'ours running, alongside'
  $null = $ourP.CloseMainWindow(); if (-not $ourP.WaitForExit(10000)) { Stop-Process -Id $ourP.Id -Force }
  $null = $qt.CloseMainWindow(); if (-not $qt.WaitForExit(10000)) { Stop-Process -Id $qt.Id -Force }
  Check (Test-Path $ourData) "our settings folder: $ourData"
  $hallym = Get-ChildItem $env:APPDATA, $env:LOCALAPPDATA -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*allym*' } | ForEach-Object { $_.FullName }
  Note "folders named *allym* in APPDATA/LOCALAPPDATA: $($hallym -join '; ')"
  QtSettings | Set-Content "$Report/qt-settings-together.reg"
}

if ($Phase -eq 'after') {
  Write-Host '== after: Qt settings, ours uninstalled'
  $before = (Get-Content "$Report/qt-settings-together.reg" -Raw).TrimEnd()
  Check ((QtSettings) -eq $before) 'Qt settings unchanged by our tests (registry HKCU\Software\HallymMIPS)'
  $entry = Ours
  $un = ($entry.QuietUninstallString, $entry.UninstallString | Where-Object { $_ } | Select-Object -First 1)
  Note "uninstall: $un"
  $exe = [regex]::Match($un, '"([^"]+)"').Groups[1].Value
  $uargs = ($un -replace '"[^"]+"', '').Trim()
  if ($uargs -notmatch '/S') { $uargs = "$uargs /S" }
  $p = Start-Process $exe -ArgumentList $uargs -Wait -PassThru
  Start-Sleep -Seconds 5  # the NSIS uninstaller copies itself and returns early
  Check ($null -eq (Ours)) 'uninstall entry gone'
  Check (-not (Test-Path $ourMenu)) 'Start menu entry gone'
  Check (-not (Test-Path (Get-Content "$Report/installed.txt"))) 'program gone'
  Check (Test-Path $qtExe) 'Qt build still installed'
  Check (Test-Path $qtMenu) 'Qt Start menu entry still there'
  Check ((QtSettings) -eq $before) 'Qt settings unchanged by our uninstall'
  Note "our settings folder after uninstall: $(if (Test-Path $ourData) { 'kept (deleteAppDataOnUninstall: false)' } else { 'gone' })"
}

if ($script:failures -gt 0) { throw "$($script:failures) check(s) failed" }
