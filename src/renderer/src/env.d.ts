/// <reference types="vite/client" />
import type { EnvConfig, SaveConfigPayload } from './types'

type TtsOptions = {
  apiUrl?: string
  apiKey?: string
  voiceGender?: string
  voiceName?: string
  rate?: string
  bf_lib?: Record<string, string>
  at_lib?: Record<string, string>
}

declare global {
  interface Window {
    electron: {
      getEnvConfig: () => Promise<EnvConfig>
      saveConfig: (cfg: SaveConfigPayload) => Promise<void>
      detectPython: () => Promise<Array<{ label: string; path: string }>>
      openFolder: () => Promise<string | null>
      readTree: (dirPath: string) => Promise<unknown>
      readFile: (filePath: string) => Promise<string>
      readFileOptional: (filePath: string) => Promise<string | null>
      translate: (text: string) => Promise<string>
      readAudioBuffer: (filePath: string) => Promise<ArrayBuffer>
      writeFile: (filePath: string, content: string) => Promise<void>
      moveFile: (oldPath: string, newPath: string) => Promise<void>
      saveFile: (defaultName: string, content: string) => Promise<string | null>
      saveAudioFile: (
        base64: string,
        defaultName: string,
        outputDir?: string
      ) => Promise<string | null>
      runCommand: (cmd: string, cwd?: string) => Promise<string>
      runPython: (code: string, cwd?: string) => Promise<string>
      readGlossary: (dirPath: string) => Promise<Record<string, string>>
      getPairedPath: (srcPath: string) => Promise<string>
      openrouterChat: (opts: Record<string, unknown>) => Promise<string>
      openFile: (filters?: Array<{ name: string; extensions: string[] }>) => Promise<string | null>
      ttsStream: (text: string, options?: TtsOptions) => Promise<string>
      saveTtsAudio: (base64: string, filename: string, outputDir: string) => Promise<string>
      tts: (text: string, options?: TtsOptions) => Promise<string>
      on: (channel: string, callback: (...args: unknown[]) => void) => void
      off: (channel: string, callback: (...args: unknown[]) => void) => void
    }
    api: unknown
  }
}
