import { useState, useEffect, useCallback, JSX } from 'react'
import type { GlossaryEntry, OpenGlossaryFile } from '../../types'
import { IcoEditFile } from '../common/icons'

export interface GlossaryEditorProps {
  file: OpenGlossaryFile
  onSave?: (updated: OpenGlossaryFile) => void
  onSaveChanges?: (updatedFile: OpenGlossaryFile, oldFile: OpenGlossaryFile) => Promise<void>
  onClose: () => void
  onImportToSession: (entries: GlossaryEntry[]) => void
}

export function GlossaryEditor({
  file,
  onClose,
  onImportToSession,
  onSaveChanges
}: GlossaryEditorProps): JSX.Element {
  const [entries, setEntries] = useState<GlossaryEntry[]>(file.entries)
  const [search, setSearch] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editSrc, setEditSrc] = useState('')
  const [editTh, setEditTh] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editType, setEditType] = useState<string>('other')
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const filtered = entries.filter(
    (e) =>
      !search ||
      e.src.toLowerCase().includes(search.toLowerCase()) ||
      e.th.toLowerCase().includes(search.toLowerCase())
  )

  const startEdit = (idx: number): void => {
    const real = entries.indexOf(filtered[idx])
    setEditingIdx(real)
    setEditSrc(entries[real].src)
    setEditTh(entries[real].th)
    setEditNote(entries[real].note ?? '')
    setEditType(entries[real].type)
  }

  const commitEdit = (): void => {
    if (editingIdx === null) return
    if (!editSrc.trim()) {
      cancelEdit()
      return
    }
    setEntries((prev) => {
      const next = [...prev]
      next[editingIdx] = { src: editSrc, th: editTh, type: editType, note: editNote || undefined }
      return next
    })
    setIsDirty(true)
    setEditingIdx(null)
  }

  const cancelEdit = useCallback((): void => setEditingIdx(null), [])

  const deleteRow = (filteredIdx: number): void => {
    const real = entries.indexOf(filtered[filteredIdx])
    setEntries((prev) => prev.filter((_, i) => i !== real))
    setIsDirty(true)
    setConfirmDelete(null)
    if (editingIdx === real) setEditingIdx(null)
  }

  const handleSave = useCallback(async () => {
    if (!isDirty || !onSaveChanges) return
    setIsSaving(true)
    try {
      const updatedFile: OpenGlossaryFile = { ...file, entries }
      await onSaveChanges(updatedFile, file)
      setIsDirty(false)
    } catch (e) {
      console.error('Failed to save glossary changes:', e)
    } finally {
      setIsSaving(false)
    }
  }, [isDirty, entries, file, onSaveChanges])

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (editingIdx !== null) {
          cancelEdit()
          return
        }
        onClose()
        return
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [editingIdx, onClose, cancelEdit])

  const TYPE_OPTIONS = ['person', 'place', 'term', 'other']
  const TYPE_COLOR: Record<string, string> = {
    person: 'var(--hl-gold)',
    place: 'var(--hl-teal)',
    term: 'var(--hl-coral)',
    other: 'var(--hl-other)'
  }

  return (
    <div
      style={s.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div style={s.modal}>
        {/* Header */}
        <div style={s.header}>
          <div style={s.headerLeft}>
            <span style={s.icon}>
              <IcoEditFile size={30} stroke="var(--accent)" />
            </span>
            <div>
              <div style={s.title}>
                {file.name}
                {isDirty && <span style={s.dirty}> ●</span>}
              </div>
              <div style={s.subtitle}>
                {entries.length} entries · format: {file.format}
              </div>
            </div>
          </div>
          <div style={s.headerRight}>
            {isDirty && onSaveChanges && (
              <button
                style={{ ...s.btnSecondary, color: isDirty ? 'var(--hl-teal)' : 'var(--text2)' }}
                onClick={handleSave}
                disabled={isSaving}
                title="บันทึก (Ctrl+S)"
              >
                {isSaving ? '…' : '💾'}
              </button>
            )}
            <button
              style={s.btnSecondary}
              onClick={() => onImportToSession(entries.map((e) => ({ ...e, _file: file.name })))}
              title="โหลด entries นี้เข้า session"
            >
              ↑ ใช้ใน Session
            </button>
            <button style={s.btnClose} onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div style={s.toolbar}>
          <input
            style={s.searchBox}
            placeholder="ค้นหา src / th…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        <div style={s.tableWrap}>
          <div style={s.tableHeader}>
            <span
              style={{ ...s.colSrc, color: 'var(--text2)', fontSize: 10, letterSpacing: '0.07em' }}
            >
              SRC (ต้นฉบับ)
            </span>
            <span
              style={{ ...s.colTh, color: 'var(--text2)', fontSize: 10, letterSpacing: '0.07em' }}
            >
              TH (แปล)
            </span>
            <span
              style={{ ...s.colType, color: 'var(--text2)', fontSize: 10, letterSpacing: '0.07em' }}
            >
              TYPE
            </span>
            <span
              style={{ ...s.colNote, color: 'var(--text2)', fontSize: 10, letterSpacing: '0.07em' }}
            >
              NOTE
            </span>
            <span style={s.colActions} />
          </div>

          <div style={s.tableBody}>
            {filtered.length === 0 && <div style={s.empty}>ไม่พบ entry</div>}
            {filtered.map((entry, fi) => {
              const realIdx = entries.indexOf(entry)
              const isEditing = editingIdx === realIdx

              if (isEditing) {
                return (
                  <div
                    key={realIdx}
                    style={{
                      ...s.row,
                      background: 'var(--bg3)',
                      borderLeft: '2px solid var(--accent)'
                    }}
                  >
                    <div style={s.colSrc}>
                      <input
                        autoFocus
                        style={s.cellInput}
                        value={editSrc}
                        onChange={(e) => setEditSrc(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit()
                          if (e.key === 'Escape') cancelEdit()
                        }}
                        placeholder="src…"
                      />
                    </div>
                    <div style={s.colTh}>
                      <input
                        style={s.cellInput}
                        value={editTh}
                        onChange={(e) => setEditTh(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit()
                          if (e.key === 'Escape') cancelEdit()
                        }}
                        placeholder="th…"
                      />
                    </div>
                    <div style={s.colType}>
                      <select
                        style={s.cellSelect}
                        value={editType}
                        onChange={(e) => setEditType(e.target.value)}
                      >
                        {TYPE_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div style={s.colNote}>
                      <input
                        style={s.cellInput}
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitEdit()
                          if (e.key === 'Escape') cancelEdit()
                        }}
                        placeholder="note (optional)…"
                      />
                    </div>
                    <div style={{ ...s.colActions, gap: 4 }}>
                      <button style={s.btnOk} onClick={commitEdit}>
                        ✓
                      </button>
                      <button style={s.btnCancel} onClick={cancelEdit}>
                        ✕
                      </button>
                    </div>
                  </div>
                )
              }

              return (
                <div key={realIdx} style={s.row} onDoubleClick={() => startEdit(fi)}>
                  <span
                    style={{
                      ...s.colSrc,
                      ...s.cellText,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11
                    }}
                  >
                    {entry.src || <em style={{ color: 'var(--text2)' }}>(empty)</em>}
                  </span>
                  <span style={{ ...s.colTh, ...s.cellText }}>{entry.th}</span>
                  <span style={{ ...s.colType, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: TYPE_COLOR[entry.type],
                        flexShrink: 0
                      }}
                    />
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--text2)',
                        fontFamily: 'var(--font-mono)'
                      }}
                    >
                      {entry.type}
                    </span>
                  </span>
                  <span
                    style={{ ...s.colNote, ...s.cellText, color: 'var(--text2)', fontSize: 10 }}
                  >
                    {entry.note ?? ''}
                  </span>
                  <div
                    style={{ ...s.colActions, opacity: 0, transition: 'opacity 0.1s' }}
                    className="row-actions"
                  >
                    <button style={s.btnEdit} onClick={() => startEdit(fi)} title="แก้ไข">
                      ✎
                    </button>
                    {confirmDelete === fi ? (
                      <>
                        <button style={s.btnDeleteConfirm} onClick={() => deleteRow(fi)}>
                          ลบ?
                        </button>
                        <button style={s.btnCancel} onClick={() => setConfirmDelete(null)}>
                          ✕
                        </button>
                      </>
                    ) : (
                      <button style={s.btnDelete} onClick={() => setConfirmDelete(fi)} title="ลบ">
                        🗑
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div style={s.footer}>
          <span style={{ color: 'var(--text2)', fontSize: 11 }}>
            แสดง {filtered.length} / {entries.length} entries · Esc ปิด
          </span>
        </div>
      </div>

      <style>{`
        .row-actions { opacity: 0 !important; }
        [data-row]:hover .row-actions { opacity: 1 !important; }
      `}</style>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    backdropFilter: 'blur(2px)'
  },
  modal: {
    background: 'var(--bg1)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    width: 820,
    maxWidth: 'calc(100vw - 48px)',
    maxHeight: 'calc(100vh - 60px)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 18px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg2)',
    flexShrink: 0
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
  icon: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28
  },
  title: { fontSize: 13, fontWeight: 600, color: 'var(--text0)', fontFamily: 'var(--font-mono)' },
  dirty: { color: 'var(--hl-gold)' },
  subtitle: { fontSize: 11, color: 'var(--text2)', marginTop: 2 },
  toolbar: {
    display: 'flex',
    gap: 8,
    padding: '8px 14px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg2)',
    flexShrink: 0
  },
  searchBox: {
    flex: 1,
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    color: 'var(--text0)',
    fontSize: 12,
    padding: '4px 10px',
    outline: 'none',
    fontFamily: 'var(--font-ui)'
  },
  tableWrap: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 14px',
    background: 'var(--bg2)',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    textTransform: 'uppercase',
    fontFamily: 'var(--font-mono)'
  },
  tableBody: { overflowY: 'auto', flex: 1 },
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 14px',
    minHeight: 32,
    borderBottom: '1px solid rgba(46,51,64,0.6)',
    transition: 'background 0.08s',
    cursor: 'default'
  },
  colSrc: {
    width: '28%',
    flexShrink: 0,
    paddingRight: 8,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  colTh: {
    flex: 1,
    paddingRight: 8,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  colType: { width: 80, flexShrink: 0, paddingRight: 8 },
  colNote: {
    width: 140,
    flexShrink: 0,
    paddingRight: 8,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  colActions: {
    width: 80,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4
  },
  cellText: { fontSize: 12, color: 'var(--text0)' },
  cellInput: {
    width: '100%',
    background: 'var(--bg3)',
    border: '1px solid var(--accent)',
    borderRadius: 3,
    color: 'var(--text0)',
    fontSize: 12,
    padding: '2px 6px',
    outline: 'none',
    fontFamily: 'var(--font-ui)'
  },
  cellSelect: {
    width: '100%',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    color: 'var(--text0)',
    fontSize: 11,
    padding: '2px 4px',
    outline: 'none',
    fontFamily: 'var(--font-mono)'
  },
  empty: { padding: 24, textAlign: 'center', color: 'var(--text2)', fontSize: 12 },
  footer: {
    padding: '6px 16px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg2)',
    flexShrink: 0
  },
  btnSecondary: {
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    color: 'var(--text1)',
    fontSize: 12,
    padding: '5px 12px',
    borderRadius: 6,
    cursor: 'pointer'
  },
  btnClose: {
    background: 'none',
    border: 'none',
    color: 'var(--text2)',
    fontSize: 14,
    cursor: 'pointer',
    padding: '4px 6px'
  },
  btnEdit: {
    background: 'none',
    border: 'none',
    color: 'var(--text2)',
    fontSize: 13,
    cursor: 'pointer',
    padding: '2px 4px'
  },
  btnDelete: {
    background: 'none',
    border: 'none',
    color: 'var(--text2)',
    fontSize: 12,
    cursor: 'pointer',
    padding: '2px 4px'
  },
  btnDeleteConfirm: {
    background: 'rgba(240,122,106,0.15)',
    border: '1px solid rgba(240,122,106,0.4)',
    color: 'var(--hl-coral)',
    fontSize: 10,
    cursor: 'pointer',
    padding: '1px 6px',
    borderRadius: 3
  },
  btnOk: {
    background: 'rgba(62,207,160,0.15)',
    border: '1px solid rgba(62,207,160,0.4)',
    color: 'var(--hl-teal)',
    fontSize: 13,
    cursor: 'pointer',
    padding: '1px 7px',
    borderRadius: 3
  },
  btnCancel: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text2)',
    fontSize: 11,
    cursor: 'pointer',
    padding: '1px 6px',
    borderRadius: 3
  }
}
