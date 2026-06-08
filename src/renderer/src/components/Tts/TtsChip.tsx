// ─── TtsChip.tsx ───────────────────────────────────────────────────────────────
// Fixed floating action button pinned to the bottom-right of the editor area
// (it renders inside the relatively-positioned editor container, so it tracks
// the src column and shifts as side panels open/close). Appears while/after a
// generation runs — state lives in useTtsGen so it survives the popover closing.
// During gen it shows progress; after a Smart Gen it stays as a "↺ regen changed
// lines" affordance. Clicking the body re-opens the popover.

import { type JSX } from 'react'
import { IcoSparkle, IcoRefresh, IcoSpinner, IcoClose } from '../common/icons'
import type { TtsGen } from './useTtsGen'

interface TtsChipProps {
  gen: TtsGen
  onOpen: () => void
}

export function TtsChip({ gen, onOpen }: TtsChipProps): JSX.Element | null {
  const { chip } = gen
  if (!chip) return null

  const isGen = chip.status === 'generating'
  const isError = chip.status === 'error'
  const accent = isError
    ? 'var(--hl-coral)'
    : chip.kind === 'smart'
      ? 'var(--hl-gold)'
      : 'var(--hl-teal)'
  const showRegen = chip.kind === 'smart' && chip.status === 'ok' && gen.changedCount > 0

  return (
    <div
      onClick={onOpen}
      title="คลิกเพื่อเปิด TTS"
      style={{
        position: 'absolute',
        right: 16,
        bottom: 16,
        zIndex: 30,
        minWidth: 180,
        maxWidth: 320,
        background: 'var(--bg1)',
        border: `1px solid ${accent}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 8,
        boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
        padding: '7px 9px',
        display: 'flex',
        flexDirection: 'column',
        gap: 5,
        cursor: 'pointer',
        userSelect: 'none',
        fontFamily: 'var(--font-mono)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ color: accent, display: 'flex', flexShrink: 0 }}>
          {isGen ? (
            <IcoSpinner size={12} stroke="currentColor" />
          ) : (
            <IcoSparkle size={12} stroke="currentColor" />
          )}
        </span>

        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 10,
            color: isError ? 'var(--hl-coral)' : 'var(--text1)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
          title={chip.message}
        >
          {isGen
            ? chip.countLabel
              ? `${chip.countLabel}${chip.percent !== undefined ? ` · ${chip.percent}%` : ''}`
              : chip.message || 'กำลังสร้างเสียง…'
            : chip.message}
        </span>

        {!isGen && (
          <button
            title="ปิดชิป"
            onClick={(e) => {
              e.stopPropagation()
              gen.dismissChip()
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text2)',
              display: 'flex',
              padding: 2,
              flexShrink: 0
            }}
          >
            <IcoClose size={11} stroke="currentColor" />
          </button>
        )}
      </div>

      {/* Progress bar (when we have a determinate percent) */}
      {isGen && chip.percent !== undefined && (
        <div
          style={{
            width: '100%',
            height: 4,
            borderRadius: 999,
            background: 'var(--bg3)',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: `${chip.percent}%`,
              height: '100%',
              borderRadius: 999,
              background: accent,
              transition: 'width 0.2s ease'
            }}
          />
        </div>
      )}

      {/* Regen-changed affordance (Smart Gen only) */}
      {showRegen && (
        <button
          title={`Re-gen เฉพาะ ${gen.changedCount} บรรทัดที่เปลี่ยน แล้ว concat ใหม่`}
          onClick={(e) => {
            e.stopPropagation()
            void gen.generateSmartTts(true)
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 5,
            background: 'rgba(255,180,0,0.14)',
            border: '1px solid rgba(255,180,0,0.5)',
            color: 'var(--hl-gold)',
            fontSize: 10,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            padding: '5px 9px',
            borderRadius: 4,
            cursor: 'pointer'
          }}
        >
          <IcoRefresh size={11} stroke="currentColor" /> Re-gen {gen.changedCount} บรรทัด
        </button>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
