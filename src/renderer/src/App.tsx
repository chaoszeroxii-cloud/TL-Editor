/**
 * App.tsx — layout shell only (~150 lines)
 * All state lives in store hooks; keyboard shortcuts in useKeyboardShortcuts.
 */
import {
  memo,
  startTransition,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type JSX,
  type CSSProperties
} from 'react'
import { Sidebar } from './components/Sidebar'
import { DualView } from './components/DualView'
import { GlossaryPanel } from './components/GlossaryPanel'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Tooltip } from './components/common/Tooltip'
import { GlossaryEditor } from './components/GlossaryEditor'
import { AudioPlayer } from './components/AudioPlayer'
import { TerminalPanel } from './components/Terminal'
import { AITranslatePanel } from './components/AITranslatePanel'
import { Mp3ToMp4 } from './components/Mp3ToMp4'
import { SetupWizard } from './components/setup/SetupWizard'
import {
  useStyleProfileStore,
  getStyleProfilePath,
  useCorrectionCapture,
  useAiContentTracker
} from './components/StyleProfile/exports'

import { useAppStore } from './store/useAppStore'
import { useFileStore } from './store/useFileStore'
import { useGlossaryStore } from './store/useGlossaryStore'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts' //  FIXED

import { countMatches } from './utils/highlight'
import { findTranslationPair } from './hooks/useChapterPairing'
import { type GlossaryLibraries } from './utils/glossaryLoader'

import { useCompactTopBar } from './hooks/useCompactTopBar'

import type { SetupConfig } from './components/setup/SetupWizard'
import type { ToneName, VoiceGender } from './constants/tones'
import type { TreeNode } from './types'

import { IcoEdit, IcoFile, IcoMusic, IcoSparkle } from './components/common/icons'

import './styles/global.css'

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App(): JSX.Element {
  const app = useAppStore()
  const files = useFileStore()
  const gls = useGlossaryStore()

  // ── Setup wizard ────────────────────────────────────────────────────────
  const [showSetup, setShowSetup] = useState(false)
  const ttsGlossaries = useMemo<GlossaryLibraries>(() => {
    const at_lib: Record<string, string> = {}
    const bf_lib: Record<string, string> = {}
    if (!Array.isArray(gls.glossary)) return { at_lib, bf_lib }
    for (const entry of gls.glossary) {
      if (!entry._file || !entry.src || !entry.th) continue
      const file = entry._file.toLowerCase()
      if (file.includes('at_lib')) at_lib[entry.src] = entry.th
      else if (file.includes('bf_lib')) bf_lib[entry.src] = entry.th
    }
    return { at_lib, bf_lib }
  }, [gls.glossary])
  const [pairingSourcePath, setPairingSourcePath] = useState('')
  const [pairingSourceTree, setPairingSourceTree] = useState<TreeNode[]>([])

  const loadPairingSource = useCallback(async (dirPath: string | null): Promise<void> => {
    if (!dirPath?.trim()) {
      setPairingSourcePath('')
      setPairingSourceTree([])
      return
    }

    try {
      const tree = await window.electron.readTree(dirPath)
      setPairingSourcePath(dirPath)
      setPairingSourceTree(tree)
    } catch (error) {
      console.warn('Failed to load pairing source path:', dirPath, error)
      setPairingSourcePath('')
      setPairingSourceTree([])
    }
  }, [])

  // ── Auto-load from config on startup ────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      const cfg = await window.electron.getEnvConfig()

      if (!cfg.hasConfig) {
        setShowSetup(true)
        return
      }

      if (cfg.aiApiKey || cfg.aiPromptPath || cfg.aiGlossaryPath) {
        app.setAiConfig({
          apiKey: cfg.aiApiKey,
          promptPath: cfg.aiPromptPath,
          glossaryPath: cfg.aiGlossaryPath
        })
      }

      app.setTtsConfig({
        apiUrl: cfg.ttsApiUrl || 'https://novelttsapi.onrender.com',
        apiKey: cfg.ttsApiKey || '',
        voiceGender: cfg.ttsVoiceGender || 'Female',
        voiceName: cfg.ttsVoiceName || '',
        rate: cfg.ttsRate || '+35%',
        outputPath: cfg.ttsOutputPath || ''
      })

      await loadPairingSource(
        cfg.pairingSourcePath || (cfg.folderPath ? `${cfg.folderPath}/แปล` : null)
      )

      if (cfg.folderPath) {
        const [tree, glossaryEntries] = await Promise.all([
          window.electron.readTree(cfg.folderPath),
          window.electron.readGlossary(cfg.folderPath)
        ])
        app.setRootDir(cfg.folderPath)
        app.setTree(tree)
        gls.setGlossary(glossaryEntries)
        if (glossaryEntries.length > 0) gls.setGlossaryPath(`${cfg.folderPath}/glossary.json`)
        await gls.autoImportFromTree(tree)
      }

      if (cfg.jsonPaths.length > 0) {
        const envFiles = cfg.jsonPaths.map((p) => ({ name: p.split(/[\\/]/).pop() ?? p, path: p }))
        await gls.autoImportJsonFiles(envFiles)
      }
    })()
    // Only run once on mount — app/files/gls are store hooks with stable references
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadWorkspaceData = useCallback(
    async (folderPath: string, shouldReset = false) => {
      const [tree, glossaryEntries] = await Promise.all([
        window.electron.readTree(folderPath),
        window.electron.readGlossary(folderPath)
      ])

      if (shouldReset) {
        files.clearAll()
        gls.resetGlossary()
      }

      app.setRootDir(folderPath)
      app.setTree(tree)
      gls.setGlossary(glossaryEntries)

      if (glossaryEntries.length > 0) {
        gls.setGlossaryPath(`${folderPath}/glossary.json`)
      }

      await gls.autoImportFromTree(tree)
    },
    [app, gls, files]
  )

  const handleSetupDone = useCallback(
    async (cfg: SetupConfig) => {
      setShowSetup(false)

      if (cfg.folderPath) {
        await loadWorkspaceData(cfg.folderPath) // เรียกใช้ตัวกลาง
      }

      if (cfg.jsonPaths.length > 0) {
        const envFiles = cfg.jsonPaths.map((p) => ({
          name: p.split(/[\\/]/).pop() ?? p,
          path: p
        }))
        await gls.autoImportJsonFiles(envFiles)
      }
    },
    [loadWorkspaceData, gls]
  )

  const handleOpenFolder = useCallback(async () => {
    const dir = await window.electron.openFolder()
    if (!dir) return

    await loadWorkspaceData(dir, true) // เรียกใช้ตัวกลาง + สั่ง Reset
  }, [loadWorkspaceData])

  const handleSelectPairingSource = useCallback(async () => {
    const dir = await window.electron.openFolder()
    if (!dir) return

    await loadPairingSource(dir)
    window.electron.saveConfigPatch({ pairingSourcePath: dir }).catch(() => {})
  }, [loadPairingSource])

  // ── Select file ─────────────────────────────────────────────────────────
  const handleSelectFile = useCallback(
    async (path: string) => {
      const content = await window.electron.readFile(path)
      if (files.nextSlot === 'tgt') {
        files.loadTgt(path, content)
        files.setNextSlot('src')
        const compareTree = pairingSourceTree.length > 0 ? pairingSourceTree : app.treeRef.current
        const paired = findTranslationPair(compareTree, path)
        if (paired) {
          const pairedContent = await window.electron.readFile(paired)
          files.loadSrc(paired, pairedContent)
          files.setNextSlot('tgt')
        }
      } else {
        files.loadSrc(path, content)
        files.setNextSlot('tgt')
      }
    },
    [files, app.treeRef, pairingSourceTree]
  )

  // ── New file ─────────────────────────────────────────────────────────────
  const handleNewFile = useCallback(async () => {
    const saved = await window.electron.saveFile('translation.txt', '')
    if (!saved) return
    files.loadTgt(saved, '')
    files.clearSrc()
    files.setNextSlot('src')
    if (app.rootDir) {
      const newTree = await window.electron.readTree(app.rootDir, { force: true })
      app.setTree(newTree)
      const compareTree = pairingSourceTree.length > 0 ? pairingSourceTree : newTree
      const paired = findTranslationPair(compareTree, saved)
      if (paired) {
        const pairedContent = await window.electron.readFile(paired)
        files.loadSrc(paired, pairedContent)
        files.setNextSlot('tgt')
      }
    }
  }, [files, app, pairingSourceTree])

  // ── File moved ───────────────────────────────────────────────────────────
  const handleFileMoved = useCallback(
    async (oldPath: string, newPath: string) => {
      await window.electron.moveFile(oldPath, newPath)
      if (app.rootDir) {
        const newTree = await window.electron.readTree(app.rootDir, { force: true })
        app.setTree(newTree)
      }
      if (files.tgtPath === oldPath) files.loadTgt(newPath, files.tgtContent)
      if (files.srcPath === oldPath) files.loadSrc(newPath, files.srcContent)
    },
    [app, files]
  )

  // ── File renamed (from file label or sidebar) ────────────────────────────
  // Wraps files.commitRename to handle tree refresh after successful rename
  const handleCommitRename = useCallback(
    async (which: 'tgt' | 'src'): Promise<void> => {
      const newPath = await files.commitRename(which)
      if (!newPath || !app.rootDir) return
      // Refresh tree to show updated file names
      const newTree = await window.electron.readTree(app.rootDir, { force: true })
      app.setTree(newTree)
    },
    [files, app]
  )

  // ── Refresh tree ─────────────────────────────────────────────────────────
  const { rootDir, setTree } = app
  const handleRefresh = useCallback(async () => {
    if (!rootDir) return
    const newTree = await window.electron.readTree(rootDir, { force: true })
    setTree(newTree)
  }, [rootDir, setTree])

  const handleToggleAiPanel = useCallback(() => {
    if (app.styleProfileOpen) {
      app.setStyleProfileOpen(false)
      app.setAiPanelOpen(true)
      return
    }
    app.toggleAiPanel()
  }, [app])

  const handleToggleStyleProfilePanel = useCallback(() => {
    if (app.styleProfileOpen) {
      app.setStyleProfileOpen(false)
      return
    }
    app.setAiPanelOpen(false)
    app.setStyleProfileOpen(true)
  }, [app])

  const handleSelectAiWorkTab = useCallback(() => {
    app.setStyleProfileOpen(false)
    app.setAiPanelOpen(true)
  }, [app])

  const handleSelectAiProfileTab = useCallback(() => {
    app.setAiPanelOpen(false)
    app.setStyleProfileOpen(true)
  }, [app])

  // ── Keyboard shortcuts — delegated to hook ✅ ────────────────────────────
  useKeyboardShortcuts({
    handleSave: files.handleSave,
    handleSrcSave: files.handleSrcSave,
    handleUndo: files.handleUndo,
    handleRedo: files.handleRedo,
    handleCopyTgt: files.handleCopyTgt,
    handleCopySrc: files.handleCopySrc,
    toggleTerminal: app.toggleTerminal,
    toggleSidebar: app.toggleSidebar,
    toggleGlossary: app.toggleGlossary,
    handleRefresh,
    toggleStyleProfile: handleToggleStyleProfilePanel
  })

  // ── Glossary: add to from context menu ──────────────────────────────────
  const handleAddToGlossary = useCallback(
    (text: string) => {
      app.setGlossaryVisible(true)
      gls.setGlossaryPrefillSrc(text.trim())
    },
    [app, gls]
  )

  // ── Glossary: edit entry จาก Tooltip ✎ ──────────────────────────────────
  const [glossaryPrefillEntry, setGlossaryPrefillEntry] = useState<
    import('./types').GlossaryEntry | null
  >(null)

  useEffect(() => {
    const onEdit = (e: Event): void => {
      const entry = (e as CustomEvent).detail as import('./types').GlossaryEntry
      app.setGlossaryVisible(true)
      setGlossaryPrefillEntry(entry)
    }
    window.addEventListener('hl:edit', onEdit)
    return () => window.removeEventListener('hl:edit', onEdit)
  }, [app])

  // ── AI result ────────────────────────────────────────────────────────────
  // Style profile store
  const styleProfile = useStyleProfileStore(app.rootDir)

  // Track last AI-generated content for diff comparison
  const { aiContent, setAiContent } = useAiContentTracker()

  // Capture corrections automatically
  useCorrectionCapture({
    tgtContent: files.tgtContent,
    aiGeneratedContent: aiContent,
    onCapture: styleProfile.addCorrection,
    tgtPath: files.tgtPath
  })

  // Load profile when folder opens
  useEffect(() => {
    if (!app.rootDir) return
    ;(async () => {
      try {
        const path = getStyleProfilePath(app.rootDir!)
        const raw = await window.electron.readFile(path)
        styleProfile.loadProfile(JSON.parse(raw))
      } catch {
        // File doesn't exist yet — start fresh (store handles this)
      }
    })()
  }, [app.rootDir, styleProfile])

  // Wrap handleAiResult to track what AI generated
  const handleAiResult = useCallback(
    (translated: string) => {
      setAiContent(translated)
      files.handleTgtChange(translated)
    },
    [files, setAiContent]
  )

  // ── TTS Audio Handler ──────────────────────────────────────────────────────────
  const handlePlayTtsAudio = useCallback(
    (blob: Blob) => {
      const blobUrl = URL.createObjectURL(blob)
      files.setMp3Path(blobUrl)
    },
    [files]
  )

  const handlePushParaphrase = useCallback(
    (orig: string, result: string) => {
      const cur = files.tgtContentRef.current
      const idx = cur.indexOf(orig)
      if (idx !== -1) {
        files.handleTgtChange(cur.slice(0, idx) + result + cur.slice(idx + orig.length))
      } else {
        files.handleTgtChange(result) // fallback
      }
    },
    [files]
  )

  // ── Send selected text to Paraphrase tab ─────────────────────────────────
  const [paraphraseInput, setParaphraseInput] = useState<string | null>(null)

  const handleSendToParaphrase = useCallback(
    (text: string) => {
      app.setStyleProfileOpen(false)
      app.setAiPanelOpen(true)
      setParaphraseInput(text)
    },
    [app]
  )

  const handleSaveTtsAudio = useCallback(
    async (audio: string | Uint8Array, defaultName: string) => {
      const outputDir = app.ttsConfig.outputPath || undefined

      // Call IPC to save file (shows dialog if no outputDir)
      const savedPath =
        typeof audio === 'string'
          ? await window.electron.saveAudioFile(audio, defaultName, outputDir)
          : await window.electron.saveAudioBytes(audio, defaultName, outputDir)

      if (savedPath && !outputDir) {
        // First time saving — remember the directory in config
        const dir = savedPath.replace(/[\\/][^\\/]+$/, '')
        const updatedConfig = { ...app.ttsConfig, outputPath: dir }
        app.handleTtsConfigChange(updatedConfig)
      }
    },
    [app]
  )

  // Treat the tgt file content as AI baseline when a file is loaded.
  // This lets corrections be captured even when the user manually opens an
  // AI-translated file (instead of using the in-app AI translate button).
  useEffect(() => {
    if (files.tgtContent && files.tgtPath) {
      setAiContent(files.tgtContent)
    }
    // Only re-seed when a NEW file is loaded (tgtPath changes), not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files.tgtPath])

  // ── Match count for status bar ────────────────────────────────────────────
  const [matchCount, setMatchCount] = useState(0)
  useEffect(() => {
    const content = files.srcContent || files.tgtContent
    const timeout = window.setTimeout(() => {
      startTransition(() => setMatchCount(countMatches(content, gls.glossary)))
    }, 120)
    return () => window.clearTimeout(timeout)
  }, [files.srcContent, files.tgtContent, gls.glossary])

  const rowCount = useMemo(
    () => (files.tgtContent ? files.tgtContent.split('\n').length : 0),
    [files.tgtContent]
  )

  const hasAnyFile = files.tgtPath !== null
  const shortcutHint = hasAnyFile
    ? [
        'Ctrl+S save',
        files.srcPath ? 'Ctrl+⇧S save src' : '',
        'Ctrl+Z/Y undo/redo',
        'Ctrl+F find',
        'Ctrl+B sidebar',
        'Ctrl+G glossary',
        'Ctrl+R refresh',
        'Ctrl+⇧C copy TGT',
        files.srcPath ? 'Ctrl+Alt+C copy SRC' : ''
      ]
        .filter(Boolean)
        .join('  ·  ')
    : ''

  // ── Setup wizard ─────────────────────────────────────────────────────────
  if (showSetup) return <SetupWizard onDone={handleSetupDone} />

  return (
    <div style={s.app}>
      {/* Top bar */}
      <div style={s.topbar}>
        <span style={s.logo}>TL/EDITOR</span>
        <div style={s.sep} />
        <FileLabel
          tgtPath={files.tgtPath}
          srcPath={files.srcPath}
          isDirty={files.isDirty}
          srcIsDirty={files.srcIsDirty}
          renamingTgt={files.renamingTgt}
          renamingSrc={files.renamingSrc}
          renameValue={files.renameValue}
          onRenameChange={files.setRenameValue}
          onStartRenameTgt={files.startRenameTgt}
          onStartRenameSrc={files.startRenameSrc}
          onCommitRename={handleCommitRename}
          onCancelRename={files.cancelRename}
        />
        <TopBarRight
          rootDir={app.rootDir}
          hasAnyFile={hasAnyFile}
          srcPath={files.srcPath}
          glossaryLen={gls.glossary.length}
          sidebarVisible={app.sidebarVisible}
          glossaryVisible={app.glossaryVisible}
          ttsOpen={app.terminalOpen}
          mp3ConverterOpen={app.mp3ConverterOpen}
          aiPanelOpen={app.aiPanelOpen || app.styleProfileOpen}
          pairingSourcePath={pairingSourcePath}
          saving={files.saving}
          onToggleSidebar={app.toggleSidebar}
          onToggleGlossary={app.toggleGlossary}
          onToggleTts={app.toggleTerminal}
          onToggleMp3Converter={app.toggleMp3Converter}
          onToggleAi={handleToggleAiPanel}
          onSelectPairingSource={handleSelectPairingSource}
          onRefresh={handleRefresh}
        />
      </div>

      {/* Workspace */}
      <div style={s.workspace}>
        {app.rootDir && app.sidebarVisible && (
          <Sidebar
            rootDir={app.rootDir}
            tree={app.tree}
            activePath={files.tgtPath}
            onOpenFolder={handleOpenFolder}
            onSelectFile={handleSelectFile}
            onOpenJsonFile={gls.handleOpenJsonFile}
            onSelectMp3={files.setMp3Path}
            onNewFile={handleNewFile}
            onReorderTree={app.setTree}
            onFileMoved={handleFileMoved}
          />
        )}

        <div style={{ ...s.editorArea, flexDirection: 'column' }}>
          {hasAnyFile ? (
            <>
              {files.mp3Path && (
                <AudioPlayer
                  key={files.mp3Path}
                  filePath={files.mp3Path}
                  onClose={() => files.setMp3Path(null)}
                />
              )}
              <ErrorBoundary name="DualView">
                <DualView
                  key={files.tgtPath}
                  srcContent={files.srcContent}
                  tgtContent={files.tgtContent}
                  srcLabel="SOURCE · ต้นฉบับ"
                  tgtLabel="TRANSLATION · แปล"
                  srcColor="#3ecfa0"
                  tgtColor="#5b8af0"
                  glossary={gls.glossary}
                  onTgtChange={files.handleTgtChange}
                  onSrcChange={files.handleSrcChange}
                  onUndo={files.handleUndo}
                  onRedo={files.handleRedo}
                  onSrcUndo={files.handleSrcUndo}
                  onSrcRedo={files.handleSrcRedo}
                  activeRow={files.activeRow}
                  onRowFocus={files.setActiveRow}
                  onCopyTgt={files.handleCopyTgt}
                  onCopySrc={files.handleCopySrc}
                  onAddToGlossary={handleAddToGlossary}
                  onSendToParaphrase={handleSendToParaphrase}
                  ttsConfig={app.ttsConfig}
                  ttsGlossaries={ttsGlossaries}
                  onSaveTtsAudio={handleSaveTtsAudio}
                  getLineTone={(idx) => files.getLineTone(idx) as ToneName}
                  setLineTone={files.setLineTone}
                  getLineVoiceGender={(idx) => files.getLineVoiceGender(idx) as VoiceGender}
                  setLineVoiceGender={files.setLineVoiceGender}
                />
              </ErrorBoundary>
            </>
          ) : (
            <EmptyState
              onOpen={handleOpenFolder}
              hasFolder={!!app.rootDir}
              onNewFile={handleNewFile}
            />
          )}
        </div>

        {hasAnyFile && app.glossaryVisible && (
          <ErrorBoundary name="GlossaryPanel">
            <GlossaryPanel
              glossary={gls.glossary}
              matchCount={matchCount}
              glossaryPath={gls.glossaryPath}
              sourceFilePaths={gls.sourceFilePaths}
              sourceFileFormats={gls.sourceFileFormats}
              onGlossaryChange={gls.setGlossary}
              currentContent={`${files.srcContent}\n${files.tgtContent}`}
              prefillSrc={gls.glossaryPrefillSrc}
              onPrefillConsumed={() => gls.setGlossaryPrefillSrc(null)}
              prefillEntry={glossaryPrefillEntry}
              onPrefillEntryConsumed={() => setGlossaryPrefillEntry(null)}
              onSaveEdit={gls.saveEditEntry}
              onSaveAdd={gls.saveAddEntry}
              onSaveDelete={gls.saveDeleteEntry}
            />
          </ErrorBoundary>
        )}

        {hasAnyFile && (app.aiPanelOpen || app.styleProfileOpen) && (
          <ErrorBoundary name="AITranslatePanel">
            <AITranslatePanel
              srcContent={files.srcContent}
              savedConfig={app.aiConfig}
              onConfigChange={app.handleAiConfigChange}
              glossary={gls.glossary}
              sourceFilePaths={gls.sourceFilePaths}
              onAddEntries={gls.handleAddAiEntries}
              onResult={handleAiResult}
              stylePromptSnippet={styleProfile.getPromptSnippet()}
              onPushParaphrase={handlePushParaphrase}
              paraphraseInput={paraphraseInput}
              onParaphraseInputConsumed={() => setParaphraseInput(null)}
              profileActive={app.styleProfileOpen}
              onSelectWorkTab={handleSelectAiWorkTab}
              onSelectProfileTab={handleSelectAiProfileTab}
              profilePanel={{
                profile: styleProfile.profile,
                isAnalyzing: styleProfile.isAnalyzing,
                analyzeError: styleProfile.analyzeError,
                apiKey: app.aiConfig.apiKey,
                onAnalyze: (model: string) => styleProfile.analyze(app.aiConfig.apiKey, model),
                onClearCorrections: styleProfile.clearCorrections,
                onResetProfile: styleProfile.resetProfile
              }}
            />
          </ErrorBoundary>
        )}
      </div>

      {/* TTS */}
      {app.terminalOpen && (
        <ErrorBoundary name="TTSPanel">
          <TerminalPanel
            onClose={() => app.setTerminalOpen(false)}
            ttsConfig={app.ttsConfig}
            onTtsConfigChange={app.handleTtsConfigChange}
            tgtPath={files.tgtPath}
            tgtContent={files.tgtContent}
            getLineTone={(idx) => files.getLineTone(idx) as ToneName}
            onPlayTtsAudio={handlePlayTtsAudio}
          />
        </ErrorBoundary>
      )}

      {/* MP3 → MP4 Converter */}
      {app.mp3ConverterOpen && (
        <ErrorBoundary name="Mp3ToMp4">
          <Mp3ToMp4 onClose={() => app.setMp3ConverterOpen(false)} />
        </ErrorBoundary>
      )}

      {/* Status bar */}
      <div style={s.statusbar}>
        <StatusItem label="Ln" value={files.activeRow >= 0 ? String(files.activeRow + 1) : '—'} />
        <StatusItem label="Rows" value={String(rowCount)} />
        <StatusItem label="Matches" value={String(matchCount)} />
        {shortcutHint && (
          <span
            style={{
              marginLeft: 'auto',
              color: 'var(--text2)',
              fontSize: 10,
              fontFamily: 'var(--font-mono)',
              opacity: 0.7
            }}
          >
            {shortcutHint}
          </span>
        )}
      </div>

      <Tooltip />

      {/* Modals */}
      {gls.openGlossaryFile && (
        <GlossaryEditor
          file={gls.openGlossaryFile}
          onSave={gls.handleGlossaryEditorSave}
          onSaveChanges={gls.saveGlossaryEditorChanges}
          onClose={() => gls.setOpenGlossaryFile(null)}
          onImportToSession={(entries) =>
            gls.handleGlossaryEditorImport(entries, gls.openGlossaryFile)
          }
        />
      )}
    </div>
  )
}

// ─── TopBarRight ──────────────────────────────────────────────────────────────

type ActionButtonProps = {
  active?: boolean
  icon: JSX.Element | string
  label: string
  title: string
  onClick: () => void
  compact: boolean
}

const ActionButton = memo(function ActionButton({
  active,
  icon,
  label,
  title,
  onClick,
  compact
}: ActionButtonProps) {
  return (
    <button
      style={{
        ...s.badge,
        cursor: 'pointer',
        border: '1px solid var(--border)',
        background: active ? 'var(--accent-dim)' : 'none',
        color: active ? 'var(--accent)' : 'var(--text2)'
      }}
      onClick={onClick}
      title={title}
    >
      {icon}
      {!compact && label}
    </button>
  )
})

const TopBarRight = memo(function TopBarRight({
  rootDir,
  hasAnyFile,
  srcPath,
  glossaryLen,
  sidebarVisible,
  glossaryVisible,
  ttsOpen,
  mp3ConverterOpen,
  aiPanelOpen,
  pairingSourcePath,
  saving,
  onToggleSidebar,
  onToggleGlossary,
  onToggleTts,
  onToggleMp3Converter,
  onToggleAi,
  onSelectPairingSource,
  onRefresh
}: {
  rootDir: string | null
  hasAnyFile: boolean
  srcPath: string | null
  glossaryLen: number
  sidebarVisible: boolean
  glossaryVisible: boolean
  ttsOpen: boolean
  mp3ConverterOpen: boolean
  aiPanelOpen: boolean
  pairingSourcePath: string
  saving: boolean
  onToggleSidebar: () => void
  onToggleGlossary: () => void
  onToggleTts: () => void
  onToggleAi: () => void
  onToggleMp3Converter: () => void
  onSelectPairingSource: () => void
  onRefresh: () => void
}) {
  const compact = useCompactTopBar()

  return (
    <div style={s.topRight}>
      {rootDir && !hasAnyFile && (
        <span
          style={{
            ...s.badge,
            color: 'var(--hl-gold)',
            borderColor: 'var(--hl-gold-border)',
            background: 'var(--hl-gold-bg)'
          }}
        >
          click 1st file = แปล
        </span>
      )}
      {hasAnyFile && !srcPath && (
        <span
          style={{
            ...s.badge,
            color: 'var(--hl-gold)',
            borderColor: 'var(--hl-gold-border)',
            background: 'var(--hl-gold-bg)'
          }}
        >
          click 2nd file = ต้นฉบับ
        </span>
      )}

      <ActionButton
        active={sidebarVisible}
        icon="☰"
        label=" Sidebar"
        title="Sidebar (Ctrl+B)"
        onClick={onToggleSidebar}
        compact={compact}
      />

      <ActionButton
        active={glossaryVisible}
        icon="◧"
        label={` Glossary ${glossaryLen}`}
        title="Glossary (Ctrl+G)"
        onClick={onToggleGlossary}
        compact={compact}
      />
      {rootDir && (
        <ActionButton
          active={false}
          icon="↺"
          label=" refresh"
          title="Refresh (Ctrl+R)"
          onClick={onRefresh}
          compact={compact}
        />
      )}

      <ActionButton
        active={ttsOpen}
        icon={<IcoMusic size={11} stroke="currentColor" />}
        label=" TTS"
        title="TTS (Ctrl+`)"
        onClick={onToggleTts}
        compact={compact}
      />

      <ActionButton
        active={mp3ConverterOpen}
        icon={<IcoMusic size={11} stroke="currentColor" />}
        label=" MP3→MP4"
        title="MP3 to MP4 Converter"
        onClick={onToggleMp3Converter}
        compact={compact}
      />

      <button
        onClick={onSelectPairingSource}
        title={
          pairingSourcePath
            ? `Source compare path\n${pairingSourcePath}`
            : 'Select source compare path for chapter-number auto pairing'
        }
        style={{
          ...s.badge,
          cursor: 'pointer',
          border: '1px solid var(--border)',
          background: pairingSourcePath ? 'rgba(62,207,160,0.08)' : 'none',
          color: pairingSourcePath ? 'var(--hl-teal)' : 'var(--text2)',
          maxWidth: compact ? 34 : 180,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis'
        }}
      >
        ⇄
        {!compact &&
          (pairingSourcePath
            ? ` SrcPair ${pairingSourcePath.split(/[\\/]/).pop()}`
            : ' Set SrcPair')}
      </button>

      {hasAnyFile && (
        <ActionButton
          active={aiPanelOpen}
          icon={<IcoSparkle size={11} stroke="currentColor" />}
          label=" AI แปล"
          title="AI Translate"
          onClick={onToggleAi}
          compact={compact}
        />
      )}
      {saving && <span style={{ ...s.badge, color: 'var(--hl-teal)' }}>Saving…</span>}
    </div>
  )
})

// ─── StatusItem ───────────────────────────────────────────────────────────────

const StatusItem = memo(function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <span
      style={{
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--text2)'
      }}
    >
      {label} <span style={{ color: 'var(--text1)' }}>{value}</span>
    </span>
  )
})

// ─── FileLabel ────────────────────────────────────────────────────────────────

const FileLabel = memo(function FileLabel({
  tgtPath,
  srcPath,
  isDirty,
  srcIsDirty,
  renamingTgt,
  renamingSrc,
  renameValue,
  onRenameChange,
  onStartRenameTgt,
  onStartRenameSrc,
  onCommitRename,
  onCancelRename
}: {
  tgtPath: string | null
  srcPath: string | null
  isDirty: boolean
  srcIsDirty: boolean
  renamingTgt: boolean
  renamingSrc: boolean
  renameValue: string
  onRenameChange: (v: string) => void
  onStartRenameTgt: () => void
  onStartRenameSrc: () => void
  onCommitRename: (which: 'tgt' | 'src') => Promise<void>
  onCancelRename: () => void
}) {
  if (!tgtPath) return <span style={{ color: 'var(--text2)', fontSize: 12 }}>No file open</span>
  const tgtName = tgtPath.split(/[\\/]/).pop() ?? ''
  const srcName = srcPath?.split(/[\\/]/).pop() ?? null
  const labelSx: CSSProperties = {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '1px 4px',
    borderRadius: 3
  }
  const inputSx: CSSProperties = {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    background: 'var(--bg3)',
    border: '1px solid var(--accent)',
    color: 'var(--text0)',
    padding: '1px 6px',
    borderRadius: 3,
    outline: 'none',
    width: 200
  }
  return (
    <span
      style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0, overflow: 'hidden' }}
    >
      {renamingTgt ? (
        <input
          autoFocus
          style={inputSx}
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename('tgt').catch(console.error)
            if (e.key === 'Escape') onCancelRename()
          }}
          onBlur={() => onCommitRename('tgt').catch(console.error)}
        />
      ) : (
        <span
          style={{
            ...labelSx,
            color: 'var(--hl-teal)',
            display: 'flex',
            alignItems: 'center',
            gap: 5
          }}
          onClick={onStartRenameTgt}
          title="คลิกเพื่อเปลี่ยนชื่อ"
        >
          <IcoEdit size={11} stroke="currentColor" /> {tgtName}
        </span>
      )}
      {isDirty && <span style={{ color: 'var(--hl-teal)', fontSize: 11 }}>●</span>}
      {srcName && (
        <>
          <span style={{ color: 'var(--text2)', margin: '0 4px' }}>·</span>
          {renamingSrc ? (
            <input
              autoFocus
              style={inputSx}
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onCommitRename('src').catch(console.error)
                if (e.key === 'Escape') onCancelRename()
              }}
              onBlur={() => onCommitRename('src').catch(console.error)}
            />
          ) : (
            <span
              style={{
                ...labelSx,
                color: 'var(--text1)',
                display: 'flex',
                alignItems: 'center',
                gap: 5
              }}
              onClick={onStartRenameSrc}
              title="คลิกเพื่อเปลี่ยนชื่อ"
            >
              <IcoFile size={11} stroke="currentColor" /> {srcName}
            </span>
          )}
          {srcIsDirty && <span style={{ color: 'var(--hl-gold)', fontSize: 11 }}>●</span>}
        </>
      )}
    </span>
  )
})

// ─── EmptyState ───────────────────────────────────────────────────────────────

function EmptyState({
  onOpen,
  hasFolder,
  onNewFile
}: {
  onOpen: () => void
  hasFolder: boolean
  onNewFile: () => void
}): JSX.Element {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg0)',
        width: '100%',
        padding: '0 48px'
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 28,
          fontWeight: 500,
          color: 'var(--accent)',
          letterSpacing: '0.1em',
          marginBottom: 6
        }}
      >
        TL/EDITOR
      </div>
      <div
        style={{
          fontSize: 12,
          color: 'var(--text2)',
          marginBottom: 40,
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.05em'
        }}
      >
        translation workspace
      </div>
      <div
        style={{
          background: 'var(--bg1)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '32px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          width: '100%',
          maxWidth: 640
        }}
      >
        {!hasFolder ? (
          <>
            <div style={{ fontSize: 15, color: 'var(--text0)', fontWeight: 500 }}>
              Open a folder to start
            </div>
            <div
              style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.7 }}
            >
              เลือกโฟลเดอร์ที่มีไฟล์ .txt และ glossary.json
            </div>
            <button
              style={{
                marginTop: 4,
                background: 'var(--accent)',
                border: 'none',
                color: '#fff',
                fontSize: 13,
                padding: '8px 24px',
                borderRadius: 6,
                cursor: 'pointer',
                fontWeight: 500
              }}
              onClick={onOpen}
            >
              Open Folder
            </button>
            <button
              style={{
                marginTop: 4,
                background: 'none',
                border: '1px solid var(--border)',
                color: 'var(--text1)',
                fontSize: 12,
                padding: '6px 16px',
                borderRadius: 6,
                cursor: 'pointer'
              }}
              onClick={onNewFile}
            >
              + New Translation File
            </button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 15, color: 'var(--text0)', fontWeight: 500 }}>
              เลือกไฟล์แปลก่อน
            </div>
            <div
              style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', lineHeight: 1.9 }}
            >
              <span style={{ color: 'var(--hl-teal)' }}>คลิกไฟล์แรก</span> → ขึ้นคอลัมน์ซ้าย
              (งานแปล)
              <br />
              <span style={{ color: 'var(--text1)' }}>คลิกไฟล์ที่สอง</span> → ขึ้นคอลัมน์ขวา
              (ต้นฉบับ)
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, CSSProperties> = {
  app: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    outline: 'none'
  },
  topbar: {
    height: 38,
    background: 'var(--bg1)',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 14px',
    gap: 12,
    flexShrink: 0,
    ['WebkitAppRegion' as string]: 'drag'
  },
  logo: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--accent)',
    letterSpacing: '0.06em'
  },
  sep: { width: 1, height: 16, background: 'var(--border)' },
  topRight: { marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' },
  badge: {
    fontSize: 10,
    padding: '2px 7px',
    borderRadius: 99,
    background: 'var(--bg3)',
    color: 'var(--text1)',
    border: '1px solid var(--border)',
    fontFamily: 'var(--font-mono)',
    display: 'flex',
    alignItems: 'center',
    gap: 4
  },
  workspace: { display: 'flex', flex: 1, overflow: 'hidden' },
  editorArea: { flex: 1, display: 'flex', overflow: 'hidden' },
  statusbar: {
    height: 24,
    background: 'var(--bg1)',
    borderTop: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    gap: 14,
    flexShrink: 0
  }
}
