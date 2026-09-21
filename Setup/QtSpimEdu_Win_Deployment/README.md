# QtSpim-Edu MSI (WiX Toolset v3)

`WiX/QtSpimEdu.wxs` is this fork's counterpart of upstream's
`../QtSpim_Win_Deployment/WiX/QtSpim.wxs`, which is left as it is. What is
deliberately different, so that the two products can live on one PC and never
touch each other:

| | QtSpim-Edu | upstream QtSpim |
|---|---|---|
| ProductName | `QtSpim-Edu` | `QtSpim` |
| UpgradeCode | `8B69C2A5-F331-48CE-A04C-1462CE02A3C8` (**never change it**) | `acf14497-9bbe-4d3d-b0b2-7b599eb18984` |
| Install folder | `%ProgramFiles%\QtSpim-Edu` (64-bit) | `%ProgramFiles(x86)%\QtSpim.` |
| Start menu | `QtSpim-Edu\QtSpim-Edu`, `QtSpim-Edu\User Guide` | `QtSpim\QtSpim` |
| Desktop shortcut | none | yes |
| Registry | `HKCU\Software\QtSpim-Edu-Installer` (key path of the shortcuts) | `HKCU\Software\LarusStone\QtSpim` |
| `.s` file association | **none** (upstream has none either) | none |
| Files | harvested with `heat` from the staged zip folder, so the MSI installs exactly what the zip contains | listed by hand |

The program's own settings are under `HKCU\Software\QtSpim-Edu\QtSpimEdu`
(QSettings); the installer neither writes nor removes them.

Build (after `tools/package-windows.ps1` has staged `dist\QtSpimEdu-<version>-win64`):

```powershell
tools/package-msi.ps1 -OutDir dist      # -> dist\QtSpimEdu-<version>-win64.msi
tools/check-msi.ps1 -Msi dist\QtSpimEdu-<version>-win64.msi [-Install]
```

`check-msi.ps1` reads the MSI's tables (identity, folders, no file association,
nothing of upstream's) and, with `-Install` (needs administrator rights; CI
does it), installs it silently next to a stand-in for a standard QtSpim
installation, checks what appeared, uninstalls, and checks that everything of
ours is gone and the stand-in is untouched.
