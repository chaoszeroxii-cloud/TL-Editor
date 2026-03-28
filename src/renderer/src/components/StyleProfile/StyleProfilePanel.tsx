// ─── StyleProfilePanel.tsx ────────────────────────────────────────────────────
// UI panel for viewing/managing the style profile.
// Follows the same visual language as GlossaryPanel and AITranslatePanel.

import { useState, memo, useMemo, JSX } from 'react'
import type { StyleProfile, CorrectionTag, StylePattern } from './types'

// ── Tag metadata ──────────────────────────────────────────────────────────────

const TAG_META: Record<CorrectionTag, { label: string; color: string; bg: string }> = {
  shorten: { label: 'ย่อสั้น', color: 'var(--hl-teal)', bg: 'var(--hl-teal-bg)' },
  expand: { label: 'ขยายความ', color: 'var(--hl-gold)', bg: 'var(--hl-gold-bg)' },
  'formality-up': { label: 'เป็นทางการขึ้น', color: 'var(--accent)', bg: 'var(--accent-dim)' },
  'formality-down': { label: 'ลดทางการ', color: 'var(--hl-coral)', bg: 'var(--hl-coral-bg)' },
  'word-swap': { label: 'เปลี่ยนคำ', color: 'var(--hl-gold)', bg: 'var(--hl-gold-bg)' },
  restructure: { label: 'เรียงใหม่', color: 'var(--accent)', bg: 'var(--accent-dim)' },
  punctuation: { label: 'วรรคตอน', color: 'var(--text2)', bg: 'var(--bg3)' },
  nuance: { label: 'ละเอียดอ่อน', color: 'var(--hl-teal)', bg: 'var(--hl-teal-bg)' },
  'remove-filler': { label: 'ตัดคำซ้ำซ้อน', color: 'var(--hl-coral)', bg: 'var(--hl-coral-bg)' },
  naturalness: { label: 'เป็นธรรมชาติ', color: 'var(--hl-teal)', bg: 'var(--hl-teal-bg)' }
}

// ── Sub-components ────────────────────────────────────────────────────────────

const TagChip = memo(function TagChip({
  tag,
  size = 'sm'
}: {
  tag: CorrectionTag
  size?: 'sm' | 'xs'
}) {
  const meta = TAG_META[tag] ?? { label: tag, color: 'var(--text2)', bg: 'var(--bg3)' }
  return (
    <span
      style={{
        fontSize: size === 'xs' ? 9 : 10,
        padding: size === 'xs' ? '1px 5px' : '2px 7px',
        borderRadius: 99,
        background: meta.bg,
        color: meta.color,
        fontFamily: 'var(--font-mono)',
        fontWeight: 600,
        flexShrink: 0,
        border: `1px solid ${meta.color}40`
      }}
    >
      {meta.label}
    </span>
  )
})

// ── Frequency bar ─────────────────────────────────────────────────────────────

const FreqBar = memo(function FreqBar({ value, color }: { value: number; color: string }) {
  return (
    <div
      style={{ flex: 1, height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}
    >
      <div
        style={{
          height: '100%',
          width: `${Math.round(value * 100)}%`,
          background: color,
          borderRadius: 2,
          transition: 'width 0.4s ease'
        }}
      />
    </div>
  )
})

// ── Pattern list ──────────────────────────────────────────────────────────────

const PatternList = memo(function PatternList({ patterns }: { patterns: StylePattern[] }) {
  const [expanded, setExpanded] = useState<CorrectionTag | null>(null)

  if (patterns.length === 0) {
    return (
      <div
        style={{
          padding: '12px 10px',
          color: 'var(--text2)',
          fontSize: 11,
          fontStyle: 'italic',
          textAlign: 'center'
        }}
      >
        ยังไม่มี pattern — เพิ่ม corrections ก่อน
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {patterns.map((p) => {
        const meta = TAG_META[p.tag] ?? { label: p.tag, color: 'var(--text2)', bg: 'var(--bg3)' }
        const isOpen = expanded === p.tag
        return (
          <div key={p.tag} style={{ borderBottom: '1px solid var(--border)' }}>
            <button
              onClick={() => setExpanded(isOpen ? null : p.tag)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '6px 10px',
                background: isOpen ? 'var(--bg2)' : 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left' as const
              }}
            >
              <TagChip tag={p.tag} size="xs" />
              <FreqBar value={p.frequency} color={meta.color} />
              <span
                style={{
                  fontSize: 10,
                  color: 'var(--text2)',
                  fontFamily: 'var(--font-mono)',
                  flexShrink: 0,
                  minWidth: 30,
                  textAlign: 'right' as const
                }}
              >
                {Math.round(p.frequency * 100)}%
              </span>
              <span style={{ fontSize: 9, color: 'var(--text2)', flexShrink: 0 }}>
                {isOpen ? '▲' : '▼'}
              </span>
            </button>

            {isOpen && p.examples.length > 0 && (
              <div style={{ padding: '4px 10px 8px', background: 'var(--bg0)' }}>
                {p.examples.map((ex, i) => (
                  <div
                    key={i}
                    style={{
                      marginBottom: 6,
                      padding: '6px 8px',
                      borderRadius: 5,
                      border: '1px solid var(--border)',
                      background: 'var(--bg2)'
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--hl-coral)',
                        fontFamily: 'var(--font-mono)',
                        marginBottom: 3,
                        opacity: 0.8
                      }}
                    >
                      ✕ {ex.before.slice(0, 120)}
                      {ex.before.length > 120 ? '…' : ''}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: 'var(--hl-teal)',
                        fontFamily: 'var(--font-mono)'
                      }}
                    >
                      ✓ {ex.after.slice(0, 120)}
                      {ex.after.length > 120 ? '…' : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
})

// ── Correction log ────────────────────────────────────────────────────────────

const CorrectionLog = memo(function CorrectionLog({
  corrections,
  onClear
}: {
  corrections: StyleProfile['corrections']
  onClear: () => void
}) {
  const recent = useMemo(() => [...corrections].reverse().slice(0, 50), [corrections])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '5px 10px',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <span
          style={{
            fontSize: 9,
            color: 'var(--text2)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.07em',
            textTransform: 'uppercase' as const
          }}
        >
          Corrections ({corrections.length})
        </span>
        {corrections.length > 0 && (
          <button
            onClick={onClear}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--hl-coral)',
              fontSize: 9,
              fontFamily: 'var(--font-mono)'
            }}
          >
            ล้าง
          </button>
        )}
      </div>
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {recent.length === 0 && (
          <div
            style={{
              padding: '16px 10px',
              color: 'var(--text2)',
              fontSize: 11,
              textAlign: 'center' as const,
              fontStyle: 'italic'
            }}
          >
            ยังไม่มี corrections
            <br />
            <span style={{ fontSize: 10, opacity: 0.6 }}>
              แก้ไขการแปลของ AI แล้วระบบจะจับอัตโนมัติ
            </span>
          </div>
        )}
        {recent.map((c) => (
          <div
            key={c.id}
            style={{
              padding: '6px 10px',
              borderBottom: '1px solid rgba(46,51,64,0.4)'
            }}
          >
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const, marginBottom: 4 }}>
              {c.tags.map((tag) => (
                <TagChip key={tag} tag={tag} size="xs" />
              ))}
              <span
                style={{
                  fontSize: 9,
                  color: 'var(--text2)',
                  fontFamily: 'var(--font-mono)',
                  marginLeft: 'auto'
                }}
              >
                {Math.round((1 - c.similarity) * 100)}% เปลี่ยน
              </span>
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--hl-coral)',
                fontFamily: 'var(--font-mono)',
                opacity: 0.75,
                marginBottom: 2,
                lineHeight: 1.4,
                wordBreak: 'break-word' as const
              }}
            >
              {c.before.slice(0, 100)}
              {c.before.length > 100 ? '…' : ''}
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--hl-teal)',
                fontFamily: 'var(--font-mono)',
                lineHeight: 1.4,
                wordBreak: 'break-word' as const
              }}
            >
              {c.after.slice(0, 100)}
              {c.after.length > 100 ? '…' : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
})

// ── Style Guide viewer ────────────────────────────────────────────────────────

const StyleGuideView = memo(function StyleGuideView({
  styleGuide,
  promptSnippet
}: {
  styleGuide: string
  promptSnippet: string
}) {
  const [copied, setCopied] = useState(false)

  if (!styleGuide) {
    return (
      <div
        style={{
          padding: '16px 10px',
          color: 'var(--text2)',
          fontSize: 11,
          textAlign: 'center' as const,
          fontStyle: 'italic'
        }}
      >
        ยังไม่มี Style Guide
        <br />
        <span style={{ fontSize: 10, opacity: 0.6 }}>
          กด &quot;Analyze&quot; หลังสะสม corrections เพียงพอ
        </span>
      </div>
    )
  }

  return (
    <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {promptSnippet && (
        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--accent)',
            borderRadius: 7,
            padding: '8px 10px'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 6
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: 'var(--accent)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.07em',
                textTransform: 'uppercase' as const
              }}
            >
              Prompt Snippet (inject → AI Translate)
            </span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(promptSnippet)
                setCopied(true)
                setTimeout(() => setCopied(false), 1500)
              }}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: copied ? 'var(--hl-teal)' : 'var(--text2)',
                fontSize: 9,
                fontFamily: 'var(--font-mono)'
              }}
            >
              {copied ? '✓ copied' : 'copy'}
            </button>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: 'var(--text0)',
              fontFamily: 'var(--font-mono)',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap' as const,
              wordBreak: 'break-word' as const
            }}
          >
            {promptSnippet}
          </p>
        </div>
      )}

      <div>
        <div
          style={{
            fontSize: 9,
            color: 'var(--text2)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.07em',
            textTransform: 'uppercase' as const,
            marginBottom: 6
          }}
        >
          Style Analysis
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: 'var(--text1)',
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap' as const,
            wordBreak: 'break-word' as const
          }}
        >
          {styleGuide}
        </p>
      </div>
    </div>
  )
})

// ── Main panel ────────────────────────────────────────────────────────────────

type PanelTab = 'guide' | 'patterns' | 'log'

export interface StyleProfilePanelProps {
  profile: StyleProfile | null
  isAnalyzing: boolean
  analyzeError: string | null
  apiKey: string
  onAnalyze: () => void
  onClearCorrections: () => void
  onResetProfile: () => void
  onClose: () => void
}

export const StyleProfilePanel = memo(function StyleProfilePanel({
  profile,
  isAnalyzing,
  analyzeError,
  apiKey,
  onAnalyze,
  onClearCorrections,
  onResetProfile,
  onClose
}: StyleProfilePanelProps): JSX.Element {
  const [tab, setTab] = useState<PanelTab>('guide')

  const stats = profile?.stats
  const corrections = profile?.corrections ?? []
  const patterns = profile?.patterns ?? []
  const canAnalyze = corrections.length >= 3 && !isAnalyzing && !!apiKey.trim()
  const isDirty = profile?.isDirty ?? false

  const tabStyle = (t: PanelTab): React.CSSProperties => ({
    flex: 1,
    padding: '5px 0',
    background: 'none',
    border: 'none',
    borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
    color: tab === t ? 'var(--accent)' : 'var(--text2)',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    letterSpacing: '0.05em',
    cursor: 'pointer',
    fontWeight: tab === t ? 600 : 400,
    marginBottom: -1,
    transition: 'color 0.1s'
  })

  return (
    <div
      style={{
        width: 280,
        background: 'var(--bg1)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 10px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg2)',
          flexShrink: 0
        }}
      >
        <span style={{ fontSize: 13 }}>✦</span>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text0)',
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.04em',
            flex: 1
          }}
        >
          Style Profile
        </span>
        {isDirty && (
          <span
            style={{
              fontSize: 9,
              color: 'var(--hl-gold)',
              fontFamily: 'var(--font-mono)',
              background: 'var(--hl-gold-bg)',
              border: '1px solid var(--hl-gold-border)',
              padding: '1px 6px',
              borderRadius: 99
            }}
          >
            {corrections.length} new
          </span>
        )}
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text2)',
            fontSize: 12,
            padding: '2px 4px'
          }}
        >
          ✕
        </button>
      </div>

      {/* Stats bar */}
      {stats && stats.totalCorrections > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 0,
            background: 'var(--bg0)',
            borderBottom: '1px solid var(--border)',
            flexShrink: 0
          }}
        >
          {[
            { label: 'corrections', value: stats.totalCorrections },
            { label: 'avg change', value: `${Math.round((1 - stats.avgSimilarity) * 100)}%` },
            { label: 'patterns', value: patterns.length }
          ].map((item, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                padding: '6px 0',
                textAlign: 'center' as const,
                borderRight: i < 2 ? '1px solid var(--border)' : 'none'
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: 'var(--accent)',
                  fontFamily: 'var(--font-mono)',
                  fontWeight: 700
                }}
              >
                {item.value}
              </div>
              <div
                style={{
                  fontSize: 8,
                  color: 'var(--text2)',
                  fontFamily: 'var(--font-mono)',
                  marginTop: 1
                }}
              >
                {item.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Analyze button */}
      <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {analyzeError && (
          <div
            style={{
              fontSize: 10,
              color: 'var(--hl-coral)',
              fontFamily: 'var(--font-mono)',
              marginBottom: 6,
              padding: '4px 7px',
              background: 'rgba(240,122,106,0.1)',
              borderRadius: 5,
              border: '1px solid rgba(240,122,106,0.3)'
            }}
          >
            {analyzeError}
          </div>
        )}
        <button
          onClick={onAnalyze}
          disabled={!canAnalyze}
          style={{
            width: '100%',
            background: canAnalyze ? 'var(--accent)' : 'var(--bg3)',
            border: 'none',
            color: canAnalyze ? '#fff' : 'var(--text2)',
            fontSize: 11,
            fontWeight: 600,
            padding: '7px 14px',
            borderRadius: 6,
            cursor: canAnalyze ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: canAnalyze ? 1 : 0.5,
            transition: 'all 0.15s'
          }}
        >
          {isAnalyzing ? (
            <>
              <svg
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              กำลังวิเคราะห์…
            </>
          ) : (
            <>
              ✦ Analyze Style ({corrections.length}
              {corrections.length < 3 ? '/3 min' : ' ✓'})
            </>
          )}
        </button>
        {!apiKey.trim() && (
          <div
            style={{
              fontSize: 9,
              color: 'var(--text2)',
              fontFamily: 'var(--font-mono)',
              marginTop: 4,
              textAlign: 'center' as const
            }}
          >
            ใส่ API key ใน AI Translate panel ก่อน
          </div>
        )}
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--border)',
          padding: '0 10px',
          flexShrink: 0
        }}
      >
        <button style={tabStyle('guide')} onClick={() => setTab('guide')}>
          GUIDE
        </button>
        <button style={tabStyle('patterns')} onClick={() => setTab('patterns')}>
          PATTERNS
        </button>
        <button style={tabStyle('log')} onClick={() => setTab('log')}>
          LOG
        </button>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'guide' && (
          <StyleGuideView
            styleGuide={profile?.styleGuide ?? ''}
            promptSnippet={profile?.promptSnippet ?? ''}
          />
        )}
        {tab === 'patterns' && <PatternList patterns={patterns} />}
        {tab === 'log' && <CorrectionLog corrections={corrections} onClear={onClearCorrections} />}
      </div>

      {/* Footer actions */}
      <div
        style={{
          padding: '5px 8px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg2)',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flexShrink: 0
        }}
      >
        <span
          style={{ fontSize: 9, color: 'var(--text2)', fontFamily: 'var(--font-mono)', flex: 1 }}
        >
          {profile?.projectName ?? 'No project'}
        </span>
        <button
          onClick={onResetProfile}
          style={{
            background: 'none',
            border: '1px solid var(--border)',
            color: 'var(--text2)',
            fontSize: 9,
            padding: '2px 7px',
            borderRadius: 4,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)'
          }}
        >
          Reset
        </button>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
})
