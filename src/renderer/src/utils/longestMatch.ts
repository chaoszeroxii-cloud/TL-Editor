// ─── longestMatch.ts ──────────────────────────────────────────────────────────
// Longest-match-wins resolution for overlapping glossary/lib matches.
//
// Plain regex alternation (`เทพ|พลังปราณ|…`) is *leftmost*-wins, not
// *longest*-wins: in "เทพลังปราณ" the keys "เทพ" (index 0) and "พลังปราณ"
// (index 2) share the "พ", and regex picks "เทพ" simply because it starts
// first — eating the "พ" and leaving "ลังปราณ" mispronounced. Sorting keys by
// length does NOT fix this, because the matches start at different positions.
//
// These helpers collect *all* candidate matches (including overlapping ones)
// then greedily keep the longest, so "พลังปราณ" wins over "เทพ".

export interface MatchSpan {
  start: number
  end: number
  text: string
}

/**
 * Run a compiled (global) regex over `text` and collect every match, including
 * matches that start inside a previous match. The regex's own alternation order
 * still decides which alternative wins at a given start position, so keep it
 * sorted longest-first for best results.
 */
export function collectOverlappingMatches(text: string, re: RegExp): MatchSpan[] {
  re.lastIndex = 0
  const out: MatchSpan[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const matched = m[0]
    if (matched.length === 0) {
      re.lastIndex++ // guard against zero-length match infinite loop
      continue
    }
    out.push({ start: m.index, end: m.index + matched.length, text: matched })
    re.lastIndex = m.index + 1 // advance by 1 so overlapping starts are found
  }
  return out
}

/**
 * Greedily keep the longest non-overlapping spans. Longest first; ties broken by
 * earliest start. Returned spans are sorted by start position.
 */
export function pickLongestNonOverlapping<T extends { start: number; end: number }>(
  spans: T[]
): T[] {
  const byLength = [...spans].sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start)
  const chosen: T[] = []
  for (const span of byLength) {
    if (chosen.some((c) => span.start < c.end && c.start < span.end)) continue
    chosen.push(span)
  }
  chosen.sort((a, b) => a.start - b.start)
  return chosen
}
