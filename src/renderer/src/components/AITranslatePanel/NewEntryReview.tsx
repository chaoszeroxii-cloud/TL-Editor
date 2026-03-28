import { JSX } from 'react'
import type { PendingEntry } from './extractNewEntries'
import { IcoChevronDown as IcoChevDown, IcoChevronUp as IcoChevUp, IcoCheck } from '../common/icons'

const TYPE_COLOR: Record<string, string> = {
  person: 'var(--hl-gold)',
  place: 'var(--hl-teal)',
  term: 'var(--hl-coral)',
  other: 'var(--hl-other)'
}

export interface NewEntryReviewProps {
  pendingEntries: PendingEntry[]
  showEntries: boolean
  addDone: boolean
  addTargetFile: string
  fileNames: string[]
  availableTypes: string[]
  onToggleShow: () => void
  onToggleEntry: (i: number) => void
  onSetType: (i: number, type: string) => void
  onSetTargetFile: (file: string) => void
  onSelectAll: () => void
  onSelectNone: () => void
  onAddSelected: () => void
  canAdd: boolean
}

export function NewEntryReview({
  pendingEntries,
  showEntries,
  addDone,
  addTargetFile,
  fileNames,
  availableTypes,
  onToggleShow,
  onToggleEntry,
  onSetType,
  onSetTargetFile,
  onSelectAll,
  onSelectNone,
  onAddSelected,
  canAdd
}: NewEntryReviewProps): JSX.Element {
  const selectedCount = pendingEntries.filter((e) => e.selected).length

  return (
    <div style={s.newWrap}>
      <button style={s.newHdr} onClick={onToggleShow}>
        <span style={{ fontSize: 13 }}>✨</span>
        <span style={{ flex: 1, textAlign: 'left' as const }}>
          {addDone ? `เพิ่มแล้ว — ตรวจสอบ glossary` : `พบ ${pendingEntries.length} entries ใหม่`}
        </span>
        <span style={{ color: 'var(--text2)', display: 'flex' }}>
          {showEntries ? (
            <IcoChevUp size={10} stroke="currentColor" />
          ) : (
            <IcoChevDown size={10} stroke="currentColor" />
          )}
        </span>
      </button>

      {showEntries && (
        <div style={s.newBody}>
          {fileNames.length > 0 && (
            <div style={s.field}>
              <label style={s.label}>บันทึกลงไฟล์</label>
              <select
                style={s.fileSelect}
                value={addTargetFile}
                onChange={(e) => onSetTargetFile(e.target.value)}
              >
                <option value="">— session only (ไม่บันทึกไฟล์) —</option>
                {fileNames.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div style={s.entryList}>
            {pendingEntries.map((e, i) => (
              <div key={i} style={{ ...s.pendingRow, opacity: addDone && !e.selected ? 0.45 : 1 }}>
                <input
                  type="checkbox"
                  checked={e.selected}
                  onChange={() => onToggleEntry(i)}
                  disabled={addDone}
                  style={{ accentColor: 'var(--accent)', flexShrink: 0, marginTop: 1 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={s.eSrc}>{e.src}</div>
                  <div style={s.eTh}>{e.th}</div>
                  {e.note && <div style={s.eNote}>{e.note}</div>}
                </div>
                <select
                  value={e.type}
                  onChange={(ev) => onSetType(i, ev.target.value)}
                  disabled={addDone}
                  style={{
                    ...s.typeSelect,
                    color: TYPE_COLOR[e.type] ?? 'var(--hl-coral)',
                    borderColor: `${TYPE_COLOR[e.type] ?? 'var(--hl-coral)'}50`
                  }}
                >
                  {availableTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button style={s.selBtn} onClick={onSelectAll} disabled={addDone}>
              ทั้งหมด
            </button>
            <button style={s.selBtn} onClick={onSelectNone} disabled={addDone}>
              ยกเลิก
            </button>
            <span
              style={{
                fontSize: 9,
                color: 'var(--text2)',
                fontFamily: 'var(--font-mono)',
                marginLeft: 'auto'
              }}
            >
              {selectedCount}/{pendingEntries.length} รายการ
            </span>
          </div>

          {canAdd && (
            <button
              onClick={onAddSelected}
              disabled={selectedCount === 0 || addDone}
              style={{
                ...s.btnAdd,
                opacity: selectedCount === 0 || addDone ? 0.4 : 1,
                cursor: selectedCount === 0 || addDone ? 'not-allowed' : 'pointer',
                background: addDone ? 'rgba(62,207,160,0.15)' : 'var(--hl-gold-bg)',
                borderColor: addDone ? 'rgba(62,207,160,0.4)' : 'var(--hl-gold-border)',
                color: addDone ? 'var(--hl-teal)' : 'var(--hl-gold)'
              }}
            >
              {addDone ? (
                <>
                  <IcoCheck size={12} stroke="currentColor" /> เพิ่มแล้ว
                </>
              ) : (
                <>✨ เพิ่ม {selectedCount} entries → Glossary</>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  newWrap: {
    border: '1px solid var(--hl-gold-border)',
    borderRadius: 8,
    overflow: 'hidden',
    background: 'var(--hl-gold-bg)'
  },
  newHdr: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 10px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--hl-gold)',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    textAlign: 'left' as const
  },
  newBody: {
    padding: '8px 10px 10px',
    borderTop: '1px solid var(--hl-gold-border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    background: 'var(--bg1)'
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: {
    fontSize: 9,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  fileSelect: {
    width: '100%',
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    color: 'var(--hl-gold)',
    fontSize: 10,
    padding: '4px 6px',
    outline: 'none',
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    boxSizing: 'border-box' as const
  },
  entryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    maxHeight: 220,
    overflowY: 'auto'
  },
  pendingRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 7,
    padding: '6px 8px',
    background: 'var(--bg2)',
    borderRadius: 6,
    border: '1px solid var(--border)',
    transition: 'opacity 0.15s'
  },
  eSrc: {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text0)',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  eTh: { fontSize: 11, color: 'var(--text1)', marginTop: 1 },
  eNote: {
    fontSize: 9,
    color: 'var(--text2)',
    marginTop: 2,
    lineHeight: 1.4,
    fontFamily: 'var(--font-mono)'
  },
  typeSelect: {
    background: 'var(--bg3)',
    border: '1px solid',
    borderRadius: 99,
    fontSize: 9,
    padding: '2px 5px',
    outline: 'none',
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    flexShrink: 0,
    alignSelf: 'flex-start',
    fontWeight: 600
  },
  selBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text2)',
    fontSize: 9,
    padding: '2px 7px',
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)'
  },
  btnAdd: {
    width: '100%',
    border: '1px solid',
    fontSize: 11,
    fontWeight: 600,
    padding: '7px 12px',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    transition: 'opacity 0.15s'
  }
}
