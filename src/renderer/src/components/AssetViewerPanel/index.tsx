import { useState, useEffect, useCallback, type JSX, type CSSProperties } from 'react'

interface AssetViewerPanelProps {
  novelDir: string | null
  glossary: Array<{ src: string; th: string }>
  onClose: () => void
}

type Kind = 'character' | 'background'

// ─── Thumbnail (lazy data-url load) ────────────────────────────────────────────

function Thumb({ path }: { path: string }): JSX.Element {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let canceled = false
    window.electron
      .readImageDataUrl(path)
      .then((s) => {
        if (!canceled) setSrc(s)
      })
      .catch(() => undefined)
    return () => {
      canceled = true
    }
  }, [path])
  return src ? (
    <img src={src} style={s.thumbImg} alt="" />
  ) : (
    <div style={s.thumbPlaceholder}>…</div>
  )
}

// ─── Panel ─────────────────────────────────────────────────────────────────────

export function AssetViewerPanel({ novelDir, glossary, onClose }: AssetViewerPanelProps): JSX.Element {
  const [tab, setTab] = useState<Kind>('character')
  const [assets, setAssets] = useState<_ImageAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [subject, setSubject] = useState('')
  const [name, setName] = useState('')
  const [bindSrc, setBindSrc] = useState('')
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgErr, setMsgErr] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editInstr, setEditInstr] = useState('')

  const note = useCallback((text: string, err = false) => {
    setMsg(text)
    setMsgErr(err)
  }, [])

  const refresh = useCallback(async () => {
    if (!novelDir) return
    setLoading(true)
    try {
      const all = await window.electron.imageListAssets(novelDir)
      setAssets(all)
    } catch {
      note('โหลด asset ไม่ได้', true)
    } finally {
      setLoading(false)
    }
  }, [novelDir, note])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleGenerate = useCallback(async () => {
    if (!novelDir || !subject.trim() || generating) return
    setGenerating(true)
    note(`กำลังเจน${tab === 'character' ? 'ตัวละคร' : 'พื้นหลัง'}… (~40 วิ)`)
    try {
      await window.electron.imageGenerate({
        novelDir,
        kind: tab,
        subject: subject.trim(),
        name: name.trim() || undefined,
        glossarySrc: tab === 'character' && bindSrc ? bindSrc : undefined
      })
      note('✓ เจนเสร็จ')
      setSubject('')
      setName('')
      setBindSrc('')
      await refresh()
    } catch (e) {
      note(`เจนไม่ได้: ${e instanceof Error ? e.message.slice(0, 140) : String(e)}`, true)
    } finally {
      setGenerating(false)
    }
  }, [novelDir, subject, name, bindSrc, tab, generating, note, refresh])

  const handleDelete = useCallback(
    async (id: string) => {
      if (!novelDir) return
      await window.electron.imageDeleteAsset(novelDir, id)
      await refresh()
    },
    [novelDir, refresh]
  )

  const handleBind = useCallback(
    async (id: string, src: string) => {
      if (!novelDir) return
      await window.electron.imageBindCharacter(novelDir, id, src)
      await refresh()
    },
    [novelDir, refresh]
  )

  const handleEdit = useCallback(
    async (sourceId: string) => {
      if (!novelDir || !editInstr.trim() || generating) return
      setGenerating(true)
      note('กำลังเจนแก้จากภาพ… (~40 วิ)')
      try {
        await window.electron.imageEdit({ novelDir, sourceId, instruction: editInstr.trim() })
        note('✓ เจนแก้เสร็จ (เพิ่มเป็นภาพใหม่)')
        setEditingId(null)
        setEditInstr('')
        await refresh()
      } catch (e) {
        note(`เจนแก้ไม่ได้: ${e instanceof Error ? e.message.slice(0, 140) : String(e)}`, true)
      } finally {
        setGenerating(false)
      }
    },
    [novelDir, editInstr, generating, note, refresh]
  )

  const shown = assets.filter((a) => a.kind === tab)

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>Asset Viewer</span>
          <button style={s.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        {!novelDir ? (
          <div style={s.body}>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>เปิดโฟลเดอร์นิยายก่อน</div>
          </div>
        ) : (
          <div style={s.body}>
            {/* Tabs */}
            <div style={s.tabs}>
              <button
                style={tab === 'character' ? s.tabActive : s.tab}
                onClick={() => setTab('character')}
              >
                ตัวละคร (พื้นใส)
              </button>
              <button
                style={tab === 'background' ? s.tabActive : s.tab}
                onClick={() => setTab('background')}
              >
                พื้นหลัง
              </button>
            </div>

            {/* Generate new */}
            <div style={s.genRow}>
              <input
                style={{ ...s.input, flex: 1 }}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder={
                  tab === 'character'
                    ? 'อธิบายตัวละคร เช่น young female mage, silver hair, blue robe'
                    : 'อธิบายฉาก เช่น forest tavern interior at night'
                }
                spellCheck={false}
              />
              <input
                style={{ ...s.input, width: 110 }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ชื่อย่อ"
                spellCheck={false}
              />
              {tab === 'character' && (
                <input
                  style={s.select}
                  list="gl-options"
                  value={bindSrc}
                  onChange={(e) => setBindSrc(e.target.value)}
                  placeholder="ผูก glossary (พิมพ์ค้นหา)"
                  spellCheck={false}
                />
              )}
              <button
                style={{ ...s.btn, opacity: generating || !subject.trim() ? 0.5 : 1 }}
                onClick={handleGenerate}
                disabled={generating || !subject.trim()}
              >
                {generating ? 'กำลังเจน…' : 'เจน'}
              </button>
            </div>

            <datalist id="gl-options">
              {glossary.slice(0, 2000).map((g) => (
                <option key={g.src} value={g.src}>
                  {g.th}
                </option>
              ))}
            </datalist>

            {/* Grid */}
            <div style={s.grid}>
              {loading && <div style={s.empty}>กำลังโหลด…</div>}
              {!loading && shown.length === 0 && (
                <div style={s.empty}>ยังไม่มี{tab === 'character' ? 'ตัวละคร' : 'พื้นหลัง'}</div>
              )}
              {shown.map((a) => (
                <div key={a.id} style={s.card}>
                  <div style={tab === 'character' ? s.thumbBoxAlpha : s.thumbBox}>
                    <Thumb path={a.path} />
                  </div>
                  <div style={s.cardName} title={a.subject}>
                    {a.name}
                  </div>
                  {tab === 'character' && (
                    <input
                      key={a.id + (a.glossarySrc ?? '')}
                      style={s.bindSelect}
                      list="gl-options"
                      defaultValue={a.glossarySrc ?? ''}
                      onBlur={(e) => handleBind(a.id, e.target.value)}
                      placeholder="ผูก glossary"
                      spellCheck={false}
                    />
                  )}
                  {editingId === a.id ? (
                    <div style={s.editRow}>
                      <input
                        style={s.editInput}
                        value={editInstr}
                        onChange={(e) => setEditInstr(e.target.value)}
                        placeholder="อยากแก้อะไร เช่น ลบจุดชมพู, เปลี่ยนสีชุดเป็นฟ้า"
                        spellCheck={false}
                      />
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          style={{ ...s.smallBtn, opacity: generating || !editInstr.trim() ? 0.5 : 1 }}
                          onClick={() => handleEdit(a.id)}
                          disabled={generating || !editInstr.trim()}
                        >
                          {generating ? '…' : 'เจนแก้'}
                        </button>
                        <button style={s.smallGhost} onClick={() => setEditingId(null)}>
                          ✕
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        style={s.editBtn}
                        onClick={() => {
                          setEditingId(a.id)
                          setEditInstr('')
                        }}
                      >
                        ✎ แก้
                      </button>
                      <button style={s.delBtn} onClick={() => handleDelete(a.id)}>
                        ลบ
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {msg && <div style={msgErr ? s.errorMsg : s.okMsg}>{msg}</div>}
          </div>
        )}
      </div>
    </div>
  )
}

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
    width: 760,
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
    borderBottom: '1px solid var(--border)'
  },
  title: { fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--accent)' },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text2)',
    fontSize: 14,
    cursor: 'pointer',
    padding: '2px 6px'
  },
  body: { overflowY: 'auto', flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 },
  tabs: { display: 'flex', gap: 6 },
  tab: {
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    color: 'var(--text2)',
    fontSize: 12,
    padding: '5px 14px',
    borderRadius: 6,
    cursor: 'pointer'
  },
  tabActive: {
    background: 'var(--accent)',
    border: '1px solid var(--accent)',
    color: '#fff',
    fontSize: 12,
    padding: '5px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontWeight: 600
  },
  genRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  input: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    color: 'var(--text0)',
    fontSize: 12,
    padding: '6px 8px',
    borderRadius: 4,
    outline: 'none'
  },
  select: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    color: 'var(--text0)',
    fontSize: 12,
    padding: '6px 8px',
    borderRadius: 4,
    outline: 'none',
    maxWidth: 180
  },
  btn: {
    background: 'var(--accent)',
    border: 'none',
    color: '#fff',
    fontSize: 12,
    padding: '6px 16px',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 500,
    whiteSpace: 'nowrap'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
    gap: 12
  },
  empty: { gridColumn: '1 / -1', padding: '24px 0', textAlign: 'center', color: 'var(--text2)', fontSize: 12 },
  card: {
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    background: 'var(--bg0)'
  },
  thumbBox: {
    width: '100%',
    aspectRatio: '16 / 9',
    borderRadius: 6,
    overflow: 'hidden',
    background: 'var(--bg2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  thumbBoxAlpha: {
    width: '100%',
    aspectRatio: '3 / 4',
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#2a2a30',
    backgroundImage:
      'linear-gradient(45deg, #3a3a42 25%, transparent 25%), linear-gradient(-45deg, #3a3a42 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #3a3a42 75%), linear-gradient(-45deg, transparent 75%, #3a3a42 75%)',
    backgroundSize: '16px 16px',
    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  thumbImg: { width: '100%', height: '100%', objectFit: 'contain' },
  thumbPlaceholder: { color: 'var(--text3, var(--text2))', fontSize: 18 },
  cardName: {
    fontSize: 11,
    color: 'var(--text1)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  bindSelect: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    color: 'var(--text1)',
    fontSize: 11,
    padding: '3px 4px',
    borderRadius: 4,
    outline: 'none',
    width: '100%'
  },
  delBtn: {
    flex: 1,
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text2)',
    fontSize: 11,
    padding: '3px 0',
    borderRadius: 4,
    cursor: 'pointer'
  },
  editBtn: {
    flex: 1,
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--accent)',
    fontSize: 11,
    padding: '3px 0',
    borderRadius: 4,
    cursor: 'pointer'
  },
  editRow: { display: 'flex', flexDirection: 'column', gap: 4 },
  editInput: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    color: 'var(--text0)',
    fontSize: 11,
    padding: '4px 6px',
    borderRadius: 4,
    outline: 'none',
    width: '100%'
  },
  smallBtn: {
    flex: 1,
    background: 'var(--accent)',
    border: 'none',
    color: '#fff',
    fontSize: 11,
    padding: '3px 0',
    borderRadius: 4,
    cursor: 'pointer'
  },
  smallGhost: {
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    color: 'var(--text2)',
    fontSize: 11,
    padding: '3px 8px',
    borderRadius: 4,
    cursor: 'pointer'
  },
  okMsg: {
    fontSize: 12,
    color: 'var(--hl-teal, #3ecfa0)',
    background: 'rgba(62,207,160,0.08)',
    border: '1px solid rgba(62,207,160,0.2)',
    borderRadius: 4,
    padding: '6px 10px'
  },
  errorMsg: {
    fontSize: 12,
    color: 'var(--hl-red, #f87171)',
    background: 'rgba(248,113,113,0.08)',
    border: '1px solid rgba(248,113,113,0.2)',
    borderRadius: 4,
    padding: '6px 10px'
  }
}
