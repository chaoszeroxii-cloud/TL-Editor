// src/renderer/src/env.d.ts
//
// Batch 8 cleanup (updated):
//   • `ElectronAPI` is the single source of truth for the preload bridge.
//   • `getEnvConfig` now returns a typed `EnvConfig` shape instead of
//     `Record<string, unknown>` — this was the root cause of ts(2322)/ts(2345)
//     errors in App.tsx where `cfg.folderPath`, `cfg.ttsApiUrl` etc. were
//     inferred as `unknown` and rejected by downstream APIs that expect `string`.
//   • `readTree` return typed as `TreeNode[]` (matches IPC implementation).
//   • `readGlossary` return typed as `GlossaryEntry[]`.
//   • `saveConfigPatch` accepts typed patch objects.

/// <reference types="vite/client" />

// ── Inline types (mirrors src/renderer/src/types/index.ts) ──────────────────
// Duplicated here as inline interfaces so env.d.ts stays self-contained
// (ambient declaration files cannot import from modules).

interface _TreeNode {
  name: string
  path: string
  type: 'file' | 'folder'
  children: _TreeNode[]
}

interface _GlossaryEntry {
  src: string
  th: string
  type: string
  note?: string
  alt?: string[]
  path?: string[]
  _file?: string
}

interface _EnvConfig {
  folderPath: string | null
  jsonPaths: string[]
  hasConfig: boolean
  aiApiKey: string
  aiPromptPath: string
  aiGlossaryPath: string
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

interface _SaveConfigPayload {
  folderPath?: string | null
  jsonPaths?: string[]
  aiApiKey?: string
  aiPromptPath?: string
  aiGlossaryPath?: string
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

// ── TTS options (shared by tts + ttsStream) ──────────────────────────────────
interface _TtsOptions {
  apiUrl?: string
  apiKey?: string
  voiceGender?: string
  voiceName?: string
  rate?: string
  bf_lib?: Record<string, string>
  at_lib?: Record<string, string>
}

// ── ElectronAPI ──────────────────────────────────────────────────────────────

interface ElectronAPI {
  // ── Config ──────────────────────────────────────────────────────────────
  /** Returns the full app config; fields are all concrete typed strings/arrays. */
  getEnvConfig: () => Promise<_EnvConfig>
  saveConfigPatch: (patch: _SaveConfigPayload) => Promise<void>

  // ── File operations ──────────────────────────────────────────────────────
  readTree: (dirPath: string, options?: { force?: boolean }) => Promise<_TreeNode[]>
  readFile: (filePath: string) => Promise<string>
  readFileOptional: (filePath: string) => Promise<string | null>
  readImageDataUrl: (filePath: string) => Promise<string>
  writeFile: (filePath: string, content: string) => Promise<void>
  moveFile: (oldPath: string, newPath: string) => Promise<void>
  /** @legacy Use audio:// protocol instead for local audio files */
  readAudioBuffer: (filePath: string) => Promise<string>
  saveFile: (defaultName: string, content: string) => Promise<string | null>
  saveAudioFile: (base64: string, defaultName: string, outputDir?: string) => Promise<string | null>
  saveAudioBytes: (
    bytes: Uint8Array,
    defaultName: string,
    outputDir?: string
  ) => Promise<string | null>
  readGlossary: (dirPath: string) => Promise<_GlossaryEntry[]>
  getPairedPath: (srcPath: string) => Promise<{ path: string; exists: boolean }>

  // ── File dialogs ─────────────────────────────────────────────────────────
  openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  openFolder: () => Promise<string | null>
  getPathForFile: (file: File) => string
  approvePaths: (paths: string[]) => Promise<void>
  on: (channel: string, cb: (...args: unknown[]) => void) => void
  off: (channel: string, cb: (...args: unknown[]) => void) => void

  // ── Translation / AI APIs ────────────────────────────────────────────────
  translate: (text: string) => Promise<unknown>
  openrouterChat: (opts: {
    apiKey: string
    model: string
    messages: { role: string; content: string }[]
  }) => Promise<{ requestId: string; data: string }>

  // ── TTS APIs ─────────────────────────────────────────────────────────────
  /** Returns { requestId, data } where data is base64-encoded MP3 bytes. */
  tts: (text: string, options?: _TtsOptions) => Promise<{ requestId: string; data: string }>
  /** Streaming variant — same response shape as tts(). */
  ttsStream: (text: string, options?: _TtsOptions) => Promise<{ requestId: string; data: string }>
  saveTtsAudio: (base64: string, filename: string, outputDir: string) => Promise<string>

  // ── Network request management ───────────────────────────────────────────
  cancelNetworkRequest: (requestId: string) => Promise<boolean>

  // ── MP3 → MP4 conversion ────────────────────────────────────────────────
  convertMp3ToMp4: (opts: {
    imagePath: string
    audioPaths: string[]
    outputDir?: string
    filenamePrefix?: string
    ffmpegPath?: string
  }) => Promise<{ canceled?: boolean; outputs: string[]; errors: string[] }>
  cancelMp3ToMp4: () => Promise<boolean>
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}

export {}
