import { useRef, useState, useEffect, useCallback, useMemo, memo, JSX } from 'react'
import type { GlossaryEntry } from '../../types'
import { AudioPlayer } from '../AudioPlayer'
import { FindBar } from './FindBar'
import { ContextMenu } from './ContextMenu'
import { TranslatePopup } from './TranslatePopup'
import { VRowPair } from './VRowPair'
import { escapeRe } from './findHighlight'
import type { FindMatch, FindRange } from './findHighlight'
import { filterUsedGlossariesFromRecord, preprocessForTts } from '../../utils/ttsPreprocess'
import { hideTooltip } from '../common/tooltipUtils'
import type { GlossaryLibraries } from '../../utils/glossaryLoader'
import type { ToneName, VoiceGender } from '../../constants/tones'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CtxMenuState {
  x: number
  y: number
  selectedText: string
  rowIndex: number | null
}
interface TranslatePopupState {
  x: number
  y: number
  selectedText: string
}

export interface DualViewProps {
  srcContent: string
  tgtContent: string
  glossary: GlossaryEntry[]
  onTgtChange: (content: string) => void
  onSrcChange?: (content: string) => void
  onUndo: () => void
  onRedo: () => void
  onSrcUndo: () => void
  onSrcRedo: () => void
  activeRow: number
  onRowFocus: (row: number) => void
  tgtLabel?: string
  srcLabel?: string
  tgtColor?: string
  srcColor?: string
  onCopyTgt?: () => void
  onCopySrc?: () => void
  onSrcSave?: () => void
  onAddToGlossary?: (text: string) => void
  onSendToParaphrase?: (text: string) => void
  ttsConfig?: {
    apiUrl?: string
    apiKey?: string
    voiceGender?: string
    voiceName?: string
    rate?: string
    outputPath?: string
  }
  ttsGlossaries?: GlossaryLibraries
  onSaveTtsAudio?: (base64: string, defaultName: string) => Promise<void>
  getLineTone?: (lineIndex: number) => ToneName
  setLineTone?: (lineIndex: number, tone: ToneName) => void
  getLineVoiceGender?: (lineIndex: number) => VoiceGender
  setLineVoiceGender?: (lineIndex: number, gender: VoiceGender) => void
}

// ─── ColHeader ────────────────────────────────────────────────────────────────

const ColHeader = memo(function ColHeader({
  color,
  label,
  onCopy,
  style: extra
}: {
  color: string
  label: string
  onCopy?: () => void
  style?: React.CSSProperties
}) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '5px 12px',
        paddingLeft: 'calc(var(--num-w) + 12px)',
        borderRight: '1px solid var(--border)',
        ...extra
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: color,
          display: 'inline-block',
          flexShrink: 0
        }}
      />
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text2)',
          letterSpacing: '0.07em',
          flex: 1
        }}
      >
        {label}
      </span>
      {onCopy && (
        <button
          onClick={() => {
            onCopy()
            setCopied(true)
            if (timerRef.current) clearTimeout(timerRef.current)
            timerRef.current = setTimeout(() => setCopied(false), 1500)
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 6px',
            color: copied ? 'var(--hl-teal)' : 'var(--text2)',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            borderRadius: 3,
            transition: 'color 0.15s',
            flexShrink: 0
          }}
        >
          {copied ? '✓ copied' : 'copy'}
        </button>
      )}
    </div>
  )
})

// ─── Main DualView ────────────────────────────────────────────────────────────

export function DualView({
  srcContent,
  tgtContent,
  glossary,
  onTgtChange,
  onSrcChange,
  onUndo,
  onRedo,
  onSrcUndo,
  onSrcRedo,
  activeRow,
  onRowFocus,
  tgtLabel = 'TRANSLATION',
  srcLabel = 'SOURCE',
  tgtColor = '#3ecfa0',
  srcColor = '#5b8af0',
  onCopyTgt,
  onCopySrc,
  onAddToGlossary,
  onSendToParaphrase,
  ttsConfig,
  ttsGlossaries,
  onSaveTtsAudio,
  getLineTone,
  setLineTone,
  getLineVoiceGender,
  setLineVoiceGender
}: DualViewProps): JSX.Element {
  // ── Split column ────────────────────────────────────────────────────────────
  const [splitPos, setSplitPos] = useState(50)
  const splitDragRef = useRef(false)

  const onSplitMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    splitDragRef.current = true
    const wrap = (e.currentTarget as HTMLElement).closest('[data-dualview]') as HTMLElement
    const onMove = (ev: MouseEvent): void => {
      if (!splitDragRef.current) return
      const rect = wrap?.getBoundingClientRect()
      if (!rect) return
      setSplitPos(Math.max(20, Math.min(80, ((ev.clientX - rect.left) / rect.width) * 100)))
    }
    const onUp = (): void => {
      splitDragRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  // ── Context menu / TTS / translate ─────────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)
  const [translatePopup, setTranslatePopup] = useState<TranslatePopupState | null>(null)
  const [ttsBlobUrl, setTtsBlobUrl] = useState<string | null>(null)
  const [ttsLoading, setTtsLoading] = useState(false)
  const [ttsBytes, setTtsBytes] = useState<string | null>(null)

  // Revoke any outstanding blob URL when the component unmounts
  useEffect(() => {
    return () => {
      setTtsBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setTtsBytes(null)
    }
  }, [])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    const sel = window.getSelection()?.toString().trim()
    if (!sel) return
    e.preventDefault()

    // Find which row was right-clicked
    let rowIdx: number | null = null
    const target = e.target as HTMLElement
    const rowElem = target.closest('[data-row-index]')
    if (rowElem) {
      const idx = rowElem.getAttribute('data-row-index')
      rowIdx = idx ? parseInt(idx, 10) : null
    }

    setCtxMenu({ x: e.clientX, y: e.clientY, selectedText: sel, rowIndex: rowIdx })
  }, [])

  const handleTts = useCallback(
    async (text: string, rowIndex?: number | null) => {
      if (ttsLoading) return
      setTtsLoading(true)
      setTtsBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setTtsBytes(null)
      try {
        const processed = preprocessForTts(text, glossary)
        const filteredBfLib = filterUsedGlossariesFromRecord(text, ttsGlossaries?.bf_lib)
        const filteredAtLib = filterUsedGlossariesFromRecord(text, ttsGlossaries?.at_lib)

        // If rowIndex is provided and we have getLineTone, use Novel TTS API with per-line tone
        if (rowIndex !== undefined && rowIndex !== null && getLineTone && ttsConfig?.apiUrl) {
          const { getToneConfig } = await import('../../constants/tones')
          const toneName = getLineTone(rowIndex)
          const voiceGender = getLineVoiceGender?.(rowIndex) || ttsConfig?.voiceGender || 'female'
          const genderKey = (voiceGender.toLowerCase() === 'female' ? 'female' : 'male') as
            | 'female'
            | 'male'
          const toneConfig = getToneConfig(toneName, genderKey)

          // Call Novel TTS API directly with tone config
          const apiUrl = (ttsConfig.apiUrl || 'https://novelttsapi.onrender.com').trim()
          const response = await fetch(`${apiUrl}/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              text: processed,
              bf_lib: filteredBfLib,
              at_lib: filteredAtLib,
              rate_pct: toneConfig.rate_pct,
              pitch_hz: toneConfig.pitch_hz,
              volume_pct: toneConfig.volume_pct,
              voice_gender: voiceGender,
              voice_name: ttsConfig?.voiceName || undefined,
              lang: 'th'
            })
          })

          if (!response.ok) throw new Error(`Novel TTS API Error: ${response.status}`)
          const arrayBuffer = await response.arrayBuffer()
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
          setTtsBlobUrl(
            URL.createObjectURL(new Blob([new Uint8Array(arrayBuffer)], { type: 'audio/mpeg' }))
          )
          setTtsBytes(base64)
        } else {
          // Fallback to electron IPC
          const ttsResponse = await window.electron.tts(processed, {
            apiUrl: ttsConfig?.apiUrl,
            apiKey: ttsConfig?.apiKey,
            voiceGender: ttsConfig?.voiceGender,
            voiceName: ttsConfig?.voiceName || undefined,
            rate: ttsConfig?.rate,
            bf_lib: filteredBfLib,
            at_lib: filteredAtLib
          })
          const base64 = ttsResponse.data
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
          setTtsBlobUrl(URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' })))
          setTtsBytes(base64)
        }
      } catch (e) {
        console.error('TTS failed:', e)
      } finally {
        setTtsLoading(false)
      }
    },
    [ttsLoading, glossary, ttsConfig, ttsGlossaries, getLineTone, getLineVoiceGender]
  )

  // ── Row editing ─────────────────────────────────────────────────────────────
  const [editingRow, setEditingRow] = useState<number | null>(null)
  const [editingCol, setEditingCol] = useState<'tgt' | 'src'>('tgt')
  const [focusAtStart, setFocusAtStart] = useState(false)
  const [navCol, setNavCol] = useState<number | null>(null)
  const [navDir, setNavDir] = useState<'up' | 'down' | null>(null)
  const [pendingCursor, setPendingCursor] = useState<number | null>(null)

  useEffect(() => {
    if (navCol === null) return
    const t = requestAnimationFrame(() => {
      setNavCol(null)
      setNavDir(null)
    })
    return () => cancelAnimationFrame(t)
  }, [navCol, editingRow])

  useEffect(() => {
    if (pendingCursor === null) return
    const t = requestAnimationFrame(() => setPendingCursor(null))
    return () => cancelAnimationFrame(t)
  }, [pendingCursor, editingRow])

  // ── Find & Replace ──────────────────────────────────────────────────────────
  const [findOpen, setFindOpen] = useState(false)
  const [isReplace, setIsReplace] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [replaceVal, setReplaceVal] = useState('')
  const [findCase, setFindCase] = useState(false)
  const [findWhole, setFindWhole] = useState(false)
  const [activeMatchIdx, setActiveMatchIdx] = useState(0)
  const findInputRef = useRef<HTMLInputElement>(null)

  const srcRows = useMemo(() => srcContent.split('\n'), [srcContent])
  const tgtRows = useMemo(() => tgtContent.split('\n'), [tgtContent])
  const rowCount = Math.max(srcRows.length, tgtRows.length)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollIntoView = useCallback((i: number) => {
    const el = scrollRef.current
    if (!el) return
    const rows = el.querySelectorAll<HTMLElement>('[data-row]')
    const target = rows[i]
    if (!target) return
    const { top, bottom } = target.getBoundingClientRect()
    const { top: cTop, bottom: cBottom } = el.getBoundingClientRect()
    if (top < cTop) el.scrollTop -= cTop - top - 4
    else if (bottom > cBottom) el.scrollTop += bottom - cBottom + 4
  }, [])

  useEffect(() => {
    if (editingRow !== null) scrollIntoView(editingRow)
  }, [editingRow, scrollIntoView])

  // ── Find matches ────────────────────────────────────────────────────────────
  const findMatches = useMemo((): FindMatch[] => {
    if (!findQuery.trim() || !findOpen) return []
    try {
      const pat = findWhole ? `\\b${escapeRe(findQuery)}\\b` : escapeRe(findQuery)
      const re = new RegExp(pat, findCase ? 'g' : 'gi')
      const all: FindMatch[] = []
      const searchRows = (rows: string[], col: 'tgt' | 'src'): void => {
        rows.forEach((text, rowIndex) => {
          re.lastIndex = 0
          let m: RegExpExecArray | null
          while ((m = re.exec(text)) !== null)
            all.push({ rowIndex, col, start: m.index, end: m.index + m[0].length })
        })
      }
      searchRows(tgtRows, 'tgt')
      searchRows(srcRows, 'src')
      return all.sort((a, b) =>
        a.rowIndex !== b.rowIndex
          ? a.rowIndex - b.rowIndex
          : a.col !== b.col
            ? a.col === 'tgt'
              ? -1
              : 1
            : a.start - b.start
      )
    } catch {
      return []
    }
  }, [findQuery, findOpen, findCase, findWhole, tgtRows, srcRows])

  const safeActiveIdx =
    findMatches.length > 0 ? Math.min(activeMatchIdx, findMatches.length - 1) : 0

  useEffect(() => {
    if (!findOpen || findMatches.length === 0) return
    const m = findMatches[safeActiveIdx]
    if (m) scrollIntoView(m.rowIndex)
  }, [findMatches, findOpen, scrollIntoView, safeActiveIdx])

  const findByRow = useMemo(() => {
    const map = new Map<number, { tgt: FindRange[]; src: FindRange[] }>()
    findMatches.forEach((m, idx) => {
      if (!map.has(m.rowIndex)) map.set(m.rowIndex, { tgt: [], src: [] })
      map
        .get(m.rowIndex)!
        [m.col].push({ start: m.start, end: m.end, current: idx === safeActiveIdx })
    })
    return map
  }, [findMatches, safeActiveIdx])

  const goNext = useCallback(() => {
    if (findMatches.length) setActiveMatchIdx((i) => (i + 1) % findMatches.length)
  }, [findMatches.length])
  const goPrev = useCallback(() => {
    if (findMatches.length)
      setActiveMatchIdx((i) => (i - 1 + findMatches.length) % findMatches.length)
  }, [findMatches.length])

  const handleReplaceOne = useCallback(() => {
    if (!findMatches.length) return
    const m = findMatches[Math.min(activeMatchIdx, findMatches.length - 1)]
    if (!m) return
    if (m.col === 'tgt') {
      const rows = [...tgtRows]
      rows[m.rowIndex] =
        rows[m.rowIndex].slice(0, m.start) + replaceVal + rows[m.rowIndex].slice(m.end)
      onTgtChange(rows.join('\n'))
    } else {
      const rows = [...srcRows]
      rows[m.rowIndex] =
        rows[m.rowIndex].slice(0, m.start) + replaceVal + rows[m.rowIndex].slice(m.end)
      onSrcChange?.(rows.join('\n'))
    }
  }, [findMatches, activeMatchIdx, replaceVal, tgtRows, srcRows, onTgtChange, onSrcChange])

  const handleReplaceAll = useCallback(() => {
    if (!findQuery.trim()) return
    try {
      const pat = findWhole ? `\\b${escapeRe(findQuery)}\\b` : escapeRe(findQuery)
      const re = new RegExp(pat, findCase ? 'g' : 'gi')
      const newTgt = tgtContent.replace(re, replaceVal)
      if (newTgt !== tgtContent) onTgtChange(newTgt)
      const newSrc = srcContent.replace(re, replaceVal)
      if (newSrc !== srcContent) onSrcChange?.(newSrc)
      setActiveMatchIdx(0)
    } catch {
      /* invalid regex */
    }
  }, [findQuery, findCase, findWhole, replaceVal, tgtContent, srcContent, onTgtChange, onSrcChange])

  // ── Keyboard: Ctrl+F / Ctrl+H / Alt+C / Alt+W ──────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.code === 'KeyF') {
        e.preventDefault()
        e.stopPropagation()
        setFindOpen(true)
        setIsReplace(false)
        requestAnimationFrame(() => findInputRef.current?.focus())
        return
      }
      if (e.code === 'KeyH') {
        e.preventDefault()
        e.stopPropagation()
        setFindOpen(true)
        setIsReplace(true)
        requestAnimationFrame(() => findInputRef.current?.focus())
        return
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!findOpen || !e.altKey) return
      if (e.code === 'KeyC') {
        e.preventDefault()
        setFindCase((v) => !v)
      }
      if (e.code === 'KeyW') {
        e.preventDefault()
        setFindWhole((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [findOpen])

  // ── Row mutation handlers ───────────────────────────────────────────────────
  const handleTgtEdit = useCallback(
    (idx: number, value: string) => {
      const rows = [...tgtRows]
      rows[idx] = value
      onTgtChange(rows.join('\n'))
    },
    [tgtRows, onTgtChange]
  )

  const handleEnter = useCallback(
    (idx: number, before: string, after: string) => {
      const rows = [...tgtRows]
      rows[idx] = before
      rows.splice(idx + 1, 0, after)
      onTgtChange(rows.join('\n'))
      setFocusAtStart(true)
      setEditingRow(idx + 1)
      if (idx === tgtRows.length - 1)
        requestAnimationFrame(() => {
          if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        })
    },
    [tgtRows, onTgtChange]
  )

  const handleMultiLinePaste = useCallback(
    (idx: number, lines: string[]) => {
      const rows = [...tgtRows]
      rows.splice(idx, 1, ...lines)
      onTgtChange(rows.join('\n'))
      setFocusAtStart(false)
      setEditingRow(idx + lines.length - 1)
    },
    [tgtRows, onTgtChange]
  )

  const handleNavUp = useCallback((col: number, rowIdx: number) => {
    if (rowIdx === 0) return
    setFocusAtStart(false)
    setNavCol(col)
    setNavDir('up')
    setPendingCursor(null)
    setEditingRow(rowIdx - 1)
  }, [])
  const handleNavDown = useCallback((_col: number, rowIdx: number, maxRow: number) => {
    if (rowIdx >= maxRow) return
    setFocusAtStart(true)
    setNavCol(null)
    setNavDir(null)
    setPendingCursor(null)
    setEditingRow(rowIdx + 1)
  }, [])
  const handleNavLeft = useCallback((rowIdx: number) => {
    if (rowIdx === 0) return
    setFocusAtStart(false)
    setNavCol(null)
    setNavDir(null)
    setPendingCursor(null)
    setEditingRow(rowIdx - 1)
  }, [])
  const handleNavRight = useCallback((rowIdx: number, maxRow: number) => {
    if (rowIdx >= maxRow) return
    setFocusAtStart(true)
    setNavCol(null)
    setNavDir(null)
    setPendingCursor(null)
    setEditingRow(rowIdx + 1)
  }, [])

  const handleBackspaceAtStart = useCallback(
    (rowIdx: number, currentText: string) => {
      if (rowIdx === 0) return
      const rows = [...tgtRows]
      const prevText = rows[rowIdx - 1] ?? ''
      rows[rowIdx - 1] = prevText + currentText
      rows.splice(rowIdx, 1)
      onTgtChange(rows.join('\n'))
      setPendingCursor(prevText.length - 1)
      setNavCol(null)
      setNavDir(null)
      setFocusAtStart(false)
      setEditingRow(rowIdx - 1)
    },
    [tgtRows, onTgtChange]
  )

  const handleSrcEdit = useCallback(
    (idx: number, value: string) => {
      const rows = [...srcRows]
      rows[idx] = value
      onSrcChange?.(rows.join('\n'))
    },
    [srcRows, onSrcChange]
  )
  const handleSrcEnter = useCallback(
    (idx: number, before: string, after: string) => {
      const rows = [...srcRows]
      rows[idx] = before
      rows.splice(idx + 1, 0, after)
      onSrcChange?.(rows.join('\n'))
      setFocusAtStart(true)
      setEditingRow(idx + 1)
    },
    [srcRows, onSrcChange]
  )
  const handleSrcMultiLinePaste = useCallback(
    (idx: number, lines: string[]) => {
      const rows = [...srcRows]
      rows.splice(idx, 1, ...lines)
      onSrcChange?.(rows.join('\n'))
      setFocusAtStart(false)
      setEditingRow(idx + lines.length - 1)
    },
    [srcRows, onSrcChange]
  )
  const handleSrcBackspaceAtStart = useCallback(
    (rowIdx: number, currentText: string) => {
      if (rowIdx === 0) return
      const rows = [...srcRows]
      const prevText = rows[rowIdx - 1] ?? ''
      rows[rowIdx - 1] = prevText + currentText
      rows.splice(rowIdx, 1)
      onSrcChange?.(rows.join('\n'))
      setPendingCursor(prevText.length - 1)
      setNavCol(null)
      setNavDir(null)
      setFocusAtStart(false)
      setEditingRow(rowIdx - 1)
    },
    [srcRows, onSrcChange]
  )

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        overflow: 'hidden',
        position: 'relative'
      }}
      data-dualview
    >
      {/* Column headers */}
      <div
        style={{
          display: 'flex',
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0
        }}
      >
        <ColHeader
          color={tgtColor}
          label={tgtLabel}
          onCopy={onCopyTgt}
          style={{ flex: `0 0 ${splitPos}%` }}
        />
        <div
          style={{ width: 4, background: 'var(--border)', cursor: 'col-resize', flexShrink: 0 }}
          onMouseDown={onSplitMouseDown}
        />
        <ColHeader color={srcColor} label={srcLabel} onCopy={onCopySrc} style={{ flex: 1 }} />
      </div>

      {/* Find & Replace bar */}
      <FindBar
        open={findOpen}
        isReplace={isReplace}
        query={findQuery}
        replaceVal={replaceVal}
        matchCount={findMatches.length}
        activeIdx={safeActiveIdx}
        caseSensitive={findCase}
        wholeWord={findWhole}
        onQueryChange={setFindQuery}
        onReplaceChange={setReplaceVal}
        onNext={goNext}
        onPrev={goPrev}
        onReplaceOne={handleReplaceOne}
        onReplaceAll={handleReplaceAll}
        onToggleCase={() => setFindCase((v) => !v)}
        onToggleWhole={() => setFindWhole((v) => !v)}
        onClose={() => setFindOpen(false)}
        inputRef={findInputRef}
      />

      {/* Row list */}
      <div
        style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}
        ref={scrollRef}
        onContextMenu={handleContextMenu}
      >
        <div>
          {Array.from({ length: rowCount }, (_, i) => {
            const rowFind = findByRow.get(i)
            const currentTone = getLineTone ? (getLineTone(i) as ToneName) : 'normal'
            const currentVoiceGender: VoiceGender = (getLineVoiceGender?.(i) ||
              'female') as VoiceGender
            return (
              <VRowPair
                key={i}
                rowIndex={i}
                rowNum={i + 1}
                tgtText={(tgtRows[i] ?? '').replace('\r', '')}
                srcText={(srcRows[i] ?? '').replace('\r', '')}
                glossary={glossary}
                isActive={activeRow === i}
                onMouseEnter={onRowFocus}
                isEditing={editingRow === i}
                editingCol={editingRow === i ? editingCol : 'tgt'}
                onStartEdit={(idx, col) => {
                  hideTooltip() // ปิด tooltip ทันที
                  setEditingRow(idx)
                  setEditingCol(col)
                }}
                onStopEdit={setEditingRow}
                onCommit={handleTgtEdit}
                onSrcCommit={handleSrcEdit}
                onUndo={onUndo}
                onRedo={onRedo}
                onSrcUndo={onSrcUndo}
                onSrcRedo={onSrcRedo}
                onEnterPressed={handleEnter}
                onSrcEnterPressed={handleSrcEnter}
                onMultiLinePaste={handleMultiLinePaste}
                onSrcMultiLinePaste={handleSrcMultiLinePaste}
                onBackspaceAtStart={handleBackspaceAtStart}
                onSrcBackspaceAtStart={handleSrcBackspaceAtStart}
                focusAtStart={editingRow === i && focusAtStart}
                pendingCursor={editingRow === i ? pendingCursor : null}
                onNavUp={(col) => handleNavUp(col, i)}
                onNavDown={(col) => handleNavDown(col, i, rowCount - 1)}
                onNavLeft={() => handleNavLeft(i)}
                onNavRight={() => handleNavRight(i, rowCount - 1)}
                navCol={editingRow === i ? navCol : null}
                navDir={editingRow === i ? navDir : null}
                tgtFindRanges={rowFind?.tgt}
                srcFindRanges={rowFind?.src}
                splitPos={splitPos}
                tone={currentTone}
                onToneChange={setLineTone ? (tone) => setLineTone(i, tone) : undefined}
                voiceGender={currentVoiceGender}
                onVoiceGenderChange={
                  setLineVoiceGender ? (gender) => setLineVoiceGender(i, gender) : undefined
                }
              />
            )
          })}
        </div>
      </div>

      {/* Overlays */}
      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          rowIndex={ctxMenu.rowIndex}
          onTranslate={(text, x, y) => setTranslatePopup({ selectedText: text, x, y })}
          onTts={handleTts}
          onAddToGlossary={onAddToGlossary}
          onSendToParaphrase={onSendToParaphrase}
          onClose={() => setCtxMenu(null)}
        />
      )}
      {translatePopup && (
        <TranslatePopup popup={translatePopup} onClose={() => setTranslatePopup(null)} />
      )}

      {ttsLoading && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 12,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '5px 12px',
            fontSize: 11,
            color: 'var(--hl-coral)',
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            zIndex: 9000,
            pointerEvents: 'none'
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          กำลังสังเคราะห์เสียง…
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {ttsBlobUrl && !ttsLoading && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 12,
            zIndex: 9000,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            borderRadius: 8,
            overflow: 'visible',
            width: 380,
            display: 'flex',
            flexDirection: 'column',
            gap: 4
          }}
        >
          {/* 💾 Save MP3 button — appears above the audio player */}
          {ttsBytes && onSaveTtsAudio && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
                  onSaveTtsAudio(ttsBytes, `tts_${ts}.mp3`)
                }}
                style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: 5,
                  padding: '3px 11px',
                  color: 'var(--text1)',
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                }}
              >
                💾 Save MP3
              </button>
            </div>
          )}
          {/* Audio player */}
          <div style={{ borderRadius: 8, overflow: 'hidden' }}>
            <AudioPlayer
              key={ttsBlobUrl}
              filePath={ttsBlobUrl}
              autoPlay
              compact
              onClose={() =>
                setTtsBlobUrl((prev) => {
                  if (prev) URL.revokeObjectURL(prev)
                  return null
                })
              }
            />
          </div>
        </div>
      )}
    </div>
  )
}
