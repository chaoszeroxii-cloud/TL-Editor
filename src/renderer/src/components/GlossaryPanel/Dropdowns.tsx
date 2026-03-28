import { useState, useEffect, useRef, JSX } from 'react'
import type { GlossaryEntry } from '../../types'
import { IcoDownload } from '../common/icons'

// ─── ExportDropdown ───────────────────────────────────────────────────────────

interface ExportDropdownProps {
  matchCount: number
  fileNames: string[]
  glossary: GlossaryEntry[]
  currentContent: string
  onExport: (file?: string) => void
}

export function ExportDropdown({
  matchCount,
  fileNames,
  glossary,
  currentContent,
  onExport
}: ExportDropdownProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const countFor = (file: string): number =>
    glossary.filter((g) => {
      if (g._file !== file || !g.src) return false
      const isLatin = /[A-Za-z]/.test(g.src)
      const esc = g.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pat = isLatin
        ? new RegExp(`\\b${esc}(?:'s|s|es|ed|ing|er|ers)?\\b`, 'i')
        : new RegExp(esc)
      return pat.test(currentContent)
    }).length

  const items = [
    { label: 'ทุกไฟล์', count: matchCount, value: undefined },
    ...fileNames.map((f) => ({ label: f.replace(/\.json$/i, ''), count: countFor(f), value: f }))
  ]

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          padding: '2px 3px',
          borderRadius: 4,
          color: open ? 'var(--accent)' : 'var(--text2)'
        }}
        title="Export glossary ที่เจอในตอนนี้"
        onClick={() => setOpen((v) => !v)}
      >
        <IcoDownload size={13} stroke="currentColor" />
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            zIndex: 999,
            marginTop: 4,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 7,
            boxShadow: '0 6px 20px rgba(0,0,0,0.5)',
            minWidth: 190,
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              padding: '5px 10px 4px',
              fontSize: 9,
              color: 'var(--text2)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.07em',
              textTransform: 'uppercase' as const,
              borderBottom: '1px solid var(--border)'
            }}
          >
            Export จากไฟล์
          </div>
          {items.map((item, i) => (
            <button
              key={i}
              disabled={item.count === 0}
              onClick={() => {
                setOpen(false)
                if (item.count > 0) onExport(item.value)
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '7px 12px',
                background: 'none',
                border: 'none',
                borderBottom: i < items.length - 1 ? '1px solid rgba(46,51,64,0.4)' : 'none',
                cursor: item.count === 0 ? 'default' : 'pointer',
                opacity: item.count === 0 ? 0.35 : 1,
                textAlign: 'left' as const
              }}
              onMouseEnter={(e) => {
                if (item.count > 0) e.currentTarget.style.background = 'var(--bg3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
              }}
            >
              <span style={{ fontSize: 12, color: 'var(--text0)', fontFamily: 'var(--font-mono)' }}>
                {item.label}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--accent)',
                  background: 'var(--accent-dim)',
                  padding: '1px 7px',
                  borderRadius: 99,
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0
                }}
              >
                {item.count}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── FileFilterDropdown ───────────────────────────────────────────────────────

interface FileFilterDropdownProps {
  fileNames: string[]
  fileFilter: string
  glossary: GlossaryEntry[]
  onSelect: (v: string) => void
}

export function FileFilterDropdown({
  fileNames,
  fileFilter,
  glossary,
  onSelect
}: FileFilterDropdownProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const totalCount = glossary.length
  const selectedCount =
    fileFilter === 'all' ? totalCount : glossary.filter((g) => g._file === fileFilter).length
  const selectedLabel = (() => {
    if (fileFilter === 'all') return 'All files'
    const label = fileFilter.replace(/\.json$/i, '')
    return label.length > 16 ? label.slice(0, 14) + '…' : label
  })()

  const items = [
    { label: 'All files', value: 'all', count: totalCount },
    ...fileNames.map((name) => ({
      label: name.replace(/\.json$/i, ''),
      value: name,
      count: glossary.filter((g) => g._file === name).length
    }))
  ]

  return (
    <div
      ref={ref}
      style={{ position: 'relative', padding: '4px 7px', borderBottom: '1px solid var(--border)' }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: open ? 'var(--bg3)' : 'var(--bg2)',
          border: `1px solid ${open ? 'rgba(91,138,240,0.45)' : 'var(--border)'}`,
          borderRadius: 5,
          color: 'var(--hl-teal)',
          fontSize: 10,
          padding: '3px 7px',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          textAlign: 'left' as const,
          transition: 'all 0.1s'
        }}
      >
        <span
          style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {selectedLabel}
        </span>
        <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text2)', flexShrink: 0 }}>
          {selectedCount}
        </span>
        <span style={{ fontSize: 8, color: 'var(--text2)', flexShrink: 0, marginLeft: 2 }}>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 7,
            right: 7,
            zIndex: 999,
            marginTop: 3,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 6px 20px rgba(0,0,0,0.45)',
            overflow: 'hidden'
          }}
        >
          {items.map((item, i) => {
            const isActive = fileFilter === item.value
            return (
              <button
                key={item.value}
                onClick={() => {
                  onSelect(item.value === fileFilter ? 'all' : item.value)
                  setOpen(false)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '5px 8px',
                  background: isActive ? 'rgba(62,207,160,0.1)' : 'none',
                  border: 'none',
                  borderBottom: i < items.length - 1 ? '1px solid rgba(46,51,64,0.4)' : 'none',
                  color: isActive ? 'var(--hl-teal)' : 'var(--text1)',
                  fontSize: 10,
                  cursor: 'pointer',
                  fontFamily: 'var(--font-mono)',
                  textAlign: 'left' as const
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'var(--bg3)'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'none'
                }}
              >
                {isActive && (
                  <span style={{ fontSize: 8, color: 'var(--hl-teal)', flexShrink: 0 }}>✓</span>
                )}
                <span
                  style={{
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    paddingLeft: isActive ? 0 : 12
                  }}
                >
                  {item.label}
                </span>
                <span
                  style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text2)', flexShrink: 0 }}
                >
                  {item.count}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
