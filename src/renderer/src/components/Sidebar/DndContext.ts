import { createContext } from 'react'
import type { TreeNode } from '../../types'
import type { DropInfo } from './useDragDrop'

// ─── DnD context (shared with NodeItem) ──────────────────────────────────────

export interface DndCtxVal {
  draggingPath: string | null
  drop: DropInfo | null
  onItemMouseDown: (e: React.MouseEvent, node: TreeNode, clickFn: () => void) => void
}

export const DndCtx = createContext<DndCtxVal>({
  draggingPath: null,
  drop: null,
  onItemMouseDown: () => {}
})
