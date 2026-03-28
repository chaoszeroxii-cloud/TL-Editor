import { JSX } from 'react'

// ─── PathTree type ─────────────────────────────────────────────────────────────
export interface PathTree {
  [key: string]: PathTree
}

// ─── buildPathTree ────────────────────────────────────────────────────────────
// Extracts nested path tree from glossary entries for a specific file.
// Used by EntryForm to build the cascading sub-path selector.

import type { GlossaryEntry } from '../../types'

export function buildPathTree(entries: GlossaryEntry[], file: string): PathTree {
  const tree: PathTree = {}
  for (const e of entries) {
    if (e._file !== file) continue
    let node = tree
    for (const seg of e.path ?? []) {
      if (!node[seg]) node[seg] = {}
      node = node[seg]
    }
  }
  return tree
}

// ─── CascadingPathSelect ───────────────────────────────────────────────────────
// Renders a series of <select> elements, one per path depth level.
// Each level shows child keys of the currently-selected parent.

interface CascadingPathSelectProps {
  tree: PathTree
  selected: string[] // e.g. ["Characters", "Main Character"]
  onChange: (path: string[]) => void
}

export function CascadingPathSelect({
  tree,
  selected,
  onChange
}: CascadingPathSelectProps): JSX.Element {
  const levels: { options: string[]; value: string }[] = []
  let node = tree

  for (let depth = 0; ; depth++) {
    const options = Object.keys(node).sort()
    if (!options.length) break

    const val = selected[depth] ?? ''
    levels.push({ options, value: val })

    if (val && node[val]) node = node[val]
    else break
  }

  if (!levels.length) return <></>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span
        style={{
          fontSize: 9,
          color: 'var(--text2)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase' as const
        }}
      >
        Sub-path
      </span>
      {levels.map(({ options, value }, depth) => (
        <select
          key={depth}
          value={value}
          onChange={(e) => onChange([...selected.slice(0, depth), e.target.value])}
          style={{
            width: '100%',
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: value ? 'var(--accent)' : 'var(--text2)',
            fontSize: 11,
            padding: `3px ${6 + depth * 10}px 3px 6px`,
            outline: 'none',
            fontFamily: 'var(--font-mono)',
            boxSizing: 'border-box' as const,
            cursor: 'pointer'
          }}
        >
          <option value="">
            {depth === 0 ? '— เลือก sub-path —' : '— (ไม่มี sub-path ย่อย) —'}
          </option>
          {options.map((o) => (
            <option key={o} value={o}>
              {'　'.repeat(depth)}
              {o}
            </option>
          ))}
        </select>
      ))}
    </div>
  )
}
