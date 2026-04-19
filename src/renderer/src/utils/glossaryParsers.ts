import type { GlossaryEntry, GlossaryFileFormat, OpenGlossaryFile, GlossaryFormat } from '../types'

// ─── Default glossary format (Thai nested) ────────────────────────────────────

export const DEFAULT_GLOSSARY_FORMAT: GlossaryFormat = {
  callKey: 'Called',
  detailKey: 'รายละเอียด',
  firstAppKey: 'First Appearance',
  isNested: true
}

// Helper to check if an object has the call key (case-insensitive for common variants)
function hasCallKey(obj: Record<string, unknown>, format: GlossaryFormat): boolean {
  const lowercaseKey = format.callKey.toLowerCase()
  return format.callKey in obj || Object.keys(obj).some((k) => k.toLowerCase() === lowercaseKey)
}

function getCallKeyValue(
  obj: Record<string, unknown>,
  format: GlossaryFormat
): unknown | undefined {
  const lowercaseKey = format.callKey.toLowerCase()
  for (const [k, v] of Object.entries(obj)) {
    if (k === format.callKey || k.toLowerCase() === lowercaseKey) {
      return v
    }
  }
  return undefined
}

function getFormatValue(obj: Record<string, unknown>, key: string): unknown | undefined {
  const lowercaseKey = key.toLowerCase()
  for (const [k, v] of Object.entries(obj)) {
    if (k === key || k.toLowerCase() === lowercaseKey) {
      return v
    }
  }
  return undefined
}

// ─── Flat parser  { "src": "th" } ─────────────────────────────────────────────

export function parseFlatJson(raw: Record<string, string>): GlossaryEntry[] {
  const entries: GlossaryEntry[] = []
  for (const [src, th] of Object.entries(raw)) {
    if (!src.trim() || !th.trim()) continue
    entries.push({ src, th: th.trim(), type: 'other' })
  }
  return entries
}

export function serializeFlatJson(entries: GlossaryEntry[]): string {
  const obj: Record<string, string> = {}
  for (const e of entries) obj[e.src] = e.th
  return JSON.stringify(obj, null, 4)
}

// ─── Nested parser (recursive novel JSON) ────────────────────────────────────

function isSinglePairBuff(obj: Record<string, unknown>): boolean {
  const entries = Object.entries(obj)
  return entries.length === 1 && entries[0][0].trim() !== '' && typeof entries[0][1] === 'string'
}

function parseNestedNode(
  key: string,
  value: unknown,
  path: string[],
  result: GlossaryEntry[],
  format: GlossaryFormat
): void {
  if (!key.trim() || key.startsWith('_')) return
  const topType = path[0] ?? 'other'

  if (typeof value === 'string') {
    if (!value.trim()) return
    result.push({ src: key, th: value, type: topType, path: [...path] })
  } else if (Array.isArray(value)) {
    const strs = value.filter((v): v is string => typeof v === 'string' && !!v.trim())
    if (strs.length > 0)
      result.push({
        src: key,
        th: strs[0],
        alt: strs.length > 1 ? strs.slice(1) : undefined,
        type: topType,
        path: [...path]
      })
  } else if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>

    if (hasCallKey(obj, format)) {
      const calledRaw = getCallKeyValue(obj, format)
      let th = ''
      let alt: string[] | undefined
      if (Array.isArray(calledRaw)) {
        const strs = calledRaw.filter((v): v is string => typeof v === 'string' && !!v.trim())
        th = strs[0] ?? ''
        alt = strs.length > 1 ? strs.slice(1) : undefined
      } else {
        th = typeof calledRaw === 'string' ? calledRaw : ''
      }
      const detail = getFormatValue(obj, format.detailKey)
      const firstApp = getFormatValue(obj, format.firstAppKey)
      const detailStr = typeof detail === 'string' ? detail : undefined
      const firstAppStr = typeof firstApp === 'string' ? firstApp : undefined
      const noteParts = [detailStr, firstAppStr].filter(Boolean)
      result.push({
        src: key,
        th,
        alt,
        note: noteParts.length ? noteParts.join(' · ') : undefined,
        type: topType,
        path: [...path]
      })
      // Recursively parse sub-keys, excluding metadata keys (mutate path for O(n) instead of O(n²))
      const metaKeys = new Set([format.callKey, format.detailKey, format.firstAppKey])
      path.push(key) // Add to path for nested traversal
      for (const [subKey, subVal] of Object.entries(obj)) {
        if (metaKeys.has(subKey) || !subKey.trim() || subKey.startsWith('_')) continue
        if (typeof subVal === 'object' && subVal !== null && !Array.isArray(subVal))
          parseNestedNode(subKey, subVal, path, result, format)
        else if (typeof subVal === 'string' && subVal.trim())
          result.push({ src: subKey, th: subVal, type: topType, path: [...path] })
      }
      path.pop() // Remove from path (backtrack)
    } else if (isSinglePairBuff(obj)) {
      const [[thKey, desc]] = Object.entries(obj)
      if (thKey.trim())
        result.push({
          src: key,
          th: thKey,
          note: typeof desc === 'string' && desc.trim() ? desc : undefined,
          type: topType,
          path: [...path]
        })
    } else {
      path.push(key) // Add to path for nested traversal
      for (const [subKey, subVal] of Object.entries(obj))
        parseNestedNode(subKey, subVal, path, result, format)
      path.pop() // Remove from path (backtrack)
    }
  }
}

export function parseNestedJson(
  raw: Record<string, unknown>,
  format: GlossaryFormat = DEFAULT_GLOSSARY_FORMAT
): GlossaryEntry[] {
  const result: GlossaryEntry[] = []
  for (const [key, value] of Object.entries(raw)) parseNestedNode(key, value, [], result, format)
  return result
}

// ─── Nested serializer ────────────────────────────────────────────────────────

function buildEntryValue(entry: GlossaryEntry, format: GlossaryFormat): unknown {
  if ((entry.alt?.length ?? 0) > 0) {
    const called = [entry.th, ...(entry.alt ?? [])]
    return entry.note
      ? { [format.callKey]: called, [format.detailKey]: entry.note }
      : { [format.callKey]: called }
  }
  if (entry.note) return { [format.callKey]: entry.th, [format.detailKey]: entry.note }
  return entry.th
}

export function serializeToNested(
  entries: GlossaryEntry[],
  format: GlossaryFormat = DEFAULT_GLOSSARY_FORMAT
): string {
  const root: Record<string, unknown> = {}

  for (const entry of entries) {
    if (!entry.src.trim() || !entry.th.trim()) continue
    const path = (entry.path ?? []).filter((s) => s.trim())
    const value = buildEntryValue(entry, format)

    let cur = root
    for (const segment of path) {
      const existing = cur[segment]
      if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
        const newObj: Record<string, unknown> = {}
        if (typeof existing === 'string' && existing.trim()) newObj[format.callKey] = existing
        cur[segment] = newObj
      }
      cur = cur[segment] as Record<string, unknown>
    }

    const existing = cur[entry.src]
    if (typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
      const obj = existing as Record<string, unknown>
      if (typeof value === 'string') obj[format.callKey] = value
      else if (typeof value === 'object' && value !== null) Object.assign(obj, value)
    } else {
      cur[entry.src] = value
    }
  }

  return JSON.stringify(root, null, 4)
}

export function hasNestedPaths(entries: GlossaryEntry[]): boolean {
  return entries.some((e) => (e.path?.length ?? 0) > 0)
}

// ─── Smart format detector + file parser ─────────────────────────────────────

export function parseGlossaryFile(path: string, raw: string): OpenGlossaryFile {
  const name = path.split(/[\\/]/).pop() ?? path
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(
      `ไฟล์ "${name}" มี JSON ที่ไม่ถูกต้อง: ${e instanceof Error ? e.message : String(e)}`
    )
  }

  // 1. Flat: { "src": "th" }
  if (!Array.isArray(parsed) && typeof parsed === 'object') {
    const values = Object.values(parsed ?? {})
    if (values.every((v) => typeof v === 'string' || Array.isArray(v))) {
      return {
        path,
        name,
        format: 'flat',
        isDirty: false,
        entries: parseFlatJson(parsed as Record<string, string>)
      }
    }
  }

  // 2. Standard array: [{ src, th, type }]
  if (Array.isArray(parsed) && (parsed[0] as GlossaryEntry)?.src !== undefined)
    return { path, name, format: 'standard', isDirty: false, entries: parsed as GlossaryEntry[] }

  // 3. Custom nested
  if (!Array.isArray(parsed) && typeof parsed === 'object')
    return {
      path,
      name,
      format: 'custom',
      isDirty: false,
      entries: parseNestedJson(parsed as Record<string, unknown>, DEFAULT_GLOSSARY_FORMAT)
    }

  return { path, name, format: 'custom', isDirty: false, entries: [] }
}

// ─── Serialize by format ──────────────────────────────────────────────────────

export function serializeGlossary(
  entries: GlossaryEntry[],
  format: GlossaryFileFormat,
  glossaryFormat?: GlossaryFormat
): string {
  switch (format) {
    case 'flat':
      return serializeFlatJson(entries)
    case 'standard':
      return JSON.stringify(entries, null, 4)
    case 'custom':
      return serializeToNested(entries, glossaryFormat ?? DEFAULT_GLOSSARY_FORMAT)
    default:
      return JSON.stringify(entries, null, 4)
  }
}
