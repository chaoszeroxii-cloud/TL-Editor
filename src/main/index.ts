// src/main/index.ts
import { app, BrowserWindow, session, protocol, net } from 'electron'
import { join } from 'path'
import crypto from 'crypto'

import { registerConfigHandlers } from './ipc/config'
import { registerFsHandlers } from './ipc/fs'
import { registerDialogHandlers } from './ipc/dialog'
import { registerShellHandlers } from './ipc/shell'
import { registerExternalHandlers } from './ipc/external'
import { assertPathAllowed } from './ipc/pathAccess'

// ─── Audio protocol — must be registered BEFORE app.ready ─────────────────────
// Registers a custom `audio://local/<encoded-path>` scheme so the AudioPlayer can
// stream local files directly via net.fetch instead of loading the entire file
// into memory as base64.  Privileges:
//   standard  → standard URL parsing / same-origin semantics
//   secure    → treated as HTTPS for security purposes
//   stream    → response body is streamed (critical for large audio files)
//   bypassCSP → avoids adding `audio:` to every CSP media-src directive
//   supportFetchAPI → response can be consumed by the HTML <audio> src
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'audio',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      bypassCSP: true,
      supportFetchAPI: true
    }
  }
])

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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
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
  // ── audio:// protocol handler ──────────────────────────────────────────────
  // URL format:  audio://local/<percent-encoded-absolute-path>
  // Example:     audio://local/D%3A%5Cworkspace%5Cchapter1.mp3
  //
  // Path validation is enforced by assertPathAllowed() — only paths that are
  // descendants of a folder the user explicitly opened (or approved via dialog)
  // will be served.  All other requests get 403.
  protocol.handle('audio', async (request) => {
    try {
      const url = new URL(request.url)
      if (url.host !== 'local') return new Response('Not found', { status: 404 })

      // Decode the path segment (everything after the leading '/')
      const rawPath = decodeURIComponent(url.pathname.slice(1))

      // assertPathAllowed throws if the path is not within an approved tree root
      const filePath = assertPathAllowed(rawPath)

      // Normalise to a valid file:// URL (handles Windows drive letters)
      const normalised = filePath.replace(/\\/g, '/')
      const fileUrl = normalised.startsWith('/') ? `file://${normalised}` : `file:///${normalised}`

      return net.fetch(fileUrl)
    } catch {
      return new Response('Forbidden', { status: 403 })
    }
  })

  // ── CSP header injection ───────────────────────────────────────────────────
  // Development CSP: Allows unsafe-inline for Vite HMR and dev tools
  // Production: Uses stricter CSP without unsafe-inline (security hardening)
  // Nonces can be added to inline scripts/styles for additional protection
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const url = details.url || ''
    const isAppPage =
      url.startsWith('http://localhost') ||
      url.startsWith('https://localhost') ||
      url.startsWith('file://')

    if (isAppPage) {
      // Determine if this is development mode
      const isDev = process.env['ELECTRON_RENDERER_URL'] !== undefined

      let csp: string
      if (isDev) {
        // Development: Allow unsafe-inline for Vite dev server HMR
        csp =
          "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https: ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
      } else {
        // Production: Stricter CSP without unsafe-inline (nonce-based for dynamic content)
        const nonce = crypto.randomBytes(16).toString('hex')
        csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`
      }

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [csp]
        }
      })
    } else {
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
