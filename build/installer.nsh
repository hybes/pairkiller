!include "MUI2.nsh"

!macro preInit
  SetRegView 64
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCT_NAME}"
  SetShellVarContext current
!macroend

!macro customInit
  DetailPrint "Stopping Pairkiller processes..."
  nsExec::ExecToLog 'taskkill /F /IM "Pairkiller.exe" /T'
  Sleep 1000

  Call CleanupOldInstallations
!macroend

!macro customInstall
  SetShellVarContext current

  ReadRegStr $R8 HKCU "Software\Pairkiller" "InstallPath"

  DetailPrint "=== Pairkiller Post-Installation Setup ==="
  DetailPrint "Installation directory: $INSTDIR"

  WriteRegStr HKCU "Software\Pairkiller" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\Pairkiller" "Version" "${VERSION}"
  WriteRegStr HKCU "Software\Pairkiller" "InstallDate" "$$(Date)"

  IfFileExists "$INSTDIR\${PRODUCT_NAME}.exe" InstallSuccess InstallFailed

  InstallSuccess:
    DetailPrint "Installation completed successfully."
    DetailPrint "Files installed to: $INSTDIR"
    StrCmp $R8 "" SkipPrevDir
    StrCmp $R8 $INSTDIR SkipPrevDir
    IfFileExists "$R8\${PRODUCT_NAME}.exe" 0 SkipPrevDir
    DetailPrint "Removing previous install directory: $R8"
    RMDir /r "$R8"
    SkipPrevDir:
    Goto InstallEnd

  InstallFailed:
    DetailPrint "Installation verification failed."
    MessageBox MB_ICONSTOP "Installation failed. Main executable not found at $INSTDIR\${PRODUCT_NAME}.exe"

  InstallEnd:
!macroend

!macro customUnInstall
  DetailPrint "Pairkiller uninstallation started."

  nsExec::ExecToLog 'taskkill /F /IM "Pairkiller.exe" /T'
  Sleep 1500

  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Pairkiller"
  DeleteRegKey HKCU "Software\Pairkiller"

  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  Delete "$DESKTOP\Pairkiller.lnk"
  RMDir /r "$SMPROGRAMS\${PRODUCT_NAME}"
  RMDir /r "$SMPROGRAMS\Pairkiller"

  DetailPrint "Uninstallation cleanup completed."
!macroend

!macro customInstallMode
  StrCpy $installMode "CurrentUser"
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCT_NAME}"
  SetShellVarContext current
!macroend

Function RemoveIfLegacyExeRoot
  Pop $R0
  StrCmp $R0 "" done
  StrCmp $R0 $INSTDIR done
  IfFileExists "$R0\${PRODUCT_NAME}.exe" 0 done
  DetailPrint "Removing legacy install (executable at root): $R0"
  RMDir /r "$R0"
done:
FunctionEnd

Function CleanupOldInstallations
  DetailPrint "Scanning for legacy install folders (only removed if ${PRODUCT_NAME}.exe is at folder root)."

  Push "$LOCALAPPDATA\${PRODUCT_NAME}"
  Call RemoveIfLegacyExeRoot

  Push "$PROGRAMFILES\${PRODUCT_NAME}"
  Call RemoveIfLegacyExeRoot

  ReadEnvStr $R7 "ProgramFiles(x86)"
  StrCmp $R7 "" +4
  Push "$R7\${PRODUCT_NAME}"
  Call RemoveIfLegacyExeRoot

  Push "$APPDATA\${PRODUCT_NAME}"
  Call RemoveIfLegacyExeRoot

  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Pairkiller"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Pairkiller"

  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Pairkiller"

  DetailPrint "Legacy cleanup pass completed."
FunctionEnd
