import { useState, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { Audio } from 'expo-av';
import { loadSettings } from '../utils/settings';

export type STTState = 'idle' | 'recording' | 'processing' | 'error';

interface UseSTTResult {
  state: STTState;
  transcript: string;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string>;
  reset: () => void;
  error: string | null;
}

export function useSTT(): UseSTTResult {
  const [state, setState] = useState<STTState>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);

  const startRecording = useCallback(async () => {
    // expo-av Audio.Recording is not supported on web
    if (Platform.OS === 'web') {
      setState('error');
      setError('Voice recording is not supported in the browser.');
      return;
    }
    try {
      setError(null);
      setTranscript('');

      // BUG-05: request permission BEFORE announcing 'recording' state
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) throw new Error('Microphone permission denied');

      setState('recording');

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
    } catch (err: any) {
      setState('error');
      setError(err.message);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string> => {
    if (!recordingRef.current) return '';
    try {
      setState('processing');
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;

      if (!uri) throw new Error('No recording URI');

      const settings = await loadSettings();
      // BUG-06: pass companionUrl so transcribeAudio doesn't need its own loadSettings()
      const result = await transcribeAudio(uri, settings.stt_language, settings.companion_url);
      setTranscript(result);
      setState('idle');
      return result;
    } catch (err: any) {
      setState('error');
      setError(err.message);
      return '';
    }
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setTranscript('');
    setError(null);
  }, []);

  return { state, transcript, startRecording, stopRecording, reset, error };
}

// BUG-06: accept companionUrl directly — stopRecording already loaded settings once,
// so we avoid a second redundant loadSettings() call here.
async function transcribeAudio(uri: string, language: string, companionUrl: string): Promise<string> {
  // Send to companion for Whisper transcription, or fallback to empty string
  try {
    const formData = new FormData();
    // Use a generic audio type so the server relies on the file extension/content
    formData.append('audio', {
      uri,
      type: 'audio/x-m4a',
      name: 'recording.m4a',
    } as any);
    formData.append('language', language);

    const res = await fetch(`${companionUrl}/transcribe`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error('Transcription failed');
    const data = await res.json();
    return data.transcript ?? '';
  } catch {
    return '';
  }
}
