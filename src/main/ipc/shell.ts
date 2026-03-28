import { ipcMain, BrowserWindow } from 'electron'
import { exec, ExecOptions, spawn } from 'child_process'

// ─── Active process registry (for kill support) ───────────────────────────────

let _activeProc: ReturnType<typeof spawn> | null = null

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface ExecOpts extends Omit<ExecOptions, 'shell'> {
  shell?: boolean | string
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

// ─── IPC handlers ─────────────────────────────────────────────────────────────

export function registerShellHandlers(): void {
  /** Spawns a shell command; streams stdout/stderr to renderer in real-time */
  ipcMain.handle('run-command', (_e, cmd: string, cwd?: string) => {
    return new Promise<{ stdout: string; stderr: string; exitCode: number }>((resolve) => {
      const proc = spawn(cmd, [], { cwd: cwd ?? undefined, shell: true, timeout: 30 * 60_000 })
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

  /** Runs a Python snippet via a temp file (avoids shell-quoting issues on all platforms) */
  ipcMain.handle('run-python', async (_e, code: string, cwd?: string) => {
    const os = await import('os')
    const { writeFile: wf, unlink } = await import('fs/promises')
    const { join: pjoin } = await import('path')
    const tmpFile = pjoin(os.tmpdir(), `tl_editor_run_${Date.now()}.py`)
    try {
      await wf(tmpFile, code, 'utf-8')
      const pyExe = process.platform === 'win32' ? 'python' : 'python3'
      const fallbackExe = process.platform === 'win32' ? null : 'python'
      const runOne = async (
        exe: string
      ): Promise<{ stdout: string; stderr: string; exitCode: number }> => {
        try {
          const { stdout, stderr } = await execAsync(`"${exe}" "${tmpFile}"`, {
            cwd: cwd ?? undefined,
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
      unlink(tmpFile).catch(() => {})
    }
  })
}
