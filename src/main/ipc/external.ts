import { ipcMain, net, dialog, app, BrowserWindow } from 'electron'
import type { ClientRequest } from 'electron'
import { URL } from 'url'
import { spawn } from 'child_process'
import { basename, join } from 'path'
import { existsSync, promises as fsPromises } from 'fs'
import { tmpdir } from 'os'
import * as https from 'https'
import {
  assFromMp3Path,
  assForShortClip,
  readTimelineSidecar,
  SUB_CANVAS_W,
  SUB_CANVAS_H,
  SHORTS_CANVAS_W,
  SHORTS_CANVAS_H
} from './subtitles'

// ─── Error logging utility ─────────────────────────────────────────────────────

function logError(context: string, error: Error, details?: Record<string, unknown>): void {
  const timestamp = new Date().toISOString()
  const detailsStr = details ? JSON.stringify(details) : ''
  console.error(`[${timestamp}] [${context}] ${error.message}${detailsStr ? ' ' + detailsStr : ''}`)
}

function assertHttpUrl(rawUrl: string): string {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`)
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`)
  }
  return parsed.toString()
}

// ─── Unified request tracking for abort/cancel support ──────────────────────

interface ActiveRequest {
  req: ClientRequest
  timeoutHandle: NodeJS.Timeout | null
}

const activeRequests = new Map<string, ActiveRequest>()
let activeMp4Conversion: ReturnType<typeof spawn> | null = null
let cancelMp4ConversionRequested = false
let activeMergeAudio: ReturnType<typeof spawn> | null = null
let cancelMergeAudioRequested = false
let activeShortClip: ReturnType<typeof spawn> | null = null
let cancelShortClipRequested = false

// ─── Health check for TTS API (keep-alive) ────────────────────────────────────

interface HealthCheckConfig {
  enabled: boolean
  intervalMs: number
  apiUrl: string
}

let healthCheckIntervalHandle: NodeJS.Timeout | null = null
const defaultHealthConfig: HealthCheckConfig = {
  enabled: true,
  intervalMs: 5 * 60 * 1000, // 5 minutes
  apiUrl: 'https://novelttsapi-0mv2.onrender.com'
}

function startHealthCheck(config: HealthCheckConfig = defaultHealthConfig): void {
  if (!config.enabled) return
  if (healthCheckIntervalHandle) return // Already running

  const performHealthCheck = (): void => {
    const healthUrl = `${config.apiUrl.trim().replace(/\/$/, '')}/health`
    try {
      const req = net.request(healthUrl)
      const timeoutHandle = setTimeout(() => {
        req.abort()
      }, 10_000) // 10 second timeout for health check

      req.on('response', () => {
        clearTimeout(timeoutHandle)
        req.abort()
      })

      req.on('error', (err) => {
        clearTimeout(timeoutHandle)
        logError('health-check', err instanceof Error ? err : new Error(String(err)), {
          url: healthUrl
        })
      })

      req.on('abort', () => {
        clearTimeout(timeoutHandle)
      })

      req.end()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      logError('health-check', error, { url: healthUrl })
    }
  }

  // Perform initial check immediately
  performHealthCheck()

  // Then set up periodic checks
  healthCheckIntervalHandle = setInterval(performHealthCheck, config.intervalMs)
}

function stopHealthCheck(): void {
  if (healthCheckIntervalHandle) {
    clearInterval(healthCheckIntervalHandle)
    healthCheckIntervalHandle = null
  }
}

// Generate unique request IDs to track in-flight requests
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

// Call this when a request completes or is cancelled to clean up
function removeActiveRequest(requestId: string): void {
  const record = activeRequests.get(requestId)
  if (record?.timeoutHandle) clearTimeout(record.timeoutHandle)
  activeRequests.delete(requestId)
}

function emitMp4Progress(payload: {
  phase: 'starting' | 'progress' | 'completed' | 'error' | 'canceled' | 'done'
  current: number
  total: number
  percent: number
  filePercent?: number
  elapsedSeconds?: number
  totalSeconds?: number
  fileName: string
  outputPath?: string
  error?: string
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('mp3-to-mp4:progress', payload)
    }
  }
}

function emitTtsProgress(payload: {
  phase: 'starting' | 'progress' | 'completed' | 'done'
  current: number
  total: number
  percent: number
  requestId: string
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('tts:progress', payload)
    }
  }
}

function emitMergeAudioProgress(payload: {
  phase: 'starting' | 'merging' | 'completed' | 'error' | 'canceled'
  currentBatch: number
  totalBatches: number
  currentBatchLabel: string
  ffmpegLog?: string
  error?: string
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('merge-audio:progress', payload)
    }
  }
}

function sanitizeFilenamePart(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildMp4Name(audioPath: string, filenamePrefix?: string): string {
  const base = basename(audioPath).replace(/\.[^.]+$/, '')
  const prefix = sanitizeFilenamePart(filenamePrefix ?? '')
  const name = prefix ? `${prefix} ${base}` : base
  return `${sanitizeFilenamePart(name)}.mp4`
}

function resolveBundledFfmpegPath(): string | null {
  const relativeParts = ['tools', 'ffmpeg', 'win-x64', 'ffmpeg.exe']
  const packagedPath = join(process.resourcesPath, ...relativeParts)
  if (existsSync(packagedPath)) return packagedPath

  const devPath = join(app.getAppPath(), 'resources', ...relativeParts)
  if (existsSync(devPath)) return devPath

  return null
}

function resolveBundledFfprobePath(): string | null {
  const relativeParts = ['tools', 'ffmpeg', 'win-x64', 'ffprobe.exe']
  const packagedPath = join(process.resourcesPath, ...relativeParts)
  if (existsSync(packagedPath)) return packagedPath

  const devPath = join(app.getAppPath(), 'resources', ...relativeParts)
  if (existsSync(devPath)) return devPath

  return null
}

// The bundled subtitle font (Sarabun). Not a system font, so libass loads it via
// the subtitles filter's fontsdir — see the burn-in path in convert-mp3-to-mp4.
function resolveBundledFontPath(): string | null {
  const relativeParts = ['tools', 'fonts', 'Sarabun-Regular.ttf']
  const packagedPath = join(process.resourcesPath, ...relativeParts)
  if (existsSync(packagedPath)) return packagedPath

  const devPath = join(app.getAppPath(), 'resources', ...relativeParts)
  if (existsSync(devPath)) return devPath

  return null
}

function parseTimestampToSeconds(raw: string): number {
  const match = raw.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) return 0
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])
}

function resolveFfmpegBinary(ffmpegPath?: string): string {
  return ffmpegPath?.trim() || resolveBundledFfmpegPath() || 'ffmpeg'
}

function resolveFfprobeBinary(ffmpegPath?: string): string {
  const explicitDir = ffmpegPath?.trim()
  if (explicitDir?.toLowerCase().endsWith('ffprobe.exe')) return explicitDir
  if (explicitDir?.toLowerCase().endsWith('ffmpeg.exe')) {
    return explicitDir.replace(/ffmpeg\.exe$/i, 'ffprobe.exe')
  }
  return resolveBundledFfprobePath() || 'ffprobe'
}

// Whether this ffmpeg build lists the NVIDIA NVENC H.264 encoder. Cached after
// the first probe (the `-encoders` listing doesn't change between runs).
// Note: "listed" ≠ "usable" — a build can advertise nvenc on a machine with no
// NVIDIA GPU/driver, so the actual encode still falls back to libx264 on error.
let nvencListedCache: boolean | null = null
function isNvencListed(ffmpegPath?: string): Promise<boolean> {
  if (nvencListedCache !== null) return Promise.resolve(nvencListedCache)
  return new Promise((resolve) => {
    try {
      const proc = spawn(resolveFfmpegBinary(ffmpegPath), ['-hide_banner', '-encoders'], {
        windowsHide: true
      })
      let out = ''
      proc.stdout?.on('data', (c) => (out += String(c)))
      proc.on('error', () => resolve((nvencListedCache = false)))
      proc.on('close', () => resolve((nvencListedCache = /h264_nvenc/.test(out))))
    } catch {
      resolve((nvencListedCache = false))
    }
  })
}

// Codec-specific ffmpeg args for the still-image audiobook video. GPU path uses
// NVENC (offloads encoding to the NVIDIA card); CPU path keeps the prior libx264
// settings. Without subtitles the frame never changes, so we target a tiny file
// (qp/crf 51). With burned-in subtitles that quality renders text as unreadable
// mush, so `hiQuality` drops the quantiser and uses a slightly better preset —
// only on the subtitle path, leaving the no-subtitle output byte-for-byte as before.
function videoEncodeArgs(useGpu: boolean, hiQuality = false): string[] {
  if (useGpu) {
    const qp = hiQuality ? '23' : '51'
    const preset = hiQuality ? 'p4' : 'p1'
    // prettier-ignore
    return ['-c:v', 'h264_nvenc', '-preset', preset, '-rc', 'constqp', '-qp', qp, '-pix_fmt', 'yuv420p']
  }
  const crf = hiQuality ? '20' : '51'
  const preset = hiQuality ? 'veryfast' : 'ultrafast'
  return ['-c:v', 'libx264', '-preset', preset, '-crf', crf, '-pix_fmt', 'yuv420p']
}

// Build the `-vf` value that composes the cover onto a fixed canvas (so the ASS
// PlayResX/Y and font size stay predictable) then burns in the ASS subtitle
// track. Two orientations:
//
// 'landscape' (1280×720, the original default): covers are usually tall 9:16
// posters, which in a 16:9 canvas leaves black pillarbox bars on the sides — and
// since the subtitle style is sized to the FULL canvas width, captions used to
// visibly spill off the photo into those bars. Fix: instead of plain black
// padding, fill the sides with a blurred, darkened copy of the same cover (split
// into a blurred "bg" branch and a sharp centered "fg" branch, then overlay) —
// the full image still shows uncropped, but there's real (if soft) image content
// under the whole caption width.
//
// 'vertical' (1080×1920): covers are portrait already, so this just crops to
// fill — no blur needed, and typically crops almost nothing (a 1536×2752 cover
// is already ≈9:16). Matches the Shorts clip look.
//
// Escaping a Windows path inside an avfilter `subtitles=` value is notoriously
// fragile (drive colons, spaces, the filtergraph's own escape layer), so we
// sidestep it entirely: ffmpeg runs with cwd set to the .ass's directory and the
// file is referenced by its bare ASCII basename here — no colon/slash/space ever
// reaches the filtergraph. The bundled Sarabun font is copied into that same
// cwd, so `fontsdir=.` lets libass find it without a path.
function buildSubtitleVf(assFileName: string, orientation: 'landscape' | 'vertical'): string {
  if (orientation === 'vertical') {
    const fill =
      `scale=${SHORTS_CANVAS_W}:${SHORTS_CANVAS_H}:force_original_aspect_ratio=increase,` +
      `crop=${SHORTS_CANVAS_W}:${SHORTS_CANVAS_H}`
    return `${fill},subtitles=${assFileName}:fontsdir=.`
  }
  const bg =
    `scale=${SUB_CANVAS_W}:${SUB_CANVAS_H}:force_original_aspect_ratio=increase,` +
    `crop=${SUB_CANVAS_W}:${SUB_CANVAS_H},gblur=sigma=25,eq=brightness=-0.15`
  const fg = `scale=${SUB_CANVAS_W}:${SUB_CANVAS_H}:force_original_aspect_ratio=decrease`
  return (
    `split=2[bg][fg];[bg]${bg}[bg2];[fg]${fg}[fg2];` +
    `[bg2][fg2]overlay=(W-w)/2:(H-h)/2,subtitles=${assFileName}:fontsdir=.`
  )
}

// nvenc can be listed but fail at runtime (no NVIDIA GPU, driver too old, all
// encode sessions busy). Detect those so we can transparently retry on CPU.
function isNvencRuntimeError(message: string): boolean {
  return /nvenc|cuda|no capable devices|OpenEncodeSession|Cannot load|driver/i.test(message)
}

function getAudioDurationSeconds(audioPath: string, ffmpegPath?: string): Promise<number> {
  return new Promise((resolve) => {
    const ffprobeBin = resolveFfprobeBinary(ffmpegPath)
    const proc = spawn(
      ffprobeBin,
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        audioPath
      ],
      { windowsHide: true }
    )
    let stdout = ''

    proc.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    proc.on('error', () => resolve(0))
    proc.on('close', () => {
      const value = Number(stdout.trim())
      resolve(Number.isFinite(value) ? value : 0)
    })
  })
}

function runFfmpeg(
  args: string[],
  ffmpegPath?: string,
  onProgress?: (encodedSeconds: number) => void,
  cwd?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegBin = resolveFfmpegBinary(ffmpegPath)
    // cwd is set for subtitle burns so the `subtitles=` filter can use a bare
    // filename (see buildSubtitleVf); harmless for absolute-path inputs/outputs.
    const proc = spawn(ffmpegBin, args, { windowsHide: true, cwd })
    activeMp4Conversion = proc
    let stderr = ''

    proc.stderr.on('data', (chunk) => {
      const text = String(chunk)
      stderr += text
      const matches = text.match(/time=\s*(\d+:\d+:\d+(?:\.\d+)?)/g)
      if (matches && onProgress) {
        const last = matches[matches.length - 1]?.replace(/time=\s*/, '')
        if (last) onProgress(parseTimestampToSeconds(last))
      }
    })

    proc.on('error', reject)
    proc.on('close', (code) => {
      activeMp4Conversion = null
      if (cancelMp4ConversionRequested) {
        return reject(new Error('MP4 conversion cancelled'))
      }
      if (code === 0) return resolve()
      reject(new Error(stderr.trim() || `ffmpeg exited with code ${code ?? -1}`))
    })
  })
}

// ─── ReadRealm helpers ────────────────────────────────────────────────────────

import { loadApiKey, saveApiKey } from './config'

const RR_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36'
const RR_API = 'https://api-writer.readrealm.co'

let rrToken: string | null = null
let rrTokenExpiry = 0

interface RRHttp {
  status: number
  body: string
  cookies: string[]
}

function rrGet(url: string, headers: Record<string, string> = {}): Promise<RRHttp> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: { 'User-Agent': RR_UA, ...headers }
      },
      (res) => {
        let body = ''
        res.on('data', (c: Buffer) => (body += c.toString()))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body,
            cookies: (res.headers['set-cookie'] as string[]) ?? []
          })
        )
      }
    )
    req.on('error', reject)
    req.end()
  })
}

function rrPost(
  url: string,
  bodyStr: string,
  headers: Record<string, string> = {},
  method = 'POST'
): Promise<RRHttp> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const buf = Buffer.from(bodyStr)
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: { 'User-Agent': RR_UA, 'Content-Length': buf.length, ...headers }
      },
      (res) => {
        let body = ''
        res.on('data', (c: Buffer) => (body += c.toString()))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body,
            cookies: (res.headers['set-cookie'] as string[]) ?? []
          })
        )
      }
    )
    req.on('error', reject)
    req.write(buf)
    req.end()
  })
}

function parseCookieMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const h of headers) {
    const [pair] = h.split(';')
    const eq = pair.indexOf('=')
    if (eq > 0) map[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
  }
  return map
}

function cookieHeader(map: Record<string, string>): string {
  return Object.entries(map)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

function parseJwtExp(token: string): number {
  try {
    const part = token.split('.')[1]
    const padded = part + '='.repeat(((-part.length % 4) + 4) % 4)
    const payload = JSON.parse(Buffer.from(padded, 'base64url').toString()) as { exp?: number }
    return payload.exp ?? 0
  } catch {
    return 0
  }
}

async function rrLogin(username: string, password: string): Promise<string> {
  const csrfRes = await rrGet('https://readrealm.co/api/auth/csrf', { Accept: 'application/json' })
  const { csrfToken } = JSON.parse(csrfRes.body) as { csrfToken: string }
  let cookies = parseCookieMap(csrfRes.cookies)

  const form = new URLSearchParams({
    csrfToken,
    username_or_email: username,
    password,
    callbackUrl: 'https://readrealm.co/',
    json: 'true'
  }).toString()

  const loginRes = await rrPost('https://readrealm.co/api/auth/callback/credentials', form, {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
    Referer: 'https://readrealm.co/login',
    Origin: 'https://readrealm.co',
    Cookie: cookieHeader(cookies)
  })
  if (loginRes.status !== 200)
    throw new Error(`Login failed (HTTP ${loginRes.status}): ${loginRes.body.slice(0, 200)}`)
  cookies = { ...cookies, ...parseCookieMap(loginRes.cookies) }

  const sessionRes = await rrGet('https://readrealm.co/api/auth/session', {
    Accept: 'application/json',
    Cookie: cookieHeader(cookies)
  })
  const session = JSON.parse(sessionRes.body) as { accessToken?: string }
  if (!session.accessToken)
    throw new Error(`No accessToken in session: ${sessionRes.body.slice(0, 200)}`)
  return session.accessToken
}

async function rrGetToken(): Promise<string> {
  const bufferSec = 60
  if (rrToken && Date.now() / 1000 < rrTokenExpiry - bufferSec) return rrToken
  const username = await loadApiKey('readrealm-user')
  const password = await loadApiKey('readrealm-pass')
  if (!username || !password)
    throw new Error(
      'ReadRealm credentials not set — กรอก username/password ใน ReadRealm panel ก่อน'
    )
  rrToken = await rrLogin(username, password)
  rrTokenExpiry = parseJwtExp(rrToken)
  return rrToken
}

function rrAuthHeaders(token: string): Record<string, string> {
  return {
    Accept: 'application/json, text/plain, */*',
    Authorization: `Bearer ${token}`,
    Origin: 'https://readrealm.co',
    Referer: 'https://readrealm.co/'
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function registerExternalHandlers(): void {
  // ── Cancel/Abort handler for any in-flight request ───────────────────────
  ipcMain.handle('cancel-network-request', (_e, requestId: string) => {
    const record = activeRequests.get(requestId)
    if (!record) return false
    record.req.abort()
    removeActiveRequest(requestId)
    return true
  })
  ipcMain.handle('cancel-mp3-to-mp4', () => {
    cancelMp4ConversionRequested = true
    activeMp4Conversion?.kill()
    return true
  })
  // ── Google Translate (via Electron net to bypass renderer CSP) ────────────
  ipcMain.handle('translate', (_e, text: string) => {
    const requestId = generateRequestId()
    const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=th&dt=t&q=${encodeURIComponent(text)}`
    return new Promise<{ requestId: string; data: string }>((resolve, reject) => {
      const timeout = 15_000 // 15 second timeout (Google is fast normally)

      const timeoutHandle = setTimeout(() => {
        const record = activeRequests.get(requestId)
        if (record) record.req.abort()
        removeActiveRequest(requestId)
        reject(new Error('Google Translate request timed out after 15s'))
      }, timeout)

      const req = net.request(url)
      let body = ''

      req.on('response', (res) => {
        res.on('data', (chunk) => {
          body += chunk.toString()
        })
        res.on('end', () => {
          removeActiveRequest(requestId)
          try {
            resolve({ requestId, data: JSON.stringify(JSON.parse(body)) })
          } catch {
            reject(new Error('translate: parse error'))
          }
        })
      })

      req.on('error', (err) => {
        removeActiveRequest(requestId)
        reject(err)
      })

      req.on('abort', () => {
        removeActiveRequest(requestId)
        reject(new Error('Google Translate request cancelled'))
      })

      // Track this request for cancellation
      activeRequests.set(requestId, { req, timeoutHandle })

      req.end()
    })
  })

  // ── OpenRouter chat completion (with abort support) ────────────────────────
  ipcMain.handle(
    'openrouter-chat',
    async (
      e,
      {
        apiKey,
        messages,
        model,
        tools,
        reasoning,
        stream: useStream,
        requestId: clientRequestId
      }: {
        apiKey: string
        model: string
        messages: { role: string; content: string }[]
        tools?: object[]
        reasoning?: { effort?: string; max_tokens?: number; exclude?: boolean; enabled?: boolean }
        stream?: boolean
        requestId?: string
      }
    ) => {
      const requestId = clientRequestId ?? generateRequestId()
      const timeout = 600_000

      const body = JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 15000,
        ...(useStream ? { stream: true } : {}),
        ...(tools && tools.length > 0 ? { tools, tool_choice: 'auto' } : {}),
        ...(reasoning ? { reasoning } : {}),
        ...(model.startsWith('deepseek/')
          ? { provider: { order: ['DeepSeek'], allow_fallbacks: false } }
          : {})
      })

      // ── SSE streaming via net.fetch (ReadableStream) ──────────────────────
      if (useStream) {
        const controller = new AbortController()
        const timeoutHandle = setTimeout(() => {
          controller.abort()
          removeActiveRequest(requestId)
        }, timeout)

        activeRequests.set(requestId, {
          req: { abort: () => controller.abort() } as unknown as ClientRequest,
          timeoutHandle
        })

        try {
          const response = await net.fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'HTTP-Referer': 'https://tl-editor.local',
              'X-Title': 'TL/Editor'
            },
            body,
            signal: controller.signal
          })

          if (!response.ok) {
            const errText = await response.text()
            throw new Error(`OpenRouter ${response.status}: ${errText.slice(0, 300)}`)
          }

          const reader = response.body!.getReader()
          const decoder = new TextDecoder()
          let sseBuffer = ''
          let accumulated = ''
          let accumulatedReasoning = ''
          const toolCallsAccum: Array<{
            id: string
            type: string
            function: { name: string; arguments: string }
          }> = []

          outer: while (true) {
            const { done, value } = await reader.read()
            if (done) break

            sseBuffer += decoder.decode(value, { stream: true })
            const lines = sseBuffer.split('\n')
            sseBuffer = lines.pop()!

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || trimmed.startsWith(':')) continue
              if (!trimmed.startsWith('data: ')) continue
              const payload = trimmed.slice(6).trim()
              if (payload === '[DONE]') break outer

              try {
                const obj = JSON.parse(payload) as {
                  choices?: {
                    delta?: {
                      content?: string
                      reasoning?: string
                      reasoning_content?: string
                      tool_calls?: unknown[]
                    }
                  }[]
                }
                const delta = obj.choices?.[0]?.delta
                if (!delta) continue

                // Reasoning / thinking tokens — emitted on a SEPARATE channel so the
                // renderer never mixes them with the visible message content.
                // OpenRouter normalizes to `reasoning`; we also accept `reasoning_content`
                // (raw DeepSeek field) defensively.
                const reasoningDelta =
                  (typeof delta.reasoning === 'string' && delta.reasoning) ||
                  (typeof delta.reasoning_content === 'string' && delta.reasoning_content) ||
                  ''
                if (reasoningDelta) {
                  accumulatedReasoning += reasoningDelta
                  if (!e.sender.isDestroyed()) {
                    e.sender.send('openrouter-stream-reasoning', {
                      requestId,
                      delta: reasoningDelta
                    })
                  }
                }

                if (typeof delta.content === 'string' && delta.content) {
                  accumulated += delta.content
                  if (!e.sender.isDestroyed()) {
                    e.sender.send('openrouter-stream-chunk', { requestId, delta: delta.content })
                  }
                }

                if (Array.isArray(delta.tool_calls)) {
                  for (const tc of delta.tool_calls as Array<{
                    index?: number
                    id?: string
                    type?: string
                    function?: { name?: string; arguments?: string }
                  }>) {
                    const idx = tc.index ?? 0
                    if (!toolCallsAccum[idx]) {
                      toolCallsAccum[idx] = {
                        id: '',
                        type: 'function',
                        function: { name: '', arguments: '' }
                      }
                    }
                    if (tc.id) toolCallsAccum[idx].id = tc.id
                    if (tc.type) toolCallsAccum[idx].type = tc.type
                    if (tc.function?.name) toolCallsAccum[idx].function.name = tc.function.name
                    if (tc.function?.arguments) {
                      toolCallsAccum[idx].function.arguments += tc.function.arguments
                      // Stream the argument delta so the renderer can show a live
                      // preview (e.g. the translation text being written into a tool call).
                      if (!e.sender.isDestroyed()) {
                        e.sender.send('openrouter-stream-toolargs', {
                          requestId,
                          index: idx,
                          name: toolCallsAccum[idx].function.name,
                          delta: tc.function.arguments
                        })
                      }
                    }
                  }
                }
              } catch {
                /* skip malformed SSE line */
              }
            }
          }

          removeActiveRequest(requestId)
          return {
            requestId,
            data: JSON.stringify({
              choices: [
                {
                  message: {
                    content: accumulated || null,
                    reasoning: accumulatedReasoning || undefined,
                    tool_calls:
                      toolCallsAccum.length > 0
                        ? toolCallsAccum.filter((tc) => tc.function.name)
                        : undefined
                  }
                }
              ]
            })
          }
        } catch (err) {
          removeActiveRequest(requestId)
          const error = err instanceof Error ? err : new Error(String(err))
          if (error.name !== 'AbortError') logError('openrouter-chat', error, { requestId, model })
          throw error
        }
      }

      // ── Buffered path (Paraphrase / Style Analyzer) ───────────────────────
      return new Promise<{ requestId: string; data: string }>((resolve, reject) => {
        try {
          const timeoutHandle = setTimeout(() => {
            const record = activeRequests.get(requestId)
            if (record) record.req.abort()
            removeActiveRequest(requestId)
            const err = new Error('OpenRouter request timed out after 10m')
            logError('openrouter-chat', err, { requestId, model })
            reject(err)
          }, timeout)

          const req = net.request({
            method: 'POST',
            url: 'https://openrouter.ai/api/v1/chat/completions',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
              'HTTP-Referer': 'https://tl-editor.local',
              'X-Title': 'TL/Editor'
            }
          })

          let data = ''
          req.on('response', (res) => {
            res.on('data', (chunk) => {
              data += chunk.toString()
            })
            res.on('end', () => {
              removeActiveRequest(requestId)
              const statusCode = res.statusCode ?? 0
              if (statusCode >= 400) {
                const msg = data.slice(0, 300)
                const err = new Error(`OpenRouter ${statusCode}: ${msg}`)
                logError('openrouter-chat', err, { requestId, model, statusCode })
                return reject(err)
              }
              resolve({ requestId, data })
            })
          })

          req.on('error', (err) => {
            removeActiveRequest(requestId)
            const error = err instanceof Error ? err : new Error(String(err))
            logError('openrouter-chat', error, { requestId, model })
            reject(error)
          })

          req.on('abort', () => {
            removeActiveRequest(requestId)
            const err = new Error('OpenRouter request cancelled')
            logError('openrouter-chat', err, { requestId, model })
            reject(err)
          })

          activeRequests.set(requestId, { req, timeoutHandle })
          req.write(body)
          req.end()
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err))
          logError('openrouter-chat', error, { requestId, model })
          reject(error)
        }
      })
    }
  )

  // ── Novel TTS API (POST /generate → MP3 bytes) ────────────────────────────
  // Replaces the old edge-tts CLI spawn.
  // Options are passed from the renderer (TtsApiConfig fields).
  ipcMain.handle(
    'tts',
    async (
      _e,
      text: string,
      options?: {
        apiUrl?: string
        apiKey?: string
        voiceGender?: string
        voiceName?: string
        rate?: string
        bf_lib?: Record<string, string>
        at_lib?: Record<string, string>
      }
    ) => {
      const requestId = generateRequestId()
      const apiUrl = assertHttpUrl(
        (options?.apiUrl || 'https://novelttsapi-0mv2.onrender.com').trim()
      ).replace(/\/$/, '')
      const apiKey = options?.apiKey || ''

      // Build payload — preprocessing already done by ttsPreprocess.ts on renderer
      const payload = JSON.stringify({
        text,
        bf_lib: options?.bf_lib || {},
        at_lib: options?.at_lib || {},
        rate: options?.rate || '+35%',
        voice_gender: options?.voiceGender || 'Female',
        voice_name: options?.voiceName || null,
        lang: 'th'
      })

      return new Promise<{ requestId: string; data: string }>((resolve, reject) => {
        const timeout = 600_000 // 10 minutes — full chapter can take a while
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        }
        if (apiKey) headers['X-API-Key'] = apiKey

        const timeoutHandle = setTimeout(() => {
          const record = activeRequests.get(requestId)
          if (record) record.req.abort()
          removeActiveRequest(requestId)
          reject(new Error('TTS request timed out after 10m'))
        }, timeout)

        const req = net.request({
          method: 'POST',
          url: `${apiUrl}/generate`,
          headers
        })

        const chunks: Buffer[] = []

        req.on('response', (res) => {
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            removeActiveRequest(requestId)
            const status = res.statusCode ?? 0
            if (status >= 400) {
              const msg = Buffer.concat(chunks).toString().slice(0, 300)
              const err = new Error(`TTS API ${status}: ${msg}`)
              logError('tts', err, { requestId, status })
              return reject(err)
            }
            // Return as base64 — same interface as the old edge-tts handler
            resolve({ requestId, data: Buffer.concat(chunks).toString('base64') })
          })
        })

        req.on('error', (err) => {
          removeActiveRequest(requestId)
          const error = err instanceof Error ? err : new Error(String(err))
          logError('tts', error, { requestId, text: text.slice(0, 50) })
          reject(error)
        })

        req.on('abort', () => {
          removeActiveRequest(requestId)
          const err = new Error('TTS request cancelled')
          logError('tts', err, { requestId })
          reject(err)
        })

        // Track this request for cancellation
        activeRequests.set(requestId, { req, timeoutHandle })

        req.write(payload)
        req.end()
      })
    }
  )

  // ── Novel TTS API Streaming (POST /stream → PlaybackEvent stream) ─────────
  // Uses novel TTS API streaming endpoint with glossary support.
  // Returns a Blob URL that can be played immediately.
  // NOTE: No timeout — chapter generation can take a long time
  ipcMain.handle(
    'tts-stream',
    async (
      _e,
      text: string,
      options?: {
        apiUrl?: string
        apiKey?: string
        voiceGender?: string
        voiceName?: string
        rate?: string
        bf_lib?: Record<string, string>
        at_lib?: Record<string, string>
      }
    ) => {
      const requestId = generateRequestId()
      const apiUrl = assertHttpUrl(
        (options?.apiUrl || 'https://novelttsapi-0mv2.onrender.com').trim()
      ).replace(/\/$/, '')
      const apiKey = options?.apiKey || ''

      // Build payload for streaming endpoint
      const payload = JSON.stringify({
        text,
        bf_lib: options?.bf_lib || {},
        at_lib: options?.at_lib || {},
        rate: options?.rate || '+35%',
        voice_gender: options?.voiceGender || 'Female',
        voice_name: options?.voiceName || null,
        lang: 'th'
      })

      return new Promise<{ requestId: string; data: string }>((resolve, reject) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        }
        if (apiKey) headers['x-api-key'] = apiKey

        const req = net.request({
          method: 'POST',
          url: `${apiUrl}/stream`,
          headers
        })

        const chunks: Buffer[] = []

        emitTtsProgress({ phase: 'starting', current: 0, total: 1, percent: 0, requestId })

        req.on('response', (res) => {
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            removeActiveRequest(requestId)
            const status = res.statusCode ?? 0
            if (status >= 400) {
              const msg = Buffer.concat(chunks).toString().slice(0, 300)
              const err = new Error(`TTS streaming ${status}: ${msg}`)
              logError('tts-stream', err, { requestId, status })
              return reject(err)
            }
            emitTtsProgress({ phase: 'done', current: 1, total: 1, percent: 100, requestId })
            resolve({ requestId, data: Buffer.concat(chunks).toString('base64') })
          })
        })

        req.on('error', (err) => {
          removeActiveRequest(requestId)
          const error = err instanceof Error ? err : new Error(String(err))
          logError('tts-stream', error, { requestId, text: text.slice(0, 50) })
          reject(error)
        })

        req.on('abort', () => {
          removeActiveRequest(requestId)
          const err = new Error('TTS streaming request cancelled')
          logError('tts-stream', err, { requestId })
          reject(err)
        })

        // Track this request for cancellation (no timeout)
        activeRequests.set(requestId, { req, timeoutHandle: null })

        req.write(payload)
        req.end()
      })
    }
  )

  // ── Save audio file (MP3 base64 → disk) ──────────────────────────────────
  // Called from renderer when user clicks 💾 Save MP3.
  // If outputDir is provided → auto-save without dialog.
  // Returns the saved file path, or null if cancelled.
  ipcMain.handle(
    'fs:saveAudioFile',
    async (_e, base64: string, defaultName: string, outputDir?: string) => {
      const { writeFile } = await import('fs/promises')
      const { join } = await import('path')
      const { dialog } = await import('electron')

      let filePath: string

      if (outputDir) {
        // Auto-save to remembered directory. basename() strips any path segments
        // in the caller-supplied name so it can't escape outputDir via "../".
        filePath = join(outputDir, basename(defaultName))
      } else {
        // First time — ask user where to save
        const result = await dialog.showSaveDialog({
          defaultPath: defaultName,
          filters: [
            { name: 'MP3 Audio', extensions: ['mp3'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        })
        if (result.canceled || !result.filePath) return null
        filePath = result.filePath
      }

      const buf = Buffer.from(base64, 'base64')
      await writeFile(filePath, buf)
      return filePath
    }
  )

  ipcMain.handle(
    'fs:saveAudioBytes',
    async (_e, bytes: number[], defaultName: string, outputDir?: string) => {
      const { writeFile } = await import('fs/promises')
      const { join } = await import('path')
      const { dialog } = await import('electron')

      let filePath: string

      if (outputDir) {
        filePath = join(outputDir, basename(defaultName))
      } else {
        const result = await dialog.showSaveDialog({
          defaultPath: defaultName,
          filters: [
            { name: 'MP3 Audio', extensions: ['mp3'] },
            { name: 'All Files', extensions: ['*'] }
          ]
        })
        if (result.canceled || !result.filePath) return null
        filePath = result.filePath
      }

      await writeFile(filePath, Buffer.from(Uint8Array.from(bytes)))
      return filePath
    }
  )

  // ── Save TTS audio (MP3 base64 → disk with auto-save to output dir) ───────
  // Used by terminal TTS panel to save generated audio automatically
  ipcMain.handle(
    'saveTtsAudio',
    async (_e, base64: string, filename: string, outputDir: string) => {
      const { writeFile } = await import('fs/promises')

      if (!outputDir) {
        throw new Error('Output directory not specified')
      }

      // basename() prevents a "../"-laden filename from escaping outputDir.
      const filePath = join(outputDir, basename(filename))
      const buf = Buffer.from(base64, 'base64')
      await writeFile(filePath, buf)
      return filePath
    }
  )

  ipcMain.handle(
    'convert-mp3-to-mp4',
    async (
      _e,
      opts: {
        imagePath: string
        audioPaths: string[]
        outputDir?: string
        filenamePrefix?: string
        ffmpegPath?: string
        useGpu?: boolean
        burnSubtitles?: boolean
        subtitleOrientation?: 'landscape' | 'vertical'
      }
    ) => {
      const outputs: string[] = []
      const errors: string[] = []
      const imagePath = opts.imagePath?.trim()
      const audioPaths = (opts.audioPaths ?? []).filter(Boolean)
      const orientation = opts.subtitleOrientation === 'vertical' ? 'vertical' : 'landscape'
      cancelMp4ConversionRequested = false

      if (!imagePath) throw new Error('Image path is required')
      if (audioPaths.length === 0) throw new Error('At least one MP3 file is required')

      await fsPromises.access(imagePath)
      const total = audioPaths.length

      // Use GPU (NVENC) when requested and this ffmpeg build advertises it. May
      // flip to false mid-batch if the first encode reveals nvenc isn't usable.
      let gpuEnabled = opts.useGpu !== false && (await isNvencListed(opts.ffmpegPath))

      for (const [index, audioPath] of audioPaths.entries()) {
        try {
          await fsPromises.access(audioPath)
          const defaultName = buildMp4Name(audioPath, opts.filenamePrefix)
          const fileName = basename(audioPath)
          const durationSeconds = await getAudioDurationSeconds(audioPath, opts.ffmpegPath)

          emitMp4Progress({
            phase: 'starting',
            current: index + 1,
            total,
            percent: Math.round((index / total) * 100),
            filePercent: 0,
            elapsedSeconds: 0,
            totalSeconds: durationSeconds,
            fileName
          })

          let targetPath: string
          if (opts.outputDir?.trim()) {
            targetPath = join(opts.outputDir, defaultName)
          } else {
            const result = await dialog.showSaveDialog({
              defaultPath: defaultName,
              filters: [
                { name: 'MP4 Video', extensions: ['mp4'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            })
            if (result.canceled || !result.filePath) {
              return { canceled: true, outputs, errors }
            }
            targetPath = result.filePath
          }

          const onProgress = (encodedSeconds: number): void => {
            const filePercent =
              durationSeconds > 0
                ? Math.min(100, Math.round((encodedSeconds / durationSeconds) * 100))
                : 0
            const overallPercent = Math.min(
              99,
              Math.round(((index + filePercent / 100) / total) * 100)
            )
            emitMp4Progress({
              phase: 'progress',
              current: index + 1,
              total,
              percent: overallPercent,
              filePercent,
              elapsedSeconds: encodedSeconds,
              totalSeconds: durationSeconds,
              fileName
            })
          }

          // Optional burned-in subtitles: if this MP3 came from Smart-Gen its
          // timeline sidecar (with per-line text) renders to an ASS track we
          // overlay. No sidecar / a v1 sidecar / toggle off → null → the args
          // below stay identical to the original still-image encode (parity).
          // The .ass and the bundled Sarabun font share one working dir so ffmpeg
          // can run from there and reference both by bare name (see buildSubtitleVf).
          let assTempPath: string | null = null
          let subCwd: string | undefined
          if (opts.burnSubtitles) {
            try {
              const ass = await assFromMp3Path(audioPath, orientation)
              if (ass) {
                const workDir = join(tmpdir(), 'tl-editor-sub')
                await fsPromises.mkdir(workDir, { recursive: true })
                // Copy the bundled subtitle font in once so fontsdir=. resolves it.
                const fontSrc = resolveBundledFontPath()
                if (fontSrc) {
                  const fontDst = join(workDir, basename(fontSrc))
                  if (!existsSync(fontDst)) await fsPromises.copyFile(fontSrc, fontDst)
                }
                assTempPath = join(workDir, `tlsub_${Date.now()}_${index}.ass`)
                await fsPromises.writeFile(assTempPath, ass, 'utf-8')
                subCwd = workDir
              }
            } catch {
              assTempPath = null
              subCwd = undefined
            }
          }
          const vfArg = assTempPath ? buildSubtitleVf(basename(assTempPath), orientation) : null

          const buildArgs = (gpu: boolean): string[] => [
            '-loop',
            '1',
            '-framerate',
            // A static image at 1 fps would only let the subtitles filter sample
            // once a second (subs lag ~1s). Match the 10 fps output when burning.
            vfArg ? '10' : '1',
            '-i',
            imagePath,
            '-i',
            audioPath,
            '-map',
            '0:v',
            '-map',
            '1:a',
            '-r',
            '10',
            ...(vfArg ? ['-vf', vfArg] : []),
            ...videoEncodeArgs(gpu, !!vfArg),
            '-acodec',
            'copy',
            '-y',
            '-shortest',
            targetPath
          ]

          try {
            await runFfmpeg(buildArgs(gpuEnabled), opts.ffmpegPath, onProgress, subCwd)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            // NVENC was listed but isn't actually usable here — disable it for the
            // rest of the batch and retry this file on CPU. (Not on user cancel.)
            if (gpuEnabled && !cancelMp4ConversionRequested && isNvencRuntimeError(msg)) {
              nvencListedCache = false
              gpuEnabled = false
              await runFfmpeg(buildArgs(false), opts.ffmpegPath, onProgress, subCwd)
            } else {
              throw err
            }
          } finally {
            if (assTempPath) await fsPromises.unlink(assTempPath).catch(() => {})
          }

          outputs.push(targetPath)
          emitMp4Progress({
            phase: 'completed',
            current: index + 1,
            total,
            percent: Math.round(((index + 1) / total) * 100),
            filePercent: 100,
            elapsedSeconds: durationSeconds,
            totalSeconds: durationSeconds,
            fileName,
            outputPath: targetPath
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (message === 'MP4 conversion cancelled') {
            emitMp4Progress({
              phase: 'canceled',
              current: index + 1,
              total,
              percent: Math.round((index / total) * 100),
              filePercent: 0,
              fileName: basename(audioPath)
            })
            return { canceled: true, outputs, errors }
          }
          errors.push(`${basename(audioPath)}: ${message}`)
          emitMp4Progress({
            phase: 'error',
            current: index + 1,
            total,
            percent: Math.round((index / total) * 100),
            filePercent: 0,
            fileName: basename(audioPath),
            error: message
          })
        }
      }

      emitMp4Progress({
        phase: 'done',
        current: total,
        total,
        percent: 100,
        filePercent: 100,
        elapsedSeconds: 0,
        totalSeconds: 0,
        fileName: ''
      })

      return { outputs, errors }
    }
  )

  // ── Shorts: vertical 9:16 clips cut from a chapter's Smart-Gen timeline ─────

  // Isolated from runFfmpeg/activeMp4Conversion — Shorts and the batch MP3→MP4
  // converter can plausibly run from panels open at the same time, and each
  // needs its own cancel target (mirrors the existing per-feature pattern:
  // activeMergeAudio/cancelMergeAudioRequested is already separate from mp4's).
  function runShortClipFfmpeg(args: string[], ffmpegPath?: string, cwd?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn(resolveFfmpegBinary(ffmpegPath), args, { windowsHide: true, cwd })
      activeShortClip = proc
      let stderr = ''
      proc.stderr.on('data', (chunk) => {
        stderr += String(chunk)
      })
      proc.on('error', reject)
      proc.on('close', (code) => {
        activeShortClip = null
        if (cancelShortClipRequested) return reject(new Error('Short clip cancelled'))
        if (code === 0) return resolve()
        reject(new Error(stderr.trim() || `ffmpeg exited with code ${code ?? -1}`))
      })
    })
  }

  // Always numbers the clip (`_short_1`, `_short_2`, …), scanning outputDir for
  // the highest existing suffix so repeated clips from the same chapter — even
  // across app restarts — never collide or reuse a number.
  async function nextShortClipName(mp3Path: string, outputDir: string): Promise<string> {
    const base = sanitizeFilenamePart(basename(mp3Path).replace(/\.[^.]+$/, ''))
    let maxN = 0
    try {
      const files = await fsPromises.readdir(outputDir)
      const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`^${escaped}_short_(\\d+)\\.mp4$`, 'i')
      for (const f of files) {
        const m = f.match(re)
        if (m) maxN = Math.max(maxN, parseInt(m[1], 10))
      }
    } catch {
      // outputDir doesn't exist yet — first clip gets _short_1.
    }
    return `${base}_short_${maxN + 1}.mp4`
  }

  // List .mp3 files in `dir` that have a usable (v2, has text) timeline sidecar
  // — i.e. were made with Smart-Gen and can drive a Shorts clip's captions.
  ipcMain.handle('list-timeline-mp3s', async (_e, dir: string) => {
    if (!dir?.trim()) return []
    let files: string[]
    try {
      files = await fsPromises.readdir(dir)
    } catch {
      return []
    }
    const results: { path: string; name: string }[] = []
    for (const name of files) {
      if (!/\.mp3$/i.test(name)) continue
      const p = join(dir, name)
      if (await readTimelineSidecar(p)) results.push({ path: p, name })
    }
    return results
  })

  // Timeline lines (row/start/text) for the line-range picker UI.
  ipcMain.handle('read-mp3-timeline', async (_e, mp3Path: string) => readTimelineSidecar(mp3Path))

  ipcMain.handle(
    'create-short-clip',
    async (
      _e,
      opts: {
        mp3Path: string
        imagePath: string
        startSec: number
        endSec: number
        ctaText?: string
        outputDir: string
        ffmpegPath?: string
        useGpu?: boolean
      }
    ) => {
      const mp3Path = opts.mp3Path?.trim()
      const imagePath = opts.imagePath?.trim()
      const outputDir = opts.outputDir?.trim()
      const startSec = Number(opts.startSec)
      const endSec = Number(opts.endSec)

      if (!mp3Path) throw new Error('mp3Path is required')
      if (!imagePath) throw new Error('imagePath is required')
      if (!outputDir) throw new Error('outputDir is required')
      if (!(endSec > startSec)) throw new Error('endSec must be greater than startSec')

      await fsPromises.access(mp3Path)
      await fsPromises.access(imagePath)
      await fsPromises.mkdir(outputDir, { recursive: true })
      cancelShortClipRequested = false

      const workDir = join(tmpdir(), 'tl-editor-sub')
      await fsPromises.mkdir(workDir, { recursive: true })
      const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const trimmedMp3 = join(workDir, `short_${ts}.mp3`)
      const assPath = join(workDir, `short_${ts}.ass`)

      try {
        const ass = await assForShortClip(mp3Path, startSec, endSec, opts.ctaText)
        if (!ass) throw new Error('ช่วงที่เลือกไม่มีบทพูด — ลองขยับช่วงที่เลือก')
        await fsPromises.writeFile(assPath, ass, 'utf-8')

        const fontSrc = resolveBundledFontPath()
        if (fontSrc) {
          const fontDst = join(workDir, basename(fontSrc))
          if (!existsSync(fontDst)) await fsPromises.copyFile(fontSrc, fontDst)
        }

        // Input-side seek + -t (not -to, whose meaning shifts once -ss precedes
        // -i) trims fast via stream copy. MP3 has no GOP/keyframes, so ffmpeg
        // starts at the nearest frame — drift is well under audible (<30ms).
        await runShortClipFfmpeg(
          [
            '-y',
            '-ss',
            String(startSec),
            '-i',
            mp3Path,
            '-t',
            String(endSec - startSec),
            '-c',
            'copy',
            trimmedMp3
          ],
          opts.ffmpegPath
        )

        const targetPath = join(outputDir, await nextShortClipName(mp3Path, outputDir))
        let gpuEnabled = opts.useGpu !== false && (await isNvencListed(opts.ffmpegPath))
        const vfArg = buildSubtitleVf(basename(assPath), 'vertical')
        // AAC (not the batch converter's `-acodec copy`): Shorts target mobile /
        // social upload flows where raw MP3-in-MP4 audio is less reliably supported.
        const buildArgs = (gpu: boolean): string[] => [
          '-loop',
          '1',
          '-framerate',
          '10',
          '-i',
          imagePath,
          '-i',
          trimmedMp3,
          '-map',
          '0:v',
          '-map',
          '1:a',
          '-r',
          '10',
          '-vf',
          vfArg,
          ...videoEncodeArgs(gpu, true),
          '-acodec',
          'aac',
          '-y',
          '-shortest',
          targetPath
        ]

        try {
          await runShortClipFfmpeg(buildArgs(gpuEnabled), opts.ffmpegPath, workDir)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (gpuEnabled && !cancelShortClipRequested && isNvencRuntimeError(msg)) {
            nvencListedCache = false
            gpuEnabled = false
            await runShortClipFfmpeg(buildArgs(false), opts.ffmpegPath, workDir)
          } else {
            throw err
          }
        }

        return { outputPath: targetPath }
      } finally {
        await fsPromises.unlink(trimmedMp3).catch(() => {})
        await fsPromises.unlink(assPath).catch(() => {})
      }
    }
  )

  ipcMain.handle('cancel-short-clip', () => {
    cancelShortClipRequested = true
    activeShortClip?.kill()
    return true
  })

  // ── Concatenate MP3 segments via ffmpeg (for smart TTS re-gen) ──────────────
  // Takes an array of base64-encoded MP3 strings, writes to temp files,
  // concatenates with ffmpeg stream copy (no re-encode), returns base64 result.
  ipcMain.handle('concat-mp3s', async (_e, audioBase64Array: string[]) => {
    if (!audioBase64Array.length) throw new Error('concat-mp3s: no segments provided')

    const tmpBase = app.getPath('temp')
    const ts = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const segPaths: string[] = []
    const listPath = join(tmpBase, `tts_list_${ts}.txt`)
    const outPath = join(tmpBase, `tts_out_${ts}.mp3`)

    try {
      // Write all segment temp files in parallel. Sequential awaits were the main
      // cost of a re-gen — 148 small writes serialize badly, especially with
      // on-access AV scanning on Windows. Paths are pre-built in order so the
      // concat list stays correctly ordered regardless of write-completion order.
      for (let i = 0; i < audioBase64Array.length; i++) {
        segPaths.push(join(tmpBase, `tts_seg_${ts}_${i}.mp3`))
      }
      await Promise.all(
        audioBase64Array.map((b64, i) =>
          fsPromises.writeFile(segPaths[i], Buffer.from(b64, 'base64'))
        )
      )

      const listContent = segPaths.map((p) => `file '${p.replace(/\\/g, '/')}'`).join('\n')
      await fsPromises.writeFile(listPath, listContent, 'utf-8')

      const ffmpegBin = resolveBundledFfmpegPath() || 'ffmpeg'
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(
          ffmpegBin,
          ['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-y', outPath],
          { windowsHide: true }
        )
        let stderr = ''
        proc.stderr.on('data', (c) => {
          stderr += String(c)
        })
        proc.on('error', reject)
        proc.on('close', (code) =>
          code === 0 ? resolve() : reject(new Error(stderr.slice(0, 300)))
        )
      })

      const buf = await fsPromises.readFile(outPath)
      return buf.toString('base64')
    } finally {
      for (const p of [...segPaths, listPath, outPath]) {
        fsPromises.unlink(p).catch(() => {})
      }
    }
  })

  // ── Health check handlers for TTS API (keep-alive) ────────────────────────
  ipcMain.handle('start-health-check', (_e, config?: Partial<HealthCheckConfig>) => {
    const mergedConfig = { ...defaultHealthConfig, ...config }
    startHealthCheck(mergedConfig)
    return true
  })

  ipcMain.handle('stop-health-check', () => {
    stopHealthCheck()
    return true
  })

  // ── Merge Episode Audio ───────────────────────────────────────────────────
  ipcMain.handle(
    'merge-episode-audio',
    async (
      _e,
      opts: {
        sourceDir: string
        fromEp: number
        toEp: number
        batchSize: number
        prefix: string
        outputDir: string
      }
    ) => {
      const { sourceDir, fromEp, toEp, batchSize, prefix, outputDir } = opts
      cancelMergeAudioRequested = false

      const extractNum = (filename: string): number => {
        const m = filename.match(/\d+/)
        return m ? parseInt(m[0], 10) : 0
      }

      const allFiles = await fsPromises.readdir(sourceDir)
      const mp3Files = allFiles.filter((f) => /\.mp3$/i.test(f))
      mp3Files.sort((a, b) => extractNum(a) - extractNum(b))

      const filtered = mp3Files.filter((f) => {
        const n = extractNum(f)
        return n >= fromEp && n <= toEp
      })

      const foundNums = new Set(filtered.map(extractNum))
      const missing: number[] = []
      for (let i = fromEp; i <= toEp; i++) {
        if (!foundNums.has(i)) missing.push(i)
      }
      if (missing.length > 0) {
        const preview = missing.slice(0, 10).join(', ')
        throw new Error(
          `ไม่พบไฟล์บทที่: ${preview}${missing.length > 10 ? ` ... (ขาดทั้งหมด ${missing.length} บท)` : ''}`
        )
      }

      if (filtered.length === 0) {
        throw new Error(`ไม่พบไฟล์ MP3 ในช่วง บทที่ ${fromEp} - ${toEp}`)
      }

      const batches: string[][] = []
      for (let i = 0; i < filtered.length; i += batchSize) {
        batches.push(filtered.slice(i, i + batchSize))
      }

      const totalBatches = batches.length
      emitMergeAudioProgress({
        phase: 'starting',
        currentBatch: 0,
        totalBatches,
        currentBatchLabel: ''
      })

      for (let bi = 0; bi < batches.length; bi++) {
        if (cancelMergeAudioRequested) {
          emitMergeAudioProgress({
            phase: 'canceled',
            currentBatch: bi,
            totalBatches,
            currentBatchLabel: ''
          })
          return { canceled: true }
        }

        const batch = batches[bi]
        const firstNum = extractNum(batch[0])
        const lastNum = extractNum(batch[batch.length - 1])
        const batchLabel = `บทที่ ${firstNum} - ${lastNum}`
        const outputFilename = `${prefix}${prefix ? ' ' : ''}${batchLabel}.mp3`
        const outputPath = join(outputDir, outputFilename)

        const ts = `merge_${Date.now()}_${bi}`
        const listPath = join(app.getPath('temp'), `${ts}.txt`)
        const listContent = batch
          .map((f) => `file '${join(sourceDir, f).replace(/\\/g, '/')}'`)
          .join('\n')
        await fsPromises.writeFile(listPath, listContent, 'utf-8')

        emitMergeAudioProgress({
          phase: 'merging',
          currentBatch: bi + 1,
          totalBatches,
          currentBatchLabel: batchLabel
        })

        try {
          const ffmpegBin = resolveBundledFfmpegPath() || 'ffmpeg'
          await new Promise<void>((resolve, reject) => {
            const proc = spawn(
              ffmpegBin,
              ['-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'copy', '-y', outputPath],
              { windowsHide: true }
            )
            activeMergeAudio = proc
            let stderr = ''

            proc.stderr.on('data', (chunk: Buffer) => {
              const text = String(chunk)
              stderr += text
              emitMergeAudioProgress({
                phase: 'merging',
                currentBatch: bi + 1,
                totalBatches,
                currentBatchLabel: batchLabel,
                ffmpegLog: text
              })
            })

            proc.on('error', reject)
            proc.on('close', (code) => {
              activeMergeAudio = null
              if (cancelMergeAudioRequested) return reject(new Error('canceled'))
              code === 0
                ? resolve()
                : reject(new Error(stderr.slice(0, 300) || `FFmpeg exited with code ${code ?? -1}`))
            })
          })
        } finally {
          fsPromises.unlink(listPath).catch(() => {})
        }
      }

      emitMergeAudioProgress({
        phase: 'completed',
        currentBatch: totalBatches,
        totalBatches,
        currentBatchLabel: `บทที่ ${fromEp} - ${toEp}`
      })

      return { success: true }
    }
  )

  ipcMain.handle('cancel-merge-audio', () => {
    cancelMergeAudioRequested = true
    if (activeMergeAudio) {
      activeMergeAudio.kill('SIGTERM')
      activeMergeAudio = null
    }
    return true
  })

  // ── ReadRealm Publisher ───────────────────────────────────────────────────

  ipcMain.handle(
    'readrealm-save-credentials',
    async (_e, opts: { username: string; password: string }) => {
      rrToken = null
      rrTokenExpiry = 0
      await saveApiKey('readrealm-user', opts.username)
      await saveApiKey('readrealm-pass', opts.password)
      try {
        rrToken = await rrLogin(opts.username, opts.password)
        rrTokenExpiry = parseJwtExp(rrToken)
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('readrealm-get-token', async () => {
    try {
      await rrGetToken()
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('readrealm-get-novels', async () => {
    try {
      const token = await rrGetToken()
      const res = await rrGet(
        `${RR_API}/writer/novels/getNovelsList?per_page=50&page=1`,
        rrAuthHeaders(token)
      )
      if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${res.body.slice(0, 200)}`)
      return { success: true, data: JSON.parse(res.body) }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('readrealm-get-chapters', async (_e, opts: { novelId: string }) => {
    try {
      const token = await rrGetToken()
      const url = `${RR_API}/writer/novels/chapters/getChaptersList?novel_ID=${encodeURIComponent(opts.novelId)}&page=1&per_page=500&sort_column=desc`
      const res = await rrGet(url, rrAuthHeaders(token))
      if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${res.body.slice(0, 200)}`)
      return { success: true, data: JSON.parse(res.body) }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    'readrealm-upload-chapter',
    async (
      _e,
      opts: {
        novelId: string
        chapterId: string
        title: string
        content: string
        price: number
        publishDatetime: string
        note: string
      }
    ) => {
      try {
        const token = await rrGetToken()
        const isUpdate = opts.chapterId !== '0' && opts.chapterId !== ''
        const endpoint = isUpdate ? 'chapterUpdate' : 'chapterCreate'
        const url = `${RR_API}/writer/novels/chapters/${endpoint}`
        const payload = JSON.stringify({
          chapter_ID: opts.chapterId || '0',
          novel_ID: opts.novelId,
          chapter_title: opts.title,
          chapter_content: opts.content,
          chapter_note: opts.note,
          chapter_price: opts.price,
          chapter_publish: true,
          chapter_publish_datetime: opts.publishDatetime
        })
        const method = isUpdate ? 'PUT' : 'POST'
        const res = await rrPost(
          url,
          payload,
          {
            ...rrAuthHeaders(token),
            'Content-Type': 'application/json'
          },
          method
        )
        if (res.status !== 200 && res.status !== 201)
          throw new Error(`HTTP ${res.status}: ${res.body.slice(0, 300)}`)
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // ── Auto-start health check on app initialization ─────────────────────────
  startHealthCheck()
}
