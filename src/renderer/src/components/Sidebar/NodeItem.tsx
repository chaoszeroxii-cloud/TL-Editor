import { memo, useState, useContext, JSX } from 'react'
import type { TreeNode } from '../../types'
import { DndCtx } from './index'
import {
  IcoFolder,
  IcoFolderOpen,
  IcoFile,
  IcoDatabase,
  IcoBook,
  IcoPen,
  IcoMusic,
  IcoChevronDown,
  IcoChevronRight
} from '../common/icons'

interface NodeItemProps {
  node: TreeNode
  depth: number
  activePath: string | null
  onSelectFile: (p: string) => void
  onOpenJsonFile: (p: string) => void
  onSelectMp3: (p: string) => void
  onRename?: (oldPath: string, newPath: string) => Promise<void>
}

export const NodeItem = memo(function NodeItem({
  node,
  depth,
  activePath,
  onSelectFile,
  onOpenJsonFile,
  onSelectMp3,
  onRename
}: NodeItemProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameVal, setRenameVal] = useState('')
  const { draggingPath, drop, onItemMouseDown } = useContext(DndCtx)

  const indent = depth * 12
  const isDragging = draggingPath === node.path
  const isTarget = drop?.path === node.path
  const dropPos = isTarget ? drop!.pos : null

  const indicator: React.CSSProperties = (() => {
    if (!isTarget || !dropPos) return {}
    if (dropPos === 'before') return { boxShadow: 'inset 0 2px 0 0 var(--accent)' }
    if (dropPos === 'after') return { boxShadow: '0 2px 0 0 var(--accent)' }
    return {
      background: 'rgba(91,138,240,0.16)',
      outline: '1px solid rgba(91,138,240,0.45)',
      outlineOffset: '-1px'
    }
  })()

  const startRename = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setRenameVal(node.name)
    setRenaming(true)
  }

  const commitRename = async (): Promise<void> => {
    setRenaming(false)
    const newName = renameVal.trim()
    if (!newName || newName === node.name) return
    const dir = node.path.replace(/[\\/][^\\/]+$/, '')
    const sep = node.path.includes('\\') ? '\\' : '/'
    const newPath = `${dir}${sep}${newName}`
    await onRename?.(node.path, newPath)
  }

  // ── Folder ──────────────────────────────────────────────────────────────

  if (node.type === 'folder') {
    return (
      <>
        <div
          data-dnd-path={node.path}
          data-dnd-type="folder"
          onMouseDown={(e) => onItemMouseDown(e, node, () => setOpen((o) => !o))}
          style={{ ...itemBase, paddingLeft: indent, opacity: isDragging ? 0.3 : 1, ...indicator }}
        >
          <ChevIcon open={open} />
          <span style={{ color: 'var(--text2)', display: 'flex', flexShrink: 0 }}>
            {open ? (
              <IcoFolderOpen size={12} stroke="currentColor" />
            ) : (
              <IcoFolder size={12} stroke="currentColor" />
            )}
          </span>
          <span style={folderNameSx}>{node.name}</span>
        </div>
        {open &&
          node.children.map((c) => (
            <NodeItem
              key={c.path}
              node={c}
              depth={depth + 1}
              activePath={activePath}
              onSelectFile={onSelectFile}
              onOpenJsonFile={onOpenJsonFile}
              onSelectMp3={onSelectMp3}
              onRename={onRename}
            />
          ))}
      </>
    )
  }

  // ── File ────────────────────────────────────────────────────────────────

  const isActive = node.path === activePath
  const isJson = node.name.endsWith('.json')
  const isGlossary = node.name === 'glossary.json'
  const isTL = node.name.endsWith('.translated.txt')
  const isMp3 = /\.(mp3|ogg|wav|m4a)$/i.test(node.name)

  const color = isActive
    ? 'var(--accent)'
    : isGlossary
      ? 'var(--hl-gold)'
      : isMp3
        ? 'var(--hl-coral)'
        : isJson
          ? 'var(--hl-teal)'
          : isTL
            ? 'var(--hl-coral)'
            : 'var(--text1)'

  const icon = isGlossary ? (
    <IcoBook size={12} stroke="var(--hl-gold)" />
  ) : isMp3 ? (
    <IcoMusic size={12} stroke="var(--hl-coral)" />
  ) : isJson ? (
    <IcoDatabase size={12} stroke="var(--hl-teal)" />
  ) : isTL ? (
    <IcoPen size={12} stroke="var(--hl-coral)" />
  ) : (
    <IcoFile size={12} stroke="var(--text2)" />
  )

  const doClick = (): void => {
    if (isJson) return onOpenJsonFile(node.path)
    if (isMp3) return onSelectMp3(node.path)
    onSelectFile(node.path)
  }

  return (
    <div
      data-dnd-path={node.path}
      data-dnd-type="file"
      onMouseDown={(e) => {
        if (!renaming) onItemMouseDown(e, node, doClick)
      }}
      onDoubleClick={startRename}
      title={node.path}
      style={{
        ...itemBase,
        paddingLeft: indent,
        ...(isActive ? activeItemSx : {}),
        opacity: isDragging ? 0.3 : 1,
        ...indicator
      }}
    >
      <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>

      {renaming ? (
        <input
          autoFocus
          value={renameVal}
          onChange={(e) => setRenameVal(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitRename()
            }
            if (e.key === 'Escape') {
              e.stopPropagation()
              setRenaming(false)
            }
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1,
            background: 'var(--bg3)',
            border: '1px solid var(--accent)',
            borderRadius: 3,
            color: 'var(--text0)',
            fontSize: 11,
            padding: '1px 5px',
            outline: 'none',
            fontFamily: 'var(--font-ui)',
            minWidth: 0
          }}
        />
      ) : (
        <span
          style={{
            color,
            fontSize: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1
          }}
        >
          {node.name}
        </span>
      )}

      {isJson && !renaming && (
        <span
          style={{
            fontSize: 9,
            color: 'var(--text2)',
            fontFamily: 'var(--font-mono)',
            flexShrink: 0
          }}
        >
          edit
        </span>
      )}
      {isMp3 && !renaming && (
        <span
          style={{
            fontSize: 9,
            color: 'var(--hl-coral)',
            fontFamily: 'var(--font-mono)',
            flexShrink: 0,
            opacity: 0.7
          }}
        >
          ▶
        </span>
      )}
    </div>
  )
})

// ── Sub-components ────────────────────────────────────────────────────────────

function ChevIcon({ open }: { open: boolean }): JSX.Element {
  return (
    <span style={{ color: 'var(--text2)', display: 'flex', width: 10, flexShrink: 0 }}>
      {open ? (
        <IcoChevronDown size={9} stroke="currentColor"></IcoChevronDown>
      ) : (
        <IcoChevronRight size={9} stroke="currentColor"></IcoChevronRight>
      )}
    </span>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const itemBase: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  padding: '3px 10px',
  cursor: 'default',
  fontSize: 12,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  userSelect: 'none',
  transition: 'background 0.08s'
}

const activeItemSx: React.CSSProperties = { background: 'var(--accent-dim)' }

const folderNameSx: React.CSSProperties = {
  color: 'var(--text0)',
  fontWeight: 500,
  fontSize: 12
}
