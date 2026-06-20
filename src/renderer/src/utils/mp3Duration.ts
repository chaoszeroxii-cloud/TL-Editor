// ─── mp3Duration.ts ──────────────────────────────────────────────────────────
// Compute an MP3's playback duration (seconds) by summing its frame durations
// straight from the frame headers — no Web Audio / decodeAudioData.
//
// Why header-parsing and not the browser decoder: the target machine is RAM-
// constrained and has a history of audio-decode buffers leaking outside the JS
// heap (see project_renderer_ram_leak). Smart Gen measures dozens of per-line
// segments per chapter; decoding each to PCM just to read `.duration` would be
// wasteful and risky. Scanning frame headers is allocation-free and exact for
// the constant-bitrate MP3s edge-tts produces (and correct for VBR too, since
// every frame is counted individually).
//
// Frame durations are summed, so for a stream-copy concat (ffmpeg `-c copy`)
// the cumulative segment durations line up exactly with the merged file.

// Bitrate tables (kbps), indexed by the 4-bit bitrate field (1..14 valid).
// MPEG1 Layer III:
const BR_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
// MPEG2 / MPEG2.5 Layer III:
const BR_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]

// Sample-rate tables (Hz), indexed by the 2-bit sample-rate field (0..2 valid),
// keyed by the 2-bit MPEG version field.
const SR: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG1
  2: [22050, 24000, 16000], // MPEG2
  0: [11025, 12000, 8000] // MPEG2.5
}

/** Read a 28-bit synchsafe integer (used by ID3v2 tag size). */
function synchsafe(b: Uint8Array, off: number): number {
  return (b[off] << 21) | (b[off + 1] << 14) | (b[off + 2] << 7) | b[off + 3]
}

/**
 * Sum of MP3 frame durations in seconds. Returns 0 if no valid frames are found
 * (e.g. the bytes are not an MP3) so callers can fall back gracefully.
 */
export function mp3DurationSec(bytes: Uint8Array): number {
  const len = bytes.length
  let i = 0

  // Skip a leading ID3v2 tag if present ("ID3" + 6 header bytes + synchsafe size).
  if (len > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    i = 10 + synchsafe(bytes, 6)
  }

  let totalSamples = 0
  let sampleRate = 0

  while (i + 4 <= len) {
    // Frame sync: 11 set bits (0xFF, then top 3 bits of the next byte).
    if (bytes[i] !== 0xff || (bytes[i + 1] & 0xe0) !== 0xe0) {
      i++
      continue
    }
    const versionBits = (bytes[i + 1] >> 3) & 0x03 // 0=2.5, 1=reserved, 2=v2, 3=v1
    const layerBits = (bytes[i + 1] >> 1) & 0x03 // 1 = Layer III
    if (versionBits === 1 || layerBits !== 1) {
      i++
      continue
    }
    const bitrateIdx = (bytes[i + 2] >> 4) & 0x0f
    const sampleRateIdx = (bytes[i + 2] >> 2) & 0x03
    const padding = (bytes[i + 2] >> 1) & 0x01
    if (bitrateIdx === 0 || bitrateIdx === 15 || sampleRateIdx === 3) {
      i++
      continue
    }

    const isV1 = versionBits === 3
    const bitrate = (isV1 ? BR_V1_L3[bitrateIdx] : BR_V2_L3[bitrateIdx]) * 1000
    const sr = SR[versionBits][sampleRateIdx]
    const samplesPerFrame = isV1 ? 1152 : 576
    // Layer III frame length in bytes.
    const frameLen = Math.floor(((samplesPerFrame / 8) * bitrate) / sr) + padding
    if (frameLen <= 0) {
      i++
      continue
    }

    totalSamples += samplesPerFrame
    sampleRate = sr
    i += frameLen
  }

  return sampleRate > 0 ? totalSamples / sampleRate : 0
}

/** Decode a base64 string to a byte array (renderer-side, no Buffer). */
export function base64ToUint8(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
