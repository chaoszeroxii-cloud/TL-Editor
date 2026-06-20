import { mp3DurationSec } from '../mp3Duration'
import {
  baseNameNoExt,
  timelineSidecarPath,
  noAudioSidecarPath,
  lineAtTime
} from '../audioTimeline'
import type { TimelineLine } from '../audioTimeline'

// A single MPEG-2 Layer III frame, 48 kbps, 24 kHz, mono — the shape edge-tts
// emits. Header 0xFF 0xF3 0x64 0xC0; frame length = floor(72*48000/24000) = 144
// bytes; 576 samples / 24000 Hz = 0.024 s per frame.
const FRAME_LEN = 144
const FRAME_SEC = 576 / 24000

function makeMp3(frames: number, withId3 = false): Uint8Array {
  const body: number[] = []
  if (withId3) {
    // "ID3" v2.3, no flags, synchsafe size = 4 (so 4 padding bytes follow header).
    body.push(0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0, 0, 0, 0)
  }
  for (let f = 0; f < frames; f++) {
    body.push(0xff, 0xf3, 0x64, 0xc0)
    for (let k = 0; k < FRAME_LEN - 4; k++) body.push(0)
  }
  return Uint8Array.from(body)
}

describe('mp3DurationSec', () => {
  it('sums frame durations for a plain MPEG-2 L3 stream', () => {
    expect(mp3DurationSec(makeMp3(10))).toBeCloseTo(10 * FRAME_SEC, 6)
  })

  it('skips a leading ID3v2 tag', () => {
    expect(mp3DurationSec(makeMp3(5, true))).toBeCloseTo(5 * FRAME_SEC, 6)
  })

  it('returns 0 for non-MP3 bytes', () => {
    expect(mp3DurationSec(Uint8Array.from([1, 2, 3, 4, 5]))).toBe(0)
  })
})

describe('baseNameNoExt', () => {
  it('strips directory and extension on both separators', () => {
    expect(baseNameNoExt('D:/audio/chapter-12.mp3')).toBe('chapter-12')
    expect(baseNameNoExt('D:\\audio\\chapter-12.mp3')).toBe('chapter-12')
    expect(baseNameNoExt('chapter-12')).toBe('chapter-12')
  })
})

describe('timelineSidecarPath', () => {
  it('places the sidecar in a hidden .tl-editor folder, preserving separators', () => {
    expect(timelineSidecarPath('D:\\audio\\ch1.mp3')).toBe(
      'D:\\audio\\.tl-editor\\ch1.mp3.timeline.json'
    )
    expect(timelineSidecarPath('/home/a/ch1.mp3')).toBe('/home/a/.tl-editor/ch1.mp3.timeline.json')
  })

  it('returns null for blob URLs (no file on disk)', () => {
    expect(timelineSidecarPath('blob:abc-123')).toBeNull()
    expect(timelineSidecarPath('')).toBeNull()
  })
})

describe('noAudioSidecarPath', () => {
  it('derives the no-audio list path from the TGT file', () => {
    expect(noAudioSidecarPath('D:\\novel\\ch1.txt')).toBe(
      'D:\\novel\\.tl-editor\\ch1.txt.noaudio.json'
    )
    expect(noAudioSidecarPath('/home/a/ch1.txt')).toBe('/home/a/.tl-editor/ch1.txt.noaudio.json')
    expect(noAudioSidecarPath('')).toBeNull()
  })
})

describe('lineAtTime', () => {
  const lines: TimelineLine[] = [
    { row: 0, start: 0 },
    { row: 2, start: 1 }, // row 1 was a blank line, skipped
    { row: 3, start: 2.5 }
  ]

  it('returns null before the first line', () => {
    expect(lineAtTime(lines, -0.1)).toBeNull()
  })

  it('maps a time to the last line that has started', () => {
    expect(lineAtTime(lines, 0)).toBe(0)
    expect(lineAtTime(lines, 0.9)).toBe(0)
    expect(lineAtTime(lines, 1)).toBe(2)
    expect(lineAtTime(lines, 2.4)).toBe(2)
    expect(lineAtTime(lines, 2.5)).toBe(3)
    expect(lineAtTime(lines, 99)).toBe(3)
  })

  it('handles an empty timeline', () => {
    expect(lineAtTime([], 5)).toBeNull()
  })
})
