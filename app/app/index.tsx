import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as Notifications from 'expo-notifications';
import { useCompanion } from '../hooks/useCompanion';
import { loadSettings } from '../utils/settings';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function HomeScreen() {
  const router = useRouter();
  const { status } = useCompanion();
  const [needsSetup, setNeedsSetup] = useState(false);

  // Re-check every time screen gains focus so the banner disappears after
  // the user saves a URL in Settings and navigates back.
  useFocusEffect(
    useCallback(() => {
      loadSettings().then((s) => setNeedsSetup(!s.companion_url));
    }, [])
  );

  useEffect(() => {
    scheduleDailyDigests();
  }, []);

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.screen === 'digest') {
        router.push('/digest');
      }
    });
    return () => sub.remove();
  }, []);

  const statusColor =
    status === 'connected' ? '#27ae60' :
    status === 'connecting' ? '#f39c12' : '#e74c3c';
  const statusLabel =
    status === 'connected' ? 'Connected' :
    status === 'connecting' ? 'Connecting…' : 'Disconnected';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>

        {/* ─── Header ──────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.title}>Waaice</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
          {/* Gear button */}
          <TouchableOpacity
            id="settings-btn"
            style={styles.gearBtn}
            onPress={() => router.push('/settings')}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.gearIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>

        {/* ─── Setup Required Banner ────────────────────────────── */}
        {needsSetup && (
          <TouchableOpacity
            id="setup-banner"
            style={styles.setupBanner}
            onPress={() => router.push('/settings')}
            activeOpacity={0.8}
          >
            <Text style={styles.setupBannerIcon}>⚠️</Text>
            <View style={styles.setupBannerText}>
              <Text style={styles.setupBannerTitle}>Setup Required</Text>
              <Text style={styles.setupBannerSub}>
                Tap to enter your companion server IP before using the app.
              </Text>
            </View>
            <Text style={styles.setupBannerArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* ─── Main Buttons ─────────────────────────────────────── */}
        <View style={styles.buttons}>
          <TouchableOpacity
            id="go-btn"
            style={[styles.mainBtn, styles.goBtn]}
            onPress={() => router.push('/go')}
          >
            <Text style={styles.mainBtnIcon}>🟢</Text>
            <Text style={styles.mainBtnLabel}>Go</Text>
            <Text style={styles.mainBtnSub}>Compose & Send</Text>
          </TouchableOpacity>

          <TouchableOpacity
            id="hear-btn"
            style={[styles.mainBtn, styles.hearBtn]}
            onPress={() => router.push('/hear')}
          >
            <Text style={styles.mainBtnIcon}>🔵</Text>
            <Text style={styles.mainBtnLabel}>Hear</Text>
            <Text style={styles.mainBtnSub}>Read & Reply</Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

async function scheduleDailyDigests() {
  // expo-notifications scheduling is not supported on web
  if (Platform.OS === 'web') return;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;

  await Notifications.cancelAllScheduledNotificationsAsync();
  const settings = await loadSettings();

  for (const time of settings.digest_times) {
    const [hour, minute] = time.split(':').map(Number);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Waaice Digest',
        body: 'Tap to hear your unread messages.',
        data: { screen: 'digest' },
      },
      trigger: {
        hour,
        minute,
        repeats: true,
      } as any,
    });
  }
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingVertical: 48,
    gap: 20,
  },

  // ── Header
  header: {
    alignItems: 'center',
    gap: 12,
    position: 'relative',
  },
  title: {
    color: '#fff',
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  gearBtn: {
    position: 'absolute',
    top: 4,
    right: 0,
    padding: 4,
  },
  gearIcon: {
    fontSize: 24,
  },

  // ── Setup banner
  setupBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#1a1200',
    borderWidth: 1,
    borderColor: '#f39c12',
    borderRadius: 14,
    padding: 16,
  },
  setupBannerIcon: { fontSize: 22 },
  setupBannerText: { flex: 1, gap: 2 },
  setupBannerTitle: { color: '#f39c12', fontSize: 14, fontWeight: '700' },
  setupBannerSub: { color: '#a07010', fontSize: 12, lineHeight: 17 },
  setupBannerArrow: { color: '#f39c12', fontSize: 22, fontWeight: '300' },

  // ── Feature buttons
  buttons: {
    flex: 1,
    justifyContent: 'center',
    gap: 24,
  },
  mainBtn: {
    borderRadius: 24,
    padding: 36,
    alignItems: 'center',
    gap: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  goBtn: {
    backgroundColor: '#0d2e1a',
    borderWidth: 2,
    borderColor: '#27ae60',
  },
  hearBtn: {
    backgroundColor: '#0a1a2e',
    borderWidth: 2,
    borderColor: '#2980b9',
  },
  mainBtnIcon: { fontSize: 52 },
  mainBtnLabel: { color: '#fff', fontSize: 32, fontWeight: '800' },
  mainBtnSub: { color: '#888', fontSize: 15 },
});
