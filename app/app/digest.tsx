import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTTS } from '../hooks/useTTS';
import { useCompanion, DigestResult } from '../hooks/useCompanion';

export default function DigestScreen() {
  const router = useRouter();
  const { speak } = useTTS();
  const { getDigest } = useCompanion();
  const [digest, setDigest] = useState<DigestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAndPlay();
  }, []);

  const loadAndPlay = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDigest();
      setDigest(data);
      await speak(data.summary);
      await speak('Say Open Hear to read and reply, or just close.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // BUG-10: Only block the whole screen on the very first load (no data yet).
  // Subsequent replays show a lightweight overlay so the buttons remain tappable.
  if (loading && !digest) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#f39c12" />
          <Text style={styles.loadingText}>Building your digest…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadAndPlay}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.heading}>Daily Digest</Text>

        {digest && (
          <>
            <View style={styles.summaryBox}>
              <Text style={styles.summaryText}>{digest.summary}</Text>
            </View>

            <View style={styles.itemList}>
              {digest.items.map((item) => (
                <View key={item.jid} style={styles.item}>
                  <View style={styles.itemLeft}>
                    <Text style={styles.itemIcon}>{item.isGroup ? '👥' : '👤'}</Text>
                    <View>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemType}>{item.isGroup ? 'Group' : 'Direct'}</Text>
                    </View>
                  </View>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.count}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity style={styles.hearBtn} onPress={() => router.push('/hear')}>
          <Text style={styles.hearBtnText}>🔵 Open Hear Mode</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.replayBtn} onPress={loadAndPlay}>
          <Text style={styles.replayText}>Replay Digest</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  container: { padding: 24, gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  heading: { color: '#fff', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  summaryBox: {
    backgroundColor: '#1a1400',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#4a3a00',
  },
  summaryText: { color: '#f39c12', fontSize: 16, lineHeight: 26 },
  itemList: { gap: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222',
  },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  itemIcon: { fontSize: 24 },
  itemName: { color: '#fff', fontSize: 15, fontWeight: '500' },
  itemType: { color: '#555', fontSize: 12, marginTop: 2 },
  badge: {
    backgroundColor: '#2980b9',
    borderRadius: 20,
    minWidth: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  badgeText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  hearBtn: {
    backgroundColor: '#0a1a2e',
    borderWidth: 2,
    borderColor: '#2980b9',
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
  },
  hearBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  replayBtn: { alignItems: 'center', paddingVertical: 10 },
  replayText: { color: '#555', fontSize: 14 },
  loadingText: { color: '#888', fontSize: 16, marginTop: 12 },
  errorText: { color: '#e74c3c', fontSize: 16, textAlign: 'center', padding: 24 },
  retryBtn: { backgroundColor: '#1a0a0a', borderWidth: 1, borderColor: '#e74c3c', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  retryText: { color: '#e74c3c', fontSize: 15 },
});
