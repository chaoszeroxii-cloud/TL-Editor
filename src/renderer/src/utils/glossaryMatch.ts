// glossaryMatch.ts
// Shared glossary helpers used by the AI chat panel (and previously inlined in
// AITranslatePanel). Two jobs:
//   1. matchEntryInText / filterMatchedGlossary — pick only the glossary entries
//      whose `src` term actually appears in the current source text.
//   2. buildNestedFromEntries — reconstruct the nested glossary JSON shape that
//      the model is prompted with.

import type { GlossaryEntry } from '../types'
import { categoryOf } from './highlight'
import { termPattern } from './termPattern'

/** True if entry.src appears in srcContent (word-boundary + inflection aware for Latin terms). */
export function matchEntryInText(entry: GlossaryEntry, srcContent: string): boolean {
  if (!entry.src || !srcContent) return false
  return new RegExp(termPattern(entry.src), 'i').test(srcContent)
}

/** Subset of `glossary` whose terms are present in `srcContent`. */
export function filterMatchedGlossary(
  glossary: GlossaryEntry[],
  srcContent: string
): GlossaryEntry[] {
  if (!Array.isArray(glossary)) return []
  return glossary.filter((g) => matchEntryInText(g, srcContent))
}

// ─── Nested glossary reconstruction ──────────────────────────────────────────

function writeLeaf(group: Record<string, unknown>, e: GlossaryEntry): void {
  const node: Record<string, unknown> = {}
  if (e.alt && e.alt.length > 0) node.Called = [e.th, ...e.alt]
  else node.Called = e.th
  if (e.note) node['รายละเอียด'] = e.note
  group[e.src] = node
}

/**
 * Build a nested object from GlossaryEntry[] using their `path` field.
 * path: [topType, ...nestedKeys, leafKey]. Mirrors the original nested glossary.
 */
export function buildNestedFromEntries(entries: GlossaryEntry[]): Record<string, unknown> {
  const root: Record<string, unknown> = {}
  for (const e of entries) {
    if (!e.path || e.path.length === 0) {
      const cat = categoryOf(e)
      const group = (root[cat] as Record<string, unknown> | undefined) ?? {}
      root[cat] = group
      writeLeaf(group, e)
      continue
    }
    let cursor: Record<string, unknown> = root
    for (let i = 0; i < e.path.length - 1; i++) {
      const seg = e.path[i]
      const existing = cursor[seg]
      if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        cursor = existing as Record<string, unknown>
      } else {
        const next: Record<string, unknown> = {}
        cursor[seg] = next
        cursor = next
      }
    }
    const lastKey = e.path[e.path.length - 1]
    const leafGroup = (cursor[lastKey] as Record<string, unknown> | undefined) ?? {}
    cursor[lastKey] = leafGroup
    writeLeaf(leafGroup, e)
  }
  return root
}
