// ─── CorrectionCapture.ts ─────────────────────────────────────────────────────
// Lightweight hook that sits between useFileStore and useStyleProfileStore.
// Watches for TGT content changes that look like manual corrections to AI output,
// captures them, and forwards to the style profile store.
//
// Design: zero UI, zero side-effects beyond calling addCorrection.
// Drop this into App.tsx with a single useEffect.

import { useEffect, useRef, useCallback } from 'react'

interface UseCorrectionCaptureProps {
  /** Current TGT content (line by line from useFileStore) */
  tgtContent: string
  /** Content that was set by AI (from handleAiResult) */
  aiGeneratedContent: string | null
  /** Callback to record a correction pair */
  onCapture: (before: string, after: string, sourceFile?: string) => void
  /** Current file path for attribution */
  tgtPath: string | null
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCorrectionCapture({
  tgtContent,
  aiGeneratedContent,
  onCapture,
  tgtPath
}: UseCorrectionCaptureProps): void {
  // Store the AI-generated version per-row at the moment it was set
  const aiRowsRef = useRef<string[] | null>(null)
  // Debounce: only capture after user stops typing for 1.5s
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track last captured content to avoid duplicates
  const lastCapturedRef = useRef<string>('')

  // Update aiRowsRef whenever new AI content arrives
  useEffect(() => {
    if (aiGeneratedContent !== null) {
      aiRowsRef.current = aiGeneratedContent.split('\n')
    }
  }, [aiGeneratedContent])

  // Watch for edits after AI content was set
  useEffect(() => {
    // Nothing to compare against
    if (!aiRowsRef.current) return
    // No change from last capture
    if (tgtContent === lastCapturedRef.current) return

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      const aiRows = aiRowsRef.current
      if (!aiRows) return

      const currentRows = tgtContent.split('\n')
      const sourceFile = tgtPath?.split(/[\\/]/).pop()

      // Compare row-by-row; only capture changed rows
      const maxLen = Math.max(aiRows.length, currentRows.length)
      for (let i = 0; i < maxLen; i++) {
        const before = (aiRows[i] ?? '').trim()
        const after = (currentRows[i] ?? '').trim()
        if (before && after && before !== after) {
          onCapture(before, after, sourceFile)
        }
      }

      lastCapturedRef.current = tgtContent
    }, 1500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [tgtContent, onCapture, tgtPath])
}

// ── Utility: check if content looks like AI output ────────────────────────────
// Simple heuristic: AI output is usually set all-at-once (large chunk),
// not typed character by character. The store already handles dedup.
// This is just a helper for App.tsx to track "last AI result".

export function useAiContentTracker(): {
  aiContent: string | null
  setAiContent: (content: string) => void
} {
  // useRef alone is insufficient here: the returned object literal is recreated
  // every render but the getter always reads the same ref cell, so consumers
  // (useCorrectionCapture) will never see an updated value via React's dep tracking.
  // Use a ref for the *value* and expose a stable setter; callers that need to
  // react to the new value can compare against the ref in their own effects.
  const aiContentRef = useRef<string | null>(null)
  // Stable setter — does NOT cause a re-render (intentional: we don't want the
  // whole app to re-render on every AI token; useCorrectionCapture reads the ref
  // in its own debounced effect).
  const setAiContent = useCallback((content: string): void => {
    aiContentRef.current = content
  }, [])
  return {
    get aiContent() {
      return aiContentRef.current
    },
    setAiContent
  }
}
