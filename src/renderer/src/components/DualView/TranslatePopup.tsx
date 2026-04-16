import { memo, useState, useEffect, useLayoutEffect, useRef, JSX } from 'react'
import { IcoX, IcoSpinner } from '../common/icons'

interface TranslatePopupState {
  x: number
  y: number
  selectedText: string
}

interface TranslatePopupProps {
  popup: TranslatePopupState
  onClose: () => void
}

export const TranslatePopup = memo(function TranslatePopup({
  popup,
  onClose
}: TranslatePopupProps): JSX.Element {
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: popup.x, top: popup.y + 16 })
  const requestIdRef = useRef<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    requestIdRef.current = null
    ;(async () => {
      try {
        const response = (await window.electron.translate(popup.selectedText)) as {
          requestId: string
          data: string
        }
        requestIdRef.current = response.requestId
        const data = JSON.parse(response.data) as [string, string][][]
        setResult(
          (data[0] || [])
            .map((chunk) => chunk[0] ?? '')
            .join('')
            .trim()
        )
      } catch {
        setError('แปลไม่ได้ — ตรวจสอบการเชื่อมต่อ')
      } finally {
        setLoading(false)
      }
    })()

    return () => {
      // Cancel translation request if still in flight
      if (requestIdRef.current) {
        window.electron.cancelNetworkRequest(requestIdRef.current).catch(() => {})
      }
    }
  }, [popup.selectedText])

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  useLayoutEffect(() => {
    if (!ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    setPos({
      left: Math.min(popup.x, window.innerWidth - width - 12),
      top: popup.y + 16 + height > window.innerHeight ? popup.y - height - 8 : popup.y + 16
    })
  }, [popup.x, popup.y, result])

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        zIndex: 9000,
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
        minWidth: 200,
        maxWidth: 320,
        overflow: 'hidden',
        pointerEvents: 'all'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg3)'
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: 'var(--accent)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase'
          }}
        >
          แปลภาษาไทย · Google
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text2)',
            padding: '1px 4px',
            borderRadius: 3,
            display: 'flex'
          }}
        >
          <IcoX size={8} />
        </button>
      </div>

      <div
        style={{
          padding: '7px 10px 5px',
          fontSize: 11,
          color: 'var(--text2)',
          fontStyle: 'italic',
          borderBottom: '1px solid rgba(46,51,64,0.5)',
          lineHeight: 1.5
        }}
      >
        {popup.selectedText.length > 80
          ? popup.selectedText.slice(0, 80) + '…'
          : popup.selectedText}
      </div>

      <div style={{ padding: '8px 10px 10px' }}>
        {loading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              color: 'var(--text2)',
              fontSize: 12
            }}
          >
            <IcoSpinner size={12} /> กำลังแปล…
          </div>
        )}
        {error && <div style={{ color: 'var(--hl-coral)', fontSize: 11 }}>{error}</div>}
        {!loading && !error && result && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text0)', lineHeight: 1.6, marginBottom: 8 }}>
              {result}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(result)
                onClose()
              }}
              style={{
                background: 'var(--accent-dim)',
                border: '1px solid rgba(91,138,240,0.35)',
                color: 'var(--accent)',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                padding: '3px 10px',
                borderRadius: 4,
                cursor: 'pointer'
              }}
            >
              คัดลอก
            </button>
          </>
        )}
      </div>
    </div>
  )
})
