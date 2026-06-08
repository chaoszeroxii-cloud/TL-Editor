// AIChatPanel/contextBuilder.ts
// Assembles the request `messages[]` for each agent turn:
//   • a single regenerated system message — the 🔒 PINNED block (prompt + memory
//     + matched glossary + CURRENT_SRC + CURRENT_TGT). Never stored in history,
//     so it can't bloat as the conversation grows and always reflects live state.
//   • ✂️ pruned chat history — last N messages, with reasoning stripped (never
//     fed back) and tool pairing kept intact.

import type { ChatMessage } from './types'

const DEFAULT_BASE_PROMPT = 'แปลนิยายตอนนี้จาก [ภาษาต้นทาง] เป็น [ภาษาไทย]'
const MAX_HISTORY_MESSAGES = 16

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
  // Index signature so this is assignable to the openrouterChat `messages` param
  // (typed with an index signature for forward-compat extra fields).
  [key: string]: unknown
}

export interface BuildContextArgs {
  basePrompt: string // prompt-md content when the toggle is on, else ''
  projectMemory: string // .tl-editor/project-memory.md (may be '')
  glossaryNestedJson: string // matched glossary as nested JSON (may be '')
  srcContent: string
  tgtContent: string
  toolInstructions: string
  history: ChatMessage[]
}

function numberLines(text: string): string {
  if (!text) return '(ว่าง)'
  return text
    .split('\n')
    .map((l, i) => `${i + 1}\t${l}`)
    .join('\n')
}

function buildSystem(args: BuildContextArgs): string {
  const parts: string[] = [args.basePrompt.trim() || DEFAULT_BASE_PROMPT, args.toolInstructions]

  if (args.projectMemory.trim()) {
    parts.push(`## Project Memory\n${args.projectMemory.trim()}`)
  }
  if (args.glossaryNestedJson.trim()) {
    parts.push(
      `## Glossary (เฉพาะที่พบใน SRC, JSON)\n\`\`\`json\n${args.glossaryNestedJson}\n\`\`\``
    )
  }
  parts.push(
    `## CURRENT_SRC (ต้นฉบับ, มีเลขบรรทัด)\n${numberLines(args.srcContent)}`,
    `## CURRENT_TGT (งานแปลปัจจุบัน, เลขบรรทัด 1-based ใช้กับ replace_lines)\n${numberLines(
      args.tgtContent
    )}`
  )
  return parts.join('\n\n')
}

/** Map stored ChatMessages → API messages, dropping reasoning entirely. */
function historyToApi(history: ChatMessage[]): ApiMessage[] {
  const out: ApiMessage[] = []
  for (const m of history) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content })
    } else if (m.role === 'assistant') {
      const msg: ApiMessage = { role: 'assistant', content: m.content }
      if (m.toolCalls && m.toolCalls.length > 0) {
        msg.tool_calls = m.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments }
        }))
      }
      out.push(msg)
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.toolCallId ?? '', content: m.content })
    }
  }
  return out
}

/**
 * Prune to the last MAX_HISTORY_MESSAGES, then trim leading messages until the
 * window starts on a 'user' turn — so we never begin mid tool-call sequence
 * (which the API rejects) or orphan a tool result.
 */
function prune(api: ApiMessage[]): ApiMessage[] {
  let win = api.slice(-MAX_HISTORY_MESSAGES)
  while (win.length > 0 && win[0].role !== 'user') win = win.slice(1)
  return win
}

export function buildRequestMessages(args: BuildContextArgs): ApiMessage[] {
  return [{ role: 'system', content: buildSystem(args) }, ...prune(historyToApi(args.history))]
}
