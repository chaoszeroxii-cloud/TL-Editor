// Jest setup file: runs before all tests
import '@testing-library/jest-dom'

// Mock electron preload API for tests
type ElectronAPI = {
  getEnvConfig: jest.Mock<Promise<unknown>>
  saveConfigPatch: jest.Mock<Promise<void>>
  openFolder: jest.Mock<Promise<unknown>>
  readTree: jest.Mock<Promise<unknown>>
  readFile: jest.Mock<Promise<string>>
  readFileOptional: jest.Mock<Promise<string | null>>
  readImageDataUrl: jest.Mock<Promise<string>>
  translate: jest.Mock<Promise<unknown>>
  readAudioBuffer: jest.Mock<Promise<unknown>>
  writeFile: jest.Mock<Promise<void>>
  moveFile: jest.Mock<Promise<void>>
  saveFile: jest.Mock<Promise<unknown>>
  saveAudioFile: jest.Mock<Promise<unknown>>
  saveAudioBytes: jest.Mock<Promise<unknown>>
  readGlossary: jest.Mock<Promise<unknown>>
  getPairedPath: jest.Mock<Promise<unknown>>
  openrouterChat: jest.Mock<Promise<unknown>>
  openFile: jest.Mock<Promise<unknown>>
  getPathForFile: jest.Mock<string>
  approvePaths: jest.Mock<Promise<void>>
  on: jest.Mock<void>
  off: jest.Mock<void>
  tts: jest.Mock<Promise<unknown>>
  ttsStream: jest.Mock<Promise<unknown>>
  saveTtsAudio: jest.Mock<Promise<unknown>>
  cancelNetworkRequest: jest.Mock<Promise<void>>
  cancelMp3ToMp4: jest.Mock<Promise<boolean>>
  startHealthCheck: jest.Mock<Promise<void>>
  stopHealthCheck: jest.Mock<Promise<void>>
}

declare global {
  interface Window {
    electron: ElectronAPI
  }
}

window.electron = {
  getEnvConfig: jest.fn().mockResolvedValue({}),
  saveConfigPatch: jest.fn().mockResolvedValue(undefined),
  openFolder: jest.fn().mockResolvedValue(null),
  readTree: jest.fn().mockResolvedValue([]),
  readFile: jest.fn().mockResolvedValue(''),
  readFileOptional: jest.fn().mockResolvedValue(null),
  readImageDataUrl: jest.fn().mockResolvedValue(''),
  translate: jest.fn().mockResolvedValue(''),
  readAudioBuffer: jest.fn().mockResolvedValue(null),
  writeFile: jest.fn().mockResolvedValue(undefined),
  moveFile: jest.fn().mockResolvedValue(undefined),
  saveFile: jest.fn().mockResolvedValue(null),
  saveAudioFile: jest.fn().mockResolvedValue(null),
  saveAudioBytes: jest.fn().mockResolvedValue(null),
  readGlossary: jest.fn().mockResolvedValue([]),
  getPairedPath: jest.fn().mockResolvedValue(''),
  openrouterChat: jest.fn().mockResolvedValue(null),
  openFile: jest.fn().mockResolvedValue(null),
  getPathForFile: jest.fn().mockReturnValue(''),
  approvePaths: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  off: jest.fn(),
  tts: jest.fn().mockResolvedValue(''),
  ttsStream: jest.fn().mockResolvedValue(''),
  saveTtsAudio: jest.fn().mockResolvedValue(null),
  cancelNetworkRequest: jest.fn().mockResolvedValue(undefined),
  cancelMp3ToMp4: jest.fn().mockResolvedValue(true),
  startHealthCheck: jest.fn().mockResolvedValue(undefined),
  stopHealthCheck: jest.fn().mockResolvedValue(undefined)
} as ElectronAPI
