const { app, BrowserWindow, ipcMain, dialog, session, systemPreferences } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

const isDev = !app.isPackaged
const appTitle = '正反馈楼上楼下好邻居 / Good Neighbor Monitor'
const audioMimeTypes = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function writeCsv(filePath, logs) {
  const header = [
    'timestamp',
    'band',
    'peakDb',
    'selectedBandDb',
    'threshold',
    'impactCount',
    'triggered',
    'messageZh',
    'messageEn',
  ]

  const rows = logs.map((log) =>
    [
      log.timestamp,
      log.band,
      log.peakDb,
      log.selectedBandDb,
      log.threshold,
      log.impactCount,
      log.triggered,
      log.messageZh,
      log.messageEn,
    ]
      .map(csvEscape)
      .join(',')
  )

  fs.writeFileSync(filePath, [header.join(','), ...rows].join('\n'), 'utf8')
}

function audioFileToDataUrl(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  const mimeType = audioMimeTypes[ext] || 'application/octet-stream'
  const fileBuffer = fs.readFileSync(filePath)
  return `data:${mimeType};base64,${fileBuffer.toString('base64')}`
}

// Write startup problems to a log file, so silent failures on user machines can be diagnosed.
function logError(message) {
  try {
    const dir = app.getPath('userData')
    ensureDir(dir)
    fs.appendFileSync(path.join(dir, 'startup.log'), `[${new Date().toISOString()}] ${message}
`, 'utf8')
  } catch {
    // Nothing else we can do if the log itself cannot be written.
  }
}

process.on('uncaughtException', (error) => {
  logError(`uncaughtException: ${error?.stack || error}`)
  dialog.showErrorBox(appTitle, `程序出错 / Unexpected error:
${error?.message || error}

日志 / Log: ${path.join(app.getPath('userData'), 'startup.log')}`)
})

// Some older GPUs/drivers crash or show nothing with hardware acceleration; this UI doesn't need it.
app.disableHardwareAcceleration()

// A second launch (e.g. double-click while the first window is hidden) focuses the existing window.
const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows()
    if (existing) {
      if (existing.isMinimized()) existing.restore()
      existing.show()
      existing.focus()
    }
  })
}

async function requestMicrophoneAccess() {
  if (process.platform !== 'darwin' && process.platform !== 'win32') return
  const status = systemPreferences.getMediaAccessStatus('microphone')
  if (status === 'granted') return
  if (process.platform === 'darwin') {
    // Triggers the macOS permission prompt so the app appears under System Settings > Microphone.
    await systemPreferences.askForMediaAccess('microphone')
  } else if (status === 'denied') {
    logError('Windows microphone access is denied: Settings > Privacy & security > Microphone')
    dialog.showMessageBox({
      type: 'warning',
      title: appTitle,
      message: '麦克风被系统禁用 / Microphone access is blocked',
      detail: '请打开 设置 > 隐私和安全性 > 麦克风，允许桌面应用访问麦克风。\nOpen Settings > Privacy & security > Microphone and allow desktop apps to use it.',
    })
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 1100,
    minWidth: 1180,
    minHeight: 840,
    title: appTitle,
    backgroundColor: '#f4f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    const devUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
    window.loadURL(devUrl)
    window.webContents.openDevTools({ mode: 'detach' })
    return
  }

  window.webContents.on('did-fail-load', (_, code, description) => {
    logError(`did-fail-load ${code} ${description}`)
    dialog.showErrorBox(appTitle, `界面加载失败 / Failed to load UI: ${description}`)
  })
  window.webContents.on('render-process-gone', (_, details) => {
    logError(`render-process-gone ${details.reason}`)
  })

  window.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return

  session.defaultSession.setPermissionRequestHandler((_, permission, callback) => {
    callback(permission === 'media')
  })
  session.defaultSession.setPermissionCheckHandler((_, permission) => permission === 'media')
  void requestMicrophoneAccess().catch((error) => logError(`microphone access: ${error}`))

  ipcMain.handle('app:get-paths', () => {
    const userDataPath = app.getPath('userData')
    const exportDir = path.join(userDataPath, 'exports')
    const eventsDir = path.join(userDataPath, 'events')

    ensureDir(exportDir)
    ensureDir(eventsDir)

    return {
      userDataPath,
      exportDir,
      eventsDir,
    }
  })

  ipcMain.handle('app:choose-alert-audio', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        {
          name: 'Audio',
          extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg'],
        },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const filePath = result.filePaths[0]
    return {
      filePath,
      fileName: path.basename(filePath),
      audioUrl: audioFileToDataUrl(filePath),
    }
  })

  ipcMain.handle('app:write-snapshot', (_, snapshot) => {
    const userDataPath = app.getPath('userData')
    const eventsDir = path.join(userDataPath, 'events')
    ensureDir(eventsDir)

    const filePath = path.join(eventsDir, 'latest-events.json')
    writeJson(filePath, snapshot)
    return { filePath }
  })

  ipcMain.handle('app:export-csv', (_, snapshot) => {
    const userDataPath = app.getPath('userData')
    const exportDir = path.join(userDataPath, 'exports')
    ensureDir(exportDir)

    const filePath = path.join(exportDir, 'latest-events.csv')
    writeCsv(filePath, snapshot.logs ?? [])
    return { filePath }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
