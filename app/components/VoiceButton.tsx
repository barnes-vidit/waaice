import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  GestureResponderEvent,
  View,
  ActivityIndicator,
} from 'react-native';

interface VoiceButtonProps {
  onPressIn: () => void;
  onPressOut: () => void;
  isRecording: boolean;
  isProcessing?: boolean;
  disabled?: boolean;
}

export function VoiceButton({ onPressIn, onPressOut, isRecording, isProcessing, disabled }: VoiceButtonProps) {
  return (
    <TouchableOpacity
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled || isProcessing}
      activeOpacity={0.8}
      style={[styles.button, isRecording && styles.recording, disabled && styles.disabled]}
    >
      {isProcessing ? (
        <ActivityIndicator size="large" color="#fff" />
      ) : (
        <>
          <Text style={styles.icon}>{isRecording ? '🔴' : '🎙️'}</Text>
          <Text style={styles.label}>{isRecording ? 'Release to send' : 'Hold to speak'}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: '#1a1a2e',
    borderWidth: 3,
    borderColor: '#4a4a8a',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  recording: {
    backgroundColor: '#2d0a0a',
    borderColor: '#e74c3c',
    transform: [{ scale: 1.05 }],
  },
  disabled: {
    opacity: 0.4,
  },
  icon: {
    fontSize: 48,
    marginBottom: 8,
  },
  label: {
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
  },
});
