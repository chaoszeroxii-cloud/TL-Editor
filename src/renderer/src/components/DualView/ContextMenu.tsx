import { memo, useState, useEffect, useLayoutEffect, useRef, JSX } from 'react'
import { IcoGlobe, IcoSpeaker, IcoBook, IcoSparkle } from '../common/icons'

interface CtxMenuState {
  x: number
  y: number
  selectedText: string
}

interface ContextMenuProps {
  menu: CtxMenuState
  onTranslate: (text: string, x: number, y: number) => void
  onTts: (text: string) => void
  onAddToGlossary?: (text: string) => void
  onSendToParaphrase?: (text: string) => void
  onClose: () => void
}

export const ContextMenu = memo(function ContextMenu({
  menu,
  onTranslate,
  onTts,
  onAddToGlossary,
  onSendToParaphrase,
  onClose
}: ContextMenuProps): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: menu.x, top: menu.y })

  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 50)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  useLayoutEffect(() => {
    if (!ref.current) return
    const { width, height } = ref.current.getBoundingClientRect()
    setPos({
      left: Math.min(menu.x, window.innerWidth - width - 8),
      top: menu.y + height > window.innerHeight ? menu.y - height : menu.y
    })
  }, [menu.x, menu.y])

  const items = [
    {
      label: 'แปลเป็นภาษาไทย',
      accent: true,
      icon: <IcoGlobe size={12} stroke="currentColor" />,
      action: () => {
        onTranslate(menu.selectedText, menu.x, menu.y)
        onClose()
      }
    },
    {
      label: 'เพิ่มใน Glossary',
      accent: false,
      icon: <IcoBook size={12} stroke="var(--hl-gold)" />,
      action: () => {
        onAddToGlossary?.(menu.selectedText)
        onClose()
      }
    },
    {
      label: 'ส่งไป Paraphrase ✦',
      accent: false,
      icon: <IcoSparkle size={12} stroke="var(--accent)" />,
      accentColor: 'var(--accent)',
      action: () => {
        onSendToParaphrase?.(menu.selectedText)
        onClose()
      }
    },
    {
      label: 'อ่านออกเสียง',
      accent: false,
      icon: <IcoSpeaker size={12} stroke="var(--hl-coral)" />,
      action: () => {
        onTts(menu.selectedText)
        onClose()
      }
    },
    {
      label: 'คัดลอก',
      accent: false,
      icon: null,
      action: () => {
        navigator.clipboard.writeText(menu.selectedText)
        onClose()
      }
    },
    {
      label: 'ค้นหาใน Google',
      accent: false,
      icon: null,
      action: () => {
        window.open(
          `https://www.google.com/search?q=${encodeURIComponent(menu.selectedText)}`,
          '_blank'
        )
        onClose()
      }
    }
  ]

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        zIndex: 8999,
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 7,
        boxShadow: '0 6px 24px rgba(0,0,0,0.5)',
        minWidth: 220,
        overflow: 'hidden',
        padding: '3px 0'
      }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.action}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            padding: '8px 14px',
            background: 'none',
            border: 'none',
            borderBottom: i < items.length - 1 ? '1px solid rgba(46,51,64,0.4)' : 'none',
            cursor: 'pointer',
            textAlign: 'left' as const,
            color: item.accent
              ? 'var(--accent)'
              : 'accentColor' in item && item.accentColor
                ? (item.accentColor as string)
                : 'var(--text0)',
            fontSize: 12,
            fontFamily: 'var(--font-ui)',
            fontWeight: item.accent ? 500 : 400
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg3)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          {item.icon && (
            <span style={{ marginRight: 8, flexShrink: 0, display: 'flex' }}>{item.icon}</span>
          )}
          {item.label}
        </button>
      ))}
    </div>
  )
})
