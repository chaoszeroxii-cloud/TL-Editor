import { useState, useCallback, useRef, useEffect, JSX } from 'react'
import type { GlossaryEntry } from '../../types'
import { extractNewEntries } from './extractNewEntries'
import type { PendingEntry } from './extractNewEntries'
import { NewEntryReview } from './NewEntryReview'
import { IcoSparkle, IcoFile, IcoKey, IcoX } from '../common/icons'

export interface AITranslateConfig {
  apiKey: string
  promptPath: string
  glossaryPath: string
}

interface AITranslatePanelProps {
  srcContent: string
  onResult: (translated: string) => void
  savedConfig: AITranslateConfig
  onConfigChange: (cfg: AITranslateConfig) => void
  glossary?: GlossaryEntry[]
  sourceFilePaths?: Record<string, string>
  onAddEntries?: (entries: GlossaryEntry[], targetFile: string) => void
  stylePromptSnippet?: string
}

const BASE_TYPES = ['person', 'place', 'term', 'other']

export function AITranslatePanel({
  srcContent,
  onResult,
  savedConfig,
  onConfigChange,
  glossary = [],
  sourceFilePaths = {},
  onAddEntries,
  stylePromptSnippet = ''
}: AITranslatePanelProps): JSX.Element {
  const [apiKey, setApiKey] = useState(savedConfig.apiKey)
  const [promptPath, setPromptPath] = useState(savedConfig.promptPath)
  const [glossaryPath, setGlossaryPath] = useState(savedConfig.glossaryPath)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [showKey, setShowKey] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([])
  const [showEntries, setShowEntries] = useState(false)
  const [addTargetFile, setAddTargetFile] = useState('')
  const [addDone, setAddDone] = useState(false)

  const fileNames = Object.keys(sourceFilePaths)
  const availableTypes = [
    ...new Set([...BASE_TYPES, ...glossary.map((g) => g.type).filter(Boolean)])
  ].sort()

  useEffect(() => {
    onConfigChange({ apiKey, promptPath, glossaryPath })
  }, [apiKey, promptPath, glossaryPath]) // eslint-disable-line

  const browsePrompt = async (): Promise<void> => {
    const p = await window.electron.openFile([{ name: 'Text / Prompt', extensions: ['txt', 'md'] }])
    if (p) setPromptPath(p)
  }
  const browseGlossary = async (): Promise<void> => {
    const p = await window.electron.openFile([{ name: 'Glossary JSON', extensions: ['json'] }])
    if (p) setGlossaryPath(p)
  }

  const handleTranslate = useCallback(async (): Promise<void> => {
    if (!apiKey.trim() || !srcContent.trim()) return
    abortRef.current = new AbortController()
    setStatus('loading')
    setStatusMsg('กำลังโหลด prompt และ glossary…')
    setPendingEntries([])
    setAddDone(false)
    setShowEntries(false)

    try {
      let prompt = 'แปลนิยายตอนนี้จาก [ภาษาต้นทาง] เป็น [ภาษาไทย]'
      if (promptPath) {
        try {
          prompt = await window.electron.readFile(promptPath)
        } catch {
          /* default */
        }
      }

      let glossaryText = ''
      if (glossaryPath) {
        try {
          glossaryText = await window.electron.readFile(glossaryPath)
        } catch {
          /* skip */
        }
      }

      const systemMsg = [
        prompt,
        stylePromptSnippet ? `\n\n## Translator Style Guide\n${stylePromptSnippet}` : '',
        glossaryText ? `\n\n## Glossary (JSON)\n\`\`\`json\n${glossaryText}\n\`\`\`` : ''
      ]
        .filter(Boolean)
        .join('')

      setStatusMsg('กำลังส่งไป DeepSeek…')

      const rawJson = await (window.electron as any).openrouterChat({
        apiKey: apiKey.trim(),
        model: 'deepseek/deepseek-v3.2',
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: srcContent }
        ]
      })

      const data = JSON.parse(rawJson)
      const translated: string = data.choices?.[0]?.message?.content ?? ''
      if (!translated) throw new Error('ไม่ได้รับข้อความตอบกลับ')

      const { cleaned, entries } = extractNewEntries(translated)
      setStatus('done')
      setStatusMsg(
        `แปลสำเร็จ — ${cleaned.split('\n').length} บรรทัด${entries.length > 0 ? ` · ✨ ${entries.length} entries ใหม่` : ''}`
      )
      onResult(cleaned)

      if (entries.length > 0) {
        setPendingEntries(entries)
        setShowEntries(true)
        setAddTargetFile(fileNames[0] ?? '')
      }
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') {
        setStatus('idle')
        setStatusMsg('ยกเลิกแล้ว')
        return
      }
      setStatus('error')
      setStatusMsg(String(e))
    }
  }, [apiKey, promptPath, glossaryPath, srcContent, onResult, fileNames])

  const handleAddSelected = useCallback((): void => {
    const selected = pendingEntries.filter((e) => e.selected)
    if (!selected.length || !onAddEntries) return
    const entries: GlossaryEntry[] = selected.map((e) => ({
      src: e.src,
      th: e.th,
      note: e.note,
      type: e.type,
      _file: addTargetFile || undefined
    }))
    onAddEntries(entries, addTargetFile)
    setAddDone(true)
    setPendingEntries((prev) => prev.map((e) => (e.selected ? { ...e, selected: false } : e)))
  }, [pendingEntries, addTargetFile, onAddEntries])

  const canTranslate = !!(apiKey.trim() && srcContent.trim() && status !== 'loading')

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.headerIcon}>
          <IcoSparkle size={13} stroke="currentColor" />
        </span>
        <span style={s.headerTitle}>AI Translate</span>
        <span style={s.model}>deepseek-v3.2·OpenRouter</span>
      </div>

      <div style={s.body}>
        {/* API Key */}
        <div style={s.field}>
          <label style={s.label}>
            <IcoKey size={12} stroke="currentColor" /> API Key
          </label>
          <div style={s.inputRow}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-or-v1-…"
              spellCheck={false}
              style={{ ...s.input, fontFamily: showKey ? 'var(--font-mono)' : undefined }}
            />
            <button onClick={() => setShowKey((v) => !v)} style={s.toggleBtn}>
              {showKey ? '●' : '○'}
            </button>
          </div>
        </div>

        {/* Prompt file */}
        <div style={s.field}>
          <label style={s.label}>
            <IcoFile size={12} stroke="currentColor" /> Prompt file
          </label>
          <div style={s.inputRow}>
            <div style={s.pathChip} title={promptPath}>
              {promptPath ? (
                promptPath.split(/[\\/]/).pop()
              ) : (
                <span style={{ color: 'var(--text2)' }}>ใช้ default prompt</span>
              )}
            </div>
            <button onClick={browsePrompt} style={s.browseBtn}>
              Browse…
            </button>
            {promptPath && (
              <button onClick={() => setPromptPath('')} style={s.clearBtn}>
                <IcoX size={10} stroke="currentColor" />
              </button>
            )}
          </div>
        </div>

        {/* Glossary file */}
        <div style={s.field}>
          <label style={s.label}>
            <IcoFile size={12} stroke="currentColor" /> Glossary JSON
          </label>
          <div style={s.inputRow}>
            <div style={s.pathChip} title={glossaryPath}>
              {glossaryPath ? (
                glossaryPath.split(/[\\/]/).pop()
              ) : (
                <span style={{ color: 'var(--text2)' }}>ไม่มี glossary</span>
              )}
            </div>
            <button onClick={browseGlossary} style={s.browseBtn}>
              Browse…
            </button>
            {glossaryPath && (
              <button onClick={() => setGlossaryPath('')} style={s.clearBtn}>
                <IcoX size={10} stroke="currentColor" />
              </button>
            )}
          </div>
        </div>

        {/* Status */}
        {statusMsg && (
          <div
            style={{
              ...s.statusBar,
              background:
                status === 'error'
                  ? 'rgba(240,122,106,0.1)'
                  : status === 'done'
                    ? 'rgba(62,207,160,0.1)'
                    : 'var(--bg3)',
              borderColor:
                status === 'error'
                  ? 'rgba(240,122,106,0.3)'
                  : status === 'done'
                    ? 'rgba(62,207,160,0.3)'
                    : 'var(--border)',
              color:
                status === 'error'
                  ? 'var(--hl-coral)'
                  : status === 'done'
                    ? 'var(--hl-teal)'
                    : 'var(--text2)'
            }}
          >
            {status === 'loading' && (
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
            )}
            <span style={{ flex: 1 }}>{statusMsg}</span>
          </div>
        )}

        {/* Buttons */}
        <div style={s.btnRow}>
          {status === 'loading' ? (
            <button onClick={() => abortRef.current?.abort()} style={s.btnCancel}>
              ยกเลิก
            </button>
          ) : (
            <button
              onClick={handleTranslate}
              disabled={!canTranslate}
              style={{
                ...s.btnTranslate,
                opacity: canTranslate ? 1 : 0.4,
                cursor: canTranslate ? 'pointer' : 'not-allowed'
              }}
            >
              <IcoSparkle size={12} stroke="currentColor" /> แปลทั้งบท
            </button>
          )}
        </div>

        {/* New Entry Review */}
        {pendingEntries.length > 0 && (
          <NewEntryReview
            pendingEntries={pendingEntries}
            showEntries={showEntries}
            addDone={addDone}
            addTargetFile={addTargetFile}
            fileNames={fileNames}
            availableTypes={availableTypes}
            onToggleShow={() => setShowEntries((v) => !v)}
            onToggleEntry={(i) =>
              setPendingEntries((prev) =>
                prev.map((e, j) => (j === i ? { ...e, selected: !e.selected } : e))
              )
            }
            onSetType={(i, type) =>
              setPendingEntries((prev) => prev.map((e, j) => (j === i ? { ...e, type } : e)))
            }
            onSetTargetFile={setAddTargetFile}
            onSelectAll={() => setPendingEntries((p) => p.map((e) => ({ ...e, selected: true })))}
            onSelectNone={() => setPendingEntries((p) => p.map((e) => ({ ...e, selected: false })))}
            onAddSelected={handleAddSelected}
            canAdd={!!onAddEntries}
          />
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  panel: {
    width: 260,
    background: 'var(--bg1)',
    borderLeft: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '7px 10px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg2)',
    flexShrink: 0
  },
  headerIcon: { color: 'var(--accent)', display: 'flex' },
  headerTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text0)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.04em'
  },
  model: { fontSize: 9, color: 'var(--text2)', fontFamily: 'var(--font-mono)', marginLeft: 'auto' },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 10
  },
  field: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: {
    fontSize: 9,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  inputRow: { display: 'flex', gap: 4, alignItems: 'center' },
  input: {
    flex: 1,
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    color: 'var(--text0)',
    fontSize: 11,
    padding: '5px 8px',
    outline: 'none',
    minWidth: 0
  },
  toggleBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text2)',
    fontSize: 12,
    padding: '3px 5px',
    flexShrink: 0
  },
  pathChip: {
    flex: 1,
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 5,
    fontSize: 10,
    padding: '5px 8px',
    fontFamily: 'var(--font-mono)',
    color: 'var(--hl-gold)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0
  },
  browseBtn: {
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    color: 'var(--text1)',
    fontSize: 10,
    padding: '4px 8px',
    borderRadius: 5,
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    flexShrink: 0
  },
  clearBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text2)',
    padding: '2px 3px',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0
  },
  statusBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 9px',
    borderRadius: 6,
    border: '1px solid',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    lineHeight: 1.5
  },
  btnRow: { display: 'flex', gap: 6, marginTop: 4 },
  btnTranslate: {
    flex: 1,
    background: 'var(--accent)',
    border: 'none',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    padding: '7px 14px',
    borderRadius: 6,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  btnCancel: {
    flex: 1,
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text1)',
    fontSize: 12,
    padding: '7px 14px',
    borderRadius: 6,
    cursor: 'pointer'
  }
}
