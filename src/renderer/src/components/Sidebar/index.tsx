import { memo, useRef, useEffect, createContext, JSX } from 'react'
import type { TreeNode } from '../../types'
import { useDragDrop } from './useDragDrop'
import { NodeItem } from './NodeItem'
import { IcoFolderOpen, IcoBook, IcoFilePlus, IcoSpinner, IcoGrid } from '../common/icons'

// ─── DnD context (shared with NodeItem) ──────────────────────────────────────

interface DndCtxVal {
  draggingPath: string | null
  drop: import('./useDragDrop').DropInfo | null
  onItemMouseDown: (e: React.MouseEvent, node: TreeNode, clickFn: () => void) => void
}

export const DndCtx = createContext<DndCtxVal>({
  draggingPath: null,
  drop: null,
  onItemMouseDown: () => {}
})

// ─── Props ────────────────────────────────────────────────────────────────────

interface SidebarProps {
  rootDir: string | null
  tree: TreeNode[]
  activePath: string | null
  onOpenFolder: () => void
  onSelectFile: (path: string) => void
  onOpenJsonFile: (path: string) => void
  onSelectMp3: (path: string) => void
  onNewFile: () => void
  onReorderTree?: (tree: TreeNode[]) => void
  onFileMoved?: (oldPath: string, newPath: string) => Promise<void>
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export const Sidebar = memo(function Sidebar({
  rootDir,
  tree,
  activePath,
  onOpenFolder,
  onSelectFile,
  onOpenJsonFile,
  onSelectMp3,
  onNewFile,
  onReorderTree,
  onFileMoved
}: SidebarProps): JSX.Element {
  const treeRef = useRef(tree)

  const { draggingPath, draggingName, mouseXY, drop, moving, moveError, onItemMouseDown } =
    useDragDrop({ treeRef, onReorderTree, onFileMoved })

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  useEffect(() => {
    treeRef.current = tree
    const onKey = (e: KeyboardEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.code === 'KeyN') {
        e.preventDefault()
        onNewFile()
        return
      }
      if (e.code === 'KeyO' && !e.shiftKey) {
        e.preventDefault()
        onOpenFolder()
        return
      }
      if (e.code === 'KeyO' && e.shiftKey) {
        e.preventDefault()
        openJsonDialog(onOpenJsonFile)
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tree, onNewFile, onOpenFolder, onOpenJsonFile])

  return (
    <DndCtx.Provider value={{ draggingPath, drop, onItemMouseDown }}>
      <div style={s.sidebar}>
        {/* Header buttons */}
        <div style={s.header}>
          <div style={{ display: 'flex', gap: 3 }}>
            <button style={{ ...s.btn, ...s.newBtn }} onClick={onNewFile} title="New file (Ctrl+N)">
              <IcoFilePlus size={10} stroke="currentColor" /> New
            </button>
            <button
              style={{ ...s.btn, ...s.jsonBtn }}
              onClick={() => openJsonDialog(onOpenJsonFile)}
              title="Open JSON (Ctrl+Shift+O)"
            >
              <IcoBook size={12} stroke="var(--hl-gold)" />
              <span style={{ color: 'var(--hl-gold)' }}>JSON</span>
            </button>
            <button style={s.btn} onClick={onOpenFolder} title="Open folder (Ctrl+O)">
              + Open
            </button>
          </div>
        </div>

        {/* Status bars */}
        {moving && (
          <div style={s.movingBar}>
            <IcoSpinner size={11} stroke="currentColor"></IcoSpinner>
            ย้ายไฟล์…
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}
        {moveError && <div style={s.errorBar}>{moveError}</div>}

        {/* Drag ghost */}
        {draggingPath && (
          <div
            style={{
              position: 'fixed',
              left: mouseXY.x + 14,
              top: mouseXY.y - 10,
              zIndex: 9999,
              pointerEvents: 'none',
              background: 'var(--bg2)',
              border: '1px solid var(--accent)',
              borderRadius: 5,
              padding: '3px 10px',
              fontSize: 11,
              color: 'var(--text0)',
              fontFamily: 'var(--font-mono)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.55)',
              opacity: 0.95,
              whiteSpace: 'nowrap',
              maxWidth: 190,
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}
          >
            {draggingName}
          </div>
        )}

        {/* Tree */}
        {rootDir ? (
          <div style={{ ...s.treeWrap, cursor: draggingPath ? 'grabbing' : undefined }}>
            <div style={s.rootLabel}>
              <IcoFolderOpen size={12} stroke="var(--accent)" />
              <span
                style={{
                  display: 'inline-block',
                  maxWidth: 150,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  verticalAlign: 'bottom'
                }}
                title={rootDir.split(/[\\/]/).pop() || ''}
              >
                {rootDir.split(/[\\/]/).pop()}
              </span>
            </div>
            {tree.map((node) => (
              <NodeItem
                key={node.path}
                node={node}
                depth={1}
                activePath={activePath}
                onSelectFile={onSelectFile}
                onOpenJsonFile={onOpenJsonFile}
                onSelectMp3={onSelectMp3}
                onRename={onFileMoved}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            onOpenFolder={onOpenFolder}
            onOpenJson={() => openJsonDialog(onOpenJsonFile)}
          />
        )}
      </div>
    </DndCtx.Provider>
  )
})

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  onOpenFolder,
  onOpenJson
}: {
  onOpenFolder: () => void
  onOpenJson: () => void
}): JSX.Element {
  return (
    <div style={s.empty}>
      <span style={{ opacity: 0.2, color: 'var(--text0)', display: 'flex' }}>
        <IcoGrid size={26} stroke="currentColor"></IcoGrid>
      </span>
      <span style={s.emptyText}>No folder opened</span>
      <button style={s.emptyBtn} onClick={onOpenFolder}>
        Open Folder
      </button>
      <button
        style={{
          ...s.emptyBtn,
          marginTop: 4,
          borderColor: 'var(--hl-gold-border)',
          color: 'var(--hl-gold)',
          background: 'var(--hl-gold-bg)'
        }}
        onClick={onOpenJson}
      >
        <IcoBook size={12} stroke="var(--hl-gold)" /> Open JSON
      </button>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function openJsonDialog(cb: (p: string) => void): Promise<void> {
  const p = await window.electron.openFile([{ name: 'JSON', extensions: ['json'] }])
  if (p) cb(p)
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 210,
    background: 'var(--bg1)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    overflow: 'hidden'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 8px',
    borderBottom: '1px solid var(--border)'
  },
  btn: {
    background: 'none',
    border: '1px solid var(--border)',
    color: 'var(--text1)',
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  jsonBtn: { background: 'var(--hl-gold-bg)', borderColor: 'var(--hl-gold-border)' },
  newBtn: {
    background: 'rgba(62,207,160,0.08)',
    borderColor: 'rgba(62,207,160,0.3)',
    color: 'var(--hl-teal)'
  },
  treeWrap: { overflowY: 'auto', flex: 1, padding: '4px 0', userSelect: 'none' },
  rootLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 10px',
    fontSize: 12,
    color: 'var(--text0)',
    fontWeight: 500
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20
  },
  emptyText: { fontSize: 12, color: 'var(--text2)', textAlign: 'center' },
  emptyBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    background: 'var(--accent-dim)',
    border: '1px solid var(--accent)',
    color: 'var(--accent)',
    fontSize: 12,
    padding: '5px 14px',
    borderRadius: 6,
    cursor: 'pointer'
  },
  movingBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    fontSize: 11,
    color: 'var(--hl-teal)',
    background: 'rgba(62,207,160,0.08)',
    borderBottom: '1px solid rgba(62,207,160,0.2)',
    fontFamily: 'var(--font-mono)',
    flexShrink: 0
  },
  errorBar: {
    padding: '4px 10px',
    fontSize: 11,
    color: 'var(--hl-coral)',
    background: 'rgba(240,122,106,0.1)',
    borderBottom: '1px solid rgba(240,122,106,0.3)',
    fontFamily: 'var(--font-mono)',
    flexShrink: 0
  }
}
