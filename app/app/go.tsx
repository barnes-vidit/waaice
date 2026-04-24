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
  const nudgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // G4: cancel any pending nudge when the component unmounts
  React.useEffect(() => () => {
    if (nudgeTimeoutRef.current) clearTimeout(nudgeTimeoutRef.current);
  }, []);

  const handlePressIn = useCallback(async () => {
    // Cancel any pending nudge
    if (nudgeTimeoutRef.current) {
      clearTimeout(nudgeTimeoutRef.current);
      nudgeTimeoutRef.current = null;
    }
    stt.reset(); // Clear any error state from previous attempt
    setStatusText('Listening…');
    await stt.startRecording();
  }, [stt]);

  const handlePressOut = useCallback(async () => {
    setStatusText('Processing…');
    setLoading(true);
    const transcript = await stt.stopRecording();

    if (!transcript.trim()) {
      setStatusText("Didn't catch that. Hold the button and try again.");
      setLoading(false);
      return;
    }

    try {
      const intent = await parseIntent(transcript, 'compose');

      if (intent.action !== 'send' || !intent.contact || !intent.message) {
        await speak("I didn't understand that. Please say something like: Message Rahul, I'll be late.");
        setStatusText("Hold the button and speak your message.");
        setLoading(false);
        // G4: schedule a nudge after 10s of silence
        nudgeTimeoutRef.current = setTimeout(async () => {
          await speak('Hold the button and speak your message.');
        }, 10_000);
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
      // Map technical errors to human-friendly phrases
      const raw = err.message ?? '';
      const friendly = raw.toLowerCase().includes('transcri') || raw.toLowerCase().includes('whisper') || raw.toLowerCase().includes('groq')
        ? "I couldn't hear that clearly. Please try again."
        : raw.toLowerCase().includes('configured') || raw.toLowerCase().includes('url')
        ? "Companion not connected. Check your settings."
        : `Something went wrong. ${raw}`;
      setStatusText(friendly);
      setLoading(false);
    }
  }, [stt, parseIntent, getContacts, speak]);

  const finishResolving = useCallback(async (jid: string, name: string, message: string, tone?: string, silent?: boolean) => {
    setLoading(true);
    setTargetJid(jid);
    setTargetName(name);

    // G5: show progress text so user knows something is happening
    setStatusText('Refining your message…');
    const { refined } = await refineMessage(message, tone);
    setRefinedMessage(refined);
    // BUG-09: only speak the preview when the contact was not auto-resolved silently
    if (!silent) {
      await speak(`To ${name}: ${refined}. Say Send, Edit, or Cancel.`);
    }
    setStage('preview');
    setStatusText(`To ${name}`);
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

  // G3: voice confirm in preview stage — say 'yes', 'send it', 'cancel', 'edit'
  const handlePreviewPressIn = useCallback(async () => {
    stt.reset();
    await stt.startRecording();
  }, [stt]);

  const handlePreviewPressOut = useCallback(async () => {
    setLoading(true);
    const transcript = await stt.stopRecording();
    if (!transcript.trim()) { setLoading(false); return; }
    const intent = await parseIntent(transcript, 'command');
    setLoading(false);
    if (intent.action === 'confirm') {
      await handleSend();
    } else if (intent.action === 'stop' || intent.action === 'skip') {
      handleCancel();
    } else if (intent.action === 'reply' || intent.action === 'repeat') {
      handleEdit();
    } else {
      await speak('Say Send, Edit, or Cancel.');
    }
  }, [stt, parseIntent, handleSend, handleCancel, handleEdit, speak]);

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
          <View>
            <MessagePreview
              to={targetName}
              message={refinedMessage}
              onSend={handleSend}
              onEdit={handleEdit}
              onCancel={handleCancel}
              onTone={handleTone}
              loading={loading}
            />
            {/* G3: voice confirm button so user can say 'yes' / 'send it' */}
            <View style={styles.previewVoice}>
              <VoiceButton
                onPressIn={handlePreviewPressIn}
                onPressOut={handlePreviewPressOut}
                isRecording={stt.state === 'recording'}
                isProcessing={stt.state === 'processing' || loading}
              />
              <Text style={styles.previewHint}>or say "Send", "Edit", "Cancel"</Text>
            </View>
          </View>
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
  previewVoice: { alignItems: 'center', paddingTop: 20, gap: 10 },
  previewHint: { color: '#444', fontSize: 13, textAlign: 'center' },
});
