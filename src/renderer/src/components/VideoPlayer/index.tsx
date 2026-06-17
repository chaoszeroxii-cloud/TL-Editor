// src/renderer/src/components/VideoPlayer/index.tsx
//
// Floating modal that plays a local MP4 (Episode Video) selected from the file
// tree. The bytes are fetched in full over the `audio://local/<encoded-path>`
// custom protocol and played from a blob: URL.
//
// Why blob instead of streaming the protocol directly into <video src>:
// Electron's media element does range/seek-based buffering for MP4 that does not
// play nicely with a streamed custom-protocol Response — the element stalls at
// 0:00 with no error (an <audio> MP3 works because it decodes linearly from byte
// 0 and never seeks). Episode Videos are small (~10-20 MB, one static frame), so
// loading the whole file into a blob is cheap and sidesteps the seek problem.

import { useEffect, useRef, useState, type JSX, type CSSProperties } from 'react'
import { IcoClose, IcoVideo } from '../common/icons'

interface VideoPlayerProps {
  filePath: string
  onClose: () => void
}

function toProtocolSrc(filePath: string): string {
  return `audio://local/${encodeURIComponent(filePath)}`
}

const MEDIA_ERR: Record<number, string> = {
  1: 'การเล่นถูกยกเลิก',
  2: 'เครือข่าย/โหลดไฟล์ไม่สำเร็จ',
  3: 'ไฟล์เสียหรือ decode ไม่ได้',
  4: 'ฟอร์แมต/โคเดกไม่รองรับ (เช่น MP3 audio ใน MP4 — แปลงเป็น AAC)'
}

export function VideoPlayer({ filePath, onClose }: VideoPlayerProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath
  const [blobUrl, setBlobUrl] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errMsg, setErrMsg] = useState('')

  // Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Fetch the file into a blob and play from a blob: URL. Revoke on change/unmount.
  useEffect(() => {
    let revoked = ''
    let aborted = false
    const ac = new AbortController()
    const run = async (): Promise<void> => {
      setStatus('loading')
      setErrMsg('')
      setBlobUrl('')
      try {
        const res = await fetch(toProtocolSrc(filePath), { signal: ac.signal })
        if (res.status !== 200 && res.status !== 206) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        if (aborted) return
        revoked = URL.createObjectURL(blob)
        setBlobUrl(revoked)
        setStatus('ready')
      } catch (e) {
        if (aborted || ac.signal.aborted) return
        setStatus('error')
        setErrMsg(e instanceof Error ? e.message : String(e))
      }
    }
    run()
    return () => {
      aborted = true
      ac.abort()
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [filePath])

  return (
    <div style={s.backdrop} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>
            <IcoVideo size={14} stroke="currentColor" />
            <span style={s.fileName} title={fileName}>
              {fileName}
            </span>
          </span>
          <button style={s.closeBtn} onClick={onClose} title="ปิด (Esc)">
            <IcoClose size={14} stroke="currentColor" />
          </button>
        </div>

        {status === 'loading' && <div style={s.notice}>กำลังโหลดวิดีโอ…</div>}
        {status === 'error' && <div style={s.error}>โหลดไฟล์ไม่สำเร็จ: {errMsg}</div>}

        {blobUrl && (
          <video
            ref={videoRef}
            src={blobUrl}
            controls
            autoPlay
            style={s.video}
            onError={() => {
              const err = videoRef.current?.error
              setStatus('error')
              setErrMsg(err ? (MEDIA_ERR[err.code] ?? `code ${err.code}`) : 'เล่นไม่ได้')
            }}
          />
        )}
      </div>
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000
  },
  modal: {
    background: 'var(--bg1)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    overflow: 'hidden',
    maxWidth: '90vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '8px 12px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0
  },
  title: { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text1)', minWidth: 0 },
  fileName: {
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 520
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text2)',
    cursor: 'pointer',
    display: 'flex',
    padding: 4,
    borderRadius: 4,
    flexShrink: 0
  },
  video: {
    display: 'block',
    maxWidth: '90vw',
    maxHeight: 'calc(90vh - 60px)',
    background: '#000'
  },
  notice: { padding: '24px 16px', color: 'var(--text2)', fontSize: 13, textAlign: 'center' },
  error: {
    padding: '12px 16px',
    color: 'var(--hl-red, #f87171)',
    fontSize: 12,
    wordBreak: 'break-word'
  }
}
