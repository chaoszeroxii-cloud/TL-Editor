import { ipcMain, app } from 'electron'
import { existsSync } from 'fs'
import fs from 'fs'
import { promises as fsPromises } from 'fs'
import * as dotenv from 'dotenv'
import * as path from 'path'
import keytar from 'keytar'
import { approveConfigPaths, approvePath } from './pathAccess'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppConfig {
  folderPath?: string | null
  jsonPaths?: string[]
  aiApiKey?: string
  aiPromptPath?: string
  aiGlossaryPath?: string
  aiReasoningEffort?: string
  aiPromptEnabled?: boolean
  aiGlossaryExcludeFiles?: string[]
  // TTS API config
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
  // Shorts (vertical 9:16 clips cut from a chapter's Smart-Gen timeline)
  shortsSourceDir?: string
  shortsOutputDir?: string
  shortsImagePath?: string
  shortsCtaText?: string
  readrealmFolder?: string
  readrealmNote?: string
  readrealmNovelId?: string
  // YouTube Publisher (client_secret + refresh token live in keychain, not here)
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
  // Visual-novel image generation (Episode Video)
  imageProvider?: string
  imageApiUrl?: string
  imageApiKey?: string
  imageModel?: string
  imageStyleDirective?: string
  imageBridgePath?: string
  imageBridgeAutoStart?: boolean
}

// ─── Keytar helpers (secure credential storage) ───────────────────────────────

const SERVICE_NAME = 'translation-editor'

export async function saveApiKey(account: string, key: string): Promise<void> {
  try {
    await keytar.setPassword(SERVICE_NAME, account, key)
  } catch (err) {
    console.error(`Failed to save API key to keychain: ${err}`)
    // Keytar might fail on some systems; gracefully continue
  }
}

export async function loadApiKey(account: string): Promise<string | null> {
  try {
    return await keytar.getPassword(SERVICE_NAME, account)
  } catch (err) {
    console.error(`Failed to load API key from keychain: ${err}`)
    return null
  }
}

export async function deleteApiKey(account: string): Promise<void> {
  try {
    await keytar.deletePassword(SERVICE_NAME, account)
  } catch (err) {
    console.error(`Failed to delete API key from keychain: ${err}`)
  }
}

// ─── Config path ──────────────────────────────────────────────────────────────

export function getConfigPath(): string {
  const configPath = path.join(app.getPath('userData'), 'config.json')
  approvePath(configPath)
  return configPath
}

export function loadConfig(): AppConfig {
  const configPath = getConfigPath()
  if (existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf-8')) as AppConfig
    } catch {
      /* malformed — fall through */
    }
  }
  // Dev fallback: .env
  dotenv.config({ path: path.join(process.cwd(), '.env') })
  const jsonPaths: string[] = []
  for (let i = 1; ; i++) {
    const p = process.env[`GLOSSARY_JSON_${i}`]
    if (!p) break
    jsonPaths.push(p)
  }
  return {
    folderPath: process.env.FOLDER_PATH ?? null,
    jsonPaths
  }
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

export function registerConfigHandlers(): void {
  ipcMain.handle('get-env-config', async () => {
    const cfg = loadConfig()
    approveConfigPaths(cfg)

    // Load API keys from keychain (with fallback to config for migration)
    const aiApiKey = (await loadApiKey('openrouter-key')) ?? cfg.aiApiKey ?? ''
    const ttsApiKey = (await loadApiKey('novel-tts-key')) ?? cfg.ttsApiKey ?? ''

    return {
      folderPath: cfg.folderPath ?? null,
      jsonPaths: cfg.jsonPaths ?? [],
      hasConfig: existsSync(getConfigPath()),
      aiApiKey,
      aiPromptPath: cfg.aiPromptPath ?? '',
      aiGlossaryPath: cfg.aiGlossaryPath ?? '',
      aiReasoningEffort: cfg.aiReasoningEffort ?? 'off',
      aiPromptEnabled: cfg.aiPromptEnabled ?? false,
      aiGlossaryExcludeFiles: cfg.aiGlossaryExcludeFiles ?? null,
      // TTS fields
      ttsApiUrl: cfg.ttsApiUrl ?? 'https://novelttsapi-0mv2.onrender.com',
      ttsApiKey,
      ttsVoiceGender: cfg.ttsVoiceGender ?? 'Female',
      ttsVoiceName: cfg.ttsVoiceName ?? '',
      ttsRate: cfg.ttsRate ?? '+35%',
      ttsOutputPath: cfg.ttsOutputPath ?? '',
      mp4OutputPath: cfg.mp4OutputPath ?? '',
      mp4ImagePath: cfg.mp4ImagePath ?? '',
      mp4FilenamePrefix: cfg.mp4FilenamePrefix ?? '',
      mp4UseGpu: cfg.mp4UseGpu ?? true,
      mp4BurnSubtitles: cfg.mp4BurnSubtitles ?? true,
      mp4SubtitleOrientation: cfg.mp4SubtitleOrientation ?? 'landscape',
      pairingSourcePath: cfg.pairingSourcePath ?? '',
      mergeAudioSourceDir: cfg.mergeAudioSourceDir ?? '',
      mergeAudioOutputDir: cfg.mergeAudioOutputDir ?? '',
      mergeAudioPrefix: cfg.mergeAudioPrefix ?? '',
      // Shorts: default source/output/cover from the existing TTS/MP4 fields
      // (mirrors YouTubePanel defaulting its thumbnail from mp4ImagePath) so a
      // first-time user doesn't have to re-pick folders they already set.
      shortsSourceDir: cfg.shortsSourceDir ?? cfg.ttsOutputPath ?? '',
      shortsOutputDir: cfg.shortsOutputDir ?? cfg.mp4OutputPath ?? '',
      shortsImagePath: cfg.shortsImagePath ?? cfg.mp4ImagePath ?? '',
      shortsCtaText: cfg.shortsCtaText ?? 'ตอนเต็มอยู่ในช่อง',
      readrealmFolder: cfg.readrealmFolder ?? '',
      readrealmNote: cfg.readrealmNote ?? '',
      readrealmNovelId: cfg.readrealmNovelId ?? '',
      readrealmUsername: (await loadApiKey('readrealm-user')) ?? '',
      // YouTube Publisher
      youtubeClientId: cfg.youtubeClientId ?? '',
      youtubeFolder: cfg.youtubeFolder ?? '',
      youtubeNovelName: cfg.youtubeNovelName ?? '',
      youtubeTitleTemplate: cfg.youtubeTitleTemplate ?? '{novel} บทที่ {n}',
      youtubeDescription: cfg.youtubeDescription ?? '',
      youtubeTags: cfg.youtubeTags ?? '',
      youtubeCategoryId: cfg.youtubeCategoryId ?? '22',
      youtubePlaylistId: cfg.youtubePlaylistId ?? '',
      youtubeIntervalHrs: cfg.youtubeIntervalHrs ?? 24,
      youtubeAppendPlaylistLink: cfg.youtubeAppendPlaylistLink ?? true,
      // Visual-novel image generation
      imageProvider: cfg.imageProvider ?? 'chatgpt-api',
      imageApiUrl: cfg.imageApiUrl ?? 'http://127.0.0.1:8765/v1',
      imageApiKey: (await loadApiKey('chatgpt-bridge-key')) ?? cfg.imageApiKey ?? '',
      imageModel: cfg.imageModel ?? 'gpt-image-1',
      imageStyleDirective: cfg.imageStyleDirective ?? '',
      imageBridgePath: cfg.imageBridgePath ?? '',
      imageBridgeAutoStart: cfg.imageBridgeAutoStart ?? true
    }
  })

  // Atomic patch save: read current config, merge patch, write back
  // This prevents race conditions when multiple components save config simultaneously
  ipcMain.handle('save-config-patch', async (_e, patch: Partial<AppConfig>) => {
    approveConfigPaths(patch)

    // Save API keys to keychain if included in patch.
    // Present-but-empty (=== '') means an explicit clear → delete from keychain,
    // otherwise a reload would re-load the stale key. (undefined = not in patch → leave alone.)
    if (patch.aiApiKey !== undefined) {
      if (patch.aiApiKey) await saveApiKey('openrouter-key', patch.aiApiKey)
      else await deleteApiKey('openrouter-key')
    }
    if (patch.ttsApiKey) {
      await saveApiKey('novel-tts-key', patch.ttsApiKey)
    }
    if (patch.imageApiKey !== undefined) {
      if (patch.imageApiKey) await saveApiKey('chatgpt-bridge-key', patch.imageApiKey)
      else await deleteApiKey('chatgpt-bridge-key')
    }

    const configPath = getConfigPath()
    const current = existsSync(configPath) ? loadConfig() : {}

    // Merge patch, but remove API keys before saving
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { aiApiKey, ttsApiKey, imageApiKey, ...safePatch } = patch
    const merged: AppConfig = { ...current, ...safePatch }
    await fsPromises.writeFile(configPath, JSON.stringify(merged, null, 2), 'utf-8')
  })
}
