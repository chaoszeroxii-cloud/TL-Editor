import { memo, JSX } from 'react'
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
  if (!visible || !cursorPos || matches.length === 0) {
    return null
  }

  const itemHeight = 32
  const dropdownWidth = 320
  const maxHeight = itemHeight * Math.min(matches.length, 8)

  return (
    <div
      style={{
        position: 'fixed',
        left: `${cursorPos.x}px`,
        top: `${cursorPos.y + 24}px`,
        width: `${dropdownWidth}px`,
        maxHeight: `${maxHeight}px`,
        background: 'var(--bg-secondary, #f0f0f0)',
        border: '1px solid var(--border-color, #ccc)',
        borderRadius: '4px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
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
            key={idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 12px',
              height: `${itemHeight}px`,
              background: isSelected ? 'var(--accent-dim2, rgba(0,122,204,0.1))' : 'transparent',
              borderLeft: `3px solid ${isSelected ? color.border : 'transparent'}`,
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
            onClick={() => onSelect(matched)}
            onMouseEnter={() => onMouseEnter(idx)}
          >
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontWeight: 500,
                  color: 'var(--text-primary, #000)'
                }}
              >
                {displayValue}
              </div>
              <div
                style={{
                  fontSize: '11px',
                  color: 'var(--text-secondary, #666)',
                  marginTop: '2px'
                }}
              >
                {displaySecondary} • {entry.type}
              </div>
            </div>
            <div
              style={{
                marginLeft: '8px',
                padding: '2px 6px',
                background: color.bg,
                color: color.color,
                borderRadius: '3px',
                fontSize: '10px',
                fontWeight: 600,
                whiteSpace: 'nowrap'
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
