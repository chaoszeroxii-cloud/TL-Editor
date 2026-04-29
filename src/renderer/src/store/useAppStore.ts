// src/renderer/src/store/useAppStore.ts
//
// Batch 8 cleanup:
//   • Removed `refreshTree` — it was identical to App.tsx's local `handleRefresh`
//     and was never called by any consumer.  App.tsx keeps its own version so
//     it can be passed directly into useKeyboardShortcuts without going through
//     the store.
//   • AppStore interface trimmed accordingly.

import { useState, useCallback, useRef, Dispatch, SetStateAction, MutableRefObject } from 'react'
import type { TreeNode, AITranslateConfig } from '../types'
import type { TtsApiConfig } from '../components/Terminal/TTSApiTab'
import { DEFAULT_TTS_CONFIG } from '../components/Terminal/ttsConstants'

// ─────────────────────────────────────────────────────────────────────────────
// useAppStore
// Manages app-level UI state: folder tree, panel visibility, AI config, TTS config.
// ─────────────────────────────────────────────────────────────────────────────

export interface AppStore {
  // Folder / Tree
  rootDir: string | null
  setRootDir: Dispatch<SetStateAction<string | null>>
  tree: TreeNode[]
  treeRef: MutableRefObject<TreeNode[]>
  setTree: (t: TreeNode[]) => void

  // Panels State
  sidebarVisible: boolean
  setSidebarVisible: Dispatch<SetStateAction<boolean>>
  glossaryVisible: boolean
  setGlossaryVisible: Dispatch<SetStateAction<boolean>>
  terminalOpen: boolean
  setTerminalOpen: Dispatch<SetStateAction<boolean>>
  mp3ConverterOpen: boolean
  setMp3ConverterOpen: Dispatch<SetStateAction<boolean>>
  aiPanelOpen: boolean
  setAiPanelOpen: Dispatch<SetStateAction<boolean>>
  jsonManagerOpen: boolean
  setJsonManagerOpen: Dispatch<SetStateAction<boolean>>

  // Panel Toggles
  toggleSidebar: () => void
  toggleGlossary: () => void
  toggleTerminal: () => void
  toggleMp3Converter: () => void
  toggleAiPanel: () => void
  toggleJsonManager: (hasFiles: boolean) => void

  // AI Config
  aiConfig: AITranslateConfig
  setAiConfig: Dispatch<SetStateAction<AITranslateConfig>>
  handleAiConfigChange: (cfg: AITranslateConfig) => void
  styleProfileOpen: boolean
  setStyleProfileOpen: Dispatch<SetStateAction<boolean>>
  toggleStyleProfile: () => void

  // TTS Config
  ttsConfig: TtsApiConfig
  setTtsConfig: Dispatch<SetStateAction<TtsApiConfig>>
  handleTtsConfigChange: (cfg: TtsApiConfig) => void
}

export function useAppStore(): AppStore {
  // ── Folder / tree ─────────────────────────────────────────────────────────
  const [rootDir, setRootDir] = useState<string | null>(null)
  const [tree, setTree] = useState<TreeNode[]>([])

  const treeRef = useRef<TreeNode[]>([])
  const _setTree = useCallback((t: TreeNode[]) => {
    treeRef.current = t
    setTree(t)
  }, [])

  // ── Panel visibility ──────────────────────────────────────────────────────
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [glossaryVisible, setGlossaryVisible] = useState(true)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [mp3ConverterOpen, setMp3ConverterOpen] = useState(false)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [jsonManagerOpen, setJsonManagerOpen] = useState(false)

  const toggleSidebar = useCallback(() => setSidebarVisible((v) => !v), [])
  const toggleGlossary = useCallback(() => setGlossaryVisible((v) => !v), [])
  const toggleTerminal = useCallback(() => setTerminalOpen((v) => !v), [])
  const toggleMp3Converter = useCallback(() => setMp3ConverterOpen((v) => !v), [])
  const toggleAiPanel = useCallback(() => setAiPanelOpen((v) => !v), [])
  const toggleJsonManager = useCallback((hasFiles: boolean) => {
    if (hasFiles) setJsonManagerOpen((v) => !v)
  }, [])

  // ── AI config ────────────────────────────────────────────────────────────
  const [aiConfig, setAiConfig] = useState<AITranslateConfig>({
    apiKey: '',
    promptPath: '',
    glossaryPath: ''
  })

  const handleAiConfigChange = useCallback((cfg: AITranslateConfig) => {
    setAiConfig(cfg)
    window.electron
      .saveConfigPatch({
        aiApiKey: cfg.apiKey,
        aiPromptPath: cfg.promptPath,
        aiGlossaryPath: cfg.glossaryPath
      })
      .catch(() => {})
  }, [])

  const [styleProfileOpen, setStyleProfileOpen] = useState(false)
  const toggleStyleProfile = useCallback(() => setStyleProfileOpen((v) => !v), [])

  // ── TTS config ────────────────────────────────────────────────────────────
  const [ttsConfig, setTtsConfig] = useState<TtsApiConfig>(DEFAULT_TTS_CONFIG)

  const handleTtsConfigChange = useCallback((cfg: TtsApiConfig) => {
    setTtsConfig(cfg)
    window.electron
      .saveConfigPatch({
        ttsApiUrl: cfg.apiUrl,
        ttsApiKey: cfg.apiKey,
        ttsVoiceGender: cfg.voiceGender,
        ttsVoiceName: cfg.voiceName,
        ttsRate: cfg.rate,
        ttsOutputPath: cfg.outputPath
      })
      .catch(() => {})
  }, [])

  return {
    rootDir,
    setRootDir,
    tree,
    treeRef,
    setTree: _setTree,

    sidebarVisible,
    setSidebarVisible,
    toggleSidebar,
    glossaryVisible,
    setGlossaryVisible,
    toggleGlossary,
    terminalOpen,
    setTerminalOpen,
    toggleTerminal,
    mp3ConverterOpen,
    setMp3ConverterOpen,
    toggleMp3Converter,
    aiPanelOpen,
    setAiPanelOpen,
    toggleAiPanel,
    jsonManagerOpen,
    setJsonManagerOpen,
    toggleJsonManager,

    aiConfig,
    setAiConfig,
    handleAiConfigChange,
    styleProfileOpen,
    setStyleProfileOpen,
    toggleStyleProfile,

    ttsConfig,
    setTtsConfig,
    handleTtsConfigChange
  }
}
