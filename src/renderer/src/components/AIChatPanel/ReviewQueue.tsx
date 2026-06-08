// AIChatPanel/ReviewQueue.tsx — staged TGT edits + glossary entries, accept/deny.
import { JSX } from 'react'
import type { PendingEdit, PendingGlossary, PendingMemory } from './types'

interface ReviewQueueProps {
  edits: PendingEdit[]
  glossary: PendingGlossary[]
  memory: PendingMemory[]
  onAcceptEdit: (id: string, force?: boolean) => void
  onDenyEdit: (id: string) => void
  onAcceptAllEdits: () => void
  onAcceptGlossary: (id: string) => void
  onDenyGlossary: (id: string) => void
  onAcceptAllGlossary: () => void
  onAcceptMemory: (id: string) => void
  onDenyMemory: (id: string) => void
}

export function ReviewQueue({
  edits,
  glossary,
  memory,
  onAcceptEdit,
  onDenyEdit,
  onAcceptAllEdits,
  onAcceptGlossary,
  onDenyGlossary,
  onAcceptAllGlossary,
  onAcceptMemory,
  onDenyMemory
}: ReviewQueueProps): JSX.Element | null {
  if (edits.length === 0 && glossary.length === 0 && memory.length === 0) return null

  return (
    <div style={s.wrap}>
      {edits.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionHead}>
            <span style={s.sectionTitle}>✎ การแก้ไข TGT · {edits.length}</span>
            <button style={s.allBtn} onClick={onAcceptAllEdits}>
              Accept all
            </button>
          </div>
          {edits.map((e) => (
            <EditCard
              key={e.id}
              edit={e}
              onAccept={(force) => onAcceptEdit(e.id, force)}
              onDeny={() => onDenyEdit(e.id)}
            />
          ))}
        </div>
      )}

      {glossary.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionHead}>
            <span style={s.sectionTitle}>✦ Glossary ใหม่ · {glossary.length}</span>
            <button style={s.allBtn} onClick={onAcceptAllGlossary}>
              Accept all
            </button>
          </div>
          {glossary.map((g) => (
            <div key={g.id} style={s.glossRow}>
              <span style={s.glossSrc} title={g.src}>
                {g.src}
              </span>
              <span style={{ color: 'var(--text2)' }}>→</span>
              <span style={s.glossTh} title={g.th}>
                {g.th}
              </span>
              <span style={s.glossFile} title={g.targetFile}>
                {g.targetFile.replace(/\.json$/i, '')}
              </span>
              <button style={s.ok} onClick={() => onAcceptGlossary(g.id)} title="Accept">
                ✓
              </button>
              <button style={s.no} onClick={() => onDenyGlossary(g.id)} title="Deny">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {memory.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionHead}>
            <span style={s.sectionTitle}>Project memory · {memory.length}</span>
          </div>
          {memory.map((m) => (
            <div key={m.id} style={s.card}>
              <div style={s.cardHead}>
                <span style={s.cardTitle}>อัปเดต memory ({m.nextContent.length} ตัวอักษร)</span>
                <div style={{ flex: 1 }} />
                <button style={s.ok} onClick={() => onAcceptMemory(m.id)} title="Accept">
                  ✓
                </button>
                <button style={s.no} onClick={() => onDenyMemory(m.id)} title="Deny">
                  ✕
                </button>
              </div>
              <DiffPreview oldText={m.prevContent} newText={m.nextContent} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EditCard({
  edit,
  onAccept,
  onDeny
}: {
  edit: PendingEdit
  onAccept: (force?: boolean) => void
  onDeny: () => void
}): JSX.Element {
  const conflict = edit.status === 'conflict'
  const title =
    edit.kind === 'full'
      ? `แทนทั้งบท (${edit.newText.split('\n').length} บรรทัด)`
      : `บรรทัด ${edit.startLine + 1}–${edit.endLine + 1}`

  const oldText = edit.kind === 'full' ? edit.baseSnapshot : edit.coreText
  const newText = edit.newText

  return (
    <div style={{ ...s.card, borderColor: conflict ? 'rgba(240,122,106,0.5)' : 'var(--border)' }}>
      <div style={s.cardHead}>
        <span style={s.cardTitle}>{title}</span>
        {conflict && <span style={s.conflictBadge}>conflict</span>}
        <div style={{ flex: 1 }} />
        <button
          style={s.ok}
          onClick={() => onAccept(conflict)}
          title={conflict ? 'Force overwrite' : 'Accept'}
        >
          {conflict ? 'Force' : '✓'}
        </button>
        <button style={s.no} onClick={onDeny} title="Deny">
          ✕
        </button>
      </div>
      <DiffPreview oldText={oldText} newText={newText} />
      {conflict && (
        <div style={s.conflictNote}>
          TGT เปลี่ยนไปตั้งแต่ AI เสนอ / หาตำแหน่งเดิมไม่เจอ — กด Force เพื่อทับ หรือ ✕ ทิ้ง
        </div>
      )}
    </div>
  )
}

function DiffPreview({ oldText, newText }: { oldText: string; newText: string }): JSX.Element {
  const oldLines = oldText ? oldText.split('\n') : []
  const newLines = newText ? newText.split('\n') : []
  const cap = 6
  return (
    <div style={s.diff}>
      {oldLines.slice(0, cap).map((l, i) => (
        <div key={`o${i}`} style={s.delLine}>
          <span style={s.gutter}>-</span>
          {l || ' '}
        </div>
      ))}
      {oldLines.length > cap && <div style={s.more}>…+{oldLines.length - cap}</div>}
      {newLines.slice(0, cap).map((l, i) => (
        <div key={`n${i}`} style={s.addLine}>
          <span style={s.gutter}>+</span>
          {l || ' '}
        </div>
      ))}
      {newLines.length > cap && <div style={s.more}>…+{newLines.length - cap}</div>}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    borderTop: '1px solid var(--border)',
    background: 'var(--bg1)',
    maxHeight: 280,
    overflowY: 'auto',
    flexShrink: 0
  },
  section: { padding: '6px 8px', borderBottom: '1px solid var(--border)' },
  sectionHead: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 },
  sectionTitle: {
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text1)',
    letterSpacing: '0.04em',
    flex: 1
  },
  allBtn: {
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    background: 'var(--accent-dim)',
    color: 'var(--accent)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '2px 7px',
    cursor: 'pointer'
  },
  card: {
    border: '1px solid var(--border)',
    borderRadius: 6,
    marginBottom: 5,
    overflow: 'hidden',
    background: 'var(--bg0)'
  },
  cardHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '4px 6px',
    background: 'var(--bg2)'
  },
  cardTitle: { fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text1)' },
  conflictBadge: {
    fontSize: 8,
    fontFamily: 'var(--font-mono)',
    color: 'var(--hl-coral)',
    background: 'rgba(240,122,106,0.12)',
    borderRadius: 99,
    padding: '1px 6px'
  },
  diff: {
    padding: '4px 6px',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  delLine: { color: 'var(--hl-coral)', background: 'rgba(240,122,106,0.06)' },
  addLine: { color: 'var(--hl-teal)', background: 'rgba(62,207,160,0.06)' },
  gutter: { display: 'inline-block', width: 12, opacity: 0.6 },
  more: { fontSize: 9, color: 'var(--text2)', fontFamily: 'var(--font-mono)', padding: '1px 0' },
  conflictNote: {
    fontSize: 9,
    color: 'var(--hl-coral)',
    padding: '3px 6px',
    borderTop: '1px solid rgba(240,122,106,0.2)',
    lineHeight: 1.4
  },
  glossRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 4px',
    fontSize: 10,
    fontFamily: 'var(--font-mono)'
  },
  glossSrc: {
    color: 'var(--hl-gold)',
    maxWidth: 70,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flexShrink: 0
  },
  glossTh: {
    color: 'var(--hl-teal)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  glossFile: {
    fontSize: 8,
    color: 'var(--text2)',
    maxWidth: 50,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  ok: {
    background: 'rgba(62,207,160,0.12)',
    color: 'var(--hl-teal)',
    border: '1px solid rgba(62,207,160,0.3)',
    borderRadius: 4,
    fontSize: 10,
    padding: '1px 7px',
    cursor: 'pointer',
    flexShrink: 0
  },
  no: {
    background: 'none',
    color: 'var(--text2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    fontSize: 10,
    padding: '1px 6px',
    cursor: 'pointer',
    flexShrink: 0
  }
}
