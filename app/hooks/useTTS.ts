import { useCallback, useRef, useEffect } from 'react';
import * as Speech from 'expo-speech';
import { loadSettings } from '../utils/settings';
import type { AppSettings } from '../utils/settings';

export function useTTS() {
  const speakingRef = useRef(false);
  // T1: cache settings so loadSettings() isn't called on every speak() invocation
  const settingsRef = useRef<AppSettings | null>(null);

  useEffect(() => {
    loadSettings().then((s) => { settingsRef.current = s; });
  }, []);

  const speak = useCallback(async (text: string): Promise<void> => {
    // Use cached settings; fall back to a fresh load if cache isn't ready yet
    const settings = settingsRef.current ?? await loadSettings();

    return new Promise((resolve) => {
      try {
        speakingRef.current = true;
        Speech.speak(text, {
          language: settings.stt_language,
          rate: settings.tts_speed,
          onDone: () => {
            speakingRef.current = false;
            resolve();
          },
          onError: () => {
            speakingRef.current = false;
            resolve();
          },
          onStopped: () => {
            speakingRef.current = false;
            resolve();
          },
        });
      } catch {
        speakingRef.current = false;
        resolve();
      }
    });
  }, []);

  const stop = useCallback(() => {
    Speech.stop();
    speakingRef.current = false;
  }, []);

  // Call this when settings are saved so the cache is refreshed immediately
  const reloadSettings = useCallback(() => {
    loadSettings().then((s) => { settingsRef.current = s; });
  }, []);

  const isSpeaking = () => speakingRef.current;

  return { speak, stop, isSpeaking, reloadSettings };
}
