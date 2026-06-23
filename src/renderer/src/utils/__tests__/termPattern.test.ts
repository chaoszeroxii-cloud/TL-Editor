import { termPattern, allowSuffixExpansion } from '../termPattern'

const matches = (src: string, text: string): boolean =>
  new RegExp(termPattern(src), 'gi').test(text)

describe('termPattern', () => {
  describe('short Latin terms do NOT get suffix expansion', () => {
    it('"I" (→ ข้า) matches the word "I" but NOT "is"', () => {
      expect(matches('I', 'I am here')).toBe(true)
      expect(matches('I', 'his body is injured')).toBe(false)
    })

    it('"a" does NOT match "as"', () => {
      expect(matches('a', 'a sword')).toBe(true)
      expect(matches('a', 'as expected')).toBe(false)
    })

    it('two-letter terms match exactly, no plural', () => {
      expect(allowSuffixExpansion('Qi')).toBe(false)
      expect(matches('Qi', 'cultivate Qi')).toBe(true)
      expect(matches('Qi', 'Qis')).toBe(false)
    })
  })

  describe('real words (≥3 letters) keep inflection matching', () => {
    it('matches plural and verb suffixes', () => {
      expect(allowSuffixExpansion('sword')).toBe(true)
      expect(matches('sword', 'two swords')).toBe(true)
      expect(matches('beast', 'the beasts roared')).toBe(true)
    })

    it('handles e-drop forms', () => {
      expect(matches('refine', 'he is refining')).toBe(true)
      expect(matches('refine', 'fully refined')).toBe(true)
    })
  })

  describe('non-Latin terms', () => {
    it('match without word boundaries or suffixes', () => {
      expect(matches('พลังปราณ', 'การพลังปราณนั้น')).toBe(true)
    })
  })
})
