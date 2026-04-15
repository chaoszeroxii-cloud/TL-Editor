import { ipcMain, app } from 'electron'
import { existsSync } from 'fs'
import fs from 'fs'
import { exec } from 'child_process'
import * as dotenv from 'dotenv'
import * as path from 'path'

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

// ─── Config path ──────────────────────────────────────────────────────────────

export function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
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
  ipcMain.handle('get-env-config', () => {
    const cfg = loadConfig()
    return {
      folderPath: cfg.folderPath ?? null,
      pythonExe: cfg.pythonExe ?? null,
      pythonScript: cfg.pythonScript ?? null,
      pythonCwd: cfg.pythonCwd ?? null,
      jsonPaths: cfg.jsonPaths ?? [],
      hasConfig: existsSync(getConfigPath()),
      aiApiKey: cfg.aiApiKey ?? '',
      aiPromptPath: cfg.aiPromptPath ?? '',
      aiGlossaryPath: cfg.aiGlossaryPath ?? '',
      // TTS fields
      ttsApiUrl: cfg.ttsApiUrl ?? 'https://novelttsapi.onrender.com',
      ttsApiKey: cfg.ttsApiKey ?? '',
      ttsVoiceGender: cfg.ttsVoiceGender ?? 'Female',
      ttsVoiceName: cfg.ttsVoiceName ?? '',
      ttsRate: cfg.ttsRate ?? '+35%',
      ttsOutputPath: cfg.ttsOutputPath ?? ''
    }
  })

  ipcMain.handle('save-config', async (_e, cfg: AppConfig) => {
    fs.writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8')
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
