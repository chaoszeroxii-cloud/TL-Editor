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
  path?: string[] // tree path from JSON e.g. ["Characters","Main Character"]
  _file?: string // source filename tag
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

// ─── Glossary file types (shared between GlossaryEditor & store) ─────────────

export type GlossaryFileFormat = 'flat' | 'standard' | 'custom'

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
  pythonExe: string | null
  pythonScript: string | null
  pythonCwd: string | null
  hasConfig: boolean
  aiApiKey: string
  aiPromptPath: string
  aiGlossaryPath: string
}

export interface SaveConfigPayload {
  folderPath?: string | null
  jsonPaths?: string[]
  pythonExe?: string
  pythonScript?: string
  pythonCwd?: string
  aiApiKey?: string
  aiPromptPath?: string
  aiGlossaryPath?: string
}

declare global {
  interface Window {
    electron: {
      // config
      getEnvConfig: () => Promise<EnvConfig>
      saveConfig: (cfg: SaveConfigPayload) => Promise<void>
      detectPython: () => Promise<{ label: string; path: string }[]>

      // fs
      readTree: (dirPath: string) => Promise<TreeNode[]>
      readFile: (filePath: string) => Promise<string>
      readAudioBuffer: (filePath: string) => Promise<string>
      writeFile: (filePath: string, content: string) => Promise<void>
      moveFile: (oldPath: string, newPath: string) => Promise<void>
      saveFile: (defaultName: string, content: string) => Promise<string | null>
      readGlossary: (dirPath: string) => Promise<GlossaryEntry[]>
      getPairedPath: (srcPath: string) => Promise<{ path: string; exists: boolean }>

      // dialog
      openFolder: () => Promise<string | null>
      openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>

      // shell
      runCommand: (
        cmd: string,
        cwd?: string
      ) => Promise<{ stdout: string; stderr: string; exitCode: number }>
      killProcess: () => void
      runPython: (
        code: string,
        cwd?: string
      ) => Promise<{ stdout: string; stderr: string; exitCode: number }>

      // external APIs
      translate: (text: string) => Promise<unknown>
      openrouterChat: (opts: {
        apiKey: string
        model: string
        messages: { role: string; content: string }[]
      }) => Promise<string>
      tts: (text: string, voice?: string) => Promise<string>

      // events
      on: (channel: string, cb: (...args: unknown[]) => void) => void
      off: (channel: string, cb: (...args: unknown[]) => void) => void
    }
  }
}
