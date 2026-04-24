import { useState, useEffect, useCallback } from 'react';
import { loadSettings } from '../utils/settings';

async function getBaseUrl(): Promise<string> {
  const settings = await loadSettings();
  return settings.companion_url;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const base = await getBaseUrl();
  if (!base) throw new Error('Companion URL not configured');
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export interface UnreadChat {
  jid: string;
  name: string;
  unreadCount: number;
  isGroup: boolean;
  messages: Array<{ text: string; fromMe: boolean; timestamp: number; sender?: string }>;
  // Set by hear.tsx after reading — used for expand-after-summary
  _fullText?: string;
  _isSummarized?: boolean;
}

export interface DigestResult {
  total: number;
  items: Array<{ name: string; jid: string; count: number; isGroup: boolean }>;
  summary: string;
}

export interface Intent {
  action: string;
  contact: string | null;
  message: string | null;
  tone: string | null;
}

export function useCompanion() {
  const [status, setStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected');

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await apiFetch<{ status: string }>('/status');
        setStatus(data.status as typeof status);
      } catch {
        setStatus('disconnected');
      }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, []);

  const getUnread = useCallback(() => apiFetch<UnreadChat[]>('/unread'), []);

  const send = useCallback((contact: string, message: string) =>
    apiFetch<{ success: boolean }>('/send', {
      method: 'POST',
      body: JSON.stringify({ contact, message }),
    }), []);

  const parseIntent = useCallback((transcript: string, context: 'compose' | 'command' = 'compose') =>
    apiFetch<Intent>('/parse-intent', {
      method: 'POST',
      body: JSON.stringify({ transcript, context }),
    }), []);

  const summarize = useCallback((messages: Array<{ text: string; sender?: string }>) =>
    apiFetch<{ summary: string }>('/summarize', {
      method: 'POST',
      body: JSON.stringify({ messages }),
    }), []);

  const refineMessage = useCallback((message: string, tone?: string) =>
    apiFetch<{ refined: string }>('/refine-message', {
      method: 'POST',
      body: JSON.stringify({ message, tone }),
    }), []);

  const getContacts = useCallback(() =>
    apiFetch<Array<{ id: string; name: string }>>('/contacts'), []);

  const getDigest = useCallback(() => apiFetch<DigestResult>('/digest'), []);

  const ignoreGroup = useCallback((jid: string) =>
    apiFetch<{ success: boolean }>('/ignore-group', {
      method: 'POST',
      body: JSON.stringify({ jid }),
    }), []);

  const getMe = useCallback(() => apiFetch<{ jid: string }>('/me'), []);

  const getDebugLogs = useCallback(() =>
    apiFetch<Array<{ ts: string; level: string; tag: string; msg: string }>>('/debug/logs'), []);

  const getStoreStats = useCallback(() =>
    apiFetch<{ chats: number; messages: number; contacts: number; chatsWithUnread: number }>('/debug/store'), []);

  const clearDebugLogs = useCallback(() =>
    apiFetch<{ ok: boolean }>('/debug/logs', { method: 'DELETE' }), []);

  return { status, getUnread, send, parseIntent, summarize, refineMessage, getContacts, getDigest, ignoreGroup, getMe, getDebugLogs, getStoreStats, clearDebugLogs };
}
