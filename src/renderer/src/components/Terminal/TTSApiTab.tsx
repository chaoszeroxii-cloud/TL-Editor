// ─── TTSApiTab.tsx ─────────────────────────────────────────────────────────
// TTS API settings panel — replaces PythonTab in TerminalPanel
// Uses Novel TTS API (https://novelttsapi.onrender.com) with streaming support

import { useState, useRef, JSX } from 'react'
import type { GlossaryLibraries } from '../../utils/glossaryLoader'
import { filterUsedGlossariesFromRecord } from '../../utils/ttsPreprocess'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TtsApiConfig {
  apiUrl: string
  apiKey: string
  voiceGender: string
  voiceName: string
  rate: string
  outputPath: string
  useStreaming?: boolean
}

interface TTSApiTabProps {
  config: TtsApiConfig
  onConfigChange: (cfg: TtsApiConfig) => void
  glossaries?: GlossaryLibraries
  tgtContent?: string
  tgtPath?: string | null
  glossaryPaths?: { atPath?: string; bfPath?: string }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TTSApiTab({
  config,
  onConfigChange,
  glossaries,
  tgtContent,
  tgtPath,
  glossaryPaths
}: TTSApiTabProps): JSX.Element {
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [testBlobUrl, setTestBlobUrl] = useState<string | null>(null)
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'generating' | 'ok' | 'error'>('idle')
  const [ttsMsg, setTtsMsg] = useState('')
  const [showGlossaries, setShowGlossaries] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  const update = (patch: Partial<TtsApiConfig>): void => onConfigChange({ ...config, ...patch })

  const browseOutput = async (): Promise<void> => {
    const p = await window.electron.openFolder()
    if (p) update({ outputPath: p })
  }

  const testConnection = async (): Promise<void> => {
    if (testStatus === 'testing') return
    setTestStatus('testing')
    setTestMsg('กำลังทดสอบการเชื่อมต่อ...')
    if (testBlobUrl) {
      URL.revokeObjectURL(testBlobUrl)
      setTestBlobUrl(null)
    }

    try {
      const testText = 'สวัสดี ทดสอบเสียง TTS API ครับ'
      const apiUrl = (config.apiUrl || 'https://novelttsapi.onrender.com').trim()
      const useStreaming = config.useStreaming !== false
      // Filter glossaries to only include terms found in test text
      const filteredBfLib = filterUsedGlossariesFromRecord(testText, glossaries?.bf_lib)
      const filteredAtLib = filterUsedGlossariesFromRecord(testText, glossaries?.at_lib)
      // Call the endpoint via proper window.electron method
      const base64 = await (useStreaming
        ? window.electron.ttsStream(testText, {
            apiUrl,
            apiKey: config.apiKey || undefined,
            voiceGender: config.voiceGender,
            voiceName: config.voiceName || undefined,
            rate: config.rate || '+35%',
            bf_lib: filteredBfLib,
            at_lib: filteredAtLib
          })
        : window.electron.tts(testText, {
            apiUrl,
            apiKey: config.apiKey || undefined,
            voiceGender: config.voiceGender,
            voiceName: config.voiceName || undefined,
            rate: config.rate || '+35%',
            bf_lib: filteredBfLib,
            at_lib: filteredAtLib
          }))
      if (!base64 || base64.length < 100) throw new Error('ไม่ได้รับไฟล์เสียงจาก API')
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
      const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }))
      setTestBlobUrl(url)
      setTestStatus('ok')
      setTestMsg('✓ เชื่อมต่อสำเร็จ — กด ▶ เพื่อฟังตัวอย่าง')
      // Auto-play
      setTimeout(() => audioRef.current?.play().catch(() => {}), 100)
    } catch (e) {
      setTestStatus('error')
      setTestMsg(e instanceof Error ? e.message.slice(0, 160) : String(e))
    }
  }

  const generateAndSaveTts = async (): Promise<void> => {
    if (ttsStatus === 'generating') return
    if (!tgtContent?.trim()) {
      setTtsStatus('error')
      setTtsMsg('ไม่มีข้อความให้อ่านออกเสียง')
      return
    }
    if (!config.outputPath?.trim()) {
      setTtsStatus('error')
      setTtsMsg('กรุณากำหนดโฟลเดอร์ที่จะบันทึก MP3')
      return
    }

    setTtsStatus('generating')
    setTtsMsg('กำลังอ่านออกเสียง...')

    try {
      const apiUrl = (config.apiUrl || 'https://novelttsapi.onrender.com').trim()
      const useStreaming = config.useStreaming !== false

      // Filter glossaries to only include terms found in target content
      const filteredBfLib = filterUsedGlossariesFromRecord(tgtContent, glossaries?.bf_lib)
      const filteredAtLib = filterUsedGlossariesFromRecord(tgtContent, glossaries?.at_lib)

      // Generate audio
      const base64 = await (useStreaming
        ? window.electron.ttsStream(tgtContent, {
            apiUrl,
            apiKey: config.apiKey || undefined,
            voiceGender: config.voiceGender,
            voiceName: config.voiceName || undefined,
            rate: config.rate || '+35%',
            bf_lib: filteredBfLib,
            at_lib: filteredAtLib
          })
        : window.electron.tts(tgtContent, {
            apiUrl,
            apiKey: config.apiKey || undefined,
            voiceGender: config.voiceGender,
            voiceName: config.voiceName || undefined,
            rate: config.rate || '+35%',
            bf_lib: filteredBfLib,
            at_lib: filteredAtLib
          }))

      if (!base64 || base64.length < 100) throw new Error('ไม่ได้รับไฟล์เสียงจาก API')

      // Save to file
      const filename = tgtPath
        ? `${tgtPath
            .split(/[\\/]/)
            .pop()
            ?.replace(/\.[^.]+$/, '')}.mp3`
        : `voice.mp3`

      await window.electron.saveTtsAudio(base64, filename, config.outputPath)

      setTtsStatus('ok')
      setTtsMsg(`✓ บันทึกเสร็จ: ${filename}`)
      setTimeout(() => {
        setTtsStatus('idle')
        setTtsMsg('')
      }, 3000)
    } catch (e) {
      setTtsStatus('error')
      setTtsMsg(e instanceof Error ? e.message.slice(0, 160) : String(e))
    }
  }

  // ── Styles ──────────────────────────────────────────────────────────────────
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
    textTransform: 'uppercase' as const,
    flexShrink: 0,
    width: 58
  }
  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 5 }
  const divider = <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        padding: '8px 12px 12px',
        overflowY: 'auto',
        flex: 1,
        userSelect: 'text'
      }}
    >
      {/* Section header - Collapsible Settings */}
      <div
        onClick={() => setShowSettings(!showSettings)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          marginBottom: 2,
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: 'var(--accent)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.07em',
            fontWeight: 600
          }}
        >
          <span
            style={{ fontSize: 10, color: 'var(--text2)', marginLeft: 'auto', margin: '0 5px 0 0' }}
          >
            {showSettings ? '▼' : '▶'}
          </span>
          NOVEL TTS API
        </span>
        <span style={{ fontSize: 10, color: 'var(--text2)', marginLeft: 'auto' }}></span>
        <a
          href="https://novelttsapi.onrender.com/docs"
          onClick={(e) => {
            e.preventDefault()
            const openWindow = window.open as (url: string, target: string) => void
            openWindow?.('https://novelttsapi.onrender.com/docs', '_blank')
          }}
          style={{
            fontSize: 9,
            color: 'var(--text2)',
            fontFamily: 'var(--font-mono)',
            cursor: 'pointer',
            textDecoration: 'none',
            opacity: 0.6
          }}
          title="เปิด API docs"
        >
          docs ↗
        </a>
      </div>

      {showSettings && (
        <>
          {/* API URL */}
          <div style={row}>
            <span style={lbl}>API URL</span>
            <input
              style={inp}
              value={config.apiUrl}
              onChange={(e) => update({ apiUrl: e.target.value })}
              placeholder="https://novelttsapi.onrender.com"
              spellCheck={false}
            />
          </div>

          {/* API Key */}
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
            <button
              onClick={() => setShowKey((v) => !v)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text2)',
                fontSize: 13,
                padding: '2px 5px',
                flexShrink: 0
              }}
            >
              {showKey ? '●' : '○'}
            </button>
          </div>

          {/* Voice Gender + Rate */}
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

          {/* Voice Name (optional lock) */}
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
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text2)',
                  padding: '2px 4px',
                  flexShrink: 0,
                  fontSize: 13
                }}
              >
                ✕
              </button>
            )}
          </div>

          {divider}
        </>
      )}

      {/* Output Directory */}
      <div
        style={{
          fontSize: 9,
          color: 'var(--text2)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase'
        }}
      >
        Save MP3 → Directory
      </div>

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
          {config.outputPath || '— จะถามเมื่อกด 💾 Save MP3 ครั้งแรก —'}
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
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--hl-coral)',
              padding: '2px 4px',
              flexShrink: 0,
              fontSize: 13
            }}
          >
            ✕
          </button>
        )}
      </div>

      {divider}

      {/* Glossaries Status - Collapsible */}
      <button
        onClick={() => setShowGlossaries(!showGlossaries)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontSize: 11,
          color: 'var(--text2)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontWeight: 600,
          marginBottom: 4
        }}
      >
        <span style={{ fontSize: 10 }}>{showGlossaries ? '▼' : '▶'}</span>
        <span>Glossaries (at_lib, bf_lib)</span>
      </button>

      {showGlossaries && (
        <div style={{ display: 'flex', gap: '2px', marginBottom: 4 }}>
          {glossaryPaths?.atPath ? (
            <div
              style={{
                background: 'var(--bg2)',
                border: '1px solid rgba(62,207,160,0.3)',
                borderRadius: 4,
                padding: '8px 12px',
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                color: 'var(--hl-teal)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
              title={glossaryPaths.atPath}
            >
              ✓ at_lib: {glossaryPaths.atPath.split(/[\\/]/).pop()}
            </div>
          ) : (
            <div
              style={{
                background: 'var(--bg2)',
                border: '1px solid rgba(240,122,106,0.3)',
                borderRadius: 4,
                padding: '8px 12px',
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                color: 'var(--hl-coral)',
                marginBottom: 4
              }}
            >
              ✗ at_lib: not found
            </div>
          )}

          {glossaryPaths?.bfPath ? (
            <div
              style={{
                background: 'var(--bg2)',
                border: '1px solid rgba(62,207,160,0.3)',
                borderRadius: 4,
                padding: '8px 12px',
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                color: 'var(--hl-teal)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
              title={glossaryPaths.bfPath}
            >
              ✓ bf_lib: {glossaryPaths.bfPath.split(/[\\/]/).pop()}
            </div>
          ) : (
            <div
              style={{
                background: 'var(--bg2)',
                border: '1px solid rgba(240,122,106,0.3)',
                borderRadius: 4,
                padding: '8px 12px',
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                color: 'var(--hl-coral)'
              }}
            >
              ✗ bf_lib: not found
            </div>
          )}
        </div>
      )}

      {divider}

      {/* Generate & Save TTS button */}
      <button
        onClick={generateAndSaveTts}
        disabled={
          ttsStatus === 'generating' ||
          !config.apiUrl.trim() ||
          !tgtContent?.trim() ||
          !config.outputPath?.trim()
        }
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          background: ttsStatus === 'generating' ? 'var(--bg2)' : 'var(--bg3)',
          border: `1px solid ${ttsStatus === 'generating' ? 'var(--border)' : 'rgba(62,207,160,0.45)'}`,
          borderLeft: `3px solid ${ttsStatus === 'generating' ? 'var(--border)' : 'var(--hl-teal)'}`,
          color: ttsStatus === 'generating' ? 'var(--text2)' : 'var(--hl-teal)',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.03em',
          padding: '6px 10px',
          borderRadius: 4,
          cursor:
            ttsStatus === 'generating' ||
            !config.apiUrl.trim() ||
            !tgtContent?.trim() ||
            !config.outputPath?.trim()
              ? 'not-allowed'
              : 'pointer',
          opacity:
            !config.apiUrl.trim() || !tgtContent?.trim() || !config.outputPath?.trim() ? 0.4 : 1,
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => {
          if (!e.currentTarget.disabled) {
            e.currentTarget.style.background = 'rgba(62,207,160,0.1)'
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background =
            ttsStatus === 'generating' ? 'var(--bg2)' : 'var(--bg3)'
        }}
      >
        {ttsStatus === 'generating' ? (
          <>
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            กำลังอ่านออกเสียง...
          </>
        ) : (
          '▶  อ่านออกเสียง + บันทึก'
        )}
      </button>

      {/* TTS status */}
      {ttsMsg && (
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
              ttsStatus === 'error'
                ? 'rgba(240,122,106,0.08)'
                : ttsStatus === 'ok'
                  ? 'rgba(62,207,160,0.08)'
                  : 'var(--bg3)',
            borderColor:
              ttsStatus === 'error'
                ? 'rgba(240,122,106,0.3)'
                : ttsStatus === 'ok'
                  ? 'rgba(62,207,160,0.3)'
                  : 'var(--border)',
            color:
              ttsStatus === 'error'
                ? 'var(--hl-coral)'
                : ttsStatus === 'ok'
                  ? 'var(--hl-teal)'
                  : 'var(--text2)'
          }}
        >
          {ttsMsg}
        </div>
      )}

      {divider}

      {/* Test button */}
      <button
        onClick={testConnection}
        disabled={testStatus === 'testing' || !config.apiUrl.trim()}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          background: testStatus === 'testing' ? 'var(--bg2)' : 'var(--bg3)',
          border: `1px solid ${testStatus === 'testing' ? 'var(--border)' : 'rgba(91,138,240,0.45)'}`,
          borderLeft: `3px solid ${testStatus === 'testing' ? 'var(--border)' : 'var(--accent)'}`,
          color: testStatus === 'testing' ? 'var(--text2)' : 'var(--accent)',
          fontSize: 11,
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.03em',
          padding: '6px 10px',
          borderRadius: 4,
          cursor: testStatus === 'testing' || !config.apiUrl.trim() ? 'not-allowed' : 'pointer',
          opacity: !config.apiUrl.trim() ? 0.4 : 1,
          transition: 'all 0.15s ease'
        }}
        onMouseEnter={(e) => {
          if (!e.currentTarget.disabled) {
            e.currentTarget.style.background = 'rgba(91,138,240,0.1)'
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = testStatus === 'testing' ? 'var(--bg2)' : 'var(--bg3)'
        }}
      >
        {testStatus === 'testing' ? (
          <>
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            กำลังทดสอบ...
          </>
        ) : (
          '⚡ ทดสอบการเชื่อมต่อ'
        )}
      </button>

      {/* Test status */}
      {testMsg && (
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
              testStatus === 'error'
                ? 'rgba(240,122,106,0.08)'
                : testStatus === 'ok'
                  ? 'rgba(62,207,160,0.08)'
                  : 'var(--bg3)',
            borderColor:
              testStatus === 'error'
                ? 'rgba(240,122,106,0.3)'
                : testStatus === 'ok'
                  ? 'rgba(62,207,160,0.3)'
                  : 'var(--border)',
            color:
              testStatus === 'error'
                ? 'var(--hl-coral)'
                : testStatus === 'ok'
                  ? 'var(--hl-teal)'
                  : 'var(--text2)'
          }}
        >
          {testMsg}
        </div>
      )}

      {/* Test audio mini-player */}
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
            ตัวอย่างเสียง
          </span>
          <audio ref={audioRef} src={testBlobUrl} controls style={{ flex: 1, height: 28 }} />
        </div>
      )}

      {/* Usage hint */}
      <div
        style={{
          fontSize: 9,
          color: 'var(--text2)',
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.7,
          opacity: 0.6,
          marginTop: 2,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '6px 8px'
        }}
      >
        <div style={{ fontWeight: 600, opacity: 0.8, marginBottom: 2 }}>วิธีใช้</div>
        <div>1. ตั้งค่า API URL (ใช้ค่าตั้งต้นได้)</div>
        <div>
          2. คลิกขวาในตัวแก้ไข → <span style={{ color: 'var(--hl-coral)' }}>อ่านออกเสียง</span>
        </div>
        <div>
          3. กด <span style={{ color: 'var(--accent)' }}>Save MP3</span> ใน player เพื่อบันทึก
        </div>
        {config.outputPath && (
          <div style={{ color: 'var(--accent)', marginTop: 2 }}>
            Auto-save → {config.outputPath.split(/[\\/]/).pop()}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
