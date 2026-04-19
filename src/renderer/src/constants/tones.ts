/**
 * Tone Configuration Constants
 * ใช้ร่วมระหว่าง Editor UI และ TTS generation
 */

export interface ToneConfig {
  tone_name: string
  pitch_hz: string
  rate_pct: string
  volume_pct: string
}

export const TONE_CONFIGS: Record<string, ToneConfig> = {
  normal: {
    tone_name: 'normal',
    pitch_hz: '-5Hz',
    rate_pct: '+35%',
    volume_pct: '+10%'
  },
  angry: {
    tone_name: 'angry',
    pitch_hz: '+20Hz',
    rate_pct: '+15%',
    volume_pct: '+30%'
  },
  whisper: {
    tone_name: 'whisper',
    pitch_hz: '-5Hz',
    rate_pct: '-15%',
    volume_pct: '-50%'
  },
  sad: {
    tone_name: 'sad',
    pitch_hz: '-10Hz',
    rate_pct: '-20%',
    volume_pct: '-20%'
  },
  excited: {
    tone_name: 'excited',
    pitch_hz: '+12Hz',
    rate_pct: '+15%',
    volume_pct: '+10%'
  },
  fearful: {
    tone_name: 'fearful',
    pitch_hz: '+10Hz',
    rate_pct: '+5%',
    volume_pct: '-10%'
  },
  serious: {
    tone_name: 'serious',
    pitch_hz: '-6Hz',
    rate_pct: '+5%',
    volume_pct: '+10%'
  },
  cold: {
    tone_name: 'cold',
    pitch_hz: '-12Hz',
    rate_pct: '-7%',
    volume_pct: '-10%'
  }
}

export const TONE_LABELS: Record<string, string> = {
  normal: 'ปกติ',
  angry: 'โกรธ / ตะคอก',
  whisper: 'กระซิบ / ลับลมคมใน',
  sad: 'เศร้า / ท้อแท้',
  excited: 'ตื่นเต้น / ร่าเริง',
  fearful: 'กลัว / ตัวสั่น',
  serious: 'จริงจัง',
  cold: 'เย็นชา'
}

export const TONE_ORDER = [
  'normal',
  'angry',
  'whisper',
  'sad',
  'excited',
  'fearful',
  'serious',
  'cold'
] as const

export type ToneName = (typeof TONE_ORDER)[number]

// ─── Voice Gender ──────────────────────────────────────────────────────────
export const VOICE_GENDERS = ['female', 'male'] as const
export type VoiceGender = (typeof VOICE_GENDERS)[number]

export const VOICE_GENDER_LABELS: Record<VoiceGender, string> = {
  female: 'หญิง',
  male: 'ชาย'
}
