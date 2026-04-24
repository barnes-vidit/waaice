import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  proto,
} from '@whiskeysockets/baileys';
import type { WAMessage, Contact, Chat, ChatUpdate } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { loadJSON } from './storage';
import { log } from './logger';

const AUTH_DIR = path.join(__dirname, '..', 'data', 'auth');
const logger = pino({ level: 'silent' });

// ─── Hand-rolled in-memory store ─────────────────────────────────────────────
const store = {
  chats: new Map<string, Chat>(),
  messages: new Map<string, WAMessage[]>(),
  contacts: new Map<string, Contact>(),
};

const MAX_MESSAGES_PER_CHAT = 100;

function bindStore(sock: ReturnType<typeof makeWASocket>) {
  // ── History sync ────────────────────────────────────────────────────────────
  sock.ev.on('messaging-history.set', ({ chats, contacts, messages }) => {
    log('WA:history', `Got ${chats.length} chats, ${contacts.length} contacts, ${messages.length} messages from history sync`);

    for (const chat of chats) {
      store.chats.set(chat.id, { ...store.chats.get(chat.id), ...chat });
    }
    for (const c of contacts) {
      store.contacts.set(c.id, { ...store.contacts.get(c.id), ...c });
    }
    for (const msg of messages) {
      const jid = msg.key.remoteJid!;
      const existing = store.messages.get(jid) ?? [];
      existing.push(msg);
      if (existing.length > MAX_MESSAGES_PER_CHAT) {
        existing.splice(0, existing.length - MAX_MESSAGES_PER_CHAT);
      }
      store.messages.set(jid, existing);
    }

    // Log unread counts from history (usually 0 — see getUnreadChats comment)
    const withUnread = chats.filter(c => (c.unreadCount ?? 0) > 0);
    log('WA:history', `Chats with unreadCount > 0 in history: ${withUnread.length} — ${withUnread.map(c => `${c.id.split('@')[0]}:${c.unreadCount}`).join(', ')}`);
  });

  // ── Incremental chat updates ────────────────────────────────────────────────
  sock.ev.on('chats.upsert', (chats: Chat[]) => {
    for (const chat of chats) {
      store.chats.set(chat.id, { ...store.chats.get(chat.id), ...chat });
    }
    const unread = chats.filter(c => (c.unreadCount ?? 0) > 0);
    if (unread.length > 0) {
      log('WA:chats.upsert', `${unread.length} chats with unread: ${unread.map(c => `${c.id.split('@')[0]}:${c.unreadCount}`).join(', ')}`);
    }
  });

  sock.ev.on('chats.update', (updates: ChatUpdate[]) => {
    for (const update of updates) {
      if (!update.id) continue;
      // Upsert — create entry from scratch if not in store yet.
      // Previously used `if (existing)` guard which silently dropped ALL updates
      // when messaging-history.set hadn't fired (store empty).
      const existing = store.chats.get(update.id) ?? {} as Chat;
      store.chats.set(update.id, { ...existing, ...update } as Chat);
    }
    const unreadUpdates = updates.filter(u => u.id && (u.unreadCount ?? 0) > 0);
    if (unreadUpdates.length > 0) {
      log('WA:chats.update', `Unread updates: ${unreadUpdates.map(u => `${u.id!.split('@')[0]}:${u.unreadCount}`).join(', ')}`);
    }
  });

  sock.ev.on('chats.delete', (ids: string[]) => {
    for (const id of ids) store.chats.delete(id);
  });

  // ── Messages ────────────────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', ({ messages: msgs, type }) => {
    for (const msg of msgs) {
      const jid = msg.key.remoteJid;
      if (!jid) continue;
      const existing = store.messages.get(jid) ?? [];
      existing.push(msg);
      if (existing.length > MAX_MESSAGES_PER_CHAT) {
        existing.splice(0, existing.length - MAX_MESSAGES_PER_CHAT);
      }
      store.messages.set(jid, existing);
    }
    if (type === 'notify') {
      log('WA:messages', `New message(s) from: ${msgs.map(m => m.key.remoteJid?.split('@')[0]).join(', ')}`);
    }
  });

  // ── Contacts ────────────────────────────────────────────────────────────────
  sock.ev.on('contacts.upsert', (contacts: Contact[]) => {
    for (const c of contacts) {
      store.contacts.set(c.id, { ...store.contacts.get(c.id), ...c });
    }
    log('WA:contacts', `Upserted ${contacts.length} contacts — total: ${store.contacts.size}`);
  });

  sock.ev.on('contacts.update', (updates: Partial<Contact>[]) => {
    for (const u of updates) {
      if (!u.id) continue;
      // Same upsert pattern — don't require prior entry to exist
      const existing = store.contacts.get(u.id) ?? {} as Contact;
      store.contacts.set(u.id, { ...existing, ...u } as Contact);
    }
  });
}
// ─────────────────────────────────────────────────────────────────────────────

let sock: ReturnType<typeof makeWASocket> | null = null;
let connectionStatus: 'connecting' | 'connected' | 'disconnected' = 'disconnected';

export function getConnectionStatus() {
  return connectionStatus;
}

export async function initWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['Waaice', 'Chrome', '1.0'],
    // ─── Critical: without this flag Baileys tells WhatsApp the device is
    // already synced, so WhatsApp sends no chat history at all.
    syncFullHistory: true,
    // Required by Baileys 6.x for message retry and receipt handling.
    getMessage: async (key) => {
      const msgs = store.messages.get(key.remoteJid!);
      const found = msgs?.find((m) => m.key.id === key.id);
      return found?.message ?? undefined;
    },
  });

  bindStore(sock);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n--- Scan this QR code with WhatsApp ---');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      connectionStatus = 'disconnected';
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      log('WA:conn', `Connection closed. Code: ${statusCode}. Reconnecting: ${shouldReconnect}`, 'warn');
      if (shouldReconnect) {
        setTimeout(initWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      connectionStatus = 'connected';
      log('WA:conn', 'WhatsApp connected!');
      // Diagnostic: log store state 10s after connect to confirm history arrived
      setTimeout(() => {
        const stats = getStoreStats();
        log('WA:conn', `Store after 10s — chats:${stats.chats} contacts:${stats.contacts} msgs:${stats.messages} unread:${stats.chatsWithUnread}`);
        if (stats.chats === 0) {
          log('WA:conn', 'WARNING: store is still empty after 10s. messaging-history.set may not have fired. Try re-linking WhatsApp.', 'warn');
        }
      }, 10_000);
    } else if (connection === 'connecting') {
      connectionStatus = 'connecting';
      log('WA:conn', 'Connecting to WhatsApp…');
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

export async function getUnreadChats() {
  if (!sock) throw new Error('WhatsApp not connected');

  const ignoredGroups: string[] = loadJSON('ignored_groups.json', []);
  const allChats = Array.from(store.chats.values());

  log('WA:unread', `Total chats in store: ${allChats.length}. Checking for unread…`);

  // ── IMPORTANT NOTE ON UNREAD COUNTS ──────────────────────────────────────
  // Baileys history sync (messaging-history.set) does NOT reliably carry
  // unreadCount for pre-existing chats. Those come in as 0.
  //
  // Real unread counts arrive via:
  //   1. chats.upsert  — when a new message arrives while connected
  //   2. chats.update  — incremental update to an existing chat
  //
  // If /unread returns empty right after startup, wait for a new message
  // to arrive or ask the sender to re-send. The count will update live.
  // ─────────────────────────────────────────────────────────────────────────

  const results: Array<{
    jid: string;
    name: string;
    unreadCount: number;
    isGroup: boolean;
    messages: Array<{ text: string; fromMe: boolean; timestamp: number }>;
  }> = [];

  for (const chat of allChats) {
    if (!chat.unreadCount || chat.unreadCount < 1) continue;
    const jid = chat.id;

    // Skip WhatsApp status broadcasts and newsletters — not real messages
    if (jid === 'status@broadcast' || jid.startsWith('status') || jid.endsWith('@newsletter')) continue;

    const isGroup = jid.endsWith('@g.us');
    if (isGroup && ignoredGroups.includes(jid)) continue;

    const msgs = store.messages.get(jid) ?? [];
    const count = chat.unreadCount;

    log('WA:unread', `  ${jid.split('@')[0]}: unread=${count}, stored messages=${msgs.length}`);

    const unreadMsgs = msgs
      .filter((m: WAMessage) => !m.key.fromMe)
      .slice(-Math.max(1, count))
      .map((m: WAMessage) => {
        // For group messages, the sender is in key.participant
        const senderJid = m.key.participant ?? null;
        const senderName = senderJid
          ? (store.contacts.get(senderJid)?.name ?? store.contacts.get(senderJid)?.notify ?? senderJid.split('@')[0])
          : undefined;
        return {
          text: extractText(m),
          fromMe: m.key.fromMe ?? false,
          timestamp: (m.messageTimestamp as number) * 1000,
          sender: senderName,
        };
      });

    results.push({
      jid,
      name: chat.name ?? jid,
      unreadCount: count,
      isGroup,
      messages: unreadMsgs,
    });
  }

  log('WA:unread', `Returning ${results.length} unread chat(s)`);
  results.sort((a, b) => {
    if (a.isGroup === b.isGroup) return b.unreadCount - a.unreadCount;
    return a.isGroup ? 1 : -1;
  });

  return results;
}

function extractText(msg: WAMessage): string {
  const m = msg.message;
  if (!m) return 'sent something';
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.imageMessage) return 'sent a photo';
  if (m.videoMessage) return 'sent a video';
  if (m.audioMessage?.ptt) return 'sent a voice note';
  if (m.audioMessage) return 'sent an audio file';
  if (m.documentMessage) return 'sent a document';
  if (m.stickerMessage) return 'sent a sticker';
  if (m.locationMessage) return 'shared a location';
  if (m.contactMessage) return 'shared a contact';
  return 'sent something';
}

export async function sendMessage(jid: string, text: string) {
  if (!sock) throw new Error('WhatsApp not connected');
  log('WA:send', `Sending to ${jid.split('@')[0]}: "${text.substring(0, 50)}"`);
  await sock.sendMessage(jid, { text });
}

export async function getContacts(): Promise<Array<{ id: string; name: string }>> {
  if (!sock) throw new Error('WhatsApp not connected');
  const contacts = Array.from(store.contacts.values()).map((c) => ({
    id: c.id,
    name: c.name ?? c.notify ?? c.id,
  }));
  log('WA:contacts', `getContacts() returning ${contacts.length} contacts`);
  return contacts;
}

export function getOwnJid(): string | null {
  return sock?.user?.id ?? null;
}

export function getStoreStats() {
  return {
    chats: store.chats.size,
    messages: store.messages.size,
    contacts: store.contacts.size,
    chatsWithUnread: Array.from(store.chats.values()).filter(c => (c.unreadCount ?? 0) > 0).length,
  };
}
