import { useState, useEffect, useRef, JSX } from 'react'
import { IcoFile } from '../common/icons'

interface ScriptPathInputProps {
  value: string
  onChange: (v: string) => void
  pinned: string[]
  history: string[]
  onSelect: (v: string) => void
  disabled: boolean
}

export function ScriptPathInput({
  value,
  onChange,
  pinned,
  history,
  onSelect,
  disabled
}: ScriptPathInputProps): JSX.Element {
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

  const pinnedSet = new Set(pinned)
  const recentOnly = history.filter((p) => !pinnedSet.has(p))
  const hasDropdown = pinned.length > 0 || recentOnly.length > 0

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            paddingLeft: 8,
            color: 'var(--hl-gold)',
            flexShrink: 0
          }}
        >
          <IcoFile size={12} stroke="currentColor" />
        </span>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="D:/path/to/script.py"
          spellCheck={false}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            outline: 'none',
            color: disabled ? 'var(--text2)' : 'var(--hl-gold)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            padding: '4px 6px',
            cursor: disabled ? 'not-allowed' : 'text'
          }}
        />
        {hasDropdown && (
          <button
            onClick={() => setOpen((v) => !v)}
            disabled={disabled}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text2)',
              padding: '3px 7px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              opacity: disabled ? 0.4 : 1
            }}
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        )}
      </div>

      {open && hasDropdown && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            maxHeight: 200,
            overflowY: 'auto',
            marginBottom: 4
          }}
        >
          {(() => {
            const Item = ({ p, tag }: { p: string; tag: 'env' | 'recent' }): JSX.Element => (
              <button
                key={p}
                onClick={() => {
                  onSelect(p)
                  setOpen(false)
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid rgba(46,51,64,0.4)',
                  cursor: 'pointer',
                  textAlign: 'left' as const
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg3)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <span
                  style={{
                    color: tag === 'env' ? 'var(--hl-gold)' : 'var(--text2)',
                    flexShrink: 0,
                    display: 'flex'
                  }}
                >
                  <IcoFile size={12} stroke="currentColor" />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span
                      style={{
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        color: p === value ? 'var(--accent)' : 'var(--text0)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {p.split(/[/\\]/).pop()}
                    </span>
                    <span
                      style={{
                        fontSize: 8,
                        padding: '1px 4px',
                        borderRadius: 3,
                        flexShrink: 0,
                        fontFamily: 'var(--font-mono)',
                        background: tag === 'env' ? 'var(--hl-gold-bg)' : 'var(--bg3)',
                        color: tag === 'env' ? 'var(--hl-gold)' : 'var(--text2)',
                        border: `1px solid ${tag === 'env' ? 'var(--hl-gold-border)' : 'var(--border)'}`
                      }}
                    >
                      {tag}
                    </span>
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
                {p === value && (
                  <span style={{ color: 'var(--accent)', fontSize: 10, flexShrink: 0 }}>✓</span>
                )}
              </button>
            )
            return (
              <>
                {pinned.length > 0 && (
                  <>
                    <div
                      style={{
                        padding: '4px 10px 3px',
                        fontSize: 8,
                        color: 'var(--hl-gold)',
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase' as const,
                        background: 'var(--hl-gold-bg)',
                        borderBottom: '1px solid var(--hl-gold-border)'
                      }}
                    >
                      Pinned
                    </div>
                    {pinned.map((p) => (
                      <Item key={p} p={p} tag="env" />
                    ))}
                  </>
                )}
                {recentOnly.length > 0 && (
                  <>
                    <div
                      style={{
                        padding: '4px 10px 3px',
                        fontSize: 8,
                        color: 'var(--text2)',
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase' as const,
                        background: 'var(--bg2)',
                        borderBottom: '1px solid var(--border)',
                        borderTop: pinned.length > 0 ? '1px solid var(--border)' : 'none'
                      }}
                    >
                      Recent
                    </div>
                    {recentOnly.map((p) => (
                      <Item key={p} p={p} tag="recent" />
                    ))}
                  </>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
