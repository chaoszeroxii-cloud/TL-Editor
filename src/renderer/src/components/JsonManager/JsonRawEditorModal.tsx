import { useState, useEffect, useCallback, useRef, useMemo, JSX } from 'react'
import { highlightJson, escapeRe, getLineAt, lineStartPos } from './syntaxHighlight'
import { IcoFileJson as IcoJson } from '../common/icons'

interface JsonRawEditorModalProps {
  files: Record<string, string> // fileName → fullPath
  onClose: () => void
}

// ── FindBar ───────────────────────────────────────────────────────────────────
interface FindBarProps {
  isReplace: boolean
  query: string
  replaceVal: string
  matchCount: number
  activeIdx: number
  caseSensitive: boolean
  wholeWord: boolean
  onQueryChange: (q: string) => void
  onReplaceChange: (r: string) => void
  onNext: () => void
  onPrev: () => void
  onReplaceOne: () => void
  onReplaceAll: () => void
  onToggleCase: () => void
  onToggleWhole: () => void
  onClose: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
}

const TogBtn = ({
  active,
  onClick,
  title,
  children
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}): JSX.Element => (
  <button
    onClick={onClick}
    title={title}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2px 6px',
      borderRadius: 3,
      cursor: 'pointer',
      flexShrink: 0,
      fontFamily: 'var(--font-mono)',
      fontSize: 10,
      lineHeight: 1,
      background: active ? 'var(--accent-dim)' : 'none',
      border: `1px solid ${active ? 'rgba(91,138,240,0.4)' : 'var(--border)'}`,
      color: active ? 'var(--accent)' : 'var(--text2)',
      transition: 'all 0.12s'
    }}
  >
    {children}
  </button>
)

const NavBtn = ({
  onClick,
  disabled,
  title,
  children
}: {
  onClick: () => void
  disabled?: boolean
  title?: string
  children: React.ReactNode
}): JSX.Element => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '3px 5px',
      borderRadius: 3,
      cursor: disabled ? 'default' : 'pointer',
      background: 'none',
      border: '1px solid var(--border)',
      color: disabled ? 'var(--text2)' : 'var(--text1)',
      opacity: disabled ? 0.35 : 1,
      flexShrink: 0
    }}
  >
    {children}
  </button>
)

const ActionBtn = ({
  onClick,
  disabled,
  children
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}): JSX.Element => (
  <button
    onClick={onClick}
    disabled={disabled}
    style={{
      padding: '2px 10px',
      borderRadius: 3,
      cursor: disabled ? 'default' : 'pointer',
      background: disabled ? 'none' : 'var(--bg3)',
      border: '1px solid var(--border)',
      color: disabled ? 'var(--text2)' : 'var(--text1)',
      fontSize: 10,
      fontFamily: 'var(--font-mono)',
      flexShrink: 0,
      opacity: disabled ? 0.35 : 1
    }}
  >
    {children}
  </button>
)

const Sep = (): JSX.Element => (
  <div
    style={{ width: 1, height: 12, background: 'var(--border)', flexShrink: 0, margin: '0 1px' }}
  />
)

function FindBar({
  isReplace,
  query,
  replaceVal,
  matchCount,
  activeIdx,
  caseSensitive,
  wholeWord,
  onQueryChange,
  onReplaceChange,
  onNext,
  onPrev,
  onReplaceOne,
  onReplaceAll,
  onToggleCase,
  onToggleWhole,
  onClose,
  inputRef
}: FindBarProps): JSX.Element {
  const noResult = !!query.trim() && matchCount === 0
  const countText = query.trim()
    ? matchCount === 0
      ? 'No results'
      : `${activeIdx + 1} / ${matchCount}`
    : ''

  return (
    <div
      style={{
        flexShrink: 0,
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        padding: isReplace ? '4px 10px 0' : '4px 10px'
      }}
    >
      {/* Find row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text2)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>

        <div style={{ position: 'relative', width: 220, flexShrink: 0 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.shiftKey ? onPrev() : onNext()
              }
              if (e.key === 'Escape') {
                e.stopPropagation()
                onClose()
              }
            }}
            placeholder="Find (Enter ↓  Shift+Enter ↑)"
            spellCheck={false}
            autoComplete="off"
            style={{
              width: '100%',
              background: noResult ? 'rgba(240,122,106,0.1)' : 'var(--bg3)',
              border: `1px solid ${noResult ? 'rgba(240,122,106,0.5)' : 'var(--border)'}`,
              borderRadius: 4,
              color: 'var(--text0)',
              fontSize: 11,
              padding: '3px 56px 3px 7px',
              outline: 'none',
              fontFamily: 'var(--font-ui)',
              boxSizing: 'border-box',
              transition: 'border-color 0.12s, background 0.12s'
            }}
          />
          {countText && (
            <span
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                color: noResult ? 'var(--hl-coral)' : 'var(--text2)'
              }}
            >
              {countText}
            </span>
          )}
        </div>

        <TogBtn active={caseSensitive} onClick={onToggleCase} title="Case sensitive (Alt+C)">
          Aa
        </TogBtn>
        <TogBtn active={wholeWord} onClick={onToggleWhole} title="Whole word (Alt+W)">
          <svg
            width="12"
            height="10"
            viewBox="0 0 26 18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="1" y1="17" x2="25" y2="17" />
            <path d="M4 14V5l4.5 6L13 2l4.5 9L22 5v9" />
          </svg>
        </TogBtn>

        <Sep />

        <NavBtn onClick={onPrev} disabled={matchCount === 0} title="Previous (Shift+Enter)">
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </NavBtn>
        <NavBtn onClick={onNext} disabled={matchCount === 0} title="Next (Enter)">
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </NavBtn>

        <Sep />

        <button
          onClick={onClose}
          title="Close (Escape)"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text2)',
            padding: '2px 4px',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Replace row */}
      {isReplace && (
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 4, paddingBottom: 4 }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--text2)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ flexShrink: 0 }}
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <div style={{ width: 220, flexShrink: 0 }}>
            <input
              value={replaceVal}
              onChange={(e) => onReplaceChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onReplaceOne()
                }
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  onClose()
                }
              }}
              placeholder="Replace"
              spellCheck={false}
              style={{
                width: '100%',
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text0)',
                fontSize: 11,
                padding: '3px 7px',
                outline: 'none',
                fontFamily: 'var(--font-ui)',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <ActionBtn onClick={onReplaceOne} disabled={matchCount === 0}>
            Replace
          </ActionBtn>
          <ActionBtn onClick={onReplaceAll} disabled={matchCount === 0}>
            All
          </ActionBtn>
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export function JsonRawEditorModal({ files, onClose }: JsonRawEditorModalProps): JSX.Element {
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const lineNumsRef = useRef<HTMLPreElement>(null) // single <pre> node for all line numbers
  const hlRef = useRef<HTMLDivElement>(null) // highlight bar
  const activeNumRef = useRef<HTMLDivElement>(null) // bright overlay for current line number
  const cursorInfoRef = useRef<HTMLSpanElement>(null) // footer "Ln X, Col Y"
  const syntaxRef = useRef<HTMLPreElement>(null) // syntax-highlight layer
  const cursorLineRef = useRef(1)
  const activeGuideDepthRef = useRef(-1) // currently highlighted guide depth

  // fixed line height in px — must match textarea CSS
  const LINE_H = 20

  const GUIDE_DIM = 'rgba(80,90,110,0.4)'
  const GUIDE_ACTIVE = 'rgba(130,150,180,0.8)'

  /** Count JSON nesting depth at a given text position (counts { [ vs } ]) */

  /**
   * VSCode-style active guide — pure indentation logic:
   *   - Container line (next non-empty has more indent): highlight own rightmost guide
   *   - Leaf line: highlight parent scope guide (one level up)
   *   - Depth 0 is valid and highlighted
   */
  const updateGuides = useCallback((content: string, cursorPos: number) => {
    const pre = syntaxRef.current
    if (!pre) return

    const cursorLineIdx = content.slice(0, cursorPos).split('\n').length - 1
    const lines = content.split('\n')
    const curIndent = lines[cursorLineIdx]?.match(/^ */)?.[0].length ?? 0

    // Is this line a container? (next non-empty line is indented deeper)
    let isContainer = false
    for (let i = cursorLineIdx + 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue
      isContainer = (lines[i].match(/^ */)?.[0].length ?? 0) > curIndent
      break
    }

    const activeDepth = isContainer
      ? Math.floor(curIndent / 2)
      : Math.max(0, Math.floor(curIndent / 2) - 1)

    // Scope: lines that have indent >= threshold around cursor
    const threshold = activeDepth * 2
    let scopeStart = cursorLineIdx
    let scopeEnd = cursorLineIdx

    for (let i = cursorLineIdx - 1; i >= 0; i--) {
      const lead = lines[i].match(/^ */)?.[0].length ?? 0
      if (lead < threshold) {
        scopeStart = i
        break
      }
      scopeStart = i
    }
    for (let i = cursorLineIdx + 1; i < lines.length; i++) {
      const lead = lines[i].match(/^ */)?.[0].length ?? 0
      if (lead < threshold) {
        scopeEnd = i
        break
      }
      scopeEnd = i
    }

    const all = pre.querySelectorAll<HTMLElement>('[data-d]')
    all.forEach((el) => {
      const d = Number(el.getAttribute('data-d'))
      if (d !== activeDepth) {
        el.style.borderLeftColor = GUIDE_DIM
        return
      }
      const spanLine = Number(el.getAttribute('data-l'))
      el.style.borderLeftColor =
        spanLine >= scopeStart && spanLine <= scopeEnd ? GUIDE_ACTIVE : GUIDE_DIM
    })

    activeGuideDepthRef.current = activeDepth
  }, [])

  /** Fully imperative cursor update — zero React re-renders */
  const updateCursor = useCallback(
    (line: number, col: number, scrollTop: number, content?: string, cursorPos?: number) => {
      const top = 14 + (line - 1) * LINE_H - scrollTop
      if (hlRef.current) hlRef.current.style.top = `${top}px`
      if (activeNumRef.current) {
        activeNumRef.current.style.top = `${top}px`
        activeNumRef.current.textContent = String(line)
      }
      if (lineNumsRef.current) lineNumsRef.current.scrollTop = scrollTop
      if (syntaxRef.current) syntaxRef.current.scrollTop = scrollTop
      if (cursorInfoRef.current) cursorInfoRef.current.textContent = `Ln ${line}, Col ${col}`
      cursorLineRef.current = line
      if (content !== undefined && cursorPos !== undefined) {
        updateGuides(content, cursorPos)
      }
    },
    [updateGuides]
  )

  // ── Undo / Redo stacks ───────────────────────────────────────────────────
  const undoStack = useRef<string[]>([])
  const redoStack = useRef<string[]>([])
  const [undoCount, setUndoCount] = useState(0)
  const [redoCount, setRedoCount] = useState(0)

  /** Push to undo stack before mutating content */
  const pushUndo = useCallback((prev: string) => {
    if (undoStack.current[undoStack.current.length - 1] === prev) return
    undoStack.current.push(prev)
    if (undoStack.current.length > 200) undoStack.current.shift()
    redoStack.current = []
    setUndoCount(undoStack.current.length)
    setRedoCount(0)
  }, [])

  const handleUndo = useCallback(() => {
    const prev = undoStack.current.pop()
    if (prev === undefined) return
    redoStack.current.push(content)
    setUndoCount(undoStack.current.length)
    setRedoCount(redoStack.current.length)
    setContent(prev)
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(prev.length, prev.length)
    })
  }, [content])

  const handleRedo = useCallback(() => {
    const next = redoStack.current.pop()
    if (next === undefined) return
    undoStack.current.push(content)
    setUndoCount(undoStack.current.length)
    setRedoCount(redoStack.current.length)
    setContent(next)
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(next.length, next.length)
    })
  }, [content])

  // ── Find & Replace state ─────────────────────────────────────────────────
  const [findOpen, setFindOpen] = useState(false)
  const [isReplace, setIsReplace] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [replaceVal, setReplaceVal] = useState('')
  const [findCase, setFindCase] = useState(false)
  const [findWhole, setFindWhole] = useState(false)
  const [activeMatchIdx, setActiveMatchIdx] = useState(0)
  const findInputRef = useRef<HTMLInputElement>(null)

  const fileNames = Object.keys(files)

  const loadFile = useCallback(
    async (name: string) => {
      if (!files[name]) return
      setLoading(true)
      setFileError(null)
      try {
        const raw = await window.electron.readFile(files[name])
        let pretty = raw
        try {
          pretty = JSON.stringify(JSON.parse(raw), null, 2)
        } catch {
          /* keep raw */
        }
        setContent(pretty)
        setSavedContent(pretty)
        setSelected(name)
        undoStack.current = []
        redoStack.current = []
        setUndoCount(0)
        setRedoCount(0)
      } catch (e) {
        setFileError(String(e))
      } finally {
        setLoading(false)
      }
    },
    [files]
  )

  useEffect(() => {
    if (fileNames.length > 0) loadFile(fileNames[0])
  }, []) // eslint-disable-line

  const handleSave = useCallback(async () => {
    if (!selected || saving) return
    setFileError(null)
    try {
      JSON.parse(content)
    } catch (e) {
      setFileError(`JSON ไม่ถูกต้อง: ${e instanceof Error ? e.message : String(e)}`)
      return
    }
    setSaving(true)
    try {
      await window.electron.writeFile(files[selected], content)
      setSavedContent(content)
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2000)
    } catch (e) {
      setFileError(`บันทึกไม่ได้: ${String(e)}`)
    } finally {
      setSaving(false)
    }
  }, [selected, content, saving, files])

  const handleFormat = useCallback(() => {
    try {
      const formatted = JSON.stringify(JSON.parse(content), null, 2)
      pushUndo(content)
      setContent(formatted)
      setFileError(null)
    } catch (e) {
      setFileError(`JSON ไม่ถูกต้อง: ${e instanceof Error ? e.message : String(e)}`)
    }
  }, [content, pushUndo])

  // ── Find: compute matches ────────────────────────────────────────────────
  const findMatches = useMemo(() => {
    if (!findQuery.trim() || !findOpen) return []
    try {
      const pat = findWhole ? `\\b${escapeRe(findQuery)}\\b` : escapeRe(findQuery)
      const re = new RegExp(pat, findCase ? 'g' : 'gi')
      const matches: { start: number; end: number }[] = []
      let m: RegExpExecArray | null
      re.lastIndex = 0
      while ((m = re.exec(content)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length })
        if (matches.length > 5000) break // safety cap
      }
      return matches
    } catch {
      return []
    }
  }, [findQuery, findOpen, findCase, findWhole, content])

  // Reset index when query/options change
  useEffect(() => {
    setActiveMatchIdx(0)
  }, [findQuery, findCase, findWhole])

  // Clamp when matches shrink
  useEffect(() => {
    if (findMatches.length > 0 && activeMatchIdx >= findMatches.length)
      setActiveMatchIdx(findMatches.length - 1)
  }, [findMatches.length, activeMatchIdx])

  // Select active match in textarea (native selection = highlight)
  useEffect(() => {
    if (!findOpen || findMatches.length === 0 || !taRef.current) return
    const { start, end } = findMatches[Math.min(activeMatchIdx, findMatches.length - 1)]
    const ta = taRef.current
    ta.focus()
    ta.setSelectionRange(start, end)
    // Scroll into view: set to start first, then full range
    ta.setSelectionRange(start, start)
    ta.setSelectionRange(start, end)
  }, [findMatches, activeMatchIdx, findOpen])

  const goNext = useCallback(() => {
    if (!findMatches.length) return
    setActiveMatchIdx((i) => (i + 1) % findMatches.length)
  }, [findMatches.length])

  const goPrev = useCallback(() => {
    if (!findMatches.length) return
    setActiveMatchIdx((i) => (i - 1 + findMatches.length) % findMatches.length)
  }, [findMatches.length])

  // ── Replace ──────────────────────────────────────────────────────────────
  const handleReplaceOne = useCallback(() => {
    if (!findMatches.length) return
    const { start, end } = findMatches[Math.min(activeMatchIdx, findMatches.length - 1)]
    pushUndo(content)
    setContent(content.slice(0, start) + replaceVal + content.slice(end))
  }, [findMatches, activeMatchIdx, replaceVal, content, pushUndo])

  const handleReplaceAll = useCallback(() => {
    if (!findQuery.trim()) return
    try {
      const pat = findWhole ? `\\b${escapeRe(findQuery)}\\b` : escapeRe(findQuery)
      const re = new RegExp(pat, findCase ? 'g' : 'gi')
      const next = content.replace(re, replaceVal)
      if (next !== content) {
        pushUndo(content)
        setContent(next)
      }
      setActiveMatchIdx(0)
    } catch {
      setFileError(`การแทนที่ล้มเหลว`)
    }
  }, [findQuery, findCase, findWhole, replaceVal, content, pushUndo])

  // ── Global keyboard (capture phase for Ctrl+F override) ─────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        if (findOpen) {
          setFindOpen(false)
          return
        }
        onClose()
        return
      }
      if (!e.ctrlKey && !e.metaKey) return
      const code = e.code
      if (code === 'KeyS') {
        e.preventDefault()
        handleSave()
        return
      }
      if (code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        handleUndo()
        return
      }
      if (code === 'KeyY' || (code === 'KeyZ' && e.shiftKey)) {
        e.preventDefault()
        e.stopPropagation()
        handleRedo()
        return
      }
      if (code === 'KeyF') {
        e.preventDefault()
        e.stopPropagation()
        setFindOpen(true)
        setIsReplace(false)
        requestAnimationFrame(() => findInputRef.current?.focus())
        return
      }
      if (code === 'KeyH') {
        e.preventDefault()
        e.stopPropagation()
        setFindOpen(true)
        setIsReplace(true)
        requestAnimationFrame(() => findInputRef.current?.focus())
        return
      }
    }
    window.addEventListener('keydown', onKey, true) // capture to intercept Ctrl+F
    return () => window.removeEventListener('keydown', onKey, true)
  }, [handleSave, handleUndo, handleRedo, onClose, findOpen])

  // Alt+C / Alt+W when find is open
  useEffect(() => {
    if (!findOpen) return
    const onKey = (e: KeyboardEvent): void => {
      if (!e.altKey) return
      if (e.key.toLowerCase() === 'c') {
        e.preventDefault()
        setFindCase((v) => !v)
      }
      if (e.key.toLowerCase() === 'w') {
        e.preventDefault()
        setFindWhole((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [findOpen])

  // ── Textarea keyboard: line operations ───────────────────────────────────
  const handleTextareaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const ta = e.currentTarget

      // ── Tab → insert 2 spaces ────────────────────────────────────────────
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault()
        const start = ta.selectionStart
        const end = ta.selectionEnd
        const indent = '  '
        if (e.shiftKey) {
          // Shift+Tab: remove up to 2 leading spaces from the current line
          const before = content.slice(0, start)
          const lineStart = before.lastIndexOf('\n') + 1
          const line = content.slice(lineStart, end)
          const stripped = line.replace(/^ {1,2}/, '')
          const removed = line.length - stripped.length
          if (removed > 0) {
            pushUndo(content)
            const next =
              content.slice(0, lineStart) + stripped + content.slice(lineStart + line.length)
            setContent(next)
            requestAnimationFrame(() => {
              ta.setSelectionRange(start - removed, end - removed)
              ta.focus()
            })
          }
        } else {
          pushUndo(content)
          const next = content.slice(0, start) + indent + content.slice(end)
          setContent(next)
          requestAnimationFrame(() => {
            ta.setSelectionRange(start + indent.length, start + indent.length)
            ta.focus()
          })
        }
        return
      }
      if (e.altKey && e.shiftKey && e.key === 'ArrowDown') {
        e.preventDefault()
        const { lineIdx, lineOffset, lines } = getLineAt(content, ta.selectionStart)
        const newLines = [...lines]
        newLines.splice(lineIdx + 1, 0, lines[lineIdx]) // insert copy below
        const newContent = newLines.join('\n')
        const newStart = lineStartPos(newLines, lineIdx + 1)
        const newCursor = newStart + Math.min(lineOffset, newLines[lineIdx + 1].length)
        pushUndo(content)
        setContent(newContent)
        requestAnimationFrame(() => {
          ta.setSelectionRange(newCursor, newCursor)
          ta.focus()
        })
        return
      }

      // ── Move line up: Alt+↑ ──────────────────────────────────────────────
      if (e.altKey && !e.shiftKey && e.key === 'ArrowUp') {
        e.preventDefault()
        const { lineIdx, lineOffset, lines } = getLineAt(content, ta.selectionStart)
        if (lineIdx === 0) return
        const newLines = [...lines]
        ;[newLines[lineIdx - 1], newLines[lineIdx]] = [newLines[lineIdx], newLines[lineIdx - 1]]
        const newContent = newLines.join('\n')
        const newStart = lineStartPos(newLines, lineIdx - 1)
        const newCursor = newStart + Math.min(lineOffset, newLines[lineIdx - 1].length)
        pushUndo(content)
        setContent(newContent)
        requestAnimationFrame(() => {
          ta.setSelectionRange(newCursor, newCursor)
          ta.focus()
        })
        return
      }

      // ── Move line down: Alt+↓ ────────────────────────────────────────────
      if (e.altKey && !e.shiftKey && e.key === 'ArrowDown') {
        e.preventDefault()
        const { lineIdx, lineOffset, lines } = getLineAt(content, ta.selectionStart)
        if (lineIdx >= lines.length - 1) return
        const newLines = [...lines]
        ;[newLines[lineIdx], newLines[lineIdx + 1]] = [newLines[lineIdx + 1], newLines[lineIdx]]
        const newContent = newLines.join('\n')
        const newStart = lineStartPos(newLines, lineIdx + 1)
        const newCursor = newStart + Math.min(lineOffset, newLines[lineIdx + 1].length)
        pushUndo(content)
        setContent(newContent)
        requestAnimationFrame(() => {
          ta.setSelectionRange(newCursor, newCursor)
          ta.focus()
        })
        return
      }
    },
    [content, pushUndo]
  )

  const isDirty = content !== savedContent

  let jsonParseError: string | null = null
  if (content) {
    try {
      JSON.parse(content)
    } catch (e) {
      jsonParseError = e instanceof Error ? e.message : String(e)
    }
  }

  const lineCount = content ? content.split('\n').length : 0
  const charCount = content.length
  // single string for gutter — recomputed only when line count changes
  const lineNumsText = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1).join('\n'),
    [lineCount]
  )
  const gutterW = String(lineCount).length * 8 + 28

  // Highlighted HTML — recomputed on content change, injected imperatively to avoid
  // React reconciling thousands of spans on every keystroke
  const highlightedHtml = useMemo(() => highlightJson(content), [content])
  useEffect(() => {
    if (syntaxRef.current) {
      syntaxRef.current.innerHTML = highlightedHtml
      activeGuideDepthRef.current = -1 // reset so guide re-highlights correctly
      // Re-apply guide highlight after new HTML (spans are fresh DOM nodes)
      const ta = taRef.current
      if (ta && document.activeElement === ta) {
        const pos = ta.selectionStart
        const before = ta.value.slice(0, pos)
        const linesBefore = before.split('\n')
        updateCursor(
          linesBefore.length,
          linesBefore[linesBefore.length - 1].length + 1,
          ta.scrollTop,
          ta.value,
          pos
        )
      }
    }
  }, [highlightedHtml, updateCursor])

  // keydown + rAF: fires on every key repeat (hold arrow = continuous updates).
  // rAF defers one frame so browser has already moved cursor before we read selectionStart.
  // mouseup / input remain direct (cursor is already final at those events).
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    let rafId = 0
    const syncNow = (): void => {
      const pos = ta.selectionStart
      const before = ta.value.slice(0, pos)
      const linesBefore = before.split('\n')
      const line = linesBefore.length
      const col = linesBefore[linesBefore.length - 1].length + 1
      updateCursor(line, col, ta.scrollTop, ta.value, pos)
    }
    const syncDeferred = (): void => {
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(syncNow)
    }
    ta.addEventListener('keydown', syncDeferred)
    ta.addEventListener('mouseup', syncNow)
    ta.addEventListener('input', syncNow)
    return () => {
      cancelAnimationFrame(rafId)
      ta.removeEventListener('keydown', syncDeferred)
      ta.removeEventListener('mouseup', syncNow)
      ta.removeEventListener('input', syncNow)
    }
  }, [selected, updateCursor])

  return (
    <div
      style={s.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div style={s.modal}>
        {/* ── Header ── */}
        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={s.titleDot} />
            <span style={s.title}>JSON File Manager</span>
            {selected && <span style={s.selectedChip}>{selected}</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {selected && (
              <>
                <button
                  style={{ ...s.btnFormat, opacity: undoCount === 0 ? 0.35 : 1 }}
                  onClick={handleUndo}
                  disabled={undoCount === 0}
                  title="Undo (Ctrl+Z)"
                >
                  ↩
                </button>
                <button
                  style={{ ...s.btnFormat, opacity: redoCount === 0 ? 0.35 : 1 }}
                  onClick={handleRedo}
                  disabled={redoCount === 0}
                  title="Redo (Ctrl+Y)"
                >
                  ↪
                </button>
                <button
                  style={s.btnFormat}
                  onClick={handleFormat}
                  title="Format / Pretty-print (Ctrl+Shift+F)"
                >
                  {'{ }'}
                </button>
              </>
            )}
            {isDirty && !jsonParseError && (
              <button
                style={{ ...s.btnSave, opacity: saving ? 0.6 : 1 }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? 'Saving…' : saveOk ? '✓ Saved' : 'Save'}
              </button>
            )}
            <button style={s.btnClose} onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {/* ── Body ── */}
        <div style={s.body}>
          {/* Left sidebar: file list */}
          <div style={s.sidebar}>
            <div style={s.sidebarTitle}>IMPORTED FILES</div>
            {fileNames.length === 0 ? (
              <div style={s.empty}>No files</div>
            ) : (
              fileNames.map((name) => (
                <button
                  key={name}
                  style={{ ...s.fileItem, ...(selected === name ? s.fileItemActive : {}) }}
                  onClick={() => {
                    if (selected !== name) loadFile(name)
                  }}
                >
                  <span
                    style={{
                      color: selected === name ? 'var(--hl-gold)' : 'var(--text2)',
                      display: 'flex',
                      flexShrink: 0
                    }}
                  >
                    <IcoJson size={12} stroke="currentColor" />
                  </span>
                  <span
                    style={{
                      ...s.fileItemName,
                      color: selected === name ? 'var(--accent)' : 'var(--text0)'
                    }}
                  >
                    {name}
                  </span>
                  {selected === name && isDirty && (
                    <span style={{ color: 'var(--hl-gold)', fontSize: 10, flexShrink: 0 }}>●</span>
                  )}
                </button>
              ))
            )}

            {/* ── Keyboard shortcuts hint ── */}
            <div style={s.hints}>
              <div style={s.hintTitle}>SHORTCUTS</div>
              {[
                ['Ctrl+Z', 'Undo'],
                ['Ctrl+Y', 'Redo'],
                ['Ctrl+F', 'Find'],
                ['Ctrl+H', 'Replace'],
                ['Alt+↑↓', 'Move line'],
                ['Shift+Alt+↓', 'Duplicate'],
                ['Ctrl+S', 'Save']
              ].map(([key, desc]) => (
                <div key={key} style={s.hintRow}>
                  <code style={s.hintKey}>{key}</code>
                  <span style={s.hintDesc}>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: editor panel */}
          <div style={s.editorArea}>
            {loading ? (
              <div style={s.placeholder}>Loading…</div>
            ) : !selected ? (
              <div style={s.placeholder}>Select a file from the list</div>
            ) : (
              <>
                {/* ── Find & Replace bar ── */}
                {findOpen && (
                  <FindBar
                    isReplace={isReplace}
                    query={findQuery}
                    replaceVal={replaceVal}
                    matchCount={findMatches.length}
                    activeIdx={Math.min(activeMatchIdx, Math.max(0, findMatches.length - 1))}
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
                )}

                {(fileError || jsonParseError) && (
                  <div style={s.errorBar}>⚠ {fileError ?? jsonParseError}</div>
                )}

                {/* ── VSCode-style editor: gutter + textarea ── */}
                <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
                  {/* Gutter — single <pre> node (no per-line divs), scrolled imperatively */}
                  <div
                    style={{
                      position: 'relative',
                      flexShrink: 0,
                      width: gutterW,
                      background: 'var(--bg0)',
                      borderRight: '1px solid rgba(46,51,64,0.55)'
                    }}
                  >
                    <pre
                      ref={lineNumsRef}
                      style={{
                        margin: 0,
                        padding: `14px 10px 14px 0`,
                        width: '100%',
                        height: '100%',
                        overflowY: 'hidden',
                        textAlign: 'right',
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                        lineHeight: `${LINE_H}px`,
                        color: 'rgba(120,130,150,0.45)',
                        userSelect: 'none',
                        pointerEvents: 'none',
                        whiteSpace: 'pre'
                      }}
                    >
                      {lineNumsText}
                    </pre>
                    {/* Active line number — updated imperatively */}
                    <div
                      ref={activeNumRef}
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: 14,
                        lineHeight: `${LINE_H}px`,
                        fontSize: 12,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text1)',
                        fontWeight: 500,
                        pointerEvents: 'none',
                        userSelect: 'none'
                      }}
                    >
                      1
                    </div>
                  </div>

                  {/* Highlight bar — moved imperatively */}
                  <div
                    ref={hlRef}
                    aria-hidden
                    style={{
                      position: 'absolute',
                      left: gutterW + 1,
                      right: 0,
                      top: 14,
                      height: LINE_H,
                      background: 'rgba(255,255,255,0.04)',
                      pointerEvents: 'none',
                      zIndex: 0
                    }}
                  />

                  {/* Syntax + textarea share a position:relative wrapper.
                      The pre is behind with colored HTML; the textarea is on top,
                      transparent text + visible caret. Both have identical CSS. */}
                  <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                    <pre
                      ref={syntaxRef}
                      aria-hidden
                      style={{
                        position: 'absolute',
                        inset: 0,
                        margin: 0,
                        padding: '14px 18px 14px 14px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        lineHeight: `${LINE_H}px`,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        overflowWrap: 'break-word',
                        tabSize: 2,
                        overflow: 'hidden', // scroll driven by textarea
                        color: 'var(--text0)', // fallback for bare text nodes
                        pointerEvents: 'none',
                        userSelect: 'none',
                        boxSizing: 'border-box'
                      }}
                    />
                    <textarea
                      ref={taRef}
                      style={{
                        ...s.textarea,
                        lineHeight: `${LINE_H}px`,
                        position: 'absolute',
                        inset: 0,
                        color: 'transparent',
                        caretColor: 'var(--text1)',
                        background: 'transparent',
                        boxSizing: 'border-box'
                      }}
                      value={content}
                      onChange={(e) => {
                        const next = e.target.value
                        pushUndo(content)
                        setContent(next)
                      }}
                      onKeyDown={handleTextareaKeyDown}
                      onScroll={(e) => {
                        const st = e.currentTarget.scrollTop
                        const top = 14 + (cursorLineRef.current - 1) * LINE_H - st
                        if (hlRef.current) hlRef.current.style.top = `${top}px`
                        if (activeNumRef.current) activeNumRef.current.style.top = `${top}px`
                        if (lineNumsRef.current) lineNumsRef.current.scrollTop = st
                        if (syntaxRef.current) syntaxRef.current.scrollTop = st
                      }}
                      spellCheck={false}
                      autoComplete="off"
                      autoCorrect="off"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={s.footer}>
          <span style={s.footerPath}>{selected ? files[selected] : '—'}</span>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>
            {selected && (
              <span style={s.footerStat}>
                {/* cursorInfoRef updated imperatively — no re-render on cursor move */}
                <span ref={cursorInfoRef}>Ln 1, Col 1</span>
                {` · ${lineCount} lines · ${charCount.toLocaleString()} chars`}
              </span>
            )}
            {findOpen && findMatches.length > 0 && (
              <span
                style={{ color: 'var(--hl-gold)', fontSize: 10, fontFamily: 'var(--font-mono)' }}
              >
                {Math.min(activeMatchIdx + 1, findMatches.length)}/{findMatches.length} matches
              </span>
            )}
            {isDirty && <span style={{ color: 'var(--hl-gold)', fontSize: 10 }}>● unsaved</span>}
            {jsonParseError && (
              <span style={{ color: 'var(--hl-coral)', fontSize: 10 }}>⚠ invalid JSON</span>
            )}
            {saveOk && <span style={{ color: 'var(--hl-teal)', fontSize: 10 }}>✓ saved</span>}
            <span style={s.footerHint}>Ctrl+S save · Ctrl+F find</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2500,
    backdropFilter: 'blur(3px)'
  },
  modal: {
    background: 'var(--bg1)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    width: 'min(92vw, 1100px)',
    height: 'min(88vh, 800px)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 32px 96px rgba(0,0,0,0.8)',
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '11px 16px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg2)',
    flexShrink: 0
  },
  titleDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--hl-gold)',
    flexShrink: 0
  },
  title: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--text0)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.02em'
  },
  selectedChip: {
    fontSize: 10,
    color: 'var(--hl-gold)',
    fontFamily: 'var(--font-mono)',
    background: 'var(--hl-gold-bg)',
    border: '1px solid var(--hl-gold-border)',
    padding: '1px 8px',
    borderRadius: 99
  },
  body: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: {
    width: 215,
    flexShrink: 0,
    borderRight: '1px solid var(--border)',
    background: 'var(--bg2)',
    display: 'flex',
    flexDirection: 'column',
    overflowY: 'auto'
  },
  sidebarTitle: {
    fontSize: 9,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    padding: '8px 12px 6px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0
  },
  fileItem: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '8px 10px',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid rgba(46,51,64,0.5)',
    cursor: 'pointer',
    textAlign: 'left' as const,
    transition: 'background 0.1s'
  },
  fileItemActive: {
    background: 'rgba(91,138,240,0.1)',
    borderLeft: '2px solid var(--accent)',
    paddingLeft: 8
  },
  fileItemName: {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1
  },
  // shortcuts hint panel
  hints: {
    marginTop: 'auto',
    padding: '10px 12px',
    borderTop: '1px solid var(--border)'
  },
  hintTitle: {
    fontSize: 9,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    marginBottom: 6
  },
  hintRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
  hintKey: {
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    color: 'var(--accent)',
    background: 'var(--accent-dim)',
    border: '1px solid rgba(91,138,240,0.25)',
    padding: '1px 5px',
    borderRadius: 3,
    flexShrink: 0
  },
  hintDesc: { fontSize: 9, color: 'var(--text2)', fontFamily: 'var(--font-mono)' },
  editorArea: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    background: 'var(--bg0)'
  },
  textarea: {
    flex: 1,
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: 'var(--text0)',
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    lineHeight: '20px',
    padding: '14px 18px 14px 14px',
    resize: 'none',
    outline: 'none',
    overflowY: 'auto',
    tabSize: 2
  },
  errorBar: {
    background: 'rgba(240,122,106,0.1)',
    borderBottom: '1px solid rgba(240,122,106,0.35)',
    color: 'var(--hl-coral)',
    fontSize: 11,
    padding: '6px 14px',
    flexShrink: 0,
    fontFamily: 'var(--font-mono)'
  },
  placeholder: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text2)',
    fontSize: 12,
    fontFamily: 'var(--font-mono)'
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '5px 14px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg2)',
    flexShrink: 0,
    gap: 8
  },
  footerPath: {
    color: 'var(--text2)',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1
  },
  footerStat: { color: 'var(--text2)', fontSize: 10, fontFamily: 'var(--font-mono)' },
  footerHint: { color: 'var(--text2)', fontSize: 10, fontFamily: 'var(--font-mono)', opacity: 0.6 },
  empty: {
    padding: '16px 12px',
    color: 'var(--text2)',
    fontSize: 11,
    textAlign: 'center' as const
  },
  btnSave: {
    background: 'var(--accent)',
    border: 'none',
    color: '#fff',
    fontSize: 11,
    fontWeight: 600,
    padding: '5px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)'
  },
  btnFormat: {
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    color: 'var(--text1)',
    fontSize: 11,
    padding: '4px 10px',
    borderRadius: 5,
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)'
  },
  btnClose: {
    background: 'none',
    border: 'none',
    color: 'var(--text2)',
    fontSize: 14,
    cursor: 'pointer',
    padding: '2px 6px'
  }
}
