; The per-user install folder: %LOCALAPPDATA%\Programs\Hallym MIPS.  A one-click
; installer (to 2.3.0) named it after the package's npm name (hallym-mips, which
; may not have blanks or capitals); this include is read before the templates
; that use APP_FILENAME, so the folder carries the program's name -- as the
; assisted installer's own default does too.
!undef APP_FILENAME
!define APP_FILENAME "Hallym MIPS"

; The assisted installer's pages (tools/package.ts: oneClick false), from 2.4.0:
; the progress, then the finish page.  No page asks "for all users or only for
; me" -- only for this user, as before (all users would need an administrator):
; this answers it before it is shown, in the installer and the uninstaller.
!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

; The finish page: says it is done, and offers to start the program (ticked).
; /S shows no page, so a silent install starts nothing.
!macro customFinishPage
  ; As the template's own StartApp does (its macro declares a variable that
  ; installSection.nsh declares again): the shortcut, as the user, not elevated.
  Function HallymStartApp
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" ""
  FunctionEnd
  !define MUI_FINISHPAGE_TITLE "설치가 완료되었습니다"
  !define MUI_FINISHPAGE_TEXT "Hallym MIPS 설치를 마쳤습니다.$\r$\n$\r$\n다음부터는 시작 메뉴의 Hallym MIPS 항목으로 엽니다."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "지금 실행하기"
  !define MUI_FINISHPAGE_RUN_FUNCTION "HallymStartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend

; electron-builder's installer keeps a copy of itself (the whole
; installer, over 100 MB) in %LOCALAPPDATA%\<name>-updater for electron-updater's
; differential updates.  This program has no auto-updater: remove the copy.
!macro customInstall
  Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
  RMDir "$LOCALAPPDATA\hallym-mips-updater"
!macroend
