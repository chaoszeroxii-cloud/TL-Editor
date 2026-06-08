// AIChatPanel/tools.ts
// Tool schemas exposed to the model + a dispatcher that STAGES each effect into
// the review queue (never applies directly) and returns a short result string
// fed back to the model.

import type { PendingEdit, PendingGlossary, PendingMemory, ToolContext } from './types'
import { captureLineAnchor, hashText } from './anchorMatch'
import { MEMORY_MAX_CHARS } from './useProjectMemory'

let counter = 0
const uid = (p: string): string => `${p}-${Date.now()}-${(counter++).toString(36)}`

// ─── Tool JSON schemas (OpenAI / OpenRouter "function" tools) ─────────────────

export const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'set_full_translation',
      description:
        'Replace the ENTIRE translation (TGT) of the current chapter with a full, line-aligned Thai translation. Use when translating the whole chapter. Output is staged for the user to review — it is NOT applied immediately.',
      parameters: {
        type: 'object',
        properties: {
          text: {
            type: 'string',
            description: 'The complete translated chapter, one source line → one translated line.'
          }
        },
        required: ['text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'replace_lines',
      description:
        'Replace a specific line range in the current translation (TGT). Line numbers are 1-based and refer to the CURRENT_TGT shown to you. Use for targeted fixes / polishing. Staged for review, not applied immediately.',
      parameters: {
        type: 'object',
        properties: {
          start: { type: 'number', description: '1-based first line to replace (in CURRENT_TGT).' },
          end: { type: 'number', description: '1-based last line to replace (inclusive).' },
          text: { type: 'string', description: 'Replacement text (may be multiple lines).' }
        },
        required: ['start', 'end', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_glossary_term',
      description:
        'Propose a new glossary entry for a proper noun / character / place / special term found in the source that is not already in the glossary. Staged for review.',
      parameters: {
        type: 'object',
        properties: {
          src: { type: 'string', description: 'The original-language term.' },
          th: { type: 'string', description: 'Primary Thai translation.' },
          alt: { type: 'array', items: { type: 'string' }, description: 'Alternative Thai forms.' },
          path: {
            type: 'array',
            items: { type: 'string' },
            description: 'Category path, e.g. ["Characters","Heroes"].'
          },
          note: { type: 'string', description: 'Optional usage note.' }
        },
        required: ['src', 'th']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_project_memory',
      description:
        'Rewrite the project memory note (durable facts about THIS project: character-name conventions, tone/style decisions, recurring terminology rules). The text you provide REPLACES the current memory. Keep it concise — rules only, NOT a plot summary. Max ' +
        MEMORY_MAX_CHARS +
        ' characters. Staged for review.',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The complete new project-memory content (markdown, concise).'
          }
        },
        required: ['content']
      }
    }
  }
] as const

export const TOOL_INSTRUCTIONS = `
## เครื่องมือ (Tools)
- แปลทั้งบท → \`set_full_translation\` (Thai บรรทัดต่อบรรทัดให้ตรงกับ SRC)
- แก้เฉพาะบางบรรทัด/เกลา → \`replace_lines\` (เลขบรรทัดอ้างอิงจาก CURRENT_TGT ที่ให้มา, 1-based)
- เจอชื่อเฉพาะ/คำศัพท์ใหม่ที่ไม่มีใน glossary → \`propose_glossary_term\` (เรียก tool ทีละคำ **ห้าม**เขียนคำศัพท์ใหม่เป็น JSON/New_Entry ในข้อความ)
- เจอกฎ/แนวทางสำคัญของโปรเจกต์ (ชื่อตัวละคร, โทน, ศัพท์เฉพาะ) ที่ควรจำข้ามตอน → \`update_project_memory\` (สรุปสั้น เฉพาะกฎ ห้ามเล่าเนื้อเรื่อง)
- ทุก tool เป็นการ "เสนอ" (staged) ผู้ใช้จะกด accept/deny เอง ระบบจะยังไม่เขียนทับงานทันที
- อย่าเรียก replace_lines ทับช่วงเดียวกันซ้ำ ๆ ใน turn เดียว`.trim()

// ─── Argument shapes ─────────────────────────────────────────────────────────

interface FullArgs {
  text: string
}
interface LinesArgs {
  start: number
  end: number
  text: string
}
interface GlossaryArgs {
  src: string
  th: string
  alt?: string[]
  path?: string[]
  note?: string
}

/**
 * Execute one parsed tool call by staging its effect. Returns a short string the
 * agent loop feeds back as the tool result.
 */
export function dispatchToolCall(name: string, rawArgs: string, ctx: ToolContext): string {
  let args: unknown
  try {
    args = JSON.parse(rawArgs || '{}')
  } catch {
    return JSON.stringify({ ok: false, error: 'arguments were not valid JSON' })
  }

  switch (name) {
    case 'set_full_translation': {
      const a = args as FullArgs
      if (typeof a.text !== 'string' || !a.text.trim()) {
        return JSON.stringify({ ok: false, error: 'text is required' })
      }
      const edit: PendingEdit = {
        id: uid('full'),
        kind: 'full',
        baseHash: hashText(ctx.tgtContent),
        baseSnapshot: ctx.tgtContent,
        newText: a.text,
        capturedAt: Date.now(),
        status: 'pending'
      }
      ctx.stageEdit(edit)
      return JSON.stringify({
        ok: true,
        staged: true,
        kind: 'full',
        lines: a.text.split('\n').length,
        note: 'Full translation staged for user review.'
      })
    }

    case 'replace_lines': {
      const a = args as LinesArgs
      if (typeof a.start !== 'number' || typeof a.end !== 'number' || typeof a.text !== 'string') {
        return JSON.stringify({ ok: false, error: 'start, end (numbers) and text are required' })
      }
      // Model is 1-based; convert to 0-based.
      const anchor = captureLineAnchor(ctx.tgtContent, a.start - 1, a.end - 1)
      const edit: PendingEdit = {
        id: uid('lines'),
        kind: 'lines',
        baseHash: hashText(ctx.tgtContent),
        coreText: anchor.coreText,
        before: anchor.before,
        after: anchor.after,
        startLine: anchor.startLine,
        endLine: anchor.endLine,
        newText: a.text,
        capturedAt: Date.now(),
        status: 'pending'
      }
      ctx.stageEdit(edit)
      return JSON.stringify({
        ok: true,
        staged: true,
        kind: 'lines',
        range: [a.start, a.end],
        note: 'Line edit staged for user review.'
      })
    }

    case 'propose_glossary_term': {
      const a = args as GlossaryArgs
      if (!a.src || !a.th) {
        return JSON.stringify({ ok: false, error: 'src and th are required' })
      }
      const entry: PendingGlossary = {
        id: uid('gloss'),
        src: a.src.trim(),
        th: a.th.trim(),
        alt: Array.isArray(a.alt) ? a.alt.map((x) => x.trim()).filter(Boolean) : undefined,
        path: Array.isArray(a.path) ? a.path : undefined,
        note: a.note,
        targetFile: ctx.defaultGlossaryFile,
        capturedAt: Date.now()
      }
      ctx.stageGlossary(entry)
      return JSON.stringify({ ok: true, staged: true, term: entry.src })
    }

    case 'update_project_memory': {
      const a = args as { content: string }
      if (typeof a.content !== 'string' || !a.content.trim()) {
        return JSON.stringify({ ok: false, error: 'content is required' })
      }
      if (a.content.length > MEMORY_MAX_CHARS) {
        return JSON.stringify({
          ok: false,
          error: `content too long (${a.content.length} > ${MEMORY_MAX_CHARS}). Summarize to rules only.`
        })
      }
      const mem: PendingMemory = {
        id: uid('mem'),
        nextContent: a.content,
        prevContent: ctx.projectMemory,
        capturedAt: Date.now()
      }
      ctx.stageMemory(mem)
      return JSON.stringify({ ok: true, staged: true, note: 'Project memory update staged for review.' })
    }

    default:
      return JSON.stringify({ ok: false, error: `unknown tool: ${name}` })
  }
}
