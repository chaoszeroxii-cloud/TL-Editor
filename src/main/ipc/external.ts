import { ipcMain, net } from 'electron'
import type { ClientRequest } from 'electron'

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

export function registerExternalHandlers(): void {
  // ── Cancel/Abort handler for any in-flight request ───────────────────────
  ipcMain.handle('cancel-network-request', (_e, requestId: string) => {
    const record = activeRequests.get(requestId)
    if (!record) return false
    record.req.abort()
    removeActiveRequest(requestId)
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
    (
      _e,
      {
        apiKey,
        messages,
        model
      }: {
        apiKey: string
        model: string
        messages: { role: string; content: string }[]
      }
    ) => {
      const requestId = generateRequestId()
      return new Promise<{ requestId: string; data: string }>((resolve, reject) => {
        try {
          const timeout = 300_000 // 5 minutes
          const body = JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 15000 })

          const timeoutHandle = setTimeout(() => {
            const record = activeRequests.get(requestId)
            if (record) record.req.abort()
            removeActiveRequest(requestId)
            const err = new Error('OpenRouter request timed out after 5m')
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

          // Track this request for cancellation
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
        if (apiKey) headers['X-API-Key'] = apiKey

        const req = net.request({
          method: 'POST',
          url: `${apiUrl}stream`,
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
              const err = new Error(`TTS streaming ${status}: ${msg}`)
              logError('tts-stream', err, { requestId, status })
              return reject(err)
            }
            // Return as base64
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

  // ── Save TTS audio (MP3 base64 → disk with auto-save to output dir) ───────
  // Used by terminal TTS panel to save generated audio automatically
  ipcMain.handle(
    'saveTtsAudio',
    async (_e, base64: string, filename: string, outputDir: string) => {
      const { writeFile } = await import('fs/promises')
      const { join } = await import('path')

      if (!outputDir) {
        throw new Error('Output directory not specified')
      }

      const filePath = join(outputDir, filename)
      const buf = Buffer.from(base64, 'base64')
      await writeFile(filePath, buf)
      return filePath
    }
  )

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
