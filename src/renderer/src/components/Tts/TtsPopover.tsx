// ─── TtsPopover.tsx ────────────────────────────────────────────────────────────
// Floating, draggable TTS control surface (replaces the full-width bottom dock).
// Front shows the compact actions (Smart Gen prominent); the gear (⚙) expands
// the set-once config. Generation state lives in useTtsGen (App level) so the
// progress/regen chip survives this popover closing.

import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import { filterUsedGlossariesFromRecord } from '../../utils/ttsPreprocess'
import { IcoMusic, IcoNetwork, IcoSparkle, IcoClose, IcoSpinner } from '../common/icons'
import type { TtsApiConfig } from './ttsConstants'
import type { TtsGen } from './useTtsGen'

interface TtsPopoverProps {
  gen: TtsGen
  config: TtsApiConfig
  onConfigChange: (cfg: TtsApiConfig) => void
  onClose: () => void
}

const WIDTH = 380

export function TtsPopover({ gen, config, onConfigChange, onClose }: TtsPopoverProps): JSX.Element {
  const update = (patch: Partial<TtsApiConfig>): void => onConfigChange({ ...config, ...patch })

  const [showSettings, setShowSettings] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [showGlossaries, setShowGlossaries] = useState(false)

  // ── Test connection (local — doesn't need to outlive the popover) ───────────
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [testBlobUrl, setTestBlobUrl] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const replaceTestBlobUrl = useCallback((nextUrl: string | null): void => {
    setTestBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return nextUrl
    })
  }, [])

  const decodeBase64ToBytes = (base64: string): Uint8Array => {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }

  const testConnection = useCallback(async (): Promise<void> => {
    if (testStatus === 'testing') return
    setTestStatus('testing')
    setTestMsg('กำลังทดสอบการเชื่อมต่อ...')
    replaceTestBlobUrl(null)
    try {
      const testText = 'สวัสดี ทดสอบเสียง TTS API ครับ'
      const apiUrl = (config.apiUrl || 'https://novelttsapi-0mv2.onrender.com').trim()
      const filteredBfLib = filterUsedGlossariesFromRecord(testText, gen.glossaries?.bf_lib)
      const filteredAtLib = filterUsedGlossariesFromRecord(testText, gen.glossaries?.at_lib)
      const response = await window.electron.tts(testText, {
        apiUrl,
        apiKey: config.apiKey || undefined,
        voiceGender: config.voiceGender,
        voiceName: config.voiceName || undefined,
        rate: config.rate || '+35%',
        bf_lib: filteredBfLib,
        at_lib: filteredAtLib
      })
      const base64 = response.data
      if (!base64 || base64.length < 100) throw new Error('ไม่ได้รับไฟล์เสียงจาก API')
      const bytes = decodeBase64ToBytes(base64)
      const audioBuffer = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(audioBuffer).set(bytes)
      const url = URL.createObjectURL(new Blob([audioBuffer], { type: 'audio/mpeg' }))
      replaceTestBlobUrl(url)
      setTestStatus('ok')
      setTestMsg('✓ เชื่อมต่อสำเร็จ — กด ▶ เพื่อฟังตัวอย่าง')
      setTimeout(() => audioRef.current?.play().catch(() => {}), 100)
    } catch (e) {
      setTestStatus('error')
      setTestMsg(e instanceof Error ? e.message.slice(0, 160) : String(e))
    }
  }, [config, gen.glossaries, replaceTestBlobUrl, testStatus])

  const browseOutput = async (): Promise<void> => {
    const p = await window.electron.openFolder()
    if (p) update({ outputPath: p })
  }

  // ── Each gen button closes the popover first (it collapses into the chip) ───
  const runSmart = (): void => {
    onClose()
    void gen.generateSmartTts(false)
  }
  const runTts = (): void => {
    onClose()
    void gen.generateAndSaveTts()
  }
  const runTones = (): void => {
    onClose()
    void gen.generateWithTones()
  }

  // ── Esc closes (no click-outside — keep it put while editing) ───────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Revoke test blob on unmount
  useEffect(() => {
    return () => {
      if (testBlobUrl) URL.revokeObjectURL(testBlobUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Styles (ported from the old TTSApiTab) ──────────────────────────────────
  const inp: React.CSSProperties = {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    color: 'var(--text0)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    padding: '4px 7px',
    outline: 'none',
    flex: 1,
    minWidth: 0,
    boxSizing: 'border-box'
  }
  const lbl: React.CSSProperties = {
    fontSize: 9,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    flexShrink: 0,
    width: 58
  }
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5 }
  const divider = <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
  const iconBtn: React.CSSProperties = {
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

  const statusBox = (status: 'idle' | 'testing' | 'ok' | 'error', msg: string): JSX.Element => (
    <div
      style={{
        padding: '5px 9px',
        borderRadius: 5,
        border: '1px solid',
        fontSize: 10,
        fontFamily: 'var(--font-mono)',
        lineHeight: 1.5,
        wordBreak: 'break-all',
        background:
          status === 'error'
            ? 'rgba(240,122,106,0.08)'
            : status === 'ok'
              ? 'rgba(62,207,160,0.08)'
              : 'var(--bg3)',
        borderColor:
          status === 'error'
            ? 'rgba(240,122,106,0.3)'
            : status === 'ok'
              ? 'rgba(62,207,160,0.3)'
              : 'var(--border)',
        color:
          status === 'error'
            ? 'var(--hl-coral)'
            : status === 'ok'
              ? 'var(--hl-teal)'
              : 'var(--text2)'
      }}
    >
      {msg}
    </div>
  )

  const tealBtn = (
    onClick: () => void,
    disabled: boolean,
    children: React.ReactNode,
    small = false
  ): JSX.Element => (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        flex: 1,
        minWidth: 0,
        background: 'var(--bg3)',
        border: '1px solid rgba(62,207,160,0.45)',
        borderLeft: '3px solid var(--hl-teal)',
        color: 'var(--hl-teal)',
        fontSize: small ? 10 : 11,
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.03em',
        padding: small ? '5px 8px' : '7px 10px',
        borderRadius: 4,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'all 0.15s ease'
      }}
    >
      {children}
    </button>
  )

  return (
    <div
      style={{
        position: 'absolute',
        right: 16,
        bottom: 16,
        width: WIDTH,
        maxWidth: 'calc(100% - 32px)',
        zIndex: 40,
        background: 'var(--bg1)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px 6px 10px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg2)'
        }}
      >
        <span
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
        </span>
        <div style={{ flex: 1 }} />
        <button
          title="ตั้งค่า"
          onClick={() => setShowSettings((v) => !v)}
          style={{ ...iconBtn, color: showSettings ? 'var(--accent)' : 'var(--text2)' }}
        >
          ⚙
        </button>
        <button title="ปิด (Esc)" onClick={onClose} style={iconBtn}>
          <IcoClose size={12} stroke="currentColor" />
        </button>
      </div>

      {/* Body */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
          padding: '9px 12px 12px',
          userSelect: 'text',
          maxHeight: '70vh',
          overflowY: 'auto'
        }}
      >
        {/* ── Output directory ─────────────────────────────────────────────── */}
        <div style={row}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              background: 'var(--bg2)',
              border: `1px solid ${config.outputPath ? 'rgba(91,138,240,0.45)' : 'var(--border)'}`,
              borderRadius: 4,
              padding: '4px 8px',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              color: config.outputPath ? 'var(--accent)' : 'var(--text2)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
            title={config.outputPath}
          >
            {config.outputPath || '— เลือกโฟลเดอร์บันทึก MP3 —'}
          </div>
          <button
            onClick={browseOutput}
            style={{
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              color: 'var(--text1)',
              fontSize: 10,
              padding: '4px 9px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              flexShrink: 0
            }}
          >
            Browse…
          </button>
          {config.outputPath && (
            <button
              onClick={() => update({ outputPath: '' })}
              style={{ ...iconBtn, color: 'var(--hl-coral)', fontSize: 13 }}
            >
              ✕
            </button>
          )}
        </div>

        {/* ── จบตอน toggle ─────────────────────────────────────────────────── */}
        <button
          onClick={gen.toggleAppendEnd}
          disabled={gen.isGenerating}
          title="ใส่เสียง 'จบตอน' ต่อท้ายบรรทัดสุดท้ายของตอน (เฉพาะ Smart Gen)"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            alignSelf: 'flex-start',
            background: gen.appendEndOnLast ? 'rgba(255,180,0,0.14)' : 'var(--bg2)',
            border: `1px solid ${gen.appendEndOnLast ? 'rgba(255,180,0,0.5)' : 'var(--border)'}`,
            color: gen.appendEndOnLast ? 'var(--hl-gold)' : 'var(--text2)',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            padding: '5px 10px',
            borderRadius: 4,
            cursor: gen.isGenerating ? 'not-allowed' : 'pointer',
            whiteSpace: 'nowrap'
          }}
        >
          {gen.appendEndOnLast ? '☑' : '☐'} จบตอน
        </button>

        {/* ── Smart Gen (primary) ──────────────────────────────────────────── */}
        <button
          onClick={runSmart}
          disabled={gen.isGenerating || !gen.canSmart}
          title="Gen เสียงทีละ line, cache ไว้ — ครั้งถัดไปจะเร็วขึ้น"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 7,
            background: 'var(--bg3)',
            border: '1px solid rgba(255,180,0,0.45)',
            borderLeft: '3px solid var(--hl-gold)',
            color: 'var(--hl-gold)',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.03em',
            padding: '9px 10px',
            borderRadius: 4,
            cursor: gen.isGenerating || !gen.canSmart ? 'not-allowed' : 'pointer',
            opacity: !gen.canSmart ? 0.4 : 1
          }}
        >
          <IcoSparkle size={12} stroke="currentColor" /> Smart Gen (per-line)
        </button>

        {/* ── Secondary actions ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6 }}>
          {tealBtn(runTts, gen.isGenerating || !gen.canTts, <>▶ ทั้งตอน</>, true)}
          {tealBtn(
            runTones,
            gen.isGenerating || !gen.canTones,
            <>
              <IcoMusic size={10} stroke="currentColor" /> Tones
            </>,
            true
          )}
        </div>

        {/* ── ⚙ Settings (collapsible) ─────────────────────────────────────── */}
        {showSettings && (
          <>
            {divider}

            <div style={row}>
              <span style={lbl}>API URL</span>
              <input
                style={inp}
                value={config.apiUrl}
                onChange={(e) => update({ apiUrl: e.target.value })}
                placeholder="https://novelttsapi-0mv2.onrender.com"
                spellCheck={false}
              />
            </div>

            <div style={row}>
              <span style={lbl}>API Key</span>
              <input
                type={showKey ? 'text' : 'password'}
                style={inp}
                value={config.apiKey}
                onChange={(e) => update({ apiKey: e.target.value })}
                placeholder="(ไม่บังคับ — ถ้า server ต้องการ)"
                spellCheck={false}
              />
              <button onClick={() => setShowKey((v) => !v)} style={{ ...iconBtn, fontSize: 13 }}>
                {showKey ? '●' : '○'}
              </button>
            </div>

            <div style={row}>
              <span style={lbl}>Voice</span>
              <select
                style={{ ...inp, flex: 'none', width: 90 }}
                value={config.voiceGender}
                onChange={(e) => update({ voiceGender: e.target.value })}
              >
                <option value="Female">Female</option>
                <option value="Male">Male</option>
              </select>
              <span style={{ ...lbl, width: 'auto', marginLeft: 4 }}>Rate</span>
              <input
                style={{ ...inp, flex: 'none', width: 64 }}
                value={config.rate}
                onChange={(e) => update({ rate: e.target.value })}
                placeholder="+35%"
              />
            </div>

            <div style={row}>
              <span style={lbl}>Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={config.playbackVolume ?? 0.7}
                onChange={(e) => update({ playbackVolume: parseFloat(e.target.value) })}
                style={{ flex: 1, accentColor: 'var(--hl-teal)', cursor: 'pointer' }}
              />
              <span style={{ ...lbl, width: 32, textAlign: 'right', color: 'var(--text1)' }}>
                {Math.round((config.playbackVolume ?? 0.7) * 100)}%
              </span>
            </div>

            <div style={row}>
              <span style={lbl}>Voice ID</span>
              <input
                style={inp}
                value={config.voiceName}
                onChange={(e) => update({ voiceName: e.target.value })}
                placeholder="th-TH-PremwadeeNeural  (optional — ถ้าว่างจะสุ่ม)"
                spellCheck={false}
              />
              {config.voiceName && (
                <button
                  onClick={() => update({ voiceName: '' })}
                  style={{ ...iconBtn, fontSize: 13 }}
                >
                  ✕
                </button>
              )}
            </div>

            {divider}

            {/* Glossary status */}
            <button
              onClick={() => setShowGlossaries((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: 10,
                color: 'var(--text2)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontWeight: 600
              }}
            >
              <span style={{ fontSize: 9 }}>{showGlossaries ? '▼' : '▶'}</span>
              <span>Glossaries (at_lib, bf_lib)</span>
            </button>

            {showGlossaries && (
              <div style={{ display: 'flex', gap: 4 }}>
                <div
                  style={{
                    flex: 1,
                    background: 'var(--bg2)',
                    border: `1px solid ${gen.glossaryPaths?.atPath ? 'rgba(62,207,160,0.3)' : 'rgba(240,122,106,0.3)'}`,
                    borderRadius: 4,
                    padding: '6px 9px',
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                    color: gen.glossaryPaths?.atPath ? 'var(--hl-teal)' : 'var(--hl-coral)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={gen.glossaryPaths?.atPath}
                >
                  {gen.glossaryPaths?.atPath
                    ? `✓ at_lib: ${gen.glossaryPaths.atPath.split(/[\\/]/).pop()}`
                    : '✗ at_lib: not found'}
                </div>
                <div
                  style={{
                    flex: 1,
                    background: 'var(--bg2)',
                    border: `1px solid ${gen.glossaryPaths?.bfPath ? 'rgba(62,207,160,0.3)' : 'rgba(240,122,106,0.3)'}`,
                    borderRadius: 4,
                    padding: '6px 9px',
                    fontSize: 9,
                    fontFamily: 'var(--font-mono)',
                    color: gen.glossaryPaths?.bfPath ? 'var(--hl-teal)' : 'var(--hl-coral)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={gen.glossaryPaths?.bfPath}
                >
                  {gen.glossaryPaths?.bfPath
                    ? `✓ bf_lib: ${gen.glossaryPaths.bfPath.split(/[\\/]/).pop()}`
                    : '✗ bf_lib: not found'}
                </div>
              </div>
            )}

            {/* Test connection */}
            <button
              onClick={testConnection}
              disabled={testStatus === 'testing' || !config.apiUrl.trim()}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: 'var(--bg3)',
                border: '1px solid rgba(91,138,240,0.45)',
                borderLeft: '3px solid var(--accent)',
                color: 'var(--accent)',
                fontSize: 10,
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                padding: '5px 10px',
                borderRadius: 4,
                cursor:
                  testStatus === 'testing' || !config.apiUrl.trim() ? 'not-allowed' : 'pointer',
                opacity: !config.apiUrl.trim() ? 0.4 : 1
              }}
            >
              {testStatus === 'testing' ? (
                <>
                  <IcoSpinner size={10} stroke="currentColor" /> กำลังทดสอบ...
                </>
              ) : (
                <>
                  <IcoNetwork size={10} stroke="currentColor" /> ทดสอบการเชื่อมต่อ
                </>
              )}
            </button>

            {testMsg && statusBox(testStatus, testMsg)}

            {testBlobUrl && testStatus === 'ok' && (
              <div
                style={{
                  background: 'var(--bg2)',
                  border: '1px solid rgba(62,207,160,0.3)',
                  borderRadius: 5,
                  padding: '5px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--hl-teal)',
                    fontFamily: 'var(--font-mono)',
                    flexShrink: 0
                  }}
                >
                  ตัวอย่าง
                </span>
                <audio ref={audioRef} src={testBlobUrl} controls style={{ flex: 1, height: 28 }} />
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
