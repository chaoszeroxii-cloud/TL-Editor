import { JSX, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GlossaryEntry } from '../../types'
import { HL_COLORS } from '../../utils/highlight'

interface TooltipState {
  entry: GlossaryEntry
  x: number
  y: number
}

// Stable module-level functions — no hook needed, no new fn on every render
export function showTooltip(entry: GlossaryEntry, x: number, y: number): void {
  window.dispatchEvent(new CustomEvent('hl:show', { detail: { entry, x, y } }))
}
export function hideTooltip(): void {
  window.dispatchEvent(new CustomEvent('hl:hide'))
}

export function Tooltip(): JSX.Element | null {
  const [state, setState] = useState<TooltipState | null>(null)
  const [coords, setCoords] = useState({ left: 0, top: 0 }) // [เพิ่ม] เก็บตำแหน่งที่คำนวณแล้ว
  const ref = useRef<HTMLDivElement>(null)
  const rafId = useRef<number | null>(null)
  const stateRef = useRef(state)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  // [เพิ่ม] คำนวณตำแหน่งหลังจากที่เนื้อหา Tooltip ถูกวาด (Render) เสร็จแล้ว
  useLayoutEffect(() => {
    if (!state || !ref.current) return

    const { x, y } = state
    const pad = 14
    const tw = ref.current.offsetWidth
    const th = ref.current.offsetHeight

    const left = x + pad + tw > window.innerWidth ? x - tw - pad : x + pad
    const top = y + pad + th > window.innerHeight ? y - th - pad : y + pad

    requestAnimationFrame(() => {
      setCoords({ left, top })
    })
  }, [state]) // คำนวณใหม่ทุกครั้งที่ state (x, y หรือเนื้อหา) เปลี่ยน

  useEffect(() => {
    const onShow = (e: Event): void => setState((e as CustomEvent).detail as TooltipState)
    const onHide = (): void => setState(null)
    const onMove = (e: MouseEvent): void => {
      if (!stateRef.current) return
      if (rafId.current !== null) return
      rafId.current = requestAnimationFrame(() => {
        setState((prev) => (prev ? { ...prev, x: e.clientX, y: e.clientY } : null))
        rafId.current = null
      })
    }
    window.addEventListener('hl:show', onShow)
    window.addEventListener('hl:hide', onHide)
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => {
      window.removeEventListener('hl:show', onShow)
      window.removeEventListener('hl:hide', onHide)
      window.removeEventListener('mousemove', onMove)
      if (rafId.current !== null) cancelAnimationFrame(rafId.current)
    }
  }, [])

  if (!state) return null

  const { entry } = state
  const colors = HL_COLORS[entry.type]

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: coords.left, // ใช้ค่าจาก state
        top: coords.top, // ใช้ค่าจาก state
        zIndex: 9999,
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 160,
        maxWidth: 260,
        pointerEvents: 'none',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        animation: 'fadeInUp 0.1s ease',
        // ป้องกัน Tooltip แวบไปโผล่ที่ 0,0 ก่อนคำนวณเสร็จ
        visibility: coords.left === 0 && coords.top === 0 ? 'hidden' : 'visible'
      }}
    >
      {/* เนื้อหาข้างในคงเดิม */}
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
      <div style={{ fontSize: 13, color: 'var(--text1)', marginBottom: 5 }}>{entry.th}</div>
      {entry.alt?.length ? (
        <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 5 }}>
          alt: {entry.alt.join(', ')}
        </div>
      ) : null}
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
      {entry.note && (
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 5, lineHeight: 1.5 }}>
          {entry.note}
        </div>
      )}
    </div>
  )
}
