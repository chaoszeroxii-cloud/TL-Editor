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

// Female voice tone configurations
const TONE_CONFIGS_FEMALE: Record<string, ToneConfig> = {
  normal: {
    tone_name: 'normal',
    pitch_hz: '+0Hz',
    rate_pct: '+35%',
    volume_pct: '+10%'
  },
  // normal: {
  //   tone_name: 'normal',
  //   pitch_hz: '-5Hz',
  //   rate_pct: '+35%',
  //   volume_pct: '+10%'
  // },
  angry: {
    tone_name: 'angry',
    pitch_hz: '+5Hz',
    rate_pct: '+30%',
    volume_pct: '+100%'
  },
  whisper: {
    tone_name: 'whisper',
    pitch_hz: '-8Hz',
    rate_pct: '+10%',
    volume_pct: '-25%'
  },
  sad: {
    tone_name: 'sad',
    pitch_hz: '-12Hz',
    rate_pct: '+15%',
    volume_pct: '-5%'
  },
  excited: {
    tone_name: 'excited',
    pitch_hz: '+10Hz',
    rate_pct: '+50%',
    volume_pct: '+20%'
  },
  fearful: {
    tone_name: 'fearful',
    pitch_hz: '+3Hz',
    rate_pct: '+45%',
    volume_pct: '-10%'
  },
  serious: {
    tone_name: 'serious',
    pitch_hz: '-8Hz',
    rate_pct: '+20%',
    volume_pct: '+10%'
  },
  cold: {
    tone_name: 'cold',
    pitch_hz: '-15Hz',
    rate_pct: '+15%',
    volume_pct: '-5%'
  }
}

// Male voice tone configurations
const TONE_CONFIGS_MALE: Record<string, ToneConfig> = {
  normal: {
    tone_name: 'normal',
    pitch_hz: '-8Hz',
    rate_pct: '+25%',
    volume_pct: '+5%'
  },
  angry: {
    tone_name: 'angry',
    pitch_hz: '+5Hz',
    rate_pct: '+15%',
    volume_pct: '+25%'
  },
  whisper: {
    tone_name: 'whisper',
    pitch_hz: '-12Hz',
    rate_pct: '-25%',
    volume_pct: '-55%'
  },
  sad: {
    tone_name: 'sad',
    pitch_hz: '-15Hz',
    rate_pct: '-20%',
    volume_pct: '-25%'
  },
  excited: {
    tone_name: 'excited',
    pitch_hz: '+2Hz',
    rate_pct: '+20%',
    volume_pct: '+15%'
  },
  fearful: {
    tone_name: 'fearful',
    pitch_hz: '+3Hz',
    rate_pct: '+5%',
    volume_pct: '-15%'
  },
  serious: {
    tone_name: 'serious',
    pitch_hz: '-6Hz',
    rate_pct: '+8%',
    volume_pct: '+10%'
  },
  cold: {
    tone_name: 'cold',
    pitch_hz: '-14Hz',
    rate_pct: '-8%',
    volume_pct: '-12%'
  }
}

// Gender-specific tone configs
export const TONE_CONFIGS_BY_GENDER: Record<VoiceGender, Record<string, ToneConfig>> = {
  female: TONE_CONFIGS_FEMALE,
  male: TONE_CONFIGS_MALE
}

// Backward compatibility - default to female
export const TONE_CONFIGS = TONE_CONFIGS_FEMALE

// Helper function to get tone config by gender
export const getToneConfig = (toneName: string, gender: VoiceGender = 'female'): ToneConfig => {
  return TONE_CONFIGS_BY_GENDER[gender]?.[toneName] || TONE_CONFIGS_FEMALE[toneName]
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
