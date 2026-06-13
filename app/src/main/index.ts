import { app, shell, BrowserWindow, screen, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { OrdinusDatabase } from './db/database'
import { syncBuiltinLibrarySkills } from './skills/library'
import { registerIpcHandlers } from './ipc/register'
import { createObservabilityService } from './observability/service'
import { createRuntimeService } from './runtime'
import { SchedulerService } from './scheduler/service'
import type { TelegramSubsystem } from './telegram/subsystem'
import { shutdownOrdinusMcpServer } from './ordinus-mcp/lifecycle'
import { initConnectorService, startPersistentConnectors } from './integrations/service'
import { shutdownLocalMcp } from './local-mcp/supervisor'

app.setName('Ordinus')

const database = new OrdinusDatabase()
const runtime = createRuntimeService()
const observability = createObservabilityService(database)
let scheduler: SchedulerService | null = null
let telegram: TelegramSubsystem | null = null

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
  electronApp.setAppUserModelId('com.muratgur.ordinus')

  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })

  session.defaultSession.setPermissionCheckHandler(() => false)

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  database.initialize()
  // ADR-041: wire durable local-connector state into the connector service
  // and the local MCP supervisor.
  initConnectorService(database)
  // ADR-042: connected persistent connectors (WhatsApp) start ingesting now,
  // not at first tool call.
  startPersistentConnectors()
  // ADR-040: refresh the app-shipped skill library on disk so agent CLIs can
  // read it and app updates propagate to every installation.
  try {
    syncBuiltinLibrarySkills()
  } catch (error) {
    console.error('Builtin skill library could not be synced:', error)
  }
  const handlers = registerIpcHandlers(database, runtime, observability)
  scheduler = handlers.scheduler
  scheduler.start()
  // ADR-044: resume Telegram listening if a bot was previously connected.
  telegram = handlers.telegram
  void telegram.start().catch((err: unknown) => {
    console.error('[main] Telegram subsystem failed to start:', err)
  })

  // ADR-029 follow-up — Pre-warm the provider-status cache so the renderer's
  // first call (App.tsx Phase 2 setupGetStatus → runtime.getProviderStatuses)
  // either hits a fresh cache or awaits this already-in-flight promise
  // instead of triggering its own slow CLI spawn batch (~300–500ms across
  // three providers). Fire-and-forget; the cache layer in runtime/service.ts
  // handles concurrent callers and failures.
  void runtime.getProviderStatuses().catch((err: unknown) => {
    console.error('[main] provider-status pre-warm failed:', err)
  })

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

app.on('before-quit', (event) => {
  scheduler?.stop()
  // ADR-029 M3: tear down the Ordinus internal MCP server if it was started.
  // We defer the quit until shutdown resolves so the OS-level port release
  // happens before the app process exits — best-effort, but cheap.
  event.preventDefault()
  // ADR-041: local connector children must die with the app — same deferred
  // quit pattern as the internal MCP server.
  void Promise.allSettled([shutdownOrdinusMcpServer(), shutdownLocalMcp(), telegram?.stop()]).then(
    () => {
      database.close()
      app.exit(0)
    }
  )
})
