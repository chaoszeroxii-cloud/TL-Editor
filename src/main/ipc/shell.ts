import { ipcMain, BrowserWindow } from 'electron'
import { exec, ExecOptions, spawn } from 'child_process'
import { assertPathAllowed } from './pathAccess'

// ─── Active process registry (for kill support) ───────────────────────────────

let _activeProc: ReturnType<typeof spawn> | null = null

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ExecOpts extends Omit<ExecOptions, 'shell'> {
  shell?: boolean | string
}

interface ProcessResult {
  stdout: string
  stderr: string
  exitCode: number
}

function execAsync(cmd: string, options?: ExecOpts): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    exec(cmd, (options ?? {}) as ExecOptions, (err, stdout, stderr) => {
      if (err) {
        const e = err as Error & { stdout?: string; stderr?: string }
        e.stdout = String(stdout)
        e.stderr = String(stderr)
        reject(e)
      } else {
        resolve({ stdout: String(stdout), stderr: String(stderr) })
      }
    })
  })
}

function collectSpawnOutput(proc: ReturnType<typeof spawn>): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('close', (code) => {
      _activeProc = null
      resolve({ stdout, stderr, exitCode: code ?? 0 })
    })

    proc.on('error', (err) => {
      _activeProc = null
      resolve({ stdout, stderr: err.message, exitCode: 1 })
    })
  })
}

function assertSafePackageName(pkg: string): string {
  const normalized = pkg.trim()
  if (!normalized || !/^[A-Za-z0-9._-]+$/.test(normalized)) {
    throw new Error(`Invalid package name: ${pkg}`)
  }
  return normalized
}

// ─── Command whitelist (security) ─────────────────────────────────────────────
// Only these commands are allowed to be executed via run-command
const ALLOWED_COMMANDS = new Set(['node', 'npm', 'python', 'python3', 'bash', 'sh'])

function validateCommand(cmd: string): boolean {
  // Extract the command name (first token before any whitespace or path separator)
  const cmdName = cmd.trim().split(/[\s/\\]+/)[0]
  const baseName = cmdName.split(/[\\/]/).pop()?.toLowerCase() ?? ''
  return ALLOWED_COMMANDS.has(baseName)
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

export function registerShellHandlers(): void {
  /** Spawns a shell command; streams stdout/stderr to renderer in real-time */
  ipcMain.handle('run-command', (_e, cmd: string, cwd?: string) => {
    return new Promise<ProcessResult>((resolve) => {
      // Security: validate command against whitelist
      if (!validateCommand(cmd)) {
        const cmdName = cmd.trim().split(/[\s/\\]+/)[0]
        return resolve({
          stdout: '',
          stderr: `Error: Command '${cmdName}' is not allowed. Allowed commands: ${Array.from(ALLOWED_COMMANDS).join(', ')}`,
          exitCode: 1
        })
      }

      const approvedCwd = cwd ? assertPathAllowed(cwd) : undefined
      const proc = spawn(cmd, [], { cwd: approvedCwd, shell: true, timeout: 30 * 60_000 })
      _activeProc = proc

      let stdout = ''
      let stderr = ''

      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        stdout += text
        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) w.webContents.send('run-command:stdout', text)
        })
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString()
        stderr += text
        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) w.webContents.send('run-command:stderr', text)
        })
      })

      proc.on('close', (code) => {
        _activeProc = null
        resolve({ stdout, stderr, exitCode: code ?? 0 })
      })
      proc.on('error', (err) => {
        _activeProc = null
        resolve({ stdout, stderr: err.message, exitCode: 1 })
      })
    })
  })

  ipcMain.handle('kill-process', () => {
    if (_activeProc) {
      _activeProc.kill()
      _activeProc = null
    }
  })

  /** Securely delete a file by overwriting with random data before unlinking */
  async function secureDelete(filePath: string): Promise<void> {
    const fs = await import('fs/promises')
    try {
      const stat = await fs.stat(filePath)
      // Overwrite with random data to prevent recovery
      const buffer = Buffer.alloc(Math.min(stat.size, 1024 * 1024)) // Max 1MB chunks
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] = Math.random() * 256
      }
      const fd = await fs.open(filePath, 'r+')
      let offset = 0
      while (offset < stat.size) {
        const toWrite = Math.min(buffer.length, stat.size - offset)
        await fd.write(buffer, 0, toWrite, offset)
        offset += toWrite
      }
      await fd.close()
    } catch {
      // Ignore errors during overwrite
    }
    // Then unlink
    try {
      await fs.unlink(filePath)
    } catch {
      // Ignore unlink errors
    }
  }

  ipcMain.handle('install-python-packages', async (_e, exePath: string, packages: string[]) => {
    const approvedExe = assertPathAllowed(exePath)
    const safePackages = packages.map(assertSafePackageName)
    const proc = spawn(approvedExe, ['-m', 'pip', 'install', '--upgrade', ...safePackages], {
      shell: false,
      windowsHide: true,
      timeout: 10 * 60_000
    })
    _activeProc = proc
    return collectSpawnOutput(proc)
  })

  /** Runs a Python snippet via a temp file (avoids shell-quoting issues on all platforms) */
  ipcMain.handle('run-python', async (_e, code: string, cwd?: string) => {
    const os = await import('os')
    const { writeFile: wf } = await import('fs/promises')
    const { join: pjoin } = await import('path')
    const tmpFile = pjoin(os.tmpdir(), `tl_editor_run_${Date.now()}.py`)
    try {
      // Write with restricted permissions (owner read/write only, 0o600)
      // This prevents other users from reading the temporary Python script
      await wf(tmpFile, code, { encoding: 'utf-8', mode: 0o600 })
      const pyExe = process.platform === 'win32' ? 'python' : 'python3'
      const fallbackExe = process.platform === 'win32' ? null : 'python'
      const runOne = async (
        exe: string
      ): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
        try {
          const { stdout, stderr } = await execAsync(`"${exe}" "${tmpFile}"`, {
            cwd: cwd ? assertPathAllowed(cwd) : undefined,
            timeout: 30_000,
            maxBuffer: 1024 * 512,
            shell: true
          })
          return { stdout, stderr, exitCode: 0 }
        } catch (err: unknown) {
          return {
            stdout: (err as { stdout?: string }).stdout ?? '',
            stderr:
              (err as { stderr?: string }).stderr ??
              (err as { message?: string }).message ??
              String(err),
            exitCode: (err as { code?: number }).code ?? 1
          }
        }
      }
      const result = await runOne(pyExe)
      if (result.exitCode !== 0 && fallbackExe) {
        const fb = await runOne(fallbackExe)
        if (fb.exitCode === 0) return fb
      }
      return result
    } finally {
      // Securely delete the temp file by overwriting before unlinking
      await secureDelete(tmpFile)
    }
  })
}
