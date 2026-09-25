; The per-user install folder: %LOCALAPPDATA%\Programs\Hallym MIPS.  A one-click
; installer names it after the package's npm name (hallym-mips, which may not
; have blanks or capitals); this include is read before the templates that
; use APP_FILENAME, so the folder carries the program's name.
!undef APP_FILENAME
!define APP_FILENAME "Hallym MIPS"

; electron-builder's one-click installer keeps a copy of itself (the whole
; installer, over 100 MB) in %LOCALAPPDATA%\<name>-updater for electron-updater's
; differential updates.  This program has no auto-updater: remove the copy.
!macro customInstall
  Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
  RMDir "$LOCALAPPDATA\hallym-mips-updater"
!macroend
