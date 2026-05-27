import { useState, useCallback, useEffect, useRef } from 'react'
import type { JSX } from 'react'
import { IcoFolderOpen, IcoSpinner, IcoX, IcoCheck, IcoAlert } from '../common/icons'

interface MergeAudioProgress {
  phase: 'starting' | 'merging' | 'completed' | 'error' | 'canceled'
  currentBatch: number
  totalBatches: number
  currentBatchLabel: string
  ffmpegLog?: string
  error?: string
}

interface MergeAudioPanelProps {
  onClose?: () => void
}

export function MergeAudioPanel({ onClose }: MergeAudioPanelProps): JSX.Element {
  const [sourceDir, setSourceDir] = useState('')
  const [fromEp, setFromEp] = useState('')
  const [toEp, setToEp] = useState('')
  const [batchSize, setBatchSize] = useState('50')
  const [prefix, setPrefix] = useState('')
  const [outputDir, setOutputDir] = useState('')
  const [merging, setMerging] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [progress, setProgress] = useState<MergeAudioProgress | null>(null)
  const [configReady, setConfigReady] = useState(false)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let canceled = false
    window.electron.getEnvConfig().then((cfg) => {
      if (canceled) return
      if (cfg.mergeAudioSourceDir) setSourceDir(cfg.mergeAudioSourceDir)
      if (cfg.mergeAudioOutputDir) setOutputDir(cfg.mergeAudioOutputDir)
      if (cfg.mergeAudioPrefix) setPrefix(cfg.mergeAudioPrefix)
      setConfigReady(true)
    }).catch(() => { if (!canceled) setConfigReady(true) })
    return () => { canceled = true }
  }, [])

  useEffect(() => {
    if (!configReady) return
    window.electron.saveConfigPatch({
      mergeAudioSourceDir: sourceDir,
      mergeAudioOutputDir: outputDir,
      mergeAudioPrefix: prefix
    }).catch(() => {})
  }, [configReady, sourceDir, outputDir, prefix])

  useEffect(() => {
    const handler = (_event: unknown, payload: unknown): void => {
      const p = payload as MergeAudioProgress
      setProgress(p)
      if (p.ffmpegLog) {
        setLog((prev) => [...prev, p.ffmpegLog!])
      }
      if (p.phase === 'completed' || p.phase === 'error' || p.phase === 'canceled') {
        setMerging(false)
      }
    }
    window.electron.on('merge-audio:progress', handler)
    return () => window.electron.off('merge-audio:progress', handler)
  }, [])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [log])

  const browseSource = useCallback(async () => {
    const dir = await window.electron.openFolder()
    if (dir) setSourceDir(dir)
  }, [])

  const browseOutput = useCallback(async () => {
    const dir = await window.electron.openFolder()
    if (dir) setOutputDir(dir)
  }, [])

  const handleMerge = useCallback(async () => {
    const from = parseInt(fromEp, 10)
    const to = parseInt(toEp, 10)
    const bs = parseInt(batchSize, 10)
    if (!sourceDir || !outputDir || isNaN(from) || isNaN(to) || isNaN(bs) || from > to || bs < 1)
      return

    setLog([])
    setProgress(null)
    setMerging(true)

    try {
      await window.electron.mergeEpisodeAudio({
        sourceDir,
        fromEp: from,
        toEp: to,
        batchSize: bs,
        prefix: prefix.trim(),
        outputDir
      })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setProgress({
        phase: 'error',
        currentBatch: 0,
        totalBatches: 0,
        currentBatchLabel: '',
        error: msg
      })
      setMerging(false)
    }
  }, [sourceDir, fromEp, toEp, batchSize, prefix, outputDir])

  const handleCancel = useCallback(async () => {
    await window.electron.cancelMergeAudio()
  }, [])

  const isReady =
    sourceDir &&
    outputDir &&
    fromEp &&
    toEp &&
    parseInt(fromEp, 10) <= parseInt(toEp, 10) &&
    parseInt(batchSize, 10) >= 1

  const exampleName = `${prefix.trim() ? `${prefix.trim()} ` : ''}บทที่ 1 - 50.mp3`

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={merging ? undefined : onClose}
    >
      <div
        style={{
          background: 'var(--bg1)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          width: 560,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--accent)'
            }}
          >
            MERGE AUDIO
          </span>
          {!merging && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text2)',
                padding: 2,
                display: 'flex'
              }}
            >
              <IcoX size={14} stroke="currentColor" />
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>
          {/* Source folder */}
          <FieldRow label="โฟลเดอร์ต้นทาง (MP3)">
            <PathInput value={sourceDir} placeholder="เลือกโฟลเดอร์ที่มีไฟล์ MP3" onBrowse={browseSource} disabled={merging} />
          </FieldRow>

          {/* Episode range */}
          <div style={{ display: 'flex', gap: 10 }}>
            <FieldRow label="ตั้งแต่บทที่" style={{ flex: 1 }}>
              <input
                type="number"
                value={fromEp}
                onChange={(e) => setFromEp(e.target.value)}
                placeholder="1"
                disabled={merging}
                style={inputSx}
                min={1}
              />
            </FieldRow>
            <FieldRow label="ถึงบทที่" style={{ flex: 1 }}>
              <input
                type="number"
                value={toEp}
                onChange={(e) => setToEp(e.target.value)}
                placeholder="100"
                disabled={merging}
                style={inputSx}
                min={1}
              />
            </FieldRow>
            <FieldRow label="Batch size" style={{ flex: 1 }}>
              <input
                type="number"
                value={batchSize}
                onChange={(e) => setBatchSize(e.target.value)}
                disabled={merging}
                style={inputSx}
                min={1}
              />
            </FieldRow>
          </div>

          {/* Prefix */}
          <FieldRow label="ชื่อ prefix (ชื่อนิยาย)">
            <input
              type="text"
              value={prefix}
              onChange={(e) => setPrefix(e.target.value)}
              placeholder="เช่น My Novel"
              disabled={merging}
              style={{ ...inputSx, width: '100%' }}
            />
          </FieldRow>

          {/* Output folder */}
          <FieldRow label="โฟลเดอร์ปลายทาง">
            <PathInput value={outputDir} placeholder="เลือกโฟลเดอร์บันทึกไฟล์ผลลัพธ์" onBrowse={browseOutput} disabled={merging} />
          </FieldRow>

          {/* Example filename */}
          {(prefix || (fromEp && toEp)) && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--text2)',
                fontFamily: 'var(--font-mono)',
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '5px 8px'
              }}
            >
              ตัวอย่างชื่อไฟล์: <span style={{ color: 'var(--text1)' }}>{exampleName}</span>
            </div>
          )}

          {/* Progress */}
          {progress && (
            <ProgressBlock progress={progress} />
          )}

          {/* Log */}
          {log.length > 0 && (
            <div
              ref={logRef}
              style={{
                background: 'var(--bg0)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '8px 10px',
                maxHeight: 140,
                overflowY: 'auto',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                color: 'var(--text2)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}
            >
              {log.join('')}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
            flexShrink: 0
          }}
        >
          {merging ? (
            <button onClick={handleCancel} style={btnDangerSx}>
              ยกเลิก
            </button>
          ) : (
            <>
              <button onClick={onClose} style={btnSecSx}>
                ปิด
              </button>
              <button onClick={handleMerge} disabled={!isReady} style={btnPrimarySx(!isReady)}>
                Merge
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldRow({
  label,
  children,
  style
}: {
  label: string
  children: React.ReactNode
  style?: React.CSSProperties
}): JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
      <label style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function PathInput({
  value,
  placeholder,
  onBrowse,
  disabled
}: {
  value: string
  placeholder: string
  onBrowse: () => void
  disabled?: boolean
}): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input
        type="text"
        readOnly
        value={value}
        placeholder={placeholder}
        style={{
          ...inputSx,
          flex: 1,
          cursor: 'default',
          color: value ? 'var(--text0)' : 'var(--text2)'
        }}
      />
      <button
        onClick={onBrowse}
        disabled={disabled}
        style={{
          background: 'var(--bg3)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          color: 'var(--text1)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: '0 8px',
          display: 'flex',
          alignItems: 'center',
          opacity: disabled ? 0.5 : 1
        }}
      >
        <IcoFolderOpen size={13} stroke="currentColor" />
      </button>
    </div>
  )
}

function ProgressBlock({ progress }: { progress: MergeAudioProgress }): JSX.Element {
  const { phase, currentBatch, totalBatches, currentBatchLabel, error } = progress

  const phaseColor =
    phase === 'completed'
      ? 'var(--hl-teal)'
      : phase === 'error'
        ? 'var(--hl-red, #e05252)'
        : phase === 'canceled'
          ? 'var(--hl-gold)'
          : 'var(--accent)'

  const icon =
    phase === 'completed' ? (
      <IcoCheck size={12} stroke="currentColor" />
    ) : phase === 'error' ? (
      <IcoAlert size={12} stroke="currentColor" />
    ) : phase === 'canceled' ? (
      <IcoX size={12} stroke="currentColor" />
    ) : (
      <IcoSpinner size={12} stroke="currentColor" />
    )

  const label =
    phase === 'completed'
      ? `เสร็จแล้ว — ${currentBatchLabel}`
      : phase === 'error'
        ? `Error: ${error}`
        : phase === 'canceled'
          ? 'ยกเลิกแล้ว'
          : phase === 'starting'
            ? 'กำลังเตรียม...'
            : `กำลัง merge ${currentBatchLabel} (${currentBatch}/${totalBatches})`

  const pct = totalBatches > 0 ? Math.round((currentBatch / totalBatches) * 100) : 0

  return (
    <div
      style={{
        background: 'var(--bg2)',
        border: `1px solid var(--border)`,
        borderRadius: 6,
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          color: phaseColor,
          fontSize: 12
        }}
      >
        {icon}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{label}</span>
      </div>
      {totalBatches > 0 && (
        <div
          style={{
            height: 4,
            background: 'var(--bg3)',
            borderRadius: 2,
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${phase === 'completed' ? 100 : pct}%`,
              background: phaseColor,
              borderRadius: 2,
              transition: 'width 0.3s ease'
            }}
          />
        </div>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputSx: React.CSSProperties = {
  background: 'var(--bg2)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  color: 'var(--text0)',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  padding: '5px 8px',
  outline: 'none',
  width: '100%'
}

const btnBase: React.CSSProperties = {
  fontSize: 12,
  padding: '6px 16px',
  borderRadius: 5,
  cursor: 'pointer',
  fontFamily: 'var(--font-mono)',
  border: 'none'
}

const btnSecSx: React.CSSProperties = {
  ...btnBase,
  background: 'var(--bg3)',
  color: 'var(--text1)',
  border: '1px solid var(--border)'
}

const btnDangerSx: React.CSSProperties = {
  ...btnBase,
  background: 'var(--bg3)',
  color: 'var(--hl-red, #e05252)',
  border: '1px solid var(--border)'
}

const btnPrimarySx = (disabled: boolean): React.CSSProperties => ({
  ...btnBase,
  background: disabled ? 'var(--bg3)' : 'var(--accent)',
  color: disabled ? 'var(--text2)' : '#fff',
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.6 : 1
})
