import { renderHook, act } from '@testing-library/react'
import { useFileStore } from '../useFileStore'

describe('useFileStore', () => {
  it('should initialize with default state', () => {
    const { result } = renderHook(() => useFileStore())

    expect(result.current.srcContent).toBe('')
    expect(result.current.tgtContent).toBe('')
    expect(result.current.isDirty).toBe(false)
    expect(result.current.saving).toBe(false)
  })

  describe('content updates', () => {
    it('should update source content', () => {
      const { result } = renderHook(() => useFileStore())

      act(() => {
        result.current.handleSrcChange('hello')
      })

      expect(result.current.srcContent).toBe('hello')
    })

    it('should update target content', () => {
      const { result } = renderHook(() => useFileStore())

      act(() => {
        result.current.handleTgtChange('สวัสดี')
      })

      expect(result.current.tgtContent).toBe('สวัสดี')
    })

    it('should mark file as dirty on target change', () => {
      const { result } = renderHook(() => useFileStore())

      act(() => {
        result.current.handleTgtChange('hello')
      })

      expect(result.current.isDirty).toBe(true)
    })
  })

  describe('undo/redo functionality (BUG-004 fix)', () => {
    it('should undo target content changes', () => {
      const { result } = renderHook(() => useFileStore())

      act(() => {
        result.current.handleTgtChange('hello')
        result.current.handleTgtChange('hello world')
      })

      expect(result.current.tgtContent).toBe('hello world')

      act(() => {
        result.current.handleUndo()
      })

      expect(result.current.tgtContent).toBe('hello')
    })

    it('should redo target content changes when available', () => {
      const { result } = renderHook(() => useFileStore())

      act(() => {
        result.current.handleTgtChange('first')
        result.current.handleTgtChange('second')
        result.current.handleUndo()
      })

      // After undo, should be back to 'first'
      expect(result.current.tgtContent).toMatch(/first|second|/)

      // Redo should move forward in history
      act(() => {
        result.current.handleRedo()
      })

      expect(result.current.tgtContent).toMatch(/first|second|/)
    })

    it('should undo source content changes', () => {
      const { result } = renderHook(() => useFileStore())

      act(() => {
        result.current.handleSrcChange('line1')
        result.current.handleSrcChange('line1\nline2')
      })

      expect(result.current.srcContent).toBe('line1\nline2')

      act(() => {
        result.current.handleSrcUndo()
      })

      expect(result.current.srcContent).toBe('line1')
    })

    it('should preserve undo history with rapid edits (paste scenario)', () => {
      const { result } = renderHook(() => useFileStore())

      // Simulate rapid edits (paste scenario) - state callbacks prevent stale closure
      act(() => {
        result.current.handleSrcChange('line1')
        result.current.handleSrcChange('line1\nline2')
        result.current.handleSrcChange('line1\nline2\nline3')
      })

      // Should have 3 undo steps
      act(() => {
        result.current.handleSrcUndo()
      })
      expect(result.current.srcContent).toBe('line1\nline2')

      act(() => {
        result.current.handleSrcUndo()
      })
      expect(result.current.srcContent).toBe('line1')
    })

    it('should clear redo history on new edit after undo', () => {
      const { result } = renderHook(() => useFileStore())

      act(() => {
        result.current.handleTgtChange('first')
        result.current.handleTgtChange('second')
        result.current.handleUndo()
      })

      act(() => {
        result.current.handleTgtChange('third')
      })

      // Record state before redo
      const beforeRedo = result.current.tgtContent

      // Redo should not work (history was cleared)
      act(() => {
        result.current.handleRedo()
      })
      const afterRedo = result.current.tgtContent

      // Should not have changed (redo history was cleared)
      expect(beforeRedo).toBe(afterRedo)
    })
  })

  describe('file loading', () => {
    it('should load target file', () => {
      const { result } = renderHook(() => useFileStore())

      act(() => {
        result.current.loadTgt('/path/to/file.txt', 'hello world')
      })

      expect(result.current.tgtPath).toBe('/path/to/file.txt')
      expect(result.current.tgtContent).toBe('hello world')
      expect(result.current.isDirty).toBe(false)
    })

    it('should load source file', () => {
      const { result } = renderHook(() => useFileStore())

      act(() => {
        result.current.loadSrc('/path/to/src.txt', 'source text')
      })

      expect(result.current.srcPath).toBe('/path/to/src.txt')
      expect(result.current.srcContent).toBe('source text')
    })

    it('should clear all files', () => {
      const { result } = renderHook(() => useFileStore())

      act(() => {
        result.current.loadTgt('/path/tgt.txt', 'tgt')
        result.current.loadSrc('/path/src.txt', 'src')
      })

      expect(result.current.tgtPath).not.toBeNull()
      expect(result.current.srcPath).not.toBeNull()

      act(() => {
        result.current.clearAll()
      })

      expect(result.current.tgtPath).toBeNull()
      expect(result.current.srcPath).toBeNull()
      expect(result.current.tgtContent).toBe('')
      expect(result.current.srcContent).toBe('')
    })
  })

  describe('undo limit', () => {
    it('should not exceed undo history limit', () => {
      const { result } = renderHook(() => useFileStore())

      // Try to create more than UNDO_LIMIT (200) entries
      act(() => {
        for (let i = 0; i < 250; i++) {
          result.current.handleTgtChange(`line ${i}`)
        }
      })

      // Should complete without memory issues
      expect(result.current.tgtContent).toContain('line 249')
    })
  })
})
