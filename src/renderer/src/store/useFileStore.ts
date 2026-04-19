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

  lineMetadata: Record<number, { tone: string; voiceGender: string; voiceName?: string }>
  setLineMetadata: Dispatch<
    SetStateAction<Record<number, { tone: string; voiceGender: string; voiceName?: string }>>
  >
  getLineTone: (lineIndex: number) => string
  setLineTone: (lineIndex: number, tone: string) => void
  getLineVoiceGender: (lineIndex: number) => string
  setLineVoiceGender: (lineIndex: number, gender: string) => void

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
  commitRename: (which: 'tgt' | 'src') => Promise<string | null>
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
  const [lineMetadata, setLineMetadata] = useState<
    Record<number, { tone: string; voiceGender: string; voiceName?: string }>
  >({})

  // ── Rename state ──────────────────────────────────────────────────────────
  const [renamingTgt, setRenamingTgt] = useState(false)
  const [renamingSrc, setRenamingSrc] = useState(false)
  const [renameValue, setRenameValue] = useState('')

  // ── TGT handlers ──────────────────────────────────────────────────────────

  const handleTgtChange = useCallback((content: string) => {
    // Use state setter callback to ensure we capture the correct previous content
    // This avoids stale closure issues with rapid edits/pastes
    setTgtContent((prevContent) => {
      if (prevContent !== content) {
        const last = tgtUndoStack.current[tgtUndoStack.current.length - 1]
        // Only add to undo if this is a new change (last !== prevContent)
        if (last !== prevContent) {
          tgtUndoStack.current.push(prevContent)
          if (tgtUndoStack.current.length > UNDO_LIMIT) {
            tgtUndoStack.current.shift()
          }
        }
      }
      // Clear redo stack on any new change
      tgtRedoStack.current = []
      setIsDirty(true)
      return content
    })
  }, [])

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

  const handleSrcChange = useCallback((content: string) => {
    // Use state setter callback to ensure we capture the correct previous content
    // This avoids stale closure issues with rapid edits/pastes
    setSrcContent((prevContent) => {
      if (prevContent !== content) {
        const last = srcUndoStack.current[srcUndoStack.current.length - 1]
        // Only add to undo if this is a new change (last !== prevContent)
        if (last !== prevContent) {
          srcUndoStack.current.push(prevContent)
          if (srcUndoStack.current.length > UNDO_LIMIT) {
            srcUndoStack.current.shift()
          }
        }
      }
      // Clear redo stack on any new change
      srcRedoStack.current = []
      setSrcIsDirty(true)
      return content
    })
  }, [])

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
    setLineMetadata({})
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
    async (which: 'tgt' | 'src'): Promise<string | null> => {
      const oldPath = which === 'tgt' ? tgtPathRef.current : srcPathRef.current
      if (!oldPath || !renameValue.trim()) {
        setRenamingTgt(false)
        setRenamingSrc(false)
        return null
      }
      const dir = oldPath.replace(/[\\/][^\\/]+$/, '')
      const newPath = `${dir}/${renameValue.trim()}`
      if (newPath === oldPath) {
        setRenamingTgt(false)
        setRenamingSrc(false)
        return null
      }

      try {
        // Save current content to old path first if dirty, then rename
        const isDirtyNow = which === 'tgt' ? isDirty : srcIsDirty
        if (isDirtyNow) {
          const content = which === 'tgt' ? tgtContentRef.current : srcContentRef.current
          await window.electron.writeFile(oldPath, content)
        }

        // Perform actual file rename on disk (not write to new path)
        await window.electron.moveFile(oldPath, newPath)

        // Update path reference
        if (which === 'tgt') {
          _setTgtPath(newPath)
          setIsDirty(false)
        } else {
          _setSrcPath(newPath)
          setSrcIsDirty(false)
        }

        setRenamingTgt(false)
        setRenamingSrc(false)
        return newPath
      } catch (error) {
        console.error('[commitRename] Failed to rename', { oldPath, newPath, error })
        setRenamingTgt(false)
        setRenamingSrc(false)
        return null
      }
    },
    [renameValue, _setTgtPath, _setSrcPath, isDirty, srcIsDirty]
  )

  const cancelRename = useCallback(() => {
    setRenamingTgt(false)
    setRenamingSrc(false)
  }, [])

  // ── Line Metadata helpers ────────────────────────────────────────────────

  const getLineTone = useCallback(
    (lineIndex: number): string => {
      return lineMetadata[lineIndex]?.tone || 'normal'
    },
    [lineMetadata]
  )

  const setLineTone = useCallback((lineIndex: number, tone: string) => {
    setLineMetadata((prev) => ({
      ...prev,
      [lineIndex]: { ...prev[lineIndex], tone }
    }))
  }, [])

  const getLineVoiceGender = useCallback(
    (lineIndex: number): string => {
      return lineMetadata[lineIndex]?.voiceGender || 'female'
    },
    [lineMetadata]
  )

  const setLineVoiceGender = useCallback((lineIndex: number, gender: string) => {
    setLineMetadata((prev) => ({
      ...prev,
      [lineIndex]: { ...prev[lineIndex], voiceGender: gender }
    }))
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
    lineMetadata,
    setLineMetadata,
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
    cancelRename,

    // line metadata helpers
    getLineTone,
    setLineTone,
    getLineVoiceGender,
    setLineVoiceGender
  }
}
