// Separate file to avoid Fast Refresh issues with exported constants
import type { TtsApiConfig } from './TTSApiTab'

export const DEFAULT_TTS_CONFIG: TtsApiConfig = {
  apiUrl: 'https://novelttsapi.onrender.com',
  apiKey: '',
  voiceGender: 'Female',
  voiceName: '',
  rate: '+35%',
  outputPath: '',
  useStreaming: true
}
