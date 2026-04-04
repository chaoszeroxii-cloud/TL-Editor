// ── Parse New_Entry block from AI response ────────────────────────────────────
// Supports:
//   ```json { "New_Entry": { "Name": "Thai", ... } } ```
//   bare    { "New_Entry": { ... } }  (anywhere in text)

export interface PendingEntry {
  src: string
  th: string
  note?: string
  type: string
  selected: boolean
}

export function extractNewEntries(text: string): { cleaned: string; entries: PendingEntry[] } {
  const entries: PendingEntry[] = []

  const tryParse = (jsonStr: string): void => {
    try {
      const obj = JSON.parse(jsonStr.trim())
      const newEntry = (obj['New_Entry'] ?? obj['new_entry']) as Record<string, unknown> | undefined
      if (!newEntry || typeof newEntry !== 'object' || Array.isArray(newEntry)) return

      for (const [src, val] of Object.entries(newEntry)) {
        if (!src.trim()) continue
        let th = src
        let note: string | undefined

        if (typeof val === 'string' && val.trim()) {
          th = val.trim()
        } else if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
          const v = val as Record<string, unknown>
          const called = v['Called'] ?? v['called']
          if (typeof called === 'string') th = called
          else if (Array.isArray(called) && called[0]) th = String(called[0])
          if (typeof v['รายละเอียด'] === 'string') note = v['รายละเอียด'] as string
        }

        if (th.trim()) {
          entries.push({ src: src.trim(), th: th.trim(), note, type: 'term', selected: true })
        }
      }
    } catch {
      /* skip invalid JSON */
    }
  }

  // 1) Try ```json ... ``` blocks that contain New_Entry
  const blockRe = /```json\s*([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  let foundBlock = false
  blockRe.lastIndex = 0
  while ((m = blockRe.exec(text)) !== null) {
    if (/[Nn]ew_[Ee]ntry/.test(m[1])) {
      tryParse(m[1])
      foundBlock = true
    }
  }

  let cleaned = foundBlock
    ? text
        .replace(/```json[\s\S]*?```/gi, '')
        .replace(/```[\s\S]*?```/gi, '')
        .trimEnd()
    : text

  // 2) If no code block found, try bare { "New_Entry": ... } object
  // Use a brace-depth scanner instead of a regex so nested objects are handled correctly
  if (!foundBlock) {
    let i = 0
    while (i < text.length) {
      const start = text.indexOf('{', i)
      if (start === -1) break
      // Only attempt parse for objects that mention New_Entry
      let depth = 0
      let end = -1
      for (let j = start; j < text.length; j++) {
        if (text[j] === '{') depth++
        else if (text[j] === '}') {
          depth--
          if (depth === 0) {
            end = j
            break
          }
        }
      }
      if (end === -1) break
      const candidate = text.slice(start, end + 1)
      if (/[Nn]ew_[Ee]ntry/.test(candidate)) tryParse(candidate)
      i = end + 1
    }
    cleaned = text
      .replace(/\{[\s\S]*?"[Nn]ew_[Ee]ntry"[\s\S]*?\}/gi, '')
      .replace(/```[\s\S]*?```/gi, '')
      .trimEnd()
  }

  return { cleaned, entries }
}
