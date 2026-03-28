import { useState, useRef, useEffect, useCallback, useLayoutEffect, JSX } from 'react'
import { OutputView } from './OutputView'
import { PythonTab } from './PythonTab'
import type { OutputLine } from './OutputView'
import { IcoTerminal, IcoPython, IcoTrash, IcoStop, IcoClose, IcoChevronUp } from '../common/icons'

type PanelTab = 'terminal' | 'python'

const btnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '3px 5px',
  borderRadius: 3
}

// ── TerminalPanel ─────────────────────────────────────────────────────────────

interface TerminalPanelProps {
  cwd?: string | null
  onClose: () => void
}

export function TerminalPanel({ cwd, onClose }: TerminalPanelProps): JSX.Element {
  const [tab, setTab] = useState<PanelTab>('python')
  const [lines, setLines] = useState<OutputLine[]>([])
  const [pythonLines, setPythonLines] = useState<OutputLine[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [panelH, setPanelH] = useState(220)

  const outputRef = useRef<HTMLDivElement>(null)
  const pyOutputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const historyRef = useRef<string[]>([])
  const histIdxRef = useRef(-1)
  const idRef = useRef(0)
  const nextId = (): number => ++idRef.current

  const curLines = tab === 'terminal' ? lines : pythonLines
  const curRef = tab === 'terminal' ? outputRef : pyOutputRef

  useLayoutEffect(() => {
    const el = curRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines, pythonLines, tab, curRef])

  useEffect(() => {
    if (tab === 'terminal') inputRef.current?.focus()
  }, [tab])

  // ── Resize ────────────────────────────────────────────────────────────────
  const dragRef = useRef(false)
  const dragStartY = useRef(0)
  const dragStartH = useRef(0)

  const onDragStart = (e: React.MouseEvent): void => {
    dragRef.current = true
    dragStartY.current = e.clientY
    dragStartH.current = panelH
    e.preventDefault()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragRef.current) return
      setPanelH(
        Math.max(
          120,
          Math.min(window.innerHeight * 0.7, dragStartH.current + dragStartY.current - e.clientY)
        )
      )
    }
    const onUp = (): void => {
      dragRef.current = false
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  // ── Stream IPC ────────────────────────────────────────────────────────────
  const appendLines = useCallback(
    (
      setter: typeof setLines,
      kind: 'stdout' | 'stderr' | 'info' | 'cmd' | 'exit',
      text: string
    ): void => {
      if (!text) return
      const rows = text
        .split('\n')
        .filter(
          (_, i, arr) =>
            i < arr.length - 1 ||
            text[text.length - 1] !== '\n' ||
            arr.length === 1 ||
            text !== '\n'
        )
        .map((t) => ({ id: nextId(), kind, text: t, ts: Date.now() }))
      setter((prev) => [...prev, ...rows])
    },
    []
  )

  useEffect(() => {
    const onStdout = (_e: unknown, text: string): void => {
      if (!running) return
      appendLines(tab === 'terminal' ? setLines : setPythonLines, 'stdout', text)
    }
    const onStderr = (_e: unknown, text: string): void => {
      if (!running) return
      appendLines(tab === 'terminal' ? setLines : setPythonLines, 'stderr', text)
    }
    ;(window.electron as any).on?.('run-command:stdout', onStdout)
    ;(window.electron as any).on?.('run-command:stderr', onStderr)
    return () => {
      ;(window.electron as any).off?.('run-command:stdout', onStdout)
      ;(window.electron as any).off?.('run-command:stderr', onStderr)
    }
  }, [running, tab, appendLines])

  // ── Terminal input ────────────────────────────────────────────────────────
  const runCommand = useCallback(
    async (cmd: string): Promise<void> => {
      if (!cmd.trim() || running) return
      setRunning(true)
      if (historyRef.current[0] !== cmd) historyRef.current.unshift(cmd)
      if (historyRef.current.length > 200) historyRef.current.pop()
      histIdxRef.current = -1
      setLines((prev) => [...prev, { id: nextId(), kind: 'cmd', text: cmd, ts: Date.now() }])
      setInput('')
      try {
        const result = await (window.electron as any).runCommand(cmd, cwd ?? undefined)
        setLines((prev) => [
          ...prev,
          { id: nextId(), kind: 'exit', text: `exit ${result.exitCode}`, ts: Date.now() }
        ])
      } catch (e) {
        appendLines(setLines, 'stderr', `Error: ${String(e)}`)
      } finally {
        setRunning(false)
        requestAnimationFrame(() => inputRef.current?.focus())
      }
    },
    [running, cwd, appendLines]
  )

  const handleTerminalKey = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      runCommand(input)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const idx = Math.min(histIdxRef.current + 1, historyRef.current.length - 1)
      histIdxRef.current = idx
      setInput(historyRef.current[idx] ?? '')
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const idx = Math.max(histIdxRef.current - 1, -1)
      histIdxRef.current = idx
      setInput(idx === -1 ? '' : (historyRef.current[idx] ?? ''))
      return
    }
    if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault()
      setLines([])
      return
    }
  }

  const curSetter = tab === 'terminal' ? setLines : setPythonLines

  return (
    <div
      style={{
        height: panelH,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg1)',
        borderTop: '1px solid var(--border)',
        userSelect: 'none'
      }}
    >
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        style={{
          height: 4,
          cursor: 'row-resize',
          background: 'transparent',
          flexShrink: 0,
          position: 'relative'
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 1,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 32,
            height: 2,
            borderRadius: 1,
            background: 'var(--border)',
            pointerEvents: 'none'
          }}
        />
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg2)',
          flexShrink: 0,
          paddingLeft: 4
        }}
      >
        {(
          [
            ['terminal', <IcoTerminal size={12} stroke="currentColor" key="t" />, 'TERMINAL'],
            ['python', <IcoPython size={12} stroke="currentColor" key="p" />, 'PYTHON']
          ] as [PanelTab, JSX.Element, string][]
        ).map(([id, icon, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 14px',
              background: 'none',
              border: 'none',
              borderBottom: tab === id ? '2px solid var(--accent)' : '2px solid transparent',
              color: tab === id ? 'var(--accent)' : 'var(--text2)',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.06em',
              cursor: 'pointer',
              fontWeight: tab === id ? 600 : 400,
              transition: 'color 0.1s',
              marginBottom: -1,
              flexShrink: 0
            }}
          >
            {icon} {label}
            {running && tab === id && (
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: 'var(--hl-teal)',
                  animation: 'pulse 1s infinite',
                  flexShrink: 0
                }}
              />
            )}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 2, paddingRight: 8, alignItems: 'center' }}>
          <button title="Clear output" onClick={() => curSetter([])} style={btnStyle}>
            <IcoTrash size={12} stroke="currentColor" />
          </button>
          {running && (
            <button
              title="Kill process"
              onClick={() => {
                ;(window.electron as any).killProcess?.()
                setRunning(false)
              }}
              style={{ ...btnStyle, color: 'var(--hl-coral)' }}
            >
              <IcoStop size={12} stroke="currentColor" />
            </button>
          )}
          <button title="Collapse" onClick={onClose} style={btnStyle}>
            <IcoChevronUp size={12} stroke="currentColor" />
          </button>
          <button title="Close" onClick={onClose} style={btnStyle}>
            <IcoClose size={12} stroke="currentColor" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          userSelect: 'text'
        }}
      >
        <OutputView lines={curLines} outputRef={curRef as React.RefObject<HTMLDivElement>} />

        {/* Terminal input row */}
        {tab === 'terminal' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '5px 14px 7px',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg1)',
              flexShrink: 0
            }}
          >
            <span
              style={{
                color: running ? 'var(--hl-teal)' : 'var(--accent)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                flexShrink: 0
              }}
            >
              {cwd ? cwd.split(/[\\/]/).pop() : '~'}
              <span style={{ color: 'var(--hl-gold)', marginLeft: 4 }}>❯</span>
            </span>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleTerminalKey}
              disabled={running}
              placeholder={running ? 'Running…' : 'Enter command…'}
              spellCheck={false}
              autoComplete="off"
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: running ? 'var(--text2)' : 'var(--text0)',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                padding: 0,
                cursor: running ? 'not-allowed' : 'text'
              }}
            />
          </div>
        )}

        {/* Python tab */}
        {tab === 'python' && (
          <PythonTab
            cwd={cwd}
            running={running}
            setRunning={setRunning}
            setPythonLines={setPythonLines}
            nextId={nextId}
            appendLines={appendLines}
          />
        )}
      </div>

      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>
    </div>
  )
}
