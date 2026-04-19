import { memo, useState, JSX } from 'react'
import type { GlossaryEntry, GlossaryFileFormat } from '../../types'
import { HL_COLORS } from '../../utils/highlight'
import { EntryForm } from './EntryForm'

interface EntryRowProps {
  entry: GlossaryEntry
  indent?: number
  onEdit: (updated: GlossaryEntry, orig: GlossaryEntry, targetFile: string) => void
  onDelete: (orig: GlossaryEntry) => void
  availableTypes: string[]
  fileNames?: string[]
  sourceFileFormats?: Record<string, GlossaryFileFormat>
  glossary?: GlossaryEntry[]
}

export const EntryRow = memo(function EntryRow({
  entry,
  indent = 0,
  onEdit,
  onDelete,
  availableTypes,
  fileNames = [],
  sourceFileFormats = {},
  glossary = []
}: EntryRowProps): JSX.Element {
  const [editing, setEditing] = useState(false)
  const colors = (HL_COLORS as Record<string, { color: string }>)[entry.type] ??
    (HL_COLORS as Record<string, { color: string }>)['other'] ?? { color: '#888' }

  if (editing) {
    return (
      <div
        style={{
          padding: '0 0 0 ' + (8 + indent) + 'px',
          background: 'var(--bg3)',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <EntryForm
          title="EDIT"
          initial={{ ...entry }}
          onSubmit={(u, targetFile) => {
            onEdit(u, entry, targetFile)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
          submitLabel="Save"
          availableTypes={availableTypes}
          fileNames={fileNames}
          sourceFileFormats={sourceFileFormats}
          defaultFile={entry._file ?? fileNames[0] ?? ''}
          glossary={glossary}
        />
      </div>
    )
  }

  return (
    <div
      style={{
        padding: `5px 9px 5px ${8 + indent}px`,
        borderBottom: '1px solid var(--border)',
        cursor: 'default',
        position: 'relative'
      }}
      onMouseEnter={(e) => {
        const b = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.ra')
        if (b) b.style.opacity = '1'
      }}
      onMouseLeave={(e) => {
        const b = (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.ra')
        if (b) b.style.opacity = '0'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            flexShrink: 0,
            background: colors.color
          }}
        />
        <span
          style={{
            fontSize: 11,
            color: 'var(--text0)',
            fontFamily: 'var(--font-mono)',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {entry.src}
        </span>
        <div
          className="ra"
          style={{
            display: 'flex',
            gap: 1,
            opacity: 0,
            transition: 'opacity 0.12s',
            flexShrink: 0
          }}
        >
          <button
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text2)',
              padding: '1px 4px',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              fontSize: 11
            }}
            onClick={() => setEditing(true)}
            title="Edit"
          >
            ✎
          </button>
          <button
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--hl-coral)',
              padding: '1px 4px',
              borderRadius: 3,
              display: 'flex',
              alignItems: 'center',
              fontSize: 11
            }}
            onClick={() => {
              if (
                window.confirm(
                  `ต้องการลบ "${entry.src}" ใช่หรือไม่?\n\nเมื่อลบแล้วจะไม่สามารถกู้คืนได้`
                )
              ) {
                onDelete(entry)
              }
            }}
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text1)', paddingLeft: 11 }}>{entry.th}</div>
      {entry.alt && entry.alt.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--hl-teal)', paddingLeft: 11, marginTop: 1 }}>
          ↳ {entry.alt.join(' · ')}
        </div>
      )}
      {entry.note && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text2)',
            paddingLeft: 11,
            marginTop: 2,
            lineHeight: 1.4
          }}
        >
          {entry.note}
        </div>
      )}
    </div>
  )
})
