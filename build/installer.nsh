!include "MUI2.nsh"

!macro preInit
  SetRegView 64
  ; Force user-local installation directory
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCT_NAME}"
  SetShellVarContext current
!macroend

!macro customInit
  ; Kill any running instances before installation
  DetailPrint "Stopping Pairkiller processes..."
  nsExec::ExecToLog 'taskkill /F /IM "Pairkiller.exe" /T'
  Sleep 1000
  
  ; Clean up old installations from other locations
  Call CleanupOldInstallations
!macroend

!macro customInstall
  SetShellVarContext current
  
  DetailPrint "=== Pairkiller Post-Installation Setup ==="
  DetailPrint "Installation directory: $INSTDIR"
  
  ; Create registry entries
  WriteRegStr HKCU "Software\Pairkiller" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\Pairkiller" "Version" "${VERSION}"
  WriteRegStr HKCU "Software\Pairkiller" "InstallDate" "$$(Date)"
  
  ; Auto-start is controlled from inside the app (Settings) so upgrades respect user choice
  
  ; Verify installation
  IfFileExists "$INSTDIR\${PRODUCT_NAME}.exe" InstallSuccess InstallFailed
  
  InstallSuccess:
    DetailPrint "✓ Installation completed successfully!"
    DetailPrint "✓ Files installed to: $INSTDIR"
    Goto InstallEnd
    
  InstallFailed:
    DetailPrint "✗ Installation verification failed!"
    MessageBox MB_ICONSTOP "Installation failed. Main executable not found at $INSTDIR\${PRODUCT_NAME}.exe"
    
  InstallEnd:
!macroend

!macro customUnInstall
  DetailPrint "=== Pairkiller Uninstallation Started ==="
  
  ; Kill running processes (ignore exit code if not running)
  nsExec::ExecToLog 'taskkill /F /IM "Pairkiller.exe" /T'
  Sleep 1500
  
  ; Remove any legacy startup entry (app may have added this when auto-start was enabled)
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Pairkiller"
  
  ; Remove registry entries
  DeleteRegKey HKCU "Software\Pairkiller"
  
  ; Remove shortcuts
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
  Delete "$DESKTOP\Pairkiller.lnk"
  RMDir /r "$SMPROGRAMS\${PRODUCT_NAME}"
  RMDir /r "$SMPROGRAMS\Pairkiller"
  
  DetailPrint "✓ Uninstallation completed successfully!"
!macroend

!macro customInstallMode
  StrCpy $installMode "CurrentUser"
  StrCpy $INSTDIR "$LOCALAPPDATA\Programs\${PRODUCT_NAME}"
  SetShellVarContext current
!macroend

; Function to clean up old installations from other locations
Function CleanupOldInstallations
  DetailPrint "Cleaning up old installations..."
  
  ; Clean up old locations (but not current install dir)
  StrCmp "$INSTDIR" "$APPDATA\Pairkiller" SkipAppData 0
    IfFileExists "$APPDATA\Pairkiller\*.*" 0 SkipAppData
      DetailPrint "Removing old installation: $APPDATA\Pairkiller"
      RMDir /r "$APPDATA\Pairkiller"
  SkipAppData:
  
  StrCmp "$INSTDIR" "$PROGRAMFILES\Pairkiller" SkipPF 0
    IfFileExists "$PROGRAMFILES\Pairkiller\*.*" 0 SkipPF
      DetailPrint "Removing old installation: $PROGRAMFILES\Pairkiller"
      RMDir /r "$PROGRAMFILES\Pairkiller"
  SkipPF:
  
  StrCmp "$INSTDIR" "$PROGRAMFILES(X86)\Pairkiller" SkipPF86 0
    IfFileExists "$PROGRAMFILES(X86)\Pairkiller\*.*" 0 SkipPF86
      DetailPrint "Removing old installation: $PROGRAMFILES(X86)\Pairkiller"
      RMDir /r "$PROGRAMFILES(X86)\Pairkiller"
  SkipPF86:
  
  ; Clean up orphaned registry entries
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Pairkiller"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Pairkiller"
  
  ; Clean old auto-start entries
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Pairkiller"
  
  DetailPrint "✓ Cleanup completed"
FunctionEnd