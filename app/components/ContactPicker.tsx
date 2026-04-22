import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface Contact {
  id: string;
  name: string;
}

interface ContactPickerProps {
  candidates: Contact[];
  onSelect: (contact: Contact) => void;
  onCancel: () => void;
  query: string;
}

export function ContactPicker({ candidates, onSelect, onCancel, query }: ContactPickerProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Who did you mean by "{query}"?</Text>
      {candidates.map((c) => (
        <TouchableOpacity key={c.id} style={styles.item} onPress={() => onSelect(c)}>
          <Text style={styles.name}>{c.name}</Text>
          <Text style={styles.id}>{c.id}</Text>
        </TouchableOpacity>
      ))}
      <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
        <Text style={styles.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    padding: 20,
    gap: 12,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  item: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#4a4a8a',
  },
  name: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  id: {
    color: '#666',
    fontSize: 12,
    marginTop: 2,
  },
  cancelBtn: {
    paddingVertical: 14,
    backgroundColor: '#333',
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelText: {
    color: '#aaa',
    fontSize: 15,
  },
});
