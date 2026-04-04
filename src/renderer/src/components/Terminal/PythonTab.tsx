import { useState, useCallback, useEffect, useRef, JSX } from 'react'
import { ScriptPathInput } from './ScriptPathInput'
import type { OutputLine } from './OutputView'

const IconPlay = (): JSX.Element => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
)
const IconPin = (): JSX.Element => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="12" y1="17" x2="12" y2="22" />
    <path d="M5 17h14" />
    <path d="M15 5a3 3 0 0 1-6 0V3h6v2z" />
    <path d="M9 5l-4 6a2 2 0 0 0 14 0L15 5" />
  </svg>
)
const IconTrash = (): JSX.Element => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
)
const IconFolder = (): JSX.Element => (
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
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
)
const IconFile = (): JSX.Element => (
  <svg
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
)
const IcoX = (): JSX.Element => (
  <svg
    width="10"
    height="10"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

const compactBtn = (disabled: boolean): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  cursor: disabled ? 'not-allowed' : 'pointer',
  color: 'var(--text2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '2px 4px',
  borderRadius: 3,
  fontSize: 10,
  fontFamily: 'var(--font-mono)',
  opacity: disabled ? 0.4 : 1,
  flexShrink: 0
})

const configLabel: React.CSSProperties = {
  fontSize: 9,
  color: 'var(--text2)',
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.05em',
  flexShrink: 0,
  marginRight: 3,
  opacity: 0.55,
  userSelect: 'none'
}
const configInput: React.CSSProperties = {
  background: 'none',
  border: 'none',
  outline: 'none',
  color: 'var(--text1)',
  fontFamily: 'var(--font-mono)',
  fontSize: 10,
  padding: '1px 2px',
  cursor: 'text'
}
const configSep: React.CSSProperties = {
  width: 1,
  height: 10,
  background: 'var(--border)',
  flexShrink: 0,
  margin: '0 6px'
}

// ── Shared dropdown style: 2-item visible height + scroll ────────────────────
// Each item is ~40px tall (label 13px + path 10px + padding 8+8px)
const ITEM_H = 40
const dropdownStyle: React.CSSProperties = {
  background: 'var(--bg2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
  minWidth: 260,
  maxHeight: ITEM_H * 2 + 2, // exactly 2 items visible
  overflowY: 'auto'
}

interface PythonTabProps {
  cwd?: string | null
  running: boolean
  setRunning: (v: boolean) => void
  setPythonLines: React.Dispatch<React.SetStateAction<OutputLine[]>>
  nextId: () => number
  appendLines: (
    setter: React.Dispatch<React.SetStateAction<OutputLine[]>>,
    kind: 'stdout' | 'stderr' | 'info' | 'cmd' | 'exit',
    text: string
  ) => void
}

export function PythonTab({
  cwd,
  running,
  setRunning,
  setPythonLines,
  nextId,
  appendLines
}: PythonTabProps): JSX.Element {
  const [scriptPath, setScriptPath] = useState('')
  const [scriptArgs, setScriptArgs] = useState('')
  const [scriptCwdOverride, setScriptCwdOverride] = useState('')
  const [scriptHistory, setScriptHistory] = useState<string[]>([])
  const [pinnedScripts, setPinnedScripts] = useState<string[]>([])
  const [showPinManager, setShowPinManager] = useState(false)
  const [pinInput, setPinInput] = useState('')
  const [pythonExe, setPythonExe] = useState('python')
  const [detectedPythons, setDetectedPythons] = useState<{ label: string; path: string }[] | null>(
    null
  )
  const [detecting, setDetecting] = useState(false)

  // ✅ ref for the interpreter anchor (to position dropdown correctly)
  const interpreterAnchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const cfg = await window.electron.getEnvConfig()
        if (cfg.pythonExe) setPythonExe(cfg.pythonExe)
        if (cfg.pythonScript) {
          const scripts = cfg.pythonScript
            .split(',')
            .map((s: string) => s.trim())
            .filter(Boolean)
          setPinnedScripts(scripts)
          if (scripts.length > 0) setScriptPath(scripts[0])
        }
        if (cfg.pythonCwd) setScriptCwdOverride(cfg.pythonCwd)
      } catch {
        /* ignore */
      }
    })()
  }, [])// eslint-disable-line

  const detectPython = useCallback(async (): Promise<void> => {
    setDetecting(true)
    setDetectedPythons(null)
    try {
      setDetectedPythons(await (window.electron as any).detectPython())
    } finally {
      setDetecting(false)
    }
  }, [])

  const runScript = useCallback(async (): Promise<void> => {
    const filePath = scriptPath.trim()
    if (!filePath || running) return
    const exe = pythonExe.trim() || 'python'
    const exeQ = exe.includes(' ') ? `"${exe}"` : exe
    const pathQ = filePath.includes(' ') ? `"${filePath}"` : filePath
    const args = scriptArgs.trim()
    const cmd = args ? `${exeQ} ${pathQ} ${args}` : `${exeQ} ${pathQ}`
    const runCwd = scriptCwdOverride.trim() || cwd || filePath.replace(/[\\/][^\\/]+$/, '')
    setRunning(true)
    setScriptHistory((prev) => [filePath, ...prev.filter((p) => p !== filePath)].slice(0, 20))
    setPythonLines((prev) => [
      ...prev,
      { id: nextId(), kind: 'info', text: `cwd: ${runCwd}`, ts: Date.now() },
      { id: nextId(), kind: 'cmd', text: cmd, ts: Date.now() }
    ])
    try {
      const result = await (window.electron as any).runCommand(cmd, runCwd)
      setPythonLines((prev) => [
        ...prev,
        { id: nextId(), kind: 'exit', text: `exit ${result.exitCode}`, ts: Date.now() }
      ])
    } catch (e) {
      appendLines(setPythonLines, 'stderr', `Error: ${String(e)}`)
    } finally {
      setRunning(false)
    }
  }, [
    scriptPath,
    scriptArgs,
    scriptCwdOverride,
    pythonExe,
    running,
    cwd,
    nextId,
    appendLines,
    setPythonLines,
    setRunning
  ])

  const saveConfig = useCallback(async (patch: Record<string, unknown>): Promise<void> => {
    try {
      const cfg = await window.electron.getEnvConfig()
      // Spread ALL existing config fields so nothing is silently dropped
      await window.electron.saveConfig({
        folderPath: cfg.folderPath,
        jsonPaths: cfg.jsonPaths,
        pythonExe: cfg.pythonExe ?? undefined,
        pythonScript: cfg.pythonScript ?? undefined,
        pythonCwd: cfg.pythonCwd ?? undefined,
        aiApiKey: cfg.aiApiKey,
        aiPromptPath: cfg.aiPromptPath,
        aiGlossaryPath: cfg.aiGlossaryPath,
        ...patch
      })
    } catch {
      /* ignore */
    }
  }, [])

  const exeShort = pythonExe.split(/[\\/]/).pop() || 'python'
  const cwdShort = (scriptCwdOverride || cwd || '').split(/[\\/]/).pop() || 'default'

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg1)', flexShrink: 0 }}>
      {/* ── Pin manager ── */}
      {showPinManager && (
        <div
          style={{
            background: 'var(--bg2)',
            borderBottom: '1px solid var(--border)',
            padding: '8px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 5
          }}
        >
          <div
            style={{
              fontSize: 9,
              color: 'var(--text2)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.07em',
              textTransform: 'uppercase',
              marginBottom: 2
            }}
          >
            Pinned Scripts
          </div>

          {/* ✅ Fixed: max 2 items visible, scrollable */}
          <div
            style={{
              ...dropdownStyle,
              position: 'static',
              boxShadow: 'none',
              border: '1px solid var(--border)',
              borderRadius: 5,
              maxHeight: pinnedScripts.length === 0 ? 'none' : ITEM_H * 2 + 2
            }}
          >
            {pinnedScripts.length === 0 && (
              <div
                style={{
                  padding: '8px 10px',
                  fontSize: 10,
                  color: 'var(--text2)',
                  fontFamily: 'var(--font-mono)',
                  opacity: 0.5
                }}
              >
                ยังไม่มี script — เพิ่มด้านล่าง
              </div>
            )}
            {pinnedScripts.map((p, i) => (
              <div
                key={i}
                onClick={() => {
                  setScriptPath(p)
                  setShowPinManager(false)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 8px',
                  height: ITEM_H,
                  background: p === scriptPath ? 'var(--accent-dim)' : 'none',
                  borderBottom:
                    i < pinnedScripts.length - 1 ? '1px solid rgba(46,51,64,0.5)' : 'none',
                  cursor: 'pointer',
                  boxSizing: 'border-box'
                }}
              >
                <span style={{ color: 'var(--hl-gold)', display: 'flex', flexShrink: 0 }}>
                  <IconFile />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      color: p === scriptPath ? 'var(--accent)' : 'var(--text0)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {p.split(/[\/\\]/).pop()}
                  </div>
                  <div
                    style={{
                      fontSize: 9,
                      color: 'var(--text2)',
                      fontFamily: 'var(--font-mono)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {p}
                  </div>
                </div>
                {p === scriptPath && (
                  <span style={{ fontSize: 9, color: 'var(--accent)', flexShrink: 0 }}>active</span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setPinnedScripts((prev) => prev.filter((_, j) => j !== i))
                  }}
                  style={{ ...compactBtn(false), color: 'var(--hl-coral)', padding: '1px 4px' }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Add row */}
          <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
            <input
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pinInput.trim()) {
                  setPinnedScripts((prev) =>
                    prev.includes(pinInput.trim()) ? prev : [...prev, pinInput.trim()]
                  )
                  setScriptPath(pinInput.trim())
                  setPinInput('')
                }
              }}
              placeholder="path/to/script.py"
              spellCheck={false}
              style={{
                flex: 1,
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                outline: 'none',
                color: 'var(--text0)',
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                padding: '3px 7px'
              }}
            />
            <button
              onClick={async () => {
                const p = await window.electron.openFile([
                  { name: 'Python Script', extensions: ['py'] }
                ])
                if (p) {
                  setPinnedScripts((prev) => (prev.includes(p) ? prev : [...prev, p]))
                  setScriptPath(p)
                }
              }}
              style={{
                ...compactBtn(false),
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '3px 8px',
                fontSize: 10,
                color: 'var(--text1)',
                background: 'var(--bg3)'
              }}
            >
              Browse…
            </button>
            <button
              disabled={!pinInput.trim()}
              onClick={() => {
                if (pinInput.trim()) {
                  setPinnedScripts((prev) =>
                    prev.includes(pinInput.trim()) ? prev : [...prev, pinInput.trim()]
                  )
                  setScriptPath(pinInput.trim())
                  setPinInput('')
                }
              }}
              style={{
                ...compactBtn(!pinInput.trim()),
                border: '1px solid rgba(91,138,240,0.4)',
                borderRadius: 4,
                padding: '3px 10px',
                fontSize: 10,
                color: 'var(--accent)',
                background: 'var(--accent-dim)'
              }}
            >
              + Add
            </button>
          </div>
        </div>
      )}

      {/* ── Row 1: Script + Run ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '4px 8px',
          borderBottom: '1px solid rgba(46,51,64,0.5)'
        }}
      >
        <span style={{ color: 'var(--hl-gold)', display: 'flex', flexShrink: 0, opacity: 0.8 }}>
          <IconFile />
        </span>
        <button
          onClick={() => setShowPinManager((v) => !v)}
          title="Manage pinned scripts"
          style={{
            ...compactBtn(false),
            color: showPinManager
              ? 'var(--hl-gold)'
              : pinnedScripts.length > 0
                ? 'var(--hl-gold)'
                : 'var(--text2)',
            background: showPinManager ? 'var(--hl-gold-bg)' : 'none',
            border: showPinManager ? '1px solid var(--hl-gold-border)' : '1px solid transparent',
            borderRadius: 4,
            padding: '2px 6px',
            position: 'relative'
          }}
        >
          <IconPin />
          {pinnedScripts.length > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -3,
                right: -3,
                background: 'var(--hl-gold)',
                color: '#111',
                fontSize: 7,
                fontFamily: 'var(--font-mono)',
                fontWeight: 700,
                borderRadius: '50%',
                width: 12,
                height: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {pinnedScripts.length}
            </span>
          )}
        </button>
        <ScriptPathInput
          value={scriptPath}
          onChange={setScriptPath}
          pinned={pinnedScripts}
          history={scriptHistory}
          onSelect={setScriptPath}
          disabled={running}
        />
        <button
          disabled={running}
          title="Browse .py"
          onClick={async () => {
            const p = await window.electron.openFile([
              { name: 'Python Script', extensions: ['py'] }
            ])
            if (p) setScriptPath(p)
          }}
          style={compactBtn(running)}
        >
          ...
        </button>
        <div style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0 }} />
        <button
          onClick={runScript}
          disabled={!scriptPath.trim() || running}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: !scriptPath.trim() || running ? 'var(--bg3)' : 'var(--hl-gold)',
            border: 'none',
            borderRadius: 5,
            color: !scriptPath.trim() || running ? 'var(--text2)' : '#111',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            padding: '4px 12px',
            cursor: !scriptPath.trim() || running ? 'not-allowed' : 'pointer',
            opacity: !scriptPath.trim() || running ? 0.4 : 1,
            flexShrink: 0
          }}
        >
          <IconPlay />
          {running ? 'Running…' : 'Run'}
        </button>
      </div>

      {/* ── Row 2: py · args · cwd ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '2px 8px',
          minHeight: 24,
          gap: 2,
          position: 'relative'
        }}
      >
        <span style={configLabel}>py</span>

        {/* ✅ Interpreter anchor — dropdown is positioned relative to this */}
        <div
          ref={interpreterAnchorRef}
          style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2 }}
        >
          <span
            title={pythonExe}
            style={{
              ...configInput,
              width: 72,
              flexShrink: 0,
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: pythonExe !== 'python' ? 'var(--hl-teal)' : 'var(--text2)',
              cursor: 'default'
            }}
          >
            {exeShort}
          </span>

          {/* ✅ Chevron button — toggles dropdown */}
          <button
            disabled={running || detecting}
            onClick={() => {
              if (detectedPythons !== null) {
                setDetectedPythons(null)
                return
              }
              detectPython()
            }}
            style={{
              ...compactBtn(running || detecting),
              color: detectedPythons !== null ? 'var(--accent)' : 'var(--text2)'
            }}
          >
            {detecting ? (
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                style={{ animation: 'spin 1s linear infinite' }}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
          </button>

          <button
            disabled={running}
            onClick={async () => {
              const p = await window.electron.openFile([
                { name: 'Python Executable', extensions: ['exe', '*'] }
              ])
              if (p) {
                setPythonExe(p)
                setDetectedPythons(null)
                saveConfig({ pythonExe: p })
              }
            }}
            style={{ ...compactBtn(running), marginRight: 4 }}
          >
            ...
          </button>

          {/* ✅ Interpreter dropdown — anchored to interpreterAnchorRef, same style as pin */}
          {detectedPythons !== null && (
            <div
              style={{
                ...dropdownStyle,
                position: 'absolute',
                bottom: '100%',
                left: 0,
                zIndex: 200,
                marginBottom: 4
              }}
            >
              {detectedPythons.length === 0 ? (
                <div
                  style={{
                    padding: '8px 10px',
                    fontSize: 11,
                    color: 'var(--hl-coral)',
                    fontFamily: 'var(--font-mono)'
                  }}
                >
                  ไม่พบ Python
                </div>
              ) : (
                detectedPythons.map((py, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setPythonExe(py.path)
                      setDetectedPythons(null)
                      saveConfig({ pythonExe: py.path })
                    }}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 10px',
                      height: ITEM_H,
                      boxSizing: 'border-box',
                      background: 'none',
                      border: 'none',
                      borderBottom:
                        i < detectedPythons.length - 1 ? '1px solid rgba(46,51,64,0.5)' : 'none',
                      cursor: 'pointer',
                      textAlign: 'left' as const
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg3)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 11,
                          color: py.path === pythonExe ? 'var(--accent)' : 'var(--text0)',
                          fontFamily: 'var(--font-mono)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {py.label.split('—')[0].trim()}
                      </div>
                      <div
                        style={{
                          fontSize: 9,
                          color: 'var(--text2)',
                          fontFamily: 'var(--font-mono)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {py.path}
                      </div>
                    </div>
                    {py.path === pythonExe && (
                      <span style={{ color: 'var(--accent)', fontSize: 10, flexShrink: 0 }}>✓</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div style={configSep} />
        <span style={configLabel}>args</span>
        <input
          value={scriptArgs}
          onChange={(e) => setScriptArgs(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') runScript()
          }}
          disabled={running}
          placeholder="–"
          spellCheck={false}
          style={{ ...configInput, flex: 1, minWidth: 30 }}
        />
        <div style={configSep} />
        <span style={configLabel}>cwd</span>
        <span
          title={scriptCwdOverride || cwd || 'default'}
          style={{
            ...configInput,
            width: 80,
            flexShrink: 0,
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: scriptCwdOverride ? 'var(--hl-teal)' : 'var(--text2)',
            cursor: 'default'
          }}
        >
          {cwdShort}
        </span>
        <button
          disabled={running}
          onClick={async () => {
            const p = await window.electron.openFolder()
            if (!p) return
            setScriptCwdOverride(p)
            saveConfig({ pythonCwd: p })
          }}
          style={{ ...compactBtn(running), color: 'var(--hl-teal)' }}
        >
          <IconFolder />
        </button>
        {scriptCwdOverride && (
          <button
            onClick={() => {
              setScriptCwdOverride('')
              saveConfig({ pythonCwd: '' })
            }}
            disabled={running}
            style={compactBtn(running)}
          >
            <IcoX />
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setPythonLines([])}
          title="Clear output"
          style={{ ...compactBtn(false), opacity: 0.45 }}
        >
          <IconTrash />
        </button>
      </div>
    </div>
  )
}
