import { memo } from 'react'
import { VOICE_GENDERS, VOICE_GENDER_LABELS, type VoiceGender } from '../../constants/tones'

interface VoiceGenderSelectorProps {
  selectedGender: VoiceGender
  onGenderChange: (gender: VoiceGender) => void
  compact?: boolean
}

const getGenderSymbol = (gender: VoiceGender): string => {
  return gender === 'female' ? '♀' : '♂'
}

export const VoiceGenderSelector = memo(function VoiceGenderSelector({
  selectedGender,
  onGenderChange,
  compact = false
}: VoiceGenderSelectorProps) {
  if (compact) {
    return (
      <button
        onClick={() => {
          const nextIdx = (VOICE_GENDERS.indexOf(selectedGender) + 1) % VOICE_GENDERS.length
          onGenderChange(VOICE_GENDERS[nextIdx])
        }}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '2px 4px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text1)',
          fontSize: 16,
          transition: 'color 0.2s',
          minWidth: '20px',
          textAlign: 'center'
        }}
        title={`Voice Gender: ${VOICE_GENDER_LABELS[selectedGender]}`}
      >
        {getGenderSymbol(selectedGender)}
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--text2)' }}>เสียง</label>
      <div style={{ display: 'flex', gap: 8 }}>
        {VOICE_GENDERS.map((gender) => (
          <button
            key={gender}
            onClick={() => onGenderChange(gender)}
            style={{
              background: selectedGender === gender ? 'var(--accent)' : 'var(--bg2)',
              color: selectedGender === gender ? 'var(--bg0)' : 'var(--text1)',
              border: 'none',
              borderRadius: 4,
              padding: '6px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              fontFamily: 'var(--font-mono)',
              transition: 'all 0.2s',
              flex: 1
            }}
          >
            <span style={{ fontSize: 14 }}>{getGenderSymbol(gender)}</span>
            {VOICE_GENDER_LABELS[gender]}
          </button>
        ))}
      </div>
    </div>
  )
})
