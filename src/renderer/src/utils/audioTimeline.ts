// ─── audioTimeline.ts ────────────────────────────────────────────────────────
// A per-line playback timeline for a Smart-Gen MP3: which editor row each point
// in the audio corresponds to. Smart Gen synthesises one segment per line and
// stream-copy-concats them, so it knows every line's start offset for free — we
// persist that as a sidecar next to the MP3 and reuse it during playback to
// highlight the line currently being read.
//
// Storage: `<mp3dir>/.tl-editor/<mp3name>.timeline.json`. The `.tl-editor` folder
// is hidden, so the sidecar never shows up in the file tree and is never mistaken
// for a glossary JSON (matching the convention the AI chat panel already uses).

// v2 adds the per-line `text` so the same sidecar can drive burned-in subtitles
// (MP3→MP4) without re-deriving text. v1 sidecars (no `text`) still load and
// karaoke-highlight fine; they just can't produce subtitles until regenerated.
export const AUDIO_TIMELINE_VERSION = 2

export interface TimelineLine {
  /** 0-based index into the chapter's lines (matches DualView's row index). */
  row: number
  /** Playback offset in seconds where this line starts. */
  start: number
  /** The line's display text (the raw TGT line). Optional: absent in v1 sidecars. */
  text?: string
}

export interface AudioTimeline {
  v: number
  /** MP3 basename without extension — used to confirm it matches the open chapter. */
  chapter: string
  /** Total measured duration (seconds) of all included segments. */
  totalSec: number
  lines: TimelineLine[]
}

/** Basename of a path without its directory or extension. */
export function baseNameNoExt(p: string): string {
  const slash = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  const base = slash >= 0 ? p.slice(slash + 1) : p
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

/**
 * Sidecar path for an MP3's timeline, or null for in-memory (blob:) audio that
 * has no file on disk. Preserves the original path's separator style.
 */
export function timelineSidecarPath(mp3Path: string): string | null {
  if (!mp3Path || mp3Path.startsWith('blob:')) return null
  const sep = mp3Path.includes('\\') ? '\\' : '/'
  const slash = Math.max(mp3Path.lastIndexOf('/'), mp3Path.lastIndexOf('\\'))
  const dir = slash >= 0 ? mp3Path.slice(0, slash) : '.'
  const base = slash >= 0 ? mp3Path.slice(slash + 1) : mp3Path
  return `${dir}${sep}.tl-editor${sep}${base}.timeline.json`
}

/**
 * Sidecar path for a chapter's manual "no-audio" line list (lines the user marked
 * as having no voice). Lives alongside the TGT file under the hidden `.tl-editor`
 * folder, same convention as the timeline sidecar.
 */
export function noAudioSidecarPath(tgtPath: string): string | null {
  if (!tgtPath || tgtPath.startsWith('blob:')) return null
  const sep = tgtPath.includes('\\') ? '\\' : '/'
  const slash = Math.max(tgtPath.lastIndexOf('/'), tgtPath.lastIndexOf('\\'))
  const dir = slash >= 0 ? tgtPath.slice(0, slash) : '.'
  const base = slash >= 0 ? tgtPath.slice(slash + 1) : tgtPath
  return `${dir}${sep}.tl-editor${sep}${base}.noaudio.json`
}

/**
 * The row playing at time `t` (seconds): the last line whose start is <= t.
 * Returns null before the first line. `lines` must be sorted by `start` (they
 * are, since they're built in playback order).
 */
export function lineAtTime(lines: TimelineLine[], t: number): number | null {
  if (lines.length === 0 || t < lines[0].start) return null
  let lo = 0
  let hi = lines.length - 1
  let ans = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (lines[mid].start <= t) {
      ans = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return lines[ans].row
}
