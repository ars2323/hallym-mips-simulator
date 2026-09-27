<#
.SYNOPSIS
  Runs the installer as a student does -- with its pages, not /S -- and
  checks them (from 2.4.0: tools/package.ts, packaging/installer.nsh).

.DESCRIPTION
  PASS/FAIL lines to <Report>/installer-ui.txt; the script fails if any FAIL.
    - the pages: the progress, then the finish page, and nothing else (no
      folder to choose, no "for all users", no welcome or licence page)
    - the finish page: "설치가 완료되었습니다", and "지금 실행하기" ticked
    - 마침, with it ticked, starts the program
    - installed where /S installs: %LOCALAPPDATA%\Programs\Hallym MIPS, the
      Start menu's Hallym MIPS, the uninstall entry "Hallym MIPS <version>"
  then uninstalls it (silently).  Pictures, in <Report>:
    installer-progress.png  the progress page
    installer-finish.png    the finish page
    installer-started.png   the program 마침 started (its first screen)

  Usage (CI, with nothing of ours installed):
    check-installer-ui.ps1 -Setup s.exe -Report dir
#>
param(
  [Parameter(Mandatory = $true)][string]$Setup,
  [Parameter(Mandatory = $true)][string]$Report
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $Report | Out-Null
$log = Join-Path $Report 'installer-ui.txt'
$script:failures = 0
function Pass([string]$m) { Write-Host "PASS  $m"; Add-Content $log "PASS  $m" }
function Bad([string]$m) { Write-Host "FAIL  $m"; Add-Content $log "FAIL  $m"; $script:failures += 1 }
function Check([bool]$ok, [string]$m) { if ($ok) { Pass $m } else { Bad $m } }
function Note([string]$m) { Write-Host "      $m"; Add-Content $log "      $m" }

Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class Ui {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr p, EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, int msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  public static string Text(IntPtr h) { var s = new StringBuilder(1024); GetWindowText(h, s, s.Capacity); return s.ToString(); }
  public static string Class(IntPtr h) { var s = new StringBuilder(256); GetClassName(h, s, s.Capacity); return s.ToString(); }
  public static IntPtr[] Tops(uint pid) {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => { uint p; GetWindowThreadProcessId(h, out p); if (p == pid && IsWindowVisible(h)) list.Add(h); return true; }, IntPtr.Zero);
    return list.ToArray();
  }
  public static IntPtr[] Children(IntPtr parent) {
    var list = new List<IntPtr>();
    EnumChildWindows(parent, (h, l) => { if (IsWindowVisible(h)) list.Add(h); return true; }, IntPtr.Zero);
    return list.ToArray();
  }
}
'@
$BM_GETCHECK = 0x00F0; $BM_CLICK = 0x00F5; $PBM_GETRANGE = 0x0407; $PBM_GETPOS = 0x0408

function Shot([IntPtr]$h, [string]$name) {
  [void][Ui]::SetForegroundWindow($h)
  Start-Sleep -Milliseconds 400
  $r = New-Object Ui+RECT
  [void][Ui]::GetWindowRect($h, [ref]$r)
  $w = $r.Right - $r.Left; $hgt = $r.Bottom - $r.Top
  $bmp = New-Object System.Drawing.Bitmap $w, $hgt
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($r.Left, $r.Top, 0, 0, $bmp.Size)
  $bmp.Save((Join-Path $Report $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
  Note "picture: $name (${w}x${hgt})"
}
# The installer's window and what it shows now: which page, its controls.
function Page([System.Diagnostics.Process]$p) {
  $top = [Ui]::Tops([uint32]$p.Id) | Where-Object { [Ui]::Class($_) -eq '#32770' } | Select-Object -First 1
  if (-not $top) { return $null }
  $controls = @([Ui]::Children($top) | ForEach-Object { [pscustomobject]@{ H = $_; Class = [Ui]::Class($_); Text = [Ui]::Text($_) } })
  $kind = if ($controls | Where-Object { $_.Text -eq '설치가 완료되었습니다' }) { 'finish' }
          elseif ($controls | Where-Object { $_.Class -eq 'msctls_progress32' }) { 'progress' }
          else { 'other' }
  return [pscustomobject]@{ Top = $top; Kind = $kind; Controls = $controls; Title = [Ui]::Text($top) }
}

$uninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
function Ours() {
  Get-ChildItem $uninstallRoot -ErrorAction SilentlyContinue | ForEach-Object { Get-ItemProperty $_.PSPath } |
    Where-Object { $_.DisplayName -like 'Hallym MIPS 2*' }
}
Check ($null -eq (Ours)) 'nothing of ours installed before'
Get-Process HallymMIPS -ErrorAction SilentlyContinue | Stop-Process -Force

Write-Host '== the installer, with its pages'
$p = Start-Process (Resolve-Path $Setup).Path -PassThru
$pages = New-Object System.Collections.Generic.List[string]
$shotProgress = $false
$finish = $null
$deadline = (Get-Date).AddMinutes(4)
while ((Get-Date) -lt $deadline -and -not $p.HasExited) {
  $page = Page $p
  if ($page) {
    if ($pages.Count -eq 0 -or $pages[$pages.Count - 1] -ne $page.Kind) {
      $pages.Add($page.Kind)
      Note "page $($pages.Count): $($page.Kind) -- window ""$($page.Title)"": $(($page.Controls | Where-Object { $_.Text } | ForEach-Object { $_.Text }) -join ' | ')"
    }
    if ($page.Kind -eq 'progress' -and -not $shotProgress) {
      $bar = ($page.Controls | Where-Object { $_.Class -eq 'msctls_progress32' } | Select-Object -First 1).H
      $max = [Ui]::SendMessage($bar, $PBM_GETRANGE, [IntPtr]0, [IntPtr]0).ToInt64()
      $pos = [Ui]::SendMessage($bar, $PBM_GETPOS, [IntPtr]0, [IntPtr]0).ToInt64()
      if ($max -gt 0 -and $pos -ge $max * 0.25) { Shot $page.Top 'installer-progress.png'; $shotProgress = $true }
    }
    if ($page.Kind -eq 'finish') { $finish = $page; break }
  }
  Start-Sleep -Milliseconds 150
}
Check ($null -ne $finish) 'the finish page came'
Check (($pages -join ',') -eq 'progress,finish') "the pages: $($pages -join ', ') (the progress, then the finish page, nothing else)"
Check $shotProgress 'the progress page, pictured'
if ($finish) {
  Start-Sleep -Milliseconds 500
  $finish = Page $p
  Shot $finish.Top 'installer-finish.png'
  $texts = @($finish.Controls | ForEach-Object { $_.Text })
  Check ($texts -contains '설치가 완료되었습니다') 'finish page: 설치가 완료되었습니다'
  $run = $finish.Controls | Where-Object { $_.Class -eq 'Button' -and $_.Text -eq '지금 실행하기' } | Select-Object -First 1
  Check ($null -ne $run) 'finish page: 지금 실행하기'
  if ($run) { Check ([Ui]::SendMessage($run.H, $BM_GETCHECK, [IntPtr]0, [IntPtr]0).ToInt64() -eq 1) '지금 실행하기 ticked' }
  $done = $finish.Controls | Where-Object { $_.Class -eq 'Button' -and $_.Text -like '마침*' } | Select-Object -First 1
  Check ($null -ne $done) "finish page: the 마침 button ($($done.Text))"

  Write-Host '== 마침, with 지금 실행하기 ticked'
  if ($done) { [void][Ui]::SendMessage($done.H, $BM_CLICK, [IntPtr]0, [IntPtr]0) }
  Check ($p.WaitForExit(30000)) 'the installer closed'
  $app = $null
  for ($i = 0; $i -lt 60 -and -not $app; $i++) { Start-Sleep -Milliseconds 500; $app = Get-Process HallymMIPS -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 }
  Check ($null -ne $app) 'the program started'
  if ($app) {
    Start-Sleep -Seconds 6 # the first screen's video playing
    $app.Refresh()
    Shot $app.MainWindowHandle 'installer-started.png'
    Get-Process HallymMIPS -ErrorAction SilentlyContinue | ForEach-Object { $null = $_.CloseMainWindow() }
    Start-Sleep -Seconds 5
    Get-Process HallymMIPS -ErrorAction SilentlyContinue | Stop-Process -Force
  }
}
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }

Write-Host '== where it went: as /S installs'
$entry = Ours
Check ($null -ne $entry) 'uninstall entry under HKCU (per user)'
if ($entry) {
  Note "uninstall entry: $($entry.DisplayName) $($entry.DisplayVersion); $($entry.UninstallString)"
  Check ($entry.DisplayName -match '^Hallym MIPS 2\.\d+\.\d+$') "uninstall entry named ""$($entry.DisplayName)"""
  Check ($entry.InstallLocation -eq "$env:LOCALAPPDATA\Programs\Hallym MIPS") "installed in $($entry.InstallLocation)"
  Check (Test-Path (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Hallym MIPS.lnk')) 'Start menu: Hallym MIPS'
  Check (-not (Test-Path (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Hallym MIPS.lnk'))) 'no desktop shortcut'

  Write-Host '== uninstall (silent)'
  $un = ($entry.QuietUninstallString, $entry.UninstallString | Where-Object { $_ } | Select-Object -First 1)
  $exe = [regex]::Match($un, '"([^"]+)"').Groups[1].Value
  $uargs = ($un -replace '"[^"]+"', '').Trim()
  if ($uargs -notmatch '/S') { $uargs = "$uargs /S" }
  $u = Start-Process $exe -ArgumentList $uargs -Wait -PassThru
  Start-Sleep -Seconds 5
  Check ($null -eq (Ours)) "uninstalled (exit $($u.ExitCode))"
}

if ($script:failures -gt 0) { Write-Host "$($script:failures) failed"; exit 1 }
