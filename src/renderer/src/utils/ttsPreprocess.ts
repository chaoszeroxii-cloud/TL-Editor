// ─── ttsPreprocess.ts ─────────────────────────────────────────────────────────
// Pre-processes text before sending to edge-tts.
// Replaces glossary terms with phonetic hints so TTS pronounces them correctly.
//
// Replacement priority per glossary entry:
//   1. note field that contains | characters  → use note as-is (e.g. |มอ|ระ|ดก|)
//   2. th field (Thai translation)            → use directly
//   3. No glossary match                      → keep original text

import type { GlossaryEntry } from '../types'
import { collectOverlappingMatches, pickLongestNonOverlapping } from './longestMatch'

// ── Check if note is a phonetic hint ─────────────────────────────────────────
// Treats any note containing | as a pronunciation guide

function isPhoneticNote(note: string | undefined): boolean {
  return !!note && note.includes('|')
}

// ── Build replacement map from glossary ──────────────────────────────────────
// Sorted longest-first to avoid partial replacements (e.g. "กระบี่" before "กระบ")

function buildReplacementMap(glossary: GlossaryEntry[]): Map<string, string> {
  const map = new Map<string, string>()

  const sorted = [...glossary]
    .filter((e) => e.src && e.src.trim())
    .sort((a, b) => b.src.length - a.src.length) // longest first

  for (const entry of sorted) {
    const src = entry.src.trim()
    let replacement: string

    if (isPhoneticNote(entry.note)) {
      // Use note as-is, e.g. |มอ|ระ|ดก|
      replacement = entry.note!.trim()
    } else if (entry.th && entry.th.trim()) {
      // Fallback: use Thai translation
      replacement = entry.th.trim()
    } else {
      continue // no useful replacement
    }

    map.set(src, replacement)

    // Also register English inflected forms → same replacement
    if (/[A-Za-z]/.test(src)) {
      for (const sfx of ["'s", 's', 'es', 'ed', 'ing', 'er', 'ers']) {
        map.set(src + sfx, replacement)
        map.set(src.toLowerCase() + sfx, replacement)
      }
    }
  }

  return map
}

// ── Filter glossaries to only used entries ───────────────────────────────────

/**
 * Filters glossary record to only include entries actually found in the text.
 * Works with Record<string, string> where keys are source terms.
 * Returns empty object if text is empty or no entries are found.
 */
export function filterUsedGlossariesFromRecord(
  text: string,
  glossaryRecord: Record<string, string> | undefined
): Record<string, string> {
  if (!text.trim() || !glossaryRecord) return {}

  const result: Record<string, string> = {}

  for (const [src, translation] of Object.entries(glossaryRecord)) {
    if (src.trim() && text.includes(src)) {
      result[src] = translation
    }
  }

  return result
}

/**
 * Filters glossary library entries to only include entries actually found in the text.
 * Returns empty object if text is empty or no entries are found.
 */
export function filterUsedGlossaries(
  text: string,
  glossaryEntries: GlossaryEntry[]
): Record<string, string> {
  if (!text.trim() || !glossaryEntries.length) return {}

  const result: Record<string, string> = {}

  for (const entry of glossaryEntries) {
    const src = entry.src?.trim()
    if (!src) continue

    // Check if src is found in text (case-sensitive for Thai/mixed content)
    if (text.includes(src)) {
      let replacement: string

      if (isPhoneticNote(entry.note)) {
        replacement = entry.note!.trim()
      } else if (entry.th && entry.th.trim()) {
        replacement = entry.th.trim()
      } else {
        continue
      }

      result[src] = replacement
    }
  }

  return result
}

// ── Main exports ──────────────────────────────────────────────────────────────

/**
 * Replaces terms from glossary records (bf_lib + at_lib) in text.
 * Records are pre-filtered to only contain entries found in text (via filterUsedGlossariesFromRecord).
 * Safe for use with any text — returns original text if records are empty.
 */
export function preprocessForTtsFromRecords(
  text: string,
  bfLib: Record<string, string>,
  atLib: Record<string, string>
): string {
  if (!text.trim()) return text

  // Merge both records (bfLib applied first, then atLib)
  const merged = { ...bfLib, ...atLib }
  if (!Object.keys(merged).length) return text

  // Sort by length (longest first) so the regex prefers the longest alternative
  // at any given start position.
  const keys = Object.keys(merged).sort((a, b) => b.length - a.length)

  // Build alternation regex
  const pattern = keys
    .map((k) => {
      const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Word boundary only for latin strings
      return /[A-Za-z]/.test(k) ? `\\b${esc}\\b` : esc
    })
    .join('|')

  let re: RegExp
  try {
    re = new RegExp(`(${pattern})`, 'g')
  } catch {
    return text // regex compile failed → return original
  }

  // Longest-match-wins: collect every (possibly overlapping) match, then keep the
  // longest non-overlapping set. This makes "พลังปราณ" win over "เทพ" in
  // "เทพลังปราณ" where the two keys share the "พ".
  const chosen = pickLongestNonOverlapping(collectOverlappingMatches(text, re))
  if (!chosen.length) return text

  let out = ''
  let pos = 0
  for (const span of chosen) {
    out += text.slice(pos, span.start)
    const replacement = merged[span.text] ?? merged[span.text.toLowerCase()] ?? span.text
    out += replacement
    pos = span.end
  }
  out += text.slice(pos)
  return out
}

/**
 * Replaces glossary terms in `text` with their phonetic notes or Thai translations.
 * Safe for use with any text — returns original text if glossary is empty.
 * ⚠️ Uses ALL glossary entries (for backward compatibility)
 */
export function preprocessForTts(text: string, glossary: GlossaryEntry[]): string {
  if (!glossary.length || !text.trim()) return text

  const map = buildReplacementMap(glossary)
  if (!map.size) return text

  // Build one big alternation regex from all keys (already sorted longest-first)
  const keys = Array.from(map.keys())
  const pattern = keys
    .map((k) => {
      const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Word boundary only for latin strings
      return /[A-Za-z]/.test(k) ? `\\b${esc}\\b` : esc
    })
    .join('|')

  let re: RegExp
  try {
    re = new RegExp(`(${pattern})`, 'g')
  } catch {
    return text // regex compile failed → return original
  }

  // Longest-match-wins (see preprocessForTtsFromRecords for rationale)
  const chosen = pickLongestNonOverlapping(collectOverlappingMatches(text, re))
  if (!chosen.length) return text

  let out = ''
  let pos = 0
  for (const span of chosen) {
    out += text.slice(pos, span.start)
    out += map.get(span.text) ?? map.get(span.text.toLowerCase()) ?? span.text
    pos = span.end
  }
  out += text.slice(pos)
  return out
}
