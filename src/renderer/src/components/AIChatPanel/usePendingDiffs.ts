// AIChatPanel/usePendingDiffs.ts
// Staged review queue: proposed TGT edits, glossary entries, and project-memory
// rewrites. Commits on Accept using content-anchored relocation so a diff stays
// correct even if the draft drifted (other edits, or the user's own typing).
//
// Phase 2: edits + glossary are persisted per file-pair under
// <root>/.tl-editor/pending/<chapterKey>.json so un-reviewed diffs survive a
// restart / chapter switch. Memory proposals are kept in-memory until accepted.

import { useState, useCallback, useEffect } from 'react'
import type { GlossaryEntry } from '../../types'
import type {
  PendingEdit,
  PendingGlossary,
  PendingLineEdit,
  PendingFullEdit,
  PendingMemory
} from './types'
import { applyLineEdits, hashText, relocateLineEdit } from './anchorMatch'
import { tlPaths, readJson, writeJson } from './storage'

export interface UsePendingDiffsArgs {
  /** Read the current full TGT (latest) at accept time. */
  getTgt: () => string
  /** Apply a new full TGT (App maps this to handleAiResult → sets aiContent+tgt). */
  applyTgt: (nextFull: string) => void
  /** Commit accepted glossary entries to a file. */
  addGlossary: (entries: GlossaryEntry[], targetFile: string) => void
  /** Persist an accepted project-memory rewrite. */
  saveMemory: (next: string) => void | Promise<void>
  /** Open folder root (persistence base); null disables persistence. */
  rootDir: string | null
  /** Stable key for the current chapter/file-pair (e.g. tgt path). */
  chapterKey: string
}

export interface PendingDiffsApi {
  edits: PendingEdit[]
  glossary: PendingGlossary[]
  memory: PendingMemory[]
  stageEdit: (edit: PendingEdit) => void
  stageGlossary: (entry: PendingGlossary) => void
  stageMemory: (memory: PendingMemory) => void
  acceptEdit: (id: string, force?: boolean) => void
  denyEdit: (id: string) => void
  acceptAllEdits: () => void
  acceptGlossary: (id: string) => void
  denyGlossary: (id: string) => void
  acceptAllGlossary: () => void
  acceptMemory: (id: string) => void
  denyMemory: (id: string) => void
  clearAll: () => void
}

interface PendingFileShape {
  edits: PendingEdit[]
  glossary: PendingGlossary[]
}

function toGlossaryEntry(p: PendingGlossary): GlossaryEntry {
  return {
    src: p.src,
    th: p.th,
    alt: p.alt,
    note: p.note,
    path: p.path,
    _file: p.targetFile || undefined
  }
}

export function usePendingDiffs(args: UsePendingDiffsArgs): PendingDiffsApi {
  const { getTgt, applyTgt, addGlossary, saveMemory, rootDir, chapterKey } = args

  const [edits, setEdits] = useState<PendingEdit[]>([])
  const [glossary, setGlossary] = useState<PendingGlossary[]>([])
  const [memory, setMemory] = useState<PendingMemory[]>([])

  // ── Per-chapter persistence ────────────────────────────────────────────────
  const persistKey = chapterKey ? hashText(chapterKey) : ''
  const pendingPath = rootDir && persistKey ? tlPaths(rootDir).pendingFile(persistKey) : null
  // loadedKey gates autosave: until the current key's file has been read in, we
  // must not write (would clobber another chapter's data with stale state).
  const [loadedKey, setLoadedKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!pendingPath) return
    readJson<PendingFileShape>(pendingPath).then((data) => {
      if (cancelled) return
      setEdits(Array.isArray(data?.edits) ? data!.edits : [])
      setGlossary(Array.isArray(data?.glossary) ? data!.glossary : [])
      setLoadedKey(persistKey)
    })
    return () => {
      cancelled = true
    }
  }, [pendingPath, persistKey])

  useEffect(() => {
    if (!pendingPath || loadedKey !== persistKey) return
    const t = setTimeout(() => {
      writeJson(pendingPath, { edits, glossary }).catch(() => {})
    }, 400)
    return () => clearTimeout(t)
  }, [edits, glossary, pendingPath, persistKey, loadedKey])

  // ── Staging ─────────────────────────────────────────────────────────────────
  const stageEdit = useCallback((edit: PendingEdit) => setEdits((p) => [...p, edit]), [])
  const stageGlossary = useCallback((e: PendingGlossary) => setGlossary((p) => [...p, e]), [])
  const stageMemory = useCallback((m: PendingMemory) => setMemory((p) => [...p, m]), [])

  const denyEdit = useCallback((id: string) => setEdits((p) => p.filter((e) => e.id !== id)), [])
  const denyGlossary = useCallback(
    (id: string) => setGlossary((p) => p.filter((e) => e.id !== id)),
    []
  )
  const denyMemory = useCallback((id: string) => setMemory((p) => p.filter((m) => m.id !== id)), [])

  const markConflict = useCallback((id: string) => {
    setEdits((p) => p.map((e) => (e.id === id ? { ...e, status: 'conflict' } : e)))
  }, [])

  // ── Accept: TGT edits ───────────────────────────────────────────────────────
  const acceptEdit = useCallback(
    (id: string, force = false) => {
      const cur = getTgt()
      const edit = edits.find((e) => e.id === id)
      if (!edit) return

      if (edit.kind === 'full') {
        const unchanged = hashText(cur) === edit.baseHash
        if (!unchanged && !force) {
          markConflict(id)
          return
        }
        applyTgt(edit.newText)
        setEdits((p) => p.filter((e) => e.id !== id))
        return
      }

      const r = relocateLineEdit(cur, edit)
      if (!r.ok && !force) {
        markConflict(id)
        return
      }
      const start = r.ok ? r.start : edit.startLine
      const end = r.ok ? r.end : edit.endLine
      const lines = cur.split('\n')
      lines.splice(start, end - start + 1, ...edit.newText.split('\n'))
      applyTgt(lines.join('\n'))
      setEdits((p) => p.filter((e) => e.id !== id))
    },
    [getTgt, applyTgt, markConflict, edits]
  )

  const acceptAllEdits = useCallback(() => {
    const cur = getTgt()
    const fulls = edits.filter((e): e is PendingFullEdit => e.kind === 'full')
    const lineEdits = edits.filter((e): e is PendingLineEdit => e.kind === 'lines')

    let working = fulls.length > 0 ? fulls[fulls.length - 1].newText : cur
    const { text, appliedIds, conflictIds } = applyLineEdits(working, lineEdits)
    working = text
    applyTgt(working)

    const appliedFullIds = new Set(fulls.map((f) => f.id))
    const appliedLineIds = new Set(appliedIds)
    const conflictSet = new Set(conflictIds)
    setEdits((p) =>
      p
        .filter((e) => !appliedFullIds.has(e.id) && !appliedLineIds.has(e.id))
        .map((e) => (conflictSet.has(e.id) ? { ...e, status: 'conflict' } : e))
    )
  }, [getTgt, applyTgt, edits])

  // ── Accept: glossary ────────────────────────────────────────────────────────
  const acceptGlossary = useCallback(
    (id: string) => {
      const entry = glossary.find((g) => g.id === id)
      if (!entry) return
      addGlossary([toGlossaryEntry(entry)], entry.targetFile)
      setGlossary((p) => p.filter((g) => g.id !== id))
    },
    [addGlossary, glossary]
  )

  const acceptAllGlossary = useCallback(() => {
    const byFile = new Map<string, GlossaryEntry[]>()
    for (const g of glossary) {
      const items = byFile.get(g.targetFile) ?? []
      items.push(toGlossaryEntry(g))
      byFile.set(g.targetFile, items)
    }
    for (const [file, entries] of byFile) addGlossary(entries, file)
    setGlossary([])
  }, [addGlossary, glossary])

  // ── Accept: memory ──────────────────────────────────────────────────────────
  const acceptMemory = useCallback(
    (id: string) => {
      const m = memory.find((x) => x.id === id)
      if (!m) return
      void saveMemory(m.nextContent)
      setMemory((p) => p.filter((x) => x.id !== id))
    },
    [memory, saveMemory]
  )

  const clearAll = useCallback(() => {
    setEdits([])
    setGlossary([])
    setMemory([])
  }, [])

  return {
    edits,
    glossary,
    memory,
    stageEdit,
    stageGlossary,
    stageMemory,
    acceptEdit,
    denyEdit,
    acceptAllEdits,
    acceptGlossary,
    denyGlossary,
    acceptAllGlossary,
    acceptMemory,
    denyMemory,
    clearAll
  }
}
