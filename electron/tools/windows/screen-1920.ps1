# Sets the runner's screen to 1920x1080 -- the students' screens, and the
# one the default layout is made for -- since the runner starts at 1024x768.
# First Set-DisplayResolution (Windows Server's own cmdlet), then, if the
# screen is still not 1920x1080, ChangeDisplaySettings directly.  Writes what
# it tried, the display modes the adapter offers and the screen before and
# after to <Report>/screen.txt; exits 1 if the screen is not 1920x1080 at
# the end (the workflow goes on either way; the e2e do not depend on it).
#
#   screen-1920.ps1 [-Report <dir>]
param([string]$Report = 'report')
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force $Report | Out-Null
$log = Join-Path $Report 'screen.txt'
function Note($s) { Write-Host $s; Add-Content $log $s }
# The screen as a new process sees it (a process keeps what it saw at its start).
function Size {
  (powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; `$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; '{0}x{1}' -f `$b.Width, `$b.Height").Trim()
}

Add-Type @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
[StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
public struct DEVMODE {
  [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmDeviceName;
  public short dmSpecVersion; public short dmDriverVersion; public short dmSize; public short dmDriverExtra; public int dmFields;
  public int dmPositionX; public int dmPositionY; public int dmDisplayOrientation; public int dmDisplayFixedOutput;
  public short dmColor; public short dmDuplex; public short dmYResolution; public short dmTTOption; public short dmCollate;
  [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string dmFormName;
  public short dmLogPixels; public int dmBitsPerPel; public int dmPelsWidth; public int dmPelsHeight;
  public int dmDisplayFlags; public int dmDisplayFrequency; public int dmICMMethod; public int dmICMIntent;
  public int dmMediaType; public int dmDitherType; public int dmReserved1; public int dmReserved2;
  public int dmPanningWidth; public int dmPanningHeight;
}
public static class Display {
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] static extern int EnumDisplaySettings(string device, int mode, ref DEVMODE dm);
  [DllImport("user32.dll", CharSet = CharSet.Ansi)] static extern int ChangeDisplaySettings(ref DEVMODE dm, int flags);
  static DEVMODE New() { DEVMODE dm = new DEVMODE(); dm.dmSize = (short)Marshal.SizeOf(typeof(DEVMODE)); return dm; }
  public static string Modes() {
    var seen = new SortedSet<string>();
    DEVMODE dm = New();
    for (int i = 0; EnumDisplaySettings(null, i, ref dm) != 0; i++) seen.Add(dm.dmPelsWidth + "x" + dm.dmPelsHeight);
    return string.Join(", ", seen);
  }
  public static string Set(int w, int h) {
    DEVMODE dm = New();
    if (EnumDisplaySettings(null, -1, ref dm) == 0) return "EnumDisplaySettings(current) failed";
    dm.dmPelsWidth = w; dm.dmPelsHeight = h; dm.dmFields = 0x80000 | 0x100000; // DM_PELSWIDTH | DM_PELSHEIGHT
    int test = ChangeDisplaySettings(ref dm, 2);                                // CDS_TEST
    if (test != 0) return "ChangeDisplaySettings(CDS_TEST) = " + test;
    return "ChangeDisplaySettings = " + ChangeDisplaySettings(ref dm, 1);    // CDS_UPDATEREGISTRY; 0 is DISP_CHANGE_SUCCESSFUL
  }
}
"@

Note "OS: $((Get-CimInstance Win32_OperatingSystem).Caption)"
Note "adapter: $((Get-CimInstance Win32_VideoController | Select-Object -First 1).Name)"
Note "modes: $([Display]::Modes())"
Note "before: $(Size)"
try {
  Set-DisplayResolution -Width 1920 -Height 1080 -Force -ErrorAction Stop
  Note 'Set-DisplayResolution -Width 1920 -Height 1080 -Force: no error'
} catch {
  Note "Set-DisplayResolution: $($_.Exception.Message)"
}
Start-Sleep -Seconds 2
$now = Size
Note "after Set-DisplayResolution: $now"
if ($now -ne '1920x1080') {
  Note ([Display]::Set(1920, 1080))
  Start-Sleep -Seconds 2
  $now = Size
  Note "after ChangeDisplaySettings: $now"
}
if ($now -eq '1920x1080') { Note 'RESULT  the screen is 1920x1080'; exit 0 }
Note "RESULT  the screen is $now"; exit 1
