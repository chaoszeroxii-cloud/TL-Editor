// ─── useTtsGen.ts ──────────────────────────────────────────────────────────────
// TTS generation engine, hoisted out of the (unmount-on-close) panel so the
// floating progress/regen chip survives the popover closing.
//
// Owns: per-line audio cache, Smart Gen / full-chapter (WS) / Tones actions,
// their statuses, and a per-chapter reset (switching chapters clears the cache
// to keep memory bounded — RAM is tight on the target machine).
//
// Instantiated once at App level and shared by both TtsPopover and TtsChip.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GlossaryLibraries } from '../../utils/glossaryLoader'
import { loadGlossariesFromConfig } from '../../utils/glossaryLoader'
import { filterUsedGlossariesFromRecord } from '../../utils/ttsPreprocess'
import { getToneConfig, type ToneName, type VoiceGender } from '../../constants/tones'
import { mp3DurationSec, base64ToUint8 } from '../../utils/mp3Duration'
import {
  AUDIO_TIMELINE_VERSION,
  baseNameNoExt,
  timelineSidecarPath,
  type AudioTimeline,
  type TimelineLine
} from '../../utils/audioTimeline'
import type { TtsApiConfig } from './ttsConstants'

// ─── Types ──────────────────────────────────────────────────────────────────────

type GenStatus = 'idle' | 'generating' | 'ok' | 'error'
type GenKind = 'smart' | 'tts' | 'tones'

interface TtsProgressEvent {
  phase: 'starting' | 'progress' | 'completed' | 'done'
  current: number
  total: number
  percent: number
  requestId: string
}

export interface UseTtsGenParams {
  config: TtsApiConfig
  /**
   * Live glossary content from the App store (`gls.glossary` → ttsGlossaries).
   * Used directly for synthesis so a newly added at_lib/bf_lib entry is applied
   * on the very next gen — do NOT re-derive this from disk here (that was stale).
   */
  glossaries: GlossaryLibraries
  tgtPath?: string | null
  tgtContent?: string
  getLineTone?: (lineIndex: number) => ToneName
  /**
   * True for lines the user manually marked "no audio" (gutter checkbox). Such
   * lines are never synthesised, never counted as changed, and omitted from the
   * concatenated MP3 + its timeline. Keyed by line text.
   */
  isNoAudioText?: (text: string) => boolean
  onPlayTtsAudio?: (blob: Blob) => void
  /** Called after an MP3 is saved (with its path) — host refreshes the tree and
   *  reloads the player if it's currently playing that file. */
  onAudioSaved?: (savedPath: string) => void
}

/** Unified view the chip renders from, regardless of which action is running. */
export interface TtsChipView {
  kind: GenKind
  status: GenStatus
  message: string
  /** 0-100 for the progress bar; undefined → indeterminate (Tones). */
  percent?: number
  /** e.g. "12/45" for Smart Gen; undefined → no count label. */
  countLabel?: string
}

export interface TtsGen {
  // Glossary (loaded internally from config json paths + tgt dir)
  glossaries: GlossaryLibraries
  glossaryPaths: { atPath?: string; bfPath?: string }

  // Smart Gen "จบตอน" toggle
  appendEndOnLast: boolean
  toggleAppendEnd: () => void

  // Derived state for popover button gating + chip
  isGenerating: boolean
  changedCount: number
  hasChipState: boolean
  chip: TtsChipView | null

  // Whether each action is currently runnable (drives button disabled state)
  canSmart: boolean
  canTts: boolean
  canTones: boolean

  // Actions
  generateSmartTts: (regenChangedOnly: boolean) => Promise<void>
  generateAndSaveTts: () => Promise<void>
  generateWithTones: () => Promise<void>
  dismissChip: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────────

function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192
  let bin = ''
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    bin += String.fromCharCode(...Array.from(bytes.subarray(i, i + CHUNK)))
  }
  return btoa(bin)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────────

export function useTtsGen({
  config,
  glossaries,
  tgtPath,
  tgtContent,
  getLineTone,
  isNoAudioText,
  onPlayTtsAudio,
  onAudioSaved
}: UseTtsGenParams): TtsGen {
  // Stable predicate: treat undefined as "nothing is marked no-audio".
  const isNoAudio = useCallback((text: string) => isNoAudioText?.(text) ?? false, [isNoAudioText])
  // Glossary CONTENT comes live from the App store (the `glossaries` param), so a
  // newly added entry is sent on the next gen. We still resolve the on-disk file
  // paths here — purely for the ⚙ status display ("✓ at_lib: at_lib.json").
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
      const { atPath, bfPath } = await loadGlossariesFromConfig(configJsonPaths, tgtPath ?? null)
      setGlossaryPaths({ atPath, bfPath })
    })()
  }, [tgtPath, configJsonPaths])

  // ── Smart Gen cache (keyed by exact line text) ──────────────────────────────
  const lineAudioCache = useRef(new Map<string, string>())
  // Separate cache for the "จบตอน" (append-end) variant of the last line.
  const endLineAudioCache = useRef(new Map<string, string>())

  const [appendEndOnLast, setAppendEndOnLast] = useState<boolean>(
    () => localStorage.getItem('tts.appendEndOnLast') !== 'false'
  )
  const toggleAppendEnd = useCallback((): void => {
    setAppendEndOnLast((v) => {
      const next = !v
      localStorage.setItem('tts.appendEndOnLast', String(next))
      return next
    })
  }, [])

  // ── Statuses ────────────────────────────────────────────────────────────────
  const [activeKind, setActiveKind] = useState<GenKind | null>(null)
  const [chipDismissed, setChipDismissed] = useState(false)

  const [lastGenLines, setLastGenLines] = useState<string[]>([])
  const [smartStatus, setSmartStatus] = useState<GenStatus>('idle')
  const [smartMsg, setSmartMsg] = useState('')
  const [smartProgress, setSmartProgress] = useState<{ current: number; total: number } | null>(
    null
  )

  const [ttsStatus, setTtsStatus] = useState<GenStatus>('idle')
  const [ttsMsg, setTtsMsg] = useState('')
  const [ttsProgress, setTtsProgress] = useState<TtsProgressEvent | null>(null)

  const [tonesStatus, setTonesStatus] = useState<GenStatus>('idle')
  const [tonesMsg, setTonesMsg] = useState('')

  // ── Per-chapter reset (decision #7) ─────────────────────────────────────────
  // Switching to a different chapter clears the cache + hides the chip so the
  // "↺ changed lines" count stays meaningful and memory doesn't accumulate.
  useEffect(() => {
    lineAudioCache.current.clear()
    endLineAudioCache.current.clear()
    setActiveKind(null)
    setChipDismissed(false)
    setLastGenLines([])
    setSmartStatus('idle')
    setSmartMsg('')
    setSmartProgress(null)
    setTtsStatus('idle')
    setTtsMsg('')
    setTtsProgress(null)
    setTonesStatus('idle')
    setTonesMsg('')
  }, [tgtPath])

  // ── Legacy IPC progress channel (WS path also sets ttsProgress inline) ───────
  useEffect(() => {
    const handleTtsProgress = (_event: unknown, payload: unknown): void => {
      setTtsProgress(payload as TtsProgressEvent)
    }
    window.electron.on('tts:progress', handleTtsProgress)
    return () => window.electron.off('tts:progress', handleTtsProgress)
  }, [])

  // ── Derived ──────────────────────────────────────────────────────────────────
  const currentLines = useMemo(
    () => (tgtContent || '').split('\n').filter((l) => l.trim()),
    [tgtContent]
  )

  const changedCount =
    lastGenLines.length > 0
      ? currentLines.filter((l) => !isNoAudio(l) && !lineAudioCache.current.has(l)).length
      : 0

  const isGenerating =
    smartStatus === 'generating' || ttsStatus === 'generating' || tonesStatus === 'generating'

  const chip = useMemo<TtsChipView | null>(() => {
    if (activeKind === 'smart') {
      return {
        kind: 'smart',
        status: smartStatus,
        message: smartMsg,
        percent:
          smartProgress && smartProgress.total > 0
            ? Math.round((smartProgress.current / smartProgress.total) * 100)
            : smartStatus === 'generating'
              ? 0
              : undefined,
        countLabel: smartProgress ? `${smartProgress.current}/${smartProgress.total}` : undefined
      }
    }
    if (activeKind === 'tts') {
      return {
        kind: 'tts',
        status: ttsStatus,
        message: ttsMsg,
        percent: ttsProgress ? ttsProgress.percent : ttsStatus === 'generating' ? 0 : undefined
      }
    }
    if (activeKind === 'tones') {
      return { kind: 'tones', status: tonesStatus, message: tonesMsg }
    }
    return null
  }, [
    activeKind,
    smartStatus,
    smartMsg,
    smartProgress,
    ttsStatus,
    ttsMsg,
    ttsProgress,
    tonesStatus,
    tonesMsg
  ])

  const hasChipState = !!chip && !chipDismissed && chip.status !== 'idle'

  const hasContent = !!tgtContent?.trim()
  const hasApi = !!config.apiUrl?.trim()
  const hasOutput = !!config.outputPath?.trim()
  const canSmart = hasContent && hasApi && hasOutput
  const canTts = hasContent && hasApi && hasOutput
  const canTones = hasContent && hasApi && !!getLineTone

  const dismissChip = useCallback(() => setChipDismissed(true), [])

  // ── Smart Gen (per-line with cache) ─────────────────────────────────────────
  const generateSmartTts = useCallback(
    async (regenChangedOnly: boolean) => {
      if (!tgtContent?.trim() || !config.outputPath?.trim() || !config.apiUrl?.trim()) return

      const apiUrl = config.apiUrl.trim()
      const lines = (tgtContent || '').split('\n').filter((l) => l.trim())
      // Lines the user marked "no audio" are never synthesised.
      const voiceable = lines.filter((l) => !isNoAudio(l))
      const toGen = [
        ...new Set(
          regenChangedOnly ? voiceable.filter((l) => !lineAudioCache.current.has(l)) : voiceable
        )
      ]

      if (!regenChangedOnly) {
        lineAudioCache.current.clear()
        endLineAudioCache.current.clear()
      }

      setActiveKind('smart')
      setChipDismissed(false)
      setSmartStatus('generating')
      setSmartProgress({ current: 0, total: toGen.length })
      setSmartMsg(
        regenChangedOnly
          ? `เจนเสียง ${toGen.length} บรรทัดที่เปลี่ยน…`
          : `เจนเสียง ${toGen.length} บรรทัด…`
      )

      // Experiment: the per-line API calls dominate Smart Gen time. Raising
      // concurrency was super-linear (conc 4 → 82s, conc 8 → 27.8s), so the
      // server is latency-bound, not saturated — push further. Tune against the
      // [SmartGen] fetch log; back off if the server starts returning errors
      // (→ skipped lines).
      const CONCURRENCY = 24
      let done = 0
      const skipped: string[] = []

      try {
        const _t0 = performance.now()
        let nextIndex = 0
        const generateNext = async (): Promise<void> => {
          while (nextIndex < toGen.length) {
            const line = toGen[nextIndex++]
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
                  lang: 'th',
                  append_end: false
                })
              })
              if (!resp.ok) {
                skipped.push(line.slice(0, 30))
              } else {
                const bytes = new Uint8Array(await resp.arrayBuffer())
                if (!bytes.byteLength) {
                  skipped.push(line.slice(0, 30))
                } else {
                  lineAudioCache.current.set(line, uint8ToBase64(bytes))
                }
              }
            } catch {
              skipped.push(line.slice(0, 30))
            } finally {
              done++
              setSmartProgress({ current: done, total: toGen.length })
            }
          }
        }

        await Promise.all(
          Array.from({ length: Math.min(CONCURRENCY, toGen.length) }, () => generateNext())
        )

        // The chapter's last *voiceable* line optionally gets the "จบตอน" end marker.
        const lastLine = voiceable[voiceable.length - 1]
        if (
          appendEndOnLast &&
          lastLine &&
          (!regenChangedOnly || !endLineAudioCache.current.has(lastLine))
        ) {
          setSmartMsg('เจนเสียง "จบตอน" บรรทัดสุดท้าย…')
          try {
            const resp = await fetch(`${apiUrl}/stream`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: lastLine,
                bf_lib: filterUsedGlossariesFromRecord(lastLine, glossaries?.bf_lib),
                at_lib: filterUsedGlossariesFromRecord(lastLine, glossaries?.at_lib),
                rate: config.rate || '+35%',
                voice_gender: config.voiceGender || 'Female',
                voice_name: config.voiceName || null,
                lang: 'th',
                append_end: true
              })
            })
            if (resp.ok) {
              const bytes = new Uint8Array(await resp.arrayBuffer())
              if (bytes.byteLength) endLineAudioCache.current.set(lastLine, uint8ToBase64(bytes))
            }
          } catch {
            /* fall back to the no-end version in assembly below */
          }
        }

        const _tFetch = performance.now()

        // Assemble segments in content order (failed lines are omitted), keeping
        // each segment's full-content row index (incl. blank lines) so the play
        // timeline maps onto the editor's row indices.
        const allLines = (tgtContent || '').split('\n')
        let lastVoiceableIdx = -1
        for (let k = allLines.length - 1; k >= 0; k--) {
          if (allLines[k].trim() && !isNoAudio(allLines[k])) {
            lastVoiceableIdx = k
            break
          }
        }
        const orderedSegs: { row: number; b64: string }[] = []
        allLines.forEach((l, idx) => {
          if (!l.trim() || isNoAudio(l)) return
          const seg =
            idx === lastVoiceableIdx && appendEndOnLast
              ? (endLineAudioCache.current.get(l) ?? lineAudioCache.current.get(l))
              : lineAudioCache.current.get(l)
          if (seg) orderedSegs.push({ row: idx, b64: seg })
        })
        const ordered = orderedSegs.map((s) => s.b64)
        if (!ordered.length) throw new Error('ไม่มี audio segments — ทุก line ล้มเหลว')

        // Per-line play timeline: cumulative segment durations. Built from the same
        // bytes we concat (stream-copy `-c copy`), so offsets line up exactly with
        // the merged MP3. Header-only duration parse — no PCM decode (RAM-tight).
        let acc = 0
        const timelineLines: TimelineLine[] = orderedSegs.map((s) => {
          const entry: TimelineLine = { row: s.row, start: acc }
          acc += mp3DurationSec(base64ToUint8(s.b64))
          return entry
        })

        setSmartMsg('กำลัง concat เสียง…')
        const combinedBase64 = await window.electron.concatMp3s(ordered)
        const _tConcat = performance.now()

        const filename = tgtPath
          ? `${tgtPath
              .split(/[\\/]/)
              .pop()
              ?.replace(/\.[^.]+$/, '')}.mp3`
          : 'voice.mp3'
        await window.electron.saveAudioFile(combinedBase64, filename, config.outputPath)
        const savedPath = `${config.outputPath.replace(/[\\/]+$/, '')}/${filename}`

        // Persist the timeline sidecar next to the MP3 (best-effort: if it fails the
        // audio is still saved, the editor just won't karaoke-highlight playback).
        try {
          const sidecar = timelineSidecarPath(savedPath)
          if (sidecar) {
            const timeline: AudioTimeline = {
              v: AUDIO_TIMELINE_VERSION,
              chapter: baseNameNoExt(savedPath),
              totalSec: acc,
              lines: timelineLines
            }
            await window.electron.writeFileEnsureDir(sidecar, JSON.stringify(timeline))
          }
        } catch (err) {
          console.warn('[SmartGen] timeline sidecar save failed', err)
        }

        console.log(
          `[SmartGen] fetch=${Math.round(_tFetch - _t0)}ms concat=${Math.round(
            _tConcat - _tFetch
          )}ms save=${Math.round(performance.now() - _tConcat)}ms · gen ${toGen.length}/${
            lines.length
          } lines`
        )
        setLastGenLines(lines)
        setSmartStatus('ok')
        setSmartMsg(
          skipped.length > 0
            ? `✓ ${filename} · ข้าม ${skipped.length} บรรทัด (เสียงไม่ออก): ${skipped.join(', ')}`
            : `✓ ${filename} (${lines.length} บรรทัด)`
        )
        setSmartProgress(null)
        onAudioSaved?.(savedPath)
      } catch (e) {
        setSmartStatus('error')
        setSmartMsg(e instanceof Error ? e.message.slice(0, 160) : String(e))
        setSmartProgress(null)
      }
    },
    [tgtContent, config, glossaries, tgtPath, onAudioSaved, appendEndOnLast, isNoAudio]
  )

  // ── Full-chapter generate + save (WebSocket stream) ─────────────────────────
  const generateAndSaveTts = useCallback(async (): Promise<void> => {
    if (ttsStatus === 'generating') return
    if (!tgtContent?.trim()) {
      setActiveKind('tts')
      setChipDismissed(false)
      setTtsStatus('error')
      setTtsMsg('ไม่มีข้อความให้อ่านออกเสียง')
      return
    }
    if (!config.outputPath?.trim()) {
      setActiveKind('tts')
      setChipDismissed(false)
      setTtsStatus('error')
      setTtsMsg('กรุณากำหนดโฟลเดอร์ที่จะบันทึก MP3')
      return
    }

    setActiveKind('tts')
    setChipDismissed(false)
    setTtsStatus('generating')
    setTtsMsg('กำลังเชื่อมต่อ...')
    setTtsProgress(null)

    try {
      const apiUrl = (config.apiUrl || 'https://novelttsapi-0mv2.onrender.com')
        .trim()
        .replace(/\/$/, '')
      const wsUrl = apiUrl.replace(/^http/, 'ws') + '/ws/stream'

      const filteredBfLib = filterUsedGlossariesFromRecord(tgtContent, glossaries?.bf_lib)
      const filteredAtLib = filterUsedGlossariesFromRecord(tgtContent, glossaries?.at_lib)

      const chunks: ArrayBuffer[] = []

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(wsUrl)
        ws.binaryType = 'arraybuffer'

        ws.onopen = () => {
          setTtsMsg('กำลังสร้างเสียง…')
          ws.send(
            JSON.stringify({
              text: tgtContent,
              bf_lib: filteredBfLib,
              at_lib: filteredAtLib,
              rate: config.rate || '+35%',
              voice_gender: config.voiceGender || 'Female',
              voice_name: config.voiceName || null,
              lang: 'th',
              append_end: true
            })
          )
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
              } catch {
                /* ignore */
              }
            }
          }
        }

        ws.onerror = () => reject(new Error('WebSocket เชื่อมต่อล้มเหลว'))
      })

      if (!chunks.length) throw new Error('ไม่ได้รับไฟล์เสียงจาก API')

      const totalBytes = chunks.reduce((s, c) => s + c.byteLength, 0)
      const combined = new Uint8Array(totalBytes)
      let offset = 0
      for (const c of chunks) {
        combined.set(new Uint8Array(c), offset)
        offset += c.byteLength
      }
      const base64 = uint8ToBase64(combined)

      const filename = tgtPath
        ? `${tgtPath
            .split(/[\\/]/)
            .pop()
            ?.replace(/\.[^.]+$/, '')}.mp3`
        : `voice.mp3`

      setTtsMsg('กำลังบันทึกไฟล์…')
      await window.electron.saveAudioFile(base64, filename, config.outputPath)

      setTtsStatus('ok')
      setTtsMsg(`✓ ${filename}`)
      setTtsProgress(null)
      onAudioSaved?.(`${config.outputPath.replace(/[\\/]+$/, '')}/${filename}`)
    } catch (e) {
      setTtsStatus('error')
      setTtsMsg(e instanceof Error ? e.message.slice(0, 160) : String(e))
      setTtsProgress(null)
    }
  }, [ttsStatus, tgtContent, config, glossaries, tgtPath, onAudioSaved])

  // ── Generate with Tones (per-line tone metadata, /generate-multi) ───────────
  const generateWithTones = useCallback(async (): Promise<void> => {
    if (!tgtContent?.trim() || !getLineTone) {
      setActiveKind('tones')
      setChipDismissed(false)
      setTonesStatus('error')
      setTonesMsg('ไม่มีข้อมูล TGT หรือ tone metadata')
      return
    }

    setActiveKind('tones')
    setChipDismissed(false)
    setTonesStatus('generating')
    setTonesMsg('กำลังสร้างเสียง per-line...')

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

      const request = { lines: ttsLines, bf_lib: filteredBfLib, at_lib: filteredAtLib, lang: 'th' }

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

      if (onPlayTtsAudio) onPlayTtsAudio(audioBlob)

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
          setTonesStatus('ok')
          setTonesMsg(`✓ ${filename}`)
          onAudioSaved?.(`${config.outputPath.replace(/[\\/]+$/, '')}/${filename}`)
        } catch {
          setTonesStatus('ok')
          setTonesMsg('✓ เสียงสร้างเรียบร้อย (ไม่สามารถบันทึก)')
        }
      } else {
        setTonesStatus('ok')
        setTonesMsg('✓ เสียงสร้างเรียบร้อย (ยังไม่ได้บันทึก)')
      }
    } catch (e: unknown) {
      setTonesStatus('error')
      setTonesMsg(e instanceof Error ? e.message.slice(0, 160) : String(e))
    }
  }, [tgtContent, getLineTone, glossaries, config, onPlayTtsAudio, onAudioSaved, tgtPath])

  return {
    glossaries,
    glossaryPaths,
    appendEndOnLast,
    toggleAppendEnd,
    isGenerating,
    changedCount,
    hasChipState,
    chip,
    canSmart,
    canTts,
    canTones,
    generateSmartTts,
    generateAndSaveTts,
    generateWithTones,
    dismissChip
  }
}
