import { JSX, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GlossaryEntry } from '../../types'
import { HL_COLORS } from '../../utils/highlight'
import { editGlossaryEntry } from './tooltipUtils'

interface TooltipState {
  entry: GlossaryEntry
  x: number
  y: number
}

export function Tooltip(): JSX.Element | null {
  const [state, setState] = useState<TooltipState | null>(null)
  // pinned = tooltip ถูก "จับ" ไว้ด้วย hover ทำให้ pointerEvents เปิด
  const [pinned, setPinned] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const ref = useRef<HTMLDivElement>(null)
  const stateRef = useRef(state)
  const pinnedRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const positionRef = useRef<{ x: number; y: number } | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      setCopyStatus('idle')

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
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  if (!state) return null

  const { entry } = state
  const colors = HL_COLORS[entry.type]
  const copyLabel =
    copyStatus === 'copied' ? 'คัดลอกแล้ว' : copyStatus === 'error' ? 'คัดลอกไม่ได้' : 'คัดลอก'

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(entry.th)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }

    if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    copyTimerRef.current = setTimeout(() => setCopyStatus('idle'), 1400)
  }

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

        <button
          onClick={(e) => {
            e.stopPropagation()
            void handleCopy()
          }}
          title="คัดลอกคำแปล"
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            background: copyStatus === 'copied' ? 'rgba(62,207,160,0.12)' : 'none',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color:
              copyStatus === 'copied'
                ? 'var(--hl-teal)'
                : copyStatus === 'error'
                  ? 'var(--hl-coral)'
                  : 'var(--text2)',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            padding: '2px 7px',
            cursor: 'pointer',
            transition: 'all 0.1s'
          }}
          onMouseEnter={(e) => {
            if (copyStatus === 'copied') return
            e.currentTarget.style.background = 'var(--accent-dim)'
            e.currentTarget.style.color = 'var(--accent)'
            e.currentTarget.style.borderColor = 'rgba(91,138,240,0.4)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background =
              copyStatus === 'copied' ? 'rgba(62,207,160,0.12)' : 'none'
            e.currentTarget.style.color =
              copyStatus === 'copied'
                ? 'var(--hl-teal)'
                : copyStatus === 'error'
                  ? 'var(--hl-coral)'
                  : 'var(--text2)'
            e.currentTarget.style.borderColor = 'var(--border)'
          }}
        >
          ⧉ {copyLabel}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()
            setState(null)
            setPinned(false)
            editGlossaryEntry(entry)
          }}
          title="แก้ไข entry นี้ใน Glossary"
          style={{
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
