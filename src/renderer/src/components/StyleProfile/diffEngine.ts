// ─── diffEngine.ts ────────────────────────────────────────────────────────────
// Pure functions: compare before/after strings → DiffResult
// No React, no side-effects, fully unit-testable.

import type { CorrectionTag, DiffResult } from './types'

// ── Levenshtein similarity (char-level) ───────────────────────────────────────
// Uses a two-row rolling array → O(min(m,n)) space instead of O(m*n).
// Strings are capped at 300 chars to keep comparisons fast on the main thread.

const MAX_CHARS = 300

function levenshtein(a: string, b: string): number {
  // Truncate to keep complexity bounded
  if (a.length > MAX_CHARS) a = a.slice(0, MAX_CHARS)
  if (b.length > MAX_CHARS) b = b.slice(0, MAX_CHARS)

  // Ensure a is the shorter string (saves memory)
  if (a.length > b.length) {
    const tmp = a
    a = b
    b = tmp
  }

  const m = a.length,
    n = b.length
  let prev = Array.from({ length: m + 1 }, (_, i) => i)
  let curr = new Array<number>(m + 1)

  for (let j = 1; j <= n; j++) {
    curr[0] = j
    for (let i = 1; i <= m; i++) {
      curr[i] =
        a[i - 1] === b[j - 1] ? prev[i - 1] : 1 + Math.min(prev[i], curr[i - 1], prev[i - 1])
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[m]
}

export function similarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a || !b) return 0
  const maxLen = Math.max(a.length, b.length)
  return 1 - levenshtein(a, b) / maxLen
}

// ── Word tokenizer (handles Thai + Latin) ────────────────────────────────────

function tokenize(text: string): string[] {
  // Split on whitespace + punctuation boundaries; keep Thai chars together
  return text
    .split(/[\s,.'"""'''!?;:()[\]{}\-–—]+/)
    .map((w) => w.trim())
    .filter(Boolean)
}

// ── Detect changed word pairs ─────────────────────────────────────────────────

function findChangedWords(
  beforeWords: string[],
  afterWords: string[]
): Array<{ from: string; to: string }> {
  const pairs: Array<{ from: string; to: string }> = []
  const bSet = new Set(beforeWords.map((w) => w.toLowerCase()))
  const aSet = new Set(afterWords.map((w) => w.toLowerCase()))

  const removed = beforeWords.filter((w) => !aSet.has(w.toLowerCase()))
  const added = afterWords.filter((w) => !bSet.has(w.toLowerCase()))

  // Pair up removed→added by position (best effort)
  const maxPairs = Math.min(removed.length, added.length, 10)
  for (let i = 0; i < maxPairs; i++) {
    pairs.push({ from: removed[i], to: added[i] })
  }
  return pairs
}

// ── Filler word list (Thai + English) ────────────────────────────────────────

const FILLER_TH = new Set([
  'ก็',
  'นั้น',
  'นี้',
  'แล้วก็',
  'และก็',
  'อีกทั้ง',
  'ซึ่ง',
  'โดยที่',
  'ในขณะที่',
  'อย่างไรก็ตาม',
  'นอกจากนี้',
  'ยิ่งไปกว่านั้น',
  'ประการแรก',
  'ประการที่สอง'
])
const FILLER_EN = new Set([
  'very',
  'really',
  'quite',
  'rather',
  'somewhat',
  'actually',
  'basically',
  'literally',
  'essentially',
  'indeed',
  'certainly',
  'obviously',
  'clearly'
])

function countFillers(words: string[]): number {
  return words.filter((w) => FILLER_TH.has(w) || FILLER_EN.has(w.toLowerCase())).length
}

// ── Formality signals (Thai) ──────────────────────────────────────────────────

const FORMAL_MARKERS = new Set([
  'ท่าน',
  'กระผม',
  'ดิฉัน',
  'ขอ',
  'โปรด',
  'กรุณา',
  'ประสงค์',
  'ดำเนิน'
])
const INFORMAL_MARKERS = new Set([
  'เขา',
  'เธอ',
  'มัน',
  'ฉัน',
  'ผม',
  'แก',
  'มึง',
  'กู',
  'นะ',
  'ครับ',
  'ค่ะ',
  'จ้า'
])

function formalityScore(words: string[]): number {
  let score = 0
  for (const w of words) {
    if (FORMAL_MARKERS.has(w)) score += 1
    if (INFORMAL_MARKERS.has(w)) score -= 1
  }
  return score
}

// ── Tag detectors ─────────────────────────────────────────────────────────────

function detectTags(
  before: string,
  after: string,
  beforeWords: string[],
  afterWords: string[],
  sim: number
): CorrectionTag[] {
  const tags: CorrectionTag[] = []

  // Length change
  const lenDelta = after.length - before.length
  const wordDelta = afterWords.length - beforeWords.length
  if (lenDelta < -before.length * 0.1 || wordDelta < -2) tags.push('shorten')
  if (lenDelta > before.length * 0.1 || wordDelta > 2) tags.push('expand')

  // Filler removal
  const fillerBefore = countFillers(beforeWords)
  const fillerAfter = countFillers(afterWords)
  if (fillerBefore > fillerAfter + 1) tags.push('remove-filler')

  // Formality shift
  const formalityDelta = formalityScore(afterWords) - formalityScore(beforeWords)
  if (formalityDelta > 1) tags.push('formality-up')
  if (formalityDelta < -1) tags.push('formality-down')

  // Word-level substitution (sim somewhat high but words changed)
  const changed = findChangedWords(beforeWords, afterWords)
  if (changed.length > 0 && sim > 0.4) tags.push('word-swap')

  // Structural reorder (similar words, low similarity → rearranged)
  const beforeSet = new Set(beforeWords.map((w) => w.toLowerCase()))
  const afterSet = new Set(afterWords.map((w) => w.toLowerCase()))
  const intersection = [...afterSet].filter((w) => beforeSet.has(w)).length
  const union = new Set([...beforeSet, ...afterSet]).size
  const jaccard = union > 0 ? intersection / union : 0
  if (jaccard > 0.5 && sim < 0.7) tags.push('restructure')

  // Punctuation change only
  const stripPunct = (s: string): string => s.replace(/[.,!?;:。、！？]/g, '')
  if (stripPunct(before).trim() === stripPunct(after).trim() && before !== after)
    tags.push('punctuation')

  // Naturalness (catch-all for moderate edits with no other tag)
  if (sim > 0.3 && sim < 0.85 && tags.filter((t) => !['punctuation'].includes(t)).length === 0)
    tags.push('naturalness')

  // Nuance (very subtle change, high sim, word swap)
  if (sim > 0.85 && changed.length > 0 && changed.length <= 2) tags.push('nuance')

  return [...new Set(tags)] // dedupe
}

// ── Main export ───────────────────────────────────────────────────────────────

export function analyzeDiff(before: string, after: string): DiffResult {
  const sim = similarity(before, after)
  const beforeWords = tokenize(before)
  const afterWords = tokenize(after)
  const changedWordPairs = findChangedWords(beforeWords, afterWords)
  const tags = detectTags(before, after, beforeWords, afterWords, sim)

  return {
    similarity: sim,
    tags,
    lengthDelta: after.length - before.length,
    wordDelta: afterWords.length - beforeWords.length,
    changedWordPairs
  }
}

// ── Utility: generate short ID ────────────────────────────────────────────────

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}
