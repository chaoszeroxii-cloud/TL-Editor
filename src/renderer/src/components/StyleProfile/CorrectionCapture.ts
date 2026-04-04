// ─── CorrectionCapture.ts ─────────────────────────────────────────────────────
// Lightweight hook that sits between useFileStore and useStyleProfileStore.
// Watches for TGT content changes that look like manual corrections to AI output,
// captures them, and forwards to the style profile store.
//
// Design: zero UI, zero side-effects beyond calling addCorrection.
// Drop this into App.tsx with a single useEffect.

import { useEffect, useRef, useState } from 'react'

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
  // Keep latest tgtPath and onCapture in refs so the debounce closure is never stale
  const tgtPathRef = useRef(tgtPath)
  const onCaptureRef = useRef(onCapture)
  useEffect(() => {
    tgtPathRef.current = tgtPath
  }, [tgtPath])
  useEffect(() => {
    onCaptureRef.current = onCapture
  }, [onCapture])

  // Update aiRowsRef whenever new AI content arrives
  useEffect(() => {
    if (aiGeneratedContent !== null) {
      aiRowsRef.current = aiGeneratedContent.split('\n')
      // Reset last-captured so the NEXT edit (after this baseline) is compared fresh
      lastCapturedRef.current = aiGeneratedContent
    }
  }, [aiGeneratedContent])

  // Watch for edits after AI content was set
  useEffect(() => {
    // Nothing to compare against
    if (!aiRowsRef.current) return
    // No change from last capture
    if (tgtContent === lastCapturedRef.current) return

    if (debounceRef.current) clearTimeout(debounceRef.current)

    // Snapshot values at schedule time — don't rely on ref reads inside the callback
    // for values that must be consistent with the content being compared.
    const aiRowsSnapshot = aiRowsRef.current
    const contentSnapshot = tgtContent

    debounceRef.current = setTimeout(() => {
      const currentRows = contentSnapshot.split('\n')
      const sourceFile = tgtPathRef.current?.split(/[\\/]/).pop()

      // Compare row-by-row; only capture changed rows
      const maxLen = Math.max(aiRowsSnapshot.length, currentRows.length)
      for (let i = 0; i < maxLen; i++) {
        const before = (aiRowsSnapshot[i] ?? '').trim()
        const after = (currentRows[i] ?? '').trim()
        if (before && after && before !== after) {
          onCaptureRef.current(before, after, sourceFile)
        }
      }

      lastCapturedRef.current = contentSnapshot
    }, 1500)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // Only re-run when content actually changes — tgtPath/onCapture are read via refs
    // // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tgtContent])
}

// ── Utility: check if content looks like AI output ────────────────────────────
// Simple heuristic: AI output is usually set all-at-once (large chunk),
// not typed character by character. The store already handles dedup.
// This is just a helper for App.tsx to track "last AI result".

export function useAiContentTracker(): {
  aiContent: string | null
  setAiContent: (content: string) => void
} {
  // Must use useState so that calling setAiContent causes App to re-render,
  // which passes the new value as a prop to useCorrectionCapture's effect.
  // A plain ref getter never triggers re-renders, so aiGeneratedContent would
  // always be null and no corrections would ever be captured.
  const [aiContent, setAiContent] = useState<string | null>(null)
  return { aiContent, setAiContent }
}
