import { JSX, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GlossaryEntry } from '../../types'
import { HL_COLORS } from '../../utils/highlight'

interface TooltipState {
  entry: GlossaryEntry
  x: number
  y: number
}

// Stable module-level functions — no hook needed, no new fn on every render
let _hoveredEntry: GlossaryEntry | null = null
export function getHoveredGlossaryEntry(): GlossaryEntry | null {
  return _hoveredEntry
}

export function showTooltip(entry: GlossaryEntry, x: number, y: number): void {
  _hoveredEntry = entry
  window.dispatchEvent(new CustomEvent('hl:show', { detail: { entry, x, y } }))
}
export function hideTooltip(): void {
  _hoveredEntry = null
  window.dispatchEvent(new CustomEvent('hl:hide'))
}
/** Dispatch เพื่อเปิด edit form ของ entry นี้ใน GlossaryPanel */
export function editGlossaryEntry(entry: GlossaryEntry): void {
  window.dispatchEvent(new CustomEvent('hl:edit', { detail: entry }))
}

export function Tooltip(): JSX.Element | null {
  const [state, setState] = useState<TooltipState | null>(null)
  // pinned = tooltip ถูก "จับ" ไว้ด้วย hover ทำให้ pointerEvents เปิด
  const [pinned, setPinned] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const rafId = useRef<number | null>(null)
  const stateRef = useRef(state)
  const pinnedRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const positionRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    pinnedRef.current = pinned
  }, [pinned])

  // คำนวณตำแหน่งหลังจาก render เสร็จ
  useLayoutEffect(() => {
    if (!state || !ref.current) return

    const { x, y } = state
    const pad = 14
    const tw = ref.current.offsetWidth
    const th = ref.current.offsetHeight

    const left = x + pad + tw > window.innerWidth ? x - tw - pad : x + pad
    const top = y + pad + th > window.innerHeight ? y - th - pad : y + pad

    ref.current.style.setProperty('--x', `${left}px`)
    ref.current.style.setProperty('--y', `${top}px`)
    ref.current.style.opacity = '1'
  }, [state])

  useEffect(() => {
    const onShow = (e: Event): void => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)

      const detail = (e as CustomEvent).detail as TooltipState

      setState(() => {
        // 👉 ถ้ายังไม่เคยมีตำแหน่ง → เซ็ตครั้งแรก
        if (!positionRef.current) {
          positionRef.current = { x: detail.x, y: detail.y }
        }

        return {
          entry: detail.entry,
          x: positionRef.current.x,
          y: positionRef.current.y
        }
      })
    }
    const onHide = (): void => {
      hideTimerRef.current = setTimeout(() => {
        if (!ref.current?.matches(':hover')) {
          setState(null)
          setPinned(false)
          positionRef.current = null //reset ตำแหน่ง
        }
      }, 150)
    }
    window.addEventListener('hl:show', onShow)
    window.addEventListener('hl:hide', onHide)
    return () => {
      window.removeEventListener('hl:show', onShow)
      window.removeEventListener('hl:hide', onHide)
      if (rafId.current !== null) cancelAnimationFrame(rafId.current)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  if (!state) return null

  const { entry } = state
  const colors = HL_COLORS[entry.type]

  return (
    <div
      ref={ref}
      onMouseEnter={() => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        setPinned(true)
      }}
      onMouseLeave={() => {
        setPinned(false)
        setState(null)
      }}
      style={{
        position: 'fixed',
        left: 'var(--x, 0px)',
        top: 'var(--y, 0px)',
        opacity: 0,
        transition: 'opacity 0.1s ease',
        zIndex: 9999,
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 170,
        maxWidth: 270,
        // เปิด pointerEvents เสมอ เพื่อให้ hover เข้าได้
        pointerEvents: 'auto',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        cursor: 'default'
      }}
    >
      {/* src */}
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--text0)',
          marginBottom: 3
        }}
      >
        {entry.src}
      </div>

      {/* th */}
      <div style={{ fontSize: 13, color: 'var(--text1)', marginBottom: 5 }}>{entry.th}</div>

      {/* alt */}
      {entry.alt?.length ? (
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 5 }}>
          alt: {entry.alt.join(', ')}
        </div>
      ) : null}

      {/* type chip + edit button — same row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: 10,
            padding: '1px 7px',
            borderRadius: 99,
            border: `1px solid ${colors.border}`,
            background: colors.bg,
            color: colors.color,
            fontFamily: 'var(--font-mono)'
          }}
        >
          {entry.type}
        </span>

        {/* ── Edit button ── */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            setState(null)
            setPinned(false)
            editGlossaryEntry(entry)
          }}
          title="แก้ไข entry นี้ใน Glossary"
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            background: 'none',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text2)',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            padding: '2px 7px',
            cursor: 'pointer',
            transition: 'all 0.1s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--accent-dim)'
            e.currentTarget.style.color = 'var(--accent)'
            e.currentTarget.style.borderColor = 'rgba(91,138,240,0.4)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none'
            e.currentTarget.style.color = 'var(--text2)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        >
          ✎ แก้ไข
        </button>
      </div>

      {/* note */}
      {entry.note && (
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 5, lineHeight: 1.5 }}>
          {entry.note}
        </div>
      )}
    </div>
  )
}
