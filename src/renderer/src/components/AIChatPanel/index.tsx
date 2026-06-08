// AIChatPanel/index.tsx
// Embedded translation agent. Replaces the old AITranslatePanel: one chat that
// sees the open chapter (src+tgt+matched glossary), translates / edits TGT and
// proposes glossary terms via staged, content-anchored diffs the user reviews.

import { useState, useRef, useEffect, useCallback, useMemo, JSX } from 'react'
import type { GlossaryEntry } from '../../types'
import type { ChatMessage, ReasoningEffort, ToolContext } from './types'
import { filterMatchedGlossary, buildNestedFromEntries, matchEntryInText } from '../../utils/glossaryMatch'
import { useChatAgent, type ContextInputs } from './useChatAgent'
import type { PendingDiffsApi } from './usePendingDiffs'
import { useChatSessions } from './useChatSessions'
import { ReviewQueue } from './ReviewQueue'
import { IcoSparkle, IcoKey, IcoFile, IcoX, IcoBrain, IcoPen, IcoCheck } from '../common/icons'

const MODELS = [
  { id: 'deepseek/deepseek-v4-pro', label: 'V4 Pro' },
  { id: 'deepseek/deepseek-v4-flash', label: 'V4 Flash' }
] as const

const EFFORTS: ReasoningEffort[] = ['off', 'low', 'medium', 'high']
const EFFORT_LABEL: Record<ReasoningEffort, string> = {
  off: 'Off',
  low: 'Low',
  medium: 'Med',
  high: 'High'
}

// Masked preview of a saved key, e.g. "sk-or-…a1b2" — enough to confirm it's set
// and which one, without revealing the secret.
function maskKey(key: string): string {
  const k = key.trim()
  if (k.length <= 10) return '••••••'
  return `${k.slice(0, 6)}…${k.slice(-4)}`
}

export interface AIChatPanelProps {
  srcContent: string
  tgtContent: string
  glossary: GlossaryEntry[]
  sourceFilePaths: Record<string, string>
  aiConfig: { apiKey: string; promptPath: string; glossaryPath: string }
  onConfigChange: (cfg: { apiKey: string; promptPath: string; glossaryPath: string }) => void
  /** Open folder root (context-memory injection + session persistence). */
  rootDir: string | null
  /** Shared staged-review queue (owned by App; also drives inline ghost diffs). */
  pending: PendingDiffsApi
  /** Current project-memory.md content (owned by App). */
  memoryContent: string
}

export function AIChatPanel({
  srcContent,
  tgtContent,
  glossary,
  sourceFilePaths,
  aiConfig,
  onConfigChange,
  rootDir,
  pending,
  memoryContent
}: AIChatPanelProps): JSX.Element {
  const [model, setModel] = useState<string>(MODELS[0].id)
  const [effort, setEffort] = useState<ReasoningEffort>('off')
  const [promptEnabled, setPromptEnabled] = useState(false)
  const [promptContent, setPromptContent] = useState('')
  const [input, setInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [editingKey, setEditingKey] = useState(false)
  const [width, setWidth] = useState(380)
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false)
  const sessionMenuRef = useRef<HTMLDivElement>(null)
  const [excludedFiles, setExcludedFiles] = useState<Set<string>>(new Set())
  const [glossaryConfigured, setGlossaryConfigured] = useState(false)
  const [glossaryMenuOpen, setGlossaryMenuOpen] = useState(false)
  const glossaryMenuRef = useRef<HTMLDivElement>(null)

  const fileNames = useMemo(() => Object.keys(sourceFilePaths), [sourceFilePaths])
  const defaultGlossaryFile = fileNames[0] ?? ''

  // Distinct glossary source files — for the AI-include picker rows.
  const glossaryFileList = useMemo(() => {
    const set = new Set<string>()
    for (const g of glossary) if (g._file) set.add(g._file)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [glossary])

  // Per-file count of entries that will actually be SENT — those whose term appears
  // in the chapter's SRC (same filter as getContextInputs, so the number == payload).
  // Computed only while the picker is open, to avoid scanning on every keystroke.
  const matchedCounts = useMemo(() => {
    const counts = new Map<string, number>()
    if (!glossaryMenuOpen) return counts
    for (const g of glossary) {
      if (g._file && matchEntryInText(g, srcContent)) {
        counts.set(g._file, (counts.get(g._file) ?? 0) + 1)
      }
    }
    return counts
  }, [glossaryMenuOpen, glossary, srcContent])

  // Files EXCLUDED from the AI context. Default (until the user picks): TTS
  // pronunciation libs (at_lib / bf_lib) — they aren't translation glossary.
  const effectiveExcluded = useMemo(() => {
    if (glossaryConfigured) return excludedFiles
    return new Set(glossaryFileList.filter((f) => /at_lib|bf_lib/i.test(f)))
  }, [glossaryConfigured, excludedFiles, glossaryFileList])

  const includedFileCount = glossaryFileList.filter((f) => !effectiveExcluded.has(f)).length

  // ── Seed reasoning/prompt settings from persisted config (once) ─────────────
  useEffect(() => {
    window.electron
      .getEnvConfig()
      .then((cfg) => {
        if (cfg.aiReasoningEffort && EFFORTS.includes(cfg.aiReasoningEffort as ReasoningEffort)) {
          setEffort(cfg.aiReasoningEffort as ReasoningEffort)
        }
        setPromptEnabled(!!cfg.aiPromptEnabled)
        if (Array.isArray(cfg.aiGlossaryExcludeFiles)) {
          setExcludedFiles(new Set(cfg.aiGlossaryExcludeFiles))
          setGlossaryConfigured(true)
        }
      })
      .catch(() => {})
  }, [])

  // ── Load prompt-md content when enabled / path changes ──────────────────────
  // No synchronous reset here (it would cascade renders); when disabled or no
  // path, getContextInputs simply ignores promptContent (see basePrompt below).
  useEffect(() => {
    if (!promptEnabled || !aiConfig.promptPath) return
    let cancelled = false
    window.electron
      .readFile(aiConfig.promptPath)
      .then((txt) => {
        if (!cancelled) setPromptContent(txt)
      })
      .catch(() => {
        if (!cancelled) setPromptContent('')
      })
    return () => {
      cancelled = true
    }
  }, [promptEnabled, aiConfig.promptPath])

  const persistEffort = useCallback((e: ReasoningEffort) => {
    setEffort(e)
    window.electron.saveConfigPatch({ aiReasoningEffort: e }).catch(() => {})
  }, [])

  const togglePrompt = useCallback(() => {
    setPromptEnabled((v) => {
      const next = !v
      window.electron.saveConfigPatch({ aiPromptEnabled: next }).catch(() => {})
      return next
    })
  }, [])

  const browsePrompt = useCallback(async () => {
    const p = await window.electron.openFile([{ name: 'Prompt', extensions: ['txt', 'md'] }])
    if (p) onConfigChange({ ...aiConfig, promptPath: p })
  }, [aiConfig, onConfigChange])

  const toggleGlossaryFile = useCallback(
    (file: string) => {
      const next = new Set(effectiveExcluded)
      if (next.has(file)) next.delete(file)
      else next.add(file)
      setExcludedFiles(next)
      setGlossaryConfigured(true)
      window.electron.saveConfigPatch({ aiGlossaryExcludeFiles: [...next] }).catch(() => {})
    },
    [effectiveExcluded]
  )

  // ── Agent loop ──────────────────────────────────────────────────────────────
  const getContextInputs = useCallback((): ContextInputs => {
    // Only send entries from kept files whose term appears in the SRC of this
    // chapter (translation relevance) — keeps the payload lean.
    const visible = glossary.filter((g) => !g._file || !effectiveExcluded.has(g._file))
    const matched = filterMatchedGlossary(visible, srcContent)
    const glossaryNestedJson =
      matched.length > 0 ? JSON.stringify(buildNestedFromEntries(matched), null, 2) : ''
    return {
      basePrompt: promptEnabled && aiConfig.promptPath ? promptContent : '',
      projectMemory: rootDir ? memoryContent : '',
      glossaryNestedJson,
      srcContent,
      tgtContent
    }
  }, [
    glossary,
    effectiveExcluded,
    srcContent,
    promptEnabled,
    promptContent,
    aiConfig.promptPath,
    tgtContent,
    rootDir,
    memoryContent
  ])

  const makeToolContext = useCallback(
    (): ToolContext => ({
      srcContent,
      tgtContent,
      projectMemory: memoryContent,
      defaultGlossaryFile,
      stageEdit: pending.stageEdit,
      stageGlossary: pending.stageGlossary,
      stageMemory: pending.stageMemory
    }),
    [
      srcContent,
      tgtContent,
      memoryContent,
      defaultGlossaryFile,
      pending.stageEdit,
      pending.stageGlossary,
      pending.stageMemory
    ]
  )

  const agent = useChatAgent({
    apiKey: aiConfig.apiKey,
    model,
    reasoningEffort: effort,
    getContextInputs,
    makeToolContext
  })

  const sessions = useChatSessions({
    rootDir,
    messages: agent.messages,
    setMessages: agent.setMessages
  })

  // ── Auto-scroll messages ────────────────────────────────────────────────────
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
  }, [agent.messages, agent.liveContent, agent.liveReasoning, agent.liveToolText])

  // Close the session menu on outside click
  useEffect(() => {
    if (!sessionMenuOpen) return
    const h = (e: MouseEvent): void => {
      if (sessionMenuRef.current && !sessionMenuRef.current.contains(e.target as Node)) {
        setSessionMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [sessionMenuOpen])

  // Close the glossary picker on outside click
  useEffect(() => {
    if (!glossaryMenuOpen) return
    const h = (e: MouseEvent): void => {
      if (glossaryMenuRef.current && !glossaryMenuRef.current.contains(e.target as Node)) {
        setGlossaryMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [glossaryMenuOpen])

  const submit = useCallback(() => {
    const t = input.trim()
    if (!t || agent.isRunning) return
    setInput('')
    agent.send(t)
  }, [input, agent])

  const startResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startW = width
      const move = (ev: MouseEvent): void =>
        setWidth(Math.min(680, Math.max(320, startW - (ev.clientX - startX))))
      const up = (): void => {
        document.removeEventListener('mousemove', move)
        document.removeEventListener('mouseup', up)
      }
      document.addEventListener('mousemove', move)
      document.addEventListener('mouseup', up)
    },
    [width]
  )

  return (
    <div style={{ ...s.panel, width }}>
      <div style={s.resizeHandle} onMouseDown={startResize} />

      {/* Header */}
      <div style={s.header}>
        <span style={{ color: 'var(--accent)', display: 'flex' }}>
          <IcoSparkle size={13} stroke="currentColor" />
        </span>
        <span style={s.headerTitle}>AI Chat</span>
        {rootDir && sessions.list.length > 0 && (
          <div ref={sessionMenuRef} style={{ position: 'relative' }}>
            <button
              style={s.sessionSelect}
              onClick={() => setSessionMenuOpen((v) => !v)}
              title="Sessions ที่ผ่านมา"
            >
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {sessions.list.find((sx) => sx.id === sessions.currentId)?.title ?? 'sessions'}
              </span>
              <span style={{ fontSize: 8, flexShrink: 0 }}>▾</span>
            </button>
            {sessionMenuOpen && (
              <div style={s.sessionMenu}>
                {sessions.list.map((sx) => (
                  <div
                    key={sx.id}
                    style={{
                      ...s.sessionRow,
                      ...(sx.id === sessions.currentId ? s.sessionRowActive : {})
                    }}
                  >
                    <button
                      style={s.sessionRowOpen}
                      onClick={() => {
                        sessions.open(sx.id)
                        setSessionMenuOpen(false)
                      }}
                      title={sx.title}
                    >
                      {sx.title}
                    </button>
                    <button
                      style={s.sessionDel}
                      onClick={() => sessions.remove(sx.id)}
                      title="ลบ session"
                    >
                      <IcoX size={9} stroke="currentColor" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button style={s.newBtn} onClick={sessions.createNew} title="New chat">
          + New
        </button>
      </div>

      {/* Controls */}
      <div style={s.controls}>
        <div style={s.segRow}>
          {MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => setModel(m.id)}
              style={{ ...s.seg, ...(model === m.id ? s.segOn : {}) }}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div style={s.segRow}>
          <span style={s.segLabel} title="Reasoning effort">
            <IcoBrain size={12} stroke="currentColor" />
          </span>
          {EFFORTS.map((e) => (
            <button
              key={e}
              onClick={() => persistEffort(e)}
              style={{ ...s.seg, ...(effort === e ? s.segOn : {}) }}
              title={`Reasoning: ${EFFORT_LABEL[e]}`}
            >
              {EFFORT_LABEL[e]}
            </button>
          ))}
        </div>

        {(() => {
          const hasKey = !!aiConfig.apiKey.trim()
          // Editing when no key yet (first run) OR the user clicked edit.
          if (!hasKey || editingKey) {
            return (
              <div style={s.keyRow}>
                <span style={{ color: 'var(--text2)', display: 'flex' }}>
                  <IcoKey size={12} stroke="currentColor" />
                </span>
                <input
                  type={showKey ? 'text' : 'password'}
                  value={aiConfig.apiKey}
                  onChange={(e) => onConfigChange({ ...aiConfig, apiKey: e.target.value })}
                  placeholder="sk-or-v1-…"
                  spellCheck={false}
                  autoFocus={editingKey}
                  style={s.keyInput}
                />
                <button
                  onClick={() => setShowKey((v) => !v)}
                  style={s.miniBtn}
                  title={showKey ? 'ซ่อน key' : 'แสดง key'}
                >
                  {showKey ? '●' : '○'}
                </button>
                {hasKey && (
                  <button
                    onClick={() => {
                      setEditingKey(false)
                      setShowKey(false)
                    }}
                    style={s.miniBtn}
                    title="เสร็จ"
                  >
                    <IcoCheck size={11} stroke="currentColor" />
                  </button>
                )}
              </div>
            )
          }
          // Key is set — show masked status with edit / clear actions.
          return (
            <div style={s.keyRow}>
              <span style={{ color: 'var(--hl-teal)', display: 'flex' }} title="OpenRouter key พร้อมใช้">
                <IcoKey size={12} stroke="currentColor" />
              </span>
              <span style={s.keyMasked} title="OpenRouter key (เก็บใน OS keychain)">
                {maskKey(aiConfig.apiKey)}
              </span>
              <button
                onClick={() => {
                  setEditingKey(true)
                  setShowKey(false)
                }}
                style={s.miniBtn}
                title="แก้/เปลี่ยน key"
              >
                <IcoPen size={11} stroke="currentColor" />
              </button>
              <button
                onClick={() => {
                  onConfigChange({ ...aiConfig, apiKey: '' })
                  setEditingKey(false)
                  setShowKey(false)
                }}
                style={s.miniBtn}
                title="ลบ key ออกจาก keychain"
              >
                <IcoX size={10} stroke="currentColor" />
              </button>
            </div>
          )
        })()}

        <label style={s.promptToggle}>
          <input
            type="checkbox"
            checked={promptEnabled}
            onChange={togglePrompt}
            style={{ accentColor: 'var(--accent)', margin: 0 }}
          />
          <span>ส่ง prompt-md</span>
          <div style={{ flex: 1 }} />
          <span style={s.pathChip} title={aiConfig.promptPath}>
            {aiConfig.promptPath ? aiConfig.promptPath.split(/[\\/]/).pop() : 'ยังไม่เลือก'}
          </span>
          <button onClick={browsePrompt} style={s.miniBtn} title="Browse">
            <IcoFile size={11} stroke="currentColor" />
          </button>
          {aiConfig.promptPath && (
            <button
              onClick={() => onConfigChange({ ...aiConfig, promptPath: '' })}
              style={s.miniBtn}
            >
              <IcoX size={10} stroke="currentColor" />
            </button>
          )}
        </label>

        {glossaryFileList.length > 1 && (
          <div ref={glossaryMenuRef} style={{ position: 'relative' }}>
            <button
              style={s.glossBtn}
              onClick={() => setGlossaryMenuOpen((v) => !v)}
              title="เลือก glossary ที่ส่งให้ AI (ตัวเลข = entry ที่จะส่งจริงในบทนี้)"
            >
              <span style={{ flex: 1, textAlign: 'left' }}>
                glossary → AI: {includedFileCount}/{glossaryFileList.length} ไฟล์
              </span>
              <span style={{ fontSize: 8, flexShrink: 0 }}>▾</span>
            </button>
            {glossaryMenuOpen && (
              <div style={s.glossMenu}>
                {glossaryFileList.map((file) => (
                  <label key={file} style={s.glossMenuRow}>
                    <input
                      type="checkbox"
                      checked={!effectiveExcluded.has(file)}
                      onChange={() => toggleGlossaryFile(file)}
                      style={{ accentColor: 'var(--accent)', margin: 0 }}
                    />
                    <span style={s.glossMenuName} title={file}>
                      {file.replace(/\.json$/i, '')}
                    </span>
                    <span style={s.glossMenuCount} title="entry ที่จะส่งให้ AI (match ใน src)">
                      {matchedCounts.get(file) ?? 0}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Messages */}
      <div style={s.list} ref={listRef}>
        {agent.messages.length === 0 && !agent.isRunning && (
          <div style={s.empty}>
            คุยกับ AI ได้เลย — เช่น &quot;แปลบทนี้&quot;, &quot;เกลาบรรทัด 4–6&quot;,
            &quot;คำนี้ควรแปลว่าอะไร&quot;
          </div>
        )}
        {agent.messages.map((m) => (
          <MessageItem key={m.id} msg={m} />
        ))}
        {agent.isRunning && (
          <LiveMessage
            content={agent.liveContent}
            reasoning={agent.liveReasoning}
            toolText={agent.liveToolText}
          />
        )}
      </div>

      {agent.error && <div style={s.errorBar}>⚠ {agent.error}</div>}

      <ReviewQueue
        edits={pending.edits}
        glossary={pending.glossary}
        memory={pending.memory}
        onAcceptEdit={pending.acceptEdit}
        onDenyEdit={pending.denyEdit}
        onAcceptAllEdits={pending.acceptAllEdits}
        onAcceptGlossary={pending.acceptGlossary}
        onDenyGlossary={pending.denyGlossary}
        onAcceptAllGlossary={pending.acceptAllGlossary}
        onAcceptMemory={pending.acceptMemory}
        onDenyMemory={pending.denyMemory}
      />

      {/* Input */}
      <div style={s.inputBar}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="พิมพ์ข้อความ… (Enter ส่ง, Shift+Enter ขึ้นบรรทัด)"
          rows={2}
          style={s.textarea}
        />
        {agent.isRunning ? (
          <button onClick={agent.stop} style={s.stopBtn} title="Stop">
            ■
          </button>
        ) : (
          <button onClick={submit} style={s.sendBtn} disabled={!input.trim()} title="Send">
            ↑
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Message rendering ──────────────────────────────────────────────────────

function MessageItem({ msg }: { msg: ChatMessage }): JSX.Element | null {
  const [showThink, setShowThink] = useState(false)

  if (msg.role === 'tool') {
    let note = 'staged'
    try {
      const o = JSON.parse(msg.content) as { ok?: boolean; error?: string; note?: string }
      note = o.error ? `error: ${o.error}` : (o.note ?? 'ok')
    } catch {
      /* keep default */
    }
    return (
      <div style={s.toolMsg}>
        ⚙ {msg.toolName} — {note}
      </div>
    )
  }

  if (msg.role === 'user') {
    return (
      <div style={s.userMsg}>
        <div style={s.userBubble}>{msg.content}</div>
      </div>
    )
  }

  // assistant
  return (
    <div style={s.aiMsg}>
      {msg.reasoning && (
        <div style={s.thinkBox}>
          <button style={s.thinkToggle} onClick={() => setShowThink((v) => !v)}>
            <IcoBrain size={9} stroke="currentColor" /> thinking {showThink ? '▲' : '▼'}
          </button>
          {showThink && <div style={s.thinkText}>{msg.reasoning}</div>}
        </div>
      )}
      {msg.content && <div style={s.aiText}>{msg.content}</div>}
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div style={s.callRow}>
          {msg.toolCalls.map((tc) => (
            <span key={tc.id} style={s.callChip}>
              {tc.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function LiveMessage({
  content,
  reasoning,
  toolText
}: {
  content: string
  reasoning: string
  toolText: string
}): JSX.Element {
  return (
    <div style={s.aiMsg}>
      {reasoning && (
        <div style={s.thinkBox}>
          <div style={s.thinkToggle}>
            <IcoBrain size={10} stroke="currentColor" /> กำลังคิด…
          </div>
          <div style={s.thinkText}>{reasoning}</div>
        </div>
      )}
      {content && <div style={s.aiText}>{content}</div>}
      {toolText && (
        <div style={s.toolPreview}>
          <div style={s.toolPreviewHead}>
            <IcoPen size={9} stroke="currentColor" /> กำลังเขียนคำแปล…
          </div>
          <div style={s.toolPreviewText}>
            {toolText}
            <span style={s.caret}>▌</span>
          </div>
        </div>
      )}
      {!content && !toolText && (
        <div style={s.aiText}>
          <span style={{ color: 'var(--text2)' }}>…</span>
          <span style={s.caret}>▌</span>
        </div>
      )}
    </div>
  )
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  panel: {
    background: 'var(--bg1)',
    borderLeft: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden',
    position: 'relative'
  },
  resizeHandle: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    cursor: 'ew-resize',
    zIndex: 10
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
  headerTitle: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--text0)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.04em',
    flex: 1
  },
  newBtn: {
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    background: 'var(--bg3)',
    color: 'var(--text1)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '2px 8px',
    cursor: 'pointer'
  },
  sessionSelect: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    background: 'var(--bg2)',
    color: 'var(--text1)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '3px 6px',
    width: 120,
    cursor: 'pointer'
  },
  sessionMenu: {
    position: 'absolute',
    top: '100%',
    right: 0,
    marginTop: 3,
    minWidth: 190,
    maxWidth: 280,
    maxHeight: 300,
    overflowY: 'auto',
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
    zIndex: 999
  },
  sessionRow: {
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid rgba(46,51,64,0.4)'
  },
  sessionRowActive: { background: 'var(--accent-dim)' },
  sessionRowOpen: {
    flex: 1,
    textAlign: 'left',
    background: 'none',
    border: 'none',
    color: 'var(--text1)',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    padding: '5px 8px',
    cursor: 'pointer',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0
  },
  sessionDel: {
    background: 'none',
    border: 'none',
    color: 'var(--text2)',
    cursor: 'pointer',
    padding: '4px 7px',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0
  },
  glossBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    width: '100%',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    background: 'var(--bg2)',
    color: 'var(--text2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '3px 7px',
    cursor: 'pointer'
  },
  glossMenu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 3,
    maxHeight: 220,
    overflowY: 'auto',
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
    zIndex: 999
  },
  glossMenuRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '5px 8px',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    borderBottom: '1px solid rgba(46,51,64,0.4)'
  },
  glossMenuName: {
    flex: 1,
    color: 'var(--text1)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0
  },
  glossMenuCount: {
    fontSize: 9,
    color: 'var(--text2)',
    background: 'var(--bg3)',
    borderRadius: 99,
    padding: '0 6px',
    flexShrink: 0
  },
  controls: {
    padding: '6px 8px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
    flexShrink: 0
  },
  segRow: { display: 'flex', gap: 3, alignItems: 'center' },
  segLabel: {
    display: 'flex',
    alignItems: 'center',
    color: 'var(--text2)',
    marginRight: 3,
    flexShrink: 0
  },
  seg: {
    flex: 1,
    padding: '3px 6px',
    border: '1px solid var(--border)',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    background: 'var(--bg2)',
    color: 'var(--text2)'
  },
  segOn: { background: 'var(--accent-dim)', color: 'var(--accent)', fontWeight: 600 },
  keyRow: { display: 'flex', gap: 4, alignItems: 'center' },
  keyInput: {
    flex: 1,
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text0)',
    fontSize: 11,
    padding: '4px 7px',
    outline: 'none',
    minWidth: 0
  },
  keyMasked: {
    flex: 1,
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text1)',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    padding: '4px 7px',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  miniBtn: {
    background: 'none',
    border: '1px solid var(--border)',
    borderRadius: 4,
    cursor: 'pointer',
    color: 'var(--text2)',
    fontSize: 10,
    padding: '3px 6px',
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0
  },
  promptToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text2)',
    cursor: 'pointer',
    userSelect: 'none'
  },
  pathChip: {
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    color: 'var(--hl-gold)',
    maxWidth: 110,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  },
  empty: {
    color: 'var(--text2)',
    fontSize: 11,
    lineHeight: 1.7,
    textAlign: 'center',
    margin: 'auto',
    padding: '0 16px'
  },
  userMsg: { display: 'flex', justifyContent: 'flex-end' },
  userBubble: {
    background: 'var(--accent-dim)',
    color: 'var(--text0)',
    border: '1px solid rgba(91,138,240,0.25)',
    borderRadius: 8,
    padding: '6px 9px',
    fontSize: 12,
    lineHeight: 1.5,
    maxWidth: '85%',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  aiMsg: { display: 'flex', flexDirection: 'column', gap: 4 },
  aiText: {
    color: 'var(--text1)',
    fontSize: 12,
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  },
  toolPreview: {
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--bg0)',
    overflow: 'hidden'
  },
  toolPreviewHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    color: 'var(--hl-teal)',
    padding: '3px 8px',
    background: 'var(--bg2)',
    borderBottom: '1px solid var(--border)'
  },
  toolPreviewText: {
    fontSize: 11,
    color: 'var(--text1)',
    padding: '6px 8px',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: 220,
    overflowY: 'auto'
  },
  caret: { color: 'var(--accent)', animation: 'blink 1s step-start infinite' },
  thinkBox: {
    border: '1px solid var(--border)',
    borderRadius: 6,
    background: 'var(--bg0)',
    overflow: 'hidden'
  },
  thinkToggle: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: 'var(--bg2)',
    border: 'none',
    color: 'var(--text2)',
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    padding: '3px 7px',
    cursor: 'pointer'
  },
  thinkText: {
    padding: '5px 8px',
    fontSize: 10,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    maxHeight: 160,
    overflowY: 'auto',
    borderTop: '1px solid var(--border)'
  },
  callRow: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  callChip: {
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    background: 'var(--bg3)',
    color: 'var(--accent)',
    border: '1px solid var(--border)',
    borderRadius: 99,
    padding: '1px 7px'
  },
  toolMsg: {
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text2)',
    background: 'var(--bg2)',
    borderRadius: 4,
    padding: '2px 7px',
    alignSelf: 'flex-start'
  },
  errorBar: {
    fontSize: 10,
    color: 'var(--hl-coral)',
    background: 'rgba(240,122,106,0.1)',
    borderTop: '1px solid rgba(240,122,106,0.3)',
    padding: '5px 9px',
    flexShrink: 0
  },
  inputBar: {
    display: 'flex',
    gap: 5,
    padding: '7px 8px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg2)',
    flexShrink: 0,
    alignItems: 'flex-end'
  },
  textarea: {
    flex: 1,
    background: 'var(--bg0)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text0)',
    fontSize: 12,
    padding: '6px 8px',
    outline: 'none',
    resize: 'none',
    fontFamily: 'inherit',
    lineHeight: 1.4,
    minWidth: 0
  },
  sendBtn: {
    background: 'var(--accent)',
    border: 'none',
    color: '#fff',
    fontSize: 15,
    width: 32,
    height: 32,
    borderRadius: 6,
    cursor: 'pointer',
    flexShrink: 0
  },
  stopBtn: {
    background: 'var(--hl-coral)',
    border: 'none',
    color: '#fff',
    fontSize: 12,
    width: 32,
    height: 32,
    borderRadius: 6,
    cursor: 'pointer',
    flexShrink: 0
  }
}
