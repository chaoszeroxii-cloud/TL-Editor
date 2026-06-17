import { computeLineFlags, buildFlagNoteMap } from '../reviewFlags'
import type { GlossaryEntry } from '../../types'

describe('reviewFlags', () => {
  const glossary: GlossaryEntry[] = [
    { src: 'Aric', th: 'อาริค' },
    { src: 'dragon', th: 'มังกร', alt: ['พญามังกร'] }
  ]

  it('returns no flags for a clean, well-aligned translation', () => {
    const src = ['Aric saw the dragon.', 'It was a quiet morning.'].join('\n')
    const tgt = ['อาริคเห็นมังกรตัวนั้น', 'เช้าวันนั้นเงียบสงบ'].join('\n')
    expect(computeLineFlags(src, tgt, glossary)).toEqual([])
  })

  it('flags a dropped (untranslated-blank) line as high severity', () => {
    const src = ['First sentence here.', 'Second sentence here.'].join('\n')
    const tgt = ['ประโยคแรกอยู่ตรงนี้', ''].join('\n')
    const flags = computeLineFlags(src, tgt, [])
    const dropped = flags.find((f) => f.row === 1)
    expect(dropped?.severity).toBe('high')
    expect(dropped?.reasons.join()).toMatch(/แปลหาย|ยังไม่ได้แปล/)
  })

  it('flags a line left in the source language (source leak)', () => {
    const src = ['The knight drew his sword.', 'He charged forward.'].join('\n')
    const tgt = ['อัศวินชักดาบออกมา', 'He charged forward.'].join('\n')
    const flags = computeLineFlags(src, tgt, [])
    const leak = flags.find((f) => f.row === 1)
    expect(leak).toBeDefined()
    expect(leak?.severity).toBe('high')
  })

  it('flags a glossary term whose Thai form is missing in TGT', () => {
    const src = ['Aric fought bravely today.'].join('\n')
    // "อาริค" is absent — the translator dropped the name's agreed form.
    const tgt = ['เขาสู้อย่างกล้าหาญในวันนี้'].join('\n')
    const flags = computeLineFlags(src, tgt, glossary)
    expect(flags[0]?.severity).toBe('high')
    expect(flags[0]?.reasons.join()).toMatch(/glossary/)
  })

  it('accepts an alternative Thai form for a glossary term', () => {
    const src = ['The dragon roared loudly.'].join('\n')
    const tgt = ['พญามังกรคำรามเสียงดัง'].join('\n') // uses alt form
    expect(computeLineFlags(src, tgt, glossary)).toEqual([])
  })

  it('does not flag a generic term that is a substring of a longer proper noun', () => {
    // "refinement → ขัดเกลา" must NOT fire when "Qi Refinement" (its own entry,
    // correctly translated) covers it — longest-match wins, like the highlighter.
    const g: GlossaryEntry[] = [
      { src: 'Qi Refinement', th: 'ขอบเขตกลั่นลมปราณ', path: ['Realm'] },
      { src: 'refinement', th: 'ขัดเกลา' }
    ]
    const src = 'there were still 17 Qi Refinement realm disciples left.'
    const tgt = 'ยังคงเหลือศิษย์ขอบเขตกลั่นลมปราณอยู่สิบเจ็ดคน'
    expect(computeLineFlags(src, tgt, g)).toEqual([])
  })

  it('matches a Thai glossary form regardless of word spacing', () => {
    const g: GlossaryEntry[] = [{ src: 'Qi Refinement', th: 'ขอบเขตกลั่นลมปราณ' }]
    const src = '17 Qi Refinement disciples'
    const tgt = 'ศิษย์ขอบเขตกลั่น ลมปราณ สิบเจ็ดคน' // space inside the term
    expect(computeLineFlags(src, tgt, g)).toEqual([])
  })

  it('ignores TTS pronunciation libs (at_lib/bf_lib) in glossary-miss', () => {
    const g: GlossaryEntry[] = [{ src: 'Aric', th: 'อาริค', _file: 'at_lib.json' }]
    const src = 'Aric walked away.'
    const tgt = 'เขาเดินจากไป' // "อาริค" absent, but it's a pronunciation lib → no flag
    expect(computeLineFlags(src, tgt, g)).toEqual([])
  })

  it('flags a stutter (TGT repeats previous line while SRC differs)', () => {
    const src = ['He walked to the door.', 'She opened the window.'].join('\n')
    const tgt = ['เขาเดินไปที่ประตู', 'เขาเดินไปที่ประตู'].join('\n')
    const flags = computeLineFlags(src, tgt, [])
    expect(flags.find((f) => f.row === 1)?.reasons.join()).toMatch(/ซ้ำ/)
  })

  it('handles empty input without throwing', () => {
    expect(computeLineFlags('', '', glossary)).toEqual([])
    expect(computeLineFlags('hello', '', glossary)).toEqual([])
  })

  it('buildFlagNoteMap prefixes severity icons', () => {
    const map = buildFlagNoteMap([
      { row: 2, severity: 'high', reasons: ['ยังไม่ได้แปล'] },
      { row: 5, severity: 'low', reasons: ['แปลสั้นกว่าปกติมาก'] }
    ])
    expect(map.get(2)).toMatch(/^🔴/)
    expect(map.get(5)).toMatch(/^🟡/)
  })
})
