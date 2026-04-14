const { app, BrowserWindow, ipcMain, dialog } = require('electron')
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

  window.loadFile(path.join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
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
