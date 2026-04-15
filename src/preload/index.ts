import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  getEnvConfig: () => ipcRenderer.invoke('get-env-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  detectPython: () => ipcRenderer.invoke('detect-python'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  on: (channel: string, cb: (...args: unknown[]) => void) => ipcRenderer.on(channel, cb),
  off: (channel: string, cb: (...args: unknown[]) => void) =>
    ipcRenderer.removeListener(channel, cb),
  readTree: (dirPath: string) => ipcRenderer.invoke('fs:readTree', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  readFileOptional: (filePath: string) => ipcRenderer.invoke('fs:readFileOptional', filePath),
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
  runPython: (code: string, cwd?: string) => ipcRenderer.invoke('run-python', code, cwd),
  readGlossary: (dirPath: string) => ipcRenderer.invoke('fs:readGlossary', dirPath),
  getPairedPath: (srcPath: string) => ipcRenderer.invoke('fs:getPairedPath', srcPath),
  openrouterChat: (opts: Record<string, unknown>) => ipcRenderer.invoke('openrouter-chat', opts),
  openFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('open-file', filters),
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
    ipcRenderer.invoke('saveTtsAudio', base64, filename, outputDir)
})
