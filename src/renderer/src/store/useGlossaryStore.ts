import { useState, useCallback, useRef, Dispatch, SetStateAction } from 'react'
import type { GlossaryEntry, GlossaryFileFormat, OpenGlossaryFile } from '../types'
import {
  parseGlossaryFile,
  serializeByFormat,
  hasNestedPaths,
  serializeToNested
} from '../utils/glossaryParsers'
import { collectJsonFiles } from '../utils/pathHelpers'
import type { TreeNode } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// useGlossaryStore
// Manages glossary entries, source file tracking, and all save-back logic.
// ─────────────────────────────────────────────────────────────────────────────

export interface GlossaryStore {
  // State
  glossary: GlossaryEntry[]
  setGlossary: Dispatch<SetStateAction<GlossaryEntry[]>>
  glossaryPath: string | null
  setGlossaryPath: Dispatch<SetStateAction<string | null>>
  sourceFilePaths: Record<string, string>
  setSourceFilePaths: Dispatch<SetStateAction<Record<string, string>>>
  sourceFileFormats: Record<string, GlossaryFileFormat>
  setSourceFileFormats: Dispatch<SetStateAction<Record<string, GlossaryFileFormat>>>
  openGlossaryFile: OpenGlossaryFile | null
  setOpenGlossaryFile: Dispatch<SetStateAction<OpenGlossaryFile | null>>
  glossaryPrefillSrc: string | null
  setGlossaryPrefillSrc: Dispatch<SetStateAction<string | null>>

  // Actions
  mergeEntries: (incoming: GlossaryEntry[]) => void
  saveFileEntries: (fileName: string, allEntries: GlossaryEntry[]) => Promise<void>
  autoImportJsonFiles: (jsonFiles: { name: string; path: string }[]) => Promise<void>
  autoImportFromTree: (tree: TreeNode[]) => Promise<void>
  handleOpenJsonFile: (path: string) => Promise<void>
  handleGlossaryEditorSave: (updated: OpenGlossaryFile) => void
  handleGlossaryEditorImport: (entries: GlossaryEntry[], file: OpenGlossaryFile | null) => void
  handleAddAiEntries: (entries: GlossaryEntry[], targetFile: string) => Promise<void>
  saveAllGlossary: () => Promise<void>
  resetGlossary: () => void
}

export function useGlossaryStore(): GlossaryStore {
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([])
  const glossaryRef = useRef<GlossaryEntry[]>([])
  // Keep ref in sync so callbacks always read the latest value
  const _setGlossary: Dispatch<SetStateAction<GlossaryEntry[]>> = useCallback((val) => {
    setGlossary((prev) => {
      const next =
        typeof val === 'function' ? (val as (p: GlossaryEntry[]) => GlossaryEntry[])(prev) : val
      glossaryRef.current = next
      return next
    })
  }, [])
  const [glossaryPath, setGlossaryPath] = useState<string | null>(null)
  const [sourceFilePaths, setSourceFilePaths] = useState<Record<string, string>>({})
  const [sourceFileFormats, setSourceFileFormats] = useState<Record<string, GlossaryFileFormat>>({})
  const [openGlossaryFile, setOpenGlossaryFile] = useState<OpenGlossaryFile | null>(null)
  const [glossaryPrefillSrc, setGlossaryPrefillSrc] = useState<string | null>(null)

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Merge entries into glossary (last-write-wins by src) */
  const mergeEntries = useCallback((incoming: GlossaryEntry[]) => {
    setGlossary((prev) => {
      // 1. ป้องกัน Error ถ้า prev เป็น undefined หรือ null ให้ใช้ [] แทน
      const currentEntries = Array.isArray(prev) ? prev : []

      const srcSet = new Set(incoming.map((e) => e.src))

      // 2. ใช้ currentEntries แทน prev
      return [...currentEntries.filter((e) => !srcSet.has(e.src)), ...incoming]
    })
  }, [])

  /** Save a file's entries back to disk */
  const saveFileEntries = useCallback(
    async (fileName: string, allEntries: GlossaryEntry[]) => {
      const fullPath = sourceFilePaths[fileName]
      if (!fullPath) return
      const fileEntries = allEntries.filter((g) => g._file === fileName)
      const format = sourceFileFormats[fileName]
      const serialized = serializeByFormat(fileEntries, format)
      await window.electron.writeFile(fullPath, serialized)
    },
    [sourceFilePaths, sourceFileFormats]
  )

  // ── Auto-import JSON files from tree ──────────────────────────────────────

  const autoImportJsonFiles = useCallback(
    async (jsonFiles: { name: string; path: string }[]) => {
      if (!jsonFiles.length) return
      const allEntries: GlossaryEntry[] = []
      const newPaths: Record<string, string> = {}
      const newFormats: Record<string, GlossaryFileFormat> = {}

      for (const file of jsonFiles) {
        try {
          const raw = await window.electron.readFile(file.path)
          const parsed = parseGlossaryFile(file.path, raw)
          allEntries.push(...parsed.entries.map((e) => ({ ...e, _file: file.name })))
          newPaths[file.name] = file.path
          newFormats[file.name] = parsed.format
        } catch (e) {
          console.warn('Failed to auto-import JSON:', file.path, e)
        }
      }

      if (allEntries.length > 0) {
        mergeEntries(allEntries)
        setSourceFilePaths((prev) => ({ ...prev, ...newPaths }))
        setSourceFileFormats((prev) => ({ ...prev, ...newFormats }))
      }
    },
    [mergeEntries]
  )

  /** Convenience: auto-import all .json files found in a tree */
  const autoImportFromTree = useCallback(
    async (tree: TreeNode[]) => {
      const jsonFiles = collectJsonFiles(tree)
      if (jsonFiles.length > 0) await autoImportJsonFiles(jsonFiles)
    },
    [autoImportJsonFiles]
  )

  // ── Glossary Editor integration ───────────────────────────────────────────

  const handleOpenJsonFile = useCallback(async (path: string) => {
    const raw = await window.electron.readFile(path)
    const parsed = parseGlossaryFile(path, raw)
    setOpenGlossaryFile(parsed)
  }, [])

  const handleGlossaryEditorSave = useCallback((updated: OpenGlossaryFile) => {
    setOpenGlossaryFile(updated)
  }, [])

  const handleGlossaryEditorImport = useCallback(
    (entries: GlossaryEntry[], file: OpenGlossaryFile | null) => {
      mergeEntries(entries)
      if (file) {
        setSourceFilePaths((prev) => ({ ...prev, [file.name]: file.path }))
        setSourceFileFormats((prev) => ({ ...prev, [file.name]: file.format }))
      }
      setOpenGlossaryFile(null)
    },
    [mergeEntries]
  )

  // ── AI New_Entry integration ──────────────────────────────────────────────

  const handleAddAiEntries = useCallback(
    async (entries: GlossaryEntry[], targetFile: string) => {
      const tagged = entries.map((e) => ({ ...e, _file: targetFile || undefined }))
      mergeEntries(tagged)

      if (targetFile && sourceFilePaths[targetFile]) {
        try {
          // Use ref to avoid stale closure over glossary state
          const current = glossaryRef.current
          const fileEntries = [
            ...current.filter(
              (g) => g._file === targetFile && !tagged.some((e) => e.src === g.src)
            ),
            ...tagged
          ]
          await saveFileEntries(targetFile, fileEntries)
        } catch (e) {
          console.error('Auto-save AI entries failed:', e)
        }
      }
    },
    [sourceFilePaths, mergeEntries, saveFileEntries]
  )

  // ── Reset (on folder change) ──────────────────────────────────────────────

  const resetGlossary = useCallback(() => {
    setGlossary([])
    setGlossaryPath(null)
    setSourceFilePaths({})
    setSourceFileFormats({})
    setOpenGlossaryFile(null)
    setGlossaryPrefillSrc(null)
  }, [])

  // ── Save all (glossary panel Save button) ─────────────────────────────────

  const saveAllGlossary = useCallback(async () => {
    // Case A: single glossary.json
    if (glossaryPath) {
      const content = hasNestedPaths(glossary)
        ? serializeToNested(glossary)
        : JSON.stringify(glossary, null, 2)
      await window.electron.writeFile(glossaryPath, content)
      return
    }
    // Case B: save back to each source file
    const byFile = new Map<string, GlossaryEntry[]>()
    for (const e of glossary) {
      if (e._file && sourceFilePaths[e._file]) {
        if (!byFile.has(e._file)) byFile.set(e._file, [])
        byFile.get(e._file)!.push(e)
      }
    }
    for (const [fileName, entries] of byFile) {
      const format = sourceFileFormats[fileName]
      const serialized = serializeByFormat(entries, format)
      await window.electron.writeFile(sourceFilePaths[fileName], serialized)
    }
  }, [glossary, glossaryPath, sourceFilePaths, sourceFileFormats])

  return {
    // state
    glossary,
    setGlossary: _setGlossary,
    glossaryPath,
    setGlossaryPath,
    sourceFilePaths,
    setSourceFilePaths,
    sourceFileFormats,
    setSourceFileFormats,
    openGlossaryFile,
    setOpenGlossaryFile,
    glossaryPrefillSrc,
    setGlossaryPrefillSrc,

    // actions
    mergeEntries,
    saveFileEntries,
    autoImportJsonFiles,
    autoImportFromTree,
    handleOpenJsonFile,
    handleGlossaryEditorSave,
    handleGlossaryEditorImport,
    handleAddAiEntries,
    saveAllGlossary,
    resetGlossary
  }
}
