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
  // TTS API config
  ttsApiUrl: string
  ttsApiKey: string
  ttsVoiceGender: string
  ttsVoiceName: string
  ttsRate: string
  ttsOutputPath: string
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
  // TTS
  ttsApiUrl?: string
  ttsApiKey?: string
  ttsVoiceGender?: string
  ttsVoiceName?: string
  ttsRate?: string
  ttsOutputPath?: string
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
      readFileOptional: (filePath: string) => Promise<string | null>
      readAudioBuffer: (filePath: string) => Promise<string>
      writeFile: (filePath: string, content: string) => Promise<void>
      moveFile: (oldPath: string, newPath: string) => Promise<void>
      saveFile: (defaultName: string, content: string) => Promise<string | null>
      readGlossary: (dirPath: string) => Promise<GlossaryEntry[]>
      getPairedPath: (srcPath: string) => Promise<{ path: string; exists: boolean }>

      // dialog
      openFolder: () => Promise<string | null>
      openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
      /**
       * Save binary audio file (MP3) to disk.
       * @param base64 - Base64-encoded MP3 data
       * @param defaultName - Suggested filename e.g. "tts_2024-01-01.mp3"
       * @param outputDir - If provided, auto-saves there without dialog
       * @returns Saved file path, or null if user cancelled
       */
      saveAudioFile: (
        base64: string,
        defaultName: string,
        outputDir?: string
      ) => Promise<string | null>

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
      /**
       * Generate TTS audio via Novel TTS API.
       * Replaces old edge-tts CLI — same base64 return interface.
       * @param text - Text to synthesize (already preprocessed by ttsPreprocess.ts)
       * @param options - TTS API options (falls back to defaults if not provided)
       */
      tts: (
        text: string,
        options?: {
          apiUrl?: string
          apiKey?: string
          voiceGender?: string
          voiceName?: string
          rate?: string
          bf_lib?: Record<string, string>
          at_lib?: Record<string, string>
        }
      ) => Promise<string>
      /**
       * Generate TTS audio via Novel TTS API streaming endpoint.
       * @param text - Text to synthesize
       * @param options - TTS API options including glossaries
       */
      ttsStream: (
        text: string,
        options?: {
          apiUrl?: string
          apiKey?: string
          voiceGender?: string
          voiceName?: string
          rate?: string
          bf_lib?: Record<string, string>
          at_lib?: Record<string, string>
        }
      ) => Promise<string>
      /**
       * Save TTS audio file to disk.
       * @param base64 - Base64-encoded MP3 data
       * @param filename - Output filename
       * @param outputDir - Directory where file will be saved
       * @returns Path to saved file
       */
      saveTtsAudio: (base64: string, filename: string, outputDir: string) => Promise<string>

      // events
      on: (channel: string, cb: (...args: unknown[]) => void) => void
      off: (channel: string, cb: (...args: unknown[]) => void) => void
    }
  }
}
