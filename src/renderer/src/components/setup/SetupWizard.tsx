/**
 * SetupWizard — shown on first run when no config.json exists
 * 3 steps: Folder → Glossary JSON files → Python (optional)
 */
import { useState, JSX } from 'react'
import { IcoFolder, IcoJson, IcoPython, IcoCheck, IcoX } from '../common/icons'

export interface SetupConfig {
  folderPath: string | null
  jsonPaths: string[]
  pythonExe: string
  pythonScript: string
  pythonCwd: string
}

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

  // Step 2 — Python (optional)
  const [pythonExe, setPythonExe] = useState('')
  const [pythonScripts, setPythonScripts] = useState<string[]>([])
  const [pythonCwd, setPythonCwd] = useState('')
  const [detectedPythons, setDetectedPythons] = useState<{ label: string; path: string }[] | null>(
    null
  )
  const [detecting, setDetecting] = useState(false)

  const steps = [
    { label: 'โฟลเดอร์', icon: <IcoFolder size={18} stroke="currentColor" /> },
    { label: 'Glossary', icon: <IcoJson size={18} stroke="currentColor" /> },
    { label: 'Python', icon: <IcoPython size={18} stroke="currentColor" /> }
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

  const detectPython = async (): Promise<void> => {
    setDetecting(true)
    setDetectedPythons(null)
    try {
      const list = await window.electron.detectPython()
      setDetectedPythons(list)
    } finally {
      setDetecting(false)
    }
  }

  const browsePythonExe = async (): Promise<void> => {
    const p = await window.electron.openFile([
      { name: 'Python Executable', extensions: ['exe', '*'] }
    ])
    if (p) selectInterpreter(p)
  }

  const [pipStatus, setPipStatus] = useState<'idle' | 'installing' | 'done' | 'error'>('idle')
  const [pipLog, setPipLog] = useState('')

  const REQUIRED_PACKAGES = ['edge-tts', 'python-dotenv', 'sympy']

  const installPackages = async (exePath: string): Promise<void> => {
    setPipStatus('installing')
    setPipLog('')
    try {
      const result = await window.electron.installPythonPackages(exePath, REQUIRED_PACKAGES)
      if (result.exitCode === 0) {
        setPipStatus('done')
        setPipLog('ติดตั้งสำเร็จ')
      } else {
        setPipStatus('error')
        setPipLog(result.stderr || result.stdout || 'ติดตั้งล้มเหลว')
      }
    } catch (e) {
      setPipStatus('error')
      setPipLog(String(e))
    }
  }

  const selectInterpreter = (path: string): void => {
    setPythonExe(path)
    setDetectedPythons(null)
    installPackages(path)
  }

  const browsePythonScript = async (): Promise<void> => {
    const p = await window.electron.openFile([{ name: 'Python Script', extensions: ['py'] }])
    if (p && !pythonScripts.includes(p)) setPythonScripts((prev) => [...prev, p])
  }

  const browsePythonCwd = async (): Promise<void> => {
    const p = await window.electron.openFolder()
    if (p) setPythonCwd(p)
  }

  const handleFinish = async (): Promise<void> => {
    const cfg = {
      folderPath: folderPath.trim() || undefined,
      jsonPaths: jsonPaths.filter(Boolean),
      pythonExe: pythonExe.trim() || undefined,
      pythonScript: pythonScripts.filter(Boolean).join(',') || undefined,
      pythonCwd: pythonCwd.trim() || undefined
    } as const
    // Use patch to preserve other config fields (aiApiKey, ttsApiKey, etc.)
    await window.electron.saveConfigPatch(cfg)
    onDone({
      folderPath: cfg.folderPath ?? null,
      jsonPaths: cfg.jsonPaths,
      pythonExe: cfg.pythonExe ?? '',
      pythonScript: cfg.pythonScript ?? '',
      pythonCwd: cfg.pythonCwd ?? ''
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

    // step === 2
    return (
      <div style={s.stepBody}>
        <div style={s.stepIcon}>
          <IcoPython size={18} stroke="currentColor" />
        </div>
        <div style={s.stepTitle}>
          Python Script{' '}
          <span style={{ color: 'var(--text2)', fontWeight: 400, fontSize: 12 }}>(optional)</span>
        </div>
        <div style={s.stepDesc}>ตั้งค่าสำหรับ Terminal Panel — ข้ามได้ทั้งหมด</div>

        <label style={s.label}>Python Executable</label>

        {/* Selected interpreter chip */}
        {pythonExe && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ ...s.fileChip, marginBottom: 0 }}>
              <span style={{ color: 'var(--hl-teal)', display: 'flex', flexShrink: 0 }}>
                <IcoPython size={18} stroke="currentColor" />
              </span>
              <span style={s.fileChipName}>{pythonExe.split(/[\\/]/).pop()}</span>
              <span style={s.fileChipPath}>{pythonExe}</span>
              <button
                onClick={() => {
                  setPythonExe('')
                  setDetectedPythons(null)
                  setPipStatus('idle')
                  setPipLog('')
                }}
                style={s.removeBtn}
              >
                <IcoX size={12} stroke="currentColor" />
              </button>
            </div>

            {/* pip install status */}
            {pipStatus === 'installing' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  borderRadius: 6
                }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--hl-teal)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--hl-teal)',
                      fontFamily: 'var(--font-mono)'
                    }}
                  >
                    กำลังติดตั้ง packages…
                  </div>
                  <div
                    style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}
                  >
                    {REQUIRED_PACKAGES.join(', ')}
                  </div>
                </div>
              </div>
            )}
            {pipStatus === 'done' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  background: 'rgba(62,207,160,0.08)',
                  border: '1px solid rgba(62,207,160,0.3)',
                  borderRadius: 6
                }}
              >
                <IcoCheck size={18} stroke="currentColor" />
                <div
                  style={{ fontSize: 11, color: 'var(--hl-teal)', fontFamily: 'var(--font-mono)' }}
                >
                  ติดตั้ง packages สำเร็จ
                </div>
              </div>
            )}
            {pipStatus === 'error' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  padding: '8px 10px',
                  background: 'rgba(240,122,106,0.08)',
                  border: '1px solid rgba(240,122,106,0.3)',
                  borderRadius: 6
                }}
              >
                <div
                  style={{ fontSize: 11, color: 'var(--hl-coral)', fontFamily: 'var(--font-mono)' }}
                >
                  ⚠ ติดตั้งล้มเหลว — ลองรันใน terminal เอง:
                </div>
                <code
                  style={{
                    fontSize: 10,
                    color: 'var(--text2)',
                    fontFamily: 'var(--font-mono)',
                    wordBreak: 'break-all'
                  }}
                >
                  pip install {REQUIRED_PACKAGES.join(' ')}
                </code>
                {pipLog && (
                  <div
                    style={{
                      fontSize: 9,
                      color: 'var(--text2)',
                      fontFamily: 'var(--font-mono)',
                      opacity: 0.6,
                      maxHeight: 60,
                      overflowY: 'auto'
                    }}
                  >
                    {pipLog}
                  </div>
                )}
                <button
                  onClick={() => installPackages(pythonExe)}
                  style={{
                    ...s.addFileBtn,
                    fontSize: 10,
                    padding: '4px 10px',
                    alignSelf: 'flex-start'
                  }}
                >
                  ลองใหม่
                </button>
              </div>
            )}
          </div>
        )}

        {/* Detect + Browse buttons */}
        {!pythonExe && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={detectPython}
              disabled={detecting}
              style={{
                ...s.addFileBtn,
                flex: 1,
                textAlign: 'center',
                opacity: detecting ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              {detecting ? 'กำลังค้นหา…' : 'ค้นหา Python อัตโนมัติ'}
            </button>
            <button onClick={browsePythonExe} style={s.browseBtn}>
              Browse…
            </button>
          </div>
        )}

        {/* Detected list */}
        {detectedPythons !== null && !pythonExe && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {detectedPythons.length === 0 ? (
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--hl-coral)',
                  fontFamily: 'var(--font-mono)',
                  padding: '6px 2px'
                }}
              >
                ไม่พบ Python — ลอง Browse… แทน
              </div>
            ) : (
              detectedPythons.map((py, i) => (
                <button
                  key={i}
                  onClick={() => selectInterpreter(py.path)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 10px',
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                    width: '100%',
                    transition: 'border-color 0.1s'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--accent)')}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
                >
                  <span style={{ color: 'var(--hl-teal)', display: 'flex', flexShrink: 0 }}>
                    <IcoPython size={18} stroke="currentColor" />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text0)',
                        fontFamily: 'var(--font-mono)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {py.label.split('—')[0].trim()}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--text2)',
                        fontFamily: 'var(--font-mono)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {py.path}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        <label style={s.label}>Script Path</label>
        <button onClick={browsePythonScript} style={s.addFileBtn}>
          + เพิ่ม Script
        </button>
        {pythonScripts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {pythonScripts.map((p, i) => (
              <div key={i} style={s.fileChip}>
                <span style={{ color: 'var(--hl-teal)', display: 'flex', flexShrink: 0 }}>
                  <IcoPython size={18} stroke="currentColor" />
                </span>
                <span style={s.fileChipName}>{p.split(/[\\/]/).pop()}</span>
                <span style={s.fileChipPath}>{p}</span>
                <button
                  onClick={() => setPythonScripts((prev) => prev.filter((_, j) => j !== i))}
                  style={s.removeBtn}
                >
                  <IcoX size={12} stroke="currentColor" />
                </button>
              </div>
            ))}
          </div>
        )}

        <label style={s.label}>Working Directory</label>
        <BrowseInput
          value={pythonCwd}
          placeholder="D:/scripts"
          onChange={setPythonCwd}
          onBrowse={browsePythonCwd}
        />
      </div>
    )
  }

  return (
    <div style={s.backdrop}>
      <div style={s.modal}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
            {step < 2 ? (
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
const s: Record<string, React.CSSProperties> = {
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
