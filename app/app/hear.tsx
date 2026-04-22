import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator
} from 'react-native';
import { useRouter } from 'expo-router';
import { VoiceButton } from '../components/VoiceButton';
import { MessagePreview } from '../components/MessagePreview';
import { useSTT } from '../hooks/useSTT';
import { useTTS } from '../hooks/useTTS';
import { useCompanion, UnreadChat } from '../hooks/useCompanion';
import { loadSettings } from '../utils/settings';

type HearStage = 'loading' | 'reading' | 'awaiting' | 'reply_listening' | 'reply_preview' | 'done';

export default function HearScreen() {
  const router = useRouter();
  const stt = useSTT();
  const { speak, stop } = useTTS();
  const { getUnread, summarize, parseIntent, refineMessage, send, ignoreGroup, getMe } = useCompanion();

  const [stage, setStage] = useState<HearStage>('loading');
  const [queue, setQueue] = useState<UnreadChat[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [statusText, setStatusText] = useState('Loading unread messages…');
  const [replyMessage, setReplyMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const commandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentChat = queue[currentIndex];

  useEffect(() => {
    loadQueue();
    // BUG-03: cancel any pending command timeouts when the screen unmounts
    return () => {
      if (commandTimeoutRef.current) {
        clearTimeout(commandTimeoutRef.current);
        commandTimeoutRef.current = null;
      }
    };
  }, []);

  const loadQueue = async () => {
    try {
      const chats = await getUnread();
      setQueue(chats);
      if (chats.length === 0) {
        setStatusText('No unread messages. You\'re all caught up!');
        setStage('done');
      } else {
        setStage('reading');
        readCurrentChat(chats, 0);
      }
    } catch (err: any) {
      setStatusText(`Error: ${err.message}`);
      setStage('done');
    }
  };

  const readCurrentChat = useCallback(async (chatList: UnreadChat[], index: number) => {
    const chat = chatList[index];
    if (!chat) {
      setStage('done');
      setStatusText("You've heard all your messages.");
      await speak("That's all your messages.");
      return;
    }

    const settings = await loadSettings();
    const threshold = settings.summarize_threshold ?? 3;
    let readText: string;

    if (chat.messages.length >= threshold) {
      const { summary } = await summarize(chat.messages.map((m) => ({ text: m.text })));
      readText = summary;
    } else {
      const texts = chat.messages.map((m) => m.text).join('. ');
      readText = `${chat.name} says: ${texts}`;
    }

    setStatusText(readText);
    await speak(readText);
    setStage('awaiting');
    startCommandTimeout(chatList, index);
  }, [speak, summarize]);

  const startCommandTimeout = useCallback((chatList: UnreadChat[], index: number) => {
    if (commandTimeoutRef.current) clearTimeout(commandTimeoutRef.current);
    commandTimeoutRef.current = setTimeout(async () => {
      await speak('Say Reply, Next, Skip, or Repeat.');
      commandTimeoutRef.current = setTimeout(() => {
        advanceChat(chatList, index);
      }, 3000);
    }, 3000);
  }, [speak]);

  const clearCommandTimeout = () => {
    if (commandTimeoutRef.current) {
      clearTimeout(commandTimeoutRef.current);
      commandTimeoutRef.current = null;
    }
  };

  const advanceChat = useCallback((chatList: UnreadChat[], index: number) => {
    const next = index + 1;
    setCurrentIndex(next);
    setStage('reading');
    readCurrentChat(chatList, next);
  }, [readCurrentChat]);

  const handleCommandPressIn = useCallback(async () => {
    clearCommandTimeout();
    stop();
    await stt.startRecording();
  }, [stt, stop]);

  const handleCommandPressOut = useCallback(async () => {
    setLoading(true);
    const transcript = await stt.stopRecording();
    if (!transcript.trim()) {
      setLoading(false);
      startCommandTimeout(queue, currentIndex);
      return;
    }

    const intent = await parseIntent(transcript);

    // BUG-04: setLoading(false) is moved inside each branch — branches that call
    // advanceChat() navigate away, so we must not update state after them.
    switch (intent.action) {
      case 'reply':
        setStage('reply_listening');
        setStatusText('Speak your reply.');
        setLoading(false);
        await speak('Speak your reply.');
        break;
      case 'next':
      case 'skip':
        setLoading(false);
        advanceChat(queue, currentIndex);
        break;
      case 'repeat':
        setStage('reading');
        setLoading(false);
        readCurrentChat(queue, currentIndex);
        break;
      case 'ignore_group':
        if (currentChat?.isGroup) {
          await ignoreGroup(currentChat.jid);
          await speak(`${currentChat.name} will be ignored from now on.`);
        }
        setLoading(false);
        advanceChat(queue, currentIndex);
        break;
      case 'remind_later':
        try {
          const { jid: ownJid } = await getMe();
          const reminderText = `Reminder: Follow up with ${currentChat?.name ?? 'someone'}`;
          await send(ownJid, reminderText);
          await speak('Reminder sent to yourself.');
        } catch {
          await speak('Could not send reminder.');
        }
        setLoading(false);
        advanceChat(queue, currentIndex);
        break;
      default:
        await speak("Didn't catch that. Say Reply, Next, Skip, or Repeat.");
        startCommandTimeout(queue, currentIndex);
        setLoading(false);
    }
  }, [stt, parseIntent, queue, currentIndex, currentChat, speak, advanceChat, readCurrentChat, ignoreGroup, getMe, send, startCommandTimeout]);

  const handleReplyPressIn = useCallback(async () => {
    await stt.startRecording();
  }, [stt]);

  const handleReplyPressOut = useCallback(async () => {
    setLoading(true);
    const transcript = await stt.stopRecording();
    if (!transcript.trim()) { setLoading(false); return; }

    const { refined } = await refineMessage(transcript);
    setReplyMessage(refined);
    await speak(`Reply to ${currentChat?.name}: ${refined}. Say Send, Edit, or Cancel.`);
    setStage('reply_preview');
    setLoading(false);
  }, [stt, refineMessage, speak, currentChat]);

  const handleReplySend = useCallback(async () => {
    if (!currentChat) return;
    setLoading(true);
    try {
      await send(currentChat.jid, replyMessage);
      await speak('Sent!');
      advanceChat(queue, currentIndex);
    } catch {
      await speak('Send failed. Moving on.');
      advanceChat(queue, currentIndex);
    } finally {
      setLoading(false);
    }
  }, [currentChat, replyMessage, send, speak, advanceChat, queue, currentIndex]);

  const handleReplyTone = useCallback(async (tone: string) => {
    setLoading(true);
    const { refined } = await refineMessage(replyMessage, tone);
    setReplyMessage(refined);
    await speak(`${tone} version: ${refined}. Say Send, Edit, or Cancel.`);
    setLoading(false);
  }, [refineMessage, replyMessage, speak]);

  if (stage === 'loading') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2980b9" />
          <Text style={styles.status}>Loading messages…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (stage === 'done') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={{ fontSize: 56 }}>✅</Text>
          <Text style={styles.doneText}>All caught up!</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {currentChat && (
          <View style={styles.chatHeader}>
            <Text style={styles.chatName}>{currentChat.name}</Text>
            <Text style={styles.chatMeta}>
              {currentChat.isGroup ? 'Group' : 'Direct'} · {currentChat.unreadCount} unread
            </Text>
          </View>
        )}

        <View style={styles.statusBox}>
          <Text style={styles.status}>{statusText}</Text>
        </View>

        {(stage === 'awaiting') && (
          <View style={styles.center}>
            <VoiceButton
              onPressIn={handleCommandPressIn}
              onPressOut={handleCommandPressOut}
              isRecording={stt.state === 'recording'}
              isProcessing={stt.state === 'processing' || loading}
            />
            <Text style={styles.hint}>Reply · Next · Skip · Repeat</Text>
          </View>
        )}

        {stage === 'reply_listening' && (
          <View style={styles.center}>
            <VoiceButton
              onPressIn={handleReplyPressIn}
              onPressOut={handleReplyPressOut}
              isRecording={stt.state === 'recording'}
              isProcessing={stt.state === 'processing' || loading}
            />
            <Text style={styles.hint}>Hold to speak your reply</Text>
          </View>
        )}

        {stage === 'reply_preview' && currentChat && (
          <MessagePreview
            to={currentChat.name}
            message={replyMessage}
            onSend={handleReplySend}
            onEdit={() => { setStage('reply_listening'); speak('Speak your edited reply.'); }}
            onCancel={() => advanceChat(queue, currentIndex)}
            onTone={handleReplyTone}
            loading={loading}
          />
        )}

        <View style={styles.progressBar}>
          <Text style={styles.progressText}>{currentIndex + 1} / {queue.length}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0a0a0a' },
  container: { flex: 1, padding: 24, gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 },
  chatHeader: { gap: 4 },
  chatName: { color: '#fff', fontSize: 22, fontWeight: '700' },
  chatMeta: { color: '#666', fontSize: 13 },
  statusBox: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#222',
  },
  status: { color: '#ccc', fontSize: 16, lineHeight: 24, textAlign: 'center' },
  hint: { color: '#555', fontSize: 14, textAlign: 'center' },
  doneText: { color: '#27ae60', fontSize: 26, fontWeight: '700', marginTop: 12 },
  backBtn: { marginTop: 24, backgroundColor: '#1a3a2e', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12 },
  backBtnText: { color: '#27ae60', fontSize: 16, fontWeight: '600' },
  progressBar: { alignItems: 'center', paddingBottom: 8 },
  progressText: { color: '#444', fontSize: 13 },
});
