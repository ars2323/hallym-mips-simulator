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
  if (-not ($list | Where-Object LanguageTag -like 'ko*')) { $list.Add('ko-KR') }
  Set-WinUserLanguageList $list -Force
} catch { Note "Set-WinUserLanguageList failed: $($_.Exception.Message)" }
# (Under pwsh the International module runs in a Windows PowerShell session and
# hands back deserialized objects: the decision is taken on the text it prints.)
$languages = (Get-WinUserLanguageList | ForEach-Object { "$($_.LanguageTag) [$($_.InputMethodTips -join ', ')]" }) -join '; '
Note "input languages: $languages"
if ((Test-Path $imeDir) -and $languages -match '0412:\{A028AE76') { Note 'RESULT  the Korean IME is installed'; exit 0 }
Note 'RESULT  no Korean IME'; exit 1
