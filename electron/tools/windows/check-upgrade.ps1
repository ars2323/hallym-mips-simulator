# Installing this build over an earlier one, as a student who has the
# earlier one would: one install folder (%LOCALAPPDATA%\Programs\Hallym MIPS,
# the same one), one uninstall entry (now this version), one Start menu
# shortcut, the new program in place.  Then uninstalls, leaving the machine
# as it was.
#
#   check-upgrade.ps1 -Old <setup.exe> -OldVersion <x> -New <setup.exe> -NewVersion <y> -Report <dir>
param([string]$Old, [string]$OldVersion, [string]$New, [string]$NewVersion, [string]$Report)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force $Report | Out-Null
$log = Join-Path $Report 'upgrade.txt'
$failed = $false
function Note($s) { Write-Host $s; Add-Content $log $s }
function Check($ok, $what) { if ($ok) { Note "PASS  $what" } else { Note "FAIL  $what"; $script:failed = $true } }

$uninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
# (A fresh machine may have no per-user Uninstall key yet: none installed.)
$programs = Join-Path $env:LOCALAPPDATA 'Programs'
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
function Entries { Get-ChildItem $uninstallRoot -ErrorAction SilentlyContinue | ForEach-Object { Get-ItemProperty $_.PSPath } | Where-Object { $_.DisplayName -like 'Hallym MIPS*' } }
function Folders { Get-ChildItem $programs -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*allym*' } | ForEach-Object { $_.Name } }
function Shortcuts { Get-ChildItem $startMenu -Recurse -Filter '*.lnk' -ErrorAction SilentlyContinue | Where-Object { $_.Name -like '*allym*' } | ForEach-Object { $_.FullName.Substring($startMenu.Length + 1) } }
function Install($setup) {
  $p = Start-Process (Resolve-Path $setup).Path -ArgumentList '/S' -Wait -PassThru
  Check ($p.ExitCode -eq 0) "$(Split-Path -Leaf $setup) /S exit $($p.ExitCode)"
}
function State($when) {
  $e = @(Entries); $f = @(Folders); $s = @(Shortcuts)
  $exe = Join-Path $programs 'Hallym MIPS\HallymMIPS.exe'
  $v = if (Test-Path $exe) { (Get-Item $exe).VersionInfo.ProductVersion } else { '(none)' }
  Note "$when -- uninstall entries: $(($e | ForEach-Object { "$($_.DisplayName) [$($_.DisplayVersion)]" }) -join '; ')"
  Note "$when -- folders in $programs named *allym*: $($f -join '; ')"
  Note "$when -- Start menu shortcuts: $($s -join '; ')"
  Note "$when -- HallymMIPS.exe product version: $v"
  return @{ entries = $e; folders = $f; shortcuts = $s; version = $v }
}

Note "== before"
$s0 = State 'before'
Check ($s0.entries.Count -eq 0 -and $s0.folders.Count -eq 0) 'nothing installed to begin with'

Note "== $OldVersion"
Install $Old
$s1 = State 'earlier'
Check ($s1.entries.Count -eq 1 -and $s1.entries[0].DisplayVersion -eq $OldVersion) "$OldVersion installed: one entry"
Check (($s1.folders -join '|') -eq 'Hallym MIPS') "$OldVersion in Programs\Hallym MIPS"

Note "== $NewVersion over it"
Install $New
$s2 = State 'after'
Check ($s2.entries.Count -eq 1) 'one uninstall entry'
Check ($s2.entries.Count -ge 1 -and $s2.entries[0].DisplayVersion -eq $NewVersion) "the entry says $NewVersion"
Check (($s2.folders -join '|') -eq 'Hallym MIPS') 'one install folder, the same one (Programs\Hallym MIPS)'
Check ($s2.shortcuts.Count -eq 1) 'one Start menu shortcut'
Check ($s2.version -like "$NewVersion*" -and $s2.version -notlike "$OldVersion*") "the installed program is $NewVersion (was $OldVersion)"

Note "== uninstall"
$entry = $s2.entries[0]
$un = ($entry.QuietUninstallString, $entry.UninstallString | Where-Object { $_ } | Select-Object -First 1)
if ($un -match '^"([^"]+)"\s*(.*)$') { $exe = $Matches[1]; $uargs = $Matches[2] } else { $exe = $un; $uargs = '' }
if ($uargs -notmatch '/S') { $uargs = "$uargs /S" }
$p = Start-Process $exe -ArgumentList $uargs -Wait -PassThru
Start-Sleep -Seconds 3
$s3 = State 'uninstalled'
Check ($s3.entries.Count -eq 0 -and $s3.folders.Count -eq 0) 'uninstalled: no entry, no folder'

if ($failed) { Note 'RESULT  FAIL'; exit 1 } else { Note 'RESULT  PASS' }
