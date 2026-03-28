import { useState, useRef, useCallback, Dispatch, SetStateAction, MutableRefObject } from 'react'

const UNDO_LIMIT = 200

// ─────────────────────────────────────────────────────────────────────────────
// useFileStore
// Manages both TGT (translation) and SRC (source) file state including
// content, dirty flag, undo/redo stacks, save, and inline rename.
// ─────────────────────────────────────────────────────────────────────────────
export interface FileStore {
  // ── State ─────────────────────────────────────────────
  tgtPath: string | null
  tgtContent: string
  isDirty: boolean
  saving: boolean

  srcPath: string | null
  srcContent: string
  srcIsDirty: boolean

  nextSlot: 'tgt' | 'src'
  setNextSlot: Dispatch<SetStateAction<'tgt' | 'src'>>

  activeRow: number
  setActiveRow: Dispatch<SetStateAction<number>>

  mp3Path: string | null
  setMp3Path: Dispatch<SetStateAction<string | null>>

  renamingTgt: boolean
  renamingSrc: boolean
  renameValue: string
  setRenameValue: Dispatch<SetStateAction<string>>

  // ── Refs ───────────────────────────────────────────────
  tgtPathRef: MutableRefObject<string | null>
  tgtContentRef: MutableRefObject<string>
  srcPathRef: MutableRefObject<string | null>
  srcContentRef: MutableRefObject<string>
  savingRef: MutableRefObject<boolean>

  // ── TGT Actions ────────────────────────────────────────
  handleTgtChange: (content: string) => void
  handleUndo: () => void
  handleRedo: () => void
  handleSave: () => Promise<void>
  handleCopyTgt: () => void

  // ── SRC Actions ────────────────────────────────────────
  handleSrcChange: (content: string) => void
  handleSrcUndo: () => void
  handleSrcRedo: () => void
  handleSrcSave: () => Promise<void>
  handleCopySrc: () => void

  // ── Loaders ───────────────────────────────────────────
  loadTgt: (path: string, content: string) => void
  loadSrc: (path: string, content: string) => void
  clearAll: () => void

  // ── Rename ─────────────────────────────────────────────
  startRenameTgt: () => void
  startRenameSrc: () => void
  commitRename: (which: 'tgt' | 'src') => Promise<void>
  cancelRename: () => void
}

export function useFileStore(): FileStore {
  // ── TGT ──────────────────────────────────────────────────────────────────
  const [tgtPath, setTgtPath] = useState<string | null>(null)
  const [tgtContent, setTgtContent] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // Use refs to avoid stale closures in event handlers
  const tgtPathRef = useRef(tgtPath)
  const tgtContentRef = useRef(tgtContent)
  const savingRef = useRef(saving)

  const tgtUndoStack = useRef<string[]>([])
  const tgtRedoStack = useRef<string[]>([])

  // Keep refs in sync
  const _setTgtPath = useCallback((p: string | null) => {
    tgtPathRef.current = p
    setTgtPath(p)
  }, [])
  const _setTgtContent = useCallback((c: string) => {
    tgtContentRef.current = c
    setTgtContent(c)
  }, [])
  const _setSaving = useCallback((v: boolean) => {
    savingRef.current = v
    setSaving(v)
  }, [])

  // ── SRC ──────────────────────────────────────────────────────────────────
  const [srcPath, setSrcPath] = useState<string | null>(null)
  const [srcContent, setSrcContent] = useState('')
  const [srcIsDirty, setSrcIsDirty] = useState(false)

  const srcPathRef = useRef(srcPath)
  const srcContentRef = useRef(srcContent)

  const srcUndoStack = useRef<string[]>([])
  const srcRedoStack = useRef<string[]>([])

  const _setSrcPath = useCallback((p: string | null) => {
    srcPathRef.current = p
    setSrcPath(p)
  }, [])
  const _setSrcContent = useCallback((c: string) => {
    srcContentRef.current = c
    setSrcContent(c)
  }, [])

  // ── Misc ─────────────────────────────────────────────────────────────────
  const [nextSlot, setNextSlot] = useState<'tgt' | 'src'>('tgt')
  const [activeRow, setActiveRow] = useState(-1)
  const [mp3Path, setMp3Path] = useState<string | null>(null)

  // ── Rename state ──────────────────────────────────────────────────────────
  const [renamingTgt, setRenamingTgt] = useState(false)
  const [renamingSrc, setRenamingSrc] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  // ── TGT handlers ──────────────────────────────────────────────────────────

  const handleTgtChange = useCallback(
    (content: string) => {
      const cur = tgtContentRef.current
      if (cur !== content) {
        const last = tgtUndoStack.current[tgtUndoStack.current.length - 1]
        if (last !== cur) {
          tgtUndoStack.current.push(cur)
          if (tgtUndoStack.current.length > UNDO_LIMIT) tgtUndoStack.current.shift()
        }
      }
      tgtRedoStack.current = []
      _setTgtContent(content)
      setIsDirty(true)
    },
    [_setTgtContent]
  )

  const handleUndo = useCallback(() => {
    const prev = tgtUndoStack.current.pop()
    if (prev === undefined) return
    tgtRedoStack.current.push(tgtContentRef.current)
    _setTgtContent(prev)
    setIsDirty(true)
  }, [_setTgtContent])

  const handleRedo = useCallback(() => {
    const next = tgtRedoStack.current.pop()
    if (next === undefined) return
    tgtUndoStack.current.push(tgtContentRef.current)
    _setTgtContent(next)
    setIsDirty(true)
  }, [_setTgtContent])

  const handleSave = useCallback(async () => {
    if (!tgtPathRef.current || savingRef.current) return
    _setSaving(true)
    await window.electron.writeFile(tgtPathRef.current, tgtContentRef.current)
    setIsDirty(false)
    _setSaving(false)
  }, [_setSaving])

  const handleCopyTgt = useCallback(() => {
    navigator.clipboard.writeText(tgtContentRef.current)
  }, [])

  // ── SRC handlers ──────────────────────────────────────────────────────────

  const handleSrcChange = useCallback(
    (content: string) => {
      const cur = srcContentRef.current
      if (cur !== content) {
        const last = srcUndoStack.current[srcUndoStack.current.length - 1]
        if (last !== cur) {
          srcUndoStack.current.push(cur)
          if (srcUndoStack.current.length > UNDO_LIMIT) srcUndoStack.current.shift()
        }
      }
      srcRedoStack.current = []
      _setSrcContent(content)
      setSrcIsDirty(true)
    },
    [_setSrcContent]
  )

  const handleSrcUndo = useCallback(() => {
    const prev = srcUndoStack.current.pop()
    if (prev === undefined) return
    srcRedoStack.current.push(srcContentRef.current)
    _setSrcContent(prev)
    setSrcIsDirty(true)
  }, [_setSrcContent])

  const handleSrcRedo = useCallback(() => {
    const next = srcRedoStack.current.pop()
    if (next === undefined) return
    srcUndoStack.current.push(srcContentRef.current)
    _setSrcContent(next)
    setSrcIsDirty(true)
  }, [_setSrcContent])

  const handleSrcSave = useCallback(async () => {
    if (!srcPathRef.current || savingRef.current) return
    _setSaving(true)
    await window.electron.writeFile(srcPathRef.current, srcContentRef.current)
    setSrcIsDirty(false)
    _setSaving(false)
  }, [_setSaving])

  const handleCopySrc = useCallback(() => {
    navigator.clipboard.writeText(srcContentRef.current)
  }, [])

  // ── Load file into slot ───────────────────────────────────────────────────

  const loadTgt = useCallback(
    (path: string, content: string) => {
      _setTgtPath(path)
      _setTgtContent(content)
      setIsDirty(false)
      setSrcIsDirty(false)
      setActiveRow(-1)
      tgtUndoStack.current = []
      tgtRedoStack.current = []
    },
    [_setTgtPath, _setTgtContent]
  )

  const loadSrc = useCallback(
    (path: string, content: string) => {
      _setSrcPath(path)
      _setSrcContent(content)
      setSrcIsDirty(false)
      srcUndoStack.current = []
      srcRedoStack.current = []
    },
    [_setSrcPath, _setSrcContent]
  )

  const clearAll = useCallback(() => {
    _setTgtPath(null)
    _setTgtContent('')
    _setSrcPath(null)
    _setSrcContent('')
    setIsDirty(false)
    setSrcIsDirty(false)
    setNextSlot('tgt')
    setActiveRow(-1)
    tgtUndoStack.current = []
    tgtRedoStack.current = []
    srcUndoStack.current = []
    srcRedoStack.current = []
  }, [_setTgtPath, _setTgtContent, _setSrcPath, _setSrcContent])

  // ── Rename ────────────────────────────────────────────────────────────────

  const startRenameTgt = useCallback(() => {
    setRenameValue(tgtPathRef.current?.split(/[\\/]/).pop() ?? '')
    setRenamingTgt(true)
    setRenamingSrc(false)
  }, [])

  const startRenameSrc = useCallback(() => {
    setRenameValue(srcPathRef.current?.split(/[\\/]/).pop() ?? '')
    setRenamingSrc(true)
    setRenamingTgt(false)
  }, [])

  const commitRename = useCallback(
    async (which: 'tgt' | 'src') => {
      const oldPath = which === 'tgt' ? tgtPathRef.current : srcPathRef.current
      if (!oldPath || !renameValue.trim()) {
        setRenamingTgt(false)
        setRenamingSrc(false)
        return
      }
      const dir = oldPath.replace(/[\\/][^\\/]+$/, '')
      const newPath = `${dir}/${renameValue.trim()}`
      if (newPath === oldPath) {
        setRenamingTgt(false)
        setRenamingSrc(false)
        return
      }

      const content = which === 'tgt' ? tgtContentRef.current : srcContentRef.current
      await window.electron.writeFile(newPath, content)
      if (which === 'tgt') _setTgtPath(newPath)
      else _setSrcPath(newPath)
      setRenamingTgt(false)
      setRenamingSrc(false)
    },
    [renameValue, _setTgtPath, _setSrcPath]
  )

  const cancelRename = useCallback(() => {
    setRenamingTgt(false)
    setRenamingSrc(false)
  }, [])

  // ── Expose refs for event-handler use in App ──────────────────────────────

  return {
    // state
    tgtPath,
    tgtContent,
    isDirty,
    saving,
    srcPath,
    srcContent,
    srcIsDirty,
    nextSlot,
    setNextSlot,
    activeRow,
    setActiveRow,
    mp3Path,
    setMp3Path,
    renamingTgt,
    renamingSrc,
    renameValue,
    setRenameValue,

    // refs (needed by keyboard shortcut handlers)
    tgtPathRef,
    tgtContentRef,
    srcPathRef,
    srcContentRef,
    savingRef,

    // tgt handlers
    handleTgtChange,
    handleUndo,
    handleRedo,
    handleSave,
    handleCopyTgt,

    // src handlers
    handleSrcChange,
    handleSrcUndo,
    handleSrcRedo,
    handleSrcSave,
    handleCopySrc,

    // loaders
    loadTgt,
    loadSrc,
    clearAll,

    // rename
    startRenameTgt,
    startRenameSrc,
    commitRename,
    cancelRename
  }
}
