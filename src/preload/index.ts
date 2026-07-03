import { contextBridge, ipcRenderer, webUtils } from 'electron'

const eventChannels = new Set([
  'mp3-to-mp4:progress',
  'tts:progress',
  'openrouter-stream-chunk',
  'openrouter-stream-reasoning',
  'openrouter-stream-toolargs',
  'merge-audio:progress',
  'youtube:progress',
  'menu:refresh'
])

contextBridge.exposeInMainWorld('electron', {
  getEnvConfig: () => ipcRenderer.invoke('get-env-config'),
  saveConfigPatch: (patch: unknown) => ipcRenderer.invoke('save-config-patch', patch),
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readTree: (dirPath: string, options?: { force?: boolean }) =>
    ipcRenderer.invoke('fs:readTree', dirPath, options),
  readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
  readFileOptional: (filePath: string) => ipcRenderer.invoke('fs:readFileOptional', filePath),
  readImageDataUrl: (filePath: string) => ipcRenderer.invoke('fs:readImageDataUrl', filePath),
  translate: (text: string) => ipcRenderer.invoke('translate', text),
  readAudioBuffer: (filePath: string) => ipcRenderer.invoke('fs:readAudioBuffer', filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:writeFile', filePath, content),
  writeFileEnsureDir: (filePath: string, content: string) =>
    ipcRenderer.invoke('fs:writeFileEnsureDir', filePath, content),
  listDir: (dirPath: string) => ipcRenderer.invoke('fs:listDir', dirPath),
  deleteFile: (filePath: string) => ipcRenderer.invoke('fs:deleteFile', filePath),
  moveFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('move-file', oldPath, newPath),
  saveFile: (defaultName: string, content: string) =>
    ipcRenderer.invoke('fs:saveFile', defaultName, content),
  // Save binary audio file (MP3 base64 → disk)
  // If outputDir is given → auto-save there; otherwise shows Save dialog.
  // Returns saved file path, or null if cancelled.
  saveAudioFile: (base64: string, defaultName: string, outputDir?: string) =>
    ipcRenderer.invoke('fs:saveAudioFile', base64, defaultName, outputDir),
  saveAudioBytes: (bytes: Uint8Array, defaultName: string, outputDir?: string) =>
    ipcRenderer.invoke('fs:saveAudioBytes', Array.from(bytes), defaultName, outputDir),
  readGlossary: (dirPath: string) => ipcRenderer.invoke('fs:readGlossary', dirPath),
  getPairedPath: (srcPath: string) => ipcRenderer.invoke('fs:getPairedPath', srcPath),
  openrouterChat: (opts: Record<string, unknown>) => ipcRenderer.invoke('openrouter-chat', opts),
  openFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('open-file', filters),
  openFiles: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('open-files', filters),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  approvePaths: (paths: string[]) => ipcRenderer.invoke('approve-paths', paths),
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    if (!eventChannels.has(channel)) throw new Error(`Unsupported event channel: ${channel}`)
    ipcRenderer.on(channel, cb)
  },
  off: (channel: string, cb: (...args: unknown[]) => void) => {
    if (!eventChannels.has(channel)) return
    ipcRenderer.removeListener(channel, cb)
  },
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
  convertMp3ToMp4: (opts: {
    imagePath: string
    audioPaths: string[]
    outputDir?: string
    filenamePrefix?: string
    ffmpegPath?: string
    useGpu?: boolean
    burnSubtitles?: boolean
    subtitleOrientation?: 'landscape' | 'vertical'
  }) => ipcRenderer.invoke('convert-mp3-to-mp4', opts),
  cancelMp3ToMp4: () => ipcRenderer.invoke('cancel-mp3-to-mp4'),
  concatMp3s: (audioBase64Array: string[]) => ipcRenderer.invoke('concat-mp3s', audioBase64Array),

  // Shorts (vertical 9:16 clips cut from a chapter's Smart-Gen timeline)
  listTimelineMp3s: (dir: string) => ipcRenderer.invoke('list-timeline-mp3s', dir),
  readMp3Timeline: (mp3Path: string) => ipcRenderer.invoke('read-mp3-timeline', mp3Path),
  createShortClip: (opts: {
    mp3Path: string
    imagePath: string
    startSec: number
    endSec: number
    ctaText?: string
    outputDir: string
    ffmpegPath?: string
    useGpu?: boolean
  }) => ipcRenderer.invoke('create-short-clip', opts),
  cancelShortClip: () => ipcRenderer.invoke('cancel-short-clip'),
  mergeEpisodeAudio: (opts: {
    sourceDir: string
    fromEp: number
    toEp: number
    batchSize: number
    prefix: string
    outputDir: string
  }) => ipcRenderer.invoke('merge-episode-audio', opts),
  cancelMergeAudio: () => ipcRenderer.invoke('cancel-merge-audio'),

  // ReadRealm Publisher
  readrealmSaveCredentials: (opts: { username: string; password: string }) =>
    ipcRenderer.invoke('readrealm-save-credentials', opts),
  readrealmGetToken: () => ipcRenderer.invoke('readrealm-get-token'),
  readrealmGetNovels: () => ipcRenderer.invoke('readrealm-get-novels'),
  readrealmGetChapters: (opts: { novelId: string }) =>
    ipcRenderer.invoke('readrealm-get-chapters', opts),
  readrealmUploadChapter: (opts: {
    novelId: string
    chapterId: string
    title: string
    content: string
    price: number
    publishDatetime: string
    note: string
  }) => ipcRenderer.invoke('readrealm-upload-chapter', opts),

  // YouTube Publisher
  youtubeSaveSecret: (opts: { clientSecret: string }) =>
    ipcRenderer.invoke('youtube-save-secret', opts),
  youtubeConnect: () => ipcRenderer.invoke('youtube-connect'),
  youtubeStatus: () => ipcRenderer.invoke('youtube-status'),
  youtubeDisconnect: () => ipcRenderer.invoke('youtube-disconnect'),
  youtubeListPlaylists: () => ipcRenderer.invoke('youtube-list-playlists'),
  youtubeListUploaded: () => ipcRenderer.invoke('youtube-list-uploaded'),
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
  }) => ipcRenderer.invoke('youtube-upload-video', opts),
  cancelYoutubeUpload: () => ipcRenderer.invoke('cancel-youtube-upload'),

  // Visual-novel image assets
  imageGenerate: (opts: {
    novelDir: string
    kind: 'background' | 'character'
    subject: string
    name?: string
    glossarySrc?: string
    force?: boolean
  }) => ipcRenderer.invoke('image:generate', opts),
  imageEdit: (opts: { novelDir: string; sourceId: string; instruction: string; name?: string }) =>
    ipcRenderer.invoke('image:edit', opts),
  imageListAssets: (novelDir: string) => ipcRenderer.invoke('image:list-assets', novelDir),
  imageDeleteAsset: (novelDir: string, id: string) =>
    ipcRenderer.invoke('image:delete-asset', novelDir, id),
  imageBindCharacter: (novelDir: string, id: string, glossarySrc: string) =>
    ipcRenderer.invoke('image:bind-character', novelDir, id, glossarySrc),

  // Image bridge (chatgpt-api sidecar) lifecycle + account captures
  bridgeStatus: () => ipcRenderer.invoke('bridge:status'),
  bridgeStart: () => ipcRenderer.invoke('bridge:start'),
  bridgeStop: () => ipcRenderer.invoke('bridge:stop'),
  bridgeListAccounts: () => ipcRenderer.invoke('bridge:list-accounts'),
  bridgeAddCapture: (account: string, rawText: string) =>
    ipcRenderer.invoke('bridge:add-capture', account, rawText),
  bridgeVerifyAccount: (account: string) => ipcRenderer.invoke('bridge:verify-account', account),
  bridgeDeleteAccount: (account: string) => ipcRenderer.invoke('bridge:delete-account', account)
})
