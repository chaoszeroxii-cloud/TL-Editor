import { useRef, useState, useEffect, useCallback, useMemo, memo, JSX } from 'react'
import type { GlossaryEntry } from '../../types'
import { AudioPlayer } from '../AudioPlayer'
import { FindBar } from './FindBar'
import { ContextMenu } from './ContextMenu'
import { TranslatePopup } from './TranslatePopup'
import { VRowPair } from './VRowPair'
import { DiffHunkBlock } from './DiffHunkBlock'
import type { DiffHunk } from '../AIChatPanel/anchorMatch'
import type { FindMatch, FindRange } from './findHighlight'
import {
  filterUsedGlossariesFromRecord,
  preprocessForTtsFromRecords
} from '../../utils/ttsPreprocess'
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

const WORD_CHAR_RE = /[\p{L}\p{N}_]/u

function isWordChar(char: string | undefined): boolean {
  return !!char && WORD_CHAR_RE.test(char)
}

function findLiteralMatchRanges(
  text: string,
  query: string,
  caseSensitive: boolean,
  wholeWord: boolean
): Array<{ start: number; end: number }> {
  if (!query) return []

  const haystack = caseSensitive ? text : text.toLocaleLowerCase()
  const needle = caseSensitive ? query : query.toLocaleLowerCase()
  const matches: Array<{ start: number; end: number }> = []

  let fromIndex = 0
  while (fromIndex <= haystack.length - needle.length) {
    const start = haystack.indexOf(needle, fromIndex)
    if (start === -1) break

    const end = start + needle.length
    const before = text[start - 1]
    const after = text[end]
    const wholeWordOk = !wholeWord || (!isWordChar(before) && !isWordChar(after))

    if (wholeWordOk) matches.push({ start, end })
    fromIndex = start + Math.max(needle.length, 1)
  }

  return matches
}

const hudBtnStyle: React.CSSProperties = {
  background: 'var(--bg3)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text1)',
  cursor: 'pointer',
  fontSize: 11,
  lineHeight: 1,
  padding: '3px 7px'
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
    playbackVolume?: number
  }
  ttsGlossaries?: GlossaryLibraries
  onSaveTtsAudio?: (audio: string | Uint8Array, defaultName: string) => Promise<void>
  getLineTone?: (lineIndex: number) => ToneName
  setLineTone?: (lineIndex: number, tone: ToneName) => void
  getLineVoiceGender?: (lineIndex: number) => VoiceGender
  setLineVoiceGender?: (lineIndex: number, gender: VoiceGender) => void
  showToneControls?: boolean
  flaggedRows?: Map<number, string>
  /** Polish one (usually flagged) TGT line via the AI agent. */
  onPolishLine?: (rowIndex: number, srcLine: string, tgtLine: string, flagNote: string) => void
  /** Staged AI edits mapped to current TGT row ranges (inline ghost diffs). */
  diffHunks?: DiffHunk[]
  onAcceptDiff?: (editId: string) => void
  onDenyDiff?: (editId: string) => void
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
  setLineVoiceGender,
  showToneControls = false,
  flaggedRows,
  onPolishLine,
  diffHunks,
  onAcceptDiff,
  onDenyDiff
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
  const [ttsError, setTtsError] = useState<string | null>(null)
  const [ttsBytes, setTtsBytes] = useState<Uint8Array | null>(null)
  const [ttsBase64, setTtsBase64] = useState<string | null>(null)
  const [activeStreamRow, setActiveStreamRow] = useState<number | null>(null)

  // Refs for streaming — stable across renders, no stale closure issues
  const audioRef = useRef<HTMLAudioElement>(null)
  const activeWsRef = useRef<WebSocket | null>(null)
  const activeMsUrlRef = useRef<string | null>(null)
  const activeStreamRowRef = useRef<number | null>(null)
  // Full MSE teardown needs handles to the live MediaSource, its SourceBuffer,
  // and a per-stream AbortController that owns every listener — so stopping a
  // stream actually releases the buffered MP3 (held in renderer media memory,
  // off the JS heap, which is why it never showed up in performance.memory).
  const activeMsRef = useRef<MediaSource | null>(null)
  const activeSbRef = useRef<SourceBuffer | null>(null)
  const streamAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    activeStreamRowRef.current = activeStreamRow
  }, [activeStreamRow])

  const stopStream = useCallback(() => {
    // Detach every listener attached for this stream (sourceopen/updateend/ended)
    // in one shot. Interrupted streams previously left {once:true} 'ended'
    // listeners dangling on the shared <audio>, and the SourceBuffer was never
    // released — so each play leaked ~50MB of buffered audio that never came back.
    streamAbortRef.current?.abort()
    streamAbortRef.current = null

    activeWsRef.current?.close()
    activeWsRef.current = null

    // Release the SourceBuffer + MediaSource so the buffered MP3 (media memory,
    // not the JS heap) is actually freed.
    const ms = activeMsRef.current
    const sb = activeSbRef.current
    if (ms && sb) {
      try {
        if (sb.updating) sb.abort()
      } catch {
        /* ignore */
      }
      try {
        ms.removeSourceBuffer(sb)
      } catch {
        /* ignore */
      }
    }
    if (ms) {
      try {
        if (ms.readyState === 'open') ms.endOfStream()
      } catch {
        /* ignore */
      }
    }
    activeSbRef.current = null
    activeMsRef.current = null

    if (audioRef.current) {
      audioRef.current.pause()
      // removeAttribute + load() forces the element to drop its reference to the
      // detached MediaSource (src = '' alone can keep it pinned in memory).
      audioRef.current.removeAttribute('src')
      audioRef.current.load()
    }
    if (activeMsUrlRef.current) {
      URL.revokeObjectURL(activeMsUrlRef.current)
      activeMsUrlRef.current = null
    }
    setActiveStreamRow(null)
  }, [])

  // Revoke any outstanding blob URL when the component unmounts
  useEffect(() => {
    return () => {
      setTtsBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setTtsBytes(null)
      setTtsBase64(null)
      stopStream()
    }
  }, [stopStream])

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
      // ── Row path: WebSocket /ws/stream → real-time MSE playback ────────────
      if (rowIndex !== undefined && rowIndex !== null && getLineTone && ttsConfig?.apiUrl) {
        // Toggle: same row → stop
        if (activeStreamRowRef.current === rowIndex) {
          stopStream()
          return
        }
        stopStream()

        const filteredBfLib = filterUsedGlossariesFromRecord(text, ttsGlossaries?.bf_lib)
        const filteredAtLib = filterUsedGlossariesFromRecord(text, ttsGlossaries?.at_lib)
        const processed = preprocessForTtsFromRecords(text, filteredBfLib, filteredAtLib)

        const { getToneConfig } = await import('../../constants/tones')
        const toneName = getLineTone(rowIndex)
        const voiceGender = getLineVoiceGender?.(rowIndex) || ttsConfig.voiceGender || 'female'
        const genderKey = (voiceGender.toLowerCase() === 'female' ? 'female' : 'male') as
          | 'female'
          | 'male'
        const toneConfig = getToneConfig(toneName, genderKey)

        const apiUrl = (ttsConfig.apiUrl || 'https://novelttsapi-0mv2.onrender.com')
          .trim()
          .replace(/\/$/, '')
        const wsUrl = apiUrl.replace(/^http/, 'ws') + '/ws/stream'

        if (!MediaSource.isTypeSupported('audio/mpeg')) {
          setTtsError('MSE audio/mpeg not supported in this environment')
          return
        }

        const ms = new MediaSource()
        const msUrl = URL.createObjectURL(ms)
        activeMsUrlRef.current = msUrl
        activeMsRef.current = ms
        const ctrl = new AbortController()
        streamAbortRef.current = ctrl

        const audio = audioRef.current!
        audio.volume = ttsConfig.playbackVolume ?? 0.35
        audio.src = msUrl

        setActiveStreamRow(rowIndex)
        setTtsError(null)

        ms.addEventListener(
          'sourceopen',
          () => {
            let sb: SourceBuffer
            try {
              sb = ms.addSourceBuffer('audio/mpeg')
            } catch {
              setTtsError('ไม่สามารถเริ่ม audio stream ได้')
              stopStream()
              return
            }
            activeSbRef.current = sb

            const queue: ArrayBuffer[] = []
            let wsEnded = false
            let appending = false

            const flush = (): void => {
              if (appending || queue.length === 0 || ms.readyState !== 'open') return
              appending = true
              try {
                sb.appendBuffer(queue.shift()!)
              } catch {
                appending = false
              }
            }

            sb.addEventListener(
              'updateend',
              () => {
                appending = false
                if (wsEnded && queue.length === 0) {
                  try {
                    if (ms.readyState === 'open') ms.endOfStream()
                  } catch {
                    /* ignore */
                  }
                } else {
                  flush()
                }
              },
              { signal: ctrl.signal }
            )

            const ws = new WebSocket(wsUrl)
            ws.binaryType = 'arraybuffer'
            activeWsRef.current = ws

            ws.onopen = () => {
              ws.send(
                JSON.stringify({
                  text: processed,
                  bf_lib: filteredBfLib,
                  at_lib: filteredAtLib,
                  rate_pct: toneConfig.rate_pct,
                  pitch_hz: toneConfig.pitch_hz,
                  volume_pct: toneConfig.volume_pct,
                  voice_gender: voiceGender,
                  voice_name: ttsConfig.voiceName || null,
                  lang: 'th',
                  append_end: false
                })
              )
            }

            ws.onmessage = (event) => {
              if (event.data instanceof ArrayBuffer && event.data.byteLength > 0) {
                queue.push(event.data)
                flush()
                if (audio.paused) audio.play().catch(() => {})
              } else if (typeof event.data === 'string') {
                if (event.data === 'END') {
                  wsEnded = true
                  if (!appending && queue.length === 0 && ms.readyState === 'open') {
                    try {
                      ms.endOfStream()
                    } catch {
                      /* ignore */
                    }
                  }
                } else if (event.data.startsWith('ERROR:')) {
                  setTtsError(event.data.slice(7).trim())
                  setActiveStreamRow(null)
                }
              }
            }

            ws.onerror = () => {
              setTtsError('WebSocket เชื่อมต่อล้มเหลว')
              setActiveStreamRow(null)
            }

            ws.onclose = () => {
              if (activeWsRef.current === ws) activeWsRef.current = null
            }
          },
          { once: true, signal: ctrl.signal }
        )

        audio.addEventListener(
          'ended',
          () => {
            // Natural finish: tear down the same way as an explicit stop so the
            // buffered audio is released instead of lingering for the session.
            if (activeMsUrlRef.current === msUrl) stopStream()
          },
          { once: true, signal: ctrl.signal }
        )

        return
      }

      // ── Non-row path: IPC /generate (context menu TTS) ─────────────────────
      if (ttsLoading) return
      setTtsLoading(true)
      setTtsError(null)
      setTtsBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setTtsBytes(null)
      setTtsBase64(null)
      try {
        const filteredBfLib = filterUsedGlossariesFromRecord(text, ttsGlossaries?.bf_lib)
        const filteredAtLib = filterUsedGlossariesFromRecord(text, ttsGlossaries?.at_lib)
        const processed = preprocessForTtsFromRecords(text, filteredBfLib, filteredAtLib)
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
        setTtsBytes(bytes)
        setTtsBase64(base64)
      } catch (e) {
        console.error('TTS failed:', e)
        setTtsError(e instanceof Error ? e.message : 'TTS ล้มเหลว')
      } finally {
        setTtsLoading(false)
      }
    },
    [ttsLoading, stopStream, ttsConfig, ttsGlossaries, getLineTone, getLineVoiceGender]
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

  const [debouncedQuery, setDebouncedQuery] = useState('')
  useEffect(() => {
    if (!findQuery.trim()) {
      setDebouncedQuery('')
      return
    }
    const id = setTimeout(() => setDebouncedQuery(findQuery), 200)
    return () => clearTimeout(id)
  }, [findQuery])

  const srcRows = useMemo(() => srcContent.split('\n'), [srcContent])
  const tgtRows = useMemo(() => tgtContent.split('\n'), [tgtContent])
  const cleanSrcRows = useMemo(() => srcRows.map((row) => row.replace('\r', '')), [srcRows])
  const cleanTgtRows = useMemo(() => tgtRows.map((row) => row.replace('\r', '')), [tgtRows])
  const rowCount = Math.max(srcRows.length, tgtRows.length)
  const rowIndexes = useMemo(() => Array.from({ length: rowCount }, (_, i) => i), [rowCount])
  const scrollRef = useRef<HTMLDivElement>(null)

  // Map every TGT row covered by a staged AI edit → its hunk (inline ghost diffs).
  const coveredRowToHunk = useMemo(() => {
    const covered = new Map<number, DiffHunk>()
    for (const h of diffHunks ?? []) {
      for (let r = h.startRow; r <= h.endRow; r++) covered.set(r, h)
    }
    return covered
  }, [diffHunks])

  const scrollIntoView = useCallback((i: number) => {
    const el = scrollRef.current
    if (!el) return
    // Prefer attribute lookup (robust when some rows are collapsed into a diff block)
    const target =
      el.querySelector<HTMLElement>(`[data-row-index="${i}"]`) ??
      el.querySelectorAll<HTMLElement>('[data-row]')[i]
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
    if (!debouncedQuery.trim() || !findOpen) return []
    const all: FindMatch[] = []
    const searchRows = (rows: string[], col: 'tgt' | 'src'): void => {
      rows.forEach((text, rowIndex) => {
        const ranges = findLiteralMatchRanges(text, debouncedQuery, findCase, findWhole)
        ranges.forEach(({ start, end }) => all.push({ rowIndex, col, start, end }))
      })
    }
    searchRows(cleanTgtRows, 'tgt')
    searchRows(cleanSrcRows, 'src')
    return all.sort((a, b) =>
      a.rowIndex !== b.rowIndex
        ? a.rowIndex - b.rowIndex
        : a.col !== b.col
          ? a.col === 'tgt'
            ? -1
            : 1
          : a.start - b.start
    )
  }, [debouncedQuery, findOpen, findCase, findWhole, cleanTgtRows, cleanSrcRows])

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
      map.get(m.rowIndex)![m.col].push({ start: m.start, end: m.end, matchIdx: idx })
    })
    return map
  }, [findMatches])

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
    const replaceAllLiteral = (content: string): string => {
      const rows = content.split('\n')
      const nextRows = rows.map((row) => {
        const ranges = findLiteralMatchRanges(row, findQuery, findCase, findWhole)
        if (!ranges.length) return row
        let cursor = 0
        let next = ''
        ranges.forEach(({ start, end }) => {
          next += row.slice(cursor, start) + replaceVal
          cursor = end
        })
        return next + row.slice(cursor)
      })
      return nextRows.join('\n')
    }

    const newTgt = replaceAllLiteral(tgtContent)
    if (newTgt !== tgtContent) onTgtChange(newTgt)
    const newSrc = replaceAllLiteral(srcContent)
    if (newSrc !== srcContent) onSrcChange?.(newSrc)
    setActiveMatchIdx(0)
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
      setPendingCursor(prevText.length)
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
      setPendingCursor(prevText.length)
      setNavCol(null)
      setNavDir(null)
      setFocusAtStart(false)
      setEditingRow(rowIdx - 1)
    },
    [srcRows, onSrcChange]
  )

  const startEditingRow = useCallback((idx: number, col: 'tgt' | 'src') => {
    hideTooltip()
    setEditingRow(idx)
    setEditingCol(col)
  }, [])

  const handleRowNavUp = useCallback(
    (rowIdx: number, col: number) => handleNavUp(col, rowIdx),
    [handleNavUp]
  )
  const handleRowNavDown = useCallback(
    (rowIdx: number, col: number) => handleNavDown(col, rowIdx, rowCount - 1),
    [handleNavDown, rowCount]
  )
  const handleRowNavLeft = useCallback((rowIdx: number) => handleNavLeft(rowIdx), [handleNavLeft])
  const handleRowNavRight = useCallback(
    (rowIdx: number) => handleNavRight(rowIdx, rowCount - 1),
    [handleNavRight, rowCount]
  )
  const handleRowToneChange = useCallback(
    (rowIdx: number, tone: ToneName) => setLineTone?.(rowIdx, tone),
    [setLineTone]
  )
  const handleRowVoiceGenderChange = useCallback(
    (rowIdx: number, gender: VoiceGender) => setLineVoiceGender?.(rowIdx, gender),
    [setLineVoiceGender]
  )
  const handlePlayRow = useCallback(
    (rowIndex: number, text: string) => handleTts(text, rowIndex),
    [handleTts]
  )

  // ── Tiered review: flag navigation (n / N) + HUD ────────────────────────────
  const flagRowList = useMemo(
    () => [...(flaggedRows?.keys() ?? [])].sort((a, b) => a - b),
    [flaggedRows]
  )
  const flagCounts = useMemo(() => {
    let high = 0
    let low = 0
    for (const note of flaggedRows?.values() ?? []) {
      if (note.startsWith('🔴')) high++
      else low++
    }
    return { high, low }
  }, [flaggedRows])

  const jumpToFlag = useCallback(
    (dir: 1 | -1) => {
      if (flagRowList.length === 0) return
      const cur = activeRow ?? -1
      let target: number
      if (dir === 1) {
        target = flagRowList.find((r) => r > cur) ?? flagRowList[0]
      } else {
        const before = flagRowList.filter((r) => r < cur)
        target = before.length ? before[before.length - 1] : flagRowList[flagRowList.length - 1]
      }
      onRowFocus(target)
      scrollIntoView(target)
    },
    [flagRowList, activeRow, onRowFocus, scrollIntoView]
  )

  // Plain n / N (no modifier) jump between flags — only when not typing in a row.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (editingRow !== null) return
      const el = document.activeElement
      if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return
      if (e.key === 'n') {
        e.preventDefault()
        jumpToFlag(1)
      } else if (e.key === 'N') {
        e.preventDefault()
        jumpToFlag(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingRow, jumpToFlag])

  const handlePolishRow = useCallback(
    (rowIndex: number) => {
      onPolishLine?.(
        rowIndex,
        cleanSrcRows[rowIndex] ?? '',
        cleanTgtRows[rowIndex] ?? '',
        flaggedRows?.get(rowIndex) ?? ''
      )
    },
    [onPolishLine, cleanSrcRows, cleanTgtRows, flaggedRows]
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
          {rowIndexes.map((i) => {
            const coverHunk = coveredRowToHunk.get(i)
            const editingInHunk =
              !!coverHunk &&
              editingRow !== null &&
              editingRow >= coverHunk.startRow &&
              editingRow <= coverHunk.endRow

            // Read-only ghost block — only when not actively editing within the range
            // (live-edit guard: while the user types in a covered row, keep it a normal
            // editable row with just a faint warning; overlay appears on blur).
            if (coverHunk && !editingInHunk) {
              if (i !== coverHunk.startRow) return null
              return (
                <DiffHunkBlock
                  key={`hunk-${coverHunk.editId}`}
                  hunk={coverHunk}
                  srcLines={cleanSrcRows.slice(coverHunk.startRow, coverHunk.endRow + 1)}
                  startRowNum={coverHunk.startRow + 1}
                  splitPos={splitPos}
                  onAccept={() => onAcceptDiff?.(coverHunk.editId)}
                  onDeny={() => onDenyDiff?.(coverHunk.editId)}
                />
              )
            }

            const rowFind = findByRow.get(i)
            const currentTone = getLineTone ? (getLineTone(i) as ToneName) : 'normal'
            const currentVoiceGender: VoiceGender = (getLineVoiceGender?.(i) ||
              'female') as VoiceGender
            return (
              <VRowPair
                key={i}
                rowIndex={i}
                rowNum={i + 1}
                tgtText={cleanTgtRows[i] ?? ''}
                srcText={cleanSrcRows[i] ?? ''}
                glossary={glossary}
                isActive={activeRow === i}
                onMouseEnter={onRowFocus}
                isEditing={editingRow === i}
                editingCol={editingRow === i ? editingCol : 'tgt'}
                onStartEdit={startEditingRow}
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
                onNavUp={handleRowNavUp}
                onNavDown={handleRowNavDown}
                onNavLeft={handleRowNavLeft}
                onNavRight={handleRowNavRight}
                navCol={editingRow === i ? navCol : null}
                navDir={editingRow === i ? navDir : null}
                tgtFindRanges={rowFind?.tgt}
                srcFindRanges={rowFind?.src}
                activeMatchIdx={rowFind ? safeActiveIdx : undefined}
                splitPos={splitPos}
                tone={currentTone}
                onToneChange={showToneControls ? handleRowToneChange : undefined}
                voiceGender={currentVoiceGender}
                onVoiceGenderChange={showToneControls ? handleRowVoiceGenderChange : undefined}
                onPlayRow={handlePlayRow}
                isStreaming={activeStreamRow === i}
                flagNote={flaggedRows?.get(i)}
                onPolishRow={onPolishLine ? handlePolishRow : undefined}
                diffPending={!!coverHunk}
              />
            )
          })}
        </div>
      </div>

      {/* Tiered-review HUD — flag counts + jump (n / Shift+N), bottom-left */}
      {flagRowList.length > 0 && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            left: 12,
            zIndex: 8000,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '4px 8px',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: 'var(--text1)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)'
          }}
          title="บรรทัดที่ระบบเตือน — กด n / Shift+N เพื่อไล่ทีละจุด"
        >
          <span style={{ color: 'var(--text2)' }}>ไล่ธง</span>
          {flagCounts.high > 0 && <span title="ต้องแก้">🔴 {flagCounts.high}</span>}
          {flagCounts.low > 0 && <span title="ควรตรวจ">🟡 {flagCounts.low}</span>}
          <span style={{ width: 1, height: 14, background: 'var(--border)' }} />
          <button onClick={() => jumpToFlag(-1)} title="ก่อนหน้า (Shift+N)" style={hudBtnStyle}>
            ↑
          </button>
          <button onClick={() => jumpToFlag(1)} title="ถัดไป (n)" style={hudBtnStyle}>
            ↓
          </button>
        </div>
      )}

      {/* Hidden audio element for WebSocket streaming */}
      <audio ref={audioRef} style={{ display: 'none' }} />

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

      {ttsError && !ttsLoading && (
        <div
          style={{
            position: 'absolute',
            bottom: 8,
            right: 12,
            background: 'var(--bg2)',
            border: '1px solid var(--hl-coral)',
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
            maxWidth: 360,
            cursor: 'pointer'
          }}
          onClick={() => setTtsError(null)}
          title="คลิกเพื่อปิด"
        >
          ⚠ TTS: {ttsError}
        </div>
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
          {(ttsBytes || ttsBase64) && onSaveTtsAudio && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
                  onSaveTtsAudio(ttsBase64 ?? ttsBytes!, `tts_${ts}.mp3`)
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
                Save MP3
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
