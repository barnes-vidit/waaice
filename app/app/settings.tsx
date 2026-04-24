import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { loadSettings, saveSettings } from '../utils/settings';

type TestState = 'idle' | 'testing' | 'ok' | 'fail';

export default function SettingsScreen() {
  const router = useRouter();

  const [companionUrl, setCompanionUrl] = useState('');
  const [ttsSpeed, setTtsSpeed] = useState('1.1');
  const [sttLanguage, setSttLanguage] = useState('en-IN');
  const [summarizeThreshold, setSummarizeThreshold] = useState('3');
  const [testState, setTestState] = useState<TestState>('idle');
  const [testMessage, setTestMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load saved settings on mount
  useEffect(() => {
    loadSettings().then((s) => {
      setCompanionUrl(s.companion_url);
      setTtsSpeed(String(s.tts_speed));
      setSttLanguage(s.stt_language);
      setSummarizeThreshold(String(s.summarize_threshold));
    });
  }, []);

  const handleTestConnection = useCallback(async () => {
    const url = companionUrl.trim().replace(/\/$/, '');
    if (!url) {
      setTestState('fail');
      setTestMessage('Enter a companion URL first.');
      return;
    }
    setTestState('testing');
    setTestMessage('');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${url}/status`, { signal: controller.signal });
      const data = await res.json();
      if (data.status === 'connected') {
        setTestState('ok');
        setTestMessage('WhatsApp connected ✓');
      } else {
        setTestState('ok');
        setTestMessage(`Server reached — status: ${data.status}`);
      }
    } catch (err: any) {
      setTestState('fail');
      const msg = err?.name === 'AbortError' ? 'Request timed out after 5s' : err?.message ?? 'Unknown error';
      setTestMessage(`Cannot reach server: ${msg}`);
    } finally {
      clearTimeout(timeoutId);
    }
  }, [companionUrl]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    const url = companionUrl.trim().replace(/\/$/, '');
    await saveSettings({
      companion_url: url,
      tts_speed: parseFloat(ttsSpeed) || 1.1,
      stt_language: sttLanguage.trim() || 'en-IN',
      summarize_threshold: parseInt(summarizeThreshold) || 3,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }, [companionUrl, ttsSpeed, sttLanguage, summarizeThreshold]);

  const testBorderColor =
    testState === 'ok' ? '#27ae60' :
    testState === 'fail' ? '#e74c3c' : '#333';

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

          {/* ─── Companion URL ─────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Companion Server</Text>
            <Text style={styles.sectionDesc}>
              Enter the IP address of the computer running the companion server.
              Both devices must be on the same Wi-Fi network.
            </Text>

            <Text style={styles.label}>Server URL</Text>
            <TextInput
              id="companion-url-input"
              style={[styles.input, testState !== 'idle' && { borderColor: testBorderColor }]}
              value={companionUrl}
              onChangeText={(v) => { setCompanionUrl(v); setTestState('idle'); }}
              placeholder="http://192.168.1.X:3000"
              placeholderTextColor="#444"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <TouchableOpacity
              id="test-connection-btn"
              style={[styles.testBtn, testState === 'testing' && styles.testBtnDisabled]}
              onPress={handleTestConnection}
              disabled={testState === 'testing'}
            >
              {testState === 'testing' ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.testBtnText}>Test Connection</Text>
              )}
            </TouchableOpacity>

            {testMessage !== '' && (
              <View style={[styles.testResult, { borderColor: testBorderColor }]}>
                <Text style={[styles.testResultText, { color: testState === 'ok' ? '#27ae60' : '#e74c3c' }]}>
                  {testMessage}
                </Text>
              </View>
            )}

            <Text style={styles.hint}>
              Find your PC's IP: open Command Prompt → type{' '}
              <Text style={styles.code}>ipconfig</Text> → look for IPv4 Address
            </Text>
          </View>

          {/* ─── Voice Settings ────────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Voice</Text>

            <Text style={styles.label}>TTS Speed</Text>
            <TextInput
              id="tts-speed-input"
              style={styles.input}
              value={ttsSpeed}
              onChangeText={setTtsSpeed}
              placeholder="1.1"
              placeholderTextColor="#444"
              keyboardType="decimal-pad"
            />
            <Text style={styles.hint}>
              Speech playback speed. 1.0 = normal, 1.3 = fast.
            </Text>

            <Text style={styles.label}>STT Language</Text>
            <TextInput
              id="stt-language-input"
              style={styles.input}
              value={sttLanguage}
              onChangeText={setSttLanguage}
              placeholder="en-IN"
              placeholderTextColor="#444"
              autoCapitalize="none"
            />
            <Text style={styles.hint}>
              BCP-47 language tag for speech recognition & TTS. Examples: en-IN, en-US, hi-IN
            </Text>
          </View>

          {/* ─── Message Settings ──────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Messages</Text>

            <Text style={styles.label}>Summarise after N messages</Text>
            <TextInput
              id="summarize-threshold-input"
              style={styles.input}
              value={summarizeThreshold}
              onChangeText={setSummarizeThreshold}
              placeholder="3"
              placeholderTextColor="#444"
              keyboardType="number-pad"
            />
            <Text style={styles.hint}>
              If a chat has this many or more unread messages, they will be summarised by AI instead of read individually.
            </Text>
          </View>

          {/* ─── Save ──────────────────────────────────────────────── */}
          <TouchableOpacity
            id="save-settings-btn"
            style={[styles.saveBtn, saving && styles.saveBtnDisabled, saved && styles.saveBtnSaved]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>{saved ? '✓ Saved' : 'Save Settings'}</Text>
            )}
          </TouchableOpacity>

          {/* ─── Debug ─────────────────────────────────────────────── */}
          <TouchableOpacity
            id="debug-logs-btn"
            style={styles.debugBtn}
            onPress={() => router.push('/debug')}
          >
            <Text style={styles.debugBtnText}>🔍 View Debug Logs</Text>
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  container: { padding: 24, gap: 8, paddingBottom: 48 },

  section: {
    backgroundColor: '#111',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1e1e1e',
    gap: 10,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 2,
  },
  sectionDesc: {
    color: '#666',
    fontSize: 13,
    lineHeight: 20,
  },

  label: {
    color: '#aaa',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 6,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  hint: {
    color: '#555',
    fontSize: 12,
    lineHeight: 18,
  },
  code: {
    color: '#7eb3ff',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  testBtn: {
    backgroundColor: '#1a2a3a',
    borderWidth: 1,
    borderColor: '#2980b9',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  testBtnDisabled: { opacity: 0.5 },
  testBtnText: { color: '#2980b9', fontSize: 15, fontWeight: '600' },

  testResult: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  testResultText: { fontSize: 13, fontWeight: '500' },

  saveBtn: {
    backgroundColor: '#1a3a2e',
    borderWidth: 2,
    borderColor: '#27ae60',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnSaved: { backgroundColor: '#0d2e1a', borderColor: '#27ae60' },
  saveBtnText: { color: '#27ae60', fontSize: 17, fontWeight: '700' },

  debugBtn: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  debugBtnText: { color: '#555', fontSize: 14, fontWeight: '500' },
});
