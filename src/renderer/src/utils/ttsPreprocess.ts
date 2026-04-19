// ─── ttsPreprocess.ts ─────────────────────────────────────────────────────────
// Pre-processes text before sending to edge-tts.
// Replaces glossary terms with phonetic hints so TTS pronounces them correctly.
//
// Replacement priority per glossary entry:
//   1. note field that contains | characters  → use note as-is (e.g. |มอ|ระ|ดก|)
//   2. th field (Thai translation)            → use directly
//   3. No glossary match                      → keep original text

import type { GlossaryEntry } from '../types'

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

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Replaces glossary terms in `text` with their phonetic notes or Thai translations.
 * Safe for use with any text — returns original text if glossary is empty.
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

  return text.replace(re, (matched) => {
    return map.get(matched) ?? map.get(matched.toLowerCase()) ?? matched
  })
}
