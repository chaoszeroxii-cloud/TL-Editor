import type { TreeNode } from '../types'

// ─── JSON file collector ──────────────────────────────────────────────────────
// Collects all .json files in the tree except glossary.json

export function collectJsonFiles(nodes: TreeNode[]): { name: string; path: string }[] {
  const result: { name: string; path: string }[] = []
  for (const node of nodes) {
    if (node.type === 'folder') result.push(...collectJsonFiles(node.children))
    else if (node.name.endsWith('.json') && node.name !== 'glossary.json')
      result.push({ name: node.name, path: node.path })
  }
  return result
}
