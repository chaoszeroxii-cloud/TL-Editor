import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  getEnvConfig: () => ipcRenderer.invoke('get-env-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  detectPython: () => ipcRenderer.invoke('detect-python'),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  on: (channel: string, cb: (...args: any[]) => void) => ipcRenderer.on(channel, cb),
  off: (channel: string, cb: (...args: any[]) => void) => ipcRenderer.removeListener(channel, cb),
  readTree: (dirPath: string) => ipcRenderer.invoke('fs:readTree', dirPath),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  translate: (text: string) => ipcRenderer.invoke('translate', text),
  readAudioBuffer: (filePath: string) => ipcRenderer.invoke('fs:readAudioBuffer', filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),
  moveFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('move-file', oldPath, newPath),
  saveFile: (defaultName: string, content: string) =>
    ipcRenderer.invoke('fs:saveFile', defaultName, content),
  runCommand: (cmd: string, cwd?: string) => ipcRenderer.invoke('run-command', cmd, cwd),
  runPython: (code: string, cwd?: string) => ipcRenderer.invoke('run-python', code, cwd),
  readGlossary: (dirPath: string) => ipcRenderer.invoke('fs:readGlossary', dirPath),
  getPairedPath: (srcPath: string) => ipcRenderer.invoke('fs:getPairedPath', srcPath),
  openrouterChat: (opts) => ipcRenderer.invoke('openrouter-chat', opts),
  openFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('open-file', filters),
  tts: (text: string, voice?: string) => ipcRenderer.invoke('tts', text, voice)
})
