!macro customInstall
  ; Check if WebView2 is already installed
  ReadRegStr $0 HKCU "Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" 0 webview2_done

  ReadRegStr $0 HKLM "SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}" "pv"
  StrCmp $0 "" 0 webview2_done

  DetailPrint "正在检测并安装 WebView2 运行时..."
  NSISdl::download "https://go.microsoft.com/fwlink/p/?LinkId=2124703" "$TEMP\MicrosoftEdgeWebView2RuntimeSetup.exe"
  Pop $1

  ${If} $1 == 0
    DetailPrint "正在安装 WebView2，请稍候..."
    ExecWait '"$TEMP\MicrosoftEdgeWebView2RuntimeSetup.exe" /silent /install'
    DetailPrint "WebView2 安装完成"
    Delete "$TEMP\MicrosoftEdgeWebView2RuntimeSetup.exe"
  ${Else}
    DetailPrint "WebView2 下载失败，请手动安装: https://developer.microsoft.com/en-us/microsoft-edge/webview2/"
  ${EndIf}

  webview2_done:
!macroend
