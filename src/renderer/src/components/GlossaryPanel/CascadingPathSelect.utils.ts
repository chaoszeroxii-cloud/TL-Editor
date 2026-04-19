import type { GlossaryEntry } from '../../types'

// ─── PathTree type ─────────────────────────────────────────────────────────────
export interface PathTree {
  [key: string]: PathTree
}

// ─── buildPathTree ────────────────────────────────────────────────────────────
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
