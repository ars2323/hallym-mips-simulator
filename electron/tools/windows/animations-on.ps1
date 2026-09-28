# Turns Windows' "animation effects" on -- as on the students' PCs (Windows
# 10 and 11 have them on by default) -- since the runner has them off.
# Chromium's prefers-reduced-motion follows this setting
# (SPI_GETCLIENTAREAANIMATION), and with it off the first screen shows its
# still instead of the video: the installer check's picture of the program
# 마침 starts (check-installer-ui.ps1) would never show the video playing.
# Playwright's own launches force "no preference" whatever this says, so the
# e2e do not depend on it.
#
# SystemParametersInfo(SPI_SETCLIENTAREAANIMATION, TRUE), written to the
# user's profile and broadcast (programs started after it see it).  Writes
# the setting before and after to <Report>/animations.txt; exits 1 if it is
# still off at the end (the workflow goes on either way).
#
#   animations-on.ps1 [-Report <dir>]
param([string]$Report = 'report')
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force $Report | Out-Null
$log = Join-Path $Report 'animations.txt'
function Note($s) { Write-Host $s; Add-Content $log $s }

Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Anim {
  [DllImport("user32.dll", SetLastError = true)] static extern bool SystemParametersInfo(uint action, uint param, ref bool value, uint flags);
  [DllImport("user32.dll", SetLastError = true)] static extern bool SystemParametersInfo(uint action, uint param, IntPtr value, uint flags);
  const uint SPI_GETCLIENTAREAANIMATION = 0x1042, SPI_SETCLIENTAREAANIMATION = 0x1043;
  const uint SPIF_UPDATEINIFILE = 1, SPIF_SENDCHANGE = 2;
  public static bool Get() { bool on = false; SystemParametersInfo(SPI_GETCLIENTAREAANIMATION, 0, ref on, 0); return on; }
  public static bool Set(bool on) {
    return SystemParametersInfo(SPI_SETCLIENTAREAANIMATION, 0, on ? new IntPtr(1) : IntPtr.Zero, SPIF_UPDATEINIFILE | SPIF_SENDCHANGE);
  }
}
"@

Note "animation effects before: $([Anim]::Get())"
$ok = [Anim]::Set($true)
Note "SystemParametersInfo(SPI_SETCLIENTAREAANIMATION, TRUE): $ok"
$after = [Anim]::Get()
Note "animation effects after: $after"
if (-not $after) { exit 1 }
