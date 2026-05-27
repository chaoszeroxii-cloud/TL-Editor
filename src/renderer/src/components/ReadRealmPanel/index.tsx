import { useState, useEffect, useCallback, useRef, type JSX, type CSSProperties } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface FileItem {
  path: string
  name: string
  chapterNum: number | null
  title: string
  selected: boolean
  status: null | 'uploading' | 'ok' | 'error'
  errorMsg?: string
}

interface ReadRealmPanelProps {
  onClose: () => void
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function naturalKey(name: string): (number | string)[] {
  return name.split(/(\d+)/).map((s) => (/^\d+$/.test(s) ? parseInt(s, 10) : s.toLowerCase()))
}

function extractChapterNum(name: string): number | null {
  const m = name.match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

function naturalSort(files: FileItem[]): FileItem[] {
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

function txtToHtml(text: string): string {
  return text
    .trim()
    .split('\n')
    .map((line) => {
      line = line.trim()
      if (!line) return '<p>&nbsp;</p>'
      return `<p>${line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')} &nbsp;</p>`
    })
    .join('')
}

function computePublishDatetime(idx: number, scheduleFrom: string, intervalHrs: number): string {
  if (!scheduleFrom) return new Date().toISOString().replace(/\.\d{3}Z$/, '.000Z')
  const base = new Date(scheduleFrom)
  const dt = new Date(base.getTime() + idx * intervalHrs * 3_600_000)
  return dt.toISOString().replace(/\.\d{3}Z$/, '.000Z')
}

const TH_MONTHS = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']

function formatThDate(utcIso: string): string {
  const d = new Date(utcIso)
  const th = new Date(d.getTime() + 7 * 3_600_000)
  return `${th.getUTCDate()} ${TH_MONTHS[th.getUTCMonth()]} ${String(th.getUTCHours()).padStart(2, '0')}:${String(th.getUTCMinutes()).padStart(2, '0')}`
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ReadRealmPanel({ onClose }: ReadRealmPanelProps): JSX.Element {
  // Credentials
  const [authStatus, setAuthStatus] = useState<'checking' | 'ok' | 'needs-setup'>('checking')
  const [savedUsername, setSavedUsername] = useState('')
  const [credUsername, setCredUsername] = useState('')
  const [credPassword, setCredPassword] = useState('')
  const [savingCreds, setSavingCreds] = useState(false)
  const [credError, setCredError] = useState('')

  // Novels
  const [novels, setNovels] = useState<_RRNovel[]>([])
  const [novelId, setNovelId] = useState('')
  const [loadingNovels, setLoadingNovels] = useState(false)

  // Chapter map (novelId → chapterNum → chapter_ID) for create/update detection
  const [chapterMap, setChapterMap] = useState<Map<number, string>>(new Map())
  const [loadingChapters, setLoadingChapters] = useState(false)
  const [chaptersDebug, setChaptersDebug] = useState('')

  // Folder & files
  const [folder, setFolder] = useState('')
  const [files, setFiles] = useState<FileItem[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)

  // Schedule
  const [scheduleFrom, setScheduleFrom] = useState('')
  const [intervalHrs, setIntervalHrs] = useState(24)

  // Coin
  const [autoCoin, setAutoCoin] = useState(false)
  const [coinPrice, setCoinPrice] = useState(1)

  // Note
  const [note, setNote] = useState('')

  // Upload
  const [uploading, setUploading] = useState(false)
  const [uploadLog, setUploadLog] = useState<string[]>([])
  const [uploadError, setUploadError] = useState('')

  const logRef = useRef<HTMLDivElement>(null)

  // ── Load config on mount ────────────────────────────────────────────────────
  useEffect(() => {
    let canceled = false
    ;(async () => {
      try {
        const cfg = await window.electron.getEnvConfig()
        if (canceled) return
        if (cfg.readrealmFolder) setFolder(cfg.readrealmFolder)
        if (cfg.readrealmNote) setNote(cfg.readrealmNote)
        if (cfg.readrealmNovelId) setNovelId(cfg.readrealmNovelId)
        if (cfg.readrealmUsername) setSavedUsername(cfg.readrealmUsername)

        // Check token
        const tokenRes = await window.electron.readrealmGetToken()
        if (canceled) return
        if (tokenRes.success) {
          setAuthStatus('ok')
          fetchNovels()
        } else {
          setAuthStatus('needs-setup')
          setCredError(tokenRes.error ?? '')
        }
      } catch {
        if (!canceled) setAuthStatus('needs-setup')
      }
    })()
    return () => { canceled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Fetch chapters when novel selected ───────────────────────────────────────
  useEffect(() => {
    if (authStatus === 'ok') fetchChapters(novelId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novelId, authStatus])

  // ── Auto-load files when folder set ─────────────────────────────────────────
  useEffect(() => {
    if (!folder) return
    loadFilesFromFolder(folder)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder])

  // ── Scroll log to bottom ─────────────────────────────────────────────────────
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [uploadLog])

  // ── Fetch novels ─────────────────────────────────────────────────────────────
  const fetchNovels = useCallback(async () => {
    setLoadingNovels(true)
    try {
      const res = await window.electron.readrealmGetNovels()
      if (res.success && res.data) {
        setNovels(res.data.data)
        if (res.data.data.length === 1) {
          setNovelId((prev) => prev || res.data!.data[0].novel_ID)
        }
      }
    } finally {
      setLoadingNovels(false)
    }
  }, [])

  // ── Fetch existing chapters for create/update detection ──────────────────────
  const fetchChapters = useCallback(async (id: string) => {
    if (!id) { setChapterMap(new Map()); setChaptersDebug(''); return }
    setLoadingChapters(true)
    setChaptersDebug('')
    try {
      const res = await window.electron.readrealmGetChapters({ novelId: id })
      if (!res.success) { setChaptersDebug(`Error: ${res.error}`); return }
      const items = res.data?.data ?? []
      const map = new Map<number, string>()
      for (const ch of items) {
        const num = extractChapterNum(ch.novel_chapter_title)
        if (num !== null) map.set(num, ch.novel_chapter_ID)
      }
      setChapterMap(map)
      setChaptersDebug(`พบ ${map.size}/${items.length} ตอนใน ReadRealm`)
    } catch (err) {
      setChaptersDebug(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoadingChapters(false)
    }
  }, [])

  // ── Load files from folder ───────────────────────────────────────────────────
  const loadFilesFromFolder = useCallback(async (dir: string) => {
    setLoadingFiles(true)
    setFiles([])
    try {
      const tree = await window.electron.readTree(dir)
      const txtPaths = tree
        .filter((n) => n.type === 'file' && n.name.toLowerCase().endsWith('.txt'))
        .map((n) => ({ path: n.path, name: n.name }))

      const items: FileItem[] = await Promise.all(
        txtPaths.map(async ({ path, name }) => {
          let title = name.replace(/\.txt$/i, '')
          try {
            const content = await window.electron.readFile(path)
            const firstLine = content.split('\n').find((l) => l.trim())
            if (firstLine) title = firstLine.trim()
          } catch {
            // keep name as title
          }
          return {
            path,
            name,
            chapterNum: extractChapterNum(name),
            title,
            selected: true,
            status: null
          }
        })
      )
      setFiles(naturalSort(items))
    } finally {
      setLoadingFiles(false)
    }
  }, [])

  // ── Browse folder ────────────────────────────────────────────────────────────
  const handleBrowseFolder = useCallback(async () => {
    const dir = await window.electron.openFolder()
    if (!dir) return
    setFolder(dir)
    window.electron.saveConfigPatch({ readrealmFolder: dir }).catch(() => {})
  }, [])

  // ── Save credentials ─────────────────────────────────────────────────────────
  const handleSaveCredentials = useCallback(async () => {
    if (!credUsername || !credPassword) return
    setSavingCreds(true)
    setCredError('')
    const res = await window.electron.readrealmSaveCredentials({
      username: credUsername,
      password: credPassword
    })
    setSavingCreds(false)
    if (res.success) {
      setSavedUsername(credUsername)
      setCredUsername('')
      setCredPassword('')
      setAuthStatus('ok')
      fetchNovels()
    } else {
      setCredError(res.error ?? 'Login ล้มเหลว')
    }
  }, [credUsername, credPassword, fetchNovels])

  // ── Save novel selection ──────────────────────────────────────────────────────
  const handleNovelChange = useCallback((id: string) => {
    setNovelId(id)
    window.electron.saveConfigPatch({ readrealmNovelId: id }).catch(() => {})
    fetchChapters(id)
  }, [fetchChapters])

  // ── Save note ────────────────────────────────────────────────────────────────
  const handleSaveNote = useCallback(() => {
    window.electron.saveConfigPatch({ readrealmNote: note }).catch(() => {})
  }, [note])

  // ── Toggle all ────────────────────────────────────────────────────────────────
  const allSelected = files.length > 0 && files.every((f) => f.selected)
  const handleToggleAll = useCallback(() => {
    setFiles((prev) => prev.map((f) => ({ ...f, selected: !allSelected })))
  }, [allSelected])

  // ── Upload ────────────────────────────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!novelId || uploading) return
    const selected = files.filter((f) => f.selected)
    if (selected.length === 0) return

    setUploading(true)
    setUploadLog([])
    setUploadError('')
    setFiles((prev) => prev.map((f) => ({ ...f, status: null, errorMsg: undefined })))

    for (let i = 0; i < selected.length; i++) {
      const file = selected[i]

      setFiles((prev) =>
        prev.map((f) => (f.path === file.path ? { ...f, status: 'uploading' } : f))
      )

      try {
        const content = await window.electron.readFile(file.path)
        const html = txtToHtml(content)
        const chapterId =
          file.chapterNum !== null && chapterMap.has(file.chapterNum)
            ? chapterMap.get(file.chapterNum)!
            : '0'
        const price =
          autoCoin && file.chapterNum !== null && file.chapterNum % 2 !== 0 ? coinPrice : 0
        const publishDt = computePublishDatetime(i, scheduleFrom, intervalHrs)

        const res = await window.electron.readrealmUploadChapter({
          novelId,
          chapterId,
          title: file.title,
          content: html,
          price,
          publishDatetime: publishDt,
          note
        })

        if (res.success) {
          setFiles((prev) =>
            prev.map((f) => (f.path === file.path ? { ...f, status: 'ok' } : f))
          )
          setUploadLog((prev) => [...prev, `✓ ${file.name}`])
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
          prev.map((f) =>
            f.path === file.path ? { ...f, status: 'error', errorMsg: msg } : f
          )
        )
        setUploadLog((prev) => [...prev, `✗ ${file.name}: ${msg}`])
      }
    }

    setUploading(false)
  }, [novelId, uploading, files, autoCoin, coinPrice, scheduleFrom, intervalHrs, note])

  // ── Schedule preview ──────────────────────────────────────────────────────────
  const selectedFiles = files.filter((f) => f.selected)
  const previewLines = selectedFiles.slice(0, 3).map((f, i) => {
    const dt = computePublishDatetime(i, scheduleFrom, intervalHrs)
    const label = f.chapterNum != null ? `บท ${f.chapterNum}` : f.name
    return `${label} → ${formatThDate(dt)}`
  })

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.title}>ReadRealm Publisher</span>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={s.body}>
          {/* Credentials */}
          {authStatus === 'checking' && (
            <div style={s.section}>
              <span style={{ color: 'var(--text2)', fontSize: 12 }}>กำลังตรวจสอบ credentials…</span>
            </div>
          )}

          {authStatus === 'ok' && (
            <div style={{ ...s.row, gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text2)' }}>
                Logged in as <span style={{ color: 'var(--hl-teal)' }}>{savedUsername}</span>
              </span>
              <button
                style={s.linkBtn}
                onClick={() => { setAuthStatus('needs-setup'); setCredError('') }}
              >
                เปลี่ยน credentials
              </button>
            </div>
          )}

          {authStatus === 'needs-setup' && (
            <div style={s.section}>
              <div style={s.label}>ReadRealm Credentials</div>
              {credError && <div style={s.errorMsg}>{credError}</div>}
              <div style={s.row}>
                <input
                  style={s.input}
                  placeholder="Username / Email"
                  value={credUsername}
                  onChange={(e) => setCredUsername(e.target.value)}
                />
                <input
                  style={s.input}
                  type="password"
                  placeholder="Password"
                  value={credPassword}
                  onChange={(e) => setCredPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveCredentials()}
                />
                <button
                  style={{ ...s.btn, opacity: savingCreds ? 0.6 : 1 }}
                  onClick={handleSaveCredentials}
                  disabled={savingCreds || !credUsername || !credPassword}
                >
                  {savingCreds ? 'กำลัง Login…' : 'บันทึก & เชื่อมต่อ'}
                </button>
              </div>
            </div>
          )}

          {/* Novel */}
          {authStatus === 'ok' && (
            <div style={s.section}>
              <div style={{ ...s.row, marginBottom: 2, alignItems: 'baseline' }}>
                <div style={s.label}>นิยาย</div>
                {chaptersDebug && !loadingChapters && (
                  <span style={{ fontSize: 10, color: chaptersDebug.startsWith('Error') ? 'var(--hl-red)' : 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
                    {chaptersDebug}
                  </span>
                )}
                {loadingChapters && (
                  <span style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
                    ตรวจตอน…
                  </span>
                )}
              </div>
              <select
                style={s.select}
                value={novelId}
                onChange={(e) => handleNovelChange(e.target.value)}
                disabled={loadingNovels}
              >
                <option value="">{loadingNovels ? 'กำลังโหลด…' : '— เลือกนิยาย —'}</option>
                {novels.map((n) => (
                  <option key={n.novel_ID} value={n.novel_ID}>
                    {n.novel_subject} ({n.novel_chapter_count} ตอน)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Folder */}
          <div style={s.section}>
            <div style={s.label}>โฟลเดอร์ไฟล์</div>
            <div style={s.row}>
              <input
                style={{ ...s.input, flex: 1, color: folder ? 'var(--text0)' : 'var(--text2)' }}
                value={folder || 'ยังไม่ได้เลือกโฟลเดอร์'}
                readOnly
              />
              <button style={s.btn} onClick={handleBrowseFolder}>Browse</button>
            </div>
          </div>

          {/* File list */}
          {folder && (
            <div style={s.section}>
              <div style={{ ...s.row, marginBottom: 6 }}>
                <div style={s.label}>
                  ไฟล์ ({selectedFiles.length}/{files.length} เลือก)
                </div>
                {files.length > 0 && (
                  <button style={s.linkBtn} onClick={handleToggleAll}>
                    {allSelected ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                  </button>
                )}
              </div>

              <div style={s.fileList}>
                {loadingFiles && (
                  <div style={{ padding: '12px 0', color: 'var(--text2)', fontSize: 12 }}>
                    กำลังโหลดไฟล์…
                  </div>
                )}
                {!loadingFiles && files.length === 0 && (
                  <div style={{ padding: '12px 0', color: 'var(--text2)', fontSize: 12 }}>
                    ไม่พบไฟล์ .txt ในโฟลเดอร์นี้
                  </div>
                )}
                {!loadingFiles && files.map((f, idx) => {
                  const isOdd = f.chapterNum !== null && f.chapterNum % 2 !== 0
                  const isPaid = autoCoin && isOdd
                  const existingId = f.chapterNum !== null ? chapterMap.get(f.chapterNum) : undefined
                  const isUpdate = !!existingId
                  return (
                    <div key={f.path} style={{ ...s.fileRow, opacity: f.selected ? 1 : 0.4 }}>
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
                      {f.chapterNum != null && (
                        <span style={s.chBadge}>{f.chapterNum}</span>
                      )}
                      <input
                        style={s.titleInput}
                        value={f.title}
                        onChange={(e) =>
                          setFiles((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x))
                          )
                        }
                      />
                      <span
                        style={{
                          ...s.coinBadge,
                          ...(isUpdate ? s.badgeUpdate : s.badgeNew)
                        }}
                        title={isUpdate ? `แก้ไขตอน (ID: ${existingId})` : 'สร้างตอนใหม่'}
                      >
                        {isUpdate ? '✎' : '+'}
                      </span>
                      <span style={{ ...s.coinBadge, ...(isPaid ? s.coinPaid : s.coinFree) }}>
                        {isPaid ? `💎 ${coinPrice}c` : '🆓'}
                      </span>
                      {f.status === 'uploading' && <span style={{ fontSize: 11, color: 'var(--accent)' }}>↑</span>}
                      {f.status === 'ok' && <span style={{ fontSize: 11, color: 'var(--hl-teal)' }}>✓</span>}
                      {f.status === 'error' && (
                        <span style={{ fontSize: 11, color: 'var(--hl-red)' }} title={f.errorMsg}>✗</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Schedule */}
          <div style={s.section}>
            <div style={s.label}>ตั้งเวลาอัพ</div>
            <div style={s.row}>
              <input
                style={s.input}
                type="datetime-local"
                value={scheduleFrom}
                onChange={(e) => setScheduleFrom(e.target.value)}
              />
              <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>ทุก</span>
              <input
                style={{ ...s.input, width: 64 }}
                type="number"
                min={1}
                value={intervalHrs}
                onChange={(e) => setIntervalHrs(Number(e.target.value) || 24)}
              />
              <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>ชม.</span>
            </div>
            {scheduleFrom && selectedFiles.length > 0 && (
              <div style={s.preview}>
                {previewLines.join(' | ')}
                {selectedFiles.length > 3 && ` | …+${selectedFiles.length - 3}`}
              </div>
            )}
          </div>

          {/* Coin */}
          <div style={s.section}>
            <div style={s.label}>กำหนดเหรียญ</div>
            <div style={s.row}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text1)' }}>
                <input
                  type="checkbox"
                  checked={autoCoin}
                  onChange={(e) => setAutoCoin(e.target.checked)}
                />
                บทคี่ = เสียเหรียญ
              </label>
              {autoCoin && (
                <>
                  <input
                    style={{ ...s.input, width: 64 }}
                    type="number"
                    min={1}
                    value={coinPrice}
                    onChange={(e) => setCoinPrice(Math.max(1, Number(e.target.value) || 1))}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>เหรียญ</span>
                </>
              )}
            </div>
          </div>

          {/* Note */}
          <div style={s.section}>
            <div style={{ ...s.row, marginBottom: 4 }}>
              <div style={s.label}>หมายเหตุท้ายบท</div>
              <button style={s.linkBtn} onClick={handleSaveNote}>บันทึก</button>
            </div>
            <textarea
              style={s.textarea}
              value={note}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              placeholder="หมายเหตุที่จะแสดงท้ายทุกบท"
            />
          </div>

          {/* Upload log */}
          {uploadLog.length > 0 && (
            <div ref={logRef} style={s.log}>
              {uploadLog.map((line, i) => (
                <div key={i} style={{ color: line.startsWith('✓') ? 'var(--hl-teal)' : 'var(--hl-red)' }}>
                  {line}
                </div>
              ))}
            </div>
          )}

          {uploadError && <div style={s.errorMsg}>{uploadError}</div>}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          <button style={s.closeFooterBtn} onClick={onClose} disabled={uploading}>
            ปิด
          </button>
          <button
            style={{
              ...s.uploadBtn,
              opacity: !novelId || selectedFiles.length === 0 || uploading || authStatus !== 'ok' ? 0.5 : 1
            }}
            onClick={handleUpload}
            disabled={!novelId || selectedFiles.length === 0 || uploading || authStatus !== 'ok'}
          >
            {uploading ? 'กำลังอัพโหลด…' : `อัพโหลด ${selectedFiles.length} บท`}
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
    width: 680,
    maxWidth: '95vw',
    maxHeight: '88vh',
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
    color: 'var(--accent)'
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
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6
  },
  label: {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text2)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap'
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
    width: '100%',
    cursor: 'pointer'
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
  fileList: {
    border: '1px solid var(--border)',
    borderRadius: 4,
    maxHeight: 260,
    overflowY: 'auto',
    background: 'var(--bg0)'
  },
  fileRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '5px 10px',
    borderBottom: '1px solid var(--border)',
    fontSize: 12
  },
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
  coinBadge: {
    fontSize: 10,
    padding: '1px 6px',
    borderRadius: 99,
    fontFamily: 'var(--font-mono)',
    flexShrink: 0
  },
  coinPaid: {
    background: 'var(--hl-gold-bg)',
    color: 'var(--hl-gold)',
    border: '1px solid var(--hl-gold-border)'
  },
  coinFree: {
    background: 'var(--bg3)',
    color: 'var(--text2)',
    border: '1px solid var(--border)'
  },
  badgeUpdate: {
    background: 'rgba(91,138,240,0.12)',
    color: 'var(--accent)',
    border: '1px solid rgba(91,138,240,0.3)'
  },
  badgeNew: {
    background: 'rgba(62,207,160,0.1)',
    color: 'var(--hl-teal)',
    border: '1px solid rgba(62,207,160,0.25)'
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
    width: '100%'
  },
  log: {
    background: 'var(--bg0)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '8px 10px',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    maxHeight: 400,
    minHeight: 60,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 2
  },
  errorMsg: {
    fontSize: 11,
    color: 'var(--hl-red, #f87171)',
    background: 'rgba(248,113,113,0.08)',
    border: '1px solid rgba(248,113,113,0.2)',
    borderRadius: 4,
    padding: '5px 8px'
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
