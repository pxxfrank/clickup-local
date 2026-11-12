Unicode true
!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"
!include "FileFunc.nsh"

!ifndef APP_VERSION
  !define APP_VERSION "1.0.0"
!endif
!ifndef STAGE
  !define STAGE "..\..\build\win\stage"
!endif
!ifndef OUTFILE
  !define OUTFILE "..\..\release\ClickUp-Local-Setup-${APP_VERSION}.exe"
!endif

!define APP_NAME "ClickUp 本地版"
!define APP_PUBLISHER "pxxfrank"
!define APP_URL "https://github.com/pxxfrank/clickup-local"
!define APP_REG_KEY "Software\ClickUpLocal"
!define UNINST_REG_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ClickUpLocal"
!define APP_STATE_DIR "$LOCALAPPDATA\ClickUpLocal"

Name "${APP_NAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\ClickUpLocal"
InstallDirRegKey HKCU "${APP_REG_KEY}" "InstallDir"
RequestExecutionLevel user
SetCompressor /SOLID lzma
SetCompressorDictSize 64
CRCCheck on
ShowInstDetails hide
ShowUninstDetails hide
BrandingText "${APP_NAME} · 数据保存在本机"

VIProductVersion "1.5.0.0"
VIAddVersionKey "ProductName" "${APP_NAME}"
VIAddVersionKey "FileDescription" "${APP_NAME} 安装程序"
VIAddVersionKey "FileVersion" "${APP_VERSION}"
VIAddVersionKey "ProductVersion" "${APP_VERSION}"
VIAddVersionKey "CompanyName" "${APP_PUBLISHER}"
VIAddVersionKey "LegalCopyright" "Copyright (c) pxxfrank"

!define MUI_ICON "assets\clickup.ico"
!define MUI_UNICON "assets\clickup.ico"
!define MUI_HEADERIMAGE
!define MUI_HEADERIMAGE_BITMAP "assets\header.bmp"
!define MUI_HEADERIMAGE_RIGHT
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "安装 ClickUp 本地版"
!define MUI_WELCOMEPAGE_TEXT "这是一套完全运行在本机的 ClickUp 风格团队工作空间。$\r$\n$\r$\n安装程序会同时配置后台运行模式、调试控制台和日志查看入口。$\r$\n$\r$\n安装到当前用户目录，不需要管理员权限；数据与程序分离，升级不会覆盖你的任务数据。"

!define MUI_FINISHPAGE_RUN "$SYSDIR\wscript.exe"
!define MUI_FINISHPAGE_RUN_PARAMETERS "$\"$INSTDIR\scripts\open.vbs$\""
!define MUI_FINISHPAGE_RUN_TEXT "立即打开 ClickUp 本地版"
!define MUI_FINISHPAGE_SHOWREADME "$INSTDIR\README-Windows.txt"
!define MUI_FINISHPAGE_SHOWREADME_TEXT "查看安装说明"
!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

!macro StopInstalledService
  ${If} ${FileExists} "$INSTDIR\scripts\ClickUp.ps1"
    DetailPrint "停止旧版本后台服务..."
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\scripts\ClickUp.ps1" -Action StopQuiet'
    Sleep 1000
  ${EndIf}
!macroend

Function .onInit
  SetShellVarContext current
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "ClickUp 本地版仅支持 64 位 Windows 10 / 11。"
    Abort
  ${EndIf}
FunctionEnd

Section "核心程序（必需）" SEC_CORE
  SectionIn RO
  !insertmacro StopInstalledService

  RMDir /r "$INSTDIR\app"
  RMDir /r "$INSTDIR\scripts"
  RMDir /r "$INSTDIR\assets"
  RMDir /r "$INSTDIR\runtime"
  Delete "$INSTDIR\README-Windows.txt"
  Delete "$INSTDIR\uninstall.exe"

  SetOutPath "$INSTDIR"
  File /r "${STAGE}\*.*"

  WriteUninstaller "$INSTDIR\uninstall.exe"

  CreateDirectory "${APP_STATE_DIR}"
  CreateDirectory "${APP_STATE_DIR}\data"
  CreateDirectory "${APP_STATE_DIR}\logs"

  ; Remove old shortcuts/autostart before optional sections recreate them.
  Delete "$DESKTOP\ClickUp 本地版.lnk"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ClickUpLocal"

  WriteRegStr HKCU "${APP_REG_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_REG_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_REG_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_REG_KEY}" "Publisher" "${APP_PUBLISHER}"
  WriteRegStr HKCU "${UNINST_REG_KEY}" "URLInfoAbout" "${APP_URL}"
  WriteRegStr HKCU "${UNINST_REG_KEY}" "DisplayIcon" "$INSTDIR\assets\clickup.ico"
  WriteRegStr HKCU "${UNINST_REG_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_REG_KEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegStr HKCU "${UNINST_REG_KEY}" "QuietUninstallString" "$\"$INSTDIR\uninstall.exe$\" /S"
  WriteRegDWORD HKCU "${UNINST_REG_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_REG_KEY}" "NoRepair" 1

  CreateDirectory "$SMPROGRAMS\ClickUp 本地版"
  CreateShortCut "$SMPROGRAMS\ClickUp 本地版\ClickUp 本地版.lnk" "$SYSDIR\wscript.exe" "$\"$INSTDIR\scripts\open.vbs$\"" "$INSTDIR\assets\clickup.ico" 0
  CreateShortCut "$SMPROGRAMS\ClickUp 本地版\启动后台服务.lnk" "$SYSDIR\wscript.exe" "$\"$INSTDIR\scripts\start-hidden.vbs$\"" "$INSTDIR\assets\clickup.ico" 0
  CreateShortCut "$SMPROGRAMS\ClickUp 本地版\调试控制台.lnk" "$INSTDIR\scripts\console.cmd" "" "$INSTDIR\assets\clickup.ico" 0
  CreateShortCut "$SMPROGRAMS\ClickUp 本地版\查看运行日志.lnk" "$WINDIR\explorer.exe" "$\"${APP_STATE_DIR}\logs$\"" "$WINDIR\explorer.exe" 0
  CreateShortCut "$SMPROGRAMS\ClickUp 本地版\数据目录.lnk" "$WINDIR\explorer.exe" "$\"${APP_STATE_DIR}\data$\"" "$WINDIR\explorer.exe" 0
  CreateShortCut "$SMPROGRAMS\ClickUp 本地版\停止后台服务.lnk" "$SYSDIR\wscript.exe" "$\"$INSTDIR\scripts\stop.vbs$\"" "$INSTDIR\assets\clickup.ico" 0
  CreateShortCut "$SMPROGRAMS\ClickUp 本地版\使用说明.lnk" "$WINDIR\notepad.exe" "$\"$INSTDIR\README-Windows.txt$\"" "$WINDIR\notepad.exe" 0
  CreateShortCut "$SMPROGRAMS\ClickUp 本地版\卸载 ClickUp 本地版.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\assets\clickup.ico" 0
SectionEnd

Section "开机自动后台运行（推荐）" SEC_AUTOSTART
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ClickUpLocal" "$\"$SYSDIR\wscript.exe$\" $\"$INSTDIR\scripts\start-hidden.vbs$\""
SectionEnd

Section "创建桌面快捷方式" SEC_DESKTOP
  CreateShortCut "$DESKTOP\ClickUp 本地版.lnk" "$SYSDIR\wscript.exe" "$\"$INSTDIR\scripts\open.vbs$\"" "$INSTDIR\assets\clickup.ico" 0
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_CORE} "ClickUp 本地版主程序、内置 Node.js 运行时、生产依赖和启动脚本。"
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_AUTOSTART} "登录 Windows 时在后台自动启动服务，不弹出窗口；可在开始菜单中打开浏览器。"
  !insertmacro MUI_DESCRIPTION_TEXT ${SEC_DESKTOP} "在桌面创建「ClickUp 本地版」快捷方式。"
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Function un.onInit
  SetShellVarContext current
  ${If} ${FileExists} "$INSTDIR\scripts\ClickUp.ps1"
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$INSTDIR\scripts\ClickUp.ps1" -Action StopQuiet'
    Sleep 1000
  ${EndIf}
FunctionEnd

Section "Uninstall"
  Delete "$DESKTOP\ClickUp 本地版.lnk"
  RMDir /r "$SMPROGRAMS\ClickUp 本地版"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ClickUpLocal"
  DeleteRegKey HKCU "${UNINST_REG_KEY}"
  DeleteRegKey HKCU "${APP_REG_KEY}"
  RMDir /r "$INSTDIR"
  ${IfNot} ${Silent}
    MessageBox MB_ICONINFORMATION|MB_OK "ClickUp 本地版已卸载。$\r$\n$\r$\n本地数据和日志仍保留在：$\r$\n${APP_STATE_DIR}$\r$\n$\r$\n如确认不再使用，可手动删除该目录。"
  ${EndIf}
SectionEnd
