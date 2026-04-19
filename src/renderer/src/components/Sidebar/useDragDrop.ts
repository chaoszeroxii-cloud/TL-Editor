import { useState, useRef, useCallback, useEffect } from 'react'
import type { TreeNode } from '../../types'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DropPos = 'before' | 'after' | 'inside'

export interface DropInfo {
  path: string
  pos: DropPos
}

// ─── Path helpers ─────────────────────────────────────────────────────────────

function parentPath(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(0, i) : p
}

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

function pathSep(p: string): string {
  return p.includes('\\') ? '\\' : '/'
}

export function computeNewPath(dragPath: string, targetPath: string, pos: DropPos): string {
  const name = baseName(dragPath)
  const sep = pathSep(dragPath)
  if (pos === 'inside') return targetPath + sep + name
  return parentPath(targetPath) + sep + name
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────

export function removeNode(nodes: TreeNode[], path: string): [TreeNode[], TreeNode | null] {
  let removed: TreeNode | null = null
  const walk = (arr: TreeNode[]): TreeNode[] =>
    arr.flatMap((n) => {
      if (n.path === path) {
        removed = n
        return []
      }
      if (n.type === 'folder') return [{ ...n, children: walk(n.children) }]
      return [n]
    })
  return [walk(nodes), removed]
}

export function insertNode(
  nodes: TreeNode[],
  targetPath: string,
  pos: DropPos,
  node: TreeNode
): TreeNode[] {
  const out: TreeNode[] = []
  for (const n of nodes) {
    if (pos === 'before' && n.path === targetPath) out.push(node, n)
    else if (pos === 'after' && n.path === targetPath) out.push(n, node)
    else if (pos === 'inside' && n.path === targetPath && n.type === 'folder')
      out.push({ ...n, children: [node, ...n.children] })
    else if (n.type === 'folder')
      out.push({ ...n, children: insertNode(n.children, targetPath, pos, node) })
    else out.push(n)
  }
  return out
}

export function isAncestorOf(nodes: TreeNode[], ancestorPath: string, childPath: string): boolean {
  const checkDesc = (ns: TreeNode[], target: string): boolean =>
    ns.some((n) => n.path === target || (n.type === 'folder' && checkDesc(n.children, target)))
  const findAnc = (ns: TreeNode[]): boolean =>
    ns.some((n) => {
      if (n.path === ancestorPath && n.type === 'folder') return checkDesc(n.children, childPath)
      if (n.type === 'folder') return findAnc(n.children)
      return false
    })
  return findAnc(nodes)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseDragDropReturn {
  draggingPath: string | null
  draggingName: string
  mouseXY: {
    x: number
    y: number
  }
  drop: DropInfo | null
  moving: boolean
  moveError: string | null
  onItemMouseDown: (e: React.MouseEvent, node: TreeNode, clickFn: () => void) => void
}

export function useDragDrop({
  treeRef,
  onReorderTree,
  onFileMoved
}: {
  treeRef: React.MutableRefObject<TreeNode[] | null>
  onReorderTree?: (nodes: TreeNode[]) => void
  onFileMoved?: (dragPath: string, newPath: string) => Promise<void>
}): UseDragDropReturn {
  const pendingNodeRef = useRef<TreeNode | null>(null)
  const pendingClickRef = useRef<(() => void) | null>(null)
  const startXYRef = useRef({ x: 0, y: 0 })
  const isActiveRef = useRef(false)
  const dropRef = useRef<DropInfo | null>(null)

  const [draggingPath, setDraggingPath] = useState<string | null>(null)
  const [draggingName, setDraggingName] = useState('')
  const [mouseXY, setMouseXY] = useState({ x: 0, y: 0 })
  const [drop, setDrop] = useState<DropInfo | null>(null)
  const [moving, setMoving] = useState(false)
  const [moveError, setMoveError] = useState<string | null>(null)

  const updateDrop = useCallback((d: DropInfo | null) => {
    dropRef.current = d
    setDrop(d)
  }, [])

  const onItemMouseDown = useCallback(
    (e: React.MouseEvent, node: TreeNode, clickFn: () => void) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      pendingNodeRef.current = node
      pendingClickRef.current = clickFn
      startXYRef.current = { x: e.clientX, y: e.clientY }
      isActiveRef.current = false
    },
    []
  )

  useEffect(() => {
    const THRESHOLD = 5

    const onMove = (e: MouseEvent): void => {
      if (!pendingNodeRef.current) return
      const dx = e.clientX - startXYRef.current.x
      const dy = e.clientY - startXYRef.current.y

      if (!isActiveRef.current) {
        if (Math.abs(dx) + Math.abs(dy) < THRESHOLD) return
        isActiveRef.current = true
        setDraggingPath(pendingNodeRef.current.path)
        setDraggingName(pendingNodeRef.current.name)
      }

      setMouseXY({ x: e.clientX, y: e.clientY })

      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      const item = el?.closest?.('[data-dnd-path]') as HTMLElement | null

      if (!item) {
        updateDrop(null)
        return
      }

      const tp = item.getAttribute('data-dnd-path')!
      const tt = item.getAttribute('data-dnd-type') as 'file' | 'folder'
      const drag = pendingNodeRef.current!.path

      if (tp === drag) {
        updateDrop(null)
        return
      }

      const rect = item.getBoundingClientRect()
      const relY = (e.clientY - rect.top) / rect.height
      let pos: DropPos
      if (tt === 'folder') {
        pos = relY < 0.28 ? 'before' : relY > 0.72 ? 'after' : 'inside'
      } else {
        pos = relY < 0.5 ? 'before' : 'after'
      }
      updateDrop({ path: tp, pos })
    }

    const onUp = async (): Promise<void> => {
      if (!pendingNodeRef.current) return

      if (!isActiveRef.current) {
        pendingClickRef.current?.()
        pendingNodeRef.current = null
        pendingClickRef.current = null
        return
      }

      const dragNode = pendingNodeRef.current
      const cur = treeRef.current

      if (dropRef.current && cur) {
        const { path: targetPath, pos } = dropRef.current
        const dragPath = dragNode.path
        const safe = dragPath !== targetPath && !isAncestorOf(cur, dragPath, targetPath)

        if (safe) {
          const newPath = computeNewPath(dragPath, targetPath, pos)
          if (newPath === dragPath) {
            const [without, node] = removeNode(cur, dragPath)
            if (node) onReorderTree?.(insertNode(without, targetPath, pos, node))
          } else {
            setMoving(true)
            setMoveError(null)
            try {
              await onFileMoved?.(dragPath, newPath)
            } catch (err) {
              console.error('Move failed:', err)
              setMoveError(`ย้ายไม่ได้: ${err instanceof Error ? err.message : String(err)}`)
              setTimeout(() => setMoveError(null), 3000)
            } finally {
              setMoving(false)
            }
          }
        }
      }

      pendingNodeRef.current = null
      pendingClickRef.current = null
      isActiveRef.current = false
      dropRef.current = null
      setDraggingPath(null)
      setDraggingName('')
      setDrop(null)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [onReorderTree, onFileMoved, updateDrop, treeRef])

  return {
    draggingPath,
    draggingName,
    mouseXY,
    drop,
    moving,
    moveError,
    onItemMouseDown
  }
}
