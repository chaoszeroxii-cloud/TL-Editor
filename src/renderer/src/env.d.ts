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
//   • `saveConfig` / `saveConfigPatch` accept typed patch objects.

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
  pythonExe: string | null
  pythonScript: string | null
  pythonCwd: string | null
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
}

interface _SaveConfigPayload {
  folderPath?: string | null
  jsonPaths?: string[]
  pythonExe?: string
  pythonScript?: string
  pythonCwd?: string
  aiApiKey?: string
  aiPromptPath?: string
  aiGlossaryPath?: string
  ttsApiUrl?: string
  ttsApiKey?: string
  ttsVoiceGender?: string
  ttsVoiceName?: string
  ttsRate?: string
  ttsOutputPath?: string
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
  saveConfig: (cfg: _SaveConfigPayload) => Promise<void>
  saveConfigPatch: (patch: _SaveConfigPayload) => Promise<void>

  // ── File operations ──────────────────────────────────────────────────────
  readTree: (dirPath: string) => Promise<_TreeNode[]>
  readFile: (filePath: string) => Promise<string>
  readFileOptional: (filePath: string) => Promise<string | null>
  writeFile: (filePath: string, content: string) => Promise<void>
  moveFile: (oldPath: string, newPath: string) => Promise<void>
  /** @legacy Use audio:// protocol instead for local audio files */
  readAudioBuffer: (filePath: string) => Promise<string>
  saveFile: (defaultName: string, content: string) => Promise<string | null>
  saveAudioFile: (base64: string, defaultName: string, outputDir?: string) => Promise<string | null>
  readGlossary: (dirPath: string) => Promise<_GlossaryEntry[]>
  getPairedPath: (srcPath: string) => Promise<{ path: string; exists: boolean }>

  // ── Process / shell ──────────────────────────────────────────────────────
  runCommand: (
    cmd: string,
    cwd?: string
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  killProcess: () => Promise<void>
  runPython: (
    code: string,
    cwd?: string
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  installPythonPackages: (
    exePath: string,
    packages: string[]
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>
  detectPython: () => Promise<{ label: string; path: string }[]>

  // ── File dialogs ─────────────────────────────────────────────────────────
  openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<string | null>
  openFolder: () => Promise<string | null>

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

  // ── Event listeners ──────────────────────────────────────────────────────
  on: (channel: string, cb: (...args: unknown[]) => void) => void
  off: (channel: string, cb: (...args: unknown[]) => void) => void

  // ── Network request management ───────────────────────────────────────────
  cancelNetworkRequest: (requestId: string) => Promise<boolean>
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}

export {}
