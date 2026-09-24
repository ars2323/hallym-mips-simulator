; electron-builder's one-click installer keeps a copy of itself (the whole
; installer, over 100 MB) in %LOCALAPPDATA%\<name>-updater for electron-updater's
; differential updates.  This program has no auto-updater: remove the copy.
!macro customInstall
  Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
  RMDir "$LOCALAPPDATA\hallym-mips-simulator-updater"
!macroend
