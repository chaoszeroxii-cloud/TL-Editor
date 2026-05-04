import type { GlossaryEntry } from '../../types'
import type { Segment } from '../../utils/highlight'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FindMatch {
  rowIndex: number
  col: 'tgt' | 'src'
  start: number
  end: number
}

export type FindRange = { start: number; end: number; matchIdx: number }

export type FindSeg =
  | { kind: 'text'; text: string }
  | { kind: 'glossary'; text: string; entry: GlossaryEntry }
  | { kind: 'find'; text: string; current: boolean; entry?: GlossaryEntry }

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Merges glossary token segments with find-match ranges into a flat annotated
 * list for rendering. Find highlight takes precedence; glossary colour is
 * preserved inside find spans.
 */
export function buildRenderSegs(
  text: string,
  glossarySegs: Segment[],
  findRanges: FindRange[],
  activeMatchIdx: number
): FindSeg[] {
  // Fast path — no find active
  if (!findRanges.length) {
    return glossarySegs.map((s) =>
      s.kind === 'text'
        ? { kind: 'text' as const, text: s.text }
        : { kind: 'glossary' as const, text: s.text, entry: s.entry }
    )
  }

  const n = text.length
  if (!n) return []

  // Per-character glossary entry (null = plain text)
  const gEntry: (GlossaryEntry | null)[] = new Array(n).fill(null)
  let p = 0
  for (const seg of glossarySegs) {
    if (seg.kind === 'match') {
      for (let i = p; i < p + seg.text.length; i++) gEntry[i] = seg.entry
    }
    p += seg.text.length
  }

  // Per-character find state: null = no find, false = match, true = CURRENT
  const fState: (boolean | null)[] = new Array(n).fill(null)
  for (const r of findRanges) {
    const isCurrent = r.matchIdx === activeMatchIdx
    for (let i = Math.max(0, r.start); i < Math.min(n, r.end); i++) fState[i] = isCurrent
  }

  // Scan and group consecutive chars with identical (fState, gEntry)
  const result: FindSeg[] = []
  let i = 0
  while (i < n) {
    const fs = fState[i]
    const ge = gEntry[i]
    let j = i + 1
    while (j < n && fState[j] === fs && gEntry[j] === ge) j++
    const t = text.slice(i, j)
    if (fs !== null) result.push({ kind: 'find', text: t, current: fs, entry: ge ?? undefined })
    else if (ge !== null) result.push({ kind: 'glossary', text: t, entry: ge })
    else result.push({ kind: 'text', text: t })
    i = j
  }
  return result
}
