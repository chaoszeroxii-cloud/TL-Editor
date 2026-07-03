// src/main/ipc/bridge.ts
//
// Lifecycle + account management for the bundled chatgpt-api image bridge.
//
// The bridge is a frozen Python sidecar (PyInstaller) shipped in resources/tools.
// The editor auto-spawns it on startup so image generation works without Docker
// or a manual server. ChatGPT account captures (the expiring credential) are
// managed here too: the renderer can paste a capture, list accounts with their
// token expiry, verify, and delete — all proxied to the bridge's admin HTTP API
// (the renderer can't reach http://127.0.0.1 directly under the app CSP).

import { app, ipcMain, net } from 'electron'
import { spawn, execSync, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { promises as fs } from 'fs'
import path from 'path'
import { loadConfig, loadApiKey } from './config'

const ACCOUNT_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

interface BridgeRuntime {
  url: string
  host: string
  port: number
  apiKey: string
  exePath: string | null
  accountsDir: string
}

let child: ChildProcess | null = null

// ─── Resolution ───────────────────────────────────────────────────────────────

function bridgeDir(): string {
  return path.join(app.getPath('userData'), 'bridge')
}

function resolveExe(cfg: ReturnType<typeof loadConfig>): string | null {
  const explicit = cfg.imageBridgePath?.trim()
  if (explicit) return existsSync(explicit) ? explicit : null
  // Packaged: resources/tools/chatgpt-bridge/chatgpt-bridge.exe (extraResources)
  const exe = process.platform === 'win32' ? 'chatgpt-bridge.exe' : 'chatgpt-bridge'
  const packaged = path.join(process.resourcesPath ?? '', 'tools', 'chatgpt-bridge', exe)
  return existsSync(packaged) ? packaged : null
}

async function runtime(): Promise<BridgeRuntime> {
  const cfg = loadConfig()
  const url = (cfg.imageApiUrl ?? 'http://127.0.0.1:8765/v1').replace(/\/$/, '')
  let host = '127.0.0.1'
  let port = 8765
  try {
    const parsed = new URL(url)
    host = parsed.hostname || host
    port = parsed.port ? Number(parsed.port) : port
  } catch {
    /* keep defaults */
  }
  const apiKey = (await loadApiKey('chatgpt-bridge-key')) ?? cfg.imageApiKey ?? 'local-dev-key'
  return {
    url,
    host,
    port,
    apiKey,
    exePath: resolveExe(cfg),
    accountsDir: path.join(bridgeDir(), 'accounts')
  }
}

// ─── Health ───────────────────────────────────────────────────────────────────

async function healthUrl(rt: BridgeRuntime): Promise<boolean> {
  // /health lives at the server root, not under /v1.
  const root = rt.url.replace(/\/v1$/, '')
  try {
    const res = await net.fetch(root + '/health', {
      headers: { Authorization: 'Bearer ' + rt.apiKey }
    })
    return res.ok
  } catch {
    return false
  }
}

async function waitHealthy(rt: BridgeRuntime, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await healthUrl(rt)) return true
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

// ─── Lifecycle ──────────────────────────────────────────────────────────────

async function startBridge(): Promise<{ ok: boolean; reason?: string }> {
  const rt = await runtime()
  if (await healthUrl(rt)) return { ok: true } // already running (maybe external)
  if (!rt.exePath) return { ok: false, reason: 'bridge-exe-not-found' }
  if (child && !child.killed) return { ok: true }

  // Health is down but a wedged/orphaned bridge may still hold the port (e.g.
  // after a dev restart where before-quit didn't fire). Clear it so the fresh
  // spawn can bind. Only runs when no bridge is answering, so it's safe.
  if (process.platform === 'win32') {
    try {
      execSync('taskkill /F /IM "' + path.basename(rt.exePath) + '" /T', { stdio: 'ignore' })
    } catch {
      /* nothing to kill */
    }
  }

  const outputsDir = path.join(bridgeDir(), 'outputs')
  await fs.mkdir(rt.accountsDir, { recursive: true })
  await fs.mkdir(outputsDir, { recursive: true })

  child = spawn(
    rt.exePath,
    ['server', 'start', '--host', rt.host, '--port', String(rt.port), '--api-key', rt.apiKey, '--accounts', 'main'],
    {
      env: {
        ...process.env,
        CHATGPT_API_KEY: rt.apiKey,
        CHATGPT_ACCOUNTS_DIR: rt.accountsDir,
        CHATGPT_IMAGE_OUTPUT_DIR: path.join(outputsDir, 'images'),
        CHATGPT_ADMIN_DB_PATH: path.join(bridgeDir(), 'admin.sqlite'),
        CHATGPT_PUBLIC_BASE_URL: rt.url
      },
      stdio: 'ignore',
      windowsHide: true
    }
  )
  child.on('exit', () => {
    child = null
  })

  const ok = await waitHealthy(rt, 15000)
  return ok ? { ok: true } : { ok: false, reason: 'health-timeout' }
}

function stopBridge(): void {
  if (child && !child.killed) {
    child.kill()
    child = null
  }
}

// ─── Admin proxy ───────────────────────────────────────────────────────────────

async function adminPost(rt: BridgeRuntime, route: string, body: unknown): Promise<{ status: number; json: any }> {
  const res = await net.fetch(rt.url + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + rt.apiKey },
    body: JSON.stringify(body)
  })
  let json: unknown = null
  try {
    json = await res.json()
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json }
}

// ─── Capture conversion (curl → bridge capture text) ───────────────────────────

function curlToCapture(raw: string): string {
  const trimmed = raw.trim()
  if (!/(^|\s)-H\s+'/.test(trimmed)) return trimmed // already header-format text
  const urlMatch = trimmed.match(/curl\s+'([^']+)'/)
  const url = urlMatch ? urlMatch[1] : 'https://chatgpt.com/backend-api/f/conversation'
  const headers: string[] = []
  const headerRe = /-H\s+'([^']*)'/g
  let m: RegExpExecArray | null
  while ((m = headerRe.exec(trimmed)) !== null) headers.push(m[1])
  const cookieMatch = trimmed.match(/-b\s+'([^']*)'/)
  if (cookieMatch) headers.push('cookie: ' + cookieMatch[1])
  const dataMatch = trimmed.match(/--data(?:-raw|-binary)?\s+'([\s\S]*)'/)
  const payload = dataMatch ? dataMatch[1].trim() : ''
  return ['URL: ' + url, 'Request', ...headers, 'Request Data', payload].join('\n') + '\n'
}

function bearerExpiry(captureText: string): number | null {
  const m = captureText.match(/authorization:\s*Bearer\s+([A-Za-z0-9._-]+)/i)
  if (!m) return null
  const parts = m[1].split('.')
  if (parts.length < 2) return null
  try {
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf-8')) as { exp?: number }
    return typeof decoded.exp === 'number' ? decoded.exp * 1000 : null
  } catch {
    return null
  }
}

interface AccountInfo {
  name: string
  captureExists: boolean
  expiresAt: number | null
  expired: boolean
}

async function listAccounts(rt: BridgeRuntime): Promise<AccountInfo[]> {
  const root = rt.accountsDir
  if (!existsSync(root)) return []
  const entries = await fs.readdir(root, { withFileTypes: true })
  const out: AccountInfo[] = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !ACCOUNT_RE.test(entry.name)) continue
    const capture = path.join(root, entry.name, 'chatgpt-request.txt')
    if (!existsSync(capture)) {
      out.push({ name: entry.name, captureExists: false, expiresAt: null, expired: false })
      continue
    }
    const text = await fs.readFile(capture, 'utf-8').catch(() => '')
    const expiresAt = bearerExpiry(text)
    out.push({
      name: entry.name,
      captureExists: true,
      expiresAt,
      expired: expiresAt !== null && expiresAt < Date.now()
    })
  }
  return out
}

// ─── IPC ──────────────────────────────────────────────────────────────────────

export function registerBridgeHandlers(): void {
  ipcMain.handle('bridge:status', async () => {
    const rt = await runtime()
    return {
      exeFound: !!rt.exePath,
      managed: !!(child && !child.killed),
      healthy: await healthUrl(rt),
      url: rt.url,
      port: rt.port
    }
  })

  ipcMain.handle('bridge:start', async () => startBridge())

  ipcMain.handle('bridge:stop', async () => {
    stopBridge()
    return { ok: true }
  })

  ipcMain.handle('bridge:list-accounts', async () => {
    const rt = await runtime()
    return listAccounts(rt)
  })

  ipcMain.handle('bridge:add-capture', async (_e, account: string, rawText: string) => {
    const rt = await runtime()
    const name = ACCOUNT_RE.test(account) ? account : 'main'
    const captureText = curlToCapture(rawText)
    const started = await startBridge()
    if (!started.ok) return { ok: false, reason: started.reason }
    const { status, json } = await adminPost(rt, '/chatgpt/admin/captures/save', {
      account: name,
      capture_text: captureText,
      force: false
    })
    if (status === 200 && json?.saved) {
      return { ok: true, expiresAt: bearerExpiry(captureText) }
    }
    return {
      ok: false,
      reason: 'save-failed',
      failed: json?.error?.failed ?? [],
      message: json?.error?.message ?? ('HTTP ' + status)
    }
  })

  ipcMain.handle('bridge:verify-account', async (_e, account: string) => {
    const rt = await runtime()
    const started = await startBridge()
    if (!started.ok) return { ok: false, reason: started.reason }
    const { status, json } = await adminPost(rt, '/chatgpt/admin/accounts/check', { account })
    const entry = json?.accounts?.[0]
    return { ok: status === 200 && !entry?.error, status, detail: entry ?? json }
  })

  ipcMain.handle('bridge:delete-account', async (_e, account: string) => {
    const rt = await runtime()
    await adminPost(rt, '/chatgpt/admin/accounts/delete', { account })
    return { ok: true }
  })

  // Best-effort auto-start on launch (only if the sidecar binary is present).
  const cfg = loadConfig()
  if (cfg.imageBridgeAutoStart !== false) {
    void startBridge().catch(() => undefined)
  }

  // Registered here (inside whenReady) so `app` is guaranteed initialized —
  // a top-level app.on() runs at import time and crashes (app undefined).
  app.on('before-quit', stopBridge)
}
