<#
.SYNOPSIS
  Checks that the Hallym MIPS Simulator MSI cannot collide with a standard QtSpim.

.DESCRIPTION
  1. Reads the MSI's tables: product name, UpgradeCode, install folder,
     shortcuts, registry, and that there is no file association and nothing
     that names upstream's product (compared with upstream's own .wxs).
  2. With -Install (administrator rights; CI has them): puts a stand-in for a
     standard QtSpim installation in place (folder, Start menu folder, HKCU
     key), installs the MSI silently, checks what appeared, uninstalls, and
     checks that everything of ours is gone and the stand-in is untouched.
#>
param(
  [Parameter(Mandatory = $true)][string]$Msi,
  [switch]$Install
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$Msi = (Resolve-Path $Msi).Path
$script:failures = 0
function Pass([string]$m) { Write-Host "PASS  $m" }
function Bad([string]$m) { Write-Host "FAIL  $m"; $script:failures += 1 }
function Check([bool]$ok, [string]$m) { if ($ok) { Pass $m } else { Bad $m } }

# ---- 1. tables ------------------------------------------------------------
$installer = New-Object -ComObject WindowsInstaller.Installer
$db = $installer.GetType().InvokeMember("OpenDatabase", "InvokeMethod", $null, $installer, @($Msi, 0))

function Query([string]$sql, [int]$columns) {
  $rows = @()
  try {
    $view = $db.GetType().InvokeMember("OpenView", "InvokeMethod", $null, $db, @($sql))
  } catch { return $rows }   # the table does not exist
  $view.GetType().InvokeMember("Execute", "InvokeMethod", $null, $view, $null) | Out-Null
  while ($true) {
    $record = $view.GetType().InvokeMember("Fetch", "InvokeMethod", $null, $view, $null)
    if ($null -eq $record) { break }
    $row = @()
    for ($i = 1; $i -le $columns; $i++) {
      $row += $record.GetType().InvokeMember("StringData", "GetProperty", $null, $record, @($i))
    }
    $rows += ,$row
  }
  return $rows
}

$props = @{}
foreach ($r in (Query "SELECT Property, Value FROM Property" 2)) { $props[$r[0]] = $r[1] }

$upstreamWxs = Get-Content (Join-Path $repo "Setup\QtSpim_Win_Deployment\WiX\QtSpim.wxs") -Raw
if ($upstreamWxs -notmatch "UpgradeCode='([0-9a-fA-F-]+)'") { throw "upstream UpgradeCode not found" }
$upstreamUpgrade = $Matches[1].ToUpper()
$upstreamGuids = [regex]::Matches($upstreamWxs, "Guid='([0-9a-fA-F-]+)'") | ForEach-Object { $_.Groups[1].Value.ToUpper() }

Write-Host "== 1. MSI tables"
Check ($props["ProductName"] -eq "Hallym MIPS Simulator") "ProductName is Hallym MIPS Simulator (upstream: QtSpim)"
Check ($props["UpgradeCode"].Trim("{}").ToUpper() -eq "BF8A162B-8D89-43B4-9166-46E6EFEF30A9") "UpgradeCode is ours"
Check ($props["UpgradeCode"].Trim("{}").ToUpper() -ne $upstreamUpgrade) "UpgradeCode differs from upstream's ($upstreamUpgrade)"
Check ($props["ProductVersion"] -match '^[0-9]+\.[0-9]+\.[0-9]+$') "ProductVersion $($props['ProductVersion'])"
Check ($props["ALLUSERS"] -eq "1") "per-machine install"

$upgradeRows = Query "SELECT UpgradeCode FROM Upgrade" 1
Check (-not ($upgradeRows | Where-Object { $_[0].Trim("{}").ToUpper() -eq $upstreamUpgrade })) "the Upgrade table never looks for upstream's product"

$dirs = Query "SELECT Directory, DefaultDir FROM Directory" 2
$installDir = $dirs | Where-Object { $_[0] -eq "INSTALLFOLDER" }
Check ($installDir -and $installDir[1] -match "Hallym MIPS Simulator") "install folder is ...\Hallym MIPS Simulator ($($installDir[1]))"
Check (-not ($dirs | Where-Object { $_[1] -match '(^|\|)QtSpim\.?$' })) "no folder named QtSpim (upstream's)"

foreach ($table in @("Extension", "ProgId", "Verb", "MIME")) {
  $rows = Query "SELECT * FROM $table" 1
  Check ($rows.Count -eq 0) "no $table table rows (no .s file association)"
}

$registry = Query "SELECT Registry, Key FROM Registry" 2
Check (-not ($registry | Where-Object { $_[1] -match "LarusStone" })) "registry: nothing under LarusStone (upstream's settings)"
Check (-not ($registry | Where-Object { $_[1] -match '^Software\\HallymMIPS(\\|$)' })) "registry: nothing under Software\HallymMIPS (the program's own settings)"

$shortcuts = Query "SELECT Shortcut, Directory_, Name FROM Shortcut" 3
Check ($shortcuts.Count -ge 1 -and -not ($shortcuts | Where-Object { $_[1] -eq "DesktopFolder" })) "Start menu shortcut(s) only, none on the desktop"
Check (-not ($shortcuts | Where-Object { $_[2] -match '(^|\|)QtSpim$' })) "no shortcut named QtSpim"

$components = Query "SELECT Component, ComponentId FROM Component" 2
$clash = $components | Where-Object { $upstreamGuids -contains $_[1].Trim("{}").ToUpper() }
Check (-not $clash) "no component GUID shared with upstream's installer ($($components.Count) components)"

$files = Query "SELECT File, FileName FROM File" 2
foreach ($needed in @("HallymMIPS.exe", "assistant.exe", "Qt5Core.dll", "qwindows.dll", "HallymMIPS.qhc", "GUIDE-ko")) {
  Check ([bool]($files | Where-Object { $_[1] -match [regex]::Escape($needed) })) "contains $needed"
}
Check (-not ($files | Where-Object { $_[1] -match '(^|\|)QtSpim\.exe$' })) "does not contain QtSpim.exe"

[System.Runtime.InteropServices.Marshal]::ReleaseComObject($db) | Out-Null
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($installer) | Out-Null

# ---- 2. install / uninstall ------------------------------------------------
if ($Install) {
  Write-Host ""
  Write-Host "== 2. install next to a stand-in for standard QtSpim, then uninstall"
  $pf = $env:ProgramFiles
  $pf86 = ${env:ProgramFiles(x86)}
  $ours = Join-Path $pf "Hallym MIPS Simulator"
  $menu = Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs"

  # What upstream's MSI leaves on a PC (its .wxs): folder "QtSpim." under
  # Program Files (x86), Start menu folder QtSpim, HKCU\Software\LarusStone\QtSpim.
  $standIn = Join-Path $pf86 "QtSpim"
  New-Item -ItemType Directory -Force -Path $standIn | Out-Null
  Set-Content (Join-Path $standIn "QtSpim.exe") "stand-in"
  $standInMenu = Join-Path $menu "QtSpim"
  New-Item -ItemType Directory -Force -Path $standInMenu | Out-Null
  Set-Content (Join-Path $standInMenu "QtSpim.lnk") "stand-in"
  New-Item -Force -Path "HKCU:\Software\LarusStone\QtSpim" | Out-Null
  Set-ItemProperty "HKCU:\Software\LarusStone\QtSpim" -Name "StandIn" -Value "untouched"
  # ... and settings of our own program, which the installer must leave alone.
  New-Item -Force -Path "HKCU:\Software\HallymMIPS\HallymMIPS" | Out-Null
  Set-ItemProperty "HKCU:\Software\HallymMIPS\HallymMIPS" -Name "StandIn" -Value "untouched"

  function StandInIntact() {
    return (Test-Path (Join-Path $standIn "QtSpim.exe")) -and
           (Test-Path (Join-Path $standInMenu "QtSpim.lnk")) -and
           ((Get-ItemProperty "HKCU:\Software\LarusStone\QtSpim").StandIn -eq "untouched") -and
           ((Get-ItemProperty "HKCU:\Software\HallymMIPS\HallymMIPS").StandIn -eq "untouched")
  }

  $log = Join-Path $env:TEMP "qtspimedu-install.log"
  $p = Start-Process msiexec.exe -ArgumentList "/i `"$Msi`" /qn /norestart /l*v `"$log`"" -Wait -PassThru
  Check ($p.ExitCode -eq 0) "msiexec /i exit code $($p.ExitCode)"
  if ($p.ExitCode -ne 0) { Get-Content $log -Tail 40 }
  Check (Test-Path (Join-Path $ours "HallymMIPS.exe")) "installed $ours\HallymMIPS.exe"
  Check (Test-Path (Join-Path $ours "platforms\qwindows.dll")) "installed the Qt platform plugin"
  Check (Test-Path (Join-Path $ours "help\qtspim.qhc")) "installed the help collection"
  Check (Test-Path (Join-Path $menu "Hallym MIPS Simulator\Hallym MIPS Simulator.lnk")) "Start menu: Hallym MIPS Simulator\Hallym MIPS Simulator"
  Check (-not (Test-Path (Join-Path ([Environment]::GetFolderPath("CommonDesktopDirectory")) "Hallym MIPS Simulator.lnk"))) "no desktop shortcut"
  $assoc = cmd /c "assoc .s 2>nul"
  Check (-not ($assoc -match "QtSpim")) "no .s association ($assoc)"
  Check (StandInIntact) "stand-in for standard QtSpim untouched after install"

  $p = Start-Process msiexec.exe -ArgumentList "/x `"$Msi`" /qn /norestart" -Wait -PassThru
  Check ($p.ExitCode -eq 0) "msiexec /x exit code $($p.ExitCode)"
  Check (-not (Test-Path $ours)) "uninstall removed $ours"
  Check (-not (Test-Path (Join-Path $menu "Hallym MIPS Simulator"))) "uninstall removed the Start menu folder"
  Check (-not (Test-Path "HKCU:\Software\HallymMIPS-Installer")) "uninstall removed the installer's registry key"
  Check (StandInIntact) "stand-in for standard QtSpim, and our program's settings, untouched after uninstall"

  Remove-Item -Recurse -Force $standIn, $standInMenu
  Remove-Item -Recurse -Force "HKCU:\Software\LarusStone", "HKCU:\Software\HallymMIPS"
}

Write-Host ""
if ($script:failures -ne 0) { Write-Host "$($script:failures) check(s) failed"; exit 1 }
Write-Host "all checks passed"
exit 0  # not $LASTEXITCODE: "assoc .s" above exits 1 when there is no association
