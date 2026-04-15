import { app, BrowserWindow, session } from 'electron'
import { join } from 'path'

import { registerConfigHandlers } from './ipc/config'
import { registerFsHandlers } from './ipc/fs'
import { registerDialogHandlers } from './ipc/dialog'
import { registerShellHandlers } from './ipc/shell'
import { registerExternalHandlers } from './ipc/external'

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0e0f12',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Allow blob: URLs so AudioPlayer can create blob: from IPC buffer.
  // Only enforce strict CSP for the app's own renderer pages (localhost / file://),
  // so that external pages opened via window.open (e.g. Swagger docs) load normally.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url || ''
    const isAppPage =
      url.startsWith('http://localhost') ||
      url.startsWith('https://localhost') ||
      url.startsWith('file://')

    if (isAppPage) {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; media-src blob: 'self'"
          ]
        }
      })
    } else {
      // External pages — remove any CSP we might have injected previously,
      // but leave the server's own headers intact.
      const headers = { ...details.responseHeaders }
      delete headers['Content-Security-Policy']
      delete headers['content-security-policy']
      callback({ responseHeaders: headers })
    }
  })

  // Register all IPC domains
  registerConfigHandlers()
  registerFsHandlers()
  registerDialogHandlers()
  registerShellHandlers()
  registerExternalHandlers()

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
