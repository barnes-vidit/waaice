import { useCallback, useRef } from 'react';
import * as Speech from 'expo-speech';
import { loadSettings } from '../utils/settings';

export function useTTS() {
  const speakingRef = useRef(false);

  const speak = useCallback(async (text: string): Promise<void> => {
    const settings = await loadSettings();

    // BUG-11: wrap in try/finally so speakingRef is always reset even if
    // Speech.speak() throws synchronously before any callback fires.
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

  const isSpeaking = () => speakingRef.current;

  return { speak, stop, isSpeaking };
}
