import {
  parseFlatJson,
  parseNestedJson,
  serializeFlatJson,
  serializeToNested,
  hasNestedPaths,
  DEFAULT_GLOSSARY_FORMAT
} from '../glossaryParsers'

describe('glossaryParsers', () => {
  describe('parseFlatJson', () => {
    it('should parse flat JSON format', () => {
      const input = { hello: 'สวัสดี', goodbye: 'ลาก่อน' }
      const result = parseFlatJson(input)
      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        src: 'hello',
        th: 'สวัสดี',
        type: 'other'
      })
    })

    it('should skip empty entries', () => {
      const input = { hello: 'สวัสดี', empty: '' }
      const result = parseFlatJson(input)
      expect(result).toHaveLength(1)
    })
  })

  describe('parseNestedJson', () => {
    it('should parse nested JSON with default format', () => {
      const input = {
        greeting: {
          Called: 'สวัสดี',
          รายละเอียด: 'formal greeting'
        }
      }
      const result = parseNestedJson(input, DEFAULT_GLOSSARY_FORMAT)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        src: 'greeting',
        th: 'สวัสดี',
        note: 'formal greeting',
        type: 'other',
        path: []
      })
    })

    it('should handle alternative translations', () => {
      const input = {
        greeting: {
          Called: ['สวัสดี', 'ยินดี']
        }
      }
      const result = parseNestedJson(input, DEFAULT_GLOSSARY_FORMAT)
      expect(result[0].alt).toEqual(['ยินดี'])
    })

    it('should handle nested structures', () => {
      const input = {
        chapter1: {
          'First Appearance': 'page 10',
          greeting: 'สวัสดี'
        }
      }
      const result = parseNestedJson(input, DEFAULT_GLOSSARY_FORMAT)
      // Should have entries for the nested structure
      expect(result.length).toBeGreaterThan(0)
    })

    it('should skip entries starting with underscore', () => {
      const input = {
        _metadata: { note: 'should be skipped' },
        greeting: 'สวัสดี'
      }
      const result = parseNestedJson(input, DEFAULT_GLOSSARY_FORMAT)
      expect(result).toHaveLength(1)
      expect(result[0].src).toBe('greeting')
    })
  })

  describe('serializeFlatJson', () => {
    it('should serialize entries to flat JSON', () => {
      const entries = [
        { src: 'hello', th: 'สวัสดี', type: 'other' as const },
        { src: 'goodbye', th: 'ลาก่อน', type: 'other' as const }
      ]
      const result = serializeFlatJson(entries)
      const parsed = JSON.parse(result)
      expect(parsed.hello).toBe('สวัสดี')
      expect(parsed.goodbye).toBe('ลาก่อน')
    })
  })

  describe('serializeToNested', () => {
    it('should serialize entries to nested JSON', () => {
      const entries = [{ src: 'greeting', th: 'สวัสดี', type: 'greeting', path: [] }]
      const result = serializeToNested(entries, DEFAULT_GLOSSARY_FORMAT)
      const parsed = JSON.parse(result)
      // When no note/alt, just the translation string is stored
      expect(parsed.greeting).toBe('สวัสดี')
    })

    it('should serialize entries with notes', () => {
      const entries = [
        {
          src: 'greeting',
          th: 'สวัสดี',
          type: 'greeting',
          note: 'formal greeting',
          path: []
        }
      ]
      const result = serializeToNested(entries, DEFAULT_GLOSSARY_FORMAT)
      const parsed = JSON.parse(result)
      // With note, it becomes an object with Called and detailKey
      expect(parsed.greeting.Called).toBe('สวัสดี')
      expect(parsed.greeting[DEFAULT_GLOSSARY_FORMAT.detailKey]).toBe('formal greeting')
    })

    it('should preserve nested paths', () => {
      const entries = [
        {
          src: 'hello',
          th: 'สวัสดี',
          type: 'other',
          path: ['chapter1', 'section1']
        }
      ]
      const result = serializeToNested(entries, DEFAULT_GLOSSARY_FORMAT)
      const parsed = JSON.parse(result)
      // Structure should be nested
      expect(parsed.chapter1).toBeDefined()
      expect(parsed.chapter1.section1).toBeDefined()
    })
  })

  describe('hasNestedPaths', () => {
    it('should return true if entries have paths', () => {
      const entries = [{ src: 'hello', th: 'สวัสดี', type: 'other', path: ['chapter1'] }]
      expect(hasNestedPaths(entries)).toBe(true)
    })

    it('should return false if entries have no paths', () => {
      const entries = [{ src: 'hello', th: 'สวัสดี', type: 'other' }]
      expect(hasNestedPaths(entries)).toBe(false)
    })
  })

  describe('performance optimization (PERF-002)', () => {
    it('should parse deep nested structures efficiently', () => {
      // Create a deeply nested structure
      const input: Record<string, unknown> = {}
      let current: Record<string, unknown> = input
      for (let i = 0; i < 20; i++) {
        current[`level${i}`] = { Called: `translation${i}` }
        current = current[`level${i}`] as Record<string, unknown>
      }

      const startTime = performance.now()
      const result = parseNestedJson(input, DEFAULT_GLOSSARY_FORMAT)
      const endTime = performance.now()

      // Should parse in less than 50ms (was 100-500ms before optimization)
      expect(endTime - startTime).toBeLessThan(50)
      expect(result.length).toBeGreaterThan(0)
    })
  })
})
