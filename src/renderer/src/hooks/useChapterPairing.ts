import type { TreeNode } from '../types'

// ── Extract chapter number from filename ──────────────────────────────────────

export function extractChapterNum(name: string): string | null {
  const m = name.match(/\d+/)
  return m ? m[0] : null
}

// ── Flatten tree into file list ───────────────────────────────────────────────

export interface FlatFile {
  path: string
  name: string
  folderName: string
}

export function flattenFiles(nodes: TreeNode[], parentName = ''): FlatFile[] {
  const result: FlatFile[] = []
  for (const node of nodes) {
    if (node.type === 'folder') result.push(...flattenFiles(node.children, node.name))
    else result.push({ path: node.path, name: node.name, folderName: parentName })
  }
  return result
}

/**
 * Given a source file path and the full tree, look for a matching
 * translated file in a folder whose name contains "แปล" with the
 * same chapter number.
 */
export function findTranslationPair(tree: TreeNode[], sourcePath: string): string | null {
  const sourceName = sourcePath.split(/[\\/]/).pop() ?? ''
  const chNum = extractChapterNum(sourceName)
  if (!chNum) return null
  const files = flattenFiles(tree)
  return (
    files.find(
      (f) =>
        f.path !== sourcePath &&
        f.name.endsWith('.txt') &&
        f.folderName.includes('แปล') &&
        extractChapterNum(f.name) === chNum
    )?.path ?? null
  )
}
