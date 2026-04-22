import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface MessagePreviewProps {
  to: string;
  message: string;
  onSend: () => void;
  onEdit: () => void;
  onCancel: () => void;
  onTone: (tone: string) => void;
  loading?: boolean;
}

export function MessagePreview({ to, message, onSend, onEdit, onCancel, onTone, loading }: MessagePreviewProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.toLabel}>To: <Text style={styles.toName}>{to}</Text></Text>
      <View style={styles.messageBox}>
        <Text style={styles.message}>{message}</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.sendBtn]} onPress={onSend} disabled={loading}>
          <Text style={styles.btnText}>Send</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.editBtn]} onPress={onEdit} disabled={loading}>
          <Text style={styles.btnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.cancelBtn]} onPress={onCancel} disabled={loading}>
          <Text style={styles.btnText}>Cancel</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.toneRow}>
        {['casual', 'formal', 'short', 'polite'].map((tone) => (
          <TouchableOpacity key={tone} style={styles.toneBtn} onPress={() => onTone(tone)} disabled={loading}>
            <Text style={styles.toneBtnText}>{tone}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    padding: 20,
    gap: 16,
  },
  toLabel: {
    color: '#888',
    fontSize: 14,
  },
  toName: {
    color: '#7eb3ff',
    fontWeight: '600',
  },
  messageBox: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  message: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  sendBtn: { backgroundColor: '#27ae60' },
  editBtn: { backgroundColor: '#2980b9' },
  cancelBtn: { backgroundColor: '#555' },
  btnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  toneRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  toneBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#2a2a3e',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#444',
  },
  toneBtnText: {
    color: '#aaa',
    fontSize: 13,
  },
});
