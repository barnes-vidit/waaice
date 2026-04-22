import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  proto,
} from '@whiskeysockets/baileys';
// These are type-only exports in Baileys 6.x — not runtime values
import type { WAMessage, Contact, Chat, ChatUpdate } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import path from 'path';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { loadJSON } from './storage';

const AUTH_DIR = path.join(__dirname, '..', 'data', 'auth');
const logger = pino({ level: 'silent' });

// ─── Hand-rolled in-memory store ─────────────────────────────────────────────
// makeInMemoryStore was removed in Baileys 6.x. We subscribe to the live
// event stream and maintain our own Maps.
const store = {
  chats: new Map<string, Chat>(),
  messages: new Map<string, WAMessage[]>(),
  contacts: new Map<string, Contact>(),
};

const MAX_MESSAGES_PER_CHAT = 100;

function bindStore(sock: ReturnType<typeof makeWASocket>) {
  // ── History sync (initial load when the session first comes online) ─────────
  // In Baileys 6.x the event is 'messaging-history.set', NOT 'chats.set'
  sock.ev.on('messaging-history.set', ({ chats, contacts, messages }) => {
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
  });

  // ── Incremental chat updates ─────────────────────────────────────────────────
  sock.ev.on('chats.upsert', (chats: Chat[]) => {
    for (const chat of chats) {
      store.chats.set(chat.id, { ...store.chats.get(chat.id), ...chat });
    }
  });

  // ChatUpdate is Partial<Chat & { conditional }> — id may be undefined in type,
  // but in practice Baileys always sends it; guard with a check.
  sock.ev.on('chats.update', (updates: ChatUpdate[]) => {
    for (const update of updates) {
      if (!update.id) continue;
      const existing = store.chats.get(update.id);
      if (existing) {
        store.chats.set(update.id, { ...existing, ...update } as Chat);
      }
    }
  });

  sock.ev.on('chats.delete', (ids: string[]) => {
    for (const id of ids) store.chats.delete(id);
  });

  // ── Messages ─────────────────────────────────────────────────────────────────
  // messages.upsert fires for both history and live messages.
  // We only want to grow the store for live notifications ('notify') to avoid
  // re-processing the full history on reconnects.
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
  });

  // ── Contacts ─────────────────────────────────────────────────────────────────
  sock.ev.on('contacts.upsert', (contacts: Contact[]) => {
    for (const c of contacts) {
      store.contacts.set(c.id, { ...store.contacts.get(c.id), ...c });
    }
  });

  // contacts.update fires Partial<Contact>[] — safe to spread
  sock.ev.on('contacts.update', (updates: Partial<Contact>[]) => {
    for (const u of updates) {
      if (!u.id) continue;
      const existing = store.contacts.get(u.id);
      if (existing) {
        store.contacts.set(u.id, { ...existing, ...u });
      }
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
      console.log('Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) {
        setTimeout(initWhatsApp, 3000);
      }
    } else if (connection === 'open') {
      connectionStatus = 'connected';
      console.log('WhatsApp connected!');
    } else if (connection === 'connecting') {
      connectionStatus = 'connecting';
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

export async function getUnreadChats() {
  if (!sock) throw new Error('WhatsApp not connected');

  const ignoredGroups: string[] = loadJSON('ignored_groups.json', []);
  const chats = Array.from(store.chats.values());

  const results: Array<{
    jid: string;
    name: string;
    unreadCount: number;
    isGroup: boolean;
    messages: Array<{ text: string; fromMe: boolean; timestamp: number }>;
  }> = [];

  for (const chat of chats) {
    // unreadCount < 1 covers zero, falsy, and Baileys' negative values on muted chats
    if (!chat.unreadCount || chat.unreadCount < 1) continue;
    const jid = chat.id;
    const isGroup = jid.endsWith('@g.us');
    if (isGroup && ignoredGroups.includes(jid)) continue;

    const msgs = store.messages.get(jid) ?? [];
    const count = chat.unreadCount;
    const unreadMsgs = msgs
      .filter((m: WAMessage) => !m.key.fromMe)
      .slice(-Math.max(1, count))
      .map((m: WAMessage) => ({
        text: extractText(m),
        fromMe: m.key.fromMe ?? false,
        timestamp: (m.messageTimestamp as number) * 1000,
      }));

    results.push({
      jid,
      name: chat.name ?? jid,
      unreadCount: chat.unreadCount,
      isGroup,
      messages: unreadMsgs,
    });
  }

  // Direct messages first, then groups — each group sorted by unread count descending
  results.sort((a, b) => {
    if (a.isGroup === b.isGroup) return b.unreadCount - a.unreadCount;
    return a.isGroup ? 1 : -1;
  });

  return results;
}

function extractText(msg: WAMessage): string {
  return (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    '[media]'
  );
}

export async function sendMessage(jid: string, text: string) {
  if (!sock) throw new Error('WhatsApp not connected');
  await sock.sendMessage(jid, { text });
}

export async function getContacts(): Promise<Array<{ id: string; name: string }>> {
  if (!sock) throw new Error('WhatsApp not connected');
  return Array.from(store.contacts.values()).map((c) => ({
    id: c.id,
    name: c.name ?? c.notify ?? c.id,
  }));
}

export function getOwnJid(): string | null {
  return sock?.user?.id ?? null;
}
