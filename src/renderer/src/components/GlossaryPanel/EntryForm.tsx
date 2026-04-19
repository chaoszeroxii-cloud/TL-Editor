import { useState, useMemo, useCallback, useRef, useEffect, JSX } from 'react'
import type { GlossaryEntry, GlossaryFileFormat } from '../../types'
import { CascadingPathSelect } from './CascadingPathSelect'
import { buildPathTree, type PathTree } from './CascadingPathSelect.utils'

// ─── FileSelect ───────────────────────────────────────────────────────────────
// Custom styled file-selector dropdown used inside EntryForm.

function FileSelect({
  value,
  fileNames,
  onChange
}: {
  value: string
  fileNames: string[]
  onChange: (v: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const label = value || '— ไม่ระบุ (session only) —'
  const hasValue = !!value

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 8px',
          background: 'var(--bg2)',
          border: `1px solid ${open ? 'rgba(212,175,55,0.6)' : hasValue ? 'rgba(212,175,55,0.4)' : 'var(--border)'}`,
          borderRadius: 5,
          cursor: 'pointer',
          textAlign: 'left',
          outline: 'none',
          transition: 'border-color 0.12s'
        }}
      >
        {/* File icon dot */}
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            flexShrink: 0,
            background: hasValue ? 'var(--hl-gold)' : 'var(--border)',
            transition: 'background 0.12s'
          }}
        />
        <span
          style={{
            flex: 1,
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            color: hasValue ? 'var(--hl-gold)' : 'var(--text2)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {label}
        </span>
        <svg
          width="9"
          height="9"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{
            flexShrink: 0,
            color: 'var(--text2)',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s'
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 3px)',
            left: 0,
            right: 0,
            zIndex: 300,
            background: 'var(--bg1)',
            border: '1px solid rgba(212,175,55,0.35)',
            borderRadius: 6,
            boxShadow: '0 6px 20px rgba(0,0,0,0.6)',
            overflow: 'hidden'
          }}
        >
          {/* Session only */}
          <button
            type="button"
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 10px',
              background: !value ? 'rgba(212,175,55,0.08)' : 'none',
              border: 'none',
              borderBottom: '1px solid rgba(46,51,64,0.5)',
              cursor: 'pointer',
              textAlign: 'left'
            }}
            onMouseEnter={(e) => {
              if (value) (e.currentTarget as HTMLElement).style.background = 'var(--bg2)'
            }}
            onMouseLeave={(e) => {
              if (value) (e.currentTarget as HTMLElement).style.background = 'none'
            }}
          >
            <span style={{ width: 17, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              {!value && (
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--hl-gold)"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </span>
            <span
              style={{
                fontSize: 10,
                fontStyle: 'italic',
                color: !value ? 'var(--hl-gold)' : 'var(--text2)',
                fontFamily: 'var(--font-mono)'
              }}
            >
              — ไม่ระบุ (session only) —
            </span>
          </button>

          {/* File options */}
          {fileNames.map((f) => {
            const isActive = f === value
            return (
              <button
                key={f}
                type="button"
                onClick={() => {
                  onChange(f)
                  setOpen(false)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  background: isActive ? 'rgba(212,175,55,0.1)' : 'none',
                  border: 'none',
                  borderBottom: '1px solid rgba(46,51,64,0.4)',
                  cursor: 'pointer',
                  textAlign: 'left'
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg2)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = 'none'
                }}
              >
                <span style={{ width: 17, flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                  {isActive && (
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="var(--hl-gold)"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontFamily: 'var(--font-mono)',
                    color: isActive ? 'var(--hl-gold)' : 'var(--text1)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {f}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

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
              <FileSelect
                value={targetFile}
                fileNames={fileNames}
                onChange={(v) => {
                  setTargetFile(v)
                  setSelectedPath([])
                }}
              />
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
