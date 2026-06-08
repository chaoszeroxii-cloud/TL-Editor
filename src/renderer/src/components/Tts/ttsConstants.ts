// Separate file to avoid Fast Refresh issues with exported constants + shared types.

// ─── Types ─────────────────────────────────────────────────────────────────────
// TtsApiConfig lives here (not in a component file) so non-component modules
// (useAppStore, useTtsGen) can import it without pulling in a React component.

export interface TtsApiConfig {
  apiUrl: string
  apiKey: string
  voiceGender: string
  voiceName: string
  rate: string
  outputPath: string
  useStreaming?: boolean
  playbackVolume?: number
}

export const DEFAULT_TTS_CONFIG: TtsApiConfig = {
  apiUrl: 'https://novelttsapi-0mv2.onrender.com',
  apiKey: '',
  voiceGender: 'female',
  voiceName: '',
  rate: '+35%',
  outputPath: '',
  useStreaming: true,
  playbackVolume: 0.7
}
