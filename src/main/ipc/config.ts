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
  pairingSourcePath?: string
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
      // TTS fields
      ttsApiUrl: cfg.ttsApiUrl ?? 'https://novelttsapi.onrender.com',
      ttsApiKey,
      ttsVoiceGender: cfg.ttsVoiceGender ?? 'Female',
      ttsVoiceName: cfg.ttsVoiceName ?? '',
      ttsRate: cfg.ttsRate ?? '+35%',
      ttsOutputPath: cfg.ttsOutputPath ?? '',
      mp4OutputPath: cfg.mp4OutputPath ?? '',
      mp4ImagePath: cfg.mp4ImagePath ?? '',
      mp4FilenamePrefix: cfg.mp4FilenamePrefix ?? '',
      pairingSourcePath: cfg.pairingSourcePath ?? ''
    }
  })

  // Atomic patch save: read current config, merge patch, write back
  // This prevents race conditions when multiple components save config simultaneously
  ipcMain.handle('save-config-patch', async (_e, patch: Partial<AppConfig>) => {
    approveConfigPaths(patch)

    // Save API keys to keychain if included in patch
    if (patch.aiApiKey) {
      await saveApiKey('openrouter-key', patch.aiApiKey)
    }
    if (patch.ttsApiKey) {
      await saveApiKey('novel-tts-key', patch.ttsApiKey)
    }

    const configPath = getConfigPath()
    const current = existsSync(configPath) ? loadConfig() : {}

    // Merge patch, but remove API keys before saving
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { aiApiKey, ttsApiKey, ...safePatch } = patch
    const merged: AppConfig = { ...current, ...safePatch }
    await fsPromises.writeFile(configPath, JSON.stringify(merged, null, 2), 'utf-8')
  })
}
