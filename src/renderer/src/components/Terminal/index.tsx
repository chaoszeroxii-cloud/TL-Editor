import { JSX, useEffect, useRef, useState, type CSSProperties } from 'react'
import { TTSApiTab } from './TTSApiTab'
import type { TtsApiConfig } from './TTSApiTab'
import { IcoChevronUp, IcoClose, IcoMusic } from '../common/icons'
import { loadGlossariesFromConfig, type GlossaryLibraries } from '../../utils/glossaryLoader'
import type { ToneName } from '../../constants/tones'

interface TerminalPanelProps {
  onClose: () => void
  ttsConfig: TtsApiConfig
  onTtsConfigChange: (cfg: TtsApiConfig) => void
  tgtPath?: string | null
  tgtContent?: string
  getLineTone?: (lineIndex: number) => ToneName
  onPlayTtsAudio?: (blob: Blob) => void
}

const btnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--text2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '3px 5px',
  borderRadius: 3
}

export function TerminalPanel({
  onClose,
  ttsConfig,
  onTtsConfigChange,
  tgtPath,
  tgtContent,
  getLineTone,
  onPlayTtsAudio
}: TerminalPanelProps): JSX.Element {
  const [panelH, setPanelH] = useState(280)
  const [glossaries, setGlossaries] = useState<GlossaryLibraries>({ at_lib: {}, bf_lib: {} })
  const [glossaryPaths, setGlossaryPaths] = useState<{ atPath?: string; bfPath?: string }>({})
  const [configJsonPaths, setConfigJsonPaths] = useState<string[]>([])

  useEffect(() => {
    ;(async () => {
      const cfg = await window.electron.getEnvConfig()
      setConfigJsonPaths(cfg.jsonPaths || [])
    })()
  }, [])

  useEffect(() => {
    ;(async () => {
      const { libs, atPath, bfPath } = await loadGlossariesFromConfig(
        configJsonPaths,
        tgtPath ?? null
      )
      setGlossaries(libs)
      setGlossaryPaths({ atPath, bfPath })
    })()
  }, [tgtPath, configJsonPaths])

  const dragRef = useRef(false)
  const dragStartY = useRef(0)
  const dragStartH = useRef(0)

  const onDragStart = (e: React.MouseEvent): void => {
    dragRef.current = true
    dragStartY.current = e.clientY
    dragStartH.current = panelH
    e.preventDefault()
  }

  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      if (!dragRef.current) return
      setPanelH(
        Math.max(
          160,
          Math.min(window.innerHeight * 0.7, dragStartH.current + dragStartY.current - e.clientY)
        )
      )
    }

    const onUp = (): void => {
      dragRef.current = false
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div
      style={{
        height: panelH,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg1)',
        borderTop: '1px solid var(--border)',
        userSelect: 'none'
      }}
    >
      <div
        onMouseDown={onDragStart}
        style={{
          height: 4,
          cursor: 'row-resize',
          background: 'transparent',
          flexShrink: 0,
          position: 'relative'
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 1,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 32,
            height: 2,
            borderRadius: 1,
            background: 'var(--border)',
            pointerEvents: 'none'
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg2)',
          flexShrink: 0,
          padding: '5px 8px 5px 10px'
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--accent)',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.06em',
            fontWeight: 600
          }}
        >
          <IcoMusic size={12} stroke="currentColor" />
          TTS
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <button title="Collapse" onClick={onClose} style={btnStyle}>
            <IcoChevronUp size={12} stroke="currentColor" />
          </button>
          <button title="Close" onClick={onClose} style={btnStyle}>
            <IcoClose size={12} stroke="currentColor" />
          </button>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          userSelect: 'text'
        }}
      >
        <TTSApiTab
          config={ttsConfig}
          onConfigChange={onTtsConfigChange}
          glossaries={glossaries}
          tgtContent={tgtContent}
          tgtPath={tgtPath}
          glossaryPaths={glossaryPaths}
          getLineTone={getLineTone}
          onPlayTtsAudio={onPlayTtsAudio}
        />
      </div>
    </div>
  )
}
