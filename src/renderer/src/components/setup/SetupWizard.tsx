/**
 * SetupWizard — shown on first run when no config.json exists
 * 2 steps: Folder → Glossary JSON files
 */
import { useState, type CSSProperties, type JSX } from 'react'
import { IcoFolder, IcoJson, IcoCheck, IcoX } from '../common/icons'
import type { SaveConfigPayload } from '../../types'

export type SetupConfig = Required<Pick<SaveConfigPayload, 'jsonPaths'>> &
  Pick<SaveConfigPayload, 'folderPath'>

interface SetupWizardProps {
  onDone: (cfg: SetupConfig) => void
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepDot({ n, active, done }: { n: number; active: boolean; done: boolean }): JSX.Element {
  return (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12,
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        flexShrink: 0,
        background: done ? 'var(--hl-teal)' : active ? 'var(--accent)' : 'var(--bg3)',
        color: done || active ? '#fff' : 'var(--text2)',
        border: `1px solid ${done ? 'var(--hl-teal)' : active ? 'var(--accent)' : 'var(--border)'}`,
        transition: 'all 0.2s'
      }}
    >
      {done ? <IcoCheck size={18} stroke="currentColor" /> : n}
    </div>
  )
}

// ── BrowseInput ───────────────────────────────────────────────────────────────
function BrowseInput({
  value,
  placeholder,
  onChange,
  onBrowse,
  accent = false
}: {
  value: string
  placeholder: string
  onChange: (v: string) => void
  onBrowse: () => void
  accent?: boolean
}): JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        style={{
          flex: 1,
          background: 'var(--bg2)',
          border: `1px solid ${accent && value ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 6,
          color: 'var(--text0)',
          fontSize: 12,
          padding: '7px 10px',
          outline: 'none',
          fontFamily: 'var(--font-mono)',
          transition: 'border-color 0.15s'
        }}
      />
      <button onClick={onBrowse} style={s.browseBtn}>
        Browse…
      </button>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function SetupWizard({ onDone }: SetupWizardProps): JSX.Element {
  const [step, setStep] = useState(0)

  // Step 0 — Folder
  const [folderPath, setFolderPath] = useState('')

  // Step 1 — JSON files
  const [jsonPaths, setJsonPaths] = useState<string[]>([])

  const steps = [
    { label: 'โฟลเดอร์', icon: <IcoFolder size={18} stroke="currentColor" /> },
    { label: 'Glossary', icon: <IcoJson size={18} stroke="currentColor" /> }
  ]

  // ── Handlers ────────────────────────────────────────────────────────────────
  const browseFolder = async (): Promise<void> => {
    const p = await window.electron.openFolder()
    if (p) setFolderPath(p)
  }

  const browseJson = async (): Promise<void> => {
    const p = await window.electron.openFile([{ name: 'JSON Glossary', extensions: ['json'] }])
    if (p && !jsonPaths.includes(p)) setJsonPaths((prev) => [...prev, p])
  }

  const handleFinish = async (): Promise<void> => {
    const cfg: SaveConfigPayload = {
      folderPath: folderPath.trim() || undefined,
      jsonPaths: jsonPaths.filter(Boolean)
    }
    // Use patch to preserve other config fields (aiApiKey, ttsApiKey, etc.)
    await window.electron.saveConfigPatch(cfg)
    onDone({
      folderPath: cfg.folderPath ?? null,
      jsonPaths: cfg.jsonPaths ?? []
    })
  }

  // ── Step content ─────────────────────────────────────────────────────────────
  const renderStep = (): JSX.Element => {
    if (step === 0)
      return (
        <div style={s.stepBody}>
          <div style={s.stepIcon}>
            <IcoFolder size={18} stroke="currentColor" />
          </div>
          <div style={s.stepTitle}>เลือกโฟลเดอร์โปรเจกต์</div>
          <div style={s.stepDesc}>
            โฟลเดอร์หลักที่เก็บไฟล์ .txt และ glossary.json
            <br />
            <span style={{ color: 'var(--text2)' }}>ข้ามได้ — เลือกทีหลังจาก Sidebar ก็ได้</span>
          </div>
          <BrowseInput
            value={folderPath}
            placeholder="D:/novels/my-project"
            onChange={setFolderPath}
            onBrowse={browseFolder}
            accent
          />
          {folderPath && (
            <div style={s.confirmChip}>
              <IcoCheck size={18} stroke="currentColor" />{' '}
              <span>{folderPath.split(/[\\/]/).pop()}</span>
            </div>
          )}
        </div>
      )

    if (step === 1)
      return (
        <div style={s.stepBody}>
          <div style={s.stepIcon}>
            <IcoJson size={18} stroke="currentColor" />
          </div>
          <div style={s.stepTitle}>Glossary JSON</div>
          <div style={s.stepDesc}>
            ไฟล์ .json ที่ใช้เป็น glossary หลัก เพิ่มได้หลายไฟล์
            <br />
            <span style={{ color: 'var(--text2)' }}>ข้ามได้ — เปิดทีหลังจากเมนูก็ได้</span>
          </div>
          <button onClick={browseJson} style={s.addFileBtn}>
            + เพิ่มไฟล์ JSON
          </button>
          {jsonPaths.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
              {jsonPaths.map((p, i) => (
                <div key={i} style={s.fileChip}>
                  <span style={{ color: 'var(--hl-gold)', display: 'flex', flexShrink: 0 }}>
                    <IcoJson size={18} stroke="currentColor" />
                  </span>
                  <span style={s.fileChipName}>{p.split(/[\\/]/).pop()}</span>
                  <span style={s.fileChipPath}>{p}</span>
                  <button
                    onClick={() => setJsonPaths((prev) => prev.filter((_, j) => j !== i))}
                    style={s.removeBtn}
                  >
                    <IcoX size={12} stroke="currentColor" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )

    return <div />
  }

  return (
    <div style={s.backdrop}>
      <div style={s.modal}>
        {/* Header */}
        <div style={s.header}>
          <span style={s.logo}>TL/EDITOR</span>
          <span style={s.headerSub}>Setup · ครั้งแรกครั้งเดียว</span>
        </div>

        {/* Step indicators */}
        <div style={s.stepBar}>
          {steps.map((st, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StepDot n={i + 1} active={step === i} done={step > i} />
              <span
                style={{
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: step === i ? 'var(--text0)' : step > i ? 'var(--hl-teal)' : 'var(--text2)',
                  fontWeight: step === i ? 600 : 400
                }}
              >
                {st.label}
              </span>
              {i < steps.length - 1 && (
                <div
                  style={{
                    width: 24,
                    height: 1,
                    background: step > i ? 'var(--hl-teal)' : 'var(--border)',
                    margin: '0 4px',
                    transition: 'background 0.2s'
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div style={s.content}>{renderStep()}</div>

        {/* Footer */}
        <div style={s.footer}>
          <button
            style={{
              ...s.btnSecondary,
              opacity: step === 0 ? 0 : 1,
              pointerEvents: step === 0 ? 'none' : 'auto'
            }}
            onClick={() => setStep((v) => v - 1)}
          >
            ← ย้อนกลับ
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step < steps.length - 1 ? (
              <>
                <button style={s.btnSkip} onClick={() => setStep((v) => v + 1)}>
                  ข้าม
                </button>
                <button style={s.btnPrimary} onClick={() => setStep((v) => v + 1)}>
                  ถัดไป →
                </button>
              </>
            ) : (
              <>
                <button style={s.btnSkip} onClick={handleFinish}>
                  ข้ามและเริ่มเลย
                </button>
                <button style={s.btnPrimary} onClick={handleFinish}>
                  <IcoCheck size={18} stroke="currentColor" /> &nbsp;เสร็จสิ้น
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s: Record<string, CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: '#0e0f12',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999
  },
  modal: {
    background: 'var(--bg1)',
    border: 'none',
    borderRadius: 0,
    width: '100%',
    height: '100%',
    maxWidth: 600,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  header: {
    padding: '18px 24px 14px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg2)',
    display: 'flex',
    alignItems: 'baseline',
    gap: 12
  },
  logo: {
    fontFamily: 'var(--font-mono)',
    fontSize: 14,
    fontWeight: 700,
    color: 'var(--accent)',
    letterSpacing: '0.08em'
  },
  headerSub: { fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--font-mono)' },
  stepBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 24px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg2)'
  },
  content: { padding: '24px', flex: 1, minHeight: 280 },
  stepBody: { display: 'flex', flexDirection: 'column', gap: 12 },
  stepIcon: { color: 'var(--accent)', display: 'flex', opacity: 0.8 },
  stepTitle: { fontSize: 17, fontWeight: 600, color: 'var(--text0)' },
  stepDesc: { fontSize: 12, color: 'var(--text1)', lineHeight: 1.7 },
  label: {
    fontSize: 10,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginTop: 4
  },
  confirmChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    background: 'rgba(62,207,160,0.1)',
    border: '1px solid rgba(62,207,160,0.3)',
    borderRadius: 6,
    color: 'var(--hl-teal)',
    fontSize: 12,
    fontFamily: 'var(--font-mono)'
  },
  addFileBtn: {
    background: 'var(--accent-dim)',
    border: '1px solid rgba(91,138,240,0.35)',
    color: 'var(--accent)',
    fontSize: 12,
    padding: '7px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    textAlign: 'left'
  },
  fileChip: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    background: 'var(--bg2)',
    border: '1px solid var(--border)',
    borderRadius: 6
  },
  fileChipName: {
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    color: 'var(--hl-gold)',
    flexShrink: 0,
    maxWidth: 140,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  fileChipPath: {
    fontSize: 10,
    color: 'var(--text2)',
    fontFamily: 'var(--font-mono)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap'
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text2)',
    display: 'flex',
    alignItems: 'center',
    padding: '1px 3px',
    flexShrink: 0
  },
  browseBtn: {
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    color: 'var(--text1)',
    fontSize: 11,
    padding: '7px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    flexShrink: 0
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 24px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg2)'
  },
  btnPrimary: {
    background: 'var(--accent)',
    border: 'none',
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    padding: '8px 20px',
    borderRadius: 8,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center'
  },
  btnSecondary: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text1)',
    fontSize: 12,
    padding: '7px 16px',
    borderRadius: 7,
    cursor: 'pointer'
  },
  btnSkip: {
    background: 'none',
    border: 'none',
    color: 'var(--text2)',
    fontSize: 12,
    padding: '7px 10px',
    cursor: 'pointer'
  }
}
