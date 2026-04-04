import { ipcMain } from 'electron'
import { net } from 'electron'
import { spawn } from 'child_process'

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

        // Hard timeout — abort if no response within 300 s
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

  // ── Edge TTS (streams mp3 bytes via edge-tts CLI) ─────────────────────────
  ipcMain.handle('tts', (_e, text: string, voice = 'th-TH-PremwadeeNeural') => {
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = []
      const proc = spawn('edge-tts', [
        '--voice',
        voice,
        '--rate=+35%',
        '--text',
        text,
        '--write-media',
        '-' // stream mp3 → stdout
      ])
      proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
      proc.on('close', (code) => {
        if (code !== 0 || chunks.length === 0)
          return reject(new Error(`edge-tts exited with code ${code}`))
        resolve(Buffer.concat(chunks).toString('base64'))
      })
      proc.on('error', reject)
    })
  })
}
