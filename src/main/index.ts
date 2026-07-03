// src/main/index.ts
import { app, BrowserWindow, session, protocol } from 'electron'
import { join } from 'path'
import crypto from 'crypto'
import { stat } from 'fs/promises'
import { appendFileSync } from 'fs'
import { extname } from 'path'
import { Readable } from 'stream'

import { registerConfigHandlers } from './ipc/config'
import { registerFsHandlers } from './ipc/fs'
import { registerDialogHandlers } from './ipc/dialog'
import { registerExternalHandlers } from './ipc/external'
import { registerYoutubeHandlers } from './ipc/youtube'
import { registerImageHandlers } from './ipc/image'
import { registerBridgeHandlers } from './ipc/bridge'
import { assertPathAllowed } from './ipc/pathAccess'

// ─── Crash diagnostics ────────────────────────────────────────────────────────
// "Black screen after long use" is almost always a process death (renderer OOM
// or GPU crash) that currently happens silently. Record the reason so it can be
// confirmed, written to <userData>/crash.log so it survives even in a packaged
// build (no terminal to see console output).
function logCrash(tag: string, info: Record<string, unknown>): void {
  const line = `[${new Date().toISOString()}] ${tag} ${JSON.stringify(info)}\n`
  console.error('[crash]', line.trim())
  try {
    appendFileSync(join(app.getPath('userData'), 'crash.log'), line)
  } catch {
    /* best effort — never let logging throw */
  }
}

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

  // If the renderer is killed (commonly OOM after long use), log the reason and
  // auto-reload so the user isn't stranded on a black window. The renderer state
  // is already gone at this point, so reloading loses nothing further.
  win.webContents.on('render-process-gone', (_e, details) => {
    logCrash('renderer-gone', { reason: details.reason, exitCode: details.exitCode })
    if (details.reason !== 'clean-exit' && !win.isDestroyed()) {
      win.webContents.reload()
    }
  })
  win.webContents.on('unresponsive', () => logCrash('renderer-unresponsive', {}))
  win.webContents.on('responsive', () => logCrash('renderer-responsive', {}))

  // Ctrl/Cmd+R is the app's "Refresh", NOT a window reload — the default menu's
  // Reload accelerator would wipe unsaved edits and restart async glossary load.
  // Swallow it here (preventDefault also blocks the page keydown) and route it to
  // the renderer as a refresh. Force Reload (Ctrl+Shift+R) is left as an escape hatch.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    const mod = input.control || input.meta
    if (mod && !input.shift && !input.alt && input.key.toLowerCase() === 'r') {
      event.preventDefault()
      if (!win.isDestroyed()) win.webContents.send('menu:refresh')
    }
  })
}

// GPU / utility process death also blanks the window — record it (a GPU crash
// won't fire render-process-gone, so this is a separate signal).
app.on('child-process-gone', (_e, details) => {
  if (details.reason !== 'clean-exit') {
    logCrash('child-process-gone', {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode
    })
  }
})
// ─── GPU fallback (for stability during dev) ──────────────────────────────────
// If GPU process keeps crashing, set GPU_DISABLED=1 env var to disable hardware accel.
// Usage: GPU_DISABLED=1 npm run dev
if (process.env.GPU_DISABLED === '1') {
  app.disableHardwareAcceleration()
} else {
  // NVIDIA GPU crash workaround (Chromium/Electron issue)
  // Disable ANGLE and use OpenGL instead
  app.commandLine.appendSwitch('use-gl', 'desktop')
  app.commandLine.appendSwitch('disable-features', 'UseDXGIForScreenCapture')
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

      // Get file stats
      const stats = await stat(filePath)

      // Determine MIME type from extension
      const ext = extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.flac': 'audio/flac',
        '.webm': 'audio/webm',
        // Video — served over the same scheme so the VideoPlayer's <video> tag
        // can stream local MP4s (Range requests handled below) just like audio.
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime'
      }
      const contentType = mimeTypes[ext] || 'application/octet-stream'

      // Handle range requests for seeking
      const rangeHeader = request.headers.get('Range')
      if (rangeHeader) {
        const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
        if (match) {
          const start = parseInt(match[1], 10)
          const end = match[2] ? parseInt(match[2], 10) : stats.size - 1

          const { createReadStream } = await import('fs')
          const stream = createReadStream(filePath, { start, end })

          return new Response(Readable.toWeb(stream) as ReadableStream, {
            status: 206,
            headers: {
              'Content-Type': contentType,
              'Content-Length': String(end - start + 1),
              'Content-Range': `bytes ${start}-${end}/${stats.size}`,
              'Accept-Ranges': 'bytes'
            }
          })
        }
      }

      // Full file response
      const { createReadStream } = await import('fs')
      const stream = createReadStream(filePath)
      return new Response(Readable.toWeb(stream) as ReadableStream, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': stats.size.toString(),
          'Accept-Ranges': 'bytes'
        }
      })
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
        csp = `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' https: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`
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
  registerExternalHandlers()
  registerYoutubeHandlers()
  registerImageHandlers()
  registerBridgeHandlers()

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
