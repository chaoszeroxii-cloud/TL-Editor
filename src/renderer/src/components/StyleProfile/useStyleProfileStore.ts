// ─── useStyleProfileStore.ts ──────────────────────────────────────────────────
// React state hook for the style profile system.
// Handles: persistence (via electron writeFile), correction capture,
// AI analysis trigger, and exposing state to UI components.

import { useState, useCallback, useRef } from 'react'
import type { StyleProfile, StyleProfileStore, Correction } from './types'
import { analyzeDiff, generateId } from './diffEngine'
import { runStyleAnalysis, computeStats, aggregatePatterns } from './styleAnalyzer'

// ── Default empty profile factory ─────────────────────────────────────────────

function createEmptyProfile(projectName = 'Project'): StyleProfile {
  return {
    id: generateId(),
    projectName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    corrections: [],
    patterns: [],
    styleGuide: '',
    promptSnippet: '',
    isDirty: false,
    stats: {
      totalCorrections: 0,
      avgSimilarity: 0,
      mostCommonTags: [],
      correctionsByDay: {}
    }
  }
}

// ── Persistence path helper ───────────────────────────────────────────────────

export function getStyleProfilePath(rootDir: string): string {
  const sep = rootDir.includes('\\') ? '\\' : '/'
  return `${rootDir}${sep}.style-profile.json`
}

// ── Minimum similarity threshold to record a correction ──────────────────────
// Corrections with sim > 0.97 are trivial (whitespace, typo) → skip
// Corrections with sim < 0.05 are full rewrites → skip (probably wrong content)

const SIM_MAX = 0.97
const SIM_MIN = 0.05

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useStyleProfileStore(rootDir: string | null): StyleProfileStore {
  const [profile, setProfile] = useState<StyleProfile | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  // Keep ref for use in callbacks without stale closure
  const profileRef = useRef(profile)
  profileRef.current = profile

  // ── Persist to disk ───────────────────────────────────────────────────────

  const persist = useCallback(
    async (p: StyleProfile) => {
      if (!rootDir) return
      try {
        const path = getStyleProfilePath(rootDir)
        await window.electron.writeFile(path, JSON.stringify(p, null, 2))
      } catch (e) {
        console.warn('StyleProfile: persist failed', e)
      }
    },
    [rootDir]
  )

  // ── Load profile from parsed JSON ─────────────────────────────────────────

  const loadProfile = useCallback((raw: StyleProfile) => {
    setProfile(raw)
  }, [])

  // ── Add a single correction ───────────────────────────────────────────────

  const addCorrection = useCallback(
    (before: string, after: string, sourceFile?: string) => {
      if (!before.trim() || !after.trim() || before === after) return

      const diff = analyzeDiff(before, after)
      if (diff.similarity > SIM_MAX || diff.similarity < SIM_MIN) return
      if (diff.tags.length === 0) return

      const correction: Correction = {
        id: generateId(),
        timestamp: Date.now(),
        before: before.slice(0, 500),
        after: after.slice(0, 500),
        similarity: diff.similarity,
        tags: diff.tags,
        sourceFile
      }

      setProfile((prev) => {
        const base = prev ?? createEmptyProfile()
        const recent = base.corrections.slice(-10)
        if (recent.some((c) => c.before === correction.before && c.after === correction.after))
          return prev

        const corrections = [...base.corrections, correction]
        const updated: StyleProfile = {
          ...base,
          corrections,
          isDirty: true,
          updatedAt: Date.now(),
          stats: computeStats(corrections)
        }
        // Schedule persist outside the updater (side-effects must not run inside setState)
        Promise.resolve().then(() => persist(updated))
        return updated
      })
    },
    [persist]
  )

  // ── Run AI analysis ───────────────────────────────────────────────────────

  const analyze = useCallback(
    async (apiKey: string) => {
      const p = profileRef.current
      if (!p || p.corrections.length < 3) {
        setAnalyzeError('ต้องมีอย่างน้อย 3 corrections ก่อน analyze')
        return
      }
      if (!apiKey.trim()) {
        setAnalyzeError('ใส่ API key ก่อน (ใช้ key เดียวกับ AI Translate)')
        return
      }

      setIsAnalyzing(true)
      setAnalyzeError(null)

      try {
        const { styleGuide, promptSnippet, patterns } = await runStyleAnalysis(
          p.corrections,
          apiKey
        )

        setProfile((prev) => {
          if (!prev) return prev
          const updated: StyleProfile = {
            ...prev,
            styleGuide,
            promptSnippet,
            patterns: patterns.length > 0 ? patterns : aggregatePatterns(prev.corrections),
            isDirty: false,
            updatedAt: Date.now()
          }
          persist(updated)
          return updated
        })
      } catch (e) {
        setAnalyzeError(e instanceof Error ? e.message : String(e))
      } finally {
        setIsAnalyzing(false)
      }
    },
    [persist]
  )

  // ── Clear corrections (keep guide) ────────────────────────────────────────

  const clearCorrections = useCallback(() => {
    setProfile((prev) => {
      if (!prev) return prev
      const updated: StyleProfile = {
        ...prev,
        corrections: [],
        isDirty: false,
        updatedAt: Date.now(),
        stats: computeStats([])
      }
      Promise.resolve().then(() => persist(updated))
      return updated
    })
  }, [persist])

  // ── Full reset ────────────────────────────────────────────────────────────

  const resetProfile = useCallback(() => {
    const fresh = createEmptyProfile(rootDir?.split(/[\\/]/).pop())
    setProfile(fresh)
    persist(fresh)
  }, [rootDir, persist])

  // ── Get prompt snippet (safe) ─────────────────────────────────────────────

  const getPromptSnippet = useCallback((): string => {
    return profileRef.current?.promptSnippet ?? ''
  }, [])

  return {
    profile,
    isAnalyzing,
    analyzeError,
    addCorrection,
    analyze,
    clearCorrections,
    resetProfile,
    loadProfile,
    getPromptSnippet
  }
}
