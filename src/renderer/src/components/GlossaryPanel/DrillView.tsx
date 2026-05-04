import { memo, useMemo, JSX } from 'react'
import type { GlossaryEntry, GlossaryFileFormat } from '../../types'
import { EntryRow } from './EntryRow'
import { IcoHome } from '../common/icons'

// ─── Types ────────────────────────────────────────────────────────────────────

interface DrillSection {
  name: string
  directEntries: GlossaryEntry[]
  children: Map<string, DrillSection>
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

function buildDrillTree(entries: GlossaryEntry[]): Map<string, DrillSection> {
  const root = new Map<string, DrillSection>()
  const getOrCreate = (map: Map<string, DrillSection>, name: string): DrillSection => {
    if (!map.has(name)) map.set(name, { name, directEntries: [], children: new Map() })
    return map.get(name)!
  }
  for (const e of entries) {
    const p = e.path?.filter(Boolean) ?? []
    if (p.length === 0) {
      const groupName = e._file ? e._file.replace(/\.json$/i, '') : '(ungrouped)'
      getOrCreate(root, groupName).directEntries.push(e)
    } else {
      let map = root
      let node: DrillSection | null = null
      for (const seg of p) {
        node = getOrCreate(map, seg)
        map = node.children
      }
      node!.directEntries.push(e)
    }
  }
  return root
}

function countSection(sec: DrillSection): number {
  let n = sec.directEntries.length
  for (const child of sec.children.values()) n += countSection(child)
  return n
}

// ─── DrillView ────────────────────────────────────────────────────────────────

interface DrillViewProps {
  glossary: GlossaryEntry[]
  drillPath: string[]
  onDrill: (path: string[]) => void
  onEdit: (u: GlossaryEntry, orig: GlossaryEntry, targetFile: string) => void
  onDelete: (orig: GlossaryEntry) => void
  availableTypes: string[]
  search: string
  fileNames?: string[]
  sourceFileFormats?: Record<string, GlossaryFileFormat>
}

export const DrillView = memo(function DrillView({
  glossary,
  drillPath,
  onDrill,
  onEdit,
  onDelete,
  availableTypes,
  search,
  fileNames,
  sourceFileFormats
}: DrillViewProps): JSX.Element {
  const tree = useMemo(() => buildDrillTree(glossary), [glossary])

  const currentNode = useMemo(() => {
    let map = tree
    let directEntries: GlossaryEntry[] = []
    let valid = drillPath.length > 0
    for (const seg of drillPath) {
      const node = map.get(seg)
      if (!node) {
        valid = false
        break
      }
      directEntries = node.directEntries
      map = node.children
    }
    return {
      children: valid ? map : drillPath.length === 0 ? tree : new Map<string, DrillSection>(),
      entries: valid && drillPath.length > 0 ? directEntries : ([] as GlossaryEntry[])
    }
  }, [tree, drillPath])

  const sections = Array.from(currentNode.children.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )
  const directEntries = currentNode.entries

  const matchEntry = (e: GlossaryEntry): boolean =>
    !search ||
    e.src.toLowerCase().includes(search.toLowerCase()) ||
    e.th.toLowerCase().includes(search.toLowerCase()) ||
    (e.note ?? '').toLowerCase().includes(search.toLowerCase())

  const collectAll = (sec: DrillSection): GlossaryEntry[] => {
    const all = [...sec.directEntries]
    sec.children.forEach((c) => all.push(...collectAll(c)))
    return all
  }

  const visibleSections = sections.filter(([, sec]) => !search || collectAll(sec).some(matchEntry))
  const visibleEntries = directEntries.filter(matchEntry)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* Breadcrumb */}
      {drillPath.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 2,
            padding: '5px 8px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--bg2)',
            flexShrink: 0
          }}
        >
          <button
            onClick={() => onDrill([])}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--accent)',
              padding: '4px 6px',
              borderRadius: 4,
              minWidth: 30,
              minHeight: 30,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <IcoHome size={16} stroke="currentColor" />
          </button>
          {drillPath.map((seg, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ fontSize: 11, color: 'var(--text2)', opacity: 0.5 }}>›</span>
              <button
                onClick={() => onDrill(drillPath.slice(0, i + 1))}
                style={{
                  background: i === drillPath.length - 1 ? 'var(--accent-dim)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: i === drillPath.length - 1 ? 'var(--accent)' : 'var(--text2)',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  padding: '3px 7px',
                  borderRadius: 4,
                  minHeight: 26,
                  fontWeight: i === drillPath.length - 1 ? 600 : 400,
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                {seg}
              </button>
            </span>
          ))}
        </div>
      )}

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {visibleSections.length === 0 && visibleEntries.length === 0 && (
          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text2)', fontSize: 12 }}>
            No entries
          </div>
        )}

        {/* Section buttons */}
        {visibleSections.map(([name, sec]) => {
          const total = countSection(sec)
          const hasChildren = sec.children.size > 0
          return (
            <div key={name} style={{ borderBottom: '1px solid var(--border)' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  minHeight: 40,
                  transition: 'background 0.08s'
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg2)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = 'none')}
              >
                <button
                  onClick={() => onDrill([...drillPath, name])}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '9px 12px',
                    minHeight: 40,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left' as const
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--text0)',
                      fontWeight: 600,
                      fontFamily: 'var(--font-mono)',
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--accent)',
                      background: 'var(--accent-dim)',
                      padding: '2px 7px',
                      borderRadius: 99,
                      flexShrink: 0,
                      fontFamily: 'var(--font-mono)',
                      marginRight: hasChildren ? 6 : 0
                    }}
                  >
                    {total}
                  </span>
                  {hasChildren && (
                    <span
                      style={{ color: 'var(--text2)', fontSize: 14, flexShrink: 0, lineHeight: 1 }}
                    >
                      ›
                    </span>
                  )}
                </button>
              </div>
            </div>
          )
        })}

        {/* Direct entries */}
        {visibleEntries.map((e, i) => (
          <EntryRow
            key={i}
            entry={e}
            onEdit={onEdit}
            onDelete={onDelete}
            availableTypes={availableTypes}
            fileNames={fileNames}
            sourceFileFormats={sourceFileFormats}
            glossary={glossary}
          />
        ))}
      </div>
    </div>
  )
})
