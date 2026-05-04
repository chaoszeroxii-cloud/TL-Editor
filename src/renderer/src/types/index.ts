// ─── Domain types ─────────────────────────────────────────────────────────────

export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children: TreeNode[]
}

export interface GlossaryEntry {
  src: string
  th: string
  type: string
  note?: string
  alt?: string[]
  path?: string[]
  _file?: string
}

export interface FileState {
  srcPath: string
  tgtPath: string
  srcContent: string
  tgtContent: string
  isDirty: boolean
}

export interface AppState {
  rootDir: string | null
  tree: TreeNode[]
  glossary: GlossaryEntry[]
  openFile: FileState | null
}

// ─── Glossary file types ──────────────────────────────────────────────────────

export type GlossaryFileFormat = 'flat' | 'standard' | 'custom'

export interface GlossaryFormat {
  // User-configurable key names for nested glossaries
  callKey: string // e.g., 'Called', 'call', 'name'
  detailKey: string // e.g., 'รายละเอียด', 'description', 'details'
  firstAppKey: string // e.g., 'First Appearance', 'first_appearance'
  isNested: boolean // whether to parse nested structures
}

export interface OpenGlossaryFile {
  path: string
  name: string
  format: GlossaryFileFormat
  entries: GlossaryEntry[]
  isDirty: boolean
}

// ─── AI config ────────────────────────────────────────────────────────────────

export interface AITranslateConfig {
  apiKey: string
  promptPath: string
  glossaryPath: string
}

// ─── Electron IPC bridge ──────────────────────────────────────────────────────

export interface EnvConfig {
  folderPath: string | null
  jsonPaths: string[]
  hasConfig: boolean
  aiApiKey: string
  aiPromptPath: string
  aiGlossaryPath: string
  // TTS API config
  ttsApiUrl: string
  ttsApiKey: string
  ttsVoiceGender: string
  ttsVoiceName: string
  ttsRate: string
  ttsOutputPath: string
  mp4OutputPath: string
  mp4ImagePath: string
  mp4FilenamePrefix: string
  pairingSourcePath: string
}

export interface SaveConfigPayload {
  folderPath?: string | null
  jsonPaths?: string[]
  aiApiKey?: string
  aiPromptPath?: string
  aiGlossaryPath?: string
  // TTS
  ttsApiUrl?: string
  ttsApiKey?: string
  ttsVoiceGender?: string
  ttsVoiceName?: string
  ttsRate?: string
  ttsOutputPath?: string
  mp4OutputPath?: string
  mp4ImagePath?: string
  mp4FilenamePrefix?: string
  pairingSourcePath?: string
}
