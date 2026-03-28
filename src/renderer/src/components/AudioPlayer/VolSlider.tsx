import { useState, useRef, useCallback, JSX } from 'react'

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

interface VolSliderProps {
  value: number
  onChange: (v: number) => void
}

export function VolSlider({ value, onChange }: VolSliderProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [hov, setHov] = useState(false)

  const setFromX = useCallback(
    (clientX: number) => {
      const rect = ref.current?.getBoundingClientRect()
      if (!rect) return
      onChange(clamp((clientX - rect.left) / rect.width, 0, 1))
    },
    [onChange]
  )

  const onMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    setIsDragging(true)
    setFromX(e.clientX)
    let active = true
    const onMove = (ev: MouseEvent): void => {
      if (active) setFromX(ev.clientX)
    }
    const onUp = (): void => {
      active = false
      setIsDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const pct = value * 100
  return (
    <div
      ref={ref}
      style={s.track}
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={s.bg} />
      <div style={{ ...s.fill, width: `${pct}%` }} />
      <div style={{ ...s.thumb, left: `${pct}%`, opacity: hov || isDragging ? 1 : 0 }} />
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  track: {
    width: 56,
    height: 20,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    position: 'relative',
    cursor: 'pointer'
  },
  bg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
    background: 'var(--bg4)',
    pointerEvents: 'none'
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 2,
    borderRadius: 1,
    background: 'var(--accent)',
    opacity: 0.85,
    pointerEvents: 'none'
  },
  thumb: {
    position: 'absolute',
    transform: 'translateX(-50%)',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#fff',
    border: '1.5px solid var(--accent)',
    pointerEvents: 'none',
    top: '50%',
    marginTop: -4,
    transition: 'opacity 0.12s'
  }
}
