// ─── ParaphraseTab.tsx ────────────────────────────────────────────────────────

import { useState, useCallback, useMemo, useEffect, JSX } from 'react'
import { IcoSparkle } from '../common/icons'

// ─── Types ────────────────────────────────────────────────────────────────────

type ParaphraseMode = 'fluency' | 'concise' | 'creative' | 'style'

interface EqualSeg {
  kind: 'equal'
  id: number
  text: string
}
interface ChangeSeg {
  kind: 'change'
  id: number
  del: string
  ins: string
  accepted: boolean
}
type Seg = EqualSeg | ChangeSeg

// ─── Diff engine ──────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  const result: string[] = []
  const re = /\S+|\s+/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) result.push(m[0])
  return result
}

function buildLCS(a: string[], b: string[]): number[][] {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  return dp
}

function computeDiff(original: string, paraphrased: string): Seg[] {
  const a = tokenize(original).slice(0, 400)
  const b = tokenize(paraphrased).slice(0, 400)
  if (!a.length && !b.length) return []
  const dp = buildLCS(a, b)

  const ops: Array<{ kind: 'equal' | 'del' | 'ins'; text: string }> = []
  let i = a.length,
    j = b.length
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.unshift({ kind: 'equal', text: a[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ kind: 'ins', text: b[j - 1] })
      j--
    } else {
      ops.unshift({ kind: 'del', text: a[i - 1] })
      i--
    }
  }

  const segs: Seg[] = []
  let id = 0,
    k = 0
  while (k < ops.length) {
    if (ops[k].kind === 'equal') {
      let text = ''
      while (k < ops.length && ops[k].kind === 'equal') text += ops[k++].text
      segs.push({ kind: 'equal', id: id++, text })
    } else {
      let del = '',
        ins = ''
      while (k < ops.length && ops[k].kind !== 'equal') {
        if (ops[k].kind === 'del') del += ops[k].text
        else ins += ops[k].text
        k++
      }
      segs.push({ kind: 'change', id: id++, del, ins, accepted: false })
    }
  }
  return segs
}

function buildResult(segs: Seg[]): string {
  return segs
    .map((s) =>
      s.kind === 'equal'
        ? s.text
        : (s as ChangeSeg).accepted
          ? (s as ChangeSeg).ins
          : (s as ChangeSeg).del
    )
    .join('')
}

// ─── Mode metadata ────────────────────────────────────────────────────────────

const MODES: Record<ParaphraseMode, { label: string; emoji: string; prompt: string }> = {
  fluency: {
    label: 'สละสลวย',
    emoji: '✦',
    prompt:
      'เกลาภาษาไทยให้ลื่นไหล เป็นธรรมชาติ รักษาชื่อและเนื้อหาเดิม ตัดโครงสร้างภาษาแปล แสดงผลแค่ข้อความที่เกลาแล้ว'
  },
  concise: {
    label: 'กระชับ',
    emoji: '◆',
    prompt:
      'เกลาภาษาไทยให้กระชับ ตัดคำฟุ่มเฟือย ใช้กริยาแรง รักษาอารมณ์ฉาก แสดงผลแค่ข้อความที่เกลาแล้ว'
  },
  creative: {
    label: 'พรรณนา',
    emoji: '◇',
    prompt:
      "เกลาภาษาไทยให้เห็นภาพ ชัดขึ้น ใช้คำมีระดับ แบบ Show don't tell รักษาเนื้อหาเดิม แสดงผลแค่ข้อความที่เกลาแล้ว"
  },
  style: {
    label: 'Style',
    emoji: '✧',
    prompt: '' // filled at runtime with style profile snippet
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface ParaphraseTabProps {
  apiKey: string
  model?: string
  stylePromptSnippet: string
  /**
   * Called when user clicks → TGT.
   * Receives (originalInput, finalResult) so the PARENT can do a
   * find-replace inside the full TGT content instead of wiping it.
   */
  onPushToTgt?: (original: string, result: string) => void
  /** ข้อความที่ส่งมาจาก context menu "ส่งไป Paraphrase" */
  initialInput?: string
}

// ─── History entry type ───────────────────────────────────────────────────────
interface HistoryEntry {
  id: number
  input: string
  result: string
  mode: ParaphraseMode
  ts: number
}

let _histId = 0

export function ParaphraseTab({
  apiKey,
  model = 'deepseek/deepseek-v4-flash',
  stylePromptSnippet,
  onPushToTgt,
  initialInput
}: ParaphraseTabProps): JSX.Element {
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<ParaphraseMode>('fluency')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [statusMsg, setStatusMsg] = useState('')
  const [segs, setSegs] = useState<Seg[]>([])
  const [copied, setCopied] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)

  const result = useMemo(() => buildResult(segs), [segs])
  const changes = useMemo(() => segs.filter((s) => s.kind === 'change') as ChangeSeg[], [segs])
  const accepted = changes.filter((c) => c.accepted).length
  const hasDiff = segs.length > 0

  // เมื่อได้รับข้อความจาก context menu → ตั้งค่า input อัตโนมัติ
  useEffect(() => {
    if (initialInput) {
      setInput(initialInput)
      setSegs([])
      setStatusMsg('')
      setStatus('idle')
    }
  }, [initialInput])

  // ── Paraphrase ──────────────────────────────────────────────────────────────
  const handleParaphrase = useCallback(async () => {
    if (!apiKey.trim() || !input.trim() || status === 'loading') return
    setStatus('loading')
    setStatusMsg('กำลัง paraphrase…')
    setSegs([])
    setCopied(false)

    try {
      let systemPrompt = MODES[mode].prompt
      if (mode === 'style') {
        if (!stylePromptSnippet.trim()) {
          setStatus('error')
          setStatusMsg('ต้องมี Style Profile ก่อน — Analyze ใน ✦ panel')
          return
        }
        systemPrompt = `${stylePromptSnippet}\n\nUsing the style guidelines above, paraphrase the following Thai text to precisely match this translator's style. Output only the paraphrased text — no explanation, no prefix, no suffix.`
      }

      const response = await window.electron.openrouterChat({
        apiKey: apiKey.trim(),
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input.trim() }
        ]
      })

      // Extract data from response object (requestId is not used in paraphrase)
      const { data: rawJson } = response as { requestId: string; data: string }
      const data = JSON.parse(rawJson)
      const output: string = (data.choices?.[0]?.message?.content ?? '').trim()
      if (!output) throw new Error('AI ไม่ส่งผลลัพธ์กลับมา')

      const newSegs = computeDiff(input.trim(), output)
      setSegs(newSegs)
      const nChanges = newSegs.filter((s) => s.kind === 'change').length
      setStatus('done')
      setStatusMsg(
        nChanges === 0 ? 'เหมือนต้นฉบับ — AI ไม่มีการเปลี่ยนแปลง' : `พบ ${nChanges} จุดที่เปลี่ยน`
      )
      // บันทึกประวัติ
      setHistory((prev) =>
        [
          { id: ++_histId, input: input.trim(), result: output, mode, ts: Date.now() },
          ...prev
        ].slice(0, 30)
      )
    } catch (e) {
      setStatus('error')
      setStatusMsg(e instanceof Error ? e.message : String(e))
    }
  }, [apiKey, model, input, mode, stylePromptSnippet, status])

  // ── Accept / Reject ─────────────────────────────────────────────────────────
  const toggleSeg = useCallback((id: number) => {
    setSegs((prev) =>
      prev.map((s) =>
        s.kind === 'change' && s.id === id ? { ...s, accepted: !(s as ChangeSeg).accepted } : s
      )
    )
  }, [])
  const acceptAll = useCallback(
    () => setSegs((p) => p.map((s) => (s.kind === 'change' ? { ...s, accepted: true } : s))),
    []
  )
  const rejectAll = useCallback(
    () => setSegs((p) => p.map((s) => (s.kind === 'change' ? { ...s, accepted: false } : s))),
    []
  )

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [result])

  /**
   * → TGT: pass (originalInput, result) to parent.
   * Parent is responsible for find-replace inside the full TGT buffer.
   */
  const handlePushToTgt = useCallback(() => {
    if (!onPushToTgt || !result || !input.trim()) return
    onPushToTgt(input.trim(), result)
  }, [onPushToTgt, input, result])

  const canRun = !!(apiKey.trim() && input.trim() && status !== 'loading')

  const lbl: React.CSSProperties = {
    fontSize: 9,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* ── Mode selector ── */}
      <div style={{ display: 'flex', gap: 3 }}>
        {(Object.keys(MODES) as ParaphraseMode[]).map((m) => {
          const cfg = MODES[m]
          const isActive = mode === m
          const isDisabled = m === 'style' && !stylePromptSnippet
          return (
            <button
              key={m}
              onClick={() => !isDisabled && setMode(m)}
              title={isDisabled ? 'ต้องมี Style Profile ก่อน (Analyze ใน ✦ panel)' : undefined}
              style={{
                flex: 1,
                padding: '4px 2px',
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 5,
                background: isActive ? 'var(--accent-dim)' : 'none',
                color: isActive ? 'var(--accent)' : isDisabled ? 'var(--text2)' : 'var(--text1)',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.35 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 3,
                transition: 'all 0.12s'
              }}
            >
              <span style={{ fontSize: 8 }}>{cfg.emoji}</span>
              {cfg.label}
            </button>
          )
        })}
      </div>

      {/* ── Input textarea — fixed height ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={lbl}>ข้อความต้นฉบับ (ที่เกลาไว้)</span>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={'วางข้อความที่เกลาไว้แล้วที่นี่…\n\n(Ctrl+Enter เพื่อ paraphrase)'}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault()
              handleParaphrase()
            }
          }}
          style={{
            width: '100%',
            height: 100,
            resize: 'none',
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 5,
            color: 'var(--text0)',
            fontSize: 12,
            padding: '7px 8px',
            outline: 'none',
            fontFamily: 'var(--font-ui)',
            lineHeight: 1.7,
            boxSizing: 'border-box' as const
          }}
        />
      </div>

      {/* ── Status ── */}
      {statusMsg && (
        <div
          style={{
            padding: '5px 8px',
            borderRadius: 5,
            border: '1px solid',
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            display: 'flex',
            gap: 5,
            alignItems: 'center',
            lineHeight: 1.5,
            background:
              status === 'error'
                ? 'rgba(240,122,106,0.1)'
                : status === 'done'
                  ? 'rgba(62,207,160,0.1)'
                  : 'var(--bg3)',
            borderColor:
              status === 'error'
                ? 'rgba(240,122,106,0.3)'
                : status === 'done'
                  ? 'rgba(62,207,160,0.3)'
                  : 'var(--border)',
            color:
              status === 'error'
                ? 'var(--hl-coral)'
                : status === 'done'
                  ? 'var(--hl-teal)'
                  : 'var(--text2)'
          }}
        >
          {status === 'loading' && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          )}
          <span style={{ flex: 1 }}>{statusMsg}</span>
        </div>
      )}

      {/* ── Paraphrase button ── */}
      <button
        onClick={handleParaphrase}
        disabled={!canRun}
        style={{
          background: canRun ? 'var(--accent)' : 'var(--bg3)',
          border: 'none',
          color: canRun ? '#fff' : 'var(--text2)',
          fontSize: 11,
          fontWeight: 600,
          padding: '7px 0',
          borderRadius: 6,
          cursor: canRun ? 'pointer' : 'not-allowed',
          opacity: canRun ? 1 : 0.4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 5,
          transition: 'all 0.15s'
        }}
      >
        {status === 'loading' ? (
          <>
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              style={{ animation: 'spin 1s linear infinite' }}
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            กำลัง Paraphrase…
          </>
        ) : (
          <>
            <IcoSparkle size={11} stroke="currentColor" />
            Paraphrase
            <span
              style={{ fontSize: 8, opacity: 0.6, fontWeight: 400, fontFamily: 'var(--font-mono)' }}
            >
              Ctrl+↵
            </span>
          </>
        )}
      </button>

      {/* ════════════ DIFF ZONE ════════════ */}
      {hasDiff && (
        <>
          {/* ── Preview — fixed height, scrollable ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={lbl}>
                ผลลัพธ์{' '}
                <span style={{ color: accepted > 0 ? 'var(--hl-teal)' : 'var(--text2)' }}>
                  ({accepted}/{changes.length} รับ)
                </span>
              </span>
              <div style={{ display: 'flex', gap: 3 }}>
                {onPushToTgt && (
                  <button
                    onClick={handlePushToTgt}
                    title="แทรกกลับ TGT — replace เฉพาะส่วนที่ตรงกับ input"
                    style={{
                      fontSize: 11,
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      padding: '5px 12px',
                      borderRadius: 5,
                      border: '1px solid rgba(91,138,240,0.5)',
                      background: 'var(--accent)',
                      color: '#fff',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4
                    }}
                  >
                    → TGT
                  </button>
                )}
                <button
                  onClick={handleCopy}
                  style={{
                    fontSize: 10,
                    fontFamily: 'var(--font-mono)',
                    padding: '5px 9px',
                    borderRadius: 5,
                    border: copied ? '1px solid rgba(62,207,160,0.4)' : '1px solid var(--border)',
                    background: copied ? 'rgba(62,207,160,0.1)' : 'none',
                    color: copied ? 'var(--hl-teal)' : 'var(--text2)',
                    cursor: 'pointer'
                  }}
                >
                  {copied ? '✓ copied' : 'copy'}
                </button>
              </div>
            </div>

            {/* Inline diff preview — fixed height */}
            <div
              style={{
                background: 'var(--bg0)',
                border: '1px solid var(--border)',
                borderRadius: 5,
                padding: '7px 8px',
                fontSize: 12,
                lineHeight: 1.85,
                fontFamily: 'var(--font-ui)',
                color: 'var(--text0)',
                height: 90,
                overflowY: 'auto'
              }}
            >
              {segs.map((seg) => {
                if (seg.kind === 'equal') return <span key={seg.id}>{seg.text}</span>
                const ch = seg as ChangeSeg
                return ch.accepted ? (
                  <span
                    key={seg.id}
                    onClick={() => toggleSeg(ch.id)}
                    title={`ต้นฉบับ: "${ch.del.trim()}" — คลิกเพื่อปฏิเสธ`}
                    style={{
                      background: 'rgba(62,207,160,0.18)',
                      color: 'var(--hl-teal)',
                      borderRadius: 3,
                      padding: '0 2px',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      textDecorationStyle: 'dotted' as const,
                      textDecorationColor: 'rgba(62,207,160,0.5)'
                    }}
                  >
                    {ch.ins}
                  </span>
                ) : (
                  <span
                    key={seg.id}
                    onClick={() => toggleSeg(ch.id)}
                    title={`AI: "${ch.ins.trim()}" — คลิกเพื่อรับ`}
                    style={{
                      background: 'rgba(91,138,240,0.1)',
                      color: 'var(--text1)',
                      borderRadius: 3,
                      padding: '0 2px',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      textDecorationStyle: 'dotted' as const,
                      textDecorationColor: 'rgba(91,138,240,0.4)',
                      opacity: 0.8
                    }}
                  >
                    {ch.del}
                  </span>
                )
              })}
            </div>
            <div
              style={{
                fontSize: 9,
                color: 'var(--text2)',
                fontFamily: 'var(--font-mono)',
                opacity: 0.45
              }}
            >
              คลิกคำที่ขีดเส้นประเพื่อ toggle รับ/ปฏิเสธ
            </div>
          </div>

          {/* ── Change list — FIXED HEIGHT + SCROLL ── */}
          {changes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {/* Header row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexShrink: 0
                }}
              >
                <span style={lbl}>การเปลี่ยน ({changes.length})</span>
                <div style={{ display: 'flex', gap: 3 }}>
                  <button
                    onClick={acceptAll}
                    style={{
                      fontSize: 9,
                      fontFamily: 'var(--font-mono)',
                      padding: '2px 7px',
                      borderRadius: 4,
                      border:
                        accepted === changes.length
                          ? '1px solid rgba(62,207,160,0.4)'
                          : '1px solid var(--border)',
                      background: accepted === changes.length ? 'rgba(62,207,160,0.1)' : 'none',
                      color: accepted === changes.length ? 'var(--hl-teal)' : 'var(--text1)',
                      cursor: 'pointer'
                    }}
                  >
                    ✓ ทั้งหมด
                  </button>
                  <button
                    onClick={rejectAll}
                    style={{
                      fontSize: 9,
                      fontFamily: 'var(--font-mono)',
                      padding: '2px 7px',
                      borderRadius: 4,
                      border:
                        accepted === 0
                          ? '1px solid rgba(240,122,106,0.4)'
                          : '1px solid var(--border)',
                      background: accepted === 0 ? 'rgba(240,122,106,0.08)' : 'none',
                      color: accepted === 0 ? 'var(--hl-coral)' : 'var(--text1)',
                      cursor: 'pointer'
                    }}
                  >
                    ✗ ทั้งหมด
                  </button>
                </div>
              </div>

              {/* ↓ FIXED HEIGHT — always 220px, scroll inside */}
              <div
                style={{
                  height: 220,
                  overflowY: 'scroll',
                  overflowX: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  borderRadius: 4,
                  // subtle shadow so user knows it scrolls
                  boxShadow: 'inset 0 -10px 8px -8px rgba(0,0,0,0.3)'
                }}
              >
                {changes.map((ch) => (
                  <div
                    key={ch.id}
                    style={{
                      display: 'flex',
                      alignItems: 'stretch',
                      flexShrink: 0, // ← prevents items from shrinking inside flex container
                      background: ch.accepted ? 'rgba(62,207,160,0.06)' : 'var(--bg2)',
                      border: `1px solid ${ch.accepted ? 'rgba(62,207,160,0.22)' : 'var(--border)'}`,
                      borderRadius: 5,
                      overflow: 'hidden',
                      transition: 'all 0.1s'
                    }}
                  >
                    {/* Text content */}
                    <div
                      style={{
                        flex: 1,
                        padding: '5px 8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        minWidth: 0
                      }}
                    >
                      {ch.del.trim() && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <span
                            style={{
                              fontSize: 9,
                              color: 'var(--hl-coral)',
                              fontFamily: 'var(--font-mono)',
                              flexShrink: 0
                            }}
                          >
                            –
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--hl-coral)',
                              fontFamily: 'var(--font-ui)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              opacity: ch.accepted ? 0.35 : 0.8,
                              textDecoration: ch.accepted ? 'line-through' : 'none'
                            }}
                          >
                            {ch.del.trim()}
                          </span>
                        </div>
                      )}
                      {ch.ins.trim() && (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <span
                            style={{
                              fontSize: 9,
                              color: 'var(--hl-teal)',
                              fontFamily: 'var(--font-mono)',
                              flexShrink: 0
                            }}
                          >
                            +
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: 'var(--hl-teal)',
                              fontFamily: 'var(--font-ui)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontWeight: ch.accepted ? 500 : 400
                            }}
                          >
                            {ch.ins.trim()}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Accept/Reject toggle */}
                    <button
                      onClick={() => toggleSeg(ch.id)}
                      title={ch.accepted ? 'ปฏิเสธ (คืนต้นฉบับ)' : 'รับการเปลี่ยนนี้'}
                      style={{
                        width: 34,
                        flexShrink: 0,
                        border: 'none',
                        borderLeft: `1px solid ${ch.accepted ? 'rgba(62,207,160,0.22)' : 'var(--border)'}`,
                        background: ch.accepted ? 'rgba(62,207,160,0.12)' : 'var(--bg3)',
                        color: ch.accepted ? 'var(--hl-teal)' : 'var(--text2)',
                        cursor: 'pointer',
                        fontSize: 13,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.1s'
                      }}
                    >
                      {ch.accepted ? '✓' : '○'}
                    </button>
                  </div>
                ))}
                {/* bottom padding so last row isn't clipped by shadow */}
                <div style={{ height: 6, flexShrink: 0 }} />
              </div>
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* ════════════ HISTORY ZONE ════════════ */}
      {history.length > 0 && (
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 6,
            overflow: 'hidden',
            marginTop: 2
          }}
        >
          {/* Header */}
          <div
            onClick={() => setShowHistory((v) => !v)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 9px',
              background: showHistory ? 'var(--bg2)' : 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left' as const
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text2)"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <polyline points={showHistory ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
            </svg>
            <span
              style={{
                fontSize: 9,
                color: 'var(--text2)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.06em',
                flex: 1
              }}
            >
              ประวัติ ({history.length})
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                setHistory([])
                setShowHistory(false)
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--hl-coral)',
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                padding: '1px 4px'
              }}
            >
              ล้าง
            </button>
          </div>

          {/* History list */}
          {showHistory && (
            <div
              style={{
                maxHeight: 260,
                overflowY: 'auto',
                background: 'var(--bg0)',
                borderTop: '1px solid var(--border)'
              }}
            >
              {history.map((h) => (
                <div
                  key={h.id}
                  style={{
                    padding: '8px 9px',
                    borderBottom: '1px solid rgba(46,51,64,0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 5
                  }}
                >
                  {/* Meta row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span
                      style={{
                        fontSize: 8,
                        fontFamily: 'var(--font-mono)',
                        padding: '1px 5px',
                        borderRadius: 99,
                        background: 'var(--accent-dim)',
                        color: 'var(--accent)',
                        border: '1px solid rgba(91,138,240,0.3)',
                        flexShrink: 0
                      }}
                    >
                      {MODES[h.mode].emoji} {MODES[h.mode].label}
                    </span>
                    <span
                      style={{
                        fontSize: 8,
                        color: 'var(--text2)',
                        fontFamily: 'var(--font-mono)',
                        opacity: 0.55
                      }}
                    >
                      {new Date(h.ts).toLocaleTimeString('th-TH', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                  </div>
                  {/* Input preview */}
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--text2)',
                      fontFamily: 'var(--font-ui)',
                      lineHeight: 1.5,
                      opacity: 0.7
                    }}
                  >
                    {h.input.length > 80 ? h.input.slice(0, 80) + '…' : h.input}
                  </div>
                  {/* Result preview */}
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text0)',
                      fontFamily: 'var(--font-ui)',
                      lineHeight: 1.6
                    }}
                  >
                    {h.result.length > 120 ? h.result.slice(0, 120) + '…' : h.result}
                  </div>
                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                    {onPushToTgt && (
                      <button
                        onClick={() => onPushToTgt(h.input, h.result)}
                        title="แทรก result นี้กลับเข้า TGT"
                        style={{
                          fontSize: 10,
                          fontFamily: 'var(--font-mono)',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: 4,
                          border: '1px solid rgba(91,138,240,0.5)',
                          background: 'var(--accent)',
                          color: '#fff',
                          cursor: 'pointer'
                        }}
                      >
                        → TGT
                      </button>
                    )}
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(h.result)
                      }}
                      style={{
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        padding: '4px 9px',
                        borderRadius: 4,
                        border: '1px solid var(--border)',
                        background: 'none',
                        color: 'var(--text2)',
                        cursor: 'pointer'
                      }}
                    >
                      copy
                    </button>
                    <button
                      onClick={() => setInput(h.input)}
                      title="โหลด input นี้กลับมา"
                      style={{
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        padding: '4px 9px',
                        borderRadius: 4,
                        border: '1px solid var(--border)',
                        background: 'none',
                        color: 'var(--text2)',
                        cursor: 'pointer'
                      }}
                    >
                      โหลด input
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
