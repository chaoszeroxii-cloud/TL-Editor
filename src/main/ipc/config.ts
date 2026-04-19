import { ipcMain, app } from 'electron'
import { existsSync } from 'fs'
import fs from 'fs'
import { promises as fsPromises } from 'fs'
import { exec } from 'child_process'
import * as dotenv from 'dotenv'
import * as path from 'path'
import keytar from 'keytar'
import { approveConfigPaths, approvePath } from './pathAccess'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppConfig {
  folderPath?: string | null
  jsonPaths?: string[]
  pythonExe?: string | null
  pythonScript?: string | null
  pythonCwd?: string | null
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
    pythonExe: process.env.PYTHON_EXE ?? null,
    pythonScript: process.env.PYTHON_SCRIPT ?? null,
    pythonCwd: process.env.PYTHON_CWD ?? null,
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
      pythonExe: cfg.pythonExe ?? null,
      pythonScript: cfg.pythonScript ?? null,
      pythonCwd: cfg.pythonCwd ?? null,
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
      ttsOutputPath: cfg.ttsOutputPath ?? ''
    }
  })

  ipcMain.handle('save-config', async (_e, cfg: AppConfig) => {
    approveConfigPaths(cfg)

    // Save API keys to keychain (not to config.json)
    if (cfg.aiApiKey) {
      await saveApiKey('openrouter-key', cfg.aiApiKey)
    }
    if (cfg.ttsApiKey) {
      await saveApiKey('novel-tts-key', cfg.ttsApiKey)
    }

    // Remove API keys from config before saving to file
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { aiApiKey, ttsApiKey, ...safeCfg } = cfg
    await fsPromises.writeFile(getConfigPath(), JSON.stringify(safeCfg, null, 2), 'utf-8')
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

  ipcMain.handle('detect-python', async () => {
    const results: { label: string; path: string }[] = []
    const seen = new Set<string>()

    const tryExe = async (exePath: string): Promise<void> => {
      const normalized = exePath.trim().replace(/\\/g, '/')
      if (!normalized || seen.has(normalized)) return
      seen.add(normalized)
      try {
        const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>((res) =>
          exec(`"${exePath}" --version`, { timeout: 3000 }, (stdout, stderr) =>
            res({ stdout: String(stdout || ''), stderr: String(stderr || '') })
          )
        )
        const raw = stdout.trim() || stderr.trim()
        const version = raw.replace(/^Python\s*/i, '').trim()
        if (version && /^\d+\.\d+/.test(version))
          results.push({ label: `Python ${version}`, path: exePath.trim() })
      } catch {
        /* skip */
      }
    }

    const runCmd = async (cmd: string): Promise<string[]> => {
      try {
        const stdout = await new Promise<string>((res) =>
          exec(cmd, { timeout: 5000 }, (_err, out) => res(String(out || '')))
        )
        return stdout
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
      } catch {
        return []
      }
    }

    if (process.platform === 'win32') {
      const pyLines = await runCmd('py -0p')
      for (const line of pyLines) {
        const m = line.match(/-V:[\d.]+\s+\*?\s*(.+\.exe)/i)
        if (m) await tryExe(m[1].trim())
      }
      for (const cmd of ['where python', 'where python3']) {
        const lines = await runCmd(cmd)
        for (const line of lines) await tryExe(line)
      }
      const username = process.env['USERNAME'] ?? ''
      const localAppData = process.env['LOCALAPPDATA'] ?? `C:/Users/${username}/AppData/Local`
      const programFiles = process.env['PROGRAMFILES'] ?? 'C:/Program Files'
      for (const ver of ['313', '312', '311', '310', '39', '38']) {
        await tryExe(`${localAppData}/Programs/Python/Python${ver}/python.exe`)
        await tryExe(`${programFiles}/Python${ver}/python.exe`)
      }
    } else {
      for (const cmd of ['which python3', 'which python']) {
        const lines = await runCmd(cmd)
        for (const line of lines) await tryExe(line)
      }
      const lines = await runCmd('ls /usr/bin/python* /usr/local/bin/python* 2>/dev/null')
      for (const line of lines) await tryExe(line)
    }

    return results
  })
}
