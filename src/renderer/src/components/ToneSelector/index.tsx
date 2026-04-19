/**
 * ToneSelector Component
 * Icon-based selector for tone with hover labels
 */

import { memo, useState, useEffect, useRef, CSSProperties } from 'react'
import { TONE_CONFIGS, TONE_LABELS, TONE_ORDER, type ToneName } from '../../constants/tones'

export interface ToneSelectorProps {
  selectedTone: ToneName
  onToneChange: (tone: ToneName) => void
  compact?: boolean
}

const TONE_EMOJI: Record<ToneName, string> = {
  normal: '😶',
  angry: '😠',
  whisper: '🤫',
  sad: '😔',
  excited: '🥳',
  fearful: '😨',
  serious: '😤',
  cold: '😑'
}

const getToneEmoji = (tone: ToneName): string => {
  return TONE_EMOJI[tone]
}

export const ToneSelector = memo(function ToneSelector({
  selectedTone,
  onToneChange,
  compact = false
}: ToneSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  if (compact) {
    return (
      <div ref={dropdownRef} style={{ position: 'relative', display: 'block' }}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text1)',
            fontSize: 12,
            transition: 'color 0.2s',
            position: 'relative'
          }}
          title={`Tone: ${TONE_LABELS[selectedTone]}`}
        >
          <span style={{ fontSize: 16 }}>{getToneEmoji(selectedTone)}</span>
        </button>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '0',
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              zIndex: 1000,
              minWidth: '150px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
            }}
          >
            {TONE_ORDER.map((tone) => (
              <button
                key={tone}
                onClick={() => {
                  onToneChange(tone)
                  setIsOpen(false)
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: selectedTone === tone ? 'var(--accent)' : 'transparent',
                  color: selectedTone === tone ? 'var(--bg0)' : 'var(--text0)',
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  transition: 'all 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderBottom:
                    tone !== TONE_ORDER[TONE_ORDER.length - 1] ? '1px solid var(--border)' : 'none'
                }}
              >
                <span style={{ fontSize: 14 }}>{getToneEmoji(tone)}</span>
                {TONE_LABELS[tone]}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const containerStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: 8
  }

  const buttonGroupStyle: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 6
  }

  const buttonStyle = (isSelected: boolean): CSSProperties => ({
    background: isSelected ? 'var(--accent)' : 'var(--bg2)',
    color: isSelected ? 'var(--bg0)' : 'var(--text1)',
    border: 'none',
    borderRadius: 4,
    padding: '8px 10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    transition: 'all 0.2s'
  })

  return (
    <div style={containerStyle}>
      <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--text2)' }}>โทน</label>
      <div style={buttonGroupStyle}>
        {TONE_ORDER.map((tone) => (
          <button
            key={tone}
            onClick={() => onToneChange(tone)}
            style={buttonStyle(selectedTone === tone)}
            title={`${TONE_LABELS[tone]} (pitch: ${TONE_CONFIGS[tone].pitch_hz}, rate: ${TONE_CONFIGS[tone].rate_pct}, vol: ${TONE_CONFIGS[tone].volume_pct})`}
          >
            <span style={{ fontSize: 14 }}>{getToneEmoji(tone)}</span>
            {TONE_LABELS[tone]}
          </button>
        ))}
      </div>
    </div>
  )
})
