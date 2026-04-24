import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useCompanion } from '../hooks/useCompanion';

interface LogEntry {
  ts: string;
  level: string;
  tag: string;
  msg: string;
}

interface StoreStats {
  chats: number;
  messages: number;
  contacts: number;
  chatsWithUnread: number;
}

const LEVEL_COLORS: Record<string, string> = {
  info: '#27ae60',
  warn: '#f39c12',
  error: '#e74c3c',
};

export default function DebugScreen() {
  const { getDebugLogs, getStoreStats, clearDebugLogs } = useCompanion();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<StoreStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'warn' | 'error'>('all');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [logData, storeData] = await Promise.all([getDebugLogs(), getStoreStats()]);
      setLogs(logData);
      setStats(storeData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [getDebugLogs, getStoreStats]);

  const handleClear = useCallback(async () => {
    await clearDebugLogs();
    setLogs([]);
  }, [clearDebugLogs]);

  useEffect(() => {
    fetchAll();
  }, []);

  // Auto-refresh every 3s when enabled
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchAll, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAll]);

  const filteredLogs = filter === 'all' ? logs : logs.filter(l => l.level === filter);

  return (
    <SafeAreaView style={styles.safe}>

      {/* ─── Store Stats ────────────────────────────────────── */}
      {stats && (
        <View style={styles.statsRow}>
          <StatChip label="Chats" value={stats.chats} />
          <StatChip label="Unread" value={stats.chatsWithUnread} accent="#f39c12" />
          <StatChip label="Contacts" value={stats.contacts} />
          <StatChip label="Msgs" value={stats.messages} />
        </View>
      )}

      {/* ─── Controls ───────────────────────────────────────── */}
      <View style={styles.controls}>
        <TouchableOpacity
          id="debug-refresh-btn"
          style={styles.controlBtn}
          onPress={fetchAll}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator size="small" color="#2980b9" />
            : <Text style={styles.controlBtnText}>↻ Refresh</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          id="debug-autorefresh-btn"
          style={[styles.controlBtn, autoRefresh && styles.controlBtnActive]}
          onPress={() => setAutoRefresh(v => !v)}
        >
          <Text style={[styles.controlBtnText, autoRefresh && { color: '#27ae60' }]}>
            {autoRefresh ? '⏹ Live' : '▶ Live'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          id="debug-clear-btn"
          style={[styles.controlBtn, { borderColor: '#e74c3c' }]}
          onPress={handleClear}
        >
          <Text style={[styles.controlBtnText, { color: '#e74c3c' }]}>🗑 Clear</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Filter tabs ────────────────────────────────────── */}
      <View style={styles.filterRow}>
        {(['all', 'warn', 'error'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterBtnText, filter === f && styles.filterBtnTextActive]}>
              {f.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.logCount}>{filteredLogs.length} entries</Text>
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {/* ─── Log list ───────────────────────────────────────── */}
      <ScrollView
        style={styles.logScroll}
        contentContainerStyle={styles.logContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor="#2980b9" />}
      >
        {filteredLogs.length === 0 && !loading && (
          <Text style={styles.emptyText}>No log entries yet. Use the app and refresh.</Text>
        )}
        {filteredLogs.map((entry, i) => (
          <View key={i} style={styles.logEntry}>
            <View style={styles.logMeta}>
              <Text style={[styles.logLevel, { color: LEVEL_COLORS[entry.level] ?? '#888' }]}>
                {entry.level.toUpperCase()}
              </Text>
              <Text style={styles.logTag}>[{entry.tag}]</Text>
              <Text style={styles.logTime}>
                {new Date(entry.ts).toLocaleTimeString()}
              </Text>
            </View>
            <Text style={styles.logMsg}>{entry.msg}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatChip({ label, value, accent = '#2980b9' }: { label: string; value: number; accent?: string }) {
  return (
    <View style={[styles.statChip, { borderColor: accent }]}>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },

  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  statChip: {
    flex: 1,
    backgroundColor: '#111',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { color: '#666', fontSize: 11 },

  controls: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  controlBtn: {
    flex: 1,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#2980b9',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    minHeight: 36,
    justifyContent: 'center',
  },
  controlBtnActive: { backgroundColor: '#0d1a2e' },
  controlBtnText: { color: '#2980b9', fontSize: 13, fontWeight: '600' },

  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 6,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#222',
  },
  filterBtnActive: { backgroundColor: '#1a2a3a', borderColor: '#2980b9' },
  filterBtnText: { color: '#555', fontSize: 11, fontWeight: '700' },
  filterBtnTextActive: { color: '#2980b9' },
  logCount: { color: '#444', fontSize: 11, marginLeft: 'auto' },

  errorBox: {
    marginHorizontal: 16,
    backgroundColor: '#1a0a0a',
    borderWidth: 1,
    borderColor: '#e74c3c',
    borderRadius: 8,
    padding: 10,
  },
  errorText: { color: '#e74c3c', fontSize: 13 },

  logScroll: { flex: 1, marginTop: 4 },
  logContent: { paddingHorizontal: 12, paddingBottom: 24, gap: 4 },

  logEntry: {
    backgroundColor: '#0f0f0f',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    gap: 4,
  },
  logMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logLevel: { fontSize: 10, fontWeight: '800', width: 40 },
  logTag: { color: '#555', fontSize: 11, fontFamily: 'monospace', flex: 1 },
  logTime: { color: '#333', fontSize: 10 },
  logMsg: { color: '#ccc', fontSize: 13, lineHeight: 18 },

  emptyText: { color: '#444', textAlign: 'center', marginTop: 40, fontSize: 14 },
});
