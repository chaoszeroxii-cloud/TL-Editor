import { memo, JSX, useEffect, useRef } from 'react'
import type { MatchedEntry } from '../../hooks/useAutocomplete'
import { HL_COLORS } from '../../utils/highlight'

export interface GlossaryAutocompleteProps {
  visible: boolean
  matches: MatchedEntry[]
  selectedIndex: number
  cursorPos: { x: number; y: number } | null
  onSelect: (matched: MatchedEntry) => void
  onMouseEnter: (index: number) => void
}

export const GlossaryAutocomplete = memo(function GlossaryAutocomplete({
  visible,
  matches,
  selectedIndex,
  cursorPos,
  onSelect,
  onMouseEnter
}: GlossaryAutocompleteProps): JSX.Element | null {
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedItemRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (selectedItemRef.current && containerRef.current) {
      selectedItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [selectedIndex])

  if (!visible || !cursorPos || matches.length === 0) {
    return null
  }

  const itemHeight = 50
  const dropdownWidth = 320
  const maxHeight = itemHeight * Math.min(matches.length, 3)

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        left: `${cursorPos.x}px`,
        top: `${cursorPos.y + 24}px`,
        width: `${dropdownWidth}px`,
        maxHeight: `${maxHeight}px`,
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        overflow: 'auto',
        zIndex: 10000,
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '13px',
        scrollBehavior: 'smooth'
      }}
    >
      {matches.map((matched, idx) => {
        const { entry, matchField } = matched
        const isSelected = idx === selectedIndex
        const color = HL_COLORS[entry.type]
        const displayValue = entry[matchField]
        const displaySecondary = matchField === 'src' ? entry.th : entry.src
        return (
          <div
            ref={idx === selectedIndex ? selectedItemRef : null}
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 12px',
              height: `${itemHeight}px`,
              background: isSelected ? 'var(--accent-dim2, rgba(0,122,204,0.1))' : 'transparent',
              borderLeft: `3px solid ${isSelected ? color.border : 'transparent'}`,
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onClick={() => onSelect(matched)}
            onMouseEnter={() => onMouseEnter(idx)}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 500,
                  color: 'var(--text0)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {displayValue}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text1)',
                  marginTop: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
              >
                {displaySecondary} • {entry.type}
              </div>
            </div>
            <div
              style={{
                padding: '2px 6px',
                background: color.bg,
                color: color.color,
                borderRadius: '3px',
                fontSize: '10px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
            >
              {entry.type}
            </div>
          </div>
        )
      })}
    </div>
  )
})
