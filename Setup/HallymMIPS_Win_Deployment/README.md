# Hallym MIPS Simulator MSI (WiX Toolset v3)

`WiX/HallymMIPS.wxs` is this program's counterpart of upstream's
`../QtSpim_Win_Deployment/WiX/QtSpim.wxs`, which is left as it is. What is
deliberately different, so that the two products can live on one PC and never
touch each other:

| | Hallym MIPS Simulator | upstream QtSpim |
|---|---|---|
| ProductName | `Hallym MIPS Simulator` (Manufacturer `AIAC Lab, Hallym University`) | `QtSpim` |
| UpgradeCode | `BF8A162B-8D89-43B4-9166-46E6EFEF30A9` (**never change it**; QtSpim-Edu 1.0.x used `8B69C2A5-F331-48CE-A04C-1462CE02A3C8`) | `acf14497-9bbe-4d3d-b0b2-7b599eb18984` |
| Install folder | `%ProgramFiles%\Hallym MIPS Simulator` (64-bit) | `%ProgramFiles(x86)%\QtSpim.` |
| Start menu | `Hallym MIPS Simulator\Hallym MIPS Simulator`, `Hallym MIPS Simulator\User Guide` | `QtSpim\QtSpim` |
| Desktop shortcut | none | yes |
| Registry | `HKCU\Software\HallymMIPS-Installer` (key path of the shortcuts) | `HKCU\Software\LarusStone\QtSpim` |
| `.s` file association | **none** (upstream has none either) | none |
| Files | harvested with `heat` from the staged zip folder, so the MSI installs exactly what the zip contains | listed by hand |

The program's own settings are under `HKCU\Software\HallymMIPS\HallymMIPS`
(QSettings); the installer neither writes nor removes them.

Build (after `tools/package-windows.ps1` has staged `dist\HallymMIPS-<version>-win64`):

```powershell
tools/package-msi.ps1 -OutDir dist      # -> dist\HallymMIPS-<version>-win64.msi
tools/check-msi.ps1 -Msi dist\HallymMIPS-<version>-win64.msi [-Install]
```

`check-msi.ps1` reads the MSI's tables (identity, folders, no file association,
nothing of upstream's) and, with `-Install` (needs administrator rights; CI
does it), installs it silently next to a stand-in for a standard QtSpim
installation, checks what appeared, uninstalls, and checks that everything of
ours is gone and the stand-in is untouched.
