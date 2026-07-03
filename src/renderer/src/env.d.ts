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
  aiReasoningEffort: string
  aiPromptEnabled: boolean
  aiGlossaryExcludeFiles: string[] | null
  ttsApiUrl: string
  ttsApiKey: string
  ttsVoiceGender: string
  ttsVoiceName: string
  ttsRate: string
  ttsOutputPath: string
  mp4OutputPath: string
  mp4ImagePath: string
  mp4FilenamePrefix: string
  mp4UseGpu: boolean
  mp4BurnSubtitles: boolean
  mp4SubtitleOrientation: 'landscape' | 'vertical'
  pairingSourcePath: string
  mergeAudioSourceDir: string
  mergeAudioOutputDir: string
  mergeAudioPrefix: string
  shortsSourceDir: string
  shortsOutputDir: string
  shortsImagePath: string
  shortsCtaText: string
  readrealmFolder: string
  readrealmNote: string
  readrealmNovelId: string
  readrealmUsername: string
  youtubeClientId: string
  youtubeFolder: string
  youtubeNovelName: string
  youtubeTitleTemplate: string
  youtubeDescription: string
  youtubeTags: string
  youtubeCategoryId: string
  youtubePlaylistId: string
  youtubeIntervalHrs: number
  youtubeAppendPlaylistLink: boolean
}

interface _SaveConfigPayload {
  folderPath?: string | null
  jsonPaths?: string[]
  aiApiKey?: string
  aiPromptPath?: string
  aiGlossaryPath?: string
  aiReasoningEffort?: string
  aiPromptEnabled?: boolean
  aiGlossaryExcludeFiles?: string[]
  ttsApiUrl?: string
  ttsApiKey?: string
  ttsVoiceGender?: string
  ttsVoiceName?: string
  ttsRate?: string
  ttsOutputPath?: string
  mp4OutputPath?: string
  mp4ImagePath?: string
  mp4FilenamePrefix?: string
  mp4UseGpu?: boolean
  mp4BurnSubtitles?: boolean
  mp4SubtitleOrientation?: 'landscape' | 'vertical'
  pairingSourcePath?: string
  mergeAudioSourceDir?: string
  mergeAudioOutputDir?: string
  mergeAudioPrefix?: string
  shortsSourceDir?: string
  shortsOutputDir?: string
  shortsImagePath?: string
  shortsCtaText?: string
  readrealmFolder?: string
  readrealmNote?: string
  readrealmNovelId?: string
  youtubeClientId?: string
  youtubeFolder?: string
  youtubeNovelName?: string
  youtubeTitleTemplate?: string
  youtubeDescription?: string
  youtubeTags?: string
  youtubeCategoryId?: string
  youtubePlaylistId?: string
  youtubeIntervalHrs?: number
  youtubeAppendPlaylistLink?: boolean
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
  /** Like writeFile but creates missing parent directories first (mkdir -p). */
  writeFileEnsureDir: (filePath: string, content: string) => Promise<void>
  /** List file names (files only, non-recursive) in a directory; [] if missing. */
  listDir: (dirPath: string) => Promise<string[]>
  /** Delete a single file; no-op if it doesn't exist. */
  deleteFile: (filePath: string) => Promise<void>
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
  openFiles: (filters?: { name: string; extensions: string[] }[]) => Promise<string[]>
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
    messages: Array<{ role: string; content: string | null; [key: string]: unknown }>
    tools?: object[]
    reasoning?: { effort?: string; max_tokens?: number; exclude?: boolean; enabled?: boolean }
    stream?: boolean
    requestId?: string
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
    useGpu?: boolean
    burnSubtitles?: boolean
    subtitleOrientation?: 'landscape' | 'vertical'
  }) => Promise<{ canceled?: boolean; outputs: string[]; errors: string[] }>
  cancelMp3ToMp4: () => Promise<boolean>
  /** Concatenate base64 MP3 segments via ffmpeg stream copy. Returns base64 result. */
  concatMp3s: (audioBase64Array: string[]) => Promise<string>

  // ── Shorts (vertical 9:16 clips cut from a chapter's Smart-Gen timeline) ────
  listTimelineMp3s: (dir: string) => Promise<Array<{ path: string; name: string }>>
  readMp3Timeline: (
    mp3Path: string
  ) => Promise<{ totalSec: number; lines: Array<{ row: number; start: number; text?: string }> } | null>
  createShortClip: (opts: {
    mp3Path: string
    imagePath: string
    startSec: number
    endSec: number
    ctaText?: string
    outputDir: string
    ffmpegPath?: string
    useGpu?: boolean
  }) => Promise<{ outputPath: string }>
  cancelShortClip: () => Promise<boolean>

  // ── Merge Episode Audio ──────────────────────────────────────────────────
  mergeEpisodeAudio: (opts: {
    sourceDir: string
    fromEp: number
    toEp: number
    batchSize: number
    prefix: string
    outputDir: string
  }) => Promise<{ success?: boolean; canceled?: boolean }>
  cancelMergeAudio: () => Promise<boolean>

  // ── ReadRealm Publisher ──────────────────────────────────────────────────
  readrealmSaveCredentials: (opts: {
    username: string
    password: string
  }) => Promise<{ success: boolean; error?: string }>
  readrealmGetToken: () => Promise<{ success: boolean; error?: string }>
  readrealmGetNovels: () => Promise<{
    success: boolean
    data?: { total: number; data: _RRNovel[] }
    error?: string
  }>
  readrealmGetChapters: (opts: { novelId: string }) => Promise<{
    success: boolean
    data?: { total: number; data: _RRChapter[] }
    error?: string
  }>
  readrealmUploadChapter: (opts: {
    novelId: string
    chapterId: string
    title: string
    content: string
    price: number
    publishDatetime: string
    note: string
  }) => Promise<{ success: boolean; error?: string }>

  // ── YouTube Publisher ──────────────────────────────────────────────────────
  youtubeSaveSecret: (opts: { clientSecret: string }) => Promise<{ success: boolean; error?: string }>
  youtubeConnect: () => Promise<{ success: boolean; channelTitle?: string; error?: string }>
  youtubeStatus: () => Promise<{ connected: boolean; channelTitle?: string; error?: string }>
  youtubeDisconnect: () => Promise<{ success: boolean }>
  youtubeListPlaylists: () => Promise<{
    success: boolean
    data?: Array<{ id: string; title: string }>
    error?: string
  }>
  youtubeListUploaded: () => Promise<{
    success: boolean
    data?: Array<{ title: string; videoId: string }>
    error?: string
  }>
  youtubeUploadVideo: (opts: {
    videoPath: string
    title: string
    description: string
    tags: string[]
    categoryId: string
    privacyStatus: 'public' | 'unlisted' | 'private'
    publishAt?: string
    defaultLanguage?: string
    playlistId?: string
    thumbnailPath?: string
  }) => Promise<{
    success: boolean
    videoId?: string
    warning?: string
    quotaExceeded?: boolean
    canceled?: boolean
    error?: string
  }>
  cancelYoutubeUpload: () => Promise<boolean>

  // ── Visual-novel image assets ──────────────────────────────────────────────
  imageGenerate: (opts: {
    novelDir: string
    kind: 'background' | 'character'
    subject: string
    name?: string
    glossarySrc?: string
    force?: boolean
  }) => Promise<_ImageAsset>
  imageEdit: (opts: {
    novelDir: string
    sourceId: string
    instruction: string
    name?: string
  }) => Promise<_ImageAsset>
  imageListAssets: (novelDir: string) => Promise<_ImageAsset[]>
  imageDeleteAsset: (novelDir: string, id: string) => Promise<void>
  imageBindCharacter: (novelDir: string, id: string, glossarySrc: string) => Promise<void>

  // ── Image bridge (chatgpt-api sidecar) ─────────────────────────────────────
  bridgeStatus: () => Promise<{
    exeFound: boolean
    managed: boolean
    healthy: boolean
    url: string
    port: number
  }>
  bridgeStart: () => Promise<{ ok: boolean; reason?: string }>
  bridgeStop: () => Promise<{ ok: boolean }>
  bridgeListAccounts: () => Promise<_BridgeAccount[]>
  bridgeAddCapture: (
    account: string,
    rawText: string
  ) => Promise<{
    ok: boolean
    reason?: string
    message?: string
    failed?: string[]
    expiresAt?: number | null
  }>
  bridgeVerifyAccount: (
    account: string
  ) => Promise<{ ok: boolean; reason?: string; status?: number; detail?: unknown }>
  bridgeDeleteAccount: (account: string) => Promise<{ ok: boolean }>
}

declare global {
  interface Window {
    electron: ElectronAPI
  }

  interface _ImageAsset {
    id: string
    kind: 'background' | 'character'
    name: string
    subject: string
    file: string
    provider: string
    model: string
    createdAt: number
    glossarySrc?: string
    path: string
  }

  interface _BridgeAccount {
    name: string
    captureExists: boolean
    expiresAt: number | null
    expired: boolean
  }

  interface _RRNovel {
    novel_ID: string
    novel_subject: string
    novel_chapter_count: number
  }

  interface _RRChapter {
    novel_chapter_ID: string
    novel_chapter_title: string
    novel_chapter_price: number
    novel_chapter_publish: boolean
    novel_chapter_publish_datetime: string
  }
}

export {}
