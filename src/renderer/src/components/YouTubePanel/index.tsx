import { useState, useEffect, useCallback, useRef, type JSX, type CSSProperties } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VideoFile {
  path: string
  name: string
  chapterNum: number | null
  title: string
  description: string
  titleEdited: boolean
  descEdited: boolean
  expanded: boolean
  selected: boolean
  status: null | 'uploading' | 'ok' | 'error' | 'skipped'
  videoId?: string
  errorMsg?: string
  // True when this clip was matched against a video already on the channel
  // (vs. uploaded in this session). Both are skipped on (re)upload.
  existing?: boolean
}

// Title YouTube actually stores (we send title.slice(0,100)); normalized for
// matching local clips against what's already on the channel.
function normTitle(t: string): string {
  return t.slice(0, 100).trim().toLowerCase()
}

// Marks a clip as already-on-channel when its title matches an uploaded video.
// Idempotent and reversible: editing a title so it no longer matches clears the
// 'existing' mark; never touches an in-flight or in-session-uploaded clip.
function applyMatch(f: VideoFile, map: Map<string, string>): VideoFile {
  if (f.status === 'uploading') return f
  const vid = map.get(normTitle(f.title))
  if (vid) {
    if (f.status === 'ok' && f.existing && f.videoId === vid) return f
    return { ...f, status: 'ok', existing: true, videoId: vid }
  }
  // No match: clear a stale "existing" mark, but leave in-session 'ok' alone.
  if (f.existing) return { ...f, status: null, existing: false, videoId: undefined }
  return f
}

interface YouTubePanelProps {
  onClose: () => void
}

// Default daily quota (10,000) / videos.insert cost (1,600) ≈ 6 uploads/session.
const SESSION_UPLOAD_CAP = 6

// Default video title = the clip's filename without extension ({filename}). The
// old default was '{novel} บทที่ {n}'; we migrate that one legacy value so saved
// configs adopt the new behavior, while leaving any other customized template be.
const DEFAULT_TITLE_TEMPLATE = '{filename}'
const LEGACY_TITLE_TEMPLATE = '{novel} บทที่ {n}'

// ─── Utilities (shared shape with ReadRealmPanel) ───────────────────────────────

function naturalKey(name: string): (number | string)[] {
  return name.split(/(\d+)/).map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : s.toLowerCase()))
}

function extractChapterNum(name: string): number | null {
  const m = name.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

function naturalSort<T extends { name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    const ka = naturalKey(a.name)
    const kb = naturalKey(b.name)
    for (let i = 0; i < Math.max(ka.length, kb.length); i++) {
      const av = ka[i] ?? 0
      const bv = kb[i] ?? 0
      if (av < bv) return -1
      if (av > bv) return 1
    }
    return 0
  })
}

// publishAt: start time + idx * interval, as ISO with whole seconds (YouTube wants RFC3339).
function computePublishAt(idx: number, scheduleFrom: string, intervalHrs: number): string {
  const base = new Date(scheduleFrom)
  const dt = new Date(base.getTime() + idx * intervalHrs * 3_600_000)
  return dt.toISOString().replace(/\.\d{3}Z$/, '.000Z')
}

const TH_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.'
]

function formatThDate(utcIso: string): string {
  const d = new Date(utcIso)
  const th = new Date(d.getTime() + 7 * 3_600_000)
  return `${th.getUTCDate()} ${TH_MONTHS[th.getUTCMonth()]} ${String(th.getUTCHours()).padStart(2, '0')}:${String(th.getUTCMinutes()).padStart(2, '0')}`
}

// YouTube can't add real playlist cards via its API, so we drive viewers to the
// full playlist by appending this link line to each clip's description instead.
const PLAYLIST_LINK_LABEL = '▶ ฟังต่อทั้งเรื่อง (เพลย์ลิสต์):'

function playlistUrl(id: string): string {
  return `https://www.youtube.com/playlist?list=${id}`
}

// Returns the description actually sent to YouTube: the base description plus the
// playlist link line when enabled and a playlist is selected. Built fresh at
// send time (not stored in state) so re-uploads never double-append the link.
function descriptionWithPlaylistLink(base: string, playlistId: string, enabled: boolean): string {
  if (!enabled || !playlistId) return base
  const linkLine = `${PLAYLIST_LINK_LABEL} ${playlistUrl(playlistId)}`
  return base.trim() ? `${base.trimEnd()}\n\n${linkLine}` : linkLine
}

function applyTemplate(
  tpl: string,
  vars: { novel: string; n: number | null; filename: string }
): string {
  return tpl
    .replace(/\{novel\}/g, vars.novel)
    .replace(/\{n\}/g, vars.n != null ? String(vars.n) : '')
    .replace(/\{filename\}/g, vars.filename)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function YouTubePanel({ onClose }: YouTubePanelProps): JSX.Element {
  // Auth / credentials
  const [authStatus, setAuthStatus] = useState<'checking' | 'connected' | 'needs-setup'>('checking')
  const [channelTitle, setChannelTitle] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [authError, setAuthError] = useState('')

  // Folder & files
  const [folder, setFolder] = useState('')
  const [files, setFiles] = useState<VideoFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  // Global metadata
  const [novelName, setNovelName] = useState('')
  const [titleTemplate, setTitleTemplate] = useState(DEFAULT_TITLE_TEMPLATE)
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')
  const [categoryId, setCategoryId] = useState('22')
  const [playlists, setPlaylists] = useState<Array<{ id: string; title: string }>>([])
  const [playlistId, setPlaylistId] = useState('')
  const [useThumbnail, setUseThumbnail] = useState(true)
  const [thumbnailPath, setThumbnailPath] = useState('')
  const [appendPlaylistLink, setAppendPlaylistLink] = useState(true)

  // Schedule
  const [scheduleFrom, setScheduleFrom] = useState('')
  const [intervalHrs, setIntervalHrs] = useState(24)

  // Upload
  const [uploading, setUploading] = useState(false)
  const [uploadLog, setUploadLog] = useState<string[]>([])
  const [progress, setProgress] = useState<{ fileName: string; filePercent: number } | null>(null)
  const cancelRef = useRef(false)
  const logRef = useRef<HTMLDivElement>(null)
  const configReady = useRef(false)

  // Channel dedup: normalizedTitle → videoId of videos already on the channel.
  // Held in a ref so loadFilesFromFolder/regen (useCallback/effect) can read the
  // latest map without being recreated by it.
  const uploadedMapRef = useRef<Map<string, string>>(new Map())
  const [checkingUploaded, setCheckingUploaded] = useState(false)

  // ── Load config on mount ──────────────────────────────────────────────────
  useEffect(() => {
    let canceled = false
    ;(async () => {
      try {
        const cfg = await window.electron.getEnvConfig()
        if (canceled) return
        setClientId(cfg.youtubeClientId || '')
        setFolder(cfg.youtubeFolder || '')
        setNovelName(cfg.youtubeNovelName || cfg.mp4FilenamePrefix || '')
        setTitleTemplate(
          !cfg.youtubeTitleTemplate || cfg.youtubeTitleTemplate === LEGACY_TITLE_TEMPLATE
            ? DEFAULT_TITLE_TEMPLATE
            : cfg.youtubeTitleTemplate
        )
        setDescription(cfg.youtubeDescription || '')
        setTags(cfg.youtubeTags || '')
        setCategoryId(cfg.youtubeCategoryId || '22')
        setPlaylistId(cfg.youtubePlaylistId || '')
        setIntervalHrs(cfg.youtubeIntervalHrs || 24)
        setAppendPlaylistLink(cfg.youtubeAppendPlaylistLink ?? true)
        setThumbnailPath(cfg.mp4ImagePath || '')
        configReady.current = true

        const status = await window.electron.youtubeStatus()
        if (canceled) return
        if (status.connected) {
          setAuthStatus('connected')
          setChannelTitle(status.channelTitle || '')
          loadPlaylists()
          loadUploaded()
        } else {
          setAuthStatus('needs-setup')
          if (status.error) setAuthError(status.error)
        }
      } catch {
        if (!canceled) setAuthStatus('needs-setup')
      }
    })()
    return () => {
      canceled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Persist global metadata (debounced via effect deps) ─────────────────────
  useEffect(() => {
    if (!configReady.current) return
    window.electron
      .saveConfigPatch({
        youtubeClientId: clientId,
        youtubeFolder: folder,
        youtubeNovelName: novelName,
        youtubeTitleTemplate: titleTemplate,
        youtubeDescription: description,
        youtubeTags: tags,
        youtubeCategoryId: categoryId,
        youtubePlaylistId: playlistId,
        youtubeIntervalHrs: intervalHrs,
        youtubeAppendPlaylistLink: appendPlaylistLink
      })
      .catch(() => {})
  }, [
    clientId,
    folder,
    novelName,
    titleTemplate,
    description,
    tags,
    categoryId,
    playlistId,
    intervalHrs,
    appendPlaylistLink
  ])

  // ── Auto-load files when folder set ─────────────────────────────────────────
  useEffect(() => {
    if (folder) loadFilesFromFolder(folder)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder])

  // ── Regenerate non-edited titles/descriptions when templates change ─────────
  // Re-run the channel match too, since changing the title changes what matches.
  useEffect(() => {
    setFiles((prev) =>
      prev.map((f) => {
        const vars = {
          novel: novelName,
          n: f.chapterNum,
          filename: f.name.replace(/\.(mp4|mov)$/i, '')
        }
        const next = {
          ...f,
          title: f.titleEdited ? f.title : applyTemplate(titleTemplate, vars),
          description: f.descEdited ? f.description : applyTemplate(description, vars)
        }
        return applyMatch(next, uploadedMapRef.current)
      })
    )
  }, [titleTemplate, description, novelName])

  // ── Scroll log ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [uploadLog])

  // ── Upload byte-progress events ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (_e: unknown, payload: unknown): void => {
      const p = payload as { fileName: string; filePercent: number }
      setProgress({ fileName: p.fileName, filePercent: p.filePercent })
    }
    window.electron.on('youtube:progress', handler)
    return () => window.electron.off('youtube:progress', handler)
  }, [])

  // ── Channel dedup: fetch already-uploaded videos and mark matching clips ────
  const loadUploaded = useCallback(async () => {
    setCheckingUploaded(true)
    try {
      const res = await window.electron.youtubeListUploaded()
      if (!res.success || !res.data) return
      const map = new Map<string, string>()
      for (const v of res.data) map.set(normTitle(v.title), v.videoId)
      uploadedMapRef.current = map
      setFiles((prev) => prev.map((f) => applyMatch(f, map)))
    } finally {
      setCheckingUploaded(false)
    }
  }, [])

  // ── Playlists ─────────────────────────────────────────────────────────────
  const loadPlaylists = useCallback(async () => {
    const res = await window.electron.youtubeListPlaylists()
    if (res.success && res.data) setPlaylists(res.data)
  }, [])

  // ── Load .mp4 files from folder ─────────────────────────────────────────────
  const loadFilesFromFolder = useCallback(
    async (dir: string) => {
      setLoadingFiles(true)
      setFiles([])
      try {
        const tree = await window.electron.readTree(dir)
        const vids = tree.filter((n) => n.type === 'file' && /\.(mp4|mov)$/i.test(n.name))
        const items: VideoFile[] = vids.map((n) => {
          const chapterNum = extractChapterNum(n.name)
          const vars = {
            novel: novelName,
            n: chapterNum,
            filename: n.name.replace(/\.(mp4|mov)$/i, '')
          }
          return {
            path: n.path,
            name: n.name,
            chapterNum,
            title: applyTemplate(titleTemplate, vars),
            description: applyTemplate(description, vars),
            titleEdited: false,
            descEdited: false,
            expanded: false,
            selected: true,
            status: null
          }
        })
        const map = uploadedMapRef.current
        setFiles(naturalSort(items).map((f) => applyMatch(f, map)))
      } catch {
        // Folder not accessible (deleted, or not yet path-approved) — show empty.
        setFiles([])
      } finally {
        setLoadingFiles(false)
      }
    },
    [novelName, titleTemplate, description]
  )

  // ── Browse handlers ─────────────────────────────────────────────────────────
  const handleBrowseFolder = useCallback(async () => {
    const dir = await window.electron.openFolder()
    if (dir) setFolder(dir)
  }, [])

  const handleBrowseThumbnail = useCallback(async () => {
    const p = await window.electron.openFile([
      { name: 'Image', extensions: ['jpg', 'jpeg', 'png'] }
    ])
    if (p) setThumbnailPath(p)
  }, [])

  // ── Credentials / connect ────────────────────────────────────────────────────
  const handleConnect = useCallback(async () => {
    if (!clientId.trim()) {
      setAuthError('กรอก Client ID ก่อน')
      return
    }
    setConnecting(true)
    setAuthError('')
    try {
      // Persist client_id (non-secret) and store the secret in the keychain.
      await window.electron.saveConfigPatch({ youtubeClientId: clientId.trim() })
      if (clientSecret.trim()) {
        const s = await window.electron.youtubeSaveSecret({ clientSecret: clientSecret.trim() })
        if (!s.success) throw new Error(s.error || 'บันทึก secret ไม่สำเร็จ')
      }
      const res = await window.electron.youtubeConnect()
      if (res.success) {
        setAuthStatus('connected')
        setChannelTitle(res.channelTitle || '')
        setClientSecret('')
        loadPlaylists()
        loadUploaded()
      } else {
        setAuthError(res.error || 'เชื่อมต่อไม่สำเร็จ')
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }, [clientId, clientSecret, loadPlaylists, loadUploaded])

  const handleDisconnect = useCallback(async () => {
    await window.electron.youtubeDisconnect()
    setAuthStatus('needs-setup')
    setChannelTitle('')
    setPlaylists([])
  }, [])

  // ── Selection helpers ─────────────────────────────────────────────────────
  const selectedFiles = files.filter((f) => f.selected)
  const allSelected = files.length > 0 && files.every((f) => f.selected)
  const handleToggleAll = useCallback(() => {
    setFiles((prev) => prev.map((f) => ({ ...f, selected: !allSelected })))
  }, [allSelected])

  // Clips that will actually upload (selected and not already on the channel /
  // uploaded this session) vs. those skipped because they already exist.
  const toUploadCount = files.filter((f) => f.selected && f.status !== 'ok').length
  const existingCount = files.filter((f) => f.existing).length

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (authStatus !== 'connected' || uploading) return
    // Exclude clips already uploaded this session — YouTube has no dedup, so a
    // re-run would create duplicate videos and burn ~1600 quota units each.
    const selected = files.filter((f) => f.selected && f.status !== 'ok')
    if (selected.length === 0) return

    // YouTube rejects publishAt in the past — block before burning any quota.
    if (scheduleFrom && new Date(scheduleFrom).getTime() <= Date.now()) {
      setUploadLog(['✗ เวลาเผยแพร่ต้องเป็นอนาคต — แก้เวลาเริ่มก่อน'])
      return
    }

    cancelRef.current = false
    setUploading(true)
    setUploadLog([])
    setProgress(null)
    // Reset only the clips we're about to (re)try; keep 'ok' markers intact.
    setFiles((prev) =>
      prev.map((f) =>
        f.selected && f.status !== 'ok' ? { ...f, status: null, errorMsg: undefined } : f
      )
    )

    const tagList = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    let uploadedThisSession = 0

    for (let i = 0; i < selected.length; i++) {
      if (cancelRef.current) {
        setUploadLog((prev) => [...prev, '■ ยกเลิกแล้ว'])
        break
      }
      const file = selected[i]

      if (uploadedThisSession >= SESSION_UPLOAD_CAP) {
        setFiles((prev) =>
          prev.map((f) =>
            f.path === file.path
              ? { ...f, status: 'skipped', errorMsg: 'เกินโควต้า/วัน — อัปต่อพรุ่งนี้' }
              : f
          )
        )
        setUploadLog((prev) => [
          ...prev,
          `▷ ข้าม ${file.name} (เกินโควต้า ${SESSION_UPLOAD_CAP}/วัน)`
        ])
        continue
      }

      setFiles((prev) =>
        prev.map((f) => (f.path === file.path ? { ...f, status: 'uploading' } : f))
      )
      setProgress({ fileName: file.name, filePercent: 0 })

      const scheduled = !!scheduleFrom
      const privacyStatus: 'public' | 'private' = scheduled ? 'private' : 'public'
      const publishAt = scheduled ? computePublishAt(i, scheduleFrom, intervalHrs) : undefined

      try {
        const res = await window.electron.youtubeUploadVideo({
          videoPath: file.path,
          title: file.title,
          description: descriptionWithPlaylistLink(
            file.description,
            playlistId,
            appendPlaylistLink
          ),
          tags: tagList,
          categoryId,
          privacyStatus,
          publishAt,
          defaultLanguage: 'th',
          playlistId: playlistId || undefined,
          thumbnailPath: useThumbnail && thumbnailPath ? thumbnailPath : undefined
        })

        if (res.success) {
          uploadedThisSession++
          setFiles((prev) =>
            prev.map((f) =>
              f.path === file.path ? { ...f, status: 'ok', videoId: res.videoId } : f
            )
          )
          setUploadLog((prev) => [
            ...prev,
            `✓ ${file.name}${scheduled ? ` → ${formatThDate(publishAt!)}` : ' (public)'}`,
            ...(res.warning ? [`  ⚠ ${res.warning}`] : [])
          ])
        } else if (res.canceled) {
          setFiles((prev) => prev.map((f) => (f.path === file.path ? { ...f, status: null } : f)))
          setUploadLog((prev) => [...prev, '■ ยกเลิกแล้ว'])
          break
        } else if (res.quotaExceeded) {
          setFiles((prev) =>
            prev.map((f) =>
              f.path === file.path ? { ...f, status: 'error', errorMsg: 'เกินโควต้า YouTube' } : f
            )
          )
          setUploadLog((prev) => [...prev, `✗ ${file.name}: เกินโควต้า YouTube — หยุดรอบนี้`])
          break
        } else {
          setFiles((prev) =>
            prev.map((f) =>
              f.path === file.path ? { ...f, status: 'error', errorMsg: res.error } : f
            )
          )
          setUploadLog((prev) => [...prev, `✗ ${file.name}: ${res.error}`])
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setFiles((prev) =>
          prev.map((f) => (f.path === file.path ? { ...f, status: 'error', errorMsg: msg } : f))
        )
        setUploadLog((prev) => [...prev, `✗ ${file.name}: ${msg}`])
      }
    }

    setProgress(null)
    setUploading(false)
  }, [
    authStatus,
    uploading,
    files,
    tags,
    categoryId,
    playlistId,
    useThumbnail,
    thumbnailPath,
    scheduleFrom,
    intervalHrs,
    appendPlaylistLink
  ])

  const handleCancel = useCallback(() => {
    cancelRef.current = true
    window.electron.cancelYoutubeUpload().catch(() => {})
  }, [])

  // ── Schedule preview ──────────────────────────────────────────────────────
  const previewLines = scheduleFrom
    ? selectedFiles.slice(0, 3).map((f, i) => {
        const dt = computePublishAt(i, scheduleFrom, intervalHrs)
        const label = f.chapterNum != null ? `บท ${f.chapterNum}` : f.name
        return `${label} → ${formatThDate(dt)}`
      })
    : []

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={s.overlay} onClick={() => !uploading && onClose()}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>YouTube Publisher</span>
          <button style={s.closeBtn} onClick={() => !uploading && onClose()}>
            ✕
          </button>
        </div>

        <div style={s.body}>
          {/* Credentials / connection */}
          {authStatus === 'checking' && (
            <div style={s.section}>
              <span style={{ color: 'var(--text2)', fontSize: 12 }}>กำลังตรวจสอบการเชื่อมต่อ…</span>
            </div>
          )}

          {authStatus === 'connected' && (
            <div style={{ ...s.row, gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>
                เชื่อมต่อช่อง <span style={{ color: 'var(--hl-teal)' }}>{channelTitle}</span>
              </span>
              <button style={s.linkBtn} onClick={handleDisconnect}>
                ตัดการเชื่อมต่อ
              </button>
            </div>
          )}

          {authStatus === 'needs-setup' && (
            <div style={s.section}>
              <div style={s.label}>Google OAuth Client (Desktop app)</div>
              {authError && <div style={s.errorMsg}>{authError}</div>}
              <input
                style={s.input}
                placeholder="Client ID"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                spellCheck={false}
              />
              <input
                style={s.input}
                type="password"
                placeholder="Client Secret"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                spellCheck={false}
              />
              <button
                style={{ ...s.btn, opacity: connecting ? 0.6 : 1, alignSelf: 'flex-start' }}
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? 'กำลังเปิดเบราว์เซอร์…' : 'เชื่อมต่อ YouTube'}
              </button>
              <div style={s.hint}>
                ต้องสร้าง project ใน Google Cloud, เปิด YouTube Data API v3, publish consent screen
                เป็น Production แล้วสร้าง OAuth client ชนิด Desktop
              </div>
            </div>
          )}

          {/* Folder */}
          <div style={s.section}>
            <div style={s.label}>โฟลเดอร์วิดีโอ (.mp4)</div>
            <div style={s.row}>
              <input
                style={{ ...s.input, flex: 1, color: folder ? 'var(--text0)' : 'var(--text2)' }}
                value={folder || 'ยังไม่ได้เลือกโฟลเดอร์'}
                readOnly
              />
              <button style={s.btn} onClick={handleBrowseFolder}>
                Browse
              </button>
            </div>
          </div>

          {/* Global metadata */}
          <div style={s.section}>
            <div style={s.label}>Metadata กลาง</div>
            <div style={s.row}>
              <input
                style={{ ...s.input, flex: 1 }}
                placeholder="ชื่อนิยาย ({novel})"
                value={novelName}
                onChange={(e) => setNovelName(e.target.value)}
              />
              <input
                style={{ ...s.input, width: 70 }}
                placeholder="หมวด"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value.replace(/\D/g, ''))}
                title="categoryId: 22=People&Blogs, 24=Entertainment, 1=Film&Animation"
              />
            </div>
            <input
              style={s.input}
              placeholder="Title template — {filename} (ชื่อไฟล์), {novel}, {n}"
              value={titleTemplate}
              onChange={(e) => setTitleTemplate(e.target.value)}
              spellCheck={false}
            />
            <textarea
              style={s.textarea}
              rows={2}
              placeholder="Description กลาง (ใช้เป็น default ทุกคลิป) — ใช้ {novel} {n} ได้"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <input
              style={s.input}
              placeholder="Tags คั่นด้วย , (เช่น นิยาย, อ่านนิยาย, audiobook)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <div style={s.row}>
              <select
                style={{ ...s.select, flex: 1 }}
                value={playlistId}
                onChange={(e) => setPlaylistId(e.target.value)}
                disabled={authStatus !== 'connected'}
              >
                <option value="">— ไม่เพิ่มเข้า playlist —</option>
                {playlists.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
            <label style={{ ...s.checkRow, opacity: playlistId ? 1 : 0.5 }}>
              <input
                type="checkbox"
                checked={appendPlaylistLink}
                disabled={!playlistId}
                onChange={(e) => setAppendPlaylistLink(e.target.checked)}
              />
              แปะลิงก์เพลย์ลิสต์ท้าย description (แทนการ์ด)
            </label>
            {appendPlaylistLink && playlistId && (
              <div style={s.preview}>
                {PLAYLIST_LINK_LABEL} {playlistUrl(playlistId)}
              </div>
            )}
            <label style={s.checkRow}>
              <input
                type="checkbox"
                checked={useThumbnail}
                onChange={(e) => setUseThumbnail(e.target.checked)}
              />
              ใช้รูปปกเป็น thumbnail
            </label>
            {useThumbnail && (
              <div style={s.row}>
                <input
                  style={{
                    ...s.input,
                    flex: 1,
                    color: thumbnailPath ? 'var(--text0)' : 'var(--text2)'
                  }}
                  value={thumbnailPath || 'ยังไม่ได้เลือกรูป'}
                  readOnly
                />
                <button style={s.btn} onClick={handleBrowseThumbnail}>
                  Browse
                </button>
              </div>
            )}
          </div>

          {/* File list */}
          {folder && (
            <div style={s.section}>
              <div style={{ ...s.row, marginBottom: 6 }}>
                <div style={s.label}>
                  วิดีโอ ({selectedFiles.length}/{files.length} เลือก
                  {existingCount > 0 ? ` · ☁ ${existingCount} อยู่บนช่องแล้ว` : ''})
                </div>
                <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
                  {authStatus === 'connected' && (
                    <button
                      style={s.linkBtn}
                      onClick={loadUploaded}
                      disabled={checkingUploaded}
                      title="ดึงรายการวิดีโอบนช่องมาเทียบ เพื่อกันอัปซ้ำ"
                    >
                      {checkingUploaded ? 'กำลังตรวจ…' : '↻ ตรวจกับช่อง'}
                    </button>
                  )}
                  {files.length > 0 && (
                    <button style={s.linkBtn} onClick={handleToggleAll}>
                      {allSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                    </button>
                  )}
                </div>
              </div>
              <div style={s.fileList}>
                {loadingFiles && <div style={s.emptyRow}>กำลังโหลดไฟล์…</div>}
                {!loadingFiles && files.length === 0 && (
                  <div style={s.emptyRow}>ไม่พบไฟล์ .mp4 ในโฟลเดอร์นี้</div>
                )}
                {!loadingFiles &&
                  files.map((f, idx) => (
                    <div key={f.path} style={{ ...s.fileRow, opacity: f.selected ? 1 : 0.45 }}>
                      <div style={s.fileRowMain}>
                        <input
                          type="checkbox"
                          checked={f.selected}
                          onChange={() =>
                            setFiles((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, selected: !x.selected } : x))
                            )
                          }
                          style={{ cursor: 'pointer', flexShrink: 0 }}
                        />
                        {f.chapterNum != null && <span style={s.chBadge}>{f.chapterNum}</span>}
                        <input
                          style={s.titleInput}
                          value={f.title}
                          onChange={(e) =>
                            setFiles((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, title: e.target.value, titleEdited: true } : x
                              )
                            )
                          }
                        />
                        <button
                          style={s.expandBtn}
                          title="แก้คำอธิบายคลิปนี้"
                          onClick={() =>
                            setFiles((prev) =>
                              prev.map((x, i) => (i === idx ? { ...x, expanded: !x.expanded } : x))
                            )
                          }
                        >
                          {f.expanded ? '▾' : '▸'}
                        </button>
                        {f.status === 'uploading' && (
                          <span style={{ color: 'var(--accent)' }}>↑</span>
                        )}
                        {f.status === 'ok' && f.existing && (
                          <span style={{ color: 'var(--hl-teal)' }} title="อยู่บนช่องแล้ว — จะข้าม">
                            ☁
                          </span>
                        )}
                        {f.status === 'ok' && !f.existing && (
                          <span style={{ color: 'var(--hl-teal)' }} title="อัปสำเร็จ">
                            ✓
                          </span>
                        )}
                        {f.status === 'skipped' && (
                          <span style={{ color: 'var(--hl-gold)' }} title={f.errorMsg}>
                            ⏸
                          </span>
                        )}
                        {f.status === 'error' && (
                          <span style={{ color: 'var(--hl-red)' }} title={f.errorMsg}>
                            ✗
                          </span>
                        )}
                      </div>
                      {f.expanded && (
                        <textarea
                          style={{ ...s.textarea, marginTop: 4 }}
                          rows={2}
                          value={f.description}
                          placeholder="คำอธิบายเฉพาะคลิปนี้"
                          onChange={(e) =>
                            setFiles((prev) =>
                              prev.map((x, i) =>
                                i === idx
                                  ? { ...x, description: e.target.value, descEdited: true }
                                  : x
                              )
                            )
                          }
                        />
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Schedule */}
          <div style={s.section}>
            <div style={s.label}>ตั้งเวลาเผยแพร่ (เว้นว่าง = public ทันที)</div>
            <div style={s.row}>
              <input
                style={s.input}
                type="datetime-local"
                value={scheduleFrom}
                onChange={(e) => setScheduleFrom(e.target.value)}
              />
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>ทุก</span>
              <input
                style={{ ...s.input, width: 64 }}
                type="number"
                min={1}
                value={intervalHrs}
                onChange={(e) => setIntervalHrs(Number(e.target.value) || 24)}
              />
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>ชม.</span>
            </div>
            {previewLines.length > 0 && (
              <div style={s.preview}>
                {previewLines.join(' | ')}
                {selectedFiles.length > 3 && ` | …+${selectedFiles.length - 3}`}
              </div>
            )}
          </div>

          {/* Quota warning */}
          {toUploadCount > SESSION_UPLOAD_CAP && (
            <div style={s.warnMsg}>
              จะอัป {toUploadCount} คลิป แต่โควต้าอัปได้ ~{SESSION_UPLOAD_CAP}/วัน —
              ส่วนที่เกินจะถูกข้ามไว้อัปวันถัดไป (เปิดใหม่แล้วกดอัปต่อได้ ไม่ซ้ำ)
            </div>
          )}

          {/* Progress */}
          {progress && uploading && (
            <div style={s.progressCard}>
              <div style={s.progressHeader}>
                <span style={s.progressName}>{progress.fileName}</span>
                <span>{progress.filePercent}%</span>
              </div>
              <div style={s.progressTrack}>
                <div style={{ ...s.progressFill, width: `${progress.filePercent}%` }} />
              </div>
            </div>
          )}

          {/* Log */}
          {uploadLog.length > 0 && (
            <div ref={logRef} style={s.log}>
              {uploadLog.map((line, i) => (
                <div
                  key={i}
                  style={{
                    color: line.startsWith('✓')
                      ? 'var(--hl-teal)'
                      : line.startsWith('✗')
                        ? 'var(--hl-red)'
                        : 'var(--text2)'
                  }}
                >
                  {line}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          {uploading ? (
            <button style={s.closeFooterBtn} onClick={handleCancel}>
              ยกเลิก
            </button>
          ) : (
            <button style={s.closeFooterBtn} onClick={onClose}>
              ปิด
            </button>
          )}
          <button
            style={{
              ...s.uploadBtn,
              opacity: authStatus !== 'connected' || toUploadCount === 0 || uploading ? 0.5 : 1
            }}
            onClick={handleUpload}
            disabled={authStatus !== 'connected' || toUploadCount === 0 || uploading}
          >
            {uploading ? 'กำลังอัป…' : `อัป ${toUploadCount} คลิป`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modal: {
    background: 'var(--bg1)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    width: 700,
    maxWidth: '95vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0
  },
  title: {
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--hl-red, #f87171)'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text2)',
    fontSize: 14,
    cursor: 'pointer',
    padding: '2px 6px'
  },
  body: {
    overflowY: 'auto',
    flex: 1,
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text2)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  checkRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--text1)',
    cursor: 'pointer'
  },
  input: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    color: 'var(--text0)',
    fontSize: 12,
    padding: '5px 8px',
    borderRadius: 4,
    outline: 'none',
    fontFamily: 'var(--font-mono)'
  },
  select: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    color: 'var(--text0)',
    fontSize: 12,
    padding: '5px 8px',
    borderRadius: 4,
    outline: 'none',
    cursor: 'pointer'
  },
  textarea: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    color: 'var(--text0)',
    fontSize: 12,
    padding: '6px 8px',
    borderRadius: 4,
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
    width: '100%',
    boxSizing: 'border-box'
  },
  btn: {
    background: 'var(--accent)',
    border: 'none',
    color: '#fff',
    fontSize: 12,
    padding: '5px 12px',
    borderRadius: 4,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontWeight: 500
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    fontSize: 11,
    cursor: 'pointer',
    padding: 0,
    textDecoration: 'underline'
  },
  hint: { fontSize: 11, color: 'var(--text3, var(--text2))' },
  fileList: {
    border: '1px solid var(--border)',
    borderRadius: 4,
    maxHeight: 240,
    overflowY: 'auto',
    background: 'var(--bg0)'
  },
  fileRow: { padding: '5px 10px', borderBottom: '1px solid var(--border)', fontSize: 12 },
  fileRowMain: { display: 'flex', alignItems: 'center', gap: 8 },
  emptyRow: { padding: '12px 0', color: 'var(--text2)', fontSize: 12, textAlign: 'center' },
  chBadge: {
    background: 'var(--bg3)',
    color: 'var(--text2)',
    fontSize: 10,
    padding: '1px 5px',
    borderRadius: 99,
    fontFamily: 'var(--font-mono)',
    minWidth: 28,
    textAlign: 'center',
    flexShrink: 0
  },
  titleInput: {
    flex: 1,
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid transparent',
    color: 'var(--text0)',
    fontSize: 12,
    padding: '1px 2px',
    outline: 'none',
    minWidth: 0
  },
  expandBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text2)',
    cursor: 'pointer',
    fontSize: 11,
    flexShrink: 0,
    padding: '0 2px'
  },
  preview: {
    fontSize: 11,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    background: 'var(--bg0)',
    padding: '5px 8px',
    borderRadius: 4,
    border: '1px solid var(--border)'
  },
  warnMsg: {
    fontSize: 11,
    color: 'var(--hl-gold)',
    background: 'var(--hl-gold-bg, rgba(212,160,23,0.1))',
    border: '1px solid var(--hl-gold-border, rgba(212,160,23,0.3))',
    borderRadius: 4,
    padding: '6px 8px'
  },
  errorMsg: {
    fontSize: 11,
    color: 'var(--hl-red, #f87171)',
    background: 'rgba(248,113,113,0.08)',
    border: '1px solid rgba(248,113,113,0.2)',
    borderRadius: 4,
    padding: '5px 8px'
  },
  progressCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '8px 10px',
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--bg2)'
  },
  progressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 11,
    color: 'var(--text1)'
  },
  progressName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 520
  },
  progressTrack: { height: 6, borderRadius: 999, background: 'var(--bg3)', overflow: 'hidden' },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    background: 'var(--accent)',
    transition: 'width 0.2s ease'
  },
  log: {
    background: 'var(--bg0)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '8px 10px',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    maxHeight: 200,
    minHeight: 60,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 2
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '10px 16px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0
  },
  closeFooterBtn: {
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    color: 'var(--text1)',
    fontSize: 12,
    padding: '6px 16px',
    borderRadius: 4,
    cursor: 'pointer'
  },
  uploadBtn: {
    background: 'var(--accent)',
    border: 'none',
    color: '#fff',
    fontSize: 12,
    padding: '6px 20px',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 600
  }
}
