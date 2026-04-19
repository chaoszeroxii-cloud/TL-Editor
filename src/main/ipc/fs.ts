// src/main/ipc/fs.ts
import { ipcMain } from 'electron'
import { join } from 'path'
import { readdir, readFile, writeFile, stat } from 'fs/promises'
import { existsSync } from 'fs'
import fs from 'fs'
import { assertPathAllowed } from './pathAccess'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children: TreeNode[]
}

// ─── Tree cache ───────────────────────────────────────────────────────────────
// Keyed by absolute directory path.  Each entry stores the directory's last
// modification time and the previously computed node list.  On the next scan
// request, if the directory mtime hasn't changed we return the cached value
// immediately — this eliminates redundant disk I/O for stable subtrees.
//
// The cache is invalidated on a write (via fs:writeFile / move-file) because
// those handlers call invalidateTreeCache() below.
//
// Cache scope is the main-process lifetime (i.e. until the app restarts).
// This is intentional: the renderer calls readTree only when it explicitly wants
// a refresh, so stale data within a session is not a problem.

interface CacheEntry {
  mtimeMs: number
  nodes: TreeNode[]
}

const treeCache = new Map<string, CacheEntry>()

/** Remove all cache entries under (and including) dirPath. */
export function invalidateTreeCache(dirPath: string): void {
  for (const key of treeCache.keys()) {
    if (key === dirPath || key.startsWith(dirPath + '/') || key.startsWith(dirPath + '\\')) {
      treeCache.delete(key)
    }
  }
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

const ALLOWED_EXTS = new Set(['.txt', '.json', '.mp3', '.ogg', '.wav', '.m4a'])

async function buildTree(dirPath: string, depth = 0): Promise<TreeNode[]> {
  if (depth > 4) return []

  // ── Cache lookup ────────────────────────────────────────────────────────────
  let currentMtime = 0
  try {
    const s = await stat(dirPath)
    currentMtime = s.mtimeMs
    const cached = treeCache.get(dirPath)
    if (cached && cached.mtimeMs === currentMtime) return cached.nodes
  } catch {
    // stat failed (permission error, race condition) — proceed without cache
  }

  // ── Fresh scan ──────────────────────────────────────────────────────────────
  const entries = await readdir(dirPath, { withFileTypes: true })
  const nodes: TreeNode[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const fullPath = join(dirPath, entry.name)
    if (entry.isDirectory()) {
      const children = await buildTree(fullPath, depth + 1)
      nodes.push({ name: entry.name, path: fullPath, type: 'folder', children })
    } else {
      const ext = entry.name.slice(entry.name.lastIndexOf('.')).toLowerCase()
      if (ALLOWED_EXTS.has(ext))
        nodes.push({ name: entry.name, path: fullPath, type: 'file', children: [] })
    }
  }

  const sorted = nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })

  // ── Cache store ─────────────────────────────────────────────────────────────
  if (currentMtime > 0) {
    treeCache.set(dirPath, { mtimeMs: currentMtime, nodes: sorted })
  }

  return sorted
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

export function registerFsHandlers(): void {
  ipcMain.handle('fs:readTree', (_e, dirPath: string) => buildTree(assertPathAllowed(dirPath)))

  ipcMain.handle('fs:readFile', (_e, filePath: string) =>
    readFile(assertPathAllowed(filePath), 'utf-8')
  )

  ipcMain.handle('fs:readFileOptional', async (_e, filePath: string) => {
    const approvedPath = assertPathAllowed(filePath)
    try {
      return await readFile(approvedPath, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  })

  ipcMain.handle('fs:readAudioBuffer', async (_e, filePath: string) => {
    // Still used for TTS-generated audio passed as base64 blobs.
    // Local file audio now goes through the audio:// protocol instead.
    const buf = await fs.promises.readFile(assertPathAllowed(filePath))
    return buf.toString('base64')
  })

  ipcMain.handle('fs:writeFile', async (_e, filePath: string, content: string) => {
    const approved = assertPathAllowed(filePath)
    await writeFile(approved, content, 'utf-8')
    // Invalidate cache for the parent directory so the next readTree reflects changes
    invalidateTreeCache(approved.replace(/[\\/][^\\/]+$/, ''))
  })

  ipcMain.handle('move-file', async (_e, oldPath: string, newPath: string) => {
    const approvedOld = assertPathAllowed(oldPath)
    const approvedNew = assertPathAllowed(newPath)
    await fs.promises.rename(approvedOld, approvedNew)
    // Invalidate both directories
    invalidateTreeCache(approvedOld.replace(/[\\/][^\\/]+$/, ''))
    invalidateTreeCache(approvedNew.replace(/[\\/][^\\/]+$/, ''))
  })

  ipcMain.handle('fs:readGlossary', async (_e, dirPath: string) => {
    const approvedDir = assertPathAllowed(dirPath)
    const candidates = [
      join(approvedDir, 'glossary.json'),
      join(approvedDir, '..', 'glossary.json')
    ]
    for (const p of candidates) {
      if (existsSync(p)) {
        try {
          return JSON.parse(await readFile(p, 'utf-8'))
        } catch {
          console.warn(`[fs:readGlossary] Failed to parse ${p} — returning empty glossary`)
          return []
        }
      }
    }
    return []
  })

  ipcMain.handle('fs:getPairedPath', (_e, srcPath: string) => {
    const approvedPath = assertPathAllowed(srcPath)
    const paired = approvedPath.replace(/(\.[^.]+)$/, '.translated$1')
    return { path: paired, exists: existsSync(paired) }
  })
}
