// ─── AITranslatePanel/index.tsx ──────────────────────────────────────────────
// เพิ่ม tab "เกลา" และ prop onPushParaphrase สำหรับ find-replace ใน TGT

import { useState, useCallback, useRef, useEffect, JSX } from 'react'
import type { GlossaryEntry } from '../../types'
import { extractNewEntries } from './extractNewEntries'
import type { PendingEntry } from './extractNewEntries'
import { NewEntryReview } from './NewEntryReview'
import { ParaphraseTab } from './ParaphraseTab'
import { StyleProfilePanel } from '../StyleProfile/StyleProfilePanel'
import { IcoSparkle, IcoFile, IcoKey, IcoX } from '../common/icons'
import type { StyleProfile } from '../StyleProfile/types'

interface OpenRouterResponse {
  choices: {
    message: {
      content: string
    }
  }[]
}

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
  /**
   * Called by the Paraphrase tab when user clicks → TGT.
   * Receives (originalInput, paraphrasedResult).
   * The parent (App.tsx) should replace originalInput with paraphrasedResult
   * inside the current TGT content (find-replace), NOT replace everything.
   *
   * Suggested App.tsx handler:
   *   const handlePushParaphrase = useCallback((orig: string, result: string) => {
   *     const cur = files.tgtContentRef.current
   *     const idx = cur.indexOf(orig)
   *     if (idx !== -1) {
   *       files.handleTgtChange(cur.slice(0, idx) + result + cur.slice(idx + orig.length))
   *     } else {
   *       // fallback: replace all if exact match not found
   *       files.handleTgtChange(result)
   *     }
   *   }, [files])
   */
  onPushParaphrase?: (original: string, result: string) => void
  /** ข้อความที่ส่งมาจาก context menu "ส่งไป Paraphrase" */
  paraphraseInput?: string | null
  onParaphraseInputConsumed?: () => void
  profilePanel: {
    profile: StyleProfile | null
    isAnalyzing: boolean
    analyzeError: string | null
    apiKey: string
    onAnalyze: (model: string) => void
    onClearCorrections: () => void
    onResetProfile: () => void
  }
  profileActive?: boolean
  onSelectWorkTab?: () => void
  onSelectProfileTab?: () => void
}

type PanelTab = 'translate' | 'paraphrase' | 'profile'

const BASE_TYPES = ['person', 'place', 'term', 'other']

const MODELS = [
  { id: 'deepseek/deepseek-v4-flash', label: 'V4 Flash' },
  { id: 'deepseek/deepseek-v4-pro', label: 'V4 Pro' }
] as const

export function AITranslatePanel({
  srcContent,
  onResult,
  savedConfig,
  onConfigChange,
  glossary = [],
  sourceFilePaths = {},
  onAddEntries,
  stylePromptSnippet = '',
  onPushParaphrase,
  paraphraseInput,
  onParaphraseInputConsumed,
  profilePanel,
  profileActive = false,
  onSelectWorkTab,
  onSelectProfileTab
}: AITranslatePanelProps): JSX.Element {
  const [activeTab, setActiveTab] = useState<PanelTab>('translate')

  // ── Translate tab state ─────────────────────────────────────────────────────
  const [apiKey, setApiKey] = useState(savedConfig.apiKey)
  const [promptPath, setPromptPath] = useState(savedConfig.promptPath)
  const [glossaryPath, setGlossaryPath] = useState(savedConfig.glossaryPath)
  const [model, setModel] = useState<string>(MODELS[0].id)
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [showKey, setShowKey] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const [networkRequestId, setNetworkRequestId] = useState<string | null>(null)

  const [pendingEntries, setPendingEntries] = useState<PendingEntry[]>([])
  const [showEntries, setShowEntries] = useState(false)
  const [addTargetFile, setAddTargetFile] = useState('')
  const [addDone, setAddDone] = useState(false)
  const [rawTranslated, setRawTranslated] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  const fileNames = Object.keys(sourceFilePaths)
  const availableTypes = [
    ...new Set([...BASE_TYPES, ...glossary.map((g) => g.type).filter(Boolean)])
  ].sort()

  useEffect(() => {
    onConfigChange({ apiKey, promptPath, glossaryPath })
  }, [apiKey, promptPath, glossaryPath, onConfigChange])

  // เมื่อได้รับข้อความจาก context menu → switch ไปที่ tab paraphrase
  useEffect(() => {
    if (paraphraseInput) {
      setActiveTab('paraphrase')
      onSelectWorkTab?.()
      onParaphraseInputConsumed?.()
    }
  }, [paraphraseInput, setActiveTab, onParaphraseInputConsumed, onSelectWorkTab])

  useEffect(() => {
    if (profileActive) {
      setActiveTab('profile')
    } else if (activeTab === 'profile') {
      setActiveTab('translate')
    }
  }, [profileActive, activeTab])

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
    setRawTranslated(null)
    setShowRaw(false)

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

      const response = await window.electron.openrouterChat({
        apiKey: apiKey.trim(),
        model,
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: srcContent }
        ]
      })

      // Extract requestId and data from unified response format
      const { requestId, data: rawJson } = response as { requestId: string; data: string }
      setNetworkRequestId(requestId)

      let data: unknown
      try {
        data = JSON.parse(rawJson)
      } catch {
        throw new Error(`OpenRouter ส่งข้อมูลที่ parse ไม่ได้: ${String(rawJson).slice(0, 120)}`)
      }
      const translated: string = (data as OpenRouterResponse).choices?.[0]?.message?.content ?? ''
      if (!translated) throw new Error('ไม่ได้รับข้อความตอบกลับ')

      const { cleaned, entries } = extractNewEntries(translated)
      setRawTranslated(translated)
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
        setNetworkRequestId(null)
        return
      }
      setStatus('error')
      setStatusMsg(String(e))
      setNetworkRequestId(null)
    }
  }, [apiKey, promptPath, glossaryPath, model, srcContent, onResult, fileNames, stylePromptSnippet])

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

  const tabStyle = (t: PanelTab): React.CSSProperties => ({
    flex: 1,
    padding: '6px 0',
    background: 'none',
    border: 'none',
    borderBottom: activeTab === t ? '2px solid var(--accent)' : '2px solid transparent',
    color: activeTab === t ? 'var(--accent)' : 'var(--text2)',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.05em',
    cursor: 'pointer',
    fontWeight: activeTab === t ? 600 : 400,
    marginBottom: -1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    transition: 'color 0.1s'
  })

  return (
    <div style={s.panel}>
      {/* Header */}
      <div style={s.header}>
        <span style={s.headerIcon}>
          <IcoSparkle size={13} stroke="currentColor" />
        </span>
        <span style={s.headerTitle}>AI Translate</span>
        <span style={s.model}>{MODELS.find((m) => m.id === model)?.label ?? model}</span>
      </div>

      {/* Tab switcher */}
      <div
        style={{
          display: 'flex',
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
          padding: '0 10px',
          flexShrink: 0
        }}
      >
        <button
          style={tabStyle('translate')}
          onClick={() => {
            setActiveTab('translate')
            onSelectWorkTab?.()
          }}
        >
          <IcoSparkle size={10} stroke="currentColor" /> แปล
        </button>
        <button
          style={tabStyle('paraphrase')}
          onClick={() => {
            setActiveTab('paraphrase')
            onSelectWorkTab?.()
          }}
        >
          ✦ เกลา
        </button>
        <button
          style={tabStyle('profile')}
          onClick={() => {
            setActiveTab('profile')
            onSelectProfileTab?.()
          }}
        >
          ✦ Profile
        </button>
      </div>

      {/* Body */}
      <div style={s.body}>
        {/* ════════════ TRANSLATE TAB ════════════ */}
        {activeTab === 'translate' && (
          <>
            <div style={s.field}>
              <label style={s.label}>MODEL</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {MODELS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setModel(m.id)}
                    style={{
                      flex: 1,
                      padding: '4px 6px',
                      border: '1px solid var(--border)',
                      borderRadius: 5,
                      cursor: 'pointer',
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      background: model === m.id ? 'var(--accent-dim)' : 'var(--bg2)',
                      color: model === m.id ? 'var(--accent)' : 'var(--text2)',
                      fontWeight: model === m.id ? 600 : 400
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

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

            <div style={s.btnRow}>
              {status === 'loading' ? (
                <button
                  onClick={() => {
                    abortRef.current?.abort()
                    if (networkRequestId) {
                      window.electron.cancelNetworkRequest(networkRequestId).catch(console.error)
                    }
                  }}
                  style={s.btnCancel}
                >
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

            {rawTranslated && (
              <div
                style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}
              >
                <button
                  onClick={() => setShowRaw((v) => !v)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 9px',
                    background: showRaw ? 'var(--bg2)' : 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left' as const
                  }}
                >
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text2)"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <polyline points={showRaw ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
                  </svg>
                  <span
                    style={{
                      fontSize: 9,
                      color: 'var(--text2)',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.06em',
                      flex: 1
                    }}
                  >
                    RAW OUTPUT (before clean)
                  </span>
                  <span
                    style={{
                      fontSize: 9,
                      fontFamily: 'var(--font-mono)',
                      color:
                        rawTranslated.length > rawTranslated.replace(/```[\s\S]*?```/g, '').length
                          ? 'var(--hl-gold)'
                          : 'var(--text2)'
                    }}
                  >
                    {rawTranslated.split('\n').length} lines
                  </span>
                </button>
                {showRaw && (
                  <div
                    style={{
                      maxHeight: 180,
                      overflowY: 'auto',
                      background: 'var(--bg0)',
                      borderTop: '1px solid var(--border)',
                      padding: '8px 9px'
                    }}
                  >
                    <pre
                      style={{
                        margin: 0,
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text1)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word' as const,
                        lineHeight: 1.6
                      }}
                    >
                      {rawTranslated}
                    </pre>
                  </div>
                )}
              </div>
            )}

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
                onSelectAll={() =>
                  setPendingEntries((p) => p.map((e) => ({ ...e, selected: true })))
                }
                onSelectNone={() =>
                  setPendingEntries((p) => p.map((e) => ({ ...e, selected: false })))
                }
                onAddSelected={handleAddSelected}
                canAdd={!!onAddEntries}
              />
            )}
          </>
        )}

        {/* ════════════ PARAPHRASE TAB ════════════ */}
        {activeTab === 'paraphrase' && (
          <>
            {!apiKey.trim() && (
              <div
                style={{
                  padding: '6px 8px',
                  background: 'rgba(91,138,240,0.08)',
                  border: '1px solid rgba(91,138,240,0.25)',
                  borderRadius: 5,
                  fontSize: 10,
                  color: 'var(--accent)',
                  fontFamily: 'var(--font-mono)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5
                }}
              >
                <span>⚠</span>
                <span>ใส่ API key ใน tab &quot;แปล&quot; ก่อน</span>
              </div>
            )}
            <ParaphraseTab
              apiKey={apiKey}
              model={model}
              stylePromptSnippet={stylePromptSnippet}
              onPushToTgt={onPushParaphrase}
              initialInput={paraphraseInput ?? undefined}
            />
          </>
        )}

        {activeTab === 'profile' && (
          <StyleProfilePanel
            profile={profilePanel.profile}
            isAnalyzing={profilePanel.isAnalyzing}
            analyzeError={profilePanel.analyzeError}
            apiKey={profilePanel.apiKey}
            onAnalyze={() => profilePanel.onAnalyze(model)}
            onClearCorrections={profilePanel.onClearCorrections}
            onResetProfile={profilePanel.onResetProfile}
            embedded
          />
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
