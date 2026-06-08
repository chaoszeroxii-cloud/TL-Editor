// AIChatPanel/storage.ts
// Persistence helpers for the hidden `.tl-editor/` tree inside the opened folder.
//   <root>/.tl-editor/
//     sessions/index.json        — [{ id, title, updatedAt }]
//     sessions/<id>.json         — full ChatSession
//     pending/<chapterKey>.json  — { edits, glossary } staged per file-pair
//     project-memory.md          — freeform AI-maintained project memory
//
// All writes go through writeFileEnsureDir (mkdir -p). Reads tolerate missing
// files (return null / ''). Persistence is only available when a folder is open.

export interface TlPaths {
  base: string
  sessionsDir: string
  sessionsIndex: string
  sessionFile: (id: string) => string
  pendingDir: string
  pendingFile: (key: string) => string
  memoryFile: string
}

export function tlPaths(rootDir: string): TlPaths {
  const base = `${rootDir.replace(/[\\/]+$/, '')}/.tl-editor`
  return {
    base,
    sessionsDir: `${base}/sessions`,
    sessionsIndex: `${base}/sessions/index.json`,
    sessionFile: (id) => `${base}/sessions/${id}.json`,
    pendingDir: `${base}/pending`,
    pendingFile: (key) => `${base}/pending/${key}.json`,
    memoryFile: `${base}/project-memory.md`
  }
}

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    const raw = await window.electron.readFileOptional(path)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await window.electron.writeFileEnsureDir(path, JSON.stringify(data, null, 2))
}

export async function readText(path: string): Promise<string> {
  try {
    return (await window.electron.readFileOptional(path)) ?? ''
  } catch {
    return ''
  }
}

export async function writeText(path: string, text: string): Promise<void> {
  await window.electron.writeFileEnsureDir(path, text)
}
