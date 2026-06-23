import { preprocessForTtsFromRecords } from '../ttsPreprocess'

describe('preprocessForTtsFromRecords — longest-match-wins', () => {
  const atLib = {
    เทพเจ้า: '|เทพ|พะ|จ้าว|',
    เทพ: '|เทพ|',
    พลังปราณ: '|พลัง|ปราณ|'
  }

  it('prefers พลังปราณ over เทพ when they share the "พ"', () => {
    // "เทพลังปราณ": เทพ(0..2) and พลังปราณ(2..9) overlap at the "พ"
    const out = preprocessForTtsFromRecords('การเทพลังปราณจำนวนมหาศาล', {}, atLib)
    expect(out).toBe('การเท|พลัง|ปราณ|จำนวนมหาศาล')
  })

  it('still picks the longest key when several start at the same position', () => {
    const out = preprocessForTtsFromRecords('เทพเจ้าผู้ยิ่งใหญ่', {}, atLib)
    expect(out).toBe('|เทพ|พะ|จ้าว|ผู้ยิ่งใหญ่')
  })

  it('matches both when keys do not overlap', () => {
    const out = preprocessForTtsFromRecords('เทพพลังปราณ', {}, atLib)
    expect(out).toBe('|เทพ||พลัง|ปราณ|')
  })

  it('returns text unchanged when no keys match', () => {
    const out = preprocessForTtsFromRecords('สวัสดีครับ', {}, atLib)
    expect(out).toBe('สวัสดีครับ')
  })
})
