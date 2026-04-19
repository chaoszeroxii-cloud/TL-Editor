// src/renderer/src/components/AudioPlayer/index.tsx
//
// Performance change (Batch 7):
//   BEFORE  readAudioBuffer() → base64 string → Uint8Array → Blob → blob: URL
//           This loads the entire audio file into renderer memory twice (base64 +
//           ArrayBuffer) before the browser can start decoding.
//
//   AFTER   Local files use `audio://local/<encoded-path>` which is served by
//           Electron's custom protocol handler with streaming support.  The
//           browser never sees the raw bytes; Electron pipes the file via
//           net.fetch directly to the media pipeline.
//
//           Blob URLs (TTS output) are unchanged — they arrive already decoded.

import { VolSlider } from './VolSlider'
import { useEffect, useRef, useState, useCallback, memo } from 'react'
import {
  IcoPlay,
  IcoPause,
  IcoSkipBack,
  IcoSkipFwd,
  IcoVol,
  IcoMute,
  IcoClose,
  IcoMusic,
  IcoKeyboard
} from '../common/icons'

interface AudioPlayerProps {
  filePath: string
  onClose: () => void
  autoPlay?: boolean
  compact?: boolean
  onTimeUpdate?: (current: number, duration: number) => void
}

function fmtTime(s: number): string {
  if (!isFinite(s)) return '--:--'
  const m = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
    .toString()
    .padStart(2, '0')
  return `${m}:${ss}`
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// ── Build a streamable src URL for a given filePath ────────────────────────────
// blob:  → return as-is (TTS output already in memory)
// other  → audio://local/<percent-encoded-path>  (served by main protocol handler)
function toAudioSrc(filePath: string): string {
  if (filePath.startsWith('blob:')) return filePath
  return `audio://local/${encodeURIComponent(filePath)}`
}

export const AudioPlayer = memo(function AudioPlayer({
  filePath,
  onClose,
  autoPlay = false,
  compact = false,
  onTimeUpdate
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(0.25)
  const [muted, setMuted] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [closeBtnHov, setCloseBtnHov] = useState(false)
  const [showHints, setShowHints] = useState(false)
  const rafRef = useRef<number | null>(null)
  const tickRef = useRef<() => void>(() => {})
  const [isDragging, setIsDragging] = useState(false)
  const onTimeUpdateRef = useRef(onTimeUpdate)
  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate
  }, [onTimeUpdate])

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const au = audioRef.current
    if (!au) return

    // No async IPC needed — just set the src and let the protocol handler stream it.
    const src = toAudioSrc(filePath)
    au.src = src
    au.volume = volume
    au.muted = muted
    au.load()

    if (autoPlay) {
      au.addEventListener('canplay', () => au.play(), { once: true })
    }

    // Cleanup: for blob: URLs created by TTS panel we do NOT revoke here —
    // the parent component (DualView) owns that blob and revokes it on close.
    return () => {
      au.pause()
      au.removeAttribute('src')
      au.load()
    }
  }, [filePath, autoPlay, volume, muted])

  // ── Tick ──────────────────────────────────────────────────────────────────
  const tick = useCallback(() => {
    const au = audioRef.current
    if (!au) return
    setCurrent(au.currentTime)
    onTimeUpdateRef.current?.(au.currentTime, au.duration || 0)
    rafRef.current = requestAnimationFrame(tickRef.current!)
  }, [])

  useEffect(() => {
    tickRef.current = tick
  }, [tick])

  // ── Audio events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const au = audioRef.current
    if (!au) return
    const onMeta = (): void => setDuration(au.duration)
    const onPlay = (): void => {
      setPlaying(true)
      rafRef.current = requestAnimationFrame(tick)
    }
    const onPause = (): void => {
      setPlaying(false)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
    const onEnded = (): void => {
      setPlaying(false)
      setCurrent(0)
      onTimeUpdateRef.current?.(0, au.duration || 0)
    }
    au.addEventListener('loadedmetadata', onMeta)
    au.addEventListener('play', onPlay)
    au.addEventListener('pause', onPause)
    au.addEventListener('ended', onEnded)
    return () => {
      au.removeEventListener('loadedmetadata', onMeta)
      au.removeEventListener('play', onPlay)
      au.removeEventListener('pause', onPause)
      au.removeEventListener('ended', onEnded)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [tick])

  // ── Controls ──────────────────────────────────────────────────────────────
  const togglePlay = useCallback((): void => {
    const au = audioRef.current
    if (!au) return
    playing ? au.pause() : au.play()
  }, [playing])

  const skip = useCallback((d: number): void => {
    const au = audioRef.current
    if (!au || !au.duration) return
    au.currentTime = clamp(au.currentTime + d, 0, au.duration)
    setCurrent(au.currentTime)
    onTimeUpdateRef.current?.(au.currentTime, au.duration)
  }, [])

  const seekTo = useCallback((frac: number): void => {
    const au = audioRef.current
    if (!au || !au.duration) return
    au.currentTime = clamp(frac, 0, 1) * au.duration
    setCurrent(au.currentTime)
    onTimeUpdateRef.current?.(au.currentTime, au.duration)
  }, [])

  const toggleMute = useCallback((): void => {
    const au = audioRef.current
    if (!au) return
    au.muted = !muted
    setMuted(!muted)
  }, [muted])

  const changeVol = useCallback(
    (v: number): void => {
      const au = audioRef.current
      if (au) au.volume = v
      setVolume(v)
      if (v > 0 && muted) {
        if (au) au.muted = false
        setMuted(false)
      }
    },
    [muted]
  )

  const handleClose = (): void => {
    const au = audioRef.current
    if (au) {
      au.pause()
      au.removeAttribute('src')
      au.load()
    }
    onClose()
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const isInputFocused = (): boolean => {
      const el = document.activeElement
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
    }

    const onKey = (e: KeyboardEvent): void => {
      const alt = e.altKey
      const ctrl = e.ctrlKey || e.metaKey
      const code = e.code

      if (ctrl && !alt && code === 'Space') {
        e.preventDefault()
        e.stopPropagation()
        togglePlay()
        return
      }
      if (alt && code === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        skip(-5)
        return
      }
      if (alt && code === 'ArrowRight') {
        e.preventDefault()
        e.stopPropagation()
        skip(5)
        return
      }
      if (alt && code === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setVolume((v) => {
          const nv = clamp(v + 0.1, 0, 1)
          const au = audioRef.current
          if (au) au.volume = nv
          return nv
        })
        return
      }
      if (alt && code === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setVolume((v) => {
          const nv = clamp(v - 0.1, 0, 1)
          const au = audioRef.current
          if (au) au.volume = nv
          return nv
        })
        return
      }
      if (alt && code === 'KeyM') {
        e.preventDefault()
        e.stopPropagation()
        toggleMute()
        return
      }
      if (alt && code === 'Digit0') {
        e.preventDefault()
        e.stopPropagation()
        seekTo(0)
        return
      }

      if (!alt && !ctrl && !isInputFocused()) {
        if (code === 'Space') {
          e.preventDefault()
          togglePlay()
          return
        }
        if (code === 'ArrowLeft') {
          e.preventDefault()
          skip(-5)
          return
        }
        if (code === 'ArrowRight') {
          e.preventDefault()
          skip(5)
          return
        }
      }
    }

    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [togglePlay, skip, toggleMute, seekTo])

  // ── Seek bar ──────────────────────────────────────────────────────────────
  const seekToX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect || !duration) return
      seekTo(clamp((clientX - rect.left) / rect.width, 0, 1))
    },
    [duration, seekTo]
  )

  const handleTrackMouseDown = (e: React.MouseEvent): void => {
    e.preventDefault()
    setIsDragging(true)
    seekToX(e.clientX)
    let active = true
    const onMove = (ev: MouseEvent): void => {
      if (active) seekToX(ev.clientX)
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

  const pct = duration > 0 ? clamp((current / duration) * 100, 0, 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <audio ref={audioRef} preload="metadata" />

      <div style={S.bar}>
        {compact ? (
          <span style={{ ...S.musicIcon, flexShrink: 0 }}>
            <IcoMusic size={12} stroke="currentColor" />
          </span>
        ) : (
          <div style={S.fileInfo}>
            <span style={S.musicIcon}>
              <IcoMusic size={12} stroke="currentColor" />
            </span>
            <span style={S.fileName} title={filePath.split(/[\\/]/).pop() ?? filePath}>
              {filePath.split(/[\\/]/).pop() ?? filePath}
            </span>
          </div>
        )}

        <div style={S.transport}>
          <button style={S.iconBtn} onClick={() => skip(-5)} title="ย้อนหลัง 5s (← หรือ Alt+←)">
            <IcoSkipBack size={12} stroke="currentColor" />
          </button>
          <button style={S.playBtn} onClick={togglePlay} title="เล่น/หยุด (Space หรือ Ctrl+Space)">
            {playing ? (
              <IcoPause size={12} stroke="currentColor" />
            ) : (
              <IcoPlay size={12} stroke="currentColor" />
            )}
          </button>
          <button style={S.iconBtn} onClick={() => skip(5)} title="ข้าม 5s (→ หรือ Alt+→)">
            <IcoSkipFwd size={12} stroke="currentColor" />
          </button>
        </div>

        <span style={S.time}>{fmtTime(current)}</span>

        <div
          ref={trackRef}
          style={{ ...S.track, cursor: duration ? 'pointer' : 'default' }}
          onMouseDown={handleTrackMouseDown}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
        >
          <div style={S.trackBg} />
          <div style={{ ...S.fill, width: `${pct}%` }} />
          {playing && <div style={{ ...S.playhead, left: `${pct}%`, opacity: 0.9 }} />}
          <div
            style={{
              ...S.thumb,
              left: `${pct}%`,
              opacity: hovering || isDragging ? 1 : playing ? 0.6 : 0,
              transition: isDragging ? 'none' : 'opacity 0.12s',
              width: hovering || isDragging ? 10 : 8,
              height: hovering || isDragging ? 10 : 8,
              marginTop: hovering || isDragging ? -5 : -4
            }}
          />
        </div>

        <span style={S.time}>{fmtTime(duration)}</span>

        <button style={S.iconBtn} onClick={toggleMute} title="Mute (Alt+M)">
          {muted || volume === 0 ? (
            <IcoMute size={12} stroke="currentColor" />
          ) : (
            <IcoVol size={12} stroke="currentColor" />
          )}
        </button>
        <VolSlider value={muted ? 0 : volume} onChange={changeVol} />

        <div style={S.sep} />

        <button
          style={{
            ...S.iconBtn,
            color: showHints ? 'var(--accent)' : 'var(--text2)',
            opacity: showHints ? 1 : 0.5
          }}
          onClick={() => setShowHints((v) => !v)}
          title="แสดง keyboard shortcuts"
        >
          <IcoKeyboard size={12} stroke="currentColor" />
        </button>

        <button
          style={{
            ...S.closeBtn,
            background: closeBtnHov ? 'rgba(240,122,106,0.15)' : 'none',
            color: closeBtnHov ? 'var(--hl-coral)' : 'var(--text2)',
            opacity: closeBtnHov ? 1 : 0.55
          }}
          onClick={handleClose}
          onMouseEnter={() => setCloseBtnHov(true)}
          onMouseLeave={() => setCloseBtnHov(false)}
          title="ปิด player"
        >
          <IcoClose size={12} stroke="currentColor" />
        </button>
      </div>

      {showHints && (
        <div style={S.hints}>
          {[
            ['Space', 'เล่น/หยุด'],
            ['Ctrl+Space', 'เล่น/หยุด (ขณะพิมพ์)'],
            ['Alt+← →', '±5s'],
            ['Alt+↑↓', 'volume'],
            ['Alt+M', 'mute'],
            ['Alt+0', 'ต้น']
          ].map(([key, desc]) => (
            <span key={key} style={S.hintItem}>
              <kbd style={S.kbd}>{key}</kbd>
              <span style={S.hintDesc}>{desc}</span>
            </span>
          ))}
          <span style={{ ...S.hintDesc, opacity: 0.4, marginLeft: 4 }}>
            · Ctrl+Space / Alt+key ใช้ได้ตลอด แม้ขณะพิมพ์
          </span>
        </div>
      )}
    </div>
  )
})

const S: Record<string, React.CSSProperties> = {
  bar: {
    height: 36,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '0 10px',
    background: 'var(--bg2)',
    borderBottom: '1px solid var(--border)',
    userSelect: 'none'
  },
  fileInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    minWidth: 0,
    maxWidth: 160,
    flexShrink: 0
  },
  musicIcon: { color: 'var(--hl-coral)', display: 'flex', flexShrink: 0, opacity: 0.65 },
  fileName: {
    fontSize: 10,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  transport: { display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 },
  playBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--accent)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 7px',
    borderRadius: 4,
    flexShrink: 0
  },
  iconBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text2)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 5px',
    borderRadius: 4,
    flexShrink: 0
  },
  time: {
    fontSize: 10,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    minWidth: 32,
    textAlign: 'center',
    flexShrink: 0
  },
  track: {
    flex: 1,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    position: 'relative'
  },
  trackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    background: 'var(--bg4)',
    pointerEvents: 'none'
  },
  fill: {
    position: 'absolute',
    left: 0,
    height: 3,
    borderRadius: 2,
    background: 'var(--accent)',
    opacity: 0.9,
    pointerEvents: 'none'
  },
  playhead: {
    position: 'absolute',
    transform: 'translateX(-50%)',
    width: 2,
    height: 10,
    borderRadius: 1,
    background: 'var(--accent)',
    pointerEvents: 'none',
    top: '50%',
    marginTop: -5,
    boxShadow: '0 0 6px var(--accent)'
  },
  thumb: {
    position: 'absolute',
    transform: 'translateX(-50%)',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#fff',
    border: '1.5px solid var(--accent)',
    pointerEvents: 'none',
    top: '50%',
    marginTop: -5,
    boxShadow: '0 0 4px rgba(91,138,240,0.5)'
  },
  sep: { width: 1, height: 14, background: 'var(--border)', flexShrink: 0, marginLeft: 3 },
  closeBtn: {
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px 6px',
    borderRadius: 4,
    flexShrink: 0,
    transition: 'background 0.12s, color 0.12s, opacity 0.12s'
  },
  hints: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '3px 12px',
    background: 'rgba(14,15,18,0.7)',
    borderBottom: '1px solid var(--border)',
    flexWrap: 'wrap'
  },
  hintItem: { display: 'flex', alignItems: 'center', gap: 4 },
  kbd: {
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    padding: '1px 5px',
    color: 'var(--accent)'
  },
  hintDesc: { fontSize: 9, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }
}
