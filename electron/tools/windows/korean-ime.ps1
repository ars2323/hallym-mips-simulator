# Adds Korean and its IME (Microsoft IME, 0412) to this user's input
# languages, for tests/e2e/ime-real.e2e.ts on the CI runner.  Installs the
# Korean language's basic capability first when the IME is not on the
# machine (Windows Server images do not always have it).  Writes what it
# found and did to <Report>/korean-ime.txt; exits non-zero when the IME is
# not there at the end.
param([string]$Report = 'report')
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force $Report | Out-Null
$log = Join-Path $Report 'korean-ime.txt'
function Note($s) { Write-Host $s; Add-Content $log $s }

$imeDir = Join-Path $env:windir 'System32\IME\IMEKR'
Note "OS: $((Get-CimInstance Win32_OperatingSystem).Caption) $((Get-CimInstance Win32_OperatingSystem).Version)"
Note "IMEKR folder before: $(Test-Path $imeDir)"
if (-not (Test-Path $imeDir)) {
  foreach ($cap in 'Language.Basic~~~ko-KR~0.0.1.0') {
    Note "Add-WindowsCapability $cap"
    try { Add-WindowsCapability -Online -Name $cap -ErrorAction Stop | Out-String | ForEach-Object { Note $_ } }
    catch { Note "  failed: $($_.Exception.Message)" }
  }
  Note "IMEKR folder after the capability: $(Test-Path $imeDir)"
}
try {
  $list = Get-WinUserLanguageList
  if (-not ($list | Where-Object LanguageTag -eq 'ko-KR')) { $list.Add('ko-KR') }
  Set-WinUserLanguageList $list -Force
  Note "input languages: $((Get-WinUserLanguageList | ForEach-Object { "$($_.LanguageTag) [$($_.InputMethodTips -join ', ')]" }) -join '; ')"
} catch { Note "Set-WinUserLanguageList failed: $($_.Exception.Message)" }
$tip = (Get-WinUserLanguageList | Where-Object LanguageTag -eq 'ko-KR').InputMethodTips
if ((Test-Path $imeDir) -and $tip) { Note 'RESULT  the Korean IME is installed'; exit 0 }
Note 'RESULT  no Korean IME'; exit 1
