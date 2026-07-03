// ─── ShortsPanel ────────────────────────────────────────────────────────────
// Cuts a vertical 9:16 Shorts clip out of a chapter MP3 that has a Smart-Gen
// timeline sidecar: pick the mp3 → see its lines with timestamps → click a
// start line and an end line (the cliffhanger) → cut. Stays open after a clip
// finishes so multiple Shorts can be pulled from the same chapter in a row.
import { useState, useCallback, useEffect, useMemo } from 'react'
import type { JSX } from 'react'
import { IcoAlert, IcoCheck, IcoFolderOpen, IcoImage, IcoSpinner, IcoVideo, IcoX } from '../common/icons'

interface ShortsPanelProps {
  onClose: () => void
}

interface TimelineLine {
  row: number
  start: number
  text?: string
}
interface Timeline {
  totalSec: number
  lines: TimelineLine[]
}

const IDEAL_MIN = 15
const IDEAL_MAX = 70

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** End time of line at `idx`: the next line's start, or the timeline's total. */
function lineEnd(timeline: Timeline, idx: number): number {
  const next = timeline.lines[idx + 1]
  return next ? next.start : timeline.totalSec
}

export function ShortsPanel({ onClose }: ShortsPanelProps): JSX.Element {
  const [configReady, setConfigReady] = useState(false)
  const [sourceDir, setSourceDir] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [imagePath, setImagePath] = useState('')
  const [imagePreviewSrc, setImagePreviewSrc] = useState('')
  const [ctaText, setCtaText] = useState('')
  const [useGpu, setUseGpu] = useState(true)

  const [mp3List, setMp3List] = useState<Array<{ path: string; name: string }>>([])
  const [loadingList, setLoadingList] = useState(false)
  const [selectedMp3, setSelectedMp3] = useState('')
  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [loadingTimeline, setLoadingTimeline] = useState(false)

  const [startIdx, setStartIdx] = useState<number | null>(null)
  const [endIdx, setEndIdx] = useState<number | null>(null)

  const [cutting, setCutting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [createdClips, setCreatedClips] = useState<string[]>([])

  // ── Load config on mount ──────────────────────────────────────────────────
  useEffect(() => {
    let canceled = false
    window.electron
      .getEnvConfig()
      .then((cfg) => {
        if (canceled) return
        setSourceDir(cfg.shortsSourceDir || cfg.ttsOutputPath || '')
        setOutputDir(cfg.shortsOutputDir || cfg.mp4OutputPath || '')
        setImagePath(cfg.shortsImagePath || cfg.mp4ImagePath || '')
        setCtaText(cfg.shortsCtaText || 'ตอนเต็มอยู่ในช่อง')
        setUseGpu(cfg.mp4UseGpu ?? true)
        setConfigReady(true)
      })
      .catch(() => {
        if (!canceled) setConfigReady(true)
      })
    return () => {
      canceled = true
    }
  }, [])

  useEffect(() => {
    if (!configReady) return
    window.electron
      .saveConfigPatch({
        shortsSourceDir: sourceDir,
        shortsOutputDir: outputDir,
        shortsImagePath: imagePath,
        shortsCtaText: ctaText
      })
      .catch(() => {})
  }, [configReady, sourceDir, outputDir, imagePath, ctaText])

  // ── Cover preview ──────────────────────────────────────────────────────────
  useEffect(() => {
    let canceled = false
    if (!imagePath) {
      setImagePreviewSrc('')
      return
    }
    window.electron
      .readImageDataUrl(imagePath)
      .then((src) => {
        if (!canceled) setImagePreviewSrc(src)
      })
      .catch(() => {
        if (!canceled) setImagePreviewSrc('')
      })
    return () => {
      canceled = true
    }
  }, [imagePath])

  // ── Load mp3 list when source folder changes ────────────────────────────────
  const loadMp3List = useCallback(async (dir: string) => {
    if (!dir.trim()) {
      setMp3List([])
      return
    }
    setLoadingList(true)
    try {
      const list = await window.electron.listTimelineMp3s(dir)
      setMp3List(list)
    } catch {
      setMp3List([])
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    if (configReady) loadMp3List(sourceDir)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configReady, sourceDir])

  // ── Load timeline when an mp3 is picked ─────────────────────────────────────
  const pickMp3 = useCallback(async (path: string) => {
    setSelectedMp3(path)
    setTimeline(null)
    setStartIdx(null)
    setEndIdx(null)
    setErrorMsg('')
    if (!path) return
    setLoadingTimeline(true)
    try {
      const data = await window.electron.readMp3Timeline(path)
      setTimeline(data)
    } catch {
      setTimeline(null)
    } finally {
      setLoadingTimeline(false)
    }
  }, [])

  // ── Line click: 1st click = start, 2nd = end (swaps if clicked in reverse),
  //    3rd starts a new selection ──────────────────────────────────────────────
  const clickLine = useCallback(
    (idx: number) => {
      if (startIdx === null) {
        setStartIdx(idx)
        setEndIdx(null)
      } else if (endIdx === null) {
        if (idx >= startIdx) setEndIdx(idx)
        else {
          setEndIdx(startIdx)
          setStartIdx(idx)
        }
      } else {
        setStartIdx(idx)
        setEndIdx(null)
      }
    },
    [startIdx, endIdx]
  )

  const range = useMemo(() => {
    if (!timeline || startIdx === null || endIdx === null) return null
    const startSec = timeline.lines[startIdx].start
    const endSec = lineEnd(timeline, endIdx)
    return { startSec, endSec, durSec: endSec - startSec }
  }, [timeline, startIdx, endIdx])

  const durationHint =
    range && (range.durSec < IDEAL_MIN || range.durSec > IDEAL_MAX) ? 'var(--hl-gold)' : 'var(--hl-teal)'

  // ── Browse handlers ─────────────────────────────────────────────────────────
  const browseSourceDir = useCallback(async () => {
    const p = await window.electron.openFolder()
    if (p) setSourceDir(p)
  }, [])
  const browseOutputDir = useCallback(async () => {
    const p = await window.electron.openFolder()
    if (p) setOutputDir(p)
  }, [])
  const browseImage = useCallback(async () => {
    const p = await window.electron.openFile([{ name: 'Image', extensions: ['jpg', 'jpeg', 'png'] }])
    if (p) setImagePath(p)
  }, [])

  // ── Cut ──────────────────────────────────────────────────────────────────
  const cut = useCallback(async () => {
    if (!selectedMp3 || !imagePath || !outputDir || !range) return
    setCutting(true)
    setErrorMsg('')
    try {
      const res = await window.electron.createShortClip({
        mp3Path: selectedMp3,
        imagePath,
        startSec: range.startSec,
        endSec: range.endSec,
        ctaText: ctaText.trim() || undefined,
        outputDir,
        useGpu
      })
      setCreatedClips((prev) => [...prev, res.outputPath])
      // Reset the range so the next click starts a fresh selection on the same
      // chapter — the panel stays open for cutting more clips.
      setStartIdx(null)
      setEndIdx(null)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err))
    } finally {
      setCutting(false)
    }
  }, [selectedMp3, imagePath, outputDir, range, ctaText, useGpu])

  const handleCancel = useCallback(() => {
    window.electron.cancelShortClip().catch(() => {})
  }, [])

  const canCut = !!selectedMp3 && !!imagePath && !!outputDir && !!range && !cutting

  return (
    <div style={s.backdrop} onClick={() => !cutting && onClose()}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <h3 style={s.title}>
            <IcoVideo size={16} stroke="currentColor" />
            <span>Shorts (9:16)</span>
          </h3>
          <button
            style={{ ...s.closeBtn, opacity: cutting ? 0.45 : 1 }}
            onClick={() => !cutting && onClose()}
            title={cutting ? 'รอตัดคลิปเสร็จก่อน' : 'ปิด'}
          >
            <IcoX size={14} stroke="currentColor" />
          </button>
        </div>

        <div style={s.body}>
          {/* Source folder */}
          <div style={s.section}>
            <label style={s.label}>โฟลเดอร์เสียง (มี Smart-Gen timeline)</label>
            <div style={s.row}>
              <button style={s.browseBtn} onClick={browseSourceDir}>
                <IcoFolderOpen size={14} stroke="currentColor" />
                {sourceDir ? 'เปลี่ยน…' : 'เลือก…'}
              </button>
              {sourceDir && <span style={s.path}>{sourceDir.split(/[\\/]/).pop()}</span>}
            </div>
          </div>

          {/* MP3 list */}
          <div style={s.section}>
            <label style={s.label}>เลือกไฟล์ ({mp3List.length})</label>
            <div style={s.fileList}>
              {loadingList && <div style={s.emptyRow}>กำลังโหลด…</div>}
              {!loadingList && mp3List.length === 0 && (
                <div style={s.emptyRow}>ไม่พบ MP3 ที่มี timeline ในโฟลเดอร์นี้</div>
              )}
              {!loadingList &&
                mp3List.map((f) => (
                  <div
                    key={f.path}
                    style={{
                      ...s.fileRow,
                      ...(selectedMp3 === f.path ? s.fileRowActive : {})
                    }}
                    onClick={() => pickMp3(f.path)}
                  >
                    {f.name}
                  </div>
                ))}
            </div>
          </div>

          {/* Line picker */}
          {selectedMp3 && (
            <div style={s.section}>
              <label style={s.label}>
                เลือกช่วง (คลิกบรรทัดเริ่ม แล้วคลิกบรรทัดจบ — คลิปพีค/cliffhanger)
              </label>
              {loadingTimeline && <div style={s.emptyRow}>กำลังโหลด timeline…</div>}
              {!loadingTimeline && !timeline && (
                <div style={s.emptyRow}>อ่าน timeline ไม่ได้ — ไฟล์นี้อาจไม่มีข้อความบรรทัด</div>
              )}
              {timeline && (
                <div style={s.lineList}>
                  {timeline.lines.map((l, idx) => {
                    const inRange =
                      startIdx !== null &&
                      endIdx !== null &&
                      idx >= startIdx &&
                      idx <= endIdx
                    const isEdge = idx === startIdx || idx === endIdx
                    return (
                      <div
                        key={idx}
                        style={{
                          ...s.lineRow,
                          ...(inRange ? s.lineRowInRange : {}),
                          ...(isEdge ? s.lineRowEdge : {})
                        }}
                        onClick={() => clickLine(idx)}
                      >
                        <span style={s.lineTime}>{formatTime(l.start)}</span>
                        <span style={s.lineText}>{l.text || '(ไม่มีข้อความ)'}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {range && (
                <div style={{ ...s.preview, color: durationHint }}>
                  ช่วงที่เลือก: {formatTime(range.startSec)} – {formatTime(range.endSec)} (
                  {Math.round(range.durSec)} วิ)
                  {(range.durSec < IDEAL_MIN || range.durSec > IDEAL_MAX) &&
                    ' — สั้น/ยาวกว่าปกติสำหรับ Shorts (แนะนำ 15–70 วิ)'}
                </div>
              )}
            </div>
          )}

          {/* Cover image */}
          <div style={s.section}>
            <label style={s.label}>ภาพปก</label>
            <div style={s.row}>
              {imagePreviewSrc && <img src={imagePreviewSrc} style={s.thumb} alt="cover preview" />}
              <button style={s.browseBtn} onClick={browseImage}>
                <IcoImage size={14} stroke="currentColor" />
                {imagePath ? 'เปลี่ยน…' : 'เลือก…'}
              </button>
              {imagePath && <span style={s.path}>{imagePath.split(/[\\/]/).pop()}</span>}
            </div>
          </div>

          {/* Output folder */}
          <div style={s.section}>
            <label style={s.label}>โฟลเดอร์บันทึกคลิป</label>
            <div style={s.row}>
              <button style={s.browseBtn} onClick={browseOutputDir}>
                <IcoFolderOpen size={14} stroke="currentColor" />
                {outputDir ? 'เปลี่ยน…' : 'เลือก…'}
              </button>
              {outputDir && <span style={s.path}>{outputDir.split(/[\\/]/).pop()}</span>}
            </div>
          </div>

          {/* CTA */}
          <div style={s.section}>
            <label style={s.label}>ข้อความ CTA (โชว์ 3 วิสุดท้ายของคลิป)</label>
            <input
              style={s.input}
              value={ctaText}
              onChange={(e) => setCtaText(e.target.value)}
              placeholder="ตอนเต็มอยู่ในช่อง"
            />
            <div style={s.hint}>เว้นว่างไว้ถ้าไม่ต้องการ CTA</div>
          </div>

          {/* GPU */}
          <label style={s.gpuRow}>
            <input
              type="checkbox"
              checked={useGpu}
              onChange={(e) => setUseGpu(e.target.checked)}
              disabled={cutting}
            />
            <span>เร่งด้วย GPU (NVIDIA NVENC)</span>
          </label>

          {errorMsg && (
            <div style={{ ...s.errorMsg, display: 'flex', alignItems: 'center', gap: 6 }}>
              <IcoAlert size={14} stroke="currentColor" />
              <span>{errorMsg}</span>
            </div>
          )}

          {createdClips.length > 0 && (
            <div style={s.success}>
              <div style={s.resultHeader}>
                <IcoCheck size={14} stroke="currentColor" />
                <span>ตัดแล้ว {createdClips.length} คลิป:</span>
              </div>
              <ul style={s.resultList}>
                {createdClips.map((p, i) => (
                  <li key={i}>{p.split(/[\\/]/).pop()}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div style={s.footer}>
          {cutting ? (
            <button style={s.cancelBtn} onClick={handleCancel}>
              <IcoX size={14} stroke="currentColor" />
              ยกเลิก
            </button>
          ) : (
            <button style={s.closeFooterBtn} onClick={onClose}>
              ปิด
            </button>
          )}
          <button
            style={{ ...s.cutBtn, ...(!canCut ? s.cutBtnDisabled : {}) }}
            disabled={!canCut}
            onClick={cut}
          >
            {cutting ? (
              <>
                <IcoSpinner size={14} stroke="currentColor" />
                กำลังตัด…
              </>
            ) : (
              <>
                <IcoVideo size={14} stroke="currentColor" />
                ตัดคลิป
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 2000,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  modal: {
    background: 'var(--bg1)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    width: 620,
    maxWidth: '95vw',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0
  },
  title: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: 'var(--text0)'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text2)',
    cursor: 'pointer',
    padding: '2px 6px'
  },
  body: {
    overflowY: 'auto',
    flex: 1,
    padding: '12px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  section: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text2)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  browseBtn: {
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '6px 12px',
    cursor: 'pointer',
    color: 'var(--text1)',
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    gap: 6
  },
  input: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    color: 'var(--text0)',
    fontSize: 12,
    padding: '6px 10px',
    borderRadius: 4,
    outline: 'none',
    fontFamily: 'inherit'
  },
  path: {
    fontSize: 12,
    color: 'var(--text2)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 300
  },
  thumb: {
    width: 40,
    height: 40,
    objectFit: 'cover',
    borderRadius: 4,
    border: '1px solid var(--border)'
  },
  hint: { fontSize: 11, color: 'var(--text3, var(--text2))' },
  fileList: {
    border: '1px solid var(--border)',
    borderRadius: 4,
    maxHeight: 140,
    overflowY: 'auto',
    background: 'var(--bg0)'
  },
  fileRow: {
    padding: '6px 10px',
    borderBottom: '1px solid var(--border)',
    fontSize: 12,
    cursor: 'pointer',
    color: 'var(--text1)'
  },
  fileRowActive: {
    background: 'var(--bg3)',
    color: 'var(--accent)',
    fontWeight: 600
  },
  emptyRow: { padding: '12px 0', color: 'var(--text2)', fontSize: 12, textAlign: 'center' },
  lineList: {
    border: '1px solid var(--border)',
    borderRadius: 4,
    maxHeight: 260,
    overflowY: 'auto',
    background: 'var(--bg0)'
  },
  lineRow: {
    display: 'flex',
    gap: 8,
    padding: '5px 10px',
    borderBottom: '1px solid var(--border)',
    fontSize: 12,
    cursor: 'pointer',
    color: 'var(--text1)'
  },
  lineRowInRange: {
    background: 'rgba(59,130,246,0.12)'
  },
  lineRowEdge: {
    background: 'rgba(59,130,246,0.28)',
    fontWeight: 600
  },
  lineTime: {
    fontFamily: 'var(--font-mono)',
    color: 'var(--text2)',
    flexShrink: 0,
    width: 40
  },
  lineText: { flex: 1 },
  preview: {
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    background: 'var(--bg0)',
    padding: '6px 8px',
    borderRadius: 4,
    border: '1px solid var(--border)'
  },
  gpuRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    color: 'var(--text1)',
    cursor: 'pointer'
  },
  errorMsg: {
    fontSize: 12,
    color: 'var(--hl-red, #f87171)',
    background: 'rgba(248,113,113,0.08)',
    border: '1px solid rgba(248,113,113,0.2)',
    borderRadius: 4,
    padding: '6px 8px'
  },
  success: {
    background: 'rgba(74,222,128,0.1)',
    border: '1px solid rgba(74,222,128,0.3)',
    borderRadius: 6,
    padding: 10,
    fontSize: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 4
  },
  resultHeader: { display: 'flex', alignItems: 'center', gap: 6 },
  resultList: { margin: '4px 0 0 0', paddingLeft: 20, fontSize: 12 },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '10px 16px',
    borderTop: '1px solid var(--border)',
    flexShrink: 0
  },
  closeFooterBtn: {
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    color: 'var(--text1)',
    fontSize: 12,
    padding: '6px 16px',
    borderRadius: 4,
    cursor: 'pointer'
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--text1)',
    fontSize: 12,
    padding: '6px 16px',
    borderRadius: 4,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6
  },
  cutBtn: {
    background: 'var(--accent)',
    border: 'none',
    color: '#fff',
    fontSize: 12,
    padding: '6px 20px',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 6
  },
  cutBtnDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  }
}
