// ─── StyleProfile/exports.ts ──────────────────────────────────────────────────
// Barrel — import everything from this single file.

export type {
  Correction,
  CorrectionTag,
  StylePattern,
  StyleProfile,
  StyleProfileStore,
  DiffResult,
  ProfileStats
} from './types'

export { useStyleProfileStore, getStyleProfilePath } from './useStyleProfileStore'

export { analyzeDiff, similarity, generateId } from './diffEngine'

export { runStyleAnalysis, aggregatePatterns, computeStats } from './styleAnalyzer'

export { useCorrectionCapture, useAiContentTracker } from './CorrectionCapture'

export { StyleProfilePanel } from './StyleProfilePanel'
export type { StyleProfilePanelProps } from './StyleProfilePanel'
