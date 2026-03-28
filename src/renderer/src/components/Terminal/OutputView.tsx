import { memo, JSX } from 'react'

type OutputKind = 'stdout' | 'stderr' | 'info' | 'cmd' | 'exit'

export interface OutputLine {
  id: number
  kind: OutputKind
  text: string
  ts: number
}

interface OutputViewProps {
  lines: OutputLine[]
  outputRef: React.RefObject<HTMLDivElement | null>
}

export const OutputView = memo(function OutputView({
  lines,
  outputRef
}: OutputViewProps): JSX.Element {
  const colorMap: Record<OutputKind, string> = {
    stdout: 'var(--text0)',
    stderr: 'var(--text2)',
    info: 'var(--text2)',
    cmd: 'var(--hl-gold)',
    exit: 'var(--text2)'
  }

  return (
    <div
      ref={outputRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 14px',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        lineHeight: 1.65,
        background: 'var(--bg0)',
        scrollbarWidth: 'thin'
      }}
    >
      {lines.length === 0 && (
        <div style={{ color: 'var(--text2)', fontSize: 11, fontStyle: 'italic', paddingTop: 4 }}>
          No output yet.
        </div>
      )}
      {lines.map((line) => (
        <div
          key={line.id}
          style={{
            color: colorMap[line.kind],
            opacity: line.kind === 'info' || line.kind === 'exit' ? 0.6 : 1,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            display: 'flex',
            gap: 8,
            alignItems: 'flex-start'
          }}
        >
          {line.kind === 'cmd' && <span style={{ color: 'var(--hl-teal)', flexShrink: 0 }}>❯</span>}
          {line.kind === 'info' && (
            <span style={{ color: 'var(--hl-gold)', flexShrink: 0 }}>▸</span>
          )}
          {line.kind === 'stderr' && (
            <span style={{ color: 'var(--hl-gold)', flexShrink: 0 }}>▸</span>
          )}
          {line.kind === 'exit' && <span style={{ flexShrink: 0 }}>→</span>}
          <span style={{ flex: 1 }}>{line.text}</span>
        </div>
      ))}
    </div>
  )
})
