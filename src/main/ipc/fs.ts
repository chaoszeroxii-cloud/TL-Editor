import { ipcMain } from 'electron'
import { join } from 'path'
import { readdir, readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import fs from 'fs'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children: TreeNode[]
}

// ─── Tree builder ─────────────────────────────────────────────────────────────

const ALLOWED_EXTS = new Set(['.txt', '.json', '.mp3', '.ogg', '.wav', '.m4a'])

async function buildTree(dirPath: string, depth = 0): Promise<TreeNode[]> {
  if (depth > 4) return []
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
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

export function registerFsHandlers(): void {
  ipcMain.handle('fs:readTree', (_e, dirPath: string) => buildTree(dirPath))

  ipcMain.handle('fs:readFile', (_e, filePath: string) => readFile(filePath, 'utf-8'))

  ipcMain.handle('fs:readFileOptional', async (_e, filePath: string) => {
    try {
      return await readFile(filePath, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  })

  ipcMain.handle('fs:readAudioBuffer', async (_e, filePath: string) => {
    const buf = await readFile(filePath)
    return buf.toString('base64')
  })

  ipcMain.handle('fs:writeFile', (_e, filePath: string, content: string) =>
    writeFile(filePath, content, 'utf-8')
  )

  ipcMain.handle('move-file', (_e, oldPath: string, newPath: string) =>
    fs.promises.rename(oldPath, newPath)
  )

  ipcMain.handle('fs:readGlossary', async (_e, dirPath: string) => {
    const candidates = [join(dirPath, 'glossary.json'), join(dirPath, '..', 'glossary.json')]
    for (const p of candidates) {
      if (existsSync(p)) {
        try {
          return JSON.parse(await readFile(p, 'utf-8'))
        } catch {
          // Malformed glossary.json — return empty rather than crashing
          console.warn(`[fs:readGlossary] Failed to parse ${p} — returning empty glossary`)
          return []
        }
      }
    }
    return []
  })

  ipcMain.handle('fs:getPairedPath', (_e, srcPath: string) => {
    const paired = srcPath.replace(/(\.[^.]+)$/, '.translated$1')
    return { path: paired, exists: existsSync(paired) }
  })
}
