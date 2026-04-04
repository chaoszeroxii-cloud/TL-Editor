import { memo, useRef, useEffect, useLayoutEffect, useMemo, JSX } from 'react'
import type { GlossaryEntry } from '../../types'
import { tokenize, HL_COLORS } from '../../utils/highlight'
import { showTooltip, hideTooltip } from '../common/Tooltip'
import { buildRenderSegs } from './findHighlight'
import type { FindRange, FindSeg } from './findHighlight'

const ROW_H = 28

// ─── Mirror div (singleton) for visual-line detection ─────────────────────────
// NOTE: The mirror is intentionally a document-level singleton (cheap, one DOM node).
// We always fully sync its style before every measurement so that two textareas
// with different widths/fonts (e.g. the src and tgt columns) never corrupt the cache.

let _mirror: HTMLDivElement | null = null

function ensureMirror(): HTMLDivElement {
  if (!_mirror) {
    _mirror = document.createElement('div')
    _mirror.style.cssText =
      'position:fixed;visibility:hidden;top:-9999px;left:0;white-space:pre-wrap;word-break:break-word;overflow-wrap:break-word;box-sizing:border-box;pointer-events:none'
    document.body.appendChild(_mirror)
  }
  return _mirror
}

function syncMirrorStyle(mirror: HTMLDivElement, ta: HTMLTextAreaElement): void {
  // Always unconditionally sync all properties — the singleton is shared between
  // src and tgt rows which may have different widths, so a stale cache is wrong.
  const cs = window.getComputedStyle(ta)
  mirror.style.font = cs.font
  mirror.style.width = ta.clientWidth + 'px'
  mirror.style.padding = `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`
  mirror.style.lineHeight = cs.lineHeight
}

function getVisualLineInfo(ta: HTMLTextAreaElement): { onFirst: boolean; onLast: boolean } {
  const cs = window.getComputedStyle(ta)
  const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5
  if (ta.scrollHeight <= lh * 1.5 && !ta.value.includes('\n'))
    return { onFirst: true, onLast: true }
  const mirror = ensureMirror()
  syncMirrorStyle(mirror, ta)
  const before = document.createTextNode(ta.value.slice(0, ta.selectionStart) || '')
  const marker = document.createElement('span')
  marker.textContent = '\u200b'
  mirror.replaceChildren(
    before,
    marker,
    document.createTextNode(ta.value.slice(ta.selectionEnd) || '')
  )
  const mRect = mirror.getBoundingClientRect(),
    markerRect = marker.getBoundingClientRect()
  const cursorY = markerRect.top - mRect.top
  return { onFirst: cursorY < lh * 0.9, onLast: mirror.scrollHeight - lh * 0.5 <= cursorY + lh }
}

// ─── HighlightSpan ────────────────────────────────────────────────────────────

const HL = memo(function HL({
  seg,
  onEnter,
  onLeave
}: {
  seg: Extract<ReturnType<typeof tokenize>[0], { kind: 'match' }>
  onEnter: (e: GlossaryEntry, x: number, y: number) => void
  onLeave: () => void
}) {
  const c = HL_COLORS[seg.entry.type]
  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        borderBottom: `1.5px solid ${c.border}`,
        borderRadius: 3,
        padding: '0 2px',
        fontWeight: 500,
        cursor: 'pointer'
      }}
      onMouseEnter={(e) => onEnter(seg.entry, e.clientX, e.clientY)}
      onMouseLeave={onLeave}
    >
      {seg.text}
    </span>
  )
})

// ─── Row ──────────────────────────────────────────────────────────────────────

export interface RowProps {
  rowNum: number
  text: string
  glossary: GlossaryEntry[]
  isActive: boolean
  onMouseEnter: () => void
  editable: boolean
  isEditing: boolean
  focusAtStart: boolean
  pendingCursor: number | null
  onStartEdit: () => void
  onStopEdit: () => void
  onCommit: (v: string) => void
  onUndo: () => void
  onRedo: () => void
  onEnterPressed: (before: string, after: string) => void
  onMultiLinePaste: (lines: string[]) => void
  onBackspaceAtStart: (text: string) => void
  onNavUp: (col: number) => void
  onNavDown: (col: number) => void
  onNavLeft: () => void
  onNavRight: () => void
  navCol: number | null
  navDir: 'up' | 'down' | null
  findRanges?: FindRange[]
  isSrc?: boolean
}

export const Row = memo(function Row({
  rowNum,
  text,
  glossary,
  isActive,
  onMouseEnter,
  editable,
  isEditing,
  focusAtStart,
  pendingCursor,
  onStartEdit,
  onStopEdit,
  onCommit,
  onUndo,
  onRedo,
  onEnterPressed,
  onMultiLinePaste,
  onBackspaceAtStart,
  onNavUp,
  onNavDown,
  onNavLeft,
  onNavRight,
  navCol,
  navDir,
  findRanges,
  isSrc = false
}: RowProps): JSX.Element {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const suppressBlurRef = useRef(false)
  const isEmpty = text.trim() === ''

  const localUndoStack = useRef<string[]>([])
  const localRedoStack = useRef<string[]>([])
  useEffect(() => {
    if (isEditing) {
      localUndoStack.current = []
      localRedoStack.current = []
    }
  }, [isEditing])

  const segments = useMemo(() => tokenize(text, glossary), [text, glossary])
  const renderSegs = useMemo((): FindSeg[] | null => {
    if (!findRanges?.length) return null
    return buildRenderSegs(text, segments, findRanges)
  }, [text, segments, findRanges])

  useEffect(() => {
    if (isEditing && taRef.current && taRef.current.value !== text) taRef.current.value = text
  }, [text, isEditing])

  useLayoutEffect(() => {
    if (!isEditing || !taRef.current) return
    const ta = taRef.current
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
    ta.focus()
    if (pendingCursor !== null) {
      const pos = Math.min(pendingCursor, ta.value.length)
      ta.setSelectionRange(pos, pos)
    } else if (navCol !== null) {
      const lines = ta.value.split('\n')
      if (navDir === 'down') {
        const pos = Math.min(navCol, lines[0]?.length ?? 0)
        ta.setSelectionRange(pos, pos)
      } else {
        const lastStart = lines.slice(0, -1).reduce((s, l) => s + l.length + 1, 0)
        const pos = lastStart + Math.min(navCol, lines[lines.length - 1]?.length ?? 0)
        ta.setSelectionRange(pos, pos)
      }
    } else {
      const pos = focusAtStart ? 0 : ta.value.length
      ta.setSelectionRange(pos, pos)
    }
    ta.dataset.prev = ta.value
  }, [isEditing, focusAtStart, navCol, navDir])

  const getColOffset = (ta: HTMLTextAreaElement): number => {
    const before = ta.value.slice(0, ta.selectionStart)
    const nl = before.lastIndexOf('\n')
    return nl === -1 ? ta.selectionStart : ta.selectionStart - nl - 1
  }

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>): void => {
    if (suppressBlurRef.current) {
      suppressBlurRef.current = false
      return
    }
    if (e.target.value !== text) onCommit(e.target.value)
    onStopEdit()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.ctrlKey || e.metaKey) {
      if (e.code === 'KeyS') {
        e.preventDefault()
        const ta = e.currentTarget
        if (ta.value !== text) onCommit(ta.value)
        suppressBlurRef.current = true
        onStopEdit()
        window.dispatchEvent(
          new CustomEvent(isSrc ? 'app:save-src' : 'app:save', { bubbles: false })
        )
        onStartEdit()
        return
      }
      if (e.code === 'KeyZ' && !e.shiftKey) {
        e.stopPropagation()
        if (localUndoStack.current.length > 0) {
          e.preventDefault()
          const ta = e.currentTarget
          localRedoStack.current.push(ta.value)
          const prev = localUndoStack.current.pop()!
          ta.value = prev
          ta.dataset.prev = prev
          ta.style.height = 'auto'
          ta.style.height = ta.scrollHeight + 'px'
          ta.setSelectionRange(prev.length, prev.length)
        } else {
          // Only bubble to global undo when the row hasn't been modified
          // (ta.value === text means no local edits pending)
          if (e.currentTarget.value !== text) return
          e.preventDefault()
          onUndo()
        }
        return
      }
      if (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey)) {
        e.stopPropagation()
        if (localRedoStack.current.length > 0) {
          e.preventDefault()
          const ta = e.currentTarget
          localUndoStack.current.push(ta.value)
          const next = localRedoStack.current.pop()!
          ta.value = next
          ta.dataset.prev = next
          ta.style.height = 'auto'
          ta.style.height = ta.scrollHeight + 'px'
          ta.setSelectionRange(next.length, next.length)
        } else {
          if (e.currentTarget.value !== text) return
          e.preventDefault()
          onRedo()
        }
        return
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const ta = e.currentTarget
      suppressBlurRef.current = true
      onEnterPressed(ta.value.slice(0, ta.selectionStart), ta.value.slice(ta.selectionEnd))
      return
    }
    if (e.key === 'Backspace') {
      const ta = e.currentTarget
      if (ta.selectionStart === 0 && ta.selectionEnd === 0) {
        e.preventDefault()
        suppressBlurRef.current = true
        onBackspaceAtStart(ta.value)
      }
      return
    }
    if (e.key === 'ArrowUp') {
      const ta = e.currentTarget
      const { onFirst } = getVisualLineInfo(ta)
      if (onFirst && ta.selectionStart === 0 && ta.selectionEnd === 0) {
        e.preventDefault()
        suppressBlurRef.current = true
        if (ta.value !== text) onCommit(ta.value)
        onNavUp(getColOffset(ta))
      }
      return
    }
    if (e.key === 'ArrowDown') {
      const ta = e.currentTarget
      const { onLast } = getVisualLineInfo(ta)
      if (onLast && ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length) {
        e.preventDefault()
        suppressBlurRef.current = true
        if (ta.value !== text) onCommit(ta.value)
        onNavDown(getColOffset(ta))
      }
      return
    }
    if (e.key === 'ArrowLeft') {
      const ta = e.currentTarget
      if (ta.selectionStart === 0 && ta.selectionEnd === 0) {
        e.preventDefault()
        suppressBlurRef.current = true
        if (ta.value !== text) onCommit(ta.value)
        onNavLeft()
      }
      return
    }
    if (e.key === 'ArrowRight') {
      const ta = e.currentTarget
      if (ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length) {
        e.preventDefault()
        suppressBlurRef.current = true
        if (ta.value !== text) onCommit(ta.value)
        onNavRight()
      }
      return
    }
    if (e.key === 'Escape') {
      suppressBlurRef.current = true
      onStopEdit()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    const pasted = e.clipboardData.getData('text')
    if (!pasted.includes('\n')) return
    e.preventDefault()
    const ta = e.currentTarget
    const before = ta.value.slice(0, ta.selectionStart),
      after = ta.value.slice(ta.selectionEnd)
    const lines = pasted.split('\n')
    lines[0] = before + lines[0]
    lines[lines.length - 1] = lines[lines.length - 1] + after
    suppressBlurRef.current = true
    onMultiLinePaste(lines)
  }

  // ── Render content ────────────────────────────────────────────────────────

  const renderContent = (): React.ReactNode => {
    if (isEmpty) return '\u00a0'
    if (renderSegs) {
      return renderSegs.map((seg, si) => {
        if (seg.kind === 'text') return <span key={si}>{seg.text}</span>
        if (seg.kind === 'glossary')
          return (
            <HL
              key={si}
              seg={{ kind: 'match', text: seg.text, entry: seg.entry }}
              onEnter={showTooltip}
              onLeave={hideTooltip}
            />
          )
        const c = seg.entry ? HL_COLORS[seg.entry.type] : null
        return (
          <span
            key={si}
            style={{
              background: seg.current ? 'rgba(255,180,0,0.55)' : 'rgba(255,180,0,0.2)',
              borderBottom: `1.5px solid ${seg.current ? '#ffb400' : 'rgba(255,180,0,0.5)'}`,
              borderRadius: 2,
              padding: '0 1px',
              fontWeight: seg.current ? 600 : 400,
              color: c ? c.color : 'inherit',
              outline: seg.current ? '1px solid rgba(255,180,0,0.6)' : 'none',
              outlineOffset: '1px'
            }}
            onMouseEnter={
              seg.entry ? (e) => showTooltip(seg.entry!, e.clientX, e.clientY) : undefined
            }
            onMouseLeave={seg.entry ? hideTooltip : undefined}
          >
            {seg.text}
          </span>
        )
      })
    }
    return segments.map((seg, si) =>
      seg.kind === 'text' ? (
        <span key={si}>{seg.text}</span>
      ) : (
        <HL key={si} seg={seg} onEnter={showTooltip} onLeave={hideTooltip} />
      )
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: ROW_H,
        height: '100%',
        background: isActive ? 'var(--accent-dim2)' : 'transparent'
      }}
      onMouseEnter={onMouseEnter}
    >
      <div
        style={{
          width: 'var(--num-w)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          padding: '6px 10px 6px 0',
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          lineHeight: 1.5,
          borderRight: '1px solid var(--border)',
          userSelect: 'none',
          pointerEvents: 'none',
          color: isActive ? 'var(--accent)' : 'var(--text2)'
        }}
      >
        {rowNum}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {editable && isEditing ? (
          <textarea
            ref={taRef}
            defaultValue={text}
            onChange={(e) => {
              const ta = e.currentTarget,
                prev = taRef.current?.dataset.prev ?? text
              if (prev !== ta.value) {
                localUndoStack.current.push(prev)
                if (localUndoStack.current.length > 200) localUndoStack.current.shift()
                localRedoStack.current = []
                ta.dataset.prev = ta.value
              }
              ta.style.height = 'auto'
              ta.style.height = ta.scrollHeight + 'px'
            }}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            style={{
              width: '100%',
              padding: '5px 12px',
              background: 'var(--bg2)',
              border: '1px solid var(--accent)',
              borderRadius: 0,
              color: 'var(--text0)',
              fontFamily: 'var(--font-ui)',
              fontSize: 13,
              lineHeight: 1.7,
              resize: 'none',
              outline: 'none',
              boxSizing: 'border-box',
              height: 'auto',
              overflow: 'hidden'
            }}
          />
        ) : (
          <div
            style={{
              padding: '5px 12px',
              fontFamily: 'var(--font-ui)',
              fontSize: 13,
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              userSelect: 'text',
              color: isEmpty ? 'var(--text2)' : 'var(--text0)',
              fontStyle: isEmpty ? 'italic' : 'normal',
              cursor: editable ? 'text' : 'default'
            }}
            onClick={() => editable && onStartEdit()}
          >
            {renderContent()}
          </div>
        )}
      </div>
    </div>
  )
})

export { ROW_H }
