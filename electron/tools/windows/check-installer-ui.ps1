<#
.SYNOPSIS
  Runs the installer as a student does -- with its pages, not /S -- and
  checks them (from 2.4.0: tools/package.ts, packaging/installer.nsh).

.DESCRIPTION
  PASS/FAIL lines to <Report>/installer-ui.txt; the script fails if any FAIL.
    - the pages: the progress, then the finish page, and nothing else (no
      folder to choose, no "for all users", no welcome or licence page)
    - the finish page: "설치가 완료되었습니다", and "지금 실행하기" ticked
    - 마침, with it ticked, starts the program; its first 2.5 s on screen
      sampled at the caption buttons' patch (first-frames.txt: whether a
      white patch shows on the first screen's dark bar before the page
      turns it transparent)
    - installed where /S installs: %LOCALAPPDATA%\Programs\Hallym MIPS, the
      Start menu's Hallym MIPS, the uninstall entry "Hallym MIPS <version>"
  then uninstalls it with the uninstaller's pages (the progress, then "제거가
  끝났습니다"), as Settings > Apps does.  Pictures, in <Report>:
    installer-progress.png  the progress page
    installer-finish.png    the finish page
    installer-started.png   the program 마침 started (its first screen)
    installer-started-200ms.png  the same, about 200 ms after its window appeared
    uninstaller-finish.png  the uninstaller's finish page

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
  public static IntPtr[] AllTops() {
    var list = new List<IntPtr>();
    EnumWindows((h, l) => { if (IsWindowVisible(h)) list.Add(h); return true; }, IntPtr.Zero);
    return list.ToArray();
  }
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
# One pixel of the screen, as the display shows it.
function PixelAt([int]$x, [int]$y) {
  $b = New-Object System.Drawing.Bitmap 1, 1
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.CopyFromScreen($x, $y, 0, 0, $b.Size)
  $c = $b.GetPixel(0, 0); $g.Dispose(); $b.Dispose()
  return $c
}

# The installer's (or uninstaller's) window and what it shows now: which
# page, its controls.  The uninstaller runs as a copy of itself from %TEMP%,
# so it is found by its title, not by the process started.
function Page($p, [string]$finishTitle = '설치가 완료되었습니다') {
  $tops = if ($p -is [System.Diagnostics.Process]) { [Ui]::Tops([uint32]$p.Id) } else { [Ui]::AllTops() | Where-Object { [Ui]::Text($_) -like 'Hallym MIPS*' } }
  $top = $tops | Where-Object { [Ui]::Class($_) -eq '#32770' } | Select-Object -First 1
  if (-not $top) { return $null }
  $controls = @([Ui]::Children($top) | ForEach-Object { [pscustomobject]@{ H = $_; Class = [Ui]::Class($_); Text = [Ui]::Text($_) } })
  $kind = if ($controls | Where-Object { $_.Text -eq $finishTitle }) { 'finish' }
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
      if ($max -gt 0 -and $pos -ge $max * 0.25) {
        Shot $page.Top 'installer-progress.png'; $shotProgress = $true
        # The filled part of the bar, as the screen shows it: the app's blue (#0055A5), not Windows' green.
        $br = New-Object Ui+RECT; [void][Ui]::GetWindowRect($bar, [ref]$br)
        $c = PixelAt ($br.Left + 6) ([int](($br.Top + $br.Bottom) / 2))
        Note "the progress bar's filled part: rgb($($c.R), $($c.G), $($c.B))"
        $script:barBlue = ($c.B -gt 140 -and $c.R -lt 60 -and $c.G -lt 130)
      }
    }
    if ($page.Kind -eq 'finish') { $finish = $page; break }
  }
  Start-Sleep -Milliseconds 150
}
Check ($null -ne $finish) 'the finish page came'
Check (($pages -join ',') -eq 'progress,finish') "the pages: $($pages -join ', ') (the progress, then the finish page, nothing else)"
Check $shotProgress 'the progress page, pictured'
Check ([bool]$script:barBlue) "the progress bar in the app's blue, not Windows' green"
if ($finish) {
  Start-Sleep -Milliseconds 500
  $finish = Page $p
  Shot $finish.Top 'installer-finish.png'
  # The band on the left (packaging/installerSidebar.bmp): the app's navy, not electron-builder's light blue.
  $wr = New-Object Ui+RECT; [void][Ui]::GetWindowRect($finish.Top, [ref]$wr)
  $c = PixelAt ($wr.Left + 20) ($wr.Top + 260)
  Note "the finish page's band: rgb($($c.R), $($c.G), $($c.B))"
  Check ($c.R -lt 40 -and $c.G -lt 80 -and $c.B -gt 70 -and $c.B -lt 160) "the finish page's band in the app's navy"
  $texts = @($finish.Controls | ForEach-Object { $_.Text })
  Check ($texts -contains '설치가 완료되었습니다') 'finish page: 설치가 완료되었습니다'
  $run = $finish.Controls | Where-Object { $_.Class -eq 'Button' -and $_.Text -eq '지금 실행하기' } | Select-Object -First 1
  Check ($null -ne $run) 'finish page: 지금 실행하기'
  if ($run) { Check ([Ui]::SendMessage($run.H, $BM_GETCHECK, [IntPtr]0, [IntPtr]0).ToInt64() -eq 1) '지금 실행하기 ticked' }
  $done = $finish.Controls | Where-Object { $_.Class -eq 'Button' -and $_.Text -like '마침*' } | Select-Object -First 1
  Check ($null -ne $done) "finish page: the 마침 button ($($done.Text))"

  Write-Host '== 마침, with 지금 실행하기 ticked'
  if ($done) { [void][Ui]::SendMessage($done.H, $BM_CLICK, [IntPtr]0, [IntPtr]0) }
  # The first moments on screen (2.7.0): the main process opens the window
  # with a white caption patch and the page turns it transparent on its
  # dark first-screen bar -- does a white square show at the top right in
  # between?  From the window's appearance, every few tens of ms for 2.5 s:
  # the patch against the bar just before it (the 8 px the page keeps clear),
  # and one picture of the window about 200 ms in.
  Add-Type -AssemblyName System.Windows.Forms
  $sw = [Diagnostics.Stopwatch]::StartNew(); $win = [IntPtr]::Zero
  while ($sw.ElapsedMilliseconds -lt 30000 -and $win -eq [IntPtr]::Zero) {
    $pr = Get-Process HallymMIPS -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($pr -and [Ui]::IsWindowVisible($pr.MainWindowHandle)) { $win = $pr.MainWindowHandle } else { Start-Sleep -Milliseconds 15 }
  }
  Check ($win -ne [IntPtr]::Zero) "the program's window appeared ($($sw.ElapsedMilliseconds) ms after 마침)"
  if ($win -ne [IntPtr]::Zero) {
    $t0 = $sw.ElapsedMilliseconds; $frames = @(); $pictured = $false
    $screenW = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width
    $mean = { param($bm, $x) $s = @(0, 0, 0); for ($j = 0; $j -lt 6; $j++) { for ($i = 0; $i -lt 6; $i++) { $c = $bm.GetPixel($x + $i, $j); $s[0] += $c.R; $s[1] += $c.G; $s[2] += $c.B } }; ,@($s | ForEach-Object { [int]($_ / 36) }) }
    while ($sw.ElapsedMilliseconds - $t0 -lt 2500) {
      $wr = New-Object Ui+RECT; [void][Ui]::GetWindowRect($win, [ref]$wr)
      $right = [Math]::Min($wr.Right, $screenW); $top = [Math]::Max($wr.Top, 0)
      # 160 px ending at the window's right: the patch is its last 138 (three 46-px buttons at 100 %).
      $bm = New-Object System.Drawing.Bitmap 160, 6; $gr = [System.Drawing.Graphics]::FromImage($bm)
      $gr.CopyFromScreen($right - 160, $top + 6, 0, 0, $bm.Size); $gr.Dispose()
      $patch = & $mean $bm 26; $bar = & $mean $bm 14
      $frames += [pscustomobject]@{ ms = $sw.ElapsedMilliseconds - $t0; patch = $patch; bar = $bar }
      $bm.Dispose()
      if (-not $pictured -and $sw.ElapsedMilliseconds - $t0 -ge 200) {
        $pictured = $true
        $bmp = New-Object System.Drawing.Bitmap ($wr.Right - $wr.Left), ($wr.Bottom - $wr.Top); $g2 = [System.Drawing.Graphics]::FromImage($bmp)
        $g2.CopyFromScreen($wr.Left, $wr.Top, 0, 0, $bmp.Size); $g2.Dispose()
        $bmp.Save((Join-Path $Report 'installer-started-200ms.png'), [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
        Note "picture: installer-started-200ms.png ($($sw.ElapsedMilliseconds - $t0) ms after the window appeared)"
      }
    }
    $lum = { param($c) 0.2126 * $c[0] + 0.7152 * $c[1] + 0.0722 * $c[2] }
    $flash = @($frames | Where-Object { (& $lum $_.patch) -gt 200 -and (& $lum $_.bar) -lt 120 })
    Note ("first 2.5 s: {0} frames; the caption patch white on the dark bar in {1}" -f $frames.Count, $flash.Count)
    if ($flash.Count) { Note ("  at {0} ms" -f (($flash | ForEach-Object { $_.ms }) -join ', ')) }
    $frames | Select-Object -First 12 | ForEach-Object { Note ("  {0,5} ms  patch {1}  bar {2}" -f $_.ms, ($_.patch -join ','), ($_.bar -join ',')) }
    ($frames | ForEach-Object { "$($_.ms)`t$($_.patch -join ',')`t$($_.bar -join ',')" }) | Set-Content (Join-Path $Report 'first-frames.txt')
  }
  Check ($p.WaitForExit(30000)) 'the installer closed'
  $app = $null
  for ($i = 0; $i -lt 60 -and -not $app; $i++) { Start-Sleep -Milliseconds 500; $app = Get-Process HallymMIPS -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1 }
  Check ($null -ne $app) 'the program started'
  if ($app) {
    Start-Sleep -Seconds 6 # the first screen's video playing
    $app.Refresh()
    Shot $app.MainWindowHandle 'installer-started.png'
    # What this launch shows behind the card -- the video, or the still:
    # Windows' "animation effects" (SPI_GETCLIENTAREAANIMATION) is what
    # prefers-reduced-motion follows; and whether the picture moves.
    Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class Spi { [DllImport("user32.dll")] public static extern bool SystemParametersInfo(uint a, uint b, ref bool c, uint d); }'
    $anim = $false; [void][Spi]::SystemParametersInfo(0x1042, 0, [ref]$anim, 0)
    Note "Windows animation effects (SPI_GETCLIENTAREAANIMATION): $anim -- off means prefers-reduced-motion, the still only"
    $ar = New-Object Ui+RECT; [void][Ui]::GetWindowRect($app.MainWindowHandle, [ref]$ar)
    $grab = { $bm = New-Object System.Drawing.Bitmap 400, 120; $gr = [System.Drawing.Graphics]::FromImage($bm); $gr.CopyFromScreen($ar.Left + 60, $ar.Top + 80, 0, 0, $bm.Size); $gr.Dispose(); $bm }
    $a1 = & $grab; Start-Sleep -Seconds 2; $a2 = & $grab
    $diff = 0; for ($y = 0; $y -lt 120; $y += 4) { for ($x = 0; $x -lt 400; $x += 4) { $c1 = $a1.GetPixel($x, $y); $c2 = $a2.GetPixel($x, $y); $diff += [Math]::Abs($c1.R - $c2.R) + [Math]::Abs($c1.G - $c2.G) + [Math]::Abs($c1.B - $c2.B) } }
    Note ("the start screen's background over 2 s: mean change {0:N1} per pixel ({1})" -f ($diff / 3000), $(if ($diff / 3000 -gt 2) { 'moving: the video' } else { 'still: no video' }))
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
  # The uninstall key has no InstallLocation: the folder is the uninstaller's (as check-side-by-side.ps1 reads it).
  $dir = $entry.InstallLocation
  if (-not $dir) { $dir = Split-Path -Parent ($entry.UninstallString -replace '"', '' -replace ' /currentuser', '') }
  Check ($dir -eq "$env:LOCALAPPDATA\Programs\Hallym MIPS") "installed in $dir"
  Check (Test-Path (Join-Path $dir 'HallymMIPS.exe')) 'HallymMIPS.exe there'
  Check (Test-Path (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Hallym MIPS.lnk')) 'Start menu: Hallym MIPS'
  Check (-not (Test-Path (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Hallym MIPS.lnk'))) 'no desktop shortcut'

  Write-Host '== uninstall, with its pages (as Settings > Apps runs it)'
  $un = $entry.UninstallString
  $exe = [regex]::Match($un, '"([^"]+)"').Groups[1].Value
  $uargs = ($un -replace '"[^"]+"', '').Trim()
  $u = Start-Process $exe -ArgumentList $uargs -PassThru
  $upages = New-Object System.Collections.Generic.List[string]
  $ufinish = $null
  $deadline = (Get-Date).AddMinutes(3)
  while ((Get-Date) -lt $deadline) {
    $page = Page 'uninstaller' '제거가 끝났습니다'
    if ($page) {
      if ($upages.Count -eq 0 -or $upages[$upages.Count - 1] -ne $page.Kind) {
        $upages.Add($page.Kind)
        Note "uninstaller page $($upages.Count): $($page.Kind) -- window ""$($page.Title)"": $(($page.Controls | Where-Object { $_.Text } | ForEach-Object { $_.Text }) -join ' | ')"
      }
      if ($page.Kind -eq 'finish') { $ufinish = $page; break }
    }
    Start-Sleep -Milliseconds 150
  }
  Check (($upages -join ',') -eq 'progress,finish') "the uninstaller's pages: $($upages -join ', ') (the progress, then the finish page)"
  if ($ufinish) {
    Start-Sleep -Milliseconds 500
    $ufinish = Page 'uninstaller' '제거가 끝났습니다'
    Shot $ufinish.Top 'uninstaller-finish.png'
    $done = $ufinish.Controls | Where-Object { $_.Class -eq 'Button' -and $_.Text -like '마침*' } | Select-Object -First 1
    if ($done) { [void][Ui]::SendMessage($done.H, $BM_CLICK, [IntPtr]0, [IntPtr]0) }
  }
  Start-Sleep -Seconds 5
  Check ($null -eq (Ours)) 'uninstalled: the entry gone'
  Check (-not (Test-Path (Join-Path $dir 'HallymMIPS.exe'))) 'uninstalled: the program gone'
  if (Ours) {
    # Leave the runner clean whatever happened above.
    $q = Start-Process $exe -ArgumentList "$uargs /S" -Wait -PassThru
  }
}

if ($script:failures -gt 0) { Write-Host "$($script:failures) failed"; exit 1 }
