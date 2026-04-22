import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
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

  const statusColor = status === 'connected' ? '#27ae60' : status === 'connecting' ? '#f39c12' : '#e74c3c';
  const statusLabel = status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Disconnected';

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Waaice</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.buttons}>
          <TouchableOpacity style={[styles.mainBtn, styles.goBtn]} onPress={() => router.push('/go')}>
            <Text style={styles.mainBtnIcon}>🟢</Text>
            <Text style={styles.mainBtnLabel}>Go</Text>
            <Text style={styles.mainBtnSub}>Compose & Send</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.mainBtn, styles.hearBtn]} onPress={() => router.push('/hear')}>
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
  },
  header: {
    alignItems: 'center',
    gap: 12,
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
  mainBtnIcon: {
    fontSize: 52,
  },
  mainBtnLabel: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
  },
  mainBtnSub: {
    color: '#888',
    fontSize: 15,
  },
});
