import type { GlossaryEntry } from '../../types'

// Stable module-level functions — no hook needed, no new fn on every render
let _hoveredEntry: GlossaryEntry | null = null

export function getHoveredGlossaryEntry(): GlossaryEntry | null {
  return _hoveredEntry
}

export function showTooltip(entry: GlossaryEntry, x: number, y: number): void {
  _hoveredEntry = entry
  window.dispatchEvent(new CustomEvent('hl:show', { detail: { entry, x, y } }))
}

export function hideTooltip(): void {
  _hoveredEntry = null
  window.dispatchEvent(new CustomEvent('hl:hide'))
}

/** Dispatch เพื่อเปิด edit form ของ entry นี้ใน GlossaryPanel */
export function editGlossaryEntry(entry: GlossaryEntry): void {
  window.dispatchEvent(new CustomEvent('hl:edit', { detail: entry }))
}
