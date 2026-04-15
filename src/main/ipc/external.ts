import { ipcMain } from 'electron'
import { net } from 'electron'

export function registerExternalHandlers(): void {
  // ── Google Translate (via Electron net to bypass renderer CSP) ────────────
  ipcMain.handle('translate', (_e, text: string) => {
    const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=th&dt=t&q=${encodeURIComponent(text)}`
    return new Promise((resolve, reject) => {
      const req = net.request(url)
      let body = ''
      req.on('response', (res) => {
        res.on('data', (chunk) => {
          body += chunk
        })
        res.on('end', () => {
          try {
            resolve(JSON.parse(body))
          } catch {
            reject(new Error('translate: parse error'))
          }
        })
      })
      req.on('error', reject)
      req.end()
    })
  })

  // ── OpenRouter chat completion ────────────────────────────────────────────
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
      return new Promise<string>((resolve, reject) => {
        const body = JSON.stringify({ model, messages, temperature: 0.3, max_tokens: 15000 })

        const timeout = setTimeout(() => {
          req.abort()
          reject(new Error('OpenRouter request timed out after 300 s'))
        }, 300_000)

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
            clearTimeout(timeout)
            if ((res.statusCode ?? 0) >= 400)
              return reject(new Error(`OpenRouter ${res.statusCode}: ${data}`))
            resolve(data)
          })
        })
        req.on('error', (err) => {
          clearTimeout(timeout)
          reject(err)
        })
        req.write(body)
        req.end()
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
      const apiUrl = (options?.apiUrl || 'https://novelttsapi.onrender.com')
        .trim()
        .replace(/\/$/, '')
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

      return new Promise<string>((resolve, reject) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        }
        if (apiKey) headers['X-API-Key'] = apiKey

        const req = net.request({
          method: 'POST',
          url: `${apiUrl}/generate`,
          headers
        })

        const chunks: Buffer[] = []

        req.on('response', (res) => {
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            const status = res.statusCode ?? 0
            if (status >= 400) {
              const msg = Buffer.concat(chunks).toString().slice(0, 300)
              return reject(new Error(`TTS API ${status}: ${msg}`))
            }
            // Return as base64 — same interface as the old edge-tts handler
            resolve(Buffer.concat(chunks).toString('base64'))
          })
        })

        req.on('error', (err) => {
          reject(err)
        })

        req.write(payload)
        req.end()
      })
    }
  )

  // ── Novel TTS API Streaming (POST /stream → PlaybackEvent stream) ─────────
  // Uses novel TTS API streaming endpoint with glossary support.
  // Returns a Blob URL that can be played immediately.
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
      const apiUrl = (options?.apiUrl || 'https://novelttsapi.onrender.com')
        .trim()
        .replace(/\/$/, '')
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

      return new Promise<string>((resolve, reject) => {
        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        }
        if (apiKey) headers['X-API-Key'] = apiKey

        const req = net.request({
          method: 'POST',
          url: `${apiUrl}/stream`,
          headers
        })

        const chunks: Buffer[] = []

        req.on('response', (res) => {
          res.on('data', (chunk: Buffer) => chunks.push(chunk))
          res.on('end', () => {
            const status = res.statusCode ?? 0
            if (status >= 400) {
              const msg = Buffer.concat(chunks).toString().slice(0, 300)
              return reject(new Error(`TTS streaming ${status}: ${msg}`))
            }
            // Return as base64
            resolve(Buffer.concat(chunks).toString('base64'))
          })
        })

        req.on('error', (err) => {
          reject(err)
        })

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
}
