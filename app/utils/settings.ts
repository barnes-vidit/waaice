import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'waaice_settings';

export interface AppSettings {
  companion_url: string;
  tts_speed: number;
  stt_language: string;
  summarize_threshold: number;
  auto_resolve_threshold: number;
  digest_times: string[];
}

const defaults: AppSettings = {
  companion_url: '',
  tts_speed: 1.1,
  stt_language: 'en-IN',
  summarize_threshold: 3,
  auto_resolve_threshold: 10,
  digest_times: ['08:00', '22:00'],
};

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const current = await loadSettings();
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...current, ...settings }));
}
