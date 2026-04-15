// ─── styleAnalyzer.ts ─────────────────────────────────────────────────────────
// Sends corrections to AI → gets back structured style guide + prompt snippet.
// Pure async functions, no React, no state.

import type { Correction, StylePattern, CorrectionTag } from './types'

// ── Pattern aggregator (local, no AI needed) ──────────────────────────────────

export function aggregatePatterns(corrections: Correction[]): StylePattern[] {
  if (corrections.length === 0) return []

  const tagCounts: Record<string, number> = {}
  const tagExamples: Record<string, Array<{ before: string; after: string }>> = {}

  for (const c of corrections) {
    for (const tag of c.tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
      if (!tagExamples[tag]) tagExamples[tag] = []
      // Keep up to 3 examples per tag
      if (tagExamples[tag].length < 3) {
        tagExamples[tag].push({ before: c.before, after: c.after })
      }
    }
  }

  const total = corrections.length
  return Object.entries(tagCounts)
    .map(([tag, count]) => ({
      tag: tag as CorrectionTag,
      frequency: count / total,
      examples: tagExamples[tag] ?? []
    }))
    .sort((a, b) => b.frequency - a.frequency)
}

// ── Build analysis prompt ─────────────────────────────────────────────────────

function buildAnalysisPrompt(corrections: Correction[]): string {
  // Pick most representative corrections (max 30 for token budget)
  const sample = corrections
    .filter((c) => c.similarity < 0.95) // Only actual changes
    .slice(-30) // Most recent

  const pairs = sample
    .map(
      (c, i) => `[${i + 1}] BEFORE: ${c.before.slice(0, 200)}\n    AFTER:  ${c.after.slice(0, 200)}`
    )
    .join('\n\n')

  return `You are analyzing a Thai novel translator's editing patterns.

Below are ${sample.length} correction pairs — the translator's original edits to AI-generated translations.

${pairs}

Please analyze these corrections and respond ONLY with valid JSON in this exact format:
{
  "styleGuide": "A detailed paragraph (Thai or English) describing the translator's style, preferences, and patterns. Be specific and actionable.",
  "promptSnippet": "A concise 2-4 sentence instruction to inject into an AI translation system prompt. Start with 'Translation style guidelines:'. Be direct and specific.",
  "keyPatterns": ["pattern1", "pattern2", "pattern3"],
  "avoidList": ["thing to avoid 1", "thing to avoid 2"],
  "preferList": ["preferred style 1", "preferred style 2"]
}

Focus on: sentence length preference, vocabulary level, formality, handling of names/terms, rhythm and flow, anything distinctive about this translator's choices.`
}

// ── AI response shape ─────────────────────────────────────────────────────────

interface AnalysisResponse {
  styleGuide: string
  promptSnippet: string
  keyPatterns: string[]
  avoidList: string[]
  preferList: string[]
}

// ── Main: call AI and parse response ─────────────────────────────────────────

export async function runStyleAnalysis(
  corrections: Correction[],
  apiKey: string,
  model = 'deepseek/deepseek-v3.2'
): Promise<{ styleGuide: string; promptSnippet: string; patterns: StylePattern[] }> {
  if (corrections.length < 3) {
    throw new Error('ต้องมีอย่างน้อย 3 corrections ก่อน analyze')
  }

  const prompt = buildAnalysisPrompt(corrections)

  // Call via Electron IPC (same pattern as AITranslatePanel)
  const rawJson = await window.electron.openrouterChat({
    apiKey,
    model,
    messages: [
      {
        role: 'system',
        content:
          'You are a linguistic analysis AI. Always respond with valid JSON only — no markdown, no explanation, just the JSON object.'
      },
      { role: 'user', content: prompt }
    ]
  })

  let data: unknown
  try {
    data = JSON.parse(rawJson)
  } catch {
    throw new Error(`OpenRouter ส่งข้อมูลที่ parse ไม่ได้: ${String(rawJson).slice(0, 120)}`)
  }
  const content: string = (data as Record<string, unknown>).choices?.[0]?.message?.content ?? ''
  if (!content) throw new Error('AI ไม่ส่งผลลัพธ์กลับมา')

  // Strip markdown fences if present
  const cleaned = content
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  let parsed: AnalysisResponse
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`Parse AI response ไม่ได้: ${cleaned.slice(0, 100)}`)
  }

  const patterns = aggregatePatterns(corrections)

  return {
    styleGuide: parsed.styleGuide ?? '',
    promptSnippet: parsed.promptSnippet ?? '',
    patterns
  }
}

// ── Compute profile stats ─────────────────────────────────────────────────────

export function computeStats(corrections: Correction[]): {
  totalCorrections: number
  avgSimilarity: number
  mostCommonTags: CorrectionTag[]
  correctionsByDay: Record<string, number>
} {
  if (corrections.length === 0) {
    return {
      totalCorrections: 0,
      avgSimilarity: 0,
      mostCommonTags: [] as CorrectionTag[],
      correctionsByDay: {} as Record<string, number>
    }
  }

  const avgSim = corrections.reduce((sum, c) => sum + c.similarity, 0) / corrections.length

  const tagCounts: Record<string, number> = {}
  for (const c of corrections) for (const tag of c.tags) tagCounts[tag] = (tagCounts[tag] ?? 0) + 1

  const mostCommonTags = (Object.entries(tagCounts) as [CorrectionTag, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag]) => tag)

  const correctionsByDay: Record<string, number> = {}
  for (const c of corrections) {
    const day = new Date(c.timestamp).toISOString().slice(0, 10)
    correctionsByDay[day] = (correctionsByDay[day] ?? 0) + 1
  }

  return {
    totalCorrections: corrections.length,
    avgSimilarity: avgSim,
    mostCommonTags,
    correctionsByDay
  }
}
