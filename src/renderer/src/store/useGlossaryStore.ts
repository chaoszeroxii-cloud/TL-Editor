// src/renderer/src/store/useGlossaryStore.ts
//
// Batch 8 cleanup:
//   • Removed `saveAllGlossary` from the store interface and implementation.
//     GlossaryPanel defines its own `handleSave` callback inline and was the
//     only possible consumer; the store action was never called.
//   • `GlossaryStore` interface trimmed accordingly.
//   • All other logic is unchanged.

import { useState, useCallback, useRef, Dispatch, SetStateAction } from 'react'
import type { GlossaryEntry, GlossaryFileFormat, OpenGlossaryFile } from '../types'
import { parseGlossaryFile, serializeGlossary } from '../utils/glossaryParsers'
import { collectJsonFiles } from '../utils/pathHelpers'
import type { TreeNode } from '../types'

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
  // Unified save actions for GlossaryPanel/Editor
  saveEditEntry: (
    updated: GlossaryEntry,
    original: GlossaryEntry,
    targetFile?: string
  ) => Promise<void>
  saveAddEntry: (entry: GlossaryEntry, targetFile: string) => Promise<void>
  saveDeleteEntry: (original: GlossaryEntry) => Promise<void>
  saveGlossaryEditorChanges: (
    updatedFile: OpenGlossaryFile,
    oldFile: OpenGlossaryFile
  ) => Promise<void>
  resetGlossary: () => void
}

export function useGlossaryStore(): GlossaryStore {
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([])
  const glossaryRef = useRef<GlossaryEntry[]>([])
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

  const mergeEntries = useCallback((incoming: GlossaryEntry[]) => {
    setGlossary((prev) => {
      const currentEntries = Array.isArray(prev) ? prev : []
      const srcSet = new Set(incoming.map((e) => e.src))
      return [...currentEntries.filter((e) => !srcSet.has(e.src)), ...incoming]
    })
  }, [])

  const saveFileEntries = useCallback(
    async (fileName: string, allEntries: GlossaryEntry[]) => {
      const fullPath = sourceFilePaths[fileName]
      if (!fullPath) return
      const fileEntries = allEntries.filter((g) => g._file === fileName)
      const format = sourceFileFormats[fileName]
      const serialized = serializeGlossary(fileEntries, format)
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

  const saveGlossaryEditorChanges = useCallback(
    async (updatedFile: OpenGlossaryFile, oldFile: OpenGlossaryFile) => {
      const newEntries = updatedFile.entries.map((e) => ({ ...e, _file: updatedFile.name }))
      const oldSrcs = new Set(oldFile.entries.map((e) => e.src))
      const currentGlossary = Array.isArray(glossaryRef.current) ? glossaryRef.current : []
      const next = [
        ...currentGlossary.filter((g) => g._file !== updatedFile.name || oldSrcs.has(g.src)),
        ...newEntries
      ]
      _setGlossary(next)

      if (sourceFilePaths[updatedFile.name]) {
        try {
          const serialized = serializeGlossary(newEntries, updatedFile.format)
          await window.electron.writeFile(sourceFilePaths[updatedFile.name], serialized)
        } catch (e) {
          console.error('Failed to save glossary editor changes:', e)
          throw e
        }
      }
      setOpenGlossaryFile(null)
    },
    [glossaryRef, _setGlossary, sourceFilePaths]
  )

  // ── AI New_Entry integration ──────────────────────────────────────────────

  const handleAddAiEntries = useCallback(
    async (entries: GlossaryEntry[], targetFile: string) => {
      const tagged = entries.map((e) => ({ ...e, _file: targetFile || undefined }))
      mergeEntries(tagged)

      if (targetFile && sourceFilePaths[targetFile]) {
        try {
          const currentGlossary = Array.isArray(glossaryRef.current) ? glossaryRef.current : []
          const fileEntries = [
            ...currentGlossary.filter(
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

  // ── Unified save actions for GlossaryPanel/Editor ────────────────────────
  // Handles entry edit with optional cross-file move: updates both old and new files

  const saveEditEntry = useCallback(
    async (updated: GlossaryEntry, original: GlossaryEntry, targetFile?: string) => {
      // State is already updated by GlossaryPanel's handleEdit
      // Just save to files here
      const oldFile = original._file
      const newFile = targetFile || updated._file

      // If entry was moved between files, update both files as a batch
      const filesToUpdate = new Set<string>()
      if (oldFile) filesToUpdate.add(oldFile)
      if (newFile) filesToUpdate.add(newFile)

      const updates: Array<Promise<void>> = []
      for (const fileName of filesToUpdate) {
        if (sourceFilePaths[fileName]) {
          const fileEntries = glossaryRef.current.filter((g) => g._file === fileName)
          updates.push(saveFileEntries(fileName, fileEntries))
        }
      }

      try {
        await Promise.all(updates)
      } catch (e) {
        console.error('Auto-save after edit failed:', e)
        throw e
      }
    },
    [glossaryRef, sourceFilePaths, saveFileEntries]
  )

  const saveAddEntry = useCallback(
    async (entry: GlossaryEntry, targetFile: string) => {
      // State is already updated by GlossaryPanel's handleAdd
      // But to be safe, ensure the entry is included in the file save
      if (sourceFilePaths[targetFile]) {
        try {
          const currentFileEntries = glossaryRef.current.filter((g) => g._file === targetFile)
          // Check if entry is already in the list (by src)
          const exists = currentFileEntries.some((g) => g.src === entry.src)
          const fileEntries = exists ? currentFileEntries : [...currentFileEntries, entry]
          await saveFileEntries(targetFile, fileEntries)
        } catch (e) {
          console.error('Auto-save after add failed:', e)
          throw e
        }
      }
    },
    [glossaryRef, sourceFilePaths, saveFileEntries]
  )

  const saveDeleteEntry = useCallback(
    async (original: GlossaryEntry) => {
      // Use state updater to get the current glossary state
      _setGlossary((currentGlossary) => {
        // Delete by src + th values, not by object reference (which may not match)
        const next = currentGlossary.filter(
          (g) => !(g.src === original.src && g.th === original.th)
        )

        // Fire off async save in the background
        const targetFile = original._file
        if (targetFile && sourceFilePaths[targetFile]) {
          ;(async () => {
            try {
              const fileEntries = next.filter((g) => g._file === targetFile)
              await saveFileEntries(targetFile, fileEntries)
            } catch (e) {
              console.error('Auto-save after delete failed:', e)
            }
          })()
        }

        return next
      })
    },
    [_setGlossary, sourceFilePaths, saveFileEntries]
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

  return {
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

    mergeEntries,
    saveFileEntries,
    autoImportJsonFiles,
    autoImportFromTree,
    handleOpenJsonFile,
    handleGlossaryEditorSave,
    handleGlossaryEditorImport,
    handleAddAiEntries,
    saveEditEntry,
    saveAddEntry,
    saveDeleteEntry,
    saveGlossaryEditorChanges,
    resetGlossary
  }
}
