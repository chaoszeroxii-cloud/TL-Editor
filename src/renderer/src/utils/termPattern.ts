// termPattern.ts
// Single source of truth for how a glossary term is matched inside source text.
//
// The matcher is case-insensitive and, for real English words, also matches the
// common inflected forms (plural / verb suffixes, plus an e-drop variant so
// "refine" matches "refining"). That morphology is ONLY applied to terms with
// at least 3 Latin letters — otherwise a one-letter pronoun entry like "I"
// (→ "ข้า") would match the word "is" ("I" + "s", case-insensitively), and "a"
// would match "as". Short terms therefore match exactly, with word boundaries.

export const TERM_SUFFIXES = ["'s", 's', 'es', 'ed', 'ing', 'er', 'ers'] as const
export const TERM_EDROP_SUFFIXES = ['ing', 'ed', 'er', 'ers'] as const

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Number of Latin letters in the term — suffix morphology only makes sense for real words. */
const latinLen = (src: string): number => (src.match(/[A-Za-z]/g) ?? []).length

/** Whether English suffix expansion should apply to this term (≥3 Latin letters). */
export function allowSuffixExpansion(src: string): boolean {
  return latinLen(src) >= 3
}

/** Whether the term needs a `\b` word boundary (contains a Latin/numeric char). */
function needsBoundary(src: string): boolean {
  return /[A-Za-z0-9]/.test(src)
}

/**
 * Regex source (no flags, no capture group) matching `src` and — for real
 * Latin words — its common inflections. Combine with the `i` flag.
 */
export function termPattern(src: string): string {
  const esc = escapeRegExp(src)
  if (!needsBoundary(src)) return esc
  if (!allowSuffixExpansion(src)) return `\\b${esc}\\b`
  // E-drop: "refine" → "refining" / "refined" / "refiner" / "refiners"
  if (/[^e]e$/i.test(src)) {
    const edropEsc = esc.slice(0, -1)
    return `\\b(?:${esc}(?:'s|s|es)?|${edropEsc}(?:ed|ing|er|ers))\\b`
  }
  return `\\b${esc}(?:'s|s|es|ed|ing|er|ers)?\\b`
}
