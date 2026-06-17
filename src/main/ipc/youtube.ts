// src/main/ipc/youtube.ts
//
// YouTube Publisher — uploads Episode Videos (MP4) to the user's own channel.
//
// Auth model (see docs/adr/0001-youtube-publishing-model.md):
//   • The user owns the Google Cloud OAuth client (Desktop app). client_id lives
//     in config.json; client_secret + refresh token live in the OS keychain.
//   • OAuth uses the loopback-redirect + system-browser flow (Google blocks
//     embedded webviews). Scope: youtube.force-ssl (covers upload + playlist +
//     thumbnail).
//   • Spacing is server-side: each video is uploaded now as private with a
//     future publishAt; YouTube reveals it at its Publish Time. No client timer.
//
// Implemented with raw https (matching the ReadRealm helpers) to avoid pulling
// in the very large `googleapis` dependency.

import { ipcMain, shell, BrowserWindow } from 'electron'
import { createServer } from 'http'
import type { IncomingMessage, ServerResponse } from 'http'
import { request as httpsRequest } from 'https'
import { createHash, randomBytes } from 'crypto'
import { createReadStream, promises as fsp } from 'fs'
import { URL } from 'url'
import { loadConfig, loadApiKey, saveApiKey, deleteApiKey } from './config'
import { assertPathAllowed } from './pathAccess'

const SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl'
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

// In-memory access-token cache (the durable refresh token lives in keytar).
let accessToken: string | null = null
let accessTokenExpiry = 0 // epoch ms

// Active resumable upload (for cancel support), mirrors the MP4 converter.
let activeUploadReq: ReturnType<typeof httpsRequest> | null = null
let cancelUploadRequested = false

// ─── HTTP helpers ───────────────────────────────────────────────────────────

interface HttpResult {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

function httpRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: Buffer
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = httpsRequest(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers
      },
      (res) => {
        let buf = ''
        res.on('data', (c: Buffer) => (buf += c.toString('utf-8')))
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: buf })
        )
      }
    )
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function emitProgress(payload: {
  phase: 'starting' | 'progress' | 'completed' | 'error'
  filePercent: number
  bytesSent: number
  totalBytes: number
  fileName: string
}): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('youtube:progress', payload)
  }
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

interface ClientCreds {
  clientId: string
  clientSecret: string
}

async function getClientCreds(): Promise<ClientCreds> {
  const clientId = (loadConfig().youtubeClientId ?? '').trim()
  const clientSecret = (await loadApiKey('youtube-client-secret')) ?? ''
  if (!clientId) throw new Error('ยังไม่ได้ตั้ง Client ID — กรอก Client ID/Secret ก่อนเชื่อมต่อ')
  if (!clientSecret)
    throw new Error('ยังไม่ได้ตั้ง Client Secret — กรอก Client ID/Secret ก่อนเชื่อมต่อ')
  return { clientId, clientSecret }
}

// Runs the loopback OAuth dance: spins up a localhost server, opens the system
// browser to Google's consent screen, waits for the redirect with ?code, then
// exchanges the code for tokens. Resolves with the refresh token.
function runOAuthFlow(
  creds: ClientCreds
): Promise<{ refreshToken: string; accessToken: string; expiresIn: number }> {
  return new Promise((resolve, reject) => {
    const verifier = base64url(randomBytes(48))
    const challenge = base64url(createHash('sha256').update(verifier).digest())
    const state = base64url(randomBytes(16))

    let settled = false
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1')
      const code = reqUrl.searchParams.get('code')
      const err = reqUrl.searchParams.get('error')
      const returnedState = reqUrl.searchParams.get('state')

      // Ignore stray requests (e.g. favicon) that carry neither code nor error.
      if (!code && !err) {
        res.statusCode = 204
        res.end()
        return
      }

      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      if (err || !code) {
        res.end(
          `<html><body style="font-family:sans-serif">เชื่อมต่อไม่สำเร็จ: ${err ?? 'no code'} — ปิดหน้านี้ได้</body></html>`
        )
        finish(new Error(`OAuth error: ${err ?? 'no authorization code returned'}`))
        return
      }
      if (returnedState !== state) {
        res.end('<html><body>State mismatch — ปิดหน้านี้ได้</body></html>')
        finish(new Error('OAuth state mismatch (possible CSRF) — ลองใหม่อีกครั้ง'))
        return
      }
      res.end(
        '<html><body style="font-family:sans-serif">เชื่อมต่อ YouTube สำเร็จ ✓ กลับไปที่แอปได้เลย — ปิดหน้านี้ได้</body></html>'
      )
      exchangeCode(code).then(
        (tokens) => finish(null, tokens),
        (e) => finish(e instanceof Error ? e : new Error(String(e)))
      )
    })

    function finish(
      e: Error | null,
      tokens?: { refreshToken: string; accessToken: string; expiresIn: number }
    ): void {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      server.close()
      if (e) reject(e)
      else resolve(tokens!)
    }

    const exchangeCode = async (
      code: string
    ): Promise<{ refreshToken: string; accessToken: string; expiresIn: number }> => {
      const redirectUri = `http://127.0.0.1:${port}`
      const form = new URLSearchParams({
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier
      }).toString()
      const result = await httpRequest(
        'POST',
        TOKEN_ENDPOINT,
        {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': String(Buffer.byteLength(form))
        },
        Buffer.from(form)
      )
      if (result.status !== 200)
        throw new Error(
          `Token exchange failed (HTTP ${result.status}): ${result.body.slice(0, 300)}`
        )
      const json = JSON.parse(result.body) as {
        access_token: string
        refresh_token?: string
        expires_in: number
      }
      if (!json.refresh_token)
        throw new Error(
          'ไม่ได้ refresh token จาก Google — ตรวจว่า consent screen เป็น Production และลองถอนสิทธิ์แล้วเชื่อมใหม่'
        )
      return {
        refreshToken: json.refresh_token,
        accessToken: json.access_token,
        expiresIn: json.expires_in
      }
    }

    let port = 0
    const timeout = setTimeout(
      () => finish(new Error('หมดเวลารอการยืนยันจาก Google (5 นาที)')),
      5 * 60 * 1000
    )

    server.on('error', (e) => finish(e))
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        finish(new Error('เปิด local server ไม่สำเร็จ'))
        return
      }
      port = addr.port
      const authUrl =
        `${AUTH_ENDPOINT}?` +
        new URLSearchParams({
          client_id: creds.clientId,
          redirect_uri: `http://127.0.0.1:${port}`,
          response_type: 'code',
          scope: SCOPE,
          access_type: 'offline',
          prompt: 'consent',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state
        }).toString()
      shell.openExternal(authUrl).catch((e) => finish(e))
    })
  })
}

// Returns a valid access token, refreshing via the stored refresh token when the
// cached one is missing or about to expire.
async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < accessTokenExpiry - 60_000) return accessToken

  const refreshToken = await loadApiKey('youtube-refresh-token')
  if (!refreshToken) throw new Error('ยังไม่ได้เชื่อมต่อ YouTube — กด Connect ก่อน')
  const creds = await getClientCreds()

  const form = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  }).toString()
  const result = await httpRequest(
    'POST',
    TOKEN_ENDPOINT,
    {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': String(Buffer.byteLength(form))
    },
    Buffer.from(form)
  )
  if (result.status !== 200)
    throw new Error(
      `Refresh token ใช้ไม่ได้ (HTTP ${result.status}) — ลอง Connect ใหม่: ${result.body.slice(0, 200)}`
    )
  const json = JSON.parse(result.body) as { access_token: string; expires_in: number }
  accessToken = json.access_token
  accessTokenExpiry = Date.now() + json.expires_in * 1000
  return accessToken
}

async function fetchChannelTitle(): Promise<string> {
  const token = await getAccessToken()
  const res = await httpRequest(
    'GET',
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    { Authorization: `Bearer ${token}` }
  )
  if (res.status !== 200)
    throw new Error(`channels.list HTTP ${res.status}: ${res.body.slice(0, 200)}`)
  const json = JSON.parse(res.body) as { items?: Array<{ snippet?: { title?: string } }> }
  return json.items?.[0]?.snippet?.title ?? '(ไม่ทราบชื่อช่อง)'
}

// ─── Upload pipeline ────────────────────────────────────────────────────────

interface UploadOpts {
  videoPath: string
  title: string
  description: string
  tags: string[]
  categoryId: string
  privacyStatus: 'public' | 'unlisted' | 'private'
  publishAt?: string // ISO; only honored when privacyStatus === 'private'
  defaultLanguage?: string
  playlistId?: string
  thumbnailPath?: string
}

// Initiates a resumable session and streams the file bytes, emitting byte
// progress. Returns the new video id. Throws { quotaExceeded } marker on 403.
async function insertVideoResumable(opts: UploadOpts, token: string): Promise<string> {
  const videoPath = assertPathAllowed(opts.videoPath)
  const fileName = videoPath.split(/[\\/]/).pop() ?? videoPath
  const stat = await fsp.stat(videoPath)
  const totalBytes = stat.size
  const contentType = videoPath.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4'

  const snippet: Record<string, unknown> = {
    title: opts.title.slice(0, 100),
    description: opts.description,
    categoryId: opts.categoryId || '22'
  }
  if (opts.tags.length) snippet.tags = opts.tags
  if (opts.defaultLanguage) snippet.defaultLanguage = opts.defaultLanguage

  const status: Record<string, unknown> = {
    privacyStatus: opts.privacyStatus,
    selfDeclaredMadeForKids: false
  }
  if (opts.privacyStatus === 'private' && opts.publishAt) status.publishAt = opts.publishAt

  const metadata = Buffer.from(JSON.stringify({ snippet, status }), 'utf-8')

  // Step 1: initiate resumable session.
  const init = await httpRequest(
    'POST',
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'Content-Length': String(metadata.length),
      'X-Upload-Content-Length': String(totalBytes),
      'X-Upload-Content-Type': contentType
    },
    metadata
  )
  if (init.status === 403 && /quota/i.test(init.body)) {
    const e = new Error('quotaExceeded') as Error & { quotaExceeded: boolean }
    e.quotaExceeded = true
    throw e
  }
  if (init.status !== 200)
    throw new Error(`เริ่ม upload ไม่สำเร็จ (HTTP ${init.status}): ${init.body.slice(0, 300)}`)
  const sessionUri = init.headers['location']
  if (!sessionUri || typeof sessionUri !== 'string')
    throw new Error('ไม่ได้ session URI จาก YouTube')

  // Step 2: PUT the bytes, streaming with progress.
  emitProgress({ phase: 'starting', filePercent: 0, bytesSent: 0, totalBytes, fileName })

  return new Promise<string>((resolve, reject) => {
    const u = new URL(sessionUri)
    const req = httpsRequest(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'PUT',
        headers: { 'Content-Length': String(totalBytes), 'Content-Type': contentType }
      },
      (res) => {
        let body = ''
        res.on('data', (c: Buffer) => (body += c.toString('utf-8')))
        res.on('end', () => {
          activeUploadReq = null
          if (res.statusCode === 200 || res.statusCode === 201) {
            try {
              const json = JSON.parse(body) as { id?: string }
              if (json.id) {
                emitProgress({
                  phase: 'completed',
                  filePercent: 100,
                  bytesSent: totalBytes,
                  totalBytes,
                  fileName
                })
                resolve(json.id)
              } else reject(new Error(`ไม่พบ video id ใน response: ${body.slice(0, 200)}`))
            } catch {
              reject(new Error(`response upload ผิดรูปแบบ: ${body.slice(0, 200)}`))
            }
          } else if (res.statusCode === 403 && /quota/i.test(body)) {
            const e = new Error('quotaExceeded') as Error & { quotaExceeded: boolean }
            e.quotaExceeded = true
            reject(e)
          } else {
            reject(new Error(`upload ล้มเหลว (HTTP ${res.statusCode}): ${body.slice(0, 300)}`))
          }
        })
      }
    )

    const stream = createReadStream(videoPath)

    activeUploadReq = req
    req.on('error', (e) => {
      activeUploadReq = null
      stream.destroy() // release the file descriptor when the request dies/cancels
      reject(cancelUploadRequested ? new Error('ยกเลิกการอัปโหลด') : e)
    })

    let sent = 0
    stream.on('data', (chunk: string | Buffer) => {
      sent += chunk.length
      const filePercent = totalBytes > 0 ? Math.min(99, Math.round((sent / totalBytes) * 100)) : 0
      emitProgress({ phase: 'progress', filePercent, bytesSent: sent, totalBytes, fileName })
    })
    stream.on('error', (e) => {
      req.destroy()
      reject(e)
    })
    stream.pipe(req)
  })
}

async function setThumbnail(videoId: string, thumbnailPath: string, token: string): Promise<void> {
  const safePath = assertPathAllowed(thumbnailPath)
  const img = await fsp.readFile(safePath)
  const lower = safePath.toLowerCase()
  const contentType = lower.endsWith('.png') ? 'image/png' : 'image/jpeg'
  const res = await httpRequest(
    'POST',
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`,
    {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
      'Content-Length': String(img.length)
    },
    img
  )
  if (res.status !== 200)
    throw new Error(`ตั้ง thumbnail ไม่สำเร็จ (HTTP ${res.status}): ${res.body.slice(0, 200)}`)
}

async function addToPlaylist(videoId: string, playlistId: string, token: string): Promise<void> {
  const body = Buffer.from(
    JSON.stringify({
      snippet: { playlistId, resourceId: { kind: 'youtube#video', videoId } }
    }),
    'utf-8'
  )
  const res = await httpRequest(
    'POST',
    'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet',
    {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': String(body.length)
    },
    body
  )
  if (res.status !== 200)
    throw new Error(`เพิ่มเข้า playlist ไม่สำเร็จ (HTTP ${res.status}): ${res.body.slice(0, 200)}`)
}

// ─── IPC handlers ───────────────────────────────────────────────────────────

export function registerYoutubeHandlers(): void {
  // Save the client secret to the keychain (client_id is persisted by the
  // renderer via saveConfigPatch since it isn't a secret).
  ipcMain.handle('youtube-save-secret', async (_e, opts: { clientSecret: string }) => {
    try {
      if (opts.clientSecret) await saveApiKey('youtube-client-secret', opts.clientSecret)
      else await deleteApiKey('youtube-client-secret')
      // Invalidate any cached access token so the new creds take effect.
      accessToken = null
      accessTokenExpiry = 0
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('youtube-connect', async () => {
    try {
      const creds = await getClientCreds()
      const tokens = await runOAuthFlow(creds)
      await saveApiKey('youtube-refresh-token', tokens.refreshToken)
      accessToken = tokens.accessToken
      accessTokenExpiry = Date.now() + tokens.expiresIn * 1000
      const channelTitle = await fetchChannelTitle()
      return { success: true, channelTitle }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Reports whether a usable connection exists (refresh token present + channel
  // reachable). Used by the panel on mount.
  ipcMain.handle('youtube-status', async () => {
    try {
      const refreshToken = await loadApiKey('youtube-refresh-token')
      if (!refreshToken) return { connected: false }
      const channelTitle = await fetchChannelTitle()
      return { connected: true, channelTitle }
    } catch (err) {
      return { connected: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('youtube-disconnect', async () => {
    accessToken = null
    accessTokenExpiry = 0
    await deleteApiKey('youtube-refresh-token')
    return { success: true }
  })

  ipcMain.handle('youtube-list-playlists', async () => {
    try {
      const token = await getAccessToken()
      const res = await httpRequest(
        'GET',
        'https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50',
        { Authorization: `Bearer ${token}` }
      )
      if (res.status !== 200)
        throw new Error(`playlists.list HTTP ${res.status}: ${res.body.slice(0, 200)}`)
      const json = JSON.parse(res.body) as {
        items?: Array<{ id: string; snippet?: { title?: string } }>
      }
      const data = (json.items ?? []).map((it) => ({
        id: it.id,
        title: it.snippet?.title ?? it.id
      }))
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Lists every video already on the channel (title + id), via the channel's
  // "uploads" playlist. Cheap (~1 quota unit per 50 videos) vs search.list (100
  // units/call). Includes private/scheduled videos, so a capped batch's
  // already-uploaded clips are detected — enabling safe resume without dupes.
  ipcMain.handle('youtube-list-uploaded', async () => {
    try {
      const token = await getAccessToken()
      const chRes = await httpRequest(
        'GET',
        'https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true',
        { Authorization: `Bearer ${token}` }
      )
      if (chRes.status !== 200)
        throw new Error(`channels.list HTTP ${chRes.status}: ${chRes.body.slice(0, 200)}`)
      const chJson = JSON.parse(chRes.body) as {
        items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>
      }
      const uploadsId = chJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
      if (!uploadsId) return { success: true, data: [] }

      const data: Array<{ title: string; videoId: string }> = []
      let pageToken = ''
      // Cap at 20 pages (1000 videos) to bound time/quota on huge channels.
      for (let page = 0; page < 20; page++) {
        const url =
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${encodeURIComponent(uploadsId)}&maxResults=50` +
          (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '')
        const res = await httpRequest('GET', url, { Authorization: `Bearer ${token}` })
        if (res.status !== 200)
          throw new Error(`playlistItems.list HTTP ${res.status}: ${res.body.slice(0, 200)}`)
        const json = JSON.parse(res.body) as {
          items?: Array<{ snippet?: { title?: string; resourceId?: { videoId?: string } } }>
          nextPageToken?: string
        }
        for (const it of json.items ?? []) {
          const title = it.snippet?.title
          const videoId = it.snippet?.resourceId?.videoId
          if (title && videoId) data.push({ title, videoId })
        }
        if (!json.nextPageToken) break
        pageToken = json.nextPageToken
      }
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('cancel-youtube-upload', () => {
    cancelUploadRequested = true
    activeUploadReq?.destroy(new Error('canceled'))
    return true
  })

  ipcMain.handle('youtube-upload-video', async (_e, opts: UploadOpts) => {
    cancelUploadRequested = false
    try {
      const token = await getAccessToken()
      const videoId = await insertVideoResumable(opts, token)

      // Best-effort extras — a failure here shouldn't fail the whole upload, but
      // we surface it as a warning so the user knows the video itself is up.
      let warning: string | undefined
      if (opts.thumbnailPath) {
        try {
          await setThumbnail(videoId, opts.thumbnailPath, token)
        } catch (e) {
          warning = `อัปคลิปสำเร็จ แต่ตั้ง thumbnail ไม่ได้: ${e instanceof Error ? e.message : String(e)}`
        }
      }
      if (opts.playlistId) {
        try {
          await addToPlaylist(videoId, opts.playlistId, token)
        } catch (e) {
          const msg = `อัปคลิปสำเร็จ แต่เพิ่มเข้า playlist ไม่ได้: ${e instanceof Error ? e.message : String(e)}`
          warning = warning ? `${warning}; ${msg}` : msg
        }
      }
      return { success: true, videoId, warning }
    } catch (err) {
      const quotaExceeded = !!(err as { quotaExceeded?: boolean })?.quotaExceeded
      return {
        success: false,
        quotaExceeded,
        canceled: cancelUploadRequested,
        error: err instanceof Error ? err.message : String(err)
      }
    }
  })
}
