import type { GlossaryEntry, GlossaryFileFormat, OpenGlossaryFile } from '../types'

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

const LEAF_META_KEYS = new Set(['Called', 'called', 'รายละเอียด', 'First Appearance'])

function hasCalledKey(obj: Record<string, unknown>): boolean {
  return 'Called' in obj || 'called' in obj
}

function isSinglePairBuff(obj: Record<string, unknown>): boolean {
  const entries = Object.entries(obj)
  return entries.length === 1 && entries[0][0].trim() !== '' && typeof entries[0][1] === 'string'
}

function parseNestedNode(
  key: string,
  value: unknown,
  path: string[],
  result: GlossaryEntry[]
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

    if (hasCalledKey(obj)) {
      const calledRaw = obj['Called'] ?? obj['called']
      let th = ''
      let alt: string[] | undefined
      if (Array.isArray(calledRaw)) {
        const strs = calledRaw.filter((v): v is string => typeof v === 'string' && !!v.trim())
        th = strs[0] ?? ''
        alt = strs.length > 1 ? strs.slice(1) : undefined
      } else {
        th = typeof calledRaw === 'string' ? calledRaw : ''
      }
      const detail =
        typeof obj['รายละเอียด'] === 'string' ? (obj['รายละเอียด'] as string) : undefined
      const firstApp =
        typeof obj['First Appearance'] === 'string'
          ? (obj['First Appearance'] as string)
          : undefined
      const noteParts = [detail, firstApp].filter(Boolean)
      result.push({
        src: key,
        th,
        alt,
        note: noteParts.length ? noteParts.join(' · ') : undefined,
        type: topType,
        path: [...path]
      })
      for (const [subKey, subVal] of Object.entries(obj)) {
        if (LEAF_META_KEYS.has(subKey) || !subKey.trim() || subKey.startsWith('_')) continue
        if (typeof subVal === 'object' && subVal !== null && !Array.isArray(subVal))
          parseNestedNode(subKey, subVal, [...path, key], result)
        else if (typeof subVal === 'string' && subVal.trim())
          result.push({ src: subKey, th: subVal, type: topType, path: [...path, key] })
      }
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
      for (const [subKey, subVal] of Object.entries(obj))
        parseNestedNode(subKey, subVal, [...path, key], result)
    }
  }
}

export function parseNestedJson(raw: Record<string, unknown>): GlossaryEntry[] {
  const result: GlossaryEntry[] = []
  for (const [key, value] of Object.entries(raw)) parseNestedNode(key, value, [], result)
  return result
}

// ─── Nested serializer ────────────────────────────────────────────────────────

function buildEntryValue(entry: GlossaryEntry): unknown {
  if ((entry.alt?.length ?? 0) > 0) {
    const called = [entry.th, ...(entry.alt ?? [])]
    return entry.note ? { Called: called, รายละเอียด: entry.note } : { Called: called }
  }
  if (entry.note) return { Called: entry.th, รายละเอียด: entry.note }
  return entry.th
}

export function serializeToNested(entries: GlossaryEntry[]): string {
  const root: Record<string, unknown> = {}

  for (const entry of entries) {
    if (!entry.src.trim() || !entry.th.trim()) continue
    const path = (entry.path ?? []).filter((s) => s.trim())
    const value = buildEntryValue(entry)

    let cur = root
    for (const segment of path) {
      const existing = cur[segment]
      if (typeof existing !== 'object' || existing === null || Array.isArray(existing)) {
        const newObj: Record<string, unknown> = {}
        if (typeof existing === 'string' && existing.trim()) newObj['Called'] = existing
        cur[segment] = newObj
      }
      cur = cur[segment] as Record<string, unknown>
    }

    const existing = cur[entry.src]
    if (typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
      const obj = existing as Record<string, unknown>
      if (typeof value === 'string') obj['Called'] = value
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
  const parsed = JSON.parse(raw)

  // 1. Flat: { "src": "th" }
  if (!Array.isArray(parsed) && typeof parsed === 'object') {
    const values = Object.values(parsed)
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
      entries: parseNestedJson(parsed as Record<string, unknown>)
    }

  return { path, name, format: 'custom', isDirty: false, entries: [] }
}

// ─── Serialize by format ──────────────────────────────────────────────────────

export function serializeByFormat(entries: GlossaryEntry[], format: GlossaryFileFormat): string {
  if (format === 'flat') return serializeFlatJson(entries)
  if (format === 'custom' || hasNestedPaths(entries)) return serializeToNested(entries)
  return JSON.stringify(entries, null, 2)
}
