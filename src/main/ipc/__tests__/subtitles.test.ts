import { promises as fsPromises } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  assTime,
  escapeAssText,
  wrapForSubtitle,
  endTimesFromTimeline,
  sliceAndShiftLines,
  ctaLine,
  buildAss,
  timelineSidecarPathFor,
  readTimelineSidecar,
  assFromMp3Path,
  assForShortClip
} from '../subtitles'

describe('assTime', () => {
  it('formats seconds as h:mm:ss.cs (centiseconds)', () => {
    expect(assTime(0)).toBe('0:00:00.00')
    expect(assTime(2.5)).toBe('0:00:02.50')
    expect(assTime(65.07)).toBe('0:01:05.07')
    expect(assTime(3661.234)).toBe('1:01:01.23')
  })

  it('clamps negatives to zero', () => {
    expect(assTime(-1)).toBe('0:00:00.00')
  })
})

describe('escapeAssText', () => {
  it('drops ASS override braces and converts newlines to \\N', () => {
    expect(escapeAssText('a{b}c')).toBe('abc')
    expect(escapeAssText('line1\nline2')).toBe('line1\\Nline2')
    expect(escapeAssText('  spaced  ')).toBe('spaced')
  })
})

describe('wrapForSubtitle', () => {
  it('leaves a short line untouched (no \\N)', () => {
    expect(wrapForSubtitle('สวัสดีครับ', 42)).toBe('สวัสดีครับ')
    expect(wrapForSubtitle('abc', 10)).toBe('abc')
  })

  it('breaks at the last space within budget', () => {
    expect(wrapForSubtitle('aa bb cc dd', 5)).toBe('aa bb\\Ncc dd')
  })

  it('hard-breaks a spaceless run that exceeds the budget', () => {
    const wrapped = wrapForSubtitle('aaaaaaaa', 3)
    const lines = wrapped.split('\\N')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.every((l) => l.length > 0)).toBe(true)
  })

  it('never starts a line with a Thai combining mark and never drops characters', () => {
    const text = 'ที่นี้น้ำผึ้งสิ้นปี๊บนั้นผู้เฒ่ากลั้วคั่วอินฟินิตี้'
    const wrapped = wrapForSubtitle(text, 8)
    const lines = wrapped.split('\\N')
    expect(lines.length).toBeGreaterThan(1)
    // No wrapped line may begin with a stacking vowel/tone mark (would orphan it).
    expect(lines.every((l) => !/^[ัิ-ฺ็-๎]/.test(l))).toBe(true)
    // Breaking only drops break-spaces; every non-space glyph survives.
    expect(wrapped.split('\\N').join('').replace(/ /g, '')).toBe(text.replace(/ /g, ''))
  })
})

describe('endTimesFromTimeline', () => {
  it('ends each line where the next starts; last line ends at totalSec', () => {
    const subs = endTimesFromTimeline(
      [
        { row: 0, start: 0, text: 'หนึ่ง' },
        { row: 2, start: 2, text: 'สอง' },
        { row: 3, start: 5, text: 'สาม' }
      ],
      8
    )
    expect(subs).toEqual([
      { start: 0, end: 2, text: 'หนึ่ง' },
      { start: 2, end: 5, text: 'สอง' },
      { start: 5, end: 8, text: 'สาม' }
    ])
  })

  it('drops lines without text (v1 sidecars)', () => {
    const subs = endTimesFromTimeline(
      [
        { row: 0, start: 0, text: 'มี' },
        { row: 1, start: 1 },
        { row: 2, start: 2, text: '   ' }
      ],
      3
    )
    expect(subs).toHaveLength(1)
    expect(subs[0].text).toBe('มี')
  })

  it('guarantees a minimum visible duration for the last line', () => {
    const subs = endTimesFromTimeline([{ row: 0, start: 5, text: 'จบ' }], 0)
    expect(subs[0].end).toBeGreaterThan(subs[0].start)
  })
})

describe('sliceAndShiftLines', () => {
  const lines = [
    { start: 0, end: 2, text: 'หนึ่ง' },
    { start: 2, end: 5, text: 'สอง' },
    { start: 5, end: 8, text: 'สาม' },
    { start: 8, end: 12, text: 'สี่' }
  ]

  it('keeps only lines overlapping the range and shifts them to start at 0', () => {
    expect(sliceAndShiftLines(lines, 2, 8)).toEqual([
      { start: 0, end: 3, text: 'สอง' },
      { start: 3, end: 6, text: 'สาม' }
    ])
  })

  it('clamps a partially-overlapping edge line to the range boundary', () => {
    // range [1, 6) starts mid-way through "หนึ่ง" (0-2) and ends mid-way
    // through "สาม" (5-8) — both should be clamped, not dropped.
    const sliced = sliceAndShiftLines(lines, 1, 6)
    expect(sliced[0]).toEqual({ start: 0, end: 1, text: 'หนึ่ง' })
    expect(sliced[sliced.length - 1]).toEqual({ start: 4, end: 5, text: 'สาม' })
  })

  it('returns an empty array when the range has no lines', () => {
    expect(sliceAndShiftLines(lines, 20, 25)).toEqual([])
  })

  it('preserves each line\'s style tag', () => {
    const withStyle = [{ start: 0, end: 3, text: 'x', style: 'CTA' as const }]
    expect(sliceAndShiftLines(withStyle, 0, 3)[0].style).toBe('CTA')
  })
})

describe('ctaLine', () => {
  it('spans only the final `windowSec` of the clip, styled CTA', () => {
    const l = ctaLine('ดูต่อ EP ถัดไป', 30, 3)
    expect(l).toEqual({ start: 27, end: 30, text: 'ดูต่อ EP ถัดไป', style: 'CTA' })
  })

  it('clamps the start to 0 for a clip shorter than the window', () => {
    const l = ctaLine('CTA', 2, 3)
    expect(l.start).toBe(0)
    expect(l.end).toBe(2)
  })
})

describe('buildAss', () => {
  const ass = buildAss([
    { start: 0, end: 2.5, text: 'สวัสดี' },
    { start: 2.5, end: 4, text: 'ครับ{x}' }
  ])

  it('emits a styled v4.00+ header with the chosen Default style', () => {
    expect(ass).toContain('ScriptType: v4.00+')
    expect(ass).toContain('PlayResX: 1280')
    expect(ass).toContain('[V4+ Styles]')
    expect(ass).toMatch(/Style: Default,Sarabun,56,/)
  })

  it('always declares a CTA style alongside Default, even when unused', () => {
    expect(ass).toMatch(/Style: CTA,Sarabun,/)
  })

  it('emits one Dialogue per line with correct timecodes and escaped text', () => {
    const dialogues = ass.split('\n').filter((l) => l.startsWith('Dialogue:'))
    expect(dialogues).toHaveLength(2)
    expect(dialogues[0]).toBe('Dialogue: 0,0:00:00.00,0:00:02.50,Default,,0,0,,สวัสดี')
    expect(dialogues[1]).toBe('Dialogue: 0,0:00:02.50,0:00:04.00,Default,,0,0,,ครับx')
  })

  it('routes a `style: CTA` line to the CTA style name in its Dialogue line', () => {
    const withCta = buildAss([{ start: 0, end: 3, text: 'ตอนเต็มในช่อง', style: 'CTA' }])
    expect(withCta).toContain('Dialogue: 0,0:00:00.00,0:00:03.00,CTA,,0,0,,ตอนเต็มในช่อง')
  })

  it('applies canvas/fontSize/maxSubUnits overrides without touching the default preset', () => {
    const vertical = buildAss([{ start: 0, end: 1, text: 'x' }], {
      canvasW: 1080,
      canvasH: 1920,
      fontSize: 64,
      maxSubUnits: 26
    })
    expect(vertical).toContain('PlayResX: 1080')
    expect(vertical).toContain('PlayResY: 1920')
    expect(vertical).toMatch(/Style: Default,Sarabun,64,/)
    // The original landscape default (no opts) is unaffected.
    expect(ass).toContain('PlayResX: 1280')
  })
})

describe('timelineSidecarPathFor', () => {
  it('mirrors the renderer sidecar path on both separators', () => {
    expect(timelineSidecarPathFor('D:\\a\\ch1.mp3')).toBe(
      'D:\\a\\.tl-editor\\ch1.mp3.timeline.json'
    )
    expect(timelineSidecarPathFor('/home/a/ch1.mp3')).toBe(
      '/home/a/.tl-editor/ch1.mp3.timeline.json'
    )
  })

  it('returns null for blob/empty paths', () => {
    expect(timelineSidecarPathFor('blob:x')).toBeNull()
    expect(timelineSidecarPathFor('')).toBeNull()
  })
})

describe('assFromMp3Path', () => {
  let dir: string
  beforeAll(async () => {
    dir = await fsPromises.mkdtemp(join(tmpdir(), 'tlsub-test-'))
    await fsPromises.mkdir(join(dir, '.tl-editor'), { recursive: true })
  })
  afterAll(async () => {
    await fsPromises.rm(dir, { recursive: true, force: true })
  })

  async function writeSidecar(name: string, json: unknown): Promise<string> {
    const mp3 = join(dir, name)
    await fsPromises.writeFile(
      join(dir, '.tl-editor', `${name}.timeline.json`),
      JSON.stringify(json)
    )
    return mp3
  }

  it('renders an ASS doc from a v2 sidecar with per-line text', async () => {
    const mp3 = await writeSidecar('a.mp3', {
      v: 2,
      totalSec: 4,
      lines: [
        { row: 0, start: 0, text: 'บรรทัดแรก' },
        { row: 1, start: 2, text: 'บรรทัดสอง' }
      ]
    })
    const ass = await assFromMp3Path(mp3)
    expect(ass).toContain('บรรทัดแรก')
    expect(ass).toContain('บรรทัดสอง')
    expect((ass || '').split('\n').filter((l) => l.startsWith('Dialogue:'))).toHaveLength(2)
  })

  it('returns null for a v1 sidecar (no text)', async () => {
    const mp3 = await writeSidecar('b.mp3', {
      v: 1,
      totalSec: 2,
      lines: [{ row: 0, start: 0 }]
    })
    expect(await assFromMp3Path(mp3)).toBeNull()
  })

  it('returns null when the sidecar is missing', async () => {
    expect(await assFromMp3Path(join(dir, 'nope.mp3'))).toBeNull()
  })

  it('uses the vertical (1080×1920) preset when orientation is "vertical"', async () => {
    const mp3 = await writeSidecar('c.mp3', {
      v: 2,
      totalSec: 2,
      lines: [{ row: 0, start: 0, text: 'แนวตั้ง' }]
    })
    const landscape = await assFromMp3Path(mp3)
    const vertical = await assFromMp3Path(mp3, 'vertical')
    expect(landscape).toContain('PlayResX: 1280')
    expect(vertical).toContain('PlayResX: 1080')
    expect(vertical).toContain('PlayResY: 1920')
  })
})

describe('readTimelineSidecar', () => {
  let dir: string
  beforeAll(async () => {
    dir = await fsPromises.mkdtemp(join(tmpdir(), 'tlsub-sidecar-test-'))
    await fsPromises.mkdir(join(dir, '.tl-editor'), { recursive: true })
  })
  afterAll(async () => {
    await fsPromises.rm(dir, { recursive: true, force: true })
  })

  it('returns totalSec + lines for a valid sidecar', async () => {
    const mp3 = join(dir, 'a.mp3')
    await fsPromises.writeFile(
      join(dir, '.tl-editor', 'a.mp3.timeline.json'),
      JSON.stringify({ v: 2, totalSec: 5, lines: [{ row: 0, start: 0, text: 'x' }] })
    )
    expect(await readTimelineSidecar(mp3)).toEqual({
      totalSec: 5,
      lines: [{ row: 0, start: 0, text: 'x' }]
    })
  })

  it('returns null when lines is empty or missing', async () => {
    const mp3 = join(dir, 'empty.mp3')
    await fsPromises.writeFile(
      join(dir, '.tl-editor', 'empty.mp3.timeline.json'),
      JSON.stringify({ v: 2, totalSec: 0, lines: [] })
    )
    expect(await readTimelineSidecar(mp3)).toBeNull()
  })
})

describe('assForShortClip', () => {
  let dir: string
  beforeAll(async () => {
    dir = await fsPromises.mkdtemp(join(tmpdir(), 'tlsub-shorts-test-'))
    await fsPromises.mkdir(join(dir, '.tl-editor'), { recursive: true })
    await fsPromises.writeFile(
      join(dir, '.tl-editor', 'ch.mp3.timeline.json'),
      JSON.stringify({
        v: 2,
        totalSec: 12,
        lines: [
          { row: 0, start: 0, text: 'บทนำ' },
          { row: 1, start: 3, text: 'จุดพีค' },
          { row: 2, start: 6, text: 'คลิฟแฮงเกอร์' },
          { row: 3, start: 9, text: 'ท้ายบท' }
        ]
      })
    )
  })
  afterAll(async () => {
    await fsPromises.rm(dir, { recursive: true, force: true })
  })

  it('builds a vertical-canvas ASS containing only the selected, time-shifted range', async () => {
    const mp3 = join(dir, 'ch.mp3')
    const ass = await assForShortClip(mp3, 3, 9)
    expect(ass).toContain('PlayResX: 1080')
    expect(ass).toContain('จุดพีค')
    expect(ass).toContain('คลิฟแฮงเกอร์')
    expect(ass).not.toContain('บทนำ')
    expect(ass).not.toContain('ท้ายบท')
    // Time-shifted: "จุดพีค" started at 3s in the chapter, so at 0s in the clip.
    expect(ass).toContain('Dialogue: 0,0:00:00.00,')
  })

  it('appends a CTA line in the final 3 seconds when ctaText is given', async () => {
    const mp3 = join(dir, 'ch.mp3')
    const ass = await assForShortClip(mp3, 0, 12, 'ดูต่อ EP ถัดไป')
    expect(ass).toContain('Dialogue: 0,0:00:09.00,0:00:12.00,CTA,,0,0,,ดูต่อ EP ถัดไป')
  })

  it('omits the CTA line when ctaText is empty/omitted', async () => {
    const mp3 = join(dir, 'ch.mp3')
    const ass = await assForShortClip(mp3, 0, 12)
    expect(ass).not.toContain(',CTA,')
  })

  it('returns null when the range has no captioned line', async () => {
    const mp3 = join(dir, 'ch.mp3')
    expect(await assForShortClip(mp3, 100, 105)).toBeNull()
  })
})
