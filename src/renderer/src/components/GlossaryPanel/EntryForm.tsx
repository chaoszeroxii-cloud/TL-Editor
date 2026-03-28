import { useState, useMemo, useCallback, JSX } from 'react'
import type { GlossaryEntry, GlossaryFileFormat } from '../../types'
import { CascadingPathSelect, buildPathTree, PathTree } from './CascadingPathSelect'

// ─── EntryForm ────────────────────────────────────────────────────────────────

export interface EntryFormProps {
  title: string
  initial: Partial<GlossaryEntry>
  onSubmit: (entry: GlossaryEntry, targetFile: string) => void
  onCancel: () => void
  submitLabel: string
  availableTypes: string[]
  fileNames?: string[]
  sourceFileFormats?: Record<string, GlossaryFileFormat>
  defaultFile?: string
  glossary?: GlossaryEntry[]
}

export function EntryForm({
  title,
  initial,
  onSubmit,
  onCancel,
  submitLabel,
  availableTypes,
  fileNames = [],
  sourceFileFormats = {},
  defaultFile = '',
  glossary = []
}: EntryFormProps): JSX.Element {
  const [targetFile, setTargetFile] = useState(defaultFile || fileNames[0] || '')
  const [src, setSrc] = useState(initial.src ?? '')
  const [th, setTh] = useState(initial.th ?? '')
  const [alts, setAlts] = useState<string[]>(initial.alt ?? [])
  const [note, setNote] = useState(initial.note ?? '')
  const [type] = useState<string>(initial.type ?? availableTypes[0] ?? 'term')
  const [selectedPath, setSelectedPath] = useState<string[]>(initial.path ?? [])

  const format = targetFile ? sourceFileFormats[targetFile] : undefined
  const isFlat = format === 'flat'
  const isNested = format === 'custom'

  const pathTree = useMemo((): PathTree => {
    if (!isNested || !targetFile) return {}
    return buildPathTree(glossary, targetFile)
  }, [isNested, targetFile, glossary])

  const canSubmit = !!(src.trim() && th.trim())

  // ── Submit handler (shared between button click and Ctrl+Enter) ───────────
  const handleSubmit = useCallback(() => {
    if (!canSubmit) return
    const finalPath = isNested
      ? selectedPath.filter(Boolean).length > 0
        ? selectedPath.filter(Boolean)
        : [type]
      : undefined
    const cleanAlts = alts.map((a) => a.trim()).filter(Boolean)
    onSubmit(
      {
        src: src.trim(),
        th: th.trim(),
        alt: cleanAlts.length ? cleanAlts : undefined,
        type: isFlat ? 'other' : type,
        note: !isFlat && note.trim() ? note.trim() : undefined,
        path: finalPath
      },
      targetFile
    )
  }, [canSubmit, isNested, isFlat, selectedPath, type, alts, src, th, note, targetFile, onSubmit])

  // ── Ctrl+Enter on any input/select inside the form ────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit]
  )

  const inputSx: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text0)',
    fontSize: 11,
    padding: '3px 6px',
    outline: 'none',
    fontFamily: 'var(--font-ui)',
    boxSizing: 'border-box'
  }
  const selectSx: React.CSSProperties = {
    width: '100%',
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text1)',
    fontSize: 11,
    padding: '3px 6px',
    outline: 'none',
    fontFamily: 'var(--font-mono)',
    boxSizing: 'border-box',
    cursor: 'pointer'
  }

  return (
    <div
      style={{
        padding: '6px 8px',
        background: 'var(--bg3)',
        borderBottom: '1px solid var(--border)'
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          fontSize: 9,
          color: 'var(--accent)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.06em',
          marginBottom: 5
        }}
      >
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* File selector */}
        {fileNames.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span
                style={{
                  fontSize: 9,
                  color: 'var(--text2)',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase' as const
                }}
              >
                Save to file
              </span>
              <select
                value={targetFile}
                onChange={(e) => {
                  setTargetFile(e.target.value)
                  setSelectedPath([])
                }}
                style={{
                  ...selectSx,
                  color: targetFile ? 'var(--hl-gold)' : 'var(--text2)',
                  borderColor: targetFile ? 'rgba(212,175,55,0.4)' : 'var(--border)'
                }}
              >
                <option value="">— ไม่ระบุ (session only) —</option>
                {fileNames.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
          </>
        )}

        <input
          autoFocus={!initial.src}
          style={inputSx}
          value={src}
          placeholder="Source *"
          onChange={(e) => setSrc(e.target.value)}
        />
        <input
          autoFocus={!!initial.src}
          style={inputSx}
          value={th}
          placeholder="Thai * (ความหมายหลัก)"
          onChange={(e) => setTh(e.target.value)}
        />

        {/* Alt translations */}
        {!isFlat && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {alts.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                <input
                  style={{ ...inputSx, flex: 1 }}
                  value={a}
                  placeholder={`ความหมายที่ ${i + 2}`}
                  onChange={(e) => {
                    const next = [...alts]
                    next[i] = e.target.value
                    setAlts(next)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                      e.preventDefault()
                      setAlts((p) => [...p, ''])
                    }
                  }}
                />
                <button
                  onClick={() => setAlts((p) => p.filter((_, j) => j !== i))}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--hl-coral)',
                    padding: '2px 4px',
                    flexShrink: 0,
                    fontSize: 13,
                    lineHeight: 1
                  }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={() => setAlts((p) => [...p, ''])}
              style={{
                background: 'none',
                border: '1px dashed var(--border)',
                borderRadius: 4,
                color: 'var(--text2)',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                padding: '2px 6px',
                cursor: 'pointer',
                textAlign: 'left' as const
              }}
            >
              + ความหมายเพิ่มเติม
            </button>
          </div>
        )}

        {/* Note — always shown when not flat */}
        {!isFlat && (
          <input
            style={inputSx}
            value={note}
            placeholder="Note (optional)"
            onChange={(e) => setNote(e.target.value)}
          />
        )}

        {/* ✅ Type dropdown REMOVED — was here before */}

        {/* Sub-path (nested format only) */}
        {isNested && Object.keys(pathTree).length > 0 && (
          <CascadingPathSelect tree={pathTree} selected={selectedPath} onChange={setSelectedPath} />
        )}

        <div
          style={{
            display: 'flex',
            gap: 4,
            justifyContent: 'flex-end',
            alignItems: 'center',
            marginTop: 2
          }}
        >
          {/* Ctrl+Enter hint */}
          <span
            style={{
              fontSize: 9,
              color: 'var(--text2)',
              fontFamily: 'var(--font-mono)',
              opacity: 0.5,
              marginRight: 'auto'
            }}
          >
            Ctrl+↵
          </span>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              color: 'var(--text2)',
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            disabled={!canSubmit}
            onClick={handleSubmit}
            style={{
              background: 'var(--accent)',
              border: 'none',
              color: '#fff',
              fontSize: 10,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              opacity: canSubmit ? 1 : 0.4
            }}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
