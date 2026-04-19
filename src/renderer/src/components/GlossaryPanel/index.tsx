import { useState, memo, useMemo, useCallback, useEffect, useRef, JSX } from 'react'
import type { GlossaryEntry, GlossaryFileFormat } from '../../types'
import { serializeGlossary, hasNestedPaths, serializeToNested } from '../../utils/glossaryParsers'
import { EntryRow } from './EntryRow'
import { EntryForm } from './EntryForm'
import { DrillView } from './DrillView'
import { ExportDropdown, FileFilterDropdown } from './Dropdowns'
import { IcoSave, IcoCheck, IcoPlus, IcoList, IcoTree } from '../common/icons'

export interface GlossaryPanelProps {
  glossary: GlossaryEntry[]
  matchCount: number
  glossaryPath: string | null
  sourceFilePaths?: Record<string, string>
  sourceFileFormats?: Record<string, GlossaryFileFormat>
  onGlossaryChange: (next: GlossaryEntry[]) => void
  currentContent?: string
  prefillSrc?: string | null
  onPrefillConsumed?: () => void
  /** Entry ที่ต้องการเปิด edit form ทันที (จาก tooltip) */
  prefillEntry?: GlossaryEntry | null
  onPrefillEntryConsumed?: () => void
  // Unified save actions from store
  onSaveEdit?: (
    updated: GlossaryEntry,
    original: GlossaryEntry,
    targetFile?: string
  ) => Promise<void>
  onSaveAdd?: (entry: GlossaryEntry, targetFile: string) => Promise<void>
  onSaveDelete?: (original: GlossaryEntry) => Promise<void>
}

export const GlossaryPanel = memo(function GlossaryPanel({
  glossary,
  matchCount,
  glossaryPath,
  sourceFilePaths = {},
  sourceFileFormats = {},
  onGlossaryChange,
  currentContent = '',
  prefillSrc,
  onPrefillConsumed,
  prefillEntry,
  onPrefillEntryConsumed,
  onSaveEdit,
  onSaveAdd,
  onSaveDelete
}: GlossaryPanelProps): JSX.Element {
  const [filter, setFilter] = useState('all')
  const [fileFilter, setFileFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    },
    []
  )
  const [addMode, setAddMode] = useState(false)
  const [addInitialSrc, setAddInitialSrc] = useState('')
  const [viewMode, setViewMode] = useState<'flat' | 'tree'>('tree')
  const [drillPath, setDrillPath] = useState<string[]>([])
  const prevViewModeRef = useRef<'flat' | 'tree'>('tree')
  /** Entry ที่กำลัง inline-edit จาก tooltip */
  const [inlineEditEntry, setInlineEditEntry] = useState<GlossaryEntry | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 150)
    return () => clearTimeout(t)
  }, [search])

  // Auto-open add form when prefillSrc arrives
  useEffect(() => {
    if (!prefillSrc) return
    setAddInitialSrc(prefillSrc)
    setAddMode(true)
    onPrefillConsumed?.()
  }, [prefillSrc, onPrefillConsumed])

  // Auto-open inline edit when prefillEntry arrives (จาก tooltip ✎)
  useEffect(() => {
    if (!prefillEntry) return
    setInlineEditEntry(prefillEntry)
    setAddMode(false) // ปิด add form ถ้าเปิดอยู่
    onPrefillEntryConsumed?.()
  }, [prefillEntry, onPrefillEntryConsumed])

  // Auto-switch to flat when searching
  useEffect(() => {
    if (debouncedSearch) {
      if (viewMode !== 'flat') {
        prevViewModeRef.current = viewMode
        setViewMode('flat')
      }
    } else {
      setViewMode(prevViewModeRef.current)
    }
  }, [debouncedSearch, viewMode])

  useEffect(() => {
    setDrillPath([])
  }, [filter, fileFilter])

  const fileNames = useMemo(
    () => Array.from(new Set(glossary.map((g) => g._file).filter((f): f is string => !!f))),
    [glossary]
  )
  const availableTypes = useMemo(
    () => Array.from(new Set(glossary.map((g) => g.type).filter(Boolean))).sort(),
    [glossary]
  )

  const filtered = useMemo(
    () =>
      glossary.filter((g) => {
        if (filter !== 'all' && g.type !== filter) return false
        if (fileFilter !== 'all' && g._file !== fileFilter) return false
        if (
          debouncedSearch &&
          !g.src.toLowerCase().includes(debouncedSearch.toLowerCase()) &&
          !g.th.toLowerCase().includes(debouncedSearch.toLowerCase()) &&
          !(g.note ?? '').toLowerCase().includes(debouncedSearch.toLowerCase())
        )
          return false
        return true
      }),
    [glossary, filter, fileFilter, debouncedSearch]
  )

  // ── Save ──────────────────────────────────────────────────────────────────
  const canSave = !!(glossaryPath || glossary.some((e) => e._file && sourceFilePaths[e._file]))

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveError(null)
    try {
      if (glossaryPath) {
        const content = hasNestedPaths(glossary)
          ? serializeToNested(glossary)
          : JSON.stringify(glossary, null, 2)
        await window.electron.writeFile(glossaryPath, content)
      } else {
        const byFile = new Map<string, GlossaryEntry[]>()
        for (const e of glossary) {
          if (e._file && sourceFilePaths[e._file]) {
            if (!byFile.has(e._file)) byFile.set(e._file, [])
            byFile.get(e._file)!.push(e)
          }
        }
        // Write all files concurrently and collect any errors
        const results = await Promise.allSettled(
          Array.from(byFile.entries()).map(([fileName, entries]) =>
            window.electron.writeFile(
              sourceFilePaths[fileName],
              serializeGlossary(entries, sourceFileFormats[fileName])
            )
          )
        )
        const failed = results.filter((r) => r.status === 'rejected')
        if (failed.length > 0) {
          const msg = (failed[0] as PromiseRejectedResult).reason
          throw new Error(String(msg))
        }
      }
      setSaveOk(true)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => setSaveOk(false), 2000)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => setSaveError(null), 4000)
    } finally {
      setSaving(false)
    }
  }, [glossary, glossaryPath, sourceFilePaths, sourceFileFormats])

  // ── Edit / Delete / Add ───────────────────────────────────────────────────
  const handleEdit = useCallback(
    async (updated: GlossaryEntry, orig: GlossaryEntry, targetFile: string) => {
      const tagged = targetFile ? { ...updated, _file: targetFile } : updated
      const next = glossary.map((g) => (g === orig ? tagged : g))
      onGlossaryChange(next)
      if (onSaveEdit) {
        try {
          await onSaveEdit(tagged, orig, targetFile)
        } catch (e) {
          console.error('Auto-save after edit failed:', e)
        }
      }
    },
    [glossary, onGlossaryChange, onSaveEdit]
  )

  const handleDelete = useCallback(
    async (orig: GlossaryEntry) => {
      const next = glossary.filter((g) => g !== orig)
      onGlossaryChange(next)
      if (onSaveDelete) {
        try {
          await onSaveDelete(orig)
        } catch (e) {
          console.error('Auto-save after delete failed:', e)
        }
      }
    },
    [glossary, onGlossaryChange, onSaveDelete]
  )

  const handleAdd = useCallback(
    async (entry: GlossaryEntry, targetFile: string) => {
      const tagged = targetFile ? { ...entry, _file: targetFile } : entry
      const exists = glossary.some((g) => g.src === entry.src)
      const next = exists
        ? glossary.map((g) => (g.src === entry.src ? tagged : g))
        : [...glossary, tagged]
      onGlossaryChange(next)
      setAddMode(false)
      setAddInitialSrc('')
      if (onSaveAdd) {
        try {
          await onSaveAdd(tagged, targetFile)
        } catch (e) {
          console.error('Auto-save after add failed:', e)
        }
      }
    },
    [glossary, onGlossaryChange, onSaveAdd]
  )

  // ── Export ────────────────────────────────────────────────────────────────
  const handleExport = useCallback(
    async (fileFilter?: string) => {
      if (!currentContent) return
      const source =
        fileFilter !== undefined ? glossary.filter((g) => g._file === fileFilter) : glossary
      const found = source.filter((g) => {
        if (!g.src) return false
        const esc = g.src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pat = /[A-Za-z]/.test(g.src)
          ? new RegExp(`\\b${esc}(?:'s|s|es|ed|ing|er|ers)?\\b`, 'i')
          : new RegExp(esc)
        return pat.test(currentContent)
      })
      if (!found.length) return
      const serialized = fileFilter
        ? serializeGlossary(found, sourceFileFormats[fileFilter])
        : hasNestedPaths(found)
          ? serializeToNested(found)
          : JSON.stringify(found, null, 2)
      const defaultName = 'glossary.json'
      await window.electron.saveFile(defaultName, serialized)
    },
    [glossary, currentContent, sourceFileFormats]
  )

  const handleSetViewMode = useCallback((mode: 'flat' | 'tree') => {
    prevViewModeRef.current = mode
    setViewMode(mode)
  }, [])

  const btnIcon: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    padding: '2px 3px',
    borderRadius: 4
  }

  return (
    <div
      style={{
        width: 240,
        background: 'var(--bg1)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px 5px',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: 'var(--text2)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontFamily: 'var(--font-mono)'
          }}
        >
          Glossary
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span
            style={{
              fontSize: 10,
              color: 'var(--accent)',
              fontFamily: 'var(--font-mono)',
              background: 'var(--accent-dim)',
              padding: '1px 5px',
              borderRadius: 99
            }}
          >
            {matchCount}
          </span>
          <button
            style={{ ...btnIcon, color: viewMode === 'flat' ? 'var(--accent)' : 'var(--text2)' }}
            onClick={() => handleSetViewMode('flat')}
            title="Flat list"
          >
            <IcoList size={12} stroke="currentColor" />
          </button>
          <button
            style={{ ...btnIcon, color: viewMode === 'tree' ? 'var(--accent)' : 'var(--text2)' }}
            onClick={() => handleSetViewMode('tree')}
            title="Tree view"
          >
            <IcoTree size={12} stroke="currentColor" />
          </button>
          {canSave && (
            <button
              style={{
                ...btnIcon,
                color: saveError ? 'var(--hl-coral)' : saveOk ? 'var(--hl-teal)' : 'var(--text2)'
              }}
              onClick={handleSave}
              disabled={saving}
              title={saveError ?? 'Save'}
            >
              {saving ? (
                '…'
              ) : saveError ? (
                '✕'
              ) : saveOk ? (
                <IcoCheck size={13} stroke="currentColor" />
              ) : (
                <IcoSave size={13} stroke="currentColor" />
              )}
            </button>
          )}
          {currentContent && (
            <ExportDropdown
              matchCount={matchCount}
              fileNames={fileNames}
              glossary={glossary}
              currentContent={currentContent}
              onExport={handleExport}
            />
          )}
          <button
            style={{ ...btnIcon, color: 'var(--accent)' }}
            onClick={() => setAddMode((v) => !v)}
            title="Add entry"
          >
            <IcoPlus size={14} stroke="currentColor" />
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '5px 7px', borderBottom: '1px solid var(--border)' }}>
        <input
          style={{
            width: '100%',
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            color: 'var(--text0)',
            fontSize: 12,
            padding: '3px 7px',
            outline: 'none',
            fontFamily: 'var(--font-ui)',
            boxSizing: 'border-box'
          }}
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Type tabs */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 3,
          padding: '5px 7px',
          borderBottom: '1px solid var(--border)'
        }}
      >
        {[
          'all',
          ...Array.from(new Set(glossary.map((g) => g.type)))
            .filter(Boolean)
            .sort()
        ].map((type) => {
          const count =
            type === 'all' ? glossary.length : glossary.filter((g) => g.type === type).length
          if (type !== 'all' && count === 0) return null
          const short = type.length > 11 ? type.slice(0, 10) + '…' : type
          return (
            <button
              key={type}
              onClick={() => setFilter(type)}
              title={`${type} (${count})`}
              style={{
                background: filter === type ? 'var(--accent-dim)' : 'none',
                border: `1px solid ${filter === type ? 'rgba(91,138,240,0.35)' : 'var(--border)'}`,
                color: filter === type ? 'var(--accent)' : 'var(--text2)',
                fontSize: 10,
                padding: '2px 5px',
                borderRadius: 4,
                cursor: 'pointer',
                fontFamily: 'var(--font-mono)',
                transition: 'all 0.1s'
              }}
            >
              {short}
            </button>
          )
        })}
      </div>

      {/* File filter */}
      {fileNames.length > 0 && (
        <FileFilterDropdown
          fileNames={fileNames}
          fileFilter={fileFilter}
          glossary={glossary}
          onSelect={setFileFilter}
        />
      )}

      {/* Add form */}
      {addMode && (
        <EntryForm
          title="NEW ENTRY"
          initial={{ src: addInitialSrc, th: '', type: availableTypes[0] ?? 'term' }}
          onSubmit={(entry, targetFile) => handleAdd(entry, targetFile)}
          onCancel={() => {
            setAddMode(false)
            setAddInitialSrc('')
          }}
          submitLabel="Add"
          availableTypes={availableTypes}
          fileNames={fileNames}
          sourceFileFormats={sourceFileFormats}
          defaultFile={fileFilter !== 'all' ? fileFilter : (fileNames[0] ?? '')}
          glossary={glossary}
        />
      )}

      {/* Inline edit form — เปิดจาก Tooltip ✎ */}
      {inlineEditEntry && !addMode && (
        <div
          style={{
            borderBottom: '2px solid var(--accent)',
            background: 'rgba(91,138,240,0.04)'
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px 0',
              marginBottom: -2
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: 'var(--accent)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.06em'
              }}
            >
              ✎ EDITING
            </span>
            <span
              style={{
                fontSize: 10,
                color: 'var(--text2)',
                fontFamily: 'var(--font-mono)',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap'
              }}
            >
              {inlineEditEntry.src}
            </span>
          </div>
          <EntryForm
            title=""
            initial={{ ...inlineEditEntry }}
            onSubmit={(updated, targetFile) => {
              handleEdit(updated, inlineEditEntry, targetFile)
              setInlineEditEntry(null)
            }}
            onCancel={() => setInlineEditEntry(null)}
            submitLabel="Save"
            availableTypes={availableTypes}
            fileNames={fileNames}
            sourceFileFormats={sourceFileFormats}
            defaultFile={inlineEditEntry._file ?? fileNames[0] ?? ''}
            glossary={glossary}
          />
        </div>
      )}

      {/* Flat list */}
      {viewMode === 'flat' && (
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', color: 'var(--text2)', fontSize: 12 }}>
              No entries
            </div>
          ) : (
            filtered.map((g, i) => (
              <EntryRow
                key={i}
                entry={g}
                onEdit={handleEdit}
                onDelete={handleDelete}
                availableTypes={availableTypes}
                fileNames={fileNames}
                sourceFileFormats={sourceFileFormats}
                glossary={glossary}
              />
            ))
          )}
        </div>
      )}

      {/* Tree / drill view */}
      {viewMode === 'tree' && (
        <DrillView
          glossary={filtered}
          drillPath={drillPath}
          onDrill={setDrillPath}
          onEdit={handleEdit}
          onDelete={handleDelete}
          availableTypes={availableTypes}
          search={debouncedSearch}
          fileNames={fileNames}
          sourceFileFormats={sourceFileFormats}
        />
      )}

      {/* Footer */}
      {canSave && (
        <div
          style={{
            padding: '4px 8px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg1)',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: 9, color: 'var(--text1)', fontFamily: 'var(--font-mono)' }}>
            {glossaryPath
              ? glossaryPath.split(/[\\/]/).pop()
              : `${Object.keys(sourceFilePaths).length} source file(s)`}
          </span>
          <span style={{ fontSize: 9, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
            {' '}
            · {glossary.length}
          </span>
        </div>
      )}
    </div>
  )
})
