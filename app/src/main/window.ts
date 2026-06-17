import { app, BrowserWindow } from 'electron'

/**
 * Bring the app's main window to the foreground (restoring it if minimized).
 * Used after background work the user is waiting on completes elsewhere — e.g. an
 * OAuth consent finishing in the system browser (ADR-052) — and from the tray
 * "show" action. On macOS `app.focus({ steal: true })` crosses Spaces/apps so the
 * window surfaces even when another app is frontmost.
 */
export function focusMainWindow(): void {
  const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }
  app.focus({ steal: true })
}
