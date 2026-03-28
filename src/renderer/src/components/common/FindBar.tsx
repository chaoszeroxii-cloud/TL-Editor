/**
 * common/FindBar.tsx
 * Shared find & replace bar used by DualView and JsonManager.
 * Has two visual variants controlled by `variant` prop:
 *   'dual'  — wider input (260px), shows "TGT + SRC" label on replace row
 *   'json'  — narrower input (220px), no extra label
 */
import { memo, JSX } from 'react'
import { IcoSearch, IcoEdit, IcoUp, IcoDown, IcoX, IcoWholeWord } from '../common/icons'

export interface FindBarProps {
  open: boolean
  isReplace: boolean
  query: string
  replaceVal: string
  matchCount: number
  activeIdx: number
  caseSensitive: boolean
  wholeWord: boolean
  onQueryChange: (q: string) => void
  onReplaceChange: (r: string) => void
  onNext: () => void
  onPrev: () => void
  onReplaceOne: () => void
  onReplaceAll: () => void
  onToggleCase: () => void
  onToggleWhole: () => void
  onClose: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
  /** Visual variant — affects input width and optional label */
  variant?: 'dual' | 'json'
}

// ── Sub-components ────────────────────────────────────────────────────────────

const ToggleBtn = memo(function ToggleBtn({
  active,
  onClick,
  title,
  children
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3px 7px',
        borderRadius: 4,
        cursor: 'pointer',
        flexShrink: 0,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        lineHeight: 1,
        background: active ? 'var(--accent-dim)' : 'none',
        border: `1px solid ${active ? 'rgba(91,138,240,0.4)' : 'var(--border)'}`,
        color: active ? 'var(--accent)' : 'var(--text2)',
        transition: 'all 0.12s'
      }}
    >
      {children}
    </button>
  )
})

const NavBtn = memo(function NavBtn({
  onClick,
  disabled,
  title,
  children
}: {
  onClick: () => void
  disabled?: boolean
  title?: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '4px 6px',
        borderRadius: 4,
        cursor: disabled ? 'default' : 'pointer',
        background: 'none',
        border: '1px solid var(--border)',
        color: disabled ? 'var(--text2)' : 'var(--text1)',
        opacity: disabled ? 0.35 : 1,
        flexShrink: 0,
        transition: 'opacity 0.1s'
      }}
    >
      {children}
    </button>
  )
})

const ActionBtn = memo(function ActionBtn({
  onClick,
  disabled,
  children
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '3px 12px',
        borderRadius: 4,
        cursor: disabled ? 'default' : 'pointer',
        background: disabled ? 'none' : 'var(--bg3)',
        border: '1px solid var(--border)',
        color: disabled ? 'var(--text2)' : 'var(--text1)',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        flexShrink: 0,
        opacity: disabled ? 0.35 : 1,
        transition: 'opacity 0.1s'
      }}
    >
      {children}
    </button>
  )
})

const VSep = (): JSX.Element => (
  <div
    style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0, margin: '0 1px' }}
  />
)

// ── Main component ─────────────────────────────────────────────────────────────

export const FindBar = memo(function FindBar({
  open,
  isReplace,
  query,
  replaceVal,
  matchCount,
  activeIdx,
  caseSensitive,
  wholeWord,
  onQueryChange,
  onReplaceChange,
  onNext,
  onPrev,
  onReplaceOne,
  onReplaceAll,
  onToggleCase,
  onToggleWhole,
  onClose,
  inputRef,
  variant = 'dual'
}: FindBarProps): JSX.Element | null {
  if (!open) return null

  const noResult = !!query.trim() && matchCount === 0
  const countText = query.trim()
    ? matchCount === 0
      ? 'No results'
      : `${activeIdx + 1} / ${matchCount}`
    : ''
  const inputW = variant === 'dual' ? 260 : 220

  return (
    <div
      style={{ flexShrink: 0, background: 'var(--bg2)', borderBottom: '1px solid var(--border)' }}
    >
      {/* ── Find row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '4px 12px 4px 10px' }}>
        <IcoSearch size={12} stroke="currentColor" />

        <div style={{ position: 'relative', width: inputW, flexShrink: 0 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                e.shiftKey ? onPrev() : onNext()
              }
              if (e.key === 'Escape') {
                e.stopPropagation()
                onClose()
              }
            }}
            placeholder="Find  (Enter ↓  Shift+Enter ↑)"
            spellCheck={false}
            autoComplete="off"
            style={{
              width: '100%',
              background: noResult ? 'rgba(240,122,106,0.1)' : 'var(--bg3)',
              border: `1px solid ${noResult ? 'rgba(240,122,106,0.5)' : 'var(--border)'}`,
              borderRadius: 4,
              color: 'var(--text0)',
              fontSize: 12,
              padding: '3px 64px 3px 8px',
              outline: 'none',
              fontFamily: 'var(--font-ui)',
              boxSizing: 'border-box',
              transition: 'border-color 0.12s, background 0.12s'
            }}
          />
          {countText && (
            <span
              style={{
                position: 'absolute',
                right: 7,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                color: noResult ? 'var(--hl-coral)' : 'var(--text2)'
              }}
            >
              {countText}
            </span>
          )}
        </div>

        <ToggleBtn active={caseSensitive} onClick={onToggleCase} title="Case sensitive (Alt+C)">
          Aa
        </ToggleBtn>
        <ToggleBtn active={wholeWord} onClick={onToggleWhole} title="Whole word (Alt+W)">
          <IcoWholeWord size={12} stroke="currentColor" />
        </ToggleBtn>

        <VSep />
        <NavBtn onClick={onPrev} disabled={matchCount === 0} title="Previous (Shift+Enter)">
          <IcoUp size={10} stroke="currentColor" />
        </NavBtn>
        <NavBtn onClick={onNext} disabled={matchCount === 0} title="Next (Enter)">
          <IcoDown size={10} stroke="currentColor" />
        </NavBtn>
        <VSep />

        <button
          onClick={onClose}
          title="Close (Escape)"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text2)',
            padding: '3px 5px',
            borderRadius: 3,
            display: 'flex',
            alignItems: 'center',
            flexShrink: 0
          }}
        >
          <IcoX size={9} stroke="currentColor" />
        </button>
      </div>

      {/* ── Replace row ── */}
      {isReplace && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '0 12px 5px 28px' }}>
          <IcoEdit size={12} stroke="currentColor" />
          <div style={{ width: inputW, flexShrink: 0 }}>
            <input
              value={replaceVal}
              onChange={(e) => onReplaceChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  onReplaceOne()
                }
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  onClose()
                }
              }}
              placeholder="Replace"
              spellCheck={false}
              autoComplete="off"
              style={{
                width: '100%',
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text0)',
                fontSize: 12,
                padding: '3px 8px',
                outline: 'none',
                fontFamily: 'var(--font-ui)',
                boxSizing: 'border-box'
              }}
            />
          </div>
          <ActionBtn onClick={onReplaceOne} disabled={matchCount === 0}>
            Replace
          </ActionBtn>
          <ActionBtn onClick={onReplaceAll} disabled={matchCount === 0}>
            All
          </ActionBtn>
          {variant === 'dual' && (
            <span
              style={{
                fontSize: 9,
                color: 'var(--text2)',
                fontFamily: 'var(--font-mono)',
                opacity: 0.45,
                marginLeft: 4,
                flexShrink: 0
              }}
            >
              TGT + SRC
            </span>
          )}
        </div>
      )}
    </div>
  )
})
