// AIChatPanel/types.ts — domain types for the embedded translation agent.

export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high'

export interface ChatToolCall {
  id: string
  name: string
  arguments: string // raw JSON string from the model
}

/**
 * A single chat turn. `reasoning` is kept for UI display ONLY — it is never sent
 * back into the messages array (DeepSeek R1 et al. forbid feeding reasoning back).
 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  reasoning?: string
  toolCalls?: ChatToolCall[]
  toolCallId?: string // for role === 'tool'
  toolName?: string
  createdAt: number
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

// ─── Staged edits (content-anchored) ─────────────────────────────────────────

export type PendingStatus = 'pending' | 'conflict'

/** Full-chapter replacement. Anchored to a snapshot hash. */
export interface PendingFullEdit {
  id: string
  kind: 'full'
  baseHash: string
  baseSnapshot: string
  newText: string
  capturedAt: number
  status: PendingStatus
}

/**
 * Line-range replacement, anchored to the ORIGINAL text content (+ 1 line of
 * surrounding context each side) so it survives line drift and manual edits.
 */
export interface PendingLineEdit {
  id: string
  kind: 'lines'
  baseHash: string
  coreText: string // the lines being replaced (original)
  before: string // 1 line above (context only, not replaced); '' if at top
  after: string // 1 line below (context only, not replaced); '' if at bottom
  startLine: number // 0-based hint (search center)
  endLine: number // 0-based inclusive hint
  newText: string
  capturedAt: number
  status: PendingStatus
}

export type PendingEdit = PendingFullEdit | PendingLineEdit

export interface PendingGlossary {
  id: string
  src: string
  th: string
  alt?: string[]
  path?: string[]
  note?: string
  targetFile: string
  capturedAt: number
}

/** Proposed full rewrite of project-memory.md, awaiting review. */
export interface PendingMemory {
  id: string
  nextContent: string
  prevContent: string
  capturedAt: number
}

/** Lightweight session index entry (stored in sessions/index.json). */
export interface SessionMeta {
  id: string
  title: string
  updatedAt: number
}

// ─── Tool dispatch surface ───────────────────────────────────────────────────
// The agent loop hands each parsed tool call to a dispatcher that stages the
// effect (never applies it) and returns a short result string fed back to the
// model so it knows the action was queued for review.

export interface ToolContext {
  /** Current source text of the open chapter. */
  srcContent: string
  /** Current translation text of the open chapter. */
  tgtContent: string
  /** Current project-memory.md content (for diffing proposed rewrites). */
  projectMemory: string
  /** Glossary file the new terms should be written to when accepted. */
  defaultGlossaryFile: string
  stageEdit: (edit: PendingEdit) => void
  stageGlossary: (entry: PendingGlossary) => void
  stageMemory: (memory: PendingMemory) => void
}
