import type { GlossaryEntry } from '../types'

// ─── Color definitions ────────────────────────────────────────────────────────

type ColorDef = { color: string; bg: string; border: string }

const BASE: Record<string, ColorDef> = {
  person: { color: 'var(--hl-gold)', bg: 'var(--hl-gold-bg)', border: 'var(--hl-gold-border)' },
  place: { color: 'var(--hl-teal)', bg: 'var(--hl-teal-bg)', border: 'var(--hl-teal-border)' },
  term: { color: 'var(--hl-coral)', bg: 'var(--hl-coral-bg)', border: 'var(--hl-coral-border)' },
  other: { color: 'var(--hl-other)', bg: 'var(--hl-other-bg)', border: 'var(--hl-other-border)' }
}

function resolveColor(type: string): ColorDef {
  if (BASE[type]) return BASE[type]
  const k = type.toLowerCase()
  if (/character|ตัวละคร|person|protagonist|antagonist/.test(k)) return BASE.person
  if (/place|สถานที่|location|realm|region|หุบ|วัง|map/.test(k)) return BASE.place
  if (/monster|อสูร|beast|creature|demon/.test(k)) return BASE.other
  return BASE.term
}

/** Proxy — any string key returns a ColorDef (never undefined) */
export const HL_COLORS: Record<string, ColorDef> = new Proxy({} as Record<string, ColorDef>, {
  get(_: unknown, type: string | symbol) {
    if (typeof type !== 'string') return undefined
    return resolveColor(type)
  }
}) as Record<string, ColorDef>

// ─── Segment types ────────────────────────────────────────────────────────────

export type Segment =
  | { kind: 'text'; text: string }
  | { kind: 'match'; text: string; entry: GlossaryEntry }

// ─── Memoized glossary compiler ───────────────────────────────────────────────
// Recompiles only when the glossary array reference changes.

let _cache: { ref: GlossaryEntry[]; re: RegExp; map: Map<string, GlossaryEntry> } | null = null

function compile(glossary: GlossaryEntry[]): { re: RegExp; map: Map<string, GlossaryEntry> } {
  if (_cache && glossary === _cache.ref) return { re: _cache.re, map: _cache.map }

  // Filter out entries with empty src before doing anything
  const sorted = [...glossary]
    .filter((g) => g.src && g.src.trim().length > 0)
    .sort((a, b) => b.src.length - a.src.length)

  const map = new Map<string, GlossaryEntry>()
  for (const g of sorted) {
    map.set(g.src, g)
    // Also index by lowercase so the gi-flag regex match can always find its entry
    // regardless of whether src is "Senior Sister" and text has "senior sister" or vice versa.
    map.set(g.src.toLowerCase(), g)
    if (/[A-Za-z]$/.test(g.src)) {
      for (const sfx of ["'s", 's', 'es', 'ed', 'ing', 'er', 'ers']) {
        map.set(g.src + sfx, g)
        map.set(g.src.toLowerCase() + sfx, g)
      }
    }
  }

  const needsBoundary = (src: string): boolean => /[A-Za-z0-9]/.test(src)
  const pat = sorted
    .map((g) => {
      const esc = g.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return needsBoundary(g.src) ? `\\b${esc}(?:'s|s|es|ed|ing|er|ers)?\\b` : esc
    })
    .join('|')

  let re: RegExp
  try {
    re = new RegExp(`(${pat})`, 'gi')
  } catch {
    // Fallback: never-matching regex so the app doesn't crash
    re = /(?!)/gi
  }
  _cache = { ref: glossary, re, map }
  return { re, map }
}

/** Split text into plain + highlighted segments */
export function tokenize(text: string, glossary: GlossaryEntry[]): Segment[] {
  if (!glossary.length || !text) return [{ kind: 'text', text }]

  const { re, map } = compile(glossary)
  re.lastIndex = 0

  const segs: Segment[] = []
  let last = 0
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ kind: 'text', text: text.slice(last, m.index) })

    const matched = m[0]
    const entry =
      map.get(matched) ??
      map.get(matched.toLowerCase()) ??
      map.get(matched.charAt(0).toUpperCase() + matched.slice(1)) ??
      (() => {
        for (const sfx of ["'s", 'ers', 'ing', 'ed', 'es', 'er', 's']) {
          if (matched.toLowerCase().endsWith(sfx)) {
            const base = matched.slice(0, -sfx.length)
            const found =
              map.get(base) ??
              map.get(base.toLowerCase()) ??
              map.get(base.charAt(0).toUpperCase() + base.slice(1))
            if (found) return found
          }
        }
        return undefined
      })()

    if (!entry) {
      segs.push({ kind: 'text', text: matched })
    } else {
      segs.push({ kind: 'match', text: matched, entry })
    }
    last = m.index + matched.length
  }

  if (last < text.length) segs.push({ kind: 'text', text: text.slice(last) })
  return segs
}

/** Fast match count — no Segment allocation, used by status bar */
export function countMatches(text: string, glossary: GlossaryEntry[]): number {
  if (!glossary.length || !text) return 0
  const { re } = compile(glossary)
  re.lastIndex = 0
  let n = 0
  while (re.exec(text) !== null) n++
  return n
}
