import { tokenize, countMatches } from '../highlight'
import type { GlossaryEntry } from '../../types'

describe('highlight utility', () => {
  const glossary: GlossaryEntry[] = [
    { src: 'hello', th: 'สวัสดี', type: 'other' },
    { src: 'world', th: 'โลก', type: 'other' }
  ]

  describe('tokenize', () => {
    it('should tokenize text without matches', () => {
      const result = tokenize('foo bar', glossary)
      expect(result).toHaveLength(1)
      expect(result[0].kind).toBe('text')
      expect(result[0]).toEqual({ kind: 'text', text: 'foo bar' })
    })

    it('should tokenize text with matches', () => {
      const result = tokenize('hello world', glossary)
      expect(result.length).toBeGreaterThan(1)
      const matchSegments = result.filter((s) => s.kind === 'match')
      expect(matchSegments.length).toBeGreaterThanOrEqual(2)
    })

    it('should handle case-insensitive matches', () => {
      const result = tokenize('Hello WORLD', glossary)
      const matchSegments = result.filter((s) => s.kind === 'match')
      expect(matchSegments.length).toBeGreaterThanOrEqual(2)
    })

    it('should handle empty text', () => {
      const result = tokenize('', glossary)
      expect(result).toEqual([{ kind: 'text', text: '' }])
    })

    it('should handle empty glossary', () => {
      const result = tokenize('hello world', [])
      expect(result).toEqual([{ kind: 'text', text: 'hello world' }])
    })
  })

  describe('countMatches', () => {
    it('should count matches', () => {
      const count = countMatches('hello world hello', glossary)
      expect(count).toBeGreaterThanOrEqual(2)
    })

    it('should be case-insensitive', () => {
      const count = countMatches('Hello WORLD Hello', glossary)
      expect(count).toBeGreaterThanOrEqual(2)
    })

    it('should return 0 for no matches', () => {
      const count = countMatches('foo bar', glossary)
      expect(count).toBe(0)
    })

    it('should handle empty text', () => {
      const count = countMatches('', glossary)
      expect(count).toBe(0)
    })
  })
})
