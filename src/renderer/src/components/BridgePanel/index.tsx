import { useState, useEffect, useCallback, type JSX, type CSSProperties } from 'react'

interface BridgePanelProps {
  onClose: () => void
}

type Status = {
  exeFound: boolean
  managed: boolean
  healthy: boolean
  url: string
  port: number
}

const ACCOUNT = 'main'
const DAY = 86_400_000

function expiryLabel(expiresAt: number | null): { text: string; color: string } {
  if (expiresAt === null) return { text: 'อ่านวันหมดอายุไม่ได้', color: 'var(--text2)' }
  const left = expiresAt - Date.now()
  const d = new Date(expiresAt)
  const date = `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (left <= 0) return { text: `หมดอายุแล้ว (${date})`, color: 'var(--hl-red, #f87171)' }
  const days = Math.floor(left / DAY)
  const color = left < 2 * DAY ? 'var(--hl-gold, #e0a82e)' : 'var(--hl-teal, #3ecfa0)'
  return { text: `เหลือ ${days} วัน (ถึง ${date})`, color }
}

export function BridgePanel({ onClose }: BridgePanelProps): JSX.Element {
  const [status, setStatus] = useState<Status | null>(null)
  const [accounts, setAccounts] = useState<_BridgeAccount[]>([])
  const [capture, setCapture] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [msgErr, setMsgErr] = useState(false)

  const refresh = useCallback(async () => {
    const [st, accs] = await Promise.all([
      window.electron.bridgeStatus(),
      window.electron.bridgeListAccounts()
    ])
    setStatus(st)
    setAccounts(accs)
  }, [])

  useEffect(() => {
    refresh().catch(() => setMsg('โหลดสถานะ bridge ไม่ได้'))
  }, [refresh])

  const note = useCallback((text: string, err = false) => {
    setMsg(text)
    setMsgErr(err)
  }, [])

  const handleStart = useCallback(async () => {
    setBusy(true)
    note('กำลังสตาร์ท bridge…')
    const res = await window.electron.bridgeStart()
    note(
      res.ok ? '✓ bridge รันแล้ว' : `สตาร์ทไม่ได้: ${res.reason ?? 'unknown'}`,
      !res.ok
    )
    await refresh()
    setBusy(false)
  }, [note, refresh])

  const handleStop = useCallback(async () => {
    setBusy(true)
    await window.electron.bridgeStop()
    note('หยุด bridge แล้ว')
    await refresh()
    setBusy(false)
  }, [note, refresh])

  const handleSave = useCallback(async () => {
    if (!capture.trim()) return
    setBusy(true)
    note('กำลังบันทึก capture…')
    const res = await window.electron.bridgeAddCapture(ACCOUNT, capture.trim())
    if (res.ok) {
      note('✓ บันทึก capture แล้ว' + (res.expiresAt ? '' : ''))
      setCapture('')
    } else if (res.failed && res.failed.length > 0) {
      note(`capture ไม่ผ่าน: ${res.failed.join(', ')}`, true)
    } else {
      note(`บันทึกไม่ได้: ${res.message ?? res.reason ?? 'unknown'}`, true)
    }
    await refresh()
    setBusy(false)
  }, [capture, note, refresh])

  const handleVerify = useCallback(async () => {
    setBusy(true)
    note('กำลังตรวจ capture กับ ChatGPT…')
    const res = await window.electron.bridgeVerifyAccount(ACCOUNT)
    note(res.ok ? '✓ capture ใช้งานได้' : 'capture ใช้ไม่ได้ — วาง capture ใหม่', !res.ok)
    setBusy(false)
  }, [note])

  const handleDelete = useCallback(async () => {
    setBusy(true)
    await window.electron.bridgeDeleteAccount(ACCOUNT)
    note('ลบ capture แล้ว')
    await refresh()
    setBusy(false)
  }, [note, refresh])

  const main = accounts.find((a) => a.name === ACCOUNT)
  const exp = main?.captureExists ? expiryLabel(main.expiresAt) : null

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <div style={s.header}>
          <span style={s.title}>Image Bridge / ChatGPT Account</span>
          <button style={s.closeBtn} onClick={onClose}>
            ✕
          </button>
        </div>

        <div style={s.body}>
          {/* Bridge status */}
          <div style={s.section}>
            <div style={s.label}>สถานะ Bridge</div>
            <div style={s.row}>
              <span
                style={{
                  ...s.dot,
                  background: status?.healthy
                    ? 'var(--hl-teal, #3ecfa0)'
                    : 'var(--text2)'
                }}
              />
              <span style={{ fontSize: 12, color: 'var(--text1)' }}>
                {status?.healthy ? 'กำลังทำงาน' : 'ไม่ได้รัน'}
                {status ? ` · ${status.url}` : ''}
              </span>
            </div>
            {status && !status.exeFound && (
              <div style={s.warn}>
                ไม่พบไฟล์ bridge (.exe) — ตั้ง `imageBridgePath` ใน config หรือสตาร์ท bridge เองที่ {status.url}
              </div>
            )}
            <div style={s.row}>
              <button style={s.btn} onClick={handleStart} disabled={busy || status?.healthy}>
                สตาร์ท
              </button>
              <button style={s.btnGhost} onClick={handleStop} disabled={busy || !status?.managed}>
                หยุด
              </button>
              <button style={s.btnGhost} onClick={() => refresh()} disabled={busy}>
                รีเฟรช
              </button>
            </div>
          </div>

          {/* Account capture */}
          <div style={s.section}>
            <div style={s.label}>Capture บัญชี ChatGPT</div>
            {main?.captureExists && exp ? (
              <div style={s.row}>
                <span style={{ fontSize: 12, color: 'var(--text1)' }}>มี capture แล้ว ·</span>
                <span style={{ fontSize: 12, color: exp.color, fontWeight: 600 }}>{exp.text}</span>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>ยังไม่มี capture</div>
            )}
            <div style={s.row}>
              <button
                style={s.btnGhost}
                onClick={handleVerify}
                disabled={busy || !main?.captureExists}
              >
                ตรวจสอบ
              </button>
              <button
                style={s.btnGhost}
                onClick={handleDelete}
                disabled={busy || !main?.captureExists}
              >
                ลบ
              </button>
            </div>
          </div>

          {/* Paste capture */}
          <div style={s.section}>
            <div style={s.label}>วาง capture ใหม่ (curl bash จาก DevTools)</div>
            <textarea
              style={s.textarea}
              value={capture}
              rows={6}
              onChange={(e) => setCapture(e.target.value)}
              placeholder="วาง curl ของ request backend-api/f/conversation ที่ copy เป็น 'Copy as cURL (bash)'"
              spellCheck={false}
            />
            <div style={s.hint}>
              chatgpt.com → DevTools → Network → ส่งข้อความ → คลิกขวา request `conversation` → Copy →
              Copy as cURL (bash) แล้ววางที่นี่
            </div>
            <button
              style={{ ...s.btn, opacity: busy || !capture.trim() ? 0.5 : 1 }}
              onClick={handleSave}
              disabled={busy || !capture.trim()}
            >
              บันทึก capture
            </button>
          </div>

          {msg && <div style={msgErr ? s.errorMsg : s.okMsg}>{msg}</div>}
        </div>
      </div>
    </div>
  )
}

const s: Record<string, CSSProperties> = {
  overlay: {
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
    width: 560,
    maxWidth: '95vw',
    maxHeight: '88vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 12px 40px rgba(0,0,0,0.5)'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)'
  },
  title: { fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--accent)' },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text2)',
    fontSize: 14,
    cursor: 'pointer',
    padding: '2px 6px'
  },
  body: { overflowY: 'auto', flex: 1, padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 14 },
  section: { display: 'flex', flexDirection: 'column', gap: 8 },
  label: {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text2)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  row: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dot: { width: 9, height: 9, borderRadius: 99, flexShrink: 0 },
  btn: {
    background: 'var(--accent)',
    border: 'none',
    color: '#fff',
    fontSize: 12,
    padding: '5px 14px',
    borderRadius: 4,
    cursor: 'pointer',
    fontWeight: 500
  },
  btnGhost: {
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    color: 'var(--text1)',
    fontSize: 12,
    padding: '5px 12px',
    borderRadius: 4,
    cursor: 'pointer'
  },
  textarea: {
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    color: 'var(--text0)',
    fontSize: 11,
    padding: '8px 10px',
    borderRadius: 4,
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'var(--font-mono)',
    width: '100%'
  },
  hint: { fontSize: 11, color: 'var(--text3, var(--text2))', lineHeight: 1.5 },
  warn: {
    fontSize: 11,
    color: 'var(--hl-gold, #e0a82e)',
    background: 'rgba(224,168,46,0.08)',
    border: '1px solid rgba(224,168,46,0.2)',
    borderRadius: 4,
    padding: '5px 8px'
  },
  okMsg: {
    fontSize: 12,
    color: 'var(--hl-teal, #3ecfa0)',
    background: 'rgba(62,207,160,0.08)',
    border: '1px solid rgba(62,207,160,0.2)',
    borderRadius: 4,
    padding: '6px 10px'
  },
  errorMsg: {
    fontSize: 12,
    color: 'var(--hl-red, #f87171)',
    background: 'rgba(248,113,113,0.08)',
    border: '1px solid rgba(248,113,113,0.2)',
    borderRadius: 4,
    padding: '6px 10px'
  }
}
