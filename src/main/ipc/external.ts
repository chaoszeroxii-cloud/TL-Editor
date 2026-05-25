import { ipcMain, net, dialog, app, BrowserWindow } from 'electron'
import type { ClientRequest } from 'electron'
import { URL } from 'url'
import { spawn } from 'child_process'
import { basename, join } from 'path'
import { existsSync, promises as fsPromises } from 'fs'

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
  apiUrl: 'https://novelttsapi.onrender.com'
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
  onProgress?: (encodedSeconds: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegBin = resolveFfmpegBinary(ffmpegPath)
    const proc = spawn(ffmpegBin, args, { windowsHide: true })
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
        stream: useStream,
        requestId: clientRequestId
      }: {
        apiKey: string
        model: string
        messages: { role: string; content: string }[]
        tools?: object[]
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
                  choices?: { delta?: { content?: string; tool_calls?: unknown[] } }[]
                }
                const delta = obj.choices?.[0]?.delta
                if (!delta) continue

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
                    if (tc.function?.arguments)
                      toolCallsAccum[idx].function.arguments += tc.function.arguments
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
        (options?.apiUrl || 'https://novelttsapi.onrender.com').trim().replace(/\/$/, '')
      )
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
        const timeout = 120_000 // 2 minutes
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        }
        if (apiKey) headers['X-API-Key'] = apiKey

        const timeoutHandle = setTimeout(() => {
          const record = activeRequests.get(requestId)
          if (record) record.req.abort()
          removeActiveRequest(requestId)
          reject(new Error('TTS request timed out after 2m'))
        }, timeout)

        const req = net.request({
          method: 'POST',
          url: `${apiUrl}generate`,
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
        (options?.apiUrl || 'https://novelttsapi.onrender.com').trim().replace(/\/$/, '')
      )
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
        // Auto-save to remembered directory
        filePath = join(outputDir, defaultName)
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
        filePath = join(outputDir, defaultName)
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

      const filePath = join(outputDir, filename)
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
      }
    ) => {
      const outputs: string[] = []
      const errors: string[] = []
      const imagePath = opts.imagePath?.trim()
      const audioPaths = (opts.audioPaths ?? []).filter(Boolean)
      cancelMp4ConversionRequested = false

      if (!imagePath) throw new Error('Image path is required')
      if (audioPaths.length === 0) throw new Error('At least one MP3 file is required')

      await fsPromises.access(imagePath)
      const total = audioPaths.length

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

          await runFfmpeg(
            [
              '-loop',
              '1',
              '-framerate',
              '1',
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
              '-c:v',
              'libx264',
              '-preset',
              'ultrafast',
              '-crf',
              '51',
              '-pix_fmt',
              'yuv420p',
              '-acodec',
              'copy',
              '-y',
              '-shortest',
              targetPath
            ],
            opts.ffmpegPath,
            (encodedSeconds) => {
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
          )

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
      for (let i = 0; i < audioBase64Array.length; i++) {
        const p = join(tmpBase, `tts_seg_${ts}_${i}.mp3`)
        await fsPromises.writeFile(p, Buffer.from(audioBase64Array[i], 'base64'))
        segPaths.push(p)
      }

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

  // ── Auto-start health check on app initialization ─────────────────────────
  startHealthCheck()
}
