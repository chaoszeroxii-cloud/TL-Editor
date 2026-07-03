// ─── subtitles.ts ────────────────────────────────────────────────────────────
// Build an ASS subtitle track from a Smart-Gen audio timeline sidecar so the
// MP3→MP4 converter can burn synced Thai subtitles into the video.
//
// The timeline sidecar (written by the renderer's useTtsGen / audioTimeline.ts)
// lives at `<mp3dir>/.tl-editor/<mp3name>.timeline.json` and, from v2, stores
// each line's `text`. We read it here in the main process. Main can't import the
// renderer's audioTimeline.ts (separate tsconfig), so the small sidecar-path
// derivation + JSON shape are mirrored locally — the JSON contract is the real
// interface between the two halves.

import { promises as fsPromises } from 'fs'

// Minimal mirror of the renderer's AudioTimeline JSON shape (only what we read).
interface SidecarLine {
  row: number
  start: number
  text?: string
}
interface Sidecar {
  v?: number
  totalSec?: number
  lines?: SidecarLine[]
}

export interface SubLine {
  start: number
  end: number
  text: string
  /** Which ASS style to render this line in. Omitted = 'Default' (bottom captions).
   *  'CTA' is the top-banner style used by Shorts clips (see ctaLine). */
  style?: 'Default' | 'CTA'
}

// The video is scaled/padded to this canvas before subtitles are drawn, so the
// ASS PlayResX/Y match and Fontsize stays predictable across any cover image.
export const SUB_CANVAS_W = 1280
export const SUB_CANVAS_H = 720

// Max non-combining characters per subtitle line before we wrap. libass can't
// line-break inside spaceless Thai, so without this a long line runs off-screen.
// Budgeted for the widest bundled font at fontsize 56 within the 1280-w canvas.
export const MAX_SUB_UNITS = 42

// Vertical (9:16) canvas for Shorts clips — matches the portrait cover art almost
// exactly (typical covers are ~1536x2752 ≈ 0.558, vs. 1080x1920 = 0.5625), so the
// crop-to-fill in external.ts barely crops anything. Font is bigger than the
// landscape preset (close-up phone viewing); maxSubUnits is narrower (1080 vs
// 1280 wide canvas) — tuned against a real render, not derived by formula.
export const SHORTS_CANVAS_W = 1080
export const SHORTS_CANVAS_H = 1920
export const SHORTS_FONT_SIZE = 64
export const SHORTS_MAX_SUB_UNITS = 26

/** Optional per-call overrides for buildAss's ASS header/wrap budget. Omitted
 *  fields fall back to the original landscape (1280x720) constants above, so
 *  existing callers (convert-mp3-to-mp4) get byte-identical output. */
export interface AssBuildOpts {
  canvasW?: number
  canvasH?: number
  fontSize?: number
  marginL?: number
  marginR?: number
  marginV?: number
  maxSubUnits?: number
  outline?: number
}

// Shared vertical (9:16) caption style — used both by Shorts clips and by the
// main MP3→MP4 pipeline's "แนวตั้ง" orientation, so a full-episode vertical
// export and a Shorts cut from the same chapter look visually consistent.
export const VERTICAL_ASS_STYLE: AssBuildOpts = {
  canvasW: SHORTS_CANVAS_W,
  canvasH: SHORTS_CANVAS_H,
  fontSize: SHORTS_FONT_SIZE,
  maxSubUnits: SHORTS_MAX_SUB_UNITS,
  marginL: 48,
  marginR: 48,
  marginV: 160,
  outline: 5
}

// Thai marks that stack above/below the base glyph: they add no horizontal width,
// so they don't count toward the wrap budget and must never begin a new line.
// = mai han-akat (0E31), upper/lower vowels (0E34–0E3A), tone marks etc. (0E47–0E4E).
// Deliberately excludes sara aa (0E32) and sara am (0E33), which DO take width.
const THAI_COMBINING = /[ัิ-ฺ็-๎]/

/** Seconds → ASS timecode `h:mm:ss.cs` (centiseconds). */
export function assTime(sec: number): string {
  const cs = Math.round(Math.max(0, sec) * 100)
  const h = Math.floor(cs / 360000)
  const m = Math.floor((cs % 360000) / 6000)
  const s = Math.floor((cs % 6000) / 100)
  const c = cs % 100
  const p2 = (n: number): string => String(n).padStart(2, '0')
  return `${h}:${p2(m)}:${p2(s)}.${p2(c)}`
}

/** Escape a line for an ASS Dialogue cell: drop braces (ASS override blocks)
 *  and turn hard newlines into the soft break `\N`. */
export function escapeAssText(text: string): string {
  return text.replace(/[{}]/g, '').replace(/\r?\n/g, '\\N').trim()
}

// Line-width budget counts only chars that advance the pen — spaces and stacking
// marks take no horizontal room.
function subtitleUnits(s: string): number {
  return Array.from(s).filter((c) => c !== ' ' && !THAI_COMBINING.test(c)).length
}

// Word/segment boundaries for natural breaks. Thai writes words without spaces, so
// we use Intl.Segmenter's dictionary segmentation (built into V8/ICU) to find
// them; if it's unavailable we fall back to splitting on whitespace only. Typed
// loosely so it compiles even when the TS lib lacks Intl.Segmenter.
function segmentWords(text: string): string[] {
  const I = Intl as typeof Intl & {
    Segmenter?: new (
      locale: string,
      opts: { granularity: string }
    ) => { segment: (s: string) => Iterable<{ segment: string }> }
  }
  if (typeof I.Segmenter !== 'function') return text.split(/(\s+)/).filter((s) => s !== '')
  try {
    return Array.from(
      new I.Segmenter('th', { granularity: 'word' }).segment(text),
      (s) => s.segment
    )
  } catch {
    return text.split(/(\s+)/).filter((s) => s !== '')
  }
}

// Cluster-safe hard split for a single token wider than a whole line (e.g. a long
// spaceless run the segmenter couldn't divide): break at unit boundaries but never
// right before a stacking mark, so a vowel/tone is never orphaned onto a new line.
function hardSplit(token: string, maxUnits: number): string[] {
  const chars = Array.from(token)
  const pieces: string[] = []
  let cur = ''
  let units = 0
  for (let i = 0; i < chars.length; i++) {
    cur += chars[i]
    if (!THAI_COMBINING.test(chars[i])) units++
    const next = chars[i + 1]
    if (units >= maxUnits && (next === undefined || !THAI_COMBINING.test(next))) {
      pieces.push(cur)
      cur = ''
      units = 0
    }
  }
  if (cur !== '') pieces.push(cur)
  return pieces
}

/**
 * Wrap a subtitle line into multiple display lines joined by ASS `\N`. libass
 * can't break inside spaceless Thai, so a long line would run off the frame. We
 * break at *word* boundaries (Intl.Segmenter) so the wrap reads naturally — never
 * mid-word like a raw character cap — and only hard-split a single token that is
 * itself wider than the budget. Width is counted in non-combining characters.
 */
export function wrapForSubtitle(text: string, maxUnits: number = MAX_SUB_UNITS): string {
  const lines: string[] = []
  let line = ''
  let units = 0
  const flush = (): void => {
    if (line.trim() !== '') lines.push(line.trim())
    line = ''
    units = 0
  }

  for (const seg of segmentWords(text)) {
    const segUnits = subtitleUnits(seg)
    if (segUnits > maxUnits) {
      flush()
      for (const piece of hardSplit(seg, maxUnits)) lines.push(piece)
      continue
    }
    if (units + segUnits > maxUnits && line.trim() !== '') flush()
    line += seg
    units += segUnits
  }
  flush()
  return lines.join('\\N')
}

/**
 * Turn timeline lines into timed subtitle cells: each line ends when the next
 * begins; the last ends at `totalSec` (clamped to at least start + 0.1s). Lines
 * without text (v1 sidecars) are dropped.
 */
export function endTimesFromTimeline(lines: SidecarLine[], totalSec: number): SubLine[] {
  const withText = lines.filter((l) => typeof l.text === 'string' && l.text.trim() !== '')
  return withText.map((l, i) => {
    const next = withText[i + 1]
    const rawEnd = next ? next.start : Math.max(totalSec, l.start + 1)
    return { start: l.start, end: Math.max(rawEnd, l.start + 0.1), text: l.text!.trim() }
  })
}

/**
 * Keep only the lines overlapping `[startSec, endSec)`, shifting their times so
 * the range starts at 0 and clamping so nothing runs past the clip's own length.
 * Used to carve a Shorts clip's captions out of a full chapter's timeline.
 */
export function sliceAndShiftLines(lines: SubLine[], startSec: number, endSec: number): SubLine[] {
  const dur = Math.max(0, endSec - startSec)
  const out: SubLine[] = []
  for (const l of lines) {
    if (l.end <= startSec || l.start >= endSec) continue
    const start = Math.max(0, l.start - startSec)
    const end = Math.min(dur, l.end - startSec)
    if (end <= start) continue
    out.push({ start, end, text: l.text, style: l.style })
  }
  return out
}

/**
 * A top-banner call-to-action line ("ตอนเต็มในช่อง…") shown only in the final
 * `windowSec` of a Shorts clip, so it doesn't compete with the regular bottom
 * captions for most of the clip. Alignment 8 (top-center) in the CTA style keeps
 * it clear of the Default (bottom-center) captions even when both are on screen
 * at once in those last seconds.
 */
export function ctaLine(text: string, clipDurSec: number, windowSec = 3): SubLine {
  const start = Math.max(0, clipDurSec - windowSec)
  return { start, end: clipDurSec, text, style: 'CTA' }
}

// White Sarabun (regular weight) with a soft black outline, bottom-center — clean
// and readable for Thai novel narration. Sarabun is bundled under resources/tools/
// fonts and loaded via the subtitles filter's fontsdir (it isn't a system font);
// the ffmpeg build's libass uses Windows DirectWrite to stack Thai tone marks
// above the upper vowels correctly.
// Colours are ASS &HAABBGGRR (AA: 00=opaque … FF=transparent): white fill, and a
// 60%-opaque black outline (&H66 ≈ 40% transparent) so the border reads softer
// than a solid black. Bold is 0 (the user prefers regular weight).
// A second style, CTA, is always declared alongside Default (unused unless a
// caller emits a `style:'CTA'` line — see ctaLine): bold gold text, top-center,
// for the Shorts "ดูต่อ EP ถัดไป" banner.
function buildAssHeader(opts?: AssBuildOpts): string {
  const canvasW = opts?.canvasW ?? SUB_CANVAS_W
  const canvasH = opts?.canvasH ?? SUB_CANVAS_H
  const fontSize = opts?.fontSize ?? 56
  const marginL = opts?.marginL ?? 80
  const marginR = opts?.marginR ?? 80
  const marginV = opts?.marginV ?? 70
  const outline = opts?.outline ?? 4
  const ctaFontSize = Math.round(fontSize * 0.8)
  return `[Script Info]
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
PlayResX: ${canvasW}
PlayResY: ${canvasH}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Sarabun,${fontSize},&H00FFFFFF,&H000000FF,&H66000000,&H64000000,0,0,0,0,100,100,0,0,1,${outline},1,2,${marginL},${marginR},${marginV},0
Style: CTA,Sarabun,${ctaFontSize},&H0000D7FF,&H000000FF,&H66000000,&H64000000,-1,0,0,0,100,100,0,0,1,${outline},1,8,${marginL},${marginR},60,0

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, Effect, Text
`
}

/** Build a full ASS document from timed subtitle lines. Pure. Omit `opts` for
 *  the original landscape (1280×720) preset — existing callers (convert-mp3-to-mp4)
 *  get byte-identical output. */
export function buildAss(lines: SubLine[], opts?: AssBuildOpts): string {
  const maxSubUnits = opts?.maxSubUnits ?? MAX_SUB_UNITS
  const dialogues = lines
    .map((l) => {
      const text = wrapForSubtitle(escapeAssText(l.text), maxSubUnits)
      const style = l.style ?? 'Default'
      return `Dialogue: 0,${assTime(l.start)},${assTime(l.end)},${style},,0,0,,${text}`
    })
    .join('\n')
  return buildAssHeader(opts) + dialogues + '\n'
}

/** Sidecar path for an MP3 (mirrors renderer audioTimeline.timelineSidecarPath). */
export function timelineSidecarPathFor(mp3Path: string): string | null {
  if (!mp3Path || mp3Path.startsWith('blob:')) return null
  const sep = mp3Path.includes('\\') ? '\\' : '/'
  const slash = Math.max(mp3Path.lastIndexOf('/'), mp3Path.lastIndexOf('\\'))
  const dir = slash >= 0 ? mp3Path.slice(0, slash) : '.'
  const base = slash >= 0 ? mp3Path.slice(slash + 1) : mp3Path
  return `${dir}${sep}.tl-editor${sep}${base}.timeline.json`
}

/**
 * Read an MP3's timeline sidecar off disk. Returns null when there's no
 * sidecar, it's unreadable, or missing/empty `lines`.
 */
export async function readTimelineSidecar(
  mp3Path: string
): Promise<{ totalSec: number; lines: SidecarLine[] } | null> {
  const sidecarPath = timelineSidecarPathFor(mp3Path)
  if (!sidecarPath) return null
  let data: Sidecar
  try {
    data = JSON.parse(await fsPromises.readFile(sidecarPath, 'utf-8')) as Sidecar
  } catch {
    return null
  }
  const lines = Array.isArray(data.lines) ? data.lines : []
  if (lines.length === 0) return null
  return { totalSec: typeof data.totalSec === 'number' ? data.totalSec : 0, lines }
}

/**
 * Read an MP3's timeline sidecar and render it to an ASS document. Returns null
 * when there's no sidecar, it's unreadable, or it has no per-line text (a v1
 * sidecar) — callers then convert without subtitles, exactly as before.
 * `orientation` picks the caption preset: 'landscape' (default, omit it) is the
 * original 1280×720 style — byte-identical for existing callers; 'vertical' uses
 * the shared 1080×1920 Shorts-style preset for the "แนวตั้ง" MP3→MP4 option.
 */
export async function assFromMp3Path(
  mp3Path: string,
  orientation: 'landscape' | 'vertical' = 'landscape'
): Promise<string | null> {
  const sidecar = await readTimelineSidecar(mp3Path)
  if (!sidecar) return null
  const subs = endTimesFromTimeline(sidecar.lines, sidecar.totalSec)
  if (subs.length === 0) return null
  return orientation === 'vertical' ? buildAss(subs, VERTICAL_ASS_STYLE) : buildAss(subs)
}

/**
 * Build the ASS document for a Shorts clip: the [startSec, endSec) slice of an
 * MP3's timeline, time-shifted to start at 0, with an optional CTA banner in the
 * final 3 seconds. Uses the vertical Shorts canvas/font/wrap-budget presets.
 * Returns null when there's no usable sidecar or the range has no captioned line.
 */
export async function assForShortClip(
  mp3Path: string,
  startSec: number,
  endSec: number,
  ctaText?: string
): Promise<string | null> {
  const sidecar = await readTimelineSidecar(mp3Path)
  if (!sidecar) return null
  const fullSubs = endTimesFromTimeline(sidecar.lines, sidecar.totalSec)
  const sliced = sliceAndShiftLines(fullSubs, startSec, endSec)
  if (sliced.length === 0) return null
  const clipDur = endSec - startSec
  const withCta = ctaText?.trim() ? [...sliced, ctaLine(ctaText.trim(), clipDur)] : sliced
  return buildAss(withCta, VERTICAL_ASS_STYLE)
}
