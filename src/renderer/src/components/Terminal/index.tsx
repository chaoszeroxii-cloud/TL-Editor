import { useState, useRef, useEffect, useCallback, useLayoutEffect, JSX } from 'react'
import { OutputView } from './OutputView'
import { TTSApiTab } from './TTSApiTab'
import type { TtsApiConfig } from './TTSApiTab'
import type { OutputLine } from './OutputView'
import { IcoTerminal, IcoTrash, IcoStop, IcoClose, IcoChevronUp } from '../common/icons'
import { loadGlossariesFromConfig, type GlossaryLibraries } from '../../utils/glossaryLoader'
import type { ToneName } from '../../constants/tones'

type PanelTab = 'terminal' | 'tts'

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
  /** TTS API config (from App store) */
  ttsConfig: TtsApiConfig
  /** Called when TTS config changes — parent saves to store + electron config */
  onTtsConfigChange: (cfg: TtsApiConfig) => void
  /** TGT file path for glossary loading */
  tgtPath?: string | null
  /** TGT file content for TTS generation */
  tgtContent?: string
  /** Callback to get tone for line index */
  getLineTone?: (lineIndex: number) => ToneName
  /** Glossaries for TTS (before/after libs) */
  tgsGlossaries?: Record<string, Record<string, string>>
  /** Called when TTS audio is successfully generated */
  onPlayTtsAudio?: (blob: Blob) => void
}

export function TerminalPanel({
  cwd,
  onClose,
  ttsConfig,
  onTtsConfigChange,
  tgtPath,
  tgtContent,
  getLineTone,
  tgsGlossaries,
  onPlayTtsAudio
}: TerminalPanelProps): JSX.Element {
  const [tab, setTab] = useState<PanelTab>('tts')
  const [lines, setLines] = useState<OutputLine[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [panelH, setPanelH] = useState(280)
  const [glossaries, setGlossaries] = useState<GlossaryLibraries>({ at_lib: {}, bf_lib: {} })
  const [glossaryPaths, setGlossaryPaths] = useState<{ atPath?: string; bfPath?: string }>({})
  const [configJsonPaths, setConfigJsonPaths] = useState<string[]>([])

  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const historyRef = useRef<string[]>([])
  const histIdxRef = useRef(-1)
  const idRef = useRef(0)
  const nextId = (): number => ++idRef.current

  // ── Load config on mount ────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      const cfg = await window.electron.getEnvConfig()
      setConfigJsonPaths(cfg.jsonPaths || [])
    })()
  }, [])

  // ── Load glossaries when tgtPath or config changes ────────────────────────────
  useEffect(() => {
    ;(async () => {
      const { libs, atPath, bfPath } = await loadGlossariesFromConfig(
        configJsonPaths,
        tgtPath ?? null
      )
      setGlossaries(libs)
      setGlossaryPaths({ atPath, bfPath })
    })()
  }, [tgtPath, configJsonPaths])

  useLayoutEffect(() => {
    const el = outputRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines, tab])

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
          160,
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
    if (tab !== 'terminal') return
    const onStdout = (...args: unknown[]): void => {
      const text = args[1] as string
      if (!running) return
      appendLines(setLines, 'stdout', text)
    }
    const onStderr = (...args: unknown[]): void => {
      const text = args[1] as string
      if (!running) return
      appendLines(setLines, 'stderr', text)
    }
    window.electron.on('run-command:stdout', onStdout)
    window.electron.on('run-command:stderr', onStderr)
    return () => {
      window.electron.off('run-command:stdout', onStdout)
      window.electron.off('run-command:stderr', onStderr)
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
        const result = await window.electron.runCommand(cmd, cwd ?? undefined)
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

  // ── TTS icon ──────────────────────────────────────────────────────────────
  const IcoTTS = (): JSX.Element => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  )

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
            ['tts', <IcoTTS key="tts" />, 'TTS API']
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
          {tab === 'terminal' && (
            <button title="Clear output" onClick={() => setLines([])} style={btnStyle}>
              <IcoTrash size={12} stroke="currentColor" />
            </button>
          )}
          {running && tab === 'terminal' && (
            <button
              title="Kill process"
              onClick={() => {
                window.electron.killProcess?.()
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
        {/* ── Terminal tab ── */}
        {tab === 'terminal' && (
          <>
            <OutputView lines={lines} outputRef={outputRef as React.RefObject<HTMLDivElement>} />
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
          </>
        )}

        {/* ── TTS API tab ── */}
        {tab === 'tts' && (
          <TTSApiTab
            config={ttsConfig}
            onConfigChange={onTtsConfigChange}
            glossaries={glossaries}
            tgtContent={tgtContent}
            tgtPath={tgtPath}
            glossaryPaths={glossaryPaths}
            getLineTone={getLineTone}
            tgsGlossaries={tgsGlossaries}
            onPlayTtsAudio={onPlayTtsAudio}
          />
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
