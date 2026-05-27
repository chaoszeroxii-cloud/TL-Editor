// ─── TTSApiTab.tsx ─────────────────────────────────────────────────────────
// TTS API settings panel — replaces PythonTab in TerminalPanel
// Uses Novel TTS API (https://novelttsapi-0mv2.onrender.com) with streaming support

import { useState, useRef, JSX, useCallback, useEffect } from 'react'
import type { GlossaryLibraries } from '../../utils/glossaryLoader'
import { filterUsedGlossariesFromRecord } from '../../utils/ttsPreprocess'
import { getToneConfig, type ToneName, type VoiceGender } from '../../constants/tones'
import { IcoMusic, IcoNetwork } from '../common/exports'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TtsApiConfig {
  apiUrl: string
  apiKey: string
  voiceGender: string
  voiceName: string
  rate: string
  outputPath: string
  useStreaming?: boolean
  playbackVolume?: number
}

interface TTSApiTabProps {
  config: TtsApiConfig
  onConfigChange: (cfg: TtsApiConfig) => void
  glossaries?: GlossaryLibraries
  tgtContent?: string
  tgtPath?: string | null
  glossaryPaths?: { atPath?: string; bfPath?: string }
  getLineTone?: (lineIndex: number) => ToneName
  onPlayTtsAudio?: (blob: Blob) => void
}

interface TtsProgressEvent {
  phase: 'starting' | 'progress' | 'completed' | 'done'
  current: number
  total: number
  percent: number
  requestId: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)))
  }
  return btoa(bin)
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TTSApiTab({
  config,
  onConfigChange,
  glossaries,
  tgtContent,
  tgtPath,
  glossaryPaths,
  getLineTone,
  onPlayTtsAudio
}: TTSApiTabProps): JSX.Element {
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle')
  const [testMsg, setTestMsg] = useState('')
  const [testBlobUrl, setTestBlobUrl] = useState<string | null>(null)
  const [ttsStatus, setTtsStatus] = useState<'idle' | 'generating' | 'ok' | 'error'>('idle')
  const [ttsMsg, setTtsMsg] = useState('')
  const [ttsProgress, setTtsProgress] = useState<TtsProgressEvent | null>(null)
  const [tonesStatus, setTonesToStatus] = useState<'idle' | 'generating' | 'ok' | 'error'>('idle')
  const [tonesMsg, setTonesToMsg] = useState('')
  const [showGlossaries, setShowGlossaries] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  // ── Smart Gen state (Feature A) ─────────────────────────────────────────────
  // Cache: line text → base64 audio.  Keyed by exact text so unchanged lines
  // are reused across re-gens without an extra API call.
  const lineAudioCache = useRef(new Map<string, string>())
  const [lastGenLines, setLastGenLines] = useState<string[]>([])
  const [smartStatus, setSmartStatus] = useState<'idle' | 'generating' | 'ok' | 'error'>('idle')
  const [smartMsg, setSmartMsg] = useState('')
  const [smartProgress, setSmartProgress] = useState<{ current: number; total: number } | null>(
    null
  )

  const update = (patch: Partial<TtsApiConfig>): void => onConfigChange({ ...config, ...patch })

  const decodeBase64ToBytes = useCallback((base64: string): Uint8Array => {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  }, [])

  const replaceTestBlobUrl = useCallback((nextUrl: string | null): void => {
    setTestBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return nextUrl
    })
  }, [])

  useEffect(() => {
    const handleTtsProgress = (_event: unknown, payload: unknown): void => {
      setTtsProgress(payload as TtsProgressEvent)
    }

    window.electron.on('tts:progress', handleTtsProgress)
    return () => window.electron.off('tts:progress', handleTtsProgress)
  }, [])

  const browseOutput = async (): Promise<void> => {
    const p = await window.electron.openFolder()
    if (p) update({ outputPath: p })
  }

  const testConnection = useCallback(async (): Promise<void> => {
    if (testStatus === 'testing') return
    setTestStatus('testing')
    setTestMsg('กำลังทดสอบการเชื่อมต่อ...')
    replaceTestBlobUrl(null)

    try {
      const testText = 'สวัสดี ทดสอบเสียง TTS API ครับ'
      const apiUrl = (config.apiUrl || 'https://novelttsapi-0mv2.onrender.com').trim()
      // Filter glossaries to only include terms found in test text
      const filteredBfLib = filterUsedGlossariesFromRecord(testText, glossaries?.bf_lib)
      const filteredAtLib = filterUsedGlossariesFromRecord(testText, glossaries?.at_lib)
      const response = await window.electron.tts(testText, {
        apiUrl,
        apiKey: config.apiKey || undefined,
        voiceGender: config.voiceGender,
        voiceName: config.voiceName || undefined,
        rate: config.rate || '+35%',
        bf_lib: filteredBfLib,
        at_lib: filteredAtLib
      })

      // Extract data from response (now returns {requestId, data})
      const base64 = response.data
      if (!base64 || base64.length < 100) throw new Error('ไม่ได้รับไฟล์เสียงจาก API')
      const bytes = decodeBase64ToBytes(base64)
      const audioBuffer = new ArrayBuffer(bytes.byteLength)
      new Uint8Array(audioBuffer).set(bytes)
      const url = URL.createObjectURL(new Blob([audioBuffer], { type: 'audio/mpeg' }))
      replaceTestBlobUrl(url)
      setTestStatus('ok')
      setTestMsg('✓ เชื่อมต่อสำเร็จ — กด ▶ เพื่อฟังตัวอย่าง')
      // Auto-play
      setTimeout(() => audioRef.current?.play().catch(() => {}), 100)
    } catch (e) {
      setTestStatus('error')
      setTestMsg(e instanceof Error ? e.message.slice(0, 160) : String(e))
    }
  }, [
    config,
    decodeBase64ToBytes,
    glossaries?.at_lib,
    glossaries?.bf_lib,
    replaceTestBlobUrl,
    testStatus
  ])

  const generateWithTones = useCallback(async (): Promise<void> => {
    if (!tgtContent?.trim() || !getLineTone) {
      setTonesToMsg('ไม่มีข้อมูล TGT หรือ tone metadata')
      return
    }

    setTonesToStatus('generating')
    setTonesToMsg('กำลังสร้างเสียง per-line...')

    // Filter glossaries to only include terms found in target content
    const filteredBfLib = filterUsedGlossariesFromRecord(tgtContent, glossaries?.bf_lib)
    const filteredAtLib = filterUsedGlossariesFromRecord(tgtContent, glossaries?.at_lib)

    try {
      const apiUrl = (config.apiUrl || 'https://novelttsapi-0mv2.onrender.com').trim()
      const lines = tgtContent.split('\n').filter((line) => line.trim())
      const ttsLines = lines.map((text, idx) => {
        const toneName = getLineTone(idx)
        const genderKey = (
          config.voiceGender?.toLowerCase() === 'female' ? 'female' : 'male'
        ) as VoiceGender
        const toneConfig = getToneConfig(toneName, genderKey)
        return {
          text,
          tone: toneConfig,
          voice_gender: config.voiceGender || 'Female',
          voice_name: config.voiceName || null
        }
      })

      const request = {
        lines: ttsLines,
        bf_lib: filteredBfLib,
        at_lib: filteredAtLib,
        lang: 'th'
      }

      const response = await fetch(`${apiUrl}/generate-multi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Novel TTS API Error (${response.status}): ${errText}`)
      }

      const audioBlob = await response.blob()
      console.log('TTS audio generated successfully:', {
        size: audioBlob.size,
        type: audioBlob.type
      })

      // Play the audio
      if (onPlayTtsAudio) {
        onPlayTtsAudio(audioBlob)
      }

      // Save the file if outputPath is set
      if (config.outputPath?.trim()) {
        try {
          const bytes = new Uint8Array(await audioBlob.arrayBuffer())
          const filename = tgtPath
            ? `${tgtPath
                .split(/[\\/]/)
                .pop()
                ?.replace(/\.[^.]+$/, '')}-tones.mp3`
            : `voice-tones.mp3`

          await window.electron.saveAudioBytes(bytes, filename, config.outputPath)
          setTonesToStatus('ok')
          setTonesToMsg(`✓ เสียงสร้างและบันทึก: ${filename}`)
        } catch {
          setTonesToStatus('ok')
          setTonesToMsg('✓ เสียงสร้างเรียบร้อย (ไม่สามารถบันทึก)')
        }
      } else {
        setTonesToStatus('ok')
        setTonesToMsg('✓ เสียงสร้างเรียบร้อย (ยังไม่ได้บันทึก)')
      }
    } catch (e: unknown) {
      setTonesToStatus('error')
      setTonesToMsg(e instanceof Error ? e.message.slice(0, 160) : String(e))
    }
  }, [
    tgtContent,
    getLineTone,
    glossaries?.bf_lib,
    glossaries?.at_lib,
    config.apiUrl,
    config.outputPath,
    config.voiceGender,
    config.voiceName,
    onPlayTtsAudio,
    tgtPath
  ])

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
    setTtsMsg('กำลังเชื่อมต่อ...')
    setTtsProgress(null)

    try {
      const apiUrl = (config.apiUrl || 'https://novelttsapi-0mv2.onrender.com').trim().replace(/\/$/, '')
      const wsUrl = apiUrl.replace(/^http/, 'ws') + '/ws/stream'

      const filteredBfLib = filterUsedGlossariesFromRecord(tgtContent, glossaries?.bf_lib)
      const filteredAtLib = filterUsedGlossariesFromRecord(tgtContent, glossaries?.at_lib)

      const chunks: ArrayBuffer[] = []

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl)
        ws.binaryType = 'arraybuffer'

        ws.onopen = () => {
          setTtsMsg('กำลังสร้างเสียง…')
          ws.send(JSON.stringify({
            text: tgtContent,
            bf_lib: filteredBfLib,
            at_lib: filteredAtLib,
            rate: config.rate || '+35%',
            voice_gender: config.voiceGender || 'Female',
            voice_name: config.voiceName || null,
            lang: 'th',
            append_end: true
          }))
        }

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer && event.data.byteLength > 0) {
            chunks.push(event.data)
          } else if (typeof event.data === 'string') {
            if (event.data === 'END') {
              ws.close()
              resolve()
            } else if (event.data.startsWith('ERROR:')) {
              ws.close()
              reject(new Error(event.data.slice(7).trim()))
            } else {
              try {
                const msg = JSON.parse(event.data)
                if (msg.percent !== undefined) {
                  setTtsProgress({
                    phase: msg.phase ?? 'progress',
                    current: msg.current ?? 1,
                    total: msg.total ?? 1,
                    percent: msg.percent,
                    requestId: ''
                  })
                }
              } catch {}
            }
          }
        }

        ws.onerror = () => reject(new Error('WebSocket เชื่อมต่อล้มเหลว'))
      })

      if (!chunks.length) throw new Error('ไม่ได้รับไฟล์เสียงจาก API')

      // Combine all chunks → base64
      const totalBytes = chunks.reduce((s, c) => s + c.byteLength, 0)
      const combined = new Uint8Array(totalBytes)
      let offset = 0
      for (const c of chunks) { combined.set(new Uint8Array(c), offset); offset += c.byteLength }
      const base64 = uint8ToBase64(combined)

      const filename = tgtPath
        ? `${tgtPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '')}.mp3`
        : `voice.mp3`

      setTtsMsg('กำลังบันทึกไฟล์…')
      await window.electron.saveAudioFile(base64, filename, config.outputPath)

      setTtsStatus('ok')
      setTtsMsg(`✓ บันทึกเสร็จ: ${filename}`)
      setTtsProgress(null)
    } catch (e) {
      setTtsStatus('error')
      setTtsMsg(e instanceof Error ? e.message.slice(0, 160) : String(e))
      setTtsProgress(null)
    }
  }

  // ── Smart Gen (per-line with cache) ─────────────────────────────────────────

  // Non-blank lines of current TGT content, preserving original index for context.
  const currentLines = (tgtContent || '').split('\n').filter((l) => l.trim())

  // Lines whose text is not yet in the cache → need re-generation.
  const changedCount =
    lastGenLines.length > 0 ? currentLines.filter((l) => !lineAudioCache.current.has(l)).length : 0

  const generateSmartTts = useCallback(
    async (regenChangedOnly: boolean) => {
      if (!tgtContent?.trim() || !config.outputPath?.trim() || !config.apiUrl?.trim()) return

      const apiUrl = config.apiUrl.trim()
      const lines = (tgtContent || '').split('\n').filter((l) => l.trim())
      const toGen = regenChangedOnly
        ? lines.filter((l) => !lineAudioCache.current.has(l))
        : lines

      if (!regenChangedOnly) lineAudioCache.current.clear()

      setSmartStatus('generating')
      setSmartProgress({ current: 0, total: toGen.length })
      setSmartMsg(
        regenChangedOnly
          ? `เจนเสียง ${toGen.length} บรรทัดที่เปลี่ยน…`
          : `เจนเสียง ${toGen.length} บรรทัด…`
      )

      const BATCH = 4
      let done = 0
      const skipped: string[] = []

      try {
        for (let i = 0; i < toGen.length; i += BATCH) {
          const batch = toGen.slice(i, i + BATCH)
          await Promise.all(
            batch.map(async (line) => {
              try {
                const filteredBfLib = filterUsedGlossariesFromRecord(line, glossaries?.bf_lib)
                const filteredAtLib = filterUsedGlossariesFromRecord(line, glossaries?.at_lib)
                const resp = await fetch(`${apiUrl}/stream`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    text: line,
                    bf_lib: filteredBfLib,
                    at_lib: filteredAtLib,
                    rate: config.rate || '+35%',
                    voice_gender: config.voiceGender || 'Female',
                    voice_name: config.voiceName || null,
                    lang: 'th'
                  })
                })
                if (!resp.ok) {
                  skipped.push(line.slice(0, 30))
                } else {
                  const bytes = new Uint8Array(await resp.arrayBuffer())
                  lineAudioCache.current.set(line, uint8ToBase64(bytes))
                }
              } catch {
                skipped.push(line.slice(0, 30))
              }
              done++
              setSmartProgress({ current: done, total: toGen.length })
            })
          )
        }

        // Assemble segments in content order (lines that failed are simply omitted)
        const ordered = lines
          .map((l) => lineAudioCache.current.get(l))
          .filter((b): b is string => !!b)
        if (!ordered.length) throw new Error('ไม่มี audio segments — ทุก line ล้มเหลว')

        setSmartMsg('กำลัง concat เสียง…')
        const combinedBase64 = await window.electron.concatMp3s(ordered)

        const filename = tgtPath
          ? `${tgtPath.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '')}.mp3`
          : 'voice.mp3'
        await window.electron.saveAudioFile(combinedBase64, filename, config.outputPath)

        setLastGenLines(lines)
        setSmartStatus('ok')
        setSmartMsg(
          skipped.length > 0
            ? `✓ บันทึก: ${filename} · ข้าม ${skipped.length} บรรทัด (เสียงไม่ออก): ${skipped.join(', ')}`
            : `✓ บันทึก: ${filename} (${lines.length} บรรทัด)`
        )
        setSmartProgress(null)
      } catch (e) {
        setSmartStatus('error')
        setSmartMsg(e instanceof Error ? e.message.slice(0, 160) : String(e))
        setSmartProgress(null)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tgtContent, config, glossaries, tgtPath]
  )

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
          href="https://novelttsapi-0mv2.onrender.com/docs"
          onClick={(e) => {
            e.preventDefault()
            const openWindow = window.open as (url: string, target: string) => void
            openWindow?.('https://novelttsapi-0mv2.onrender.com/docs', '_blank')
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
              placeholder="https://novelttsapi-0mv2.onrender.com"
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

          {/* Playback Volume */}
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

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6
        }}
      >
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
            flex: 1,
            minWidth: 0,
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

        {/* Generate with Tones button (per-line TTS) */}
        <button
          onClick={generateWithTones}
          disabled={
            tonesStatus === 'generating' ||
            !config.apiUrl.trim() ||
            !tgtContent?.trim() ||
            !getLineTone
          }
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            flex: 1,
            minWidth: 0,
            background: tonesStatus === 'generating' ? 'var(--bg2)' : 'var(--bg3)',
            border: `1px solid ${tonesStatus === 'generating' ? 'var(--border)' : 'rgba(62,207,160,0.45)'}`,
            borderLeft: `3px solid ${tonesStatus === 'generating' ? 'var(--border)' : 'var(--hl-teal)'}`,
            color: tonesStatus === 'generating' ? 'var(--text2)' : 'var(--hl-teal)',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.03em',
            padding: '6px 10px',
            borderRadius: 4,
            cursor:
              tonesStatus === 'generating' ||
              !config.apiUrl.trim() ||
              !tgtContent?.trim() ||
              !getLineTone
                ? 'not-allowed'
                : 'pointer',
            opacity: !config.apiUrl.trim() || !tgtContent?.trim() || !getLineTone ? 0.4 : 1,
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            if (!e.currentTarget.disabled) {
              e.currentTarget.style.background = 'rgba(62,207,160,0.1)'
            }
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background =
              tonesStatus === 'generating' ? 'var(--bg2)' : 'var(--bg3)'
          }}
          title="สร้างเสียง TTS แบบต่อบรรทัด โดยใช้โทนสีเสียงต่างๆ"
        >
          {tonesStatus === 'generating' ? (
            <>
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                style={{ animation: 'spin 1s linear infinite' }}
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 2.2" />
              </svg>
              กำลัง...
            </>
          ) : (
            <>
              <IcoMusic size={10} stroke="currentColor" />
              Generate with Tones
            </>
          )}
        </button>

        {/* Test button */}
        <button
          onClick={testConnection}
          disabled={testStatus === 'testing' || !config.apiUrl.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            flex: 1,
            minWidth: 0,
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
            e.currentTarget.style.background =
              testStatus === 'testing' ? 'var(--bg2)' : 'var(--bg3)'
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
            <>
              <IcoNetwork size={10} stroke="currentColor" />
              ทดสอบการเชื่อมต่อ
            </>
          )}
        </button>
      </div>

      {/* ── Smart Gen row ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4 }}>
        <button
          onClick={() => generateSmartTts(false)}
          disabled={
            smartStatus === 'generating' || !config.apiUrl.trim() || !tgtContent?.trim() || !config.outputPath?.trim()
          }
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            background: smartStatus === 'generating' ? 'var(--bg2)' : 'var(--bg3)',
            border: `1px solid ${smartStatus === 'generating' ? 'var(--border)' : 'rgba(255,180,0,0.45)'}`,
            borderLeft: `3px solid ${smartStatus === 'generating' ? 'var(--border)' : 'var(--hl-gold)'}`,
            color: smartStatus === 'generating' ? 'var(--text2)' : 'var(--hl-gold)',
            fontSize: 11,
            fontWeight: 600,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.03em',
            padding: '6px 10px',
            borderRadius: 4,
            cursor: smartStatus === 'generating' || !config.apiUrl.trim() || !tgtContent?.trim() || !config.outputPath?.trim() ? 'not-allowed' : 'pointer',
            opacity: !config.apiUrl.trim() || !tgtContent?.trim() || !config.outputPath?.trim() ? 0.4 : 1
          }}
          title="Gen เสียงทีละ line, cache ไว้ — ครั้งถัดไปจะเร็วขึ้น"
        >
          {smartStatus === 'generating' && smartProgress ? (
            <>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              {smartProgress.current}/{smartProgress.total} บรรทัด…
            </>
          ) : (
            '⚡ Smart Gen (per-line)'
          )}
        </button>

        {changedCount > 0 && smartStatus !== 'generating' && (
          <button
            onClick={() => generateSmartTts(true)}
            disabled={!config.outputPath?.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 5,
              background: 'rgba(255,180,0,0.12)',
              border: '1px solid rgba(255,180,0,0.5)',
              borderLeft: '3px solid var(--hl-gold)',
              color: 'var(--hl-gold)',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
              padding: '6px 10px',
              borderRadius: 4,
              cursor: 'pointer',
              whiteSpace: 'nowrap'
            }}
            title={`Re-gen เฉพาะ ${changedCount} บรรทัดที่เปลี่ยน แล้ว concat ใหม่`}
          >
            ↺ Re-gen {changedCount} บรรทัด
          </button>
        )}
      </div>

      {/* Smart Gen progress bar */}
      {smartStatus === 'generating' && smartProgress && smartProgress.total > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--hl-gold)', fontFamily: 'var(--font-mono)' }}>
            <span>{smartMsg}</span>
            <span>{Math.round((smartProgress.current / smartProgress.total) * 100)}%</span>
          </div>
          <div style={{ width: '100%', height: 5, borderRadius: 999, background: 'var(--bg3)', overflow: 'hidden' }}>
            <div style={{ width: `${(smartProgress.current / smartProgress.total) * 100}%`, height: '100%', borderRadius: 999, background: 'var(--hl-gold)', transition: 'width 0.2s ease' }} />
          </div>
        </div>
      )}

      {/* Smart Gen status */}
      {smartMsg && smartStatus !== 'generating' && (
        <div style={{
          padding: '5px 9px', borderRadius: 5, border: '1px solid', fontSize: 10,
          fontFamily: 'var(--font-mono)', lineHeight: 1.5, wordBreak: 'break-all',
          background: smartStatus === 'error' ? 'rgba(240,122,106,0.08)' : smartStatus === 'ok' ? 'rgba(255,180,0,0.08)' : 'var(--bg3)',
          borderColor: smartStatus === 'error' ? 'rgba(240,122,106,0.3)' : smartStatus === 'ok' ? 'rgba(255,180,0,0.3)' : 'var(--border)',
          color: smartStatus === 'error' ? 'var(--hl-coral)' : smartStatus === 'ok' ? 'var(--hl-gold)' : 'var(--text2)'
        }}>
          {smartMsg}
        </div>
      )}

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

      {ttsStatus === 'generating' && ttsProgress && (
        <div
          style={{
            padding: '7px 9px',
            borderRadius: 5,
            border: '1px solid rgba(62,207,160,0.3)',
            background: 'rgba(62,207,160,0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: 6
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 10,
              color: 'var(--hl-teal)',
              fontFamily: 'var(--font-mono)'
            }}
          >
            <span>
              chunk {ttsProgress.current}/{ttsProgress.total}
            </span>
            <span>{ttsProgress.percent}%</span>
          </div>
          <div
            style={{
              width: '100%',
              height: 7,
              borderRadius: 999,
              background: 'var(--bg3)',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                width: `${ttsProgress.percent}%`,
                height: '100%',
                borderRadius: 999,
                background: 'var(--hl-teal)',
                transition: 'width 0.2s ease'
              }}
            />
          </div>
        </div>
      )}

      {/* Tones status */}
      {tonesMsg && (
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
              tonesStatus === 'error'
                ? 'rgba(240,122,106,0.08)'
                : tonesStatus === 'ok'
                  ? 'rgba(62,207,160,0.08)'
                  : 'var(--bg3)',
            borderColor:
              tonesStatus === 'error'
                ? 'rgba(240,122,106,0.3)'
                : tonesStatus === 'ok'
                  ? 'rgba(62,207,160,0.3)'
                  : 'var(--border)',
            color:
              tonesStatus === 'error'
                ? 'var(--hl-coral)'
                : tonesStatus === 'ok'
                  ? 'var(--hl-teal)'
                  : 'var(--text2)'
          }}
        >
          {tonesMsg}
        </div>
      )}

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
