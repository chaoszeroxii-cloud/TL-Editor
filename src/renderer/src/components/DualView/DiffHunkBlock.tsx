// DualView/DiffHunkBlock.tsx
// Read-only inline rendering of a staged AI edit (Phase 3 "ghost rows"). Replaces
// the normal editable rows for the affected range while a diff is pending review.
// It NEVER mutates content — Accept/Deny flow through the parent; the underlying
// tgtContent + row indices are untouched until the user accepts.

import { JSX } from 'react'
import { ROW_H } from './Row'
import type { DiffHunk } from '../AIChatPanel/anchorMatch'

export interface DiffHunkBlockProps {
  hunk: DiffHunk
  /** Source lines for the hunk's row range (context, right column). */
  srcLines: string[]
  /** 1-based line number of the first replaced line. */
  startRowNum: number
  splitPos: number
  onAccept: () => void
  onDeny: () => void
}

export function DiffHunkBlock({
  hunk,
  srcLines,
  startRowNum,
  splitPos,
  onAccept,
  onDeny
}: DiffHunkBlockProps): JSX.Element {
  return (
    <div
      data-row-index={hunk.startRow}
      data-diff-hunk={hunk.editId}
      style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        borderLeft: '3px solid var(--accent)',
        marginBottom: 2,
        background: 'rgba(91,138,240,0.04)'
      }}
    >
      {/* TGT diff column */}
      <div style={{ flex: `0 0 ${splitPos}%`, minWidth: 0, borderRight: '1px solid var(--border)' }}>
        <div style={s.head}>
          <span style={s.headLabel}>✎ AI เสนอแก้ บรรทัด {startRowNum}</span>
          <div style={{ flex: 1 }} />
          <button style={s.accept} onClick={onAccept} title="Accept (ลง TGT)">
            ✓
          </button>
          <button style={s.deny} onClick={onDeny} title="Deny (ทิ้ง)">
            ✕
          </button>
        </div>
        {hunk.oldLines.map((l, i) => (
          <div key={`o${i}`} style={s.delLine}>
            <span style={s.gutterNum}>{startRowNum + i}</span>
            <span style={s.delMark}>−</span>
            <span style={s.delText}>{l || ' '}</span>
          </div>
        ))}
        {hunk.newLines.map((l, i) => (
          <div key={`n${i}`} style={s.addLine}>
            <span style={s.gutterNum} />
            <span style={s.addMark}>+</span>
            <span style={s.addText}>{l || ' '}</span>
          </div>
        ))}
      </div>

      <div style={{ width: 4, background: 'transparent', flexShrink: 0 }} />

      {/* SRC context column */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ height: 22 }} /> {/* spacer matching the diff header height */}
        {srcLines.map((l, i) => (
          <div key={`s${i}`} style={s.srcLine}>
            <span style={s.gutterNum}>{startRowNum + i}</span>
            <span style={s.srcText}>{l || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

const lineBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 4,
  minHeight: ROW_H,
  padding: '2px 8px 2px 0',
  fontSize: 13,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word'
}

const s: Record<string, React.CSSProperties> = {
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    minHeight: 22,
    padding: '2px 6px',
    background: 'var(--bg2)',
    borderBottom: '1px solid var(--border)'
  },
  headLabel: {
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    color: 'var(--accent)',
    letterSpacing: '0.03em'
  },
  accept: {
    background: 'rgba(62,207,160,0.12)',
    color: 'var(--hl-teal)',
    border: '1px solid rgba(62,207,160,0.3)',
    borderRadius: 4,
    fontSize: 11,
    padding: '0px 8px',
    cursor: 'pointer',
    flexShrink: 0
  },
  deny: {
    background: 'none',
    color: 'var(--text2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    fontSize: 11,
    padding: '0px 7px',
    cursor: 'pointer',
    flexShrink: 0,
    marginLeft: 4
  },
  gutterNum: {
    flexShrink: 0,
    width: 'var(--num-w)',
    textAlign: 'right',
    paddingRight: 8,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    userSelect: 'none'
  },
  delLine: { ...lineBase, background: 'rgba(240,122,106,0.07)' },
  addLine: { ...lineBase, background: 'rgba(62,207,160,0.07)' },
  srcLine: { ...lineBase },
  delMark: { color: 'var(--hl-coral)', flexShrink: 0, fontFamily: 'var(--font-mono)' },
  addMark: { color: 'var(--hl-teal)', flexShrink: 0, fontFamily: 'var(--font-mono)' },
  delText: { color: 'var(--hl-coral)', textDecoration: 'line-through', opacity: 0.85, flex: 1 },
  addText: { color: 'var(--text0)', flex: 1 },
  srcText: { color: 'var(--text2)', flex: 1 }
}
