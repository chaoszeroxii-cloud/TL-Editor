import { contextBridge, ipcRenderer, webUtils } from 'electron'

const eventChannels = new Set(['run-command:stdout', 'run-command:stderr'])

contextBridge.exposeInMainWorld('electron', {
  getEnvConfig: () => ipcRenderer.invoke('get-env-config'),
  saveConfig: (cfg: unknown) => ipcRenderer.invoke('save-config', cfg),
  saveConfigPatch: (patch: unknown) => ipcRenderer.invoke('save-config-patch', patch),
  detectPython: () => ipcRenderer.invoke('detect-python'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    if (!eventChannels.has(channel)) throw new Error(`Unsupported event channel: ${channel}`)
    ipcRenderer.on(channel, cb)
  },
  off: (channel: string, cb: (...args: unknown[]) => void) => {
    if (!eventChannels.has(channel)) return
    ipcRenderer.removeListener(channel, cb)
  },
  readTree: (dirPath: string, options?: { force?: boolean }) =>
    ipcRenderer.invoke('fs:readTree', dirPath, options),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  readFileOptional: (filePath: string) => ipcRenderer.invoke('fs:readFileOptional', filePath),
  readImageDataUrl: (filePath: string) => ipcRenderer.invoke('fs:readImageDataUrl', filePath),
  translate: (text: string) => ipcRenderer.invoke('translate', text),
  readAudioBuffer: (filePath: string) => ipcRenderer.invoke('fs:readAudioBuffer', filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),
  moveFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('move-file', oldPath, newPath),
  saveFile: (defaultName: string, content: string) =>
    ipcRenderer.invoke('fs:saveFile', defaultName, content),
  // Save binary audio file (MP3 base64 → disk)
  // If outputDir is given → auto-save there; otherwise shows Save dialog.
  // Returns saved file path, or null if cancelled.
  saveAudioFile: (base64: string, defaultName: string, outputDir?: string) =>
    ipcRenderer.invoke('fs:saveAudioFile', base64, defaultName, outputDir),
  runCommand: (cmd: string, cwd?: string) => ipcRenderer.invoke('run-command', cmd, cwd),
  killProcess: () => ipcRenderer.invoke('kill-process'),
  installPythonPackages: (exePath: string, packages: string[]) =>
    ipcRenderer.invoke('install-python-packages', exePath, packages),
  runPython: (code: string, cwd?: string) => ipcRenderer.invoke('run-python', code, cwd),
  readGlossary: (dirPath: string) => ipcRenderer.invoke('fs:readGlossary', dirPath),
  getPairedPath: (srcPath: string) => ipcRenderer.invoke('fs:getPairedPath', srcPath),
  openrouterChat: (opts: Record<string, unknown>) => ipcRenderer.invoke('openrouter-chat', opts),
  openFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('open-file', filters),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  approvePaths: (paths: string[]) => ipcRenderer.invoke('approve-paths', paths),
  // Updated: accepts options object for Novel TTS API instead of voice string
  tts: (
    text: string,
    options?: {
      apiUrl?: string
      apiKey?: string
      voiceGender?: string
      voiceName?: string
      rate?: string
      bf_lib?: Record<string, string>
      at_lib?: Record<string, string>
    }
  ) => ipcRenderer.invoke('tts', text, options),
  // Novel TTS API streaming endpoint
  ttsStream: (
    text: string,
    options?: {
      apiUrl?: string
      apiKey?: string
      voiceGender?: string
      voiceName?: string
      rate?: string
      bf_lib?: Record<string, string>
      at_lib?: Record<string, string>
    }
  ) => ipcRenderer.invoke('tts-stream', text, options),
  // Save TTS audio to file
  saveTtsAudio: (base64: string, filename: string, outputDir: string) =>
    ipcRenderer.invoke('saveTtsAudio', base64, filename, outputDir),
  // Cancel in-flight network request by ID
  cancelNetworkRequest: (requestId: string) =>
    ipcRenderer.invoke('cancel-network-request', requestId),
  // Health check handlers for TTS API (keep-alive)
  startHealthCheck: (config?: { enabled?: boolean; intervalMs?: number; apiUrl?: string }) =>
    ipcRenderer.invoke('start-health-check', config),
  stopHealthCheck: () => ipcRenderer.invoke('stop-health-check'),
  // MP3 → MP4 conversion (static cover image + audio)
  convertMp3ToMp4: (
    opts: {
      imagePath: string
      audioPaths: string[]
      outputDir?: string
      ffmpegPath?: string
    }
  ) => ipcRenderer.invoke('convert-mp3-to-mp4', opts)
})
