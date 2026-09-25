# Types into a window through the real Microsoft Korean IME (Windows only;
# tests/e2e/ime-real.e2e.ts).  The window is brought forward, its input
# language set to Korean (0412), the IME put in Hangul mode, then the keys
# are sent as key presses (keybd_event), so the IME composes them as it
# would a student's typing.
#
#   type-korean.ps1 -Hwnd <window handle> -Keys gksrmf,ENTER
#
# Keys: letters on the 2-set Korean layout (g k s = ㅎ ㅏ ㄴ) and the names
# ENTER, TAB, BACK.  Prints what it saw: the keyboard layout and the IME's
# conversion mode before and after.
param([long]$Hwnd, [string[]]$Keys)
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Ime {
  [DllImport("user32.dll")] public static extern IntPtr LoadKeyboardLayout(string id, uint flags);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern IntPtr GetKeyboardLayout(uint thread);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint type);
  [DllImport("imm32.dll")] public static extern IntPtr ImmGetDefaultIMEWnd(IntPtr h);
}
"@
$h = [IntPtr]$Hwnd
$WM_INPUTLANGCHANGEREQUEST = 0x50; $WM_IME_CONTROL = 0x283; $IMC_GETCONVERSIONMODE = 1; $IMC_SETCONVERSIONMODE = 2
function Layout { '{0:X8}' -f ([Ime]::GetKeyboardLayout([Ime]::GetWindowThreadProcessId($h, [IntPtr]::Zero))).ToInt64() }
function Mode { $w = [Ime]::ImmGetDefaultIMEWnd($h); [Ime]::SendMessage($w, $WM_IME_CONTROL, [IntPtr]$IMC_GETCONVERSIONMODE, [IntPtr]::Zero).ToInt64() }

$null = [Ime]::SetForegroundWindow($h)
Write-Host "foreground is the window: $([Ime]::GetForegroundWindow() -eq $h)"
Write-Host "layout before: $(Layout); IME conversion mode before: $(Mode)"
$hkl = [Ime]::LoadKeyboardLayout('00000412', 1)
Write-Host "LoadKeyboardLayout(00000412): $('{0:X}' -f $hkl.ToInt64())"
$null = [Ime]::PostMessage($h, $WM_INPUTLANGCHANGEREQUEST, [IntPtr]::Zero, $hkl)
Start-Sleep -Milliseconds 500
$w = [Ime]::ImmGetDefaultIMEWnd($h)
$null = [Ime]::SendMessage($w, $WM_IME_CONTROL, [IntPtr]$IMC_SETCONVERSIONMODE, [IntPtr]1) # IME_CMODE_HANGUL
Start-Sleep -Milliseconds 300
Write-Host "layout after: $(Layout); IME conversion mode after: $(Mode) (1: Hangul)"

$named = @{ ENTER = 0x0D; TAB = 0x09; BACK = 0x08 }
function Press([byte]$vk) {
  $scan = [byte][Ime]::MapVirtualKey($vk, 0)
  [Ime]::keybd_event($vk, $scan, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 40
  [Ime]::keybd_event($vk, $scan, 2, [UIntPtr]::Zero) # KEYEVENTF_KEYUP
  Start-Sleep -Milliseconds 120
}
foreach ($k in $Keys) {
  if ($named.ContainsKey($k)) { Press $named[$k] }
  else { foreach ($c in $k.ToUpper().ToCharArray()) { Press ([byte][char]$c) } }
}
Start-Sleep -Milliseconds 300
