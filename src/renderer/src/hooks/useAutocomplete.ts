import { useState, useCallback } from 'react'
import type { GlossaryEntry } from '../types'

/**
 * Entry with info about which field (src/th) was matched
 */
export interface MatchedEntry {
  entry: GlossaryEntry
  matchField: 'src' | 'th'
}

export interface AutocompleteState {
  visible: boolean
  query: string
  matches: MatchedEntry[]
  selectedIndex: number
  cursorPos: { x: number; y: number } | null
}

export interface AutocompleteAPI {
  state: AutocompleteState
  show: (text: string, cursorPos: number, x: number, y: number) => void
  hide: () => void
  selectPrev: () => void
  selectNext: () => void
  selectByIndex: (index: number) => void
  getSelected: () => MatchedEntry | null
  getInsertionText: () => string
  extractWordAtCursor: (text: string, cursorPos: number) => string
}

/**
 * Hook for glossary-based autocomplete
 * - Auto-triggers after 2+ chars
 * - Prefix matching (case-insensitive)
 * - Returns matches, selection state, and navigation handlers
 */
export function useAutocomplete(glossary: GlossaryEntry[]): AutocompleteAPI {
  const [state, setState] = useState<AutocompleteState>({
    visible: false,
    query: '',
    matches: [],
    selectedIndex: 0,
    cursorPos: null
  })

  // Extract word at cursor position
  const extractWordAtCursor = useCallback((text: string, cursorPos: number): string => {
    // Get text from line start to cursor
    const beforeCursor = text.slice(0, cursorPos)
    const lastLineStart = beforeCursor.lastIndexOf('\n') + 1
    const lineContent = beforeCursor.slice(lastLineStart)

    // Extract current word (Thai chars + latin + digits)
    const wordMatch = lineContent.match(/[\u0E00-\u0E7Fa-zA-Z0-9]*$/)
    return wordMatch ? wordMatch[0] : ''
  }, [])

  // Filter glossary by prefix (searches both src and th fields)
  const filterMatches = useCallback(
    (query: string): MatchedEntry[] => {
      if (query.length < 1) return [] // Show from 1+ char
      const lowerQuery = query.toLowerCase()
      const results: MatchedEntry[] = []

      for (const entry of glossary) {
        // Check if query matches src (Thai) field
        if (entry.src.toLowerCase().startsWith(lowerQuery)) {
          results.push({ entry, matchField: 'src' })
        }
        // Check if query matches th (English) field
        else if (entry.th.toLowerCase().startsWith(lowerQuery)) {
          results.push({ entry, matchField: 'th' })
        }

        if (results.length >= 8) break // Limit to 8 results
      }

      return results
    },
    [glossary]
  )

  // Show autocomplete dropdown
  const show = useCallback(
    (text: string, cursorPos: number, x: number, y: number): void => {
      const word = extractWordAtCursor(text, cursorPos)
      const matches = filterMatches(word)

      setState({
        visible: matches.length > 0,
        query: word,
        matches,
        selectedIndex: 0,
        cursorPos: { x, y }
      })
    },
    [extractWordAtCursor, filterMatches]
  )

  // Hide autocomplete dropdown
  const hide = useCallback((): void => {
    setState((prev) => ({
      ...prev,
      visible: false,
      query: '',
      matches: [],
      selectedIndex: 0
    }))
  }, [])

  // Navigate selection up
  const selectPrev = useCallback((): void => {
    setState((prev) => ({
      ...prev,
      selectedIndex: prev.selectedIndex > 0 ? prev.selectedIndex - 1 : prev.matches.length - 1
    }))
  }, [])

  // Navigate selection down
  const selectNext = useCallback((): void => {
    setState((prev) => ({
      ...prev,
      selectedIndex: prev.selectedIndex < prev.matches.length - 1 ? prev.selectedIndex + 1 : 0
    }))
  }, [])

  // Select by specific index
  const selectByIndex = useCallback((index: number): void => {
    setState((prev) => ({
      ...prev,
      selectedIndex: Math.max(0, Math.min(index, prev.matches.length - 1))
    }))
  }, [])

  // Get selected entry
  const getSelected = useCallback((): MatchedEntry | null => {
    if (!state.visible || state.matches.length === 0) return null
    return state.matches[state.selectedIndex] || null
  }, [state.visible, state.matches, state.selectedIndex])

  // Get insertion text (only the matched field: src or th)
  const getInsertionText = useCallback((): string => {
    const selected = getSelected()
    if (!selected) return ''
    // Return only the field that was matched
    return selected.entry[selected.matchField]
  }, [getSelected])

  return {
    state,
    show,
    hide,
    selectPrev,
    selectNext,
    selectByIndex,
    getSelected,
    getInsertionText,
    extractWordAtCursor
  }
}
