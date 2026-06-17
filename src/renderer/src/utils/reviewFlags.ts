// reviewFlags.ts
// Tiered review: given a line-aligned (SRC, TGT) pair + the glossary, find the
// rows that are *likely* wrong so the user reviews only those instead of reading
// the whole chapter. Pure + deterministic — no AI call, no token cost.
//
// The contract that makes this cheap is the same one `set_full_translation`
// guarantees and DualView renders on: SRC line i ↔ TGT line i.
//
// All heuristics are intentionally tuned to favour *few false positives* over
// completeness — a flag the user learns to trust beats a wall of noise. Number
// drift is deliberately NOT flagged: this pipeline converts digits to Thai words
// (see tts_engine preprocess), so a missing digit in TGT is usually correct.

import type { GlossaryEntry } from '../types'
import { tokenize } from './highlight'

export type FlagSeverity = 'high' | 'low'

/** One suspect row, with the reasons it was flagged (Thai, user-facing). */
export interface LineFlag {
  /** 0-based row index, aligned with DualView rows. */
  row: number
  severity: FlagSeverity
  reasons: string[]
}

// ─── Source-script detection ─────────────────────────────────────────────────
// We only know a TGT line is "left untranslated" relative to the *source*
// language. Sniff it once from the whole SRC: Latin (EN-ish) vs CJK (zh/ja).

type SourceScript = 'latin' | 'cjk' | 'other'

const LATIN_RE = /[A-Za-z]/g
const CJK_RE = /[㐀-鿿豈-﫿]/g

function detectSourceScript(src: string): SourceScript {
  const latin = (src.match(LATIN_RE) || []).length
  const cjk = (src.match(CJK_RE) || []).length
  if (cjk > 0 && cjk >= latin) return 'cjk'
  if (latin > 0) return 'latin'
  return 'other'
}

/** Fraction of a TGT line's non-space chars that are source-script chars. */
function sourceLeakRatio(line: string, script: SourceScript): number {
  const nonSpace = (line.match(/\S/g) || []).length
  if (nonSpace === 0 || script === 'other') return 0
  const re = script === 'cjk' ? CJK_RE : LATIN_RE
  const hits = (line.match(re) || []).length
  return hits / nonSpace
}

// ─── Glossary-miss helpers ────────────────────────────────────────────────────
// Matching reuses the editor's own `tokenize` so flags agree with what the user
// sees highlighted: it is longest-match / non-overlapping, so a generic term
// ("refinement") inside a longer proper noun ("Qi Refinement") never fires on
// its own. Comparison is whitespace-insensitive because Thai word spacing is
// optional — "ขอบเขตกลั่น ลมปราณ" must satisfy "ขอบเขตกลั่นลมปราณ".

/** Strip all whitespace — Thai spacing carries no meaning for term matching. */
function noSpace(s: string): string {
  return s.replace(/\s+/g, '')
}

/** TTS pronunciation libs are not translation rules — skip them in glossary-miss. */
function isTtsLib(file: string | undefined): boolean {
  return !!file && /at_lib|bf_lib/i.test(file)
}

// ─── Length-anomaly baseline ──────────────────────────────────────────────────
// Calibrate against THIS chapter's own median TGT/SRC length ratio, so it works
// for any language pair without hand-tuned constants.

const MIN_SRC_LEN_FOR_RATIO = 10 // ignore short lines — their ratios are noisy
const MIN_RATIO_SAMPLES = 5 // need enough lines for a stable median
const SHORT_FACTOR = 0.4 // < median * 0.4 → suspiciously truncated
const LONG_FACTOR = 2.6 // > median * 2.6 → suspiciously padded

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// ─── Main pass ────────────────────────────────────────────────────────────────

/**
 * Flag suspect rows in a line-aligned translation. Returns one entry per flagged
 * row (rows with no issue are omitted). Both SRC and TGT must be present — the
 * checks are comparative.
 */
export function computeLineFlags(
  srcContent: string,
  tgtContent: string,
  glossary: GlossaryEntry[]
): LineFlag[] {
  if (!srcContent || !tgtContent) return []

  const srcLines = srcContent.split('\n')
  const tgtLines = tgtContent.split('\n')
  const maxLen = Math.max(srcLines.length, tgtLines.length)

  const script = detectSourceScript(srcContent)

  // First pass: collect length ratios to build the chapter baseline.
  const ratios: number[] = []
  for (let i = 0; i < maxLen; i++) {
    const s = (srcLines[i] ?? '').trim()
    const t = (tgtLines[i] ?? '').trim()
    if (s.length >= MIN_SRC_LEN_FOR_RATIO && t.length > 0) ratios.push(t.length / s.length)
  }
  const medianRatio = ratios.length >= MIN_RATIO_SAMPLES ? median(ratios) : 0

  const flags: LineFlag[] = []

  for (let i = 0; i < maxLen; i++) {
    const srcLine = srcLines[i] ?? ''
    const tgtLine = tgtLines[i] ?? ''
    const s = srcLine.trim()
    const t = tgtLine.trim()

    const reasons: string[] = []
    let high = false

    // 1) Dropped line — source has content, translation is blank.
    if (s !== '' && t === '') {
      reasons.push('ยังไม่ได้แปล / บรรทัดแปลหาย')
      high = true
    }

    // 2) Extra line — translation beyond where the source ends.
    if (s === '' && t !== '' && i >= srcLines.length) {
      reasons.push('เกินจากต้นฉบับ (ไม่มีบรรทัดต้นทางคู่)')
    }

    // 3) Source leak — TGT line is largely still the source language.
    if (t !== '') {
      const ratio = sourceLeakRatio(tgtLine, script)
      if (ratio >= 0.6 && t.length >= 8) {
        reasons.push('อาจยังไม่ได้แปล (เป็นภาษาต้นฉบับเกือบทั้งบรรทัด)')
        high = true
      } else if (ratio >= 0.35 && t.length >= 12) {
        reasons.push('มีภาษาต้นฉบับปนเยอะ')
      }
    }

    // 4) Glossary miss — a known term (longest-match, like the highlighter) is in
    //    SRC but none of its Thai forms appear in TGT (whitespace-insensitive).
    if (s !== '' && t !== '') {
      const tgtNoSpace = noSpace(tgtLine)
      const seen = new Set<GlossaryEntry>()
      for (const seg of tokenize(srcLine, glossary)) {
        if (seg.kind !== 'match' || seen.has(seg.entry) || isTtsLib(seg.entry._file)) continue
        seen.add(seg.entry)
        const expected = [seg.entry.th, ...(seg.entry.alt ?? [])]
          .map((x) => noSpace(x ?? ''))
          .filter((x) => x.length > 0)
        if (expected.length > 0 && !expected.some((e) => tgtNoSpace.includes(e))) {
          reasons.push(`glossary: ${seg.entry.src} → ${seg.entry.th}`)
          high = true
        }
      }
    }

    // 5) Length anomaly — calibrated against the chapter median.
    if (medianRatio > 0 && s.length >= MIN_SRC_LEN_FOR_RATIO && t.length > 0) {
      const r = t.length / s.length
      if (r < medianRatio * SHORT_FACTOR) reasons.push('แปลสั้นกว่าปกติมาก')
      else if (r > medianRatio * LONG_FACTOR) reasons.push('แปลยาวกว่าปกติมาก')
    }

    // 6) Stutter — identical to the previous TGT line while SRC differs.
    if (t !== '' && i > 0) {
      const prevT = (tgtLines[i - 1] ?? '').trim()
      const prevS = (srcLines[i - 1] ?? '').trim()
      if (t === prevT && s !== prevS) reasons.push('ซ้ำกับบรรทัดบน')
    }

    if (reasons.length > 0) {
      flags.push({ row: i, severity: high ? 'high' : 'low', reasons })
    }
  }

  return flags
}

/**
 * Format flags for DualView's `flaggedRows` prop: row → note string. The note is
 * shown as the row tooltip; a 🔴/🟡 prefix conveys severity at a glance.
 */
export function buildFlagNoteMap(flags: LineFlag[]): Map<number, string> {
  const map = new Map<number, string>()
  for (const f of flags) {
    const icon = f.severity === 'high' ? '🔴' : '🟡'
    map.set(f.row, `${icon} ${f.reasons.join(' · ')}`)
  }
  return map
}

/** Convenience: full pipeline SRC+TGT+glossary → DualView note map. */
export function computeFlagNoteMap(
  srcContent: string,
  tgtContent: string,
  glossary: GlossaryEntry[]
): Map<number, string> {
  return buildFlagNoteMap(computeLineFlags(srcContent, tgtContent, glossary))
}
