; SG Bus Timings for Windows: the .exe installer, sg-bus-timings-<version>-setup.exe (NSIS 3).
;
; One installer for every 64-bit PC: it carries the app built for x64 and for Arm64 and installs
; whichever the PC is. It installs for the person running it (no admin), asks where (the folder an
; earlier install used, or %LOCALAPPDATA%\Programs\SG Bus Timings), and adds Start menu and desktop
; shortcuts, the uwu:// links, and an uninstaller.
;
; It also replaces the Electron app (2.4.x and before) in place. Electron's own updater
; (electron-updater) downloads this file from latest.yml and runs it with "--updated /S" (and
; "--force-run" too for Restart to update, to open the new version), so everything an Electron
; install left behind is used again under the same names: the folder, the registry keys, the
; uninstaller's name and the shortcuts. Change none of the names below, or old copies stop updating.
;
; Electron's installer could also install "for all users", into C:\Program Files\SG Bus Timings
; with its keys under HKEY_LOCAL_MACHINE. Such a copy is updated where it is too: this installer
; then starts itself again with administrator rights (Windows asks), and installs for everyone
; (ChooseInstallMode).
;
; Where each name comes from (read from Electron 2.4.8's sg-bus-timings-2.4.8-setup.exe, on the
; android-v2.4.11 release, by unpacking its NSIS header and reading its strings):
;   - APP_GUID 8b1cb8d1-c06f-5377-97bb-cd1bae528f5a: the keys "Software\8b1cb8d1-..." (its value
;     InstallLocation) and "Software\Microsoft\Windows\CurrentVersion\Uninstall\8b1cb8d1-...",
;     under HKEY_CURRENT_USER (or HKEY_LOCAL_MACHINE for all users), and the installer's mutex name.
;   - The default folder: FOLDERID_UserProgramFiles (%LOCALAPPDATA%\Programs) + "\SG Bus Timings".
;   - "Uninstall SG Bus Timings.exe", run with /currentuser (or /allusers), and /S when quiet.
;   - DisplayName "SG Bus Timings <version>", Publisher "UwU Apps", NoModify 1, NoRepair 1.
;   - Shortcuts "$SMPROGRAMS\SG Bus Timings.lnk" and "$DESKTOP\SG Bus Timings.lnk", with the
;     AppUserModelID org.uwuapps.sgbus (the strings org.uwuapps.sgbus and SetLnkAUMI).
;   - The command-line options --updated and --force-run.
;   - The running app found by its file name, "SG Bus Timings.exe".
; The files Electron put in the folder were read from the installer's app-64.7z and app-arm64.7z.
;
; Built by package-windows.ps1, which passes:
;   /DVERSION=2.5.0              the app's version
;   /DPAYLOAD_X64=<folder>       the x64 build, its exe already renamed to "SG Bus Timings.exe"
;   /DPAYLOAD_ARM64=<folder>     the Arm64 build, the same
;   /DAPP_FILES=<file>           app-files.nsh, written by package-windows.ps1: every file and
;                                folder at the top of the two builds, for clearing and uninstalling
;   /DOUT_FILE=<file>            where to write the installer

Unicode true
SetCompressor /SOLID lzma
; Per user: doesn't ask for admin rights itself. Only an all-users install starts a second copy
; that asks (ChooseInstallMode).
RequestExecutionLevel user
ManifestDPIAware true

!include LogicLib.nsh
!include FileFunc.nsh
!include WinCore.nsh
!include WinMessages.nsh
!include x64.nsh
!include MUI2.nsh
; NSIS's own COM helpers: used to put the AppUserModelID on the shortcuts (MakeShortcut).
!include Win\COM.nsh
!include Win\Propkey.nsh

; Stops the build with a clear message if package-windows.ps1 didn't pass one of the settings.
!macro RequireSetting NAME
  !ifndef ${NAME}
    !error "${NAME} isn't set: build this with package-windows.ps1."
  !endif
!macroend
!insertmacro RequireSetting VERSION
!insertmacro RequireSetting PAYLOAD_X64
!insertmacro RequireSetting PAYLOAD_ARM64
!insertmacro RequireSetting APP_FILES
!insertmacro RequireSetting OUT_FILE

; ---------- the names (see the top of this file before changing any) ----------

!define PRODUCT_NAME "SG Bus Timings"
!define PUBLISHER "UwU Apps"
!define WEBSITE "https://sgbus.uwuapps.org"
!define APP_ID "org.uwuapps.sgbus"
!define APP_GUID "8b1cb8d1-c06f-5377-97bb-cd1bae528f5a"
!define EXE_NAME "SG Bus Timings.exe"
!define UNINSTALLER "Uninstall SG Bus Timings.exe"
; These three are under HKEY_CURRENT_USER for one person, HKEY_LOCAL_MACHINE for all users: NSIS's
; SHCTX follows SetShellVarContext.
!define INSTALL_KEY "Software\${APP_GUID}"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}"
!define SCHEME_KEY "Software\Classes\uwu"
; Start at sign-in (packages/sgbus_desktop's SetLogin): its value is named after the app id.
!define RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define RUN_APPROVED_KEY "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"
; The exit codes when an all-users copy can't get administrator rights, ERROR_CANCELLED (1223)
; and ERROR_ELEVATION_REQUIRED (740), come from NSIS's Win\WinError.nsh.

Name "${PRODUCT_NAME}"
OutFile "${OUT_FILE}"
BrandingText "${PRODUCT_NAME} ${VERSION}"
; The folder an earlier install recorded (Electron's or this one's), else the default.
InstallDir "$LOCALAPPDATA\Programs\${PRODUCT_NAME}"
InstallDirRegKey HKCU "${INSTALL_KEY}" "InstallLocation"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "FileDescription" "${PRODUCT_NAME} installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "${PUBLISHER}"

; ---------- the pages ----------

!define MUI_ICON "..\..\windows\runner\resources\app_icon.ico"
!define MUI_UNICON "..\..\windows\runner\resources\app_icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE_NAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Open ${PRODUCT_NAME}"

!define MUI_PAGE_CUSTOMFUNCTION_PRE DirectoryPre
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE DirectoryLeave
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_PAGE_CUSTOMFUNCTION_SHOW FinishShow
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

; ---------- what the command line asked for, and how it installs ----------

Var Updated    ; 1 with --updated: an updater started this (the app is quitting as it does)
Var ForceRun   ; 1 with --force-run: open the app once a silent install is done
Var Elevated   ; 1 in the copy started with administrator rights (--elevated, ChooseInstallMode)
Var AllUsers   ; 1 when installing for everyone on the PC (an Electron all-users install)
Var UserName   ; this person's Windows user name
Var TaskFilter ; the tasklist/taskkill filter for the running app: this person's copies only,
               ; or anyone's for an all-users install

; ---------- files at the top of the app's folder ----------

; Everything the Electron app put in its folder (2.4.8's list, plus libEGL.dll and libGLESv2.dll,
; which earlier Electron versions had). Deleted before installing, so none of it is left behind.
!macro DeleteElectronFiles
  Delete "$INSTDIR\chrome_100_percent.pak"
  Delete "$INSTDIR\chrome_200_percent.pak"
  Delete "$INSTDIR\d3dcompiler_47.dll"
  Delete "$INSTDIR\dxcompiler.dll"
  Delete "$INSTDIR\dxil.dll"
  Delete "$INSTDIR\ffmpeg.dll"
  Delete "$INSTDIR\icudtl.dat"
  Delete "$INSTDIR\libEGL.dll"
  Delete "$INSTDIR\libGLESv2.dll"
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\resources.pak"
  Delete "$INSTDIR\snapshot_blob.bin"
  Delete "$INSTDIR\v8_context_snapshot.bin"
  Delete "$INSTDIR\vk_swiftshader_icd.json"
  Delete "$INSTDIR\vk_swiftshader.dll"
  Delete "$INSTDIR\vulkan-1.dll"
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\resources"
!macroend

; This app's own files: the macro DeleteAppFiles, written by package-windows.ps1.
!include "${APP_FILES}"

; ---------- the installer ----------

; Checks it can run (64-bit Windows, one installer at a time), reads the command line, and works
; out whether this is an install for one person or for everyone.
Function .onInit
  SetShellVarContext current

  ; There's no 32-bit build. RunningX64 is also true on an Arm64 PC, where this (32-bit) installer
  ; runs under emulation.
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "${PRODUCT_NAME} needs 64-bit Windows." /SD IDOK
    Abort
  ${EndIf}
  SetRegView 64

  ${GetParameters} $R0
  StrCpy $Updated 0
  StrCpy $ForceRun 0
  StrCpy $Elevated 0
  ClearErrors
  ${GetOptions} $R0 "--updated" $R1
  ${IfNot} ${Errors}
    StrCpy $Updated 1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "--force-run" $R1
  ${IfNot} ${Errors}
    StrCpy $ForceRun 1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "--elevated" $R1
  ${IfNot} ${Errors}
    StrCpy $Elevated 1
  ${EndIf}
  ReadEnvStr $UserName "USERNAME"

  ; Before the mutex: a copy that hands over to an elevated one mustn't hold it.
  Call ChooseInstallMode

  ; One installer at a time. Electron's installer used the same mutex name, so it counts too.
  System::Call 'kernel32::CreateMutex(p 0, i 1, t "${APP_GUID}") p .r1 ?e'
  Pop $0
  ${If} $0 = 183 ; ERROR_ALREADY_EXISTS
    MessageBox MB_OK|MB_ICONEXCLAMATION "The ${PRODUCT_NAME} installer is already open." /SD IDOK
    Abort
  ${EndIf}
FunctionEnd

; For one person (the usual) or for everyone? An Electron install made "for all users" recorded its
; folder under HKEY_LOCAL_MACHINE, and is updated where it is: that needs administrator rights, so
; this installer starts itself again with them (Windows asks), passing the same options on, and
; waits for it. Refused, it stops rather than installing a second copy for this person.
Function ChooseInstallMode
  StrCpy $AllUsers 0
  StrCpy $TaskFilter '/FI "USERNAME eq $UserName"'
  ReadRegStr $0 HKCU "${INSTALL_KEY}" "InstallLocation"
  ReadRegStr $1 HKLM "${INSTALL_KEY}" "InstallLocation"
  ; The elevated copy may run as another (admin) account, whose own keys don't count.
  ${If} $Elevated == 0
    ${If} $0 != ""
    ${OrIf} $1 == ""
      Return
    ${EndIf}
  ${ElseIf} $1 == ""
    Return
  ${EndIf}

  StrCpy $AllUsers 1
  UserInfo::GetAccountType
  Pop $2
  ${If} $2 == "Admin"
    ; Rights already: install for everyone, in the folder it's in now.
    SetShellVarContext all
    StrCpy $INSTDIR $1
    StrCpy $TaskFilter ""
    Return
  ${EndIf}

  ${If} $Elevated == 1
    ; Started with rights and still without them.
    MessageBox MB_OK|MB_ICONSTOP "${PRODUCT_NAME} is installed for everyone on this PC, so it needs an administrator to update it." /SD IDOK
    SetErrorLevel ${ERROR_ELEVATION_REQUIRED}
    Quit
  ${EndIf}

  ClearErrors
  ExecShellWait "runas" "$EXEPATH" "--elevated $R0"
  ${If} ${Errors}
    ; The person said no to Windows' question (or it couldn't be asked).
    MessageBox MB_OK|MB_ICONINFORMATION "${PRODUCT_NAME} is installed for everyone on this PC, in $1. Updating it needs an administrator: run this installer again and allow it to make changes." /SD IDOK
    ; Restart to update quit the app to get here: it opens again, as it was, rather than being
    ; left closed.
    ${If} $ForceRun == 1
      Exec '"$1\${EXE_NAME}"'
    ${EndIf}
    SetErrorLevel ${ERROR_CANCELLED}
    Quit
  ${EndIf}

  ; The elevated copy has finished. Did it install this version? Its folder is read again, in case
  ; it changed. It doesn't open the app (that would run with administrator rights), so this copy
  ; does, as the person: after an update asked to (--force-run), or an install someone clicked
  ; through.
  ReadRegStr $3 HKLM "${UNINSTALL_KEY}" "DisplayVersion"
  ReadRegStr $4 HKLM "${INSTALL_KEY}" "InstallLocation"
  ${If} $3 == "${VERSION}"
    ${If} $ForceRun == 1
    ${OrIfNot} ${Silent}
      Exec '"$4\${EXE_NAME}"'
    ${EndIf}
    SetErrorLevel 0
  ${Else}
    ; Not installed (it stopped part-way, or the person cancelled it): the old version opens again
    ; after Restart to update, and the exit code says it failed.
    ${If} $ForceRun == 1
      Exec '"$1\${EXE_NAME}"'
    ${EndIf}
    SetErrorLevel 1
  ${EndIf}
  Quit
FunctionEnd

; The folder page: skipped for all users, as the copy is updated where it is (a different folder
; would leave the old one behind, still in everyone's Start menu).
Function DirectoryPre
  ${If} $AllUsers == 1
    Abort
  ${EndIf}
FunctionEnd

; Leaving the folder page: the app always gets a folder of its own (EnsureAppFolder).
Function DirectoryLeave
  Call EnsureAppFolder
FunctionEnd

; Makes sure the app goes in a folder of its own. A folder that doesn't end in "\SG Bus Timings"
; and doesn't already hold the app gets "\SG Bus Timings" added, so clearing an old copy and
; uninstalling (which delete the app's files and its data folder by name) never touch anyone
; else's files.
Function EnsureAppFolder
  ${If} ${FileExists} "$INSTDIR\${EXE_NAME}"
  ${OrIf} ${FileExists} "$INSTDIR\${UNINSTALLER}"
    Return
  ${EndIf}
  StrLen $0 "\${PRODUCT_NAME}"
  StrCpy $1 "$INSTDIR" "" -$0 ; the folder's last characters
  ${If} $1 != "\${PRODUCT_NAME}"
    StrCpy $INSTDIR "$INSTDIR\${PRODUCT_NAME}"
  ${EndIf}
FunctionEnd

; Puts 1 on the stack if "SG Bus Timings.exe" is running (the Electron app or this one; this
; person's only, unless it's an all-users install), 0 if not. Electron's installer tried PowerShell
; first and fell back to this same tasklist test.
Function IsAppRunning
  nsExec::ExecToStack `"$SYSDIR\cmd.exe" /C tasklist $TaskFilter /FI "IMAGENAME eq ${EXE_NAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${EXE_NAME}\""`
  Pop $0 ; findstr's exit code: 0 when it found a line
  Pop $1 ; what it printed (not needed)
  ${If} $0 == 0
    Push 1
  ${Else}
    Push 0
  ${EndIf}
FunctionEnd

; Closes the running app so its files can be replaced. Started by an updater (--updated), the app
; is already quitting, so it gets up to 10 seconds to go by itself; otherwise the person is asked
; first. Closing the window only hides it in the tray, so a copy still open after that is ended.
Function CloseRunningApp
  Call IsAppRunning
  Pop $0
  ${If} $0 == 0
    Return
  ${EndIf}

  ${If} $Updated == 0
    MessageBox MB_OKCANCEL|MB_ICONINFORMATION "${PRODUCT_NAME} is open. Select OK to close it and carry on." /SD IDOK IDOK closeIt
    Abort
  ${EndIf}

  closeIt:
  DetailPrint "Waiting for ${PRODUCT_NAME} to close..."
  ${If} $Updated == 1
    ${For} $2 1 20
      Sleep 500
      Call IsAppRunning
      Pop $0
      ${If} $0 == 0
        Return
      ${EndIf}
    ${Next}
  ${EndIf}

  ; Three tries at ending it, a second apart.
  ${For} $2 1 3
    nsExec::Exec `"$SYSDIR\taskkill.exe" /F /IM "${EXE_NAME}" $TaskFilter`
    Pop $0
    Sleep 1000
    Call IsAppRunning
    Pop $0
    ${If} $0 == 0
      Return
    ${EndIf}
  ${Next}

  MessageBox MB_OK|MB_ICONSTOP "${PRODUCT_NAME} couldn't be closed. Close it, then run the installer again." /SD IDOK
  Abort
FunctionEnd

; Clears the folder of an earlier install (Electron's or this app's), so no old files stay behind.
; Only a folder that holds the app is touched: someone who picked a folder with other things in it
; keeps them.
Function ClearOldCopy
  ${IfNot} ${FileExists} "$INSTDIR\${EXE_NAME}"
  ${AndIfNot} ${FileExists} "$INSTDIR\${UNINSTALLER}"
    Return
  ${EndIf}
  DetailPrint "Removing the earlier version's files..."
  !insertmacro DeleteElectronFiles
  !insertmacro DeleteAppFiles
  Delete "$INSTDIR\${UNINSTALLER}"
FunctionEnd

; Makes the shortcut at the path on the stack, to the app, carrying its AppUserModelID: Windows
; then ties the shortcut to the app's windows, Jump List and notifications. Built with NSIS's own
; COM helpers (Include\Win\COM.nsh, whose example this follows), as CreateShortcut can't set the ID.
Function MakeShortcut
  Exch $R0 ; the .lnk file to write
  Push $R1
  Push $R2
  Push $R3
  Push $R4

  !insertmacro ComHlpr_CreateInProcInstance ${CLSID_ShellLink} ${IID_IShellLink} R1 ""
  ${If} $R1 P<> 0
    ${IShellLink::SetPath} $R1 '("$INSTDIR\${EXE_NAME}")'
    ${IShellLink::SetWorkingDirectory} $R1 '("$INSTDIR")'
    ${IShellLink::SetIconLocation} $R1 '("$INSTDIR\${EXE_NAME}",0)'

    ${IUnknown::QueryInterface} $R1 '("${IID_IPropertyStore}",.R2)'
    ${If} $R2 P<> 0
      ; The property's name, and its value: a PROPVARIANT holding the ID as text (VT_LPWSTR).
      System::Call '*${SYSSTRUCT_PROPERTYKEY}(${PKEY_AppUserModel_ID})p.R3'
      System::Call '*(&i2 ${VT_LPWSTR}, &i6, w "${APP_ID}", &i4)p.R4'
      ${IPropertyStore::SetValue} $R2 '($R3,$R4)'
      ${IPropertyStore::Commit} $R2 ""
      System::Free $R3
      System::Free $R4
      ${IUnknown::Release} $R2 ""
    ${EndIf}

    ${IUnknown::QueryInterface} $R1 '("${IID_IPersistFile}",.R2)'
    ${If} $R2 P<> 0
      ${IPersistFile::Save} $R2 '("$R0",1)'
      ${IUnknown::Release} $R2 ""
    ${EndIf}
    ${IUnknown::Release} $R1 ""
  ${EndIf}

  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Pop $R0
FunctionEnd

; The Start menu shortcut always (Windows only shows an app's notifications with one). The desktop
; one on a new install, and on an update only if it's still there: someone who deleted it doesn't
; get it back with every update. For all users, they go in everyone's Start menu and desktop.
Function MakeShortcuts
  Push "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
  Call MakeShortcut
  ${If} $Updated == 0
  ${OrIf} ${FileExists} "$DESKTOP\${PRODUCT_NAME}.lnk"
    Push "$DESKTOP\${PRODUCT_NAME}.lnk"
    Call MakeShortcut
  ${EndIf}
  ; Tells Explorer the icons changed.
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
FunctionEnd

; The install folder and the Apps & features entry, with Electron's keys and values. The old entry
; goes first, so nothing Electron's installer wrote there (Comments, Readme, ...) is left over.
Function WriteRegistry
  WriteRegStr SHCTX "${INSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr SHCTX "${INSTALL_KEY}" "KeepShortcuts" "true"
  WriteRegStr SHCTX "${INSTALL_KEY}" "ShortcutName" "${PRODUCT_NAME}"

  ${If} $AllUsers == 1
    StrCpy $3 "/allusers"
  ${Else}
    StrCpy $3 "/currentuser"
  ${EndIf}
  DeleteRegKey SHCTX "${UNINSTALL_KEY}"
  WriteRegStr SHCTX "${UNINSTALL_KEY}" "DisplayName" "${PRODUCT_NAME} ${VERSION}"
  WriteRegStr SHCTX "${UNINSTALL_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr SHCTX "${UNINSTALL_KEY}" "DisplayIcon" "$INSTDIR\${EXE_NAME},0"
  WriteRegStr SHCTX "${UNINSTALL_KEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr SHCTX "${UNINSTALL_KEY}" "HelpLink" "${WEBSITE}"
  WriteRegStr SHCTX "${UNINSTALL_KEY}" "URLInfoAbout" "${WEBSITE}"
  WriteRegStr SHCTX "${UNINSTALL_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr SHCTX "${UNINSTALL_KEY}" "UninstallString" '"$INSTDIR\${UNINSTALLER}" $3'
  WriteRegStr SHCTX "${UNINSTALL_KEY}" "QuietUninstallString" '"$INSTDIR\${UNINSTALLER}" $3 /S'
  WriteRegDWORD SHCTX "${UNINSTALL_KEY}" "NoModify" 1
  WriteRegDWORD SHCTX "${UNINSTALL_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD SHCTX "${UNINSTALL_KEY}" "EstimatedSize" "$0"
FunctionEnd

; uwu:// links open the app, with the same values the app writes as it starts (links.dart). For
; all users it's everyone's default; each person's own copy of the key (the app's) comes first.
Function RegisterScheme
  WriteRegStr SHCTX "${SCHEME_KEY}" "" "URL:${PRODUCT_NAME} link"
  WriteRegStr SHCTX "${SCHEME_KEY}" "URL Protocol" ""
  WriteRegStr SHCTX "${SCHEME_KEY}\DefaultIcon" "" '"$INSTDIR\${EXE_NAME}",0'
  WriteRegStr SHCTX "${SCHEME_KEY}\shell\open\command" "" '"$INSTDIR\${EXE_NAME}" "%1"'
FunctionEnd

Section "Install"
  ; A folder given with /D= (or a silent install) gets the same check as the folder page.
  Call EnsureAppFolder
  Call CloseRunningApp
  SetOutPath "$INSTDIR"
  Call ClearOldCopy

  ; Both builds are inside; only this PC's is unpacked.
  ${If} ${IsNativeARM64}
    DetailPrint "Installing the Arm64 version..."
    File /r "${PAYLOAD_ARM64}\*"
  ${Else}
    DetailPrint "Installing the x64 version..."
    File /r "${PAYLOAD_X64}\*"
  ${EndIf}

  WriteUninstaller "$INSTDIR\${UNINSTALLER}"
  Call WriteRegistry
  Call MakeShortcuts
  Call RegisterScheme
SectionEnd

; The last page: in the copy started with administrator rights (--elevated), no "Open SG Bus
; Timings" tick box, as the app would get those rights too; the first copy opens it instead
; (ChooseInstallMode). An administrator who ran the installer themselves keeps the tick box.
Function FinishShow
  ${If} $Elevated == 1
    SendMessage $mui.FinishPage.Run ${BM_SETCHECK} ${BST_UNCHECKED} 0
    ShowWindow $mui.FinishPage.Run ${SW_HIDE}
  ${EndIf}
FunctionEnd

; A silent install with --force-run (Restart to update) opens the new version when it's done. The
; finish page's tick box does it for an install someone clicked through. Not in the copy started
; with administrator rights (see FinishShow).
Function .onInstSuccess
  ${If} ${Silent}
  ${AndIf} $ForceRun == 1
  ${AndIf} $Elevated == 0
    Exec '"$INSTDIR\${EXE_NAME}"'
  ${EndIf}
FunctionEnd

; ---------- the uninstaller ----------

; Reads the command line. --updated means another installer is putting a new version in this
; folder (Electron's installer does this when someone goes back to an Electron version), so the
; shortcuts, links and start at sign-in are left for it. An all-users copy (/allusers, or the folder
; recorded under HKEY_LOCAL_MACHINE) needs administrator rights to remove: without them, the
; uninstaller starts itself again with them (Windows asks).
Function un.onInit
  SetShellVarContext current
  SetRegView 64
  ${GetParameters} $R0
  StrCpy $Updated 0
  StrCpy $AllUsers 0
  StrCpy $Elevated 0
  ClearErrors
  ${GetOptions} $R0 "--updated" $R1
  ${IfNot} ${Errors}
    StrCpy $Updated 1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "--elevated" $R1
  ${IfNot} ${Errors}
    StrCpy $Elevated 1
  ${EndIf}
  ClearErrors
  ${GetOptions} $R0 "/allusers" $R1
  ${IfNot} ${Errors}
    StrCpy $AllUsers 1
  ${EndIf}
  ReadRegStr $0 HKLM "${INSTALL_KEY}" "InstallLocation"
  ${If} $0 == $INSTDIR
    StrCpy $AllUsers 1
  ${EndIf}
  ReadEnvStr $UserName "USERNAME"
  StrCpy $TaskFilter '/FI "USERNAME eq $UserName"'

  ${If} $AllUsers == 1
    SetShellVarContext all
    StrCpy $TaskFilter ""
    UserInfo::GetAccountType
    Pop $2
    ${If} $2 != "Admin"
      ${If} $Elevated == 1
        MessageBox MB_OK|MB_ICONSTOP "${PRODUCT_NAME} is installed for everyone on this PC, so it needs an administrator to remove it." /SD IDOK
        SetErrorLevel ${ERROR_ELEVATION_REQUIRED}
        Quit
      ${EndIf}
      ; This copy already runs from a temporary folder (NSIS copies the uninstaller there), so it
      ; starts itself again with the rights, working on the app's folder in place (_?=, which must
      ; come last). Its own copy can then delete the uninstaller in that folder, and ExecShellWait
      ; waits for the real work rather than for a copy that hands over at once.
      StrCpy $3 "/allusers --elevated"
      ${If} ${Silent}
        StrCpy $3 "$3 /S"
      ${EndIf}
      ${If} $Updated == 1
        StrCpy $3 "$3 --updated"
      ${EndIf}
      ClearErrors
      ExecShellWait "runas" "$EXEPATH" "$3 _?=$INSTDIR"
      ${If} ${Errors}
        MessageBox MB_OK|MB_ICONINFORMATION "${PRODUCT_NAME} is installed for everyone on this PC. Removing it needs an administrator: try again and allow it to make changes." /SD IDOK
        SetErrorLevel ${ERROR_CANCELLED}
      ${Else}
        SetErrorLevel 0
      ${EndIf}
      Quit
    ${EndIf}
  ${EndIf}
FunctionEnd

; Ends a running copy before its files go (the uninstaller's version of CloseRunningApp).
Function un.CloseRunningApp
  ${For} $2 1 3
    nsExec::ExecToStack `"$SYSDIR\cmd.exe" /C tasklist $TaskFilter /FI "IMAGENAME eq ${EXE_NAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${EXE_NAME}\""`
    Pop $0
    Pop $1
    ${If} $0 != 0
      Return
    ${EndIf}
    nsExec::Exec `"$SYSDIR\taskkill.exe" /F /IM "${EXE_NAME}" $TaskFilter`
    Pop $0
    Sleep 1000
  ${Next}
FunctionEnd

; Removes the app's files, shortcuts and registry entries. The person's data and settings
; (%APPDATA%\SG Bus Timings) are kept, as Electron's uninstaller kept them.
Section "Uninstall"
  Call un.CloseRunningApp

  !insertmacro DeleteAppFiles
  !insertmacro DeleteElectronFiles
  Delete "$INSTDIR\${UNINSTALLER}"
  ; The app's test that it can write here (updater.dart, _writable), should one be left behind.
  Delete "$INSTDIR\.sgbus-write-test-*"
  ; The folder itself only if nothing else is in it.
  RMDir "$INSTDIR"

  DeleteRegKey SHCTX "${UNINSTALL_KEY}"
  DeleteRegKey SHCTX "${INSTALL_KEY}"

  ${If} $Updated == 0
    Delete "$SMPROGRAMS\${PRODUCT_NAME}.lnk"
    Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
    ; Start at sign-in is each person's own: this person's goes. (When another account approved
    ; Windows' administrator question, this runs as that account, so it's that account's entries,
    ; and this person's stay; harmless, as Windows skips a sign-in item whose program is gone.)
    DeleteRegValue HKCU "${RUN_KEY}" "${APP_ID}"
    DeleteRegValue HKCU "${RUN_APPROVED_KEY}" "${APP_ID}"
    ; uwu:// only if it still opens this app: another UwU app may hold it now.
    ReadRegStr $0 SHCTX "${SCHEME_KEY}\shell\open\command" ""
    ${If} $0 == '"$INSTDIR\${EXE_NAME}" "%1"'
      DeleteRegKey SHCTX "${SCHEME_KEY}"
    ${EndIf}
    ReadRegStr $0 HKCU "${SCHEME_KEY}\shell\open\command" ""
    ${If} $0 == '"$INSTDIR\${EXE_NAME}" "%1"'
      DeleteRegKey HKCU "${SCHEME_KEY}"
    ${EndIf}
    System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
  ${EndIf}
SectionEnd
