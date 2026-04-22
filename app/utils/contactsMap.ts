import AsyncStorage from '@react-native-async-storage/async-storage';
import Fuse from 'fuse.js';
import { loadSettings } from './settings';

const CONTACTS_KEY = 'waaice_contacts';
const SEND_COUNTS_KEY = 'waaice_send_counts';

export type ContactMap = Record<string, string>; // nickname -> JID
export type SendCounts = Record<string, number>;  // JID -> send count

export async function loadContactMap(): Promise<ContactMap> {
  try {
    const raw = await AsyncStorage.getItem(CONTACTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function saveContactMap(map: ContactMap): Promise<void> {
  await AsyncStorage.setItem(CONTACTS_KEY, JSON.stringify(map));
}

export async function addContact(nickname: string, jid: string): Promise<void> {
  const map = await loadContactMap();
  map[nickname.toLowerCase()] = jid;
  await saveContactMap(map);
}

async function getSendCounts(): Promise<SendCounts> {
  try {
    const raw = await AsyncStorage.getItem(SEND_COUNTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export async function resolveContact(
  name: string,
  baileysContacts: Array<{ id: string; name: string }>
): Promise<{ jid: string; silent?: boolean } | { matches: Array<{ id: string; name: string }> } | null> {
  const map = await loadContactMap();
  const key = name.toLowerCase();

  // Exact match in saved map
  if (map[key]) return { jid: map[key] };

  // BUG-12: includeScore so we can apply a high-confidence gate before auto-saving
  const fuse = new Fuse(baileysContacts, { keys: ['name'], threshold: 0.4, includeScore: true });
  const results = fuse.search(name);

  if (results.length === 0) return null;

  // Single fuzzy match — only auto-save when the match is high-confidence (score ≤ 0.2).
  // A loose match (score > 0.2) is returned as a candidate list so the user can confirm.
  if (results.length === 1) {
    const score = results[0].score ?? 1;
    if (score <= 0.2) {
      await addContact(name, results[0].item.id);
      return { jid: results[0].item.id };
    }
    // Treat as ambiguous — let user confirm
    return { matches: [results[0].item] };
  }

  // Multiple matches: check if any candidate has been messaged enough times
  // to auto-resolve without asking (auto_resolve_threshold)
  const settings = await loadSettings();
  const threshold = settings.auto_resolve_threshold ?? 10;
  const counts = await getSendCounts();

  const topCandidates = results.slice(0, 4).map((r) => r.item);
  for (const candidate of topCandidates) {
    if ((counts[candidate.id] ?? 0) >= threshold) {
      // This contact has been messaged enough — auto-resolve silently
      await addContact(name, candidate.id);
      return { jid: candidate.id, silent: true };
    }
  }

  return { matches: topCandidates };
}

export async function incrementSendCount(jid: string): Promise<number> {
  try {
    const counts = await getSendCounts();
    counts[jid] = (counts[jid] ?? 0) + 1;
    await AsyncStorage.setItem(SEND_COUNTS_KEY, JSON.stringify(counts));
    return counts[jid];
  } catch {
    return 0;
  }
}
