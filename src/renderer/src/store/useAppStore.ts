import { useState, useCallback, useRef, Dispatch, SetStateAction, MutableRefObject } from 'react'
import type { TreeNode, AITranslateConfig } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// useAppStore
// Manages app-level UI state: folder tree, panel visibility, AI config.
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
  aiPanelOpen: boolean
  setAiPanelOpen: Dispatch<SetStateAction<boolean>>
  jsonManagerOpen: boolean
  setJsonManagerOpen: Dispatch<SetStateAction<boolean>>

  // Panel Toggles
  toggleSidebar: () => void
  toggleGlossary: () => void
  toggleTerminal: () => void
  toggleAiPanel: () => void
  toggleJsonManager: (hasFiles: boolean) => void

  // AI Config
  aiConfig: AITranslateConfig
  setAiConfig: Dispatch<SetStateAction<AITranslateConfig>>
  handleAiConfigChange: (cfg: AITranslateConfig) => void
  styleProfileOpen: boolean
  setStyleProfileOpen: Dispatch<SetStateAction<boolean>>
  toggleStyleProfile: () => void

  // Actions
  refreshTree: () => Promise<void>
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
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [jsonManagerOpen, setJsonManagerOpen] = useState(false)

  const toggleSidebar = useCallback(() => setSidebarVisible((v) => !v), [])
  const toggleGlossary = useCallback(() => setGlossaryVisible((v) => !v), [])
  const toggleTerminal = useCallback(() => setTerminalOpen((v) => !v), [])
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
    // Persist asynchronously — don't block on every keystroke
    window.electron
      .getEnvConfig()
      .then((env) =>
        window.electron.saveConfig({
          folderPath: env.folderPath,
          jsonPaths: env.jsonPaths,
          pythonExe: env.pythonExe ?? undefined,
          pythonScript: env.pythonScript ?? undefined,
          pythonCwd: env.pythonCwd ?? undefined,
          aiApiKey: cfg.apiKey,
          aiPromptPath: cfg.promptPath,
          aiGlossaryPath: cfg.glossaryPath
        })
      )
      .catch(() => {})
  }, [])

  const [styleProfileOpen, setStyleProfileOpen] = useState(false)
  const toggleStyleProfile = useCallback(() => setStyleProfileOpen((v) => !v), [])

  // ── Tree refresh ──────────────────────────────────────────────────────────
  const refreshTree = useCallback(async () => {
    if (!rootDir) return
    const newTree = await window.electron.readTree(rootDir)
    _setTree(newTree)
  }, [rootDir, _setTree])

  return {
    // state
    rootDir,
    setRootDir,
    tree,
    treeRef,
    setTree: _setTree,

    // panels
    sidebarVisible,
    setSidebarVisible,
    toggleSidebar,
    glossaryVisible,
    setGlossaryVisible,
    toggleGlossary,
    terminalOpen,
    setTerminalOpen,
    toggleTerminal,
    aiPanelOpen,
    setAiPanelOpen,
    toggleAiPanel,
    jsonManagerOpen,
    setJsonManagerOpen,
    toggleJsonManager,

    // ai config
    aiConfig,
    setAiConfig,
    handleAiConfigChange,
    styleProfileOpen,
    setStyleProfileOpen,
    toggleStyleProfile,

    // actions
    refreshTree
  }
}
