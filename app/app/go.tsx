import React, { useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { VoiceButton } from '../components/VoiceButton';
import { MessagePreview } from '../components/MessagePreview';
import { ContactPicker } from '../components/ContactPicker';
import { useSTT } from '../hooks/useSTT';
import { useTTS } from '../hooks/useTTS';
import { useCompanion } from '../hooks/useCompanion';
import { addContact, resolveContact, incrementSendCount } from '../utils/contactsMap';

type Stage = 'listening' | 'resolving' | 'preview' | 'sent' | 'error';

interface Contact {
  id: string;
  name: string;
}

export default function GoScreen() {
  const router = useRouter();
  const stt = useSTT();
  const { speak } = useTTS();
  const { parseIntent, refineMessage, send, getContacts } = useCompanion();

  const [stage, setStage] = useState<Stage>('listening');
  const [targetJid, setTargetJid] = useState('');
  const [targetName, setTargetName] = useState('');
  const [refinedMessage, setRefinedMessage] = useState('');
  const [candidates, setCandidates] = useState<Contact[]>([]);
  const [contactQuery, setContactQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('Hold the button and speak your message.');
  // BUG-01/02: persist the raw message across async disambiguation steps
  const rawMessageRef = useRef<string>('');
  const rawToneRef = useRef<string | undefined>(undefined);

  const handlePressIn = useCallback(async () => {
    setStatusText('Listening…');
    await stt.startRecording();
  }, [stt]);

  const handlePressOut = useCallback(async () => {
    setStatusText('Processing…');
    setLoading(true);
    const transcript = await stt.stopRecording();

    if (!transcript.trim()) {
      setStatusText("Didn't catch that. Try again.");
      setLoading(false);
      return;
    }

    try {
      const intent = await parseIntent(transcript);

      if (intent.action !== 'send' || !intent.contact || !intent.message) {
        await speak("I didn't understand that. Please say something like: Message Rahul, I'll be late.");
        setStatusText('Hold the button and speak your message.');
        setLoading(false);
        return;
      }

      // BUG-01/02: store the raw message in a ref so it survives to handleContactSelect
      rawMessageRef.current = intent.message;
      rawToneRef.current = intent.tone ?? undefined;

      setContactQuery(intent.contact);
      const baileysContacts = await getContacts();
      const resolved = await resolveContact(intent.contact, baileysContacts);

      if (!resolved) {
        await speak(`I couldn't find a contact named ${intent.contact}. Please try again.`);
        setStatusText('Hold the button and speak your message.');
        setLoading(false);
        return;
      }

      if ('matches' in resolved) {
        setCandidates(resolved.matches);
        const names = resolved.matches.map((c) => c.name).join(', or ');
        await speak(`Did you mean ${names}?`);
        setStage('resolving');
        setLoading(false);
        return;
      }

      const resolvedName = baileysContacts.find((c) => c.id === resolved.jid)?.name ?? intent.contact;
      // BUG-09: skip TTS read-back when the contact was auto-resolved silently
      await finishResolving(resolved.jid, resolvedName, intent.message, intent.tone ?? undefined, resolved.silent);
    } catch (err: any) {
      setStatusText(`Error: ${err.message}`);
      setLoading(false);
    }
  }, [stt, parseIntent, getContacts, speak]);

  const finishResolving = useCallback(async (jid: string, name: string, message: string, tone?: string, silent?: boolean) => {
    setLoading(true);
    setTargetJid(jid);
    setTargetName(name);

    const { refined } = await refineMessage(message, tone);
    setRefinedMessage(refined);
    // BUG-09: only speak the preview when the contact was not auto-resolved silently
    if (!silent) {
      await speak(`To ${name}: ${refined}. Say Send, Edit, or Cancel.`);
    }
    setStage('preview');
    setLoading(false);
  }, [refineMessage, speak]);

  const handleContactSelect = useCallback(async (contact: Contact) => {
    await addContact(contactQuery, contact.id);
    setCandidates([]);
    setStage('listening');
    // BUG-01/02: use the raw dictated message from the ref, not refinedMessage (which is '' here)
    await finishResolving(contact.id, contact.name, rawMessageRef.current, rawToneRef.current);
  }, [contactQuery, finishResolving]);

  const handleSend = useCallback(async () => {
    setLoading(true);
    try {
      await send(targetJid, refinedMessage);
      await incrementSendCount(targetJid);
      await speak('Sent!');
      setStage('sent');
      setTimeout(() => router.back(), 1500);
    } catch (err: any) {
      Alert.alert('Send failed', err.message);
    } finally {
      setLoading(false);
    }
  }, [send, targetJid, refinedMessage, speak, router]);

  const handleEdit = useCallback(async () => {
    stt.reset();
    setStage('listening');
    setStatusText('Hold the button and speak your new message.');
    await speak('Okay, speak your edited message.');
  }, [stt, speak]);

  const handleTone = useCallback(async (tone: string) => {
    setLoading(true);
    try {
      const { refined } = await refineMessage(refinedMessage, tone);
      setRefinedMessage(refined);
      await speak(`${tone} version: ${refined}. Say Send, Edit, or Cancel.`);
    } finally {
      setLoading(false);
    }
  }, [refineMessage, refinedMessage, speak]);

  const handleCancel = useCallback(async () => {
    await speak('Cancelled.');
    router.back();
  }, [speak, router]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.status}>{statusText}</Text>

        {stage === 'listening' && (
          <View style={styles.center}>
            <VoiceButton
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              isRecording={stt.state === 'recording'}
              isProcessing={stt.state === 'processing' || loading}
            />
          </View>
        )}

        {stage === 'resolving' && (
          <ContactPicker
            candidates={candidates}
            query={contactQuery}
            onSelect={handleContactSelect}
            onCancel={() => { setStage('listening'); setCandidates([]); }}
          />
        )}

        {stage === 'preview' && (
          <MessagePreview
            to={targetName}
            message={refinedMessage}
            onSend={handleSend}
            onEdit={handleEdit}
            onCancel={handleCancel}
            onTone={handleTone}
            loading={loading}
          />
        )}

        {stage === 'sent' && (
          <View style={styles.center}>
            <Text style={styles.sentIcon}>✅</Text>
            <Text style={styles.sentText}>Sent!</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  container: { flexGrow: 1, padding: 24, gap: 24 },
  status: { color: '#888', fontSize: 16, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300 },
  sentIcon: { fontSize: 64 },
  sentText: { color: '#27ae60', fontSize: 28, fontWeight: '700', marginTop: 12 },
});
