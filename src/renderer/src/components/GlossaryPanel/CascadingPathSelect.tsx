import { useState, useEffect, useRef, JSX } from 'react'
import type { PathTree } from './CascadingPathSelect.utils'

// ─── CustomSelect ─────────────────────────────────────────────────────────────
interface CustomSelectProps {
  options: string[]
  value: string
  placeholder: string
  indent?: number
  onChange: (v: string) => void
}

function CustomSelect({
  options,
  value,
  placeholder,
  indent = 0,
  onChange
}: CustomSelectProps): JSX.Element {
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

  const hasValue = !!value

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: `5px 8px 5px ${8 + indent * 12}px`,
          background: 'var(--bg2)',
          border: `1px solid ${open ? 'rgba(91,138,240,0.5)' : hasValue ? 'rgba(91,138,240,0.3)' : 'var(--border)'}`,
          borderRadius: 5,
          cursor: 'pointer',
          textAlign: 'left',
          outline: 'none',
          transition: 'border-color 0.12s'
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            flexShrink: 0,
            background: hasValue ? 'var(--accent)' : 'var(--border)',
            transition: 'background 0.12s'
          }}
        />
        <span
          style={{
            flex: 1,
            fontSize: 11,
            color: hasValue ? 'var(--accent)' : 'var(--text2)',
            fontFamily: 'var(--font-mono)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {value || placeholder}
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

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 3px)',
            left: 0,
            right: 0,
            zIndex: 200,
            background: 'var(--bg1)',
            border: '1px solid rgba(91,138,240,0.35)',
            borderRadius: 6,
            boxShadow: '0 6px 20px rgba(0,0,0,0.55)',
            overflow: 'hidden',
            maxHeight: 200,
            overflowY: 'auto'
          }}
        >
          {/* Clear option */}
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
              padding: '7px 10px',
              background: !value ? 'rgba(91,138,240,0.08)' : 'none',
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
            <span
              style={{
                fontSize: 10,
                color: 'var(--text2)',
                fontFamily: 'var(--font-mono)',
                fontStyle: 'italic'
              }}
            >
              {placeholder}
            </span>
          </button>

          {options.map((opt) => {
            const isActive = opt === value
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt)
                  setOpen(false)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 10px',
                  background: isActive ? 'rgba(91,138,240,0.12)' : 'none',
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
                      stroke="var(--accent)"
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
                    color: isActive ? 'var(--accent)' : 'var(--text0)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {opt}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── CascadingPathSelect ───────────────────────────────────────────────────────

interface CascadingPathSelectProps {
  tree: PathTree
  selected: string[]
  onChange: (path: string[]) => void
}

export function CascadingPathSelect({
  tree,
  selected,
  onChange
}: CascadingPathSelectProps): JSX.Element {
  const levels: { options: string[]; value: string }[] = []
  let node = tree

  for (let depth = 0; ; depth++) {
    const options = Object.keys(node).sort()
    if (!options.length) break
    const val = selected[depth] ?? ''
    levels.push({ options, value: val })
    if (val && node[val]) node = node[val]
    else break
  }

  if (!levels.length) return <></>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 9,
          color: 'var(--text2)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase' as const
        }}
      >
        Sub-path
      </span>
      {levels.map(({ options, value }, depth) => (
        <CustomSelect
          key={depth}
          options={options}
          value={value}
          placeholder={depth === 0 ? '— เลือก sub-path —' : '— (ไม่มี sub-path ย่อย) —'}
          indent={depth}
          onChange={(v) => {
            // When clearing or changing a level, drop all deeper selections
            const next = [...selected.slice(0, depth), v].filter(Boolean)
            onChange(next)
          }}
        />
      ))}
    </div>
  )
}
