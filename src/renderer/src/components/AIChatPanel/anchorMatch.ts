// AIChatPanel/anchorMatch.ts
// Pure helpers for content-anchored diffs. No React. Fully unit-testable.
//
// Why content anchoring: a staged line edit stores the ORIGINAL text it intends
// to replace (+ one context line each side), not just line numbers. At accept
// time we relocate that text in the *current* TGT. This survives both
//   (#1) line drift from other edits in the same turn, and
//   (#3) the user hand-editing the draft while the diff sits in the queue.

import type { PendingLineEdit } from './types'

/** Fast, stable, non-crypto hash (FNV-1a) → hex. Used to detect TGT changes. */
export function hashText(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

const PROXIMITY = 5 // search hintLine ± this many lines first

export type Relocation =
  | { ok: true; start: number; end: number } // 0-based inclusive line range in current text
  | { ok: false; reason: 'not-found' | 'ambiguous' }

/**
 * Find where a line edit's `coreText` currently lives in `currentText`.
 * Strategy: candidate positions where the core lines match exactly, filtered by
 * surrounding context (before/after) when available, preferring the hint window.
 */
export function relocateLineEdit(currentText: string, edit: PendingLineEdit): Relocation {
  const lines = currentText.split('\n')
  const core = edit.coreText.split('\n')
  const coreLen = core.length

  const candidates: number[] = []
  for (let i = 0; i + coreLen <= lines.length; i++) {
    let match = true
    for (let j = 0; j < coreLen; j++) {
      if (lines[i + j] !== core[j]) {
        match = false
        break
      }
    }
    if (!match) continue
    // Context check: only enforce when we have a context line to compare against.
    if (edit.before && lines[i - 1] !== edit.before) continue
    if (edit.after && lines[i + coreLen] !== edit.after) continue
    candidates.push(i)
  }

  if (candidates.length === 0) return { ok: false, reason: 'not-found' }
  if (candidates.length === 1)
    return { ok: true, start: candidates[0], end: candidates[0] + coreLen - 1 }

  // Multiple matches → prefer exactly one inside the hint window.
  const inWindow = candidates.filter((i) => Math.abs(i - edit.startLine) <= PROXIMITY)
  if (inWindow.length === 1) return { ok: true, start: inWindow[0], end: inWindow[0] + coreLen - 1 }

  // Still ambiguous (genuinely duplicated text) → flag so the UI can warn rather
  // than silently editing the wrong occurrence.
  return { ok: false, reason: 'ambiguous' }
}

export interface ResolvedLineEdit {
  edit: PendingLineEdit
  start: number
  end: number
}

/**
 * Apply a batch of line edits to currentText. Relocates each anchor first, drops
 * those that can't be placed (returned as conflicts), checks for overlaps, then
 * applies bottom-up (descending start) so earlier edits never shift later ones.
 */
export function applyLineEdits(
  currentText: string,
  edits: PendingLineEdit[]
): { text: string; appliedIds: string[]; conflictIds: string[] } {
  const lines = currentText.split('\n')
  const resolved: ResolvedLineEdit[] = []
  const conflictIds: string[] = []

  for (const edit of edits) {
    const r = relocateLineEdit(currentText, edit)
    if (r.ok) resolved.push({ edit, start: r.start, end: r.end })
    else conflictIds.push(edit.id)
  }

  // Sort by relocated position, descending → apply bottom-up.
  resolved.sort((a, b) => b.start - a.start)

  // Overlap guard on the relocated ranges.
  const accepted: ResolvedLineEdit[] = []
  let prevStart = Infinity
  for (const r of resolved) {
    if (r.end >= prevStart) {
      conflictIds.push(r.edit.id) // overlaps a lower (already-accepted) range
      continue
    }
    accepted.push(r)
    prevStart = r.start
  }

  const appliedIds: string[] = []
  for (const r of accepted) {
    const replacement = r.edit.newText.split('\n')
    lines.splice(r.start, r.end - r.start + 1, ...replacement)
    appliedIds.push(r.edit.id)
  }

  return { text: lines.join('\n'), appliedIds, conflictIds }
}

/**
 * Capture the anchor for a replace_lines request against the current TGT.
 * Clamps the range and grabs one context line each side.
 */
export function captureLineAnchor(
  currentText: string,
  start: number,
  end: number
): { coreText: string; before: string; after: string; startLine: number; endLine: number } {
  const lines = currentText.split('\n')
  const s = Math.max(0, Math.min(start, lines.length - 1))
  const e = Math.max(s, Math.min(end, lines.length - 1))
  return {
    coreText: lines.slice(s, e + 1).join('\n'),
    before: s > 0 ? lines[s - 1] : '',
    after: e < lines.length - 1 ? lines[e + 1] : '',
    startLine: s,
    endLine: e
  }
}

// ─── Inline diff hunks (Phase 3) ──────────────────────────────────────────────
// Map staged line edits onto current TGT row ranges so the editor can render them
// inline. Edits whose anchor can't be uniquely placed (conflict) are dropped here
// and handled in the side panel instead. Overlapping hunks keep the first.

export interface DiffHunk {
  editId: string
  startRow: number // 0-based inclusive (range being replaced in current TGT)
  endRow: number
  oldLines: string[]
  newLines: string[]
}

export function computeHunks(currentText: string, lineEdits: PendingLineEdit[]): DiffHunk[] {
  const lines = currentText.split('\n')
  const placed: DiffHunk[] = []
  for (const e of lineEdits) {
    const r = relocateLineEdit(currentText, e)
    if (!r.ok) continue // unplaceable → panel handles it
    placed.push({
      editId: e.id,
      startRow: r.start,
      endRow: r.end,
      oldLines: lines.slice(r.start, r.end + 1),
      newLines: e.newText.split('\n')
    })
  }
  placed.sort((a, b) => a.startRow - b.startRow)
  const result: DiffHunk[] = []
  let lastEnd = -1
  for (const h of placed) {
    if (h.startRow <= lastEnd) continue // overlaps a kept hunk → skip inline
    result.push(h)
    lastEnd = h.endRow
  }
  return result
}
