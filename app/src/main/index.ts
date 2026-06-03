import { app, shell, BrowserWindow, screen, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { OrdinusDatabase } from './db/database'
import { registerIpcHandlers } from './ipc/register'
import { createObservabilityService } from './observability/service'
import { createRuntimeService } from './runtime'
import { SchedulerService } from './scheduler/service'

app.setName('Ordinus')

const database = new OrdinusDatabase()
const runtime = createRuntimeService()
const observability = createObservabilityService(database)
let scheduler: SchedulerService | null = null

const preferredWindowSize = {
  width: 1440,
  height: 900
}

// Keep the minimum at (or above) the renderer's `xl` desktop breakpoint (1280px)
// so the window never opens in the cramped 1024–1280 responsive zone. Below this
// width the multi-pane screens (Agents/Workboard/Conversations/Settings) collapse
// to their stacked fallback, which we only want as a deliberate-resize safety net.
const minimumWindowSize = {
  width: 1280,
  height: 760
}

const windowScreenMargin = 48

function fitToDisplay(preferred: number, minimum: number, available: number): number {
  return Math.min(preferred, Math.max(minimum, available - windowScreenMargin))
}

function getInitialWindowSize(): { width: number; height: number } {
  const { workAreaSize } = screen.getPrimaryDisplay()

  return {
    width: fitToDisplay(preferredWindowSize.width, minimumWindowSize.width, workAreaSize.width),
    height: fitToDisplay(preferredWindowSize.height, minimumWindowSize.height, workAreaSize.height)
  }
}

function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

function attachWindowSecurity(mainWindow: BrowserWindow): void {
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) {
      void shell.openExternal(details.url)
    }

    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const currentUrl = mainWindow.webContents.getURL()
    if (navigationUrl !== currentUrl) {
      event.preventDefault()
    }
  })

  if (!is.dev) {
    mainWindow.webContents.on('before-input-event', (event, input) => {
      const key = input.key.toLowerCase()
      const opensDevTools =
        key === 'f12' ||
        (input.control && input.shift && key === 'i') ||
        (input.meta && input.alt && key === 'i')

      if (opensDevTools) {
        event.preventDefault()
      }
    })

    mainWindow.webContents.on('devtools-opened', () => {
      mainWindow.webContents.closeDevTools()
    })
  }
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    ...getInitialWindowSize(),
    minWidth: minimumWindowSize.width,
    minHeight: minimumWindowSize.height,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  attachWindowSecurity(mainWindow)

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.idealabs.ordinus')

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  session.defaultSession.setPermissionCheckHandler(() => false)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  database.initialize()
  scheduler = registerIpcHandlers(database, runtime, observability)
  scheduler.start()

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  scheduler?.stop()
  database.close()
})
